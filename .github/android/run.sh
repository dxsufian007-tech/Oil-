#!/bin/bash
# Runs INSIDE the Android emulator job: installs the real APK, starts it, attaches to its WebView over the DevTools protocol,
# drives it with Android's own touch input and saves the results.
set -x
mkdir -p results
adb wait-for-device
adb root || true      # writing the multi-touch input device (two-finger tests) needs root on the emulator
sleep 3
adb wait-for-device
adb install -r Oli.apk
adb logcat -c

# start (or restart) the app and attach to its WebView
launch() {
  adb shell am force-stop com.oli.oilgame
  adb shell am start -n com.oli.oilgame/.MainActivity
  sleep 15
  adb shell input keyevent KEYCODE_WAKEUP || true
  adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS || true   # a system dialog on top would swallow the touches
  sleep 2
  PID=$(adb shell pidof com.oli.oilgame | tr -d '\r')
  echo "app pid: $PID"
  adb forward --remove-all || true
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
  sleep 1
}
# The emulator's Google Play Services restarts now and then; Android then kills every app bound to its fonts provider - the WebView
# of any app, Oli included ("Killing ...com.oli.oilgame...: depends on provider com.google.android.gms/.fonts.provider.FontsProvider").
# That is the test machine, not the game: such a run is repeated once with a fresh app start, and the first attempt is kept.
killedByGms() { adb logcat -d | grep -q "Killing .*com.oli.oilgame.*depends on provider com.google.android.gms"; }
runTest() {   # $1 script, $2 result name
  adb logcat -c
  launch
  node .github/android/$1 2>&1 | tee results/$2.txt
  if grep -q "crashed: WebSocket is not open" results/$2.txt && killedByGms; then
    echo "NOTE the app was killed by Android because Google Play Services restarted (emulator); repeating $1 once" | tee -a results/$2.txt
    adb logcat -d > results/$2-attempt1-logcat.txt
    mv results/$2.txt results/$2-attempt1.txt
    adb logcat -c
    launch
    node .github/android/$1 2>&1 | tee results/$2.txt
    echo "NOTE second attempt after a Play Services restart (first attempt: $2-attempt1.txt)" | tee -a results/$2.txt
  fi
  adb logcat -d >> results/logcat.txt
}

launch
curl -s http://127.0.0.1:9222/json | tee results/targets.json
adb shell wm size | tee results/screen.txt
adb shell getprop ro.build.version.release | tee results/android-version.txt
runTest test-android.js report
runTest touch-android.js touch
runTest phase2-android.js phase2
grep -E "Capacitor/Console|chromium" results/logcat.txt | grep -iE " E |error|exception|webgl|gl_" > results/logcat-errors.txt || true
exit 0
