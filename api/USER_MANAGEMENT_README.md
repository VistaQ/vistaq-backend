# User Management System - Quick Start

## Overview

A comprehensive user management system with role-based access control for the backend API.

## Files

```
api/
├── src/
│   ├── controllers/
│   │   ├── AuthController.ts              # Login, register, and admin create-user
│   │   └── userController.ts              # User management operations
│   ├── types/
│   │   ├── auth.types.ts                  # User, role, and auth request/response types
│   │   └── user.types.ts                  # User management types
│   └── routes/
│       └── index.ts                       # All API route definitions
├── USER_MANAGEMENT_SETUP.md               # Detailed setup guide
├── USER_API_DOCUMENTATION.md             # Complete API reference
└── USER_MANAGEMENT_README.md             # This file
```

## Quick Reference

### API Endpoints

#### Public (no authentication required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email and password |
| POST | `/api/auth/register` | Agent self-registration |

#### Protected (authentication required)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | All | Get current user profile |
| GET | `/api/users/:userId` | Restricted | Get user by ID |
| GET | `/api/users` | Admin/Trainer | Get all users (with filters) |
| GET | `/api/users/group/:groupId` | Restricted | Get users by group |
| PUT | `/api/users/:userId` | Self/Admin | Update user |

#### Admin only

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/users` | Create a new user |
| PATCH | `/api/admin/users/:userId/status` | Update user status |
| DELETE | `/api/admin/users/:userId` | Delete user |

### Key Features

**Role-Based Access Control**
- Admin: Full access to all users
- Trainer/Master Trainer: Access to users in managed groups
- Group Leader: Access to users in own group
- Agent: Access to own profile only

**Self-Service Updates**
- Users can update their own name, phone, and location
- Admin can update all fields including role, email, agency, and status. Group assignment is handled via the Group API.

**Firebase Auth Integration**
- Status changes sync with Firebase Auth (enable/disable account)
- User deletion removes from both Firestore and Firebase Auth
- Accounts are created with `emailVerified: true`

**Cascade Operations**
- Deleting a user removes them from their group's memberIds
- Promoting a user to group_leader updates the group's leaderId, leaderName, leaderEmail
- Demoting a group_leader to agent clears the group's leadership fields
- Protects against deleting trainers who still manage groups
- Group assignment (groupId) is handled exclusively via the Group API (`PUT /admin/groups/:groupId`)

**Auto-assigned Permissions**
Permissions are automatically set based on role at creation time:

| Role | Permissions |
|------|-------------|
| admin | `['*']` |
| master_trainer / trainer | `['view_managed_groups', 'view_managed_sales', 'view_managed_users']` |
| group_leader | `['view_own_group', 'view_team_sales', 'create_sales', 'view_own_sales']` |
| agent | `['create_sales', 'view_own_sales']` |

**Audit Logging**
- All admin actions are logged
- Format: `[AUDIT] Admin {adminId} {action} user {userId}`

### Permission Matrix

| Action | Admin | Trainer | Group Leader | Agent |
|--------|-------|---------|--------------|-------|
| View any user | Yes | Yes (managed groups) | Yes (own group) | Self only |
| View all users | Yes | Yes (managed groups) | No | No |
| Update any user | Yes | No | No | No |
| Update self (limited) | Yes | Yes | Yes | Yes |
| Change status | Yes | No | No | No |
| Delete user | Yes | No | No | No |
| Create user | Yes | No | No | No |

## Create User (`POST /api/admin/users`)

Admin-only endpoint. Creates a Firebase Auth account and Firestore user document.

### Request Body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Must be unique |
| `password` | string | Yes | Minimum 6 characters |
| `name` | string | Yes | |
| `role` | string | Yes | See roles below |
| `agentCode` | string | Conditional | Required for `agent` and `group_leader`; always supplied by the client, never auto-generated |
| `agency` | string | No | |
| `location` | string | No | |
| `phone` | string | No | |

All users are created with `groupId: null`. Group assignment is done via the Group API (`PUT /admin/groups/:groupId`) after user creation.

### Role / Field Rules

| Role | agentCode |
|------|-----------|
| admin | not allowed |
| master_trainer | not allowed |
| trainer | not allowed |
| group_leader | required |
| agent | required |

### Validation Errors

- `"Agents and group leaders must have an agent code"`

### Response

```json
{
  "success": true,
  "userId": "<uid>",
  "agentCode": "<agentCode>",
  "message": "User created successfully"
}
```

`agentCode` is only included in the response for `agent` and `group_leader` roles.

## Agent Self-Registration (`POST /api/auth/register`)

Public endpoint — no authentication required. Creates an `agent` account and returns an ID token for immediate login.

### Request Body

| Field | Type | Required |
|-------|------|----------|
| `fullName` | string | Yes (min 2 characters) |
| `agentCode` | string | Yes (must be unique) |
| `email` | string | Yes |
| `password` | string | Yes (min 6 characters) |
| `groupId` | string | Yes |
| `acknowledged` | boolean | Yes |

## Common Use Cases

### 1. User Views Their Own Profile
```bash
GET /api/users/me
Authorization: Bearer <user-token>
```

### 2. Admin Views All Active Agents
```bash
GET /api/users?role=agent&status=active
Authorization: Bearer <admin-token>
```

### 3. Trainer Views Users in Their Groups
```bash
GET /api/users
Authorization: Bearer <trainer-token>
# Automatically filtered to trainer's managed groups
```

### 4. Group Leader Views Team Members
```bash
GET /api/users/group/{groupId}
Authorization: Bearer <leader-token>
```

### 5. User Updates Their Profile
```bash
PUT /api/users/{userId}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+60123456789",
  "location": "Kuala Lumpur"
}
```

### 6. Admin Assigns User to Group

Group assignment is handled exclusively via the Group API, not the User API:

```bash
PUT /api/admin/groups/{groupId}
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "memberIds": ["existing-uid-1", "existing-uid-2", "new-user-uid"]
}
# groupId and groupName are automatically updated on the user document
```

### 7. Admin Changes User Role
```bash
PUT /api/users/{userId}
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "role": "group_leader"
}
```

### 8. Admin Creates a New Agent
```bash
POST /api/admin/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "email": "agent@example.com",
  "password": "secret123",
  "name": "Jane Smith",
  "role": "agent",
  "agentCode": "AG-001"
}
# User is created unassigned. Assign to a group via PUT /api/admin/groups/:groupId
```

### 9. Admin Deactivates User
```bash
PATCH /api/admin/users/{userId}/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "inactive"
}
# Also disables Firebase Auth account
```

### 10. Admin Deletes User
```bash
DELETE /api/admin/users/{userId}
Authorization: Bearer <admin-token>
# Removes from Firestore, Firebase Auth, and group memberIds
```

## Validation Rules

**Create User (`POST /api/admin/users`):**
- `email`, `password`, `name`, `role` are required
- `password`: Minimum 6 characters
- `role`: Must be one of `admin`, `master_trainer`, `trainer`, `group_leader`, `agent`
- `agentCode`: Required and non-empty for `agent` and `group_leader`; always provided by the client
- All users are created with `groupId: null`; group assignment is done via the Group API after creation

**Update User (`PUT /api/users/:userId`):**
- `name`: Minimum 2 characters
- `phone`: Any string (no format validation)
- `email` (admin only): Valid email format; returns 409 if already in use
- `role` (admin only): Must be valid role (`admin`, `master_trainer`, `trainer`, `group_leader`, `agent`)
- `status` (admin only): Must be `"active"`, `"inactive"`, or `"suspended"`
- `groupId` is not accepted — use the Group API for group assignment

**Update Status (`PATCH /api/admin/users/:userId/status`):**
- `status`: Must be `"active"` or `"inactive"`

**Delete User:**
- Cannot delete self
- Cannot delete trainer/master_trainer who still has managed groups

## Error Codes

- `200 OK`: Success
- `201 Created`: User created successfully
- `400 Bad Request`: Invalid data or validation error
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User or group not found
- `409 Conflict`: Email already exists
- `429 Too Many Requests`: Too many failed login attempts
- `500 Internal Server Error`: Server error

## Security Features

1. **JWT Authentication**: All protected endpoints require a valid Firebase ID token
2. **Role Verification**: Permissions checked on every request
3. **Self-Service Limits**: Non-admin users can only update name, phone, and location
4. **Group Isolation**: Trainers can only see their managed groups
5. **Audit Trail**: All admin actions are logged
6. **Cascade Protection**: Cannot delete trainers with assigned groups
7. **emailVerified**: All accounts created via the API have `emailVerified: true`

## Testing

Start your server and test with cURL or Postman:

```bash
# Get your profile
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/users/me

# Admin: Get all users
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3000/api/users

# Update your profile
curl -X PUT \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "phone": "+60123456789"}' \
  http://localhost:3000/api/users/<your-user-id>

# Admin: Create a new agent
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"pass123","name":"Alice","role":"agent","agentCode":"AG-001"}' \
  http://localhost:3000/api/admin/users
```

## Next Steps

1. User management system is ready to use
2. Test endpoints with your authentication tokens
3. Verify permissions work as expected for different roles
4. Consider implementing:
   - Batch user operations
   - User search functionality
   - Export to CSV/Excel
   - Email notifications on status changes
   - Activity history tracking

## Documentation

- **Setup Guide**: `USER_MANAGEMENT_SETUP.md` - Detailed implementation guide
- **API Docs**: `USER_API_DOCUMENTATION.md` - Complete API reference with examples
- **This File**: Quick reference and common patterns

## Support

For issues or questions:
1. Check error messages in server logs
2. Review the API documentation
3. Verify authentication token is valid
4. Ensure user has required role/permissions

## License

Part of the Vistaq Backend API project.
