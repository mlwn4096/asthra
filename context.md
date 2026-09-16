# Astra 11.0: BUILD-A-BOT — Project & Memory Context

## 1. Project Overview
* **Name**: Astra 11.0 // BUILD-A-BOT Official Portal & Live Pitch Sync System
* **Architecture**: Vanilla HTML5, CSS3, JavaScript frontend + Dual-mode backend:
  * **Vercel Serverless Edge API** (`api/index.js`) for cloud deployment.
  * **Persistent Node.js Server** (`server.js`) with native SQLite (`node:sqlite`) & Server-Sent Events (SSE) for zero-latency venue local Wi-Fi hosting.
* **Core Modules**:
  * **Participant Portal** (`index.html`, `script.js`, `style.css`)
  * **Admin Baseline Desk** (`baseline.html`, `baseline.js`) — protected against public access
  * **Judge Evaluation Terminal** (`judge.html`, `judge.js`)

---

## 2. Active Deployments & Accounts
* **Vercel Account**: `melwinsanthosh4096@gmail.com` (Account handle: `mlwn`)
* **Live Production URL**: [https://buildabot-one.vercel.app/](https://buildabot-one.vercel.app/)
* **Live Admin Desk**: [https://buildabot-one.vercel.app/baseline](https://buildabot-one.vercel.app/baseline)
* **Protected Routes**: `/admin` and `/admin.html` strictly return `404 Not Found`.
* **Secondary Vercel URL**: `https://buildabot-zeta.vercel.app/` (under `pra-x`)
* **GitHub Repository**: [https://github.com/mlwn4096/asthra](https://github.com/mlwn4096/asthra) (Branch: `main`)

---

## 3. Key Bug Fixes & Architecture Implementations

### A. Vercel Serverless "Split-Brain" Resolution
* **Issue**: Vercel runs stateless Lambda containers across multiple availability zones. Requests landed on different containers holding different timer states (e.g. 2 hours vs 5 minutes) or domain embargo states, causing participants to see timers jump backwards or domains rapidly toggle between visible and hidden.
* **Fix**:
  1. **Monotonic Timestamp Guards**: Added `lastUpdated` and `updatedAt` tracking. Out-of-sync or cold containers returning timestamps older than the client's current state are discarded.
  2. **Authoritative Admin Payloads**: The admin control desk updates locally first and transmits complete state objects. It no longer overwrites its own clock with delayed server responses.
  3. **Anti-Jitter Lock**: When both local and incoming timer packets share the same timestamp and end timestamp, the client continues counting down locally without stuttering or resetting.

### B. Leaderboard Synchronization
* **Issue**: Publishing from the admin desk sent empty team snapshots; cold containers responded with default `EMBARGOED` state, causing participant screens to flicker between locked and unlocked.
* **Fix**:
  1. `POST /api/leaderboard/publish` generates and returns certified team snapshots atomically with `updatedAt` timestamps.
  2. Participant dashboard tracks `lastLeaderboardUpdatedAt` to reject older embargo responses.
  3. Leaderboard data is bundled directly into the atomic `GET /api/timer` response.

### C. Domain Embargo by Default
* **Issue**: Domains were exposed before JavaScript initialized.
* **Fix**: `#domains-embargo-banner` is visible and `#domains-grid` has the class `domains-scrambled` in raw HTML by default.

### D. Zero-Cache Network Headers
* Added strict anti-cache headers across all API endpoints:
  ```http
  Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
  Surrogate-Control: no-store
  Pragma: no-cache
  Expires: 0
  ```

### E. Unified Atomic Status Endpoint
* `GET /api/timer` returns Timer, Domains, and Leaderboard simultaneously in a single JSON payload to eliminate race conditions between separate polling requests.

### F. Instant Cross-Tab Sync
* Implemented `BroadcastChannel('astra_timer_sync_channel')` and `storage` event listeners so multiple tabs on the same machine (e.g., admin laptop connected to a projector) sync with 0ms delay without network requests.

### G. 15 Domains Embargo Lock/Unlock Synchronization & UI Redesign
* **Issue**: The domains lock/unlock button displayed inverted visual cues (a red button with a lock icon when unlocked, and a green button with an eye icon when locked), while the static subtitle persistently stated domains were concealed. In addition, the admin desk was not listening to SSE domain updates or cross-tab BroadcastChannel events.
* **Fix**:
  1. Redesigned status badge and button with unambiguous state indicators and action labels:
     - When locked: Badge `🔒 CURRENT STATUS: LOCKED & EMBARGOED` + Subtitle dynamic update + Button `[ 🔓 UNLOCK & REVEAL 15 DOMAINS ]` (emerald green).
     - When unlocked: Badge `🔓 CURRENT STATUS: UNLOCKED & REVEALED` + Subtitle dynamic update + Button `[ 🔒 LOCK & EMBARGO 15 DOMAINS ]` (crimson red).
  2. Added SSE stream handling for `data.domains` in `baseline.js`.
  3. Added cross-tab BroadcastChannel and `storage` event listeners in `baseline.js`.
  4. Embedded monotonic timestamp `updatedAt` in BroadcastChannel and storage payloads for atomic synchronization with participant dashboard (`script.js`).

### H. Team Deletion & Clean-Slate Reset
* **Endpoints**: `POST /api/teams/delete` (with `{ id }`) and `POST /api/teams/clear`.
* **Behavior**:
  - Allows the admin to delete individual misspelled or test teams in the preview table before publishing.
  - Automatically cascades deletion of associated evaluations in SQLite / in-memory state.
  - Removes the deleted team from published leaderboard snapshots if previously published.
  - Added "🗑️ CLEAR ALL TEAMS" bulk reset button with two-step confirmation.

### I. Judge Account Deletion
* **Endpoints**: `POST /api/judges/delete` (with `{ id }`) and `DELETE /api/judges/:id`.
* **Behavior**:
  - Permanently purges judge accounts, invalidates active sessions, and removes submitted score entries.
  - Added "🗑️ DELETE" button in the admin jury provisioning table alongside the "DEACTIVATE/ACTIVATE" toggle.

---

## 4. UI & UX Refinements
* **Themes**: Dark mode defaults to true black (`#000000`); Light mode uses soft off-white (`#f7f6f2`) for reduced eye strain.
* **Timer Bar**: Fixed sticky bar at top-right with high visibility, progress indicator, and automatic transition audio alert at `00:00`.
* **Directives & Rules**: 15 predefined domains with expandable accordion cards for clean navigation.
* **Quick Navigation**: Floating "Move to Top" button and jump pills for sections.

---

## 5. Hackathon Day Execution Modes
1. **Cloud Mode (Vercel)**:
   - Participants: `https://buildabot-one.vercel.app/`
   - Admin Desk: `https://buildabot-one.vercel.app/baseline`
2. **Local Venue Wi-Fi Mode (Zero Internet Lag)**:
   - Run `node server.js` on the admin laptop.
   - Access via local venue IP (e.g., `http://192.168.x.x:3000`).
   - Uses native SQLite (`data/asthra.db`) and persistent Server-Sent Events (SSE).
