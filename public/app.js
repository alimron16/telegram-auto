const socket = io();
const listEl = document.getElementById("list");

async function fetchComplaints() {
  const q = document.getElementById("q").value;
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const status = document.getElementById("status").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (status) params.set("status", status);
  const res = await fetch("/api/complaints?" + params.toString());
  const data = await res.json();
  renderList(data);
}

function escapeHtml(s) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderList(items) {
  listEl.innerHTML = "";
  if (!items || items.length === 0) {
    listEl.innerHTML = "<p><em>Tidak ada komplain.</em></p>";
    return;
  }

  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="meta"><strong>ID:</strong> ${it.id} &nbsp;
        <strong>Status:</strong> ${it.status} &nbsp;
        <strong>From:</strong> ${it.sender_username || it.sender_id} &nbsp;
        <small>${it.created_at}</small></div>
      <div style="white-space:pre-wrap; margin-bottom:8px;">
        <strong>Pesan:</strong><br>${escapeHtml(it.message)}
      </div>
      <div style="white-space:pre-wrap; margin-bottom:8px;">
        <strong>Gemini reply:</strong><br>${escapeHtml(it.gemini_reply || "")}
      </div>
      <div>
        <textarea id="reply_${it.id}" placeholder="Tulis balasan...">${it.reply_text || ""}</textarea>
        <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="file" id="file_${it.id}" />
          <div id="pastePreview_${it.id}" style="max-width:200px; max-height:150px; overflow:hidden;"></div>
          <input type="hidden" id="paste_${it.id}" />
          <button class="btn" onclick="sendReply(${it.id})">Kirim</button>
          <button class="btn btn-danger" onclick="deleteComplaint(${it.id})">Hapus</button>
        </div>
        ${it.reply_media ? `<div style="margin-top:6px;"><small>Reply media: ${escapeHtml(it.reply_media)}</small></div>` : ""}
      </div>
    `;
    listEl.appendChild(div);

    // Tambahkan event paste gambar di textarea
    const textarea = div.querySelector(`#reply_${it.id}`);
    const pasteHidden = div.querySelector(`#paste_${it.id}`);
    const pastePreview = div.querySelector(`#pastePreview_${it.id}`);

    textarea.addEventListener("paste", (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (evt) => {
            const base64 = evt.target.result;
            pasteHidden.value = base64; // simpan base64 ke input hidden
            pastePreview.innerHTML = `<img src="${base64}" style="max-width:100%; border-radius:6px; margin-top:4px;">`;
          };
          reader.readAsDataURL(blob);
        }
      }
    });
  });
}

window.sendReply = async (id) => {
  const replyEl = document.getElementById(`reply_${id}`);
  const fileEl = document.getElementById(`file_${id}`);
  const pasteEl = document.getElementById(`paste_${id}`);

  const fd = new FormData();
  fd.append("replyText", replyEl.value || "");
  if (fileEl && fileEl.files && fileEl.files[0]) fd.append("file", fileEl.files[0]);
  if (pasteEl && pasteEl.value) fd.append("pastedImageBase64", pasteEl.value);

  const res = await fetch(`/api/complaints/${id}/reply`, { method: "POST", body: fd });
  const j = await res.json();
  if (j.ok) {
    alert("Balasan terkirim!");
    fetchComplaints();
  } else {
    alert("Error: " + (j.error || "unknown"));
  }
};

window.deleteComplaint = async (id) => {
  if (!confirm("Yakin hapus (mark deleted)?")) return;
  await fetch(`/api/complaints/${id}`, { method: "DELETE" });
  fetchComplaints();
};

document.getElementById("filterBtn").addEventListener("click", fetchComplaints);
document.getElementById("refreshBtn").addEventListener("click", fetchComplaints);

socket.on("complaints_list", (list) => renderList(list));
socket.on("new_complaint", () => fetchComplaints());
socket.on("updated_complaint", () => fetchComplaints());

fetchComplaints();
