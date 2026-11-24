import AppKit
import Darwin

final class HostApp: NSObject, NSApplicationDelegate {
    var item: NSStatusItem!
    var child: Process?
    var log: FileHandle?
    var nativeControls: NativeResolveServer?
    var stopping = false
    var termination: DispatchSourceSignal?
    let status = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
    func applicationDidFinishLaunching(_ notification: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "GS"
        item.button?.toolTip = "Galaxy Scopez"
        let menu = NSMenu()
        menu.addItem(status)
        for (title, selector) in [("Open Viewer", #selector(viewer)), ("Enable Resolve controls…", #selector(enableResolveControls)), ("Open User Guide", #selector(guide)), ("Start Server", #selector(start)), ("Stop Server", #selector(stop)), ("Show Log", #selector(showLog)), ("Quit Galaxy Scopez", #selector(quit))] {
            let entry = NSMenuItem(title: title, action: selector, keyEquivalent: "")
            entry.target = self
            menu.addItem(entry)
        }
        item.menu = menu
        signal(SIGTERM, SIG_IGN)
        termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        termination?.setEventHandler { [weak self] in self?.quit() }
        termination?.resume()
        do {
            let controls = NativeResolveServer()
            try controls.start()
            nativeControls = controls
        } catch { status.title = error.localizedDescription }
        if nativeControls != nil { start() }
        // The logged-in app owns the permission request, never the root installer.
        // Ask once after installation; development launches do not show onboarding.
        if developmentHost == nil && !UserDefaults.standard.bool(forKey: "resolveControlSetupShownV1") {
            UserDefaults.standard.set(true, forKey: "resolveControlSetupShownV1")
            if !NativeResolveControl.trusted() {
                DispatchQueue.main.async { [weak self] in self?.explainResolveControls() }
            }
        }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        item.button?.performClick(nil)
        return false
    }
    var developmentHost: URL? {
        let args = CommandLine.arguments
        guard let index = args.firstIndex(of: "--development-host"), args.count > index + 1 else { return nil }
        return URL(fileURLWithPath: args[index + 1], isDirectory: true)
    }
    var logURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Galaxy Scopez/host.log")
    }
    @objc func start() {
        guard child == nil else { return }
        stopping = false
        let resources = Bundle.main.resourceURL!
        let host = developmentHost ?? resources.appendingPathComponent("host")
        do {
            try FileManager.default.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if !FileManager.default.fileExists(atPath: logURL.path) {
                FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
            }
            log = try FileHandle(forWritingTo: logURL)
            log?.seekToEndOfFile()
            let process = Process()
            process.executableURL = resources.appendingPathComponent("runtime/node")
            process.arguments = [host.appendingPathComponent("scripts/grading-session.mjs").path, "serve"]
            process.currentDirectoryURL = host
            var environment = ProcessInfo.processInfo.environment
            environment["HOST"] = "0.0.0.0"
            environment["PORT"] = "8765"
            environment["SCOPE_DIAGNOSTICS"] = "0"
            environment["GS_GRADING_AUDITION"] = "1"
            environment["GS_NATIVE_ANALYSIS_ADDON"] = resources.appendingPathComponent("host/build/scope-analysis.node").path
            let state = developmentHost != nil ? host.appendingPathComponent("docs/reverse-scopes") : FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Galaxy Scopez/Grading")
            environment["GS_STATE_DIR"] = state.path
            let python = resources.appendingPathComponent("runtime/python3")
            if FileManager.default.isExecutableFile(atPath: python.path) { environment["GS_PYTHON"] = python.path }
            environment.removeValue(forKey: "NODE_OPTIONS")
            environment.removeValue(forKey: "NODE_PATH")
            process.environment = environment
            process.standardOutput = log
            process.standardError = log
            process.terminationHandler = { [weak self] finished in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.child = nil
                    self.log?.closeFile()
                    self.log = nil
                    self.status.title = self.stopping ? "Server stopped" : "Server exited (\(finished.terminationStatus)) — see log"
                }
            }
            child = process
            try process.run()
            status.title = "Server running · port 8765"
        } catch {
            child = nil
            status.title = "Could not start server — see log"
            NSLog("Galaxy Scopez: %@", error.localizedDescription)
        }
    }
    @objc func stop() {
        stopping = true
        if let process = child, process.isRunning { process.terminate() }
        else { status.title = "Server stopped" }
    }
    func explainResolveControls() {
        let alert = NSAlert()
        alert.messageText = "Enable GPrime’s Resolve shortcuts?"
        alert.informativeText = "Galaxy Scopez needs macOS permission to use Resolve’s menus for Previous/Next Clip, Apply Prior, Undo and Clip Fullscreen. You can use the scopes without granting it.\n\nChoose Enable to open the permission settings. Turn on Galaxy Scopez in Privacy & Security → Device Control and Data Access (Accessibility on older macOS).\n\nIf you choose Set Up Later, return to GS → Enable Resolve controls… in the Mac menu bar. You can also change this permission in System Settings at any time. GPrime grading additionally requires Resolve’s separate Local external scripting setting, described in the online guide."
        alert.addButton(withTitle: "Enable")
        alert.addButton(withTitle: "Set Up Later")
        NSApplication.shared.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn {
            _ = NativeResolveControl.trusted(prompt: true)
            if !NativeResolveControl.trusted(), let settings = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
                NSWorkspace.shared.open(settings)
            }
        }
    }
    @objc func enableResolveControls() { explainResolveControls() }
    @objc func viewer() { NSWorkspace.shared.open(URL(string: "http://localhost:8765/scopes.html")!) }
    @objc func guide() { NSWorkspace.shared.open(URL(string: "https://vidarandersen.com/dmz/galaxyscopez/")!) }
    @objc func showLog() { NSWorkspace.shared.open(logURL) }
    @objc func quit() { nativeControls?.stop(); stop(); child?.waitUntilExit(); NSApplication.shared.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { nativeControls?.stop(); stop(); child?.waitUntilExit() }
}
@main
struct GalaxyScopezMain {
static func main() {
// Finder alias creation runs as the logged-in user during installation, without
// starting another server or opening an application window.
if CommandLine.arguments.contains("--create-desktop-alias") {
    do {
        let target = Bundle.main.bundleURL
        let desktop = try FileManager.default.url(for: .desktopDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let output = CommandLine.arguments.count > 2 ? URL(fileURLWithPath: CommandLine.arguments[2]) : desktop.appendingPathComponent("Galaxy Scopez")
        // Rename our existing Finder alias when it already resolves to this bundle.
        if CommandLine.arguments.count == 2 && !FileManager.default.fileExists(atPath: output.path) {
            let legacy = desktop.appendingPathComponent("Ghetto Scopez")
            if let resolved = try? URL(resolvingAliasFileAt: legacy, options: [.withoutUI]),
               resolved.standardizedFileURL == target.standardizedFileURL {
                try FileManager.default.moveItem(at: legacy, to: output)
            }
        }
        if FileManager.default.fileExists(atPath: output.path) {
            let resolved = try URL(resolvingAliasFileAt: output, options: [.withoutUI])
            guard resolved.standardizedFileURL == target.standardizedFileURL else {
                throw NSError(domain: "GalaxyScopez", code: 1, userInfo: [NSLocalizedDescriptionKey: "Desktop item already exists; it was left unchanged."])
            }
        } else {
            let bookmark = try target.bookmarkData(options: [.suitableForBookmarkFile], includingResourceValuesForKeys: nil, relativeTo: nil)
            try URL.writeBookmarkData(bookmark, to: output)
        }
        exit(0)
    } catch { fputs("Desktop shortcut: \(error.localizedDescription)\n", stderr); exit(1) }
}
let app = NSApplication.shared
let delegate = HostApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

}
}
