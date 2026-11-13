#!/bin/bash
# Installs the official OLI EMPIRE APK (release asset) on Android 14, starts it, drives the banking section through the WebView.
set -x
mkdir -p results
adb wait-for-device; sleep 3
adb install -r OliEmpire.apk 2>&1 | tee results/install.txt
adb shell dumpsys package com.oli.olicentral | grep -E "versionCode|versionName|firstInstallTime" | tee results/package.txt
adb shell settings put secure immersive_mode_confirmations confirmed || true
adb logcat -c
adb shell am start -n com.oli.olicentral/com.oli.oilgame.MainActivity
sleep 15
adb shell input keyevent KEYCODE_WAKEUP || true
PID=$(adb shell pidof com.oli.olicentral | tr -d '\r'); echo "pid $PID" | tee results/pid.txt
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node .github/bankcheck/bank-android.js 2>&1 | tee results/bank.txt
adb shell pidof com.oli.olicentral | tee results/pid-after.txt
adb logcat -d > results/logcat.txt
grep -E "FATAL|AndroidRuntime|Capacitor/Console|chromium" results/logcat.txt | grep -iE "FATAL|ANR| E |exception|Uncaught" > results/logcat-errors.txt || true
exit 0
