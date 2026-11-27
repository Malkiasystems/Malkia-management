import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { verifyHrmBackend } from './scripts/verify-hrm-backend.mjs'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'verify-malkia-hrm-backend',
      apply: 'build',
      async buildStart() {
        if (process.env.VERCEL === '1') {
          await verifyHrmBackend(loadEnv(mode, process.cwd(), 'VITE_'))
        }
      },
    },
  ],
}))
