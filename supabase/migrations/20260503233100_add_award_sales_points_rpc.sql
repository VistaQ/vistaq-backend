-- Atomic awarding RPC for sales-completion points.
--
-- Serializes concurrent re-uploads of the same (tenant, year, month) by
-- acquiring a transaction-scoped advisory lock keyed on the period. The lock
-- auto-releases when the function returns. While the lock is held the
-- function:
--   1. finds prior batch_ids for the (tenant, year, month) excluding the
--      current batch
--   2. selects every existing point_transactions row whose subject_id is one
--      of those prior batches AND whose activity is in the supplied activity
--      filter
--   3. inserts negative offset entries (subject_id stays linked to the
--      ORIGINAL batch — preserves audit chain)
--   4. inserts the new award rows supplied by the caller
--
-- All four steps run inside the function's implicit transaction, so a second
-- caller blocked on the advisory lock observes the post-state of the first
-- caller's writes when it acquires the lock.

CREATE OR REPLACE FUNCTION award_sales_points_for_batch(
  p_tenant_id  UUID,
  p_year       INT,
  p_month      INT,
  p_batch_id   UUID,
  p_activities TEXT[],
  p_awards     JSONB
) RETURNS VOID AS $$
DECLARE
  lock_key TEXT;
BEGIN
  -- Period-scoped advisory lock. Two awarders for different periods don't
  -- contend; two awarders for the same period serialise.
  lock_key := 'sales_points:' || p_tenant_id::TEXT || ':' || p_year || ':' || p_month;
  PERFORM pg_advisory_xact_lock(hashtext(lock_key));

  -- Step 1+2+3: insert reversal entries for prior point_transactions tied to
  -- earlier batches for this period.
  INSERT INTO point_transactions (tenant_id, user_id, activity, points, subject_id, subject_type)
  SELECT
    pt.tenant_id,
    pt.user_id,
    pt.activity,
    -pt.points,
    pt.subject_id,    -- link reversal back to the ORIGINAL batch
    pt.subject_type
  FROM point_transactions pt
  INNER JOIN upload_batches ub
    ON ub.id = pt.subject_id::UUID
  WHERE pt.tenant_id   = p_tenant_id
    AND pt.subject_type = 'upload_batch'
    AND pt.activity      = ANY(p_activities)
    AND ub.tenant_id     = p_tenant_id
    AND ub.year          = p_year
    AND ub.month         = p_month
    AND ub.id           <> p_batch_id;

  -- Step 4: insert fresh award rows.
  INSERT INTO point_transactions (tenant_id, user_id, activity, points, subject_id, subject_type)
  SELECT
    p_tenant_id,
    (a->>'user_id')::UUID,
    a->>'activity',
    (a->>'points')::INT,
    (a->>'subject_id')::UUID,
    'upload_batch'
  FROM jsonb_array_elements(p_awards) AS a;
END;
$$ LANGUAGE plpgsql;

-- Service role only: this function bypasses RLS by design (the awarding flow
-- is a system-internal operation invoked from the backend service layer).
REVOKE ALL ON FUNCTION award_sales_points_for_batch(UUID, INT, INT, UUID, TEXT[], JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_sales_points_for_batch(UUID, INT, INT, UUID, TEXT[], JSONB) TO service_role;
