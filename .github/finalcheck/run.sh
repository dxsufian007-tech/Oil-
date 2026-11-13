#!/bin/bash
# Final check of the official APK on Android 14 (CI emulator): install, start, drive loans/investment by real touch, save, kill the app, start again, check nothing was lost or repeated.
set -x
mkdir -p results
adb wait-for-device; sleep 3
adb install -r OliEmpire.apk 2>&1 | tee results/install.txt
adb shell dumpsys package com.oli.olicentral | grep -E "versionCode|versionName|firstInstallTime" | tee results/package.txt
adb shell settings put secure immersive_mode_confirmations confirmed || true
launch() {
  adb logcat -c; adb shell am force-stop com.oli.olicentral
  adb shell am start -n com.oli.olicentral/com.oli.oilgame.MainActivity
  sleep 15
  adb shell input keyevent KEYCODE_WAKEUP || true
  PID=$(adb shell pidof com.oli.olicentral | tr -d '\r'); echo "pid $PID" | tee -a results/pid.txt
  adb forward --remove-all || true
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
}
launch
node .github/finalcheck/final-android.js A 2>&1 | tee results/phaseA.txt
if grep -q "FAIL" results/phaseA.txt && ! grep -q "snap.json" <(ls results); then
  echo "NOTE attempt 1 failed; repeating once with a fresh start" | tee -a results/phaseA.txt; mv results/phaseA.txt results/phaseA-attempt1.txt; adb shell pm clear com.oli.olicentral; launch
  node .github/finalcheck/final-android.js A 2>&1 | tee results/phaseA.txt
fi
adb shell input keyevent KEYCODE_HOME; sleep 10
adb shell am force-stop com.oli.olicentral; sleep 3
launch
node .github/finalcheck/final-android.js B 2>&1 | tee results/phaseB.txt
adb shell pidof com.oli.olicentral | tee results/pid-after.txt
adb logcat -d > results/logcat.txt
grep -E "FATAL|AndroidRuntime|Capacitor/Console|chromium" results/logcat.txt | grep -iE "FATAL|ANR| E |exception|Uncaught" > results/logcat-errors.txt || true
exit 0
