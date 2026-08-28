<#
.SYNOPSIS
  One command to a shareable release APK on Windows.

.DESCRIPTION
  Produces release\<yyyy-MM-dd>_v<version>\app-release.apk — a file you can send
  straight to a tester over WhatsApp, email or a link, plus a README.txt beside
  it recording what that build points at.

  An APK installs directly on a phone. An AAB (what Play wants) does not, which
  is why this builds the APK and `npm run build:android:aab` exists separately.

  Modes:

    -Mode auto   (default) Local Gradle if the Android SDK and a JDK are here,
                 otherwise Expo's cloud.

    -Mode local  Gradle on this machine. Needs ANDROID_HOME and a JDK 17+. No
                 Expo account. First run creates a release signing key in
                 ~/.keys/<slug>/ and wires it in.

    -Mode eas    Expo's cloud. Needs an Expo account and `eas init` once. No
                 Android SDK required.

.EXAMPLE
  npm run apk
  npm run apk -- -ApiBase https://api.myagemap.com
  npm run apk -- -Bump patch
  npm run apk -- -Mode eas
#>

[CmdletBinding()]
param(
  [ValidateSet('auto', 'eas', 'local')]
  [string]$Mode = 'auto',

  # Baked into the bundle at build time. Left empty, this machine's LAN address
  # is detected and used, which is what a tester's phone can actually reach.
  [string]$ApiBase = '',

  # Port the API listens on, used only when ApiBase is being detected.
  [int]$ApiPort = 8100,

  <#
    How much of the machine the build may use.

    Two, not the core count. Gradle's default is one worker per core, which on a
    sixteen-core laptop means sixteen concurrent JVM workers plus a Kotlin
    daemon plus ninja on every core — enough to exhaust 16GB and leave the
    machine swapping rather than merely busy. Raise it on a workstation with
    memory to spare.
  #>
  [int]$MaxWorkers = 2,

  [ValidateSet('none', 'patch', 'minor', 'major')]
  [string]$Bump = 'none',

  # Skip `expo prebuild`. Faster on a rebuild, but any app.json change is
  # ignored — prebuild is what turns app.json into the native project.
  [switch]$NoPrebuild,

  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Say($m)  { Write-Host "  $m" }
function Step($m) { Write-Host ""; Write-Host "  == $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host ""; Write-Host "  x $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Learning App - release APK" -ForegroundColor White

# ── Prerequisites ─────────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die "Node.js is not on PATH." }
if (-not (Test-Path (Join-Path $Root 'app.json')))          { Die "Run this from the app-code folder." }

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
$hasSdk  = -not [string]::IsNullOrWhiteSpace($sdk) -and (Test-Path $sdk)
$hasJava = [bool](Get-Command java -ErrorAction SilentlyContinue)

if ($Mode -eq 'auto') {
  if ($hasSdk -and $hasJava) { $Mode = 'local' } else { $Mode = 'eas' }
  Say "mode: $Mode (auto-detected)"
} else {
  Say "mode: $Mode"
}

# Gradle and the Android plugin look at JAVA_HOME before PATH, and report its
# absence as an unrelated toolchain error.
if ($Mode -eq 'local' -and -not $env:JAVA_HOME) {
  $javaExe = (Get-Command java -ErrorAction SilentlyContinue).Source
  if ($javaExe) {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javaExe)
    Say "JAVA_HOME was unset - using $($env:JAVA_HOME)"
  }
}

if (-not $SkipInstall -and -not (Test-Path (Join-Path $Root 'node_modules'))) {
  Step "Installing dependencies"
  npm install
  if ($LASTEXITCODE -ne 0) { Die "npm install failed." }
  npm run setup
  if ($LASTEXITCODE -ne 0) { Die "npm run setup failed." }
}

# ── Version ───────────────────────────────────────────────────────────────────

if ($Bump -ne 'none') {
  Step "Bumping version ($Bump)"
  node scripts/bump-version.mjs $Bump
  if ($LASTEXITCODE -ne 0) { Die "Version bump failed." }
}

$appJson     = Get-Content (Join-Path $Root 'app.json') -Raw | ConvertFrom-Json
$Version     = $appJson.expo.version
$VersionCode = $appJson.expo.android.versionCode
$Stamp       = Get-Date -Format 'yyyy-MM-dd'

$OutDir  = Join-Path $Root "release\${Stamp}_v${Version}"
$OutFile = Join-Path $OutDir 'app-release.apk'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Say "version: $Version (versionCode $VersionCode)"
Say "output:  $OutDir"

<#
  Work out which address the APK should call.

  A phone cannot reach your laptop's localhost - it resolves that to itself - so
  an APK built without a real address connects to nothing and looks broken with
  no error worth reading. Rather than make that a flag people must remember,
  detect this machine's LAN address and use it.

  Detection picks the interface that actually carries traffic: the one with a
  default gateway, lowest metric first. Sorting by metric matters on a laptop
  with Wi-Fi plus disconnected adapters and VPN or WSL virtual ones, which
  otherwise win by luck of enumeration order.
#>
function Get-LanAddress {
  try {
    $best = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
            Sort-Object { $_.NetIPv4Interface.InterfaceMetric } |
            Select-Object -First 1
    if ($best) { return $best.IPv4Address.IPAddress }
  } catch { }

  # Fallback for older PowerShell or an unusual adapter set.
  try {
    return (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
              $_.IPAddress -ne '127.0.0.1' -and
              $_.IPAddress -notlike '169.254.*' -and
              $_.PrefixOrigin -in @('Dhcp', 'Manual')
            } |
            Sort-Object InterfaceMetric |
            Select-Object -First 1 -ExpandProperty IPAddress)
  } catch { return $null }
}

