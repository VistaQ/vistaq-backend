# Prospects Management API Documentation

## Overview

The Prospects Management System handles the complete 3-stage sales cycle:
1. **Prospect** - Initial lead entry
2. **Appointment** - Scheduling and tracking meetings
3. **Sales** - Recording outcomes and products sold

## Table of Contents

- [Authentication](#authentication)
- [Permissions](#permissions)
- [API Endpoints](#api-endpoints)
- [Data Models](#data-models)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)

---

## Authentication

All prospects endpoints require authentication via Firebase ID token.

**Headers:**
```
Authorization: Bearer <firebase_id_token>
```

---

## Permissions

### User Roles

| Role | Can Create | Can View | Can Update |
|------|-----------|----------|------------|
| **agent** | Own prospects | Own prospects only | Own prospects only |
| **manager** | Own prospects | Own + team prospects (same groupId) | Own prospects only |
| **admin** | Own prospects | All prospects | All prospects |

### Permission Rules

- **View Prospects:**
  - Agents: Only their own prospects (`uid === user.uid`)
  - Managers: Their team's prospects (`groupId === user.groupId`)
  - Admins: All prospects

- **Update Prospects:**
  - Agents: Only their own prospects
  - Admins: Any prospects

---

## API Endpoints

### 1. Create Prospect (Prospect Stage)

**Endpoint:** `POST /api/prospects`

**Description:** Create a new prospect record at the prospect stage.

**Required Role:** `agent`, `manager`

**Request Body:**
```json
{
  "prospectName": "John Doe",
  "prospectEmail": "john@example.com",
  "prospectPhone": "+60123456789"
}
```

**Validation:**
- `prospectName`: Required, minimum 2 characters
- `prospectEmail`: Required, valid email format
- `prospectPhone`: Required

**Response (201 Created):**
```json
{
  "success": true,
  "prospectId": "prospect_abc123xyz",
  "message": "Prospect created successfully"
}
```

**Auto-Generated Fields:**
- `uid`: Firebase Auth UID (for permissions)
- `agentCode`: Agent code from authenticated user (e.g., "A001")
- `agentName`, `agentEmail`: From authenticated user
- `groupId`, `groupName`: From authenticated user
- `currentStage`: "prospect"
- `prospectEnteredAt`: Current timestamp
- `stageHistory`: Array with initial stage entry
- `createdAt`, `updatedAt`: Current timestamp

---

### 2. Get My Prospects

**Endpoint:** `GET /api/prospects/my-prospects`

**Description:** Get all prospects for the authenticated user.

**Required Role:** Any authenticated user

**Query Parameters:**
- `limit` (optional): Number of records to return

**Response (200 OK):**
```json
{
  "prospects": [
    {
      "id": "prospect_abc123",
      "currentStage": "prospect",
      "prospectName": "John Doe",
      "prospectEmail": "john@example.com",
      "prospectPhone": "+60123456789",
      "uid": "firebase_uid_123",
      "agentCode": "A001",
      "agentName": "Agent Smith",
      "groupId": "group456",
      "groupName": "Team Alpha",
      "createdAt": { "_seconds": 1234567890, "_nanoseconds": 0 }
    }
  ]
}
```

---

### 3. Get Specific Prospect

**Endpoint:** `GET /api/prospects/:id`

**Description:** Get details of a specific prospect by ID.

**Required Role:** User must have permission to view the prospect

**Response (200 OK):**
```json
{
  "prospect": {
    "id": "prospect_abc123",
    "currentStage": "appointment",
    "prospectName": "John Doe",
    "uid": "firebase_uid_123",
    "agentCode": "A001",
    "appointmentDate": { "_seconds": 1234567890, "_nanoseconds": 0 },
    "appointmentTime": "10:00 AM",
    "appointmentStatus": "completed",
    ...
  }
}
```

**Error (403 Forbidden):**
```json
{
  "error": "You do not have permission to view this prospect"
}
```

---

### 4. Update Prospect

**Endpoint:** `PUT /api/prospects/:id`

**Description:** Update a prospect record (move to next stage or update fields).

**Required Role:** Owner of the prospect or admin

**Request Body Examples:**

#### Update to Appointment Stage:
```json
{
  "currentStage": "appointment",
  "appointmentDate": "2025-02-10T10:00:00Z",
  "appointmentTime": "10:00 AM",
  "appointmentStatus": "completed"
}
```

**Validation:**
- Moving to appointment stage requires `appointmentDate` and `appointmentTime`
- Valid `appointmentStatus` values: `"not_done"`, `"completed"`, `"declined"`, `"kiv"`

**Auto-Generated:**
- `appointmentCompletedAt`: Set when status = "completed" (only on first completion)
- Stage added to `stageHistory`

#### Update to Sales Stage (Successful):
```json
{
  "currentStage": "sales",
  "salesPartsCompleted": {
    "social": true,
    "factFinding": true,
    "presentation": true
  },
  "productsSold": [
    {
      "productName": "Medical Card",
      "aceAmount": 5000
    },
    {
      "productName": "Life Insurance",
      "aceAmount": 3000
    }
  ],
  "salesOutcome": "successful"
}
```

**Validation:**
- If `salesOutcome` = "successful": Require `productsSold` (at least one product)
- Valid `salesOutcome` values: `"successful"`, `"unsuccessful"`

**Auto-Calculated:**
- `totalACE`: Sum of all `aceAmount` values in `productsSold`

**Auto-Generated:**
- `salesCompletedAt`: Current timestamp (only on first completion)
- Stage added to `stageHistory`

#### Update to Sales Stage (Unsuccessful):
```json
{
  "currentStage": "sales",
  "salesOutcome": "unsuccessful",
  "unsuccessfulReason": "Customer decided not to proceed"
}
```

**Validation:**
- If `salesOutcome` = "unsuccessful": Require `unsuccessfulReason`

#### Update Individual Fields (Without Stage Change):
```json
{
  "appointmentStatus": "declined"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Prospect updated successfully"
}
```

**Important Note on Idempotency:**
- `salesCompletedAt` and `appointmentCompletedAt` are set **only on first completion**
- Calling the same endpoint multiple times with identical payload will preserve the original completion timestamps
- This ensures accurate tracking of when prospects first completed each stage

---

### 5. Get Group Prospects

**Endpoint:** `GET /api/prospects/group/:groupId`

**Description:** Get all prospects for a specific group.

**Required Role:** `manager` (own group only), `admin` (any group)

**Query Parameters:**
- `limit` (optional): Number of records to return

**Response (200 OK):**
```json
{
  "prospects": [
    {
      "id": "prospect_123",
      "currentStage": "sales",
      "groupId": "group456",
      "groupName": "Team Alpha",
      "agentCode": "A001",
      ...
    }
  ]
}
```

**Error (403 Forbidden):**
```json
{
  "error": "You do not have permission to view this group's prospects"
}
```

---

### 6. Get All Prospects (Admin Only)

**Endpoint:** `GET /api/admin/all-prospects`

**Description:** Get all prospects across all groups and agents.

**Required Role:** `admin`

**Query Parameters:**
- `limit` (optional): Number of records to return

**Response (200 OK):**
```json
{
  "prospects": [
    {
      "id": "prospect_123",
      "currentStage": "sales",
      "agentCode": "A001",
      "agentName": "Agent Smith",
      "groupName": "Team Alpha",
      ...
    }
  ]
}
```

---

## Data Models

### ProspectRecord

```typescript
interface ProspectRecord {
  id?: string;

  // Stage tracking
  currentStage: 'prospect' | 'appointment' | 'sales';
  stageHistory: Array<{
    stage: string;
    enteredAt: Timestamp;
  }>;

  // Agent info (denormalized)
  uid: string;              // Firebase Auth UID (for permissions)
  agentCode: string;        // Agent code (e.g., "A001")
  agentName: string;
  agentEmail: string;
  groupId: string;
  groupName: string;

  // Prospect stage
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  prospectEnteredAt?: Timestamp;

  // Appointment stage
  appointmentDate?: Timestamp;
  appointmentTime?: string;
  appointmentStatus?: 'not_done' | 'completed' | 'declined' | 'kiv';
  appointmentCompletedAt?: Timestamp;

  // Sales stage
  salesPartsCompleted?: {
    social: boolean;
    factFinding: boolean;
    presentation: boolean;
  };
  productsSold?: Array<{
    productName: string;
    aceAmount: number;
  }>;
  totalACE?: number;
  salesOutcome?: 'successful' | 'unsuccessful';
  unsuccessfulReason?: string;
  salesCompletedAt?: Timestamp;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Usage Examples

### Complete Prospects Flow

#### Step 1: Create Prospect
```bash
curl -X POST http://localhost:3000/api/prospects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prospectName": "John Doe",
    "prospectEmail": "john@example.com",
    "prospectPhone": "+60123456789"
  }'
```

**Response:**
```json
{
  "success": true,
  "prospectId": "prospect_abc123"
}
```

#### Step 2: Update to Appointment
```bash
curl -X PUT http://localhost:3000/api/prospects/prospect_abc123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentStage": "appointment",
    "appointmentDate": "2025-02-10T10:00:00Z",
    "appointmentTime": "10:00 AM",
    "appointmentStatus": "completed"
  }'
```

#### Step 3: Complete Sale (Successful)
```bash
curl -X PUT http://localhost:3000/api/prospects/prospect_abc123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentStage": "sales",
    "salesPartsCompleted": {
      "social": true,
      "factFinding": true,
      "presentation": true
    },
    "productsSold": [
      {
        "productName": "Medical Card",
        "aceAmount": 5000
      }
    ],
    "salesOutcome": "successful"
  }'
```

#### Alternative: Mark as Unsuccessful
```bash
curl -X PUT http://localhost:3000/api/prospects/prospect_abc123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentStage": "sales",
    "salesOutcome": "unsuccessful",
    "unsuccessfulReason": "Customer not interested"
  }'
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid input or missing required fields |
| 401 | Unauthorized | Not authenticated or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error |

