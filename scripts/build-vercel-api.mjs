import esbuild from 'esbuild'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(root, '..', 'api')
const outfile = path.join(outDir, 'index.js')

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true })
}

await esbuild.build({
  entryPoints: [path.join(outDir, 'handler.ts')],
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
