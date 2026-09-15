/**
 * ASTRA 11.0: BUILD-A-BOT — ADMIN CONTROL DECK CLIENT CONTROLLER (admin.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements: Timer
  const adminClock = document.getElementById('admin-clock');
  const adminPhase = document.getElementById('admin-phase');
  const btnStart = document.getElementById('admin-start-btn');
  const btnPause = document.getElementById('admin-pause-btn');
  const btnResume = document.getElementById('admin-resume-btn');
  const btnStop = document.getElementById('admin-stop-btn');
  const btnReset = document.getElementById('admin-reset-btn');
  const slotHrs = document.getElementById('slot-hrs');
  const slotMins = document.getElementById('slot-mins');
  const slotSecs = document.getElementById('slot-secs');
  const btnApplySlots = document.getElementById('btn-apply-slots');
  const presetBtns = document.querySelectorAll('.preset-btn');

  // Elements: Rubric Drawer
  const btnToggleRubric = document.getElementById('btn-toggle-rubric');
  const rubricDrawerBody = document.getElementById('rubric-drawer-body');
  const rubricDrawerArrow = document.getElementById('rubric-drawer-arrow');

  // Elements: Judge Management
  const addJudgeForm = document.getElementById('add-judge-form');
  const newJudgeName = document.getElementById('new-judge-name');
  const judgesTbody = document.getElementById('judges-tbody');
  const judgeCountBadge = document.getElementById('judge-count-badge');

  // Elements: Live Matrix & Leaderboard
  const juryMatrixTbody = document.getElementById('jury-matrix-tbody');
  const btnPublishLb = document.getElementById('btn-publish-leaderboard');
  const btnLockLb = document.getElementById('btn-lock-leaderboard');
  const lbCurrentStateText = document.getElementById('lb-current-state-text');
  const syncIndicatorText = document.getElementById('sync-indicator-text');

  const STORAGE_KEY = 'astra_timer_state_v1';
  const CHANNEL_NAME = 'astra_timer_sync_channel';

  let localTimer = {
    status: 'idle',
    duration: 300,
    remaining: 300,
    startTimestamp: null,
    endTimestamp: null
  };

  // Load any previously saved timer from local storage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.remaining === 'number') {
        localTimer = parsed;
      }
    }
  } catch (e) {}

  let broadcastChannel = null;
  try {
    if ('BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) {}

  function broadcastTimer(timer) {
    if (!timer) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'TIMER_UPDATE', state: timer });
      }
    } catch (e) {}
  }

  function broadcastLeaderboard(lb) {
    if (!lb) return;
    try {
      localStorage.setItem('astra_leaderboard_state', JSON.stringify(lb));
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'LEADERBOARD_UPDATE', state: lb });
      }
    } catch (e) {}
  }

  function broadcastDomains(hidden) {
    try {
      localStorage.setItem('astra_domains_hidden', JSON.stringify(hidden));
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'DOMAINS_UPDATE', state: { isHidden: hidden } });
      }
    } catch (e) {}
  }

  let localMatrix = null;
  let judgesList = [];

  // ==========================================================================
  // 1. FORMATTING HELPERS
  // ==========================================================================
  function formatTime(seconds) {
    const s = Math.max(0, seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // 2. TIMER CONTROLLER & RENDERING
  // ==========================================================================
  function renderTimer() {
    let currentRemaining = localTimer.remaining;

    if (localTimer.status === 'running' && localTimer.endTimestamp) {
      const diff = Math.ceil((localTimer.endTimestamp - Date.now()) / 1000);
      currentRemaining = Math.max(0, diff);
      localTimer.remaining = currentRemaining;
    }

    adminClock.textContent = formatTime(currentRemaining);

    // Styling & Button visibility
    if (localTimer.status === 'running') {
      adminClock.className = 'big-clock clock-running';
      adminPhase.textContent = 'STATUS: ACTIVE // CLOCK TICKING LIVE';
      btnStart.style.display = 'none';
      btnResume.style.display = 'none';
      btnPause.style.display = 'inline-flex';
    } else if (localTimer.status === 'paused') {
      adminClock.className = 'big-clock clock-paused';
      adminPhase.textContent = 'STATUS: PAUSED // TIME FROZEN';
      btnStart.style.display = 'none';
      btnPause.style.display = 'none';
      btnResume.style.display = 'inline-flex';
    } else if (localTimer.status === 'stopped') {
      adminClock.className = 'big-clock';
      adminClock.style.color = 'var(--text-muted)';
      adminPhase.textContent = 'STATUS: STOPPED // TIME EXPIRED';
      btnStart.style.display = 'inline-flex';
      btnPause.style.display = 'none';
      btnResume.style.display = 'none';
    } else {
      adminClock.className = 'big-clock';
      adminClock.style.color = '#ffffff';
      adminPhase.textContent = 'STATUS: STANDBY (AWAITING KICKOFF)';
      btnStart.style.display = 'inline-flex';
      btnPause.style.display = 'none';
      btnResume.style.display = 'none';
    }
  }

  // Initial render
  renderTimer();

  // Timer Tick Loop
  setInterval(renderTimer, 500);

  // Timer Actions
  btnStart.addEventListener('click', async () => {
    const now = Date.now();
    localTimer.status = 'running';
    localTimer.startTimestamp = now;
    localTimer.endTimestamp = now + (localTimer.remaining || localTimer.duration) * 1000;
    localTimer.lastUpdated = now;
    broadcastTimer(localTimer);
    renderTimer();

    try {
      const res = await fetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localTimer)
      });
      const data = await res.json();
      if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
        localTimer = data.timer;
        broadcastTimer(localTimer);
        renderTimer();
      }
    } catch (e) {}
  });

  btnPause.addEventListener('click', async () => {
    if (localTimer.status === 'running') {
      const now = Date.now();
      const diff = Math.ceil((localTimer.endTimestamp - now) / 1000);
      localTimer.remaining = Math.max(0, diff);
      localTimer.status = 'paused';
      localTimer.endTimestamp = null;
      localTimer.lastUpdated = now;
      broadcastTimer(localTimer);
      renderTimer();

      try {
        const res = await fetch('/api/timer/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localTimer)
        });
        const data = await res.json();
        if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
          localTimer = data.timer;
          broadcastTimer(localTimer);
          renderTimer();
        }
      } catch (e) {}
    }
  });

  btnResume.addEventListener('click', async () => {
    if (localTimer.status === 'paused') {
      const now = Date.now();
      localTimer.status = 'running';
      localTimer.endTimestamp = now + (localTimer.remaining || localTimer.duration) * 1000;
      localTimer.lastUpdated = now;
      broadcastTimer(localTimer);
      renderTimer();

      try {
        const res = await fetch('/api/timer/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localTimer)
        });
        const data = await res.json();
        if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
          localTimer = data.timer;
          broadcastTimer(localTimer);
          renderTimer();
        }
      } catch (e) {}
    }
  });

  btnStop.addEventListener('click', async () => {
    if (confirm('Stop the active timer and cut off participant screens?')) {
      const now = Date.now();
      localTimer.status = 'stopped';
      localTimer.remaining = 0;
      localTimer.endTimestamp = null;
      localTimer.lastUpdated = now;
      broadcastTimer(localTimer);
      renderTimer();

      try {
        const res = await fetch('/api/timer/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localTimer)
        });
        const data = await res.json();
        if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
          localTimer = data.timer;
          broadcastTimer(localTimer);
          renderTimer();
        }
      } catch (e) {}
    }
  });

  btnReset.addEventListener('click', async () => {
    const now = Date.now();
    localTimer.status = 'idle';
    localTimer.remaining = localTimer.duration;
    localTimer.startTimestamp = null;
    localTimer.endTimestamp = null;
    localTimer.lastUpdated = now;
    broadcastTimer(localTimer);
    renderTimer();

    try {
      const res = await fetch('/api/timer/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localTimer)
      });
      const data = await res.json();
      if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
        localTimer = data.timer;
        broadcastTimer(localTimer);
        renderTimer();
      }
    } catch (e) {}
  });

  // Apply Custom Slots (HH:MM:SS)
  btnApplySlots.addEventListener('click', async () => {
    const hrs = parseInt(slotHrs.value, 10) || 0;
    const mins = parseInt(slotMins.value, 10) || 0;
    const secs = parseInt(slotSecs.value, 10) || 0;
    const duration = Math.max(1, hrs * 3600 + mins * 60 + secs);
    const now = Date.now();

    presetBtns.forEach(b => b.classList.remove('active'));

    localTimer = {
      status: 'idle',
      duration: duration,
      remaining: duration,
      startTimestamp: null,
      endTimestamp: null,
      lastUpdated: now
    };
    broadcastTimer(localTimer);
    renderTimer();

    try {
      const res = await fetch('/api/timer/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hrs, minutes: mins, seconds: secs, duration, lastUpdated: now })
      });
      const data = await res.json();
      if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
        localTimer = data.timer;
        broadcastTimer(localTimer);
        renderTimer();
      }
    } catch (e) {}
  });

  // Presets
  presetBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const hrs = parseInt(btn.getAttribute('data-hrs'), 10) || 0;
      const mins = parseInt(btn.getAttribute('data-mins'), 10) || 0;
      const secs = parseInt(btn.getAttribute('data-secs'), 10) || 0;
      const duration = Math.max(1, hrs * 3600 + mins * 60 + secs);
      const now = Date.now();

      slotHrs.value = hrs;
      slotMins.value = mins;
      slotSecs.value = secs;

      localTimer = {
        status: 'idle',
        duration: duration,
        remaining: duration,
        startTimestamp: null,
        endTimestamp: null,
        lastUpdated: now
      };
      broadcastTimer(localTimer);
      renderTimer();

      try {
        const res = await fetch('/api/timer/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours: hrs, minutes: mins, seconds: secs, duration, lastUpdated: now })
        });
        const data = await res.json();
        if (data.timer && (!localTimer.lastUpdated || data.timer.lastUpdated >= localTimer.lastUpdated)) {
          localTimer = data.timer;
          broadcastTimer(localTimer);
          renderTimer();
        }
      } catch (e) {}
    });
  });

  // ==========================================================================
  // 3. COLLAPSIBLE RUBRIC DRAWER
  // ==========================================================================
  let isRubricOpen = false;
  btnToggleRubric.addEventListener('click', () => {
    isRubricOpen = !isRubricOpen;
    rubricDrawerBody.style.display = isRubricOpen ? 'block' : 'none';
    rubricDrawerArrow.textContent = isRubricOpen ? '▲' : '▼';
  });

  // ==========================================================================
  // 4. JUDGE PROVISIONING & MANAGEMENT
  // ==========================================================================
  async function loadJudges() {
    try {
      const res = await fetch('/api/judges');
      if (!res.ok) return;
      const data = await res.json();
      judgesList = data.judges || [];

      judgeCountBadge.textContent = `${judgesList.length} JUDGES REGISTERED`;

      if (judgesList.length === 0) {
        judgesTbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No judges provisioned yet. Click "Add New Judge" above.
            </td>
          </tr>
        `;
        return;
      }

      const currentOrigin = window.location.origin;

      judgesTbody.innerHTML = judgesList.map(j => {
        const directLink = `${currentOrigin}/judge.html?key=${j.key_hash ? '' : ''}`;
        return `
          <tr>
            <td style="font-weight: 700; color: #ffffff;">${escapeHtml(j.name)}</td>
            <td>
              <span class="key-badge">SAVED IN DB</span>
            </td>
            <td>
              <span style="font-family: 'JetBrains Mono'; font-size: 11px; color: ${j.active ? 'var(--green)' : 'var(--red)'};">
                ${j.active ? '● ACTIVE' : '○ DEACTIVATED'}
              </span>
            </td>
            <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--blue);">
              ${j.evaluated_count || 0} teams
            </td>
            <td>
              <a href="/judge.html" target="_blank" class="btn-copy-link" style="text-decoration: none; margin-right: 4px;">
                OPEN PORTAL ↗
              </a>
            </td>
            <td>
              <button class="btn-deact-judge" data-id="${j.id}" data-active="${j.active}">
                ${j.active ? 'DEACTIVATE' : 'ACTIVATE'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Bind deactivate buttons
      document.querySelectorAll('.btn-deact-judge').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const currentActive = btn.getAttribute('data-active') === '1';
          await fetch('/api/judges/deactivate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, active: !currentActive })
          });
          loadJudges();
        });
      });
    } catch (e) {}
  }

  addJudgeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newJudgeName.value.trim();
    if (!name) return;

    try {
      const res = await fetch('/api/judges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to add judge');
        return;
      }

      newJudgeName.value = '';
      loadJudges();

      // Show the generated credential key & direct login link clearly
      const directUrl = `${window.location.origin}/judge.html?key=${data.judge.key}`;
      prompt(
        `✓ Judge created successfully!\n\nIMPORTANT: Copy this unique Key / Direct Link and share it with ${data.judge.name}:\n`,
        directUrl
      );
    } catch (err) {
      alert('Network error provisioning judge');
    }
  });

  // ==========================================================================
  // 5. LIVE MULTI-JUDGE EVALUATION MATRIX PREVIEW
  // ==========================================================================
  async function loadMatrix() {
    try {
      const res = await fetch('/api/admin/preview');
      if (!res.ok) return;
      localMatrix = await res.json();
      renderMatrix(localMatrix);
    } catch (e) {}
  }

  function renderMatrix(matrix) {
    if (!matrix || !matrix.teams || matrix.teams.length === 0) {
      juryMatrixTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">
            Awaiting judge evaluations... Scores will populate here live as judges upload marks.
          </td>
        </tr>
      `;
      return;
    }

    juryMatrixTbody.innerHTML = matrix.teams.map(t => {
      // Juror score pills
      const scoreEntries = Object.values(t.judgeScores || {});
      let pillsHtml = '';
      if (scoreEntries.length === 0) {
        pillsHtml = '<span style="color: var(--text-muted); font-size: 11px;">Pending juror marks</span>';
      } else {
        pillsHtml = scoreEntries.map(s => `
          <span class="jury-score-pill" title="C4 Functionality: ${s.c4}/25">
            ${escapeHtml(s.judgeName)}: <strong>${s.total.toFixed(1)}</strong>
          </span>
        `).join('');
      }

      // Remarks button or text
      let feedbackHtml = '—';
      if (t.remarks && t.remarks.length > 0) {
        const feedbackSummary = t.remarks.map(r => `[${r.judgeName}]: "${r.text}"`).join('\n\n');
        feedbackHtml = `
          <button class="btn-copy-link" onclick="alert(\`FEEDBACK FOR ${escapeHtml(t.teamName)}:\\n\\n${escapeHtml(feedbackSummary)}\`)">
            💬 VIEW (${t.remarks.length})
          </button>
        `;
      }

      return `
        <tr>
          <td style="font-family: 'JetBrains Mono'; font-weight: 800; font-size: 14px; color: ${t.rank <= 3 ? 'var(--green)' : 'var(--text)'};">
            #${t.rank}
          </td>
          <td style="font-weight: 700; color: #ffffff;">${escapeHtml(t.teamName)}</td>
          <td style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(t.domain)}</td>
          <td>${pillsHtml}</td>
          <td class="score-avg-highlight">
            ${t.evalCount > 0 ? t.avgTotal.toFixed(2) : '—'}
            ${t.evalCount > 0 ? '<span style="font-size: 11px; color: var(--text-muted);">/ 100</span>' : ''}
          </td>
          <td class="c4-highlight">
            ${t.evalCount > 0 ? t.avgC4.toFixed(2) : '—'}
          </td>
          <td style="font-family: 'JetBrains Mono'; font-size: 11.5px; font-weight: 700; color: ${t.evalCount === 0 ? 'var(--text-muted)' : 'var(--green)'};">
            ${escapeHtml(t.award)}
          </td>
          <td>${feedbackHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // ==========================================================================
  // 6. LEADERBOARD PUBLISH & EMBARGO CONTROLS
  // ==========================================================================
  async function loadLeaderboardState() {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      updateLeaderboardBadge(data.state);
    } catch (e) {}
  }

  function updateLeaderboardBadge(state) {
    if (state === 'PUBLISHED') {
      lbCurrentStateText.innerHTML = 'LEADERBOARD STATUS: <span class="status-published">🔓 PUBLISHED (BROADCAST ACTIVE)</span>';
      btnPublishLb.textContent = '✓ LEADERBOARD IS LIVE';
      btnPublishLb.style.background = 'var(--green)';
      btnPublishLb.style.color = '#04140a';
    } else {
      lbCurrentStateText.innerHTML = 'LEADERBOARD STATUS: <span class="status-locked">🔒 LOCKED (EMBARGOED)</span>';
      btnPublishLb.innerHTML = '<span>🔓</span> <span>PUSH &amp; PUBLISH LEADERBOARD</span>';
      btnPublishLb.style.background = 'var(--blue)';
      btnPublishLb.style.color = '#ffffff';
    }
  }

  btnPublishLb.addEventListener('click', async () => {
    if (confirm('CERTIFY STANDINGS & PUBLISH OFFICIAL LEADERBOARD TO PARTICIPANTS?')) {
      updateLeaderboardBadge('PUBLISHED');
      broadcastLeaderboard({ state: 'PUBLISHED', publishedAt: Date.now() });

      try {
        const res = await fetch('/api/leaderboard/publish', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          updateLeaderboardBadge('PUBLISHED');
          broadcastLeaderboard({ state: 'PUBLISHED', publishedAt: Date.now() });
          alert(`✓ Official Leaderboard Snapshot Published with ${data.publishedCount} ranked teams!`);
        }
      } catch (e) {
        alert('Leaderboard status updated.');
      }
    }
  });

  btnLockLb.addEventListener('click', async () => {
    if (confirm('RE-LOCK EMBARGO ON LEADERBOARD? (Participants will see the locked embargo banner)')) {
      updateLeaderboardBadge('EMBARGOED');
      broadcastLeaderboard({ state: 'EMBARGOED', teams: [] });

      try {
        const res = await fetch('/api/leaderboard/lock', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          updateLeaderboardBadge('EMBARGOED');
          broadcastLeaderboard({ state: 'EMBARGOED', teams: [] });
          alert('Leaderboard is now locked under embargo.');
        }
      } catch (e) {}
    }
  });

  // ==========================================================================
  // 6B. QUICK 15 DOMAINS HIDE / UNHIDE CONTROLLER
  // ==========================================================================
  const domainsToggleBanner = document.getElementById('domains-toggle-banner');
  const domainsBadgeStatus = document.getElementById('domains-badge-status');
  const btnToggleDomains = document.getElementById('btn-toggle-domains');
  const btnDomainsIcon = document.getElementById('btn-domains-icon');
  const btnDomainsText = document.getElementById('btn-domains-text');

  let isDomainsHidden = true;
  let lastDomainsUpdatedAt = 0;

  async function loadDomainsState() {
    try {
      const res = await fetch('/api/domains/visibility');
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.isHidden === 'boolean') {
        const time = data.updatedAt || data.lastUpdated || 0;
        if (!lastDomainsUpdatedAt || time >= lastDomainsUpdatedAt) {
          if (time) lastDomainsUpdatedAt = time;
          updateDomainsUI(data.isHidden);
        }
      }
    } catch (e) {}
  }

  function updateDomainsUI(hidden) {
    isDomainsHidden = !!hidden;
    broadcastDomains(isDomainsHidden);
    if (isDomainsHidden) {
      if (domainsToggleBanner) domainsToggleBanner.classList.add('state-hidden');
      if (domainsBadgeStatus) {
        domainsBadgeStatus.className = 'domains-badge-hidden';
        domainsBadgeStatus.textContent = '🔒 SCRAMBLED / HIDDEN (LOCKED)';
      }
      if (btnToggleDomains) btnToggleDomains.className = 'btn-domains-control btn-state-reveal';
      if (btnDomainsIcon) btnDomainsIcon.textContent = '👁️';
      if (btnDomainsText) btnDomainsText.textContent = 'CLICK TO REVEAL 15 DOMAINS LIVE';
    } else {
      if (domainsToggleBanner) domainsToggleBanner.classList.remove('state-hidden');
      if (domainsBadgeStatus) {
        domainsBadgeStatus.className = 'domains-badge-revealed';
        domainsBadgeStatus.textContent = '👁️ REVEALED (VISIBLE)';
      }
      if (btnToggleDomains) btnToggleDomains.className = 'btn-domains-control btn-state-hide';
      if (btnDomainsIcon) btnDomainsIcon.textContent = '🔒';
      if (btnDomainsText) btnDomainsText.textContent = 'CLICK TO HIDE & SCRAMBLE 15 DOMAINS';
    }
  }

  if (btnToggleDomains) {
    btnToggleDomains.addEventListener('click', async () => {
      const nextState = !isDomainsHidden;
      const confirmMsg = nextState
        ? 'HIDE AND SCRAMBLE all 15 domains on the participant website? (Topics will be concealed and blurred on all screens)'
        : 'REVEAL all 15 domains on the participant website? (Topics will be unblurred and readable live for all participants)';

      if (confirm(confirmMsg)) {
        const now = Date.now();
        lastDomainsUpdatedAt = now;
        updateDomainsUI(nextState);
        broadcastDomains(nextState);

        try {
          const res = await fetch('/api/domains/visibility', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isHidden: nextState, updatedAt: now })
          });
          const data = await res.json();
          if (data.ok && data.domains) {
            const time = data.domains.updatedAt || data.domains.lastUpdated || 0;
            if (!lastDomainsUpdatedAt || time >= lastDomainsUpdatedAt) {
              updateDomainsUI(data.domains.isHidden);
            }
          }
        } catch (e) {
          // Keep optimistic local update
        }
      }
    });
  }

  // ==========================================================================
  // 7. REAL-TIME SERVER-SENT EVENTS (SSE) & MATRIX REFRESH
  // ==========================================================================
  function initSSE() {
    if (!window.EventSource) return;
    try {
      const sse = new EventSource('/api/timer/stream');
      sse.onopen = () => {
        syncIndicatorText.textContent = 'LIVE SYNC BROADCAST ACTIVE';
      };
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.adminMatrix) {
            localMatrix = data.adminMatrix;
            renderMatrix(localMatrix);
          }
          if (data.leaderboard) {
            updateLeaderboardBadge(data.leaderboard.state);
          }
        } catch (err) {}
      };
      sse.onerror = () => {
        syncIndicatorText.textContent = 'LIVE REST SYNC ACTIVE';
      };
    } catch (e) {}
  }

  // Background poller to refresh jury evaluation matrix without disrupting active admin timer
  async function pollMatrix() {
    try {
      const res = await fetch('/api/admin/preview');
      if (res.ok) {
        const data = await res.json();
        if (data.teams) {
          localMatrix = data;
          renderMatrix(localMatrix);
        }
      }
    } catch (e) {}
  }
  setInterval(pollMatrix, 3500);

  // Initial Boot
  loadJudges();
  loadMatrix();
  loadLeaderboardState();
  loadDomainsState();
  initSSE();
});
