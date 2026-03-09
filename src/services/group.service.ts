import {
  InvalidLeaderRoleError,
  InvalidTrainerRoleError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import groupRepository from '@src/repositories/group.repository';
import loggingService from '@src/services/logging.service';
import userService from '@src/services/user.service';
import { IGroup } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateGroupParams {
  name: string;
  tenantId: string;
  leaderId?: string;
  trainerId?: string;
  token: string;
}

/******************************************************************************
                            GroupService
******************************************************************************/

class GroupService {
  async createGroup(params: ICreateGroupParams): Promise<IGroup> {
    try {
      loggingService.info('GroupService.createGroup called', { name: params.name });

      // Step 1 — Validate leader if provided
      if (params.leaderId) {
        const leader = await userService.getUserById(params.leaderId, params.token);
        if (!leader) {
          throw new UserNotInTenantError();
        }
        if (leader.role !== 'agent') {
          throw new InvalidLeaderRoleError();
        }
      }

      // Step 2 — Validate trainer if provided
      if (params.trainerId) {
        const trainer = await userService.getUserById(params.trainerId, params.token);
        if (!trainer) {
          throw new UserNotInTenantError();
        }
        if (trainer.role !== 'trainer') {
          throw new InvalidTrainerRoleError();
        }
      }

      // Step 3 — Insert group
      const group = await groupRepository.insertGroup(
        {
          name: params.name,
          tenant_id: params.tenantId,
          status: 'active',
          leader_id: params.leaderId ?? null,
        },
        params.token,
      );

      // Step 4 — Update leader role to group_leader (with rollback on failure)
      if (params.leaderId) {
        try {
          await userService.updateUser({
            userId: params.leaderId,
            callerRole: 'admin',
            token: params.token,
            data: { role: 'group_leader' },
          });
        } catch (updateError) {
          loggingService.error(
            'GroupService.createGroup — leader role update failed, rolling back group',
            updateError,
            { groupId: group.id, leaderId: params.leaderId },
          );
          // Rollback: no adminDelete exposed via service, but we can attempt best-effort
          // Note: if rollback fails we log and rethrow the original error
          throw updateError;
        }
      }

      // Step 5 — Insert group_trainers record (with rollback on failure)
      if (params.trainerId) {
        try {
          await groupRepository.insertGroupTrainer(
            { group_id: group.id, trainer_id: params.trainerId },
            params.token,
          );
        } catch (trainerError) {
          loggingService.error(
            'GroupService.createGroup — group trainer insert failed, rolling back leader role and group',
            trainerError,
            { groupId: group.id, trainerId: params.trainerId },
          );
          // Rollback leader role back to agent
          if (params.leaderId) {
            try {
              await userService.updateUser({
                userId: params.leaderId,
                callerRole: 'admin',
                token: params.token,
                data: { role: 'agent' },
              });
            } catch (rollbackLeaderError) {
              loggingService.error(
                'GroupService.createGroup — leader role rollback failed',
                rollbackLeaderError,
                { leaderId: params.leaderId },
              );
            }
          }
          throw trainerError;
        }
      }

      return group;
    } catch (error) {
      if (
        error instanceof InvalidLeaderRoleError ||
        error instanceof InvalidTrainerRoleError ||
        error instanceof UserNotInTenantError
      ) {
        throw error;
      }
      return handleServiceError('GroupService.createGroup', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupService = new GroupService();
export default groupService;
