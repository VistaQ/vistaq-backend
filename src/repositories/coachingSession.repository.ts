import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import { CoachingSessionNotFoundError } from '@src/models/errors/coachingSession.errors';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import dynamoService, { DynamoTable } from '@src/services/dynamo.service';
import type {
  ICoachingSession,
  ICoachingSessionAttendance,
} from '@src/types/coachingSession.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc, toUtc } from '@src/utils/period';

/******************************************************************************
                            Item and input types
******************************************************************************/

export interface ISessionItem {
  id: string;
  coaching_type: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  training_mode: string;
  link?: string;
  status: string;
  created_by?: string;
  created_by_name?: string;
  created_by_role?: string;
  group_ids: string[];
  agent_ids: string[];
  audience_all?: 1;
  attendance_total: number;
  attendance_joined: number;
  created_at: string;
  updated_at: string;
}

export interface ISessionGroupItem {
  session_id: string;
  group_id: string;
  start_date: string;
}

export interface ISessionAgentItem {
  session_id: string;
  user_id: string;
  start_date: string;
}

export interface IAttendanceItem {
  id: string;
  session_id: string;
  agent_key: string;
  agent_id?: string;
  agent_name: string;
  agent_email: string;
  group_id?: string;
  group_name?: string;
  status: string;
  joined_at?: string;
  created_at: string;
  updated_at: string;
}

export interface INewSession {
  coaching_type: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  training_mode: string;
  link?: string | null;
  status?: string;
  created_by: string;
  created_by_name?: string | null;
  created_by_role?: string | null;
  group_ids: string[];
  agent_ids: string[];
}

export interface ISessionUpdate {
  coaching_type?: string;
  title?: string;
  description?: string | null;
  start_date?: string;
  end_date?: string;
  training_mode?: string;
  link?: string | null;
  status?: string;
  group_ids?: string[];
  agent_ids?: string[];
}

export interface INewAttendance {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  group_id: string | null;
  group_name: string | null;
}

const sessions = new DynamoTable<ISessionItem>('CoachingSessions');
const sessionGroups = new DynamoTable<ISessionGroupItem>(
  'CoachingSessionGroups',
);
const sessionAgents = new DynamoTable<ISessionAgentItem>(
  'CoachingSessionAgents',
);
const attendance = new DynamoTable<IAttendanceItem>('CoachingAttendance');

const SESSION_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];

const unique = (ids: string[]): string[] => Array.from(new Set(ids));

function toSession(item: ISessionItem): ICoachingSession {
  return {
    id: item.id,
    tenant_id: TRANSITIONAL_TENANT_ID,
    coaching_type: item.coaching_type,
    title: item.title,
    description: item.description ?? null,
    start_date: item.start_date,
    end_date: item.end_date,
    training_mode: item.training_mode,
    link: item.link ?? null,
    status: item.status,
    created_by: item.created_by ?? null,
    created_by_name: item.created_by_name ?? null,
    created_by_role: item.created_by_role ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    targetGroupIds: item.group_ids ?? [],
    targetAgentIds: item.agent_ids ?? [],
    attendance_total: item.attendance_total ?? 0,
    attendance_joined: item.attendance_joined ?? 0,
  };
}

