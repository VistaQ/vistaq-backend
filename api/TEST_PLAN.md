# API Test Plan

## Test Fixtures

Assume the following seeded users and groups are available for all tests. Replace IDs with real values in a live environment.

```
ADMIN_TOKEN        — token for a user with role: "admin"
TRAINER_TOKEN      — token for a trainer managing GROUP_A_ID (managedGroupIds: [GROUP_A_ID])
MASTER_TOKEN       — token for a master_trainer
LEADER_TOKEN       — token for a group_leader in GROUP_A_ID
AGENT_TOKEN        — token for an agent in GROUP_A_ID
AGENT_B_TOKEN      — token for an agent in GROUP_B_ID
UNAUTHED           — no Authorization header

ADMIN_UID          — UID of the admin user
TRAINER_UID        — UID of the trainer
LEADER_UID         — UID of the group_leader
AGENT_UID          — UID of the agent in GROUP_A
AGENT_B_UID        — UID of the agent in GROUP_B

GROUP_A_ID         — Firestore ID of a group managed by TRAINER
GROUP_B_ID         — Firestore ID of a group NOT managed by TRAINER
```

---

## 1. Auth

### 1.1 `POST /auth/register` — Agent self-registration

**TC-A01 — Valid registration**
```json
POST /auth/register
Body:
{
  "fullName": "Jane Smith",
  "agentCode": "A999",
  "email": "jane.smith@example.com",
  "password": "secret123",
  "groupId": "<GROUP_A_ID>",
  "acknowledged": true
}
```
Expected: `201 Created`
```json
{
  "success": true,
  "token": "<firebase_id_token>",
  "user": {
    "uid": "<uid>",
    "email": "jane.smith@example.com",
    "name": "Jane Smith",
    "role": "agent",
    "groupId": "<GROUP_A_ID>",
    "groupName": "<group name>",
    "agentCode": "A999"
  }
}
```

**TC-A02 — Duplicate email**
```json
POST /auth/register
Body: { ...same as TC-A01 }
```
Expected: `409 Conflict` `{ "error": "Email already registered" }`

**TC-A03 — Duplicate agentCode**
```json
Body: { "fullName": "Other Agent", "agentCode": "A999", "email": "other@example.com", "password": "secret123", "groupId": "<GROUP_A_ID>", "acknowledged": true }
```
Expected: `400 Bad Request` `{ "error": "Agent code already exists" }`

**TC-A04 — Missing required field (`email`)**
```json
Body: { "fullName": "Jane", "agentCode": "A001", "password": "secret123", "groupId": "<GROUP_A_ID>", "acknowledged": true }
```
Expected: `400 Bad Request`

**TC-A05 — `acknowledged` is false**
```json
Body: { "fullName": "Jane", "agentCode": "A002", "email": "j@x.com", "password": "secret123", "groupId": "<GROUP_A_ID>", "acknowledged": false }
```
Expected: `400 Bad Request` `{ "error": "You must acknowledge the privacy policy" }`

**TC-A06 — Password too short**
```json
Body: { "fullName": "Jane", "agentCode": "A003", "email": "j2@x.com", "password": "123", "groupId": "<GROUP_A_ID>", "acknowledged": true }
```
Expected: `400 Bad Request` `{ "error": "Password must be at least 6 characters" }`

**TC-A07 — Non-existent groupId**
```json
Body: { "fullName": "Jane", "agentCode": "A004", "email": "j3@x.com", "password": "secret123", "groupId": "nonexistent", "acknowledged": true }
```
Expected: `404 Not Found` `{ "error": "Group not found" }`

---

### 1.2 `POST /auth/login`

**TC-A08 — Valid credentials**
```json
POST /auth/login
Body: { "email": "admin@example.com", "password": "adminpass" }
```
Expected: `200 OK`
```json
{
  "token": "<firebase_id_token>",
  "user": { "uid": "...", "email": "...", "name": "...", "role": "admin", ... }
}
```

**TC-A09 — Wrong password**
```json
Body: { "email": "admin@example.com", "password": "wrongpass" }
```
Expected: `401 Unauthorized` `{ "error": "Invalid email or password" }`

**TC-A10 — Unknown email**
```json
Body: { "email": "nobody@example.com", "password": "anything" }
```
Expected: `401 Unauthorized`

**TC-A11 — Missing email**
```json
Body: { "password": "secret123" }
```
Expected: `400 Bad Request` `{ "error": "Email and password are required" }`

