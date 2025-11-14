# Telegram Userbot Server (Express + Socket.IO + SQLite)

This repository contains a minimal Express server with Socket.IO and SQLite for collecting "complaints" (messages). It also includes an optional Telegram bot integration using Telegraf to automatically record messages that match configured keywords.

Features
- REST API for creating, reading, updating and marking complaints deleted
- Socket.IO emits to connected dashboards when complaints change
- Optional Telegram bot (set `BOT_TOKEN`) to auto-save matched messages

Requirements
- Node.js 16+
- Optional: `BOT_TOKEN` (Telegram bot) if you want Telegram integration

Quick setup

1. Install dependencies:

```powershell
cd d:\Kerja\telegram
npm install
```

2. Create a `.env` in the same folder (example):

```
PORT=3000
BOT_TOKEN=123456:ABC-DEF
SQLITE_FILE=data.db
```

3. Start server:

```powershell
npm start
```

Notes
- If you don't set `BOT_TOKEN`, the server still runs but Telegram integration is skipped.
- The code uses `sqlite3` + `sqlite` for a Promise-friendly API.

Endpoints
- POST `/api/complaints` { chat_id, sender_username, message }
- GET `/api/complaints` list
- GET `/api/complaints/:id` single
- PUT `/api/complaints/:id` update
- DELETE `/api/complaints/:id` mark deleted

If you want me to adapt the code to use a Telegram user client instead of a bot (original used a user client), tell me your preference and I can modify it.
