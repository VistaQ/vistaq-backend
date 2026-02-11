# Group Management API Documentation

Complete API reference for group management endpoints.

## Base URL

```
http://localhost:3000/api
```

## Authentication

All endpoints require JWT authentication via Firebase:

```
Authorization: Bearer <firebase-id-token>
```

---

## Overview

Groups are teams of agents led by a Group Leader and supervised by a Trainer. The system maintains denormalized data across group and user documents to minimise read operations.

### Role Hierarchy

| Role | Group Access |
|------|-------------|
| `admin` | Full access — all groups, all operations |
| `master_trainer` | Read access — managed groups only |
| `trainer` | Read access — managed groups only |
| `group_leader` | Read access — own group only |
| `agent` | No access |

---

## Endpoints

### 1. Create Group

Creates a new group and wires up all related user documents atomically.

**Endpoint:** `POST /admin/groups`

**Authorization:** Admin only

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body:**
```typescript
{
  "name": string,         // Required — min 3 characters
  "trainerIds": string[], // Required — non-empty array of UIDs of existing trainer or master_trainer users
  "leaderId": string,     // Required — UID of an existing group_leader; must be in memberIds
  "memberIds": string[]   // Required — non-empty array of UIDs; must include leaderId
}
```

**Validation Rules:**
- `name` must be at least 3 characters
- `trainerIds` must be a non-empty array; each UID must exist and have role `trainer` or `master_trainer`
- `leaderId` user must exist and have role `agent` or `group_leader`
- `memberIds` must be a non-empty array
- `leaderId` must be present in `memberIds`
- All UIDs in `memberIds` must exist

**Side Effects (atomic batch write):**
- Group document created in `groups` collection
- All `memberIds` users: `groupId` and `groupName` set
- Each trainer user: `groupId` added to their `managedGroupIds` array
- If `leaderId` user has role `agent`, they are automatically promoted to `group_leader`

**Success Response (201 Created):**
```json
{
  "success": true,
  "groupId": "abc123def456",
  "message": "Group created successfully"
}
```

**Error Responses:**
```json
{ "error": "Group name is required and must be at least 3 characters" }
{ "error": "trainerIds is required and must be a non-empty array" }
{ "error": "leaderId is required" }
{ "error": "memberIds is required and must be a non-empty array" }
{ "error": "Leader must be included in memberIds array" }
{ "error": "User <uid> not found" }
{ "error": "User <uid> does not have required role (expected: trainer or master_trainer, got: <role>)" }
```

---

### 2. Update Group

Updates one or more group fields. All provided fields are processed in a single atomic batch write.

**Endpoint:** `PUT /admin/groups/:groupId`

**Authorization:** Admin only

**Path Parameters:**
- `groupId` (required): The group's Firestore document ID

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body** (at least one field required):
```typescript
{
  "name"?: string,        // New group name — min 3 characters
  "trainerIds"?: string[], // Full replacement list of trainer UIDs (must be trainer or master_trainer)
  "leaderId"?: string,    // UID of new leader (must be agent or group_leader; must be in memberIds)
  "memberIds"?: string[]  // Full replacement member list — must include current/new leader
}
```

**Side Effects per field:**

**`trainerIds` change:**
- Dropped trainers: `groupId` removed from their `managedGroupIds`
- Newly added trainers: `groupId` added to their `managedGroupIds`
- Group document: `trainerIds` and `trainerNames` updated

**`leaderId` change:**
- Old leader: role demoted to `agent`
- New leader (agent or group_leader): role promoted to `group_leader`
- New leader must be present in `memberIds` (current or provided)
- Group document: `leaderId`, `leaderName`, `leaderEmail` updated

