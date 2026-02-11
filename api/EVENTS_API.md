# Events API Documentation

## Overview

The Events API manages training-related meetups and sessions (coffee hangouts, training sessions, networking events, etc.) that are assigned to one or more groups.

## Base URL

```
/api
```

All endpoints require authentication via Bearer token.

```
Authorization: Bearer <firebase-id-token>
```

---

## Table of Contents

- [Endpoints](#endpoints)
- [Permission Rules](#permission-rules)
- [API Endpoints](#api-endpoints)
  - [1. Create Event](#1-create-event)
  - [2. Get My Events](#2-get-my-events)
  - [3. Get All Events (Admin)](#3-get-all-events-admin)
  - [4. Get Event by ID](#4-get-event-by-id)
  - [5. Update Event](#5-update-event)
  - [6. Delete Event](#6-delete-event)
- [Firestore Document Structure](#firestore-document-structure)
- [Error Handling](#error-handling)
- [Testing Examples](#testing-examples)

---

## Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/events` | Admin, Master Trainer, Trainer, Group Leader | Create a new event |
| `GET` | `/events/my-events` | All authenticated | Get upcoming events for the user's groups |
| `GET` | `/events` | Admin only | Get all events with optional filters |
| `GET` | `/events/:eventId` | All authenticated (role-restricted) | Get a specific event by ID |
| `PUT` | `/events/:eventId` | Admin, Creator | Update an existing event |
| `DELETE` | `/events/:eventId` | Admin, Creator | Delete an event |

> **Router ordering note:** The `/events/my-events` route **must** be registered before `/events/:eventId` in the Express router. If the order is reversed, Express will treat the literal string `"my-events"` as a value for the `:eventId` parameter and the route will never match.

---

## Permission Rules

### Create

| Role | Can create? | Restriction |
|------|-------------|-------------|
| Admin | Yes | Any groups |
| Master Trainer | Yes | Own `managedGroupIds` only |
| Trainer | Yes | Own `managedGroupIds` only |
| Group Leader | Yes | Own `groupId` only (cannot create for other groups) |
| Agent | No | — |

### Read

| Role | What they can view |
|------|-------------------|
| Admin | All events |
| Master Trainer | All events (same as Admin) |
| Trainer | Events assigned to any of their managed groups |
| Group Leader / Agent | Events where their `groupId` is included in `groupIds` |

A user with no `groupId` assigned (Group Leader or Agent) receives an empty list from `GET /events/my-events` and a 403 from `GET /events/:eventId`.

### Update / Delete

| Role | Can modify? |
|------|-------------|
| Admin | Any event |
| Creator (`createdBy === uid`) | Own events only |
| Anyone else | No |

---

## API Endpoints

### 1. Create Event

**Endpoint:** `POST /api/events`

**Authentication:** Required (Admin, Master Trainer, Trainer, or Group Leader)

**Description:** Creates a new event and assigns it to one or more groups. The event is stored with a status of `upcoming`. Group names are denormalized from the groups collection at creation time.

**Request Body:**

```json
{
  "eventTitle": "Coffee Networking Session",
  "date": "2025-03-15T10:00:00Z",
  "venue": "Starbucks KLCC",
  "meetingLink": "https://zoom.us/j/123456789",
  "description": "Casual networking over coffee to share sales tips and strategies.",
  "groupIds": ["group_mdrt_star", "group_sales_power"]
}
```

**Field Validation:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `eventTitle` | string | Yes | Minimum 3 characters |
| `date` | string (ISO 8601) | Yes | Must be a valid date string parseable by `new Date()` |
| `venue` | string | Yes | Minimum 3 characters |
| `description` | string | Yes | Minimum 10 characters |
| `groupIds` | string[] | Yes | Non-empty array; all group IDs must exist in Firestore |
| `meetingLink` | string | No | Must be a valid URL if provided; omit or pass `null` to leave blank |

**Trainer/Master Trainer restriction:** All group IDs in `groupIds` must be present in the requesting user's `managedGroupIds`. Including a group outside the user's managed set returns a `403`.

**Group Leader restriction:** All group IDs in `groupIds` must equal the requesting user's own `groupId`. Group Leaders cannot create events for other groups — doing so returns a `403`.

**Success Response — 201 Created:**

```json
{
  "success": true,
  "eventId": "abc123xyz",
  "message": "Event created successfully"
}
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| `400 Bad Request` | Missing or invalid field (`eventTitle` < 3 chars, invalid ISO date, `venue` < 3 chars, `description` < 10 chars, empty `groupIds` array, invalid `meetingLink` URL) |
| `401 Unauthorized` | No valid auth token |
| `403 Forbidden` | Role not permitted to create events; or Trainer/Master Trainer including a group outside their `managedGroupIds` |
| `404 Not Found` | One or more `groupIds` do not exist in Firestore |
| `500 Internal Server Error` | Unexpected server error |

**Auto-populated fields (not accepted in request body):**

- `createdBy` — Firebase UID of the authenticated user
- `createdByName` — Name from the authenticated user record
- `createdByRole` — Role of the authenticated user
- `groupNames` — Denormalized from each group document in `groupIds`
- `status` — Set to `"upcoming"` on creation
- `createdAt` / `updatedAt` — Server timestamps

---

### 2. Get My Events

**Endpoint:** `GET /api/events/my-events`

**Authentication:** Required (all roles)

**Description:** Returns upcoming events relevant to the authenticated user based on their role and group membership. Results are ordered by `date` ascending (earliest event first).

No query parameters are accepted. The filter is determined entirely by the authenticated user's role and group assignments.

**Behaviour by role:**

| Role | Events returned |
|------|----------------|
| Admin | All events with `status == "upcoming"` |
| Master Trainer | All events with `status == "upcoming"` (same as Admin) |
| Trainer | Upcoming events assigned to any of their `managedGroupIds` |
| Group Leader / Agent | Upcoming events where `groupIds` contains their `groupId` |

> **Firestore `array-contains-any` limit:** Firestore supports at most 10 values in an `array-contains-any` query. If a Trainer or Master Trainer manages more than 10 groups, only the first 10 entries from `managedGroupIds` are queried. A server-side warning is logged when this truncation occurs. Trainers managing more than 10 groups will not see events for groups beyond the first 10 in their list.

> If a Trainer/Master Trainer has an empty `managedGroupIds` array, or a Group Leader/Agent has no `groupId` assigned, an empty `events` array is returned immediately.

**Success Response — 200 OK:**

```json
{
  "events": [
    {
      "id": "event_001",
      "eventTitle": "Coffee Networking Session",
      "date": "2025-03-15T10:00:00.000Z",
      "venue": "Starbucks KLCC",
      "meetingLink": "https://zoom.us/j/123456789",
      "description": "Casual networking over coffee to share sales tips and strategies.",
      "groupIds": ["group_mdrt_star", "group_sales_power"],
      "groupNames": ["MDRT STAR", "SALES POWER"],
      "createdBy": "uid_trainer_01",
      "createdByName": "Ahmad Trainer",
      "createdByRole": "trainer",
      "status": "upcoming",
      "createdAt": { "_seconds": 1739174400, "_nanoseconds": 0 },
      "updatedAt": { "_seconds": 1739174400, "_nanoseconds": 0 }
    }
  ]
}
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| `401 Unauthorized` | No valid auth token |
| `500 Internal Server Error` | Unexpected server error |

---

### 3. Get All Events (Admin)

**Endpoint:** `GET /api/events`

**Authentication:** Required (Admin only)

**Description:** Returns all events across all groups, ordered by `date` descending (most recent first). Supports optional query parameters to filter results.

**Query Parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `upcoming` \| `completed` \| `cancelled` | Filter by event status |
| `groupId` | string | Filter to events that include a specific group ID |

**Example requests:**

```
GET /api/events
GET /api/events?status=upcoming
GET /api/events?groupId=group_mdrt_star
GET /api/events?status=completed&groupId=group_mdrt_star
```

**Success Response — 200 OK:**

```json
{
  "events": [
    {
      "id": "event_001",
      "eventTitle": "Coffee Networking Session",
      "date": "2025-03-15T10:00:00.000Z",
      "venue": "Starbucks KLCC",
      "meetingLink": "https://zoom.us/j/123456789",
      "description": "Casual networking over coffee to share sales tips and strategies.",
      "groupIds": ["group_mdrt_star"],
      "groupNames": ["MDRT STAR"],
      "createdBy": "uid_trainer_01",
      "createdByName": "Ahmad Trainer",
      "createdByRole": "trainer",
      "status": "upcoming",
      "createdAt": { "_seconds": 1739174400, "_nanoseconds": 0 },
      "updatedAt": { "_seconds": 1739174400, "_nanoseconds": 0 }
    }
  ]
}
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| `401 Unauthorized` | No valid auth token |
| `403 Forbidden` | Requesting user is not an admin |
| `500 Internal Server Error` | Unexpected server error |

---

### 4. Get Event by ID

**Endpoint:** `GET /api/events/:eventId`

**Authentication:** Required (all roles, with role-based access restrictions)

**Description:** Returns a single event document. Access is granted based on the same rules that govern `GET /events/my-events` — the user must have a role/group relationship that covers at least one of the event's `groupIds`.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | The Firestore document ID of the event |

**Success Response — 200 OK:**

```json
{
  "event": {
    "id": "event_001",
    "eventTitle": "Coffee Networking Session",
    "date": "2025-03-15T10:00:00.000Z",
    "venue": "Starbucks KLCC",
    "meetingLink": "https://zoom.us/j/123456789",
    "description": "Casual networking over coffee to share sales tips and strategies.",
    "groupIds": ["group_mdrt_star"],
    "groupNames": ["MDRT STAR"],
    "createdBy": "uid_trainer_01",
    "createdByName": "Ahmad Trainer",
    "createdByRole": "trainer",
    "status": "upcoming",
    "createdAt": { "_seconds": 1739174400, "_nanoseconds": 0 },
    "updatedAt": { "_seconds": 1739174400, "_nanoseconds": 0 }
  }
}
```

**Access check logic:**

- Admin — always permitted
- Master Trainer — always permitted (same as Admin)
- Trainer — permitted if any entry in `event.groupIds` is present in the user's `managedGroupIds`
- Group Leader / Agent — permitted if their `groupId` is present in `event.groupIds`

**Error Responses:**

| Status | Reason |
|--------|--------|
| `401 Unauthorized` | No valid auth token |
| `403 Forbidden` | User's role and group assignment do not grant access to this event |
| `404 Not Found` | No event with the given `eventId` exists |
| `500 Internal Server Error` | Unexpected server error |

---

### 5. Update Event

**Endpoint:** `PUT /api/events/:eventId`

**Authentication:** Required (Admin or event creator)

**Description:** Updates one or more fields on an existing event. All request body fields are optional — provide only the fields you want to change. At least one field must be present.

When `groupIds` is updated, `groupNames` is automatically re-fetched from Firestore and updated in the document.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | The Firestore document ID of the event |

**Request Body:**

```json
{
  "eventTitle": "Updated Title",
  "date": "2025-03-20T14:00:00Z",
  "venue": "Pavilion KL",
  "meetingLink": null,
  "description": "Updated description with more details about the training session.",
  "groupIds": ["group_mdrt_star"],
  "status": "cancelled"
}
```

**Field Validation:**

| Field | Type | Validation |
|-------|------|------------|
| `eventTitle` | string | Minimum 3 characters |
| `date` | string (ISO 8601) | Must be a valid date string parseable by `new Date()` |
| `venue` | string | Minimum 3 characters |
| `description` | string | Minimum 10 characters |
| `meetingLink` | string \| null | Valid URL if a string is provided; pass `null` to clear the field |
| `groupIds` | string[] | Non-empty array; all group IDs must exist in Firestore |
| `status` | string | One of `"upcoming"`, `"completed"`, `"cancelled"` |

**Trainer/Master Trainer restriction on `groupIds`:** When a Trainer or Master Trainer updates `groupIds`, every group ID in the new array must be present in their `managedGroupIds`.

**Success Response — 200 OK:**

```json
{
  "success": true,
  "message": "Event updated successfully"
}
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| `400 Bad Request` | No fields provided; field fails validation (min length, invalid date, invalid URL, invalid `status` value, empty `groupIds`) |
| `401 Unauthorized` | No valid auth token |
| `403 Forbidden` | User is not admin and is not the event creator; or Trainer/Master Trainer targeting a group outside their `managedGroupIds` |
| `404 Not Found` | Event not found; or one or more new `groupIds` not found |
| `500 Internal Server Error` | Unexpected server error |

---

### 6. Delete Event

**Endpoint:** `DELETE /api/events/:eventId`

**Authentication:** Required (Admin or event creator)

**Description:** Permanently deletes the event document from Firestore. This action is irreversible. A server-side audit log entry is written on successful deletion.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | The Firestore document ID of the event |

**Success Response — 200 OK:**

```json
{
  "success": true,
  "message": "Event deleted successfully"
}
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| `401 Unauthorized` | No valid auth token |
| `403 Forbidden` | User is not admin and is not the event creator |
| `404 Not Found` | No event with the given `eventId` exists |
| `500 Internal Server Error` | Unexpected server error |

---

## Firestore Document Structure

**Collection:** `events`

```typescript
{
  // Event details
  eventTitle: string;          // e.g. "Coffee Hangout" — min 3 chars
  date: Timestamp;             // Firestore Timestamp (converted from ISO 8601 at write time)
  venue: string;               // e.g. "Starbucks KLCC" — min 3 chars
  meetingLink: string | null;  // e.g. "https://zoom.us/j/..." or null
  description: string;         // min 10 chars

  // Groups this event is assigned to (denormalized for quick reads)
  groupIds: string[];          // e.g. ["group_mdrt_star", "group_sales_power"]
  groupNames: string[];        // e.g. ["MDRT STAR", "SALES POWER"] — kept in sync with groupIds

  // Creator info (denormalized at creation time)
  createdBy: string;           // Firebase UID of the creator
  createdByName: string;       // Display name of the creator
  createdByRole: "admin" | "master_trainer" | "trainer" | "group_leader";

  // Lifecycle
  status: "upcoming" | "completed" | "cancelled";  // defaults to "upcoming" on creation

  // Timestamps (server-generated)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Notes on denormalization:**

- `groupNames` is populated at creation time and updated whenever `groupIds` is changed via `PUT /events/:eventId`. It is not updated automatically if a group's name changes independently.
- `createdByName` and `createdByRole` reflect the creator's details at the time of creation and are not updated if the creator's profile changes.

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Event created successfully |
| 400 | Bad Request | Invalid input or missing required fields |
| 401 | Unauthorized | Not authenticated or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Event or group not found |
| 500 | Internal Server Error | Server error |

### Common Error Response Shape

```json
{
  "error": "Human-readable error message"
}
```

---

## Testing Examples

### Setup

```bash
TOKEN="your-firebase-id-token"
BASE="http://localhost:3000/api"
EVENT_ID="replace-with-actual-event-id"
```

### 1. Create an event

```bash
curl -X POST "$BASE/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventTitle": "Coffee Networking Session",
    "date": "2025-03-15T10:00:00Z",
    "venue": "Starbucks KLCC",
    "meetingLink": "https://zoom.us/j/123456789",
    "description": "Casual networking over coffee to share sales tips and strategies.",
    "groupIds": ["group_mdrt_star"]
  }'
```

### 2. Get upcoming events for the authenticated user

```bash
curl "$BASE/events/my-events" \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Get all events (admin) — with optional filters

```bash
# All events
curl "$BASE/events" \
  -H "Authorization: Bearer $TOKEN"

# Filter by status
curl "$BASE/events?status=upcoming" \
  -H "Authorization: Bearer $TOKEN"

# Filter by group
curl "$BASE/events?groupId=group_mdrt_star" \
  -H "Authorization: Bearer $TOKEN"

# Combine filters
curl "$BASE/events?status=completed&groupId=group_mdrt_star" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Get a specific event

```bash
curl "$BASE/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Update an event (partial update)

```bash
# Mark as completed
curl -X PUT "$BASE/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# Update title and venue
curl -X PUT "$BASE/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventTitle": "Updated Networking Session",
    "venue": "Pavilion KL"
  }'

# Clear meetingLink
curl -X PUT "$BASE/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meetingLink": null}'
```

### 6. Delete an event

```bash
curl -X DELETE "$BASE/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Notes

1. **Route ordering:** The `/events/my-events` route must be registered before `/events/:eventId` in the Express router to prevent `"my-events"` from being captured as a dynamic parameter.

2. **Firestore `array-contains-any` limit:** Trainers and Master Trainers with more than 10 managed groups will only have the first 10 queried in `GET /events/my-events`. This is a hard Firestore constraint. A warning is logged on the server when truncation occurs.

3. **Group name denormalization:** `groupNames` is written at event creation and updated whenever `groupIds` is changed via the Update endpoint. It does not sync automatically with changes to the underlying group documents.

4. **Creator denormalization:** `createdBy`, `createdByName`, and `createdByRole` are captured once at creation and never updated.

5. **Status is not auto-updated:** The `status` field must be updated manually via `PUT /events/:eventId`. The system does not automatically transition events from `upcoming` to `completed` based on the `date` field.

6. **Deletion is permanent:** There is no soft-delete or archive mechanism. A deleted event cannot be recovered via the API.

---

## Changelog

### Version 1.1.0 (2026-02-12)

- `EventCreatorRole` type now includes `group_leader`
- `POST /events`: Group Leaders can now create events; restricted to their own `groupId` only. Including any other group returns a 403.
- `GET /events/:eventId` (`canViewEvent`): Master Trainer now treated the same as Admin — can view any event regardless of group membership
- `GET /events/my-events`: Master Trainer now receives all upcoming events (same as Admin)
- Updated permission tables and endpoint access descriptions throughout

### Version 1.0.0 (2026-02-11)

- Initial Events API documentation
- Documented all 6 endpoints: POST /events, GET /events/my-events, GET /events, GET /events/:eventId, PUT /events/:eventId, DELETE /events/:eventId
- Included permission rules, field validation tables, Firestore document structure, and curl testing examples
- Noted `my-events` route ordering caveat
- Noted Firestore `array-contains-any` 10-group limit for `getMyEvents`
