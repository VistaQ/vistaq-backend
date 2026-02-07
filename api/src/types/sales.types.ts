/**
 * Sales Management System Types
 */

import { Timestamp } from 'firebase-admin/firestore';

export interface SaleRecord {
  id?: string;

  // Stage tracking
  currentStage: 'prospect' | 'appointment' | 'sales';
  stageHistory: Array<{
    stage: string;
    enteredAt: Timestamp;
  }>;

  // Agent info (denormalized)
  agentId: string;
  agentName: string;
  agentEmail: string;
  groupId: string;
  groupName: string;

  // Prospect stage
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  prospectEnteredAt?: Timestamp;

  // Appointment stage
  appointmentDate?: Timestamp;
  appointmentTime?: string;
  appointmentStatus?: 'not_done' | 'completed' | 'declined' | 'kiv';
  appointmentCompletedAt?: Timestamp;

  // Sales stage
  salesPartsCompleted?: {
    social: boolean;
    factFinding: boolean;
    presentation: boolean;
  };
  productsSold?: Array<{
    productName: string;
    aceAmount: number;
  }>;
  totalACE?: number;
  salesOutcome?: 'successful' | 'unsuccessful';
  unsuccessfulReason?: string;
  salesCompletedAt?: Timestamp;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateSaleRequest {
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
}

export interface UpdateSaleRequest {
  // Appointment fields
  appointmentDate?: string;
  appointmentTime?: string;
  appointmentStatus?: string;

  // Sales fields
  salesPartsCompleted?: {
    social: boolean;
    factFinding: boolean;
    presentation: boolean;
  };
  productsSold?: Array<{
    productName: string;
    aceAmount: number;
  }>;
  salesOutcome?: string;
  unsuccessfulReason?: string;

  // Allow updating stage
  currentStage?: string;
}

export interface CreateSaleResponse {
  success: boolean;
  saleId: string;
  message?: string;
}

export interface GetSalesResponse {
  sales: SaleRecord[];
}

export interface GetSaleResponse {
  sale: SaleRecord;
}

export interface UpdateSaleResponse {
  success: boolean;
  message?: string;
}
