// userbot.js
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import bodyParser from "body-parser";
import multer from "multer";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import { NewMessage } from "telegram/events/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- uploads dir ----------
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// multer setup for reply file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

// ---------- SQLite init ----------
let db;
async function initDb() {
  db = await open({
    filename: process.env.SQLITE_FILE || "complaints.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      sender_id TEXT,
      sender_username TEXT,
      message TEXT,
      gemini_reply TEXT,
      status TEXT DEFAULT 'pending', -- pending | done | deleted
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      replied_at DATETIME,
      reply_text TEXT,
      reply_media TEXT
    );
  `);
  console.log("✅ SQLite ready");
}

// helper: check message length (huruf/angka) <= 500 after removing whitespace
function isWithin200(msg) {
  if (!msg) return false;
  const only = msg.replace(/\s+/g, "");
  return only.length <= 500;
}

// ---------- Express + Socket.IO ----------
const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

// GET list with filters: start,end,status,q
app.get("/api/complaints", async (req, res) => {
  try {
    const { start, end, status, q } = req.query;
    let sql = "SELECT * FROM complaints WHERE status != 'deleted'";
    const params = [];
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (start) {
      sql += " AND date(created_at) >= date(?)";
      params.push(start);
    }
    if (end) {
      sql += " AND date(created_at) <= date(?)";
      params.push(end);
    }
    if (q) {
      sql += " AND (message LIKE ? OR gemini_reply LIKE ? OR sender_username LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += " ORDER BY created_at DESC LIMIT 1000";
    const rows = await db.all(sql, params);

    // filter panjang maksimal 500 huruf/angka
    const filtered = rows.filter((r) => isWithin200(r.message || ""));
    res.json(filtered);
  } catch (e) {
    console.error("GET /api/complaints error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// GET single
app.get("/api/complaints/:id", async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM complaints WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    console.error("GET /api/complaints/:id", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Reply to complaint (send via Telegram client)
// Accepts: replyText, pastedImageBase64, file (multipart)
app.post("/api/complaints/:id/reply", upload.single("file"), async (req, res) => {
  try {
    const id = req.params.id;
    const complaint = await db.get("SELECT * FROM complaints WHERE id = ?", [id]);
    if (!complaint) return res.status(404).json({ error: "Not found" });

    // Reply will be handled by userbot (we'll call client.sendMessage from global client variable)
    const { replyText } = req.body;
    const pasted = req.body.pastedImageBase64;
    let sentMedia = null;

    // if file uploaded -> its path
    if (req.file) {
      sentMedia = req.file.filename;
      await client.sendMessage(complaint.chat_id, { message: replyText || "", file: req.file.path });
    } else if (pasted) {
      // pasted should be data URL (data:image/png;base64,....)
      const match = pasted.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1].split("/")[1];
        const data = Buffer.from(match[2], "base64");
        const filename = path.join(UPLOAD_DIR, `${Date.now()}.${ext}`);
        fs.writeFileSync(filename, data);
        sentMedia = path.basename(filename);
        await client.sendMessage(complaint.chat_id, { message: replyText || "", file: filename });
      } else {
        // not a valid image; just send text
        await client.sendMessage(complaint.chat_id, { message: replyText || "" });
      }
    } else {
      // no media, only text
      await client.sendMessage(complaint.chat_id, { message: replyText || "" });
    }

    // update DB: mark done
    await db.run(
      `UPDATE complaints SET status = 'done', replied_at = datetime('now'), reply_text = ?, reply_media = ? WHERE id = ?`,
      [replyText || null, sentMedia, id]
    );

    const updated = await db.get("SELECT * FROM complaints WHERE id = ?", [id]);
    io.emit("updated_complaint", updated);
    res.json({ ok: true, updated });
  } catch (e) {
    console.error("POST /api/complaints/:id/reply error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Delete (mark as deleted)
app.delete("/api/complaints/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.run("UPDATE complaints SET status='deleted' WHERE id = ?", [id]);
    const updated = await db.get("SELECT * FROM complaints WHERE id = ?", [id]);
    io.emit("updated_complaint", updated);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/complaints/:id", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// serve dashboard index.html automatically via static middleware
app.get("/", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// socket.io connection
io.on("connection", (socket) => {
  console.log("Dashboard client connected:", socket.id);
  (async () => {
    try {
      const rows = await db.all("SELECT * FROM complaints WHERE status != 'deleted' ORDER BY created_at DESC LIMIT 200");
      socket.emit("complaints_list", rows.filter(r => isWithin200(r.message || "")));
    } catch (e) {
      console.error("socket init error:", e);
    }
  })();
});

// ---------- Gemini setup ----------
const geminiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenerativeAI(geminiKey);
const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" }); // or gemini-1.5-flash

// minimal per-user context
const contextMap = new Map();

async function askGemini(userId, prompt) {
  try {
    const history = contextMap.get(userId) || "";
    const fullPrompt = `
Kamu adalah AI asisten ramah bernama "Chika MP CS" yang menjawab dengan bahasa FORMAL namun tidak membosankan, dan tidak terlalu panjang serta tidak terlalu singkat, dan membantu.
Gunakan bahasa yang santai formal tapi sopan, jangan minta klarifikasi seperti "apa maksudmu", cukup jawab sebisanya, jangan langsung sebut namanya awali dengan kak,
Hanya jawab komplain yang mengandung kode produk dan nomor serta sapaan agar tidak merembet tidak ada kode prudk juga tidak apa2 namun jika ada mohon balas ketika kamu balas pesannya UTAMAKAN NOMOR jika memang ada kode produk sertakan dalam balasan,
Ketika orang mengirim chat mengandung kata spesifik "Dibatalkan" ucapkan terimakasih ya [nomor yang orang kirim] sudah di refund. lalu pada saat orang memberi pernyataan mohon jangan di balas.

${history}
User: ${prompt}
GeminiBot:
`;
    const result = await model.generateContent(fullPrompt);
    // try multiple fallback paths depending on SDK response shape
    let output = "";
    if (result?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      output = result.response.candidates[0].content.parts[0].text.trim();
    } else if (result?.response?.text) {
      output = result.response.text.trim();
    } else if (result?.output?.[0]?.content?.text) {
      output = result.output[0].content.text.trim();
    } else {
      output = "Saya tidak bisa menjawab saat ini.";
    }

    // update minimal context
    contextMap.set(userId, `${history}\nUser: ${prompt}\nGeminiBot: ${output}`);
    if (contextMap.get(userId).length > 3000) {
      contextMap.set(userId, contextMap.get(userId).slice(-2000));
    }

    return output;
  } catch (e) {
    console.error("Gemini error:", e?.message || e);
    return "Baik Mohon Maaf akan Kami Respon dan bantu secepatnya.";
  }
}

// ---------- Telegram client (user account) ----------
const apiId = parseInt(process.env.API_ID || "0");
const apiHash = process.env.API_HASH || "";
const session = new StringSession(process.env.SESSION_STRING || "");
const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

(async () => {
  try {
    await initDb();

    console.log("🚀 Memulai login Telegram...");
    await client.start({
      phoneNumber: async () => await input.text("Masukkan nomor Telegram (misal +628123...): "),
      password: async () => await input.text("Password (jika ada): "),
      phoneCode: async () => await input.text("Kode OTP: "),
      onError: (err) => console.log("Auth error:", err),
    });

    console.log("✅ Login sukses!");
    console.log("Simpan session string ini di .env jika ingin auto-login:");
    console.log(client.session.save());

    await client.connect();
    console.log("🤖 Userbot aktif! Menunggu pesan masuk...");

    const me = await client.getMe();

    // ignored lists (example)
    const ignoredGroupIds = []; // sesuaikan jika perlu
    const ignoredUsernames = ["indosat_isimple_bot", "sidompul_xl_axis_bot", "marketing_cmp", "chika7_bot", "usenfound"];

    // keywords
    const allowedKeywords = [
      "kode","tujuan","cek","tolong","up","update","bantu","sore","siang","pagi","tim",
      "gimana","gmn","lama","hc","marah","validasi","refund","batalkan","batal","diproses","proses","Menunggu Jawaban","trx","Mhn tunggu trx sblmnya selesai"
    ];

    // handler
    client.addEventHandler(async (event) => {
      try {
        const message = event.message;
        if (!message) return;

        // ignore outgoing or from self
        if (message.out) return;

        // ignore if group/channel and blacklisted
        if (message.isGroup || message.isChannel) {
          const chat = await message.getChat();
          const chatId = chat.id.valueOf();
          const chatTitle = chat.title || "(no title)";
          if (ignoredGroupIds.includes(chatId)) {
            console.log("Ignored group:", chatTitle);
            return;
          }
        }

        const sender = await message.getSender();
        const senderId = sender?.id?.valueOf?.();
        const username = sender?.username ? sender.username.toLowerCase() : null;
        if (username && ignoredUsernames.includes(username)) return;

        const rawText = message.message?.trim() || "";
        if (!rawText) return;

        const lowerText = rawText.toLowerCase();
        const hasAllowed = allowedKeywords.some((w) => lowerText.includes(w));
        if (!hasAllowed) {
          console.log("Ignored message (no keyword).");
          return;
        }

        // length filter (only store if <= 200 huruf/angka)
        if (!isWithin200(rawText)) {
          console.log("Ignored: message longer than 200 (after whitespace removal).");
          return;
        }

        // typing action
        try {
          await client.invoke(
            new Api.messages.SetTyping({
              peer: message.chatId,
              action: new Api.SendMessageTypingAction(),
            })
          );
        } catch (e) {
          // ignore
        }

        // ask Gemini for a reply
        const userIdForContext = String(message.chatId);
        const geminiReply = await askGemini(userIdForContext, rawText);

        // send Gemini reply to the chat
        try {
          await client.sendMessage(message.chatId, { message: geminiReply });
          console.log("🤖 Gemini replied to chat.");
        } catch (e) {
          console.error("Failed to send Gemini reply:", e?.message || e);
        }

        // save to DB: message + gemini reply
        const insert = await db.run(
          `INSERT INTO complaints (chat_id, sender_id, sender_username, message, gemini_reply, status) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            String(message.chatId),
            senderId ? String(senderId) : null,
            sender?.username || sender?.firstName || null,
            rawText,
            geminiReply,
            "pending",
          ]
        );
        const inserted = await db.get("SELECT * FROM complaints WHERE id = ?", [insert.lastID]);

        // emit to dashboard (only if message <=500 filtered earlier, but double-check)
        if (isWithin200(inserted.message || "")) {
          io.emit("new_complaint", inserted);
        }

        console.log(`📩 Komplain disimpan (id=${insert.lastID})`);
      } catch (e) {
        console.error("Error handling incoming message:", e);
      }
    }, new NewMessage({}));
  } catch (e) {
    console.error("Startup error:", e);
    process.exit(1);
  }

  // start express server
  server.listen(PORT, () => {
    console.log(`🌐 Dashboard berjalan di: ${BASE_URL}`);
  });
})();
