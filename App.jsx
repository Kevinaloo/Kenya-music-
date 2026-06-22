import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================================
   KENYABEATS — Music Intelligence Platform
   Backend: Supabase (data + storage) · YouTube Data API (via Edge Function)
   AI: Claude (in-browser analyst)
   ========================================================================== */

// ⚙️ CONFIG — your connected Supabase project
const SUPABASE_URL = "https://uinxdkpnxwyrecnxjhdm.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbnhka3BueHd5cmVjbnhqaGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTU4MTEsImV4cCI6MjA5NzczMTgxMX0.icGL80eUNTJkZNvX39GpfJbhKmAh9xFqpsoBKSHHDUE"; // anon key is browser-safe (RLS protected)
const FN_URL = `${SUPABASE_URL}/functions/v1/youtube-sync`;

const C = {
  ink: "#05060D", night: "#0A0C18", panel: "rgba(16,19,34,0.72)", border: "rgba(120,140,255,0.14)",
  blue: "#2E6BFF", sky: "#27C4FF", orange: "#FF5A1F", amber: "#FFB020", gold: "#FFD23F",
  white: "#FFFFFF", mist: "#AAB4D4", green: "#23E699", pink: "#FF4D8D",
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Clash+Display:wght@500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
@import url('https://api.fontshare.com/v2/css?f[]=clash-display@600,700,500&display=swap');`;

// ── tiny supabase REST helpers (no SDK needed) ───────────────────────────────
async function sbSelect(table, query = "") {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${query}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function sbUploadClip(file) {
  const path = `clip_${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/bg-clips/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": file.type },
    body: file,
  });
  if (!up.ok) throw new Error("upload failed");
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/bg-clips/${path}`;
  await fetch(`${SUPABASE_URL}/rest/v1/bg_clips`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ label: file.name, storage_path: path, source: "upload" }),
  });
  return publicUrl;
}

// ── fallback mock data (used if Supabase not yet wired) ──────────────────────
const MOCK = {
  tracks: [
    { title: "Nairobi Nights", artist: "Sauti Sol", genre: "Afro-Soul", spotify_streams: "4.2M", platform: "spotify", rank: 1, prev_rank: 2, is_hot: true },
    { title: "Bado", artist: "Bien", genre: "Afro-Pop", spotify_streams: "3.8M", platform: "youtube", rank: 2, prev_rank: 1, is_hot: false },
    { title: "Pamoja Remix", artist: "Jovial ft. Otile Brown", genre: "Bongo", spotify_streams: "3.5M", platform: "tiktok", rank: 3, prev_rank: 5, is_hot: true },
    { title: "Yule Msee", artist: "Khaligraph Jones", genre: "Rap", spotify_streams: "3.1M", platform: "spotify", rank: 4, prev_rank: 3, is_hot: false },
    { title: "Utanipenda", artist: "Mbosso", genre: "Bongo", spotify_streams: "2.9M", platform: "youtube", rank: 5, prev_rank: 8, is_hot: true },
    { title: "Wanjiru", artist: "King Kaka", genre: "Afro-Trap", spotify_streams: "2.7M", platform: "tiktok", rank: 6, prev_rank: 4, is_hot: false },
    { title: "Club Mchawi", artist: "Arrow Bwoy ft. Nadia Mukami", genre: "Afro-Pop", spotify_streams: "2.5M", platform: "youtube", rank: 7, prev_rank: 10, is_hot: true },
    { title: "Hatutaachana", artist: "Nikita Kering", genre: "RnB", spotify_streams: "2.4M", platform: "spotify", rank: 8, prev_rank: 6, is_hot: false },
    { title: "Kiboko", artist: "Ethic Entertainment", genre: "Gengetone", spotify_streams: "2.2M", platform: "tiktok", rank: 9, prev_rank: 12, is_hot: true },
    { title: "Dawa", artist: "Nandy", genre: "Afro-Soul", spotify_streams: "2.0M", platform: "youtube", rank: 10, prev_rank: 7, is_hot: false },
  ],
  artists: [
    { name: "Sauti Sol", genre: "Afro-Soul", score: 98, hits: 14, status: "🔥 Trending", accent_color: "#FF5A1F", is_breakthrough: false },
    { name: "Khaligraph Jones", genre: "Hip-Hop", score: 95, hits: 22, status: "👑 Legend", accent_color: "#2E6BFF", is_breakthrough: false },
    { name: "Bien", genre: "Afro-Pop", score: 92, hits: 8, status: "⚡ Rising", accent_color: "#FFB020", is_breakthrough: false },
    { name: "Otile Brown", genre: "RnB", score: 91, hits: 18, status: "🔥 Trending", accent_color: "#27C4FF", is_breakthrough: false },
    { name: "Nadia Mukami", genre: "Afro-Pop", score: 88, hits: 11, status: "⚡ Rising", accent_color: "#FF8C00", is_breakthrough: false },
    { name: "King Kaka", genre: "Rap", score: 86, hits: 16, status: "👑 Legend", accent_color: "#FF5A1F", is_breakthrough: false },
    { name: "Wakadinali", genre: "Drill", score: 94, growth: "+340%", is_breakthrough: true },
    { name: "Zzero Sufuri", genre: "Afro-Trap", score: 89, growth: "+280%", is_breakthrough: true },
    { name: "Femi One", genre: "Hip-Hop", score: 87, growth: "+210%", is_breakthrough: true },
    { name: "Trio Mio", genre: "Drill", score: 85, growth: "+195%", is_breakthrough: true },
  ],
  genres: [
    { name: "Afro-Pop", share: 28, tracks: 1240, accent_color: "#FF5A1F" },
    { name: "Gengetone", share: 22, tracks: 980, accent_color: "#2E6BFF" },
    { name: "Hip-Hop", share: 18, tracks: 820, accent_color: "#FFB020" },
    { name: "Bongo Flava", share: 14, tracks: 640, accent_color: "#27C4FF" },
    { name: "Afro-Soul", share: 10, tracks: 460, accent_color: "#FF8C00" },
    { name: "Gospel", share: 8, tracks: 370, accent_color: "#9B59B6" },
  ],
  events: [
    { title: "Sauti Sol: The Final Encore", venue: "Uhuru Gardens, Nairobi", event_date: "Jul 19", event_type: "Concert", price: "KES 2,500" },
    { title: "Blankets & Wine", venue: "Jamhuri Park", event_date: "Jul 26", event_type: "Festival", price: "KES 1,500" },
    { title: "Khaligraph: OG Tour", venue: "KICC Grounds", event_date: "Aug 3", event_type: "Concert", price: "KES 3,000" },
    { title: "Koroga Festival", venue: "Two Rivers Mall", event_date: "Aug 10", event_type: "Festival", price: "KES 2,000" },
  ],
  challenges: [
    { name: "#NairobiNightChallenge", creator: "Sauti Sol", platform: "TikTok", videos: "2.4M", trend: "+87%" },
    { name: "#PamojaMove", creator: "Jovial", platform: "TikTok", videos: "1.8M", trend: "+64%" },
    { name: "#KibokoChallenge", creator: "Ethic Entertainment", platform: "Instagram", videos: "1.2M", trend: "+43%" },
    { name: "#WanjaMoves", creator: "King Kaka", platform: "TikTok", videos: "890K", trend: "+38%" },
  ],
  mixes: [
    { title: "Club Hits Kenya Vol.7", curator: "DJ Afro", plays: "890K", duration: "1h 42m", genre: "Club" },
    { title: "Nairobi Vibes 2025", curator: "DJ Joe Mfalme", plays: "760K", duration: "2h 10m", genre: "Afro" },
    { title: "Gengetone Chronicles", curator: "DJ Shiti", plays: "640K", duration: "1h 58m", genre: "Gengetone" },
    { title: "East African Nights", curator: "DJ Roja", plays: "520K", duration: "1h 30m", genre: "Mixed" },
  ],
};

/* ─────────────────────────── reusable UI atoms ──────────────────────────── */

function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, shown];
}

function Reveal({ children, delay = 0, y = 24 }) {
  const [ref, shown] = useReveal();
  return (
    <div ref={ref} style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : `translateY(${y}px)`, transition: `opacity .7s cubic-bezier(.2,.8,.2,1) ${delay}ms, transform .7s cubic-bezier(.2,.8,.2,1) ${delay}ms` }}>
      {children}
    </div>
  );
}

function Counter({ to, suffix = "", dur = 1600 }) {
  const [val, setVal] = useState(0);
  const [ref, shown] = useReveal();
  useEffect(() => {
    if (!shown) return;
    let raf; const start = performance.now();
    const tick = (t) => { const p = Math.min((t - start) / dur, 1); const e = 1 - Math.pow(1 - p, 3); setVal(to * e); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [shown, to, dur]);
  const fmt = val >= 1e6 ? (val / 1e6).toFixed(1) + "M" : val >= 1e3 ? (val / 1e3).toFixed(0) + "K" : Math.round(val).toLocaleString();
  return <span ref={ref}>{fmt}{suffix}</span>;
}

function Bar({ value, color, delay = 0 }) {
  const [w, setW] = useState(0);
  const [ref, shown] = useReveal();
  useEffect(() => { if (shown) { const t = setTimeout(() => setW(value), delay); return () => clearTimeout(t); } }, [shown, value, delay]);
  return (
    <div ref={ref} style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: `linear-gradient(90deg, ${color}, ${color}77)`, borderRadius: 4, transition: "width 1.1s cubic-bezier(.2,.8,.2,1)", boxShadow: `0 0 12px ${color}66` }} />
    </div>
  );
}

function Ring({ score, color, size = 58 }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  const [d, setD] = useState(0);
  const [ref, shown] = useReveal();
  useEffect(() => { if (shown) { const t = setTimeout(() => setD((score / 100) * c), 200); return () => clearTimeout(t); } }, [shown, score, c]);
  return (
    <svg ref={ref} width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={c} strokeDashoffset={c - d} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 5px ${color})` }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: "center", fill: C.white, fontSize: 14, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{score}</text>
    </svg>
  );
}

