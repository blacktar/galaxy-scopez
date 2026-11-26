# Galaxy Scopez + GTap

Colour scopes from DaVinci Resolve in a browser on your local network.
Made by **Vidar Andersen**. [Read the user guide](https://vidarandersen.com/dmz/galaxyscopez/).

[Download the Mac release](https://github.com/blacktar/galaxy-scopez/releases/latest)

## GPrime multitouch grading

Viewer 0.3.0 adds GPrime: linear Exposure, native Contrast, Balance and HSV/S-only
Saturation Gamma/Gain with simultaneous two-finger input. It includes per-control
undo/sensitivity, native clip navigation and Apply Prior/Undo, Clip Fullscreen,
one-second hold-to-scrub hero parking and multiple displays. Tested with Resolve
Studio 21.2 on Apple silicon and iPad Safari. Enable Local external scripting and
Galaxy Scopez's native Resolve permission, then assign four clip-level nodes.
The release includes the GPrime PowerGrade and illustrated setup instructions.
Use the PowerGrade on ungraded clips before grading; configure transforms for
your source and display. Referent is linked separately and not included.

Viewer 0.4.0 adds optional DoubleD Balance with independent two-finger pair
control, a live waveform overlay, and one-second hold-to-reset buttons with undo.
On iPad, Add to Home Screen → Open as Web App gives a compact interface with
Reload and Start/Stop, remembered listening state and automatic start on touch.
A/B/C overlay opacity now reuses rendered snapshots for responsive adjustment.
First-launch setup explains the optional Resolve shortcut permission; Set Up
Later keeps it available under GS → Enable Resolve controls… .

## Install and start

This release includes **GTap 1.2.35** and **viewer 0.6.1**.
The supplied universal GTap binary requires **macOS 27 or later** (Apple silicon
or Intel). Earlier macOS versions have not been verified for this release.
DaVinci Resolve is required. The new `.pkg` installer bundles the server,
Node.js and private Python runtimes, browser dependencies and prebuilt GTap; no developer tools or
separate runtime installation are required.

1. Quit Resolve and stop any older Galaxy Scopez host.
2. Open the Mac `.pkg` installer and enter your administrator password when asked.
3. Double-click the desktop **Galaxy Scopez** alias to start the app or open its
   server controls. Use **GS** in the menu bar to open the viewer or guide, start/stop the server,
   show its log or quit. The server starts after installation and at login.
4. Open Resolve, add GTap at the measurement point and choose the matching input.
   Open its panel’s network address on the other display.

Open **Galaxy Scopez** from Applications to reopen the menu-bar app after quitting.
The installer is Developer ID signed and Apple-notarised. Earlier installer versions
were confirmed working by the user; this package has not been installed locally. The earlier ZIP/Install.command package is
retained as a legacy download.

## What is included

Waveform, RGB parade/histogram, vectorscopes and highs/mids/lows views, DoubleD,
a rotatable RGB cube, saturation/luma and hue histogram; image region and colour
selection; three A/B/C snapshots per scope; saved browser settings and settings
files. The online guide works on portrait phones and is not bundled with the installer. Its full-width header
randomly selects one of 37 supplied images, converted to responsive WebP assets.

Source / working-space tap: choose **Source / working-space RGB — no transform**
in GTap Input to measure raw float32 RGB at that node. RGB is unchanged; negative
and above-one values are retained. Weighted RGB and difference views use an
explicit fixed BT.709 analysis basis, without inferring project primaries or
transfer. Display targets are hidden and axes use raw float values.

The host is intended for a trusted local network. No account is required.
Update speed varies by image and device; source-coloured waveforms remain demanding.

## Licence

**CC BY-NC-SA 4.0**, for original project material. See [LICENSE](LICENSE) and
[LICENSE-NOTICE.txt](LICENSE-NOTICE.txt). Included third-party components retain
their own licences; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Source and validation

See [DEVELOPING.md](DEVELOPING.md) for source builds and tests. Source archives
without the prebuilt effect cannot run the release installer until GTap is built.

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

## Release 0.5.0 scopes / GTap 1.2.35

Release 0.5.0 includes:

- CIE Chromaticity (xy/u′v′), explicit input primaries/transfer and a direct setup button. Rec.709, P3-D65 and Rec.2020 inputs are supported; the target/comparison gamut is independent. CIE dataset attribution remains CC BY-SA 4.0.
- Waveform Y/CbCr/RGB mode buttons and independent RGB display channels; RGB/YRGB/YCbCr parades with a separate Color toggle. Mode buttons keep their positions and ignore repeated selection.
- Source-image colours in CbCr waveforms and all YCbCr parade channels. RGB channels retain their channel colours; Color off is monochrome. Encoded parade Y stays separate from a PQ waveform.
- Shared original-column footprint integration for waveform/parade display and snapshots, including both pooled columns at lower Q and sparse grids at higher Q. Measured counts are unchanged.
- A fixed-width DoubleD Horizontal/Vertical header toggle, equal-height scope-header buttons, and portrait Controls wrapping.
- Home Screen interaction starts every scope when listening is stopped; GPrime retains its existing auto-start. Diagnostic text is shown only with Debug enabled; scale/channel labels and setup/connection guidance remain visible.

Source trace colours are optional packed rgb8 bin means (about 1/255 component precision); source float32 measurements and uint32 populations are unchanged. Colour data is produced by a bounded Metal tile kernel and forwarded without source-image frames. Snapshot storage retains its own immutable colour/count planes. The current suite has 218 passing web tests; independent GPU/count/wire and shared-footprint fixtures are recorded locally. These checks are not measurements of Resolve playback or iPad refresh rate.

Install a changed GTap only after Resolve quits. Backend JavaScript changes need a managed host restart; static viewer changes need a browser reload. Viewer 0.6.0 includes GTap 1.2.35. Scope modes, individual controls and GPrime have been tested with Resolve and iPad Safari.

Development 0.4.9 adds exact optional Y histogram counts (analysis15/histY) and shared RGB/YRGB header modes for overlaid/separate histograms. GTap1.2.35 appends explicit BT.2100 PQ/HLG choices without shifting existing saved-project indices. HDR detection requires explicit BT.2020 primaries and transfer, never inferred from gamut or numeric magnitude. PQ/HLG axes are signal scales; HLG uses a configurable zero-black400–2000nit reference display and BT.2100 system gamma (default1000nit). Parade range is display-only; adjustable SDR/HDR references remain separate from PAS. Encoded samples and count precision are preserved.

Extents are local display envelopes from unsmoothed bins, independently remembered for Waveform/Parade/Vectorscopes and GPrime’s vector Balance. Column extrema retain occupied-bin endpoints; vector envelopes use720angular sectors (0.5degrees) and retain the farthest occupied-bin centre in each. This is an excursion envelope, not a claim of pixel-identical Resolve contour rendering. Main-vector Combine requests Low/Mid/High count planes and snapshots retain these. Banding investigation and high-Q research remain paused.

Development scope instances: up to four ordinary scope copies can be displayed with independent title-bar modes, Color/Extents, zoom, A/B/C banks and local Settings (Gain, Brightness, Graticule, Smooth, Reset). Global Gain scales local values proportionally; Brightness adds percentage-point deltas; unclamped relative offsets are retained. Global Smooth sets every current scope and the default for new ones; local overrides remain available. Q stays global. GPrime, Scopez Quest and the synthesizer remain singletons. Settings files include instance preferences, but snapshot banks stay on the device.

The outer viewer manages layout, global controls, PAS and wake protection. Same-origin embedded renderers reuse the existing rendering engines. Compatible requests share validated count arrays by reference through bounded transport groups (at most four groups); they do not duplicate full-frame browser pixel transport. Different analysis settings use separate groups. The FPS readout averages the active renderers’ rates; payload rate counts shared network delivery once.

Scope title bars suppress native pinch/double-tap page zoom while retaining ordinary controls. Scope surfaces and title bars disable text selection, native dragging and copy/context menus; plot gestures retain their existing scope zoom behavior.

The individual scope Settings popup includes a 1×/2×/3×/4× cycling Zoom button synchronized with plot gestures. Each copy has its own zoom; Q remains global. Zoom uses the existing display transforms, without changing analysis resolution or counts.

Individual Settings omits the visible diagnostic heading, uses available width for a single row and wraps when needed. Waveform Y/RGB/CbCr display paths now apply Gain and Brightness consistently in GPU and software rendering, including monochrome RGB overlays.

Zoom above1×, whether chosen in local Settings or by gesture, displays the existing scope-header zoom/reset control. It reports total displayed magnification; Reset returns that scope to1× without changing neighbouring copies. The cube retains its Reset view action with the zoom value added while magnified.

The GPrime tab beside Scopes opens a fixed single-GPrime page using the existing grading surface and setup prompt. It cannot be removed/replaced/expanded there. Scopes layouts and mounted instances remain intact across tab changes, including modes, zoom and references; inactive scope streams are paused. Settings layout controls continue to edit Scopes. GPrime’s setup shortcut opens its node assignments. Settings begins with Settings Presets (active preset plus right-aligned canonical online guide link), then Layout; CIE follows DoubleD, and GPrime Debug Options follows the global Debug switch.

When GPrime is active, ordinary Scopes release analysis subscriptions and stop animation/reporting timers. Existing canvas/GPU buffers and snapshot memory remain cached for quick return; only GPrime requests its required analyses. Its waveform backdrop now shares corrected original-source column footprint rules with the regular waveform, eliminating the old empty-bin slicing path. A bounded reusable separable raster avoids a full-resolution summed-area allocation for the decorative overlay.

New/resumed subscriptions request a fresh initial analysis matched by producer/instance/source sequence, rather than cache revision (different analysis deliveries can describe the same captured frame). Continuous delivery still permits correctly labelled completed frames while the next is analysed. On return from GPrime, ordinary scopes hide stale live canvases with Updating… until accepted data arrives; layout, gesture views and snapshot references stay cached. GTap already retains its latest captured image for reanalysis of new requests while paused.

Contrast native feedback accepts the observed flags0/flags2 readback acknowledgements (including Clip Fullscreen), while still requiring the requested acknowledgement token followed by a fresh full Pivot snapshot. Wrong/nonfinite Pivot, missing snapshot and unrelated acknowledgements remain rejected; no cached-Pivot fallback or longer timeout was introduced. Both GPrime entry points use the same verifier.

Home Screen navigation remembers Scopes/GPrime/Settings across Reload in browser-local preferences, including the underlying plot page when Settings is selected. Embedded scope navigation and ordinary browser launches do not overwrite that preference.

GS → About Galaxy Scopes displays the same credits, signal-handling, placement and connection information as GTap’s About dialog. Its Project website button opens the canonical online guide. No local HTML guide is installed.

Release 0.6.0 provides general gamepad input from the native GS host (Apple GameController framework, background events enabled) and connected browser viewers (native Gamepad API). Settings → GPrime · Gamepad lists controllers with their locations and requires explicit source selection. Standard Xbox/PlayStation-style positions include both sticks/clicks and pressure-sensitive triggers; Stadia is a tested discovery device, not a special-case backend. Actual controller/OS support depends on what the native framework or browser exposes.

GS owns the selected input and runs the grading interpreter independently of browser rendering/focus. Exactly one source drives the existing serial GPrime worker; no automatic fallback. Mapping capture pauses the shared interpreter. Stale input (250ms), disconnect, malformed state or disabled mode ends the controller gesture and requires neutral before rearming. Profiles migrate from the first connected viewer and persist on the host (16 profiles maximum); mode starts off after host restart. Browser sources stop when hidden; native host input can continue with all viewers closed. Controller menus/view switches target the configuring viewer and are unavailable when no viewer is connected. Touch remains separate and backend gesture ownership prevents concurrent GPrime drags. Native clip actions retain target checks and main-Resolve-window menu dispatch. PAS haptics and Scopez Quest integration remain pending. Release 0.6.0 includes GTap 1.2.35.

Controller shortcuts retain their recorded combination until the main button is released, suppress base actions and wait for in-flight GPrime readiness. Changing the input owner cancels a waiting shortcut; errors remain visible briefly. Gamepad Settings follow the complete GPrime setup section; Control bindings start collapsed. Single GPrime layouts stretch the grading surface to fill available card height; mixed-scope caps and narrow portrait stacking remain.

Known limitation: an intermittent browser focus change with detached non-fullscreen Resolve Scopes remains unresolved; the latest user-operated capture did not reproduce it.

Release 0.6.1 connects Scopez Quest to the shared GPrime gamepad controls. Its header links to controller setup and shows selected-source status. Grading input starts the real Resolve feed when Quest is visible; hidden Quest does not resume listening. Stopping listening during a held adjustment stays stopped until the next gesture. Existing GPrime mappings and host/viewer selection apply, and only real GTap signal bins score.
