import GameController
import AppKit
import ApplicationServices
import Darwin

enum ResolveControlError: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

enum NativeFullscreenFeedback {
    static func confirmed(before: Bool?, samples: [Bool?]) -> Bool? {
        guard let before = before else { return nil }
        return samples.compactMap { $0 }.first { $0 != before }
    }
}

// This exact dispatcher is compiled into both the development and release app.
// Only explicit authenticated GPrime button requests invoke a Resolve action.
struct ResolveWindowDescription {
    let title: String
    let standard: Bool
    var auxiliary: Bool {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return ["scopes", "video scopes", "clean feed", "cleanfeed", "video clean feed", "cinema viewer", "viewer"].contains(name)
            || name == "scopes - davinci resolve" || name.hasSuffix(" - scopes") || name.hasSuffix(" - clean feed") || name.hasPrefix("video clean feed ")
    }
}
enum ResolveWindowSelection {
    static func main(_ windows: [ResolveWindowDescription], preferred: Int?) -> Int? {
        let candidates = windows.indices.filter { windows[$0].standard && !windows[$0].auxiliary && !windows[$0].title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if let preferred = preferred, candidates.contains(preferred) { return preferred }
        let named = candidates.filter { windows[$0].title.localizedCaseInsensitiveContains("DaVinci Resolve") }
        if named.count == 1 { return named[0] }
        return candidates.count == 1 ? candidates[0] : nil
    }
}

final class NativeResolveControl {
    static let paths: [String: [String]] = [
        "undo": ["Edit", "Undo"],
        "previous": ["Playback", "Previous", "Clip"],
        "next": ["Playback", "Next", "Clip"],
        "apply-one": ["Color", "Apply Grade From One Clip Prior"],
        "apply-two": ["Color", "Apply Grade From Two Clips Prior"],
        "fullscreen": ["Workspace", "Viewer Mode", "Cinema Viewer"]
    ]
    static let resolveID = "com.blackmagic-design.DaVinciResolve"
    static func trusted(prompt: Bool = false) -> Bool {
        if prompt { return AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) }
        return AXIsProcessTrusted()
    }
    static func attribute(_ element: AXUIElement, _ name: String) throws -> CFTypeRef {
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, name as CFString, &value)
        guard error == .success, let value = value else {
            throw ResolveControlError.message("Resolve menu read failed (AX \(error.rawValue)). No command was retried.")
        }
        return value
    }
    static func children(_ element: AXUIElement) throws -> [AXUIElement] {
        return try attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
    }
    static func menuChildren(_ element: AXUIElement) throws -> [AXUIElement] {
        let direct = try children(element)
        var result: [AXUIElement] = []
        for child in direct {
            let role = (try? attribute(child, kAXRoleAttribute)) as? String
            if role == kAXMenuRole { result += try children(child) } else { result.append(child) }
        }
        return result
    }
    static func menuElement(_ application: AXUIElement, path: [String], deadline: Date) throws -> AXUIElement {
        let raw = try attribute(application, kAXMenuBarAttribute)
        guard CFGetTypeID(raw) == AXUIElementGetTypeID() else { throw ResolveControlError.message("Resolve menu bar is unavailable.") }
        var element = raw as! AXUIElement
        for title in path {
            guard Date() < deadline else { throw ResolveControlError.message("Resolve command expired before execution. Nothing was retried.") }
            let matches = try menuChildren(element).filter { child in
                guard let name = (try? attribute(child, kAXTitleAttribute)) as? String else { return false }
                return name.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(title) == .orderedSame
            }
            guard matches.count == 1 else { throw ResolveControlError.message("Resolve menu ‘\(title)’ is unavailable or ambiguous. No command was sent.") }
            element = matches[0]
        }
        return element
    }
    static func fullscreenMark(_ element: AXUIElement) -> Bool? {
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, kAXMenuItemMarkCharAttribute as CFString, &value)
        if error == .success { return !((value as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        // Resolve omits the checkmark attribute for the unchecked Cinema Viewer item.
        if error == .noValue || error == .attributeUnsupported { return false }
        return nil
    }
    static func windowStatus() -> [[String: Any]] {
        guard trusted(), let app = NSRunningApplication.runningApplications(withBundleIdentifier: resolveID).first else { return [] }
        let application = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(application, 0.2)
        let focused = try? attribute(application, kAXFocusedWindowAttribute)
        let main = try? attribute(application, kAXMainWindowAttribute)
        let windows = (try? attribute(application, kAXWindowsAttribute)) as? [AXUIElement] ?? []
        return windows.map { element in ["title": (try? attribute(element, kAXTitleAttribute)) as? String ?? "", "subrole": (try? attribute(element, kAXSubroleAttribute)) as? String ?? "", "focused": focused.map { CFEqual($0, element) } ?? false, "main": main.map { CFEqual($0, element) } ?? false] }
    }
    static func mainWindowForCommand(_ application: AXUIElement, deadline: Date) throws -> String? {
        let windows = (try? attribute(application, kAXWindowsAttribute)) as? [AXUIElement] ?? []
        let descriptions = windows.map { element in
            ResolveWindowDescription(title: (try? attribute(element, kAXTitleAttribute)) as? String ?? "",
                standard: ((try? attribute(element, kAXSubroleAttribute)) as? String) == kAXStandardWindowSubrole)
        }
        guard !windows.isEmpty else { return nil }
        let mainRaw = try? attribute(application, kAXMainWindowAttribute)
        let preferred = mainRaw.flatMap { main in windows.firstIndex { CFEqual($0, main) } }
        guard let index = ResolveWindowSelection.main(descriptions, preferred: preferred) else {
            let focusedRaw = try? attribute(application, kAXFocusedWindowAttribute)
            let focusedIndex = focusedRaw.flatMap { value in windows.firstIndex { CFEqual($0, value) } }
            // Preserve the existing menu path unless an identified auxiliary window needs retargeting.
            if focusedIndex == nil || !descriptions[focusedIndex!].auxiliary { return nil }
            throw ResolveControlError.message("Could not identify Resolve’s main window. Click its Color-page window once, then try again. No command was sent.")
        }
        let target = windows[index]
        if let focused = try? attribute(application, kAXFocusedWindowAttribute), CFEqual(focused, target) { return nil }
        guard Date().addingTimeInterval(0.15) < deadline else { throw ResolveControlError.message("Resolve window targeting expired. No command was sent.") }
        let result = AXUIElementPerformAction(target, kAXRaiseAction as CFString)
        guard result == .success else { throw ResolveControlError.message("Could not focus Resolve’s main window (AX \(result.rawValue)). No command was sent.") }
        _ = AXUIElementSetAttributeValue(target, kAXMainAttribute as CFString, kCFBooleanTrue)
        _ = AXUIElementSetAttributeValue(application, kAXFocusedWindowAttribute as CFString, target)
        for _ in 0..<6 {
            if let focused = try? attribute(application, kAXFocusedWindowAttribute), CFEqual(focused, target) { return descriptions[index].title }
            guard Date().addingTimeInterval(0.02) < deadline else { break }
            Thread.sleep(forTimeInterval: 0.02)
        }
        throw ResolveControlError.message("Resolve’s main window did not take focus. Click its Color-page window once, then try again. No command was sent.")
    }
    static func perform(_ action: String, deadline: Date) throws -> [String: Any] {
        guard let path = paths[action] else { throw ResolveControlError.message("Unsupported Resolve command.") }
        guard trusted(prompt: true) else {
            throw ResolveControlError.message("Allow Galaxy Scopez in Privacy & Security → Device Control and Data Access (Accessibility on older macOS), then tap again.")
        }
        guard let app = NSWorkspace.shared.frontmostApplication, app.bundleIdentifier == resolveID else {
            throw ResolveControlError.message("Make sure Resolve is active and has focus (click in the Resolve interface on your Mac to make sure).")
        }
        let application = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(application, 0.35)
        let focusedMainWindow = try mainWindowForCommand(application, deadline: deadline)
        let element = try menuElement(application, path: path, deadline: deadline)
        guard (try attribute(element, kAXEnabledAttribute) as? Bool) == true else {
            throw ResolveControlError.message("This Resolve command is disabled in the current context.")
        }
        guard Date() < deadline, NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {
            throw ResolveControlError.message("Resolve focus changed or the command expired. No command was sent.")
        }
        let before = action == "fullscreen" ? fullscreenMark(element) : nil
        let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
        guard result == .success else {
            throw ResolveControlError.message("Resolve command returned AX \(result.rawValue). Check Resolve before tapping again; it was not retried.")
        }
        var response: [String: Any] = ["operation": action, "transport": "native-ax", "resolvePID": app.processIdentifier]
        if let focusedMainWindow = focusedMainWindow { response["focusedMainWindow"] = focusedMainWindow }
        if action == "fullscreen" {
            response["fullscreenBefore"] = before as Any? ?? NSNull()
            var samples: [Bool?] = []
            var trace: [[String: Any]] = []
            let start = Date()
            for _ in 0..<12 {
                guard Date().addingTimeInterval(0.04) < deadline else { break }
                Thread.sleep(forTimeInterval: 0.04)
                let fresh = try? menuElement(application, path: path, deadline: deadline)
                let state = fresh.flatMap { fullscreenMark($0) }
                samples.append(state)
                trace.append(["ms": Int(Date().timeIntervalSince(start) * 1000), "marked": state as Any? ?? NSNull()])
                if let confirmed = NativeFullscreenFeedback.confirmed(before: before, samples: samples) {
                    response["fullscreen"] = confirmed
                    break
                }
            }
            response["fullscreenReadback"] = trace
            if response["fullscreen"] == nil { response["fullscreenPending"] = true }
        }
        return response
    }
}

final class NativeResolveServer {
    let directory = URL(fileURLWithPath: "/tmp/galaxy-scopez-control-\(getuid())", isDirectory: true)
    let token = UUID().uuidString
    var socketPath = ""
    var listener: Int32 = -1
    let queue = DispatchQueue(label: "GalaxyScopez.NativeResolveServer")
    var endpoint: URL { directory.appendingPathComponent("endpoint.json") }

    func start() throws {
        let manager = FileManager.default
        try manager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let attributes = try manager.attributesOfItem(atPath: directory.path)
        guard (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              ((attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0) & 0o077 == 0 else {
            throw ResolveControlError.message("Native control directory must be owned by this user and private.")
        }
        if let data = try? Data(contentsOf: endpoint), let old = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let pid = old["pid"] as? Int32, kill(pid, 0) == 0 {
            throw ResolveControlError.message("Another Galaxy Scopez native command handler is running.")
        }
        socketPath = directory.appendingPathComponent(UUID().uuidString + ".sock").path
        listener = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard listener >= 0 else { throw ResolveControlError.message("Could not create native control socket.") }
        var address = sockaddr_un(); address.sun_family = sa_family_t(AF_UNIX); address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        guard socketPath.utf8.count < MemoryLayout.size(ofValue: address.sun_path) else { stop(); throw ResolveControlError.message("Native control path is too long.") }
        let pathCapacity = MemoryLayout.size(ofValue: address.sun_path)
        socketPath.withCString { source in
            withUnsafeMutablePointer(to: &address.sun_path) { pointer in
                pointer.withMemoryRebound(to: CChar.self, capacity: pathCapacity) { destination in _ = strcpy(destination, source) }
            }
        }
        let bound = withUnsafePointer(to: &address) { pointer in pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
        guard bound == 0, chmod(socketPath, 0o600) == 0, Darwin.listen(listener, 4) == 0 else { stop(); throw ResolveControlError.message("Could not bind native control socket.") }
        let description: [String: Any] = ["schema": 1, "pid": getpid(), "socket": socketPath, "token": token, "bundleID": Bundle.main.bundleIdentifier ?? "", "transport": "native-ax"]
        try JSONSerialization.data(withJSONObject: description).write(to: endpoint, options: .atomic)
        try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: endpoint.path)
        queue.async { [self] in
            while listener >= 0 {
                let client = Darwin.accept(listener, nil, nil)
                if client < 0 { break }
                handle(client); Darwin.close(client)
            }
        }
    }
    func stop() {
        if listener >= 0 { let fd = listener; listener = -1; Darwin.shutdown(fd, SHUT_RDWR); Darwin.close(fd) }
        if !socketPath.isEmpty { unlink(socketPath) }
        if let data = try? Data(contentsOf: endpoint), let current = try? JSONSerialization.jsonObject(with: data) as? [String: Any], current["token"] as? String == token {
            try? FileManager.default.removeItem(at: endpoint)
        }
    }
    func handle(_ client: Int32) {
        var owner: uid_t = 0, group: gid_t = 0
        guard getpeereid(client, &owner, &group) == 0, owner == getuid() else { return }
        var timeout = timeval(tv_sec: 3, tv_usec: 0)
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        var noSignal: Int32 = 1; setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
        var input = Data(), buffer = [UInt8](repeating: 0, count: 1024)
        while input.count <= 4096 {
            let count = Darwin.recv(client, &buffer, buffer.count, 0)
            if count <= 0 { return }
            input.append(contentsOf: buffer.prefix(count))
            if input.contains(10) { break }
        }
        guard input.count <= 4096, let request = try? JSONSerialization.jsonObject(with: input) as? [String: Any], request["token"] as? String == token,
              let action = request["action"] as? String, action == "status" || action == "gamepads" || NativeResolveControl.paths[action] != nil else { return }
        let semaphore = DispatchSemaphore(value: 0), deadline = Date().addingTimeInterval(2.5)
        var response: [String: Any] = ["ok": false, "error": "Native command timed out. Check Resolve; no command was retried."]
        DispatchQueue.main.async {
            defer { semaphore.signal() }
            do {
                if action == "gamepads" { response = ["ok": true, "controllers": NativeGamepads.shared.snapshot(), "host": Host.current().localizedName ?? "Resolve Mac"] }
                else if action == "status" { response = ["ok": true, "trusted": NativeResolveControl.trusted(), "transport": "native-ax", "bundleID": Bundle.main.bundleIdentifier ?? "", "appPath": Bundle.main.bundlePath, "nativeControlRevision": 3, "resolveWindows": NativeResolveControl.windowStatus()] }
                else { response = ["ok": true, "result": try NativeResolveControl.perform(action, deadline: deadline)] }
            } catch { response = ["ok": false, "error": error.localizedDescription] }
        }
        let completed = semaphore.wait(timeout: .now() + 3.5) == .success
        let output = completed ? response : ["ok": false, "error": "Native command timed out. Check Resolve before tapping again; no command was retried."]
        if var data = try? JSONSerialization.data(withJSONObject: output) {
            data.append(10)
            data.withUnsafeBytes { bytes in
                var sent = 0
                while sent < bytes.count { let count = Darwin.send(client, bytes.baseAddress!.advanced(by: sent), bytes.count - sent, 0); if count <= 0 { break }; sent += count }
            }
        }
    }
}

// Normalised browser-standard positions, read without activating GS or Resolve.
// The main run loop owns controller discovery and snapshots.
final class NativeGamepads {
    static let shared = NativeGamepads()
    private var identities: [ObjectIdentifier: String] = [:]
    func start() {
        if #available(macOS 11.3, *) { GCController.shouldMonitorBackgroundEvents = true }
        GCController.startWirelessControllerDiscovery(completionHandler: nil)
    }
    func snapshot() -> [[String: Any]] {
        let controllers = Array(GCController.controllers().filter { $0.extendedGamepad != nil }.prefix(8))
        let live = Set(controllers.map { ObjectIdentifier($0) })
        identities = identities.filter { live.contains($0.key) }
        return controllers.enumerated().compactMap { index, controller in
            guard let pad = controller.extendedGamepad else { return nil }
            let key = ObjectIdentifier(controller)
            if identities[key] == nil { identities[key] = UUID().uuidString }
            var buttons: [Float] = [pad.buttonA.value, pad.buttonB.value, pad.buttonX.value, pad.buttonY.value,
                pad.leftShoulder.value, pad.rightShoulder.value, pad.leftTrigger.value, pad.rightTrigger.value,
                pad.buttonOptions?.value ?? 0, pad.buttonMenu.value,
                pad.leftThumbstickButton?.value ?? 0, pad.rightThumbstickButton?.value ?? 0,
                pad.dpad.up.value, pad.dpad.down.value, pad.dpad.left.value, pad.dpad.right.value]
            if #available(macOS 11.0, *) { buttons.append(pad.buttonHome?.value ?? 0) }
            return ["device": identities[key]!, "id": controller.vendorName ?? "Game controller", "mapping": "standard", "index": index,
                "axes": [pad.leftThumbstick.xAxis.value, -pad.leftThumbstick.yAxis.value, pad.rightThumbstick.xAxis.value, -pad.rightThumbstick.yAxis.value],
                "buttons": buttons, "connected": true]
        }
    }
}
