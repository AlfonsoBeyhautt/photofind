import esbuild from 'esbuild'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const apiDir = path.join(root, '..', 'api')
const bundleDir = path.join(apiDir, 'bundle')
const outfile = path.join(bundleDir, 'app.js')

mkdirSync(bundleDir, { recursive: true })

const handlerPath = path.join(apiDir, 'handler.ts')
if (!existsSync(handlerPath)) {
  console.error('[PhotoFind] Missing api/handler.ts')
  process.exit(1)
}

await esbuild.build({
  entryPoints: [handlerPath],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: "import { createRequire as __photofindCreateRequire } from 'module'; const require = __photofindCreateRequire(import.meta.url);",
  },
})

console.log(`[PhotoFind] Vercel API bundle written to ${outfile}`)
