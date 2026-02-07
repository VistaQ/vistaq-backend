# Sales Management API Documentation

## Overview

The Sales Management System handles the complete 3-stage sales cycle:
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

All sales endpoints require authentication via Firebase ID token.

**Headers:**
```
Authorization: Bearer <firebase_id_token>
```

---

## Permissions

### User Roles

| Role | Can Create | Can View | Can Update |
|------|-----------|----------|------------|
| **agent** | Own sales | Own sales only | Own sales only |
| **manager** | Own sales | Own + team sales (same groupId) | Own sales only |
| **admin** | Own sales | All sales | All sales |

### Permission Rules

- **View Sales:**
  - Agents: Only their own sales (`agentId === user.uid`)
  - Managers: Their team's sales (`groupId === user.groupId`)
  - Admins: All sales

- **Update Sales:**
  - Agents: Only their own sales
  - Admins: Any sales

---

## API Endpoints

### 1. Create Sale (Prospect Stage)

**Endpoint:** `POST /api/sales`

**Description:** Create a new sale record at the prospect stage.

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
  "saleId": "sale_abc123xyz",
  "message": "Sale created successfully"
}
```

**Auto-Generated Fields:**
- `currentStage`: "prospect"
- `agentId`, `agentName`, `agentEmail`: From authenticated user
- `groupId`, `groupName`: From authenticated user
- `prospectEnteredAt`: Current timestamp
- `stageHistory`: Array with initial stage entry
- `createdAt`, `updatedAt`: Current timestamp

---

### 2. Get My Sales

**Endpoint:** `GET /api/sales/my-sales`

**Description:** Get all sales for the authenticated user.

**Required Role:** Any authenticated user

**Query Parameters:**
- `limit` (optional): Number of records to return

**Response (200 OK):**
```json
{
  "sales": [
    {
      "id": "sale_abc123",
      "currentStage": "prospect",
      "prospectName": "John Doe",
      "prospectEmail": "john@example.com",
      "prospectPhone": "+60123456789",
      "agentId": "user123",
      "agentName": "Agent Smith",
      "groupId": "group456",
      "groupName": "Team Alpha",
      "createdAt": { "_seconds": 1234567890, "_nanoseconds": 0 }
    }
  ]
}
```

---

### 3. Get Specific Sale

**Endpoint:** `GET /api/sales/:id`

**Description:** Get details of a specific sale by ID.

**Required Role:** User must have permission to view the sale

**Response (200 OK):**
```json
{
  "sale": {
    "id": "sale_abc123",
    "currentStage": "appointment",
    "prospectName": "John Doe",
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
  "error": "You do not have permission to view this sale"
}
```

---

### 4. Update Sale

**Endpoint:** `PUT /api/sales/:id`

**Description:** Update a sale record (move to next stage or update fields).

**Required Role:** Owner of the sale or admin

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
- `appointmentCompletedAt`: Set when status = "completed"
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
- `salesCompletedAt`: Current timestamp
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
  "message": "Sale updated successfully"
}
```

---

### 5. Get Group Sales

**Endpoint:** `GET /api/sales/group/:groupId`

**Description:** Get all sales for a specific group.

**Required Role:** `manager` (own group only), `admin` (any group)

**Query Parameters:**
- `limit` (optional): Number of records to return

**Response (200 OK):**
```json
{
  "sales": [
    {
      "id": "sale_123",
      "currentStage": "sales",
      "groupId": "group456",
      "groupName": "Team Alpha",
      ...
    }
  ]
}
```

**Error (403 Forbidden):**
```json
{
  "error": "You do not have permission to view this group's sales"
}
```

---

### 6. Get All Sales (Admin Only)

**Endpoint:** `GET /api/admin/all-sales`

**Description:** Get all sales across all groups and agents.

**Required Role:** `admin`

**Query Parameters:**
- `limit` (optional): Number of records to return

**Response (200 OK):**
```json
{
  "sales": [
    {
      "id": "sale_123",
      "currentStage": "sales",
      "agentName": "Agent Smith",
      "groupName": "Team Alpha",
      ...
    }
  ]
}
```

---

## Data Models

### SaleRecord

```typescript
interface SaleRecord {
  id?: string;

  // Stage tracking
  currentStage: 'prospect' | 'appointment' | 'sales';
  stageHistory: Array<{
    stage: string;
    enteredAt: Timestamp;
  }>;

  // Agent info (denormalized)
  agentId: string;
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

### Complete Sales Flow

#### Step 1: Create Prospect
```bash
curl -X POST http://localhost:3000/api/sales \
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
  "saleId": "sale_abc123"
}
```

#### Step 2: Update to Appointment
```bash
curl -X PUT http://localhost:3000/api/sales/sale_abc123 \
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
curl -X PUT http://localhost:3000/api/sales/sale_abc123 \
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
curl -X PUT http://localhost:3000/api/sales/sale_abc123 \
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
  "error": "You do not have permission to update this sale"
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

### Collection Name: `sales_records`

### Indexes Required

Create these composite indexes in Firestore:

1. **By Agent and Date:**
   - Collection: `sales_records`
   - Fields: `agentId` (Ascending), `createdAt` (Descending)

2. **By Group and Date:**
   - Collection: `sales_records`
   - Fields: `groupId` (Ascending), `createdAt` (Descending)

3. **By Date (for admin):**
   - Collection: `sales_records`
   - Fields: `createdAt` (Descending)

### Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sales_records/{saleId} {
      // Allow read if user is the agent, in the same group (manager), or admin
      allow read: if request.auth != null && (
        resource.data.agentId == request.auth.uid ||
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'manager' &&
         resource.data.groupId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.groupId) ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );

      // Allow create if authenticated as agent or manager
      allow create: if request.auth != null && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['agent', 'manager']
      );

      // Allow update if owner or admin
      allow update: if request.auth != null && (
        resource.data.agentId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );
    }
  }
}
```

---

## Notes

1. **Denormalization:** Agent and group information is stored directly in each sale record to optimize read performance and maintain historical accuracy.

2. **Stage History:** The `stageHistory` array tracks when the sale moved between stages, useful for analytics and reporting.

3. **Timestamps:** All timestamps use Firebase Firestore `Timestamp` type, which includes seconds and nanoseconds.

4. **Auto-Calculation:** The `totalACE` field is automatically calculated as the sum of all `aceAmount` values in `productsSold`.

5. **Validation:** Stage-specific validations ensure data integrity at each step of the sales cycle.

6. **Permissions:** The permission system ensures agents can only see their own sales while managers can monitor their team's performance.

---

## Testing Checklist

- [ ] Create prospect with all required fields
- [ ] Validate email format enforcement
- [ ] Move prospect to appointment stage
- [ ] Mark appointment as completed/declined/kiv
- [ ] Complete successful sale with products
- [ ] Record unsuccessful sale with reason
- [ ] Test agent can only view own sales
- [ ] Test manager can view team sales
- [ ] Test admin can view all sales
- [ ] Test permission denial for unauthorized updates
- [ ] Verify totalACE calculation
- [ ] Verify timestamp generation
- [ ] Test stage history tracking

---

## Future Enhancements

Potential features to consider:

1. **Bulk Operations:** Import/export sales data
2. **Analytics:** Dashboard with sales metrics and conversion rates
3. **Notifications:** Remind agents about upcoming appointments
4. **Comments/Notes:** Add internal notes to sales records
5. **Attachments:** Upload documents related to sales
6. **Sales Pipeline:** Visual representation of stage progression
7. **Reporting:** Generate reports by date range, agent, group, etc.
8. **Audit Log:** Track who made changes and when
