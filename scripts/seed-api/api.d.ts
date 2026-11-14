export interface paths {
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Health check
     * @description Returns the current operational status of the API. No authentication is required. Intended for uptime monitoring and load-balancer probes.
     */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/register': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Register a new agent
     * @description Creates a new agent account. The supplied `agentCode` must exist in the provisioned agent codes and must not have been used previously. There is no password: the account signs in with an emailed one-time code through `POST /auth/login` and `POST /auth/login/verify`. The response contains the new user record and no token.
     */
    post: operations['register'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Start a passwordless login
     * @description Sends a one-time sign-in code to the email address and returns the session value that must accompany the code in `POST /auth/login/verify`. An unknown email receives the same response shape as a known one, so the endpoint does not reveal which addresses have accounts.
     */
    post: operations['startLogin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/login/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Complete a passwordless login
     * @description Exchanges the emailed code and the session value from `POST /auth/login` for tokens. An inactive account is rejected with 403 and its tokens are revoked.
     */
    post: operations['verifyLogin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Log out the current user
     * @description Invalidates the session associated with the supplied Bearer token. The `Authorization` header must be present and contain a non-empty token in the form `Bearer <token>`. Returns 401 if the header is missing, malformed, or the token portion is empty.
     */
    post: operations['logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get the authenticated user's profile
     * @description Returns the profile of the currently authenticated user derived from the supplied Bearer token. The `Authorization` header must be present and contain a valid token in the form `Bearer <token>`. Returns 401 if the header is missing, malformed, or the token is invalid.
     */
    get: operations['getMe'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the users the caller may see
     * @description Returns the users the caller may see: admins see everyone; master trainers see active users other than admins; trainers see active members of the groups they manage; group leaders see active members of their own group; agents see only themselves.
     */
    get: operations['listUsers'];
    put?: never;
    /**
     * Create a new user (admin only)
     * @description Creates a passwordless user (admin only): a Cognito account with a verified email, signing in with an emailed code. When `role` is `agent`, an `agentCode` must also be provided; it must be an existing agent code that no other account has claimed.
     */
    post: operations['createUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/users/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a user by ID
     * @description Returns the user for the given `userId` when the caller may see them (the same rules as `GET /users`; everyone may read their own record). A user the caller may not see is reported as not found.
     */
    get: operations['getUser'];
    /**
     * Update a user
     * @description Updates the user record for the given `userId`. The caller must supply a valid Bearer token. Non-admin users can only update themselves — a 403 is returned if they attempt to update another user. Non-admin callers cannot update the `role` field; it is silently stripped from the request body. At least one field must be provided.
     */
    put: operations['updateUser'];
    post?: never;
    /**
     * Delete a user
     * @description Deletes the user's record and then their Cognito account (admin only; admins cannot delete themselves). The Cognito deletion is best-effort: if it fails the record is still deleted and the request still succeeds.
     */
    delete: operations['deleteUser'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/users/{userId}/deactivate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Deactivate a user
     * @description Admin-only. Sets the user's status to `inactive`, preventing them from logging in or making authenticated requests. The user's data and group membership are preserved for seamless reactivation. Idempotent — deactivating an already-inactive user returns 200.
     */
    post: operations['deactivateUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/users/{userId}/reactivate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Reactivate a user
     * @description Admin-only. Restores the user's status to `active`, allowing them to log in and make authenticated requests again. Idempotent — reactivating an already-active user returns 200.
     */
    post: operations['reactivateUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/groups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the groups the caller may see
     * @description Returns the groups the caller may see: admins and master trainers see every group, trainers the groups they manage, and other roles their own group.
     */
    get: operations['listGroups'];
    put?: never;
    /**
     * Create a new group (admin only)
     * @description Creates a group (admin only). The optional `leader_id` must reference an existing user with the `agent` role, who is promoted to `group_leader`; the optional `trainer_ids` must each reference an existing user with the `trainer` role.
     */
    post: operations['createGroup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/groups/{groupId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a group by ID
     * @description Returns the group identified by `groupId` when the caller may see it (the same rules as `GET /groups`); otherwise 404.
     */
    get: operations['getGroup'];
    /**
     * Update a group (admin only)
     * @description Updates the group identified by `groupId`. The caller must supply a valid Bearer token belonging to a user with the `admin` role. All request body fields are optional, but at least one must be provided. When `leader_id` is supplied and differs from the current leader, the new leader is promoted to `group_leader` and the previous leader is demoted back to `agent`. When `trainer_ids` is supplied, the existing trainer assignments for the group are replaced with the provided set. When `member_ids` is supplied, the group's member set is **replaced** with the provided list — users currently in the group but absent from the new list have their `group_id` set to `null` (unlinked). The current group leader is always retained as a member regardless of whether their UUID appears in `member_ids`. Passing an empty array (`[]`) unlinks all non-leader members. Every provided UUID must reference an existing user.
     */
    put: operations['updateGroup'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/groups/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get group statistics
     * @description Returns the groups the caller may see (the same rules as `GET /groups`) with their year-to-date (YTD, UTC) statistics from active members, sorted by `ytd_sales_ace` descending. The figures come from per-agent monthly counters that the stats consumer updates a few seconds after a prospect changes.
     */
    get: operations['listGroupStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/groups/{groupId}/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get per-group detail statistics
     * @description Returns YTD and MTD aggregated statistics scoped to a specific group, plus the current agent count for that group. The caller must supply a valid Bearer token. All roles are permitted to call this endpoint. Returns 404 if the group does not exist.
     */
    get: operations['getGroupStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/prospects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List prospects (paginated for admins and master trainers)
     * @description Returns the prospects the caller may see. Admins and master trainers see every prospect, so their list is paginated: most recently updated first, `limit` per page, with a `nextToken` while more remain. Pass the `nextToken` back unchanged to get the next page; it is opaque and bound to the same `stage` filter. Other roles see a bounded set (trainers: agents in the groups they manage; group leaders: agents in their group; agents: their own) and get it in a single response, with `limit` and `nextToken` ignored. `stage` filters every role's list.
     */
    get: operations['listProspects'];
    put?: never;
    /**
     * Create a prospect
     * @description Creates a prospect owned by the caller, who must have the `agent` or `group_leader` role. `agent_id` is the caller and is not accepted in the request body. `current_stage` starts as `prospect`.
     */
    post: operations['createProspect'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/prospects/{prospectId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a prospect by ID
     * @description Returns the prospect identified by `prospectId` when the caller may see it: admins and master trainers see every prospect, trainers those of agents in the groups they manage, group leaders those of agents in their group, and agents their own. Otherwise 404.
     */
    get: operations['getProspect'];
    /**
     * Update a prospect
     * @description Updates the prospect identified by `prospectId`. The caller must supply a valid Bearer token belonging to a user with the `agent` or `group_leader` role. All request body fields are optional, but at least one must be provided.
     */
    put: operations['updateProspect'];
    post?: never;
    /**
     * Delete a prospect
     * @description Deletes the prospect identified by `prospectId`. Only its owner or an admin may delete it; anyone else gets 404, so existence is not revealed. Points earned for the prospect are reversed by the award-points consumer.
     */
    delete: operations['deleteProspect'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List all events
     * @description Returns the events the caller may see, newest first: admins and master trainers see every event; everyone else sees events they created, events that name them, and events that target a group they may see (the groups they manage for trainers, their own group otherwise).
     */
    get: operations['listEvents'];
    put?: never;
    /**
     * Create an event
     * @description Creates an event. The caller must supply a valid Bearer token belonging to a user with the `admin`, `master_trainer`, `trainer`, `group_leader`, or `agent` role. At least one of `groupIds` or `agentIds` must be provided for non-`agent` roles — `agent` users are automatically assigned to their own event and may omit both fields. For `trainer` users, all supplied `groupIds` must belong to groups that the trainer manages via the `group_trainers` junction table; any unmanaged group IDs result in a 400. If `visibility` is not supplied, it defaults to `public` for `agent` and `group_leader` roles, and `private` for all other roles.
     */
    post: operations['createEvent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/events/{eventId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get an event by ID
     * @description Returns the event identified by `eventId` when the caller may see it (the same rules as `GET /events`); otherwise 404.
     */
    get: operations['getEvent'];
    /**
     * Update an event
     * @description Updates the event identified by `eventId`. The caller must supply a valid Bearer token belonging to a user with the `admin`, `master_trainer`, `trainer`, `group_leader`, or `agent` role. All request body fields are optional, but at least one must be provided. Non-admin users may only update events they created — attempting to modify another user's event returns a 403. `agent` users always remain the sole assigned agent; supplied `groupIds` and `agentIds` are ignored and replaced with the agent's own ID. When `groupIds` is supplied (non-`agent` roles), the existing `event_groups` entries for this event are replaced entirely. When `agentIds` is supplied, the existing `event_agents` entries for this event are replaced entirely. For `trainer` users, all supplied `groupIds` must belong to groups they manage; any unmanaged group IDs result in a 400.
     */
    put: operations['updateEvent'];
    post?: never;
    /**
     * Delete an event
     * @description Permanently deletes the event identified by `eventId`. The caller must supply a valid Bearer token belonging to a user with the `admin`, `master_trainer`, `trainer`, `group_leader`, or `agent` role. Admin users may delete any event. Non-admin users may only delete events they themselves created — attempting to delete another user's event returns a 403.
     */
    delete: operations['deleteEvent'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/events/{eventId}/public': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get public event details
     * @description Returns publicly visible details for a single event. No authentication is required. Returns 404 if the event does not exist, has been cancelled, or has `visibility` set to `private`. Successful responses include a `Cache-Control: public, max-age=60` header.
     */
    get: operations['getPublicEvent'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/dashboard/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get dashboard statistics
     * @description Returns aggregated year-to-date (YTD) and month-to-date (MTD) dashboard statistics for the caller's scope: admins and master trainers see everyone's prospects (inactive users included), trainers those of the agents in the groups they manage, and group leaders and agents only their own. YTD covers the period from 1 January and MTD from the 1st of the current month, both in UTC. All roles may call this endpoint.
     */
    get: operations['getDashboardStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/point-activity-types': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List all point activity types
     * @description Returns all available point activity types from the system. These values are used when creating point configurations via `POST /point-configs`. Restricted to authenticated users.
     */
    get: operations['listPointActivityTypes'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/point-configs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List all point configs
     * @description Returns all gamification point configurations. Returns an empty array if no configurations have been set up yet. Restricted to the `admin` role.
     */
    get: operations['listPointConfigs'];
    put?: never;
    /**
     * Create a point config
     * @description Creates a gamification point configuration. Each activity type may have at most one configuration — attempting to create a duplicate returns HTTP 400. Restricted to the `admin` role.
     */
    post: operations['createPointConfig'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/point-configs/{activity}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update a point config by activity
     * @description Updates the points value for an existing gamification point configuration identified by its `activity` path parameter. Returns HTTP 404 if no configuration exists for the given activity. Restricted to the `admin` role.
     */
    put: operations['updatePointConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/leaderboard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get leaderboard
     * @description Returns every active agent and group leader ranked by lifetime points, highest first; agents with no points are included with 0. All authenticated roles may access this endpoint.
     */
    get: operations['getLeaderboard'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/leaderboard/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get leaderboard stats
     * @description Returns raw activity counts for all active agents and group leaders, and their groups, for the specified UTC period. Results include individual agent counts and aggregated group counts. All authenticated roles may access this endpoint. The frontend is responsible for applying point multipliers to the raw counts.
     */
    get: operations['getLeaderboardStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/agent-points': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get agent points
     * @description Returns the total points, a per-category breakdown, and a paginated transaction history for a given agent. When `userId` is omitted the endpoint returns data for the authenticated user. Passing a `userId` that belongs to a different user is restricted to manager roles (admin, master_trainer, trainer, group_leader) — agents who supply a different user's ID receive HTTP 403.
     */
    get: operations['getAgentPoints'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/agent-codes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List agent codes (admin only)
     * @description Returns all provisioned agent codes. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     The optional `isUsed` query parameter filters the result: pass `true` to return only codes that have been claimed by a user, `false` to return only unclaimed codes, or omit it entirely to return all codes. No pagination is applied — the full matching list is returned in a single response.
     */
    get: operations['listAgentCodes'];
    put?: never;
    /**
     * Bulk create agent codes (admin only)
     * @description Bulk upserts one or more agent codes. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     The operation is **idempotent**: codes are upserted on the agent code, so re-submitting an existing code returns 200 with the existing row (its `created_at` is preserved and `is_used` is **not** reset). Intra-batch duplicates are deduped server-side, so the returned array length equals the **distinct** count of submitted codes — e.g. submitting `["X", "X", "Y"]` returns 2 rows. Returned order is not guaranteed to match input order.
     *
     *     There is no per-row partial-success path: the whole batch either succeeds (200) or fails (500). The response makes no distinction between freshly-inserted rows and pre-existing ones.
     */
    post: operations['createAgentCodes'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/agent-codes/{agentCode}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Delete an agent code
     * @description Deletes an existing agent code. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     The path parameter `:agentCode` is the **current** value of the code to delete (case-sensitive). URL-encode it if it contains characters that are not safe in a URI path segment. Returns 404 if no code with that value exists. Returns 409 if the code is currently in use (`isUsed: true`) — in-use codes cannot be deleted.
     */
    delete: operations['deleteAgentCode'];
    options?: never;
    head?: never;
    /**
     * Rename an agent code (admin only)
     * @description Renames an existing agent code. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     Only the `agent_code` column is updated. The `is_used`, `user_id`, and `created_at` values are left unchanged. Renaming a code that is already in use (`isUsed: true`) is permitted — the associated user's claim is preserved under the new code value.
     *
     *     The path parameter `:agentCode` is the **current** value of the code to rename (case-sensitive). URL-encode it if it contains characters that are not safe in a URI path segment. Returns 404 if no code with that value exists. Returns 409 if the requested new value already exists.
     */
    patch: operations['updateAgentCode'];
    trace?: never;
  };
  '/taxonomies': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List taxonomy values
     * @description Returns the taxonomy lookup values, ordered by `sort_order` ascending and then `value` ascending. All authenticated roles may access this endpoint.
     *
     *     The optional `type` query parameter filters the result to a single category (e.g. `lead_source`). When provided it must be a non-empty string; omit it to return every taxonomy value.
     */
    get: operations['listTaxonomies'];
    put?: never;
    /**
     * Create a taxonomy value (admin only)
     * @description Creates a new taxonomy lookup value. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     The combination of `(type, value)` must be unique — submitting a duplicate returns 409.
     */
    post: operations['createTaxonomy'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/taxonomies/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update a taxonomy value (admin only)
     * @description Updates the `value` and/or `sort_order` of an existing taxonomy value. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     At least one of `value` or `sort_order` must be supplied; an empty body returns 400. Returns 404 if no taxonomy value with the given `id` exists. Returns 409 if the new `value` collides with an existing `(type, value)` pair.
     */
    put: operations['updateTaxonomy'];
    post?: never;
    /**
     * Delete a taxonomy value (admin only)
     * @description Deletes an existing taxonomy value. The caller must supply a valid Bearer token belonging to a user with the `admin` role; any other role returns 403.
     *
     *     Returns 404 if no taxonomy value with the given `id` exists. On success the endpoint returns 204 with no response body.
     */
    delete: operations['deleteTaxonomy'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/labels': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get display labels
     * @description Returns the resolved key→value display-label map: code references stable internal keys (e.g. `metric.ace`) and this endpoint resolves them to display strings. All authenticated roles may read.
     *
     *     The response is a single merged map: a default label set provides fallbacks, and the overrides stored in the Labels table take precedence over the defaults.
     */
    get: operations['getLabels'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/coaching-sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List coaching sessions
     * @description Returns the coaching sessions the caller may see, newest first: admins and master trainers see every session; everyone else sees sessions they created, sessions that name them, sessions that target a group they may see, and sessions with no targets (all audience). Each item carries `attendance_total` and `attendance_joined`; the attendance records are only on `GET /coaching-sessions/{sessionId}`.
     */
    get: operations['listCoachingSessions'];
    put?: never;
    /**
     * Create a coaching session
     * @description Creates a new coaching session. Restricted to admin, master_trainer, trainer, and group_leader roles. Optionally targets specific groups and/or agents via `groupIds` and `agentIds`. Omitting both means the session targets all agents.
     */
    post: operations['createCoachingSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/coaching-sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the coaching session. */
        sessionId: string;
      };
      cookie?: never;
    };
    /**
     * Get coaching session by ID
     * @description Returns a single coaching session including its target groups, target agents, and attendance records.
     */
    get: operations['getCoachingSession'];
    /**
     * Update coaching session
     * @description Updates an existing coaching session. At least one field must be provided. Restricted to admin, master_trainer, trainer, and group_leader roles. Non-admin users can only update sessions they created.
     */
    put: operations['updateCoachingSession'];
    post?: never;
    /**
     * Delete coaching session
     * @description Deletes a coaching session. Restricted to admin, master_trainer, trainer, and group_leader roles. Non-admin users can only delete sessions they created.
     */
    delete: operations['deleteCoachingSession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/coaching-sessions/{sessionId}/join': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Join a coaching session
     * @description Records the authenticated user's attendance for the given coaching session. Any authenticated user can join. If the user has already joined, the existing attendance record is returned.
     */
    post: operations['joinCoachingSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/coaching-sessions/{sessionId}/mark-non-attendees': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Bulk-mark non-attendees
     * @description Marks all targeted agents who have not joined the session as "did_not_attend". Only the session creator or users with admin / master_trainer roles can perform this action.
     */
    post: operations['markCoachingSessionNonAttendees'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/public/groups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List active groups
     * @description Returns a minimal list of active groups (id and name). No authentication is required. Intended for public-facing flows such as agent registration, where the caller needs to present a group selector before a session exists.
     */
    get: operations['listPublicGroups'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/upload': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Ingest a sales report ETL result
     * @description Persists a pre-shaped ETL result produced by the upstream ETL pipeline. Creates a row in `upload_batches` for audit, then bulk-upserts a YTD snapshot for the report month and MTD ACE/NOC rows for every month present in `rowData`. Re-uploading the same `(year, month)` is last-writer-wins on YTD/MTD; both batch rows are retained. Manager-only (`group_leader`, `master_trainer`, or `admin`). `uploaded_by` is the caller and is not accepted from the request body.
     */
    post: operations['uploadSalesReport'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/ingest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Manual ETL ingest (interim — ETL_API_KEY auth, NOT user JWT)
     * @description Manual-mode endpoint used while the production HTTP-hosted ETL is being built. The ETL author runs the local Python pipeline on their laptop and POSTs the resulting `etl_result` here directly. Skips the `report_jobs` lifecycle and file storage entirely; just persists the same audit + YTD/MTD rows that `/reports/upload` does.
     *     Authenticated with `Authorization: Bearer <ETL_API_KEY>` (the same shared secret the ETL uses for `/reports/jobs/{reference}/complete`). While no ETL key is configured every request gets 401. Because there is no JWT, `uploaded_by` is recorded as null. The body takes no `tenant_id`; a body that still sends one is rejected with 400 as an unknown field. The consecutive-month guard (409) is inherited from the shared service layer.
     */
    post: operations['ingestSalesReport'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales-reports': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Per-agent year rollup (role-scoped)
     * @description Returns one `SalesReport` per agent for the given year. Each entry combines the agent's latest YTD snapshot with monthly arrays for ACE/NOC (from the MTD reports) and FYC/FYCt (the difference between consecutive monthly YTD snapshots).
     *     The response is additionally filtered to the caller's permitted scope:
     *     * `admin`, `master_trainer` — see all agents. * `trainer` — see only agents whose `users.group_id` is in the set of
     *       groups the trainer manages via `group_trainers`. A trainer with
     *       zero managed groups receives an empty array (200, not 403).
     *     * `group_leader` — see only agents whose `users.group_id` matches the
     *       caller's own `users.group_id`. A group_leader with no `group_id`
     *       receives an empty array.
     *     * `agent` — receives 403.
     */
    get: operations['listSalesReports'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales-reports/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Caller's own year rollup
     * @description Returns the calling user's `SalesReport` for the given year. Available to any authenticated user — no role gate. Returns 404 when the user has no YTD row for that year (e.g. they were not part of any upload yet).
     */
    get: operations['getMySalesReport'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales-reports/uploads': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Paginated audit list of past uploads
     * @description Returns past upload batches, sorted most-recent first. Each row reports its `rows_loaded`, `rows_skipped`, derived `status` (`success` | `partial` | `failed`), and the uploader's display name. `uploader_name` is `null` for manual-mode uploads (POST `/api/reports/ingest`) where there is no JWT to attribute.
     *     Available to any of the four manager-tier roles (`admin`, `master_trainer`, `trainer`, `group_leader`) — the audit list is not group-scoped because every upload covers all agents. `agent` receives 403.
     *     NOTE: Failed uploads that never created an `upload_batches` row (e.g. validation rejected the payload before persistence) do not appear in this list. They are visible only in error logs and `report_jobs` (async path only).
     */
    get: operations['listSalesReportUploads'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create an async report-upload job
     * @description Accepts a raw xlsx file, stores it in the reports S3 bucket, creates a `report_jobs` row, and kicks off the external ETL service. Returns immediately with a human-readable `reference` identifier (`SALES-REPORT-YYYYMMDDHHMMSSsss`). Manager-only.
     */
    post: operations['createReportJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/jobs/{reference}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Poll the status of a report-upload job */
    get: operations['getReportJob'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/jobs/{reference}/complete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * ETL callback (internal-key auth, NOT user JWT)
     * @description Called by the Python ETL service when processing finishes. Authenticated with `Authorization: Bearer <ETL_API_KEY>`. Triggers persistence on success or marks the job failed on error.
     */
    post: operations['completeReportJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/jobs/{reference}/retry': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Retry a failed report job
     * @description Re-kicks the ETL using the file already in the reports bucket. Only allowed when the job is in `failed` status. Manager-only.
     */
    post: operations['retryReportJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/cleanup-old-report-files': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Retention cleanup for raw report files (ETL_API_KEY auth)
     * @description Deletes the uploaded xlsx files of completed report jobs older than 30 days from the reports S3 bucket, then clears each job's `storage_path` so the same files are not queued again. The job record itself is retained.
     *     Authenticated with `Authorization: Bearer <ETL_API_KEY>`; while no key is configured every request gets 401. Meant to be invoked by an external scheduler once a day.
     *     The endpoint never throws on per-chunk failures. `failedCount > 0` indicates a partial failure and the next run will retry the affected files (they retain their `storage_path`).
     */
    post: operations['cleanupOldReportFiles'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    UserObject: {
      /**
       * Format: uuid
       * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
       */
      id: string;
      /**
       * Format: email
       * @example jane.smith@example.com
       */
      email: string;
      /** @example Jane Smith */
      name: string;
      /**
       * @example agent
       * @enum {string}
       */
      role: 'admin' | 'master_trainer' | 'trainer' | 'group_leader' | 'agent';
      /** @example AGT-00123 */
      agent_code: string;
      /** @example Singapore */
      location: string;
      /**
       * Format: uuid
       * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
       */
      group_id: string | null;
      /**
       * @example active
       * @enum {string}
       */
      status: 'active' | 'inactive' | 'suspended';
      /**
       * Format: date-time
       * @example 2026-03-07T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-03-07T08:00:00.000Z
       */
      updated_at: string;
      /**
       * @description IDs of groups managed by this user. Populated for trainers; empty array for all other roles.
       * @example [
       *       "abc-123-uuid",
       *       "def-456-uuid"
       *     ]
       */
      managed_group_ids?: string[];
      /**
       * @description The agent's personal annual FYCt sales target in RM. Null if the agent has not set a target yet.
       * @example 400000
       */
      sales_target?: number | null;
      /**
       * @description The agent's FYCt annual target (set via PUT /users/{userId}). Null if the agent has not set a target yet.
       * @example 300000
       */
      fyct_target?: number | null;
      /**
       * @description The agent's FYC annual target (set via PUT /users/{userId}). Null if the agent has not set a target yet.
       * @example 250000
       */
      fyc_target?: number | null;
    };
    AgentCodeObject: {
      /**
       * @description The agent code as stored, case-sensitive and verbatim.
       * @example T66701C
       */
      agentCode: string;
      /**
       * @description `true` once a user has been onboarded against this code. Newly inserted rows are `false`. On upsert into an existing row, this value is **not** reset.
       * @example false
       */
      isUsed: boolean;
      /**
       * Format: date-time
       * @description ISO 8601 datetime of original row creation. For an upsert that hit an existing row, this is the original creation time, not the time of the current request.
       * @example 2026-05-04T09:41:35.000Z
       */
      createdAt: string;
      /**
       * Format: date-time
       * @description ISO 8601 datetime the row was last touched (insert or upsert).
       * @example 2026-05-04T09:41:35.000Z
       */
      updatedAt: string;
    };
    AgentCodeListItem: {
      /**
       * @description The agent code as stored, case-sensitive and verbatim.
       * @example T66701C
       */
      agentCode: string;
      /**
       * @description `true` once a user has been onboarded against this code; `false` for unclaimed codes.
       * @example false
       */
      isUsed: boolean;
      /**
       * Format: uuid
       * @description UUID of the user who claimed this code, or `null` if the code has not yet been used.
       * @example null
       */
      userId: string | null;
      /**
       * Format: date-time
       * @description ISO 8601 datetime of original row creation.
       * @example 2025-01-01T00:00:00.000Z
       */
      createdAt: string;
      /**
       * Format: date-time
       * @description ISO 8601 datetime the row was last modified.
       * @example 2025-01-01T00:00:00.000Z
       */
      updatedAt: string;
    };
    TaxonomyObject: {
      /**
       * Format: uuid
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      id: string;
      /**
       * @description The taxonomy category this value belongs to.
       * @example lead_source
       */
      type: string;
      /**
       * @description The dropdown value stored for the category.
       * @example Referral
       */
      value: string;
      /**
       * @description Sort position used when ordering values within a category.
       * @example 0
       */
      sort_order: number;
      /**
       * Format: date-time
       * @example 2026-06-01T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-06-01T08:00:00.000Z
       */
      updated_at: string;
    };
    GroupObject: {
      /**
       * Format: uuid
       * @example 7c9e6679-7425-40de-944b-e07fc1f90ae7
       */
      id: string;
      /** @example Alpha Team */
      name: string;
      /** @example active */
      status: string;
      /**
       * Format: uuid
       * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
       */
      leader_id: string | null;
      /**
       * Format: date-time
       * @example 2026-03-10T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-03-10T08:00:00.000Z
       */
      updated_at: string;
    };
    GroupStatsObject: {
      /**
       * Format: uuid
       * @example 7c9e6679-7425-40de-944b-e07fc1f90ae7
       */
      group_id: string;
      /** @example Alpha Team */
      group_name: string;
      /**
       * @description Total prospects created for the group year-to-date.
       * @example 45
       */
      ytd_prospects: number;
      /**
       * @description Prospects whose appointment status is `scheduled` or `rescheduled` for the group year-to-date.
       * @example 30
       */
      ytd_appointments_set: number;
      /**
       * @description Prospects whose appointment status is `done` for the group year-to-date.
       * @example 20
       */
      ytd_sales_meetings: number;
      /**
       * @description Total number of successful sales (NOC) for the group year-to-date.
       * @example 12
       */
      ytd_sales_noc: number;
      /**
       * @description Total sum of products sold amounts (ACE) for the group year-to-date.
       * @example 180000
       */
      ytd_sales_ace: number;
      /**
       * @description Current total count of agents belonging to the group.
       * @example 8
       */
      ytd_agents_count: number;
    };
    GroupDetailStatsObject: {
      /**
       * Format: uuid
       * @example 7c9e6679-7425-40de-944b-e07fc1f90ae7
       */
      group_id: string;
      /** @example Alpha Team */
      group_name: string;
      ytd: components['schemas']['DashboardStatsPeriod'];
      mtd: components['schemas']['GroupDetailStatsMtdPeriod'];
      /** @description List of individual agent statistics for the group. */
      agents: components['schemas']['AgentStats'][];
    };
    /** @description Aggregated statistics for the month-to-date period scoped to a specific group. Excludes `agents_count` — agent count is a current point-in-time figure and is only present in the `ytd` object. */
    GroupDetailStatsMtdPeriod: {
      /**
       * @description Total prospects created in the period.
       * @example 8
       */
      prospects: number;
      /**
       * @description Prospects whose appointment status is `scheduled` or `rescheduled` in the period.
       * @example 5
       */
      appointments_set: number;
      /**
       * @description Prospects whose appointment status is `done` in the period.
       * @example 4
       */
      sales_meetings: number;
      /**
       * @description Prospects with a successful sales outcome in the period.
       * @example 2
       */
      sales_noc: number;
      /**
       * @description Total sum of products sold amounts for successful sales in the period.
       * @example 30000
       */
      sales_ace: number;
    };
    /** @description YTD and MTD statistics for an individual agent within a group. */
    AgentStats: {
      /**
       * Format: uuid
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      agent_id: string;
      /** @example John Doe */
      agent_name: string;
      /**
       * @description Total prospects created by the agent year-to-date.
       * @example 15
       */
      ytd_prospects: number;
      /**
       * @description Prospects whose appointment status is `scheduled` or `rescheduled` for the agent year-to-date.
       * @example 10
       */
      ytd_appointments_set: number;
      /**
       * @description Prospects whose appointment status is `done` for the agent year-to-date.
       * @example 7
       */
      ytd_sales_meetings: number;
      /**
       * @description Prospects with a successful sales outcome for the agent year-to-date.
       * @example 4
       */
      ytd_sales_noc: number;
      /**
       * @description Total sum of products sold amounts for the agent year-to-date.
       * @example 60000
       */
      ytd_sales_ace: number;
      /**
       * @description Total prospects created by the agent month-to-date.
       * @example 2
       */
      mtd_prospects: number;
      /**
       * @description Prospects whose appointment status is `scheduled` or `rescheduled` for the agent month-to-date.
       * @example 1
       */
      mtd_appointments_set: number;
      /**
       * @description Prospects whose appointment status is `done` for the agent month-to-date.
       * @example 1
       */
      mtd_sales_meetings: number;
      /**
       * @description Prospects with a successful sales outcome for the agent month-to-date.
       * @example 1
       */
      mtd_sales_noc: number;
      /**
       * @description Total sum of products sold amounts for the agent month-to-date.
       * @example 10000
       */
      mtd_sales_ace: number;
    };
    ProspectObject: {
      /**
       * Format: uuid
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      id: string;
      /**
       * Format: uuid
       * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
       */
      agent_id: string;
      /** @example Alice Johnson */
      prospect_name: string;
      /**
       * Format: email
       * @example alice.johnson@example.com
       */
      prospect_email: string | null;
      /** @example +6591234567 */
      prospect_phone: string | null;
      /**
       * @example prospect
       * @enum {string}
       */
      current_stage: 'prospect' | 'appointment' | 'sales';
      /**
       * @description Ordered list of stage transition records for this prospect.
       * @example []
       */
      stage_history?: Record<string, never>[];
      /**
       * Format: date-time
       * @example 2026-03-12T08:00:00.000Z
       */
      prospect_entered_at: string;
      /**
       * Format: date
       * @example 2026-04-01
       */
      appointment_date?: string | null;
      /** @example 14:00 */
      appointment_start_time?: string | null;
      /** @example 15:00 */
      appointment_end_time?: string | null;
      /** @example Raffles Place Office */
      appointment_location?: string | null;
      /**
       * @example scheduled
       * @enum {string|null}
       */
      appointment_status?:
        | 'not_done'
        | 'scheduled'
        | 'rescheduled'
        | 'kiv'
        | 'done'
        | 'declined'
        | null;
      /**
       * Format: date-time
       * @example 2026-04-01T15:00:00.000Z
       */
      appointment_completed_at?: string | null;
      /**
       * @description Sales meeting stages completed during the sales meeting.
       * @example [
       *       "social",
       *       "factFind"
       *     ]
       */
      sales_parts_completed?: ('social' | 'factFind' | 'presentation')[] | null;
      /**
       * @description Products sold to the prospect.
       * @example [
       *       {
       *         "productName": "Term Life Insurance",
       *         "amount": 50000
       *       }
       *     ]
       */
      products_sold?:
        | {
            /** @example Term Life Insurance */
            productName: string;
            /** @example 50000 */
            amount: number;
          }[]
        | null;
      /**
       * @example successful
       * @enum {string|null}
       */
      sales_outcome?: 'kiv' | 'successful' | 'unsuccessful' | null;
      /** @example Client budget constraints */
      unsuccessful_reason?: string | null;
      /**
       * Format: date-time
       * @example 2026-04-10T10:00:00.000Z
       */
      sales_completed_at?: string | null;
      /**
       * Format: date-time
       * @example 2026-03-12T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-03-12T08:00:00.000Z
       */
      updated_at: string;
    };
    EventObject: {
      /**
       * Format: uuid
       * @example b2c3d4e5-f6a7-8901-bcde-f12345678901
       */
      id: string;
      /** @example Q2 Training Kickoff */
      event_title: string;
      /**
       * Format: date-time
       * @description Start date and time of the event stored as a TIMESTAMPTZ value. Value of the `startDate` field supplied in the request.
       * @example 2026-04-15T09:00:00.000Z
       */
      start_date: string;
      /**
       * Format: date-time
       * @description End date and time of the event stored as a TIMESTAMPTZ value. Value of the `endDate` field supplied in the request.
       * @example 2026-04-15T11:00:00.000Z
       */
      end_date?: string | null;
      /**
       * @description Current status of the event. Defaults to `upcoming` on creation.
       * @example upcoming
       * @enum {string}
       */
      status: 'upcoming' | 'completed' | 'cancelled';
      /**
       * @description Delivery format of the event.
       * @example Face to Face
       * @enum {string}
       */
      type: 'Face to Face' | 'Online';
      /** @example Quarterly training kickoff covering Q2 targets and new product modules. */
      description?: string | null;
      /** @example https://meet.example.com/q2-kickoff */
      meeting_link?: string | null;
      /** @example Raffles Place Conference Room */
      venue?: string | null;
      /**
       * Format: uuid
       * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
       */
      created_by?: string | null;
      /** @example trainer */
      created_by_role?: string | null;
      /**
       * Format: date-time
       * @example 2026-03-14T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-03-14T08:00:00.000Z
       */
      updated_at: string;
      /**
       * @description Visibility of the event. Defaults to `public` for `agent` and `group_leader` roles, `private` for all other roles.
       * @example private
       * @enum {string}
       */
      visibility?: 'public' | 'private';
      /**
       * @description IDs of groups assigned to this event
       * @example [
       *       "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
       *       "c3d4e5f6-a7b8-9012-cdef-123456789012"
       *     ]
       */
      groupIds: string[];
      /**
       * @description IDs of agents individually assigned to this event
       * @example [
       *       "d4e5f6a7-b8c9-0123-def0-234567890123",
       *       "e5f6a7b8-c9d0-1234-ef01-345678901234"
       *     ]
       */
      agentIds: string[];
    };
    PublicEventObject: {
      /**
       * Format: uuid
       * @example b2c3d4e5-f6a7-8901-bcde-f12345678901
       */
      id: string;
      /** @example Q2 Agent Networking Night */
      event_title: string;
      /** @example A networking event open to all agents in the region. */
      description?: string | null;
      /**
       * Format: date-time
       * @example 2026-06-01T18:00:00.000Z
       */
      start_date: string;
      /**
       * Format: date-time
       * @example 2026-06-01T21:00:00.000Z
       */
      end_date?: string | null;
      /**
       * @example Face to Face
       * @enum {string}
       */
      type: 'Online' | 'Face to Face';
      /** @example Marina Bay Sands Convention Centre */
      venue?: string | null;
      /** @example https://meet.example.com/q2-networking */
      meeting_link?: string | null;
      /** @example Jane Doe */
      created_by_name: string;
      /**
       * @example upcoming
       * @enum {string}
       */
      status: 'upcoming' | 'completed';
    };
    DashboardStatsObject: {
      ytd: components['schemas']['DashboardStatsPeriod'];
      mtd: components['schemas']['DashboardStatsPeriod'];
    };
    /** @description Aggregated statistics for a single time period (YTD or MTD). `agents_count` reflects the current total count of users with the `agent` or `group_leader` role and is identical in both periods. */
    DashboardStatsPeriod: {
      /**
       * @description Total prospects created in the period.
       * @example 120
       */
      prospects: number;
      /**
       * @description Prospects whose appointment status is `scheduled` or `rescheduled` in the period.
       * @example 85
       */
      appointments_set: number;
      /**
       * @description Prospects whose appointment status is `done` in the period.
       * @example 60
       */
      sales_meetings: number;
      /**
       * @description Prospects with a successful sales outcome in the period.
       * @example 30
       */
      sales_noc: number;
      /**
       * @description Total sum of products sold amounts for successful sales in the period.
       * @example 450000
       */
      sales_ace: number;
      /**
       * @description Current total count of users with the `agent` or `group_leader` role. This value is the same for both YTD and MTD periods.
       * @example 24
       */
      agents_count: number;
    };
    PointActivityTypeObject: {
      /**
       * @description Unique activity key used as the identifier in point configs and transactions.
       * @example coaching_session_attended
       */
      name: string;
      /**
       * @description Category the activity belongs to (e.g. prospect, coaching).
       * @example coaching
       */
      category: string;
      /**
       * @description Human-readable display name for the activity.
       * @example Session Attended
       */
      label: string;
      /**
       * @description Subject entity type associated with the activity (used internally by the points engine).
       * @example coaching_session
       */
      subject_type: string;
    };
    PointConfigObject: {
      /**
       * Format: uuid
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      id: string;
      /** @example coaching_session_attended */
      activity: string;
      /**
       * @description Category derived from the activity type (e.g. prospect, coaching).
       * @example coaching
       */
      category: string;
      /** @example 10 */
      points: number;
      /**
       * Format: date-time
       * @example 2026-03-29T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-03-29T08:00:00.000Z
       */
      updated_at: string;
    };
    LeaderboardEntryObject: {
      /**
       * Format: uuid
       * @example d4e5f6a7-b8c9-0123-def0-234567890123
       */
      agent_id: string;
      /** @example John Doe */
      agent_name: string;
      /** @example AGT001 */
      agent_code: string;
      /**
       * Format: uuid
       * @description UUID of the group the agent belongs to. Null if not in a group.
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      group_id: string | null;
      /**
       * @description Name of the group the agent belongs to. Null if not in a group.
       * @example Alpha Team
       */
      group_name: string | null;
      /**
       * @description Cumulative points earned by the agent.
       * @example 150
       */
      total_points: number;
    };
    LeaderboardStatsIndividualObject: {
      /**
       * Format: uuid
       * @example d4e5f6a7-b8c9-0123-def0-234567890123
       */
      user_id: string;
      /** @example Jane Doe */
      name: string;
      /** @example AGT-001 */
      agent_code: string;
      /**
       * Format: uuid
       * @description UUID of the group the agent belongs to. Null if the agent is not in a group.
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      group_id: string | null;
      /**
       * @description Name of the group the agent belongs to. Null if the agent is not in a group.
       * @example Team Alpha
       */
      group_name: string | null;
      /**
       * @description Number of prospects added in the period.
       * @example 8
       */
      prospects_added: number;
      /**
       * @description Number of appointments completed in the period.
       * @example 5
       */
      appointments_completed: number;
      /**
       * @description Number of sales meetings held in the period.
       * @example 4
       */
      sales_meetings: number;
      /**
       * @description Number of successful sales closed in the period.
       * @example 2
       */
      sales_successful: number;
      /**
       * @description Total points this agent earned in the period, summed server-side from the points ledger.
       * @example 26
       */
      total_points: number;
      /**
       * @description Annualized Commission Earnings. For `period=mtd`, the current calendar month's value sourced from `sales_report_mtd_fyc`; for `period=ytd`, the latest available month snapshot for the current year from `sales_report_ytd`. Defaults to 0 if no sales-report data is available.
       * @example 12500.5
       */
      ace: number;
      /**
       * @description First Year Commission. For `period=mtd`, the month-to-date delta derived from the `sales_report_mtd_fyc` LAG view; for `period=ytd`, the cumulative year-to-date value from `sales_report_ytd`. Defaults to 0 if no sales-report data is available.
       * @example 8400
       */
      fyc: number;
      /**
       * @description First Year Commission Target. For `period=mtd`, the month-to-date delta derived from the `sales_report_mtd_fyc` LAG view; for `period=ytd`, the cumulative year-to-date value from `sales_report_ytd`. Defaults to 0 if no sales-report data is available.
       * @example 9000
       */
      fyct: number;
      /**
       * @description Average Case Size for the period. For `period=mtd`, the current calendar month's value sourced from `sales_report_mtd`; for `period=ytd`, the latest available month snapshot for the current year from `sales_report_ytd`. Defaults to 0 when no sales-report data is available.
       * @example 12500.5
       */
      acs: number;
    };
    LeaderboardStatsGroupObject: {
      /**
       * Format: uuid
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      group_id: string;
      /** @example Team Alpha */
      group_name: string;
      /**
       * @description Name of the group leader. Null if no leader is assigned.
       * @example John Leader
       */
      leader_name: string | null;
      /**
       * @description Number of members in the group.
       * @example 5
       */
      member_count: number;
      /**
       * @description Aggregated number of prospects added by all group members in the period.
       * @example 32
       */
      prospects_added: number;
      /**
       * @description Aggregated number of appointments completed by all group members in the period.
       * @example 21
       */
      appointments_completed: number;
      /**
       * @description Aggregated number of sales meetings held by all group members in the period.
       * @example 15
       */
      sales_meetings: number;
      /**
       * @description Aggregated number of successful sales closed by all group members in the period.
       * @example 8
       */
      sales_successful: number;
      /**
       * @description Total points the group's active members earned in the period, summed server-side from the points ledger.
       * @example 52
       */
      total_points: number;
      /**
       * @description Aggregated Annualized Commission Earnings across all group members in the period. For `period=mtd`, the current calendar month's value sourced from `sales_report_mtd_fyc`; for `period=ytd`, the latest available month snapshot for the current year from `sales_report_ytd`. Members with no sales-report data contribute 0.
       * @example 62500.5
       */
      ace: number;
      /**
       * @description Aggregated First Year Commission across all group members in the period. For `period=mtd`, the month-to-date delta derived from the `sales_report_mtd_fyc` LAG view; for `period=ytd`, the cumulative year-to-date value from `sales_report_ytd`. Members with no sales-report data contribute 0.
       * @example 42000
       */
      fyc: number;
      /**
       * @description Aggregated First Year Commission Target across all group members in the period. For `period=mtd`, the month-to-date delta derived from the `sales_report_mtd_fyc` LAG view; for `period=ytd`, the cumulative year-to-date value from `sales_report_ytd`. Members with no sales-report data contribute 0.
       * @example 45000
       */
      fyct: number;
      /**
       * @description Average Case Size = ACE / NOC for the period. For period=mtd uses the current month's ACE and NOC; for period=ytd uses the latest cumulative snapshot for the current year. Returns 0 when there are no cases (NOC = 0).
       * @example 18750.25
       */
      acs: number;
    };
    AgentPointsObject: {
      /**
       * @description Total points accumulated by the agent across all categories.
       * @example 142
       */
      total: number;
      /** @description Points breakdown by category. */
      categories: {
        /** @example 142 */
        prospect: number;
        /** @example 0 */
        sales: number;
        /** @example 0 */
        coaching: number;
      };
      /** @description Paginated list of individual point transactions. */
      breakdown: components['schemas']['AgentPointsBreakdownItem'][];
      pagination: components['schemas']['PaginationObject'];
    };
    AgentPointsBreakdownItem: {
      /**
       * Format: uuid
       * @description Unique identifier for the point transaction.
       * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
       */
      id: string;
      /**
       * Format: date-time
       * @description Timestamp at which the points were awarded.
       * @example 2026-03-30T10:00:00.000Z
       */
      date: string;
      /**
       * @description Category the points belong to.
       * @example prospect
       */
      category: string;
      /**
       * @description Human-readable label for the action that triggered the award.
       * @example Appointment Set
       */
      action: string;
      /**
       * @description Name of the subject (e.g. prospect) associated with the action. Null when the underlying subject has been deleted — e.g. a `prospect_deleted` compensation row references a prospect that no longer exists. Frontends should fall back to the action label.
       * @example John Tan
       */
      subject?: string | null;
      /**
       * @description Number of points awarded for this transaction.
       * @example 3
       */
      points: number;
    };
    PaginationObject: {
      /**
       * @description Current page number.
       * @example 1
       */
      page: number;
      /**
       * @description Number of items per page.
       * @example 20
       */
      limit: number;
      /**
       * @description Total number of items across all pages.
       * @example 47
       */
      total_count: number;
      /**
       * @description Total number of pages.
       * @example 3
       */
      total_pages: number;
    };
    ErrorResponse: {
      /** @example Server Error */
      message: string;
    };
    /** @description A 400 from a query-string check. Validation failures carry the Zod `errors` issues; other rejections (such as an invalid `nextToken`) carry only `message`. */
    QueryValidationErrorResponse: {
      /** @example Validation failed */
      message: string;
      errors?: {
        [key: string]: unknown;
      }[];
    };
    /**
     * @example group_coaching
     * @enum {string}
     */
    CoachingTypeEnum:
      | 'individual_coaching'
      | 'group_coaching'
      | 'peer_circles'
      | 'seminar';
    /**
     * @example online
     * @enum {string}
     */
    TrainingModeEnum: 'online' | 'face_to_face';
    /**
     * @example upcoming
     * @enum {string}
     */
    SessionStatusEnum: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
    /**
     * @example joined
     * @enum {string}
     */
    AttendanceStatusEnum: 'pending' | 'joined' | 'did_not_attend';
    CoachingSessionObject: {
      /**
       * Format: uuid
       * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
       */
      id: string;
      coaching_type: components['schemas']['CoachingTypeEnum'];
      /** @example Weekly Group Coaching */
      title: string;
      /** @example Focus on objection handling techniques */
      description?: string | null;
      /**
       * Format: date-time
       * @description Start date and time of the session stored as a TIMESTAMPTZ value. Value of the `startDate` field supplied in the request.
       * @example 2026-04-15T10:00:00.000Z
       */
      start_date: string;
      /**
       * Format: date-time
       * @description End date and time of the session stored as a TIMESTAMPTZ value. Value of the `endDate` field supplied in the request.
       * @example 2026-04-15T12:00:00.000Z
       */
      end_date?: string | null;
      training_mode: components['schemas']['TrainingModeEnum'];
      /**
       * @description Meeting link (e.g. Zoom, Google Meet).
       * @example https://zoom.us/j/123456789
       */
      link?: string | null;
      status: components['schemas']['SessionStatusEnum'];
      /**
       * Format: uuid
       * @description UUID of the user who created the session.
       * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
       */
      created_by: string;
      /**
       * @description Display name of the session creator.
       * @example Jane Trainer
       */
      created_by_name?: string;
      /**
       * @description Application role of the session creator.
       * @example trainer
       */
      created_by_role?: string;
      /**
       * Format: date-time
       * @example 2026-04-01T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-04-01T08:00:00.000Z
       */
      updated_at: string;
      /**
       * @description UUIDs of groups targeted by this session. Empty array if all audiences.
       * @example [
       *       "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
       *     ]
       */
      targetGroupIds: string[];
      /**
       * @description UUIDs of agents individually targeted by this session. Empty array if none.
       * @example []
       */
      targetAgentIds: string[];
      /**
       * @description Number of attendance records for the session.
       * @example 7
       */
      attendance_total: number;
      /**
       * @description How many of those agents have joined.
       * @example 5
       */
      attendance_joined: number;
    };
    /** @description A coaching session with its full attendance, as returned by `GET /coaching-sessions/{sessionId}`. Lists carry only the counts. */
    CoachingSessionDetailObject: components['schemas']['CoachingSessionObject'] & {
      /** @description Every attendance record for the session. */
      attendance: components['schemas']['AttendanceRecordObject'][];
    };
    AttendanceRecordObject: {
      /**
       * Format: uuid
       * @example 7c9e6679-7425-40de-944b-e07fc1f90ae7
       */
      id: string;
      /**
       * Format: uuid
       * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
       */
      session_id: string;
      /**
       * Format: uuid
       * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
       */
      agent_id: string;
      /** @example John Agent */
      agent_name: string;
      /**
       * Format: email
       * @example john.agent@example.com
       */
      agent_email: string;
      /**
       * Format: uuid
       * @description UUID of the agent's group. Null if the agent is not in a group.
       * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
       */
      group_id: string | null;
      /**
       * @description Name of the agent's group. Null if the agent is not in a group.
       * @example Team Alpha
       */
      group_name: string | null;
      status: components['schemas']['AttendanceStatusEnum'];
      /**
       * Format: date-time
       * @description Timestamp when the agent joined the session. Null if not yet joined.
       * @example 2026-04-15T10:05:00.000Z
       */
      joined_at?: string | null;
      /**
       * Format: date-time
       * @example 2026-04-15T08:00:00.000Z
       */
      created_at: string;
      /**
       * Format: date-time
       * @example 2026-04-15T10:05:00.000Z
       */
      updated_at: string;
    };
    ValidationErrorResponse: {
      /** @example Validation failed */
      message: string;
      /**
       * @description Top-level (non-field) validation error messages.
       * @example []
       */
      formErrors: string[];
      /**
       * @description Per-field validation error messages keyed by field name.
       * @example {
       *       "fieldName": [
       *         "Error message for the field"
       *       ]
       *     }
       */
      fieldErrors: {
        [key: string]: string[];
      };
    };
    /** @description ETL pipeline output as produced by the upstream `dynamic_excel_etl` template — the raw artifact, untouched by the caller. The intent metadata `report_year` / `report_month` lives one level up on the request body, not inside this object. Extra top-level fields (`success`, `etl_version`, `template_name`, `upload_id`, `output_excel`, `json_output`, `log_file`, `errors_found`, `columns_detected`, `layout_detected`, `errors`) are accepted and ignored. */
    EtlResultObject: {
      /**
       * @description Filename or identifier of the original report.
       * @example tests/samples/Book2_ytd_and_months_uploaded.xlsx
       */
      source: string;
      /**
       * Format: date-time
       * @description Timestamp the ETL pipeline produced this result. Informational only — not used to derive year/month.
       * @example 2026-04-29T16:01:33.114Z
       */
      created_at: string;
      /**
       * @description Number of rows the ETL pipeline read from the source.
       * @example 67
       */
      rows_loaded: number;
      /** @description Uppercase English month names whose ACE/NOC columns are present in the source. Informational only — used by the FE for column-coverage display, not by the backend to derive the report month. */
      months_detected: (
        | 'JANUARY'
        | 'FEBRUARY'
        | 'MARCH'
        | 'APRIL'
        | 'MAY'
        | 'JUNE'
        | 'JULY'
        | 'AUGUST'
        | 'SEPTEMBER'
        | 'OCTOBER'
        | 'NOVEMBER'
        | 'DECEMBER'
      )[];
      records: {
        /**
         * @description The agent code from the source row; resolved server-side to a `users.id`.
         * @example T66701C
         */
        agentCode: string;
        /** @description Open-ended bag of column-name → value pairs. Recognised numeric keys include the YTD totals (`'ACE (YTD)'`, `'NOC (YTD)'`, `'ACS (YTD)'`, `'FYCT (YTD)'`, `'% FYCT (YTD)'`, `'MDRT SHORTAGE FYCT'`, `'FYC (YTD)'`, `'% FYC (YTD)'`, `'MDRT SHORTAGE FYC'`) and per-month MTD groups (`'JANUARY ACE'`, `'JANUARY NOC'`, `'JANUARY ACS'`, etc.). String keys like `'AGENT CODE'` and `'AGENT NAME'` (which the ETL may include as duplicates of the outer fields) are accepted and ignored. Missing or non-numeric values default to 0. */
        rowData: {
          [key: string]: unknown;
        };
      }[];
    };
    /** @description Sync upload body. `report_year` / `report_month` are caller-supplied intent metadata that sit alongside the raw ETL artifact rather than inside it. */
    UploadReportRequest: {
      /**
       * @description Calendar year the report covers. Authoritative — supplied by the caller, not derived from the file.
       * @example 2026
       */
      report_year: number;
      /**
       * @description Calendar month (1-12) the report covers. Authoritative — supplied by the caller, not derived from the file.
       * @example 5
       */
      report_month: number;
      etlResult: components['schemas']['EtlResultObject'];
    };
    /** @description Manual-mode ingest body. Field names use snake_case to mirror the ETL JSON style (the ETL author POSTs this directly from a Python `requests.post(...)` call). `report_year` / `report_month` are siblings of `etl_result` — admin tells the ETL author what month the file covers out-of-band; the ETL itself is unaware of them. */
    IngestReportRequest: {
      /**
       * @description Calendar year the report covers. Authoritative — supplied by the caller, not derived from the file.
       * @example 2026
       */
      report_year: number;
      /**
       * @description Calendar month (1-12) the report covers. Authoritative — supplied by the caller, not derived from the file.
       * @example 5
       */
      report_month: number;
      etl_result: components['schemas']['EtlResultObject'];
    };
    UploadReportResponse: {
      /** @example true */
      success: boolean;
      data: {
        /**
         * Format: uuid
         * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
         */
        batchId: string;
        /**
         * @description Count of agent rows that were successfully persisted.
         * @example 63
         */
        processed: number;
        /**
         * @description Count of agent rows that were skipped (e.g. unmatched agentCode).
         * @example 2
         */
        skipped: number;
        errors: {
          /** @example T12345A */
          agentCode: string;
          /** @example User not found */
          reason: string;
        }[];
      };
    };
    /** @description Per-agent annual sales-report rollup. Combines the latest YTD snapshot of the year with monthly arrays. `id` is the `sales_report_ytd.id` of the latest month for that agent. `agent_id` is the public `users.id`. `imported_at` is the most recent time this YTD snapshot was written or overwritten — corrective re-uploads of the same (user, year, month) advance this without changing `created_at`. The four `month_*` arrays are 12-element, index 0 = January, index 11 = December; missing months are 0. */
    SalesReport: {
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      agent_id: string;
      /** @example T75040K */
      agent_code: string;
      /** @example MELISSA ADLINA */
      agent_name: string;
      /** @example 2026 */
      year: number;
      /**
       * Format: date-time
       * @description Most recent time this YTD snapshot was written or overwritten. Sourced from `sales_report_ytd.updated_at`; advances on every corrective re-upload while `created_at` stays fixed.
       * @example 2026-04-29T16:01:33.000Z
       */
      imported_at: string;
      /** @example 620000 */
      ace_ytd: number;
      /** @example 18 */
      noc_ytd: number;
      /** @example 295000 */
      fyct_ytd: number;
      /** @example 0.0132 */
      fyct_pct: number;
      /** @example 393112.13 */
      mdrt_shortage_fyct: number;
      /** @example 1222.11 */
      fyc_ytd: number;
      /** @example 0.0092 */
      fyc_pct: number;
      /** @example 131577.89 */
      mdrt_shortage_fyc: number;
      /**
       * @example [
       *       0,
       *       0,
       *       9118.64,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0
       *     ]
       */
      month_ace: number[];
      /**
       * @example [
       *       0,
       *       0,
       *       7,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0
       *     ]
       */
      month_noc: number[];
      /**
       * @example [
       *       0,
       *       0,
       *       5287.87,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0
       *     ]
       */
      month_fyct: number[];
      /**
       * @example [
       *       0,
       *       0,
       *       1222.11,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0,
       *       0
       *     ]
       */
      month_fyc: number[];
      /**
       * @description The agent's FYCt annual target (set on their Profile via PUT /users/{userId}). Null if unset.
       * @example 300000
       */
      fyct_target?: number | null;
      /**
       * @description The agent's FYC annual target (set on their Profile via PUT /users/{userId}). Null if unset.
       * @example 250000
       */
      fyc_target?: number | null;
    };
    SalesReportListResponse: {
      /** @example true */
      success: boolean;
      data: components['schemas']['SalesReport'][];
    };
    SalesReportSingleResponse: {
      /** @example true */
      success: boolean;
      data: components['schemas']['SalesReport'];
    };
    /** @description Audit row for a past upload batch. `imported_at` maps from `upload_batches.created_at`. `uploader_name` is null when the upload was manual-mode (no JWT). */
    UploadAuditEntry: {
      /** Format: uuid */
      id: string;
      /** @example 2026 */
      year: number;
      /** @example 3 */
      month: number;
      /** @example input.xlsx */
      file_name: string;
      /** @example 65 */
      rows_loaded: number;
      /** @example 2 */
      rows_skipped: number;
      /**
       * @example partial
       * @enum {string}
       */
      status: 'success' | 'partial' | 'failed';
      /** @example Jane Doe */
      uploader_name: string | null;
      /**
       * Format: date-time
       * @example 2026-04-29T16:01:33.000Z
       */
      imported_at: string;
    };
    UploadAuditListResponse: {
      /** @example true */
      success: boolean;
      data: components['schemas']['UploadAuditEntry'][];
      meta: {
        /** @example 1 */
        page: number;
        /** @example 50 */
        pageSize: number;
        /** @example 12 */
        total: number;
      };
    };
    /** @description Report-job record. The `reference` field is the public-facing, human-readable identifier used in URLs, ETL payloads, callbacks, and polling. The internal UUID `id` is intentionally omitted from external responses. */
    ReportJobObject: {
      /** @example SALES-REPORT-20260502143022873 */
      reference?: string;
      /** Format: uuid */
      uploaded_by?: string;
      storage_path?: string;
      file_name?: string;
      report_year?: number;
      report_month?: number;
      /** @enum {string} */
      status?: 'pending' | 'processing' | 'completed' | 'failed';
      /** Format: uuid */
      batch_id?: string | null;
      /** @description IUploadResult on success */
      result?: Record<string, never> | null;
      error_message?: string | null;
      attempts?: number;
      /** Format: date-time */
      created_at?: string;
      /** Format: date-time */
      updated_at?: string;
    };
    ReportJobResponse: {
      success: boolean;
      data: components['schemas']['ReportJobObject'];
    };
    EtlCallbackBody: {
      /** @enum {string} */
      status: 'success' | 'failed';
      /** @description Required when status=success. Full etl_result.json shape. */
      etl_result?: Record<string, never>;
      /** @description Required when status=failed */
      error?: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description API is healthy */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example ok */
            status: string;
            /**
             * Format: date-time
             * @example 2026-03-04T08:00:00.000Z
             */
            timestamp: string;
          };
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  register: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** @example Jane Smith */
          fullName: string;
          /**
           * @description Agent code provisioned by an admin. Must exist and must not have been used by another account.
           * @example AGT-00123
           */
          agentCode: string;
          /**
           * Format: email
           * @example jane.smith@example.com
           */
          email: string;
          /**
           * Format: uuid
           * @description UUID of the group the agent belongs to.
           * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
           */
          groupId: string;
          /** @example Singapore */
          location: string;
        };
      };
    };
    responses: {
      /** @description Registration successful */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: {
              user: components['schemas']['UserObject'];
            };
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation or the agent code is invalid or already used. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ErrorResponse']
            | components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description An account with this email already exists. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "User already exists"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  startLogin: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * Format: email
           * @example jane.smith@example.com
           */
          email: string;
        };
      };
    };
    responses: {
      /** @description A code was sent (when the account exists). */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: {
              /**
               * @description Opaque value to send back with the code.
               * @example AYABeC1-y8qooiuysEv0uM4wAqQAHQABAAdTZXJ2aWNl...
               */
              session: string;
            };
          };
        };
      };
      /** @description Request body fails validation, or the account cannot sign in. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ErrorResponse']
            | components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Too many attempts. Try again later. */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  verifyLogin: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * Format: email
           * @example jane.smith@example.com
           */
          email: string;
          /** @description The session value returned by `POST /auth/login`. */
          session: string;
          /**
           * @description The one-time code sent to the email address.
           * @example 123456
           */
          code: string;
        };
      };
    };
    responses: {
      /** @description Login successful */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: {
              user: components['schemas']['UserObject'];
              tokens: {
                /** @description Send as the Authorization header: Bearer <accessToken>. */
                accessToken: string;
                refreshToken?: string | null;
                idToken?: string | null;
                /**
                 * @description Access token lifetime in seconds.
                 * @example 900
                 */
                expiresIn?: number | null;
              };
            };
          };
        };
      };
      /** @description Wrong or expired code, or request body fails validation. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Invalid credentials"
           *     }
           */
          'application/json':
            | components['schemas']['ErrorResponse']
            | components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description The account is inactive. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Account is inactive"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Too many attempts. Try again later. */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Logout successful */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, does not start with `Bearer `, or the token portion is empty. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Authenticated user profile retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, does not start with `Bearer `, or the token portion is empty or invalid. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listUsers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Users retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'][];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** @example John Doe */
          name: string;
          /**
           * Format: email
           * @example john.doe@example.com
           */
          email: string;
          /**
           * @example agent
           * @enum {string}
           */
          role:
            | 'admin'
            | 'master_trainer'
            | 'trainer'
            | 'group_leader'
            | 'agent';
          /**
           * @description Required when `role` is `agent`. Must be an existing agent code that no other account has claimed. Always supplied by the client — never generated by the server.
           * @example AGT-00123
           */
          agentCode?: string;
        };
      };
    };
    responses: {
      /** @description User created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation or the supplied agent code is invalid or already used. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the user to retrieve. */
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description User retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no user exists for the given `userId`, or the caller may not see them. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "User not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the user to update. */
        userId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * Format: email
           * @example jane.smith@example.com
           */
          email?: string;
          /** @example Jane Smith */
          name?: string;
          /** @example +6591234567 */
          phone?: string;
          /** @example Acme Insurance */
          agency?: string;
          /** @example Singapore */
          location?: string;
          /**
           * @description Only honoured for admin callers. Non-admin callers may include this field but it is silently stripped.
           * @example trainer
           * @enum {string}
           */
          role?: 'admin' | 'master_trainer' | 'trainer' | 'agent';
          /**
           * @description Annual FYCt sales target in RM. Pass null to clear the target.
           * @example 400000
           */
          sales_target?: number | null;
          /**
           * @description The agent's FYCt annual target. Must be greater than 0 when provided. Pass null to clear the target.
           * @example 300000
           */
          fyct_target?: number | null;
          /**
           * @description The agent's FYC annual target. Must be greater than 0 when provided. Pass null to clear the target.
           * @example 250000
           */
          fyc_target?: number | null;
        };
      };
    };
    responses: {
      /** @description User updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation (e.g. no fields provided or invalid values). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [
           *         "At least one field must be provided"
           *       ],
           *       "fieldErrors": {}
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when a non-admin user attempts to update another user. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no user exists for the given `userId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "User not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The UUID of the user to delete. */
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description User deleted successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no user exists for the given `userId`, or the caller may not see them. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "User not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deactivateUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the user to deactivate. */
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description User deactivated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'];
          };
        };
      };
      /** @description Bad request. Returned when the authenticated admin attempts to deactivate their own account. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Admins cannot deactivate themselves"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no user exists for the given `userId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "User not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  reactivateUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the user to reactivate. */
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description User reactivated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['UserObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no user exists for the given `userId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "User not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listGroups: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Groups retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['GroupObject'][];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createGroup: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** @example Alpha Team */
          name: string;
          /**
           * Format: uuid
           * @description UUID of the user to assign as group leader. Must be an existing user with the `agent` role.
           * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
           */
          leader_id?: string;
          /**
           * @description Array of UUIDs of users to assign as group trainers. Each must be an existing user with the `trainer` role.
           * @example [
           *       "3fa85f64-5717-4562-b3fc-2c963f66afa6"
           *     ]
           */
          trainer_ids?: string[];
        };
      };
    };
    responses: {
      /** @description Group created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['GroupObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation or a domain rule is violated (e.g. invalid role for leader or trainer, or a referenced user does not exist). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getGroup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the group to retrieve. */
        groupId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Group retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['GroupObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no group exists for the given `groupId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Group not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateGroup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the group to update. */
        groupId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** @example Bravo Team */
          name?: string;
          /**
           * @example active
           * @enum {string}
           */
          status?: 'active' | 'inactive';
          /**
           * Format: uuid
           * @description UUID of the user to promote to group leader. Must be a user with the `agent` role. If the group already has a leader, that leader is demoted back to `agent`.
           * @example 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
           */
          leader_id?: string;
          /**
           * @description Array of UUIDs of users to set as group trainers. Replaces all existing trainer assignments for the group. Each must be a user with the `trainer` role.
           * @example [
           *       "3fa85f64-5717-4562-b3fc-2c963f66afa6"
           *     ]
           */
          trainer_ids?: string[];
          /**
           * @description Replaces the full member set for the group. Users currently in the group but absent from this list have their `group_id` set to `null`. The current group leader is always retained regardless of whether their UUID is included. Pass `[]` to unlink all non-leader members. Every provided UUID must reference an existing user.
           * @example [
           *       "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
           *       "b1ccde11-8d1c-5fa9-cc7e-7cc0ce491b22"
           *     ]
           */
          member_ids?: string[];
        };
      };
    };
    responses: {
      /** @description Group updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['GroupObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation (e.g. no fields provided or invalid values), or a domain rule is violated (e.g. the new leader does not have the `agent` role, the trainer does not have the `trainer` role, or one or more `member_ids` could not be found). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no group exists for the given `groupId`, or a referenced user (leader, trainer, or member) could not be found. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listGroupStats: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Group statistics retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['GroupStatsObject'][];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getGroupStats: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the group to retrieve statistics for. */
        groupId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Group detail statistics retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['GroupDetailStatsObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no group exists for the given `groupId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Group not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listProspects: {
    parameters: {
      query?: {
        /** @description Page size for admins and master trainers. */
        limit?: number;
        /** @description Return only prospects in this stage. */
        stage?: 'prospect' | 'appointment' | 'sales';
        /** @description The `nextToken` from the previous page, unchanged. */
        nextToken?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Prospects retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['ProspectObject'][];
            /**
             * @description Present only while more prospects remain (admins and master trainers). Absent on the last page.
             * @example eyJzYWxlcyI6eyJkb25lIjp0cnVlfX0
             */
            nextToken?: string;
          };
        };
      };
      /** @description Bad request. Returned when `limit` is outside 1 to 100, `stage` is not a known stage (both with `message: Validation failed` and the issues), or `nextToken` was not issued by this endpoint (`message: Invalid nextToken`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Invalid nextToken"
           *     }
           */
          'application/json': components['schemas']['QueryValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createProspect: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description Full name of the prospect.
           * @example Alice Johnson
           */
          fullName: string;
          /**
           * @description Phone number of the prospect.
           * @example +6591234567
           */
          phoneNum?: string;
          /**
           * Format: email
           * @description Email address of the prospect.
           * @example alice.johnson@example.com
           */
          email?: string;
        };
      };
    };
    responses: {
      /** @description Prospect created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['ProspectObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation (e.g. `fullName` is missing or empty, or `email` is not a valid email address). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "fullName": [
           *           "String must contain at least 1 character(s)"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user does not have the `agent` or `group_leader` role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getProspect: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the prospect to retrieve. */
        prospectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Prospect retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['ProspectObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no prospect exists for the given `prospectId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Prospect not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateProspect: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the prospect to update. */
        prospectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * @example appointment
           * @enum {string}
           */
          currentStage?: 'prospect' | 'appointment' | 'sales';
          /**
           * Format: date
           * @description Date of the appointment in YYYY-MM-DD format.
           * @example 2026-04-01
           */
          appointmentDate?: string;
          /**
           * @description Start time of the appointment (e.g. "14:00").
           * @example 14:00
           */
          appointmentStartTime?: string;
          /**
           * @description End time of the appointment (e.g. "15:00").
           * @example 15:00
           */
          appointmentEndTime?: string;
          /** @example Raffles Place Office */
          appointmentLocation?: string;
          /**
           * @example scheduled
           * @enum {string}
           */
          appointmentStatus?:
            | 'not_done'
            | 'scheduled'
            | 'rescheduled'
            | 'kiv'
            | 'done'
            | 'declined';
          /**
           * @description Array of sales meeting stages completed during the sales meeting.
           * @example [
           *       "social",
           *       "factFind"
           *     ]
           */
          salesMeetingStages?: ('social' | 'factFind' | 'presentation')[];
          /** @description Array of products sold to the prospect. */
          products?: {
            /** @example Term Life Insurance */
            productName: string;
            /** @example 50000 */
            amount: number;
          }[];
          /**
           * @example successful
           * @enum {string}
           */
          salesOutcome?: 'kiv' | 'successful' | 'unsuccessful';
          /**
           * @description Required when `salesOutcome` is `unsuccessful`. Describes why the sale was not completed.
           * @example Client budget constraints
           */
          unsuccessfulReason?: string;
          /**
           * @description Full name of the prospect. Maps to `prospect_name`.
           * @example Jane Doe
           */
          fullName?: string;
          /**
           * @description Phone number of the prospect. Maps to `prospect_phone`.
           * @example +6591234567
           */
          phoneNum?: string;
          /**
           * Format: email
           * @description Email address of the prospect. Maps to `prospect_email`.
           * @example jane.doe@example.com
           */
          email?: string;
        };
      };
    };
    responses: {
      /** @description Prospect updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['ProspectObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation (e.g. no fields provided, invalid enum value, or `unsuccessfulReason` is missing when `salesOutcome` is `unsuccessful`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user does not have the `agent` or `group_leader` role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no prospect exists for the given `prospectId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Prospect not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteProspect: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The UUID of the prospect to delete. */
        prospectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Prospect deleted successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user does not have the `agent` or `admin` role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no prospect exists for the given `prospectId`, or the caller may not see it. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Prospect not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listEvents: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Events retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['EventObject'][];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createEvent: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description Title of the event.
           * @example Q2 Training Kickoff
           */
          title: string;
          /**
           * Format: date-time
           * @description Start datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC. Cannot be in the past.
           * @example 2026-04-15T01:00:00.000Z
           */
          startDate: string;
          /**
           * Format: date-time
           * @description End datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC. Must be after startDate.
           * @example 2026-04-15T03:00:00.000Z
           */
          endDate: string;
          /**
           * @description Status of the event. Defaults to `upcoming` when not supplied.
           * @example upcoming
           * @enum {string}
           */
          status?: 'upcoming' | 'completed' | 'cancelled';
          /**
           * @description Delivery format of the event. Must be either `Face to Face` or `Online`.
           * @example Face to Face
           * @enum {string}
           */
          type: 'Face to Face' | 'Online';
          /**
           * @description Optional URL for an online meeting link. If no protocol is provided (`http://` or `https://`), the server will auto-prefix `https://`.
           * @example meet.example.com/q2-kickoff
           */
          link?: string;
          /**
           * @description Optional venue or location for the event.
           * @example Raffles Place Conference Room
           */
          venue?: string;
          /**
           * @description Description or agenda for the event.
           * @example Quarterly training kickoff covering Q2 targets and new product modules.
           */
          description: string;
          /**
           * @description Visibility of the event. Optional. Defaults to `public` for `agent` and `group_leader` roles, `private` for all other roles.
           * @example public
           * @enum {string}
           */
          visibility?: 'public' | 'private';
          /**
           * @description Array of group UUIDs the event is associated with. Must not contain duplicates. For trainers, all IDs must be groups they manage. At least one of `groupIds` or `agentIds` must be supplied (ignored for `agent` role — agents are always assigned to their own event automatically).
           * @example [
           *       "7c9e6679-7425-40de-944b-e07fc1f90ae7"
           *     ]
           */
          groupIds?: string[];
          /**
           * @description Array of agent user UUIDs to assign individually to the event via the `event_agents` junction table. Must not contain duplicates. At least one of `groupIds` or `agentIds` must be supplied (ignored for `agent` role — agents are always assigned to their own event automatically).
           * @example [
           *       "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
           *     ]
           */
          agentIds?: string[];
        };
      };
    };
    responses: {
      /** @description Event created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['EventObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation (e.g. `title` is missing, `date` is in the past, neither `groupIds` nor `agentIds` is provided, a supplied group UUID does not exist, or a trainer supplies a group they do not manage). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden — non-admin attempting to modify another user's event. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the event to retrieve. */
        eventId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Event retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['EventObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no event exists for the given `eventId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Event not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the event to update. */
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description Updated title of the event.
           * @example Q2 Training Kickoff (Revised)
           */
          title?: string;
          /**
           * Format: date-time
           * @description Start datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC.
           * @example 2026-04-20T02:00:00.000Z
           */
          startDate?: string;
          /**
           * Format: date-time
           * @description End datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC. Must be after startDate.
           * @example 2026-04-20T04:00:00.000Z
           */
          endDate?: string;
          /**
           * @description Updated status of the event.
           * @example completed
           * @enum {string}
           */
          status?: 'upcoming' | 'completed' | 'cancelled';
          /**
           * @description Updated delivery format of the event.
           * @example Online
           * @enum {string}
           */
          type?: 'Face to Face' | 'Online';
          /**
           * @description Optional URL for an online meeting link. If no protocol is provided (`http://` or `https://`), the server will auto-prefix `https://`.
           * @example meet.example.com/q2-kickoff-revised
           */
          link?: string;
          /**
           * @description Updated venue or location for the event.
           * @example Marina Bay Conference Centre
           */
          venue?: string;
          /**
           * @description Updated description or agenda for the event.
           * @example Updated agenda covering revised Q2 targets.
           */
          description?: string;
          /**
           * @description Updated visibility of the event. Optional. Defaults to `public` for `agent` and `group_leader` roles, `private` for all other roles when not supplied on creation.
           * @example public
           * @enum {string}
           */
          visibility?: 'public' | 'private';
          /**
           * @description Replacement set of group UUIDs for the event. Existing `event_groups` entries are deleted and replaced with these values. Must not contain duplicates. For trainers, all IDs must be groups they manage. Ignored for `agent` role.
           * @example [
           *       "7c9e6679-7425-40de-944b-e07fc1f90ae7"
           *     ]
           */
          groupIds?: string[];
          /**
           * @description Replacement set of agent user UUIDs for the event. Existing `event_agents` entries are deleted and replaced with these values. Must not contain duplicates. Ignored for `agent` role.
           * @example [
           *       "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
           *     ]
           */
          agentIds?: string[];
        };
      };
    };
    responses: {
      /** @description Event updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['EventObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails validation (e.g. no fields provided, `startDate` is in the past, `endDate` is not after `startDate`, a supplied group UUID does not exist, or a trainer supplies a group they do not manage). Also returned if `groupIds` or `agentIds` is provided as an empty array (non-agent callers only). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden — non-admin attempting to modify another user's event. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no event exists for the given `eventId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Event not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the event to delete. */
        eventId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Event deleted successfully. No response body is returned. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden — caller does not have an allowed role (`admin`, `master_trainer`, `trainer`, `group_leader`, `agent`), or a non-admin caller is attempting to delete another user's event. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no event exists for the given `eventId`. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Event not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getPublicEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the event to retrieve. */
        eventId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Public event details retrieved successfully. */
      200: {
        headers: {
          /** @description Instructs clients and proxies to cache the response for 60 seconds. */
          'Cache-Control'?: string;
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": {
           *         "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
           *         "event_title": "Q2 Agent Networking Night",
           *         "description": "A networking event open to all agents in the region.",
           *         "start_date": "2026-06-01T18:00:00.000Z",
           *         "end_date": "2026-06-01T21:00:00.000Z",
           *         "type": "Face to Face",
           *         "venue": "Marina Bay Sands Convention Centre",
           *         "meeting_link": null,
           *         "created_by_name": "Jane Doe",
           *         "status": "upcoming"
           *       }
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['PublicEventObject'];
          };
        };
      };
      /** @description Not found. Returned when no event exists for the given `eventId`, the event has been cancelled, or the event is not public. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Event not found"
           *     }
           */
          'application/json': {
            /** @example Event not found */
            message: string;
          };
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getDashboardStats: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Dashboard statistics retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['DashboardStatsObject'];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listPointActivityTypes: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Point activity types retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['PointActivityTypeObject'][];
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listPointConfigs: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Point configs retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['PointConfigObject'][];
          };
        };
      };
      /** @description Forbidden. The authenticated user does not have the `admin` role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createPointConfig: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description The activity type to configure points for. Must match a value returned by `GET /point-activity-types`.
           * @example coaching_session_attended
           */
          activity: string;
          /**
           * @description Points awarded for the activity. Must be a positive integer.
           * @example 10
           */
          points: number;
        };
      };
    };
    responses: {
      /** @description Point config created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['PointConfigObject'];
          };
        };
      };
      /** @description Bad request. Returned when request body fails validation or a config already exists for the given activity. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ErrorResponse']
            | components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Forbidden. The authenticated user does not have the `admin` role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updatePointConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The activity type whose point config should be updated. Must match an existing point config's activity. */
        activity: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description New points value for the activity. Must be a positive integer.
           * @example 20
           */
          points: number;
        };
      };
    };
    responses: {
      /** @description Point config updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['PointConfigObject'];
          };
        };
      };
      /** @description Bad request. Returned when request body fails validation. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "points": [
           *           "Points must be greater than 0"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Forbidden. The authenticated user does not have the `admin` role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. No point configuration exists for the given activity. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Point config not found."
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getLeaderboard: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Leaderboard retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['LeaderboardEntryObject'][];
          };
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getLeaderboardStats: {
    parameters: {
      query: {
        /** @description The time period to aggregate stats over. `mtd` covers the current calendar month to date; `ytd` covers the current year to date. */
        period: 'mtd' | 'ytd';
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Leaderboard stats retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: {
              /**
               * @example mtd
               * @enum {string}
               */
              period: 'mtd' | 'ytd';
              /**
               * Format: date-time
               * @example 2026-03-30T08:00:00Z
               */
              generated_at: string;
              individual: components['schemas']['LeaderboardStatsIndividualObject'][];
              groups: components['schemas']['LeaderboardStatsGroupObject'][];
            };
          };
        };
      };
      /** @description Validation failed. The `period` query parameter is missing or invalid. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "period": [
           *           "Invalid enum value. Expected 'mtd' | 'ytd'"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getAgentPoints: {
    parameters: {
      query?: {
        /** @description Target user ID (UUID). Defaults to the authenticated user's own ID. Manager roles only; agents may not pass a different user's ID. */
        userId?: string;
        /** @description Page number for breakdown pagination. Defaults to 1. */
        page?: number;
        /** @description Number of breakdown items per page. Defaults to 20. */
        limit?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Agent points retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['AgentPointsObject'];
          };
        };
      };
      /** @description Validation failed. One or more query parameters are invalid. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "page": [
           *           "Expected number, received string"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. An agent supplied a `userId` belonging to a different user. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listAgentCodes: {
    parameters: {
      query?: {
        /** @description When provided, filters to only used (`true`) or unused (`false`) codes. Omit to return all codes. Any value that is not a valid boolean returns 400. */
        isUsed?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Agent codes retrieved successfully. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": [
           *         {
           *           "agentCode": "T66701C",
           *           "isUsed": false,
           *           "userId": null,
           *           "createdAt": "2025-01-01T00:00:00.000Z",
           *           "updatedAt": "2025-01-01T00:00:00.000Z"
           *         },
           *         {
           *           "agentCode": "T66702C",
           *           "isUsed": true,
           *           "userId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
           *           "createdAt": "2025-01-01T00:00:00.000Z",
           *           "updatedAt": "2025-02-15T08:30:00.000Z"
           *         }
           *       ]
           *     }
           */
          'application/json': {
            /** @example true */
            success?: boolean;
            data?: components['schemas']['AgentCodeListItem'][];
          };
        };
      };
      /** @description Bad request. Returned when the `isUsed` query parameter is present but is not a valid boolean value. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "errors": [
           *         {
           *           "code": "invalid_type",
           *           "expected": "boolean",
           *           "received": "string",
           *           "path": [
           *             "isUsed"
           *           ],
           *           "message": "Expected boolean, received string"
           *         }
           *       ]
           *     }
           */
          'application/json': components['schemas']['QueryValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createAgentCodes: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "agentCodes": [
         *         "T66701C",
         *         "T66702C",
         *         "T66703C"
         *       ]
         *     }
         */
        'application/json': {
          /**
           * @description Array of agent code strings to upsert. Must contain between 1 and 500 entries (inclusive); each entry must be a non-empty string. Codes are stored case-sensitively and verbatim — no trimming or case-folding is performed server-side.
           * @example [
           *       "T66701C",
           *       "T66702C",
           *       "T66703C"
           *     ]
           */
          agentCodes: string[];
        };
      };
    };
    responses: {
      /** @description Agent codes upserted successfully. The `data` array contains one entry per distinct submitted code. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": [
           *         {
           *           "agentCode": "T66701C",
           *           "isUsed": false,
           *           "createdAt": "2026-05-04T09:41:35.000Z",
           *           "updatedAt": "2026-05-04T09:41:35.000Z"
           *         },
           *         {
           *           "agentCode": "T66702C",
           *           "isUsed": false,
           *           "createdAt": "2026-05-04T09:41:35.000Z",
           *           "updatedAt": "2026-05-04T09:41:35.000Z"
           *         },
           *         {
           *           "agentCode": "T66703C",
           *           "isUsed": false,
           *           "createdAt": "2026-05-04T09:41:35.000Z",
           *           "updatedAt": "2026-05-04T09:41:35.000Z"
           *         }
           *       ]
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['AgentCodeObject'][];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails Zod validation — e.g. `agentCodes` missing, not an array, empty, exceeds 500 entries, contains a non-string or empty-string entry, or includes an unknown top-level field. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "agentCodes": [
           *           "Too small: expected array to have >=1 items"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteAgentCode: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The agent code to delete (case-sensitive, URL-encoded if necessary). */
        agentCode: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Agent code deleted successfully. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no agent code matching the path parameter exists. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Agent code not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Conflict. Returned when the agent code is currently in use (`isUsed: true`) and cannot be deleted. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Agent code is in use"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateAgentCode: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The current agent code to rename (case-sensitive, URL-encoded if necessary). */
        agentCode: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "agentCode": "T77811M"
         *     }
         */
        'application/json': {
          /**
           * @description The new agent code value. Must be a non-empty string. Must not already exist — a duplicate value returns 409.
           * @example T77811M
           */
          agentCode: string;
        };
      };
    };
    responses: {
      /** @description Agent code renamed successfully. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": {
           *         "agentCode": "T77811M",
           *         "isUsed": false,
           *         "userId": null,
           *         "createdAt": "2025-01-01T00:00:00.000Z",
           *         "updatedAt": "2026-05-12T10:00:00.000Z"
           *       }
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['AgentCodeListItem'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails Zod validation — e.g. `agentCode` missing, empty string, or an unknown top-level field is present. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "agentCode": [
           *           "Too small: expected string to have >=1 characters"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no agent code matching the path parameter exists. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Agent code not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Conflict. Returned when the requested new `agentCode` value already exists. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Agent code already exists"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listTaxonomies: {
    parameters: {
      query?: {
        /** @description When provided, filters taxonomy values to the given category. Must be a non-empty string; an empty value returns 400. */
        type?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Taxonomy values retrieved successfully. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": [
           *         {
           *           "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
           *           "type": "lead_source",
           *           "value": "Referral",
           *           "sort_order": 0,
           *           "created_at": "2026-06-01T08:00:00.000Z",
           *           "updated_at": "2026-06-01T08:00:00.000Z"
           *         },
           *         {
           *           "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
           *           "type": "lead_source",
           *           "value": "Walk-in",
           *           "sort_order": 1,
           *           "created_at": "2026-06-01T08:00:00.000Z",
           *           "updated_at": "2026-06-01T08:00:00.000Z"
           *         }
           *       ]
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['TaxonomyObject'][];
          };
        };
      };
      /** @description Bad request. Returned when the `type` query parameter is present but is an empty string. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "errors": [
           *         {
           *           "code": "too_small",
           *           "minimum": 1,
           *           "type": "string",
           *           "inclusive": true,
           *           "exact": false,
           *           "message": "String must contain at least 1 character(s)",
           *           "path": [
           *             "type"
           *           ]
           *         }
           *       ]
           *     }
           */
          'application/json': components['schemas']['QueryValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createTaxonomy: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "type": "lead_source",
         *       "value": "Referral",
         *       "sort_order": 0
         *     }
         */
        'application/json': {
          /**
           * @description The taxonomy category this value belongs to (e.g. `lead_source`). Required; must be a non-empty string.
           * @example lead_source
           */
          type: string;
          /**
           * @description The dropdown value to store. Required; must be a non-empty string.
           * @example Referral
           */
          value: string;
          /**
           * @description Sort position used when ordering values within a category. Optional; defaults to 0 when omitted.
           * @default 0
           * @example 0
           */
          sort_order?: number;
        };
      };
    };
    responses: {
      /** @description Taxonomy value created successfully. */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": {
           *         "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
           *         "type": "lead_source",
           *         "value": "Referral",
           *         "sort_order": 0,
           *         "created_at": "2026-06-01T08:00:00.000Z",
           *         "updated_at": "2026-06-01T08:00:00.000Z"
           *       }
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['TaxonomyObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails Zod validation — e.g. `type` or `value` missing or empty, `sort_order` not an integer, or an unknown top-level field is present. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "value": [
           *           "Too small: expected string to have >=1 characters"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Conflict. Returned when a taxonomy value with the same `(type, value)` already exists. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "A taxonomy value with this type already exists"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateTaxonomy: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the taxonomy value to update. */
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "value": "Referral (updated)",
         *       "sort_order": 5
         *     }
         */
        'application/json': {
          /**
           * @description New dropdown value. Must be a non-empty string when provided.
           * @example Referral (updated)
           */
          value?: string;
          /**
           * @description New sort position within the category.
           * @example 5
           */
          sort_order?: number;
        };
      };
    };
    responses: {
      /** @description Taxonomy value updated successfully. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": {
           *         "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
           *         "type": "lead_source",
           *         "value": "Referral (updated)",
           *         "sort_order": 5,
           *         "created_at": "2026-06-01T08:00:00.000Z",
           *         "updated_at": "2026-06-02T09:30:00.000Z"
           *       }
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['TaxonomyObject'];
          };
        };
      };
      /** @description Bad request. Returned when the request body fails Zod validation — e.g. an empty body, neither `value` nor `sort_order` provided, an empty `value`, `sort_order` not an integer, or an unknown top-level field is present. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [
           *         "At least one of value or sort_order must be provided"
           *       ],
           *       "fieldErrors": {}
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no taxonomy value matching the `id` path parameter exists. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Taxonomy not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Conflict. Returned when the new `value` collides with an existing `(type, value)` pair. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "A taxonomy value with this type already exists"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteTaxonomy: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the taxonomy value to delete. */
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Taxonomy value deleted successfully. No response body. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. Returned when the authenticated user is not an admin. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Not found. Returned when no taxonomy value matching the `id` path parameter exists. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Taxonomy not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getLabels: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Labels retrieved successfully. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "success": true,
           *       "data": {
           *         "metric.ace": "ACE",
           *         "metric.fyc": "FYC",
           *         "metric.fyct": "FYCt",
           *         "metric.acs": "ACS (ACE/NOC)",
           *         "action.create_coaching": "Create Peer Circle Meeting"
           *       }
           *     }
           */
          'application/json': {
            /** @example true */
            success: boolean;
            /** @description Map of stable internal label keys to their resolved display strings. */
            data: {
              [key: string]: string;
            };
          };
        };
      };
      /** @description Unauthorized. Returned when the `Authorization` header is absent, malformed, or contains an invalid token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listCoachingSessions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Coaching sessions retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['CoachingSessionObject'][];
          };
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createCoachingSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          coachingType: components['schemas']['CoachingTypeEnum'];
          /** @example Weekly Group Coaching */
          title: string;
          /** @example Focus on objection handling techniques */
          description?: string;
          /**
           * Format: date-time
           * @description Start datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC. Cannot be in the past.
           * @example 2026-04-15T02:00:00.000Z
           */
          startDate: string;
          /**
           * Format: date-time
           * @description End datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC. Must be after startDate.
           * @example 2026-04-15T04:00:00.000Z
           */
          endDate: string;
          trainingMode: components['schemas']['TrainingModeEnum'];
          /**
           * @description Meeting link (e.g. Zoom, Google Meet).
           * @example https://zoom.us/j/123456789
           */
          link?: string;
          status?: components['schemas']['SessionStatusEnum'];
          /**
           * @description Target group UUIDs. Must not contain duplicates.
           * @example [
           *       "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
           *     ]
           */
          groupIds?: string[];
          /**
           * @description Target agent UUIDs. Must not contain duplicates.
           * @example [
           *       "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
           *     ]
           */
          agentIds?: string[];
        };
      };
    };
    responses: {
      /** @description Coaching session created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['CoachingSessionObject'];
          };
        };
      };
      /** @description Validation failed, invalid group IDs, invalid agent IDs, or unauthorized group access. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Validation failed",
           *       "formErrors": [],
           *       "fieldErrors": {
           *         "title": [
           *           "Required"
           *         ]
           *       }
           *     }
           */
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. The user's role does not permit this action. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getCoachingSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the coaching session. */
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Coaching session retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['CoachingSessionDetailObject'];
          };
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Coaching session not found. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Coaching session not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  updateCoachingSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the coaching session. */
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          coachingType?: components['schemas']['CoachingTypeEnum'];
          /** @example Updated Session Title */
          title?: string;
          /** @example Updated description */
          description?: string;
          /**
           * Format: date-time
           * @description Start datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC.
           * @example 2026-04-20T06:00:00.000Z
           */
          startDate?: string;
          /**
           * Format: date-time
           * @description End datetime as an ISO 8601 timestamp with a timezone offset or Z, stored and returned in UTC. Must be after startDate.
           * @example 2026-04-20T08:00:00.000Z
           */
          endDate?: string;
          trainingMode?: components['schemas']['TrainingModeEnum'];
          /** @example https://zoom.us/j/987654321 */
          link?: string;
          status?: components['schemas']['SessionStatusEnum'];
          /** @description Updated target group UUIDs. */
          groupIds?: string[];
          /** @description Updated target agent UUIDs. */
          agentIds?: string[];
        };
      };
    };
    responses: {
      /** @description Coaching session updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['CoachingSessionObject'];
          };
        };
      };
      /** @description Validation failed, invalid group IDs, invalid agent IDs, unauthorized group access, or `endDate` is not after `startDate`. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['ValidationErrorResponse']
            | components['schemas']['ErrorResponse'];
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. The user's role does not permit this action or the user is not the session creator. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Coaching session not found. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Coaching session not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteCoachingSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the coaching session. */
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Coaching session deleted successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
          };
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. The user's role does not permit this action or the user is not the session creator. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Coaching session not found. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Coaching session not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  joinCoachingSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the coaching session to join. */
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successfully joined (or already joined) the session */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: components['schemas']['AttendanceRecordObject'];
          };
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Coaching session not found. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Coaching session not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  markCoachingSessionNonAttendees: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description UUID of the coaching session. */
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Non-attendees marked successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
          };
        };
      };
      /** @description Unauthorized. No token or invalid token supplied. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Unauthorized"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Forbidden. The user is not the session creator and does not have an admin or master_trainer role. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Forbidden"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Coaching session not found. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "Coaching session not found"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listPublicGroups: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Groups retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @example true */
            success: boolean;
            data: {
              /**
               * Format: uuid
               * @example 3fa85f64-5717-4562-b3fc-2c963f66afa6
               */
              id: string;
              /** @example MDRT Stars */
              name: string;
            }[];
          };
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  uploadSalesReport: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UploadReportRequest'];
      };
    };
    responses: {
      /** @description Upload completed. Partial success is allowed: rows that failed validation or whose `agentCode` did not resolve to a user are reported in the `errors` array, while the rest are persisted. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UploadReportResponse'];
        };
      };
      /** @description Validation failed (Zod schema mismatch or invalid ETL data). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Missing or invalid bearer token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Caller is not a manager. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Non-consecutive month upload (e.g. month 4 when latest is month 2). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  ingestSalesReport: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IngestReportRequest'];
      };
    };
    responses: {
      /** @description Upload completed. Partial success is allowed: rows whose `agentCode` did not resolve to a user are reported in `errors`. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UploadReportResponse'];
        };
      };
      /** @description Validation failed (Zod schema mismatch or invalid ETL data). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Missing or wrong internal key. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Non-consecutive month upload (e.g. month 4 when latest is month 2). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listSalesReports: {
    parameters: {
      query: {
        year: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Array of per-agent year rollups. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SalesReportListResponse'];
        };
      };
      /** @description Invalid query parameter. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Missing or invalid bearer token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Caller's role is not entitled to this endpoint (e.g. agent). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getMySalesReport: {
    parameters: {
      query: {
        year: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The caller's per-agent year rollup. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SalesReportSingleResponse'];
        };
      };
      /** @description Invalid query parameter. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Missing or invalid bearer token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description No sales report exists for the calling user in that year. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "message": "No sales report for this year"
           *     }
           */
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listSalesReportUploads: {
    parameters: {
      query: {
        year: number;
        page?: number;
        pageSize?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Paginated audit entries with `meta` for pagination state. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UploadAuditListResponse'];
        };
      };
      /** @description Invalid query parameter. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValidationErrorResponse'];
        };
      };
      /** @description Missing or invalid bearer token. */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Caller is not a manager. */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      /** @description Internal server error. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createReportJob: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          /**
           * Format: binary
           * @description The raw .xlsx file
           */
          file: string;
          reportYear: number;
          reportMonth: number;
        };
      };
    };
    responses: {
      /** @description Job accepted; processing asynchronously */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            success?: boolean;
            data?: {
              /** @example SALES-REPORT-20260502143022873 */
              reference?: string;
            };
          };
        };
      };
      /** @description Missing file, invalid year/month, or file too large */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing or invalid bearer token */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Caller is not a manager */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Non-consecutive month upload (e.g. month 4 when latest is month 2). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getReportJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @example SALES-REPORT-20260502143022873 */
        reference: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Job state */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReportJobResponse'];
        };
      };
      /** @description Missing or invalid bearer token */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Caller is not a manager */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  completeReportJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @example SALES-REPORT-20260502143022873 */
        reference: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EtlCallbackBody'];
      };
    };
    responses: {
      /** @description Callback accepted */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing or wrong internal key */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  retryReportJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @example SALES-REPORT-20260502143022873 */
        reference: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Retry kicked off */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            success?: boolean;
            data?: {
              reference?: string;
            };
          };
        };
      };
      /** @description Missing or invalid bearer token */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Caller is not a manager */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Job is not in failed status */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  cleanupOldReportFiles: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Cleanup completed (possibly with per-chunk failures, see response). */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            success?: boolean;
            data?: {
              /** @description Number of report-job files successfully removed from Storage. */
              deletedCount?: number;
              /** @description Number of report-job files that failed to remove and remain queued for the next run. */
              failedCount?: number;
            };
          };
        };
      };
      /** @description Missing or wrong internal key */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Internal server error (unexpected — per-chunk failures are reported in the 200 body, not surfaced as 500). */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
}
