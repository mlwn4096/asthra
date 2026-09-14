# Walkthrough: Multi-Judge Evaluation System & Admin Control Deck

We have built and verified the complete **Multi-Judge Evaluation System & Admin Control Deck** for **ASTRA 11.0 // BUILD-A-BOT**.

---

## 🏗️ What Was Built

### 1. Unified 3-Portal Architecture
All three portals are served from a single unified server instance and communicate via relative `/api/...` endpoints:
- **Participant Portal (`index.html`)**: Real-time timer countdown (`HH:MM:SS` & `MM:SS`) and official certified leaderboard under strict embargo control.
- **Judge Evaluation Portal (`judge.html` & `judge.js`)**: Dedicated evaluation interface with the complete official rubric at the top, secure key-to-session token authentication, 0.5-precision scoring, remarks, and revision history.
- **Admin Control Deck (`admin.html` & `admin.js`)**: Master controller featuring `[ HH ] : [ MM ] : [ SS ]` timer presets, on-the-spot judge key provisioning, collapsible criteria reference, live multi-judge evaluation matrix, and one-click leaderboard publishing.

```
┌──────────────────────────────────────────────────────────┐
│                   ASTRA 11.0 SYSTEM                      │
│                                                          │
│  Participant Portal       Judge Portal      Admin Desk   │
│   (index.html)            (judge.html)     (admin.html)  │
│        │                       │                │        │
│        └───────────────┬───────┴────────────────┘        │
│                        │                                 │
│             REST API & SSE Broadcast                     │
│                        │                                 │
│               Node.js Backend Server                     │
│                    (server.js)                           │
│                        │                                 │
│           Embedded SQLite with WAL Mode                  │
│                 (data/asthra.db)                         │
└──────────────────────────────────────────────────────────┘
```

---

### 2. Backend & Native SQLite Database (`server.js`)
- **Engine**: Node 24 native built-in `node:sqlite` (`DatabaseSync`) in `WAL` mode. Zero npm dependencies.
- **Tables**:
  - `judges`: Unique ID, judge name, SHA-256 `key_hash`, active status, creation timestamp.
  - `sessions`: Bearer token, `judge_id`, 7-day expiration.
  - `teams`: Dynamic or pre-registered team names & domain mappings.
  - `evaluations`: Granular scores (`c1`..`c6`), server-calculated `total`, remarks, update timestamp. Unique constraint on `(judge_id, team_id)`.
  - `event_state`: Authoritative timer state and published leaderboard snapshots.
- **Security & Validation**:
  - SHA-256 key hashing: plaintext keys are never stored in the database.
  - Server-calculated totals and strict 0.5-step bounds validation ($C1 \le 20, C2 \le 20, C3 \le 20, C4 \le 25, C5 \le 10, C6 \le 5$).
  - Remarks sanitization against HTML/script injection.

---

### 3. Judge Evaluation Portal (`judge.html` & `judge.js`)
- **Top Section**: Full Official Criteria Specification (C1–C6, scoring bins, zero functionality penalty rule, 0.5-point rule).
- **Authentication**:
  - Enter Key (e.g. `J-3660`) or follow direct link `judge.html?key=J-3660`.
  - Exchanges key for a session token via `POST /api/judges/verify`.
  - Displays authenticated juror name with a "Switch Key" option.
- **Scoring Console**:
  - Team Name input and 15 Domains selector.
  - Stepper buttons (`+` and `-`) for each criterion with min/max enforcement.
  - Dynamic aggregate score (`0.0 / 100.0`) updating live.
  - Juror Remarks & Technical Notes.
  - `[ UPLOAD MARKS TO ADMIN DESK ]` button.
- **Evaluation History**:
  - Live table showing all teams evaluated by this judge with an **"EDIT / REVISE"** button that reloads scores into the form for instant refinement before the final lock.

---

