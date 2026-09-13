import { Worker } from 'node:worker_threads'
import type { EngineOptions } from '../engine/engine'
import type { EngineArgs, EngineCall, EngineMessage, EngineMethod, EngineResult } from '../shared/engineApi'
import type { EngineEvent } from '../shared/types'

/** Main-process proxy for the engine worker. */
export class EngineClient {
  private readonly worker: Worker
  private nextId = 1
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(err: Error): void }>()

  constructor(workerPath: string, options: EngineOptions, onEvent: (event: EngineEvent) => void) {
    this.worker = new Worker(workerPath, { workerData: options })
    this.worker.on('message', (message: EngineMessage) => {
      if (message.kind === 'event') {
        onEvent(message.event)
        return
      }
      const call = this.pending.get(message.id)
      if (!call) return
      this.pending.delete(message.id)
      if (message.error !== undefined) call.reject(new Error(message.error))
      else call.resolve(message.result)
    })
    this.worker.on('error', (err) => this.failAll(err))
    this.worker.on('exit', (code) => this.failAll(new Error(`Engine worker exited with code ${code}`)))
  }

  call<M extends EngineMethod>(method: M, ...args: EngineArgs<M>): Promise<EngineResult<M>> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      const message: EngineCall = { kind: 'call', id, method, args }
      this.worker.postMessage(message)
    })
  }

  terminate(): Promise<number> {
    return this.worker.terminate()
  }

  private failAll(err: Error): void {
    for (const call of this.pending.values()) call.reject(err)
    this.pending.clear()
  }
}
