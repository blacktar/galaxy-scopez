# Browser viewer

Current viewer: **0.4.0**; release effect: **GTap 1.2.29**.

Use [README.md](README.md) for installation or
[the online user guide](https://vidarandersen.com/dmz/galaxyscopez/) for everyday use.
For the new `.pkg` installation, use **GS** in the menu bar to start/stop the
server and open the viewer. It starts automatically at login. Source checkouts
can still run `bash start.sh`. Open GTap’s address on a device on the same LAN.
The app and viewer open the online guide. The HTML guide is not included in the installer; source checkouts retain it for editing and local preview.

The host uses Node.js and a Node-API native analysis component, with the Resolve
OFX/Metal effect providing image data. Runtime browser dependencies are served
locally, not from a CDN. See [DEVELOPING.md](DEVELOPING.md) for tests/source builds.

Source / working-space tap: choose **Source / working-space RGB — no transform**
in GTap Input to measure raw float32 RGB at that node. RGB is unchanged; negative
and above-one values are retained. Weighted RGB and difference views use an
explicit fixed BT.709 analysis basis, without inferring project primaries or
transfer. Display targets are hidden and axes use raw float values.

The user guide includes a Lens Debaser teaser and optional tawk.to support chat,
loaded after the guide finishes loading. The guide remains readable offline.

Zoom (1×–4×) and Detail Level (Q1–Q4) are independent. Q controls underlying detail in all scope types; Smooth now applies to every plot using spatial, value-axis, circular-hue or soft-point filtering as appropriate. DoubleD always retains its aspect ratio. The expanded grids require GTap 1.2.25 and the updated host.

Parking assist (PAS) adds adjustable audible warnings for highlights, shadows and saturation to one selected scope slot. Scopez Quest suspends PAS. Settings files preserve PAS configuration and image-area selection. Enable PAS in Controls to start browser audio. Hue histogram presets include All colours, Near-neutral, Shadows and Highlights, with custom ranges and pixel-count or chroma-weighted readings; these controls require GTap 1.2.27 or later.

PAS local visual editors: waveform start/end handles and buffer arrows; neutral-drift concentric circles; middle-grey target/tolerance/approach bands. Signal/grading limit banks are independently saved. Explicit Fit limits action retains continuous-limit buffers; selected-area grey capture creates a custom target. Preview raster work runs only while PAS settings are open. No release yet.

### Native grading capability audition

Development Viewer 0.2.69 provides an experimental panel in the existing viewer at scopes.html?grading=1. The user runs scripts/start-grading-audition.command after stopping the ordinary GS server. This keeps a local native CDL adapter available for the audition. GTap supplies the existing image feedback. See [the audition instructions](docs/reverse-scopes/VIEWER-AUDITION.md). Live validation is pending.

Development audition: the optional grading panel now also includes a relative linear-exposure ribbon for a separately assigned `GScopez Exposure` node, with explicit Linear-processing confirmation. See `docs/reverse-scopes/VIEWER-AUDITION.md` for setup. HDR Global Exposure equivalence and iPad testing are pending.

Audition development sessions are managed with `node scripts/grading-session.mjs status|restart|reload-worker|stop`. Optional interface diagnostics can be enabled in the audition panel and read locally through `/api/grade-audition`. See the audition guide for details.

GPrime development audition also includes a relative X/Y Balance pad for an assigned `GScopez Balance` node with Gamma Linear. Its native Gain-wheel mapping is under user validation; see the audition guide.

Standalone development-only native Contrast panel audition: run `scripts/test-native-contrast.command`; see [manual test instructions](docs/reverse-scopes/NATIVE-CONTRAST-TEST.md). It targets the currently selected Resolve node through a separate loopback panel test, not the scripting binding. Native acceptance is pending user testing; no installer required.

Local GPrime audition now includes a relative Native Contrast ribbon with explicit node assignment and a selection-only confirmation test. See [the audition instructions](docs/reverse-scopes/VIEWER-AUDITION.md). First/next-node targeting still awaits user validation; Exposure and Balance retain their scripting paths. Stop the older standalone Contrast test before binding this mode.

### Manual Contrast Pivot verification audition
Select the intended Contrast node manually in Resolve’s clip-level graph. In the viewer’s Native grading audition, bind that node in Contrast mode, press **Verify selected Pivot 0.336**, then confirm that only this node uses that Pivot. The ribbon checks fresh Pivot feedback before sending adjustments. Selecting a node with another Pivot blocks adjustments; select the intended node and verify again. This test does not automatically select nodes, and matching Pivot alone is not a unique node ID.

Contrast targeting audition update: after initial manual Pivot verification and unique-Pivot confirmation, starting each ribbon drag attempts to select the first node and checks up to the full clip node count for Pivot0.336. A second fresh match is required before adjustments. Keep the clip graph active; navigation order is not visual left-to-right; targeting accuracy remains pending manual validation. If no match is found, no Contrast adjustment is sent.

Selection-only numeric panel audition: run `scripts/test-direct-node-selection.command`; see `docs/reverse-scopes/DIRECT-NODE-SELECTION-TEST.md`. It releases the worker’s panel port while keeping the web host running, then accepts explicit number requests and records which API-list node the user sees highlighted. Printer Lights must be off; clip graph active. No Contrast encoder control is exposed. Index equivalence is pending user validation.

Current Contrast ribbon targeting: after initial manual Pivot0.336 verification and confirmation (clip graph active; Printer Lights OFF), each drag directly selects the bound API node by numeric panel selection and verifies fresh Pivot before enabling adjustments. Full-node searching has been removed. Each adjustment retains the fresh Pivot gate. Refresh/rebind after host restart; direct numeric selection is user-validated for API nodes1and18 in the audition clip.

HSV Saturation audition: Settings → Native grading audition → HSV Saturation Gamma / Gain. Explicitly confirm HSV, S-only channels, Primaries wheels and Printer Lights off; bind the desired clip node. Two relative ribbons share one native session; native Gamma/Gain readback replaces estimated display values. See docs/reverse-scopes/HSV-SATURATION-AUDITION.md. Restore manually in Resolve during this audition; full GPrime undo is not yet implemented.

GPrime Settings: in the grading-enabled viewer, use GPrime · node assignments → Fetch nodes from current clip. Bind each role beneath its matching abstract control; Sat Gamma/Gain use one shared Saturation node assignment. The ordered preflight names required setup. Assignments drive the selectable GPrime combined scope, kept per current clip/worker session. Existing single-control tests remain under Debug · individual control auditions and retain their real arming gates. Metadata binding does not alter your grade or automatically arm those tests. In the GPrime scope, press Connect controls to use all assigned controls together.

GPrime combined interface is now scope type GPrime in the scope pulldown. Open `scopes.html?grading=1&layout=gprime&layoutmode=single`, assign the four nodes in Settings, follow preflight, then return to Scopes and Connect controls. Live Balance vectorscope, Exposure/Contrast and shared-node native HSV SatGamma/Gain ribbons are functional for user audition. GPrime undo, clip productivity shortcuts and selective Balance locking remain future work. See docs/reverse-scopes/GPRIME-COMBINED-SCOPE.md.

Vectorscope detail experiment: run `scripts/test-vector-detail.command` for isolated Q4/Q6/Q8/Q10 Metal measurements and fixtures, then open `/vector-detail-bench.html` on iPad for the separate renderer test. Production scope limits are unchanged; these tests do not measure actual Resolve playback. See `docs/vector-detail/PLAN.md` for the live-test prerequisites and reporting limits.

GPrime development0.2.70 adds bottom-row native Color-page clip navigation, Apply1/2Prior and Resolve Cinema Viewer toggle. These are user-triggered named-menu actions; macOS Accessibility/Automation permission for the GS host app may be required. Keep Resolve active with focus on the Color page (click in its interface) and select only the current clip for ApplyPrior. Existing bindings recover by unique previously assigned node labels; missing or ambiguous roles need assignment. Live menu behavior is awaiting user audition; whole-grade global undo remains unfinished.

GPrime productivity buttons now use the native command handler in the signed Galaxy Scopez app. Choose **GS → Enable Resolve controls…** and grant Galaxy Scopez the macOS app-control permission. The Terminal/System Events permission helper is retired. The app owns the managed host; its existing local control socket still supports development restarts and worker reloads.

Native GPrime controls (development0.2.71): the signed Galaxy Scopez app now executes the five productivity commands through public Accessibility APIs. Use GS → Enable Resolve controls… and grant permission to Galaxy Scopez. Terminal/System Events is no longer used for these buttons. The app owns the managed host; CLI control remains available. Development launch uses the editable host via --development-host; production uses bundled files and user-writable state outside the signed bundle. Actual Resolve button behavior is awaiting user validation; see docs/reverse-scopes/NATIVE-APP-CONTROLS-20261123.md for build, running-state and release prerequisites.

Clip Fullscreen is a native Resolve Cinema Viewer toggle. Its highlighted state is updated only after fresh post-command Resolve menu feedback confirms the change; uncertain feedback is shown as unconfirmed rather than an invented on/off state. GPrime messages appear inside its scope.

GPrime clip navigation recovers assignments where matching assigned nodes exist. Clips without those nodes need their own assignments; returning to the original clip restores its saved mappings. Transient connection errors do not imply missing assignments.

GPrime has an Undo button on each side of Clip Fullscreen, next to Apply 2 Prior and Apply 1 Prior. Both invoke Resolve’s Edit → Undo (⌘Z): they undo the latest Resolve action, including changes made in Resolve since Apply Prior. They are not separate histories. Bindings are refreshed after Undo.

GPrime hero parking: the strip beneath the shortcut buttons shows the current clip position and timecode. Hold still on the strip for one second to unlock scrubbing, then drag left or right. Release to lock it again. Movement stays within the current clip. Resolve must be on the Color page; grading-node assignments are not needed just to scrub. The strip uses Resolve scripting and has not yet passed the live iPad audition.

Multiple GPrime displays can connect simultaneously. There is no exclusive viewer ownership or takeover step. Commands run in order against Resolve’s current clip and shared grading assignments; refreshing another display does not interrupt an active drag.

GPrime Balance (development 0.3.1): use the top-left stacked-diamond button to switch to DoubleD; its circular-reticle icon switches back to the vectorscope. Both use the same assigned Balance node, sensitivity and undo. Drag vertically in the left diamond for blue/green, the right for red/green, or both with two fingers. The display choice is saved locally and switching does not change the grade. Refresh the viewer; no server restart or rebinding is needed.

Development 0.3.2 fits the GPrime DoubleD diamond outlines to the full Balance width between the display switch and undo outer edges, preserving their proportions.

Development 0.3.3 keeps bound GPrime controls visually steady during another control’s gesture. Both Balance views share the ribbon touch/selection/overscroll protections; actual iPad Safari fullscreen behavior remains subject to device testing.

Development0.3.4 adds an optional live waveform backdrop to GPrime. Toggle the line-chart icon beside Exposure, between undo and sensitivity. It is shown at25% opacity above the clip image and behind the controls, ignores touches, and saves its on/off state. It requests the waveform measurement only while needed. Refresh the viewer; no host restart or rebinding required.

Development0.3.5 fixes the live GPrime waveform backdrop freezing when incoming frames reuse the decoder’s count buffer. Refresh the viewer to load the fix.

Development0.3.6 claims GPrime ribbon/Balance touches from touchstart as well as touchmove, and records fullscreen exits for diagnosis. Actual Safari fullscreen stability awaits iPad testing. Hero scrub UI is50% transparent; hit area and hold timing are unchanged.

Development0.3.8 adds nominal0/1 reference lines to the waveform backdrop, positioned within its current measurement range.

Development0.3.9 makes waveform limit lines brighter and insets the trace/lines together so they no longer coincide with the outer scope frame.

Development0.3.15 detects HomeScreen web-app launch and uses the expanded layout without requesting browser fullscreen. Compact tablet header places status, Reload and Start/Stop at the right; listening is removed from Controls in this mode. Reload refreshes the interface. Regular Safari launch retains its fullscreen behavior. Close/reopen the web app once to pick up this update; subsequent updates can use Reload.

Development0.3.16 adds a one-second hold Reset beneath each GPrime Undo. A white80%fill shows progress. Reset only the selected parameter to neutral, preserving node processing settings and Contrast Pivot; Sat Gamma/Gain reset independently. Its Undo restores the pre-reset value. Native reset uses verified bound-node feedback and may take several updates. The development host was restarted to load this command; reload and reassign the four nodes for testing.

Development0.3.20 starts listening when you interact with GPrime and remembers explicit Start/Stop across Reload. Temporary disconnections do not replace the saved choice; Stop remains available in the header. Static refresh only, no rebinding.

Development0.3.25 prevents browser pinch/double-tap zoom on the HomeScreen header row while retaining normal button taps and Controls popup interaction. Reload the viewer to load it.

Release 0.4.0 uses the same supplied Home Screen icon as the app. Home Screen
launches use compact Reload/Start/Stop controls and retain listening intent.
GPrime adds DoubleD Balance, optional live waveform and hold-to-reset controls.
The native app offers Resolve shortcut permission during first-launch setup,
with Set Up Later and GS → Enable Resolve controls… for returning to setup.
All user-guide commands open the public online guide; no HTML guide is installed.
