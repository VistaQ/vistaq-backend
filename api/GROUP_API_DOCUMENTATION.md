# Group Management API Documentation

## Base URL
```
/api
```

All endpoints require authentication via Bearer token unless specified otherwise.

---

## Endpoints

### 1. Create Group (Admin Only)

**Endpoint**: `POST /admin/groups`

**Authentication**: Required (Admin only)

**Description**: Creates a new group with one or more trainers, a leader, and members.

**Request Body**:
```typescript
{
  name: string;           // Required, min 3 characters
  trainerIds: string[];   // Required, non-empty array of Firebase UIDs of trainer/master_trainer users
  leaderId: string;       // Required, must be Firebase UID of group_leader
  memberIds: string[];    // Required, array of Firebase UIDs (must include leaderId)
}
```

**Example Request**:
```json
{
  "name": "MDRT STAR",
  "trainerIds": ["dJ4kL9mN2pQ8rS6tU0vW", "xY9zA0bC1dE2fG3hI4jK"],
  "leaderId": "aB1cD2eF3gH4iJ5kL6mN",
  "memberIds": [
    "aB1cD2eF3gH4iJ5kL6mN",
    "oP7qR8sT9uV0wX1yZ2aB",
    "cD3eF4gH5iJ6kL7mN8oP"
  ]
}
```

**Success Response** (201 Created):
```json
{
  "success": true,
  "groupId": "xyz789abc123def456",
  "message": "Group created successfully"
}
```

**Error Responses**:

- **400 Bad Request**:
```json
{
  "error": "Group name is required and must be at least 3 characters"
}
```
```json
{
  "error": "Leader must be included in memberIds array"
}
```

- **403 Forbidden**:
```json
{
  "error": "User dJ4kL9mN2pQ8rS6tU0vW does not have required role (expected: trainer or master_trainer, got: agent)"
}
```
```json
{
  "error": "trainerIds must be a non-empty array"
}
```

- **404 Not Found**:
```json
{
  "error": "User aB1cD2eF3gH4iJ5kL6mN not found"
}
```

**Validations**:
- Name: Required, minimum 3 characters
- trainerIds: Must be a non-empty array; each UID must exist and have role 'trainer' or 'master_trainer'
- leaderId: Must exist, have role `agent` or `group_leader`, and be in memberIds. If the user is an `agent`, they are automatically promoted to `group_leader` in the same atomic batch.
- memberIds: Required non-empty array, all users must exist

**Side Effects**:
- Creates group document in Firestore
- Updates all members' `groupId` and `groupName` fields
- Adds groupId to each trainer's `managedGroupIds` array
- If `leaderId` user has role `agent`, promotes them to `group_leader`

---

### 2. Update Group (Admin Only)

**Endpoint**: `PUT /admin/groups/:groupId`

**Authentication**: Required (Admin only)

**Description**: Updates an existing group. All fields are optional.

**URL Parameters**:
- `groupId` (string): The Firestore document ID of the group

**Request Body**:
```typescript
{
  name?: string;            // Optional, min 3 characters if provided
  trainerIds?: string[];    // Optional, full replacement list of trainer UIDs (must be trainer or master_trainer)
  leaderId?: string;        // Optional, Firebase UID of agent or group_leader (will be promoted)
  memberIds?: string[];     // Optional, array of Firebase UIDs (must include leaderId)
}
```

**Example Request**:
```json
{
  "name": "MDRT STAR Elite",
  "memberIds": [
    "aB1cD2eF3gH4iJ5kL6mN",
    "oP7qR8sT9uV0wX1yZ2aB",
    "newMember123xyz"
  ]
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Group updated successfully"
}
```

**Error Responses**:

- **400 Bad Request**:
```json
{
  "error": "At least one field to update is required"
}
```
```json
{
  "error": "New leader must be included in memberIds array"
}
```

- **404 Not Found**:
```json
{
  "error": "Group not found"
}
```

