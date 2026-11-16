import { describe, it, expect, beforeEach } from 'vitest';

import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import coachingSessionRepository from '@src/repositories/coachingSession.repository';
import type { ISessionItem } from '@src/repositories/coachingSession.repository';
import type { ICoachingSessionAttendance } from '@src/types/coachingSession.types';

const ddb = mockClient(DynamoDBDocumentClient);
const PREFIX = process.env.TABLE_PREFIX;
const SESSIONS_TABLE = `${PREFIX}CoachingSessions`;
const SESSION_GROUPS_TABLE = `${PREFIX}CoachingSessionGroups`;
const SESSION_AGENTS_TABLE = `${PREFIX}CoachingSessionAgents`;
const ATTENDANCE_TABLE = `${PREFIX}CoachingAttendance`;

const sessionItem = (
  id: string,
  startDate: string,
  counts?: { attendance_total: number; attendance_joined: number },
): Partial<ISessionItem> => ({
  id,
  coaching_type: 'product',
  title: `Session ${id}`,
  start_date: startDate,
  end_date: startDate,
  training_mode: 'online',
  status: 'upcoming',
  created_by: 'trainer-1',
  group_ids: [],
  agent_ids: [],
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  ...counts,
});

const queriedTables = () =>
  ddb
    .commandCalls(QueryCommand)
    .map((call) => call.args[0].input.TableName);

const putsTo = (table: string) =>
  ddb
    .commandCalls(PutCommand)
    .map((call) => call.args[0].input)
    .filter((input) => input.TableName === table)
    .map((input) => input.Item);

beforeEach(() => {
  ddb.reset();
});

describe('CoachingSessionRepository list items', () => {
  it('findAll carries attendance_total and attendance_joined from the item, defaulting to 0, with no attendance rows', async () => {
    ddb
      .on(QueryCommand, { TableName: SESSIONS_TABLE, IndexName: 'byStatus' })
      .callsFake((input) =>
        input.ExpressionAttributeValues[':status'] === 'upcoming'
          ? {
              Items: [
                sessionItem('counted', '2026-12-02T00:00:00.000Z', {
                  attendance_total: 5,
                  attendance_joined: 3,
                }),
                sessionItem('legacy', '2026-12-01T00:00:00.000Z'),
              ],
            }
          : { Items: [] },
      );

    const sessions = await coachingSessionRepository.findAll();

    expect(sessions.map((session) => session.id)).toEqual([
      'counted',
      'legacy',
    ]);
    expect(sessions[0]).toMatchObject({
      attendance_total: 5,
      attendance_joined: 3,
    });
    expect(sessions[1]).toMatchObject({
      attendance_total: 0,
      attendance_joined: 0,
    });
    for (const session of sessions) {
      expect(session).not.toHaveProperty('attendance');
    }
    expect(new Set(queriedTables())).toEqual(new Set([SESSIONS_TABLE]));
  });

  it('findVisible carries the counts on created and linked sessions without reading attendance rows', async () => {
    ddb.on(QueryCommand).callsFake((input) => {
      if (input.IndexName === 'byCreator') {
        return {
          Items: [
            sessionItem('created', '2026-12-03T00:00:00.000Z', {
              attendance_total: 2,
              attendance_joined: 1,
            }),
          ],
        };
      }
      if (input.IndexName === 'byUser') {
        return { Items: [{ session_id: 'linked', user_id: 'trainer-1' }] };
      }
      return { Items: [] };
    });
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        [SESSIONS_TABLE]: [sessionItem('linked', '2026-12-01T00:00:00.000Z')],
      },
    });

    const sessions = await coachingSessionRepository.findVisible('trainer-1', [
      'group-1',
    ]);

    expect(sessions.map((session) => session.id)).toEqual(['created', 'linked']);
    expect(sessions[0]).toMatchObject({
      attendance_total: 2,
      attendance_joined: 1,
    });
    expect(sessions[1]).toMatchObject({
      attendance_total: 0,
      attendance_joined: 0,
    });
    for (const session of sessions) {
      expect(session).not.toHaveProperty('attendance');
    }
    expect(queriedTables()).not.toContain(ATTENDANCE_TABLE);
  });
});

