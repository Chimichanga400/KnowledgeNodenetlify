#!/usr/bin/env node
/**
 * serve-local.js — host Stretch the Rand on your own computer.
 *
 * Needs only Node.js (https://nodejs.org — any recent version, no npm installs).
 * Put this file in the same folder as stretch-the-rand.html (or the stretch/
 * folder of the repo) and run ONE of:
 *
 *   1) Use your own Anthropic API key (no Netlify needed at all):
 *        ANTHROPIC_API_KEY=sk-ant-...  node serve-local.js
 *      (Windows cmd:  set ANTHROPIC_API_KEY=sk-ant-... && node serve-local.js)
 *
 *   2) Relay AI calls to your Netlify site's claude-proxy:
 *        node serve-local.js --remote https://your-site.netlify.app
 *
 *   3) No AI (everything except scanning/plan-building still works):
 *        node serve-local.js
 *
 * Then open the printed address — the "phone" one works from any phone on the
 * same Wi-Fi. Optional: --port 8787 (default), --key sk-ant-... (same as env var).
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ---- options ---- */
const args = process.argv.slice(2);
function argVal(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
}
const PORT = parseInt(argVal('--port'), 10) || 8787;
const API_KEY = argVal('--key') || process.env.ANTHROPIC_API_KEY || '';
const REMOTE = (argVal('--remote') || process.env.STRETCH_REMOTE || '').replace(/\/+$/, '');

/* ---- static files ---- */
const DIR = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
// prefer the single-file build; fall back to the multi-file app
const HOME_PAGE = fs.existsSync(path.join(DIR, 'stretch-the-rand.html'))
  ? 'stretch-the-rand.html'
  : 'index.html';

/* ---- AI forwarding ---- */
function forward(clientReq, clientRes, body) {
  let target, extraHeaders;
  if (API_KEY) {
    target = new URL('https://api.anthropic.com/v1/messages');
    extraHeaders = { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' };
  } else if (REMOTE) {
    target = new URL(REMOTE + '/.netlify/functions/claude-proxy');
    extraHeaders = {};
    // pass the app's identification headers through to the Netlify proxy
    for (const h of ['x-app-token', 'x-app-user-id']) {
      if (clientReq.headers[h]) extraHeaders[h] = clientReq.headers[h];
    }
  } else {
    clientRes.writeHead(503, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({ error: { message:
      'AI is not set up on this local server. Restart it with your Anthropic API key (ANTHROPIC_API_KEY=... node serve-local.js) or point it at your Netlify site (node serve-local.js --remote https://your-site.netlify.app).' } }));
    return;
  }

  const upstream = https.request(target, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, extraHeaders),
  }, (upRes) => {
    clientRes.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
    upRes.pipe(clientRes);
  });
  upstream.on('error', (err) => {
    clientRes.writeHead(502, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({ error: { message: 'Could not reach the AI service: ' + err.message } }));
  });
  upstream.setTimeout(120000, () => upstream.destroy(new Error('timed out')));
  upstream.end(body);
}

/* ---- server ---- */
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/.netlify/functions/claude-proxy') {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 30 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => forward(req, res, Buffer.concat(chunks)));
    return;
  }

  let rel = urlPath === '/' ? HOME_PAGE : urlPath.replace(/^\/+/, '');
  const file = path.join(DIR, rel);
  // stay inside this folder
  if (!file.startsWith(DIR) || rel.includes('..')) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let lan = '';
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) { lan = n.address; break; }
    }
    if (lan) break;
  }
  console.log('');
  console.log('  Stretch the Rand is running (serving ' + HOME_PAGE + ')');
  console.log('');
  console.log('  On this computer:  http://localhost:' + PORT);
  if (lan) console.log('  On your phone:     http://' + lan + ':' + PORT + '   (same Wi-Fi)');
  console.log('');
  if (API_KEY) console.log('  AI: using your Anthropic API key directly.');
  else if (REMOTE) console.log('  AI: relaying to ' + REMOTE);
  else console.log('  AI: NOT set up — see the notes at the top of this file to enable it.');
  console.log('');
  console.log('  Stop with Ctrl+C.');
});
