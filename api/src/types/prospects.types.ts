/**
 * Prospects Management System Types
 */
import { Timestamp } from 'firebase-admin/firestore';

export interface ProspectRecord {
  id?: string;

  // Stage tracking
  currentStage: 'prospect' | 'appointment' | 'sales';
  stageHistory: Array<{
    stage: string;
    enteredAt: Timestamp;
  }>;

  // Agent info (denormalized)
  uid: string; // Firebase Auth UID (for permissions)
  agentCode: string; // Agent code (e.g., "A001")
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

export interface CreateProspectRequest {
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
}

export interface UpdateProspectRequest {
  // Appointment fields
  appointmentDate?: string;
  appointmentStatus?: string;
  location?: string;

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

export interface CreateProspectResponse {
  success: boolean;
  prospectId: string;
  message?: string;
}

export interface GetProspectsResponse {
  prospects: ProspectRecord[];
}

export interface GetProspectResponse {
  prospect: ProspectRecord;
}

export interface UpdateProspectResponse {
  success: boolean;
  message?: string;
}