**TC-A12 — Inactive user**
> Precondition: set the user's status to "inactive" in Firestore before running.
```json
Body: { "email": "inactive@example.com", "password": "secret123" }
```
Expected: `403 Forbidden` `{ "error": "User account is not active" }`

---

### 1.3 `POST /admin/users` — Admin user creation

**TC-A13 — Admin creates an agent**
```
POST /admin/users
Authorization: Bearer <ADMIN_TOKEN>
Body:
{
  "email": "newagent@example.com",
  "password": "password123",
  "name": "New Agent",
  "role": "agent",
  "agentCode": "A100"
}
```
Expected: `201 Created`
```json
{ "success": true, "userId": "<uid>", "agentCode": "A100", "message": "User created successfully" }
```

**TC-A14 — Admin creates a trainer**
```json
{
  "email": "newtrainer@example.com",
  "password": "password123",
  "name": "New Trainer",
  "role": "trainer"
}
```
Expected: `201 Created` (no `agentCode` in response)

**TC-A15 — Non-admin attempts user creation**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-A16 — Missing required field (`role`)**
```json
{ "email": "x@x.com", "password": "password123", "name": "X" }
```
Expected: `400 Bad Request` `{ "error": "Email, password, name, and role are required" }`

**TC-A17 — Agent role without agentCode**
```json
{ "email": "y@x.com", "password": "password123", "name": "Y", "role": "agent" }
```
Expected: `400 Bad Request` `{ "error": "Agents and group leaders must have an agent code" }`

**TC-A18 — Invalid role value**
```json
{ "email": "z@x.com", "password": "password123", "name": "Z", "role": "superuser" }
```
Expected: `400 Bad Request`

**TC-A19 — Duplicate email**
```json
{ "email": "newagent@example.com", "password": "password123", "name": "Dup", "role": "trainer" }
```
Expected: `409 Conflict` `{ "error": "Email already exists" }`

---

## 2. Users

### 2.1 `GET /users/me`

**TC-U01 — Authenticated user**
```
GET /users/me
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK` `{ "user": { "uid": "<AGENT_UID>", "role": "agent", ... } }`

**TC-U02 — Unauthenticated**
```
GET /users/me
(no Authorization header)
```
Expected: `401 Unauthorized`

---

### 2.2 `GET /users/:userId`

**TC-U03 — Admin fetches any user**
```
GET /users/<AGENT_UID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK`

**TC-U04 — Trainer fetches user in managed group**
```
GET /users/<AGENT_UID>   (AGENT is in GROUP_A, managed by TRAINER)
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-U05 — Trainer fetches user in unmanaged group**
```
GET /users/<AGENT_B_UID>   (AGENT_B is in GROUP_B)
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-U06 — User fetches self**
```
GET /users/<AGENT_UID>
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK`

**TC-U07 — Group leader fetches member of own group**
```
GET /users/<AGENT_UID>
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `200 OK`

**TC-U08 — Group leader fetches user in different group**
```
GET /users/<AGENT_B_UID>
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `403 Forbidden`

**TC-U09 — Non-existent user ID**
```
GET /users/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

### 2.3 `GET /users`

**TC-U10 — Admin, no filters**
```
GET /users
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "users": [...], "count": <n> }`

**TC-U11 — Admin filters by role**
```
GET /users?role=agent
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` — all returned users have `role: "agent"`

**TC-U12 — Admin filters by groupId**
```
GET /users?groupId=<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` — all returned users have `groupId: "<GROUP_A_ID>"`

**TC-U13 — Admin filters by status**
```
GET /users?status=inactive
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK`

**TC-U14 — Trainer sees only users in managed groups**
```
GET /users
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK` — no user from GROUP_B appears in results

**TC-U15 — Agent (no permission)**
```
GET /users
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

---

### 2.4 `GET /users/group/:groupId`

**TC-U16 — Admin**
```
GET /users/group/<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "users": [...], "groupName": "<name>" }`

**TC-U17 — Trainer for managed group**
```
GET /users/group/<GROUP_A_ID>
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-U18 — Trainer for unmanaged group**
```
GET /users/group/<GROUP_B_ID>
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-U19 — Group leader for own group**
```
GET /users/group/<GROUP_A_ID>
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `200 OK`

**TC-U20 — Group leader for other group**
```
GET /users/group/<GROUP_B_ID>
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `403 Forbidden`