function Eyebrow({ children }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
      <span style={{ width: 22, height: 2, background: `linear-gradient(90deg,${C.orange},${C.sky})`, borderRadius: 2 }} />
      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, letterSpacing: 4, color: C.orange, textTransform: "uppercase", fontWeight: 700 }}>{children}</span>
    </div>
  );
}

function Heading({ children, sub }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", color: C.white, margin: 0, lineHeight: 1.02, letterSpacing: -1 }}>{children}</h2>
      {sub && <p style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, fontSize: 15, marginTop: 10, maxWidth: 560 }}>{sub}</p>}
    </div>
  );
}

function PlatformChip({ p }) {
  const m = { spotify: ["#1DB954", "Spotify"], youtube: ["#FF2B2B", "YouTube"], tiktok: ["#27E0DC", "TikTok"] };
  const [col, label] = m[p] || ["#888", p];
  return <span style={{ background: col + "1F", color: col, border: `1px solid ${col}44`, borderRadius: 5, padding: "3px 8px", fontSize: 10, fontFamily: "'Space Mono',monospace", fontWeight: 700, letterSpacing: .5 }}>{label}</span>;
}

/* ─────────────────────────── Video Background ───────────────────────────── */

function VideoBackground({ clips }) {
  const [idx, setIdx] = useState(0);
  const hasClips = clips && clips.length > 0;

  useEffect(() => {
    if (!hasClips) return;
    const id = setInterval(() => setIdx(i => (i + 1) % clips.length), 9000);
    return () => clearInterval(id);
  }, [hasClips, clips]);

  const current = hasClips ? clips[idx] : null;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
      {/* Uploaded video clip */}
      {current?.type === "video" && (
        <video key={current.url} src={current.url} autoPlay muted loop playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5, transition: "opacity 1s" }} />
      )}
      {/* YouTube embed clip */}
      {current?.type === "youtube" && (
        <iframe key={current.videoId} title="bg"
          src={`https://www.youtube.com/embed/${current.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${current.videoId}&modestbranding=1&showinfo=0&rel=0`}
          allow="autoplay; encrypted-media" frameBorder="0"
          style={{ position: "absolute", top: "50%", left: "50%", width: "177.78vh", minWidth: "100%", height: "100vh", minHeight: "56.25vw", transform: "translate(-50%,-50%)", opacity: 0.45, pointerEvents: "none", border: 0 }} />
      )}
      {/* Animated gradient mesh fallback / overlay */}
      {!hasClips && <AnimatedMesh />}
      {/* Readability overlay */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${C.ink}cc 0%, ${C.ink}99 40%, ${C.ink}ee 100%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${C.blue}22, transparent 70%)` }} />
    </div>
  );
}

function AnimatedMesh() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf, t = 0;
    const blobs = [
      { x: .25, y: .3, r: 320, c: C.blue, sx: .00018, sy: .00013 },
      { x: .75, y: .35, r: 300, c: C.orange, sx: .00015, sy: .00021 },
      { x: .5, y: .7, r: 360, c: C.sky, sx: .00022, sy: .00011 },
      { x: .85, y: .8, r: 260, c: C.pink, sx: .0001, sy: .00017 },
    ];
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    resize(); window.addEventListener("resize", resize);
    const draw = () => {
      t += 16; ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const x = (b.x + Math.sin(t * b.sx) * .12) * cv.width;
        const y = (b.y + Math.cos(t * b.sy) * .12) * cv.height;
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
        g.addColorStop(0, b.c + "55"); g.addColorStop(1, b.c + "00");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 7); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

/* Animated equalizer bars motif */
function Equalizer({ bars = 32, height = 60, color }) {
  const [vals, setVals] = useState(() => Array(bars).fill(0).map(() => Math.random()));
  useEffect(() => {
    const id = setInterval(() => setVals(v => v.map(() => Math.random())), 140);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
      {vals.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${20 + v * 80}%`, background: `linear-gradient(180deg, ${color || C.sky}, ${C.orange})`, borderRadius: 3, transition: "height .14s ease", opacity: .65 + v * .35 }} />
      ))}
    </div>
  );
}

