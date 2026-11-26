Galaxy Scopez 0.6.0 adds remappable gamepad grading to GPrime. Includes GTap 1.2.35.

- Use a compatible controller connected to the Resolve Mac or a connected browser viewer. Choose the controller by name and location in GPrime Settings.
- Host-connected controllers keep working with Resolve in front, even when the browser is hidden or closed. Browser-connected controllers work across Scopes, GPrime and Settings while their viewer remains visible and connected.
- Pressure-sensitive Exposure, right-stick Balance, qualified Contrast and saturation controls, clip scrubbing, clip navigation, control Undo/Reset and Apply Prior shortcuts.
- Per-controller remapping with input validation, combination capture and a collapsible bindings list. Mappings are saved on the GS host.
- One selected input source, neutral rearming after interruptions, and grading paused during remapping.
- GPrime fills the available height on larger fullscreen displays. Native shortcuts can target Resolve’s main window when a detached Scopes window has focus.

GPrime requires Resolve Studio external scripting set to Local. Native clip shortcuts require Resolve to be active and the GS macOS control permission. After restarting GS, enable gamepad mode again and reselect the controller if its connection has changed. Refresh existing viewers after updating.

Controller availability depends on macOS/browser support. Stadia was tested; Xbox/PlayStation-style layouts use the standard controller APIs. Rumble is not included yet.

Known limitations: fine horizontal trace banding remains under investigation. An intermittent focus change reported with detached, non-fullscreen Resolve Scopes was not reproduced in the latest user tests and remains unresolved.
