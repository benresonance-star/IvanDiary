// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ApplePlatformServices",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "AppleDrawingKit",
            targets: ["AppleDrawingKit"]
        )
    ],
    targets: [
        .target(name: "AppleDrawingKit")
    ]
)
