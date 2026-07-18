/// <reference types="vite/client" />

// Type declarations for MalkiaOS environment variables.
// Single company (Malkia Wellness); Malkia Brands retired 2026-07-18.
interface ImportMetaEnv {
  readonly VITE_MALKIA_WELLNESS_SUPABASE_URL: string
  readonly VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
