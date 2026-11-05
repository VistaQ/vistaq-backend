import {
  CoachingSessionNotFoundError,
  InvalidAgentIdsError,
  InvalidDateRangeError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
  UnauthorizedSessionAccessError,
} from '@src/models/errors/coachingSession.errors';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import coachingSessionRepository, {
  type INewAttendance,
  type ISessionUpdate,
} from '@src/repositories/coachingSession.repository';
import groupRepository from '@src/repositories/group.repository';
import userRepository from '@src/repositories/user.repository';
import scopeService from '@src/services/scope.service';
import type { ICaller, IUser } from '@src/types/auth.types';
import type {
  ICoachingSession,
  ICoachingSessionAttendance,
  ICoachingSessionDetail,
} from '@src/types/coachingSession.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateCoachingSessionParams {
  coachingType: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  trainingMode: string;
  link?: string;
  status?: string;
  groupIds?: string[];
  agentIds?: string[];
  createdBy: string;
  role: string;
}

interface IUpdateCoachingSessionParams {
  sessionId: string;
  coachingType?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  trainingMode?: string;
  link?: string;
  status?: string;
  groupIds?: string[];
  agentIds?: string[];
  caller: ICaller;
}

const PRIVILEGED_ROLES = ['admin', 'master_trainer'];
const AGENT_ROLES = ['agent', 'group_leader'];

function canRead(
  caller: ICaller,
  session: ICoachingSession,
  groupScope: string[] | null,
): boolean {
  const allAudience =
    session.targetGroupIds.length === 0 && session.targetAgentIds.length === 0;
  return (
    groupScope === null ||
    allAudience ||
    session.created_by === caller.id ||
    session.targetAgentIds.includes(caller.id) ||
    session.targetGroupIds.some((groupId) => groupScope.includes(groupId))
  );
}

function isAgent(user: IUser): boolean {
  return user.status === 'active' && AGENT_ROLES.includes(user.role);
}

/******************************************************************************
                            CoachingSessionService
******************************************************************************/

class CoachingSessionService {
  private async findVisibleSession(
    sessionId: string,
    caller: ICaller,
  ): Promise<ICoachingSession | null> {
    try {
      const [session, groupScope] = await Promise.all([
        coachingSessionRepository.findById(sessionId),
        scopeService.resolveGroupScope(caller),
      ]);
      return session && canRead(caller, session, groupScope) ? session : null;
    } catch (error) {
      return handleServiceError(
        'CoachingSessionService.findVisibleSession',
        error,
      );
    }
  }

