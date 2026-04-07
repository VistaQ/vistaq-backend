/**
 * award-points Edge Function
 *
 * Triggered by Supabase Database Webhooks on:
 *   - prospects table (INSERT + UPDATE)
 *   - coaching_session_attendance table (INSERT + UPDATE)
 *
 * Webhook setup (Supabase Dashboard → Database → Webhooks):
 *   prospects:
 *     - Table: prospects, Events: INSERT, UPDATE, Target: award-points
 *   coaching_session_attendance:
 *     - Table: coaching_session_attendance, Events: INSERT, UPDATE, Target: award-points
 *
 * Always returns HTTP 200 so the webhook does not retry on failure.
 */

import { createClient } from "@supabase/supabase-js";

// ---------- Types ----------

interface WebhookPayload {
  type: "INSERT" | "UPDATE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

// ---------- Activity detection ----------

function detectProspectActivity(payload: WebhookPayload): string | null {
  const { record, old_record, type } = payload;

  if (type === "INSERT") return "prospect_created";

  if (type === "UPDATE" && old_record) {
    if (
      old_record.appointment_status !== "scheduled" &&
      record.appointment_status === "scheduled"
    ) return "appointment_set";

    if (
      old_record.appointment_status !== "done" &&
      record.appointment_status === "done"
    ) return "sales_meeting";

    if (!old_record.sales_completed_at && record.sales_completed_at) {
      return "sale_closed";
    }
  }

  return null;
}

function detectAttendanceActivity(payload: WebhookPayload): string | null {
  const { record, old_record, type } = payload;

  if (type === "INSERT" && record.status === "joined") {
    return "coaching_session_attended";
  }

  if (
    type === "UPDATE" &&
    old_record &&
    old_record.status !== "joined" &&
    record.status === "joined"
  ) {
    return "coaching_session_attended";
  }

  return null;
}

// ---------- Coaching type → activity mapping ----------

const COACHING_TYPE_ACTIVITY_MAP: Record<string, string> = {
  individual_coaching: "coaching_individual_attended",
  group_coaching: "coaching_group_attended",
  peer_circles: "coaching_peer_circles_attended",
  "2_full_days_seminar": "coaching_2_full_days_attended",
  "2_hours_online_seminar": "coaching_2_hours_online_attended",
};

// ---------- Dispatcher ----------

const detectors: Record<string, (p: WebhookPayload) => string | null> = {
  prospects: detectProspectActivity,
  coaching_session_attendance: detectAttendanceActivity,
};

// ---------- Handler ----------

Deno.serve(async (req) => {
  const ok = new Response(JSON.stringify({ message: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const payload: WebhookPayload = await req.json();

    // Step 1: Route to appropriate detector
    const detect = detectors[payload.table];
    if (!detect) return ok;

    let activity = detect(payload);
    if (!activity) return ok;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Step 2: Resolve tenantId, userId, subjectId per source table
    // (coaching_session_attendance also remaps the sentinel activity here)
    let tenantId: string;
    let userId: string;
    let subjectId: string;
    let sessionDurationHours: number | null = null;

    if (payload.table === "prospects") {
      if (!payload.record.agent_id) {
        return ok; // Cannot award points without a user
      }
      tenantId = payload.record.tenant_id as string;
      userId = payload.record.agent_id as string;
      subjectId = payload.record.id as string;
    } else if (payload.table === "coaching_session_attendance") {
      if (!payload.record.agent_id) {
        return ok; // Cannot award points without a user
      }
      userId = payload.record.agent_id as string;
      // Use the attendance row ID (not session_id) as subjectId so that each
      // agent's attendance record is a distinct idempotency key. Using session_id
      // would block all subsequent agents after the first is awarded points,
      // since the idempotency check is (tenant_id, subject_id, activity) with no user_id.
      subjectId = payload.record.id as string;

      // Resolve tenant_id, coaching_type, and duration from coaching_sessions
      const { data: session, error: sessionError } = await supabase
        .from("coaching_sessions")
        .select("tenant_id, coaching_type, start_date, end_date")
        .eq("id", payload.record.session_id as string)
        .single();

      if (sessionError || !session) {
        console.error("[award-points] Error resolving tenant from session:", sessionError);
        return ok;
      }
      tenantId = session.tenant_id as string;

      // Remap generic sentinel to the per-coaching-type activity
      const mappedActivity = COACHING_TYPE_ACTIVITY_MAP[session.coaching_type as string];
      if (!mappedActivity) {
        console.warn(`[award-points] Unknown coaching_type "${session.coaching_type}" — skipping`);
        return ok;
      }
      activity = mappedActivity;

      // Compute session duration in hours (ceiling)
      const startMs = new Date(session.start_date as string).getTime();
      const endMs = new Date(session.end_date as string).getTime();

      if (isNaN(startMs) || isNaN(endMs)) {
        console.warn(`[award-points] Unparseable date on session ${payload.record.session_id} — skipping`);
        return ok;
      }

      const durationMs = endMs - startMs;

      if (durationMs <= 0) {
        console.warn(`[award-points] Invalid session duration for session ${payload.record.session_id} — skipping`);
        return ok;
      }

      sessionDurationHours = Math.ceil(durationMs / (1000 * 60 * 60));
    } else {
      return ok;
    }

    // Step 3: Look up activity type for subject_type (after remap so final activity name is used)
    const { data: activityType, error: activityTypeError } = await supabase
      .from("point_activity_types")
      .select("subject_type")
      .eq("name", activity)
      .maybeSingle();

    if (activityTypeError) {
      console.error("[award-points] Error fetching activity type:", activityTypeError);
      return ok;
    }

    if (!activityType) {
      console.warn(`[award-points] No activity type found for "${activity}" — skipping`);
      return ok;
    }

    // Step 4: Look up point config
    const { data: config, error: configError } = await supabase
      .from("point_configs")
      .select("points")
      .eq("tenant_id", tenantId)
      .eq("activity", activity)
      .maybeSingle();

    if (configError) {
      console.error("[award-points] Error fetching point config:", configError);
      return ok;
    }

    if (!config) return ok; // No config for this activity — skip silently

    // Step 5: Idempotency check
    const { data: existing, error: existingError } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("subject_id", subjectId)
      .eq("activity", activity)
      .maybeSingle();

    if (existingError) {
      console.error("[award-points] Error checking existing transaction:", existingError);
      return ok;
    }

    if (existing) return ok;

    // Step 6: Insert point transaction
    const computedPoints = sessionDurationHours !== null
      ? config.points * sessionDurationHours
      : config.points;

    const { error: insertError } = await supabase
      .from("point_transactions")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        activity,
        points: computedPoints,
        subject_id: subjectId,
        subject_type: activityType.subject_type,
      });

    if (insertError) {
      console.error("[award-points] Error inserting point transaction:", insertError);
    }

    return ok;
  } catch (err) {
    console.error("[award-points] Unexpected error:", err);
    return ok;
  }
});
