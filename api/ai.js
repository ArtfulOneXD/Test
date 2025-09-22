// api/ai.js — Vercel Serverless Function (Chat Completions, robust)
//
// How to use:
// 1) Vercel → Project → Settings → Environment Variables
//    - OPENAI_API_KEY = sk-...   (required)
//    - OPENAI_MODEL   = gpt-4o-mini   (optional; default below)
//    - OPENAI_TEMPERATURE = 0.3       (optional)
//    - OPENAI_MAX_TOKENS  = 350       (optional)
// 2) Frontend POSTs JSON: { "message": "Install a 240V outlet ..." }
//
// Notes:
// - Keeps site fully static; key stays server-side.
// - Friendly responses for 401/429.
// - Exponential backoff retries for 429/5xx.
// - Includes token usage in response for debugging (you can remove later).

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TEMP = Number(process.env.OPENAI_TEMPERATURE ?? 0.3);
const MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS ?? 350);

// Basic guard against oversized inputs (prevents abuse)
const MAX_INPUT_CHARS = 4000;

// System prompt tuned for quick, useful estimate replies
const SYSTEM_PROMPT = `
You are "Estimator Bot" for an electrical contractor (MelPro Electrical).
Be concise and practical. Always:
1) Ask for any critical missing details (panel size, run distance in feet, wall type, number of fixtures, attic/crawl access).
2) Provide: • Scope • Timeline • Ballpark range. Use bullet points.
3) Add assumptions plainly if details are missing.
4) End with one short call-to-action to schedule or request photos.
Keep total output under ~180 words unless specifically asked for more.
`.trim();

/** Maps upstream errors to friendly messages */
function friendlyError(status, text) {
  if (status === 401) {
    return 'Auth error with the AI provider. (Owner: verify OPENAI_API_KEY in Vercel env).';
  }
  if (status === 429) {
    return 'We’re temporarily out of AI credits or rate-limited. Please try again shortly.';
  }
  if (status >= 500) {
    return 'AI service is busy right now. Please try again in a moment.';
  }
  // Fallback includes a short excerpt for troubleshooting
  return `Upstream error (${status}): ${text.slice(0, 200)}`;
}

/** Simple sleep (ms) */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retry on 429/5xx (exponential backoff) */
async function fetchWithRetry(url, opts, tries = 2) {
  let attempt = 0;
  let lastErr = null;

  while (attempt <= tries) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        // Retry on rate limit / transient server errors
        const backoff = 600 * Math.pow(2, attempt); // 600ms, 1200ms, 2400ms...
        await wait(backoff);
        attempt++;
        continue;
      }
      // Non-retriable error
      return r;
    } catch (e) {
      lastErr = e;
      // Network error: retry
      const backoff = 600 * Math.pow(2, attempt);
      await wait(backoff);
      attempt++;
    }
  }
  throw lastErr || new Error('Network error contacting AI.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Vercel auto-parses JSON when content-type is application/json
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(200).json({ reply: 'Please type your job details to get an estimate.' });
    }

    const trimmed = message.trim().slice(0, MAX_INPUT_CHARS);

    const payload = {
      model: MODEL,
      temperature: TEMP,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed }
      ]
    };

    const resp = await fetchWithRetry(
      OPENAI_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      },
      2 // retries
    );

    if (!resp.ok) {
      const text = await resp.text();
      const friendly = friendlyError(resp.status, text);
      return res.status(200).json({ reply: friendly });
    }

    const data = await resp.json();

    // Chat Completions shape
    const reply = data?.choices?.[0]?.message?.content?.trim() || 'No reply from model.';
    const usage = data?.usage || null;

    return res.status(200).json({ reply, usage });
  } catch (err) {
    // Do not leak stack traces to clients
    return res.status(200).json({ reply: 'Server error. Please try again.' });
  }
}
