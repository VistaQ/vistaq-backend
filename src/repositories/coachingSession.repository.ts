import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import {
  ICoachingSession,
  ICoachingSessionAttendance,
} from '@src/types/coachingSession.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type CoachingSessionsRow =
  Database['public']['Tables']['coaching_sessions']['Row'];
type CoachingSessionsInsert =
  Database['public']['Tables']['coaching_sessions']['Insert'];
type CoachingSessionsUpdate =
  Database['public']['Tables']['coaching_sessions']['Update'];
type CoachingSessionGroupsInsert =
  Database['public']['Tables']['coaching_session_groups']['Insert'];
type CoachingSessionGroupsRow =
  Database['public']['Tables']['coaching_session_groups']['Row'];
type CoachingSessionAgentsInsert =
  Database['public']['Tables']['coaching_session_agents']['Insert'];
type CoachingSessionAgentsRow =
  Database['public']['Tables']['coaching_session_agents']['Row'];
type CoachingSessionAttendanceRow =
  Database['public']['Tables']['coaching_session_attendance']['Row'];
type CoachingSessionAttendanceInsert =
  Database['public']['Tables']['coaching_session_attendance']['Insert'];
type CoachingSessionAttendanceUpdate =
  Database['public']['Tables']['coaching_session_attendance']['Update'];

type CoachingSessionWithRelationsRow = CoachingSessionsRow & {
  coaching_session_groups: { group_id: string }[];
  coaching_session_agents: { user_id: string }[];
  coaching_session_attendance: CoachingSessionAttendanceRow[];
};

/******************************************************************************
                            CoachingSessionRepository
******************************************************************************/

class CoachingSessionRepository {
  // ---------------------------------------------------------------------------
  // Private Mappers
  // ---------------------------------------------------------------------------

