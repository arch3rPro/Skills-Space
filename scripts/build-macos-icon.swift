// macOS-only packaging: retain the source mark and apply a consistent transparent safe area.
// Run from the repository root: swift scripts/build-macos-icon.swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("src-tauri/icons/icon.png")
guard let image = NSImage(contentsOf: source) else { fatalError("Cannot read the source icon") }
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".iconset")
try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: temporary) }

for (name, size) in [("icon_16x16",16),("icon_16x16@2x",32),("icon_32x32",32),("icon_32x32@2x",64),("icon_128x128",128),("icon_128x128@2x",256),("icon_256x256",256),("icon_256x256@2x",512),("icon_512x512",512),("icon_512x512@2x",1024)] {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Cannot create icon canvas") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    let edge = CGFloat(size)
    let tile = NSRect(x: edge * 0.09, y: edge * 0.09, width: edge * 0.82, height: edge * 0.82)
    NSBezierPath(roundedRect: tile, xRadius: tile.width * 0.22, yRadius: tile.height * 0.22).addClip()
    image.draw(in: tile, from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("Cannot encode icon") }
    try data.write(to: temporary.appendingPathComponent(name + ".png"))
    if size == 1024 { try data.write(to: root.appendingPathComponent("src-tauri/icons/macos-icon.png")) }
}
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", temporary.path, "-o", root.appendingPathComponent("src-tauri/icons/icon.icns").path]
try process.run()
process.waitUntilExit()
if process.terminationStatus != 0 { fatalError("iconutil failed") }
print("Updated macOS PNG and ICNS; the source mark and other platform icons are unchanged.")
