const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");
const welcomeCard = document.getElementById("welcome-card");
const statsCard = document.getElementById("stats-card");
const statChunks = document.getElementById("stat-chunks");
const statKey = document.getElementById("stat-key");

let isLoading = false;
let hasChatted = false;

async function checkStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    statusEl.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">已就绪 · ${data.chunk_count} 个知识片段</span>
    `;
    statChunks.textContent = `${data.chunk_count} 个`;
    statKey.textContent = data.api_key_preview;
    statsCard.hidden = false;
    sendBtn.disabled = false;
  } catch {
    statusEl.innerHTML = `
      <span class="status-dot" style="background:#f87171;box-shadow:0 0 8px rgba(248,113,113,0.5)"></span>
      <span class="status-text">服务未连接</span>
    `;
    setTimeout(checkStatus, 3000);
  }
}

function hideWelcome() {
  if (!hasChatted) {
    hasChatted = true;
    welcomeCard?.remove();
  }
}

function appendMessage(role, content, isError = false) {
  hideWelcome();
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const label = role === "user" ? "你" : "助手";
  const avatarIcon =
    role === "user"
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
  const bubbleClass = isError ? "bubble error" : "bubble";
  div.innerHTML = `
    <div class="avatar">${avatarIcon}</div>
    <div class="message-body">
      <span class="message-label">${label}</span>
      <div class="${bubbleClass}">${formatContent(content)}</div>
    </div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function appendTyping() {
  hideWelcome();
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = "typing";
  div.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="message-body">
      <span class="message-label">助手</span>
      <div class="bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  document.getElementById("typing")?.remove();
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function formatContent(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

async function sendQuestion(question) {
  if (isLoading || !question.trim()) return;
  isLoading = true;
  sendBtn.disabled = true;

  appendMessage("user", question);
  input.value = "";
  autoResize();
  appendTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    removeTyping();

    if (!res.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((d) => d.msg).join("；")
        : data.detail || "请求失败";
      appendMessage("assistant", detail, true);
    } else {
      appendMessage("assistant", data.answer);
    }
  } catch {
    removeTyping();
    appendMessage("assistant", "网络错误，请稍后重试", true);
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const q = chip.dataset.q;
    if (q && !isLoading) sendQuestion(q);
  });
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendQuestion(input.value.trim());
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event("submit"));
  }
});

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
}

input.addEventListener("input", autoResize);

checkStatus();
