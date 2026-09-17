/**
 * ASTRA 11.0: BUILD-A-BOT — OFFICIAL PARTICIPANT PORTAL
 * Interactive Controller: Theme switcher, Audio FX, Synchronized Pitch Timer (3m/2m split),
 * Domain Accordion Dropdowns, Quick Jump Bar, Move-to-Top, and Leaderboard Embargo / Live Reveal.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 01. AUDIO FX SYNTHESIZER (Web Audio API)
  // ---------------------------------------------------------------------------
  let audioEnabled = true;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
  }

  function playSound(type) {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'hover') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.025);
      } else if (type === 'alert') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      }
    } catch (e) {
      // Audio not supported or blocked by browser policy
    }
  }

  // Audio Toggle Button
  const audioBtn = document.getElementById('audio-toggle');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      const label = audioBtn.querySelector('.audio-label');
      const icon = audioBtn.querySelector('.audio-icon');
      if (audioEnabled) {
        if (label) label.textContent = 'FX: ON';
        if (icon) icon.textContent = '🔊';
        playSound('click');
      } else {
        if (label) label.textContent = 'FX: OFF';
        if (icon) icon.textContent = '🔇';
      }
    });
  }

  // Attach hover & click sound to interactive elements
  function attachSounds() {
    document.querySelectorAll('.btn, .nav-item, .domain-card, .rule-accordion-header, .theme-btn, .jump-pill, .jump-action-btn, .move-to-top-btn').forEach(el => {
      el.addEventListener('mouseenter', () => playSound('hover'));
      el.addEventListener('click', () => playSound('click'));
    });
  }
  attachSounds();

  // ---------------------------------------------------------------------------
  // 02. LIGHT / DARK THEME ENGINE
  // ---------------------------------------------------------------------------
  const themeToggleBtn = document.getElementById('theme-toggle');
  const drawerThemeToggleBtn = document.getElementById('drawer-theme-toggle');

  function setTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
      localStorage.setItem('astra_theme', 'light');
      updateThemeButtons('light');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      localStorage.setItem('astra_theme', 'dark');
      updateThemeButtons('dark');
    }
  }

  function updateThemeButtons(theme) {
    if (themeToggleBtn) {
      const icon = themeToggleBtn.querySelector('.theme-icon');
      const label = themeToggleBtn.querySelector('.theme-label');
      if (theme === 'light') {
        if (icon) icon.textContent = '🌙';
        if (label) label.textContent = 'DARK';
      } else {
        if (icon) icon.textContent = '☀️';
        if (label) label.textContent = 'LIGHT';
      }
    }
    if (drawerThemeToggleBtn) {
      if (theme === 'light') {
        drawerThemeToggleBtn.innerHTML = '<span class="theme-icon">🌙</span> SWITCH TO DARK MODE';
      } else {
        drawerThemeToggleBtn.innerHTML = '<span class="theme-icon">☀️</span> SWITCH TO LIGHT MODE';
      }
    }
  }

  const savedTheme = localStorage.getItem('astra_theme') || 'dark';
  setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.body.classList.contains('theme-light') ? 'light' : 'dark';
      setTheme(current === 'light' ? 'dark' : 'light');
      playSound('click');
    });
  }

  if (drawerThemeToggleBtn) {
    drawerThemeToggleBtn.addEventListener('click', () => {
      const current = document.body.classList.contains('theme-light') ? 'light' : 'dark';
      setTheme(current === 'light' ? 'dark' : 'light');
      playSound('click');
    });
  }

  // ---------------------------------------------------------------------------
  // 03. SPRINT RULES & DIRECTIVES EXPANDABLE ACCORDIONS
  // ---------------------------------------------------------------------------
  const ruleAccordionCards = document.querySelectorAll('.rule-accordion-card');

  ruleAccordionCards.forEach(card => {
    const headerBtn = card.querySelector('.rule-accordion-header');
    if (!headerBtn) return;

    headerBtn.addEventListener('click', () => {
      const wasActive = card.classList.contains('active');

      // Collapse other open accordions for clean focus
      ruleAccordionCards.forEach(c => {
        if (c !== card) {
          c.classList.remove('active');
          const btn = c.querySelector('.rule-accordion-header');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });

      if (!wasActive) {
        card.classList.add('active');
        headerBtn.setAttribute('aria-expanded', 'true');
        playSound('click');
      } else {
        card.classList.remove('active');
        headerBtn.setAttribute('aria-expanded', 'false');
        playSound('click');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 04. SYNCHRONIZED PITCH TIMER (3M PRESENTATION + 2M JUDGE Q&A)
  // ---------------------------------------------------------------------------
  const STORAGE_KEY = 'astra_timer_state_v1';
  const CHANNEL_NAME = 'astra_timer_sync_channel';

  const topTimerBar = document.getElementById('top-sync-timer');
  const topClock = document.getElementById('top-sync-clock');
  const topPhase = document.getElementById('top-sync-phase');
  const topStatusText = document.getElementById('top-timer-status-text');
  const topProgress = document.getElementById('top-sync-progress');
  const sectionClock = document.getElementById('demo-timer');
  const sectionPhase = document.getElementById('timer-phase-lbl');

  let localTimerState = {
    status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
    duration: 300,
    remaining: 300,
    startTimestamp: null,
    endTimestamp: null,
    bonusSeconds: 0,
    lastUpdated: 0
  };

  // Immediate synchronous restoration from localStorage so refresh NEVER resets timer
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.duration === 'number') {
        localTimerState = Object.assign({}, localTimerState, parsed);
        if (localTimerState.status === 'running' && localTimerState.endTimestamp) {
          const now = Date.now();
          const diff = Math.ceil((localTimerState.endTimestamp - now) / 1000);
          localTimerState.remaining = Math.max(0, diff);
          if (localTimerState.remaining === 0) {
            localTimerState.status = 'stopped';
          }
        }
      }
    }
  } catch (e) {}

  let broadcastChannel = null;
  if ('BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'TIMER_UPDATE') {
          applyTimerState(event.data.state);
        } else if (event.data && event.data.type === 'LEADERBOARD_UPDATE') {
          applyLeaderboardState(event.data.state);
        } else if (event.data && event.data.type === 'DOMAINS_UPDATE') {
          applyDomainsVisibility(event.data.state?.isHidden);
        } else if (event.data && event.data.type === 'INAUGURATION_UPDATE') {
          applyInaugurationState(event.data.state);
        } else if (event.data && event.data.type === 'PDF_UPDATE') {
          applyPdfVisibility(event.data.state?.isHidden, event.data.state?.updatedAt);
        }
      };
    } catch (e) {}
  }

  // Cross-tab storage listener
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        applyTimerState(JSON.parse(e.newValue));
      } catch (err) {}
    } else if (e.key === 'astra_leaderboard_state' && e.newValue) {
      try {
        applyLeaderboardState(JSON.parse(e.newValue));
      } catch (err) {}
    } else if (e.key === 'astra_domains_hidden' && e.newValue) {
      try {
        applyDomainsVisibility(JSON.parse(e.newValue));
      } catch (err) {}
    } else if (e.key === 'astra_inauguration_state' && e.newValue) {
      try {
        applyInaugurationState(JSON.parse(e.newValue));
      } catch (err) {}
    } else if (e.key === 'astra_pdf_hidden' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        const h = typeof parsed === 'boolean' ? parsed : parsed.isHidden;
        applyPdfVisibility(h, parsed.updatedAt || 0);
      } catch (err) {}
    }
  });

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

  let lastAlertPlayedAt = null;

  function renderTimerUI() {
    let currentRemaining = localTimerState.remaining;

    if (localTimerState.status === 'running' && localTimerState.endTimestamp) {
      const now = Date.now();
      const diffMs = localTimerState.endTimestamp - now;
      currentRemaining = Math.max(0, Math.ceil(diffMs / 1000));
      localTimerState.remaining = currentRemaining;
      if (currentRemaining === 0) {
        localTimerState.status = 'stopped';
        localTimerState.remaining = 0;
        if (!lastAlertPlayedAt) {
          lastAlertPlayedAt = Date.now();
          playSound('alert');
        }
      }
    }

    const timeString = formatTime(currentRemaining);

    if (topClock) topClock.textContent = timeString;
    if (sectionClock) sectionClock.textContent = timeString;

    const duration = localTimerState.duration || 300;
    const progressPct = Math.max(0, Math.min(100, (currentRemaining / duration) * 100));
    if (topProgress) {
      topProgress.style.width = `${progressPct}%`;
    }

    // ClassList state toggling (Preserve corner-sync-timer and docked/floating classes)
    if (topTimerBar) {
      topTimerBar.classList.remove('timer-standby', 'timer-running', 'timer-paused', 'timer-stopped');
      if (localTimerState.status === 'running') {
        topTimerBar.classList.add('timer-running');
      } else if (localTimerState.status === 'paused') {
        topTimerBar.classList.add('timer-paused');
      } else if (localTimerState.status === 'stopped') {
        topTimerBar.classList.add('timer-stopped', 'timer-running');
      } else {
        topTimerBar.classList.add('timer-standby');
      }
    }

    // Determine Phase & Status Text
    let phaseText = '';
    const bonusSecs = localTimerState.bonusSeconds || 0;

    if (localTimerState.status === 'idle') {
      phaseText = 'AWAITING ADMIN KICKOFF';
      if (topStatusText) topStatusText.textContent = 'EVENT TIMER // STANDBY';
    } else if (localTimerState.status === 'running') {
      if (bonusSecs > 0 && currentRemaining <= bonusSecs) {
        phaseText = 'EXTRA TIME COUNTDOWN // BONUS WINDOW';
        if (topStatusText) topStatusText.textContent = 'EXTRA TIME // RUNNING';
      } else if (duration === 300 && bonusSecs === 0) {
        if (currentRemaining > 120) {
          phaseText = 'PHASE 1: PARTICIPANT PITCH (3M)';
          if (topStatusText) topStatusText.textContent = 'LIVE // PARTICIPANT PRESENTATION';
        } else if (currentRemaining > 0) {
          phaseText = 'PHASE 2: JUDGE Q&A (2M)';
          if (topStatusText) topStatusText.textContent = 'TRANSITION // JURY INTERROGATION';
        }
      } else {
        phaseText = 'SPRINT IN PROGRESS';
        if (topStatusText) topStatusText.textContent = 'EVENT TIMER // ACTIVE COUNTDOWN';
      }
    } else if (localTimerState.status === 'paused') {
      phaseText = 'TIMER PAUSED';
      if (topStatusText) topStatusText.textContent = 'EVENT TIMER // PAUSED';
    } else if (localTimerState.status === 'stopped') {
      phaseText = 'TIME EXPIRED // PITCH CUTOFF';
      if (topStatusText) topStatusText.textContent = 'TIME UP // PROTOCOL CUTOFF';
    }

    if (topPhase) topPhase.textContent = phaseText;
    if (sectionPhase) sectionPhase.textContent = phaseText;

    // Football-Style Stoppage / Extra Time Display
    const topBonusBadge = document.getElementById('top-bonus-badge');
    const topBonusTime = document.getElementById('top-bonus-time');
    if (topBonusBadge) {
      if (bonusSecs > 0) {
        topBonusBadge.style.display = 'inline-flex';
        if (topBonusTime) {
          topBonusTime.textContent = formatTime(bonusSecs);
        }
      } else {
        topBonusBadge.style.display = 'none';
      }
    }
  }

  function applyTimerState(newState) {
    if (!newState) return;

    const srvTime = Number(newState.lastUpdated) || 0;
    const localTime = Number(localTimerState.lastUpdated) || 0;

    // RULE 1: Never accept a stale timer state from a cold or out-of-sync serverless container.
    // If incoming state timestamp is older than our local active timestamp, drop it completely.
    if (localTime > 0 && srvTime < localTime) {
      return;
    }

    // RULE 2: If local clock is actively RUNNING with time remaining in the future,
    // never let an unstarted/idle state (e.g. 5:00 default duration: 300) reset it
    // unless the server state has a strictly newer timestamp from an explicit admin stop/reset.
    if (localTimerState.status === 'running' && localTimerState.endTimestamp && Date.now() < localTimerState.endTimestamp) {
      if (newState.status !== 'running' && srvTime <= localTime) {
        return;
      }
      if (newState.status === 'idle' && (newState.duration === 300 || srvTime <= localTime)) {
        return;
      }
    }

    // RULE 3: Anti-jitter lock: If both states are running with identical timestamp and endTimestamp,
    // let local clock count down smoothly without jumping or resetting.
    if (
      localTimerState.status === 'running' &&
      newState.status === 'running' &&
      srvTime === localTime &&
      localTimerState.endTimestamp === newState.endTimestamp &&
      (localTimerState.bonusSeconds || 0) === (newState.bonusSeconds || 0)
    ) {
      return;
    }

    if (newState.status !== 'stopped') {
      lastAlertPlayedAt = null;
    }

    localTimerState = Object.assign({}, localTimerState, newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localTimerState));
    } catch (e) {}
    renderTimerUI();
  }

  // Smooth Tick & LocalStorage Sync Loop
  setInterval(() => {
    if (localTimerState.status === 'running') {
      renderTimerUI();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localTimerState));
      } catch (e) {}
    }
  }, 250);

  // Initial UI Render
  renderTimerUI();

  // Dynamic Scroll Handler: Header Top Dock vs Scrolled Floating Corner
  function handleTimerScroll() {
    if (!topTimerBar) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const SCROLL_THRESHOLD = 25;

    if (scrollY > SCROLL_THRESHOLD) {
      if (!topTimerBar.classList.contains('timer-floating')) {
        topTimerBar.classList.remove('timer-docked');
        topTimerBar.classList.add('timer-floating');
      }
    } else {
      if (!topTimerBar.classList.contains('timer-docked')) {
        topTimerBar.classList.remove('timer-floating');
        topTimerBar.classList.add('timer-docked');
      }
    }
  }
  window.addEventListener('scroll', handleTimerScroll, { passive: true });
  handleTimerScroll();

  // ---------------------------------------------------------------------------
  // 05. LEADERBOARD & 3-STEP PODIUM CONTROLLER
  // ---------------------------------------------------------------------------
  const leaderboardTrackerStatus = document.getElementById('leaderboard-tracker-status');
  const leaderboardTbody = document.getElementById('leaderboard-live-tbody');
  const leaderboardReleasedTime = document.getElementById('leaderboard-released-time');
  const leaderboardJumpPill = document.querySelector('.pill-leaderboard-jump');
  const leaderboardNavPill = document.querySelector('.pill-leaderboard-nav');

  const podiumTeam1 = document.getElementById('podium-team-1');
  const podiumDomain1 = document.getElementById('podium-domain-1');
  const podiumScore1 = document.getElementById('podium-score-1');
  const podiumAward1 = document.getElementById('podium-award-1');

  const podiumTeam2 = document.getElementById('podium-team-2');
  const podiumDomain2 = document.getElementById('podium-domain-2');
  const podiumScore2 = document.getElementById('podium-score-2');
  const podiumAward2 = document.getElementById('podium-award-2');

  const podiumTeam3 = document.getElementById('podium-team-3');
  const podiumDomain3 = document.getElementById('podium-domain-3');
  const podiumScore3 = document.getElementById('podium-score-3');
  const podiumAward3 = document.getElementById('podium-award-3');

  function updatePodium(teams) {
    if (!Array.isArray(teams) || teams.length === 0) {
      return;
    }

    // 1st Place (Step 1 - Center Gold)
    const t1 = teams[0];
    if (t1) {
      if (podiumTeam1) podiumTeam1.textContent = t1.teamName || t1.team || 'Team #1';
      if (podiumDomain1) podiumDomain1.textContent = t1.domain || 'Domain Prototype';
      const score1 = t1.avgTotal != null ? Number(t1.avgTotal).toFixed(2) : (t1.total != null ? Number(t1.total).toFixed(1) : '—');
      if (podiumScore1) podiumScore1.innerHTML = `<strong>${score1}</strong> / 100 PTS`;
      if (podiumAward1) podiumAward1.textContent = t1.award || 'GRAND CHAMPION';
    }

    // 2nd Place (Step 2 - Left Silver)
    const t2 = teams[1];
    if (t2) {
      if (podiumTeam2) podiumTeam2.textContent = t2.teamName || t2.team || 'Team #2';
      if (podiumDomain2) podiumDomain2.textContent = t2.domain || 'Domain Prototype';
      const score2 = t2.avgTotal != null ? Number(t2.avgTotal).toFixed(2) : (t2.total != null ? Number(t2.total).toFixed(1) : '—');
      if (podiumScore2) podiumScore2.innerHTML = `<strong>${score2}</strong> / 100 PTS`;
      if (podiumAward2) podiumAward2.textContent = t2.award || '1ST RUNNER UP';
    }

    // 3rd Place (Step 3 - Right Bronze)
    const t3 = teams[2];
    if (t3) {
      if (podiumTeam3) podiumTeam3.textContent = t3.teamName || t3.team || 'Team #3';
      if (podiumDomain3) podiumDomain3.textContent = t3.domain || 'Domain Prototype';
      const score3 = t3.avgTotal != null ? Number(t3.avgTotal).toFixed(2) : (t3.total != null ? Number(t3.total).toFixed(1) : '—');
      if (podiumScore3) podiumScore3.innerHTML = `<strong>${score3}</strong> / 100 PTS`;
      if (podiumAward3) podiumAward3.textContent = t3.award || '2ND RUNNER UP';
    }
  }

  let lastLeaderboardUpdatedAt = 0;

  function applyLeaderboardState(lbState) {
    if (!lbState) return;

    const time = lbState.updatedAt || lbState.publishedAt || 0;
    if (time && lastLeaderboardUpdatedAt && time < lastLeaderboardUpdatedAt) {
      return; // Discard stale state from older container
    }
    if (time) {
      lastLeaderboardUpdatedAt = time;
    }

    try {
      localStorage.setItem('astra_leaderboard_state', JSON.stringify(lbState));
    } catch (e) {}

    const isPublished = lbState.isUnlocked || lbState.state === 'PUBLISHED' || (Array.isArray(lbState.teams) && lbState.teams.length > 0);

    if (leaderboardTrackerStatus) {
      leaderboardTrackerStatus.textContent = isPublished ? 'STATUS: STANDINGS PUBLISHED ●' : 'STATUS: JURY CERTIFICATION IN PROGRESS ⏳';
    }

    if (leaderboardReleasedTime) {
      if (lbState.publishedAt) {
        const d = new Date(lbState.publishedAt);
        leaderboardReleasedTime.textContent = `OFFICIAL JURY SCORES CERTIFIED // PUBLISHED AT ${d.toLocaleTimeString()}`;
      } else {
        leaderboardReleasedTime.textContent = 'OFFICIAL JURY SCORES CERTIFIED // BROADCAST ACTIVE';
      }
    }

    if (Array.isArray(lbState.teams) && lbState.teams.length > 0) {
      updatePodium(lbState.teams);

      if (leaderboardTbody) {
        leaderboardTbody.innerHTML = lbState.teams.map((t, idx) => {
          const teamName = t.teamName || t.team || 'Team';
          const domain = t.domain || 'General';
          const c4Score = t.avgFunctionality != null ? Number(t.avgFunctionality).toFixed(1) : (t.c4 != null ? Number(t.c4).toFixed(1) : '—');
          const totalScore = t.avgTotal != null ? Number(t.avgTotal).toFixed(2) : (t.total != null ? Number(t.total).toFixed(1) : '—');
          const award = t.award || (idx === 0 ? '🏆 CHAMPION' : (idx === 1 ? '🥈 RUNNER UP' : (idx === 2 ? '🥉 2ND RUNNER UP' : 'FINALIST')));

          let rankBadge = `<span class="rank-pill">#${idx + 1}</span>`;
          if (idx === 0) {
            rankBadge = `<span class="rank-pill rank-gold">🥇 1ST</span>`;
          } else if (idx === 1) {
            rankBadge = `<span class="rank-pill rank-silver">🥈 2ND</span>`;
          } else if (idx === 2) {
            rankBadge = `<span class="rank-pill rank-bronze">🥉 3RD</span>`;
          }

          return `
            <tr>
              <td>${rankBadge}</td>
              <td style="font-weight: 700; color: #ffffff;">${teamName}</td>
              <td><span style="font-family: 'JetBrains Mono'; font-size: 11px; background: var(--bg-surface-elevated); padding: 2px 6px; border-radius: 2px;">${domain}</span></td>
              <td><span style="color: var(--red); font-weight: 700;">${c4Score}</span> / 25</td>
              <td class="score-highlight">${totalScore} / 100</td>
              <td><span class="badge ${idx === 0 ? 'badge-solid-red' : (idx <= 2 ? 'badge-red-glow' : 'badge-subtle')}">${award}</span></td>
            </tr>
          `;
        }).join('');
      }
    } else {
      if (leaderboardTbody) {
        leaderboardTbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
              Official scores certified by the jury panel. Standings will populate dynamically upon broadcast.
            </td>
          </tr>
        `;
      }
    }
  }

  // Read initial leaderboard state
  try {
    const rawLb = localStorage.getItem('astra_leaderboard_state');
    if (rawLb) {
      applyLeaderboardState(JSON.parse(rawLb));
    }
  } catch (e) {}

  // ---------------------------------------------------------------------------
  // 06. SERVER SYNC FOR BOTH TIMER & LEADERBOARD (SSE STREAM)
  // ---------------------------------------------------------------------------
  function initServerSync() {
    if (!window.EventSource) return;
    try {
      const sse = new EventSource('/api/timer/stream');
      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.timer) {
            applyTimerState(payload.timer);
          } else if (payload.status) {
            // legacy timer-only payload
            applyTimerState(payload);
          }
          if (payload.leaderboard) {
            applyLeaderboardState(payload.leaderboard);
          }
          if (payload.domains && typeof payload.domains.isHidden === 'boolean') {
            applyDomainsVisibility(payload.domains.isHidden, payload.domains.updatedAt || payload.domains.lastUpdated || 0);
          }
          if (payload.inauguration) {
            applyInaugurationState(payload.inauguration);
          }
          if (payload.pdf && typeof payload.pdf.isHidden === 'boolean') {
            applyPdfVisibility(payload.pdf.isHidden, payload.pdf.updatedAt || 0);
          }
        } catch (err) {}
      };
    } catch (e) {}
  }
  initServerSync();

  // Active REST polling fallback every 1500ms to ensure atomic sync across all platforms
  async function pollServerState() {
    try {
      let queryParams = '';
      if (localTimerState.status === 'running' && localTimerState.lastUpdated) {
        queryParams = `?t_up=${localTimerState.lastUpdated}&t_end=${localTimerState.endTimestamp || 0}&t_dur=${localTimerState.duration || 300}&t_st=${localTimerState.status}`;
      }
      const res = await fetch('/api/timer' + queryParams, {
        headers: {
          'Cache-Control': 'no-cache, no-store',
          'x-timer-updated': String(localTimerState.lastUpdated || 0),
          'x-timer-end': String(localTimerState.endTimestamp || 0),
          'x-timer-status': localTimerState.status || '',
          'x-timer-duration': String(localTimerState.duration || 300)
        }
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.timer) {
          applyTimerState(payload.timer);
        }
        if (payload.domains && typeof payload.domains.isHidden === 'boolean') {
          applyDomainsVisibility(payload.domains.isHidden, payload.domains.updatedAt || payload.domains.lastUpdated || 0);
        }
        if (payload.inauguration) {
          applyInaugurationState(payload.inauguration);
        }
        if (payload.pdf && typeof payload.pdf.isHidden === 'boolean') {
          applyPdfVisibility(payload.pdf.isHidden, payload.pdf.updatedAt || 0);
        }
        if (payload.leaderboard) {
          applyLeaderboardState(payload.leaderboard);
        }
      }
    } catch (e) {}

    try {
      const resLb = await fetch('/api/leaderboard');
      if (resLb.ok) {
        const lbData = await resLb.json();
        applyLeaderboardState(lbData);
      }
    } catch (e) {}
  }
  setInterval(pollServerState, 1500);

  // ---------------------------------------------------------------------------
  // 06C. DOMAINS VISIBILITY EMBARGO / SCRAMBLE CONTROL
  // ---------------------------------------------------------------------------
  let lastDomainsUpdatedAt = 0;

  async function loadDomainsVisibility() {
    try {
      const res = await fetch('/api/domains/visibility');
      if (res.ok) {
        const data = await res.json();
        applyDomainsVisibility(data.isHidden, data.updatedAt || data.lastUpdated || 0);
      }
    } catch (e) {}
  }

  function applyDomainsVisibility(isHidden, updatedAt = 0) {
    if (updatedAt && lastDomainsUpdatedAt && updatedAt < lastDomainsUpdatedAt) {
      return; // Ignore stale state from older container
    }
    if (updatedAt) {
      lastDomainsUpdatedAt = updatedAt;
    }
    const grid = document.getElementById('domains-grid');
    const banner = document.getElementById('domains-embargo-banner');
    if (grid) {
      if (isHidden) {
        grid.classList.add('domains-scrambled');
      } else {
        grid.classList.remove('domains-scrambled');
      }
    }
    if (banner) {
      banner.style.display = isHidden ? 'block' : 'none';
    }
  }

  loadDomainsVisibility();
  setInterval(loadDomainsVisibility, 3000);

  // ---------------------------------------------------------------------------
  // 06D. PARTICIPANT HANDBOOK & INAUGURATION STATE
  // ---------------------------------------------------------------------------
  const PDF_STORAGE_KEY = 'astra_pdf_hidden';
  let isPdfHidden = false; // Unlocked by default
  let lastPdfUpdatedAt = 0;
  let pdfManualOverride = false;

  const INAUGURATION_STORAGE_KEY = 'astra_inauguration_state';
  const inaugClockSection = document.getElementById('inauguration-clock-section');
  const inaugCountdownView = document.getElementById('inaug-countdown-view');
  const inaugCelebrationView = document.getElementById('inaug-celebration-view');
  const inaugDays = document.getElementById('inaug-days');
  const inaugHours = document.getElementById('inaug-hours');
  const inaugMins = document.getElementById('inaug-mins');
  const inaugSecs = document.getElementById('inaug-secs');
  const inaugStatusBadge = document.getElementById('inaug-status-badge');
  const inaugPulseDot = document.getElementById('inaug-pulse-dot');
  const inaugTargetText = document.getElementById('inaug-target-text');

  let localInauguration = {
    targetIso: '2026-09-17T10:30:00+05:30',
    targetTimestamp: 1789621200000,
    isVisible: true,
    isInaugurated: false,
    inauguratedAt: null,
    updatedAt: 0
  };

  let lastInaugUpdatedAt = 0;

  function applyInaugurationState(newState) {
    if (!newState) return;
    const time = newState.updatedAt || 0;
    if (time && lastInaugUpdatedAt && time < lastInaugUpdatedAt) {
      return;
    }
    if (time) lastInaugUpdatedAt = time;

    localInauguration = Object.assign({}, localInauguration, newState);
    try {
      localStorage.setItem(INAUGURATION_STORAGE_KEY, JSON.stringify(localInauguration));
    } catch (e) {}

    renderInaugurationUI();
  }

  function renderInaugurationUI() {
    if (!inaugClockSection) return;

    // Visibility toggle (Make it come and go as controlled by Baseline)
    if (localInauguration.isVisible === false) {
      inaugClockSection.classList.add('inaug-hidden');
      return;
    } else {
      inaugClockSection.classList.remove('inaug-hidden');
    }

    const now = Date.now();
    const target = localInauguration.targetTimestamp || 1789621200000;
    const isPast = now >= target;
    const inaugurated = localInauguration.isInaugurated || isPast;

    if (inaugurated) {
      if (inaugCountdownView) inaugCountdownView.style.display = 'none';
      if (inaugCelebrationView) inaugCelebrationView.style.display = 'block';
      if (inaugStatusBadge) {
        inaugStatusBadge.textContent = 'EVENT OFFICIALLY INAUGURATED';
        inaugStatusBadge.className = 'inaug-status-badge badge-inaugurated';
      }
      if (inaugPulseDot) {
        inaugPulseDot.className = 'inaug-pulse-dot pulse-green';
      }
      // Auto-reveal PDF download buttons upon kickoff
      if (typeof isPdfHidden !== 'undefined' && isPdfHidden && !pdfManualOverride) {
        applyPdfVisibility(false);
      }
    } else {
      if (inaugCountdownView) inaugCountdownView.style.display = 'block';
      if (inaugCelebrationView) inaugCelebrationView.style.display = 'none';
      if (inaugStatusBadge) {
        inaugStatusBadge.textContent = 'COUNTDOWN IN PROGRESS';
        inaugStatusBadge.className = 'inaug-status-badge';
      }
      if (inaugPulseDot) {
        inaugPulseDot.className = 'inaug-pulse-dot';
      }

      const diffSecs = Math.max(0, Math.floor((target - now) / 1000));
      const days = Math.floor(diffSecs / 86400);
      const hours = Math.floor((diffSecs % 86400) / 3600);
      const mins = Math.floor((diffSecs % 3600) / 60);
      const secs = diffSecs % 60;

      if (inaugDays) inaugDays.textContent = String(days).padStart(2, '0');
      if (inaugHours) inaugHours.textContent = String(hours).padStart(2, '0');
      if (inaugMins) inaugMins.textContent = String(mins).padStart(2, '0');
      if (inaugSecs) inaugSecs.textContent = String(secs).padStart(2, '0');
    }
  }

  // Live countdown tick every second
  setInterval(renderInaugurationUI, 1000);

  // Read saved state on startup
  try {
    const rawInaug = localStorage.getItem(INAUGURATION_STORAGE_KEY);
    if (rawInaug) {
      applyInaugurationState(JSON.parse(rawInaug));
    } else {
      renderInaugurationUI();
    }
  } catch (e) {
    renderInaugurationUI();
  }

  // Dedicated polling for inauguration state
  async function loadInaugurationState() {
    try {
      const res = await fetch('/api/inauguration');
      if (res.ok) {
        const data = await res.json();
        applyInaugurationState(data);
      }
    } catch (e) {}
  }
  loadInaugurationState();
  setInterval(loadInaugurationState, 3000);

  // ---------------------------------------------------------------------------
  // 06E. PARTICIPANT HANDBOOK (PARTICIPATE.PDF) VISIBILITY CONTROLLER
  // ---------------------------------------------------------------------------
  function applyPdfVisibility(hidden, updatedAt = 0) {
    if (updatedAt && lastPdfUpdatedAt && updatedAt < lastPdfUpdatedAt) {
      return;
    }
    if (updatedAt) {
      lastPdfUpdatedAt = updatedAt;
    }

    const now = Date.now();
    const target = localInauguration.targetTimestamp || 1789621200000;
    const isEventLaunched = localInauguration.isInaugurated || (now >= target);

    let effectiveHidden = typeof hidden === 'boolean' ? hidden : false;

    // Automatic Kickoff Pop-up:
    // When the event launches & global timer ends (17-Sep-2026 10:30 AM or inaugurated),
    // automatically pop up / reveal the participate.pdf download button!
    if (isEventLaunched && !pdfManualOverride) {
      effectiveHidden = false;
    }

    isPdfHidden = effectiveHidden;

    const downloadLinks = document.querySelectorAll('[data-pdf-download]');
    if (isPdfHidden) {
      document.body.classList.add('pdf-hidden');
      downloadLinks.forEach((el) => {
        el.setAttribute('href', 'javascript:void(0)');
        el.removeAttribute('download');
      });
    } else {
      document.body.classList.remove('pdf-hidden');
      downloadLinks.forEach((el) => {
        el.setAttribute('href', '/api/pdf/download');
        el.setAttribute('download', 'participate.pdf');
      });
    }
  }

  // Intercept any forced clicks on PDF buttons while embargo is active
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-pdf-download]');
    if (!trigger) return;
    if (isPdfHidden) {
      e.preventDefault();
      e.stopPropagation();
      alert('🔒 HANDBOOK EMBARGO ACTIVE // Unlocks automatically at official kickoff (17-Sep-2026 10:30 AM).');
      return false;
    }
  });

  async function loadPdfVisibility() {
    try {
      const res = await fetch('/api/pdf/visibility');
      if (res.ok) {
        const data = await res.json();
        const hidden = typeof data === 'boolean' ? data : (typeof data.isHidden === 'boolean' ? data.isHidden : false);
        applyPdfVisibility(hidden, data.updatedAt || 0);
      }
    } catch (e) {}
  }

  // Read saved PDF state on startup
  try {
    const rawPdf = localStorage.getItem(PDF_STORAGE_KEY);
    if (rawPdf) {
      const parsed = JSON.parse(rawPdf);
      const h = typeof parsed === 'boolean' ? parsed : (typeof parsed.isHidden === 'boolean' ? parsed.isHidden : false);
      applyPdfVisibility(h, parsed.updatedAt || 0);
    } else {
      applyPdfVisibility(false);
    }
  } catch (e) {
    applyPdfVisibility(false);
  }

  loadPdfVisibility();
  setInterval(loadPdfVisibility, 3000);

  // ---------------------------------------------------------------------------
  // 07. QUICK-JUMP TACTICAL ACTION BUTTONS
  // ---------------------------------------------------------------------------
  const jumpButtons = document.querySelectorAll('.jump-action-btn, .jump-pill');

  jumpButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-target') || (btn.getAttribute('href') ? btn.getAttribute('href').replace('#', '') : null);
      if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
          playSound('click');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 08. FLOATING MOVE TO TOP FEATURE
  // ---------------------------------------------------------------------------
  const moveToTopBtn = document.getElementById('move-to-top');

  window.addEventListener('scroll', () => {
    if (moveToTopBtn) {
      if (window.scrollY > 280) {
        moveToTopBtn.classList.add('visible');
      } else {
        moveToTopBtn.classList.remove('visible');
      }
    }
  }, { passive: true });

  if (moveToTopBtn) {
    moveToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      playSound('click');
    });
  }

  // ---------------------------------------------------------------------------
  // 09. SCROLL PROGRESS & INTERSECTION OBSERVER
  // ---------------------------------------------------------------------------
  const scrollProgress = document.getElementById('scroll-progress');

  window.addEventListener('scroll', () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0 && scrollProgress) {
      const progress = (window.scrollY / docHeight) * 100;
      scrollProgress.style.width = `${progress}%`;
    }
  });

  const assembleElements = document.querySelectorAll('[data-assemble]');
  if ('IntersectionObserver' in window) {
    const assembleObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('assembled');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.1
    });

    assembleElements.forEach(el => assembleObserver.observe(el));
  } else {
    assembleElements.forEach(el => el.classList.add('assembled'));
  }

  // ---------------------------------------------------------------------------
  // 10. TEXT DECRYPT ANIMATION
  // ---------------------------------------------------------------------------
  const decryptElements = document.querySelectorAll('[data-decrypt]');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_#@!/\\';

  function decryptText(el) {
    const originalText = el.getAttribute('data-decrypt') || el.textContent;
    let iteration = 0;
    const interval = setInterval(() => {
      el.textContent = originalText
        .split('')
        .map((char, index) => {
          if (index < iteration) return originalText[index];
          if (char === ' ') return ' ';
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');

      if (iteration >= originalText.length) {
        clearInterval(interval);
      }
      iteration += 1 / 2;
    }, 25);
  }

  decryptElements.forEach(el => {
    setTimeout(() => decryptText(el), 250);
  });

  // ---------------------------------------------------------------------------
  // 11. ANIMATED NUMBER COUNTERS
  // ---------------------------------------------------------------------------
  const counterElements = document.querySelectorAll('.counter');
  let countersAnimated = false;

  function runCounters() {
    if (countersAnimated) return;
    countersAnimated = true;

    counterElements.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'), 10);
      const duration = 1200;
      const frameDuration = 1000 / 60;
      const totalFrames = Math.round(duration / frameDuration);
      let frame = 0;

      const timer = setInterval(() => {
        frame++;
        const progress = frame / totalFrames;
        const current = Math.round(target * Math.min(progress, 1));
        counter.textContent = current;

        if (frame === totalFrames) {
          clearInterval(timer);
        }
      }, frameDuration);
    });
  }

  const heroStats = document.querySelector('.hero-stats-grid');
  if (heroStats && 'IntersectionObserver' in window) {
    const statsObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        runCounters();
      }
    }, { threshold: 0.3 });
    statsObserver.observe(heroStats);
  } else {
    runCounters();
  }

  // ---------------------------------------------------------------------------
  // 12. MOBILE MENU DRAWER TOGGLE & BACKDROP OVERLAY
  // ---------------------------------------------------------------------------
  const mobileToggle = document.getElementById('mobile-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerClose = document.getElementById('drawer-close');
  const drawerItems = document.querySelectorAll('.drawer-item');

  function openMobileDrawer() {
    if (mobileDrawer) mobileDrawer.classList.add('active');
    if (mobileToggle) mobileToggle.classList.add('active');
    if (drawerBackdrop) drawerBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    playSound('click');
  }

  function closeMobileDrawer() {
    if (mobileDrawer) mobileDrawer.classList.remove('active');
    if (mobileToggle) mobileToggle.classList.remove('active');
    if (drawerBackdrop) drawerBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mobileDrawer.classList.contains('active')) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
    });

    if (drawerClose) {
      drawerClose.addEventListener('click', closeMobileDrawer);
    }

    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', closeMobileDrawer);
    }

    drawerItems.forEach(item => {
      item.addEventListener('click', closeMobileDrawer);
    });
  }

  // ---------------------------------------------------------------------------
  // 13. 24-HOUR SELF-DESTRUCT NOTIFICATION OVERLAY CONTROLLER
  // ---------------------------------------------------------------------------
  const destructOverlay = document.getElementById('self-destruct-overlay');
  const destructProceedBtn = document.getElementById('destruct-proceed-btn');
  const destructCloseBtn = document.getElementById('destruct-close-btn');
  const destructBackdrop = document.getElementById('destruct-backdrop');
  const destructCountdownDigits = document.getElementById('destruct-countdown-digits');

  // Compute 24-hour target (persisted in localStorage or default to 24h from now)
  const DESTRUCT_TARGET_KEY = 'astra_destruct_target';
  let destructTarget = 0;
  try {
    const storedTarget = localStorage.getItem(DESTRUCT_TARGET_KEY);
    if (storedTarget) {
      destructTarget = parseInt(storedTarget, 10);
    }
  } catch (e) {}

  if (!destructTarget || isNaN(destructTarget) || destructTarget <= Date.now()) {
    destructTarget = Date.now() + 24 * 3600 * 1000;
    try {
      localStorage.setItem(DESTRUCT_TARGET_KEY, String(destructTarget));
    } catch (e) {}
  }

  function updateDestructClock() {
    if (!destructCountdownDigits) return;
    const now = Date.now();
    const diffSecs = Math.max(0, Math.floor((destructTarget - now) / 1000));
    const hrs = Math.floor(diffSecs / 3600);
    const mins = Math.floor((diffSecs % 3600) / 60);
    const secs = diffSecs % 60;
    destructCountdownDigits.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  updateDestructClock();
  setInterval(updateDestructClock, 1000);

  function openSelfDestructOverlay() {
    if (!destructOverlay) return;
    destructOverlay.classList.add('active');
    document.body.classList.add('destruct-open');
    playSound('alert');
  }

  function closeSelfDestructOverlay() {
    if (!destructOverlay) return;
    destructOverlay.classList.remove('active');
    document.body.classList.remove('destruct-open');
    playSound('click');
  }

  if (destructProceedBtn) {
    destructProceedBtn.addEventListener('click', closeSelfDestructOverlay);
  }
  if (destructCloseBtn) {
    destructCloseBtn.addEventListener('click', closeSelfDestructOverlay);
  }
  if (destructBackdrop) {
    destructBackdrop.addEventListener('click', closeSelfDestructOverlay);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && destructOverlay && destructOverlay.classList.contains('active')) {
      closeSelfDestructOverlay();
    }
  });

  // Automatically pop up whenever someone opens the site
  if (destructOverlay) {
    setTimeout(openSelfDestructOverlay, 300);
  }

})();
