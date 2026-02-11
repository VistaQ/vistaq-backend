/**
 * Prospects Controller - Handle prospects management operations
 */
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import {
  createProspectRecord,
  deleteProspectRecord,
  getAllProspects,
  getProspectById,
  getProspectsByAgent,
  getProspectsByGroup,
  updateProspectRecord,
} from '@src/services/firestoreService';
import {
  CreateProspectRequest,
  UpdateProspectRequest,
} from '@src/types/prospects.types';

const Timestamp = admin.firestore.Timestamp;

/******************************************************************************
                            Helper Functions
******************************************************************************/

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if user has permission to view a prospect
 */
function canViewProspect(
  prospect: { uid: string; groupId: string },
  userId: string,
  userRole: string,
  userGroupId: string,
  managedGroupIds?: string[],
): boolean {
  // Admin and Master Trainer can view all
  if (userRole === 'admin' || userRole === 'master_trainer') {
    return true;
  }

  // Trainer can view prospects in their managed groups
  if (userRole === 'trainer' && managedGroupIds?.includes(prospect.groupId)) {
    return true;
  }

  // Group leader and agent can only view their own prospects
  if (
    (userRole === 'group_leader' || userRole === 'agent') &&
    prospect.uid === userId
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate total ACE from products sold
 */
function calculateTotalACE(
  productsSold: Array<{ productName: string; aceAmount: number }>,
): number {
  return productsSold.reduce((sum, product) => sum + product.aceAmount, 0);
}

/******************************************************************************
                            Controller Functions
******************************************************************************/

/**
 * Create a new prospect (prospect stage)
 * POST /prospects
 */
export async function createProspect(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const body = req.body as CreateProspectRequest;

    // Validate required fields
    if (!body.prospectName || body.prospectName.trim().length < 2) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'prospectName is required and must be at least 2 characters',
      });
      return;
    }

    if (!body.prospectEmail || !isValidEmail(body.prospectEmail)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Valid prospectEmail is required',
      });
      return;
    }

    if (!body.prospectPhone || body.prospectPhone.trim().length === 0) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'prospectPhone is required',
      });
      return;
    }

    // Only agents and group leaders can create prospects
    if (req.user.role !== 'agent' && req.user.role !== 'group_leader') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only agents and group leaders can create prospects',
      });
      return;
    }

    // Create prospect record
    const now = Timestamp.now();
    const prospectData = {
      // Stage tracking
      currentStage: 'prospect' as const,
      stageHistory: [
        {
          stage: 'prospect',
          enteredAt: now,
        },
      ],

      // Agent info (denormalized)
      uid: req.user.uid, // Firebase Auth UID (for permissions)
      agentCode: req.user.agentCode, // Agent code (e.g., "A001")
      agentName: req.user.name,
      agentEmail: req.user.email,
      groupId: req.user.groupId,
      groupName: req.user.groupName,

      // Prospect data
      prospectName: body.prospectName.trim(),
      prospectEmail: body.prospectEmail.trim().toLowerCase(),
      prospectPhone: body.prospectPhone.trim(),
      prospectEnteredAt: now,

      // Metadata
      createdAt: now,
      updatedAt: now,
    };

    const prospectId = await createProspectRecord(prospectData);

    res.status(HttpStatusCodes.CREATED).json({
      success: true,
      prospectId,
      message: 'Prospect created successfully',
    });
  } catch (error) {
    console.error('Error creating prospect:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to create prospect',
    });
  }
}

/**
 * Get current user's prospects
 * GET /prospects/my-prospects
 */
export async function getMyProspects(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const limitParam = req.query.limit;
    const limit =
      limitParam && typeof limitParam === 'string'
        ? parseInt(limitParam, 10)
        : undefined;

    const prospects = await getProspectsByAgent(req.user.agentCode, limit);

    res.status(HttpStatusCodes.OK).json({
      prospects,
    });
  } catch (error) {
    console.error('Error fetching my prospects:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch prospects',
    });
  }
}

/**
 * Get a specific prospect by ID
 * GET /prospects/:id
 */
