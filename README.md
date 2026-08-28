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
│   ├── myclass.js        # class details, timetable, calendar
│   ├── notices.js        # notices feed with unread state
│   ├── node/[id].js      # browsing chapters and topics
│   └── item/[id].js      # video / PDF / image / link players
├── (parent)/
│   └── children.js       # link by access code, progress per child
└── (admin)/
    ├── _layout.js        # side rail ≥900px, bottom bar below
    ├── dashboard.js      # section 2.1 tiles
    ├── students.js       # section 2.3 — search, filter, approve
    ├── codes.js          # section 2.4 — generate + share
    ├── schools.js        # list and create
    ├── school/[id].js    # classes / students / codes / teachers / calendar
    ├── class/[id].js     # class details + weekly timetable editor
    ├── content.js        # the tree + multi-file upload
    ├── documents.js      # notices composer
    └── settings.js       # admins, password, legal, audit

src/
├── api/client.js         # the only place that holds a token or builds a URL
├── auth/AuthContext.js   # session state
├── theme/tokens.js
├── school/               # the school-detail tabs, kept out of the route file
│   ├── CodesTab.js
│   └── StudentsTab.js
└── components/
    ├── Glass.js          # Screen, cards, buttons, shimmer, tiles, pills
    ├── Field.js          # text inputs and the segmented CodeInput
    ├── Dropdown.js       # modal select + the shared Chevron
    ├── Sheet.js          # bottom sheet on phones, dialog on desktop
    └── FilePicker.js     # DOM file input on web, single or multiple
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

## Every screen is built

| Route | What it does |
|---|---|
| `/login` `/otp` `/register` `/gate` | OTP sign-in, registration, then code-or-approval |
| `/dashboard` | Section 2.1 tiles + latest registrations |
| `/schools` `/school/[id]` | Schools, then Classes / Students / Codes / Teachers / Calendar |
| `/class/[id]` | Class details and the weekly timetable editor |
| `/students` | Search, cascading class filter, class-wise collapsible groups |
| `/codes` | Generate in bulk, share via WhatsApp / email / copy / CSV |
| `/content` | Class → Subject → Chapter → Topic, multi-file upload |
| `/documents` | Notices — file or link, scoped to everyone / school / class |
| `/settings` | Admin users, your password, legal documents, audit trail |
| `/home` `/node/[id]` `/item/[id]` | Student learning: subjects, browsing, players |
| `/myclass` `/notices` | Class details, timetable, calendar, notices |
| `/children` | Parent: link by access code, see progress |

## Known constraints

- `EXPO_PUBLIC_*` values are **baked into the bundle at build time** and readable
  from the APK with a text editor. Addresses only — never a key or a token.
- The gate screen polls every 20s. Approval is a human action minutes away at
  best; a tighter poll spends a child's mobile data to learn nothing.
- Icons are emoji, not an icon font — no bundle weight, no missing glyphs, but
  they render differently per platform.
$env:GRADLE_HEAP='2560m'; npm run apk
And on a machine with room: npm run apk -- -MaxWorkers 6.