**Validations**:
- At least one field must be provided
- If name provided: minimum 3 characters
- If trainerIds provided: must be a non-empty array; each UID must exist and have correct role
- If leaderId provided: must have role `agent` or `group_leader`; must be in memberIds (existing or provided)
- If memberIds provided: non-empty array, all must exist, must include current/new leaderId

**Side Effects**:
- Updates group document
- If trainerIds changed: removes groupId from dropped trainers' `managedGroupIds`; adds groupId to newly added trainers' `managedGroupIds`
- If leader changed: old leader's role demoted to `agent`; new user's role promoted to `group_leader`
- If members changed: removed members have `groupId`/`groupName` cleared to null; added members have `groupId`/`groupName` set. If an added member is already in another group, they are automatically removed from that previous group atomically (group's `memberIds` and `memberCount` updated).
- If name changed: updates all current members' `groupName`

---

### 3. Delete Group (Admin Only)

**Endpoint**: `DELETE /admin/groups/:groupId`

**Authentication**: Required (Admin only)

**Description**: Deletes a group and removes all member associations.

**URL Parameters**:
- `groupId` (string): The Firestore document ID of the group

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

**Error Responses**:

- **404 Not Found**:
```json
{
  "error": "Group not found"
}
```

- **403 Forbidden**:
```json
{
  "error": "Only administrators can delete groups"
}
```

**Side Effects**:
- Deletes group document from Firestore
- Clears `groupId` and `groupName` for all members
- Removes groupId from all trainers' `managedGroupIds`

---

### 4. Get Group by ID

**Endpoint**: `GET /groups/:groupId`

**Authentication**: Required

**Description**: Retrieves a specific group with full member details.

**Permissions**:
- **Admin**: Can view any group
- **Trainer/Master Trainer**: Can view if groupId is in their `managedGroupIds`
- **Group Leader**: Can view their own group only
- **Others**: Forbidden

**URL Parameters**:
- `groupId` (string): The Firestore document ID of the group

**Success Response** (200 OK):
```json
{
  "group": {
    "id": "xyz789abc123def456",
    "name": "MDRT STAR",
    "leaderId": "aB1cD2eF3gH4iJ5kL6mN",
    "leaderName": "John Doe",
    "leaderEmail": "john.doe@example.com",
    "trainerIds": ["dJ4kL9mN2pQ8rS6tU0vW", "xY9zA0bC1dE2fG3hI4jK"],
    "trainerNames": ["Jane Smith", "Mark Lee"],
    "memberIds": [
      "aB1cD2eF3gH4iJ5kL6mN",
      "oP7qR8sT9uV0wX1yZ2aB",
      "cD3eF4gH5iJ6kL7mN8oP"
    ],
    "memberCount": 3,
    "totalProspects": 150,
    "totalAppointments": 100,
    "totalSales": 50,
    "totalACE": 125000,
    "totalPoints": 5000,
    "status": "active",
    "createdAt": {
      "_seconds": 1707580800,
      "_nanoseconds": 0
    },
    "updatedAt": {
      "_seconds": 1707580800,
      "_nanoseconds": 0
    }
  },
  "members": [
    {
      "uid": "aB1cD2eF3gH4iJ5kL6mN",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "agentCode": "AGT47291",
      "totalPoints": 2000,
      "totalProspects": 60,
      "totalAppointments": 40,
      "totalSales": 20,
      "totalACE": 50000,
      "currentBadge": "Gold",
      "status": "active"
    },
    {
      "uid": "oP7qR8sT9uV0wX1yZ2aB",
      "name": "Alice Johnson",
      "email": "alice.j@example.com",
      "agentCode": "AGT81234",
      "totalPoints": 1500,
      "totalProspects": 45,
      "totalAppointments": 30,
      "totalSales": 15,
      "totalACE": 37500,
      "currentBadge": "Silver",
      "status": "active"
    },
    {
      "uid": "cD3eF4gH5iJ6kL7mN8oP",
      "name": "Bob Williams",
      "email": "bob.w@example.com",
      "agentCode": "AGT63047",
      "totalPoints": 1500,
      "totalProspects": 45,
      "totalAppointments": 30,
      "totalSales": 15,
      "totalACE": 37500,
      "currentBadge": "Silver",
      "status": "active"
    }
  ]
}
```

**Error Responses**:

- **404 Not Found**:
```json
{
  "error": "Group not found"
}
```

- **403 Forbidden**:
```json
{
  "error": "You do not have permission to view this group"
}
```

---

### 5. Get All Groups

**Endpoint**: `GET /groups`

**Authentication**: Required

**Description**: Retrieves groups based on user role.

**Permissions**:
- **Admin**: Returns all groups
- **Trainer/Master Trainer**: Returns only groups in their `managedGroupIds`
- **Group Leader**: Returns only their own group
- **Others**: Forbidden

**Success Response** (200 OK):
```json
{
  "groups": [
    {
      "id": "xyz789abc123def456",
      "name": "MDRT STAR",
      "leaderId": "aB1cD2eF3gH4iJ5kL6mN",
      "leaderName": "John Doe",
      "leaderEmail": "john.doe@example.com",
      "trainerIds": ["dJ4kL9mN2pQ8rS6tU0vW", "xY9zA0bC1dE2fG3hI4jK"],
      "trainerNames": ["Jane Smith", "Mark Lee"],
      "memberIds": ["aB1cD2eF3gH4iJ5kL6mN", "oP7qR8sT9uV0wX1yZ2aB"],
      "memberCount": 2,
      "totalProspects": 150,
      "totalAppointments": 100,
      "totalSales": 50,
      "totalACE": 125000,
      "totalPoints": 5000,
      "status": "active",
      "createdAt": { "_seconds": 1707580800, "_nanoseconds": 0 },
      "updatedAt": { "_seconds": 1707580800, "_nanoseconds": 0 }
    },
    {
      "id": "def456ghi789jkl012",
      "name": "Rising Stars",
      "leaderId": "qR9sT0uV1wX2yZ3aB4cD",
      "leaderName": "Sarah Miller",
      "leaderEmail": "sarah.m@example.com",
      "trainerIds": ["dJ4kL9mN2pQ8rS6tU0vW"],
      "trainerNames": ["Jane Smith"],
      "memberIds": ["qR9sT0uV1wX2yZ3aB4cD", "eF5gH6iJ7kL8mN9oP0qR"],
      "memberCount": 2,
      "totalProspects": 80,
      "totalAppointments": 60,
      "totalSales": 30,
      "totalACE": 75000,
      "totalPoints": 3000,
      "status": "active",
      "createdAt": { "_seconds": 1707580800, "_nanoseconds": 0 },
      "updatedAt": { "_seconds": 1707580800, "_nanoseconds": 0 }
    }
  ]
}
```

**Error Responses**:

- **403 Forbidden**:
```json
{
  "error": "You do not have permission to view groups"
}
```

**Notes**:
- Groups are sorted by name alphabetically
- Trainers with no managed groups receive an empty array
- Response does not include member details (use Get Group by ID for that)

---

## TypeScript Interfaces

### Group
```typescript
interface Group {
  id: string;
  name: string;

  // Leadership
  leaderId: string;
  leaderName: string;
  leaderEmail: string;

  // Trainers
  trainerIds: string[];
  trainerNames: string[];

  // Members
  memberIds: string[];
  memberCount: number;

  // Performance stats
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
```

### GroupMember
```typescript
interface GroupMember {
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
```

---

## User Creation and Group Assignment

When users are created via `POST /admin/users`, group documents are updated automatically as a side effect — no separate group update call is needed:

| User Role Created | Group Side Effect |
|-------------------|-------------------|
| `agent` | `memberIds` += uid; `memberCount` incremented |
| `group_leader` | `memberIds` += uid; `memberCount` incremented; `leaderId`, `leaderName`, `leaderEmail` set |
| `trainer` / `master_trainer` | UID appended to `trainerIds`, name appended to `trainerNames` on all groups in `managedGroupIds` |
| `admin` | No group side effects |

See `USER_API_DOCUMENTATION.md` → §7 (Create User) for full details.

---

## Common Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input or validation error |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 500 | Internal Server Error - Server error |

---

## Authentication

All endpoints (except login) require a valid Firebase ID token in the Authorization header:

```
Authorization: Bearer <firebase-id-token>
```

The token is validated by the authentication middleware and the user object is attached to `req.user`.

---

## Rate Limiting

Consider implementing rate limiting in production to prevent abuse:
- Admin operations: 100 requests/minute
- Read operations: 300 requests/minute

---

## Testing Examples

### Using cURL

**Create Group**:
```bash
curl -X POST http://localhost:3000/api/admin/groups \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MDRT STAR",
    "trainerIds": ["trainer-uid-123", "trainer-uid-456"],
    "leaderId": "leader-uid-456",
    "memberIds": ["leader-uid-456", "agent-uid-789"]
  }'
```

**Get All Groups**:
```bash
curl -X GET http://localhost:3000/api/groups \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Specific Group**:
```bash
curl -X GET http://localhost:3000/api/groups/xyz789abc123def456 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Update Group**:
```bash
curl -X PUT http://localhost:3000/api/admin/groups/xyz789abc123def456 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MDRT STAR Elite"
  }'
```

**Delete Group**:
```bash
curl -X DELETE http://localhost:3000/api/admin/groups/xyz789abc123def456 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Best Practices

1. **Always Include Leader in Members**: When creating or updating a group, ensure the leaderId is in the memberIds array.

2. **Batch Operations**: The system uses Firestore batch writes internally. Each batch can contain up to 500 operations.

3. **Error Handling**: Always check the response status code and handle errors appropriately.

4. **Denormalized Data**: Be aware that leader/trainer names are denormalized. If you update a user's name, you may need to update groups manually.

5. **Performance Stats**: The `totalProspects`, `totalAppointments`, etc. are meant to be updated by Cloud Functions. Don't manually update these via the API.

6. **Permissions**: Trainers can only see groups they manage. Use the admin account for full visibility.

---

## Changelog

### Version 1.3.0 (2026-02-12)
- `createGroup`: `leaderId` now accepts `agent` OR `group_leader` role — agents are automatically promoted to `group_leader` in the same atomic batch write
- `updateGroup`: when adding a member who is already in another group, they are automatically removed from their previous group atomically (previous group's `memberIds` and `memberCount` are updated in the same batch)

### Version 1.2.0 (2026-02-11)
- Multi-trainer support: `trainerId`/`trainerName`/`trainerType` replaced by `trainerIds: string[]` and `trainerNames: string[]` in Group data model
- `POST /admin/groups`: `trainerId` field replaced by `trainerIds` (non-empty array)
- `PUT /admin/groups/:groupId`: `trainerId` field replaced by `trainerIds` (full replacement list); diff logic removes group from dropped trainers and adds to new trainers
- `DELETE /admin/groups/:groupId`: group removed from all trainers in `trainerIds`
- Updated all request body schemas, example JSON, TypeScript interfaces, response examples, and cURL samples

### Version 1.1.0 (2026-02-11)
- Corrected `leaderId` validation for Update Group: accepts `agent` or `group_leader` role (not `group_leader` only) — the user is promoted automatically
- Expanded Update Group side effects to document leader demotion/promotion and trainer `managedGroupIds` sync
- Updated `agentCode` examples to use a realistic client-supplied value
- Added "User Creation and Group Assignment" section cross-referencing `POST /admin/users` side effects

### Version 1.0.0 (Initial Release)
- Created group management system
- Added CRUD operations for groups
- Implemented role-based access control
- Added denormalized data for performance
- Implemented batch writes for atomicity
