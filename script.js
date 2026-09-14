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
    document.querySelectorAll('.btn, .nav-item, .domain-card, .domain-plus-btn, .theme-btn, .jump-pill, .move-to-top-btn').forEach(el => {
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
  // 03. 15 DOMAINS ACCORDION DROPDOWNS (PLUS TOGGLE)
  // ---------------------------------------------------------------------------
  const domainCards = document.querySelectorAll('.domain-card');

  domainCards.forEach(card => {
    if (card.classList.contains('domain-card-alert')) return;

    const plusBtn = card.querySelector('.domain-plus-btn');
    const header = card.querySelector('.domain-card-header');

    function toggleCard(e) {
      if (e.target.tagName.toLowerCase() === 'a') return;

      const wasActive = card.classList.contains('active');

      // Collapse other open cards for clean reading
      domainCards.forEach(c => {
        if (c !== card && !c.classList.contains('domain-card-alert')) {
          c.classList.remove('active');
          const btn = c.querySelector('.domain-plus-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });

      if (!wasActive) {
        card.classList.add('active');
        if (plusBtn) plusBtn.setAttribute('aria-expanded', 'true');
        playSound('click');
      } else {
        card.classList.remove('active');
        if (plusBtn) plusBtn.setAttribute('aria-expanded', 'false');
        playSound('click');
      }
    }

    if (plusBtn) {
      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCard(e);
      });
    }

    if (header) {
      header.addEventListener('click', toggleCard);
    }
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
    lastUpdated: Date.now()
  };

  let broadcastChannel = null;
  if ('BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'TIMER_UPDATE') {
          applyTimerState(event.data.state);
        } else if (event.data && event.data.type === 'LEADERBOARD_UPDATE') {
          applyLeaderboardState(event.data.state);
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
    }

    const timeString = formatTime(currentRemaining);

    if (topClock) topClock.textContent = timeString;
    if (sectionClock) sectionClock.textContent = timeString;

    const duration = localTimerState.duration || 300;
    const progressPct = Math.max(0, Math.min(100, (currentRemaining / duration) * 100));
    if (topProgress) {
      topProgress.style.width = `${progressPct}%`;
    }

    // Determine Phase
    let phaseText = '';
    if (localTimerState.status === 'idle') {
      phaseText = 'AWAITING ADMIN KICKOFF';
      if (topTimerBar) topTimerBar.className = 'top-sync-timer timer-standby';
      if (topStatusText) topStatusText.textContent = 'EVENT TIMER // STANDBY';
    } else if (localTimerState.status === 'running') {
      if (topTimerBar) topTimerBar.className = 'top-sync-timer timer-running';

      if (duration === 300) {
        // Standard 5-Minute Pitch Breakdown
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
      if (topTimerBar) topTimerBar.className = 'top-sync-timer timer-paused';
      if (topStatusText) topStatusText.textContent = 'EVENT TIMER // PAUSED';
    } else if (localTimerState.status === 'stopped') {
      phaseText = 'TIME EXPIRED // PITCH CUTOFF';
      if (topTimerBar) topTimerBar.className = 'top-sync-timer timer-running';
      if (topStatusText) topStatusText.textContent = 'TIME UP // PROTOCOL CUTOFF';
    }

    if (topPhase) topPhase.textContent = phaseText;
    if (sectionPhase) sectionPhase.textContent = phaseText;
  }

  function applyTimerState(newState) {
    if (!newState) return;
    localTimerState = Object.assign({}, newState);
    renderTimerUI();
  }

  setInterval(() => {
    if (localTimerState.status === 'running') {
      renderTimerUI();
    }
  }, 250);

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      applyTimerState(JSON.parse(stored));
    } else {
      renderTimerUI();
    }
  } catch (e) {
    renderTimerUI();
  }

  // ---------------------------------------------------------------------------
  // 05. LEADERBOARD STATE APPLY (EMBARGOED VS PUBLISHED SNAPSHOT)
  // ---------------------------------------------------------------------------
  const leaderboardLockedView = document.getElementById('leaderboard-locked-view');
  const leaderboardUnlockedView = document.getElementById('leaderboard-unlocked-view');
  const leaderboardTrackerStatus = document.getElementById('leaderboard-tracker-status');
  const leaderboardTbody = document.getElementById('leaderboard-live-tbody');
  const leaderboardReleasedTime = document.getElementById('leaderboard-released-time');
  const leaderboardJumpPill = document.querySelector('.pill-leaderboard-jump');
  const leaderboardNavPill = document.querySelector('.pill-leaderboard-nav');

  function applyLeaderboardState(lbState) {
    if (!lbState) return;

    const isPublished = lbState.isUnlocked || lbState.state === 'PUBLISHED';

    if (isPublished) {
      if (leaderboardLockedView) leaderboardLockedView.style.display = 'none';
      if (leaderboardUnlockedView) leaderboardUnlockedView.style.display = 'block';
      if (leaderboardTrackerStatus) leaderboardTrackerStatus.textContent = 'EMBARGO STATUS: RELEASED ●';

      if (leaderboardJumpPill) {
        leaderboardJumpPill.innerHTML = '<span class="pill-num">06</span> 🏆 LEADERBOARD';
        leaderboardJumpPill.classList.add('active-result');
      }
      if (leaderboardNavPill) {
        leaderboardNavPill.innerHTML = '<span class="nav-num">06</span>🏆 LEADERBOARD';
      }

      if (leaderboardReleasedTime && lbState.publishedAt) {
        const d = new Date(lbState.publishedAt);
        leaderboardReleasedTime.textContent = `OFFICIAL JURY RESULTS CERTIFIED // PUBLISHED AT ${d.toLocaleTimeString()}`;
      }

      if (leaderboardTbody && Array.isArray(lbState.teams)) {
        if (lbState.teams.length === 0) {
          leaderboardTbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
                Official scores have been pushed. Standings will populate shortly.
              </td>
            </tr>
          `;
        } else {
          leaderboardTbody.innerHTML = lbState.teams.map((t, idx) => {
            const teamName = t.teamName || t.team || 'Team';
            const domain = t.domain || 'General';
            const c4Score = t.avgFunctionality != null ? Number(t.avgFunctionality).toFixed(1) : (t.c4 != null ? Number(t.c4).toFixed(1) : '—');
            const totalScore = t.avgTotal != null ? Number(t.avgTotal).toFixed(2) : (t.total != null ? Number(t.total).toFixed(1) : '—');
            const award = t.award || (idx === 0 ? '🏆 CHAMPION' : (idx === 1 ? '🥈 RUNNER UP' : 'FINALIST'));

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
      }
    } else {
      if (leaderboardLockedView) leaderboardLockedView.style.display = 'flex';
      if (leaderboardUnlockedView) leaderboardUnlockedView.style.display = 'none';
      if (leaderboardTrackerStatus) leaderboardTrackerStatus.textContent = 'EMBARGO STATUS: LOCKED 🔒';

      if (leaderboardJumpPill) {
        leaderboardJumpPill.innerHTML = '<span class="pill-num">06</span> 🔒 LEADERBOARD';
        leaderboardJumpPill.classList.remove('active-result');
      }
      if (leaderboardNavPill) {
        leaderboardNavPill.innerHTML = '<span class="nav-num">06</span>🔒 LEADERBOARD';
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.timer));
          } else if (payload.status) {
            // legacy timer-only payload
            applyTimerState(payload);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          }
          if (payload.leaderboard) {
            applyLeaderboardState(payload.leaderboard);
            localStorage.setItem('astra_leaderboard_state', JSON.stringify(payload.leaderboard));
          }
        } catch (err) {}
      };
    } catch (e) {}
  }
  initServerSync();

  // ---------------------------------------------------------------------------
  // 07. QUICK-JUMP BAR & SCROLL-SPY ACTIVE PILLS
  // ---------------------------------------------------------------------------
  const jumpPills = document.querySelectorAll('.jump-pill');
  const sectionsToSpy = document.querySelectorAll('section[id], header[id]');

  jumpPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      const targetId = pill.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth' });
        jumpPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        playSound('click');
      }
    });
  });

  // Highlight jump pill based on scroll position
  window.addEventListener('scroll', () => {
    const scrollPos = window.scrollY + 180;
    sectionsToSpy.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute('id');
      if (scrollPos >= top && scrollPos < top + height) {
        jumpPills.forEach(pill => {
          if (pill.getAttribute('data-target') === id) {
            pill.classList.add('active');
          } else {
            pill.classList.remove('active');
          }
        });
      }
    });
  }, { passive: true });

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
  // 12. MOBILE MENU DRAWER TOGGLE
  // ---------------------------------------------------------------------------
  const mobileToggle = document.getElementById('mobile-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerClose = document.getElementById('drawer-close');
  const drawerItems = document.querySelectorAll('.drawer-item');

  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', () => {
      mobileDrawer.classList.add('active');
      document.body.style.overflow = 'hidden';
      playSound('click');
    });

    if (drawerClose) {
      drawerClose.addEventListener('click', () => {
        mobileDrawer.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    drawerItems.forEach(item => {
      item.addEventListener('click', () => {
        mobileDrawer.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 13. SIMULATED GIT AUDIT TERMINAL LOGS
  // ---------------------------------------------------------------------------
  const terminalBody = document.getElementById('audit-terminal');
  const auditLogs = [
    '&gt; git diff --stat HEAD~1...HEAD [VERIFIED]',
    '&gt; checking automated commit frequency... [NORMAL]',
    '&gt; inspecting external APIs &amp; datasets... [APPROVED]',
    '&gt; verifying hardware power connections at mentor desk #04...',
    '&gt; Git commit history synchronized with evaluation jury portal.'
  ];
  let logIndex = 0;

  if (terminalBody) {
    setInterval(() => {
      if (logIndex < auditLogs.length) {
        const newLine = document.createElement('div');
        newLine.className = 'term-line text-muted';
        newLine.innerHTML = auditLogs[logIndex];
        const promptEl = terminalBody.querySelector('.term-prompt');
        if (promptEl) {
          terminalBody.insertBefore(newLine, promptEl);
        }
        logIndex++;
      }
    }, 4500);
  }

})();
