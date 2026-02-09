# Group Management System - Setup Guide

## Overview

The Group Management System allows administrators to create and manage teams of agents led by a Group Leader and trained by a Trainer. This system provides a hierarchical structure for organizing agents and tracking group performance.

## Prerequisites

- Express.js + TypeScript API
- Firebase Admin SDK configured
- Firestore database
- Authentication middleware in place

## File Structure

```
api/src/
├── types/
│   ├── auth.types.ts           # Updated with new roles and managedGroupIds
│   └── groups.types.ts         # NEW - Group-related TypeScript interfaces
├── controllers/
│   └── groupController.ts      # NEW - Group CRUD operations
├── middleware/
│   └── roleCheck.ts            # Updated with trainer/leader role checks
└── routes/
    └── router.ts               # Updated with group routes
```

## User Roles

### New Roles Added

1. **trainer** - Manages one or more groups
2. **master_trainer** - Senior trainer with same permissions as trainer
3. **group_leader** - Leads a single group of agents

### Updated User Schema

The `User` interface now includes:
```typescript
managedGroupIds?: string[]; // For trainers - array of group IDs they manage
```

### Role Hierarchy

- **Admin**: Full access to all groups and operations
- **Master Trainer/Trainer**: Can view and manage assigned groups
- **Group Leader**: Can view their own group
- **Agent/Manager/Viewer**: Cannot access group management

## Firestore Collections

### groups Collection

Documents in the `groups` collection have the following structure:

```typescript
{
  id: string;                    // Auto-generated document ID
  name: string;                  // Group name (e.g., "MDRT STAR")

  // Leadership
  leaderId: string;              // Firebase UID of Group Leader
  leaderName: string;            // Denormalized for quick access
  leaderEmail: string;

  // Trainer
  trainerId: string;             // Firebase UID of assigned Trainer
  trainerName: string;           // Denormalized
  trainerType: string;           // "trainer" or "master_trainer"

  // Members
  memberIds: string[];           // Array of Firebase UIDs
  memberCount: number;           // Cached count

  // Performance stats (updated by Cloud Functions)
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  totalPoints: number;

  // Status
  status: string;                // "active" or "inactive"

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### users Collection Updates

When a user is added to a group, their document is updated with:
```typescript
{
  groupId: string;      // ID of the group they belong to
  groupName: string;    // Name of the group (denormalized)
}
```

When a trainer is assigned groups, their document is updated with:
```typescript
{
  managedGroupIds: string[];  // Array of group IDs they manage
}
```

## API Endpoints

### Admin Operations

1. **Create Group**: `POST /api/admin/groups`
2. **Update Group**: `PUT /api/admin/groups/:groupId`
3. **Delete Group**: `DELETE /api/admin/groups/:groupId`

### User Operations

4. **Get All Groups**: `GET /api/groups`
   - Admin: sees all groups
   - Trainers: see managed groups
   - Group Leaders: see their own group

5. **Get Specific Group**: `GET /api/groups/:groupId`
   - Includes full member details

## Key Features

### 1. Denormalization

The system denormalizes frequently accessed data to minimize database reads:
- Leader name and email in group document
- Trainer name and type in group document
- Group name in user documents

### 2. Atomic Operations

All operations that update multiple documents use Firestore batch writes to ensure data consistency.

### 3. Permission Checks

- All group operations are admin-only except read operations
- Trainers can only view groups in their `managedGroupIds`
- Group Leaders can only view their own group

### 4. Data Integrity

- Leader must always be included in memberIds
- When trainer changes, both old and new trainer's `managedGroupIds` are updated
- When members are removed, their `groupId` and `groupName` are cleared
- When group is deleted, all members are unlinked

## Usage Examples

### 1. Create a Group

```bash
POST /api/admin/groups
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "MDRT STAR",
  "trainerId": "trainer-uid-123",
  "leaderId": "leader-uid-456",
  "memberIds": ["leader-uid-456", "agent-uid-789", "agent-uid-012"]
}
```

### 2. Update Group Members

```bash
PUT /api/admin/groups/group-id-123
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "memberIds": ["leader-uid-456", "agent-uid-789", "new-agent-uid-345"]
}
```

### 3. Get Group with Members

```bash
GET /api/groups/group-id-123
Authorization: Bearer <user-token>
```

Response:
```json
{
  "group": {
    "id": "group-id-123",
    "name": "MDRT STAR",
    "leaderId": "leader-uid-456",
    "leaderName": "John Doe",
    ...
  },
  "members": [
    {
      "uid": "leader-uid-456",
      "name": "John Doe",
      "email": "john@example.com",
      "agentCode": "A001",
      "totalPoints": 1500,
      ...
    },
    ...
  ]
}
```

## Migration Steps

If you have existing users and need to migrate them:

1. **Update User Roles**:
   ```javascript
   // Update user documents to add new roles
   await db.collection('users').doc(userId).update({
     role: 'trainer', // or 'master_trainer', 'group_leader'
     managedGroupIds: [], // Initialize for trainers
   });
   ```

2. **Create Initial Groups**:
   Use the `POST /api/admin/groups` endpoint to create groups.

3. **Verify Data Integrity**:
   - Check that all members have correct `groupId` and `groupName`
   - Verify trainers have correct `managedGroupIds`
   - Ensure leaders are included in their group's `memberIds`

## Logging

The system includes comprehensive logging:
- All operations log their progress
- User validation steps are logged
- Batch operations log the number of documents affected
- Errors include full stack traces

Example log output:
```
[CreateGroup] Validating trainer trainer-uid-123...
[CreateGroup] Validating leader leader-uid-456...
[CreateGroup] Validating 3 members...
[CreateGroup] All validations passed. Creating group...
[CreateGroup] Group abc123 created successfully
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200 OK` - Successful retrieval
- `201 Created` - Successful creation
- `400 Bad Request` - Validation errors
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server errors

## Performance Considerations

1. **Batch Operations**: All multi-document updates use batch writes (max 500 operations per batch)
2. **Denormalization**: Frequently accessed data is denormalized to reduce reads
3. **Indexes**: Consider adding indexes on:
   - `groups.status`
   - `users.groupId`
   - `users.role`

## Future Enhancements

Consider implementing:
1. Cloud Functions to auto-update group performance stats
2. Group status transitions (active → archived)
3. Group activity logs
4. Bulk member operations
5. Group templates
6. Performance rankings within groups
