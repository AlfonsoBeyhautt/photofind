import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadServerEnv, logApiKeyStatus } from '../server/env'
import { logStartupConfig } from '../server/config/serverHealth'
import { createApp } from '../server/createApp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

loadServerEnv(root)
logApiKeyStatus(root)
logStartupConfig()

/** Bundled to api/index.js for Vercel — do not import from /api at runtime. */
const app = createApp({ serveStatic: false })

export default app
