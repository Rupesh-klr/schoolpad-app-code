<#
.SYNOPSIS
  Build a shareable release APK on Windows and drop it in a dated folder.

.DESCRIPTION
  Produces release\<yyyy-MM-dd>_v<version>\app-release.apk — a file you can send
  straight to a tester over WhatsApp, email or a link. An APK installs directly
  on a device; an AAB (what Play wants) does not, which is why this script
  builds the APK and `npm run build:android:aab` exists separately for the store.

  Two ways to build:

    -Mode eas    (default) Builds in Expo's cloud and downloads the result.
                 Needs an Expo account. No Android SDK, no JDK, no Gradle.

    -Mode local  Builds on this machine with Gradle. Needs Android Studio (or
                 the command-line SDK) and a JDK 17, plus ANDROID_HOME set.
                 Faster after the first run, and works with no internet.

.EXAMPLE
  .\scripts\build-apk.ps1
  .\scripts\build-apk.ps1 -Mode local
  .\scripts\build-apk.ps1 -ApiBase https://api.myagemap.com -Bump patch
#>

[CmdletBinding()]
param(
  [ValidateSet('eas', 'local')]
  [string]$Mode = 'eas',

  # Baked into the bundle at build time. A tester's phone cannot reach your
  # laptop's localhost, so this must be a hostname the device can resolve.
  [string]$ApiBase = '',

  [ValidateSet('none', 'patch', 'minor', 'major')]
  [string]$Bump = 'none',

  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Say($msg)  { Write-Host "  $msg" }
function Step($msg) { Write-Host ""; Write-Host "  == $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host ""; Write-Host "  x $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Learning App - release APK" -ForegroundColor White
Write-Host "  mode: $Mode"

# ── Prerequisites ─────────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die "Node.js is not on PATH." }
if (-not (Test-Path (Join-Path $Root 'app.json')))         { Die "Run this from the app-code folder." }

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    Step "Installing dependencies"
    npm install
    if ($LASTEXITCODE -ne 0) { Die "npm install failed." }
    npm run setup
    if ($LASTEXITCODE -ne 0) { Die "npm run setup failed." }
  }
}

# ── Version ───────────────────────────────────────────────────────────────────

if ($Bump -ne 'none') {
  Step "Bumping version ($Bump)"
  # release.js keeps app.json and package.json in step and increments
  # versionCode and buildNumber together, which is what the stores check.
  node scripts/release.js "--$Bump" --only web --dry-run
  node -e @"
const fs=require('fs');
const level=process.argv[1];
const app=JSON.parse(fs.readFileSync('app.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const [a,b,c]=app.expo.version.split('.').map(Number);
const next=level==='major'?`${a+1}.0.0`:level==='minor'?`${a}.${b+1}.0`:`${a}.${b}.${c+1}`;
app.expo.version=next; pkg.version=next;
app.expo.android.versionCode=Number(app.expo.android.versionCode||0)+1;
app.expo.ios.buildNumber=String(Number(app.expo.ios.buildNumber||0)+1);
fs.writeFileSync('app.json',JSON.stringify(app,null,2)+'\n');
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log(next);
"@ $Bump
  if ($LASTEXITCODE -ne 0) { Die "Version bump failed." }
}

$appJson = Get-Content (Join-Path $Root 'app.json') -Raw | ConvertFrom-Json
$Version = $appJson.expo.version
$VersionCode = $appJson.expo.android.versionCode
$Stamp = Get-Date -Format 'yyyy-MM-dd'

$OutDir = Join-Path $Root "release\${Stamp}_v${Version}"
$OutFile = Join-Path $OutDir 'app-release.apk'

Say "version: $Version (versionCode $VersionCode)"
Say "output:  $OutDir"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ($ApiBase -ne '') {
  $env:EXPO_PUBLIC_API_BASE = $ApiBase
  Say "api:     $ApiBase"
} else {
  # localhost in a shared APK is the single most common "it doesn't work on my
  # phone" — the device resolves localhost to itself, not to your machine.
  Warn "No -ApiBase given. The APK will use whatever eas.json or .env sets."
  Warn "If that is localhost, the app will not reach your server from a phone."
}

# ── Build ─────────────────────────────────────────────────────────────────────

if ($Mode -eq 'eas') {
  Step "Building in Expo's cloud"

  npx eas whoami 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Warn "Not signed in to Expo. Running 'npx eas login'..."
    npx eas login
    if ($LASTEXITCODE -ne 0) { Die "Expo login failed." }
  }

  # --profile preview is the APK profile in eas.json; production builds an AAB,
  # which cannot be installed on a device.
  Say "This runs on Expo's servers and usually takes 10-20 minutes."
  npx eas build --platform android --profile preview --non-interactive --wait
  if ($LASTEXITCODE -ne 0) { Die "EAS build failed." }

  Step "Downloading the APK"
  $url = (npx eas build:list --platform android --status finished --limit 1 --json --non-interactive `
          | ConvertFrom-Json)[0].artifacts.buildUrl
  if ([string]::IsNullOrWhiteSpace($url)) { Die "Could not find the finished build's download URL." }

  Say "from: $url"
  Invoke-WebRequest -Uri $url -OutFile $OutFile
}
else {
  Step "Building locally with Gradle"

  if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    Die "ANDROID_HOME is not set. Install Android Studio, or use -Mode eas instead."
  }

  Step "Generating the native project"
  npx expo prebuild --platform android --clean
  if ($LASTEXITCODE -ne 0) { Die "expo prebuild failed." }

  Push-Location (Join-Path $Root 'android')
  try {
    Step "gradlew assembleRelease"
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { Die "Gradle build failed." }
  } finally {
    Pop-Location
  }

  $built = Join-Path $Root 'android\app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path $built)) {
    # Unsigned output has a different name, and installing it will fail with a
    # confusing parser error rather than saying "this is not signed".
    $unsigned = Join-Path $Root 'android\app\build\outputs\apk\release\app-release-unsigned.apk'
    if (Test-Path $unsigned) {
      Die "Gradle produced an UNSIGNED apk. Set up a signing config (or use -Mode eas, which signs for you)."
    }
    Die "No APK found at $built"
  }
  Copy-Item $built $OutFile -Force
}

# ── Report ────────────────────────────────────────────────────────────────────

if (-not (Test-Path $OutFile)) { Die "The build finished but no APK arrived at $OutFile" }

$sizeMb = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
$sha = (Get-FileHash $OutFile -Algorithm SHA256).Hash.Substring(0, 16)

# A short note beside the APK, so whoever finds this folder in three months
# knows what it is and what server it points at.
@"
Learning App - Android release
------------------------------
version      : $Version (versionCode $VersionCode)
built        : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
build mode   : $Mode
api base     : $(if ($ApiBase -ne '') { $ApiBase } else { '(from eas.json / .env)' })
size         : $sizeMb MB
sha256 (16)  : $sha

To install on an Android phone:
  1. Copy app-release.apk to the device (WhatsApp, email, USB, a link).
  2. Open it. Android will ask to allow installs from this source - allow it.
  3. If "App not installed" appears, an older copy signed with a different key
     is already there. Uninstall that first.

This APK is for direct sharing and testing. The Play Store needs an AAB:
  npm run build:android:aab
"@ | Out-File -FilePath (Join-Path $OutDir 'README.txt') -Encoding utf8

Write-Host ""
Write-Host "  Done" -ForegroundColor Green
Write-Host "  $OutFile"
Write-Host "  $sizeMb MB - share this file directly with testers"
Write-Host ""

# Open the folder so the file is right there to drag into a chat.
Start-Process explorer.exe $OutDir