function toAttendance(item: IAttendanceItem): ICoachingSessionAttendance {
  return {
    id: item.id,
    session_id: item.session_id,
    agent_id: item.agent_id ?? null,
    agent_name: item.agent_name,
    agent_email: item.agent_email,
    group_id: item.group_id ?? null,
    group_name: item.group_name ?? null,
    status: item.status,
    joined_at: item.joined_at ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function byStartDesc(a: ICoachingSession, b: ICoachingSession): number {
  return b.start_date.localeCompare(a.start_date);
}

/******************************************************************************
                        CoachingSessionRepository
******************************************************************************/

class CoachingSessionRepository {
  // The link items copy start_date for their index sort key, so they are
  // rewritten when it changes, not only when the target sets change.
  private async writeLinks(
    session: ISessionItem,
    previous?: { group_ids: string[]; agent_ids: string[] },
  ): Promise<void> {
    try {
      const removed = (ids: string[], next: string[]) =>
        ids.filter((id) => !next.includes(id));
      await Promise.all([
        ...removed(previous?.group_ids ?? [], session.group_ids).map(
          (groupId) =>
            sessionGroups.delete({ session_id: session.id, group_id: groupId }),
        ),
        ...removed(previous?.agent_ids ?? [], session.agent_ids).map((userId) =>
          sessionAgents.delete({ session_id: session.id, user_id: userId }),
        ),
        ...session.group_ids.map((groupId) =>
          sessionGroups.put({
            session_id: session.id,
            group_id: groupId,
            start_date: session.start_date,
          }),
        ),
        ...session.agent_ids.map((userId) =>
          sessionAgents.put({
            session_id: session.id,
            user_id: userId,
            start_date: session.start_date,
          }),
        ),
      ]);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.writeLinks',
        error,
      );
    }
  }

  private async addCounts(
    sessionId: string,
    total: number,
    joined = 0,
  ): Promise<void> {
    try {
      if (total === 0 && joined === 0) return;
      await sessions.update(
        { id: sessionId },
        'ADD attendance_total :total, attendance_joined :joined',
        { values: { ':total': total, ':joined': joined } },
      );
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.addCounts',
        error,
      );
    }
  }

  async insertSession(session: INewSession): Promise<ICoachingSession> {
    try {
      const now = nowUtc();
      const groupIds = unique(session.group_ids);
      const agentIds = unique(session.agent_ids);
      const item: ISessionItem = {
        id: randomUUID(),
        coaching_type: session.coaching_type,
        title: session.title,
        ...(session.description && { description: session.description }),
        start_date: toUtc(session.start_date),
        end_date: toUtc(session.end_date),
        training_mode: session.training_mode,
        ...(session.link && { link: session.link }),
        status: session.status ?? 'upcoming',
        created_by: session.created_by,
        ...(session.created_by_name && {
          created_by_name: session.created_by_name,
        }),
        ...(session.created_by_role && {
          created_by_role: session.created_by_role,
        }),
        group_ids: groupIds,
        agent_ids: agentIds,
        ...(groupIds.length === 0 &&
          agentIds.length === 0 && { audience_all: 1 }),
        attendance_total: 0,
        attendance_joined: 0,
        created_at: now,
        updated_at: now,
      };
      await sessions.put(item, { condition: 'attribute_not_exists(id)' });
      await this.writeLinks(item);
      return toSession(item);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.insertSession',
        error,
      );
    }
  }

  async findById(
    sessionId: string,
    options?: { consistent?: boolean },
  ): Promise<ICoachingSession | null> {
    try {
      const item = await sessions.get({ id: sessionId }, options);
      return item ? toSession(item) : null;
    } catch (error) {
      return handleRepositoryError('CoachingSessionRepository.findById', error);
    }
  }

  async findAll(): Promise<ICoachingSession[]> {
    try {
      const pages = await Promise.all(
        SESSION_STATUSES.map((status) =>
          sessions.queryAll({
            index: 'byStatus',
            keyCondition: 'status = :status',
            values: { ':status': status },
            descending: true,
          }),
        ),
      );
      return pages.flat().map(toSession).sort(byStartDesc);
    } catch (error) {
      return handleRepositoryError('CoachingSessionRepository.findAll', error);
    }
  }

  async findVisible(
    userId: string,
    groupIds: string[],
  ): Promise<ICoachingSession[]> {
    try {
      const [created, allAudience, agentLinks, ...groupLinks] =
        await Promise.all([
          sessions.queryAll({
            index: 'byCreator',
            keyCondition: 'created_by = :user',
            values: { ':user': userId },
          }),
          sessions.queryAll({
            index: 'allAudience',
            keyCondition: 'audience_all = :all',
            values: { ':all': 1 },
          }),
          sessionAgents.queryAll({
            index: 'byUser',
            keyCondition: 'user_id = :user',
            values: { ':user': userId },
          }),
          ...unique(groupIds).map((groupId) =>
            sessionGroups.queryAll({
              index: 'byGroup',
              keyCondition: 'group_id = :group',
              values: { ':group': groupId },
            }),
          ),
        ]);

      const loaded = new Map(
        [...created, ...allAudience].map((item) => [item.id, item]),
      );
      const linkedIds = unique(
        [...agentLinks, ...groupLinks.flat()].map((link) => link.session_id),
      ).filter((id) => !loaded.has(id));
      const linked = await sessions.batchGet(linkedIds.map((id) => ({ id })));

      return [...loaded.values(), ...linked].map(toSession).sort(byStartDesc);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findVisible',
        error,
      );
    }
  }

  async updateSession(
    previous: ICoachingSession,
    data: ISessionUpdate,
  ): Promise<ICoachingSession> {
    try {
      const groupIds = data.group_ids
        ? unique(data.group_ids)
        : previous.targetGroupIds;
      const agentIds = data.agent_ids
        ? unique(data.agent_ids)
        : previous.targetAgentIds;
      const updated = await sessions.updateFields(
        { id: previous.id },
        {
          ...data,
          ...(data.start_date && { start_date: toUtc(data.start_date) }),
          ...(data.end_date && { end_date: toUtc(data.end_date) }),
          group_ids: groupIds,
          agent_ids: agentIds,
          audience_all:
            groupIds.length === 0 && agentIds.length === 0 ? 1 : null,
        },
        { condition: 'attribute_exists(id)' },
      );
      if (!updated) {
        throw new CoachingSessionNotFoundError();
      }

      if (
        data.group_ids !== undefined ||
        data.agent_ids !== undefined ||
        updated.start_date !== previous.start_date
      ) {
        await this.writeLinks(updated, {
          group_ids: previous.targetGroupIds,
          agent_ids: previous.targetAgentIds,
        });
      }
      return toSession(updated);
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof DynamoConditionFailedError
      ) {
        throw new CoachingSessionNotFoundError();
      }
      return handleRepositoryError(
        'CoachingSessionRepository.updateSession',
        error,
      );
    }
  }

  async deleteSession(session: ICoachingSession): Promise<void> {
    try {
      const rows = await attendance.queryAll({
        keyCondition: 'session_id = :session',
        values: { ':session': session.id },
      });
      await Promise.all([
        ...session.targetGroupIds.map((groupId) =>
          sessionGroups.delete({ session_id: session.id, group_id: groupId }),
        ),
        ...session.targetAgentIds.map((userId) =>
          sessionAgents.delete({ session_id: session.id, user_id: userId }),
        ),
        ...rows.map((row) =>
          attendance.delete({
            session_id: row.session_id,
            agent_key: row.agent_key,
          }),
        ),
      ]);
      await sessions.delete({ id: session.id });
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.deleteSession',
        error,
      );
    }
  }

  async findAttendance(
    sessionId: string,
  ): Promise<ICoachingSessionAttendance[]> {
    try {
      const rows = await attendance.queryAll({
        keyCondition: 'session_id = :session',
        values: { ':session': sessionId },
        consistent: true,
      });
      return rows.map(toAttendance);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findAttendance',
        error,
      );
    }
  }

  async findAttendanceForAgent(
    sessionId: string,
    agentId: string,
  ): Promise<ICoachingSessionAttendance | null> {
    try {
      const item = await attendance.get(
        { session_id: sessionId, agent_key: agentId },
        { consistent: true },
      );
      return item ? toAttendance(item) : null;
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findAttendanceForAgent',
        error,
      );
    }
  }

  async insertPendingAttendance(
    sessionId: string,
    records: INewAttendance[],
  ): Promise<void> {
    try {
      const now = nowUtc();
      const results = await Promise.all(
        records.map((record) =>
          attendance
            .put(
              {
                id: randomUUID(),
                session_id: sessionId,
                agent_key: record.agent_id,
                agent_id: record.agent_id,
                agent_name: record.agent_name,
                agent_email: record.agent_email,
                ...(record.group_id && { group_id: record.group_id }),
                ...(record.group_name && { group_name: record.group_name }),
                status: 'pending',
                created_at: now,
                updated_at: now,
              },
              { condition: 'attribute_not_exists(agent_key)' },
            )
            .then(() => 1)
            .catch((error: unknown) => {
              if (error instanceof DynamoConditionFailedError) return 0;
              throw error;
            }),
        ),
      );
      await this.addCounts(
        sessionId,
        results.reduce<number>((a, b) => a + b, 0),
      );
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.insertPendingAttendance',
        error,
      );
    }
  }

  async deletePendingAttendance(
    sessionId: string,
    agentIds: string[],
  ): Promise<void> {
    try {
      const results = await Promise.all(
        agentIds.map((agentId) =>
          attendance
            .delete(
              { session_id: sessionId, agent_key: agentId },
              {
                condition: 'status = :pending',
                values: { ':pending': 'pending' },
              },
            )
            .then(() => 1)
            .catch((error: unknown) => {
              if (error instanceof DynamoConditionFailedError) return 0;
              throw error;
            }),
        ),
      );
      await this.addCounts(
        sessionId,
        -results.reduce<number>((a, b) => a + b, 0),
      );
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.deletePendingAttendance',
        error,
      );
    }
  }

  // One transaction per join so concurrent joins never lose a count. A
  // condition failure (row created or joined meanwhile) reaches the caller.
  async join(
    sessionId: string,
    record: INewAttendance,
    existing: ICoachingSessionAttendance | null,
  ): Promise<ICoachingSessionAttendance> {
    try {
      const now = nowUtc();
      const one = { ':one': 1 };
      if (existing) {
        await dynamoService.transactWrite([
          attendance.updateItem(
            { session_id: sessionId, agent_key: record.agent_id },
            'SET status = :joined, joined_at = :now, updated_at = :now',
            {
              condition: 'status <> :joined',
              values: { ':joined': 'joined', ':now': now },
            },
          ),
          sessions.updateItem({ id: sessionId }, 'ADD attendance_joined :one', {
            values: one,
          }),
        ]);
        return {
          ...existing,
          status: 'joined',
          joined_at: now,
          updated_at: now,
        };
      }

      const item: IAttendanceItem = {
        id: randomUUID(),
        session_id: sessionId,
        agent_key: record.agent_id,
        agent_id: record.agent_id,
        agent_name: record.agent_name,
        agent_email: record.agent_email,
        ...(record.group_id && { group_id: record.group_id }),
        ...(record.group_name && { group_name: record.group_name }),
        status: 'joined',
        joined_at: now,
        created_at: now,
        updated_at: now,
      };
      await dynamoService.transactWrite([
        attendance.putItem(item, {
          condition: 'attribute_not_exists(agent_key)',
        }),
        sessions.updateItem(
          { id: sessionId },
          'ADD attendance_total :one, attendance_joined :one',
          { values: one },
        ),
      ]);
      return toAttendance(item);
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) throw error;
      return handleRepositoryError('CoachingSessionRepository.join', error);
    }
  }

  async markPendingAsDidNotAttend(sessionId: string): Promise<void> {
    try {
      const pending = await attendance.queryAll({
        keyCondition: 'session_id = :session',
        filter: 'status = :pending',
        values: { ':session': sessionId, ':pending': 'pending' },
      });
      const now = nowUtc();
      await Promise.all(
        pending.map((row) =>
          attendance
            .update(
              { session_id: sessionId, agent_key: row.agent_key },
              'SET status = :dna, updated_at = :now',
              {
                condition: 'status = :pending',
                values: {
                  ':dna': 'did_not_attend',
                  ':pending': 'pending',
                  ':now': now,
                },
              },
            )
            .catch((error: unknown) => {
              if (!(error instanceof DynamoConditionFailedError)) throw error;
            }),
        ),
      );
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.markPendingAsDidNotAttend',
        error,
      );
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const coachingSessionRepository = new CoachingSessionRepository();
export default coachingSessionRepository;
