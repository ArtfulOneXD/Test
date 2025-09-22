// chat.js — front-end chat logic (static, safe; no API key here)

const box = document.getElementById('chat-box');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const clearBtn = document.getElementById('clear');
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// -------- UI helpers --------
function el(tag, cls, html) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (html !== undefined) x.innerHTML = html;
  return x;
}

function addMessage(text, role = 'bot') {
  const row = el('div', `msg ${role}`);
  const bubble = el('div', 'bubble');
  bubble.textContent = text;
  row.appendChild(bubble);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
  return row;
}

function addTyping() {
  const row = el('div', 'msg bot');
  const bubble = el('div', 'bubble');
  bubble.innerHTML = `<span class="typing">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </span>`;
  row.appendChild(bubble);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
  return row;
}

function replaceTyping(row, text) {
  const bubble = row.querySelector('.bubble');
  bubble.textContent = text;
}

function seedGreeting() {
  addMessage(
    "Hi! I’m your estimator. Tell me what you need done (e.g., “Install 6 recessed lights in living room; 9 ft ceiling”). I’ll suggest scope, timeline, and a ballpark."
  );
}

// -------- bootstrap --------
if (box && box.children.length === 0) seedGreeting();

// -------- events --------
clearBtn?.addEventListener('click', () => {
  box.innerHTML = '';
  seedGreeting();
});

// Submit handler → calls your Vercel function /api/ai
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  // UI: lock input while processing
  input.disabled = true;

  addMessage(text, 'user');
  input.value = '';
  const thinking = addTyping();

  try {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    // Handle non-200 errors
    if (!r.ok) {
      const errText = await r.text();
      replaceTyping(thinking, `Error (${r.status}): ${errText || 'Request failed'}`);
      input.disabled = false;
      input.focus();
      return;
    }

    const data = await r.json();
    replaceTyping(thinking, data.reply || 'No reply.');
  } catch (err) {
    replaceTyping(thinking, 'Network error contacting AI. Please try again.');
  } finally {
    input.disabled = false;
    input.focus();
  }
});
