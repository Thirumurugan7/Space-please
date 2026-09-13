import { Kind, ROOT_PARENT } from '../shared/protocol'
import type { KindName, Row } from '../shared/types'
import { TYPE_CODES, classify } from './fileTypes'

/** Parent value for ids that never received an ENTRY frame. */
export const ABSENT = 0xfffffffe
/** App-only flag: entry was moved to the Trash (or lies under one that was). */
export const FLAG_DELETED = 128

const KIND_NAMES: KindName[] = ['file', 'dir', 'symlink', 'other']

/** The persisted, id-ordered base columns of a tree. Everything else is derived. */
export interface TreeColumns {
  count: number
  parent: Uint32Array
  kind: Uint8Array
  flags: Uint8Array
  size: Float64Array
  mtime: Float64Array
  /** count + 1 offsets into nameBytes. */
  nameStart: Uint32Array
  nameBytes: Uint8Array
}

/** Accumulates ENTRY frames in any order. */
export class TreeBuilder {
  private cap = 0
  private count = 0
  private parent = new Uint32Array(0)
  private kind = new Uint8Array(0)
  private flags = new Uint8Array(0)
  private size = new Float64Array(0)
  private mtime = new Float64Array(0)
  private nameOff = new Uint32Array(0)
  private nameLen = new Uint16Array(0)
  private names = new Uint8Array(1 << 20)
  private namesUsed = 0

  constructor(initialCapacity = 1 << 16) {
    this.grow(initialCapacity)
  }

  /** Highest id seen + 1. */
  get entries(): number {
    return this.count
  }

  add(id: number, parentId: number, kind: number, flags: number, size: number, mtime: number, name: Uint8Array): void {
    if (id >= this.cap) this.grow(id + 1)
    this.parent[id] = parentId
    this.kind[id] = kind
    this.flags[id] = flags
    this.size[id] = size
    this.mtime[id] = mtime
    const len = name.length
    if (this.namesUsed + len > this.names.length) {
      const next = new Uint8Array(Math.max(this.names.length * 2, this.namesUsed + len))
      next.set(this.names.subarray(0, this.namesUsed))
      this.names = next
    }
    const names = this.names
    const base = this.namesUsed
    for (let i = 0; i < len; i++) names[base + i] = name[i]
    this.nameOff[id] = base
    this.nameLen[id] = len
    this.namesUsed += len
    if (id >= this.count) this.count = id + 1
  }

  build(): Tree {
    const count = this.count
    const nameStart = new Uint32Array(count + 1)
    let total = 0
    for (let id = 0; id < count; id++) {
      nameStart[id] = total
      if (this.parent[id] !== ABSENT) total += this.nameLen[id]
    }
    nameStart[count] = total
    const nameBytes = new Uint8Array(total)
    const names = this.names
    for (let id = 0; id < count; id++) {
      if (this.parent[id] === ABSENT) continue
      const from = this.nameOff[id]
      const to = nameStart[id]
      const len = this.nameLen[id]
      for (let i = 0; i < len; i++) nameBytes[to + i] = names[from + i]
    }
    return new Tree({
      count,
      parent: this.parent.slice(0, count),
      kind: this.kind.slice(0, count),
      flags: this.flags.slice(0, count),
      size: this.size.slice(0, count),
      mtime: this.mtime.slice(0, count),
      nameStart,
      nameBytes,
    })
  }

  private grow(min: number): void {
    const cap = Math.max(this.cap * 2, min, 1024)
    const parent = new Uint32Array(cap)
    parent.set(this.parent)
    parent.fill(ABSENT, this.cap)
    this.parent = parent
    this.kind = copy(new Uint8Array(cap), this.kind)
    this.flags = copy(new Uint8Array(cap), this.flags)
    this.size = copy(new Float64Array(cap), this.size)
    this.mtime = copy(new Float64Array(cap), this.mtime)
    this.nameOff = copy(new Uint32Array(cap), this.nameOff)
    this.nameLen = copy(new Uint16Array(cap), this.nameLen)
    this.cap = cap
  }
}

function copy<T extends { set(a: ArrayLike<number>): void }>(target: T, source: ArrayLike<number>): T {
  target.set(source)
  return target
}

export class Tree {
  readonly count: number
  readonly parent: Uint32Array
  readonly kind: Uint8Array
  readonly flags: Uint8Array
  readonly size: Float64Array
  readonly mtime: Float64Array
  readonly nameStart: Uint32Array
  readonly nameBytes: Uint8Array

  /** Rolled-up allocated size (own size for files). */
  readonly total: Float64Array
  /** Number of live descendants. */
  readonly items: Uint32Array
  readonly childStart: Uint32Array
  readonly childList: Uint32Array
  /** Lowercase NFC names in id order, each followed by a 0 byte. Absent ids contribute nothing. */
  readonly lower: Buffer
  /** count + 1 offsets into `lower`. */
  readonly lowerStart: Uint32Array
  /** TYPE_CODES index per id. */
  readonly typeCode: Uint8Array
  readonly rootPath: string

  private readonly decoder = new TextDecoder()

