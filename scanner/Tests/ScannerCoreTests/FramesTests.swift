import XCTest
@testable import ScannerCore

final class FramesTests: XCTestCase {
    func testEntryByteLayout() {
        var enc = FrameEncoder()
        enc.entry(id: 1, parentId: 0, kind: .dir, flags: 0, size: 2, mtime: 3, name: Array("ab".utf8))
        XCTAssertEqual(enc.bytes, [
            1, 30, 0, 0, 0,             // type, payload length 30
            1, 0, 0, 0,                 // id
            0, 0, 0, 0,                 // parentId
            1, 0,                       // kind dir, flags
            2, 0, 0, 0, 0, 0, 0, 0,     // size
            3, 0, 0, 0, 0, 0, 0, 0,     // mtime
            2, 0, 97, 98,               // name
        ])
    }

    func testEntryRoundTripWithLargeSizeNegativeTimeAndUnicode() throws {
        var enc = FrameEncoder()
        enc.entry(id: 7, parentId: 3, kind: .file, flags: EntryFlags.hardlinkDuplicate,
                  size: 5_000_000_000, mtime: -5, name: Array("café😀".utf8))
        XCTAssertEqual(try decodeFrames(enc.bytes), [
            .entry(id: 7, parentId: 3, kind: 0, flags: 1, size: 5_000_000_000, mtime: -5, name: "café😀"),
        ])
    }

    func testErrorProgressDoneRoundTrip() throws {
        var enc = FrameEncoder()
        enc.error(dirId: 9, errno: 13, path: "/private/x")
        enc.progress(entries: 100, bytes: 1 << 40, path: "/Users")
        enc.done(entries: 100, errors: 1, elapsedMs: 1234)
        XCTAssertEqual(try decodeFrames(enc.bytes), [
            .error(dirId: 9, errno: 13, path: "/private/x"),
            .progress(entries: 100, bytes: 1 << 40, path: "/Users"),
            .done(entries: 100, errors: 1, elapsedMs: 1234),
        ])
    }

    func testResetClearsBytes() {
        var enc = FrameEncoder()
        enc.done(entries: 1, errors: 0, elapsedMs: 1)
        enc.reset()
        XCTAssertEqual(enc.count, 0)
    }

    func testTruncatedStreamThrows() {
        var enc = FrameEncoder()
        enc.progress(entries: 1, bytes: 2, path: "/a")
        XCTAssertThrowsError(try decodeFrames(Array(enc.bytes.dropLast())))
    }

    func testOverlongNameIsTruncatedToUInt16Max() throws {
        var enc = FrameEncoder()
        enc.entry(id: 1, parentId: 0, kind: .file, flags: 0, size: 0, mtime: 0,
                  name: [UInt8](repeating: 97, count: 70_000))
        guard case let .entry(_, _, _, _, _, _, name) = try decodeFrames(enc.bytes).first else {
            return XCTFail("expected entry")
        }
        XCTAssertEqual(name.utf8.count, Int(UInt16.max))
    }
}
