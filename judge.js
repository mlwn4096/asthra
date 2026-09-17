(function () {
  'use strict';

  function initJudge() {
    // Elements
  const authContainer = document.getElementById('judge-auth-container');
  const consoleContainer = document.getElementById('judge-console-container');
  const authProfileHeader = document.getElementById('judge-auth-header-profile');
  const authJudgeName = document.getElementById('auth-judge-name');
  const btnLogoutJudge = document.getElementById('btn-logout-judge');
  const authKeyForm = document.getElementById('auth-key-form');
  const inputJudgeKey = document.getElementById('input-judge-key');
  const authError = document.getElementById('auth-error');

  const evalForm = document.getElementById('eval-form');
  const teamNameInput = document.getElementById('team-name-input');
  const teamDomainSelect = document.getElementById('team-domain-select');
  const evalRemarksInput = document.getElementById('eval-remarks-input');
  const displayTotalScore = document.getElementById('display-total-score');
  const evalToast = document.getElementById('eval-toast');
  const activeEvalStatus = document.getElementById('active-eval-status');
  const btnClearEval = document.getElementById('btn-clear-eval');
  const historyTbody = document.getElementById('history-tbody');
  const historyCount = document.getElementById('history-count');

  const scoreFields = {
    c1: document.getElementById('score-c1'),
    c2: document.getElementById('score-c2'),
    c3: document.getElementById('score-c3'),
    c4: document.getElementById('score-c4'),
    c5: document.getElementById('score-c5'),
    c6: document.getElementById('score-c6')
  };

  const themeToggleBtn = document.getElementById('theme-toggle-judge');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const themeToggleText = document.getElementById('theme-toggle-text');
  const totalScorePill = document.getElementById('total-score-pill');
  const c4MetricVal = document.getElementById('c4-metric-val');

  const MAX_LIMITS = { c1: 20, c2: 20, c3: 20, c4: 25, c5: 10, c6: 5 };

  let currentToken = localStorage.getItem('astra_judge_token') || null;
  let currentJudge = null;
  let mySubmissions = [];

  // ==========================================================================
  // 0. THEME MANAGEMENT (DEFAULT: LIGHT MODE)
  // ==========================================================================
  let currentTheme = localStorage.getItem('astra_judge_theme') || 'light';

  function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('astra_judge_theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('theme-dark');
      document.body.classList.remove('theme-light');
      if (themeToggleIcon) themeToggleIcon.textContent = '🌙';
      if (themeToggleText) themeToggleText.textContent = 'DARK';
    } else {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
      if (themeToggleIcon) themeToggleIcon.textContent = '☀️';
      if (themeToggleText) themeToggleText.textContent = 'LIGHT';
    }
  }

  applyTheme(currentTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
  }

  // ==========================================================================
  // 1. AUTHENTICATION & INITIALIZATION
  // ==========================================================================
  async function initAuth() {
    // Check URL query param ?key=...
    const urlParams = new URLSearchParams(window.location.search);
    const queryKey = urlParams.get('key');

    if (queryKey) {
      inputJudgeKey.value = queryKey.trim().toUpperCase();
      await verifyKey(queryKey.trim());
      return;
    }

    // Check existing stored token
    if (currentToken) {
      try {
        const res = await fetch('/api/judges/me', {
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setAuthenticatedState(currentToken, data.judge);
          return;
        }
      } catch (e) {}
      // Token invalid or expired
      localStorage.removeItem('astra_judge_token');
      currentToken = null;
    }

    setUnauthenticatedState();
  }

  async function verifyKey(rawKey) {
    showAuthError('');
    const keyToVerify = (rawKey || '').trim().toUpperCase();
    if (!keyToVerify) return;
    try {
      const res = await fetch('/api/judges/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyToVerify })
      });

      const data = await res.json();
      if (!res.ok) {
        showAuthError(data.error || 'Authentication failed');
        return;
      }

      setAuthenticatedState(data.token, data.judge);
    } catch (err) {
      showAuthError('Network error connecting to evaluation server');
    }
  }

  function showAuthError(msg) {
    if (!msg) {
      authError.style.display = 'none';
      authError.textContent = '';
    } else {
      authError.style.display = 'block';
      authError.textContent = msg;
    }
  }

  function setAuthenticatedState(token, judge) {
    currentToken = token;
    currentJudge = judge;
    localStorage.setItem('astra_judge_token', token);

    authContainer.style.display = 'none';
    consoleContainer.style.display = 'block';
    authProfileHeader.style.display = 'flex';
    authJudgeName.textContent = judge.name || 'Juror Desk';

    loadSubmissionsHistory();
    loadRegisteredTeams();
  }

  let registeredTeamsCache = [];
  async function loadRegisteredTeams() {
    try {
      const res = await fetch('/api/teams');
      if (!res.ok) return;
      const data = await res.json();
      registeredTeamsCache = data.teams || [];
      const datalist = document.getElementById('registered-teams-list');
      if (datalist) {
        datalist.innerHTML = registeredTeamsCache.map(t => 
          `<option value="${escapeHtml(t.name)}">${escapeHtml(t.domain)}</option>`
        ).join('');
      }
    } catch (e) {}
  }

  function clearEvalForm() {
    teamNameInput.value = '';
    teamDomainSelect.selectedIndex = 0;
    Object.keys(scoreFields).forEach(key => {
      scoreFields[key].value = '0.0';
    });
    evalRemarksInput.value = '';
    calculateTotal();
    activeEvalStatus.textContent = 'NEW SUBMISSION';
    activeEvalStatus.style.color = 'var(--blue)';
    teamNameInput.focus();
  }

  if (btnClearEval) {
    btnClearEval.addEventListener('click', () => {
      clearEvalForm();
      showToast('Form cleared for next team evaluation', 'success');
    });
  }

  // When judge types or selects a team name, auto-select domain if it matches a pre-registered team
  if (teamNameInput) {
    teamNameInput.addEventListener('focus', () => {
      loadRegisteredTeams();
    });
    teamNameInput.addEventListener('input', () => {
      const val = teamNameInput.value.trim().toLowerCase();
      const match = registeredTeamsCache.find(t => t.name.toLowerCase() === val);
      if (match && match.domain && teamDomainSelect) {
        teamDomainSelect.value = match.domain;
      }
      const existing = mySubmissions.find(s => s.team_name.toLowerCase() === val);
      if (existing) {
        activeEvalStatus.textContent = `PREVIOUSLY EVALUATED (${existing.total.toFixed(1)}/100) — CLICK EDIT BELOW OR SUBMIT TO REVISE`;
        activeEvalStatus.style.color = 'var(--amber)';
      } else {
        activeEvalStatus.textContent = 'NEW SUBMISSION';
        activeEvalStatus.style.color = 'var(--blue)';
      }
    });
  }

  function setUnauthenticatedState() {
    currentToken = null;
    currentJudge = null;
    localStorage.removeItem('astra_judge_token');

    authContainer.style.display = 'block';
    consoleContainer.style.display = 'none';
    authProfileHeader.style.display = 'none';
  }

  authKeyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = inputJudgeKey.value.trim();
    if (val) verifyKey(val);
  });

  btnLogoutJudge.addEventListener('click', () => {
    if (confirm('Switch to a different judge credential key?')) {
      setUnauthenticatedState();
    }
  });

  // ==========================================================================
  // 2. LIVE SCORE CALCULATION & STEPPER BUTTONS
  // ==========================================================================
  function calculateTotal() {
    let total = 0;
    for (const key of Object.keys(scoreFields)) {
      const input = scoreFields[key];
      let val = parseFloat(input.value) || 0;
      const max = MAX_LIMITS[key];

      // Snap to 0.5 increments
      val = Math.round(val * 2) / 2;
      val = Math.max(0, Math.min(max, val));
      total += val;
    }

    displayTotalScore.textContent = total.toFixed(1);

    // Update C4 Tie-Breaker metric in sidebar
    if (c4MetricVal && scoreFields.c4) {
      c4MetricVal.textContent = (parseFloat(scoreFields.c4.value) || 0).toFixed(1);
    }

    // Dynamic color & status tier indicator
    if (total >= 85) {
      displayTotalScore.style.color = 'var(--green)';
      if (totalScorePill) {
        totalScorePill.textContent = 'EXEMPLARY (85–100)';
        totalScorePill.style.color = 'var(--green-text)';
        totalScorePill.style.background = 'var(--green-light)';
        totalScorePill.style.borderColor = 'var(--green-border)';
      }
    } else if (total >= 60) {
      displayTotalScore.style.color = 'var(--blue)';
      if (totalScorePill) {
        totalScorePill.textContent = 'PROFICIENT (60–84.5)';
        totalScorePill.style.color = 'var(--blue)';
        totalScorePill.style.background = 'var(--blue-light)';
        totalScorePill.style.borderColor = 'var(--blue-border)';
      }
    } else if (total >= 35) {
      displayTotalScore.style.color = 'var(--amber)';
      if (totalScorePill) {
        totalScorePill.textContent = 'MODERATE (35–59.5)';
        totalScorePill.style.color = 'var(--amber)';
        totalScorePill.style.background = 'var(--amber-light)';
        totalScorePill.style.borderColor = 'var(--amber-border)';
      }
    } else {
      displayTotalScore.style.color = total > 0 ? 'var(--red)' : 'var(--text-muted)';
      if (totalScorePill) {
        totalScorePill.textContent = total > 0 ? 'DEVELOPING (<35)' : 'AWAITING EVALUATION';
        totalScorePill.style.color = total > 0 ? 'var(--red)' : 'var(--text-muted)';
        totalScorePill.style.background = total > 0 ? 'var(--red-light)' : 'var(--card-header)';
        totalScorePill.style.borderColor = total > 0 ? 'var(--red-border)' : 'var(--border)';
      }
    }
  }

  // Bind input changes to calculateTotal
  Object.values(scoreFields).forEach(input => {
    input.addEventListener('input', calculateTotal);
    input.addEventListener('change', () => {
      let val = parseFloat(input.value) || 0;
      val = Math.round(val * 2) / 2;
      input.value = val.toFixed(1);
      calculateTotal();
    });
  });

  // Handle Stepper +/- buttons
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fieldName = btn.getAttribute('data-field');
      const delta = parseFloat(btn.getAttribute('data-delta'));
      const input = scoreFields[fieldName];
      const max = MAX_LIMITS[fieldName];

      let currentVal = parseFloat(input.value) || 0;
      let nextVal = Math.round((currentVal + delta) * 2) / 2;
      nextVal = Math.max(0, Math.min(max, nextVal));

      input.value = nextVal.toFixed(1);
      calculateTotal();
    });
  });

  // ==========================================================================
  // 3. SUBMIT / UPLOAD EVALUATION MARKS
  // ==========================================================================
  evalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentToken) return setUnauthenticatedState();

    const teamName = teamNameInput.value.trim();
    if (!teamName) {
      showToast('Please enter a team name or identifier', 'error');
      return;
    }

    const clampScore = (val, max) => Math.min(max, Math.max(0, Math.round((parseFloat(val) || 0) * 2) / 2));

    const payload = {
      teamName: teamName,
      domain: teamDomainSelect.value,
      scores: {
        c1: clampScore(scoreFields.c1.value, MAX_LIMITS.c1),
        c2: clampScore(scoreFields.c2.value, MAX_LIMITS.c2),
        c3: clampScore(scoreFields.c3.value, MAX_LIMITS.c3),
        c4: clampScore(scoreFields.c4.value, MAX_LIMITS.c4),
        c5: clampScore(scoreFields.c5.value, MAX_LIMITS.c5),
        c6: clampScore(scoreFields.c6.value, MAX_LIMITS.c6)
      },
      remarks: evalRemarksInput.value.trim()
    };

    const submitBtn = document.getElementById('btn-upload-marks');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> <span>UPLOADING TO BASELINE PORTAL...</span>';

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>⬆</span> <span>UPLOAD MARKS TO BASELINE PORTAL</span>';

      if (!res.ok) {
        showToast(data.error || 'Failed to upload marks', 'error');
        return;
      }

      showToast(`✓ Marks certified & uploaded for "${teamName}" (${data.total} / 100)`, 'success');
      activeEvalStatus.textContent = 'SAVED / UPLOADED';
      activeEvalStatus.style.color = 'var(--green)';

      loadSubmissionsHistory();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>⬆</span> <span>UPLOAD MARKS TO BASELINE PORTAL</span>';
      showToast('Network error connecting to evaluation server', 'error');
    }
  });

  function showToast(msg, type) {
    evalToast.innerHTML = msg;
    evalToast.className = `status-toast toast-${type}`;
    evalToast.style.display = 'flex';
    setTimeout(() => {
      evalToast.style.display = 'none';
    }, 6000);
  }

  // ==========================================================================
  // 4. LOAD & RENDER EVALUATED TEAMS HISTORY
  // ==========================================================================
  async function loadSubmissionsHistory() {
    if (!currentToken) return;

    try {
      const res = await fetch('/api/submissions', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });

      if (!res.ok) return;
      const data = await res.json();
      mySubmissions = data.submissions || [];

      historyCount.textContent = `${mySubmissions.length} TEAMS EVALUATED`;

      if (mySubmissions.length === 0) {
        historyTbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
              No teams evaluated yet. Use the form above to score your first team!
            </td>
          </tr>
        `;
        return;
      }

      historyTbody.innerHTML = mySubmissions.map(sub => `
        <tr>
          <td class="history-team-name">${escapeHtml(sub.team_name)}</td>
          <td style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(sub.domain)}</td>
          <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--red);">${sub.c4.toFixed(1)} / 25</td>
          <td class="history-score-val">${sub.total.toFixed(1)} / 100</td>
          <td style="font-size: 12px; color: var(--text-muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(sub.remarks || '—')}
          </td>
          <td>
            <button class="btn-edit-eval" data-team="${escapeHtml(sub.team_name)}">
              EDIT / REVISE
            </button>
          </td>
        </tr>
      `).join('');

      // Bind edit buttons
      document.querySelectorAll('.btn-edit-eval').forEach(btn => {
        btn.addEventListener('click', () => {
          const tName = btn.getAttribute('data-team');
          const record = mySubmissions.find(s => s.team_name === tName);
          if (record) {
            teamNameInput.value = record.team_name;
            teamDomainSelect.value = record.domain;
            scoreFields.c1.value = record.c1.toFixed(1);
            scoreFields.c2.value = record.c2.toFixed(1);
            scoreFields.c3.value = record.c3.toFixed(1);
            scoreFields.c4.value = record.c4.toFixed(1);
            scoreFields.c5.value = record.c5.toFixed(1);
            scoreFields.c6.value = record.c6.toFixed(1);
            evalRemarksInput.value = record.remarks || '';
            calculateTotal();

            activeEvalStatus.textContent = `REVISING "${record.team_name}"`;
            activeEvalStatus.style.color = 'var(--amber)';

            teamNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast(`Loaded "${record.team_name}" for score revision`, 'success');
          }
        });
      });
    } catch (e) {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Kickoff
  initAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJudge);
  } else {
    initJudge();
  }
})();
