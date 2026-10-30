#!/bin/bash
# Runs INSIDE the Android emulator job: installs the real APK, starts it, attaches to its WebView over the DevTools protocol,
# drives it with Android's own touch input (adb input motionevent) and saves the results.
set -x
mkdir -p results
adb wait-for-device
adb root || true      # writing the multi-touch input device (two-finger tests) needs root on the emulator
sleep 3
adb wait-for-device
adb install -r Oli.apk
adb logcat -c
adb shell am start -n com.oli.oilgame/.MainActivity
sleep 15
PID=$(adb shell pidof com.oli.oilgame | tr -d '\r')
echo "app pid: $PID"
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s http://127.0.0.1:9222/json | tee results/targets.json
adb shell wm size | tee results/screen.txt
adb shell getprop ro.build.version.release | tee results/android-version.txt
node .github/android/test-android.js 2>&1 | tee results/report.txt
node .github/android/touch-android.js 2>&1 | tee results/touch.txt
adb logcat -d > results/logcat.txt
grep -E "Capacitor/Console|chromium" results/logcat.txt | grep -iE " E |error|exception|webgl|gl_" > results/logcat-errors.txt || true
exit 0