describe('CoachingSessionRepository.insertSession', () => {
  it('stores an offset start_date and end_date as UTC with a Z', async () => {
    ddb.on(PutCommand).resolves({});

    const created = await coachingSessionRepository.insertSession({
      coaching_type: 'product',
      title: 'Offset session',
      start_date: '2026-12-10T09:00:00+08:00',
      end_date: '2026-12-10T11:30:00+08:00',
      training_mode: 'online',
      created_by: 'trainer-1',
      group_ids: ['group-1'],
      agent_ids: ['agent-1'],
    });

    const [stored] = putsTo(SESSIONS_TABLE);
    expect(stored).toMatchObject({
      start_date: '2026-12-10T01:00:00.000Z',
      end_date: '2026-12-10T03:30:00.000Z',
      attendance_total: 0,
      attendance_joined: 0,
    });
    expect(created.start_date).toBe('2026-12-10T01:00:00.000Z');
    expect(created.end_date).toBe('2026-12-10T03:30:00.000Z');
    expect(putsTo(SESSION_GROUPS_TABLE)).toEqual([
      {
        session_id: created.id,
        group_id: 'group-1',
        start_date: '2026-12-10T01:00:00.000Z',
      },
    ]);
    expect(putsTo(SESSION_AGENTS_TABLE)).toEqual([
      {
        session_id: created.id,
        user_id: 'agent-1',
        start_date: '2026-12-10T01:00:00.000Z',
      },
    ]);
  });
});

describe('CoachingSessionRepository.join', () => {
  const record = {
    agent_id: 'agent-1',
    agent_name: 'Agent One',
    agent_email: 'agent1@example.com',
    group_id: 'group-1',
    group_name: 'Group One',
  };

  const pending: ICoachingSessionAttendance = {
    id: 'attendance-1',
    session_id: 'session-1',
    agent_id: 'agent-1',
    agent_name: 'Agent One',
    agent_email: 'agent1@example.com',
    group_id: 'group-1',
    group_name: 'Group One',
    status: 'pending',
    joined_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };

  const transactions = () =>
    ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);

  it('moves a pending row to joined and adds one to attendance_joined in a single transaction', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    const joined = await coachingSessionRepository.join(
      'session-1',
      record,
      pending,
    );

    expect(transactions()).toHaveLength(1);
    const [rowUpdate, sessionUpdate] = transactions()[0].TransactItems ?? [];
    expect(rowUpdate.Update).toMatchObject({
      TableName: ATTENDANCE_TABLE,
      Key: { session_id: 'session-1', agent_key: 'agent-1' },
      ConditionExpression: expect.stringContaining(':joined'),
      ExpressionAttributeValues: {
        ':joined': 'joined',
        ':now': joined.joined_at,
      },
    });
    expect(rowUpdate.Update?.UpdateExpression).toContain('= :joined');
    expect(sessionUpdate.Update).toEqual({
      TableName: SESSIONS_TABLE,
      Key: { id: 'session-1' },
      UpdateExpression: 'ADD #attendance_joined :one',
      ExpressionAttributeNames: { '#attendance_joined': 'attendance_joined' },
      ExpressionAttributeValues: { ':one': 1 },
    });
    expect(joined).toMatchObject({ id: 'attendance-1', status: 'joined' });
  });

  it('writes the joined row and adds one to attendance_total and attendance_joined when no row exists', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    const joined = await coachingSessionRepository.join(
      'session-1',
      record,
      null,
    );

    expect(transactions()).toHaveLength(1);
    const [rowPut, sessionUpdate] = transactions()[0].TransactItems ?? [];
    expect(rowPut.Put).toMatchObject({
      TableName: ATTENDANCE_TABLE,
      ConditionExpression: expect.stringContaining('attribute_not_exists'),
      Item: {
        id: joined.id,
        session_id: 'session-1',
        agent_key: 'agent-1',
        agent_id: 'agent-1',
        agent_name: 'Agent One',
        agent_email: 'agent1@example.com',
        group_id: 'group-1',
        group_name: 'Group One',
        status: 'joined',
        joined_at: joined.joined_at,
      },
    });
    expect(sessionUpdate.Update).toEqual({
      TableName: SESSIONS_TABLE,
      Key: { id: 'session-1' },
      UpdateExpression: 'ADD #attendance_total :one, #attendance_joined :one',
      ExpressionAttributeNames: {
        '#attendance_total': 'attendance_total',
        '#attendance_joined': 'attendance_joined',
      },
      ExpressionAttributeValues: { ':one': 1 },
    });
    expect(joined.status).toBe('joined');
  });
});
