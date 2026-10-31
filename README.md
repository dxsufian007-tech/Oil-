# Oli

Oil-network management game (Phaser 3 + Capacitor, Android).

- **`oli/`** — the project: game code, tests, Android project. Start there (`oli/README.md`, `oli/NOTES.md`).
- **Build:** every push to `main` builds the APK (`.github/workflows/build-apk.yml`) and publishes it on the `apk-build` branch.
- **Android test:** `.github/workflows/android-test.yml` installs that APK on an Android 14 emulator and runs the pipe and touch/camera tests (results on the `android-test` branch).

Local:

```
cd oli
npm ci
npm test              # core simulation tests
node build-www.js     # web build -> oli/www
npx cap sync android  # copy into the Android project
```
