# Oli — development notes

## Camera / Touch (v33) — STABLE, do not rebuild

Status on a real phone (owner's test, 2026-10-31): "almost good". The controller is considered stable.
Small observations recorded here, **not** changed:

1. **Max zoom is 1.8** (`Z_MAX` in `v2.js`). A first draft of the request mentioned testing zoom 2.0; it was kept at 1.8 so the look of the game does not change.
2. **No edge scroll during a pipe drag** (by request: the camera never moves in PIPE_DRAG / BUILDING_DRAG). A target outside the screen is reached by zooming out first, or by building in segments from an open end.
3. **Tap threshold is 12 CSS px** (`TAP_PX`). The map already moves from the first pixel; a touch that moved less than 12 px in total and was never pinched counts as a tap.
4. **Moving a building needs it to be selected first** (tap, then drag). A drag that starts on a building that is not selected pans the map.
5. **A 2nd finger during a drag**: before the first finger moved → the drag is cancelled and becomes a PINCH; after it moved → ignored.
6. **Emulator frame rate is not representative** (software GPU, ~12 fps). Feel can only be judged on a phone.
7. **Android pinch measurement**: against the finger positions the app receives, the midpoint drift is 0.000 px; against the points the test sent, ~3 px — that offset comes from where the test takes its reference point while the 2nd finger lands, not from the controller.
8. **Logcat "Error injecting safe area CSS"** comes from Capacitor, not from Oli's code.

Method source: rex CameraController (MIT) — see `THIRD_PARTY_NOTICES.md`.

## Repository layout (since v34)

- `/oli` is the real project: game (`core.js` simulation, `v2.*` Phaser front-end), tests, Capacitor Android project.
- The APK is built by `.github/workflows/build-apk.yml` straight from `/oli` (no zip any more).
- `.github/workflows/android-test.yml` + `.github/android/*` run the APK on an Android 14 emulator (pipe tests + touch/camera tests).

Left exactly as they were in the move (candidates for a later cleanup, not done now):
- `oli/.github/workflows/android.yml` — an old workflow inside the project folder; GitHub ignores it (only the root `.github` counts).
- Old files: `game.js`, `game.js.orig`, `index.html`, `style.css` (the pre-Phaser version), `*.bak.js`, `*-dbg.js` tests, `tests-retired/`.
- `build-apk.yml` still copies `.github/signing/debug.keystore` to `~/.android/`; the APK is actually signed by `signingConfigs.oli` in `oli/android/app/build.gradle` (`oli-debug.keystore`), and CI checks that certificate.