<#
  Precedence: the flag, then a deployed address already in .env, then detection.

  Detecting a LAN address is right when .env holds nothing useful, and wrong
  when someone has deliberately pointed the app at a real server - overwriting
  that with 192.168.x.y would quietly undo the change and produce an APK that
  only works on one Wi-Fi network.

  "Deployed" means anything that is not loopback or a private range. A LAN
  address in .env is treated as detectable, since it goes stale whenever the
  laptop moves to a different network.
#>
function Test-IsDeployedAddress($value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $false }
  $host_ = ($value -replace '^https?://', '') -replace '[:/].*$', ''
  if ($host_ -match '^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') { return $false }
  return $true
}

if ($ApiBase -ne '') {
  Say "api:     $ApiBase  (from -ApiBase)"
} else {
  $envFile = Join-Path $Root '.env'
  $fromEnv = ''
  if (Test-Path $envFile) {
    $m = Select-String -Path $envFile -Pattern '^\s*EXPO_PUBLIC_API_BASE\s*=\s*(.+?)\s*$' |
         Select-Object -First 1
    if ($m) { $fromEnv = $m.Matches[0].Groups[1].Value }
  }

  if (Test-IsDeployedAddress $fromEnv) {
    $ApiBase = $fromEnv
    Say "api:     $ApiBase  (from .env)"
    Say "         a deployed address, so LAN detection is skipped"
  } else {
    $lan = Get-LanAddress
    if ($lan) {
      $ApiBase = "http://${lan}:$ApiPort"
      Say "api:     $ApiBase  (detected)"
      Say "         testers must be on the same Wi-Fi, and the API must be running"
      if ($fromEnv) { Say "         replacing the local address in .env ($fromEnv)" }
    } else {
      Warn "Could not detect a LAN address. The APK will use whatever .env sets."
      Warn "If that is localhost, testers' phones will reach nothing."
      Warn "Pass one explicitly:  -ApiBase http://192.168.1.6:$ApiPort"
    }
  }
}

<#
  Write the address into .env, not just the environment.

  Gradle decides whether to re-bundle the JavaScript by comparing file inputs.
  An environment variable is not one, so exporting EXPO_PUBLIC_API_BASE and
  rebuilding produces an APK containing the PREVIOUS address while every log
  line and the README report the new one - an APK that cannot reach the server,
  described by a file that says it can.

  .env is a real input, so changing it invalidates the bundle task. Only this
  one key is rewritten; anything else in the file is preserved.
