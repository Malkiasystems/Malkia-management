-- ════════════════════════════════════════════════════════════════════════════
-- 020_login_events.sql
-- Records each successful sign-in so a user can see their recent logins and
-- spot access they don't recognise (last-login / "was this you?" security).
-- One row per login: the email, when, and the device (user agent).
--
-- Idempotent. RLS off to match the operational tables — the app only ever shows
-- a user their OWN sign-ins (it queries by the logged-in email).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS login_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT NOT NULL,
  user_agent   TEXT,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_events_email_time ON login_events (lower(user_email), logged_in_at DESC);
GRANT SELECT, INSERT ON login_events TO authenticated;

NOTIFY pgrst, 'reload schema';
