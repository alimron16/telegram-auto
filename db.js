import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";


const DB_FILE = "complaints.db";


export async function initDb() {
if (!fs.existsSync(DB_FILE)) {
fs.writeFileSync(DB_FILE, "");
}
const db = await open({ filename: DB_FILE, driver: sqlite3.Database });


await db.exec(`
CREATE TABLE IF NOT EXISTS complaints (
id INTEGER PRIMARY KEY AUTOINCREMENT,
chat_id TEXT NOT NULL,
sender_id TEXT,
sender_username TEXT,
message TEXT,
status TEXT DEFAULT 'pending', -- pending | done | deleted
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
replied_at DATETIME,
reply_text TEXT,
reply_media TEXT
);
`);


return db;
}