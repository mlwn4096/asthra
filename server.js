/**
 * ASTRA 11.0: BUILD-A-BOT — LIGHTWEIGHT SYNC SERVER
 * Built-in Node.js HTTP server for real-time LAN / Wi-Fi timer & leaderboard sync.
 * Zero npm dependencies.
 *
 * Usage:
 *   node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// In-Memory Synchronized Timer State (3m presentation + 2m Q&A split)
let timerState = {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
  duration: 300,  // seconds
  remaining: 300,
  startTimestamp: null,
  endTimestamp: null,
  lastUpdated: Date.now()
};

// In-Memory Leaderboard State (Locked by default until pushed)
let leaderboardState = {
  isUnlocked: false,
  teams: [],
  publishedAt: null
};

// Connected Server-Sent Event (SSE) Clients
const sseClients = new Set();

function broadcastSSE() {
  const payload = `data: ${JSON.stringify({ timer: timerState, leaderboard: leaderboardState })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (err) {
      sseClients.delete(res);
    }
  }
}

// Background Ticker
setInterval(() => {
  if (timerState.status === 'running' && timerState.endTimestamp) {
    const diff = Math.ceil((timerState.endTimestamp - Date.now()) / 1000);
    const prev = timerState.remaining;
    timerState.remaining = Math.max(0, diff);

    if (timerState.remaining === 0 && prev !== 0) {
      timerState.status = 'stopped';
      broadcastSSE();
    }
  }
}, 1000);

// MIME Types Map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf'
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // CORS Headers for API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE Stream Endpoint
  if (pathname === '/api/timer/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ timer: timerState, leaderboard: leaderboardState })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Timer REST API
  if (pathname === '/api/timer') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(timerState));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const updated = JSON.parse(body);
          if (updated && typeof updated === 'object') {
            timerState = Object.assign({}, timerState, updated, { lastUpdated: Date.now() });
            broadcastSSE();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, state: timerState }));
            return;
          }
        } catch (e) {}
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON timer state' }));
      });
      return;
    }
  }

  // Leaderboard REST API
  if (pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(leaderboardState));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const updated = JSON.parse(body);
          if (updated && typeof updated === 'object') {
            leaderboardState = Object.assign({}, leaderboardState, updated);
            broadcastSSE();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, state: leaderboardState }));
            return;
          }
        } catch (e) {}
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON leaderboard state' }));
      });
      return;
    }
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security Check: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.pdf' || ext.startsWith('.ttf') ? 'public, max-age=86400' : 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('================================================================');
  console.log('  ASTRA 11.0 // BUILD-A-BOT SPRINT SERVER ONLINE');
  console.log('================================================================');
  console.log(`  > Local Participant URL:  http://localhost:${PORT}`);
  console.log(`  > Network Wi-Fi URL:      http://${localIP}:${PORT}`);
  console.log(`  > Admin Dashboard URL:    http://${localIP}:${PORT}/admin.html`);
  console.log('----------------------------------------------------------------');
  console.log('  Ready. Timer & Leaderboard live sync active.');
  console.log('================================================================');
});
