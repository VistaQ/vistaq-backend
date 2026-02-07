/**
 * Sales Controller - Handle sales management operations
 */
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import {
  createSaleRecord,
  getAllSales,
  getSaleById,
  getSalesByAgent,
  getSalesByGroup,
  updateSaleRecord,
} from '@src/services/firestoreService';
import { CreateSaleRequest, UpdateSaleRequest } from '@src/types/sales.types';

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
 * Check if user has permission to view a sale
 */
function canViewSale(
  sale: { agentId: string; groupId: string },
  userId: string,
  userRole: string,
  userGroupId: string,
): boolean {
  // Admin can view all
  if (userRole === 'admin') {
    return true;
  }

  // Manager can view their group's sales
  if (userRole === 'manager' && sale.groupId === userGroupId) {
    return true;
  }

  // Agent can view their own sales
  if (userRole === 'agent' && sale.agentId === userId) {
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
 * Create a new sale (prospect stage)
 * POST /sales
 */
export async function createSale(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const body = req.body as CreateSaleRequest;

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

    // Only agents and managers can create sales
    if (req.user.role !== 'agent' && req.user.role !== 'manager') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only agents and managers can create sales',
      });
      return;
    }

    // Create sale record
    const now = Timestamp.now();
    const saleData = {
      // Stage tracking
      currentStage: 'prospect' as const,
      stageHistory: [
        {
          stage: 'prospect',
          enteredAt: now,
        },
      ],

      // Agent info (denormalized)
      agentId: req.user.uid,
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

    const saleId = await createSaleRecord(saleData);

    res.status(HttpStatusCodes.CREATED).json({
      success: true,
      saleId,
      message: 'Sale created successfully',
    });
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to create sale',
    });
  }
}

/**
 * Get current user's sales
 * GET /sales/my-sales
 */
export async function getMySales(req: Request, res: Response): Promise<void> {
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

    const sales = await getSalesByAgent(req.user.uid, limit);

    res.status(HttpStatusCodes.OK).json({
      sales,
    });
  } catch (error) {
    console.error('Error fetching my sales:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch sales',
    });
  }
}

/**
 * Get a specific sale by ID
 * GET /sales/:id
 */
export async function getSale(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!saleId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Sale ID is required',
      });
      return;
    }

    // Fetch sale record
    const sale = await getSaleById(saleId);

    if (!sale) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Sale not found',
      });
      return;
    }

    // Check permissions
    if (!canViewSale(sale, req.user.uid, req.user.role, req.user.groupId)) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view this sale',
      });
      return;
    }

    res.status(HttpStatusCodes.OK).json({
      sale,
    });
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch sale',
    });
  }
}

/**
 * Update a sale
 * PUT /sales/:id
 */
export async function updateSale(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!saleId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Sale ID is required',
      });
      return;
    }

    const body = req.body as UpdateSaleRequest;

    // Fetch existing sale
    const existingSale = await getSaleById(saleId);

    if (!existingSale) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Sale not found',
      });
      return;
    }

    // Check permissions - only the agent who created the sale or admin can update
    if (req.user.role !== 'admin' && existingSale.agentId !== req.user.uid) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to update this sale',
      });
      return;
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    // Handle stage transitions
    if (body.currentStage) {
      const validStages = ['prospect', 'appointment', 'sales'];
      if (!validStages.includes(body.currentStage)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'Invalid stage value',
        });
        return;
      }

      updateData.currentStage = body.currentStage;

      // Add to stage history if transitioning to a new stage
      if (body.currentStage !== existingSale.currentStage) {
        updateData.stageHistory = [
          ...existingSale.stageHistory,
          {
            stage: body.currentStage,
            enteredAt: Timestamp.now(),
          },
        ];
      }

      // Handle appointment stage
      if (body.currentStage === 'appointment') {
        if (!body.appointmentDate || !body.appointmentTime) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error:
              'appointmentDate and appointmentTime are required for appointment stage',
          });
          return;
        }

        updateData.appointmentDate = Timestamp.fromDate(
          new Date(body.appointmentDate),
        );
        updateData.appointmentTime = body.appointmentTime;
        updateData.appointmentStatus = body.appointmentStatus || 'not_done';

        // Set appointmentCompletedAt if status is completed and not already set
        if (
          body.appointmentStatus === 'completed' &&
          !existingSale.appointmentCompletedAt
        ) {
          updateData.appointmentCompletedAt = Timestamp.now();
        }
      }

      // Handle sales stage
      if (body.currentStage === 'sales') {
        if (body.salesPartsCompleted) {
          updateData.salesPartsCompleted = body.salesPartsCompleted;
        }

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
          if (!existingSale.salesCompletedAt) {
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

      if (body.appointmentTime !== undefined) {
        updateData.appointmentTime = body.appointmentTime;
      }

      if (body.appointmentStatus !== undefined) {
        const validStatuses = ['not_done', 'completed', 'declined', 'kiv'];
        if (!validStatuses.includes(body.appointmentStatus)) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Invalid appointmentStatus value',
          });
          return;
        }
        updateData.appointmentStatus = body.appointmentStatus;

        // Only set appointmentCompletedAt if not already set (preserve original completion time)
        if (
          body.appointmentStatus === 'completed' &&
          !existingSale.appointmentCompletedAt
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
        if (!['successful', 'unsuccessful'].includes(body.salesOutcome)) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'salesOutcome must be "successful" or "unsuccessful"',
          });
          return;
        }
        updateData.salesOutcome = body.salesOutcome;
      }

      if (body.unsuccessfulReason !== undefined) {
        updateData.unsuccessfulReason = body.unsuccessfulReason;
      }
    }

    // Update the sale record
    await updateSaleRecord(saleId, updateData);

    res.status(HttpStatusCodes.OK).json({
      success: true,
      message: 'Sale updated successfully',
    });
  } catch (error) {
    console.error('Error updating sale:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to update sale',
    });
  }
}

/**
 * Get all sales (admin only)
 * GET /admin/all-sales
 */
export async function getAdminAllSales(
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

    const sales = await getAllSales(limit);

    res.status(HttpStatusCodes.OK).json({
      sales,
    });
  } catch (error) {
    console.error('Error fetching all sales:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch sales',
    });
  }
}

/**
 * Get group sales (manager/admin only)
 * GET /sales/group/:groupId
 */
export async function getGroupSales(
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
    if (req.user.role === 'agent') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view group sales',
      });
      return;
    }

    // Manager can only view their own group
    if (req.user.role === 'manager' && req.user.groupId !== groupId) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: "You do not have permission to view this group's sales",
      });
      return;
    }

    // Admin can view any group
    const limitParam = req.query.limit;
    const limit =
      limitParam && typeof limitParam === 'string'
        ? parseInt(limitParam, 10)
        : undefined;

    const sales = await getSalesByGroup(groupId, limit);

    res.status(HttpStatusCodes.OK).json({
      sales,
    });
  } catch (error) {
    console.error('Error fetching group sales:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch group sales',
    });
  }
}

/******************************************************************************
                            Export
******************************************************************************/

export default {
  createSale,
  getMySales,
  getSale,
  updateSale,
  getAdminAllSales,
  getGroupSales,
};