/* ─────────────────────────── HERO ───────────────────────────── */

function Hero({ tab, setTab, clips, stats }) {
  const nav = ["Charts", "Artists", "Genres", "Platforms", "Events", "Challenges", "Mixes", "Studio"];
  return (
    <header style={{ position: "relative", minHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <VideoBackground clips={clips} />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1240, width: "100%", margin: "0 auto", padding: "0 24px", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: `linear-gradient(135deg,${C.orange},${C.blue})`, display: "grid", placeItems: "center", boxShadow: `0 8px 24px ${C.blue}55`, animation: "float 4s ease-in-out infinite" }}>
              <span style={{ fontSize: 20 }}>🎧</span>
            </div>
            <div>
              <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 21, color: C.white, letterSpacing: -.5 }}>KENYA<span style={{ background: `linear-gradient(90deg,${C.orange},${C.gold})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BEATS</span></div>
              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: C.mist, letterSpacing: 3 }}>MUSIC INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: "rgba(255,255,255,0.05)", borderRadius: 30, border: `1px solid ${C.border}`, backdropFilter: "blur(10px)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 10px ${C.green}`, animation: "pulse 1.6s infinite" }} />
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.white, letterSpacing: 1 }}>{stats.live ? "LIVE · YOUTUBE" : "DEMO DATA"}</span>
          </div>
        </div>

        {/* Center hero */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", paddingBottom: 40 }}>
          <div style={{ animation: "fadeUp 1s both" }}>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: C.gold, letterSpacing: 5, marginBottom: 22, textTransform: "uppercase" }}>◆ The Pulse of East Africa's Sound ◆</div>
            <h1 style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(46px,9vw,118px)", color: C.white, margin: 0, lineHeight: .9, letterSpacing: -3 }}>
              <span style={{ display: "block", animation: "fadeUp 1s .1s both" }}>WHERE KENYA</span>
              <span style={{ display: "block", background: `linear-gradient(100deg,${C.orange} 0%,${C.amber} 35%,${C.sky} 75%,${C.blue} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% auto", animation: "fadeUp 1s .25s both, shimmer 6s linear infinite" }}>HITS DIFFERENT</span>
            </h1>
            <p style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, fontSize: "clamp(15px,2vw,19px)", marginTop: 24, maxWidth: 560, marginInline: "auto", lineHeight: 1.6, animation: "fadeUp 1s .4s both" }}>
              Live rankings, AI-driven artist intelligence and cross-platform analytics across Spotify, YouTube, TikTok & Boomplay.
            </p>
          </div>

          {/* Equalizer flourish */}
          <div style={{ width: "min(440px,80vw)", marginTop: 38, animation: "fadeUp 1s .55s both" }}>
            <Equalizer bars={40} height={56} />
          </div>

          {/* Live stat strip */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px 40px", marginTop: 42, animation: "fadeUp 1s .7s both" }}>
            {[[stats.streams, "Streams Tracked"], [stats.artists, "Artists"], [stats.tracks, "Charting Tracks"], [stats.events, "Live Events"]].map(([v, l]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 30, color: C.white, letterSpacing: -1 }}><Counter to={v} /></div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, letterSpacing: .5 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky nav */}
      <nav style={{ position: "sticky", bottom: 0, zIndex: 5, background: "rgba(8,10,22,0.8)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 16px", display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none" }}>
          {nav.map(item => (
            <button key={item} onClick={() => setTab(item)} className="navbtn"
              style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 13.5, padding: "15px 18px", border: "none", background: "transparent", cursor: "pointer", whiteSpace: "nowrap", position: "relative",
                color: tab === item ? C.white : C.mist }}>
              {item}
              {tab === item && <span style={{ position: "absolute", left: 14, right: 14, bottom: 0, height: 3, background: `linear-gradient(90deg,${C.orange},${C.sky})`, borderRadius: 3, boxShadow: `0 0 12px ${C.orange}` }} />}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

/* ─────────────────────────── TABS ───────────────────────────── */

function ChartsTab({ data }) {
  const [period, setPeriod] = useState("Weekly");
  return (
    <Section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 18 }}>
        <div><Eyebrow>Top Charts</Eyebrow><Heading sub="The definitive countdown, refreshed live from streaming data.">Kenya Hot 10</Heading></div>
        <div style={{ display: "flex", gap: 6 }}>
          {["Weekly", "Monthly", "Yearly"].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={pillStyle(period === p)}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((t, i) => (
          <Reveal key={i} delay={i * 45}>
            <div className="row" style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 20px", background: C.panel, backdropFilter: "blur(14px)", borderRadius: 14,
              border: `1px solid ${t.is_hot ? C.orange + "55" : C.border}`, boxShadow: t.is_hot ? `0 0 28px ${C.orange}1a` : "none" }}>
              <span style={{ width: 30, textAlign: "center", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: t.rank <= 3 ? 26 : 18,
                color: t.rank === 1 ? C.gold : t.rank === 2 ? "#D6D9E6" : t.rank === 3 ? "#E0915A" : C.mist }}>{t.rank}</span>
              <RankDelta prev={t.prev_rank} rank={t.rank} />
              <span style={{ width: 18, fontSize: 15 }}>{t.is_hot ? "🔥" : ""}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 15, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, marginTop: 2 }}>{t.artist}</div>
              </div>
              <span className="hideSm" style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.mist, background: "rgba(255,255,255,0.05)", padding: "4px 9px", borderRadius: 5 }}>{t.genre}</span>
              <PlatformChip p={t.platform} />
              <div style={{ textAlign: "right", minWidth: 56 }}>
                <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 14, color: C.sky }}>{t.spotify_streams || t.youtube_views || "—"}</div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: C.mist }}>streams</div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function RankDelta({ prev, rank }) {
  const d = (prev || rank) - rank;
  if (d > 0) return <span style={{ width: 30, color: C.green, fontSize: 11, fontFamily: "'Space Mono',monospace" }}>▲{d}</span>;
  if (d < 0) return <span style={{ width: 30, color: C.pink, fontSize: 11, fontFamily: "'Space Mono',monospace" }}>▼{-d}</span>;
  return <span style={{ width: 30, color: C.mist, fontSize: 11, textAlign: "center" }}>—</span>;
}

function ArtistsTab({ artists }) {
  const top = artists.filter(a => !a.is_breakthrough);
  const fresh = artists.filter(a => a.is_breakthrough);
  return (
    <Section>
      <Eyebrow>Artist Intelligence</Eyebrow><Heading sub="Power rankings computed from streams, chart velocity and social momentum.">The Movers</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 16 }}>
        {top.map((a, i) => (
          <Reveal key={a.name} delay={i * 60}>
            <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 18, padding: 22, border: `1px solid ${C.border}`, boxShadow: i === 0 ? `0 0 36px ${a.accent_color}26` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${a.accent_color},${a.accent_color}55)`, display: "grid", placeItems: "center", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 17, color: C.white }}>
                  {a.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <Ring score={a.score} color={a.accent_color} />
              </div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 16, color: C.white }}>{a.name}</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, marginBottom: 12 }}>{a.genre} · {a.hits} hits</div>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: a.accent_color, background: a.accent_color + "1F", padding: "5px 9px", borderRadius: 6 }}>{a.status}</span>
            </div>
          </Reveal>
        ))}
      </div>

      <div style={{ marginTop: 44 }}>
        <Eyebrow>Breaking Through</Eyebrow><Heading sub="The fastest-rising names in the country this cycle.">New Wave</Heading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
          {fresh.map((a, i) => (
            <Reveal key={a.name} delay={i * 80}>
              <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 14, padding: 18, border: `1px solid ${C.border}`, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ minWidth: 46, height: 46, borderRadius: 12, background: `linear-gradient(135deg,${C.orange},${C.blue})`, display: "grid", placeItems: "center", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 15, color: C.white }}>{a.name.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14.5, color: C.white }}>{a.name}</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11.5, color: C.mist, marginBottom: 8 }}>{a.genre}</div>
                  <Bar value={a.score} color={C.orange} delay={i * 100} />
                </div>
                <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 14, color: C.green }}>{a.growth}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

