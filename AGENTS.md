# Verifying releases

For changes that depend on Supabase, identify the project configured for the deployed app. Compare the checked-in migrations, RPC argument names, columns, permissions and Edge Function versions with that project. Apply the required backend changes before releasing a frontend that calls them. Report any pending dependency explicitly.

Add a safe build-time contract check when changing an HRM backend dependency. The Vercel build runs the checks in `scripts/verify-hrm-backend.mjs` against the same project the frontend uses. A missing function, wrong signature or unexpected access response fails the build.

Verify affected business flows under the intended application role, including database constraints and accounting effects. Use a test environment or a transaction that rolls back, and verify that it left no test records. For notification changes, test message payloads and delivery tracking with a simulated provider. Report separately what was verified in production and what was simulated.
