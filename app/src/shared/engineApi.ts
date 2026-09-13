import type { Engine } from '../engine/engine'

/** Engine methods callable from the main process over the worker message channel. */
export const ENGINE_METHODS = [
  'init',
  'getState',
  'startScan',
  'cancelScan',
  'children',
  'searchPage',
  'sunburst',
  'breadcrumb',
  'cleanup',
  'findDuplicates',
  'cancelDuplicates',
  'paths',
  'remove',
  'flush',
] as const

export type EngineMethod = (typeof ENGINE_METHODS)[number]

export type EngineArgs<M extends EngineMethod> = Parameters<Engine[M]>
export type EngineResult<M extends EngineMethod> = Awaited<ReturnType<Engine[M]>>

export interface EngineCall {
  kind: 'call'
  id: number
  method: EngineMethod
  args: unknown[]
}

export type EngineMessage =
  | { kind: 'result'; id: number; result?: unknown; error?: string }
  | { kind: 'event'; event: import('./types').EngineEvent }
