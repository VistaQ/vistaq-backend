/**
 * Firestore Service - Helper functions for database operations
 */
import { db } from '@src/config/firebase';
import { ProspectRecord } from '@src/types/prospects.types';

const PROSPECTS_COLLECTION = 'prospects';

/******************************************************************************
                            Prospect Record Operations
******************************************************************************/

/**
 * Get a single prospect record by ID
 * @param prospectId - The ID of the prospect record
 * @returns Prospect record with id, or null if not found
 */
export async function getProspectById(
  prospectId: string,
): Promise<ProspectRecord | null> {
  try {
    const prospectDoc = await db
      .collection(PROSPECTS_COLLECTION)
      .doc(prospectId)
      .get();

    if (!prospectDoc.exists) {
      return null;
    }

    return {
      id: prospectDoc.id,
      ...prospectDoc.data(),
    } as ProspectRecord;
  } catch (error) {
    console.error('Error fetching prospect by ID:', error);
    throw new Error('Failed to fetch prospect record');
  }
}

/**
 * Get all prospects for a specific agent
 * @param agentCode - The agent code
 * @param limit - Optional limit on number of records (default: no limit)
 * @returns Array of prospect records
 */
export async function getProspectsByAgent(
  agentCode: string,
  limit?: number,
): Promise<ProspectRecord[]> {
  try {
    let query = db
      .collection(PROSPECTS_COLLECTION)
      .where('agentCode', '==', agentCode)
      .orderBy('createdAt', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ProspectRecord[];
  } catch (error) {
    console.error('Error fetching prospects by agent:', error);
    throw new Error('Failed to fetch prospects for agent');
  }
}

/**
 * Get all prospects for a specific group
 * @param groupId - The ID of the group
 * @param limit - Optional limit on number of records (default: no limit)
 * @returns Array of prospect records
 */
export async function getProspectsByGroup(
  groupId: string,
  limit?: number,
): Promise<ProspectRecord[]> {
  try {
    let query = db
      .collection(PROSPECTS_COLLECTION)
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ProspectRecord[];
  } catch (error) {
    console.error('Error fetching prospects by group:', error);
    throw new Error('Failed to fetch prospects for group');
  }
}

/**
 * Get all prospects (admin only)
 * @param limit - Optional limit on number of records (default: no limit)
 * @returns Array of prospect records
 */
export async function getAllProspects(
  limit?: number,
): Promise<ProspectRecord[]> {
  try {
    let query = db
      .collection(PROSPECTS_COLLECTION)
      .orderBy('createdAt', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ProspectRecord[];
  } catch (error) {
    console.error('Error fetching all prospects:', error);
    throw new Error('Failed to fetch all prospects');
  }
}

/**
 * Create a new prospect record
 * @param prospectData - The prospect data to create
 * @returns The ID of the created document
 */
export async function createProspectRecord(
  prospectData: Partial<ProspectRecord>,
): Promise<string> {
  try {
    const docRef = await db.collection(PROSPECTS_COLLECTION).add(prospectData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating prospect record:', error);
    throw new Error('Failed to create prospect record');
  }
}

/**
 * Update an existing prospect record
 * @param prospectId - The ID of the prospect to update
 * @param updateData - The data to update
 * @returns Success status
 */
export async function updateProspectRecord(
  prospectId: string,
  updateData: Partial<ProspectRecord>,
): Promise<boolean> {
  try {
    await db
      .collection(PROSPECTS_COLLECTION)
      .doc(prospectId)
      .update(updateData);
    return true;
  } catch (error) {
    console.error('Error updating prospect record:', error);
    throw new Error('Failed to update prospect record');
  }
}