**TC-U21 — Non-existent group**
```
GET /users/group/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

### 2.5 `PUT /users/:userId`

**TC-U22 — Admin updates any field**
```
PUT /users/<AGENT_UID>
Authorization: Bearer <ADMIN_TOKEN>
Body: { "name": "Updated Name", "agency": "New Agency", "email": "new@example.com" }
```
Expected: `200 OK` `{ "success": true, "message": "User updated successfully" }`

**TC-U23 — User updates own allowed fields**
```
PUT /users/<AGENT_UID>
Authorization: Bearer <AGENT_TOKEN>
Body: { "name": "Self Update", "phone": "0123456789", "location": "KL" }
```
Expected: `200 OK`

**TC-U24 — User attempts to update restricted field**
```
PUT /users/<AGENT_UID>
Authorization: Bearer <AGENT_TOKEN>
Body: { "role": "admin" }
```
Expected: `403 Forbidden` `{ "error": "You can only update your name, phone, and location..." }`

**TC-U25 — User updates another user**
```
PUT /users/<AGENT_B_UID>
Authorization: Bearer <AGENT_TOKEN>
Body: { "name": "Hacked" }
```
Expected: `403 Forbidden`

**TC-U26 — Admin changes role agent → group_leader (user in a group)**
```
PUT /users/<AGENT_UID>
Authorization: Bearer <ADMIN_TOKEN>
Body: { "role": "group_leader" }
```
Expected: `200 OK` — group document updated with new leader fields

**TC-U27 — Admin changes role to trainer while user is in a group**
```
PUT /users/<AGENT_UID>   (user has groupId set)
Authorization: Bearer <ADMIN_TOKEN>
Body: { "role": "trainer" }
```
Expected: `400 Bad Request` `{ "error": "Trainers cannot be members of groups. Remove from group first." }`

**TC-U28 — Admin changes role trainer → agent while trainer manages groups**
```
PUT /users/<TRAINER_UID>  (managedGroupIds is non-empty)
Authorization: Bearer <ADMIN_TOKEN>
Body: { "role": "agent" }
```
Expected: `400 Bad Request` `{ "error": "Cannot change role while managing groups. Reassign groups first." }`

**TC-U29 — Admin updates email to one already in use**
```
PUT /users/<AGENT_UID>
Authorization: Bearer <ADMIN_TOKEN>
Body: { "email": "admin@example.com" }
```
Expected: `409 Conflict` `{ "error": "Email already in use" }`

**TC-U30 — No valid fields provided**
```
PUT /users/<AGENT_UID>
Authorization: Bearer <AGENT_TOKEN>
Body: {}
```
Expected: `400 Bad Request` `{ "error": "No valid fields to update" }`

---

### 2.6 `PATCH /admin/users/:userId/status`

**TC-U31 — Admin sets user inactive**
```
PATCH /admin/users/<AGENT_UID>/status
Authorization: Bearer <ADMIN_TOKEN>
Body: { "status": "inactive" }
```
Expected: `200 OK`

**TC-U32 — Admin sets user active**
```
Body: { "status": "active" }
```
Expected: `200 OK`

**TC-U33 — Invalid status value**
```
Body: { "status": "banned" }
```
Expected: `400 Bad Request` `{ "error": "Status must be \"active\" or \"inactive\"" }`

**TC-U34 — Non-admin**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-U35 — Non-existent user**
```
PATCH /admin/users/doesnotexist/status
Body: { "status": "inactive" }
```
Expected: `404 Not Found`

---

### 2.7 `DELETE /admin/users/:userId`

**TC-U36 — Admin deletes a user**
```
DELETE /admin/users/<AGENT_UID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "success": true, "message": "User deleted successfully" }`
Side effects: user removed from group's `memberIds`, Firebase Auth account deleted

**TC-U37 — Admin attempts to delete self**
```
DELETE /admin/users/<ADMIN_UID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `400 Bad Request` `{ "error": "You cannot delete yourself" }`

**TC-U38 — Admin deletes trainer with assigned groups**
```
DELETE /admin/users/<TRAINER_UID>   (managedGroupIds is non-empty)
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `400 Bad Request` `{ "error": "Cannot delete trainer with assigned groups..." }`

**TC-U39 — Non-admin**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-U40 — Non-existent user**
```
DELETE /admin/users/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

## 3. Groups

### 3.1 `POST /admin/groups`

