import { describe, it, expect, beforeEach } from 'vitest';

import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import eventRepository from '@src/repositories/event.repository';
import type { IEventItem } from '@src/repositories/event.repository';
import type { IEvent } from '@src/types/event.types';

const ddb = mockClient(DynamoDBDocumentClient);
const PREFIX = process.env.TABLE_PREFIX;
const EVENTS_TABLE = `${PREFIX}Events`;
const EVENT_GROUPS_TABLE = `${PREFIX}EventGroups`;
const EVENT_AGENTS_TABLE = `${PREFIX}EventAgents`;

const TRAINER = 'trainer-1';
const OTHER_TRAINER = 'trainer-2';

const eventItem = (
  id: string,
  createdBy: string,
  startDate: string,
): IEventItem => ({
  id,
  event_title: `Event ${id}`,
  start_date: startDate,
  status: 'upcoming',
  type: 'training',
  created_by: createdBy,
  created_by_role: 'trainer',
  visibility: 'private',
  group_ids: [],
  agent_ids: [],
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
});

interface IStore {
  events: IEventItem[];
  agentLinks?: { user_id: string; event_id: string }[];
  groupLinks?: { group_id: string; event_id: string }[];
}

function seed({ events, agentLinks = [], groupLinks = [] }: IStore) {
  ddb
    .on(QueryCommand, { TableName: EVENTS_TABLE, IndexName: 'byCreator' })
    .callsFake((input) => ({
      Items: events.filter(
        (item) => item.created_by === input.ExpressionAttributeValues[':user'],
      ),
    }));
  ddb
    .on(QueryCommand, { TableName: EVENT_AGENTS_TABLE, IndexName: 'byUser' })
    .callsFake((input) => ({
      Items: agentLinks.filter(
        (link) => link.user_id === input.ExpressionAttributeValues[':user'],
      ),
    }));
  ddb
    .on(QueryCommand, { TableName: EVENT_GROUPS_TABLE, IndexName: 'byGroup' })
    .callsFake((input) => ({
      Items: groupLinks.filter(
        (link) => link.group_id === input.ExpressionAttributeValues[':group'],
      ),
    }));
  ddb.on(BatchGetCommand).callsFake((input) => ({
    Responses: {
      [EVENTS_TABLE]: (input.RequestItems[EVENTS_TABLE].Keys as { id: string }[])
        .map((key) => events.find((item) => item.id === key.id))
        .filter(Boolean),
    },
  }));
}

const batchKeys = () =>
  ddb
    .commandCalls(BatchGetCommand)
    .flatMap(
      (call) =>
        call.args[0].input.RequestItems?.[EVENTS_TABLE].Keys as {
          id: string;
        }[],
    )
    .map((key) => key.id);

const putsTo = (table: string) =>
  ddb
    .commandCalls(PutCommand)
    .map((call) => call.args[0].input)
    .filter((input) => input.TableName === table)
    .map((input) => input.Item);

beforeEach(() => {
  ddb.reset();
});