export async function getProspect(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const prospectId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!prospectId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Prospect ID is required',
      });
      return;
    }

    // Fetch prospect record
    const prospect = await getProspectById(prospectId);

    if (!prospect) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Prospect not found',
      });
      return;
    }

    // Check permissions
    if (
      !canViewProspect(prospect, req.user.uid, req.user.role, req.user.groupId, req.user.managedGroupIds)
    ) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view this prospect',
      });
      return;
    }

    res.status(HttpStatusCodes.OK).json({
      prospect,
    });
  } catch (error) {
    console.error('Error fetching prospect:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch prospect',
    });
  }
}

/**
 * Update a prospect
 * PUT /prospects/:id
 */
export async function updateProspect(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const prospectId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!prospectId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Prospect ID is required',
      });
      return;
    }

    const body = req.body as UpdateProspectRequest;

    // Fetch existing prospect
    const existingProspect = await getProspectById(prospectId);

    if (!existingProspect) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Prospect not found',
      });
      return;
    }

    // Check permissions - only the agent who created the prospect or admin can update
    if (req.user.role !== 'admin' && existingProspect.uid !== req.user.uid) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to update this prospect',
      });
      return;
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    // Handle stage transitions
    if (body.currentStage) {
      const validStages = ['prospect', 'appointment', 'sales_outcome'];
      if (!validStages.includes(body.currentStage)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'Invalid stage value',
        });
        return;
      }

      updateData.currentStage = body.currentStage;

      // Add to stage history if transitioning to a new stage
      if (body.currentStage !== existingProspect.currentStage) {
        updateData.stageHistory = [
          ...existingProspect.stageHistory,
          {
            stage: body.currentStage,
            enteredAt: Timestamp.now(),
          },
        ];
      }

      // Handle appointment stage
      if (body.currentStage === 'appointment') {
        if (!body.appointmentDate) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'appointmentDate is required for appointment stage',
          });
          return;
        }

        updateData.appointmentDate = Timestamp.fromDate(
          new Date(body.appointmentDate),
        );
        updateData.appointmentStatus = body.appointmentStatus || 'not_done';
        updateData.location = body.location || null;

        // Set appointmentCompletedAt if status is completed and not already set
        if (
          body.appointmentStatus === 'completed' &&
          !existingProspect.appointmentCompletedAt
        ) {
          updateData.appointmentCompletedAt = Timestamp.now();
        }

        if (body.salesPartsCompleted) {
          updateData.salesPartsCompleted = body.salesPartsCompleted;
        }
      }

      // Handle sales stage
      if (body.currentStage === 'sales_outcome') {
        if (body.salesOutcome) {
          if (!['successful', 'unsuccessful'].includes(body.salesOutcome)) {
            res.status(HttpStatusCodes.BAD_REQUEST).json({
              error: 'salesOutcome must be "successful" or "unsuccessful"',
            });
            return;
          }

          updateData.salesOutcome = body.salesOutcome;

          // Validate based on outcome
          if (body.salesOutcome === 'unsuccessful') {
            if (!body.unsuccessfulReason) {
              res.status(HttpStatusCodes.BAD_REQUEST).json({
                error:
                  'unsuccessfulReason is required when salesOutcome is "unsuccessful"',
              });
              return;
            }
            updateData.unsuccessfulReason = body.unsuccessfulReason;
          } else if (body.salesOutcome === 'successful') {
            if (!body.productsSold || body.productsSold.length === 0) {
              res.status(HttpStatusCodes.BAD_REQUEST).json({
                error:
                  'productsSold is required when salesOutcome is "successful"',
              });
              return;
            }
            updateData.productsSold = body.productsSold;
            updateData.totalACE = calculateTotalACE(body.productsSold);
          }

          // Only set salesCompletedAt if not already set (preserve original completion time)
          if (!existingProspect.salesCompletedAt) {
            updateData.salesCompletedAt = Timestamp.now();
          }
        }
      }
    } else {
      // Update individual fields without changing stage
      if (body.appointmentDate !== undefined) {
        updateData.appointmentDate = Timestamp.fromDate(
          new Date(body.appointmentDate),
        );
      }

      if (body.appointmentStatus !== undefined) {
        const validStatuses = [
          'not_done',
          'scheduled',
          'rescheduled',
          'completed',
          'declined',
          'kiv',
        ];
        if (!validStatuses.includes(body.appointmentStatus)) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Invalid appointmentStatus value',
          });
          return;
        }
        updateData.appointmentStatus = body.appointmentStatus;
        updateData.location = body.location || null;

        // Only set appointmentCompletedAt if not already set (preserve original completion time)
        if (
          body.appointmentStatus === 'completed' &&
          !existingProspect.appointmentCompletedAt
        ) {
          updateData.appointmentCompletedAt = Timestamp.now();
        }
      }

      if (body.salesPartsCompleted !== undefined) {
        updateData.salesPartsCompleted = body.salesPartsCompleted;
      }

      if (body.productsSold !== undefined) {
        updateData.productsSold = body.productsSold;
        updateData.totalACE = calculateTotalACE(body.productsSold);
      }

      if (body.salesOutcome !== undefined) {
        if (
          !['successful', 'unsuccessful', 'kiv'].includes(body.salesOutcome)
        ) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error:
              'salesOutcome must be "successful", "unsuccessful", or "kiv"',
          });
          return;
        }
        updateData.salesOutcome = body.salesOutcome;
      }

      if (body.unsuccessfulReason !== undefined) {
        updateData.unsuccessfulReason = body.unsuccessfulReason;
      }
    }

    // Update the prospect record
    await updateProspectRecord(prospectId, updateData);

    res.status(HttpStatusCodes.OK).json({
      success: true,
      message: 'Prospect updated successfully',
    });
  } catch (error) {
    console.error('Error updating prospect:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to update prospect',
    });
  }
}

