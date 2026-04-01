import {
  CoachingSessionNotFoundError,
  InvalidAgentIdsError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
  UnauthorizedSessionAccessError,
} from '@src/models/errors/coachingSession.errors';
import coachingSessionRepository from '@src/repositories/coachingSession.repository';
import { ICoachingSession, ICoachingSessionAttendance } from '@src/types/coachingSession.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateCoachingSessionParams {
  coachingType: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  trainingMode: string;
  link?: string;
  status?: string;
  groupIds?: string[];
  agentIds?: string[];
  tenantId: string;
  createdBy: string;
  role: string;
  token: string;
}

interface IUpdateCoachingSessionParams {
  sessionId: string;
  coachingType?: string;
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  trainingMode?: string;
  link?: string;
  status?: string;
  groupIds?: string[];
  agentIds?: string[];
  tenantId: string;
  role: string;
  userId: string;
  token: string;
}

interface IDeleteCoachingSessionParams {
  sessionId: string;
  role: string;
  userId: string;
  token: string;
}

interface IJoinSessionParams {
  sessionId: string;
  userId: string;
  token: string;
}

interface IMarkNonAttendeesParams {
  sessionId: string;
  userId: string;
  role: string;
  token: string;
}

/******************************************************************************
                            CoachingSessionService
******************************************************************************/

