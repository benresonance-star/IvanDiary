// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ApplePlatformServices",
    platforms: [.iOS(.v15), .macOS(.v14)],
    products: [
        .library(
            name: "AppleDrawingKit",
            targets: ["AppleDrawingKit"]
        ),
        .library(
            name: "AppleAudioServices",
            targets: ["AppleAudioServices"]
        )
    ],
    targets: [
        .target(name: "AppleDrawingKit"),
        .target(name: "AppleAudioServices"),
        .testTarget(
            name: "AppleAudioServicesTests",
            dependencies: ["AppleAudioServices"]
        ),
        .testTarget(
            name: "AppleDrawingKitTests",
            dependencies: ["AppleDrawingKit"]
        )
    ]
)