**TC-G01 — Admin creates a group**
```
POST /admin/groups
Authorization: Bearer <ADMIN_TOKEN>
Body:
{
  "name": "Alpha Squad",
  "trainerIds": ["<TRAINER_UID>"],
  "leaderId": "<AGENT_UID>",
  "memberIds": ["<AGENT_UID>", "<AGENT_B_UID>"]
}
```
Expected: `201 Created`
```json
{ "success": true, "groupId": "<new_group_id>", "message": "Group created successfully" }
```
Side effects: AGENT_UID promoted to `group_leader`; all members' `groupId` updated; trainer's `managedGroupIds` updated.

**TC-G02 — Non-admin**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-G03 — Group name too short**
```json
Body: { "name": "AB", "trainerIds": ["<TRAINER_UID>"], "leaderId": "<AGENT_UID>", "memberIds": ["<AGENT_UID>"] }
```
Expected: `400 Bad Request` `{ "error": "Group name is required and must be at least 3 characters" }`

**TC-G04 — Missing trainerIds**
```json
Body: { "name": "Valid Name", "leaderId": "<AGENT_UID>", "memberIds": ["<AGENT_UID>"] }
```
Expected: `400 Bad Request`

**TC-G05 — leaderId not in memberIds**
```json
Body: { "name": "Valid Name", "trainerIds": ["<TRAINER_UID>"], "leaderId": "<AGENT_UID>", "memberIds": ["<AGENT_B_UID>"] }
```
Expected: `400 Bad Request` `{ "error": "Leader must be included in memberIds array" }`

**TC-G06 — trainerIds contains a non-trainer user**
```json
Body: { "name": "Valid Name", "trainerIds": ["<AGENT_UID>"], "leaderId": "<AGENT_UID>", "memberIds": ["<AGENT_UID>"] }
```
Expected: `403` or `404` depending on whether the user exists

**TC-G07 — Non-existent leaderId**
```json
Body: { "name": "Valid Name", "trainerIds": ["<TRAINER_UID>"], "leaderId": "nonexistent", "memberIds": ["nonexistent"] }
```
Expected: `404 Not Found`

---

### 3.2 `GET /groups`

**TC-G08 — Admin sees all groups**
```
GET /groups
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "groups": [...] }`

**TC-G09 — Master trainer sees all groups**
```
Authorization: Bearer <MASTER_TOKEN>
```
Expected: `200 OK`

**TC-G10 — Trainer sees only managed groups**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK` — only groups in trainer's `managedGroupIds` appear

**TC-G11 — Group leader sees only own group**
```
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `200 OK` — exactly one group matching the leader's `groupId`

**TC-G12 — Agent (no permission)**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

---

### 3.3 `GET /groups/:groupId`

**TC-G13 — Admin**
```
GET /groups/<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "group": {...}, "members": [...] }` — members array includes per-member stats

**TC-G14 — Trainer for managed group**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-G15 — Trainer for unmanaged group**
```
GET /groups/<GROUP_B_ID>
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-G16 — Group leader for own group**
```
GET /groups/<GROUP_A_ID>
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `200 OK`

**TC-G17 — Non-existent group**
```
GET /groups/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

### 3.4 `PUT /admin/groups/:groupId`

**TC-G18 — Admin renames group**
```
PUT /admin/groups/<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
Body: { "name": "New Name" }
```
Expected: `200 OK` — all members' `groupName` field updated atomically

**TC-G19 — Admin replaces trainer**
```json
Body: { "trainerIds": ["<NEW_TRAINER_UID>"] }
```
Expected: `200 OK` — old trainer loses group from `managedGroupIds`; new trainer gains it

**TC-G20 — Admin changes leader**
```json
Body: { "leaderId": "<AGENT_UID>", "memberIds": ["<AGENT_UID>", ...existing members...] }
```
Expected: `200 OK` — old leader demoted to agent; new leader promoted to group_leader

**TC-G21 — New leader not in memberIds**
```json
Body: { "leaderId": "<NEW_AGENT_UID>" }
```
Expected: `400 Bad Request` `{ "error": "New leader must be included in memberIds array" }`

**TC-G22 — Empty body**
```json
Body: {}
```
Expected: `400 Bad Request` `{ "error": "At least one field to update is required" }`

**TC-G23 — Non-admin**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-G24 — Non-existent group**
```
PUT /admin/groups/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
Body: { "name": "Whatever" }
```
Expected: `404 Not Found`

---

### 3.5 `DELETE /admin/groups/:groupId`

**TC-G25 — Admin deletes a group**
```
DELETE /admin/groups/<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK`
Side effects: all members' `groupId`/`groupName` cleared; trainers' `managedGroupIds` updated; group document deleted.

**TC-G26 — Non-admin**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-G27 — Non-existent group**
```
DELETE /admin/groups/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

