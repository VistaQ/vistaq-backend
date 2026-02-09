# User Management API Documentation

Complete API reference for user management endpoints.

## Base URL

```
http://localhost:3000/api
```

## Authentication

All endpoints require JWT authentication via Firebase. Include the token in the Authorization header:

```
Authorization: Bearer <firebase-id-token>
```

---

## Endpoints

### 1. Get Current User Profile

Retrieves the full profile of the currently authenticated user.

**Endpoint:** `GET /users/me`

**Authorization:** All authenticated users

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "user": {
    "uid": "abc123",
    "email": "john.doe@example.com",
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

**Error Responses:**
- `401 Unauthorized`: Not authenticated
  ```json
  { "error": "Not authenticated" }
  ```
- `404 Not Found`: User document not found
  ```json
  { "error": "User document not found" }
  ```

---

### 2. Get User by ID

Retrieves a specific user by their Firebase UID.

**Endpoint:** `GET /users/:userId`

**Authorization:**
- Admin: Can view any user
- Trainer/Master Trainer: Can view users in their managed groups
- Group Leader: Can view users in their own group
- Others: Can only view themselves

**Path Parameters:**
- `userId` (required): Firebase UID of the user

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "user": {
    "uid": "def456",
    "email": "jane.smith@example.com",
    "name": "Jane Smith",
    "phone": "+60123456789",
    "location": "Penang",
    "agency": "XYZ Insurance",
    "role": "agent",
    "permissions": [],
    "groupId": "group123",
    "groupName": "Team Alpha",
    "agentCode": "Agent 02",
    "managedGroupIds": null,
    "totalProspects": 15,
    "totalAppointments": 8,
    "totalSales": 3,
    "totalACE": 7500,
    "totalPoints": 225,
    "currentBadge": "Star Performer",
    "currentBadgeColor": "gold",
    "status": "active",
    "createdAt": "2024-01-10T08:00:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: No permission to view this user
  ```json
  { "error": "You do not have permission to view this user" }
  ```
- `404 Not Found`: User not found
  ```json
  { "error": "User not found" }
  ```

---

### 3. Get All Users

Retrieves a list of users with optional filtering.

**Endpoint:** `GET /users`

**Authorization:**
- Admin: Can view all users
- Trainer/Master Trainer: Can view users in their managed groups only
- Others: Forbidden

**Query Parameters:**
- `role` (optional): Filter by role (e.g., "agent", "trainer", "group_leader")
- `groupId` (optional): Filter by group ID
- `status` (optional): Filter by status ("active", "inactive", "suspended")
- `limit` (optional): Maximum number of results (default: 100, max: 100)

**Headers:**
```
Authorization: Bearer <token>
```

**Example Requests:**
```
GET /users
GET /users?role=agent
GET /users?groupId=group123
GET /users?status=active&limit=50
GET /users?role=agent&groupId=group123&status=active
```

**Success Response (200 OK):**
```json
{
  "users": [
    {
      "uid": "abc123",
      "email": "john.doe@example.com",
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
    },
    {
      "uid": "def456",
      "email": "jane.smith@example.com",
      "name": "Jane Smith",
      "phone": "+60123456780",
      "location": "Penang",
      "agency": "XYZ Insurance",
      "role": "agent",
      "permissions": [],
      "groupId": "group123",
      "groupName": "Team Alpha",
      "agentCode": "Agent 02",
      "managedGroupIds": null,
      "totalProspects": 15,
      "totalAppointments": 8,
      "totalSales": 3,
      "totalACE": 7500,
      "totalPoints": 225,
      "currentBadge": "Star Performer",
      "currentBadgeColor": "gold",
      "status": "active",
      "createdAt": "2024-01-10T08:00:00Z",
      "updatedAt": "2024-01-15T12:00:00Z"
    }
  ],
  "count": 2
}
```

**Error Responses:**
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: No permission to view users
  ```json
  { "error": "You do not have permission to view users" }
  ```

**Notes:**
- For trainers with more than 10 managed groups, only the first 10 will be queried due to Firestore's `in` operator limit
- Results are limited to 100 users per request

---

### 4. Get Users by Group

Retrieves all users in a specific group.

**Endpoint:** `GET /users/group/:groupId`

**Authorization:**
- Admin: Can view any group's users
- Trainer/Master Trainer: Can view if groupId is in their managedGroupIds
- Group Leader: Can view their own group only
- Others: Forbidden

**Path Parameters:**
- `groupId` (required): The group ID

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "users": [
    {
      "uid": "abc123",
      "email": "john.doe@example.com",
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
  ],
  "groupName": "Team Alpha"
}
```

**Error Responses:**
- `400 Bad Request`: Group ID is required
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: No permission to view this group's users
  ```json
  { "error": "You do not have permission to view this group's users" }
  ```
- `404 Not Found`: Group not found
  ```json
  { "error": "Group not found" }
  ```

---

### 5. Update User

Updates user information. Permissions vary by role.

**Endpoint:** `PUT /users/:userId`

**Authorization:**
- Admin: Can update any user, any field
- User updating self: Can only update name, phone, location
- Others: Forbidden

**Path Parameters:**
- `userId` (required): Firebase UID of the user to update

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (Admin):**
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

**Request Body (Self-Update):**
```json
{
  "name": "John Doe",
  "phone": "+60123456789",
  "location": "Kuala Lumpur"
}
```

**Field Descriptions:**

| Field | Type | Admin Only | Description |
|-------|------|------------|-------------|
| name | string | No | User's full name (min 2 chars) |
| phone | string | No | Phone number |
| location | string | No | Location/city |
| agency | string | Yes | Insurance agency name |
| role | string | Yes | User role (admin, master_trainer, trainer, group_leader, agent) |
| groupId | string \| null | Yes | Group ID (set to null to remove from group) |
| status | string | Yes | User status (active, inactive, suspended) |

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "User updated successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid data
  ```json
  { "error": "Name must be at least 2 characters" }
  ```
  ```json
  { "error": "Invalid role" }
  ```
  ```json
  { "error": "No valid fields to update" }
  ```
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: No permission to update this user
  ```json
  { "error": "You do not have permission to update this user" }
  ```
  ```json
  {
    "error": "You can only update your name, phone, and location. Other fields require admin privileges."
  }
  ```
- `404 Not Found`: User or group not found
  ```json
  { "error": "User not found" }
  ```
  ```json
  { "error": "Group not found" }
  ```

**Notes:**
- When updating `groupId`, the system automatically fetches and updates `groupName`
- Setting `groupId` to `null` will clear both `groupId` and `groupName`
- Admin actions are logged for audit purposes

---

### 6. Update User Status

Updates a user's status and enables/disables their Firebase Auth account.

**Endpoint:** `PATCH /users/:userId/status`

**Authorization:** Admin only

**Path Parameters:**
- `userId` (required): Firebase UID of the user

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "inactive"
}
```

**Allowed Status Values:**
- `"active"`: User is active and can log in
- `"inactive"`: User is inactive and cannot log in

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "User status updated successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid status
  ```json
  { "error": "Status must be \"active\" or \"inactive\"" }
  ```
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not admin
  ```json
  { "error": "Only administrators can update user status" }
  ```
- `404 Not Found`: User not found
  ```json
  { "error": "User not found" }
  ```

**Notes:**
- When status is set to "inactive", the Firebase Auth account is disabled
- When status is set to "active", the Firebase Auth account is enabled
- All status changes are logged for audit purposes

---

### 7. Delete User

Permanently deletes a user from Firebase Auth and Firestore.

**Endpoint:** `DELETE /users/:userId`

**Authorization:** Admin only

**CAUTION:** This is a permanent operation. Consider using `PATCH /users/:userId/status` with "inactive" for soft delete.

**Path Parameters:**
- `userId` (required): Firebase UID of the user to delete

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Validation errors
  ```json
  { "error": "User ID is required" }
  ```
  ```json
  { "error": "You cannot delete yourself" }
  ```
  ```json
  {
    "error": "Cannot delete trainer with assigned groups. Please reassign groups first."
  }
  ```
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not admin
  ```json
  { "error": "Only administrators can delete users" }
  ```
- `404 Not Found`: User not found
  ```json
  { "error": "User not found" }
  ```

**Cascade Operations:**
- If user is in a group, they are automatically removed from the group's memberIds
- If user is a trainer with managed groups, deletion is blocked (groups must be reassigned first)
- User is deleted from both Firestore and Firebase Auth

**Notes:**
- Cannot delete yourself
- Cannot delete a trainer with assigned groups
- All deletions are logged for audit purposes

---

## Data Models

### UserData

```typescript
interface UserData {
  uid: string;                   // Firebase Auth UID
  email: string;                 // Email address
  name: string;                  // Full name
  phone: string;                 // Phone number
  location: string;              // Location/city
  agency: string;                // Insurance agency name

  role: UserRole;                // User role
  permissions: string[];         // Array of permissions

  groupId: string | null;        // Group ID (null if not in a group)
  groupName: string | null;      // Group name (null if not in a group)

  agentCode: string | null;      // Agent code (null for non-agents)
  managedGroupIds?: string[] | null; // For trainers - groups they manage

  totalProspects: number;        // Total prospects created
  totalAppointments: number;     // Total appointments scheduled
  totalSales: number;            // Total sales closed
  totalACE: number;              // Total ACE value
  totalPoints: number;           // Total gamification points
  currentBadge: string;          // Current badge name
  currentBadgeColor?: string;    // Badge color

  status: UserStatus;            // Account status

  createdAt: Timestamp | Date;   // Creation timestamp
  updatedAt: Timestamp | Date;   // Last update timestamp
}
```

### UserRole

```typescript
type UserRole =
  | 'admin'
  | 'master_trainer'
  | 'trainer'
  | 'group_leader'
  | 'agent'
  | 'manager'
  | 'viewer';
```

### UserStatus

```typescript
type UserStatus = 'active' | 'inactive' | 'suspended';
```

---

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

---

## Example Usage

### Using cURL

**Get current user profile:**
```bash
curl -X GET \
  -H "Authorization: Bearer <your-token>" \
  http://localhost:3000/api/users/me
```

**Get all active agents:**
```bash
curl -X GET \
  -H "Authorization: Bearer <admin-token>" \
  "http://localhost:3000/api/users?role=agent&status=active"
```

**Update your own profile:**
```bash
curl -X PUT \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "phone": "+60123456789", "location": "Kuala Lumpur"}' \
  http://localhost:3000/api/users/<your-user-id>
```

**Admin: Update user role and group:**
```bash
curl -X PUT \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "group_leader", "groupId": "group123"}' \
  http://localhost:3000/api/users/<user-id>
```

**Admin: Deactivate a user:**
```bash
curl -X PATCH \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}' \
  http://localhost:3000/api/users/<user-id>/status
```

**Admin: Delete a user:**
```bash
curl -X DELETE \
  -H "Authorization: Bearer <admin-token>" \
  http://localhost:3000/api/users/<user-id>
```

### Using JavaScript (Fetch API)

```javascript
// Get current user profile
const getMyProfile = async (token) => {
  const response = await fetch('http://localhost:3000/api/users/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return await response.json();
};

// Get all users (admin/trainer)
const getAllUsers = async (token, filters = {}) => {
  const params = new URLSearchParams(filters);
  const response = await fetch(`http://localhost:3000/api/users?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return await response.json();
};

// Update user
const updateUser = async (token, userId, data) => {
  const response = await fetch(`http://localhost:3000/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return await response.json();
};

// Update user status (admin only)
const updateUserStatus = async (adminToken, userId, status) => {
  const response = await fetch(`http://localhost:3000/api/users/${userId}/status`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  return await response.json();
};
```

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200 OK`: Successful operation
- `400 Bad Request`: Invalid input or validation error
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Authenticated but insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server-side error

---

## Rate Limiting

Currently, there are no rate limits enforced. This may change in production.

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release of User Management API
- Endpoints for viewing, updating, and managing users
- Role-based access control
- Firebase Auth integration
