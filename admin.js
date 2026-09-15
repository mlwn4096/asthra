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

  let localTimer = {
    status: 'idle',
    duration: 300,
    remaining: 300,
    startTimestamp: null,
    endTimestamp: null
  };

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

  // Timer Tick Loop
  setInterval(renderTimer, 500);

  // Timer Actions
  btnStart.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/timer/start', { method: 'POST' });
      const data = await res.json();
      if (data.timer) localTimer = data.timer;
      renderTimer();
    } catch (e) {}
  });

  btnPause.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/timer/pause', { method: 'POST' });
      const data = await res.json();
      if (data.timer) localTimer = data.timer;
      renderTimer();
    } catch (e) {}
  });

  btnResume.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/timer/resume', { method: 'POST' });
      const data = await res.json();
      if (data.timer) localTimer = data.timer;
      renderTimer();
    } catch (e) {}
  });

  btnStop.addEventListener('click', async () => {
    if (confirm('Stop the active timer and cut off participant screens?')) {
      try {
        const res = await fetch('/api/timer/stop', { method: 'POST' });
        const data = await res.json();
        if (data.timer) localTimer = data.timer;
        renderTimer();
      } catch (e) {}
    }
  });

  btnReset.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/timer/reset', { method: 'POST' });
      const data = await res.json();
      if (data.timer) localTimer = data.timer;
      renderTimer();
    } catch (e) {}
  });

  // Apply Custom Slots (HH:MM:SS)
  btnApplySlots.addEventListener('click', async () => {
    const hrs = parseInt(slotHrs.value, 10) || 0;
    const mins = parseInt(slotMins.value, 10) || 0;
    const secs = parseInt(slotSecs.value, 10) || 0;

    presetBtns.forEach(b => b.classList.remove('active'));

    try {
      const res = await fetch('/api/timer/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hrs, minutes: mins, seconds: secs })
      });
      const data = await res.json();
      if (data.timer) localTimer = data.timer;
      renderTimer();
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

      slotHrs.value = hrs;
      slotMins.value = mins;
      slotSecs.value = secs;

      try {
        const res = await fetch('/api/timer/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours: hrs, minutes: mins, seconds: secs })
        });
        const data = await res.json();
        if (data.timer) localTimer = data.timer;
        renderTimer();
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
      try {
        const res = await fetch('/api/leaderboard/publish', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          updateLeaderboardBadge('PUBLISHED');
          alert(`✓ Official Leaderboard Snapshot Published with ${data.publishedCount} ranked teams!`);
        }
      } catch (e) {
        alert('Failed to publish leaderboard');
      }
    }
  });

  btnLockLb.addEventListener('click', async () => {
    if (confirm('RE-LOCK EMBARGO ON LEADERBOARD? (Participants will see the locked embargo banner)')) {
      try {
        const res = await fetch('/api/leaderboard/lock', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          updateLeaderboardBadge('EMBARGOED');
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

  let isDomainsHidden = false;

  async function loadDomainsState() {
    try {
      const res = await fetch('/api/domains/visibility');
      if (!res.ok) return;
      const data = await res.json();
      updateDomainsUI(data.isHidden);
    } catch (e) {}
  }

  function updateDomainsUI(hidden) {
    isDomainsHidden = !!hidden;
    if (isDomainsHidden) {
      if (domainsToggleBanner) domainsToggleBanner.classList.add('state-hidden');
      if (domainsBadgeStatus) {
        domainsBadgeStatus.className = 'domains-badge-hidden';
        domainsBadgeStatus.textContent = '🔒 SCRAMBLED / HIDDEN';
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
        ? 'HIDE AND SCRAMBLE all 15 domains on the participant website? (Participants will not be able to read topics)'
        : 'REVEAL all 15 domains on the participant website? (Topics will be unblurred and readable live)';

      if (confirm(confirmMsg)) {
        try {
          const res = await fetch('/api/domains/visibility', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isHidden: nextState })
          });
          const data = await res.json();
          if (data.ok) {
            updateDomainsUI(data.domains.isHidden);
          }
        } catch (e) {
          alert('Failed to update domains visibility');
        }
      }
    });
  }

  // ==========================================================================
  // 7. REAL-TIME SERVER-SENT EVENTS (SSE) LISTENER
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
          if (data.timer) {
            localTimer = data.timer;
            renderTimer();
          }
          if (data.adminMatrix) {
            localMatrix = data.adminMatrix;
            renderMatrix(localMatrix);
          }
          if (data.leaderboard) {
            updateLeaderboardBadge(data.leaderboard.state);
          }
          if (data.domains) {
            updateDomainsUI(data.domains.isHidden);
          }
        } catch (err) {}
      };
      sse.onerror = () => {
        syncIndicatorText.textContent = 'RECONNECTING SYNC...';
      };
    } catch (e) {}
  }

  // Initial Boot
  loadJudges();
  loadMatrix();
  loadLeaderboardState();
  loadDomainsState();
  initSSE();
});
