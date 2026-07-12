-- ════════════════════════════════════════════════════════════════════════════
-- 026_login_otp.sql
--
-- SMS login OTP (second factor after password). Codes are generated, hashed,
-- and verified by our own server endpoints (api/auth-send-otp,
-- api/auth-verify-otp) using Beem purely as the SMS transport.
--
-- SECURITY NOTE — this table intentionally BREAKS the usual "GRANT to
-- authenticated" pattern. otp_challenges holds security material. No browser
-- client may ever read or write it. RLS is enabled with NO policies, and NO
-- grant to `authenticated`, so PostgREST denies all client access. Only the
-- service-role key (used server-side in the Vercel functions) can touch it,
-- because service role bypasses RLS. This is deliberate, not an oversight.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Per-user MFA state ───────────────────────────────────────────────────
-- mfa_enabled     : opt-in flag. Rollout is phased — only users with a verified
--                   phone AND this flag get an OTP step. Everyone else logs in
--                   exactly as before, so we never lock out the 8 users who
--                   currently have no phone on file.
-- phone_verified_at: set when a user completes an OTP against their number, so
--                   we know the number actually reaches them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_otp_at timestamptz;

-- ── 2. Challenge store ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone        text NOT NULL,                    -- normalized MSISDN, e.g. 255748551008
  code_hash    text NOT NULL,                    -- HMAC-SHA256(code, server pepper). Never the code.
  purpose      text NOT NULL DEFAULT 'login',
  attempts     int  NOT NULL DEFAULT 0,          -- wrong guesses so far
  max_attempts int  NOT NULL DEFAULT 5,
  expires_at   timestamptz NOT NULL,             -- created + 5 min
  consumed_at  timestamptz,                      -- set on success; a consumed code can't be reused
  created_at   timestamptz NOT NULL DEFAULT now(),
  ip           text
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_user ON otp_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expiry ON otp_challenges(expires_at);

-- ── 3. Lock it down. RLS on, NO policies, NO grant to authenticated. ────────
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY statements on purpose — deny-all for every client role.)
REVOKE ALL ON otp_challenges FROM authenticated, anon;

-- ── 4. Housekeeping: drop expired/consumed challenges older than a day. ─────
-- Call periodically (cron or a scheduled function). Safe to run anytime.
CREATE OR REPLACE FUNCTION prune_otp_challenges() RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM otp_challenges
  WHERE created_at < now() - interval '1 day';
$$;

NOTIFY pgrst, 'reload schema';