#>
if ($ApiBase -ne '') {
  $env:EXPO_PUBLIC_API_BASE = $ApiBase

  $envFile = Join-Path $Root '.env'
  $lines = if (Test-Path $envFile) {
    @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*EXPO_PUBLIC_API_BASE\s*=' })
  } else { @() }
  $lines += "EXPO_PUBLIC_API_BASE=$ApiBase"
  Set-Content -Path $envFile -Value $lines -Encoding ascii

  # Belt and braces: even with .env changed, a stale generated bundle can be
  # picked up by the asset merge. Removing it forces a real re-bundle.
  $generated = Join-Path $Root 'android\app\build\generated\assets\react'
  if (Test-Path $generated) { Remove-Item $generated -Recurse -Force -ErrorAction SilentlyContinue }
}

# ── Build ─────────────────────────────────────────────────────────────────────

if ($Mode -eq 'local') {

  if (-not $hasSdk)  { Die "ANDROID_HOME is not set. Install Android Studio, or use -Mode eas." }
  if (-not $hasJava) { Die "No JDK on PATH. Install one (17 or newer), or use -Mode eas." }
  Say "sdk:     $sdk"

  $androidDir  = Join-Path $Root 'android'
  $hashFile    = Join-Path $androidDir '.prebuild-hash'
  $hasAndroid  = Test-Path (Join-Path $androidDir 'gradlew.bat')

  <#
    Regenerate android\ only when the config that produces it has changed.

    `expo prebuild` deletes and recreates the folder — android\ is gitignored,
    and Expo treats a gitignored native directory as disposable, so it clears
    even without --clean. Anything with the folder open fails the whole build
    with EBUSY, and on Windows a directory that is some process's working
    directory cannot be renamed or removed no matter what is closed.

    Since the folder is a pure function of app.json plus the installed native
    packages, regenerating it when neither has changed is wasted work that only
    creates a chance to fail. Hashing those inputs makes the common rebuild
    skip prebuild entirely, which is both faster and immune to the lock.
  #>
  $inputs = @('app.json', 'package.json') |
            ForEach-Object { Get-FileHash (Join-Path $Root $_) -Algorithm SHA256 } |
            ForEach-Object { $_.Hash }
  $currentHash = ($inputs -join '-')
  $storedHash  = if (Test-Path $hashFile) { (Get-Content $hashFile -Raw).Trim() } else { '' }

  $needsPrebuild = -not $hasAndroid -or ($currentHash -ne $storedHash)

  if ($NoPrebuild) {
    if (-not $hasAndroid) { Die "-NoPrebuild was given but there is no android\ folder yet." }
    Say "prebuild: skipped (-NoPrebuild)"
    $needsPrebuild = $false
  } elseif (-not $needsPrebuild) {
    Say "prebuild: skipped - app.json and package.json are unchanged"
  }

  if ($needsPrebuild) {

    # A live daemon is the one holder that can be released cleanly.
    if ($hasAndroid) {
      Step "Stopping Gradle daemons"
      Push-Location $androidDir
      try { .\gradlew.bat --stop 2>&1 | Select-Object -Last 1 } catch { Warn "gradlew --stop failed; carrying on" }
      Pop-Location
    }

    Step "Generating the native project (expo prebuild)"
    Say "app.json or package.json changed, so android\ has to be rebuilt."

    $prebuilt = $false
    for ($attempt = 1; $attempt -le 3 -and -not $prebuilt; $attempt++) {
      npx expo prebuild --platform android --clean
      if ($LASTEXITCODE -eq 0) { $prebuilt = $true; break }
      if ($attempt -lt 3) {
        # A handle released a moment ago can still block a rmdir; a short wait
        # clears that without a retry loop that would hide a real problem.
        Warn "prebuild failed (folder is locked). Retrying in 5s... ($attempt/3)"
        Start-Sleep -Seconds 5
      }
    }

    if ($prebuilt) {
      Set-Content -Path $hashFile -Value $currentHash -Encoding ascii
    } elseif ($hasAndroid) {
      # An existing native project is still buildable. Refusing to build at all
      # because the folder could not be *replaced* would be the wrong trade —
      # the APK is usually still correct, and where it is not, saying so is
      # more useful than stopping.
      Warn "Could not regenerate android\ - something has the folder open."
      Warn "Building from the existing native project instead."
      Warn "If a recent app.json change is missing from the APK, close your dev"
      Warn "server and any editor with the project open, then run again."
    } else {
      $blockers = @()
      Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'expo start|GradleDaemon|studio64|adb' } |
        ForEach-Object {
          $blockers += ("    PID {0}  {1}" -f $_.ProcessId, $_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length)))
        }
      $found = if ($blockers.Count) { "`n`nProcesses that may be holding it:`n" + ($blockers -join "`n") } else { "" }

      Die @"
