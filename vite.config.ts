import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix: DEV_API_PROXY is a dev-server setting, not something the
  // bundle should carry, so it deliberately has no VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],

    // Nothing under api/ sends CORS headers, because in production the app and
    // the functions share an origin. Pointing the browser straight at a
    // deployed backend from localhost therefore fails preflight with no useful
    // message. Proxying instead keeps every request same-origin: the browser
    // talks to the dev server, and the dev server talks to Vercel.
    //
    // Set DEV_API_PROXY=https://<your-deployment> in .env.local to use the
    // deployed functions. Leave it unset when running `vercel dev`, which
    // serves api/ locally.
    server: env.DEV_API_PROXY
      ? {
          proxy: {
            '/api': {
              target: env.DEV_API_PROXY,
              changeOrigin: true,
            },
          },
        }
      : undefined,
  }
})