describe('EventRepository.findVisible', () => {
  it('includes an event the trainer created that targets none of their groups, and not another trainer’s', async () => {
    seed({
      events: [
        eventItem('own-untargeted', TRAINER, '2026-12-01T00:00:00.000Z'),
        eventItem('other-trainers', OTHER_TRAINER, '2026-12-02T00:00:00.000Z'),
      ],
    });

    const visible = await eventRepository.findVisible(TRAINER, ['group-1']);

    expect(visible.map((event) => event.id)).toEqual(['own-untargeted']);
    expect(batchKeys()).toEqual([]);
  });

  it('adds events linked through EventAgents.byUser and EventGroups.byGroup without duplicates', async () => {
    seed({
      events: [
        eventItem('own', TRAINER, '2026-12-01T00:00:00.000Z'),
        eventItem('via-agent', OTHER_TRAINER, '2026-12-05T00:00:00.000Z'),
        eventItem('via-groups', OTHER_TRAINER, '2026-12-03T00:00:00.000Z'),
        eventItem('unrelated', OTHER_TRAINER, '2026-12-09T00:00:00.000Z'),
      ],
      agentLinks: [
        { user_id: TRAINER, event_id: 'via-agent' },
        { user_id: TRAINER, event_id: 'own' },
        { user_id: 'someone-else', event_id: 'unrelated' },
      ],
      groupLinks: [
        { group_id: 'group-1', event_id: 'via-groups' },
        { group_id: 'group-2', event_id: 'via-groups' },
        { group_id: 'group-1', event_id: 'via-agent' },
        { group_id: 'group-9', event_id: 'unrelated' },
      ],
    });

    const visible = await eventRepository.findVisible(TRAINER, [
      'group-1',
      'group-2',
      'group-1',
    ]);

    expect(visible.map((event) => event.id)).toEqual([
      'via-agent',
      'via-groups',
      'own',
    ]);
    expect(batchKeys().sort()).toEqual(['via-agent', 'via-groups']);
  });

  it('sorts by start_date descending', async () => {
    seed({
      events: [
        eventItem('oldest', TRAINER, '2026-10-01T00:00:00.000Z'),
        eventItem('newest', TRAINER, '2026-12-31T00:00:00.000Z'),
        eventItem('middle', TRAINER, '2026-11-15T00:00:00.000Z'),
      ],
    });

    const visible = await eventRepository.findVisible(TRAINER, []);

    expect(visible.map((event) => event.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });
});

describe('EventRepository.insertEvent', () => {
  it('stores an offset start_date and end_date as UTC with a Z', async () => {
    ddb.on(PutCommand).resolves({});

    const created = await eventRepository.insertEvent({
      event_title: 'Offset event',
      start_date: '2026-12-10T09:00:00+08:00',
      end_date: '2026-12-10T11:30:00+08:00',
      type: 'training',
      created_by: TRAINER,
      created_by_role: 'trainer',
      group_ids: [],
      agent_ids: [],
    });

    const [stored] = putsTo(EVENTS_TABLE);
    expect(stored).toMatchObject({
      start_date: '2026-12-10T01:00:00.000Z',
      end_date: '2026-12-10T03:30:00.000Z',
    });
    expect(created.start_date).toBe('2026-12-10T01:00:00.000Z');
    expect(created.end_date).toBe('2026-12-10T03:30:00.000Z');
  });

  it('writes link items for the targets carrying the UTC start_date', async () => {
    ddb.on(PutCommand).resolves({});

    const created = await eventRepository.insertEvent({
      event_title: 'Targeted event',
      start_date: '2026-12-10T09:00:00+08:00',
      type: 'training',
      created_by: TRAINER,
      created_by_role: 'trainer',
      group_ids: ['group-1', 'group-1'],
      agent_ids: ['agent-1'],
    });

    expect(putsTo(EVENT_GROUPS_TABLE)).toEqual([
      {
        event_id: created.id,
        group_id: 'group-1',
        status: 'upcoming',
        start_date: '2026-12-10T01:00:00.000Z',
      },
    ]);
    expect(putsTo(EVENT_AGENTS_TABLE)).toEqual([
      {
        event_id: created.id,
        user_id: 'agent-1',
        status: 'upcoming',
        start_date: '2026-12-10T01:00:00.000Z',
      },
    ]);
  });
});

describe('EventRepository.updateEvent', () => {
  const previous: IEvent = {
    id: 'event-1',
    event_title: 'Event',
    start_date: '2026-12-01T00:00:00.000Z',
    end_date: '2026-12-01T02:00:00.000Z',
    description: null,
    meeting_link: null,
    venue: null,
    status: 'upcoming',
    type: 'training',
    created_by: TRAINER,
    created_by_role: 'trainer',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    visibility: 'private',
    groupIds: ['group-1'],
    agentIds: ['agent-1'],
  };

  function echoUpdate() {
    ddb.on(UpdateCommand).callsFake((input) => ({
      Attributes: {
        id: previous.id,
        event_title: previous.event_title,
        start_date:
          input.ExpressionAttributeValues[':start_date'] ?? previous.start_date,
        end_date:
          input.ExpressionAttributeValues[':end_date'] ?? previous.end_date,
        status: previous.status,
        type: previous.type,
        visibility: previous.visibility,
        group_ids: previous.groupIds,
        agent_ids: previous.agentIds,
        created_at: previous.created_at,
        updated_at: previous.updated_at,
      },
    }));
    ddb.on(PutCommand).resolves({});
  }

  const updateValues = () =>
    ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues;

  it('stores an offset start_date and end_date as UTC', async () => {
    echoUpdate();

    const updated = await eventRepository.updateEvent(previous, {
      start_date: '2026-12-10T09:00:00+08:00',
      end_date: '2026-12-10T11:30:00+08:00',
    });

    expect(updateValues()).toMatchObject({
      ':start_date': '2026-12-10T01:00:00.000Z',
      ':end_date': '2026-12-10T03:30:00.000Z',
    });
    expect(updated.start_date).toBe('2026-12-10T01:00:00.000Z');
    expect(updated.end_date).toBe('2026-12-10T03:30:00.000Z');
  });

  it('rewrites the link items with the new UTC start_date when start_date changes', async () => {
    echoUpdate();

    await eventRepository.updateEvent(previous, {
      start_date: '2026-12-10T09:00:00+08:00',
    });

    expect(putsTo(EVENT_GROUPS_TABLE)).toEqual([
      {
        event_id: previous.id,
        group_id: 'group-1',
        status: 'upcoming',
        start_date: '2026-12-10T01:00:00.000Z',
      },
    ]);
    expect(putsTo(EVENT_AGENTS_TABLE)).toEqual([
      {
        event_id: previous.id,
        user_id: 'agent-1',
        status: 'upcoming',
        start_date: '2026-12-10T01:00:00.000Z',
      },
    ]);
  });

  it('leaves the link items alone when only end_date changes', async () => {
    echoUpdate();

    await eventRepository.updateEvent(previous, {
      end_date: '2026-12-01T12:00:00+08:00',
    });

    expect(updateValues()).toMatchObject({
      ':end_date': '2026-12-01T04:00:00.000Z',
    });
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });
});
