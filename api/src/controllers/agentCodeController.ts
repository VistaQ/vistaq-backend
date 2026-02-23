/**
 * Agent Code Controller - Handle agent code management operations
 */
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { db } from '@src/config/firebase';
import {
  UpsertAgentCodesRequest,
} from '@src/types/agentCodes.types';

const Timestamp = admin.firestore.Timestamp;

const AGENT_CODES_COLLECTION = 'agentCodes';
const BATCH_LIMIT = 500;

/******************************************************************************
                            Controller Functions
******************************************************************************/

/**
 * Upsert a list of agent codes (admin only)
 * POST /admin/agent-codes
 */
export async function upsertAgentCodes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const body = req.body as UpsertAgentCodesRequest;

    if (!Array.isArray(body.codes) || body.codes.length === 0) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'codes must be a non-empty array',
      });
      return;
    }

    // Normalise: trim, filter blanks, de-duplicate
    const normalised = [
      ...new Set(
        body.codes
          .map((c) => (typeof c === 'string' ? c.trim() : ''))
          .filter((c) => c.length > 0),
      ),
    ];

    if (normalised.length === 0) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'codes must contain at least one non-empty string',
      });
      return;
    }

    const now = Timestamp.now();

    // Process in chunks to stay within Firestore's 500-operation batch limit
    for (let i = 0; i < normalised.length; i += BATCH_LIMIT) {
      const chunk = normalised.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const code of chunk) {
        const docRef = db.collection(AGENT_CODES_COLLECTION).doc(code);
        batch.set(docRef, { code, createdAt: now, updatedAt: now });
      }

      await batch.commit();
    }

    res.status(HttpStatusCodes.OK).json({
      success: true,
      upsertedCount: normalised.length,
      message: 'Agent codes upserted successfully',
    });
  } catch (error) {
    console.error('Error upserting agent codes:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to upsert agent codes',
    });
  }
}

/**
 * Get all agent codes (public)
 * GET /agent-codes
 */
export async function getAgentCodes(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const snapshot = await db
      .collection(AGENT_CODES_COLLECTION)
      .orderBy('code')
      .get();

    const agentCodes = snapshot.docs.map((doc) => doc.data().code as string);

    res.status(HttpStatusCodes.OK).json({ agentCodes });
  } catch (error) {
    console.error('Error fetching agent codes:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch agent codes',
    });
  }
}

/******************************************************************************
                            Export
******************************************************************************/

export default { upsertAgentCodes, getAgentCodes };
