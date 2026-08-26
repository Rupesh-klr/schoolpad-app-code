# Building and shipping

Android, iOS and web from this one codebase.

---

## 0. First-time setup

```bash
cd app-code
npm install          # the four SDK-pinned packages
npm run setup        # expo install — everything else, at SDK-compatible versions
```

`npm run setup` exists because `expo install` resolves each package to the version
this Expo SDK was tested against. Running plain `npm install expo-router` gets you
whatever npm considers newest, which is how an afternoon disappears into native
build errors that have nothing to do with your code.

Then point the app at your API:

```bash
cp .env.example .env
```

| Where you run it | `EXPO_PUBLIC_API_BASE` |
|---|---|
| Web browser, same machine | `http://localhost:8100` |
| Android **emulator** | `http://10.0.2.2:8100` |
| iOS **simulator** | `http://localhost:8100` |
| Physical device, same Wi-Fi | `http://192.168.x.x:8100` (your machine's LAN IP) |

`10.0.2.2` is the one that catches everyone. Inside the Android emulator,
`localhost` is the emulated phone — not your computer. `10.0.2.2` is the alias
that reaches the host.

---

## 1. Running locally

```bash
npm run web        # browser, fastest loop — use this for the admin dashboard
npm run android    # emulator or attached device
npm run ios        # simulator (macOS only)
npm start          # dev server + QR code for Expo Go on a real phone
```

The admin dashboard is a web page. `npm run web` is the right way to work on it,
and it is also the build you deploy for admins to use.

### Checking both phone shapes without two devices

The web build honours the browser's own device emulation. Chrome DevTools →
toggle device toolbar → pick a Pixel and an iPhone. That covers layout and safe
areas. It does **not** cover native module behaviour (SecureStore, the share
sheet, video), so test those on a real device before release.

---

## 2. Android

### An APK to sideload or hand to a tester

```bash
npm run build:android:apk       # eas build --platform android --profile preview
```

Builds in Expo's cloud and gives you a download URL. **This runs from Windows** —
no Android Studio, no local Gradle.

An APK installs directly on a device. It is the format for testing.

### An AAB for the Play Store

```bash
npm run build:android:aab       # eas build --platform android --profile production
```

Play only accepts AAB for new releases. You cannot install an AAB on a phone —
if you want to test the build first, use the APK profile above.

### Building locally instead of in the cloud

Only if you need it. Requires Android Studio, the SDK, and a JDK:

```bash
npx expo prebuild --platform android    # generates ./android
cd android
./gradlew assembleRelease               # APK  → app/build/outputs/apk/release/
./gradlew bundleRelease                 # AAB  → app/build/outputs/bundle/release/
```

`./android` is gitignored because `expo prebuild` regenerates it from `app.json`.
If you start hand-editing native files, remove that line from `.gitignore` and
commit the folder — but then every `app.json` change has to be made twice.

---

## 3. Publishing to Google Play

**Once, before the first release:**

1. Create the app at [play.google.com/console](https://play.google.com/console)
   with package name `com.myagemap.learningapp` (from `app.json`). This cannot be
   changed after the first upload.
2. Let EAS generate and hold the upload keystore: `eas credentials`. Losing an
   upload key you manage yourself means you can never update the app under that
   listing again — EAS holding it is the safer default.
3. Play Console → Setup → API access → create a service account with **Release
   Manager**, download its JSON key, and save it **outside this repo**. Point
   `eas.json` → `submit.production.android.serviceAccountKeyPath` at it.

**Every release:**

```bash
npm run build:android:aab
npm run submit:android          # eas submit --platform android --latest
```

Lands on the `internal` track. Promote to production from the Play Console once
you have tested it.

**What Play will ask for that is not code:** a privacy policy URL (serve
`/api/meta/legal/privacy_policy`), a data-safety declaration, a content rating
questionnaire, and — because this app is for children — a Families Policy
declaration and a target-age-group answer.

---

## 4. iOS

### From Windows

```bash
npm run build:ios               # eas build --platform ios --profile production
```

Expo builds on their Macs. You need a paid Apple Developer account ($99/yr) but
**not a Mac**. This is the recommended path.

### From a Mac

Needed only if you want to debug native code or run Instruments.

```bash
npx expo prebuild --platform ios     # generates ./ios
cd ios && pod install                # CocoaPods dependencies
open App.xcworkspace                 # NOT .xcodeproj — pods only exist in the workspace
```

In Xcode: select a Generic iOS Device → Product → Archive → Distribute App.

The `.xcworkspace` vs `.xcodeproj` distinction is the one that wastes an hour.
Opening the project file builds without the pods and fails on missing headers.

There is a helper for the Mac side:

```bash
bash scripts/ios-build.sh            # prebuild + pod install + archive + export .ipa
```

### Publishing to the App Store

1. Create the app in [App Store Connect](https://appstoreconnect.apple.com) with
   bundle id `com.myagemap.learningapp`.
2. Fill in `eas.json` → `submit.production.ios` with your Apple ID, the App Store
   Connect app id, and your team id.
3. `npm run submit:ios`

Apple review notes for this app specifically: an app aimed at under-13s falls
under the **Kids Category** rules — no third-party analytics, no behavioural ads,
and a parental gate in front of anything that leaves the app. Reviewers also
need a working test account; give them a pre-activated student login and a spare
access code, or the build is rejected for "cannot access content".

---

## 5. Web

```bash
npm run build:web       # expo export --platform web  →  ./dist
```

`./dist` is plain static files. Any host works — S3 + CloudFront, nginx, the
same static server pattern as SupportHelper.

The server must rewrite unknown paths to `index.html`, or a refresh on
`/admin/students` 404s. This is the standard SPA fallback.

---

## 6. Releasing all three at once

```bash
node scripts/release.js                     # patch bump, then web + android + ios
node scripts/release.js --minor
node scripts/release.js --only web,android
node scripts/release.js --dry-run           # show the commands, change nothing
```

It bumps `version` in `app.json` and `package.json`, increments Android's
`versionCode` and iOS's `buildNumber` together, then runs each build.

Both stores reject an upload whose build number is not strictly higher than the
last one. Keeping the two numbers in one script is what stops "I bumped the
version but forgot the versionCode" happening on a Friday.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Network request failed` on Android emulator | `EXPO_PUBLIC_API_BASE` is `localhost` — use `10.0.2.2` |
| Blank white screen on web | Check the browser console; usually a native-only module imported unguarded |
| `Unable to resolve module expo-router` | `npm run setup` has not been run |
| Env change has no effect | `EXPO_PUBLIC_*` is baked at bundle time — restart with `npm start -- --clear` |
| Play rejects the AAB | `versionCode` was not incremented; `node scripts/release.js` handles it |
| iOS build fails on missing headers | Opened `.xcodeproj` instead of `.xcworkspace` |
| Blur looks flat on an old Android | Deliberate — see the `CAN_BLUR` note in `src/components/Glass.js` |
