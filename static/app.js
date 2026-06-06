const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");
const welcomeCard = document.getElementById("welcome-card");
const statsCard = document.getElementById("stats-card");
const statChunks = document.getElementById("stat-chunks");
const statKey = document.getElementById("stat-key");
const chatLayout = document.getElementById("chat-layout");
const knowledgeLayout = document.getElementById("knowledge-layout");
const kbEditor = document.getElementById("kb-editor");
const kbSaveBtn = document.getElementById("kb-save");
const kbReloadBtn = document.getElementById("kb-reload");
const kbCharCount = document.getElementById("kb-char-count");
const kbChunkCount = document.getElementById("kb-chunk-count");
const kbDirtyHint = document.getElementById("kb-dirty-hint");
const kbToast = document.getElementById("kb-toast");

let isLoading = false;
let hasChatted = false;
let currentView = "chat";
let kbOriginal = "";
let kbLoaded = false;
let kbSaving = false;
let toastTimer = null;

function updateChunkStats(chunkCount) {
  statChunks.textContent = `${chunkCount} 个`;
  kbChunkCount.textContent = `${chunkCount} 个片段`;
  statusEl.innerHTML = `
    <span class="status-dot"></span>
    <span class="status-text">已就绪 · ${chunkCount} 个知识片段</span>
  `;
}

async function checkStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    updateChunkStats(data.chunk_count);
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

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  chatLayout.classList.toggle("hidden", view !== "chat");
  knowledgeLayout.classList.toggle("hidden", view !== "knowledge");
  if (view === "knowledge") loadKnowledge();
  else input.focus();
}

function updateKbMeta() {
  const content = kbEditor.value;
  kbCharCount.textContent = `${content.length} 字符`;
  const dirty = kbLoaded && content !== kbOriginal;
  kbDirtyHint.classList.toggle("hidden", !dirty);
  kbSaveBtn.disabled = kbSaving || !dirty || !content.trim();
  kbReloadBtn.disabled = kbSaving;
}

function showKbToast(message, type = "success") {
  clearTimeout(toastTimer);
  kbToast.textContent = message;
  kbToast.className = `kb-toast ${type}`;
  toastTimer = setTimeout(() => kbToast.classList.add("hidden"), 3000);
}

async function loadKnowledge() {
  kbEditor.placeholder = "正在加载知识库内容...";
  kbEditor.disabled = true;
  kbSaveBtn.disabled = true;
  kbReloadBtn.disabled = true;
  try {
    const res = await fetch("/api/knowledge");
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "加载失败");
    kbOriginal = data.content;
    kbEditor.value = data.content;
    kbLoaded = true;
    kbCharCount.textContent = `${data.char_count} 字符`;
    kbChunkCount.textContent = `${data.chunk_count} 个片段`;
    updateKbMeta();
  } catch (err) {
    kbEditor.value = "";
    showKbToast(err.message || "加载知识库失败", "error");
  } finally {
    kbEditor.placeholder = "在此编辑知识库内容...";
    kbEditor.disabled = false;
    kbReloadBtn.disabled = false;
    updateKbMeta();
  }
}

async function saveKnowledge() {
  const content = kbEditor.value.trim();
  if (!content || kbSaving) return;
  kbSaving = true;
  kbSaveBtn.disabled = true;
  kbReloadBtn.disabled = true;
  kbEditor.disabled = true;
  showKbToast("正在保存并重建索引，请稍候...", "success");
  try {
    const res = await fetch("/api/knowledge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((d) => d.msg).join("；")
        : data.detail || "保存失败";
      throw new Error(detail);
    }
    kbOriginal = content;
    kbEditor.value = content;
    kbCharCount.textContent = `${data.char_count} 字符`;
    kbChunkCount.textContent = `${data.chunk_count} 个片段`;
    updateChunkStats(data.chunk_count);
    showKbToast(data.message || "保存成功");
    updateKbMeta();
  } catch (err) {
    showKbToast(err.message || "保存失败", "error");
  } finally {
    kbSaving = false;
    kbEditor.disabled = false;
    kbReloadBtn.disabled = false;
    updateKbMeta();
  }
}

document.querySelectorAll(".view-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

kbEditor.addEventListener("input", updateKbMeta);
kbSaveBtn.addEventListener("click", saveKnowledge);
kbReloadBtn.addEventListener("click", () => {
  if (kbSaving) return;
  if (kbLoaded && kbEditor.value !== kbOriginal) {
    if (!confirm("当前有未保存的修改，确定要重新加载吗？")) return;
  }
  loadKnowledge();
});

checkStatus();
