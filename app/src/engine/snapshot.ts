import { open, readFile, rename, unlink } from 'node:fs/promises'
import { Tree } from './tree'

const MAGIC = Buffer.from('SASNAP01')
export const SNAPSHOT_VERSION = 1

export interface SnapshotInfo {
  root: string
  scannedAt: number
  incomplete: boolean
  errors: number
}

interface Header extends SnapshotInfo {
  version: number
  count: number
  nameBytes: number
}

/**
 * Layout: MAGIC(8) | headerLength u32 | header JSON | parent u32[] | kind u8[] | flags u8[] |
 * size f64[] | mtime f64[] | nameStart u32[count+1] | nameBytes.
 */
export async function saveSnapshot(file: string, tree: Tree, info: SnapshotInfo): Promise<void> {
  const c = tree.columns()
  const header: Header = { ...info, version: SNAPSHOT_VERSION, count: c.count, nameBytes: c.nameBytes.length }
  const headerBytes = Buffer.from(JSON.stringify(header))
  const headerLength = Buffer.alloc(4)
  headerLength.writeUInt32LE(headerBytes.length, 0)

  const tmp = `${file}.tmp`
  const handle = await open(tmp, 'w')
  try {
    for (const part of [MAGIC, headerLength, headerBytes, c.parent, c.kind, c.flags, c.size, c.mtime, c.nameStart, c.nameBytes]) {
      await handle.write(new Uint8Array(part.buffer, part.byteOffset, part.byteLength))
    }
  } finally {
    await handle.close()
  }
  await rename(tmp, file)
}

export async function loadSnapshot(file: string): Promise<{ tree: Tree; info: SnapshotInfo } | null> {
  let buf: Buffer
  try {
    buf = await readFile(file)
  } catch {
    return null
  }
  try {
    if (buf.length < 12 || !buf.subarray(0, 8).equals(MAGIC)) throw new Error('bad magic')
    const headerLength = buf.readUInt32LE(8)
    const header = JSON.parse(buf.toString('utf8', 12, 12 + headerLength)) as Header
    if (header.version !== SNAPSHOT_VERSION) throw new Error('version mismatch')
    const n = header.count
    let pos = 12 + headerLength
    const expected = pos + n * (4 + 1 + 1 + 8 + 8) + (n + 1) * 4 + header.nameBytes
    if (buf.length !== expected) throw new Error('truncated')

    const take = <T extends ArrayBufferView>(Ctor: { new (length: number): T; BYTES_PER_ELEMENT: number }, length: number): T => {
      const out = new Ctor(length)
      const bytes = length * Ctor.BYTES_PER_ELEMENT
      new Uint8Array(out.buffer).set(buf.subarray(pos, pos + bytes))
      pos += bytes
      return out
    }

    const tree = new Tree({
      count: n,
      parent: take(Uint32Array, n),
      kind: take(Uint8Array, n),
      flags: take(Uint8Array, n),
      size: take(Float64Array, n),
      mtime: take(Float64Array, n),
      nameStart: take(Uint32Array, n + 1),
      nameBytes: take(Uint8Array, header.nameBytes),
    })
    const { root, scannedAt, incomplete, errors } = header
    return { tree, info: { root, scannedAt, incomplete, errors } }
  } catch {
    await unlink(file).catch(() => {})
    return null
  }
}
