import { spawn, type ChildProcess } from 'node:child_process'
import type { ScanProgress } from '../shared/types'
import { FrameParser } from './frameParser'
import { TreeBuilder, type Tree } from './tree'

export interface ScanOutcome {
  tree: Tree | null
  /** True when no DONE frame arrived (cancelled, crashed or unreadable output). */
  incomplete: boolean
  errors: number
  /** Human-readable failure; null on success or user cancellation. */
  message: string | null
}

/** Runs sa-scan and turns its frame stream into a Tree. One scan at a time. */
export class ScanController {
  private readonly scannerPath: string
  private child: ChildProcess | null = null
  private cancelled = false

  constructor(scannerPath: string) {
    this.scannerPath = scannerPath
  }

  get running(): boolean {
    return this.child !== null
  }

  run(root: string, onProgress: (p: ScanProgress) => void): Promise<ScanOutcome> {
    if (this.child) return Promise.reject(new Error('A scan is already running'))
    this.cancelled = false
    const builder = new TreeBuilder()
    let errors = 0
    let done = false
    const parser = new FrameParser({
      entry: (id, parentId, kind, flags, size, mtime, name) => builder.add(id, parentId, kind, flags, size, mtime, name),
      error: () => {
        errors++
      },
      progress: (entries, bytes, path) => onProgress({ entries, bytes, path }),
      done: (_entries, errorCount) => {
        done = true
        errors = errorCount
      },
    })

    return new Promise((resolve) => {
      let settled = false
      const finish = (outcome: ScanOutcome) => {
        if (settled) return
        settled = true
        this.child = null
        resolve(outcome)
      }

      const child = spawn(this.scannerPath, ['--root', root], { stdio: ['ignore', 'pipe', 'pipe'] })
      this.child = child
      let stderr = ''
      let parseError: Error | null = null

      child.stdout!.on('data', (chunk: Buffer) => {
        if (parseError) return
        try {
          parser.push(chunk)
        } catch (err) {
          parseError = err as Error
          child.kill('SIGTERM')
        }
      })
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', (err) => {
        finish({ tree: null, incomplete: true, errors, message: `Could not start scanner: ${err.message}` })
      })
      child.on('close', (code, signal) => {
        let tree: Tree | null = null
        let message: string | null = null
        try {
          tree = builder.entries > 0 ? builder.build() : null
        } catch (err) {
          message = `Scan produced no usable results: ${(err as Error).message}`
        }
        if (parseError) message = `Scanner output was invalid: ${parseError.message}`
        else if (!done && !this.cancelled && message === null) {
          message = stderr.trim() || `Scanner stopped unexpectedly (${code ?? signal})`
        }
        finish({ tree, incomplete: !done, errors, message })
      })
    })
  }

  cancel(): void {
    if (!this.child) return
    this.cancelled = true
    this.child.kill('SIGTERM')
  }
}
