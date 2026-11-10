# Running Billy on Your Phone (Android)

Billy uses native modules (Firebase Auth, ML Kit text recognition), so it **does not work in Expo Go**. You install a development build of Billy on the phone once; after that, code changes load over Metro automatically.

All commands below are run from the `mobile/` folder on your computer.

---

## 1. One-time setup on the computer

Check the tools are available:

```bash
node --version      # 20.x or newer
java -version       # OpenJDK 17
adb version         # from Android SDK platform-tools
```

If `adb` is not found, add this to `~/.bashrc` and open a new terminal:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

Make sure these files exist (they are not in git):

- `mobile/.env` containing `EXPO_PUBLIC_GEMINI_API_KEY=...` (and optionally `EXPO_PUBLIC_VISION_API_KEY=...`)
- `mobile/google-services.json` and `mobile/android/app/google-services.json`

Then install dependencies:

```bash
npm install
```

---

## 2. One-time setup on the phone

1. **Turn on Developer options:** Settings → About phone → tap **Build number** 7 times.
   - On Xiaomi/Redmi/POCO: tap **MIUI/HyperOS version** instead.
   - On Samsung: Settings → About phone → Software information → **Build number**.
2. **Turn on USB debugging:** Settings → System → Developer options → **USB debugging** → On.
3. **Xiaomi/Redmi/POCO only:** also turn on **Install via USB** and **USB debugging (Security settings)** in Developer options (needs a SIM card and Mi account sign-in).

---

## 3. Connect the phone

### Option A — USB cable (simplest)

1. Plug the phone in with a **data** cable (some cheap cables only charge).
2. On the phone, if asked for USB mode, choose **File transfer**.
3. Accept the **"Allow USB debugging?"** prompt on the phone (tick *Always allow from this computer*).
4. Check the connection:

   ```bash
   adb devices
   ```

   You should see something like:

   ```
   List of devices attached
   R58N12ABCDE    device
   ```

   If it says `unauthorized`, unlock the phone and accept the prompt. If it shows nothing, see **Troubleshooting** below.

### Option B — Wi-Fi (Android 11+, no cable)

Phone and computer must be on the **same Wi-Fi network**.

1. Phone: Developer options → **Wireless debugging** → On → **Pair device with pairing code**. Note the IP:port and the 6-digit code shown.
2. Computer:

   ```bash
   adb pair 192.168.1.23:37199        # use the IP:port from the pairing screen, then enter the code
   ```

3. Back on the main **Wireless debugging** screen, note the IP address & port (this port is different from the pairing one):

   ```bash
   adb connect 192.168.1.23:41235
   adb devices                        # should list the phone as "device"
   ```

You need to repeat step 3 (`adb connect`) after the phone restarts or Wi-Fi changes.

---

## 4. Build and install Billy (first time, ~5–15 min)

```bash
npx expo run:android
```

This compiles the native app, installs **Billy** on the phone, starts Metro, and opens the app. If several devices are connected, add `--device` to pick one.

---

## 5. Day-to-day development

Once Billy is installed, you only need Metro:

```bash
npx expo start --dev-client
```

Open **Billy** on the phone; it connects to Metro and loads the latest code. Saving a file reloads the app automatically.

- **USB:** if the app can't reach Metro, run `adb reverse tcp:8081 tcp:8081` and reopen the app.
- **Wi-Fi:** the app finds Metro over the network; if it doesn't, shake the phone → **Change bundle location** / enter `http://<computer-ip>:8081`.
- **Dev menu:** shake the phone, or run `adb shell input keyevent 82`.
- Press `r` in the Metro terminal to reload the app.

Re-run `npx expo run:android` (step 4) only when you **add/upgrade a native package**, change `app.json`, or change `google-services.json`.

---

## 6. (Optional) Standalone APK that works without the computer

Builds an APK with the JavaScript bundled inside, so Billy runs without Metro:

```bash
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
cd ..
```

The APK is signed with the debug key, so it's fine for your own phone or friends' phones but **not** for the Play Store. It also contains your Gemini API key from `.env` — don't share it publicly.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `adb devices` shows nothing | Try another cable/USB port; set USB mode to **File transfer**; run `adb kill-server && adb start-server`. |
| Device shows `unauthorized` | Unlock the phone and accept the debugging prompt. If no prompt: Developer options → **Revoke USB debugging authorizations**, then replug. |
| `no permissions (user in plugdev group...)` on Linux | `sudo usermod -aG plugdev $USER`, install udev rules (`sudo apt install android-sdk-platform-tools-common`), then log out and back in. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An older Billy signed differently is installed: `adb uninstall com.anonymous.mobile`, then build again. |
| `INSTALL_FAILED_USER_RESTRICTED` (Xiaomi) | Turn on **Install via USB** in Developer options and accept the install prompt on the phone. |
| App opens but shows "Unable to load script" / can't connect to Metro | Make sure `npx expo start --dev-client` is running; on USB run `adb reverse tcp:8081 tcp:8081`; on Wi-Fi check both are on the same network and no firewall blocks port 8081 (`sudo ufw allow 8081`). |
| Build fails with Java/Gradle errors | Confirm `java -version` is 17. Then `cd android && ./gradlew clean && cd ..` and rebuild. |
| Bill scanning fails with an API error | Check `EXPO_PUBLIC_GEMINI_API_KEY` in `.env`, then restart Metro with `npx expo start --dev-client --clear` (env values are baked in when Metro starts). |
| Camera or contacts don't work | Phone Settings → Apps → Billy → Permissions → allow Camera and Contacts. |

---

## iPhone

Running on an iPhone requires a **Mac with Xcode** (`npx expo run:ios --device`) and an Apple ID for signing. It can't be done from Linux. The alternative is a cloud build with EAS (`npx eas build --profile development --platform ios`), which needs a paid Apple Developer account.
