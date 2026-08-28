#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bump the version in app.json and package.json together.
 *
 *   node scripts/bump-version.js patch|minor|major
 *
 * Android's versionCode and iOS's buildNumber move with it. Both stores reject
 * an upload whose build number is not strictly higher than the last one, and
 * keeping the three numbers in one place is what stops "I bumped the version
 * but forgot the versionCode" happening on a Friday.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const level = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error(`  x Unknown bump level "${level}". Use patch, minor or major.`);
  process.exit(1);
}

const appPath = path.join(ROOT, 'app.json');
const pkgPath = path.join(ROOT, 'package.json');

const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const current = app.expo.version || '0.0.0';
const [a, b, c] = current.split('.').map((n) => Number(n) || 0);

const next = level === 'major' ? `${a + 1}.0.0`
  : level === 'minor' ? `${a}.${b + 1}.0`
    : `${a}.${b}.${c + 1}`;

app.expo.version = next;
pkg.version = next;
app.expo.android.versionCode = Number(app.expo.android.versionCode || 0) + 1;
app.expo.ios.buildNumber = String(Number(app.expo.ios.buildNumber || 0) + 1);

// Trailing newline so the diff is one line, not two.
fs.writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`  ${current} -> ${next}`);
console.log(`  versionCode ${app.expo.android.versionCode} (android)`);
console.log(`  buildNumber ${app.expo.ios.buildNumber} (ios)`);
