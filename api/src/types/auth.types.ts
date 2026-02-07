/**
 * Authentication-related TypeScript types
 */

export interface User {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  groupId: string;
  groupName: string;
  agentId: string;
  agency: string;
  location: string;
  totalPoints: number;
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  currentBadge: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'manager' | 'agent' | 'viewer';

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
    agentId: string;
    agency: string;
    location: string;
  };
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  groupId: string;
  groupName: string;
  agentId: string;
  agency: string;
  location: string;
}

export interface CreateUserResponse {
  success: boolean;
  userId: string;
  message: string;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