/**
 * Get all prospects (admin only)
 * GET /admin/all-prospects
 */
export async function getAdminAllProspects(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    // Only admins can access this
    if (req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Admin access required',
      });
      return;
    }

    const limitParam = req.query.limit;
    const limit =
      limitParam && typeof limitParam === 'string'
        ? parseInt(limitParam, 10)
        : undefined;

    const prospects = await getAllProspects(limit);

    res.status(HttpStatusCodes.OK).json({
      prospects,
    });
  } catch (error) {
    console.error('Error fetching all prospects:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch prospects',
    });
  }
}

/**
 * Get group prospects (group_leader/admin only)
 * GET /prospects/group/:groupId
 */
export async function getGroupProspects(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const groupId = Array.isArray(req.params.groupId)
      ? req.params.groupId[0]
      : req.params.groupId;

    if (!groupId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Group ID is required',
      });
      return;
    }

    // Check permissions
    const role = req.user.role;

    if (role === 'agent' || role === 'group_leader') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view group prospects',
      });
      return;
    }

    // Trainer can only view their managed groups
    if (
      role === 'trainer' &&
      !req.user.managedGroupIds?.includes(groupId)
    ) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: "You do not have permission to view this group's prospects",
      });
      return;
    }

    // admin and master_trainer can view any group

    // Admin can view any group
    const limitParam = req.query.limit;
    const limit =
      limitParam && typeof limitParam === 'string'
        ? parseInt(limitParam, 10)
        : undefined;

    const prospects = await getProspectsByGroup(groupId, limit);

    res.status(HttpStatusCodes.OK).json({
      prospects,
    });
  } catch (error) {
    console.error('Error fetching group prospects:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch group prospects',
    });
  }
}

/**
 * Delete a prospect (admin only)
 * DELETE /admin/prospects/:id
 */
export async function deleteProspect(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const prospectId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!prospectId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Prospect ID is required',
      });
      return;
    }

    const prospect = await getProspectById(prospectId);

    if (!prospect) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Prospect not found',
      });
      return;
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = prospect.uid === req.user.uid;

    if (!isAdmin && !isOwner) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to delete this prospect',
      });
      return;
    }

    await deleteProspectRecord(prospectId);

    console.log(`[AUDIT] User ${req.user.uid} (${req.user.role}) deleted prospect ${prospectId}`);

    res.status(HttpStatusCodes.OK).json({
      success: true,
      message: 'Prospect deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting prospect:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to delete prospect',
    });
  }
}

/******************************************************************************
                            Export
******************************************************************************/

export default {
  createProspect,
  getMyProspects,
  getProspect,
  updateProspect,
  deleteProspect,
  getAdminAllProspects,
  getGroupProspects,
};
