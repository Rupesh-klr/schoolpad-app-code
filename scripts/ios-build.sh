#!/usr/bin/env bash
#
# Build an .ipa on a Mac, without Xcode's UI.
#
# Only needed if you are not using `eas build --platform ios`, which builds on
# Expo's Macs and works from Windows. Use this when you need a local archive —
# debugging native code, or profiling in Instruments.
#
#   bash scripts/ios-build.sh                 # archive + export an .ipa
#   bash scripts/ios-build.sh --archive-only  # stop after the archive
#
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "✖ This script only runs on macOS."
  echo "  From Windows or Linux use:  npm run build:ios   (builds in Expo's cloud)"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCHEME="${IOS_SCHEME:-App}"
ARCHIVE="$ROOT/build/App.xcarchive"
EXPORT_DIR="$ROOT/build/ipa"
EXPORT_PLIST="$ROOT/scripts/ExportOptions.plist"

echo ""
echo "  iOS build"
echo "  ▸ root    $ROOT"
echo "  ▸ scheme  $SCHEME"
echo ""

for tool in xcodebuild pod node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "✖ $tool not found on PATH"; exit 1; }
done

# 1. Generate the native project from app.json. --clean because a stale ./ios
#    left over from an older app.json is the most common source of "this setting
#    isn't taking effect".
echo "  → expo prebuild"
npx expo prebuild --platform ios --clean

# 2. CocoaPods. Every Expo module ships native code that arrives this way.
echo "  → pod install"
( cd ios && pod install )

if [[ ! -f "$EXPORT_PLIST" ]]; then
  echo "✖ Missing $EXPORT_PLIST"
  echo "  Create it with your team id — see docs/BUILD.md."
  exit 1
fi

# 3. Archive. Note App.xcworkspace, never App.xcodeproj: the pods only exist in
#    the workspace, and building the project file fails on missing headers.
echo "  → xcodebuild archive"
xcodebuild \
  -workspace "ios/App.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  -destination "generic/platform=iOS" \
  clean archive

if [[ "${1:-}" == "--archive-only" ]]; then
  echo ""
  echo "  ✔ Archive at $ARCHIVE"
  echo "    Open it in Xcode → Window → Organizer to distribute."
  exit 0
fi

# 4. Export a signed .ipa.
echo "  → xcodebuild export"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -exportPath "$EXPORT_DIR"

echo ""
echo "  ✔ IPA in $EXPORT_DIR"
echo ""
echo "  Upload with either:"
echo "    xcrun altool --upload-app -f $EXPORT_DIR/*.ipa -u APPLE_ID -p APP_SPECIFIC_PASSWORD"
echo "    npx eas submit --platform ios --path $EXPORT_DIR/*.ipa"
echo ""
