export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ad_description, landing_page_url } = req.body;

  if (!ad_description || !landing_page_url) {
    return res.status(400).json({ error: 'Missing ad_description or landing_page_url' });
  }

  try {
    // Step 1: Fetch landing page
    let landingPageContent = '';
    try {
      const lpRes = await fetch(landing_page_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TroopodBot/1.0)' }
      });
      const html = await lpRes.text();
      // Strip HTML tags, get readable text
      landingPageContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);
    } catch (e) {
      landingPageContent = 'Could not fetch landing page. Please generate based on the URL domain only.';
    }

    // Step 2: Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
2. Extract key copy from the landing page
3. Rewrite the landing page copy to align perfectly with the ad messaging and tone

Respond ONLY with valid JSON, no markdown:
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
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { error: 'Parse failed', raw: clean.slice(0, 300) };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
