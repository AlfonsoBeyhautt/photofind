import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadServerEnv, logApiKeyStatus } from './env'
import { createApp } from './createApp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3001

loadServerEnv(path.join(__dirname, '..'))
logApiKeyStatus(path.join(__dirname, '..'))

const app = createApp({ serveStatic: true })

app.listen(PORT, () => {
  console.log(`PhotoFind server running on http://localhost:${PORT}`)
})
