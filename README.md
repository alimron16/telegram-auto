<<<<<<< HEAD
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
API_ID=
API_HASH
SQLITE_FILE=data.db
```

3. Start server:

```powershell
npm start
```

Notes
- If you don't set `GEMINI_KEY`, the server still runs but Telegram integration is skipped.
- The code uses `sqlite3` + `sqlite` for a Promise-friendly API.

Endpoints
- POST `/api/complaints` { chat_id, sender_username, message }
- GET `/api/complaints` list
- GET `/api/complaints/:id` single
- PUT `/api/complaints/:id` update
- DELETE `/api/complaints/:id` mark deleted

If you want me to adapt the code to use a Telegram user client instead of a bot (original used a user client), tell me your preference and I can modify it.
=======
# telegramauto
Project ini adalah sistem userbot Telegram yang otomatis mencatat komplain masuk ke database SQLite, lalu menampilkannya melalui dashboard web. Admin dapat memfilter komplain (tanggal, status, isi ≤500 karakter), membalas komplain langsung ke Telegram (dengan teks atau gambar), mengubah status menjadi selesai, serta menghapus komplain. dan ini menggunakan akun telegram pribadi buka BOT/BOTFATHER untuk mendapatkan API_ID & API_HASH silahkan ambil di telegram API
>>>>>>> 8b9ff7c884b8b0682ad1594017edb0ec78e8c5b2
