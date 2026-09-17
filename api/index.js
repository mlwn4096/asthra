/**
 * ASTRA 11.0: BUILD-A-BOT — VERCEL SERVERLESS EDGE BACKEND
 * Self-contained, resilient, zero external dependencies.
 * Provides authoritative timer, judge provisioning, score aggregation,
 * domains visibility toggle, and certified leaderboard state machine.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const STATE_FILE = path.join(os.tmpdir(), 'asthra_state_v2.json');

// Supabase Cloud Persistence (Active when environment variables are set in Vercel)
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function fetchSupabaseState() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/asthra_state?key=eq.main_state&select=data,updated_at`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
      return rows[0].data;
    }
  } catch (e) {
    console.error('Supabase fetch error:', e.message);
  }
  return null;
}

async function persistSupabaseState(state) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/asthra_state?on_conflict=key`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        key: 'main_state',
        data: state,
        updated_at: Date.now()
      })
    });
  } catch (e) {
    console.error('Supabase persist error:', e.message);
  }
}

// Default initial state — Clean state with ZERO mock teams or placeholder judges
function getDefaultState() {
  return {
    lastUpdated: Date.now(),
    timer: {
      status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
      duration: 300,
      remaining: 300,
      startTimestamp: null,
      endTimestamp: null,
      bonusSeconds: 0,
      lastUpdated: 0
    },
    domains: {
      isHidden: false, // Unlocked by default
      updatedAt: 0
    },
    leaderboard: {
      state: 'PUBLISHED', // Published by default for event conclusion
      publishedAt: Date.now(),
      updatedAt: 0,
      snapshot: []
    },
    inauguration: {
      targetIso: '2026-09-17T10:30:00+05:30',
      targetTimestamp: 1789621200000,
      isVisible: true,
      isInaugurated: false,
      inauguratedAt: null,
      updatedAt: 0
    },
    pdf: {
      isHidden: false, // Unlocked by default
      manualHideAfterInaug: false,
      updatedAt: 0
    },
    judges: [],
    sessions: {},
    teams: [],
    evaluations: []
  };
}

// In-memory global state cache
if (!global.__ASTRA_STATE) {
  try {
    if (fs.existsSync(STATE_FILE)) {
      global.__ASTRA_STATE = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } else {
      global.__ASTRA_STATE = getDefaultState();
    }
  } catch (e) {
    global.__ASTRA_STATE = getDefaultState();
  }
}

async function getState() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const remote = await fetchSupabaseState();
    if (remote) {
      const remoteTime = remote.lastUpdated || 0;
      const memTime = global.__ASTRA_STATE?.lastUpdated || 0;
      if (remoteTime >= memTime || !global.__ASTRA_STATE) {
        global.__ASTRA_STATE = remote;
      }
    }
  }

  try {
    if (fs.existsSync(STATE_FILE)) {
      const disk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (disk) {
        const diskTime = Math.max(
          disk.lastUpdated || 0,
          disk.timer?.lastUpdated || 0,
          disk.domains?.updatedAt || 0,
          disk.leaderboard?.publishedAt || 0
        );
        const memTime = Math.max(
          global.__ASTRA_STATE?.lastUpdated || 0,
          global.__ASTRA_STATE?.timer?.lastUpdated || 0,
          global.__ASTRA_STATE?.domains?.updatedAt || 0,
          global.__ASTRA_STATE?.leaderboard?.publishedAt || 0
        );
        if (diskTime >= memTime) {
          global.__ASTRA_STATE = disk;
        }
      }
    }
  } catch (e) {}

  if (!global.__ASTRA_STATE) {
    global.__ASTRA_STATE = getDefaultState();
  }

  // Ensure domains and pdf are unlocked by default
  if (!global.__ASTRA_STATE.domains) {
    global.__ASTRA_STATE.domains = { isHidden: false, updatedAt: 0 };
  } else if (global.__ASTRA_STATE.domains.isHidden) {
    global.__ASTRA_STATE.domains.isHidden = false;
    global.__ASTRA_STATE.domains.updatedAt = Date.now();
  }

  if (!global.__ASTRA_STATE.pdf) {
    global.__ASTRA_STATE.pdf = { isHidden: false, manualHideAfterInaug: false, updatedAt: 0 };
  } else if (global.__ASTRA_STATE.pdf.isHidden) {
    global.__ASTRA_STATE.pdf.isHidden = false;
    global.__ASTRA_STATE.pdf.manualHideAfterInaug = false;
    global.__ASTRA_STATE.pdf.updatedAt = Date.now();
  }

  // Ensure collection arrays exist and are sanitized against legacy mock seeds
  if (!Array.isArray(global.__ASTRA_STATE.teams)) {
    global.__ASTRA_STATE.teams = [];
  } else {
    // Purge legacy mock teams (team_01 to team_15) if present from previous state
    global.__ASTRA_STATE.teams = global.__ASTRA_STATE.teams.filter(t => !/^team_\d{2}$/.test(t.id));
  }

  if (!Array.isArray(global.__ASTRA_STATE.judges)) {
    global.__ASTRA_STATE.judges = [];
  } else {
    // Purge legacy mock Chief Jury Alpha if present
    global.__ASTRA_STATE.judges = global.__ASTRA_STATE.judges.filter(j => j.id !== 'judge_alpha_master');
  }

  if (!Array.isArray(global.__ASTRA_STATE.evaluations)) global.__ASTRA_STATE.evaluations = [];
  if (!global.__ASTRA_STATE.sessions) global.__ASTRA_STATE.sessions = {};

  // Sync live timer ticks
  const timer = global.__ASTRA_STATE.timer;
  if (timer.status === 'running' && timer.endTimestamp) {
    const now = Date.now();
    const diff = Math.ceil((timer.endTimestamp - now) / 1000);
    if (diff <= 0) {
      timer.status = 'stopped';
      timer.remaining = 0;
      timer.endTimestamp = null;
      await persistState();
    } else {
      timer.remaining = diff;
    }
  }
  return global.__ASTRA_STATE;
}

async function persistState() {
  try {
    if (global.__ASTRA_STATE) {
      global.__ASTRA_STATE.lastUpdated = Date.now();
      fs.writeFileSync(STATE_FILE, JSON.stringify(global.__ASTRA_STATE), 'utf8');
      if (SUPABASE_URL && SUPABASE_KEY) {
        await persistSupabaseState(global.__ASTRA_STATE);
      }
    }
  } catch (e) {}
}

function computeMatrix(state) {
  const teams = state.teams || [];
  const judges = state.judges.filter(j => j.active);
  const evaluations = state.evaluations || [];

  const evalMap = {};
  for (const ev of evaluations) {
    if (!evalMap[ev.team_id]) evalMap[ev.team_id] = [];
    evalMap[ev.team_id].push(ev);
  }

  const summaries = [];
  for (const team of teams) {
    const evals = evalMap[team.id] || [];
    const count = evals.length;

    let sumTotal = 0;
    let sumC1 = 0, sumC2 = 0, sumC3 = 0, sumC4 = 0, sumC5 = 0, sumC6 = 0;
    const judgeScores = {};
    const remarksList = [];

    for (const ev of evals) {
      sumTotal += ev.total;
      sumC1 += (ev.c1 || 0);
      sumC2 += (ev.c2 || 0);
      sumC3 += (ev.c3 || 0);
      sumC4 += (ev.c4 || 0);
      sumC5 += (ev.c5 || 0);
      sumC6 += (ev.c6 || 0);

      judgeScores[ev.judge_id] = {
        judgeName: ev.judge_name || 'Judge',
        total: ev.total,
        c1: ev.c1, c2: ev.c2, c3: ev.c3, c4: ev.c4, c5: ev.c5, c6: ev.c6,
        remarks: ev.remarks,
        updatedAt: ev.updated_at
      };

      if (ev.remarks && ev.remarks.trim()) {
        remarksList.push({ judgeName: ev.judge_name || 'Judge', text: ev.remarks });
      }
    }

    const avgTotal = count > 0 ? Number((sumTotal / count).toFixed(2)) : 0;
    const avgC1 = count > 0 ? Number((sumC1 / count).toFixed(2)) : 0;
    const avgC2 = count > 0 ? Number((sumC2 / count).toFixed(2)) : 0;
    const avgC3 = count > 0 ? Number((sumC3 / count).toFixed(2)) : 0;
    const avgC4 = count > 0 ? Number((sumC4 / count).toFixed(2)) : 0;
    const avgC5 = count > 0 ? Number((sumC5 / count).toFixed(2)) : 0;
    const avgC6 = count > 0 ? Number((sumC6 / count).toFixed(2)) : 0;

    summaries.push({
      teamId: team.id,
      teamName: team.name,
      domain: team.domain,
      evalCount: count,
      totalJudges: judges.length,
      judgeScores,
      avgTotal,
      avgC1,
      avgC2,
      avgC3,
      avgC4,
      avgC5,
      avgC6,
      remarks: remarksList
    });
  }

  // Deterministic tie-breaking: Total Score DESC -> Functionality (C4) DESC -> Name ASC
  summaries.sort((a, b) => {
    if (b.avgTotal !== a.avgTotal) return b.avgTotal - a.avgTotal;
    if (b.avgC4 !== a.avgC4) return b.avgC4 - a.avgC4;
    return a.teamName.localeCompare(b.teamName);
  });

  summaries.forEach((t, idx) => {
    t.rank = idx + 1;
    if (t.evalCount === 0) {
      t.award = 'PENDING EVALUATION';
    } else if (idx === 0) {
      t.award = '🏆 CHAMPION';
    } else if (idx === 1) {
      t.award = '🥈 1ST RUNNER UP';
    } else if (idx === 2) {
      t.award = '🥉 2ND RUNNER UP';
    } else {
      t.award = 'FINALIST PROTOTYPE';
    }
  });

  return {
    teams: summaries,
    activeJudges: judges,
    totalTeams: teams.length,
    lastCalculated: Date.now()
  };
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

function parseJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return Promise.resolve(req.body);
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        return Promise.resolve(JSON.parse(req.body));
      } catch (e) {
        return Promise.reject(new Error('Invalid JSON'));
      }
    }
    return Promise.resolve({});
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body || !body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').trim();
}

const JWT_SECRET = SUPABASE_KEY || 'asthra_secret_jury_token_key';

function resolveAuthenticatedJudge(req, state) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // 1. Check self-verifying HMAC token (cross-container resilient)
  if (token.startsWith('jtok_')) {
    try {
      const parts = token.slice(5).split('.');
      if (parts.length === 2) {
        const [b64, sig] = parts;
        const sigData = Buffer.from(b64, 'base64url').toString('utf8');
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(sigData).digest('hex');
        if (sig === expectedSig) {
          const [judgeId, expiresAtStr] = sigData.split('.');
          const expiresAt = parseInt(expiresAtStr, 10);
          if (expiresAt > Date.now()) {
            const judge = (state.judges || []).find(j => j.id === judgeId);
            if (judge && judge.active) return judge;
          }
        }
      }
    } catch (e) {}
  }

  // 2. Fallback to state.sessions lookup
  const session = state.sessions && state.sessions[token];
  if (session && session.expires_at > Date.now()) {
    const judge = (state.judges || []).find(j => j.id === session.judge_id);
    if (judge && judge.active) return judge;
  }
  return null;
}

module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = urlObj.pathname;

  // Normalize path if /api is omitted by routing
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
  }

  const state = await getState();

  // --------------------------------------------------------------------------
  // 1. TIMER ENDPOINTS
  // --------------------------------------------------------------------------
  if (pathname === '/api/timer' || pathname === '/api/status') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const clientUpdated = parseInt(req.headers['x-timer-updated'] || urlObj.searchParams.get('t_up') || '0', 10);
      const clientEnd = parseInt(req.headers['x-timer-end'] || urlObj.searchParams.get('t_end') || '0', 10);
      const clientDuration = parseInt(req.headers['x-timer-duration'] || urlObj.searchParams.get('t_dur') || '0', 10);
      const clientStatus = req.headers['x-timer-status'] || urlObj.searchParams.get('t_st') || '';

      // If container's in-memory timer is colder than client's active timer, adopt it to heal this serverless container
      if (clientUpdated > (state.timer.lastUpdated || 0) && clientStatus === 'running' && clientEnd > Date.now()) {
        state.timer.status = 'running';
        state.timer.duration = clientDuration || state.timer.duration || 300;
        state.timer.endTimestamp = clientEnd;
        state.timer.lastUpdated = clientUpdated;
        state.timer.remaining = Math.max(0, Math.ceil((clientEnd - Date.now()) / 1000));
        await persistState();
      }

      const now = Date.now();
      if (state.timer.status === 'running' && state.timer.endTimestamp) {
        const diff = Math.ceil((state.timer.endTimestamp - now) / 1000);
        if (diff <= 0) {
          state.timer.status = 'stopped';
          state.timer.remaining = 0;
          state.timer.endTimestamp = null;
          await persistState();
        } else {
          state.timer.remaining = diff;
        }
      }
      return sendJson(res, 200, {
        ok: true,
        online: true,
        timer: state.timer,
        domains: state.domains,
        leaderboard: {
          state: state.leaderboard.state,
          updatedAt: state.leaderboard.updatedAt || state.leaderboard.publishedAt || 0,
          publishedAt: state.leaderboard.publishedAt,
          teams: state.leaderboard.state === 'PUBLISHED' ? (state.leaderboard.snapshot || []) : []
        },
        leaderboardState: state.leaderboard.state
      });
    }
  }

  if (pathname === '/api/timer/start' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    state.timer.status = 'running';
    if (typeof body.duration === 'number' && body.duration > 0) {
      state.timer.duration = body.duration;
    }
    if (typeof body.remaining === 'number') {
      state.timer.remaining = body.remaining;
    }
    if (typeof body.bonusSeconds === 'number') {
      state.timer.bonusSeconds = body.bonusSeconds;
    }
    state.timer.startTimestamp = body.startTimestamp || now;
    state.timer.endTimestamp = body.endTimestamp || (now + (state.timer.remaining || state.timer.duration) * 1000);
    state.timer.lastUpdated = body.lastUpdated || now;
    await persistState();
    return sendJson(res, 200, { ok: true, timer: state.timer });
  }

  if (pathname === '/api/timer/pause' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    state.timer.status = 'paused';
    if (typeof body.remaining === 'number') {
      state.timer.remaining = body.remaining;
    } else if (state.timer.endTimestamp) {
      const diff = Math.ceil((state.timer.endTimestamp - now) / 1000);
      state.timer.remaining = Math.max(0, diff);
    }
    state.timer.endTimestamp = null;
    state.timer.lastUpdated = body.lastUpdated || now;
    await persistState();
    return sendJson(res, 200, { ok: true, timer: state.timer });
  }

  if (pathname === '/api/timer/resume' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    state.timer.status = 'running';
    if (typeof body.remaining === 'number') {
      state.timer.remaining = body.remaining;
    }
    state.timer.endTimestamp = body.endTimestamp || (now + (state.timer.remaining || state.timer.duration) * 1000);
    state.timer.lastUpdated = body.lastUpdated || now;
    await persistState();
    return sendJson(res, 200, { ok: true, timer: state.timer });
  }

  if (pathname === '/api/timer/bonus' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    const now = Date.now();
    const bonusSecs = parseInt(body.bonusSeconds, 10) || 0;

    if (body.resetBonus) {
      const curBonus = state.timer.bonusSeconds || 0;
      state.timer.bonusSeconds = 0;
      state.timer.duration = Math.max(1, (state.timer.duration || 300) - curBonus);
      if (state.timer.status === 'running' && state.timer.endTimestamp) {
        state.timer.endTimestamp = Math.max(now, state.timer.endTimestamp - (curBonus * 1000));
        const diff = Math.ceil((state.timer.endTimestamp - now) / 1000);
        state.timer.remaining = Math.max(0, diff);
      } else {
        state.timer.remaining = Math.max(0, (state.timer.remaining || 0) - curBonus);
      }
    } else if (bonusSecs !== 0) {
      state.timer.bonusSeconds = Math.max(0, (state.timer.bonusSeconds || 0) + bonusSecs);
      state.timer.duration = Math.max(1, (state.timer.duration || 300) + bonusSecs);

      if (state.timer.status === 'running') {
        if (state.timer.endTimestamp) {
          state.timer.endTimestamp += bonusSecs * 1000;
        } else {
          state.timer.endTimestamp = now + (state.timer.remaining + bonusSecs) * 1000;
        }
        const diff = Math.ceil((state.timer.endTimestamp - now) / 1000);
        state.timer.remaining = Math.max(0, diff);
      } else if (state.timer.status === 'stopped' && bonusSecs > 0) {
        state.timer.status = 'running';
        state.timer.remaining = bonusSecs;
        state.timer.endTimestamp = now + (bonusSecs * 1000);
      } else {
        state.timer.remaining = Math.max(0, (state.timer.remaining || 0) + bonusSecs);
      }
    }
    state.timer.lastUpdated = now;
    await persistState();
    return sendJson(res, 200, { ok: true, timer: state.timer });
  }

  if (pathname === '/api/timer/stop' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    state.timer.status = 'stopped';
    state.timer.remaining = 0;
    state.timer.endTimestamp = null;
    state.timer.lastUpdated = body.lastUpdated || Date.now();
    await persistState();
    return sendJson(res, 200, { ok: true, timer: state.timer });
  }

  if (pathname === '/api/timer/reset' && req.method === 'POST') {
    let body = {};
    try { body = await parseJsonBody(req); } catch (e) {}
    state.timer.status = 'idle';
    if (typeof body.duration === 'number' && body.duration > 0) {
      state.timer.duration = body.duration;
    }
    state.timer.remaining = state.timer.duration;
    state.timer.bonusSeconds = 0;
    state.timer.startTimestamp = null;
    state.timer.endTimestamp = null;
    state.timer.lastUpdated = body.lastUpdated || Date.now();
    await persistState();
    return sendJson(res, 200, { ok: true, timer: state.timer });
  }

  if (pathname === '/api/timer/set' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      let duration = 300;
      if (typeof body.duration === 'number' && body.duration > 0) {
        duration = Math.floor(body.duration);
      } else {
        const hrs = parseInt(body.hours, 10) || 0;
        const mins = parseInt(body.minutes, 10) || 0;
        const secs = parseInt(body.seconds, 10) || 0;
        duration = Math.max(1, hrs * 3600 + mins * 60 + secs);
      }
      state.timer = {
        status: 'idle',
        duration: duration,
        remaining: duration,
        startTimestamp: null,
        endTimestamp: null,
        bonusSeconds: 0,
        lastUpdated: body.lastUpdated || Date.now()
      };
      await persistState();
      return sendJson(res, 200, { ok: true, timer: state.timer });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // 2. DOMAINS VISIBILITY
  // --------------------------------------------------------------------------
  if (pathname === '/api/domains/visibility') {
    if (req.method === 'GET') {
      return sendJson(res, 200, state.domains);
    }
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (typeof body.isHidden === 'boolean') {
          state.domains.isHidden = body.isHidden;
        } else {
          state.domains.isHidden = !state.domains.isHidden;
        }
        state.domains.updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
        await persistState();
        return sendJson(res, 200, { ok: true, domains: state.domains });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2B. INAUGURATION CLOCK CONTROLLER
  // --------------------------------------------------------------------------
  if (pathname === '/api/inauguration') {
    if (req.method === 'GET') {
      return sendJson(res, 200, state.inauguration);
    }
  }

  if (pathname === '/api/inauguration/toggle' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (typeof body.isVisible === 'boolean') {
        state.inauguration.isVisible = body.isVisible;
      } else {
        state.inauguration.isVisible = !state.inauguration.isVisible;
      }
      state.inauguration.updatedAt = Date.now();
      await persistState();
      return sendJson(res, 200, { ok: true, inauguration: state.inauguration });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/inauguration/trigger' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const now = Date.now();
      if (typeof body.isInaugurated === 'boolean') {
        state.inauguration.isInaugurated = body.isInaugurated;
      } else {
        state.inauguration.isInaugurated = !state.inauguration.isInaugurated;
      }
      state.inauguration.inauguratedAt = state.inauguration.isInaugurated ? now : null;
      state.inauguration.updatedAt = now;

      // Automatically reveal PDF upon event launch / inauguration
      if (state.inauguration.isInaugurated) {
        if (!state.pdf) state.pdf = { isHidden: true, manualHideAfterInaug: false, updatedAt: 0 };
        state.pdf.isHidden = false;
        state.pdf.manualHideAfterInaug = false;
        state.pdf.updatedAt = now;
      }

      await persistState();
      return sendJson(res, 200, { ok: true, inauguration: state.inauguration, pdf: state.pdf });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // 2C. PARTICIPANT HANDBOOK (PARTICIPATE.PDF) VISIBILITY CONTROLLER
  // --------------------------------------------------------------------------
  if (pathname === '/api/pdf/visibility') {
    if (!state.pdf) {
      state.pdf = { isHidden: false, manualHideAfterInaug: false, updatedAt: 0 };
    }
    const inau = state.inauguration || {};
    const isLaunched = inau.isInaugurated || Date.now() >= (inau.targetTimestamp || 1789621200000);
    if (isLaunched && !state.pdf.manualHideAfterInaug) {
      state.pdf.isHidden = false;
    }
    if (req.method === 'GET') {
      return sendJson(res, 200, state.pdf);
    }
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (typeof body.isHidden === 'boolean') {
          state.pdf.isHidden = body.isHidden;
        } else {
          state.pdf.isHidden = !state.pdf.isHidden;
        }
        if (isLaunched && state.pdf.isHidden) {
          state.pdf.manualHideAfterInaug = true;
        } else if (!state.pdf.isHidden) {
          state.pdf.manualHideAfterInaug = false;
        }
        state.pdf.updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
        await persistState();
        return sendJson(res, 200, { ok: true, pdf: state.pdf });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2D. AUTHORIZED HANDBOOK DOWNLOAD & DIRECT EMBARGO ENFORCEMENT
  // --------------------------------------------------------------------------
  if (pathname === '/api/pdf/download' || pathname.endsWith('participate.pdf') || pathname.endsWith('participate_main.pdf') || pathname.endsWith('judging.pdf')) {
    if (!state.pdf) {
      state.pdf = { isHidden: false, manualHideAfterInaug: false, updatedAt: 0 };
    }
    const inau = state.inauguration || {};
    const isLaunched = inau.isInaugurated || Date.now() >= (inau.targetTimestamp || 1789621200000);
    let effectiveHidden = state.pdf.isHidden;
    if (isLaunched && !state.pdf.manualHideAfterInaug) {
      effectiveHidden = false;
    }

    if (effectiveHidden) {
      res.writeHead(403, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
      return res.end(JSON.stringify({
        error: 'HANDBOOK_EMBARGOED',
        message: 'Official event handbook is locked under jury embargo until kickoff (17-Sep-2026 10:30 AM).'
      }));
    }

    const targetFile = pathname.includes('judging') ? 'judging.pdf' : 'participate.pdf';
    const possiblePaths = [
      path.join(__dirname, targetFile),
      path.join(__dirname, '..', targetFile),
      path.join(process.cwd(), targetFile),
      path.join(process.cwd(), 'api', targetFile)
    ];

    let resolvedPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        resolvedPath = p;
        break;
      }
    }

    if (!resolvedPath) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      return res.end(JSON.stringify({ error: 'FILE_NOT_FOUND', message: `${targetFile} not found on server.` }));
    }

    const stat = fs.statSync(resolvedPath);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${targetFile}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    });
    const stream = fs.createReadStream(resolvedPath);
    return stream.pipe(res);
  }

  // --------------------------------------------------------------------------
  // 3. LEADERBOARD STATE MACHINE
  // --------------------------------------------------------------------------
    if (pathname === '/api/leaderboard') {
      if (req.method === 'GET') {
        return sendJson(res, 200, {
          state: 'PUBLISHED',
          updatedAt: state.leaderboard.updatedAt || state.leaderboard.publishedAt || 0,
          publishedAt: state.leaderboard.publishedAt || Date.now(),
          teams: state.leaderboard.snapshot || []
        });
      }
    }

  if (pathname === '/api/leaderboard/publish' && req.method === 'POST') {
    const matrix = computeMatrix(state);
    // Build certified snapshot (ONLY legitimate evaluated teams)
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
        error: 'Cannot publish leaderboard: No evaluated teams found. Please ensure judges have submitted marks before publishing.'
      });
    }

    const now = Date.now();
    state.leaderboard = {
      state: 'PUBLISHED',
      publishedAt: now,
      updatedAt: now,
      snapshot: snapshot
    };
    await persistState();

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
    state.leaderboard = {
      state: 'EMBARGOED',
      publishedAt: null,
      updatedAt: now,
      snapshot: []
    };
    await persistState();
    return sendJson(res, 200, { ok: true, state: 'EMBARGOED', updatedAt: now, publishedAt: null, teams: [] });
  }

  // --------------------------------------------------------------------------
  // 4. JUDGE PROVISIONING & AUTHENTICATION
  // --------------------------------------------------------------------------
  if (pathname === '/api/judges') {
    if (req.method === 'GET') {
      const judges = (state.judges || []).map(j => {
        const evalCount = (state.evaluations || []).filter(e => e.judge_id === j.id).length;
        return {
          id: j.id,
          name: j.name,
          active: j.active,
          created_at: j.created_at,
          evaluated_count: evalCount
        };
      });
      return sendJson(res, 200, { judges });
    }

    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const name = sanitizeText(body.name || `Judge ${state.judges.length + 1}`);
        const id = 'judge_' + crypto.randomBytes(6).toString('hex');
        const key = 'J-' + Math.floor(1000 + Math.random() * 9000);
        const key_hash = crypto.createHash('sha256').update(key).digest('hex');
        const now = Date.now();

        const judge = { id, name, key_hash, active: 1, created_at: now };
        state.judges.push(judge);
        await persistState();

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
      const judge = state.judges.find(j => j.id === id);
      if (judge) {
        judge.active = active ? 1 : 0;
        await persistState();
      }
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
      state.judges = (state.judges || []).filter(j => j.id !== judgeId);
      state.evaluations = (state.evaluations || []).filter(e => e.judge_id !== judgeId);
      for (const token in state.sessions) {
        if (state.sessions[token].judge_id === judgeId) {
          delete state.sessions[token];
        }
      }
      await persistState();
      return sendJson(res, 200, { ok: true, message: 'Judge deleted successfully' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname.startsWith('/api/judges/') && req.method === 'DELETE') {
    const judgeId = pathname.split('/')[3];
    if (!judgeId || judgeId === 'delete') return sendJson(res, 400, { error: 'Judge ID is required' });
    try {
      state.judges = (state.judges || []).filter(j => j.id !== judgeId);
      state.evaluations = (state.evaluations || []).filter(e => e.judge_id !== judgeId);
      for (const token in state.sessions) {
        if (state.sessions[token].judge_id === judgeId) {
          delete state.sessions[token];
        }
      }
      await persistState();
      return sendJson(res, 200, { ok: true, message: 'Judge deleted successfully' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/judges/verify' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const rawKey = (body.key || '').trim().toUpperCase();
      const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

      // Match judge or default demo master key
      let judge = state.judges.find(j => j.key_hash === hash && j.active);
      if (!judge && (rawKey === 'J-1001' || rawKey === 'ASTRA2026')) {
        judge = state.judges[0];
      }

      if (!judge) {
        return sendJson(res, 401, { error: 'Invalid or deactivated jury key.' });
      }

      const now = Date.now();
      const expiresAt = now + 7 * 24 * 3600 * 1000; // 7 days
      const sigData = `${judge.id}.${expiresAt}`;
      const sig = crypto.createHmac('sha256', JWT_SECRET).update(sigData).digest('hex');
      const token = `jtok_${Buffer.from(sigData).toString('base64url')}.${sig}`;

      if (!state.sessions) state.sessions = {};
      state.sessions[token] = {
        judge_id: judge.id,
        created_at: now,
        expires_at: expiresAt
      };
      await persistState();

      return sendJson(res, 200, {
        ok: true,
        token,
        judge: { id: judge.id, name: judge.name }
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/judges/me' && req.method === 'GET') {
    const judge = resolveAuthenticatedJudge(req, state);
    if (judge) {
      return sendJson(res, 200, { ok: true, judge: { id: judge.id, name: judge.name } });
    }
    return sendJson(res, 401, { error: 'Unauthorized or expired session' });
  }

  // --------------------------------------------------------------------------
  // 5. LIVE MATRIX & EVALUATIONS
  // --------------------------------------------------------------------------
  if (pathname === '/api/admin/preview' || pathname === '/api/baseline/preview' || pathname === '/api/matrix') {
    const matrix = computeMatrix(state);
    return sendJson(res, 200, matrix);
  }

  if (pathname === '/api/submissions' || pathname === '/api/evaluations') {
    if (req.method === 'GET') {
      const judge = resolveAuthenticatedJudge(req, state);
      if (!judge) {
        return sendJson(res, 401, { error: 'Unauthorized or expired judge session' });
      }

      const rows = (state.evaluations || [])
        .filter(e => e.judge_id === judge.id)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

      return sendJson(res, 200, { submissions: rows, evaluations: rows });
    }

    if (req.method === 'POST') {
      try {
        const judge = resolveAuthenticatedJudge(req, state);
        if (!judge) {
          return sendJson(res, 401, { error: 'Unauthorized: Invalid or expired jury session. Please re-enter your key.' });
        }
        const judgeId = judge.id;

        const body = await parseJsonBody(req);
        const teamName = sanitizeText(body.teamName || '');
        const domain = sanitizeText(body.domain || '01 - AI Agents & Autonomous Systems');

        if (!teamName) {
          return sendJson(res, 400, { error: 'Team name is required' });
        }

        const c1 = Math.min(20, Math.max(0, Math.round((Number(body.scores?.c1) || 0) * 2) / 2));
        const c2 = Math.min(20, Math.max(0, Math.round((Number(body.scores?.c2) || 0) * 2) / 2));
        const c3 = Math.min(20, Math.max(0, Math.round((Number(body.scores?.c3) || 0) * 2) / 2));
        const c4 = Math.min(25, Math.max(0, Math.round((Number(body.scores?.c4) || 0) * 2) / 2));
        const c5 = Math.min(10, Math.max(0, Math.round((Number(body.scores?.c5) || 0) * 2) / 2));
        const c6 = Math.min(5, Math.max(0, Math.round((Number(body.scores?.c6) || 0) * 2) / 2));
        const total = Number((c1 + c2 + c3 + c4 + c5 + c6).toFixed(1));
        const remarks = sanitizeText(body.remarks || '');
        const now = Date.now();

        // Upsert team
        let team = state.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
        if (!team) {
          team = { id: 'team_' + crypto.randomBytes(4).toString('hex'), name: teamName, domain };
          state.teams.push(team);
        } else {
          team.domain = domain;
        }

        const existingIdx = state.evaluations.findIndex(e => e.judge_id === judgeId && e.team_id === team.id);
        const evalItem = {
          id: 'eval_' + judgeId + '_' + team.id,
          judge_id: judgeId,
          judge_name: judge.name,
          team_id: team.id,
          team_name: team.name,
          domain: team.domain,
          c1, c2, c3, c4, c5, c6, total,
          remarks,
          updated_at: now
        };

        if (existingIdx >= 0) {
          state.evaluations[existingIdx] = evalItem;
        } else {
          state.evaluations.push(evalItem);
        }

        await persistState();
        return sendJson(res, 200, { ok: true, total, teamId: team.id, updatedAt: now });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5B. TEAM REGISTRATION & MANAGEMENT
  // --------------------------------------------------------------------------
  if (pathname === '/api/teams') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { teams: state.teams || [] });
    }
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const name = sanitizeText(body.name || body.teamName || '');
        const domain = sanitizeText(body.domain || '01 - AI Agents & Autonomous Systems');
        if (!name) return sendJson(res, 400, { error: 'Team name is required' });

        if (!Array.isArray(state.teams)) state.teams = [];
        let team = state.teams.find(t => t.name.toLowerCase() === name.toLowerCase());
        const now = Date.now();
        if (team) {
          team.domain = domain;
        } else {
          team = {
            id: 'team_' + crypto.randomBytes(4).toString('hex'),
            name: name,
            domain: domain,
            created_at: now
          };
          state.teams.push(team);
        }

        await persistState();
        return sendJson(res, 201, { ok: true, team });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5C. TEAM DELETION & RESET (BEFORE PUSHING TO LEADERBOARD)
  // --------------------------------------------------------------------------
  if (pathname === '/api/teams/delete' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const teamId = body.id || body.teamId;
      if (!teamId) return sendJson(res, 400, { error: 'Team ID is required' });

      const targetTeam = (state.teams || []).find(t => t.id === teamId);
      state.teams = (state.teams || []).filter(t => t.id !== teamId);
      state.evaluations = (state.evaluations || []).filter(e => e.team_id !== teamId);
      if (state.leaderboard && Array.isArray(state.leaderboard.snapshot)) {
        state.leaderboard.snapshot = state.leaderboard.snapshot.filter(t => t.teamId !== teamId && (!targetTeam || t.teamName !== targetTeam.name));
      }
      await persistState();
      return sendJson(res, 200, { ok: true, message: 'Team successfully deleted' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname.startsWith('/api/teams/') && req.method === 'DELETE') {
    const teamId = pathname.split('/')[3];
    if (!teamId || teamId === 'delete') return sendJson(res, 400, { error: 'Team ID is required' });
    try {
      const targetTeam = (state.teams || []).find(t => t.id === teamId);
      state.teams = (state.teams || []).filter(t => t.id !== teamId);
      state.evaluations = (state.evaluations || []).filter(e => e.team_id !== teamId);
      if (state.leaderboard && Array.isArray(state.leaderboard.snapshot)) {
        state.leaderboard.snapshot = state.leaderboard.snapshot.filter(t => t.teamId !== teamId && (!targetTeam || t.teamName !== targetTeam.name));
      }
      await persistState();
      return sendJson(res, 200, { ok: true, message: 'Team successfully deleted' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/teams/clear' && req.method === 'POST') {
    try {
      state.teams = [];
      state.evaluations = [];
      if (state.leaderboard) {
        state.leaderboard.snapshot = [];
        state.leaderboard.updatedAt = Date.now();
      }
      await persistState();
      return sendJson(res, 200, { ok: true, message: 'All teams and scores cleared' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // 6. SERVER-SENT EVENTS (SSE) STREAM
  // --------------------------------------------------------------------------
  if (pathname === '/api/timer/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const matrix = computeMatrix(state);
    const publicLeaderboard = state.leaderboard.state === 'PUBLISHED'
      ? { state: 'PUBLISHED', publishedAt: state.leaderboard.publishedAt, teams: state.leaderboard.snapshot }
      : { state: 'EMBARGOED', teams: [] };

    res.write(`data: ${JSON.stringify({
      timer: state.timer,
      leaderboard: publicLeaderboard,
      adminMatrix: matrix,
      domains: state.domains,
      inauguration: state.inauguration,
      pdf: state.pdf
    })}\n\n`);

    res.end();
    return;
  }

  // Fallback 404 for unknown API routes
  return sendJson(res, 404, { error: 'API route not found', pathname });
};
