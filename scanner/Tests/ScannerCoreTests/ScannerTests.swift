import Foundation
import XCTest
@testable import ScannerCore

final class ScannerTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("sa-scan-tests-\(UUID().uuidString)")
            .resolvingSymlinksInPath()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        let locked = root.appendingPathComponent("locked")
        if FileManager.default.fileExists(atPath: locked.path) {
            chmod(locked.path, 0o755)
        }
        try? FileManager.default.removeItem(at: root)
    }

    private func write(_ relative: String, bytes: Int) throws {
        let url = root.appendingPathComponent(relative)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(repeating: 0x41, count: bytes).write(to: url)
    }

    private func scan(_ options: ScanOptions? = nil, cancelFirst: Bool = false) throws -> (ScanResult, [Frame]) {
        let sink = MemorySink()
        let scanner = Scanner(options: options ?? ScanOptions(root: root.path, threads: 4, excludes: []), sink: sink)
        if cancelFirst { scanner.cancel() }
        let result = try scanner.run()
        return (result, try decodeFrames(sink.bytes))
    }

    private struct Entry {
        let id: UInt32, parentId: UInt32, kind: UInt8, flags: UInt8, size: UInt64, mtime: Int64, name: String
    }

    private func entries(_ frames: [Frame]) -> [Entry] {
        frames.compactMap {
            if case let .entry(id, parentId, kind, flags, size, mtime, name) = $0 {
                return Entry(id: id, parentId: parentId, kind: kind, flags: flags, size: size, mtime: mtime, name: name)
            }
            return nil
        }
    }

    private func path(of entry: Entry, in all: [UInt32: Entry]) -> String {
        var parts: [String] = []
        var current: Entry? = entry
        while let e = current, e.parentId != rootParentId {
            parts.append(e.name)
            current = all[e.parentId]
        }
        return parts.reversed().joined(separator: "/")
    }

    private func byPath(_ frames: [Frame]) -> [String: Entry] {
        let list = entries(frames)
        let byId = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
        return Dictionary(uniqueKeysWithValues: list.map { (path(of: $0, in: byId), $0) })
    }

    func testRootEntryIsFirstAndCarriesFullPath() throws {
        let (_, frames) = try scan()
        guard case let .entry(id, parentId, kind, _, _, _, name) = frames.first else {
            return XCTFail("first frame is not an entry")
        }
        XCTAssertEqual(id, 0)
        XCTAssertEqual(parentId, rootParentId)
        XCTAssertEqual(kind, EntryKind.dir.rawValue)
        XCTAssertEqual(name, root.path)
    }

    func testFilesAndNestedDirectoriesAreReportedWithAllocatedSizes() throws {
        try write("a.bin", bytes: 10_000)
        try write("sub/deeper/c.txt", bytes: 5)

        let (result, frames) = try scan()
        let map = byPath(frames)

        XCTAssertEqual(map["a.bin"]?.kind, EntryKind.file.rawValue)
        let aSize = try XCTUnwrap(map["a.bin"]?.size)
        XCTAssertGreaterThanOrEqual(aSize, 10_000)
        XCTAssertEqual(aSize % 4096, 0)
        XCTAssertEqual(map["sub"]?.kind, EntryKind.dir.rawValue)
        XCTAssertEqual(map["sub/deeper"]?.kind, EntryKind.dir.rawValue)
        XCTAssertEqual(map["sub/deeper/c.txt"]?.kind, EntryKind.file.rawValue)
        XCTAssertGreaterThan(map["sub/deeper/c.txt"]?.mtime ?? 0, 1_600_000_000)
        XCTAssertEqual(result.entries, 5) // root, a.bin, sub, deeper, c.txt
        XCTAssertEqual(result.cancelled, false)
    }

    func testDoneFrameIsLastAndMatchesEntryCount() throws {
        try write("x/y/z.txt", bytes: 1)
        let (result, frames) = try scan()
        guard case let .done(count, errors, _) = frames.last else { return XCTFail("missing done frame") }
        XCTAssertEqual(count, UInt64(entries(frames).count))
        XCTAssertEqual(count, result.entries)
        XCTAssertEqual(errors, 0)
    }

    func testEveryParentIdRefersToAnEmittedDirectory() throws {
        for i in 0..<50 { try write("d\(i % 7)/e\(i % 3)/f\(i).txt", bytes: 10) }
        let (_, frames) = try scan()
        let list = entries(frames)
        let dirs = Set(list.filter { $0.kind == EntryKind.dir.rawValue }.map(\.id))
        for e in list where e.parentId != rootParentId {
            XCTAssertTrue(dirs.contains(e.parentId), "\(e.name) has unknown parent \(e.parentId)")
            XCTAssertGreaterThan(e.id, e.parentId, "child id must be greater than parent id")
        }
        XCTAssertEqual(Set(list.map(\.id)).count, list.count, "ids must be unique")
    }

    func testSymlinksAreNotFollowed() throws {
        try write("sub/file.txt", bytes: 1)
        try FileManager.default.createSymbolicLink(atPath: root.appendingPathComponent("sub/loop").path,
                                                   withDestinationPath: "..")
        let (_, frames) = try scan()
        let map = byPath(frames)
        XCTAssertEqual(map["sub/loop"]?.kind, EntryKind.symlink.rawValue)
        XCTAssertEqual(map["sub/loop"]?.size, 0)
        XCTAssertNil(map["sub/loop/sub"])
    }

    func testHardLinksAreCountedOnce() throws {
        try write("a.bin", bytes: 8192)
        try FileManager.default.linkItem(at: root.appendingPathComponent("a.bin"),
                                         to: root.appendingPathComponent("b.bin"))
        let (_, frames) = try scan()
        let map = byPath(frames)
        let pair = [try XCTUnwrap(map["a.bin"]), try XCTUnwrap(map["b.bin"])]
        XCTAssertEqual(pair.filter { $0.flags & EntryFlags.hardlinkDuplicate != 0 }.count, 1)
        XCTAssertEqual(pair.filter { $0.size > 0 }.count, 1)
    }

    func testUnreadableDirectoryProducesErrorFrame() throws {
        try write("locked/secret.txt", bytes: 1)
        chmod(root.appendingPathComponent("locked").path, 0o000)
        let (result, frames) = try scan()
        let map = byPath(frames)
        let locked = try XCTUnwrap(map["locked"])
        XCTAssertNil(map["locked/secret.txt"])
        XCTAssertEqual(result.errors, 1)
        XCTAssertTrue(frames.contains(.error(dirId: locked.id, errno: EACCES, path: root.path + "/locked")))
    }

    func testUnusualNamesRoundTrip() throws {
        try write("emoji😀.txt", bytes: 1)
        try write("new\nline.txt", bytes: 1)
        try write("café/naïve.txt", bytes: 1)
        let map = byPath(try scan().1)
        XCTAssertNotNil(map["emoji😀.txt"])
        XCTAssertNotNil(map["new\nline.txt"])
        XCTAssertNotNil(map["café/naïve.txt"])
    }

    func testExcludedPathsAreSkipped() throws {
        try write("keep/a.txt", bytes: 1)
        try write("skip/b.txt", bytes: 1)
        let options = ScanOptions(root: root.path, threads: 2, excludes: [root.path + "/skip"])
        let map = byPath(try scan(options).1)
        XCTAssertNotNil(map["keep/a.txt"])
        XCTAssertNil(map["skip"])
        XCTAssertNil(map["skip/b.txt"])
    }

    func testCancelledScanHasNoDoneFrame() throws {
        try write("a/b.txt", bytes: 1)
        let (result, frames) = try scan(cancelFirst: true)
        XCTAssertTrue(result.cancelled)
        XCTAssertFalse(frames.contains { if case .done = $0 { return true }; return false })
    }

    func testRootThatIsNotADirectoryThrows() throws {
        try write("file.txt", bytes: 1)
        let scanner = Scanner(options: ScanOptions(root: root.path + "/file.txt"), sink: MemorySink())
        XCTAssertThrowsError(try scanner.run())
    }

    func testTrailingSlashOnRootIsNormalised() throws {
        let (_, frames) = try scan(ScanOptions(root: root.path + "/", threads: 1, excludes: []))
        guard case let .entry(_, _, _, _, _, _, name) = frames.first else { return XCTFail() }
        XCTAssertEqual(name, root.path)
    }
}
