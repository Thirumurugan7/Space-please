import { FrameType } from '../shared/protocol'

export interface FrameHandlers {
  /** `name` is a view into the parser's buffer and is only valid during the call. */
  entry(id: number, parentId: number, kind: number, flags: number, size: number, mtime: number, name: Uint8Array): void
  error(dirId: number, errno: number, path: string): void
  progress(entries: number, bytes: number, path: string): void
  done(entries: number, errors: number, elapsedMs: number): void
}

const HEADER = 5
const TWO_32 = 4294967296
const decoder = new TextDecoder()

/** Incrementally decodes sa-scan frames from arbitrarily split stdout chunks. */
export class FrameParser {
  private pending: Buffer | null = null
  private readonly handlers: FrameHandlers

  constructor(handlers: FrameHandlers) {
    this.handlers = handlers
  }

  get hasPartialFrame(): boolean {
    return this.pending !== null
  }

  push(chunk: Buffer): void {
    const buf = this.pending ? Buffer.concat([this.pending, chunk]) : chunk
    let pos = 0
    while (buf.length - pos >= HEADER) {
      const len = buf.readUInt32LE(pos + 1)
      if (buf.length - pos - HEADER < len) break
      this.dispatch(buf, buf[pos], pos + HEADER)
      pos += HEADER + len
    }
    this.pending = pos < buf.length ? Buffer.from(buf.subarray(pos)) : null
  }

  private dispatch(b: Buffer, type: number, p: number): void {
    switch (type) {
      case FrameType.Entry: {
        const nameLen = b.readUInt16LE(p + 26)
        this.handlers.entry(
          b.readUInt32LE(p),
          b.readUInt32LE(p + 4),
          b[p + 8],
          b[p + 9],
          u64(b, p + 10),
          i64(b, p + 18),
          b.subarray(p + 28, p + 28 + nameLen),
        )
        return
      }
      case FrameType.Error:
        this.handlers.error(b.readUInt32LE(p), b.readInt32LE(p + 4), str(b, p + 8))
        return
      case FrameType.Progress:
        this.handlers.progress(u64(b, p), u64(b, p + 8), str(b, p + 16))
        return
      case FrameType.Done:
        this.handlers.done(u64(b, p), b.readUInt32LE(p + 8), u64(b, p + 12))
        return
      default:
        throw new Error(`unknown frame type ${type}`)
    }
  }
}

function u64(b: Buffer, p: number): number {
  return b.readUInt32LE(p) + b.readUInt32LE(p + 4) * TWO_32
}

function i64(b: Buffer, p: number): number {
  return b.readUInt32LE(p) + b.readInt32LE(p + 4) * TWO_32
}

function str(b: Buffer, p: number): string {
  const n = b.readUInt16LE(p)
  return decoder.decode(b.subarray(p + 2, p + 2 + n))
}
