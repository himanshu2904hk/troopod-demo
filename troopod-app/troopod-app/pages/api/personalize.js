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

  // Try to fetch landing page, fall back gracefully
  let landingPageContent = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const lpRes = await fetch(landing_page_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    clearTimeout(timeout);
    const html = await lpRes.text();
    landingPageContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);
  } catch (e) {
    // Extract domain for context
    try {
      const domain = new URL(landing_page_url).hostname.replace('www.', '');
      landingPageContent = `Could not fetch page content. The URL is ${landing_page_url} (${domain}). Please infer what this company's landing page likely says based on the domain name and generate appropriate original and personalized copy.`;
    } catch {
      landingPageContent = `Could not fetch page. URL: ${landing_page_url}. Please infer the landing page content from the URL.`;
    }
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are an AI that personalizes landing pages to match ad creatives.

Ad description: ${ad_description}

Landing page URL: ${landing_page_url}
Landing page content: ${landingPageContent}

Tasks:
1. Analyze the ad - extract: headline, tone, CTA, product, audience, key message
2. Based on the landing page content or domain, write what the ORIGINAL page likely says
3. Rewrite the landing page copy to align perfectly with the ad messaging and tone

Respond ONLY with valid JSON, no markdown fences, no extra text:
{
  "ad_analysis": { "headline": "...", "tone": "...", "cta": "...", "audience": "...", "key_message": "..." },
  "original": { "hero_headline": "...", "hero_sub": "...", "cta": "...", "feature_1": "...", "feature_2": "...", "feature_3": "..." },
  "personalized": { "hero_headline": "...", "hero_sub": "...", "cta": "...", "feature_1": "...", "feature_2": "...", "feature_3": "..." },
  "changes": ["change 1", "change 2", "change 3"]
}`
            }]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
        })
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(500).json({ error: 'Gemini API error: ' + JSON.stringify(geminiData) });
    }

    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return res.status(500).json({ error: 'Parse failed', raw: clean.slice(0, 300) });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
