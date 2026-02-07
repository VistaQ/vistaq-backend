/**
 * Firestore Service - Helper functions for database operations
 */

import { db } from '@src/config/firebase';
import { SaleRecord } from '@src/types/sales.types';

const SALES_COLLECTION = 'sales_records';

/******************************************************************************
                            Sale Record Operations
******************************************************************************/

/**
 * Get a single sale record by ID
 * @param saleId - The ID of the sale record
 * @returns Sale record with id, or null if not found
 */
export async function getSaleById(
  saleId: string,
): Promise<SaleRecord | null> {
  try {
    const saleDoc = await db.collection(SALES_COLLECTION).doc(saleId).get();

    if (!saleDoc.exists) {
      return null;
    }

    return {
      id: saleDoc.id,
      ...saleDoc.data(),
    } as SaleRecord;
  } catch (error) {
    console.error('Error fetching sale by ID:', error);
    throw new Error('Failed to fetch sale record');
  }
}

/**
 * Get all sales for a specific agent
 * @param agentId - The ID of the agent
 * @param limit - Optional limit on number of records (default: no limit)
 * @returns Array of sale records
 */
export async function getSalesByAgent(
  agentId: string,
  limit?: number,
): Promise<SaleRecord[]> {
  try {
    let query = db
      .collection(SALES_COLLECTION)
      .where('agentId', '==', agentId)
      .orderBy('createdAt', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SaleRecord[];
  } catch (error) {
    console.error('Error fetching sales by agent:', error);
    throw new Error('Failed to fetch sales for agent');
  }
}

/**
 * Get all sales for a specific group
 * @param groupId - The ID of the group
 * @param limit - Optional limit on number of records (default: no limit)
 * @returns Array of sale records
 */
export async function getSalesByGroup(
  groupId: string,
  limit?: number,
): Promise<SaleRecord[]> {
  try {
    let query = db
      .collection(SALES_COLLECTION)
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SaleRecord[];
  } catch (error) {
    console.error('Error fetching sales by group:', error);
    throw new Error('Failed to fetch sales for group');
  }
}

/**
 * Get all sales (admin only)
 * @param limit - Optional limit on number of records (default: no limit)
 * @returns Array of sale records
 */
export async function getAllSales(limit?: number): Promise<SaleRecord[]> {
  try {
    let query = db
      .collection(SALES_COLLECTION)
      .orderBy('createdAt', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SaleRecord[];
  } catch (error) {
    console.error('Error fetching all sales:', error);
    throw new Error('Failed to fetch all sales');
  }
}

/**
 * Create a new sale record
 * @param saleData - The sale data to create
 * @returns The ID of the created document
 */
export async function createSaleRecord(
  saleData: Partial<SaleRecord>,
): Promise<string> {
  try {
    const docRef = await db.collection(SALES_COLLECTION).add(saleData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating sale record:', error);
    throw new Error('Failed to create sale record');
  }
}

/**
 * Update an existing sale record
 * @param saleId - The ID of the sale to update
 * @param updateData - The data to update
 * @returns Success status
 */
export async function updateSaleRecord(
  saleId: string,
  updateData: Partial<SaleRecord>,
): Promise<boolean> {
  try {
    await db.collection(SALES_COLLECTION).doc(saleId).update(updateData);
    return true;
  } catch (error) {
    console.error('Error updating sale record:', error);
    throw new Error('Failed to update sale record');
  }
}
