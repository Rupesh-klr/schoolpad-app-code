#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One command to cut a release across all three platforms.
 *
 *   node scripts/release.js                    # bump patch, build web + android + ios
 *   node scripts/release.js --minor            # bump the minor version instead
 *   node scripts/release.js --only web,android
 *   node scripts/release.js --no-bump          # rebuild the current version
 *   node scripts/release.js --dry-run          # print what would run
 *
 * Android versionCode and iOS buildNumber are bumped together with the marketing
 * version. Play and App Store Connect both reject an upload whose build number
 * is not higher than the last one, and hand-editing two numbers in two places is
 * how that gets forgotten.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_JSON = path.join(ROOT, 'app.json');
const PKG_JSON = path.join(ROOT, 'package.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i === -1 ? null : argv[i + 1];
};

const DRY = has('--dry-run');
const NO_BUMP = has('--no-bump');
const LEVEL = has('--major') ? 'major' : has('--minor') ? 'minor' : 'patch';
const ONLY = (valueOf('--only') || 'web,android,ios').split(',').map((s) => s.trim());

function run(cmd) {
  console.log(`\n  $ ${cmd}`);
  if (DRY) return;
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function bump(version, level) {
  const [maj, min, pat] = version.split('.').map(Number);
  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
const pkgJson = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));

const current = appJson.expo.version;
const next = NO_BUMP ? current : bump(current, LEVEL);

if (!NO_BUMP) {
  appJson.expo.version = next;
  appJson.expo.android.versionCode = Number(appJson.expo.android.versionCode || 0) + 1;
  appJson.expo.ios.buildNumber = String(Number(appJson.expo.ios.buildNumber || 0) + 1);
  pkgJson.version = next;

  if (!DRY) {
    // Trailing newline so the diff is one line, not two.
    fs.writeFileSync(APP_JSON, `${JSON.stringify(appJson, null, 2)}\n`);
    fs.writeFileSync(PKG_JSON, `${JSON.stringify(pkgJson, null, 2)}\n`);
  }
}

console.log('');
console.log('  Release');
console.log(`  ▸ version      ${current} → ${next}`);
console.log(`  ▸ versionCode  ${appJson.expo.android.versionCode} (android)`);
console.log(`  ▸ buildNumber  ${appJson.expo.ios.buildNumber} (ios)`);
console.log(`  ▸ platforms    ${ONLY.join(', ')}`);
if (DRY) console.log('  ▸ DRY RUN — nothing will be built');

if (ONLY.includes('web')) {
  run('npx expo export --platform web');
  console.log('\n  ✔ web bundle in ./dist — deploy that directory to any static host');
}

// EAS builds run in Expo's cloud, so an iOS build works from Windows. That is
// the whole reason this project uses EAS rather than local Gradle and Xcode.
if (ONLY.includes('android')) run('npx eas build --platform android --profile production --non-interactive');
if (ONLY.includes('ios'))     run('npx eas build --platform ios --profile production --non-interactive');

console.log('');
console.log('  Next:');
console.log('    npx eas submit --platform android --latest');
console.log('    npx eas submit --platform ios --latest');
console.log('');
