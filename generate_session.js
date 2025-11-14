import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input"; // pastikan sudah: npm i input

const apiId = 25906490; // ganti dengan API_ID kamu
const apiHash = "53a7f5be8b5ee03ed41ba1d566220990"; // ganti dengan API_HASH kamu

const stringSession = new StringSession(""); // kosong dulu

(async () => {
  console.log("=== Login ke Telegram ===");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Masukkan nomor HP kamu (dengan +62): "),
    password: async () => await input.text("Masukkan password 2FA (jika ada): "),
    phoneCode: async () => await input.text("Masukkan kode OTP dari Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("✅ Login berhasil!");
  console.log("Session String kamu:\n");
  console.log(client.session.save());
  console.log("\n=== Salin ini ke file .env sebagai SESSION_STRING ===");
  await client.disconnect();
})();
