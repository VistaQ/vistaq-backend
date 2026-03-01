/**
 * Authentication-related TypeScript types
 */

export interface User {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  permissions?: string[];
  groupId: string;
  groupName: string;
  agentCode: string;
  agency: string;
  location: string;
  totalPoints: number;
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  currentBadge: string;
  currentBadgeColor?: string;
  status: UserStatus;
  managedGroupIds?: string[]; // For trainers - array of group IDs they manage
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole =
  | 'admin'
  | 'master_trainer'
  | 'trainer'
  | 'group_leader'
  | 'agent';

export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    uid: string;
    email: string;
    name: string;
    role: UserRole;
    groupId: string;
    groupName: string;
    agentCode: string;
    agency: string;
    location: string;
  };
}

export interface CreateUserRequest {
  email: string;
  password: string; // Temporary password set by admin
  name: string;
  role: UserRole;
  // Required for agents and group leaders
  agentCode?: string;
  // Optional profile fields
  agency?: string;
  location?: string;
  phone?: string;
}

export interface CreateUserResponse {
  success: boolean;
  userId: string;
  agentCode?: string;
  message: string;
}

export interface RegisterRequest {
  fullName: string;
  agentCode: string;
  email: string;
  password: string;
  groupId: string;
  acknowledged: boolean;
}

export interface RegisterResponse {
  success: boolean;
  token: string;
  user: {
    uid: string;
    email: string;
    name: string;
    role: string;
    groupId: string;
    groupName: string;
    agentCode: string;
  };
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
