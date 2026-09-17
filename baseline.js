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
    endTimestamp: null,
    bonusSeconds: 0,
    lastUpdated: 0
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
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'DOMAINS_UPDATE') {
          const d = event.data.state;
          if (d && typeof d.isHidden === 'boolean') {
            const t = d.updatedAt || 0;
            if (!lastDomainsUpdatedAt || t >= lastDomainsUpdatedAt) {
              if (t) lastDomainsUpdatedAt = t;
              updateDomainsUI(d.isHidden, false);
            }
          }
        }
      };
    }
  } catch (e) {}

  window.addEventListener('storage', (e) => {
    if (e.key === 'astra_domains_hidden' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        const isHidden = typeof parsed === 'boolean' ? parsed : parsed.isHidden;
        const t = parsed.updatedAt || 0;
        if (!lastDomainsUpdatedAt || t >= lastDomainsUpdatedAt) {
          if (t) lastDomainsUpdatedAt = t;
          updateDomainsUI(isHidden, false);
        }
      } catch (err) {}
    }
  });

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

  function broadcastDomains(hidden, updatedAt = 0) {
    try {
      const time = updatedAt || Date.now();
      localStorage.setItem('astra_domains_hidden', JSON.stringify({ isHidden: hidden, updatedAt: time }));
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'DOMAINS_UPDATE', state: { isHidden: hidden, updatedAt: time } });
      }
    } catch (e) {}
  }

  function broadcastInauguration(inaug) {
    if (!inaug) return;
    try {
      localStorage.setItem('astra_inauguration_state', JSON.stringify(inaug));
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'INAUGURATION_UPDATE', state: inaug });
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

    // Bonus Time indicator (Football Stoppage Style)
    const adminBonusPill = document.getElementById('admin-bonus-pill');
    const adminBonusBoard = document.getElementById('admin-bonus-counter-board');
    const adminBonusDigits = document.getElementById('admin-bonus-digits');
    const bonusSecs = localTimer.bonusSeconds || 0;
    if (adminBonusPill && adminBonusBoard && adminBonusDigits) {
      if (bonusSecs > 0) {
        adminBonusPill.className = 'admin-bonus-pill bonus-active';
        adminBonusPill.textContent = `+${formatTime(bonusSecs)} EXTRA TIME ACTIVE`;
        adminBonusBoard.style.display = 'inline-flex';
        adminBonusDigits.textContent = formatTime(bonusSecs);
      } else {
        adminBonusPill.className = 'admin-bonus-pill';
        adminBonusPill.textContent = 'NO BONUS ACTIVE';
        adminBonusBoard.style.display = 'none';
      }
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
      await fetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localTimer)
      });
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
        await fetch('/api/timer/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localTimer)
        });
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
        await fetch('/api/timer/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localTimer)
        });
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
        await fetch('/api/timer/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localTimer)
        });
      } catch (e) {}
    }
  });

  btnReset.addEventListener('click', async () => {
    const now = Date.now();
    localTimer.status = 'idle';
    localTimer.remaining = localTimer.duration;
    localTimer.bonusSeconds = 0;
    localTimer.startTimestamp = null;
    localTimer.endTimestamp = null;
    localTimer.lastUpdated = now;
    broadcastTimer(localTimer);
    renderTimer();

    try {
      await fetch('/api/timer/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localTimer)
      });
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
      bonusSeconds: 0,
      startTimestamp: null,
      endTimestamp: null,
      lastUpdated: now
    };
    broadcastTimer(localTimer);
    renderTimer();

    try {
      await fetch('/api/timer/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hrs, minutes: mins, seconds: secs, duration, lastUpdated: now })
      });
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
        bonusSeconds: 0,
        startTimestamp: null,
        endTimestamp: null,
        lastUpdated: now
      };
      broadcastTimer(localTimer);
      renderTimer();

      try {
        await fetch('/api/timer/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours: hrs, minutes: mins, seconds: secs, duration, lastUpdated: now })
        });
      } catch (e) {}
    });
  });

  // ==========================================================================
  // 2B. BONUS TIME CONTROLLER (FOOTBALL STOPPAGE / EXTRA TIME STYLE)
  // ==========================================================================
  async function addBonusTime(seconds) {
    const now = Date.now();
    localTimer.bonusSeconds = Math.max(0, (localTimer.bonusSeconds || 0) + seconds);
    localTimer.duration = Math.max(1, (localTimer.duration || 300) + seconds);

    if (localTimer.status === 'running') {
      if (localTimer.endTimestamp) {
        localTimer.endTimestamp += seconds * 1000;
      } else {
        localTimer.endTimestamp = now + (localTimer.remaining + seconds) * 1000;
      }
      const diff = Math.ceil((localTimer.endTimestamp - now) / 1000);
      localTimer.remaining = Math.max(0, diff);
    } else if (localTimer.status === 'stopped' && seconds > 0) {
      localTimer.status = 'running';
      localTimer.remaining = seconds;
      localTimer.endTimestamp = now + (seconds * 1000);
    } else {
      localTimer.remaining = Math.max(0, (localTimer.remaining || 0) + seconds);
    }

    localTimer.lastUpdated = now;
    broadcastTimer(localTimer);
    renderTimer();

    try {
      await fetch('/api/timer/bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bonusSeconds: seconds })
      });
    } catch (e) {}
  }

  async function resetBonusTime() {
    const now = Date.now();
    const curBonus = localTimer.bonusSeconds || 0;
    localTimer.bonusSeconds = 0;
    localTimer.duration = Math.max(1, (localTimer.duration || 300) - curBonus);
    if (localTimer.status === 'running' && localTimer.endTimestamp) {
      localTimer.endTimestamp = Math.max(now, localTimer.endTimestamp - (curBonus * 1000));
      const diff = Math.ceil((localTimer.endTimestamp - now) / 1000);
      localTimer.remaining = Math.max(0, diff);
    } else {
      localTimer.remaining = Math.max(0, (localTimer.remaining || 0) - curBonus);
    }
    localTimer.lastUpdated = now;
    broadcastTimer(localTimer);
    renderTimer();

    try {
      await fetch('/api/timer/bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetBonus: true })
      });
    } catch (e) {}
  }

  // Bonus Quick Chip Listeners
  document.querySelectorAll('.btn-bonus-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const secs = parseInt(btn.getAttribute('data-bonus-secs'), 10) || 60;
      addBonusTime(secs);
    });
  });

  const btnApplyBonus = document.getElementById('btn-apply-bonus');
  const customBonusMins = document.getElementById('custom-bonus-mins');
  if (btnApplyBonus && customBonusMins) {
    btnApplyBonus.addEventListener('click', () => {
      const mins = parseInt(customBonusMins.value, 10) || 1;
      if (mins > 0) {
        addBonusTime(mins * 60);
      }
    });
  }

  const btnResetBonus = document.getElementById('btn-reset-bonus');
  if (btnResetBonus) {
    btnResetBonus.addEventListener('click', () => {
      if (confirm('Clear all added extra/bonus time?')) {
        resetBonusTime();
      }
    });
  }

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
              <a href="judge.html" target="_blank" class="btn-copy-link" style="text-decoration: none; margin-right: 4px;">
                OPEN PORTAL ↗
              </a>
            </td>
            <td>
              <div style="display: inline-flex; gap: 6px;">
                <button class="btn-deact-judge" data-id="${j.id}" data-active="${j.active}">
                  ${j.active ? 'DEACTIVATE' : 'ACTIVATE'}
                </button>
                <button class="btn-delete-judge" data-id="${j.id}" data-name="${escapeHtml(j.name)}">
                  🗑️ DELETE
                </button>
              </div>
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

      // Bind delete buttons
      document.querySelectorAll('.btn-delete-judge').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          if (!confirm(`Permanently delete Judge "${name}"?\n\nThis will remove their login access credentials and any submitted scores.`)) {
            return;
          }
          try {
            const res = await fetch('/api/judges/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: id })
            });
            if (res.ok) {
              loadJudges();
              loadMatrix();
            } else {
              const err = await res.json();
              alert(err.error || 'Failed to delete judge');
            }
          } catch (e) {
            alert('Network error deleting judge');
          }
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
      const res = await fetch('/api/baseline/preview');
      if (!res.ok) return;
      localMatrix = await res.json();
      renderMatrix(localMatrix);
    } catch (e) {}
  }

  function renderMatrix(matrix) {
    if (!matrix || !matrix.teams || matrix.teams.length === 0) {
      juryMatrixTbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">
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
        feedbackHtml = `
          <button class="btn-copy-link btn-view-feedback" data-index="${matrix.teams.indexOf(t)}">
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
          <td>
            <button class="btn-delete-team" data-id="${escapeHtml(t.teamId)}" data-name="${escapeHtml(t.teamName)}">
              🗑️ DELETE
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Bind remarks view buttons safely
    document.querySelectorAll('.btn-view-feedback').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const teamData = matrix.teams && matrix.teams[idx];
        if (teamData && teamData.remarks && teamData.remarks.length > 0) {
          const feedbackSummary = teamData.remarks.map(r => `[${r.judgeName}]: "${r.text}"`).join('\n\n');
          alert(`FEEDBACK FOR ${teamData.teamName}:\n\n${feedbackSummary}`);
        }
      });
    });

    // Bind team delete buttons
    document.querySelectorAll('.btn-delete-team').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (!confirm(`Permanently delete team "${name}" and all associated judge evaluations?\n\nThis action cannot be undone.`)) {
          return;
        }
        try {
          const res = await fetch('/api/teams/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
          });
          if (res.ok) {
            loadMatrix();
            loadJudges();
          } else {
            const err = await res.json();
            alert(err.error || 'Failed to delete team');
          }
        } catch (e) {
          alert('Network error deleting team');
        }
      });
    });
  }

  // Clear all teams handler
  const btnClearAllTeams = document.getElementById('btn-clear-all-teams');
  if (btnClearAllTeams) {
    btnClearAllTeams.addEventListener('click', async () => {
      if (!confirm('⚠️ WARNING: Are you sure you want to delete ALL registered teams and reset all jury evaluation scores before pushing?\n\nThis will permanently wipe all team evaluations. This action cannot be undone.')) {
        return;
      }
      try {
        const res = await fetch('/api/teams/clear', {
          method: 'POST'
        });
        if (res.ok) {
          alert('All teams and scores have been cleared.');
          loadMatrix();
          loadJudges();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to clear teams');
        }
      } catch (e) {
        alert('Network error clearing teams');
      }
    });
  }

  // Register new team handler
  const addTeamForm = document.getElementById('add-team-form');
  const newTeamName = document.getElementById('new-team-name');
  const newTeamDomain = document.getElementById('new-team-domain');

  if (addTeamForm) {
    addTeamForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = newTeamName.value.trim();
      const domain = newTeamDomain ? newTeamDomain.value : '01 - AI Agents & Autonomous Systems';
      if (!name) return;

      try {
        const res = await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, domain })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Failed to register team');
          return;
        }
        newTeamName.value = '';
        loadMatrix();
      } catch (err) {
        alert('Network error registering team');
      }
    });
  }

  // ==========================================================================
  // 6. LEADERBOARD PUBLISH & EMBARGO CONTROLS
  // ==========================================================================
  let lastAdminLbUpdatedAt = 0;
  async function loadLeaderboardState() {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      const time = data.updatedAt || data.publishedAt || 0;
      if (!lastAdminLbUpdatedAt || time >= lastAdminLbUpdatedAt) {
        if (time) lastAdminLbUpdatedAt = time;
        updateLeaderboardBadge(data.state);
      }
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
          broadcastLeaderboard({
            state: 'PUBLISHED',
            publishedAt: data.publishedAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            teams: data.teams || []
          });
          alert(`✓ Official Leaderboard Snapshot Published with ${data.publishedCount} ranked teams!`);
        } else {
          alert(`⚠️ Cannot Publish:\n\n${data.error || 'Failed to publish leaderboard.'}`);
        }
      } catch (e) {
        alert('Network error publishing leaderboard');
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
          broadcastLeaderboard({
            state: 'EMBARGOED',
            updatedAt: data.updatedAt || Date.now(),
            publishedAt: null,
            teams: []
          });
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
  const domainsSubStatus = document.getElementById('domains-sub-status');
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
          updateDomainsUI(data.isHidden, false);
        }
      }
    } catch (e) {}
  }

  function updateDomainsUI(hidden, doBroadcast = true) {
    isDomainsHidden = !!hidden;
    if (doBroadcast) {
      broadcastDomains(isDomainsHidden, lastDomainsUpdatedAt || Date.now());
    }
    if (isDomainsHidden) {
      if (domainsToggleBanner) domainsToggleBanner.classList.add('state-hidden');
      if (domainsBadgeStatus) {
        domainsBadgeStatus.className = 'domains-badge-hidden';
        domainsBadgeStatus.textContent = '🔒 CURRENT STATUS: LOCKED & EMBARGOED';
      }
      if (domainsSubStatus) {
        domainsSubStatus.textContent = '15 problem directives are currently concealed & blurred on participant screens. Embargo banner is active.';
      }
      if (btnToggleDomains) btnToggleDomains.className = 'btn-domains-control btn-action-unlock';
      if (btnDomainsIcon) btnDomainsIcon.textContent = '🔓';
      if (btnDomainsText) btnDomainsText.textContent = 'UNLOCK & REVEAL 15 DOMAINS';
    } else {
      if (domainsToggleBanner) domainsToggleBanner.classList.remove('state-hidden');
      if (domainsBadgeStatus) {
        domainsBadgeStatus.className = 'domains-badge-revealed';
        domainsBadgeStatus.textContent = '🔓 CURRENT STATUS: UNLOCKED & REVEALED';
      }
      if (domainsSubStatus) {
        domainsSubStatus.textContent = 'All 15 problem directives are unblurred and fully visible live to all participants.';
      }
      if (btnToggleDomains) btnToggleDomains.className = 'btn-domains-control btn-action-lock';
      if (btnDomainsIcon) btnDomainsIcon.textContent = '🔒';
      if (btnDomainsText) btnDomainsText.textContent = 'LOCK & EMBARGO 15 DOMAINS';
    }
  }

  if (btnToggleDomains) {
    btnToggleDomains.addEventListener('click', async () => {
      const nextState = !isDomainsHidden;
      const confirmMsg = nextState
        ? 'LOCK & EMBARGO all 15 domains on participant terminals? (Topics will be concealed and blurred across all screens)'
        : 'UNLOCK & REVEAL all 15 domains live to participants? (Topics will be unblurred and instantly readable across all terminals)';

      if (confirm(confirmMsg)) {
        const now = Date.now();
        lastDomainsUpdatedAt = now;
        updateDomainsUI(nextState, true);

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
              updateDomainsUI(data.domains.isHidden, false);
            }
          }
        } catch (e) {
          // Keep optimistic local update
        }
      }
    });
  }

  // ==========================================================================
  // 6C. INAUGURATION LIVE CLOCK & EVENT COMMENCEMENT CONTROLLER
  // ==========================================================================
  const inaugAdminBanner = document.getElementById('inauguration-admin-banner');
  const inaugAdminDot = document.getElementById('inaug-admin-dot');
  const inaugAdminVisBadge = document.getElementById('inaug-admin-vis-badge');
  const inaugAdminStateBadge = document.getElementById('inaug-admin-state-badge');
  const adminInaugDays = document.getElementById('admin-inaug-days');
  const adminInaugHrs = document.getElementById('admin-inaug-hrs');
  const adminInaugMins = document.getElementById('admin-inaug-mins');
  const adminInaugSecs = document.getElementById('admin-inaug-secs');
  const btnInaugToggleVis = document.getElementById('btn-inaug-toggle-vis');
  const btnInaugVisIcon = document.getElementById('btn-inaug-vis-icon');
  const btnInaugVisText = document.getElementById('btn-inaug-vis-text');
  const btnInaugTriggerLive = document.getElementById('btn-inaug-trigger-live');
  const btnInaugTriggerIcon = document.getElementById('btn-inaug-trigger-icon');
  const btnInaugTriggerText = document.getElementById('btn-inaug-trigger-text');
  const btnInaugReset = document.getElementById('btn-inaug-reset');

  let localInauguration = {
    targetIso: '2026-09-17T10:30:00+05:30',
    targetTimestamp: 1789621200000,
    isVisible: true,
    isInaugurated: false,
    inauguratedAt: null,
    updatedAt: 0
  };
  let lastInaugUpdatedAt = 0;

  async function loadInaugurationState() {
    try {
      const res = await fetch('/api/inauguration');
      if (!res.ok) return;
      const data = await res.json();
      updateInaugurationUI(data);
    } catch (e) {}
  }

  function updateInaugurationUI(inaug) {
    if (!inaug) return;
    const time = inaug.updatedAt || 0;
    if (time && lastInaugUpdatedAt && time < lastInaugUpdatedAt) {
      return;
    }
    if (time) lastInaugUpdatedAt = time;

    localInauguration = Object.assign({}, localInauguration, inaug);
    broadcastInauguration(localInauguration);
    renderAdminInaugurationClock();
  }

  function renderAdminInaugurationClock() {
    if (!inaugAdminBanner) return;

    // Visibility Badge & Toggle Button
    if (localInauguration.isVisible !== false) {
      if (inaugAdminVisBadge) {
        inaugAdminVisBadge.className = 'badge-inaug-visible';
        inaugAdminVisBadge.textContent = '👁️ VISIBLE ON PORTAL';
      }
      if (btnInaugToggleVis) {
        btnInaugToggleVis.className = 'btn-inaug-action btn-inaug-hide';
      }
      if (btnInaugVisIcon) btnInaugVisIcon.textContent = '👁️';
      if (btnInaugVisText) btnInaugVisText.textContent = 'HIDE CLOCK ON PORTAL (MAKE IT GO)';
    } else {
      if (inaugAdminVisBadge) {
        inaugAdminVisBadge.className = 'badge-inaug-hidden';
        inaugAdminVisBadge.textContent = '🙈 HIDDEN ON PORTAL';
      }
      if (btnInaugToggleVis) {
        btnInaugToggleVis.className = 'btn-inaug-action btn-inaug-show';
      }
      if (btnInaugVisIcon) btnInaugVisIcon.textContent = '✨';
      if (btnInaugVisText) btnInaugVisText.textContent = 'SHOW CLOCK ON PORTAL (MAKE IT COME)';
    }

    const now = Date.now();
    const target = localInauguration.targetTimestamp || 1789621200000;
    const isPast = now >= target;
    const inaugurated = localInauguration.isInaugurated || isPast;

    if (inaugurated) {
      if (inaugAdminBanner) inaugAdminBanner.classList.add('inaug-is-active');
      if (inaugAdminDot) inaugAdminDot.className = 'inaug-live-dot inaug-live-green';
      if (inaugAdminStateBadge) {
        inaugAdminStateBadge.className = 'badge-inaug-celebrate';
        inaugAdminStateBadge.textContent = '🎉 EVENT COMMENCED (INAUGURATED)';
      }
      if (btnInaugTriggerLive) {
        btnInaugTriggerLive.style.opacity = '0.5';
        btnInaugTriggerLive.disabled = true;
      }
      if (btnInaugTriggerIcon) btnInaugTriggerIcon.textContent = '✓';
      if (btnInaugTriggerText) btnInaugTriggerText.textContent = 'OFFICIALLY INAUGURATED';

      if (adminInaugDays) adminInaugDays.textContent = '00';
      if (adminInaugHrs) adminInaugHrs.textContent = '00';
      if (adminInaugMins) adminInaugMins.textContent = '00';
      if (adminInaugSecs) adminInaugSecs.textContent = '00';
    } else {
      if (inaugAdminBanner) inaugAdminBanner.classList.remove('inaug-is-active');
      if (inaugAdminDot) inaugAdminDot.className = 'inaug-live-dot';
      if (inaugAdminStateBadge) {
        inaugAdminStateBadge.className = 'badge-inaug-counting';
        inaugAdminStateBadge.textContent = '⏳ COUNTDOWN TICKING';
      }
      if (btnInaugTriggerLive) {
        btnInaugTriggerLive.style.opacity = '1';
        btnInaugTriggerLive.disabled = false;
      }
      if (btnInaugTriggerIcon) btnInaugTriggerIcon.textContent = '🎉';
      if (btnInaugTriggerText) btnInaugTriggerText.textContent = 'OFFICIALLY INAUGURATE NOW';

      const diff = Math.max(0, target - now);
      const totalSecs = Math.floor(diff / 1000);
      const days = Math.floor(totalSecs / 86400);
      const hours = Math.floor((totalSecs % 86400) / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      if (adminInaugDays) adminInaugDays.textContent = String(days).padStart(2, '0');
      if (adminInaugHrs) adminInaugHrs.textContent = String(hours).padStart(2, '0');
      if (adminInaugMins) adminInaugMins.textContent = String(mins).padStart(2, '0');
      if (adminInaugSecs) adminInaugSecs.textContent = String(secs).padStart(2, '0');
    }
  }

  // Admin Countdown Clock Loop
  setInterval(renderAdminInaugurationClock, 1000);

  // Toggle Visibility: Make it Come and Go
  if (btnInaugToggleVis) {
    btnInaugToggleVis.addEventListener('click', async () => {
      const nextVis = !(localInauguration.isVisible !== false);
      const confirmMsg = nextVis
        ? 'DISPLAY the live Inauguration Clock prominently on top of the participant portal?'
        : 'HIDE the Inauguration Clock from the participant portal?';

      if (confirm(confirmMsg)) {
        const now = Date.now();
        lastInaugUpdatedAt = now;
        localInauguration.isVisible = nextVis;
        localInauguration.updatedAt = now;
        renderAdminInaugurationClock();
        broadcastInauguration(localInauguration);

        try {
          const res = await fetch('/api/inauguration/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isVisible: nextVis })
          });
          const data = await res.json();
          if (data.ok && data.inauguration) {
            updateInaugurationUI(data.inauguration);
          }
        } catch (e) {}
      }
    });
  }

  // Trigger Inauguration Manually
  if (btnInaugTriggerLive) {
    btnInaugTriggerLive.addEventListener('click', async () => {
      if (confirm('OFFICIALLY INAUGURATE ASTRA 11.0: BUILD-A-BOT NOW?\n\nThis will trigger the celebration banner and broadcast commencement across all participant screens.')) {
        const now = Date.now();
        lastInaugUpdatedAt = now;
        localInauguration.isInaugurated = true;
        localInauguration.inauguratedAt = now;
        localInauguration.updatedAt = now;
        renderAdminInaugurationClock();
        broadcastInauguration(localInauguration);

        try {
          const res = await fetch('/api/inauguration/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isInaugurated: true })
          });
          const data = await res.json();
          if (data.ok && data.inauguration) {
            updateInaugurationUI(data.inauguration);
          }
        } catch (e) {}
      }
    });
  }

  // Reset Inauguration to Countdown
  if (btnInaugReset) {
    btnInaugReset.addEventListener('click', async () => {
      if (confirm('Reset event state back to active countdown targeting 17-Sep-2026 10:30 AM?')) {
        const now = Date.now();
        lastInaugUpdatedAt = now;
        localInauguration.isInaugurated = false;
        localInauguration.inauguratedAt = null;
        localInauguration.updatedAt = now;
        renderAdminInaugurationClock();
        broadcastInauguration(localInauguration);

        try {
          const res = await fetch('/api/inauguration/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isInaugurated: false })
          });
          const data = await res.json();
          if (data.ok && data.inauguration) {
            updateInaugurationUI(data.inauguration);
          }
        } catch (e) {}
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
          if (data.domains && typeof data.domains.isHidden === 'boolean') {
            const time = data.domains.updatedAt || data.domains.lastUpdated || 0;
            if (!lastDomainsUpdatedAt || time >= lastDomainsUpdatedAt) {
              if (time) lastDomainsUpdatedAt = time;
              updateDomainsUI(data.domains.isHidden, false);
            }
          }
          if (data.inauguration) {
            updateInaugurationUI(data.inauguration);
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
      const res = await fetch('/api/baseline/preview');
      if (res.ok) {
        const data = await res.json();
        if (data.teams) {
          localMatrix = data;
          renderMatrix(localMatrix);
        }
      }
    } catch (e) {}

    // Periodic domains sync check
    loadDomainsState();
  }
  setInterval(pollMatrix, 3500);

  async function loadTimerState() {
    try {
      const res = await fetch('/api/timer');
      if (!res.ok) return;
      const data = await res.json();
      if (data.timer && typeof data.timer.remaining === 'number') {
        const srvTime = data.timer.lastUpdated || 0;
        const localTime = localTimer.lastUpdated || 0;
        if (srvTime > localTime) {
          localTimer = data.timer;
          broadcastTimer(localTimer);
          renderTimer();
        }
      }
    } catch (e) {}
  }

  // Initial Boot
  loadTimerState();
  loadJudges();
  loadMatrix();
  loadLeaderboardState();
  loadDomainsState();
  loadInaugurationState();
  initSSE();
});
