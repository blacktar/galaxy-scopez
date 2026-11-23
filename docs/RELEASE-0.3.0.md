# Galaxy Scopez 0.3.0 — GPrime

Turn your tablet into a multitouch grading surface for DaVinci Resolve.

- **GPrime:** linear Exposure, native Contrast, colour Balance on a live vectorscope, and HSV Saturation Gamma/Gain. Use both saturation ribbons together.
- Bind four nodes in your existing tree, or import the included **GPrime Node Tree v1 PowerGrade** before grading.
- Independent touch sensitivity and undo for each grading control.
- Previous/Next Clip, Apply Grade from One/Two Clips Prior, native Undo and Clip Fullscreen.
- Hold the clip strip for **one second**, then scrub and park on the hero. The optional clip background updates after navigation and scrubbing.
- Open viewers on multiple displays; grading commands run in order.
- **Scopez Quest** replaces the OG name. **Galaxy Synth (experimental)** replaces OG Synth, with hue → pitch, brightness → volume and saturation → vibrato.
- Refined Controls tab styling and GPrime vectorscope zoom, detail, smoothing and transparent trace rendering.
- **GTap 1.2.29:** new instances default to BT.709 encoded input. The plug-in's internal ID stays unchanged.

GPrime was tested with **DaVinci Resolve Studio 21.2 on Apple silicon and iPad Safari**. It requires Resolve's Local external scripting and Galaxy Scopez's native-control permission. The Mac installer includes its required runtimes; no separate Python installation is needed.

macOS 27 or later. Quit Resolve and stop the older host before installing.

[User guide](https://vidarandersen.com/dmz/galaxyscopez/)

Validation: 197 web tests and 75 offline grading tests pass. The universal
installer is Developer ID signed, notarized, stapled and accepted by Gatekeeper.
The PowerGrade passes the recorded structural checks; the user validated the
GPrime controls on iPad.
