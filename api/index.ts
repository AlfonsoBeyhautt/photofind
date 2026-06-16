import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadServerEnv, logApiKeyStatus } from '../server/env.js'
import { logStartupConfig } from '../server/config/serverHealth.js'
import { createApp } from '../server/createApp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

loadServerEnv(root)
logApiKeyStatus(root)
logStartupConfig()

/** Vercel serverless — API only; static files served from dist/ by CDN. */
const app = createApp({ serveStatic: false })

export default app
