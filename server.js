/**
 * ASTRA 11.0: BUILD-A-BOT — PRODUCTION EVENT & EVALUATION BACKEND
 * 
 * Features:
 *  - Native SQLite Database (via Node 24 node:sqlite) with ACID transactions
 *  - Authoritative Global Event Timer (HH:MM:SS support, start/pause/resume/reset)
 *  - On-The-Spot Judge Provisioning & Management (SHA-256 key hashing)
 *  - Secure Token-Based Judge Authentication (Session exchange)
 *  - Multi-Judge Score Submission & Server-Side 0.5-step Rubric Calculation
 *  - Deterministic Tie-Breaking & Real-Time Jury Matrix Aggregation
 *  - Leaderboard State Machine (EMBARGOED ➔ PUBLISHED) with Certified Snapshots
 *  - Server-Sent Events (SSE) Live Broadcasts across Local Wi-Fi & Web
 * 
 * Zero npm dependencies. Native Node.js built-in modules only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// 1. SQLITE DATABASE PERSISTENCE INITIALIZATION
// ============================================================================
const dbPath = path.join(DATA_DIR, 'asthra.db');
const db = new DatabaseSync(dbPath);

// Enable Write-Ahead Logging or In-Memory journaling for serverless, and Foreign Keys
if (isVercel) {
  db.exec('PRAGMA journal_mode = MEMORY;');
} else {
  db.exec('PRAGMA journal_mode = WAL;');
}
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS judges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    judge_id TEXT NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    judge_id TEXT NOT NULL REFERENCES judges(id) ON DELETE RESTRICT,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    c1 REAL NOT NULL,
    c2 REAL NOT NULL,
    c3 REAL NOT NULL,
    c4 REAL NOT NULL,
    c5 REAL NOT NULL,
    c6 REAL NOT NULL,
    total REAL NOT NULL,
    remarks TEXT,
    updated_at INTEGER NOT NULL,
    UNIQUE(judge_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS event_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Helper functions for DB Event State
function getEventState(key, fallback = null) {
  const row = db.prepare('SELECT value FROM event_state WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return fallback;
  }
}

function setEventState(key, value) {
  const serialized = JSON.stringify(value);
  const now = Date.now();
  db.prepare(`
    INSERT INTO event_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, serialized, now);
}

// ============================================================================
// 2. AUTHORITATIVE TIMER STATE (IN-MEMORY + DB BACKED)
// ============================================================================
let timerState = getEventState('timer_state', {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
  duration: 300,  // total seconds
  remaining: 300,
  startTimestamp: null,
  endTimestamp: null,
  bonusSeconds: 0,
  lastUpdated: Date.now()
});

function persistTimerState() {
  setEventState('timer_state', timerState);
}

// Leaderboard State (EMBARGOED | PUBLISHED)
let leaderboardState = getEventState('leaderboard_state', {
  state: 'EMBARGOED',
  publishedAt: null,
  snapshot: []
});

function persistLeaderboardState() {
  setEventState('leaderboard_state', leaderboardState);
}

// Domains Visibility State (Scrambled / Hidden vs Revealed)
let domainsState = getEventState('domains_state', {
  isHidden: true,
  updatedAt: Date.now()
});

function persistDomainsState() {
  setEventState('domains_state', domainsState);
}

// Inauguration Live Clock & Kickoff State (10:30 AM, 17th September 2026 IST)
const INAUGURATION_TARGET_ISO = '2026-09-17T10:30:00+05:30';
const INAUGURATION_TARGET_TS = Date.parse(INAUGURATION_TARGET_ISO); // 1789621200000

let inaugurationState = getEventState('inauguration_state', {
  targetIso: INAUGURATION_TARGET_ISO,
  targetTimestamp: INAUGURATION_TARGET_TS,
  isVisible: true,
  isInaugurated: Date.now() >= INAUGURATION_TARGET_TS,
  inauguratedAt: Date.now() >= INAUGURATION_TARGET_TS ? INAUGURATION_TARGET_TS : null,
  updatedAt: Date.now()
});

function getEffectiveInaugurationState() {
  const now = Date.now();
  if (!inaugurationState.isInaugurated && now >= inaugurationState.targetTimestamp) {
    inaugurationState.isInaugurated = true;
    inaugurationState.inauguratedAt = inaugurationState.targetTimestamp;
    inaugurationState.updatedAt = now;
    persistInaugurationState();
  }
  return inaugurationState;
}

function persistInaugurationState() {
  setEventState('inauguration_state', inaugurationState);
}

// PDF Download Button Visibility State (Hidden under embargo vs Visible)
let pdfState = getEventState('pdf_state', {
  isHidden: true,
  manualHideAfterInaug: false,
  updatedAt: Date.now()
});

function getEffectivePdfState() {
  const now = Date.now();
  const inau = getEffectiveInaugurationState();
  const isEventLaunched = inau.isInaugurated || now >= inau.targetTimestamp;

  // Automatically reveal / pop up when the event launches & global timer ends (17th September 2026 10:30 AM)
  if (isEventLaunched && !pdfState.manualHideAfterInaug) {
    if (pdfState.isHidden) {
      pdfState.isHidden = false;
      pdfState.updatedAt = now;
      persistPdfState();
    }
  }
  return pdfState;
}

function persistPdfState() {
  setEventState('pdf_state', pdfState);
}

// ============================================================================
// 3. SERVER-SENT EVENTS (SSE) BROADCAST BUS
// ============================================================================
const sseClients = new Set();

function broadcastSSE() {
  const adminMatrix = computeJuryMatrix();
  const publicLeaderboard = leaderboardState.state === 'PUBLISHED'
    ? { state: 'PUBLISHED', publishedAt: leaderboardState.publishedAt, teams: leaderboardState.snapshot }
    : { state: 'EMBARGOED', teams: [] };

  const payloadObj = {
    timer: timerState,
    leaderboard: publicLeaderboard,
    adminMatrix: adminMatrix,
    domains: domainsState,
    inauguration: getEffectiveInaugurationState(),
    pdf: getEffectivePdfState()
  };

  const payload = `data: ${JSON.stringify(payloadObj)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Background Timer Tick
setInterval(() => {
  if (timerState.status === 'running' && timerState.endTimestamp) {
    const diff = Math.ceil((timerState.endTimestamp - Date.now()) / 1000);
    const prev = timerState.remaining;
    timerState.remaining = Math.max(0, diff);

    if (timerState.remaining === 0 && prev !== 0) {
      timerState.status = 'stopped';
      persistTimerState();
      broadcastSSE();
    }
  }
}, 1000);

// ============================================================================
// 4. JURY SCORING & TIE-BREAKING ALGORITHM
// ============================================================================
function computeJuryMatrix() {
  const teams = db.prepare('SELECT id, name, domain FROM teams ORDER BY name ASC').all();
  const judges = db.prepare('SELECT id, name, active FROM judges WHERE active = 1 ORDER BY created_at ASC').all();
  const evaluations = db.prepare(`
    SELECT e.*, j.name as judge_name 
    FROM evaluations e
    JOIN judges j ON e.judge_id = j.id
  `).all();

  // Index evaluations by team_id
  const evalMap = {};
  for (const ev of evaluations) {
    if (!evalMap[ev.team_id]) evalMap[ev.team_id] = [];
    evalMap[ev.team_id].push(ev);
  }

  const teamSummaries = [];

  for (const team of teams) {
    const evals = evalMap[team.id] || [];
    const count = evals.length;

    let sumTotal = 0;
    let sumC1 = 0, sumC2 = 0, sumC3 = 0, sumC4 = 0, sumC5 = 0, sumC6 = 0;
    const judgeScores = {};
    const remarksList = [];

    for (const ev of evals) {
      sumTotal += ev.total;
      sumC1 += ev.c1;
      sumC2 += ev.c2;
      sumC3 += ev.c3;
      sumC4 += ev.c4;
      sumC5 += ev.c5;
      sumC6 += ev.c6;

      judgeScores[ev.judge_id] = {
        judgeName: ev.judge_name,
        total: ev.total,
        c1: ev.c1, c2: ev.c2, c3: ev.c3, c4: ev.c4, c5: ev.c5, c6: ev.c6,
        remarks: ev.remarks,
        updatedAt: ev.updated_at
      };

      if (ev.remarks && ev.remarks.trim()) {
        remarksList.push({ judgeName: ev.judge_name, text: ev.remarks });
      }
    }

    const avgTotal = count > 0 ? Number((sumTotal / count).toFixed(2)) : 0;
    const avgC1 = count > 0 ? Number((sumC1 / count).toFixed(2)) : 0;
    const avgC2 = count > 0 ? Number((sumC2 / count).toFixed(2)) : 0;
    const avgC3 = count > 0 ? Number((sumC3 / count).toFixed(2)) : 0;
    const avgC4 = count > 0 ? Number((sumC4 / count).toFixed(2)) : 0;
    const avgC5 = count > 0 ? Number((sumC5 / count).toFixed(2)) : 0;
    const avgC6 = count > 0 ? Number((sumC6 / count).toFixed(2)) : 0;

    teamSummaries.push({
      teamId: team.id,
      teamName: team.name,
      domain: team.domain,
      evalCount: count,
      totalJudges: judges.length,
      judgeScores: judgeScores,
      avgTotal: avgTotal,
      avgC1: avgC1,
      avgC2: avgC2,
      avgC3: avgC3,
      avgC4: avgC4, // Primary tie-breaker
      avgC5: avgC5,
      avgC6: avgC6,
      remarks: remarksList
    });
  }

  // Deterministic Official Tie-Breaking Sort:
  // 1. Total Score (descending)
  // 2. C4 Functionality & Prototype (descending)
  // 3. C3 Technical Implementation (descending)
  // 4. C1 Problem Definition (descending)
  teamSummaries.sort((a, b) => {
    if (b.avgTotal !== a.avgTotal) return b.avgTotal - a.avgTotal;
    if (b.avgC4 !== a.avgC4) return b.avgC4 - a.avgC4;
    if (b.avgC3 !== a.avgC3) return b.avgC3 - a.avgC3;
    if (b.avgC1 !== a.avgC1) return b.avgC1 - a.avgC1;
    return a.teamName.localeCompare(b.teamName);
  });

  // Assign ranks & award titles
  teamSummaries.forEach((t, idx) => {
    t.rank = idx + 1;
    if (t.evalCount === 0) {
      t.award = 'PENDING EVALUATION';
    } else if (idx === 0) {
      t.award = '🏆 1ST PLACE WINNER';
    } else if (idx === 1) {
      t.award = '🥈 2ND PLACE RUNNER-UP';
    } else if (idx === 2) {
      t.award = '🥉 3RD PLACE RUNNER-UP';
    } else {
      t.award = 'FINALIST PROTOTYPE';
    }
  });

  return {
    teams: teamSummaries,
    activeJudges: judges,
    totalTeams: teams.length,
    lastCalculated: Date.now()
  };
}

// ============================================================================
// 5. AUTHENTICATION HELPERS
// ============================================================================
function hashKey(key) {
  return crypto.createHash('sha256').update(key.trim().toUpperCase()).digest('hex');
}

function getAuthenticatedJudge(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7).trim();
  const now = Date.now();

  const session = db.prepare(`
    SELECT s.token, j.id, j.name, j.active
    FROM sessions s
    JOIN judges j ON s.judge_id = j.id
    WHERE s.token = ? AND s.expires_at > ? AND j.active = 1
  `).get(token, now);

  return session || null;
}

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').trim();
}

// Parse Request Body Helper
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB protection
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// ============================================================================
// 6. HTTP REQUEST HANDLER & ROUTER
// ============================================================================
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
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8'
};

async function handleRequest(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // --------------------------------------------------------------------------
  // API: SERVER-SENT EVENTS (SSE) STREAM
  // --------------------------------------------------------------------------
  if (pathname === '/api/timer/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const adminMatrix = computeJuryMatrix();
    const publicLeaderboard = leaderboardState.state === 'PUBLISHED'
      ? { state: 'PUBLISHED', publishedAt: leaderboardState.publishedAt, teams: leaderboardState.snapshot }
      : { state: 'EMBARGOED', teams: [] };

    res.write(`data: ${JSON.stringify({
      timer: timerState,
      leaderboard: publicLeaderboard,
      adminMatrix: adminMatrix
    })}\n\n`);

    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // --------------------------------------------------------------------------
  // API: AUTHORITATIVE TIMER
  // --------------------------------------------------------------------------
  if (pathname === '/api/timer' || pathname === '/api/status') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const now = Date.now();
      if (timerState.status === 'running' && timerState.endTimestamp) {
        const diff = Math.ceil((timerState.endTimestamp - now) / 1000);
        if (diff <= 0) {
          timerState.status = 'stopped';
          timerState.remaining = 0;
          timerState.endTimestamp = null;
          persistTimerState();
        } else {
          timerState.remaining = diff;
        }
      }
      return sendJson(res, 200, {
        ok: true,
        online: true,
        timer: timerState,
        domains: domainsState,
        leaderboard: {
          state: leaderboardState.state,
          updatedAt: leaderboardState.updatedAt || leaderboardState.publishedAt || 0,
          publishedAt: leaderboardState.publishedAt,
          teams: leaderboardState.state === 'PUBLISHED' ? (leaderboardState.snapshot || []) : []
        },
        leaderboardState: leaderboardState.state
      });
    }
  }

  if (pathname === '/api/timer/set' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      let duration = 300;

      if (typeof data.duration === 'number' && data.duration > 0) {
        duration = Math.floor(data.duration);
      } else {
        const hrs = parseInt(data.hours, 10) || 0;
        const mins = parseInt(data.minutes, 10) || 0;
        const secs = parseInt(data.seconds, 10) || 0;
        duration = Math.max(1, hrs * 3600 + mins * 60 + secs);
      }

      timerState = {
        status: 'idle',
        duration: duration,
        remaining: duration,
        startTimestamp: null,
        endTimestamp: null,
        bonusSeconds: 0,
        lastUpdated: Date.now()
      };
      persistTimerState();
      broadcastSSE();
      return sendJson(res, 200, { ok: true, timer: timerState });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/timer/start' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    timerState.status = 'running';
    if (typeof body.duration === 'number' && body.duration > 0) {
      timerState.duration = body.duration;
    }
    if (typeof body.remaining === 'number') {
      timerState.remaining = body.remaining;
    }
    if (typeof body.bonusSeconds === 'number') {
      timerState.bonusSeconds = body.bonusSeconds;
    }
    timerState.startTimestamp = body.startTimestamp || now;
    timerState.endTimestamp = body.endTimestamp || (now + (timerState.remaining || timerState.duration) * 1000);
    timerState.lastUpdated = body.lastUpdated || now;
    persistTimerState();
    broadcastSSE();
    return sendJson(res, 200, { ok: true, timer: timerState });
  }

  if (pathname === '/api/timer/pause' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    timerState.status = 'paused';
    if (typeof body.remaining === 'number') {
      timerState.remaining = body.remaining;
    } else if (timerState.endTimestamp) {
      const diff = Math.ceil((timerState.endTimestamp - now) / 1000);
      timerState.remaining = Math.max(0, diff);
    }
    timerState.endTimestamp = null;
    timerState.lastUpdated = body.lastUpdated || now;
    persistTimerState();
    broadcastSSE();
    return sendJson(res, 200, { ok: true, timer: timerState });
  }

  if (pathname === '/api/timer/resume' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    timerState.status = 'running';
    if (typeof body.remaining === 'number') {
      timerState.remaining = body.remaining;
    }
    timerState.endTimestamp = body.endTimestamp || (now + (timerState.remaining || timerState.duration) * 1000);
    timerState.lastUpdated = body.lastUpdated || now;
    persistTimerState();
    broadcastSSE();
    return sendJson(res, 200, { ok: true, timer: timerState });
  }

  if (pathname === '/api/timer/bonus' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    const bonusSecs = parseInt(body.bonusSeconds, 10) || 0;

    if (body.resetBonus) {
      const curBonus = timerState.bonusSeconds || 0;
      timerState.bonusSeconds = 0;
      timerState.duration = Math.max(1, (timerState.duration || 300) - curBonus);
      if (timerState.status === 'running' && timerState.endTimestamp) {
        timerState.endTimestamp = Math.max(now, timerState.endTimestamp - (curBonus * 1000));
        const diff = Math.ceil((timerState.endTimestamp - now) / 1000);
        timerState.remaining = Math.max(0, diff);
      } else {
        timerState.remaining = Math.max(0, (timerState.remaining || 0) - curBonus);
      }
    } else if (bonusSecs !== 0) {
      timerState.bonusSeconds = Math.max(0, (timerState.bonusSeconds || 0) + bonusSecs);
      timerState.duration = Math.max(1, (timerState.duration || 300) + bonusSecs);

      if (timerState.status === 'running') {
        if (timerState.endTimestamp) {
          timerState.endTimestamp += bonusSecs * 1000;
        } else {
          timerState.endTimestamp = now + (timerState.remaining + bonusSecs) * 1000;
        }
        const diff = Math.ceil((timerState.endTimestamp - now) / 1000);
        timerState.remaining = Math.max(0, diff);
      } else if (timerState.status === 'stopped' && bonusSecs > 0) {
        timerState.status = 'running';
        timerState.remaining = bonusSecs;
        timerState.endTimestamp = now + (bonusSecs * 1000);
      } else {
        timerState.remaining = Math.max(0, (timerState.remaining || 0) + bonusSecs);
      }
    }
    timerState.lastUpdated = now;
    persistTimerState();
    broadcastSSE();
    return sendJson(res, 200, { ok: true, timer: timerState });
  }

  if (pathname === '/api/timer/stop' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    timerState.status = 'stopped';
    timerState.remaining = 0;
    timerState.endTimestamp = null;
    timerState.lastUpdated = body.lastUpdated || Date.now();
    persistTimerState();
    broadcastSSE();
    return sendJson(res, 200, { ok: true, timer: timerState });
  }

  if (pathname === '/api/timer/reset' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    timerState.status = 'idle';
    if (typeof body.duration === 'number' && body.duration > 0) {
      timerState.duration = body.duration;
    }
    timerState.remaining = timerState.duration;
    timerState.bonusSeconds = 0;
    timerState.startTimestamp = null;
    timerState.endTimestamp = null;
    timerState.lastUpdated = body.lastUpdated || Date.now();
    persistTimerState();
    broadcastSSE();
    return sendJson(res, 200, { ok: true, timer: timerState });
  }

  // --------------------------------------------------------------------------
  // API: JUDGE AUTHENTICATION & MANAGEMENT
  // --------------------------------------------------------------------------
  if (pathname === '/api/judges') {
    if (req.method === 'GET') {
      // List judges with submission counts
      const rows = db.prepare(`
        SELECT j.id, j.name, j.active, j.created_at,
               COUNT(e.id) as evaluated_count
        FROM judges j
        LEFT JOIN evaluations e ON j.id = e.judge_id
        GROUP BY j.id
        ORDER BY j.created_at ASC
      `).all();
      return sendJson(res, 200, { judges: rows });
    }

    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const name = sanitizeText(body.name || `Judge ${db.prepare('SELECT COUNT(*) as c FROM judges').get().c + 1}`);
        const id = 'judge_' + crypto.randomBytes(6).toString('hex');
        const key = 'J-' + Math.floor(1000 + Math.random() * 9000); // e.g. J-4821
        const key_hash = hashKey(key);
        const now = Date.now();

        db.prepare(`
          INSERT INTO judges (id, name, key_hash, active, created_at)
          VALUES (?, ?, ?, 1, ?)
        `).run(id, name, key_hash, now);

        broadcastSSE();
        return sendJson(res, 201, {
          ok: true,
          judge: { id, name, key, active: 1, created_at: now }
        });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  if (pathname === '/api/judges/deactivate' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { id, active } = body;
      db.prepare('UPDATE judges SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
      broadcastSSE();
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/judges/delete' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const judgeId = body.id || body.judgeId;
      if (!judgeId) return sendJson(res, 400, { error: 'Judge ID is required' });

      db.prepare('DELETE FROM sessions WHERE judge_id = ?').run(judgeId);
      db.prepare('DELETE FROM evaluations WHERE judge_id = ?').run(judgeId);
      db.prepare('DELETE FROM judges WHERE id = ?').run(judgeId);
      broadcastSSE();
      return sendJson(res, 200, { ok: true, message: 'Judge successfully deleted' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname.startsWith('/api/judges/') && req.method === 'DELETE') {
    const judgeId = pathname.split('/')[3];
    if (!judgeId || judgeId === 'delete') return sendJson(res, 400, { error: 'Judge ID is required' });
    try {
      db.prepare('DELETE FROM sessions WHERE judge_id = ?').run(judgeId);
      db.prepare('DELETE FROM evaluations WHERE judge_id = ?').run(judgeId);
      db.prepare('DELETE FROM judges WHERE id = ?').run(judgeId);
      broadcastSSE();
      return sendJson(res, 200, { ok: true, message: 'Judge successfully deleted' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // Judge Key Verification ➔ Session Token Exchange
  if (pathname === '/api/judges/verify' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const rawKey = body.key || '';
      if (!rawKey) return sendJson(res, 400, { error: 'Judge key is required' });

      const key_hash = hashKey(rawKey);
      const judge = db.prepare('SELECT id, name, active FROM judges WHERE key_hash = ?').get(key_hash);

      if (!judge) {
        return sendJson(res, 401, { error: 'Invalid judge key credential' });
      }
      if (!judge.active) {
        return sendJson(res, 403, { error: 'This judge account has been deactivated by the administrator' });
      }

      // Generate cryptographically secure Session Token
      const token = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      const expiresAt = now + 86400 * 1000 * 7; // 7 days

      db.prepare(`
        INSERT INTO sessions (token, judge_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, judge.id, now, expiresAt);

      return sendJson(res, 200, {
        ok: true,
        token: token,
        judge: { id: judge.id, name: judge.name }
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // Get Current Authenticated Judge Info
  if (pathname === '/api/judges/me' && req.method === 'GET') {
    const judge = getAuthenticatedJudge(req);
    if (!judge) return sendJson(res, 401, { error: 'Unauthorized or expired session' });
    return sendJson(res, 200, { judge });
  }

  // --------------------------------------------------------------------------
  // API: EVALUATION SUBMISSIONS
  // --------------------------------------------------------------------------
  if (pathname === '/api/submissions' || pathname === '/api/evaluations') {
    // GET: Retrieve all evaluations submitted by current judge
    if (req.method === 'GET') {
      const judge = getAuthenticatedJudge(req);
      if (!judge) return sendJson(res, 401, { error: 'Unauthorized' });

      const rows = db.prepare(`
        SELECT e.*, t.name as team_name, t.domain
        FROM evaluations e
        JOIN teams t ON e.team_id = t.id
        WHERE e.judge_id = ?
        ORDER BY e.updated_at DESC
      `).all(judge.id);

      return sendJson(res, 200, { submissions: rows, evaluations: rows });
    }

    // POST: Create or update evaluation
    if (req.method === 'POST') {
      const judge = getAuthenticatedJudge(req);
      if (!judge) return sendJson(res, 401, { error: 'Unauthorized' });

      try {
        const body = await parseJsonBody(req);
        const teamName = sanitizeText(body.teamName || '');
        const domain = sanitizeText(body.domain || '01 - AI Agents & Autonomous Systems');

        if (!teamName) {
          return sendJson(res, 400, { error: 'Team name is required' });
        }

        // Validate 6 criteria & step 0.5 rules
        const c1 = Number(body.scores?.c1) || 0;
        const c2 = Number(body.scores?.c2) || 0;
        const c3 = Number(body.scores?.c3) || 0;
        const c4 = Number(body.scores?.c4) || 0;
        const c5 = Number(body.scores?.c5) || 0;
        const c6 = Number(body.scores?.c6) || 0;

        // Check bounds
        if (c1 < 0 || c1 > 20 || c2 < 0 || c2 > 20 || c3 < 0 || c3 > 20 ||
            c4 < 0 || c4 > 25 || c5 < 0 || c5 > 10 || c6 < 0 || c6 > 5) {
          return sendJson(res, 400, { error: 'Scores exceed allowable criterion bounds' });
        }

        // Validate 0.5-point increments
        const isStepHalf = (n) => Math.round(n * 2) === n * 2;
        if (![c1, c2, c3, c4, c5, c6].every(isStepHalf)) {
          return sendJson(res, 400, { error: 'Scores must adhere to strict 0.5-point increments' });
        }

        // Calculate official total server-side
        const total = Number((c1 + c2 + c3 + c4 + c5 + c6).toFixed(1));
        const remarks = sanitizeText(body.remarks || '');
        const now = Date.now();

        // 1. Upsert Team
        const teamSlug = teamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        let team = db.prepare('SELECT id FROM teams WHERE LOWER(name) = LOWER(?)').get(teamName);
        let teamId;
        if (!team) {
          teamId = 'team_' + teamSlug + '_' + crypto.randomBytes(3).toString('hex');
          db.prepare('INSERT INTO teams (id, name, domain, created_at) VALUES (?, ?, ?, ?)').run(teamId, teamName, domain, now);
        } else {
          teamId = team.id;
          db.prepare('UPDATE teams SET domain = ? WHERE id = ?').run(domain, teamId);
        }

        // 2. Upsert Evaluation
        const evalId = 'eval_' + judge.id + '_' + teamId;
        db.prepare(`
          INSERT INTO evaluations (id, judge_id, team_id, c1, c2, c3, c4, c5, c6, total, remarks, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(judge_id, team_id) DO UPDATE SET
            c1 = excluded.c1,
            c2 = excluded.c2,
            c3 = excluded.c3,
            c4 = excluded.c4,
            c5 = excluded.c5,
            c6 = excluded.c6,
            total = excluded.total,
            remarks = excluded.remarks,
            updated_at = excluded.updated_at
        `).run(evalId, judge.id, teamId, c1, c2, c3, c4, c5, c6, total, remarks, now);

        broadcastSSE();
        return sendJson(res, 200, {
          ok: true,
          teamId,
          total,
          updatedAt: now
        });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // API: TEAM REGISTRATION & MANAGEMENT
  // --------------------------------------------------------------------------
  if (pathname === '/api/teams') {
    if (req.method === 'GET') {
      const teams = db.prepare('SELECT id, name, domain, created_at FROM teams ORDER BY name ASC').all();
      return sendJson(res, 200, { teams });
    }
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const name = sanitizeText(body.name || body.teamName || '');
        const domain = sanitizeText(body.domain || '01 - AI Agents & Autonomous Systems');
        if (!name) return sendJson(res, 400, { error: 'Team name is required' });

        const teamSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        let team = db.prepare('SELECT id, name, domain FROM teams WHERE LOWER(name) = LOWER(?)').get(name);
        let teamId;
        const now = Date.now();
        if (!team) {
          teamId = 'team_' + teamSlug + '_' + crypto.randomBytes(3).toString('hex');
          db.prepare('INSERT INTO teams (id, name, domain, created_at) VALUES (?, ?, ?, ?)').run(teamId, name, domain, now);
        } else {
          teamId = team.id;
          db.prepare('UPDATE teams SET domain = ? WHERE id = ?').run(domain, teamId);
        }

        broadcastSSE();
        return sendJson(res, 201, { ok: true, team: { id: teamId, name, domain } });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // API: TEAM DELETION & RESET (BEFORE PUSHING TO LEADERBOARD)
  // --------------------------------------------------------------------------
  if (pathname === '/api/teams/delete' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const teamId = body.id || body.teamId;
      if (!teamId) return sendJson(res, 400, { error: 'Team ID is required' });

      const targetTeam = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId);
      db.prepare('DELETE FROM evaluations WHERE team_id = ?').run(teamId);
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);

      if (leaderboardState && Array.isArray(leaderboardState.snapshot)) {
        leaderboardState.snapshot = leaderboardState.snapshot.filter(t => t.teamId !== teamId && (!targetTeam || t.teamName !== targetTeam.name));
        persistLeaderboardState();
      }

      broadcastSSE();
      return sendJson(res, 200, { ok: true, message: 'Team successfully deleted' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname.startsWith('/api/teams/') && req.method === 'DELETE') {
    const teamId = pathname.split('/')[3];
    if (!teamId || teamId === 'delete') return sendJson(res, 400, { error: 'Team ID is required' });
    try {
      const targetTeam = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId);
      db.prepare('DELETE FROM evaluations WHERE team_id = ?').run(teamId);
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);

      if (leaderboardState && Array.isArray(leaderboardState.snapshot)) {
        leaderboardState.snapshot = leaderboardState.snapshot.filter(t => t.teamId !== teamId && (!targetTeam || t.teamName !== targetTeam.name));
        persistLeaderboardState();
      }

      broadcastSSE();
      return sendJson(res, 200, { ok: true, message: 'Team successfully deleted' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/teams/clear' && req.method === 'POST') {
    try {
      // Clear all evaluations and teams
      db.prepare('DELETE FROM evaluations').run();
      db.prepare('DELETE FROM teams').run();

      // Reset leaderboard snapshot as well
      if (leaderboardState) {
        leaderboardState.snapshot = [];
        leaderboardState.updatedAt = Date.now();
        persistLeaderboardState();
      }

      broadcastSSE();
      return sendJson(res, 200, { ok: true, message: 'All teams and scores successfully cleared' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // API: ADMIN & BASELINE LIVE MATRIX PREVIEW
  // --------------------------------------------------------------------------
  if ((pathname === '/api/admin/preview' || pathname === '/api/baseline/preview' || pathname === '/api/matrix') && req.method === 'GET') {
    const matrix = computeJuryMatrix();
    return sendJson(res, 200, matrix);
  }

  // --------------------------------------------------------------------------
  // API: LEADERBOARD STATE MACHINE & CERTIFIED PUBLICATION
  // --------------------------------------------------------------------------
  if (pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      if (leaderboardState.state === 'PUBLISHED') {
        return sendJson(res, 200, {
          state: 'PUBLISHED',
          updatedAt: leaderboardState.updatedAt || leaderboardState.publishedAt || 0,
          publishedAt: leaderboardState.publishedAt,
          teams: leaderboardState.snapshot || []
        });
      } else {
        return sendJson(res, 200, {
          state: 'EMBARGOED',
          updatedAt: leaderboardState.updatedAt || 0,
          teams: []
        });
      }
    }
  }

  if (pathname === '/api/leaderboard/publish' && req.method === 'POST') {
    const matrix = computeJuryMatrix();
    // Build certified public snapshot (ONLY legitimate evaluated teams)
    const snapshot = matrix.teams
      .filter(t => t.evalCount > 0)
      .map(t => ({
        rank: t.rank,
        teamId: t.teamId,
        teamName: t.teamName,
        domain: t.domain,
        avgFunctionality: t.avgC4,
        avgTotal: t.avgTotal,
        award: t.award
      }));

    if (snapshot.length === 0) {
      return sendJson(res, 400, {
        error: 'Cannot publish leaderboard: No evaluated teams found. Please wait for judges to submit marks before publishing.'
      });
    }

    const now = Date.now();
    leaderboardState = {
      state: 'PUBLISHED',
      publishedAt: now,
      updatedAt: now,
      snapshot: snapshot
    };
    persistLeaderboardState();
    broadcastSSE();

    return sendJson(res, 200, {
      ok: true,
      state: 'PUBLISHED',
      publishedAt: now,
      updatedAt: now,
      publishedCount: snapshot.length,
      teams: snapshot
    });
  }

  if (pathname === '/api/leaderboard/lock' && req.method === 'POST') {
    const now = Date.now();
    leaderboardState = {
      state: 'EMBARGOED',
      publishedAt: null,
      updatedAt: now,
      snapshot: []
    };
    persistLeaderboardState();
    broadcastSSE();

    return sendJson(res, 200, {
      ok: true,
      state: 'EMBARGOED',
      publishedAt: null,
      updatedAt: now,
      teams: []
    });
  }

  // --------------------------------------------------------------------------
  // API: DOMAINS VISIBILITY (SCRAMBLE / HIDE VS REVEAL)
  // --------------------------------------------------------------------------
  if (pathname === '/api/domains/visibility') {
    if (req.method === 'GET') {
      return sendJson(res, 200, domainsState);
    }
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (typeof body.isHidden === 'boolean') {
          domainsState.isHidden = body.isHidden;
        } else {
          domainsState.isHidden = !domainsState.isHidden;
        }
        domainsState.updatedAt = Date.now();
        persistDomainsState();
        broadcastSSE();
        return sendJson(res, 200, { ok: true, domains: domainsState });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // API: INAUGURATION CLOCK & EVENT COMMENCEMENT CONTROLLER
  // --------------------------------------------------------------------------
  if (pathname === '/api/inauguration') {
    if (req.method === 'GET') {
      return sendJson(res, 200, getEffectiveInaugurationState());
    }
  }

  if (pathname === '/api/inauguration/toggle' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (typeof body.isVisible === 'boolean') {
        inaugurationState.isVisible = body.isVisible;
      } else {
        inaugurationState.isVisible = !inaugurationState.isVisible;
      }
      inaugurationState.updatedAt = Date.now();
      persistInaugurationState();
      broadcastSSE();
      return sendJson(res, 200, { ok: true, inauguration: getEffectiveInaugurationState() });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/inauguration/trigger' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const now = Date.now();
      if (typeof body.isInaugurated === 'boolean') {
        inaugurationState.isInaugurated = body.isInaugurated;
      } else {
        inaugurationState.isInaugurated = !inaugurationState.isInaugurated;
      }
      inaugurationState.inauguratedAt = inaugurationState.isInaugurated ? now : null;
      inaugurationState.updatedAt = now;
      persistInaugurationState();

      // Automatically pop up / reveal PDF download buttons when event is officially inaugurated
      if (inaugurationState.isInaugurated) {
        pdfState.isHidden = false;
        pdfState.manualHideAfterInaug = false;
        pdfState.updatedAt = now;
        persistPdfState();
      }

      broadcastSSE();
      return sendJson(res, 200, { ok: true, inauguration: getEffectiveInaugurationState(), pdf: getEffectivePdfState() });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // API: PARTICIPANT HANDBOOK (PARTICIPATE.PDF) VISIBILITY CONTROLLER
  // --------------------------------------------------------------------------
  if (pathname === '/api/pdf/visibility') {
    if (req.method === 'GET') {
      return sendJson(res, 200, getEffectivePdfState());
    }
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const inau = getEffectiveInaugurationState();
        const isEventLaunched = inau.isInaugurated || Date.now() >= inau.targetTimestamp;

        if (typeof body.isHidden === 'boolean') {
          pdfState.isHidden = body.isHidden;
        } else {
          pdfState.isHidden = !pdfState.isHidden;
        }

        if (isEventLaunched && pdfState.isHidden) {
          pdfState.manualHideAfterInaug = true;
        } else if (!pdfState.isHidden) {
          pdfState.manualHideAfterInaug = false;
        }

        pdfState.updatedAt = Date.now();
        persistPdfState();
        broadcastSSE();
        return sendJson(res, 200, { ok: true, pdf: getEffectivePdfState() });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // STATIC FILE SERVING & ROUTE PROTECTION
  // --------------------------------------------------------------------------
  // Disallow /admin or /admin.html (return 404 for security)
  if (pathname === '/admin' || pathname === '/admin.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  let normalizedPath = pathname;
  if (normalizedPath === '/') {
    normalizedPath = 'index.html';
  } else if (normalizedPath === '/baseline') {
    normalizedPath = 'baseline.html';
  } else if (normalizedPath === '/judge') {
    normalizedPath = 'judge.html';
  }

  let filePath = path.join(PUBLIC_DIR, normalizedPath);

  // Directory traversal prevention
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
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
}

const server = http.createServer(handleRequest);

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

if (require.main === module && !isVercel) {
  server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('================================================================');
    console.log('  ASTRA 11.0 // BUILD-A-BOT PRODUCTION SERVER ONLINE');
    console.log('================================================================');
    console.log(`  > Participant Portal:   http://${localIP}:${PORT}`);
    console.log(`  > Judge Evaluation:     http://${localIP}:${PORT}/judge.html`);
    console.log(`  > Admin Control Deck:   http://${localIP}:${PORT}/baseline`);
    console.log('----------------------------------------------------------------');
    console.log(`  > Database Engine:      Native SQLite (${isVercel ? 'Memory' : 'WAL'} Mode)`);
    console.log(`  > Database File:        ${dbPath}`);
    console.log('  Ready. Multi-Judge & Timer live synchronization active.');
    console.log('================================================================');
  });
}

module.exports = handleRequest;