function GenresTab({ genres }) {
  return (
    <Section>
      <Eyebrow>Genre Landscape</Eyebrow><Heading sub="How Kenya's sounds split the market this period.">Sound of the Nation</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {genres.map((g, i) => (
          <Reveal key={g.name} delay={i * 70}>
            <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 16, padding: 22, border: `1px solid ${g.accent_color}33` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 20, color: C.white }}>{g.name}</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist }}>{Number(g.tracks).toLocaleString()} tracks</div>
                </div>
                <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 36, color: g.accent_color, lineHeight: 1 }}>{g.share}%</div>
              </div>
              <Bar value={(g.share / 28) * 100} color={g.accent_color} delay={i * 90} />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function PlatformsTab() {
  const P = [
    { platform: "YouTube Music", icon: "▶️", streams: "198M", growth: "+31%", color: "#FF2B2B", share: 52 },
    { platform: "Spotify", icon: "🎵", streams: "142M", growth: "+24%", color: "#1DB954", share: 38 },
    { platform: "TikTok", icon: "🎶", streams: "87M", growth: "+67%", color: "#27E0DC", share: 23 },
    { platform: "Boomplay", icon: "🎸", streams: "64M", growth: "+18%", color: "#FF6B00", share: 17 },
  ];
  return (
    <Section>
      <Eyebrow>Platform Intelligence</Eyebrow><Heading sub="Cross-platform reach and momentum at a glance.">Where They Listen</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 18 }}>
        {P.map((p, i) => (
          <Reveal key={p.platform} delay={i * 80}>
            <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 18, padding: 24, border: `1px solid ${p.color}33`, boxShadow: `0 8px 30px ${p.color}11` }}>
              <div style={{ fontSize: 34, marginBottom: 14 }}>{p.icon}</div>
              <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 19, color: C.white, marginBottom: 4 }}>{p.platform}</div>
              <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 38, color: p.color, letterSpacing: -1 }}>{p.streams}</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, marginBottom: 16 }}>total streams</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 14, color: C.green }}>{p.growth}</span>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: C.mist }}>{p.share}% share</span>
              </div>
              <Bar value={p.share} color={p.color} delay={i * 100} />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function EventsTab({ events }) {
  return (
    <Section>
      <Eyebrow>Shows & Events</Eyebrow><Heading sub="The live calendar — concerts and festivals worth the ticket.">On Stage Soon</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 18 }}>
        {events.map((e, i) => (
          <Reveal key={i} delay={i * 80}>
            <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 18, padding: 22, border: `1px solid ${C.border}`, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, background: `radial-gradient(circle,${C.orange}22,transparent 70%)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.orange, background: C.orange + "1F", padding: "5px 10px", borderRadius: 6, fontWeight: 700 }}>{(e.event_type || "").toUpperCase()}</span>
                <span style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 17, color: C.sky }}>{e.event_date}</span>
              </div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17, color: C.white, marginBottom: 6 }}>{e.title}</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, marginBottom: 16 }}>📍 {e.venue}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, color: C.gold }}>{e.price}</span>
                <button className="cta" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "8px 16px", background: `linear-gradient(90deg,${C.orange},${C.amber})`, color: C.white, border: "none", borderRadius: 9, cursor: "pointer" }}>Get Tickets →</button>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function ChallengesTab({ challenges }) {
  return (
    <Section>
      <Eyebrow>Viral Challenges</Eyebrow><Heading sub="The dances and sounds taking over feeds right now.">Trending Now</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {challenges.map((c, i) => (
          <Reveal key={i} delay={i * 80}>
            <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 16, padding: 22, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 18, color: C.white }}>{c.name}</div>
                <span style={{ fontSize: 18 }}>{c.platform === "TikTok" ? "🎶" : "📸"}</span>
              </div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, marginBottom: 16 }}>by {c.creator} · {c.platform}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 26, color: C.white }}>{c.videos}</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: C.mist }}>videos</div>
                </div>
                <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 16, color: C.green }}>{c.trend}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function MixesTab({ mixes }) {
  return (
    <Section>
      <Eyebrow>Club & DJ Mixes</Eyebrow><Heading sub="The sets ruling clubs and playlists across the country.">Trending Mixes</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
        {mixes.map((m, i) => (
          <Reveal key={i} delay={i * 80}>
            <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 16, padding: 22, border: `1px solid ${C.border}` }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: `linear-gradient(135deg,${C.blue},${C.orange})`, display: "grid", placeItems: "center", fontSize: 23, marginBottom: 14 }}>🎧</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, color: C.white, marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, marginBottom: 16 }}>by {m.curator} · {m.duration}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.sky, background: C.sky + "1F", padding: "4px 9px", borderRadius: 5 }}>{m.genre}</span>
                <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, color: C.amber }}>{m.plays} plays</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ─────────── STUDIO: background video manager (upload + YouTube) ─────────── */

function StudioTab({ clips, setClips, ytConfigured }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ytId, setYtId] = useState("");
  const fileRef = useRef(null);

  const onUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (SUPABASE_ANON.startsWith("REPLACE")) { setMsg("Add your Supabase anon key in the code first."); return; }
    setBusy(true); setMsg("Uploading to Supabase Storage…");
    try {
      const url = await sbUploadClip(file);
      setClips(c => [...c, { type: "video", url, label: file.name }]);
      setMsg("✓ Added. It's now in your background rotation.");
    } catch { setMsg("Upload failed — check Storage bucket & keys."); }
    setBusy(false);
  };

  const addYt = () => {
    const id = extractYouTubeId(ytId);
    if (!id) { setMsg("Couldn't read that YouTube link/ID."); return; }
    setClips(c => [...c, { type: "youtube", videoId: id, label: id }]);
    setYtId(""); setMsg("✓ YouTube clip added to background rotation.");
  };

  return (
    <Section>
      <Eyebrow>Studio</Eyebrow><Heading sub="Drive the homepage background with your own dance clips or live YouTube music videos.">Background Studio</Heading>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 18 }}>
        {/* Upload card */}
        <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 18, padding: 26, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>📤</div>
          <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 19, color: C.white, marginBottom: 6 }}>Upload a clip</div>
          <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: C.mist, marginBottom: 18, lineHeight: 1.5 }}>MP4 or WebM. Stored in your Supabase bucket and looped behind the hero.</p>
          <input ref={fileRef} type="file" accept="video/mp4,video/webm" onChange={onUpload} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, padding: "12px 22px", background: `linear-gradient(90deg,${C.orange},${C.amber})`, color: C.white, border: "none", borderRadius: 11, cursor: "pointer", width: "100%" }}>
            {busy ? "Working…" : "Choose video"}
          </button>
        </div>

        {/* YouTube card */}
        <div className="card" style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 18, padding: 26, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>▶️</div>
          <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 19, color: C.white, marginBottom: 6 }}>Add a YouTube video</div>
          <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: C.mist, marginBottom: 18, lineHeight: 1.5 }}>Paste any music-video link. It plays muted & looped in the background.</p>
          <input value={ytId} onChange={e => setYtId(e.target.value)} placeholder="youtube.com/watch?v=…"
            style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.white, fontFamily: "'Outfit',sans-serif", fontSize: 14, marginBottom: 12, outline: "none" }} />
          <button onClick={addYt} style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, padding: "12px 22px", background: `linear-gradient(90deg,${C.blue},${C.sky})`, color: C.white, border: "none", borderRadius: 11, cursor: "pointer", width: "100%" }}>Add to background</button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 18, fontFamily: "'Space Mono',monospace", fontSize: 12.5, color: msg.startsWith("✓") ? C.green : C.amber }}>{msg}</div>}

      {clips.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, color: C.white, marginBottom: 12 }}>In rotation ({clips.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {clips.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,0.05)", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <span>{c.type === "youtube" ? "▶️" : "🎬"}</span>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                <button onClick={() => setClips(cl => cl.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.pink, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function extractYouTubeId(s) {
  if (!s) return null;
  const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s.trim())) return s.trim();
  return null;
}

/* ─────────────────────────── AI ANALYST ───────────────────────────── */

function AIAnalyst({ data }) {
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState("");
  const [topic, setTopic] = useState("this week's biggest movers and what's driving them");

  const run = async () => {
    setLoading(true); setOut("");
    const top = data.tracks.slice(0, 5).map(t => `${t.rank}. ${t.title} — ${t.artist} (${t.genre})`).join("; ");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          system: "You are KenyaBeats AI, a sharp music-industry analyst specializing in Kenyan & East African music (Gengetone, Afro-Pop, Bongo Flava, Afro-Soul, Kenyan Hip-Hop/Drill). Write 3 punchy paragraphs, confident and specific, using real Kenyan artists. Under 230 words. No preamble.",
          messages: [{ role: "user", content: `Current Hot 5: ${top}. Analyze ${topic}. Give trend insight, cross-platform read, and one bold prediction.` }],
        }),
      });
      const d = await r.json();
      setOut(d.content?.find(b => b.type === "text")?.text || "No insight returned.");
    } catch { setOut("Analysis unavailable — check connection."); }
    setLoading(false);
  };

  const topics = ["this week's biggest movers and what's driving them", "Gengetone vs Afro-Pop market battle", "Kenya's breakout artists of 2025", "how TikTok is reshaping Kenyan music"];
  return (
    <div style={{ position: "relative", background: `linear-gradient(160deg,${C.night},#0c0f24)`, borderTop: `1px solid ${C.border}`, padding: "56px 24px", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -60, right: "10%", width: 320, height: 320, background: `radial-gradient(circle,${C.blue}22,transparent 70%)` }} />
      <div style={{ maxWidth: 880, margin: "0 auto", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${C.blue},${C.orange})`, display: "grid", placeItems: "center", fontSize: 20, animation: "float 4s ease-in-out infinite" }}>🤖</div>
          <div>
            <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: 22, color: C.white }}>KenyaBeats <span style={{ color: C.sky }}>AI Analyst</span></div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: C.mist, letterSpacing: 2 }}>POWERED BY CLAUDE · READS LIVE CHART DATA</div>
          </div>
        </div>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: C.mist, marginBottom: 20, maxWidth: 560 }}>Ask the system to interpret the market. It reads the current chart and writes an analyst-grade brief.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 18 }}>
          {topics.map(t => (
            <button key={t} onClick={() => setTopic(t)} style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, padding: "8px 15px", borderRadius: 10, cursor: "pointer",
              background: topic === t ? C.blue : "rgba(255,255,255,0.04)", color: topic === t ? C.white : C.mist, border: `1px solid ${topic === t ? C.blue : C.border}` }}>{t}</button>
          ))}
        </div>

        <button onClick={run} disabled={loading} style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, padding: "13px 30px", background: loading ? "rgba(255,255,255,0.06)" : `linear-gradient(90deg,${C.orange},${C.amber})`, color: C.white, border: "none", borderRadius: 12, cursor: loading ? "wait" : "pointer", marginBottom: 22 }}>
          {loading ? "◌ Analysing the charts…" : "✦ Generate AI Brief"}
        </button>

        {out && (
          <Reveal>
            <div style={{ background: C.panel, backdropFilter: "blur(14px)", borderRadius: 16, padding: 26, border: `1px solid ${C.blue}33`, borderLeft: `3px solid ${C.sky}` }}>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14.5, color: "#E8ECFF", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{out}</div>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── shared section wrapper ───────────────────────────── */
function Section({ children }) {
  return <div style={{ maxWidth: 1240, margin: "0 auto", padding: "64px 24px" }}>{children}</div>;
}
function pillStyle(active) {
  return { fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "8px 17px", border: `1px solid ${active ? C.orange : C.border}`, cursor: "pointer", borderRadius: 9, background: active ? C.orange : "rgba(255,255,255,0.04)", color: active ? C.white : C.mist };
}

/* ─────────────────────────── ROOT ───────────────────────────── */

export default function App() {
  const [tab, setTab] = useState("Charts");
  const [clips, setClips] = useState([]);
  const [db, setDb] = useState(MOCK);
  const [live, setLive] = useState(false);

  // Load data from Supabase if anon key is configured; else use mock
  useEffect(() => {
    if (SUPABASE_ANON.startsWith("REPLACE")) return;
    (async () => {
      const [tracks, artists, genres, events, challenges, mixes] = await Promise.all([
        sbSelect("tracks", "&order=rank.asc"), sbSelect("artists", "&order=score.desc"),
        sbSelect("genres", "&order=share.desc"), sbSelect("events"),
        sbSelect("challenges"), sbSelect("mixes"),
      ]);
      setDb({
        tracks: tracks?.length ? tracks : MOCK.tracks, artists: artists?.length ? artists : MOCK.artists,
        genres: genres?.length ? genres : MOCK.genres, events: events?.length ? events : MOCK.events,
        challenges: challenges?.length ? challenges : MOCK.challenges, mixes: mixes?.length ? mixes : MOCK.mixes,
      });
      setLive(true);
    })();
  }, []);

  const stats = { streams: 491000000, artists: 2840, tracks: 847, events: 34, live };

  const tabs = {
    Charts: <ChartsTab data={db.tracks} />, Artists: <ArtistsTab artists={db.artists} />,
    Genres: <GenresTab genres={db.genres} />, Platforms: <PlatformsTab />,
    Events: <EventsTab events={db.events} />, Challenges: <ChallengesTab challenges={db.challenges} />,
    Mixes: <MixesTab mixes={db.mixes} />, Studio: <StudioTab clips={clips} setClips={setClips} />,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.white }}>
      <style>{`
        ${FONTS}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.ink}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        ::-webkit-scrollbar-track{background:${C.ink}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
        @keyframes shimmer{to{background-position:200% center}}
        .card{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s,border-color .25s}
        .card:hover{transform:translateY(-4px)}
        .row{transition:transform .2s,border-color .2s}
        .row:hover{transform:translateX(4px)}
        .cta:hover,.navbtn:hover{filter:brightness(1.1)}
        .navbtn{transition:color .2s}
        .navbtn:hover{color:#fff}
        @media(max-width:560px){.hideSm{display:none!important}}
        input::placeholder{color:${C.mist}88}
      `}</style>

      <Hero tab={tab} setTab={setTab} clips={clips} stats={stats} />

      <main style={{ background: C.ink }}>
        <div key={tab} style={{ animation: "fadeUp .5s both" }}>{tabs[tab]}</div>
      </main>

      <AIAnalyst data={db} />

      <footer style={{ background: C.ink, borderTop: `1px solid ${C.border}`, padding: "28px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.mist, letterSpacing: 2 }}>
          KENYABEATS · {live ? "LIVE DATA via SUPABASE + YOUTUBE" : "DEMO MODE — ADD ANON KEY TO GO LIVE"} · © 2025
        </div>
      </footer>
    </div>
  );
}
