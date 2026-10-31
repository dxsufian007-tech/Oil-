#!/bin/bash
# Installs the map preview APK in the emulator, starts it, attaches to its WebView and measures it (see map-android.js).
set -x
mkdir -p results
adb wait-for-device
adb install -r OliMap.apk
adb logcat -c
adb shell settings put secure immersive_mode_confirmations confirmed || true
launch() {
  adb shell am force-stop com.oli.mappreview
  adb shell am start -n com.oli.mappreview/com.oli.oilgame.MainActivity
  sleep 12
  adb shell input keyevent KEYCODE_WAKEUP || true
  PID=$(adb shell pidof com.oli.mappreview | tr -d '\r')
  echo "app pid: $PID"
  adb forward --remove-all || true
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
  sleep 1
}
launch
adb shell wm size | tee results/screen.txt
adb shell getprop ro.build.version.release | tee results/android-version.txt
node .github/android/map-android.js 2>&1 | tee results/map.txt
adb logcat -d > results/logcat.txt
grep -E "Capacitor/Console|chromium" results/logcat.txt | grep -iE " E |error|exception" > results/logcat-errors.txt || true
exit 0
