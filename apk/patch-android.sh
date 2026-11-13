#!/usr/bin/env bash
# Runs inside apk/ after "npx cap add android": permissions, landscape, print bridge, icons, version.
set -euo pipefail
RUN="${1:-1}"
M=android/app/src/main/AndroidManifest.xml

# camera (in-app camera + photo capture) and location (GPS while the camera is open)
for P in CAMERA ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  grep -q "android.permission.$P\"" "$M" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$M"
done
grep -q 'android.hardware.camera"' "$M" || sed -i 's#</manifest>#    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>#' "$M"

# the app is used in landscape
grep -q screenOrientation "$M" || sed -i 's#android:name=".MainActivity"#android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"#' "$M"

# print bridge (report -> Android print dialog -> Save as PDF)
cp MainActivity.java android/app/src/main/java/com/routesurvey/etut/MainActivity.java

# launcher icons (plain PNGs; drop the adaptive Capacitor icon)
rm -rf android/app/src/main/res/mipmap-anydpi-v26
cp -r res/. android/app/src/main/res/

# version shown in Android settings; must grow for updates to install over the old app
sed -i -E "s/versionCode [0-9]+/versionCode $RUN/; s/versionName \"[^\"]*\"/versionName \"1.0.$RUN\"/" android/app/build.gradle

echo "--- manifest"; cat "$M"
