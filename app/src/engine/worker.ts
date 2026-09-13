import { parentPort, workerData } from 'node:worker_threads'
import { ENGINE_METHODS, type EngineCall, type EngineMessage } from '../shared/engineApi'
import { Engine, type EngineOptions } from './engine'

const port = parentPort!
const post = (message: EngineMessage) => port.postMessage(message)
const engine = new Engine(workerData as EngineOptions, (event) => post({ kind: 'event', event }))

port.on('message', async (call: EngineCall) => {
  try {
    if (!ENGINE_METHODS.includes(call.method)) throw new Error(`Unknown engine method: ${call.method}`)
    const method = engine[call.method] as (...args: unknown[]) => unknown
    const result = await method.apply(engine, call.args)
    post({ kind: 'result', id: call.id, result })
  } catch (err) {
    post({ kind: 'result', id: call.id, error: err instanceof Error ? err.message : String(err) })
  }
})
