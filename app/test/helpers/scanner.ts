import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Release build of sa-scan. Build it first with `npm run scanner:build` from the repo root. */
export const SCANNER = resolve(__dirname, '../../../scanner/.build/release/sa-scan')

export function requireScanner(): string {
  if (!existsSync(SCANNER)) throw new Error(`sa-scan not found at ${SCANNER}; run "npm run scanner:build" from the repo root`)
  return SCANNER
}
