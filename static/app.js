const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");

let isLoading = false;

async function checkStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    statusEl.innerHTML = `
      <span class="status-dot"></span>
      <span>已就绪 · 密钥 ${data.api_key_preview} · ${data.chunk_count} 个片段</span>
    `;
    sendBtn.disabled = false;
  } catch {
    statusEl.innerHTML = `
      <span class="status-dot" style="background:#ef4444"></span>
      <span>服务未连接</span>
    `;
    setTimeout(checkStatus, 3000);
  }
}

function appendMessage(role, content, isError = false) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const avatar = role === "user" ? "🙋" : "🤖";
  const bubbleClass = isError ? "bubble error" : "bubble";
  div.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="${bubbleClass}"><p>${escapeHtml(content)}</p></div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function appendTyping() {
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = "typing";
  div.innerHTML = `
    <div class="avatar">🤖</div>
    <div class="bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
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
  return text.replace(/[&<>"']/g, (c) => map[c]).replace(/\n/g, "<br>");
}

async function sendQuestion(question) {
  if (isLoading) return;
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
      appendMessage("assistant", data.detail || "请求失败", true);
    } else {
      appendMessage("assistant", data.answer);
    }
  } catch (err) {
    removeTyping();
    appendMessage("assistant", "网络错误，请稍后重试", true);
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (question) sendQuestion(question);
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
