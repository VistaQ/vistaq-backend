/**
 * Group Management System Types
 */
import { Timestamp } from 'firebase-admin/firestore';

export interface Group {
  id: string;
  name: string;

  // Leadership (null until a leader is assigned)
  leaderId: string | null;
  leaderName: string | null;
  leaderEmail: string | null;

  // Trainers (multiple trainers can manage a group)
  trainerIds: string[];
  trainerNames: string[];

  // Members
  memberIds: string[];
  memberCount: number;

  // Performance stats (updated by Cloud Functions)
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  totalPoints: number;

  // Status
  status: 'active' | 'inactive';

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateGroupRequest {
  name: string;
  trainerIds?: string[];
  leaderId?: string;
  memberIds?: string[];
}

export interface UpdateGroupRequest {
  name?: string;
  trainerIds?: string[];
  leaderId?: string;
  memberIds?: string[];
}

export interface CreateGroupResponse {
  success: boolean;
  groupId: string;
  message: string;
}

export interface UpdateGroupResponse {
  success: boolean;
  message: string;
}

export interface DeleteGroupResponse {
  success: boolean;
  message: string;
}

export interface GetGroupResponse {
  group: Group;
  members: GroupMember[];
}

export interface GetAllGroupsResponse {
  groups: Group[];
}

export interface GroupMember {
  uid: string;
  name: string;
  email: string;
  agentCode: string;
  totalPoints: number;
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  currentBadge: string;
  status: string;
}