## 4. Prospects

### 4.1 `POST /prospects`

**TC-P01 — Agent creates a prospect**
```
POST /prospects
Authorization: Bearer <AGENT_TOKEN>
Body:
{
  "prospectName": "John Doe",
  "prospectEmail": "john.doe@example.com",
  "prospectPhone": "0123456789"
}
```
Expected: `201 Created`
```json
{ "success": true, "prospectId": "<id>", "message": "Prospect created successfully" }
```

**TC-P02 — Group leader creates a prospect**
```
Authorization: Bearer <LEADER_TOKEN>
Body: { "prospectName": "Jane Doe", "prospectEmail": "jane@example.com", "prospectPhone": "0987654321" }
```
Expected: `201 Created`

**TC-P03 — Trainer attempts to create a prospect**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden` `{ "error": "Only agents and group leaders can create prospects" }`

**TC-P04 — Missing prospectName**
```json
Body: { "prospectEmail": "a@b.com", "prospectPhone": "0123456789" }
```
Expected: `400 Bad Request`

**TC-P05 — Invalid email format**
```json
Body: { "prospectName": "John", "prospectEmail": "not-an-email", "prospectPhone": "0123456789" }
```
Expected: `400 Bad Request` `{ "error": "Valid prospectEmail is required" }`

**TC-P06 — Missing phone**
```json
Body: { "prospectName": "John", "prospectEmail": "john@example.com" }
```
Expected: `400 Bad Request`

---

### 4.2 `GET /prospects/my-prospects`

**TC-P07 — Agent gets own prospects**
```
GET /prospects/my-prospects
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK` `{ "prospects": [...] }` — only prospects with `agentCode` matching the agent

**TC-P08 — With limit**
```
GET /prospects/my-prospects?limit=5
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK` — at most 5 records returned

**TC-P09 — Unauthenticated**
Expected: `401 Unauthorized`

---

### 4.3 `GET /prospects/:id`

**TC-P10 — Admin fetches any prospect**
```
GET /prospects/<PROSPECT_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "prospect": {...} }`

**TC-P11 — Agent fetches own prospect**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK`

**TC-P12 — Agent fetches another agent's prospect**
```
GET /prospects/<AGENT_B_PROSPECT_ID>
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-P13 — Trainer fetches prospect in managed group**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-P14 — Non-existent prospect**
```
GET /prospects/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

### 4.4 `PUT /prospects/:id`

**TC-P15 — Agent advances to appointment stage**
```
PUT /prospects/<PROSPECT_ID>
Authorization: Bearer <AGENT_TOKEN>
Body:
{
  "currentStage": "appointment",
  "appointmentDate": "2026-03-15T10:00:00.000Z",
  "appointmentStatus": "scheduled",
  "location": "Starbucks KLCC"
}
```
Expected: `200 OK` `{ "success": true }`

**TC-P16 — Agent advances to appointment without appointmentDate**
```json
Body: { "currentStage": "appointment" }
```
Expected: `400 Bad Request` `{ "error": "appointmentDate is required for appointment stage" }`

**TC-P17 — Agent records successful sale**
```
PUT /prospects/<PROSPECT_ID>
Authorization: Bearer <AGENT_TOKEN>
Body:
{
  "currentStage": "sales_outcome",
  "salesOutcome": "successful",
  "productsSold": [
    { "productName": "Life Shield Plan", "aceAmount": 2500 }
  ]
}
```
Expected: `200 OK`

**TC-P18 — Agent records unsuccessful sale without reason**
```json
Body: {
  "currentStage": "sales_outcome",
  "salesOutcome": "unsuccessful"
}
```
Expected: `400 Bad Request` `{ "error": "unsuccessfulReason is required when salesOutcome is \"unsuccessful\"" }`

**TC-P19 — Agent records unsuccessful sale with reason**
```json
Body: {
  "currentStage": "sales_outcome",
  "salesOutcome": "unsuccessful",
  "unsuccessfulReason": "Client not interested"
}
```
Expected: `200 OK`