  constructor(c: TreeColumns) {
    if (c.count === 0 || c.parent[0] !== ROOT_PARENT) throw new Error('tree has no root entry')
    this.count = c.count
    this.parent = c.parent
    this.kind = c.kind
    this.flags = c.flags
    this.size = c.size
    this.mtime = c.mtime
    this.nameStart = c.nameStart
    this.nameBytes = c.nameBytes
    this.rootPath = this.name(0)

    const count = c.count
    const linked = new Uint8Array(count)
    linked[0] = 1
    for (let id = 1; id < count; id++) {
      const p = c.parent[id]
      linked[id] = p < id && linked[p] === 1 && (c.flags[id] & FLAG_DELETED) === 0 ? 1 : 0
    }

    this.total = new Float64Array(count)
    this.items = new Uint32Array(count)
    for (let id = 0; id < count; id++) if (linked[id]) this.total[id] = c.size[id]
    for (let id = count - 1; id > 0; id--) {
      if (!linked[id]) continue
      const p = c.parent[id]
      this.total[p] += this.total[id]
      this.items[p] += this.items[id] + 1
    }

    this.childStart = new Uint32Array(count + 1)
    for (let id = 1; id < count; id++) if (linked[id]) this.childStart[c.parent[id] + 1]++
    for (let i = 0; i < count; i++) this.childStart[i + 1] += this.childStart[i]
    this.childList = new Uint32Array(this.childStart[count])
    const fill = this.childStart.slice(0, count)
    for (let id = 1; id < count; id++) if (linked[id]) this.childList[fill[c.parent[id]]++] = id

    const { lower, lowerStart } = this.buildLower()
    this.lower = lower
    this.lowerStart = lowerStart
    this.typeCode = new Uint8Array(count)
    for (let id = 0; id < count; id++) {
      if (c.parent[id] === ABSENT) continue
      this.typeCode[id] = classify(lower, lowerStart[id], lowerStart[id + 1] - 1, c.kind[id])
    }
  }

  private buildLower(): { lower: Buffer; lowerStart: Uint32Array } {
    const { count, nameStart, nameBytes, parent } = this
    let out = Buffer.allocUnsafe(nameBytes.length + count + 1024)
    const lowerStart = new Uint32Array(count + 1)
    let w = 0
    for (let id = 0; id < count; id++) {
      lowerStart[id] = w
      if (parent[id] === ABSENT) continue
      const s = nameStart[id]
      const e = nameStart[id + 1]
      let ascii = true
      for (let i = s; i < e; i++) if (nameBytes[i] >= 128) { ascii = false; break }
      let bytes: Uint8Array | null = null
      if (!ascii) bytes = Buffer.from(this.decoder.decode(nameBytes.subarray(s, e)).normalize('NFC').toLowerCase())
      const need = (bytes ? bytes.length : e - s) + 1
      if (w + need > out.length) {
        const bigger = Buffer.allocUnsafe(Math.max(out.length * 2, w + need))
        out.copy(bigger, 0, 0, w)
        out = bigger
      }
      if (bytes) {
        out.set(bytes, w)
        w += bytes.length
      } else {
        for (let i = s; i < e; i++) {
          const ch = nameBytes[i]
          out[w++] = ch >= 65 && ch <= 90 ? ch + 32 : ch
        }
      }
      out[w++] = 0
    }
    lowerStart[count] = w
    return { lower: out.subarray(0, w), lowerStart }
  }

  isPresent(id: number): boolean {
    return id >= 0 && id < this.count && this.parent[id] !== ABSENT && (this.flags[id] & FLAG_DELETED) === 0
  }

  name(id: number): string {
    return this.decoder.decode(this.nameBytes.subarray(this.nameStart[id], this.nameStart[id + 1]))
  }

  displayName(id: number): string {
    return id === 0 ? this.rootPath : this.name(id)
  }

  kindName(id: number): KindName {
    return KIND_NAMES[this.kind[id]] ?? 'other'
  }

  path(id: number): string {
    if (id === 0) return this.rootPath
    const parts: string[] = []
    let cur = id
    while (cur !== 0 && cur < this.count) {
      parts.push(this.name(cur))
      cur = this.parent[cur]
    }
    const base = this.rootPath === '/' ? '' : this.rootPath
    return `${base}/${parts.reverse().join('/')}`
  }

  /** Live and deleted children alike; filter with isPresent. */
  children(id: number): Uint32Array {
    return this.childList.subarray(this.childStart[id], this.childStart[id + 1])
  }

  row(id: number): Row {
    return {
      id,
      name: this.displayName(id),
      path: this.path(id),
      kind: this.kindName(id),
      type: TYPE_CODES[this.typeCode[id]],
      size: this.total[id],
      items: this.items[id],
      mtime: this.mtime[id],
    }
  }

  /** Resolves an absolute path to a live id, or null if it is outside the tree or missing. */
  lookup(path: string): number | null {
    const normalised = path.length > 1 ? path.replace(/\/+$/, '') : path
    if (normalised === this.rootPath) return 0
    const prefix = this.rootPath === '/' ? '/' : `${this.rootPath}/`
    if (!normalised.startsWith(prefix)) return null
    let cur = 0
    for (const part of normalised.slice(prefix.length).split('/')) {
      if (part === '') continue
      let next = -1
      for (const child of this.children(cur)) {
        if (this.isPresent(child) && this.name(child) === part) {
          next = child
          break
        }
      }
      if (next < 0) return null
      cur = next
    }
    return cur
  }

  /** Marks a subtree deleted and subtracts it from every ancestor. */
  remove(id: number): { size: number; items: number } | null {
    if (id === 0 || !this.isPresent(id)) return null
    const size = this.total[id]
    const items = this.items[id] + 1
    const stack = [id]
    while (stack.length > 0) {
      const n = stack.pop()!
      this.flags[n] |= FLAG_DELETED
      for (const child of this.children(n)) stack.push(child)
    }
    let p = this.parent[id]
    while (p !== ROOT_PARENT) {
      this.total[p] -= size
      this.items[p] -= items
      p = this.parent[p]
    }
    return { size, items }
  }

  columns(): TreeColumns {
    return {
      count: this.count,
      parent: this.parent,
      kind: this.kind,
      flags: this.flags,
      size: this.size,
      mtime: this.mtime,
      nameStart: this.nameStart,
      nameBytes: this.nameBytes,
    }
  }
}