### 4. Admin Control Deck (`admin.html` & `admin.js`)
- **Timer Console**:
  - Input slots: `[ HH ]` hours : `[ MM ]` minutes : `[ SS ]` seconds with `SET TIME`.
  - Presets: `2 HR (Coding Sprint)`, `1 HR`, `5 MIN (Pitch Window)`, `3 MIN (Pitch)`, `2 MIN (Q&A)`, `1 MIN (Test)`.
  - Authoritative controls: `▶ START`, `⏸ PAUSE`, `▶ RESUME`, `⏹ STOP`, `↺ RESET`.
- **Collapsible Rubric Drawer**:
  - `[ 📋 VIEW OFFICIAL JUDGING RUBRIC ▼ ]` button toggles an expandable reference drawer with full criteria and the tie-breaker hierarchy.
- **Judge Provisioning**:
  - `+ ADD NEW JUDGE` generates unique keys (e.g. `J-4821`) on the spot.
  - Generates direct login links (`http://.../judge.html?key=...`) with one-click copy.
  - Displays active/deactivated status and count of evaluated teams.
- **Live Jury Evaluation Matrix**:
  - Streams juror submissions live.
  - Displays: Team Name, Domain, Individual Juror Marks, Average Total (`/100`), Average C4 (`/25`), Rank, and Award title.
  - Remarks modal button (`💬 VIEW`).
- **Leaderboard Embargo & Broadcast**:
  - `[ 🔓 PUSH & PUBLISH LEADERBOARD ]`: Generates an immutable certified snapshot and broadcasts it to all participants.
  - `[ 🔒 LOCK EMBARGO ]`: Immediately re-locks public view into the embargo standby state.

---

## 🧪 Verification Results

We executed an automated end-to-end integration test:

```text
=== 1. Creating Judges ===
Judge 1: Dr. Alan Turing  (Key: J-3660)
Judge 2: Ada Lovelace     (Key: J-2877)

=== 2. Authenticating Judges ===
Token 1 received: True
Token 2 received: True

=== 3. Submitting Scores ===
Judge 1 -> Team Alpha Total: 92.5
Judge 2 -> Team Alpha Total: 89.0
Judge 1 -> Team Beta Total:  91.0

=== 4. Admin Live Matrix Preview ===
Rank #1: Team Beta        | Avg Total: 91.00 | Avg C4: 22.00 | 🏆 1ST PLACE WINNER
Rank #2: Team Alpha       | Avg Total: 90.75 | Avg C4: 23.50 | 🥈 2ND PLACE RUNNER-UP

=== 5. Public Leaderboard Before Publish ===
Public State: EMBARGOED | Teams visible: 0

=== 6. Publishing Leaderboard ===
Publish Result: {'ok': True, 'state': 'PUBLISHED', 'publishedCount': 2}

=== 7. Public Leaderboard After Publish ===
Public State: PUBLISHED | Teams visible: 2
Rank #1: Team Beta  | Domain: 04 - Robotics & IoT | Total: 91.00 | 🏆 1ST PLACE WINNER
Rank #2: Team Alpha | Domain: 01 - AI Agents      | Total: 90.75 | 🥈 2ND PLACE RUNNER-UP

=== 8. Persistence Verification ===
Server process killed (-9) and restarted.
Database read confirmed 100% data retention (judges, evaluations, timer, rankings).
```

---

## 🌐 URLs & Access

The server is running live on your network:
- **Participant Portal**: `http://localhost:3000` (or `http://192.168.1.6:3000`)
- **Judge Evaluation Portal**: `http://localhost:3000/judge.html` (or `http://192.168.1.6:3000/judge.html`)
- **Admin Control Deck**: `http://localhost:3000/admin.html` (or `http://192.168.1.6:3000/admin.html`)

All changes have also been committed and pushed to your GitHub repository:
👉 **[https://github.com/mlwn4096/asthra](https://github.com/mlwn4096/asthra)**