**TC-P20 — Agent records successful sale without productsSold**
```json
Body: {
  "currentStage": "sales_outcome",
  "salesOutcome": "successful",
  "productsSold": []
}
```
Expected: `400 Bad Request` `{ "error": "productsSold is required when salesOutcome is \"successful\"" }`

**TC-P21 — Agent updates another agent's prospect**
```
PUT /prospects/<AGENT_B_PROSPECT_ID>
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-P22 — Admin updates any prospect**
```
Authorization: Bearer <ADMIN_TOKEN>
Body: { "currentStage": "appointment", "appointmentDate": "2026-03-20T09:00:00.000Z" }
```
Expected: `200 OK`

**TC-P23 — Invalid stage value**
```json
Body: { "currentStage": "closed" }
```
Expected: `400 Bad Request` `{ "error": "Invalid stage value" }`

**TC-P24 — Invalid appointmentStatus (no stage change)**
```json
Body: { "appointmentStatus": "pending" }
```
Expected: `400 Bad Request` `{ "error": "Invalid appointmentStatus value" }`

**TC-P25 — Non-existent prospect**
Expected: `404 Not Found`

---

### 4.5 `GET /prospects/group/:groupId`

**TC-P26 — Admin**
```
GET /prospects/group/<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "prospects": [...] }`

**TC-P27 — Master trainer**
```
Authorization: Bearer <MASTER_TOKEN>
```
Expected: `200 OK`

**TC-P28 — Trainer for managed group**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-P29 — Trainer for unmanaged group**
```
GET /prospects/group/<GROUP_B_ID>
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-P30 — Agent (no permission)**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-P31 — Group leader (no permission)**
```
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `403 Forbidden`

**TC-P32 — With limit**
```
GET /prospects/group/<GROUP_A_ID>?limit=10
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` — at most 10 records

---

### 4.6 `DELETE /prospects/:id`

**TC-P33 — Agent deletes own prospect**
```
DELETE /prospects/<PROSPECT_ID>
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK` `{ "success": true, "message": "Prospect deleted successfully" }`

**TC-P34 — Agent deletes another agent's prospect**
```
DELETE /prospects/<AGENT_B_PROSPECT_ID>
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-P35 — Admin deletes any prospect**
```
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK`