### Common Errors

#### Missing Required Fields
```json
{
  "error": "prospectName is required and must be at least 2 characters"
}
```

#### Invalid Email
```json
{
  "error": "Valid prospectEmail is required"
}
```

#### Permission Denied
```json
{
  "error": "You do not have permission to update this prospect"
}
```

#### Invalid Stage Transition
```json
{
  "error": "appointmentDate and appointmentTime are required for appointment stage"
}
```

#### Validation Error
```json
{
  "error": "unsuccessfulReason is required when salesOutcome is \"unsuccessful\""
}
```

---

## Firestore Collection

### Collection Name: `prospects`

### Indexes Required

Create these composite indexes in Firestore:

1. **By Agent Code and Date:**
   - Collection: `prospects`
   - Fields: `agentCode` (Ascending), `createdAt` (Descending)

2. **By Group and Date:**
   - Collection: `prospects`
   - Fields: `groupId` (Ascending), `createdAt` (Descending)

3. **By Date (for admin):**
   - Collection: `prospects`
   - Fields: `createdAt` (Descending)

### Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /prospects/{prospectId} {
      // Allow read if user is the agent (by uid), in the same group (manager), or admin
      allow read: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'manager' &&
         resource.data.groupId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.groupId) ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );

      // Allow create if authenticated as agent or manager
      allow create: if request.auth != null && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['agent', 'manager']
      );

      // Allow update if owner (by uid) or admin
      allow update: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );
    }
  }
}
```

---

## Notes

1. **Dual Identifiers:**
   - `uid`: Firebase Auth UID - used for authentication and permissions
   - `agentCode`: Business agent code (e.g., "A001") - used for business logic and reporting

2. **Denormalization:** Agent and group information is stored directly in each prospect record to optimize read performance and maintain historical accuracy.

3. **Stage History:** The `stageHistory` array tracks when the prospect moved between stages, useful for analytics and reporting.

4. **Timestamps:** All timestamps use Firebase Firestore `Timestamp` type, which includes seconds and nanoseconds.

5. **Auto-Calculation:** The `totalACE` field is automatically calculated as the sum of all `aceAmount` values in `productsSold`.

6. **Idempotency:** Completion timestamps (`salesCompletedAt`, `appointmentCompletedAt`) are set only once to preserve original completion times.

7. **Validation:** Stage-specific validations ensure data integrity at each step of the sales cycle.

8. **Permissions:** The permission system uses `uid` for access control while `agentCode` is used for business reporting.

---

## Testing Checklist

- [ ] Create prospect with all required fields
- [ ] Validate email format enforcement
- [ ] Move prospect to appointment stage
- [ ] Mark appointment as completed/declined/kiv
- [ ] Complete successful sale with products
- [ ] Record unsuccessful sale with reason
- [ ] Test agent can only view own prospects (by uid)
- [ ] Test manager can view team prospects
- [ ] Test admin can view all prospects
- [ ] Test permission denial for unauthorized updates
- [ ] Verify totalACE calculation
- [ ] Verify timestamp generation and idempotency
- [ ] Test stage history tracking
- [ ] Verify agentCode is stored correctly

---

## Future Enhancements

Potential features to consider:

1. **Bulk Operations:** Import/export prospects data
2. **Analytics:** Dashboard with sales metrics and conversion rates
3. **Notifications:** Remind agents about upcoming appointments
4. **Comments/Notes:** Add internal notes to prospect records
5. **Attachments:** Upload documents related to prospects
6. **Sales Pipeline:** Visual representation of stage progression
7. **Reporting:** Generate reports by date range, agent code, group, etc.
8. **Audit Log:** Track who made changes and when
9. **Agent Performance:** Track metrics by agentCode for leaderboards
