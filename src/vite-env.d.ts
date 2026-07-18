/// <reference types="vite/client" />

// Type declarations for MalkiaOS environment variables.
// Vite exposes only vars prefixed with VITE_ to client code.
interface ImportMetaEnv {
  readonly VITE_MALKIA_WELLNESS_SUPABASE_URL: string
  readonly VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY: string
  readonly VITE_MALKIA_BRANDS_SUPABASE_URL: string
  readonly VITE_MALKIA_BRANDS_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