**`memberIds` change:**
- Removed members: `groupId` and `groupName` cleared to `null`
- Added members: `groupId` and `groupName` set. If an added member is already in another group, they are automatically removed from that previous group in the same atomic batch (previous group's `memberIds` and `memberCount` are updated).
- Group document: `memberIds` and `memberCount` updated

**`name` change:**
- All current members' `groupName` updated
- Group document: `name` updated

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Group updated successfully"
}
```

**Error Responses:**
```json
{ "error": "Group not found" }
{ "error": "At least one field to update is required" }
{ "error": "Group name must be at least 3 characters" }
{ "error": "memberIds must be a non-empty array" }
{ "error": "Leader must be included in memberIds array" }
{ "error": "New leader must be included in memberIds array" }
{ "error": "User <uid> not found" }
```

---

### 3. Delete Group

Permanently deletes a group and unlinks all associated users.

**Endpoint:** `DELETE /admin/groups/:groupId`

**Authorization:** Admin only

**CAUTION:** This is permanent. All member `groupId`/`groupName` fields are cleared.

**Path Parameters:**
- `groupId` (required): The group's Firestore document ID

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Side Effects (atomic batch write):**
- All members: `groupId` and `groupName` cleared to `null`
- All trainers in `trainerIds`: `groupId` removed from their `managedGroupIds`
- Group document deleted

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

**Error Responses:**
```json
{ "error": "Group not found" }
{ "error": "Group ID is required" }
```

---

### 4. Get Group by ID

Retrieves a group document along with full member details.

**Endpoint:** `GET /groups/:groupId`

**Authorization:**
- Admin: any group
- Trainer / Master Trainer: groups in their `managedGroupIds`
- Group Leader: their own group only

**Path Parameters:**
- `groupId` (required): The group's Firestore document ID

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "group": {
    "id": "abc123",
    "name": "MDRT STAR",
    "leaderId": "uid_leader",
    "leaderName": "Jane Smith",
    "leaderEmail": "jane@example.com",
    "trainerIds": ["uid_trainer", "uid_trainer2"],
    "trainerNames": ["Coach Ahmad", "Coach Raj"],
    "memberIds": ["uid_leader", "uid_agent1", "uid_agent2"],
    "memberCount": 3,
    "totalProspects": 45,
    "totalAppointments": 20,
    "totalSales": 8,
    "totalACE": 25000,
    "totalPoints": 1200,
    "status": "active",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  },
  "members": [
    {
      "uid": "uid_leader",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "agentCode": "AGT47291",
      "totalPoints": 500,
      "totalProspects": 20,
      "totalAppointments": 10,
      "totalSales": 4,
      "totalACE": 12000,
      "currentBadge": "Star Performer",
      "status": "active"
    },
    {
      "uid": "uid_agent1",
      "name": "John Doe",
      "email": "john@example.com",
      "agentCode": "AGT81234",
      "totalPoints": 350,
      "totalProspects": 15,
      "totalAppointments": 7,
      "totalSales": 3,
      "totalACE": 8500,
      "currentBadge": "Rising Star",
      "status": "active"
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: No permission to view this group
  ```json
  { "error": "You do not have permission to view this group" }
  ```
- `404 Not Found`: Group not found
  ```json
  { "error": "Group not found" }
  ```

---

### 5. Get All Groups

Retrieves groups visible to the authenticated user.

**Endpoint:** `GET /groups`

**Authorization:**
- Admin: all groups (ordered by name)
- Trainer / Master Trainer: managed groups only (ordered by name)
- Group Leader: their own group only
- Agent: forbidden

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "groups": [
    {
      "id": "abc123",
      "name": "MDRT STAR",
      "leaderId": "uid_leader",
      "leaderName": "Jane Smith",
      "leaderEmail": "jane@example.com",
      "trainerIds": ["uid_trainer", "uid_trainer2"],
      "trainerNames": ["Coach Ahmad", "Coach Raj"],
      "memberIds": ["uid_leader", "uid_agent1"],
      "memberCount": 2,
      "totalProspects": 45,
      "totalAppointments": 20,
      "totalSales": 8,
      "totalACE": 25000,
      "totalPoints": 1200,
      "status": "active",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Role cannot access groups
  ```json
  { "error": "You do not have permission to view groups" }
  ```

---

## Data Model

### Group Document (`groups` collection)

```typescript
interface Group {
  id: string;               // Firestore document ID (auto-generated)
  name: string;             // Group name (e.g. "MDRT STAR")

  // Leadership — denormalized from user document
  leaderId: string;         // UID of group_leader user
  leaderName: string;
  leaderEmail: string;

  // Trainers — denormalized from user documents
  trainerIds: string[];     // UIDs of trainer or master_trainer users
  trainerNames: string[];   // Display names of trainers (parallel array to trainerIds)

  // Members
  memberIds: string[];      // UIDs of all group members (includes leader)
  memberCount: number;      // Cached length of memberIds

  // Performance stats
  totalProspects: number;
  totalAppointments: number;
  totalSales: number;
  totalACE: number;
  totalPoints: number;

