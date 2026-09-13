import Darwin
import Dispatch
import ScannerCore

func writeStderr(_ s: String) {
    let bytes = Array(s.utf8)
    _ = bytes.withUnsafeBytes { Darwin.write(STDERR_FILENO, $0.baseAddress, $0.count) }
}

func usage() -> Never {
    writeStderr("usage: sa-scan --root <path> [--threads N] [--exclude <path>]... [--no-default-excludes]\n")
    exit(2)
}

func value(_ args: inout ArraySlice<String>) -> String {
    guard let v = args.popFirst() else { usage() }
    return v
}

var root: String?
var threads = ScanOptions(root: "/").threads
var excludes = ScanOptions.defaultExcludes
var args = CommandLine.arguments.dropFirst()

while let arg = args.popFirst() {
    switch arg {
    case "--root":
        root = value(&args)
    case "--threads":
        guard let n = Int(value(&args)), n > 0 else { usage() }
        threads = n
    case "--exclude":
        excludes.insert(value(&args))
    case "--no-default-excludes":
        excludes.subtract(ScanOptions.defaultExcludes)
    default:
        usage()
    }
}

guard let root else { usage() }

let scanner = Scanner(options: ScanOptions(root: root, threads: threads, excludes: excludes),
                      sink: FileDescriptorSink(fd: STDOUT_FILENO))

signal(SIGTERM, SIG_IGN)
let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
termSource.setEventHandler { scanner.cancel() }
termSource.resume()

do {
    let result = try scanner.run()
    exit(result.cancelled ? 143 : 0)
} catch {
    writeStderr("sa-scan: cannot scan \(root): \(error)\n")
    exit(3)
}