**TC-P36 — Non-existent prospect**
```
DELETE /prospects/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

### 4.7 `GET /admin/all-prospects`

**TC-P37 — Admin**
```
GET /admin/all-prospects
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "prospects": [...] }`

**TC-P38 — Admin with limit**
```
GET /admin/all-prospects?limit=20
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` — at most 20 records

**TC-P39 — Non-admin**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

---

## 5. Events

### 5.1 `POST /events`

**TC-E01 — Admin creates an event**
```
POST /events
Authorization: Bearer <ADMIN_TOKEN>
Body:
{
  "eventTitle": "Coffee Hangout",
  "date": "2026-04-01T09:00:00.000Z",
  "venue": "Starbucks Pavilion KL",
  "description": "Monthly informal catch-up for all teams.",
  "groupIds": ["<GROUP_A_ID>"]
}
```
Expected: `201 Created`
```json
{ "success": true, "eventId": "<id>", "message": "Event created successfully" }
```

**TC-E02 — Admin creates event with optional meetingLink**
```json
{
  "eventTitle": "Online Briefing",
  "date": "2026-04-10T14:00:00.000Z",
  "venue": "Google Meet",
  "description": "Product briefing for all group leaders.",
  "groupIds": ["<GROUP_A_ID>"],
  "meetingLink": "https://meet.google.com/abc-defg-hij"
}
```
Expected: `201 Created`

**TC-E03 — Trainer creates event for managed group**
```json
{
  "eventTitle": "Team Training",
  "date": "2026-04-05T10:00:00.000Z",
  "venue": "Training Room A",
  "description": "Weekly product knowledge refresher.",
  "groupIds": ["<GROUP_A_ID>"]
}
```
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `201 Created`

**TC-E04 — Trainer creates event for unmanaged group**
```json
{ ...same body but "groupIds": ["<GROUP_B_ID>"] }
```
Expected: `403 Forbidden` `{ "error": "You do not manage group \"<GROUP_B_ID>\"..." }`

**TC-E05 — Group leader creates event for own group**
```json
{
  "eventTitle": "Team Briefing",
  "date": "2026-04-08T09:00:00.000Z",
  "venue": "Meeting Room B",
  "description": "Monthly review with the team members.",
  "groupIds": ["<GROUP_A_ID>"]
}
```
```
Authorization: Bearer <LEADER_TOKEN>
```
Expected: `201 Created`

**TC-E06 — Group leader creates event for another group**
```json
{ ...body with "groupIds": ["<GROUP_B_ID>"] }
```
Expected: `403 Forbidden`

**TC-E07 — Agent attempts to create event**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-E08 — Missing eventTitle**
```json
{ "date": "2026-04-01T09:00:00.000Z", "venue": "Somewhere", "description": "Some description here.", "groupIds": ["<GROUP_A_ID>"] }
```
Expected: `400 Bad Request` `{ "error": "eventTitle is required and must be at least 3 characters" }`

**TC-E09 — eventTitle too short**
```json
{ "eventTitle": "Hi", ...rest valid }
```
Expected: `400 Bad Request`

**TC-E10 — Missing date**
```json
{ "eventTitle": "Valid Title", "venue": "Somewhere", "description": "Some description here.", "groupIds": ["<GROUP_A_ID>"] }
```
Expected: `400 Bad Request` `{ "error": "date is required" }`

**TC-E11 — Invalid date format**
```json
{ "eventTitle": "Valid Title", "date": "not-a-date", "venue": "Somewhere", "description": "Some description here.", "groupIds": ["<GROUP_A_ID>"] }
```
Expected: `400 Bad Request` `{ "error": "date must be a valid ISO 8601 date string" }`

**TC-E12 — venue too short**
```json
{ "eventTitle": "Valid Title", "date": "2026-04-01T09:00:00.000Z", "venue": "AB", "description": "Some description here.", "groupIds": ["<GROUP_A_ID>"] }
```
Expected: `400 Bad Request`

**TC-E13 — description too short**
```json
{ "eventTitle": "Valid Title", "date": "2026-04-01T09:00:00.000Z", "venue": "Valid Venue", "description": "Short", "groupIds": ["<GROUP_A_ID>"] }
```
Expected: `400 Bad Request` `{ "error": "description is required and must be at least 10 characters" }`

**TC-E14 — Empty groupIds array**
```json
{ "eventTitle": "Valid Title", "date": "2026-04-01T09:00:00.000Z", "venue": "Valid Venue", "description": "Some description here.", "groupIds": [] }
```
Expected: `400 Bad Request` `{ "error": "groupIds is required and must be a non-empty array" }`

**TC-E15 — groupIds references non-existent group**
```json
{ ...valid fields, "groupIds": ["doesnotexist"] }
```
Expected: `404 Not Found` `{ "error": "One or more groups not found" }`

**TC-E16 — Invalid meetingLink**
```json
{ ...valid fields, "meetingLink": "not-a-url" }
```
Expected: `400 Bad Request` `{ "error": "meetingLink must be a valid URL" }`

**TC-E17 — Unauthenticated**
Expected: `401 Unauthorized`

---

### 5.2 `GET /events/my-events`

**TC-E18 — Admin sees all upcoming events**
```
GET /events/my-events
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "events": [...] }` — ordered by date ASC, all have `status: "upcoming"`

**TC-E19 — Trainer sees events for managed groups only**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK` — no events for GROUP_B

**TC-E20 — Trainer with no managed groups**
> Precondition: trainer has `managedGroupIds: []`
Expected: `200 OK` `{ "events": [] }`

**TC-E21 — Agent sees events for own group**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK` — only events that include GROUP_A in `groupIds`

**TC-E22 — Agent with no groupId assigned**
> Precondition: agent has no `groupId`
Expected: `200 OK` `{ "events": [] }`

**TC-E23 — Unauthenticated**
Expected: `401 Unauthorized`

---

### 5.3 `GET /events`

**TC-E24 — Admin, no filters**
```
GET /events
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "events": [...] }` — ordered by date DESC

**TC-E25 — Admin filters by status**
```
GET /events?status=completed
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` — all returned events have `status: "completed"`

**TC-E26 — Admin filters by groupId**
```
GET /events?groupId=<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` — all returned events include GROUP_A in their `groupIds`

**TC-E27 — Admin filters by both status and groupId**
```
GET /events?status=upcoming&groupId=<GROUP_A_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK`

**TC-E28 — Non-admin**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden` `{ "error": "Only administrators can access all events" }`

---

