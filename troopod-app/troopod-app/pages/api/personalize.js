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

  let landingPageContent = '';
  let originalHtml = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const lpRes = await fetch(landing_page_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      }
    });
    clearTimeout(timeout);
    originalHtml = await lpRes.text();
    landingPageContent = originalHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);
  } catch (e) {
    try {
      const domain = new URL(landing_page_url).hostname.replace('www.', '');
      landingPageContent = `Could not fetch page. Domain: ${domain}. Infer typical landing page content for this company.`;
    } catch {
      landingPageContent = `Could not fetch page. URL: ${landing_page_url}.`;
    }
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 3000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `You are an AI that personalizes landing pages to match ad creatives.

Ad description: ${ad_description}
Landing page URL: ${landing_page_url}
Landing page content: ${landingPageContent}

Your job:
1. Analyze the ad - extract headline, tone, CTA, product, audience, key message
2. Generate a FULL personalized HTML landing page that:
   - Keeps the same structure and layout as the original page
   - Rewrites ALL copy (headline, subheadline, features, CTA, footer) to match the ad's tone and messaging
   - Uses inline CSS for styling - make it look like a real modern landing page
   - Includes a hero section, 3 feature cards, and a CTA section
   - Uses colors and visual style inspired by the ad

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
  "personalized_html": "<!DOCTYPE html><html>...</html>",
  "changes": ["change 1", "change 2", "change 3"]
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

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