  status: 'active' | 'inactive';

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Member Detail (returned in `GET /groups/:groupId`)

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

## Permission Matrix

| Endpoint | Admin | Master Trainer | Trainer | Group Leader | Agent |
|----------|-------|----------------|---------|--------------|-------|
| `POST /admin/groups` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PUT /admin/groups/:groupId` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DELETE /admin/groups/:groupId` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /groups/:groupId` | ✅ All | ✅ Managed | ✅ Managed | ✅ Own | ❌ |
| `GET /groups` | ✅ All | ✅ Managed | ✅ Managed | ✅ Own | ❌ |

---

## User Creation and Group Assignment

When users are created via `POST /admin/users`, group documents are updated automatically as a side effect:

| User Role Created | Group Side Effect |
|-------------------|-------------------|
| `agent` | `memberIds` += uid; `memberCount` incremented |
| `group_leader` | `memberIds` += uid; `memberCount` incremented; `leaderId`, `leaderName`, `leaderEmail` set |
| `trainer` / `master_trainer` | UID appended to `trainerIds`, name appended to `trainerNames` on all groups in `managedGroupIds` |
| `admin` | No group side effects |

See `USER_API_DOCUMENTATION.md` → §7 (Create User) for full request details.

---

## Recommended Workflows

### Bootstrap a new group from scratch

1. **Create trainer** (`POST /admin/users`, `role: trainer`, `managedGroupIds: [<future-group-id>]`)
   > Note: groups must exist before creating a trainer this way. For bootstrapping, create the group first then add the trainer via `PUT /admin/groups/:groupId`.

2. **Create group leader** (`POST /admin/users`, `role: group_leader`, `groupId: <group-id>`)

3. **Create group** (`POST /admin/groups`) with existing trainer/leader UIDs and initial member list

### Reassign trainers

```bash
PUT /admin/groups/<groupId>
{ "trainerIds": ["<trainer-uid-1>", "<trainer-uid-2>"] }
```

Provide the full intended trainer list. Dropped trainers have the group removed from their `managedGroupIds`; newly added trainers have it appended automatically.

### Change group leader

```bash
PUT /admin/groups/<groupId>
{ "leaderId": "<new-leader-uid>", "memberIds": ["<new-leader-uid>", ...] }
```

Old leader is demoted to `agent`; new user is promoted to `group_leader` automatically.

### Add members to a group

```bash
PUT /admin/groups/<groupId>
{ "memberIds": ["<existing-members>", "<new-uid-1>", "<new-uid-2>"] }
```

Provide the full intended member list (not a delta). Removed UIDs have their `groupId` cleared.

---

## Example cURL Requests

**Create group:**
```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MDRT STAR",
    "trainerIds": ["uid_trainer_abc", "uid_trainer_def"],
    "leaderId": "uid_leader_xyz",
    "memberIds": ["uid_leader_xyz", "uid_agent_1", "uid_agent_2"]
  }' \
  http://localhost:3000/api/admin/groups
```

**Add a member:**
```bash
curl -X PUT \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"memberIds": ["uid_leader_xyz", "uid_agent_1", "uid_agent_2", "uid_agent_new"]}' \
  http://localhost:3000/api/admin/groups/abc123
```

**Reassign trainers:**
```bash
curl -X PUT \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"trainerIds": ["uid_new_trainer_1", "uid_new_trainer_2"]}' \
  http://localhost:3000/api/admin/groups/abc123
```

**Get group with members:**
```bash
curl -X GET \
  -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/groups/abc123
```

---

## Architecture Notes

### Denormalization

Frequently accessed fields are copied into the group document to avoid extra reads:
- `leaderName`, `leaderEmail` from the leader's user document
- `trainerNames` from each trainer's user document (parallel array to `trainerIds`)
- `groupName` stored on each member's user document

### Atomic Operations

All multi-document mutations use Firestore batch writes to guarantee consistency. A failure in any step rolls back the entire operation.

### Data Integrity Rules

- Leader must always be present in `memberIds`
- Trainer changes update `managedGroupIds` for all added and removed trainers
- Leader changes automatically handle role promotion/demotion
- Deleting a group unlinks all members and removes groupId from all trainers' `managedGroupIds`

---

## Error Handling

All endpoints return errors in this format:

```json
{ "error": "Error message" }
```

HTTP status codes:
- `200 OK` — Successful read or update
- `201 Created` — Successful creation
- `400 Bad Request` — Validation error
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Insufficient permissions
- `404 Not Found` — Group or user not found
- `500 Internal Server Error` — Server error

---

## Changelog

### Version 1.3.0 (2026-02-12)
- `createGroup`: `leaderId` now accepts `agent` OR `group_leader` role — agents are automatically promoted to `group_leader` in the same atomic batch write
- `updateGroup`: when adding a member who is already in another group, they are automatically removed from their previous group atomically

### Version 1.2.0 (2026-02-11)
- Multi-trainer support: `trainerId`/`trainerName`/`trainerType` replaced by `trainerIds: string[]` and `trainerNames: string[]`
- Updated all request bodies, validation rules, side effects, data model, response examples, cURL samples, and workflow descriptions

### Version 1.1.0 (2026-02-11)
- Rewrote as full API reference (was setup guide)
- Added complete request/response documentation for all 5 endpoints
- Documented all side effects per operation (trainer reassignment, leader demotion/promotion, member link/unlink)
- Added section on user creation side effects referencing `POST /admin/users`
- Corrected endpoint paths to match router configuration (`/admin/groups`, `/groups`)
- Added permission matrix, data models, and recommended workflows

### Version 1.0.0 (2024-01-15)
- Initial setup guide for Group Management System