  private mapRowWithRelationsToSession(
    row: CoachingSessionWithRelationsRow,
  ): ICoachingSession {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      coaching_type: row.coaching_type,
      title: row.title,
      description: row.description,
      start_date: row.start_date,
      end_date: row.end_date,
      training_mode: row.training_mode,
      link: row.link,
      status: row.status,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      created_by_role: row.created_by_role,
      created_at: row.created_at,
      updated_at: row.updated_at,
      targetGroupIds: (row.coaching_session_groups ?? []).map(
        (csg) => csg.group_id,
      ),
      targetAgentIds: (row.coaching_session_agents ?? []).map(
        (csa) => csa.user_id,
      ),
      attendance: (row.coaching_session_attendance ?? []).map((a) => ({
        id: a.id,
        session_id: a.session_id,
        agent_id: a.agent_id,
        agent_name: a.agent_name,
        agent_email: a.agent_email,
        group_id: a.group_id,
        group_name: a.group_name,
        status: a.status,
        joined_at: a.joined_at,
        created_at: a.created_at,
        updated_at: a.updated_at,
      })),
    };
  }

  private mapInsertRowToSession(row: CoachingSessionsRow): ICoachingSession {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      coaching_type: row.coaching_type,
      title: row.title,
      description: row.description,
      start_date: row.start_date,
      end_date: row.end_date,
      training_mode: row.training_mode,
      link: row.link,
      status: row.status,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      created_by_role: row.created_by_role,
      created_at: row.created_at,
      updated_at: row.updated_at,
      targetGroupIds: [],
      targetAgentIds: [],
      attendance: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Session CRUD (user-scoped)
  // ---------------------------------------------------------------------------

  async insertSession(
    data: CoachingSessionsInsert,
    userToken: string,
  ): Promise<ICoachingSession> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'coaching_sessions',
        data,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No coaching session returned after insert');
      }

      const row = response.data[0] as unknown as CoachingSessionsRow;
      return this.mapInsertRowToSession(row);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.insertSession',
        error,
      );
    }
  }

  async findAll(userToken: string): Promise<ICoachingSession[]> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'coaching_sessions',
        '*, coaching_session_groups(group_id), coaching_session_agents(user_id), coaching_session_attendance(*)',
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows =
        (response.data ?? []) as unknown as CoachingSessionWithRelationsRow[];
      return rows.map((row) => this.mapRowWithRelationsToSession(row));
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findAll',
        error,
      );
    }
  }

  async findById(
    sessionId: string,
    userToken: string,
  ): Promise<ICoachingSession | null> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'coaching_sessions',
        '*, coaching_session_groups(group_id), coaching_session_agents(user_id), coaching_session_attendance(*)',
        { id: sessionId } as Partial<CoachingSessionsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row =
        response.data[0] as unknown as CoachingSessionWithRelationsRow;
      return this.mapRowWithRelationsToSession(row);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findById',
        error,
      );
    }
  }

  async updateSession(
    sessionId: string,
    data: CoachingSessionsUpdate,
    userToken: string,
  ): Promise<ICoachingSession | null> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'coaching_sessions',
        data,
        { id: sessionId } as Partial<CoachingSessionsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as CoachingSessionsRow;
      return this.mapInsertRowToSession(row);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.updateSession',
        error,
      );
    }
  }

  async deleteSession(
    sessionId: string,
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'coaching_sessions',
        { id: sessionId } as Partial<CoachingSessionsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.deleteSession',
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Junction Table Methods (user-scoped)
  // ---------------------------------------------------------------------------

  async insertSessionGroups(
    entries: CoachingSessionGroupsInsert[],
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'coaching_session_groups',
        entries,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.insertSessionGroups',
        error,
      );
    }
  }

  async deleteSessionGroupsBySessionId(
    sessionId: string,
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'coaching_session_groups',
        { session_id: sessionId } as Partial<CoachingSessionGroupsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.deleteSessionGroupsBySessionId',
        error,
      );
    }
  }

  async insertSessionAgents(
    entries: CoachingSessionAgentsInsert[],
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'coaching_session_agents',
        entries,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.insertSessionAgents',
        error,
      );
    }
  }

  async deleteSessionAgentsBySessionId(
    sessionId: string,
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'coaching_session_agents',
        { session_id: sessionId } as Partial<CoachingSessionAgentsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.deleteSessionAgentsBySessionId',
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Validation Helpers
  // ---------------------------------------------------------------------------

  async findGroupsByIds(
    groupIds: string[],
    userToken: string,
  ): Promise<string[]> {
    try {
      const response = await supabaseService.userSelectIn(
        userToken,
        'groups',
        'id',
        'id',
        groupIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as { id: string }[];
      return rows.map((r) => r.id);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findGroupsByIds',
        error,
      );
    }
  }

  async findTrainerGroups(trainerId: string): Promise<string[]> {
    try {
      const response = await supabaseService.adminSelect(
        'group_trainers',
        'group_id',
        { trainer_id: trainerId } as Partial<
          Database['public']['Tables']['group_trainers']['Row']
        >,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as { group_id: string }[];
      return rows.map((r) => r.group_id);
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findTrainerGroups',
        error,
      );
    }
  }

  async findUsersByIdsAndRoles(
    userIds: string[],
    userToken: string,
  ): Promise<{ id: string; role: string; tenant_id: string }[]> {
    try {
      const response = await supabaseService.userSelectIn(
        userToken,
        'users',
        'id,role,tenant_id',
        'id',
        userIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as {
        id: string;
        role: string;
        tenant_id: string;
      }[];
      return rows;
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findUsersByIdsAndRoles',
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Attendance Methods (admin client — no RLS on attendance)
  // ---------------------------------------------------------------------------

  async insertAttendanceRecords(
    records: CoachingSessionAttendanceInsert[],
  ): Promise<void> {
    try {
      const response = await supabaseService.adminInsert(
        'coaching_session_attendance',
        records,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.insertAttendanceRecords',
        error,
      );
    }
  }

  async findAttendanceBySessionAndAgent(
    sessionId: string,
    agentId: string,
  ): Promise<ICoachingSessionAttendance | null> {
    try {
      const response = await supabaseService.adminSelect(
        'coaching_session_attendance',
        '*',
        {
          session_id: sessionId,
          agent_id: agentId,
        } as Partial<CoachingSessionAttendanceRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as CoachingSessionAttendanceRow;
      return {
        id: row.id,
        session_id: row.session_id,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        agent_email: row.agent_email,
        group_id: row.group_id,
        group_name: row.group_name,
        status: row.status,
        joined_at: row.joined_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findAttendanceBySessionAndAgent',
        error,
      );
    }
  }

  async updateAttendanceRecord(
    sessionId: string,
    agentId: string,
    data: CoachingSessionAttendanceUpdate,
  ): Promise<ICoachingSessionAttendance | null> {
    try {
      const response = await supabaseService.adminUpdate(
        'coaching_session_attendance',
        data,
        {
          session_id: sessionId,
          agent_id: agentId,
        } as Partial<CoachingSessionAttendanceRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as CoachingSessionAttendanceRow;
      return {
        id: row.id,
        session_id: row.session_id,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        agent_email: row.agent_email,
        group_id: row.group_id,
        group_name: row.group_name,
        status: row.status,
        joined_at: row.joined_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.updateAttendanceRecord',
        error,
      );
    }
  }

  async bulkUpdatePendingToDidNotAttend(sessionId: string): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'coaching_session_attendance',
        {
          status: 'did_not_attend',
          updated_at: new Date().toISOString(),
        } as CoachingSessionAttendanceUpdate,
        {
          session_id: sessionId,
          status: 'pending',
        } as Partial<CoachingSessionAttendanceRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.bulkUpdatePendingToDidNotAttend',
        error,
      );
    }
  }

  async findAttendanceBySessionId(
    sessionId: string,
  ): Promise<ICoachingSessionAttendance[]> {
    try {
      const response = await supabaseService.adminSelect(
        'coaching_session_attendance',
        '*',
        { session_id: sessionId } as Partial<CoachingSessionAttendanceRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows =
        (response.data ?? []) as unknown as CoachingSessionAttendanceRow[];
      return rows.map((row) => ({
        id: row.id,
        session_id: row.session_id,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        agent_email: row.agent_email,
        group_id: row.group_id,
        group_name: row.group_name,
        status: row.status,
        joined_at: row.joined_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findAttendanceBySessionId',
        error,
      );
    }
  }

  async deleteAttendanceRecord(attendanceId: string): Promise<void> {
    try {
      const response = await supabaseService.adminDelete(
        'coaching_session_attendance',
        { id: attendanceId } as Partial<CoachingSessionAttendanceRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.deleteAttendanceRecord',
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // User/Group Resolution (admin client)
  // ---------------------------------------------------------------------------

  async findUserById(
    userId: string,
  ): Promise<{
    id: string;
    name: string;
    email: string;
    role: string;
    group_id: string | null;
    tenant_id: string;
  } | null> {
    try {
      const response = await supabaseService.adminSelect(
        'users',
        'id, name, email, role, group_id, tenant_id',
        { id: userId } as Partial<Database['public']['Tables']['users']['Row']>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as {
        id: string;
        name: string;
        email: string;
        role: string;
        group_id: string | null;
        tenant_id: string;
      };
      return row;
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findUserById',
        error,
      );
    }
  }

  async findUsersByGroupIds(
    groupIds: string[],
    tenantId: string,
  ): Promise<
    { id: string; name: string; email: string; group_id: string }[]
  > {
    try {
      const response = await supabaseService.adminSelectIn(
        'users',
        'id, name, email, role, group_id',
        'group_id',
        groupIds,
        { tenant_id: tenantId } as Partial<
          Database['public']['Tables']['users']['Row']
        >,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as {
        id: string;
        name: string;
        email: string;
        role: string;
        group_id: string;
      }[];
      // Filter to only agents and group_leaders
      // Note: adminSelectIn with filters only supports .eq(), so we filter roles in memory
      const allowedRoles = ['agent', 'group_leader'];
      return rows
        .filter((r) => allowedRoles.includes(r.role))
        .map(({ id, name, email, group_id }) => ({ id, name, email, group_id }));
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findUsersByGroupIds',
        error,
      );
    }
  }

  async findGroupsByIdsWithNames(
    groupIds: string[],
  ): Promise<{ id: string; name: string }[]> {
    try {
      const response = await supabaseService.adminSelectIn(
        'groups',
        'id, name',
        'id',
        groupIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as {
        id: string;
        name: string;
      }[];
      return rows;
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findGroupsByIdsWithNames',
        error,
      );
    }
  }

  async findUserDetailsByIds(
    userIds: string[],
  ): Promise<{ id: string; name: string; email: string; group_id: string | null }[]> {
    try {
      const response = await supabaseService.adminSelectIn(
        'users',
        'id, name, email, group_id',
        'id',
        userIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as {
        id: string;
        name: string;
        email: string;
        group_id: string | null;
      }[];
      return rows;
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findUserDetailsByIds',
        error,
      );
    }
  }

  async findAllAgentsByTenant(
    tenantId: string,
  ): Promise<
    { id: string; name: string; email: string; group_id: string | null }[]
  > {
    try {
      const response = await supabaseService.adminSelectIn(
        'users',
        'id, name, email, group_id',
        'role',
        ['agent', 'group_leader'],
        { tenant_id: tenantId } as Partial<
          Database['public']['Tables']['users']['Row']
        >,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as {
        id: string;
        name: string;
        email: string;
        group_id: string | null;
      }[];
      return rows;
    } catch (error) {
      return handleRepositoryError(
        'CoachingSessionRepository.findAllAgentsByTenant',
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
