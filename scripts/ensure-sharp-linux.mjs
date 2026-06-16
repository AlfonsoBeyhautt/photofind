/**
 * On Vercel (linux-x64), ensure sharp platform binaries are present after install.
 * Safe to run locally — only acts when VERCEL=1.
 */
import { execSync } from 'node:child_process'

if (process.env.VERCEL === '1') {
  console.log('[PhotoFind] Vercel postinstall: ensuring sharp linux-x64 binaries...')
  try {
    execSync(
      'npm install --no-save --include=optional @img/sharp-linux-x64@0.35.1 @img/sharp-libvips-linux-x64@1.3.0',
      { stdio: 'inherit' },
    )
    console.log('[PhotoFind] sharp linux-x64 binaries ready')
  } catch (err) {
    console.error('[PhotoFind] sharp postinstall failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}