  private async findManageableSession(
    sessionId: string,
    caller: ICaller,
  ): Promise<ICoachingSession> {
    try {
      const session = await this.findVisibleSession(sessionId, caller);
      if (!session) {
        throw new CoachingSessionNotFoundError();
      }
      if (
        !PRIVILEGED_ROLES.includes(caller.role) &&
        session.created_by !== caller.id
      ) {
        throw new UnauthorizedSessionAccessError();
      }
      return session;
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof UnauthorizedSessionAccessError
      ) {
        throw error;
      }
      return handleServiceError(
        'CoachingSessionService.findManageableSession',
        error,
      );
    }
  }

  private async validateTargets(
    role: string,
    userId: string,
    groupIds?: string[],
    agentIds?: string[],
  ): Promise<void> {
    try {
      if (groupIds) {
        const unique = Array.from(new Set(groupIds));
        const found = await groupRepository.findByIds(unique);
        if (found.length !== unique.length) {
          throw new InvalidGroupIdsError();
        }
        if (role === 'trainer') {
          const managed = new Set(await scopeService.managedGroupIds(userId));
          if (!unique.every((id) => managed.has(id))) {
            throw new UnauthorizedGroupAccessError();
          }
        }
      }

      if (agentIds) {
        const unique = Array.from(new Set(agentIds));
        const agents = (await userRepository.findByIds(unique)).filter(isAgent);
        if (agents.length !== unique.length) {
          throw new InvalidAgentIdsError();
        }
      }
    } catch (error) {
      if (
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError
      ) {
        throw error;
      }
      return handleServiceError(
        'CoachingSessionService.validateTargets',
        error,
      );
    }
  }

  async createSession(
    params: ICreateCoachingSessionParams,
  ): Promise<ICoachingSession> {
    try {
      await this.validateTargets(
        params.role,
        params.createdBy,
        params.groupIds,
        params.agentIds,
      );
      const creator = await userRepository.findById(params.createdBy);

      const session = await coachingSessionRepository.insertSession({
        coaching_type: params.coachingType,
        title: params.title,
        description: params.description,
        start_date: params.startDate,
        end_date: params.endDate,
        training_mode: params.trainingMode,
        link: params.link ?? null,
        status: params.status,
        created_by: params.createdBy,
        created_by_name: creator?.name ?? null,
        created_by_role: creator?.role ?? null,
        group_ids: params.groupIds ?? [],
        agent_ids: params.agentIds ?? [],
      });

      await this.syncAttendance(session, params.role);
      return (
        (await coachingSessionRepository.findById(session.id, {
          consistent: true,
        })) ?? session
      );
    } catch (error) {
      if (
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError
      ) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.createSession', error);
    }
  }

  async updateSession(
    params: IUpdateCoachingSessionParams,
  ): Promise<ICoachingSession> {
    try {
      const existing = await this.findManageableSession(
        params.sessionId,
        params.caller,
      );
      await this.validateTargets(
        params.caller.role,
        params.caller.id,
        params.groupIds,
        params.agentIds,
      );

      const updateData: ISessionUpdate = {};
      if (params.coachingType !== undefined)
        updateData.coaching_type = params.coachingType;
      if (params.title !== undefined) updateData.title = params.title;
      if (params.description !== undefined)
        updateData.description = params.description;
      if (params.trainingMode !== undefined)
        updateData.training_mode = params.trainingMode;
      if (params.link !== undefined) updateData.link = params.link;
      if (params.status !== undefined) updateData.status = params.status;
      if (params.startDate !== undefined)
        updateData.start_date = params.startDate;
      if (params.endDate !== undefined) updateData.end_date = params.endDate;
      if (params.groupIds !== undefined) updateData.group_ids = params.groupIds;
      if (params.agentIds !== undefined) updateData.agent_ids = params.agentIds;

      const effectiveStart = updateData.start_date ?? existing.start_date;
      const effectiveEnd = updateData.end_date ?? existing.end_date;
      if (new Date(effectiveEnd) <= new Date(effectiveStart)) {
        throw new InvalidDateRangeError();
      }

      const updated = await coachingSessionRepository.updateSession(
        existing,
        updateData,
      );

      if (params.groupIds || params.agentIds) {
        await this.syncAttendance(
          updated,
          existing.created_by_role ?? params.caller.role,
        );
        return (
          (await coachingSessionRepository.findById(updated.id, {
            consistent: true,
          })) ?? updated
        );
      }
      return updated;
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof UnauthorizedSessionAccessError ||
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError ||
        error instanceof InvalidDateRangeError
      ) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.updateSession', error);
    }
  }

  async deleteSession(sessionId: string, caller: ICaller): Promise<void> {
    try {
      const session = await this.findManageableSession(sessionId, caller);
      await coachingSessionRepository.deleteSession(session);
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof UnauthorizedSessionAccessError
      ) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.deleteSession', error);
    }
  }

  async getSessions(caller: ICaller): Promise<ICoachingSession[]> {
    try {
      const groupScope = await scopeService.resolveGroupScope(caller);
      return groupScope === null
        ? await coachingSessionRepository.findAll()
        : await coachingSessionRepository.findVisible(caller.id, groupScope);
    } catch (error) {
      return handleServiceError('CoachingSessionService.getSessions', error);
    }
  }

  async getSessionById(
    sessionId: string,
    caller: ICaller,
  ): Promise<ICoachingSessionDetail | null> {
    try {
      const session = await this.findVisibleSession(sessionId, caller);
      if (!session) {
        return null;
      }
      const attendance =
        await coachingSessionRepository.findAttendance(sessionId);
      return { ...session, attendance };
    } catch (error) {
      return handleServiceError('CoachingSessionService.getSessionById', error);
    }
  }

  async joinSession(
    sessionId: string,
    caller: ICaller,
  ): Promise<ICoachingSessionAttendance> {
    try {
      const session = await this.findVisibleSession(sessionId, caller);
      if (!session) {
        throw new CoachingSessionNotFoundError();
      }

      const existing = await coachingSessionRepository.findAttendanceForAgent(
        sessionId,
        caller.id,
      );
      if (existing?.status === 'joined') {
        return existing;
      }

      const user = await userRepository.findById(caller.id);
      if (!user) {
        throw new CoachingSessionNotFoundError('User not found');
      }
      const [record] = await this.toAttendanceRecords([user]);

      try {
        return await coachingSessionRepository.join(
          sessionId,
          record,
          existing,
        );
      } catch (joinError) {
        if (!(joinError instanceof DynamoConditionFailedError)) throw joinError;
        const current = await coachingSessionRepository.findAttendanceForAgent(
          sessionId,
          caller.id,
        );
        if (current?.status === 'joined') return current;
        return await coachingSessionRepository.join(sessionId, record, current);
      }
    } catch (error) {
      if (error instanceof CoachingSessionNotFoundError) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.joinSession', error);
    }
  }

  async markNonAttendees(sessionId: string, caller: ICaller): Promise<void> {
    try {
      await this.findManageableSession(sessionId, caller);
      await coachingSessionRepository.markPendingAsDidNotAttend(sessionId);
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof UnauthorizedSessionAccessError
      ) {
        throw error;
      }
      return handleServiceError(
        'CoachingSessionService.markNonAttendees',
        error,
      );
    }
  }

  /******************************************************************************
                          Private Helpers
  ******************************************************************************/

  private async toAttendanceRecords(users: IUser[]): Promise<INewAttendance[]> {
    try {
      const groupIds = users
        .map((user) => user.group_id)
        .filter((id): id is string => !!id);
      const groups = await groupRepository.findByIds(groupIds);
      const names = new Map(groups.map((group) => [group.id, group.name]));
      return users.map((user) => ({
        agent_id: user.id,
        agent_name: user.name,
        agent_email: user.email,
        group_id: user.group_id,
        group_name: user.group_id ? (names.get(user.group_id) ?? null) : null,
      }));
    } catch (error) {
      return handleServiceError(
        'CoachingSessionService.toAttendanceRecords',
        error,
      );
    }
  }

  private async targetAgents(
    session: ICoachingSession,
    creatorRole: string,
  ): Promise<IUser[]> {
    try {
      const { targetGroupIds, targetAgentIds } = session;
      if (targetGroupIds.length === 0 && targetAgentIds.length === 0) {
        if (PRIVILEGED_ROLES.includes(creatorRole)) {
          return await userRepository.findByRoles(AGENT_ROLES, 'active');
        }
        const creator = session.created_by
          ? await userRepository.findById(session.created_by)
          : null;
        const groupIds =
          creatorRole === 'trainer' && creator
            ? await scopeService.managedGroupIds(creator.id)
            : creatorRole === 'group_leader' && creator?.group_id
              ? [creator.group_id]
              : [];
        const members = await Promise.all(
          groupIds.map((groupId) =>
            userRepository.findByGroupId(groupId, 'active'),
          ),
        );
        return members.flat().filter(isAgent);
      }

      const [named, ...members] = await Promise.all([
        userRepository.findByIds(targetAgentIds),
        ...targetGroupIds.map((groupId) =>
          userRepository.findByGroupId(groupId, 'active'),
        ),
      ]);
      const byId = new Map(
        [...named, ...members.flat()]
          .filter(isAgent)
          .map((user) => [user.id, user]),
      );
      return Array.from(byId.values());
    } catch (error) {
      return handleServiceError('CoachingSessionService.targetAgents', error);
    }
  }

  private async syncAttendance(
    session: ICoachingSession,
    creatorRole: string,
  ): Promise<void> {
    try {
      const [targets, current] = await Promise.all([
        this.targetAgents(session, creatorRole),
        coachingSessionRepository.findAttendance(session.id),
      ]);
      const targetIds = new Set(targets.map((user) => user.id));
      const currentIds = new Set(current.map((row) => row.agent_id));

      const dropped = current
        .filter(
          (row) =>
            row.agent_id &&
            row.status === 'pending' &&
            !targetIds.has(row.agent_id),
        )
        .map((row) => row.agent_id as string);
      const added = await this.toAttendanceRecords(
        targets.filter((user) => !currentIds.has(user.id)),
      );

      await Promise.all([
        coachingSessionRepository.deletePendingAttendance(session.id, dropped),
        coachingSessionRepository.insertPendingAttendance(session.id, added),
      ]);
    } catch (error) {
      return handleServiceError('CoachingSessionService.syncAttendance', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const coachingSessionService = new CoachingSessionService();
export default coachingSessionService;
