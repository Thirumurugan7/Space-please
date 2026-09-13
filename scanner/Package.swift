// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "sa-scan",
    platforms: [.macOS(.v15)],
    targets: [
        .target(name: "ScannerCore"),
        .executableTarget(name: "sa-scan", dependencies: ["ScannerCore"]),
        .testTarget(name: "ScannerCoreTests", dependencies: ["ScannerCore"]),
    ]
)
