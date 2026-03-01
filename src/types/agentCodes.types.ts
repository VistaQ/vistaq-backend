/**
 * Agent Codes Types
 */
import { Timestamp } from 'firebase-admin/firestore';

export interface AgentCode {
  code: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UpsertAgentCodesRequest {
  codes: string[];
}

export interface UpsertAgentCodesResponse {
  success: boolean;
  upsertedCount: number;
  message: string;
}

export interface GetAgentCodesResponse {
  agentCodes: string[];
}
