# THE LABYRINTH — Shipping Guide (PC + Android)

`labyrinth.html` stays the single source of truth. Both apps wrap the exact same
bundle, assembled by `node scripts/build-www.js <target>` (game → `index.html`
+ `sounds/` + `sprites/` + `splash.png`). **Always rebuild the bundle before
packaging** — the npm scripts below do it automatically.

---

## PC (Electron) — `desktop/`

| What | Where |
|---|---|
| Portable exe (itch.io upload) | `desktop/dist/TheLabyrinth-portable-1.0.0.exe` |
| One-click installer | `desktop/dist/TheLabyrinth-setup-1.0.0.exe` |

**Rebuild after a game change:**
```
cd desktop
npm run dist        # rebuilds www/ from labyrinth.html, then both artifacts
```
**Quick test without packaging:** `npm start` · automated check: set `LAB_SMOKE=1`
and run `npx electron .` → prints `SMOKE OK` and exits.

Notes:
- **Version bumps:** edit `version` in `desktop/package.json` — it names the artifacts.
- **SmartScreen:** unsigned indie exes trigger "Windows protected your PC" on first
  run (More info → Run anyway). Normal for itch.io. Removing it requires a paid
  code-signing certificate (~$100+/yr) — skip until revenue justifies it.
- The window icon comes from `desktop/build/icon.ico` (regenerate with
  `npx electron make-icon.js` if the splash art changes).
- F11 toggles fullscreen; the dynamic square viewport handles any window size.

---

## Android (Capacitor) — `mobile/`

| What | Where |
|---|---|
| Debug APK (sideload onto your phone) | `mobile/android/app/build/outputs/apk/debug/app-debug.apk` |
| **Signed release APK** (sideload/itch) | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| **Signed .aab** (what Google Play takes) | `mobile/android/app/build/outputs/bundle/release/app-release.aab` |

**Rebuild after a game change:**
```
cd mobile
npm run sync                       # rebuild www/ + copy into the native project
cd android
$env:JAVA_HOME="C:\Users\Alex\Desktop\TheRoom\tools\jdk\jdk-21.0.11+10"
.\gradlew.bat assembleRelease bundleRelease
```
(The portable JDK in `tools/jdk/` is the only toolchain dependency; the Android
SDK at `%LOCALAPPDATA%\Android\Sdk` is yours from Android Studio.)

**Sideload to test:** copy `app-debug.apk` (or the release APK) to your phone and
open it; allow "install unknown apps" when prompted. Or with USB debugging:
`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe install -r app-release.apk`.

### ⚠ Two decisions that become PERMANENT at first Play upload

1. **Application ID** — currently `com.theroom.labyrinth`. Google Play keys your
   app to this forever; change it NOW if you want something else (it appears in
   `mobile/capacitor.config.json` and `mobile/android/app/build.gradle`
   — `namespace` + `applicationId` — then `npx cap sync android` and rebuild).
2. **Signing keystore** — `mobile/keystore/release.keystore` +
   `keystore.properties`. **Back both up off this machine.** Lose them and you
   can never update the app again. (Play's "app signing by Google" enrolls your
   upload key at first submission and softens this, but back it up anyway.)

### Google Play release steps (yours)

1. Create a Play Console developer account — $25 one-time, play.google.com/console.
2. Create app → upload `app-release.aab` to *Internal testing* first.
3. Store listing needs: short + full description, at least 2 screenshots
   (`tests/shots/` are real captures; take phone screenshots from the sideloaded
   build for portrait shots), a 512×512 icon and 1024×500 feature graphic
   (crop from `splash.png`), a privacy-policy URL (the game collects nothing and
   stores saves locally — a one-paragraph page hosted anywhere satisfies it),
   and the content-rating questionnaire (fantasy violence → likely Everyone 10+).
4. **Version bumps:** every upload needs `versionCode` +1 (and a human
   `versionName`) in `mobile/android/app/build.gradle`.

### Platform notes

- **Saves** live in the WebView's localStorage inside app-private storage —
  durable across updates and reboots; wiped only by "Clear app data" or
  uninstall. (A cloud/export save is the natural post-launch upgrade; the
  share-string pipeline is halfway there.)
- **Back button** closes the app from gameplay (Capacitor default). Acceptable
  v1; mapping it to the pause menu is a small follow-up.
- **Audio** unlocks on first touch (the game already gates WebAudio on a
  gesture, so this just works).
- Launcher icons were generated from the splash art into every `mipmap-*`
  density (`desktop/make-android-icons.js` regenerates them).

---

## Deliberately skipped

- **iOS** — requires macOS/Xcode to build; per decision 2026-06-12, not shipping.
- **Save-bridge plugin** — was only needed for iOS's localStorage eviction;
  Android's WebView storage is durable, so the wrapper ships with zero game-code
  changes.
