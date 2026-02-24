/**
 * User Management TypeScript types
 */

import { Timestamp } from 'firebase-admin/firestore';
import { UserRole, UserStatus } from './auth.types';

export interface UpdateUserRequest {
  // Basic info (all users can update for themselves)
  name?: string;
  phone?: string;
  location?: string;

  // Admin only fields
  email?: string;
  agency?: string;
  role?: UserRole;
  status?: UserStatus;
  password?: string;
}

export interface UpdateUserStatusRequest {
  status: 'active' | 'inactive';
}

export interface GetUsersQuery {
  role?: string;
  groupId?: string;
  status?: string;
  limit?: string;
}

export interface GetUsersResponse {
  users: UserData[];
  count: number;
}

export interface GetUsersByGroupResponse {
  users: UserData[];
  groupName: string;
}

export interface UserData {
  uid: string;
  email: string;
  name: string;
  phone: string;
  location: string;
  agency: string;

  role: UserRole;
  permissions: string[];

  groupId: string | null;
  groupName: string | null;

  agentCode: string | null;
  managedGroupIds?: string[] | null;

  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  totalPoints: number;
  currentBadge: string;
  currentBadgeColor?: string;

  status: UserStatus;

  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface UpdateUserResponse {
  success: boolean;
  message: string;
}

export interface DeleteUserResponse {
  success: boolean;
  message: string;
}
