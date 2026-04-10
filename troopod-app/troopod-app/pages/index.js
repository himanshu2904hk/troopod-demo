import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [adDesc, setAdDesc] = useState('');
  const [lpUrl, setLpUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const steps = ['Fetching landing page...', 'Analyzing ad creative...', 'Generating personalized page...', 'Almost done...'];

  async function generate() {
    setError('');
    setResult(null);
    if (!adDesc.trim()) { setError('Please describe your ad creative.'); return; }
    if (!lpUrl.trim()) { setError('Please enter a landing page URL.'); return; }

    setLoading(true);
    let i = 0;
    setStatus(steps[0]);
    const timer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setStatus(steps[i]); }, 2500);

    try {
      const res = await fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_description: adDesc, landing_page_url: lpUrl })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setStatus('Done!');
    } catch (err) {
      setError('Error: ' + err.message);
      setStatus('');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <Head><title>Troopod — Ad Landing Page Personalizer</title></Head>

      <div className={styles.header}>
        <h1>Ad landing page personalizer</h1>
        <p>Describe your ad + paste a landing page URL → get a fully personalized page instantly</p>
      </div>

      <div className={styles.card}>
        <label>Describe your ad creative</label>
        <p className={styles.sub}>What does the ad say? Tone, product, headline, CTA?</p>
        <textarea
          rows={4}
          value={adDesc}
          onChange={e => setAdDesc(e.target.value)}
          placeholder="e.g. Coca-Cola ad with bold red visuals, friends sharing a cold Coke. Headline: Open Happiness. Warm joyful tone targeting young adults. CTA: Grab a Coke today."
        />
      </div>

      <div className={styles.card}>
        <label>Landing page URL</label>
        <p className={styles.sub}>The page you want to personalize to match the ad</p>
        <input
          type="text"
          value={lpUrl}
          onChange={e => setLpUrl(e.target.value)}
          placeholder="https://swiggy.com"
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}
      <button className={styles.btn} onClick={generate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate personalized page'}
      </button>
      {status && <p className={styles.status}>{status}</p>}

      {result && (
        <div className={styles.output}>

          {result.ad_analysis && (
            <div className={styles.section}>
              <h2>Ad analysis</h2>
              <div className={styles.tags}>
                {Object.entries(result.ad_analysis).map(([k, v]) => (
                  <span key={k} className={styles.tag}>{k.replace(/_/g, ' ')}: {v}</span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h2>Side-by-side comparison</h2>
            <div className={styles.iframeGrid}>
              <div className={styles.iframeCol}>
                <div className={styles.iframeLabel}>Original landing page</div>
                <iframe
                  src={lpUrl}
                  className={styles.iframe}
                  title="Original"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
              <div className={styles.iframeCol}>
                <div className={`${styles.iframeLabel} ${styles.persLabel}`}>Personalized version</div>
                <iframe
                  srcDoc={result.personalized_html}
                  className={styles.iframe}
                  title="Personalized"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          </div>

          {result.changes?.length > 0 && (
            <div className={styles.changes}>
              <p className={styles.changesTitle}>What was changed</p>
              {result.changes.map((c, i) => <p key={i} className={styles.change}>• {c}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
