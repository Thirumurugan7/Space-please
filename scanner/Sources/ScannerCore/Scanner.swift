import Darwin
import Foundation
import Synchronization

public protocol FrameSink: Sendable {
    func write(_ bytes: [UInt8])
}

/// Writes frames to a file descriptor (stdout in the CLI). Serialises writers.
public final class FileDescriptorSink: FrameSink {
    private let fd: Int32
    private let lock = Mutex(())

    public init(fd: Int32) { self.fd = fd }

    public func write(_ bytes: [UInt8]) {
        lock.withLock { _ in
            bytes.withUnsafeBytes { buf in
                var offset = 0
                while offset < buf.count {
                    let n = Darwin.write(fd, buf.baseAddress! + offset, buf.count - offset)
                    if n < 0 {
                        if errno == EINTR { continue }
                        exit(1)
                    }
                    offset += n
                }
            }
        }
    }
}

/// Collects frames in memory. Used by tests.
public final class MemorySink: FrameSink {
    private let storage = Mutex<[UInt8]>([])

    public init() {}

    public func write(_ bytes: [UInt8]) {
        storage.withLock { $0.append(contentsOf: bytes) }
    }

    public var bytes: [UInt8] { storage.withLock { $0 } }
}

public struct ScanOptions: Sendable {
    public var root: String
    public var threads: Int
    public var excludes: Set<String>
    public var progressIntervalMs: Int

    public static let defaultExcludes: Set<String> = ["/System", "/private/var/vm", "/Volumes", "/dev", "/cores"]

    public init(root: String, threads: Int = ProcessInfo.processInfo.activeProcessorCount,
                excludes: Set<String> = ScanOptions.defaultExcludes, progressIntervalMs: Int = 100) {
        self.root = root
        self.threads = max(1, threads)
        self.excludes = excludes
        self.progressIntervalMs = progressIntervalMs
    }
}

public struct ScanResult: Sendable, Equatable {
    public var entries: UInt64
    public var errors: UInt32
    public var cancelled: Bool
}

public enum ScanStartError: Error, Equatable {
    case rootNotDirectory(errno: Int32)
}

private struct Job {
    let id: UInt32
    let path: String
}

public final class Scanner: @unchecked Sendable {
    private let options: ScanOptions
    private let sink: FrameSink

    private let cancelled = Atomic<Bool>(false)
    private let nextId = Atomic<UInt32>(1)
    private let entryCount = Atomic<UInt64>(0)
    private let byteCount = Atomic<UInt64>(0)
    private let errorCount = Atomic<UInt32>(0)

    // Work queue guarded by `cond`.
    private let cond = NSCondition()
    private var stack: [Job] = []
    private var active = 0

    private let seen = Mutex<(dirs: Set<UInt64>, hardlinks: Set<UInt64>)>(([], []))
    private let currentPath = Mutex<String>("")

    private static let bufferSize = 256 * 1024
    private static let flushThreshold = 64 * 1024

    public init(options: ScanOptions, sink: FrameSink) {
        self.options = options
        self.sink = sink
    }

    public func cancel() {
        cancelled.store(true, ordering: .relaxed)
        cond.lock()
        cond.broadcast()
        cond.unlock()
    }

    public func run() throws -> ScanResult {
        let start = ContinuousClock.now
        let root = Scanner.normalise(options.root)

        var st = stat()
        guard lstat(root, &st) == 0, (st.st_mode & S_IFMT) == S_IFDIR else {
            throw ScanStartError.rootNotDirectory(errno: errno)
        }

        var enc = FrameEncoder()
        enc.entry(id: 0, parentId: rootParentId, kind: .dir, flags: 0, size: 0,
                  mtime: Int64(st.st_mtimespec.tv_sec), name: Array(root.utf8))
        sink.write(enc.bytes)
        entryCount.store(1, ordering: .relaxed)
        seen.withLock { _ = $0.dirs.insert(UInt64(st.st_ino)) }
        stack = [Job(id: 0, path: root)]

        let progressDone = DispatchSemaphore(value: 0)
        let progressFinished = DispatchSemaphore(value: 0)
        let progressThread = Thread { [self] in
            while progressDone.wait(timeout: .now() + .milliseconds(options.progressIntervalMs)) == .timedOut {
                emitProgress()
            }
            progressFinished.signal()
        }
        progressThread.start()

        DispatchQueue.concurrentPerform(iterations: options.threads) { _ in worker() }

        progressDone.signal()
        progressFinished.wait()
        emitProgress()

        let result = ScanResult(entries: entryCount.load(ordering: .relaxed),
                                errors: errorCount.load(ordering: .relaxed),
                                cancelled: cancelled.load(ordering: .relaxed))
        if !result.cancelled {
            let elapsed = ContinuousClock.now - start
            let ms = UInt64(elapsed.components.seconds) * 1000 + UInt64(elapsed.components.attoseconds / 1_000_000_000_000_000)
            var done = FrameEncoder()
            done.done(entries: result.entries, errors: result.errors, elapsedMs: ms)
            sink.write(done.bytes)
        }
        return result
    }

