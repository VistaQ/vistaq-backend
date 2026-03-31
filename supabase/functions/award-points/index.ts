/**
 * award-points Edge Function
 *
 * Triggered by a Supabase Database Webhook on the `prospects` table (INSERT + UPDATE events).
 *
 * Webhook setup (Supabase Dashboard → Database → Webhooks):
 *   - Table:  prospects
 *   - Events: INSERT, UPDATE
 *   - Target: Edge Function → award-points
 *
 * Always returns HTTP 200 so the webhook does not retry on failure.
 */

import { createClient } from "@supabase/supabase-js";

// ---------- Types ----------

interface WebhookPayload {
  type: "INSERT" | "UPDATE";
  table: string;
  schema: string;
  record: ProspectRecord;
  old_record: ProspectRecord | null;
}

interface ProspectRecord {
  id: string;
  tenant_id: string;
  agent_id: string;
  appointment_date: string | null;
  appointment_status: string | null;
  sales_completed_at: string | null;
  [key: string]: unknown;
}

type Activity =
  | "prospect_created"
  | "appointment_set"
  | "sales_meeting"
  | "sale_closed";

// ---------- Subject mapping ----------

const ACTIVITY_SUBJECT_MAP: Record<string, string> = {
  prospect_created: "prospect",
  appointment_set: "prospect",
  sales_meeting: "prospect",
  sale_closed: "prospect",
  coaching_session_attended: "event",
};

// ---------- Activity detection ----------

function detectActivity(payload: WebhookPayload): Activity | null {
  if (payload.type === "INSERT") {
    return "prospect_created";
  }

  if (payload.type === "UPDATE" && payload.old_record) {
    const { record, old_record } = payload;

    if (
      old_record.appointment_status !== "scheduled" &&
      record.appointment_status === "scheduled"
    ) {
      return "appointment_set";
    }

    if (
      old_record.appointment_status !== "done" &&
      record.appointment_status === "done"
    ) {
      return "sales_meeting";
    }

    if (!old_record.sales_completed_at && record.sales_completed_at) {
      return "sale_closed";
    }
  }

  return null;
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  const ok = new Response(JSON.stringify({ message: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const payload: WebhookPayload = await req.json();

    // Step 1: Determine activity from transition
    const activity = detectActivity(payload);
    if (!activity) {
      return ok;
    }

    // Step 2: Extract tenant + user from the record
    const tenantId = payload.record.tenant_id;
    const userId = payload.record.agent_id;

    // Step 3: Look up point config (service-role client bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    if (!config) {
      // No config for this activity — skip silently
      return ok;
    }

    // Step 4: Resolve subject
    const subjectType = ACTIVITY_SUBJECT_MAP[activity];
    if (!subjectType) {
      console.warn(`[award-points] Unrecognised activity "${activity}" — skipping insert`);
      return ok;
    }
    const subjectId = payload.record.id;

    // Step 5: Idempotency — skip if points already awarded for this subject + activity
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

    if (existing) {
      return ok;
    }

    // Step 6: Insert point transaction
    const { error: insertError } = await supabase
      .from("point_transactions")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        activity,
        points: config.points,
        subject_id: subjectId,
        subject_type: subjectType,
      });

    if (insertError) {
      console.error(
        "[award-points] Error inserting point transaction:",
        insertError,
      );
    }

    return ok;
  } catch (err) {
    console.error("[award-points] Unexpected error:", err);
    return ok;
  }
});