Could not create android\, and there is no existing one to fall back on.

Close whichever of these is running, then re-run:
  1. A dev server - ``npm run android`` or ``expo start``.
  2. Android Studio, or VS Code's Gradle / Java extension.
  3. A terminal or Explorer window sitting inside android\.$found
"@
    }
  }

  # prebuild --clean regenerates android/, so this must run after it, every time.
  Step "Setting up release signing"
  node scripts/ensure-signing.mjs
  if ($LASTEXITCODE -ne 0) { Die "Signing setup failed." }

  Step "gradlew assembleRelease"
  Say "Capped to $MaxWorkers worker(s) so the machine stays usable while it runs."
  Say "First run downloads Gradle and the Android toolchain - expect 15-30 minutes."

  <#
    Cap the C++ side too.

    --max-workers bounds Gradle's own task pool, but the native build shells out
    to ninja, which defaults to one job per core regardless. On sixteen cores
    that is sixteen compilers running inside a single Gradle worker that Gradle
    counts as one. CMake reads this variable, so it is the lever that reaches
    inside externalNativeBuild.
  #>
  $env:CMAKE_BUILD_PARALLEL_LEVEL = "$MaxWorkers"

  Push-Location (Join-Path $Root 'android')
  try {
    # --no-daemon so the JVM exits when the build does. A daemon left resident
    # keeps its heap for hours, which is the memory people notice long after
    # they stopped building.
    .\gradlew.bat assembleRelease --no-daemon --max-workers=$MaxWorkers
    if ($LASTEXITCODE -ne 0) {
      Die @"
Gradle build failed. Scroll up for the first error.

If it ran out of memory, give it more for one run:
  `$env:GRADLE_HEAP='2560m'; npm run apk
"@
    }
  } finally {
    Pop-Location
  }

  $built    = Join-Path $Root 'android\app\build\outputs\apk\release\app-release.apk'
  $unsigned = Join-Path $Root 'android\app\build\outputs\apk\release\app-release-unsigned.apk'

  # Recreate the output folder rather than trusting the one made before the
  # build. A release build runs for minutes, and anything can happen to a
  # directory in that time - clearing out old builds while waiting is the
  # obvious one. Failing at the copy after a successful build wastes the whole
  # run for no reason.
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

  if (Test-Path $built) {
    Copy-Item $built $OutFile -Force
  } elseif (Test-Path $unsigned) {
    # Installing this fails with "There was a problem parsing the package",
    # which says nothing about signing - so stop here instead.
    Die "Gradle produced an UNSIGNED apk. Signing setup did not take effect."
  } else {
    Die "No APK at $built"
  }

} else {

  Step "Building in Expo's cloud"

  $projectId = $appJson.expo.extra.eas.projectId
  if ($projectId -like 'REPLACE_*' -or [string]::IsNullOrWhiteSpace($projectId)) {
    Warn "No EAS project linked yet. Running 'eas init'..."
    npx eas init
    if ($LASTEXITCODE -ne 0) { Die "eas init failed. Sign in with 'npx eas login' first." }
  }

  npx eas whoami 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Warn "Not signed in to Expo. Running 'npx eas login'..."
    npx eas login
    if ($LASTEXITCODE -ne 0) { Die "Expo login failed." }
  }

  # --profile preview is the APK profile in eas.json; production builds an AAB,
  # which cannot be installed on a device.
  Say "This runs on Expo's servers and usually takes 10-20 minutes."
  $json = npx eas build --platform android --profile preview --non-interactive --wait --json
  if ($LASTEXITCODE -ne 0) { Die "EAS build failed." }

  Step "Downloading the APK"
  $build = ($json | ConvertFrom-Json)
  if ($build -is [array]) { $build = $build[0] }

  # eas-cli has used both names for this field across versions.
  $url = $build.artifacts.buildUrl
  if (-not $url) { $url = $build.artifacts.applicationArchiveUrl }
  if ([string]::IsNullOrWhiteSpace($url)) { Die "The build finished but no download URL came back." }

  Say "from: $url"
  Invoke-WebRequest -Uri $url -OutFile $OutFile
}

# ── Report ────────────────────────────────────────────────────────────────────

if (-not (Test-Path $OutFile)) { Die "The build finished but no APK arrived at $OutFile" }

<#
  Confirm the APK really contains the address it is about to be labelled with.

  This exists because it already went wrong: a cached JS bundle produced an APK
  holding the previous address while the README stated the new one. A build that
  quietly ships the wrong server is worse than one that fails, because nothing
  looks broken until a tester says the app does nothing.
#>
if ($ApiBase -ne '') {
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($OutFile)
    try {
      $entry = $zip.Entries | Where-Object { $_.FullName -eq 'assets/index.android.bundle' }
      if ($entry) {
        $reader = New-Object System.IO.StreamReader($entry.Open())
        $bundle = $reader.ReadToEnd()
        $reader.Dispose()

        if ($bundle.Contains($ApiBase)) {
          Say "verified: the APK points at $ApiBase"
        } else {
          $found = [regex]::Matches($bundle, 'https?://[0-9A-Za-z\.\-]+:\d+') |
                   ForEach-Object { $_.Value } | Sort-Object -Unique | Select-Object -First 3
          Warn "The APK does NOT contain $ApiBase"
          if ($found) { Warn "It points at: $($found -join ', ')" }
          Warn "The JS bundle was reused from an earlier build. Delete android\app\build"
          Warn "and run again, or use: npm run apk -- -Bump patch"
        }
      }
    } finally { $zip.Dispose() }
  } catch {
    Warn "Could not inspect the APK to confirm its API address: $($_.Exception.Message)"
  }
}

$sizeMb = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
$sha    = (Get-FileHash $OutFile -Algorithm SHA256).Hash.Substring(0, 16)
$api    = if ($ApiBase -ne '') { $ApiBase } else { '(from .env / eas.json)' }

# A note beside the APK, so whoever finds this folder in three months knows what
# it is and which server it talks to.
@"
Learning App - Android release
------------------------------
version      : $Version (versionCode $VersionCode)
built        : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
build mode   : $Mode
api base     : $api
size         : $sizeMb MB
sha256 (16)  : $sha

To install on an Android phone:
  1. Copy app-release.apk to the device (WhatsApp, email, USB, a link).
  2. Open it. Android will ask to allow installs from this source - allow it.
  3. If "App not installed" appears, an older copy signed with a different key
     is already there. Uninstall that first.

This APK is for direct sharing and testing. The Play Store needs an AAB:
  npm run build:android:aab
"@ | Out-File -FilePath (Join-Path $OutDir 'README.txt') -Encoding ascii

Write-Host ""
Write-Host "  Done" -ForegroundColor Green
Write-Host "  $OutFile"
Write-Host "  $sizeMb MB - share this file directly with testers"
Write-Host ""

Start-Process explorer.exe $OutDir