    static func normalise(_ path: String) -> String {
        var p = path
        while p.count > 1 && p.hasSuffix("/") { p.removeLast() }
        return p
    }

    private func emitProgress() {
        var enc = FrameEncoder()
        enc.progress(entries: entryCount.load(ordering: .relaxed), bytes: byteCount.load(ordering: .relaxed),
                     path: currentPath.withLock { $0 })
        sink.write(enc.bytes)
    }

    private func worker() {
        var enc = FrameEncoder()
        let buffer = UnsafeMutableRawPointer.allocate(byteCount: Scanner.bufferSize, alignment: 16)
        defer { buffer.deallocate() }

        while let job = nextJob() {
            let children = scanDirectory(job, buffer: buffer, encoder: &enc)
            if enc.count >= Scanner.flushThreshold {
                sink.write(enc.bytes)
                enc.reset()
            }
            finishJob(children)
        }
        if enc.count > 0 { sink.write(enc.bytes) }
    }

    private func nextJob() -> Job? {
        cond.lock()
        defer { cond.unlock() }
        while stack.isEmpty && active > 0 && !cancelled.load(ordering: .relaxed) {
            cond.wait()
        }
        if cancelled.load(ordering: .relaxed) || stack.isEmpty {
            cond.broadcast()
            return nil
        }
        active += 1
        return stack.removeLast()
    }

    private func finishJob(_ children: [Job]) {
        cond.lock()
        stack.append(contentsOf: children)
        active -= 1
        cond.broadcast()
        cond.unlock()
    }

    private func recordError(dirId: UInt32, errno code: Int32, path: String, encoder: inout FrameEncoder) {
        errorCount.add(1, ordering: .relaxed)
        encoder.error(dirId: dirId, errno: code, path: path)
    }