### 5.4 `GET /events/:eventId`

**TC-E29 — Admin fetches any event**
```
GET /events/<EVENT_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "event": { "id": "...", "eventTitle": "...", ... } }`

**TC-E30 — Trainer fetches event for managed group**
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-E31 — Trainer fetches event for unmanaged group**
> Precondition: event only belongs to GROUP_B
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-E32 — Agent fetches event for own group**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `200 OK`

**TC-E33 — Agent fetches event for different group**
> Precondition: event only belongs to GROUP_B
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-E34 — Non-existent event**
```
GET /events/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

### 5.5 `PUT /events/:eventId`

**TC-E35 — Admin updates any event**
```
PUT /events/<EVENT_ID>
Authorization: Bearer <ADMIN_TOKEN>
Body: { "eventTitle": "Updated Title", "status": "completed" }
```
Expected: `200 OK` `{ "success": true, "message": "Event updated successfully" }`

**TC-E36 — Creator updates own event**
```
PUT /events/<EVENT_CREATED_BY_TRAINER>
Authorization: Bearer <TRAINER_TOKEN>
Body: { "venue": "New Venue Location" }
```
Expected: `200 OK`

**TC-E37 — Non-creator, non-admin attempts update**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-E38 — Empty body**
```json
Body: {}
```
Expected: `400 Bad Request` `{ "error": "At least one field to update is required" }`

**TC-E39 — Invalid status value**
```json
Body: { "status": "archived" }
```
Expected: `400 Bad Request` `{ "error": "status must be \"upcoming\", \"completed\", or \"cancelled\"" }`

**TC-E40 — Trainer reassigns event to unmanaged group**
```json
Body: { "groupIds": ["<GROUP_B_ID>"] }
```
```
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `403 Forbidden`

**TC-E41 — Update groupIds to non-existent group**
```json
Body: { "groupIds": ["doesnotexist"] }
```
Expected: `404 Not Found` `{ "error": "One or more groups not found" }`

**TC-E42 — Update with invalid meetingLink**
```json
Body: { "meetingLink": "not-a-url" }
```
Expected: `400 Bad Request`

**TC-E43 — Update groupIds to empty array**
```json
Body: { "groupIds": [] }
```
Expected: `400 Bad Request` `{ "error": "groupIds must be a non-empty array" }`

**TC-E44 — Non-existent event**
```
PUT /events/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
Body: { "eventTitle": "Doesn't matter" }
```
Expected: `404 Not Found`

---

### 5.6 `DELETE /events/:eventId`

**TC-E45 — Admin deletes any event**
```
DELETE /events/<EVENT_ID>
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `200 OK` `{ "success": true, "message": "Event deleted successfully" }`

**TC-E46 — Creator deletes own event**
```
DELETE /events/<EVENT_CREATED_BY_TRAINER>
Authorization: Bearer <TRAINER_TOKEN>
```
Expected: `200 OK`

**TC-E47 — Non-creator, non-admin attempts delete**
```
Authorization: Bearer <AGENT_TOKEN>
```
Expected: `403 Forbidden`

**TC-E48 — Non-existent event**
```
DELETE /events/doesnotexist
Authorization: Bearer <ADMIN_TOKEN>
```
Expected: `404 Not Found`

---

## Edge Cases & Notes

| # | Area | Note |
|---|------|------|
| N1 | `GET /events/my-events` routing | This route must be registered before `GET /events/:eventId`. Verify `my-events` is not treated as an eventId (i.e., does not return 404). |
| N2 | Trainer >10 managed groups | `GET /events/my-events` and `GET /users` both slice `managedGroupIds` to 10. Test with exactly 11 managed groups to confirm the warning is logged and results are partial but not an error. |
| N3 | Status transitions | No server-side guard prevents `completed → upcoming`. Decide whether to add validation; currently any status → any status is accepted on update. |
| N4 | `updateUserStatus` vs `updateUser` | Both endpoints can change `status`, but `updateUserStatus` only accepts `active`/`inactive`, while `updateUser` also accepts `suspended`. Ensure these are not contradictory in practice. |
| N5 | Group leader `GET /prospects/group/:groupId` | The controller blocks `group_leader` from this endpoint despite a route comment suggesting otherwise. Confirm TC-P31 is intentional. |
| N6 | Concurrent group creation | If two admins create groups simultaneously with the same `leaderId`, the agent could be promoted twice. Consider whether idempotency is needed. |
