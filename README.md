# Learning App

One React Native codebase → **Android, iOS and web**. Expo SDK 57, expo-router,
plain JavaScript.

Talks to [the API](../app-code-backend), which owns every rule and all the data.

---

## Quick start

Start the API first — it owns the database:

```bash
cd ../app-code-backend
npm install && cp .env.example .env     # fill in the three secrets
npm run migrate && npm run seed
npm run dev                             # :8100
```

Then this app:

```bash
cd app-code
npm install          # the four SDK-pinned packages
npm run setup        # expo install — everything else, at compatible versions
cp .env.example .env

npm run web          # browser
npm run android      # emulator or device
npm run ios          # simulator (macOS)
```

Sign in as the admin from `SEED_ADMIN_EMAIL`, or register a student with any
phone number — with `OTP_PROVIDER=console` the code is printed in the API's
terminal.

> **`npm run setup` is not optional.** Only the four packages Expo pinned itself
> are in `package.json`. `expo install` resolves the rest to the versions this SDK
> was tested against; plain `npm install` gets whatever is newest, which is how an
> SDK upgrade becomes a day of native build errors.

Full build and store-submission steps: **[docs/BUILD.md](docs/BUILD.md)**.

---

## Who sees what

The routing rule lives in exactly one place — [`app/_layout.js`](app/_layout.js).
A guard duplicated per screen is a guard that gets forgotten on the screen that
mattered.

```
not signed in            → /(auth)/login
admin                    → /(admin)/dashboard
student or parent,
  status != active       → /(auth)/gate      ← code, or wait for approval
student, active          → /(student)/home
parent, active           → /(parent)/children
```

The server enforces the same rule independently: content endpoints refuse a
pending account with `ACCOUNT_PENDING`. A client bug cannot leak anything.

---

## Design system

Frosted glass over a fixed gradient mesh. All tokens in
[`src/theme/tokens.js`](src/theme/tokens.js); all components in
[`src/components/Glass.js`](src/components/Glass.js).

Three constraints shape it:

1. **Glass needs something behind it.** `<Screen>` paints the gradient every other
   component assumes. A `GlassCard` on a white background is a grey rectangle.
2. **Blur is not free on Android.** `BlurView` is skipped below API 31, where it
   is emulated in software and drops a scrolling list to single-digit frame
   rates. The translucent fill and hairline border carry the look there — flatter,
   but a card that renders beats one that stutters.
3. **Motion runs on the native driver.** Transform and opacity only, so the
   shimmer stays at 60fps on the cheap Android tablets these students actually
   use. Every loop is stopped on unmount — a looping animation left running keeps
   the JS thread awake on a screen nobody is looking at.

Components: `Screen`, `GlassCard`, `GlassButton`, `GhostButton`, `Shimmer`,
`SkeletonRows`, `StatTile`, `Pill`, `Empty`, `ErrorNote`, `Field`, `CodeInput`.

`GlassButton` scales to 0.97 on press — the whole reason a tap feels acknowledged
on a device with no haptics — and sweeps a highlight while `loading`, so a slow
network reads as "working" rather than "frozen".

### `CodeInput`

One real `TextInput` behind a row of drawn boxes — not one input per box.
Per-box inputs have to hand focus around manually and break paste, autofill and
every OTP-from-SMS integration on both platforms. This one carries
`textContentType="oneTimeCode"` and `autoComplete="sms-otp"`, so both platforms
fill the code straight from the notification instead of making a child memorise
six digits.

`length` comes from the server's `/api/meta/constants`, so changing the access
code length on the backend reshapes this input with no app release.

---

## Layout

```
app/                      # expo-router — the file tree is the URL structure
├── _layout.js            # providers + the single routing guard
├── index.js              # redirect
├── (auth)/
│   ├── login.js          # OTP or admin password, one screen
│   ├── otp.js            # auto-submits on the last digit
│   ├── register.js       # name, role, class, school
│   └── gate.js           # redeem a code, or wait — polls every 20s
├── (student)/
│   ├── home.js           # subjects + continue learning
│   ├── node/[id].js      # ▲ not built
│   └── item/[id].js      # ▲ not built
├── (parent)/
│   └── children.js       # ▲ not built
└── (admin)/
    ├── _layout.js        # side rail ≥900px, bottom bar below
    ├── dashboard.js      # section 2.1 tiles
    ├── students.js       # section 2.3 — search, filter, approve
    ├── codes.js          # section 2.4 — generate + share
    ├── schools.js        # ▲ not built
    ├── content.js        # ▲ not built
    └── settings.js       # ▲ not built

src/
├── api/client.js         # the only place that holds a token or builds a URL
├── auth/AuthContext.js   # session state
├── theme/tokens.js
└── components/
    ├── Glass.js
    └── Field.js
```

---

## API client

Everything goes through `api.*` in [`src/api/client.js`](src/api/client.js).
Nothing else reads a token, builds a URL or parses an error — which is what makes
the refresh-on-401 work everywhere instead of in whichever screens remembered to
implement it.

**Token storage** is SecureStore on device (iOS Keychain / Android Keystore) and
`localStorage` on web, since SecureStore has no web implementation.

**Concurrent refresh is serialised.** A screen firing four requests at once gets
four 401s at once; without this, all four try to refresh, three present a token
the first has already rotated away, and the user is thrown back to login for no
reason. Everyone waits on the same promise.

Only `TOKEN_EXPIRED` triggers a retry. Retrying a 403 or a genuinely invalid
token would loop.

---

## Sharing access codes

The admin Codes screen offers **WhatsApp · Email · Copy · CSV · More**.

Every format is rendered by `POST /api/codes/share` on the server. The app only
decides which share sheet to open. Three clients would otherwise each grow their
own copy of the formatting and drift apart.

`wa.me` is used rather than the `whatsapp://` scheme, because the scheme is not
registered in a browser and fails silently on the web build. Each path falls back
to copying if the target app is missing.

---

## Not built yet

Honest list. The API endpoints behind all of these are implemented and tested —
these are UI work only, and each stub screen names the endpoints it needs.

- **Admin: Schools, Content, Settings** — routed, reachable, render a "not built"
  panel.
- **Student: node and item screens** — browsing below a subject, and the
  video/PDF/image/link players with "mark as completed".
- **Parent: children screen** — linking by the child's access code.
- **Device previewer** — the iOS/Android look-switcher that `acastahealth-ui` has
  in `src/dev/DevDevicePreview`. Not ported. Chrome DevTools device emulation
  covers layout in the meantime; it does not cover native module behaviour.
- **Offline support.** Every screen needs the network.
- **i18n.** English only.

## Known constraints

- `EXPO_PUBLIC_*` values are **baked into the bundle at build time** and readable
  from the APK with a text editor. Addresses only — never a key or a token.
- The gate screen polls every 20s. Approval is a human action minutes away at
  best; a tighter poll spends a child's mobile data to learn nothing.
- Icons are emoji, not an icon font — no bundle weight, no missing glyphs, but
  they render differently per platform.