    private func scanDirectory(_ job: Job, buffer: UnsafeMutableRawPointer, encoder enc: inout FrameEncoder) -> [Job] {
        currentPath.withLock { $0 = job.path }

        let fd = open(job.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        if fd < 0 {
            recordError(dirId: job.id, errno: errno, path: job.path, encoder: &enc)
            return []
        }
        defer { close(fd) }

        var attrs = Scanner.requestedAttributes
        var children: [Job] = []
        let prefix = job.path == "/" ? "/" : job.path + "/"

        while !cancelled.load(ordering: .relaxed) {
            let count = getattrlistbulk(fd, &attrs, buffer, Scanner.bufferSize, 0)
            if count == 0 { break }
            if count < 0 {
                recordError(dirId: job.id, errno: errno, path: job.path, encoder: &enc)
                break
            }

            var record = buffer
            for _ in 0..<count {
                let recordLength = Int(record.loadUnaligned(as: UInt32.self))
                defer { record += recordLength }
                guard let parsed = Scanner.parse(record: record) else { continue }

                let nameBytes = UnsafeRawBufferPointer(start: parsed.name, count: parsed.nameLength)
                let childPath = prefix + String(decoding: nameBytes, as: UTF8.self)

                if parsed.error != 0 {
                    recordError(dirId: job.id, errno: Int32(parsed.error), path: childPath, encoder: &enc)
                    continue
                }
                if options.excludes.contains(childPath) { continue }

                var kind: EntryKind
                var size: UInt64 = 0
                var flags: UInt8 = 0

                switch parsed.objType {
                case fsobj_type_t(VDIR.rawValue):
                    if parsed.mountStatus & UInt32(DIR_MNTSTATUS_MNTPOINT) != 0 { continue }
                    // De-duplicate directories by file id so firmlinked paths are not descended twice (st_dev is identical across / and /System/Volumes/Data).
                    let firstVisit = seen.withLock { $0.dirs.insert(parsed.fileId).inserted }
                    if !firstVisit { continue }
                    kind = .dir
                case fsobj_type_t(VREG.rawValue):
                    kind = .file
                    size = parsed.allocSize
                    if parsed.linkCount > 1 {
                        let firstLink = seen.withLock { $0.hardlinks.insert(parsed.fileId).inserted }
                        if !firstLink {
                            flags |= EntryFlags.hardlinkDuplicate
                            size = 0
                        }
                    }
                case fsobj_type_t(VLNK.rawValue):
                    kind = .symlink
                default:
                    kind = .other
                }

                let id = nextId.add(1, ordering: .relaxed).oldValue
                entryCount.add(1, ordering: .relaxed)
                byteCount.add(size, ordering: .relaxed)
                enc.entry(id: id, parentId: job.id, kind: kind, flags: flags, size: size,
                          mtime: parsed.mtime, name: nameBytes)
                if kind == .dir {
                    children.append(Job(id: id, path: childPath))
                }
            }
        }
        return children
    }

    private static let requestedAttributes: attrlist = {
        var a = attrlist()
        a.bitmapcount = u_short(ATTR_BIT_MAP_COUNT)
        a.commonattr = attrgroup_t(truncatingIfNeeded: ATTR_CMN_RETURNED_ATTRS)
            | attrgroup_t(truncatingIfNeeded: ATTR_CMN_ERROR)
            | attrgroup_t(truncatingIfNeeded: ATTR_CMN_NAME)
            | attrgroup_t(truncatingIfNeeded: ATTR_CMN_OBJTYPE)
            | attrgroup_t(truncatingIfNeeded: ATTR_CMN_MODTIME)
            | attrgroup_t(truncatingIfNeeded: ATTR_CMN_FILEID)
        a.dirattr = attrgroup_t(truncatingIfNeeded: ATTR_DIR_MOUNTSTATUS)
        a.fileattr = attrgroup_t(truncatingIfNeeded: ATTR_FILE_LINKCOUNT)
            | attrgroup_t(truncatingIfNeeded: ATTR_FILE_ALLOCSIZE)
        return a
    }()

    struct ParsedRecord {
        var error: UInt32 = 0
        var name: UnsafeRawPointer
        var nameLength: Int
        var objType: fsobj_type_t = 0
        var mtime: Int64 = 0
        var fileId: UInt64 = 0
        var mountStatus: UInt32 = 0
        var linkCount: UInt32 = 0
        var allocSize: UInt64 = 0
    }

    /// Parses one getattrlistbulk record. Attribute order follows getattrlistbulk(2):
    /// returned-attrs, error, then remaining common attrs in bit order, then dir attrs, then file attrs.
    static func parse(record: UnsafeMutableRawPointer) -> ParsedRecord? {
        var p = UnsafeRawPointer(record) + 4
        let returned = p.loadUnaligned(as: attribute_set_t.self)
        p += MemoryLayout<attribute_set_t>.size

        func has(_ group: attrgroup_t, _ bit: some BinaryInteger) -> Bool {
            group & attrgroup_t(truncatingIfNeeded: bit) != 0
        }

        var error: UInt32 = 0
        if has(returned.commonattr, ATTR_CMN_ERROR) {
            error = p.loadUnaligned(as: UInt32.self)
            p += 4
        }
        guard has(returned.commonattr, ATTR_CMN_NAME) else { return nil }
        let nameOffset = Int(p.loadUnaligned(as: Int32.self))
        let nameLength = Int(p.loadUnaligned(fromByteOffset: 4, as: UInt32.self))
        var out = ParsedRecord(error: error, name: p + nameOffset, nameLength: max(0, nameLength - 1))
        p += MemoryLayout<attrreference_t>.size

        if has(returned.commonattr, ATTR_CMN_OBJTYPE) {
            out.objType = p.loadUnaligned(as: fsobj_type_t.self)
            p += MemoryLayout<fsobj_type_t>.size
        }
        if has(returned.commonattr, ATTR_CMN_MODTIME) {
            out.mtime = Int64(p.loadUnaligned(as: timespec.self).tv_sec)
            p += MemoryLayout<timespec>.size
        }
        if has(returned.commonattr, ATTR_CMN_FILEID) {
            out.fileId = p.loadUnaligned(as: UInt64.self)
            p += 8
        }
        if has(returned.dirattr, ATTR_DIR_MOUNTSTATUS) {
            out.mountStatus = p.loadUnaligned(as: UInt32.self)
            p += 4
        }
        if has(returned.fileattr, ATTR_FILE_LINKCOUNT) {
            out.linkCount = p.loadUnaligned(as: UInt32.self)
            p += 4
        }
        if has(returned.fileattr, ATTR_FILE_ALLOCSIZE) {
            out.allocSize = UInt64(max(0, p.loadUnaligned(as: off_t.self)))
            p += 8
        }
        return out
    }
}
