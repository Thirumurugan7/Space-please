// Binary frame protocol shared with the Electron main process (app/src/main/scan/frames.ts).
// Frame = type u8 | payloadLength u32 | payload. All integers little-endian.

public enum FrameType: UInt8 {
    case entry = 1
    case error = 2
    case progress = 3
    case done = 4
}

public enum EntryKind: UInt8 {
    case file = 0
    case dir = 1
    case symlink = 2
    case other = 3
}

public enum EntryFlags {
    public static let hardlinkDuplicate: UInt8 = 1
}

public let rootParentId: UInt32 = 0xFFFF_FFFF

public struct FrameEncoder {
    public private(set) var bytes: [UInt8] = []

    public init() {
        bytes.reserveCapacity(1 << 17)
    }

    public var count: Int { bytes.count }

    public mutating func reset() {
        bytes.removeAll(keepingCapacity: true)
    }

    public mutating func entry(id: UInt32, parentId: UInt32, kind: EntryKind, flags: UInt8,
                               size: UInt64, mtime: Int64, name: some Collection<UInt8>) {
        frame(.entry) { e in
            e.u32(id); e.u32(parentId); e.u8(kind.rawValue); e.u8(flags)
            e.u64(size); e.i64(mtime); e.str(name)
        }
    }

    public mutating func error(dirId: UInt32, errno: Int32, path: String) {
        frame(.error) { e in e.u32(dirId); e.i32(errno); e.str(Array(path.utf8)) }
    }

    public mutating func progress(entries: UInt64, bytes: UInt64, path: String) {
        frame(.progress) { e in e.u64(entries); e.u64(bytes); e.str(Array(path.utf8)) }
    }

    public mutating func done(entries: UInt64, errors: UInt32, elapsedMs: UInt64) {
        frame(.done) { e in e.u64(entries); e.u32(errors); e.u64(elapsedMs) }
    }

    private mutating func frame(_ type: FrameType, _ body: (inout FrameEncoder) -> Void) {
        u8(type.rawValue)
        let lenAt = bytes.count
        u32(0)
        body(&self)
        let len = UInt32(bytes.count - lenAt - 4)
        bytes[lenAt] = UInt8(truncatingIfNeeded: len)
        bytes[lenAt + 1] = UInt8(truncatingIfNeeded: len >> 8)
        bytes[lenAt + 2] = UInt8(truncatingIfNeeded: len >> 16)
        bytes[lenAt + 3] = UInt8(truncatingIfNeeded: len >> 24)
    }

    private mutating func u8(_ v: UInt8) { bytes.append(v) }
    private mutating func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { bytes.append(contentsOf: $0) } }
    private mutating func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { bytes.append(contentsOf: $0) } }
    private mutating func i32(_ v: Int32) { withUnsafeBytes(of: v.littleEndian) { bytes.append(contentsOf: $0) } }
    private mutating func u64(_ v: UInt64) { withUnsafeBytes(of: v.littleEndian) { bytes.append(contentsOf: $0) } }
    private mutating func i64(_ v: Int64) { withUnsafeBytes(of: v.littleEndian) { bytes.append(contentsOf: $0) } }

    private mutating func str(_ s: some Collection<UInt8>) {
        let n = min(s.count, Int(UInt16.max))
        u16(UInt16(n))
        bytes.append(contentsOf: s.prefix(n))
    }
}

public enum Frame: Equatable, Sendable {
    case entry(id: UInt32, parentId: UInt32, kind: UInt8, flags: UInt8, size: UInt64, mtime: Int64, name: String)
    case error(dirId: UInt32, errno: Int32, path: String)
    case progress(entries: UInt64, bytes: UInt64, path: String)
    case done(entries: UInt64, errors: UInt32, elapsedMs: UInt64)
}

public struct FrameDecodeError: Error {}

/// Decodes a complete byte stream. Used by tests; the app has its own streaming decoder.
public func decodeFrames(_ data: [UInt8]) throws -> [Frame] {
    var r = Reader(data: data)
    var out: [Frame] = []
    while r.pos < data.count {
        let type = try r.u8()
        let len = Int(try r.u32())
        let end = r.pos + len
        guard end <= data.count else { throw FrameDecodeError() }
        switch FrameType(rawValue: type) {
        case .entry:
            out.append(.entry(id: try r.u32(), parentId: try r.u32(), kind: try r.u8(), flags: try r.u8(),
                              size: try r.u64(), mtime: Int64(bitPattern: try r.u64()), name: try r.str()))
        case .error:
            out.append(.error(dirId: try r.u32(), errno: Int32(bitPattern: try r.u32()), path: try r.str()))
        case .progress:
            out.append(.progress(entries: try r.u64(), bytes: try r.u64(), path: try r.str()))
        case .done:
            out.append(.done(entries: try r.u64(), errors: try r.u32(), elapsedMs: try r.u64()))
        case nil:
            throw FrameDecodeError()
        }
        guard r.pos == end else { throw FrameDecodeError() }
    }
    return out
}

private struct Reader {
    let data: [UInt8]
    var pos = 0

    mutating func take(_ n: Int) throws -> ArraySlice<UInt8> {
        guard pos + n <= data.count else { throw FrameDecodeError() }
        defer { pos += n }
        return data[pos..<pos + n]
    }

    mutating func u8() throws -> UInt8 { try take(1).first! }

    mutating func uint(_ n: Int) throws -> UInt64 {
        try take(n).reversed().reduce(0) { $0 << 8 | UInt64($1) }
    }

    mutating func u32() throws -> UInt32 { UInt32(try uint(4)) }
    mutating func u64() throws -> UInt64 { try uint(8) }

    mutating func str() throws -> String {
        let n = Int(try uint(2))
        return String(decoding: try take(n), as: UTF8.self)
    }
}
