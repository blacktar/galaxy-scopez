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
              let action = request["action"] as? String, action == "status" || NativeResolveControl.paths[action] != nil else { return }
        let semaphore = DispatchSemaphore(value: 0), deadline = Date().addingTimeInterval(2.5)
        var response: [String: Any] = ["ok": false, "error": "Native command timed out. Check Resolve; no command was retried."]
        DispatchQueue.main.async {
            defer { semaphore.signal() }
            do {
                if action == "status" { response = ["ok": true, "trusted": NativeResolveControl.trusted(), "transport": "native-ax", "bundleID": Bundle.main.bundleIdentifier ?? "", "appPath": Bundle.main.bundlePath] }
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
