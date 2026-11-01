#!/bin/bash
# Installs the building lab APK in the emulator, starts it, attaches to its WebView and measures it (see building-android.js).
set -x
mkdir -p results
adb wait-for-device
adb install -r OliBuild.apk
adb logcat -c
adb shell settings put secure immersive_mode_confirmations confirmed || true
launch() {
  adb shell am force-stop com.oli.buildlab
  adb shell am start -n com.oli.buildlab/com.oli.oilgame.MainActivity
  sleep 12
  adb shell input keyevent KEYCODE_WAKEUP || true
  PID=$(adb shell pidof com.oli.buildlab | tr -d '\r')
  echo "app pid: $PID"
  adb forward --remove-all || true
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
  sleep 1
}
# The emulator's Google Play Services restarts now and then and Android then kills every app bound to its fonts provider - the WebView of any app (see run.sh).
# That is the test machine, not the app: such a run is repeated once with a fresh app start, and the first attempt is kept.
killedByGms() { adb logcat -d | grep -q "Killing .*com.oli.buildlab.*depends on provider com.google.android.gms"; }
launch
adb shell wm size | tee results/screen.txt
adb shell getprop ro.build.version.release | tee results/android-version.txt
node .github/android/building-android.js 2>&1 | tee results/building.txt
if grep -qE "crashed: (WebSocket is not open|socket hang up)" results/building.txt && killedByGms; then
  echo "NOTE the app was killed by Android because Google Play Services restarted (emulator); repeating once" | tee -a results/building.txt
  adb logcat -d > results/logcat-attempt1.txt; mv results/building.txt results/building-attempt1.txt; adb logcat -c; launch
  node .github/android/building-android.js 2>&1 | tee results/building.txt
  echo "NOTE second attempt after a Play Services restart (first attempt: map-attempt1.txt)" | tee -a results/building.txt
fi
# Phase 3: economy (real touch, close/reopen the app, offline report, performance)
adb shell am force-stop com.oli.buildlab; adb logcat -c; launch
timeout 900 node .github/android/economy-android.js 2>&1 | tee results/economy.txt
if grep -qE "crashed: (WebSocket is not open|socket hang up)" results/economy.txt && killedByGms; then
  echo "NOTE app killed by Play Services restart (emulator); repeating once" | tee -a results/economy.txt
  mv results/economy.txt results/economy-attempt1.txt; adb logcat -c; launch
  timeout 900 node .github/android/economy-android.js 2>&1 | tee results/economy.txt
fi
# Phase 3.5: the Arabic-first easy game (real touch: nav, cards, ghost, start production, tank, pipe, guide, close/reopen)
adb shell am force-stop com.oli.buildlab; adb logcat -c; adb shell pm clear com.oli.buildlab || true; launch
timeout 900 node .github/android/game-android.js 2>&1 | tee results/game.txt
if grep -qE "crashed: (WebSocket is not open|socket hang up)" results/game.txt && killedByGms; then
  echo "NOTE app killed by Play Services restart (emulator); repeating once" | tee -a results/game.txt
  mv results/game.txt results/game-attempt1.txt; adb logcat -c; adb shell pm clear com.oli.buildlab || true; launch
  timeout 900 node .github/android/game-android.js 2>&1 | tee results/game.txt
fi
adb logcat -d > results/logcat.txt
grep -E "Capacitor/Console|chromium" results/logcat.txt | grep -iE " E |error|exception" > results/logcat-errors.txt || true
exit 0
