# User Management System - Quick Start

## Overview

A comprehensive user management system with role-based access control for the backend API.

## Files Created

```
api/
├── src/
│   ├── controllers/
│   │   └── userController.ts          # User management operations (NEW)
│   ├── types/
│   │   ├── auth.types.ts              # Updated with phone, permissions, currentBadgeColor
│   │   └── user.types.ts              # User management types (NEW)
│   └── routes/
│       └── router.ts                   # Updated with user routes
├── USER_MANAGEMENT_SETUP.md           # Detailed setup guide (NEW)
├── USER_API_DOCUMENTATION.md          # Complete API reference (NEW)
└── USER_MANAGEMENT_README.md          # This file (NEW)
```

## Quick Reference

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | All | Get current user profile |
| GET | `/api/users/:userId` | Restricted | Get user by ID |
| GET | `/api/users` | Admin/Trainer | Get all users (with filters) |
| GET | `/api/users/group/:groupId` | Restricted | Get users by group |
| PUT | `/api/users/:userId` | Self/Admin | Update user |
| PATCH | `/api/users/:userId/status` | Admin | Update user status |
| DELETE | `/api/users/:userId` | Admin | Delete user |

### Key Features

✅ **Role-Based Access Control**
- Admin: Full access to all users
- Trainer/Master Trainer: Access to users in managed groups
- Group Leader: Access to users in own group
- Agent: Access to own profile only

✅ **Self-Service Updates**
- Users can update their own name, phone, and location
- Admin can update all fields

✅ **Firebase Auth Integration**
- Status changes sync with Firebase Auth (enable/disable account)
- User deletion removes from both Firestore and Firebase Auth

✅ **Cascade Operations**
- Deleting user removes them from group's memberIds
- Updating groupId automatically updates groupName
- Protects against deleting trainers with assigned groups

✅ **Audit Logging**
- All admin actions are logged
- Format: `[AUDIT] Admin {adminId} {action} user {userId}`

### Permission Matrix

| Action | Admin | Trainer | Group Leader | Agent |
|--------|-------|---------|--------------|-------|
| View any user | ✅ | ✅ Managed | ✅ Own group | ✅ Self |
| View all users | ✅ | ✅ Managed | ❌ | ❌ |
| Update any user | ✅ | ❌ | ❌ | ❌ |
| Update self (limited) | ✅ | ✅ | ✅ | ✅ |
| Change status | ✅ | ❌ | ❌ | ❌ |
| Delete user | ✅ | ❌ | ❌ | ❌ |

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
```bash
PUT /api/users/{userId}
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "groupId": "group123"
}
# groupName is automatically fetched and updated
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

### 8. Admin Deactivates User
```bash
PATCH /api/users/{userId}/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "inactive"
}
# Also disables Firebase Auth account
```

### 9. Admin Deletes User
```bash
DELETE /api/users/{userId}
Authorization: Bearer <admin-token>
# Removes from Firestore, Firebase Auth, and group memberIds
```

## Validation Rules

**Update User:**
- `name`: Minimum 2 characters
- `phone`: Any string (no format validation)
- `role`: Must be valid role (admin, master_trainer, trainer, group_leader, agent, manager, viewer)
- `groupId`: Must exist in groups collection

**Update Status:**
- `status`: Must be "active" or "inactive"

**Delete User:**
- Cannot delete self
- Cannot delete trainer with assigned groups

## Error Codes

- `200 OK`: Success
- `400 Bad Request`: Invalid data or validation error
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User or group not found
- `500 Internal Server Error`: Server error

## Security Features

1. **JWT Authentication**: All endpoints require valid Firebase token
2. **Role Verification**: Permissions checked on every request
3. **Self-Service Limits**: Non-admin users can only update limited fields
4. **Group Isolation**: Trainers can only see their managed groups
5. **Audit Trail**: All admin actions are logged
6. **Cascade Protection**: Cannot delete trainers with assigned groups

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
```

## Next Steps

1. ✅ User management system is ready to use
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
