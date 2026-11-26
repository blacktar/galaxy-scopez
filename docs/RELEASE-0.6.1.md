Galaxy Scopez 0.6.1 adds explicit GPrime gamepad support to Scopez Quest. Includes GTap 1.2.35.

- Open gamepad setup directly from the Quest header and see the selected controller's status.
- Use your existing GPrime mappings and host- or viewer-connected controller to grade in Resolve while playing.
- Controller grading starts Quest's live Resolve feed when its scope is visible and waiting for input. Hidden Quest stays stopped.
- Quest continues scoring the resulting GTap signal. Controller movement does not directly move a game cursor or award targets.
- Stopping listening during a held adjustment stays stopped until a new grading gesture begins.

GPrime node bindings, gamepad mode and controller selection must be configured first. Refresh existing viewers after updating. Controller support and the unresolved detached-window focus limitation from 0.6.0 still apply. Rumble is not included yet.
