/**
 * ASTRA 11.0: BUILD-A-BOT — ADMIN CONTROLLER & JURY TABULATION SCRIPT
 * Broadcasts synchronized pitch timer events (3m presentation + 2m Q&A split),
 * manages timer presets, calculates 100-pt jury scores, and controls
 * live leaderboard embargo / push reveal to participant portal.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'astra_timer_state_v1';
  const CHANNEL_NAME = 'astra_timer_sync_channel';
  const SCORES_STORAGE_KEY = 'astra_jury_scores_v1';
  const LEADERBOARD_STORAGE_KEY = 'astra_leaderboard_state';

  // ---------------------------------------------------------------------------
  // 01. AUDIO FX SYNTHESIZER FOR ADMIN
  // ---------------------------------------------------------------------------
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
  }

  function playAlert(frequency, duration) {
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(frequency || 880, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (duration || 0.18));

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + (duration || 0.18));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // 02. TIMER STATE & SYNC BROADCAST ENGINE
  // ---------------------------------------------------------------------------
  let timerState = {
    status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
    duration: 300,  // seconds (default 5 min)
    remaining: 300,
    startTimestamp: null,
    endTimestamp: null,
    lastUpdated: Date.now()
  };

  let broadcastChannel = null;
  if ('BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch (e) {}
  }

  function broadcastState() {
    timerState.lastUpdated = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    } catch (e) {}

    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'TIMER_UPDATE', state: timerState });
    }

    try {
      fetch('/api/timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timerState)
      }).catch(() => {});
    } catch (e) {}
  }

  // Load existing state
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed.duration === 'number') {
        timerState = Object.assign({}, timerState, parsed);
        if (timerState.status === 'running' && timerState.endTimestamp) {
          const diffSecs = Math.ceil((timerState.endTimestamp - Date.now()) / 1000);
          timerState.remaining = Math.max(0, diffSecs);
          if (timerState.remaining <= 0) {
            timerState.status = 'stopped';
          }
        }
      }
    }
  } catch (e) {}

  // ---------------------------------------------------------------------------
  // 03. ADMIN TIMER UI ELEMENTS & ACTIONS (3M PITCH + 2M Q&A)
  // ---------------------------------------------------------------------------
  const clockEl = document.getElementById('admin-clock');
  const phaseEl = document.getElementById('admin-phase');
  const startBtn = document.getElementById('admin-start-btn');
  const pauseBtn = document.getElementById('admin-pause-btn');
  const stopBtn = document.getElementById('admin-stop-btn');
  const resetBtn = document.getElementById('admin-reset-btn');
  const presetBtns = document.querySelectorAll('.preset-btn[data-mins]');
  const customMinsInput = document.getElementById('custom-mins');
  const customSecsInput = document.getElementById('custom-secs');
  const applyCustomBtn = document.getElementById('btn-apply-custom');

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  let lastAlertMilestone = null;

  function updateAdminUI() {
    let currentRemaining = timerState.remaining;

    if (timerState.status === 'running' && timerState.endTimestamp) {
      const diffSecs = Math.ceil((timerState.endTimestamp - Date.now()) / 1000);
      currentRemaining = Math.max(0, diffSecs);

      // Transition Alert at 120s (2:00 remaining -> switch to Q&A) and 0s
      if (currentRemaining === 120 && lastAlertMilestone !== 120) {
        playAlert(880, 0.25);
        lastAlertMilestone = 120;
      } else if (currentRemaining === 0 && lastAlertMilestone !== 0) {
        playAlert(580, 0.4);
        lastAlertMilestone = 0;
        timerState.status = 'stopped';
        timerState.remaining = 0;
        broadcastState();
      }
    }

    if (clockEl) {
      clockEl.textContent = formatTime(currentRemaining);
      clockEl.className = 'big-clock';
      if (timerState.status === 'running') {
        clockEl.classList.add('clock-running');
      } else if (timerState.status === 'paused') {
        clockEl.classList.add('clock-paused');
      }
    }

    if (phaseEl) {
      if (timerState.status === 'idle') {
        phaseEl.textContent = 'STATUS: STANDBY (AWAITING KICKOFF)';
        phaseEl.style.color = 'var(--text-muted)';
      } else if (timerState.status === 'paused') {
        phaseEl.textContent = 'STATUS: PAUSED // JURY INTERVENTION';
        phaseEl.style.color = 'var(--amber)';
      } else if (timerState.status === 'stopped') {
        phaseEl.textContent = 'STATUS: PITCH CONCLUDED / STOPPED';
        phaseEl.style.color = 'var(--red)';
      } else if (timerState.status === 'running') {
        if (currentRemaining > 120) {
          phaseEl.textContent = 'PHASE 1: PARTICIPANT PRESENTATION & DEMO (3 MIN)';
          phaseEl.style.color = '#ffffff';
        } else if (currentRemaining > 0) {
          phaseEl.textContent = 'PHASE 2: JURY Q&A & TECHNICAL DEFENSE (2 MIN)';
          phaseEl.style.color = 'var(--red)';
        } else {
          phaseEl.textContent = 'TIME EXPIRED // 5-MIN WINDOW ENDED';
          phaseEl.style.color = 'var(--red)';
        }
      }
    }

    if (startBtn) {
      if (timerState.status === 'running') {
        startBtn.style.opacity = '0.5';
        startBtn.style.pointerEvents = 'none';
      } else {
        startBtn.style.opacity = '1';
        startBtn.style.pointerEvents = 'auto';
        if (timerState.status === 'paused') {
          startBtn.innerHTML = '<span>▶</span> <span>RESUME TIMER</span>';
        } else {
          startBtn.innerHTML = '<span>▶</span> <span>START TIMER</span>';
        }
      }
    }

    if (pauseBtn) {
      pauseBtn.style.opacity = (timerState.status === 'running') ? '1' : '0.5';
      pauseBtn.style.pointerEvents = (timerState.status === 'running') ? 'auto' : 'none';
    }
  }

  setInterval(() => {
    if (timerState.status === 'running') {
      updateAdminUI();
    }
  }, 250);

  // START
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      initAudio();
      const now = Date.now();

      if (timerState.status === 'paused') {
        timerState.status = 'running';
        timerState.startTimestamp = now;
        timerState.endTimestamp = now + (timerState.remaining * 1000);
      } else {
        if (timerState.remaining <= 0) {
          timerState.remaining = timerState.duration;
        }
        timerState.status = 'running';
        timerState.startTimestamp = now;
        timerState.endTimestamp = now + (timerState.remaining * 1000);
      }

      broadcastState();
      updateAdminUI();
      playAlert(1100, 0.1);
    });
  }

  // PAUSE
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (timerState.status === 'running') {
        const now = Date.now();
        const diffSecs = Math.ceil((timerState.endTimestamp - now) / 1000);
        timerState.remaining = Math.max(0, diffSecs);
        timerState.status = 'paused';
        broadcastState();
        updateAdminUI();
        playAlert(700, 0.1);
      }
    });
  }

  // STOP
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      timerState.status = 'stopped';
      timerState.remaining = 0;
      broadcastState();
      updateAdminUI();
      playAlert(500, 0.25);
    });
  }

  // RESET
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      timerState.status = 'idle';
      timerState.remaining = timerState.duration;
      timerState.startTimestamp = null;
      timerState.endTimestamp = null;
      lastAlertMilestone = null;
      broadcastState();
      updateAdminUI();
      playAlert(900, 0.08);
    });
  }

  // Presets (5m, 3m, 2m, 1m)
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const mins = parseInt(btn.getAttribute('data-mins'), 10);
      const totalSecs = mins * 60;
      timerState.duration = totalSecs;
      timerState.remaining = totalSecs;
      timerState.status = 'idle';
      timerState.startTimestamp = null;
      timerState.endTimestamp = null;
      lastAlertMilestone = null;

      if (customMinsInput) customMinsInput.value = mins;
      if (customSecsInput) customSecsInput.value = 0;

      broadcastState();
      updateAdminUI();
    });
  });

  // Custom Duration
  if (applyCustomBtn && customMinsInput && customSecsInput) {
    applyCustomBtn.addEventListener('click', () => {
      const mins = Math.max(0, parseInt(customMinsInput.value || 0, 10));
      const secs = Math.max(0, Math.min(59, parseInt(customSecsInput.value || 0, 10)));
      const totalSecs = (mins * 60) + secs;

      if (totalSecs > 0) {
        presetBtns.forEach(b => b.classList.remove('active'));
        timerState.duration = totalSecs;
        timerState.remaining = totalSecs;
        timerState.status = 'idle';
        timerState.startTimestamp = null;
        timerState.endTimestamp = null;
        lastAlertMilestone = null;

        broadcastState();
        updateAdminUI();
        playAlert(1000, 0.08);
      }
    });
  }

  updateAdminUI();

  // ---------------------------------------------------------------------------
  // 04. JURY SCORING TABULATION ENGINE (100-POINT FRAMEWORK)
  // ---------------------------------------------------------------------------
  const scoreFields = document.querySelectorAll('.score-field');
  const totalScoreVal = document.getElementById('total-score-val');
  const saveScoreBtn = document.getElementById('save-score-btn');
  const clearScoreBtn = document.getElementById('clear-score-btn');
  const evalTeamName = document.getElementById('eval-team-name');
  const evalDomainSelect = document.getElementById('eval-domain-select');
  const scoresTbody = document.getElementById('scores-tbody');
  const exportCsvBtn = document.getElementById('export-csv-btn');

  let savedScores = [];
  try {
    const raw = localStorage.getItem(SCORES_STORAGE_KEY);
    if (raw) savedScores = JSON.parse(raw);
  } catch (e) {}

  function calculateTotal() {
    let total = 0;
    scoreFields.forEach(field => {
      let val = parseFloat(field.value) || 0;
      const max = parseFloat(field.getAttribute('data-max')) || 100;
      if (val > max) {
        val = max;
        field.value = max;
      }
      if (val < 0) {
        val = 0;
        field.value = 0;
      }
      total += val;
    });

    if (totalScoreVal) {
      totalScoreVal.textContent = total.toFixed(1);
    }
    return total;
  }

  scoreFields.forEach(field => {
    field.addEventListener('input', calculateTotal);
  });

  function renderScoresTable() {
    if (!scoresTbody) return;

    if (savedScores.length === 0) {
      scoresTbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 20px;">
            No team scores recorded yet. Evaluate a team above and click "Save Team Evaluation".
          </td>
        </tr>
      `;
      return;
    }

    // Sort descending by total score
    savedScores.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

    scoresTbody.innerHTML = savedScores.map((item, index) => `
      <tr>
        <td style="font-family: 'JetBrains Mono'; color: var(--text-muted); font-weight: 700;">#${index + 1}</td>
        <td class="td-bold">${item.team}</td>
        <td><span style="font-family: 'JetBrains Mono'; font-size: 11px; background: var(--card-subtle); padding: 2px 6px; border-radius: 2px;">Domain ${item.domain}</span></td>
        <td>${item.c1}</td>
        <td>${item.c2}</td>
        <td>${item.c3}</td>
        <td style="font-weight: 700; color: var(--red);">${item.c4}</td>
        <td>${item.c5}</td>
        <td>${item.c6}</td>
        <td class="td-total">${item.total}</td>
      </tr>
    `).join('');
  }

  if (saveScoreBtn) {
    saveScoreBtn.addEventListener('click', () => {
      const teamName = (evalTeamName && evalTeamName.value.trim()) || `Team #${savedScores.length + 1}`;
      const domainVal = (evalDomainSelect && evalDomainSelect.value) || '01';
      const c1 = parseFloat(scoreFields[0].value) || 0;
      const c2 = parseFloat(scoreFields[1].value) || 0;
      const c3 = parseFloat(scoreFields[2].value) || 0;
      const c4 = parseFloat(scoreFields[3].value) || 0;
      const c5 = parseFloat(scoreFields[4].value) || 0;
      const c6 = parseFloat(scoreFields[5].value) || 0;
      const total = calculateTotal().toFixed(1);

      savedScores.push({
        team: teamName,
        domain: domainVal,
        c1, c2, c3, c4, c5, c6, total,
        timestamp: new Date().toISOString()
      });

      try {
        localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(savedScores));
      } catch (e) {}

      renderScoresTable();
      playAlert(1200, 0.12);

      // If leaderboard is currently unlocked, push updated scores automatically
      if (leaderboardState.isUnlocked) {
        publishLeaderboard(true);
      }

      if (evalTeamName) evalTeamName.value = '';
      scoreFields.forEach(f => f.value = 0);
      calculateTotal();
    });
  }

  if (clearScoreBtn) {
    clearScoreBtn.addEventListener('click', () => {
      if (evalTeamName) evalTeamName.value = '';
      scoreFields.forEach(f => f.value = 0);
      calculateTotal();
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (savedScores.length === 0) {
        alert('No score data to export.');
        return;
      }

      let csv = 'Rank,Team Name,Domain,Problem & Relevance (20),Innovation (20),Technical Implementation (20),Functionality & Prototype (25),Practicality & Impact (10),Presentation & Pitch (5),Total Score (100),Timestamp\n';
      savedScores.forEach((row, i) => {
        csv += `"${i+1}","${row.team}","${row.domain}",${row.c1},${row.c2},${row.c3},${row.c4},${row.c5},${row.c6},${row.total},"${row.timestamp}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `ASTRA_11_BUILD_A_BOT_SCORES_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  renderScoresTable();

  // ---------------------------------------------------------------------------
  // 05. LEADERBOARD EMBARGO & PUSH BROADCAST CONTROLLER
  // ---------------------------------------------------------------------------
  const adminLbStatus = document.getElementById('admin-lb-status');
  const adminLbPushBtn = document.getElementById('admin-lb-push-btn');
  const adminLbLockBtn = document.getElementById('admin-lb-lock-btn');

  let leaderboardState = {
    isUnlocked: false,
    teams: [],
    publishedAt: null
  };

  try {
    const rawLb = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (rawLb) leaderboardState = JSON.parse(rawLb);
  } catch (e) {}

  function updateLeaderboardUI() {
    if (!adminLbStatus) return;
    if (leaderboardState.isUnlocked) {
      adminLbStatus.innerHTML = 'CURRENT STATUS: <span class="status-unlocked">🔓 BROADCASTED LIVE TO PARTICIPANTS</span>';
      if (adminLbPushBtn) {
        adminLbPushBtn.innerHTML = '<span>🔄</span> <span>PUSH UPDATED STANDINGS</span>';
      }
    } else {
      adminLbStatus.innerHTML = 'CURRENT STATUS: <span class="status-locked">🔒 LOCKED (EMBARGO ACTIVE)</span>';
      if (adminLbPushBtn) {
        adminLbPushBtn.innerHTML = '<span>🔓</span> <span>PUSH &amp; REVEAL LEADERBOARD</span>';
      }
    }
  }

  function publishLeaderboard(unlock) {
    leaderboardState.isUnlocked = unlock;
    leaderboardState.publishedAt = unlock ? new Date().toISOString() : null;

    if (unlock) {
      // Sort teams descending by score
      savedScores.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
      leaderboardState.teams = savedScores;
    }

    try {
      localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboardState));
    } catch (e) {}

    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'LEADERBOARD_UPDATE', state: leaderboardState });
    }

    try {
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaderboardState)
      }).catch(() => {});
    } catch (e) {}

    updateLeaderboardUI();
  }

  if (adminLbPushBtn) {
    adminLbPushBtn.addEventListener('click', () => {
      publishLeaderboard(true);
      playAlert(1300, 0.2);
    });
  }

  if (adminLbLockBtn) {
    adminLbLockBtn.addEventListener('click', () => {
      publishLeaderboard(false);
      playAlert(600, 0.2);
    });
  }

  updateLeaderboardUI();

})();
