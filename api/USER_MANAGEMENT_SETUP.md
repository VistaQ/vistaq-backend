# User Management System - Setup Guide

This guide explains the User Management system implementation for the backend API.

## Overview

The User Management system provides comprehensive CRUD operations for managing users with role-based access control (RBAC). Different roles have different permissions to view and manage users.

## File Structure

```
api/src/
├── controllers/
│   └── userController.ts          # User management operations
├── types/
│   ├── auth.types.ts              # Updated with phone, permissions, currentBadgeColor
│   └── user.types.ts              # User management request/response types
└── routes/
    └── router.ts                   # User routes registered
```

## Firestore Structure

### Collection: `users`

Each document ID is the Firebase Auth UID.

```typescript
{
  uid: string;                   // Firebase Auth UID (document ID)
  email: string;
  name: string;
  phone: string;
  location: string;              // Text field (e.g., "Kuala Lumpur")
  agency: string;                // Insurance company name

  role: string;                  // "admin" | "master_trainer" | "trainer" | "group_leader" | "agent"
  permissions: string[];         // Array of permission strings

  groupId: string | null;        // Reference to groups collection
  groupName: string | null;      // Denormalized for quick access

  agentCode: string | null;      // Display ID (e.g., "Agent 01"), null for non-agents

  // For trainers only
  managedGroupIds: string[] | null;  // Array of group IDs they manage

  // Performance stats (updated by Cloud Functions)
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  totalPoints: number;
  currentBadge: string;          // "Rookie", "Rising Star", etc.
  currentBadgeColor: string;     // "gray", "blue", etc.

  status: string;                // "active" | "inactive" | "suspended"

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## API Endpoints

### 1. Get Current User Profile

**Endpoint:** `GET /api/users/me`
**Authentication:** Required
**Authorization:** All authenticated users

Returns the full profile of the currently authenticated user.

**Response:**
```json
{
  "user": {
    "uid": "abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+60123456789",
    "location": "Kuala Lumpur",
    "agency": "ABC Insurance",
    "role": "agent",
    "permissions": [],
    "groupId": "group123",
    "groupName": "Team Alpha",
    "agentCode": "Agent 01",
    "managedGroupIds": null,
    "totalProspects": 10,
    "totalAppointments": 5,
    "totalSales": 2,
    "totalACE": 5000,
    "totalPoints": 150,
    "currentBadge": "Rising Star",
    "currentBadgeColor": "blue",
    "status": "active",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

### 2. Get User by ID

**Endpoint:** `GET /api/users/:userId`
**Authentication:** Required
**Authorization:**
- Admin: Can view any user
- Master Trainer / Trainer: Can view users in their managed groups
- Group Leader: Can view users in their own group
- Others: Can only view themselves

Returns a specific user by their UID.

**Response:**
```json
{
  "user": { /* UserData object */ }
}
```

### 3. Get All Users (with filters)

**Endpoint:** `GET /api/users`
**Authentication:** Required
**Authorization:**
- Admin: Can view all users
- Master Trainer / Trainer: Can view users in their managed groups only
- Others: Forbidden

**Query Parameters:**
- `role` (optional): Filter by role (e.g., "agent", "trainer")
- `groupId` (optional): Filter by group ID
- `status` (optional): Filter by status ("active" or "inactive")
- `limit` (optional): Maximum number of results (default: 100)

**Example Request:**
```
GET /api/users?role=agent&status=active&limit=50
```

**Response:**
```json
{
  "users": [
    { /* UserData object */ },
    { /* UserData object */ }
  ],
  "count": 2
}
```

**Note:** For trainers with more than 10 managed groups, only the first 10 groups will be queried due to Firestore's `in` operator limit.

### 4. Get Users by Group

**Endpoint:** `GET /api/users/group/:groupId`
**Authentication:** Required
**Authorization:**
- Admin: Can view any group's users
- Trainer: Can view if groupId is in their managedGroupIds
- Group Leader: Can view their own group only
- Others: Forbidden

Returns all users in a specific group.

**Response:**
```json
{
  "users": [
    { /* UserData object */ },
    { /* UserData object */ }
  ],
  "groupName": "Team Alpha"
}
```

### 5. Update User

**Endpoint:** `PUT /api/users/:userId`
**Authentication:** Required
**Authorization:**
- Admin: Can update any user, any field
- User updating self: Can only update name, phone, location
- Others: Forbidden

**Request Body:**

Admin can update:
```json
{
  "name": "John Doe",
  "phone": "+60123456789",
  "location": "Kuala Lumpur",
  "agency": "ABC Insurance",
  "role": "group_leader",
  "groupId": "group123",
  "status": "active"
}
```

User (self) can update:
```json
{
  "name": "John Doe",
  "phone": "+60123456789",
  "location": "Kuala Lumpur"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User updated successfully"
}
```

**Notes:**
- If `groupId` is changed, the system automatically fetches the group and updates `groupName`
- If `groupId` is set to `null`, both `groupId` and `groupName` are cleared
- Admin actions are logged for audit trail

### 6. Update User Status

**Endpoint:** `PATCH /api/users/:userId/status`
**Authentication:** Required
**Authorization:** Admin only

Updates a user's status and optionally enables/disables their Firebase Auth account.

**Request Body:**
```json
{
  "status": "inactive"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User status updated successfully"
}
```

**Notes:**
- When status is set to "inactive", the Firebase Auth account is also disabled
- When status is set to "active", the Firebase Auth account is enabled
- All status changes are logged for audit trail

### 7. Delete User

**Endpoint:** `DELETE /api/users/:userId`
**Authentication:** Required
**Authorization:** Admin only

**CAUTION:** This permanently deletes the user from both Firebase Auth and Firestore.

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Validations:**
- Cannot delete yourself
- Cannot delete a trainer with assigned groups (must reassign groups first)
- If user is in a group, they are automatically removed from the group's memberIds

**Recommendation:** Consider using `PATCH /users/:userId/status` with "inactive" instead for soft delete.

## Permission Matrix

| Endpoint | Admin | Master Trainer | Trainer | Group Leader | Agent |
|----------|-------|----------------|---------|--------------|-------|
| GET /users/me | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /users/:userId | ✅ All | ✅ Managed groups | ✅ Managed groups | ✅ Own group | ✅ Self only |
| GET /users | ✅ All | ✅ Managed groups | ✅ Managed groups | ❌ | ❌ |
| GET /users/group/:groupId | ✅ All | ✅ Managed groups | ✅ Managed groups | ✅ Own group | ❌ |
| PUT /users/:userId | ✅ All fields | ❌ | ❌ | ✅ Self (limited) | ✅ Self (limited) |
| PATCH /users/:userId/status | ✅ | ❌ | ❌ | ❌ | ❌ |
| DELETE /users/:userId | ✅ | ❌ | ❌ | ❌ | ❌ |

## Error Handling

The system returns appropriate HTTP status codes:

- **200 OK**: Successful operation
- **400 Bad Request**: Invalid data, missing required fields
- **401 Unauthorized**: Not authenticated
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: User or group not found
- **500 Internal Server Error**: Database or server errors

## Validation Rules

### Update User
- `name`: Minimum 2 characters if provided
- `phone`: Any valid string if provided
- `role`: Must be a valid role if provided
- `groupId`: Must exist in groups collection if provided

### Update Status
- `status`: Must be "active" or "inactive"

### Delete User
- Cannot delete if trainer with assigned groups
- Cannot delete self

## Logging & Audit Trail

All admin actions are logged with the prefix `[AUDIT]`:
- User updates by admin
- Status changes
- User deletions

Example log:
```
[AUDIT] Admin abc123 updated user def456: { role: 'group_leader', status: 'active' }
[AUDIT] Admin abc123 changed user def456 status to inactive
[AUDIT] Admin abc123 deleted user def456
```

## Security Considerations

1. **Role-Based Access Control**: All endpoints verify user roles and permissions
2. **Self-Service Limitations**: Non-admin users can only update limited fields for themselves
3. **Group Isolation**: Trainers can only see users in their managed groups
4. **Audit Logging**: All admin actions are logged for accountability
5. **Firebase Auth Integration**: User status changes sync with Firebase Auth disabled state
6. **Cascade Protection**: Cannot delete trainers with assigned groups

## Testing

### Example Test Scenarios

1. **Admin viewing all users**
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     http://localhost:3000/api/users
   ```

2. **Trainer viewing users in their managed groups**
   ```bash
   curl -H "Authorization: Bearer <trainer-token>" \
     http://localhost:3000/api/users?groupId=group123
   ```

3. **User updating their own profile**
   ```bash
   curl -X PUT \
     -H "Authorization: Bearer <user-token>" \
     -H "Content-Type: application/json" \
     -d '{"name": "John Doe", "phone": "+60123456789"}' \
     http://localhost:3000/api/users/<user-id>
   ```

4. **Admin updating user role and group**
   ```bash
   curl -X PUT \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"role": "group_leader", "groupId": "group123"}' \
     http://localhost:3000/api/users/<user-id>
   ```

5. **Admin deactivating a user**
   ```bash
   curl -X PATCH \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"status": "inactive"}' \
     http://localhost:3000/api/users/<user-id>/status
   ```

## Integration Notes

1. **Group Management**: When updating `groupId`, the system automatically fetches and updates `groupName`
2. **Firebase Auth**: Status changes are synced to Firebase Auth (disabled/enabled)
3. **Cloud Functions**: Performance stats are expected to be updated by Cloud Functions (not managed by this API)
4. **Cascade Operations**: Deleting a user automatically removes them from their group's memberIds

## Future Enhancements

1. **Batch Operations**: Support for bulk user updates
2. **User Search**: Full-text search on name and email
3. **Export Functionality**: Export user lists to CSV/Excel
4. **Activity History**: Track user activity and changes over time
5. **Soft Delete**: Implement soft delete instead of hard delete
6. **Email Notifications**: Send emails on status changes
