import { describe, expect, it } from 'vitest'
import { FrameParser, type FrameHandlers } from '../../src/engine/frameParser'
import { FrameWriter } from '../helpers/frameWriter'

type Event = [string, ...unknown[]]

function collect(): { events: Event[]; handlers: FrameHandlers } {
  const events: Event[] = []
  return {
    events,
    handlers: {
      entry: (id, parentId, kind, flags, size, mtime, name) =>
        events.push(['entry', id, parentId, kind, flags, size, mtime, Buffer.from(name).toString()]),
      error: (dirId, errno, path) => events.push(['error', dirId, errno, path]),
      progress: (entries, bytes, path) => events.push(['progress', entries, bytes, path]),
      done: (entries, errors, elapsedMs) => events.push(['done', entries, errors, elapsedMs]),
    },
  }
}

const stream = new FrameWriter()
  .entry({ id: 0, parentId: 0xffffffff, kind: 1, name: '/Users/me', mtime: 1_700_000_000 })
  .entry({ id: 1, parentId: 0, kind: 0, flags: 1, size: 5_000_000_000, mtime: -5, name: 'café😀.mov' })
  .error(3, 13, '/Users/me/locked')
  .progress(2, 5_000_000_000, '/Users/me')
  .done(2, 1, 1234)
  .toBuffer()

const expected: Event[] = [
  ['entry', 0, 0xffffffff, 1, 0, 0, 1_700_000_000, '/Users/me'],
  ['entry', 1, 0, 0, 1, 5_000_000_000, -5, 'café😀.mov'],
  ['error', 3, 13, '/Users/me/locked'],
  ['progress', 2, 5_000_000_000, '/Users/me'],
  ['done', 2, 1, 1234],
]

describe('FrameParser', () => {
  it('decodes every frame type from one chunk', () => {
    const { events, handlers } = collect()
    const parser = new FrameParser(handlers)
    parser.push(stream)
    expect(events).toEqual(expected)
    expect(parser.hasPartialFrame).toBe(false)
  })

  it('decodes the same frames when fed one byte at a time', () => {
    const { events, handlers } = collect()
    const parser = new FrameParser(handlers)
    for (let i = 0; i < stream.length; i++) parser.push(stream.subarray(i, i + 1))
    expect(events).toEqual(expected)
    expect(parser.hasPartialFrame).toBe(false)
  })

  it('keeps a trailing partial frame until the rest arrives', () => {
    const { events, handlers } = collect()
    const parser = new FrameParser(handlers)
    parser.push(stream.subarray(0, stream.length - 3))
    expect(events).toEqual(expected.slice(0, 4))
    expect(parser.hasPartialFrame).toBe(true)
    parser.push(stream.subarray(stream.length - 3))
    expect(events).toEqual(expected)
    expect(parser.hasPartialFrame).toBe(false)
  })

  it('throws on an unknown frame type', () => {
    const parser = new FrameParser(collect().handlers)
    expect(() => parser.push(new FrameWriter().raw(9, Buffer.alloc(2)).toBuffer())).toThrow('unknown frame type 9')
  })
})
