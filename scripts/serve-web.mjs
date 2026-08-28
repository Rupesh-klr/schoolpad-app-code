#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Serve the exported web build.
 *
 * This is what `npm start` runs in production, and what a Node host (Hostinger,
 * Render, Railway) executes after `npm run build`.
 *
 * Zero dependencies on purpose: a static server that needs `npm ci` to have
 * succeeded is a static server that can be taken down by an unrelated package.
 *
 * `expo export` with `output: "static"` pre-renders every route to its own HTML
 * file rather than producing one SPA shell, so resolution is more than a
 * fallback to index.html — see resolve() below.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hosts assign the port; the fallback is only for running this by hand.
const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Where the exported site is.
 *
 * `build` first because that is what the npm script emits and what most hosts
 * default their output directory to; `dist` second because it is Expo's own
 * default and what an older export or a plain `expo export` leaves behind.
 * Accepting both means the server does not break when only one of the two is
 * changed.
 */
function findRoot() {
  if (process.env.WEB_DIST) return path.resolve(process.env.WEB_DIST);

  const root = path.join(__dirname, '..');
  for (const dir of ['build', 'dist']) {
    const candidate = path.join(root, dir);
    if (fs.existsSync(path.join(candidate, 'index.html'))) return path.resolve(candidate);
  }
  return path.resolve(path.join(root, 'build'));
}

const ROOT = findRoot();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`\n  x No web build at ${ROOT}`);
  console.error('    Run `npm run build` first.\n');
  process.exit(1);
}

/** Does this path exist and is it a file? */
const isFile = (p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
};

/**
 * Find the dynamic route file for a directory, e.g. class/[id].html.
 *
 * Expo names dynamic segments with square brackets on disk, so /class/5 has no
 * file of its own — it is served by class/[id].html, which then reads the real
 * id from the URL on the client.
 */
function dynamicMatch(dir) {
  try {
    const hit = fs.readdirSync(dir).find((f) => f.startsWith('[') && f.endsWith('.html'));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

/**
 * Map a URL path to a file on disk.
 *
 * Order matters: an exact asset must win over a route, and a concrete route
 * must win over the dynamic one in the same folder, or /class/new would be
 * swallowed by /class/[id].
 */
function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = path.posix.normalize(clean).replace(/^\/+/, '');
  const full = path.resolve(ROOT, rel);

  // Never serve outside the build. path.join walks upwards happily, so this
  // check is what stops /../../.env being readable.
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;

  if (isFile(full)) return full;                                   // asset
  if (isFile(`${full}.html`)) return `${full}.html`;               // /dashboard
  if (isFile(path.join(full, 'index.html'))) return path.join(full, 'index.html');

  const dyn = dynamicMatch(path.dirname(full));                    // /class/5
  if (dyn) return dyn;

  // Expo emits this for unmatched routes; it renders the app's own 404 rather
  // than a bare server error page.
  const notFound = path.join(ROOT, '+not-found.html');
  if (isFile(notFound)) return notFound;

  return path.join(ROOT, 'index.html');
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  // Answered before any file lookup, so it stays true while the build
  // directory is being replaced mid-deploy.
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ status: 'ok', root: ROOT, uptime: Math.round(process.uptime()) }));
  }

  const file = resolve(req.url || '/');
  if (!file) {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  const ext = path.extname(file).toLowerCase();
  const isHtml = ext === '.html';

  /*
   * Content-hashed files can be cached forever; HTML never can.
   *
   * An HTML file carries the current bundle hashes, so a cached copy points at
   * files the next deploy deletes and the app fails to boot with no obvious
   * cause. Every route here is the same shell, which makes that failure total
   * rather than partial.
   *
   * Expo splits hashed output across two places — `_expo/static/` for the JS
   * and CSS, `assets/` for images and fonts — so both have to be listed.
   * Missing one is silent: it just serves a 40MB bundle again on every visit.
   */
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const hashed = rel.startsWith('_expo/static/') || rel.startsWith('assets/');

  const cache = isHtml
    ? 'no-cache, no-store, must-revalidate'
    : hashed
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';

  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  };

  // 404 for a URL that fell through to the not-found page — a soft 200 there
  // tells crawlers and monitoring that a broken link is fine.
  const status = isHtml && path.basename(file) === '+not-found.html' ? 404 : 200;

  if (req.method === 'HEAD') {
    res.writeHead(status, headers);
    return res.end();
  }

  res.writeHead(status, headers);
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  return stream.pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  x Port ${PORT} is already in use.\n`);
    process.exit(1);
  }
  console.error('  x Server error:', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Learning App - web');
  console.log(`  > http://${HOST}:${PORT}`);
  console.log(`  > serving ${ROOT}`);
  console.log(`  > health  /healthz`);
  console.log('');
});

// Hosts send SIGTERM on redeploy; closing cleanly avoids a burst of connection
// errors in the log every time.
const shutdown = (sig) => {
  console.log(`${sig} received - shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
