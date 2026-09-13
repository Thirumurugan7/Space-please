// Test-only encoder producing the same bytes as scanner/Sources/ScannerCore/Frames.swift.

export interface EntryFrame {
  id: number
  parentId: number
  kind: number
  flags?: number
  size?: number
  mtime?: number
  name: string
}

export class FrameWriter {
  private readonly parts: Buffer[] = []

  entry(e: EntryFrame): this {
    const name = Buffer.from(e.name)
    const payload = Buffer.alloc(28 + name.length)
    payload.writeUInt32LE(e.id, 0)
    payload.writeUInt32LE(e.parentId, 4)
    payload[8] = e.kind
    payload[9] = e.flags ?? 0
    payload.writeBigUInt64LE(BigInt(e.size ?? 0), 10)
    payload.writeBigInt64LE(BigInt(e.mtime ?? 0), 18)
    payload.writeUInt16LE(name.length, 26)
    name.copy(payload, 28)
    return this.frame(1, payload)
  }

  error(dirId: number, errno: number, path: string): this {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(dirId, 0)
    head.writeInt32LE(errno, 4)
    return this.frame(2, Buffer.concat([head, str(path)]))
  }

  progress(entries: number, bytes: number, path: string): this {
    const head = Buffer.alloc(16)
    head.writeBigUInt64LE(BigInt(entries), 0)
    head.writeBigUInt64LE(BigInt(bytes), 8)
    return this.frame(3, Buffer.concat([head, str(path)]))
  }

  done(entries: number, errors: number, elapsedMs: number): this {
    const payload = Buffer.alloc(20)
    payload.writeBigUInt64LE(BigInt(entries), 0)
    payload.writeUInt32LE(errors, 8)
    payload.writeBigUInt64LE(BigInt(elapsedMs), 12)
    return this.frame(4, payload)
  }

  raw(type: number, payload: Buffer): this {
    return this.frame(type, payload)
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.parts)
  }

  private frame(type: number, payload: Buffer): this {
    const header = Buffer.alloc(5)
    header[0] = type
    header.writeUInt32LE(payload.length, 1)
    this.parts.push(header, payload)
    return this
  }
}

function str(s: string): Buffer {
  const bytes = Buffer.from(s)
  const len = Buffer.alloc(2)
  len.writeUInt16LE(bytes.length, 0)
  return Buffer.concat([len, bytes])
}
