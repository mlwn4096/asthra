# ASTRA 11.0 // BUILD-A-BOT 🤖⚡

> **Official Participant Portal & Live Synchronization System**  
> Department of Computer Applications, St. Joseph's College of Engineering and Technology (SJCET), Palai.

---

## 📌 Overview

**BUILD-A-BOT** is a rapid prototyping sprint held during **ASTRA 11.0**. This repository contains the complete web application, participant portal, admin dashboard, synchronized real-time pitch timer, and dynamic jury leaderboard broadcast system.

### Core Features

- **Cyber-Brutalist Participant Portal (`index.html`)**:
  - High-legibility tactical blueprint UI with dark/light themes.
  - Interactive audio telemetry effects (Web Audio API synthesizers).
  - 15 Predefined Technology Domains explorer with expandable scope accordions.
  - Operational rules, code integrity directives, and 5-minute pitch protocol.
  - Sticky Quick-Jump navigation bar and floating "Scroll to Top" indicator.
  - Downloadable official PDFs (`participate.pdf`).

- **Synchronized Live Pitch Timer (Server-Sent Events)**:
  - Global synchronized pitch clock at the top of all participant screens.
  - Structured 5-minute pitch window: **3 minutes presentation + 2 minutes judge Q&A**.
  - Color-coded phase alerts and auto sound chimes at 2:00 Q&A transition and overtime.

- **Admin Control Deck (`admin.html`)**:
  - Start, pause, resume, and reset the global pitch timer.
  - Live preview of connected SSE clients.
  - Official Leaderboard manager: input scores, certify standings, and release/embargo results with one click.

- **Real-time Synchronization Server (`server.js`)**:
  - Zero-dependency Node.js HTTP server.
  - Server-Sent Events (SSE) streaming state changes across local Wi-Fi / LAN to all participants in real time.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or newer)

### Running Locally
```bash
# Clone the repository
git clone https://github.com/mlwn4096/asthra.git
cd asthra

# Start the live sync server
node server.js
```

Once running, the server will output:
- **Participant Portal**: `http://localhost:3000` (or `http://<your-local-ip>:3000`)
- **Admin Control Desk**: `http://<your-local-ip>:3000/admin.html`

---

## 📂 Project Structure

```
asthra/
├── index.html         # Participant Portal (15 Domains, Rules, Pitch Protocol, Leaderboard)
├── style.css          # Cyber-brutalist responsive styling & light/dark theme engine
├── script.js          # Client-side audio FX, theme management, and SSE sync listener
├── admin.html         # Private Admin Control Deck for timer & leaderboard push
├── admin.js           # Admin panel controller & SSE dispatcher
├── server.js          # Zero-dependency Node.js SSE & REST synchronization server
├── participate.pdf    # Downloadable official participant guidelines PDF
├── judging.pdf        # Downloadable evaluation guidelines PDF
├── package.json       # Project metadata & npm start script
├── assets/            # Event branding & poster assets
└── fonts/             # Offline font fallbacks (JetBrains Mono, Roboto Condensed)
```

---

## ⚖️ License
MIT License. Organized for **ASTRA 11.0** at SJCET Palai.
