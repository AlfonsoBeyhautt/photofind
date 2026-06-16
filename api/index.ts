import type { Express } from 'express'
import app from './bundle/app.js'

/** Vercel entrypoint — Express app is pre-bundled at build time into api/bundle/app.js */
export default app as Express
