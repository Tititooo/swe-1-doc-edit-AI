import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        "cd ../backend && if [ -f .venv/bin/activate ]; then . .venv/bin/activate; fi; DATABASE_URL='' AI_FAKE_MODE=true AI_REQUIRE_AUTH=true JWT_SECRET=test-secret CORS_ORIGINS=http://127.0.0.1:4317 COLLAB_WS_URL=ws://127.0.0.1:1337 python3 -m uvicorn api.main:app --host 127.0.0.1 --port 4400",
      url: 'http://127.0.0.1:4400/health',
      reuseExistingServer: false,
    },
    {
      command:
        "cd ../backend/collab && DATABASE_URL='' JWT_SECRET=test-secret NODE_ENV=test PORT=1337 node server.js",
      url: 'http://127.0.0.1:1337/health',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_API_BASE_URL=http://127.0.0.1:4400/api VITE_COLLAB_WS_URL=ws://127.0.0.1:1337 VITE_ENABLE_MOCK_API=false VITE_DEV_AUTOLOGIN=false npm run dev -- --host 127.0.0.1 --port 4317',
      url: 'http://127.0.0.1:4317',
      reuseExistingServer: false,
    },
  ],
})
