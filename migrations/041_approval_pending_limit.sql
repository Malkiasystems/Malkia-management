-- ════════════════════════════════════════════════════════════════════════════
-- 041_approval_pending_limit.sql
-- Requester discipline for approval workflows.         [APPLIED LIVE VIA MCP]
--
-- Problem: a requester (e.g. the cashier) can keep submitting internal use
-- vouchers while earlier ones sit pending — products physically leave the
-- shelf with no approval ever issued, and nothing pushes her to follow up.
--
-- Fix: approval_settings.max_pending_per_requester (NULL = no limit).
-- A BEFORE INSERT trigger on approval_requests refuses a new 'pending'
-- request of the same type by the same requester once the limit is reached,
-- naming the stuck refs and the approver to chase. Seeded at 1 for the
-- internal use family. All other types stay NULL (unchanged behaviour).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE approval_settings
  ADD COLUMN IF NOT EXISTS max_pending_per_requester INTEGER NULL
  CHECK (max_pending_per_requester IS NULL OR max_pending_per_requester >= 1);

-- Seed: internal use family limited to 1 outstanding request per requester.
-- Only fills NULLs so a re-run never overwrites a value Joe tuned later.
UPDATE approval_settings s
SET max_pending_per_requester = 1
FROM approval_types t
WHERE t.id = s.approval_type_id
  AND t.code IN ('internal_use', 'internal_use_own', 'internal_use_damage')
  AND s.max_pending_per_requester IS NULL;

-- ─── Trigger: enforce the limit at the database, not just the UI ───────────
CREATE OR REPLACE FUNCTION enforce_pending_request_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_limit     INTEGER;
  v_type_name TEXT;
  v_count     INTEGER;
  v_refs      TEXT;
  v_approver  TEXT;
BEGIN
  -- Only guard fresh pending submissions
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT s.max_pending_per_requester, t.name
    INTO v_limit, v_type_name
  FROM approval_settings s
  JOIN approval_types t ON t.id = s.approval_type_id
  WHERE s.approval_type_id = NEW.approval_type_id;

  IF v_limit IS NULL THEN
    RETURN NEW;  -- no limit configured for this type
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM approval_requests r
  WHERE r.approval_type_id = NEW.approval_type_id
    AND r.requested_by     = NEW.requested_by
    AND r.status           = 'pending';

  IF v_count >= v_limit THEN
    SELECT string_agg(x.reference_number, ', ') INTO v_refs
    FROM (
      SELECT reference_number FROM approval_requests
      WHERE approval_type_id = NEW.approval_type_id
        AND requested_by = NEW.requested_by
        AND status = 'pending'
      ORDER BY requested_at
      LIMIT 3
    ) x;

    SELECT u.full_name INTO v_approver
    FROM approval_requests r
    JOIN users u ON u.id = r.assigned_to
    WHERE r.approval_type_id = NEW.approval_type_id
      AND r.requested_by = NEW.requested_by
      AND r.status = 'pending'
    ORDER BY r.requested_at
    LIMIT 1;

    RAISE EXCEPTION 'You already have % unapproved % request(s): %. Follow up with % to get them approved or rejected before submitting another.',
      v_count, COALESCE(v_type_name, 'approval'), COALESCE(v_refs, '—'),
      COALESCE(v_approver, 'your approver')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_pending_request_limit ON approval_requests;
CREATE TRIGGER trg_enforce_pending_request_limit
  BEFORE INSERT ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_pending_request_limit();
