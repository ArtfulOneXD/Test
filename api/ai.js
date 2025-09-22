// api/ai.js — Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).send('Missing message');

    // Call OpenAI Responses API (recommended over Chat Completions)
    // Docs: https://platform.openai.com/docs/api-reference/responses
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content:
              'You are a concise electrical job estimator. Ask for missing details and give scope, timeline, and a ballpark range.'
          },
          { role: 'user', content: message }
        ],
        temperature: 0.3
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).send(err);
    }

    const data = await r.json();
    // Responses API returns text in data.output_text (or in content parts)
    const reply =
      data.output_text ||
      data.output?.[0]?.content?.map(p => p.text?.value).join('\n') ||
      'Sorry, no response.';

    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).send(String(e));
  }
}
