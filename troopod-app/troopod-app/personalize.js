export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ad_description, landing_page_url } = req.body;
  if (!ad_description || !landing_page_url) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Fetch actual landing page HTML
  let originalHtml = '';
  let fetchSuccess = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const lpRes = await fetch(landing_page_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    clearTimeout(timeout);
    originalHtml = await lpRes.text();
    fetchSuccess = true;
  } catch (e) {
    fetchSuccess = false;
  }

  // Extract readable text from HTML
  const textContent = originalHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  // Extract key HTML elements for injection
  const headlineMatches = originalHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h2Matches = originalHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
  const buttonMatches = originalHtml.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];

  const existingElements = {
    h1s: headlineMatches.slice(0, 3).join('\n'),
    h2s: h2Matches.slice(0, 5).join('\n'),
    buttons: buttonMatches.slice(0, 3).join('\n'),
  };

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 4000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `You are a CRO (Conversion Rate Optimization) expert and copywriter.

Your job is to personalize an EXISTING landing page by modifying its copy to match an ad creative. The page structure, layout, images and design should stay the same — only the TEXT content changes.

Ad creative: ${ad_description}

Landing page URL: ${landing_page_url}
Page successfully fetched: ${fetchSuccess}
Existing page text content: ${textContent.slice(0, 2000)}
Existing H1 tags: ${existingElements.h1s || 'not found'}
Existing H2 tags: ${existingElements.h2s || 'not found'}
Existing buttons: ${existingElements.buttons || 'not found'}

YOUR TASK:
1. Analyze the ad — extract headline, tone, CTA, audience, key message, brand colors
2. Identify the key copy elements on the existing page (hero headline, subheadline, CTAs, feature titles)
3. Rewrite ONLY the copy to align with the ad messaging while keeping CRO best practices:
   - Message match: landing page headline should mirror the ad headline
   - Maintain the same value proposition but in the ad's tone
   - Keep CTAs action-oriented and matching the ad's CTA
   - Preserve trust signals (ratings, reviews, stats) but reframe them to match the ad
4. Generate a modified version of the page HTML that looks IDENTICAL to the original but with personalized copy
   - If page was fetched: modify the actual HTML, replacing text nodes in h1, h2, h3, p, button, a tags
   - If page was NOT fetched: create a high-fidelity mockup of what the page likely looks like, then personalize it

The output personalized_html MUST look like the REAL existing page — same colors, same layout, same structure — just with different copy that matches the ad.

Respond ONLY with valid JSON, no markdown:
{
  "ad_analysis": {
    "headline": "...",
    "tone": "...",
    "cta": "...",
    "audience": "...",
    "key_message": "..."
  },
  "original_copy": {
    "hero_headline": "...",
    "hero_sub": "...",
    "cta": "...",
    "feature_1": "...",
    "feature_2": "...",
    "feature_3": "..."
  },
  "personalized_copy": {
    "hero_headline": "...",
    "hero_sub": "...",
    "cta": "...",
    "feature_1": "...",
    "feature_2": "...",
    "feature_3": "..."
  },
  "personalized_html": "<!DOCTYPE html>...",
  "changes": ["CRO change 1", "CRO change 2", "CRO change 3", "CRO change 4", "CRO change 5"]
}`
        }]
      })
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      return res.status(500).json({ error: 'Groq API error: ' + JSON.stringify(groqData) });
    }

    const raw = groqData.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch { return res.status(500).json({ error: 'Parse failed', raw: clean.slice(0, 300) }); }
      } else {
        return res.status(500).json({ error: 'No JSON found', raw: clean.slice(0, 300) });
      }
    }

    // Add fetch status to response
    parsed.fetch_success = fetchSuccess;
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
