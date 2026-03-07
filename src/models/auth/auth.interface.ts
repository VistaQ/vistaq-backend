export type UserRole =
  | 'admin'
  | 'master_trainer'
  | 'trainer'
  | 'group_leader'
  | 'agent';

export type UserStatus = 'active' | 'inactive' | 'suspended';

// IRegisterReq and IRegisterRes are defined in auth.controller.ts
// to keep them co-located with the controller that uses them.