class CoachingSessionService {
  async createSession(params: ICreateCoachingSessionParams): Promise<ICoachingSession> {
    try {
      // Validate groupIds if provided
      if (params.groupIds) {
        const foundGroupIds = await coachingSessionRepository.findGroupsByIds(
          params.groupIds,
          params.token,
        );

        if (foundGroupIds.length !== params.groupIds.length) {
          throw new InvalidGroupIdsError();
        }

        if (params.role === 'trainer') {
          const managedGroupIds = await coachingSessionRepository.findTrainerGroups(
            params.createdBy,
          );
          const managedSet = new Set(managedGroupIds);

          if (!params.groupIds.every((id) => managedSet.has(id))) {
            throw new UnauthorizedGroupAccessError();
          }
        }
      }

      // Validate agentIds if provided
      if (params.agentIds) {
        const agentRows = await coachingSessionRepository.findUsersByIdsAndRoles(
          params.agentIds,
          params.token,
        );

        if (agentRows.length !== params.agentIds.length) {
          throw new InvalidAgentIdsError();
        }

        const allowedRoles = ['agent', 'group_leader'];
        if (agentRows.some((row) => !allowedRoles.includes(row.role))) {
          throw new InvalidAgentIdsError();
        }

        if (agentRows.some((row) => row.tenant_id !== params.tenantId)) {
          throw new InvalidAgentIdsError();
        }
      }

      // Look up creator details
      const creator = await coachingSessionRepository.findUserById(params.createdBy);

      // Insert session
      const session = await coachingSessionRepository.insertSession(
        {
          coaching_type: params.coachingType,
          title: params.title,
          description: params.description,
          date: params.date,
          start_time: params.startTime,
          end_time: params.endTime,
          training_mode: params.trainingMode,
          link: params.link ?? null,
          status: params.status,
          tenant_id: params.tenantId,
          created_by: params.createdBy,
          created_by_name: creator?.name ?? null,
          created_by_role: creator?.role ?? null,
        },
        params.token,
      );

      // Insert junction entries if provided
      if (params.groupIds) {
        const sessionGroups = params.groupIds.map((groupId) => ({
          session_id: session.id,
          group_id: groupId,
        }));
        await coachingSessionRepository.insertSessionGroups(sessionGroups, params.token);
      }

      if (params.agentIds) {
        const sessionAgents = params.agentIds.map((userId) => ({
          session_id: session.id,
          user_id: userId,
        }));
        await coachingSessionRepository.insertSessionAgents(sessionAgents, params.token);
      }

      // Pre-populate attendance records
      await this.populateAttendance(
        session.id,
        params.groupIds,
        params.agentIds,
        params.createdBy,
        params.role,
        params.tenantId,
      );

      // Re-fetch and return
      const finalSession = await coachingSessionRepository.findById(session.id, params.token);

      if (!finalSession) {
        throw new CoachingSessionNotFoundError();
      }

      return finalSession;
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

  async updateSession(params: IUpdateCoachingSessionParams): Promise<ICoachingSession> {
    try {
      const existing = await coachingSessionRepository.findById(
        params.sessionId,
        params.token,
      );

      if (!existing) {
        throw new CoachingSessionNotFoundError();
      }

      // Permission check
      const privilegedRoles = ['admin', 'master_trainer'];
      if (!privilegedRoles.includes(params.role) && existing.created_by !== params.userId) {
        throw new UnauthorizedSessionAccessError();
      }

      // Validate groupIds if provided
      if (params.groupIds) {
        const foundGroupIds = await coachingSessionRepository.findGroupsByIds(
          params.groupIds,
          params.token,
        );

        if (foundGroupIds.length !== params.groupIds.length) {
          throw new InvalidGroupIdsError();
        }

        if (params.role === 'trainer') {
          const managedGroupIds = await coachingSessionRepository.findTrainerGroups(
            params.userId,
          );
          const managedSet = new Set(managedGroupIds);

          if (!params.groupIds.every((id) => managedSet.has(id))) {
            throw new UnauthorizedGroupAccessError();
          }
        }
      }

      // Validate agentIds if provided
      if (params.agentIds) {
        const agentRows = await coachingSessionRepository.findUsersByIdsAndRoles(
          params.agentIds,
          params.token,
        );

        if (agentRows.length !== params.agentIds.length) {
          throw new InvalidAgentIdsError();
        }

        const allowedRoles = ['agent', 'group_leader'];
        if (agentRows.some((row) => !allowedRoles.includes(row.role))) {
          throw new InvalidAgentIdsError();
        }

        if (agentRows.some((row) => row.tenant_id !== params.tenantId)) {
          throw new InvalidAgentIdsError();
        }
      }

      // Build update payload (only provided fields)
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (params.coachingType !== undefined) updateData.coaching_type = params.coachingType;
      if (params.title !== undefined) updateData.title = params.title;
      if (params.description !== undefined) updateData.description = params.description;
      if (params.date !== undefined) updateData.date = params.date;
      if (params.startTime !== undefined) updateData.start_time = params.startTime;
      if (params.endTime !== undefined) updateData.end_time = params.endTime;
      if (params.trainingMode !== undefined) updateData.training_mode = params.trainingMode;
      if (params.link !== undefined) updateData.link = params.link;
      if (params.status !== undefined) updateData.status = params.status;

      await coachingSessionRepository.updateSession(
        params.sessionId,
        updateData,
        params.token,
      );

      // Replace junction entries if provided
      if (params.groupIds) {
        await coachingSessionRepository.deleteSessionGroupsBySessionId(
          params.sessionId,
          params.token,
        );
        const sessionGroups = params.groupIds.map((groupId) => ({
          session_id: params.sessionId,
          group_id: groupId,
        }));
        await coachingSessionRepository.insertSessionGroups(sessionGroups, params.token);
      }

      if (params.agentIds) {
        await coachingSessionRepository.deleteSessionAgentsBySessionId(
          params.sessionId,
          params.token,
        );
        const sessionAgents = params.agentIds.map((userId) => ({
          session_id: params.sessionId,
          user_id: userId,
        }));
        await coachingSessionRepository.insertSessionAgents(sessionAgents, params.token);
      }

      // Attendance reconciliation if targets changed
      if (params.groupIds || params.agentIds) {
        await this.reconcileAttendance(
          params.sessionId,
          params.groupIds,
          params.agentIds,
          existing.created_by!,
          params.role,
          params.tenantId,
        );
      }

      // Re-fetch and return
      const finalSession = await coachingSessionRepository.findById(
        params.sessionId,
        params.token,
      );

      if (!finalSession) {
        throw new CoachingSessionNotFoundError();
      }

      return finalSession;
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof UnauthorizedSessionAccessError ||
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError
      ) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.updateSession', error);
    }
  }

  async deleteSession(params: IDeleteCoachingSessionParams): Promise<void> {
    try {
      const existing = await coachingSessionRepository.findById(
        params.sessionId,
        params.token,
      );

      if (!existing) {
        throw new CoachingSessionNotFoundError();
      }

      // Permission check
      const privilegedRoles = ['admin', 'master_trainer'];
      if (!privilegedRoles.includes(params.role) && existing.created_by !== params.userId) {
        throw new UnauthorizedSessionAccessError();
      }

      await coachingSessionRepository.deleteSession(params.sessionId, params.token);
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

  async getSessions(token: string): Promise<ICoachingSession[]> {
    try {
      return await coachingSessionRepository.findAll(token);
    } catch (error) {
      return handleServiceError('CoachingSessionService.getSessions', error);
    }
  }

  async getSessionById(sessionId: string, token: string): Promise<ICoachingSession | null> {
    try {
      return await coachingSessionRepository.findById(sessionId, token);
    } catch (error) {
      return handleServiceError('CoachingSessionService.getSessionById', error);
    }
  }

  async joinSession(params: IJoinSessionParams): Promise<ICoachingSessionAttendance> {
    try {
      // Verify session exists
      const session = await coachingSessionRepository.findById(
        params.sessionId,
        params.token,
      );

      if (!session) {
        throw new CoachingSessionNotFoundError();
      }

      // Check for existing attendance record
      const existing = await coachingSessionRepository.findAttendanceBySessionAndAgent(
        params.sessionId,
        params.userId,
      );

      if (existing) {
        // Already joined — no-op
        if (existing.status === 'joined') {
          return existing;
        }

        // Pending or did_not_attend — update to joined
        const updated = await coachingSessionRepository.updateAttendanceRecord(
          params.sessionId,
          params.userId,
          {
            status: 'joined',
            joined_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        );

        if (!updated) {
          throw new CoachingSessionNotFoundError('Attendance record not found');
        }

        return updated;
      }

      // No existing record — create a new one
      const user = await coachingSessionRepository.findUserById(params.userId);

      if (!user) {
        throw new CoachingSessionNotFoundError('User not found');
      }

      let groupName: string | null = null;

      if (user.group_id) {
        const groups = await coachingSessionRepository.findGroupsByIdsWithNames([user.group_id]);
        if (groups.length > 0) {
          groupName = groups[0].name;
        }
      }

      await coachingSessionRepository.insertAttendanceRecords([
        {
          session_id: params.sessionId,
          agent_id: params.userId,
          agent_name: user.name,
          agent_email: user.email,
          group_id: user.group_id,
          group_name: groupName,
          status: 'joined',
          joined_at: new Date().toISOString(),
        },
      ]);

      const record = await coachingSessionRepository.findAttendanceBySessionAndAgent(
        params.sessionId,
        params.userId,
      );

      if (!record) {
        throw new CoachingSessionNotFoundError();
      }

      return record;
    } catch (error) {
      if (error instanceof CoachingSessionNotFoundError) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.joinSession', error);
    }
  }

  async markNonAttendees(params: IMarkNonAttendeesParams): Promise<void> {
    try {
      const session = await coachingSessionRepository.findById(
        params.sessionId,
        params.token,
      );

      if (!session) {
        throw new CoachingSessionNotFoundError();
      }

      // Permission check
      const privilegedRoles = ['admin', 'master_trainer'];
      if (!privilegedRoles.includes(params.role) && session.created_by !== params.userId) {
        throw new UnauthorizedSessionAccessError();
      }

      await coachingSessionRepository.bulkUpdatePendingToDidNotAttend(params.sessionId);
    } catch (error) {
      if (
        error instanceof CoachingSessionNotFoundError ||
        error instanceof UnauthorizedSessionAccessError
      ) {
        throw error;
      }
      return handleServiceError('CoachingSessionService.markNonAttendees', error);
    }
  }

  /******************************************************************************
                          Private Helpers
  ******************************************************************************/

  /**
   * Pre-populates attendance records for a newly created session.
   * Resolves the target agent set based on groupIds, agentIds, or all-audience scope.
   */
  private async populateAttendance(
    sessionId: string,
    groupIds: string[] | undefined,
    agentIds: string[] | undefined,
    createdBy: string,
    creatorRole: string,
    tenantId: string,
  ): Promise<void> {
    try {
      const targetAgentIds = new Set<string>();

      // Collect agents from explicitly provided agentIds
      if (agentIds && agentIds.length > 0) {
        agentIds.forEach((id) => targetAgentIds.add(id));
      }

      // Collect agents from targeted groups
      if (groupIds && groupIds.length > 0) {
        const groupAgents = await coachingSessionRepository.findUsersByGroupIds(
          groupIds,
          tenantId,
        );
        groupAgents.forEach((agent) => targetAgentIds.add(agent.id));
      }

      // If neither groupIds nor agentIds — determine scope by creator role
      if (!agentIds && !groupIds) {
        const allAgents = await this.resolveAllAudienceAgents(
          createdBy,
          creatorRole,
          tenantId,
        );
        allAgents.forEach((id) => targetAgentIds.add(id));
      }

      if (targetAgentIds.size === 0) {
        return;
      }

      // Batch-fetch agent details in a single query
      const agentDetails = await coachingSessionRepository.findUserDetailsByIds(
        Array.from(targetAgentIds),
      );

      // Collect unique group IDs and batch-fetch group names
      const uniqueGroupIds = [
        ...new Set(
          agentDetails
            .map((agent) => agent.group_id)
            .filter((gid): gid is string => gid !== null && gid !== undefined),
        ),
      ];

      const groupNameMap = new Map<string, string>();
      if (uniqueGroupIds.length > 0) {
        const groups = await coachingSessionRepository.findGroupsByIdsWithNames(uniqueGroupIds);
        groups.forEach((g) => groupNameMap.set(g.id, g.name));
      }

      // Create attendance records
      const attendanceRecords = agentDetails.map((agent) => ({
        session_id: sessionId,
        agent_id: agent.id,
        agent_name: agent.name,
        agent_email: agent.email,
        group_id: agent.group_id,
        group_name: agent.group_id ? (groupNameMap.get(agent.group_id) ?? null) : null,
        status: 'pending' as const,
      }));

      if (attendanceRecords.length > 0) {
        await coachingSessionRepository.insertAttendanceRecords(attendanceRecords);
      }
    } catch (error) {
      handleServiceError('CoachingSessionService.populateAttendance', error);
    }
  }

  /**
   * Resolves all agent IDs for an all-audience session based on creator role.
   */
  private async resolveAllAudienceAgents(
    createdBy: string,
    creatorRole: string,
    tenantId: string,
  ): Promise<string[]> {
    try {
      const privilegedRoles = ['admin', 'master_trainer'];

      if (privilegedRoles.includes(creatorRole)) {
        const agents = await coachingSessionRepository.findAllAgentsByTenant(tenantId);
        return agents.map((a) => a.id);
      }

      if (creatorRole === 'trainer') {
        const managedGroupIds = await coachingSessionRepository.findTrainerGroups(createdBy);
        if (managedGroupIds.length === 0) return [];
        const agents = await coachingSessionRepository.findUsersByGroupIds(managedGroupIds, tenantId);
        return agents.map((a) => a.id);
      }

      if (creatorRole === 'group_leader') {
        const creator = await coachingSessionRepository.findUserById(createdBy);
        if (!creator?.group_id) return [];
        const agents = await coachingSessionRepository.findUsersByGroupIds(
          [creator.group_id],
          tenantId,
        );
        return agents.map((a) => a.id);
      }

      return [];
    } catch (error) {
      return handleServiceError('CoachingSessionService.resolveAllAudienceAgents', error);
    }
  }

  /**
   * Reconciles attendance records when session targets (groups/agents) are updated.
   * Removes pending records for agents no longer targeted, adds records for newly targeted agents.
   */
  private async reconcileAttendance(
    sessionId: string,
    groupIds: string[] | undefined,
    agentIds: string[] | undefined,
    createdBy: string,
    creatorRole: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get current attendance
      const currentAttendance = await coachingSessionRepository.findAttendanceBySessionId(sessionId);
      const currentAgentIds = new Set(currentAttendance.map((a) => a.agent_id));

      // Determine new target set
      const newTargetIds = new Set<string>();

      if (agentIds && agentIds.length > 0) {
        agentIds.forEach((id) => newTargetIds.add(id));
      }

      if (groupIds && groupIds.length > 0) {
        const groupAgents = await coachingSessionRepository.findUsersByGroupIds(
          groupIds,
          tenantId,
        );
        groupAgents.forEach((agent) => newTargetIds.add(agent.id));
      }

      if (!agentIds && !groupIds) {
        const allAgents = await this.resolveAllAudienceAgents(
          createdBy,
          creatorRole,
          tenantId,
        );
        allAgents.forEach((id) => newTargetIds.add(id));
      }

      // Remove pending records for agents no longer targeted (parallelized)
      await Promise.all(
        currentAttendance
          .filter((record) => record.agent_id && !newTargetIds.has(record.agent_id) && record.status === 'pending')
          .map((record) => coachingSessionRepository.deleteAttendanceRecord(record.id)),
      );

      // Add records for newly targeted agents
      const agentsToAdd = Array.from(newTargetIds).filter((id) => !currentAgentIds.has(id));

      if (agentsToAdd.length === 0) {
        return;
      }

      // Batch-fetch agent details in a single query
      const agentDetails = await coachingSessionRepository.findUserDetailsByIds(agentsToAdd);

      const uniqueGroupIds = [
        ...new Set(
          agentDetails
            .map((agent) => agent.group_id)
            .filter((gid): gid is string => gid !== null && gid !== undefined),
        ),
      ];

      const groupNameMap = new Map<string, string>();
      if (uniqueGroupIds.length > 0) {
        const groups = await coachingSessionRepository.findGroupsByIdsWithNames(uniqueGroupIds);
        groups.forEach((g) => groupNameMap.set(g.id, g.name));
      }

      const newRecords = agentDetails.map((agent) => ({
        session_id: sessionId,
        agent_id: agent.id,
        agent_name: agent.name,
        agent_email: agent.email,
        group_id: agent.group_id,
        group_name: agent.group_id ? (groupNameMap.get(agent.group_id) ?? null) : null,
        status: 'pending' as const,
      }));

      if (newRecords.length > 0) {
        await coachingSessionRepository.insertAttendanceRecords(newRecords);
      }
    } catch (error) {
      handleServiceError('CoachingSessionService.reconcileAttendance', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const coachingSessionService = new CoachingSessionService();
export default coachingSessionService;
