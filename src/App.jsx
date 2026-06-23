import { useState, useEffect, useRef, useCallback } from "react";

/* ════════════════════════════════════════════════════════════════════════════
   KENYABEATS — Music Intelligence
   Truth source: YouTube's own mostPopular MUSIC chart for Kenya (region KE).
   Persistence + cache: Supabase. AI brief: Claude.
   ════════════════════════════════════════════════════════════════════════════ */

const SB = "https://uinxdkpnxwyrecnxjhdm.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbnhka3BueHd5cmVjbnhqaGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTU4MTEsImV4cCI6MjA5NzczMTgxMX0.icGL80eUNTJkZNvX39GpfJbhKmAh9xFqpsoBKSHHDUE";
const FN = `${SB}/functions/v1/youtube-sync`;
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

/* ── data helpers ─────────────────────────────────────────────────────────── */
const sbGet = async (t, qs = "") => { const r = await fetch(`${SB}/rest/v1/${t}?select=*${qs}`, { headers: H }); return r.ok ? r.json() : []; };
const sbDel = (t, qs) => fetch(`${SB}/rest/v1/${t}?${qs}`, { method: "DELETE", headers: H });
const sbIns = (t, body) => fetch(`${SB}/rest/v1/${t}`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) });

async function ytSmart(max = 40) {
  const r = await fetch(`${FN}?action=smart&region=KE&max=${max}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d; // { songs, mixes, tribal, aiEngine, scanned, matched }
}
async function ytSearchFn(q, max = 8) {
  const r = await fetch(`${FN}?action=search&q=${encodeURIComponent(q)}&max=${max}`);
  const d = await r.json();
  return d.items || [];
}
async function uploadClip(file) {
  const path = `clip_${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
  const up = await fetch(`${SB}/storage/v1/object/bg-clips/${path}`, { method: "POST", headers: { ...H, "Content-Type": file.type }, body: file });
  if (!up.ok) throw new Error("upload failed");
  const url = `${SB}/storage/v1/object/public/bg-clips/${path}`;
  await sbIns("bg_clips", { label: file.name, storage_path: path, source: "upload", active: true });
  return url;
}

/* ── tokens ───────────────────────────────────────────────────────────────── */
const C = {
  ink: "#060710", void: "#03040A", night: "#0A0D1C",
  glass: "rgba(18,22,42,0.55)", glassHi: "rgba(28,34,64,0.7)", line: "rgba(120,150,255,0.12)",
  blue: "#2F6BFF", sky: "#22CCFF", cyan: "#00E5D0", orange: "#FF5A1F", amber: "#FF9D1C", gold: "#FFD23F",
  white: "#FFFFFF", mist: "#94A3C8", dim: "#5C6789", green: "#16E085", pink: "#FF3D8B", purple: "#9D5BFF",
};
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Outfit:wght@200;300;400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');`;

/* ── motion utilities ─────────────────────────────────────────────────────── */
function useOnScreen(th = 0.1) {
  const ref = useRef(null); const [v, setV] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => e.isIntersecting && (setV(true), io.disconnect()), { threshold: th }); io.observe(el); return () => io.disconnect(); }, [th]);
  return [ref, v];
}
function Reveal({ children, d = 0, y = 24 }) {
  const [ref, v] = useOnScreen();
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? "none" : `translateY(${y}px)`, transition: `opacity .7s cubic-bezier(.2,.8,.2,1) ${d}ms, transform .7s cubic-bezier(.2,.8,.2,1) ${d}ms` }}>{children}</div>;
}
function CountUp({ to, dur = 1500, fmt = true }) {
  const [n, setN] = useState(0); const [ref, v] = useOnScreen();
  useEffect(() => { if (!v) return; let raf; const t0 = performance.now(); const tk = t => { const p = Math.min((t - t0) / dur, 1); setN(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tk); }; raf = requestAnimationFrame(tk); return () => cancelAnimationFrame(raf); }, [v, to, dur]);
  const s = !fmt ? Math.round(n).toLocaleString() : n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : Math.round(n).toLocaleString();
  return <span ref={ref}>{s}</span>;
}
function Bar({ pct, color, d = 0 }) {
  const [w, setW] = useState(0); const [ref, v] = useOnScreen();
  useEffect(() => { if (v) { const t = setTimeout(() => setW(pct), d); return () => clearTimeout(t); } }, [v, pct, d]);
  return <div ref={ref} style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${w}%`, background: `linear-gradient(90deg,${color},${color}66)`, borderRadius: 4, transition: "width 1.2s cubic-bezier(.2,.8,.2,1)", boxShadow: `0 0 12px ${color}66` }} /></div>;
}

/* ── EQ + mesh ────────────────────────────────────────────────────────────── */
function EQ({ bars = 40, h = 52, color }) {
  const [vals, setVals] = useState(() => Array(bars).fill(0).map(() => Math.random()));
  useEffect(() => { const id = setInterval(() => setVals(Array(bars).fill(0).map(() => Math.random())), 120); return () => clearInterval(id); }, [bars]);
  return <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: h }}>{vals.map((v, i) => <div key={i} style={{ flex: 1, height: `${16 + v * 84}%`, background: `linear-gradient(180deg,${color || C.cyan},${C.orange})`, borderRadius: 3, transition: "height .12s ease", opacity: .55 + v * .45 }} />)}</div>;
}
function Mesh() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext("2d"); let raf, t = 0;
    const B = [{ x: .2, y: .25, r: 380, c: C.blue, sx: .00015, sy: .00011 }, { x: .8, y: .3, r: 340, c: C.orange, sx: .00012, sy: .00018 }, { x: .5, y: .75, r: 400, c: C.cyan, sx: .00019, sy: .00009 }, { x: .85, y: .8, r: 280, c: C.purple, sx: .00008, sy: .00015 }];
    const rs = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; }; rs(); addEventListener("resize", rs);
    const draw = () => { t += 13; ctx.clearRect(0, 0, cv.width, cv.height); ctx.globalCompositeOperation = "lighter"; B.forEach(b => { const x = (b.x + Math.sin(t * b.sx) * .14) * cv.width, y = (b.y + Math.cos(t * b.sy) * .14) * cv.height; const g = ctx.createRadialGradient(x, y, 0, x, y, b.r); g.addColorStop(0, b.c + "44"); g.addColorStop(1, b.c + "00"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 7); ctx.fill(); }); raf = requestAnimationFrame(draw); };
    draw(); return () => { cancelAnimationFrame(raf); removeEventListener("resize", rs); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

/* ── video background ─────────────────────────────────────────────────────── */
function VideoBG({ clips }) {
  const [i, setI] = useState(0); const [fade, setFade] = useState(false); const cur = clips[i];
  useEffect(() => { if (clips.length < 2) return; const id = setInterval(() => { setFade(true); setTimeout(() => { setI(p => (p + 1) % clips.length); setFade(false); }, 700); }, 10000); return () => clearInterval(id); }, [clips.length]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
      {!clips.length && <Mesh />}
      {cur?.type === "upload" && <video key={cur.url} src={cur.url} autoPlay muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: fade ? 0 : .5, transition: "opacity .7s" }} />}
      {cur?.type === "youtube" && <iframe key={cur.videoId} title="bg" src={`https://www.youtube.com/embed/${cur.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${cur.videoId}&modestbranding=1&rel=0`} allow="autoplay;encrypted-media" frameBorder="0" style={{ position: "absolute", top: "50%", left: "50%", width: "177.78vh", minWidth: "100%", height: "100vh", minHeight: "56.25vw", transform: "translate(-50%,-50%)", opacity: fade ? 0 : .42, transition: "opacity .7s", pointerEvents: "none" }} />}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg,${C.ink}d8 0%,${C.ink}80 42%,${C.ink}f5 100%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 85% 55% at 50% -5%,${C.blue}26,transparent 65%)` }} />
    </div>
  );
}

/* ── chips & atoms ────────────────────────────────────────────────────────── */
function fmtN(n) { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n.toLocaleString(); }
function ago(iso) { if (!iso) return ""; const d = (Date.now() - new Date(iso)) / 864e5; if (d < 1) return "today"; if (d < 2) return "1d ago"; if (d < 30) return `${Math.floor(d)}d ago`; if (d < 60) return "1mo ago"; return `${Math.floor(d / 30)}mo ago`; }

function YTBadge() { return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#FF2B2B1c", color: "#FF4444", border: "1px solid #FF2B2B44", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>▶ YOUTUBE</span>; }

function Eye({ children, color = C.orange }) {
  return <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 14 }}><span style={{ width: 24, height: 2, background: `linear-gradient(90deg,${color},${C.sky})`, borderRadius: 2 }} /><span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, letterSpacing: 4, color, textTransform: "uppercase", fontWeight: 700 }}>{children}</span></div>;
}
function H2({ children, sub }) {
  return <div style={{ marginBottom: 32 }}><h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(28px,4.4vw,46px)", color: C.white, margin: 0, letterSpacing: -1.4, lineHeight: 1 }}>{children}</h2>{sub && <p style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, fontSize: 15, marginTop: 11, maxWidth: 580, lineHeight: 1.6 }}>{sub}</p>}</div>;
}
function Section({ children, bg }) { return <div style={{ background: bg || "transparent" }}><div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 24px" }}>{children}</div></div>; }

/* ════════════════════════════════ HERO ════════════════════════════════════ */
function Hero({ tab, setTab, clips, live, ticker }) {
  const tabs = ["Charts", "Rising", "Tribal", "Genres", "DJ Mixes", "Events", "Challenges", "Studio"];
  return (
    <header style={{ position: "relative", minHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <VideoBG clips={clips} />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1280, width: "100%", margin: "0 auto", padding: "0 24px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg,${C.orange},${C.blue})`, display: "grid", placeItems: "center", boxShadow: `0 8px 26px ${C.blue}66`, animation: "float 4s ease-in-out infinite" }}><span style={{ fontSize: 21 }}>🎧</span></div>
            <div><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: C.white, letterSpacing: -.6 }}>KENYA<span style={{ background: `linear-gradient(90deg,${C.orange},${C.gold})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BEATS</span></div><div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: C.mist, letterSpacing: 3 }}>MUSIC INTELLIGENCE</div></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 15px", background: "rgba(255,255,255,.04)", borderRadius: 30, border: `1px solid ${C.line}`, backdropFilter: "blur(12px)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: live ? C.green : C.amber, boxShadow: live ? `0 0 10px ${C.green}` : "none", animation: live ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.white, letterSpacing: 1 }}>{live ? "LIVE · YOUTUBE KE CHART" : "FETCHING LIVE…"}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", paddingBottom: 30 }}>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: C.gold, letterSpacing: 5, marginBottom: 22, animation: "fadeUp .9s both" }}>◆ REAL-TIME · STRAIGHT FROM YOUTUBE ◆</div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(50px,10vw,128px)", color: C.white, margin: 0, lineHeight: .85, letterSpacing: -3.5, animation: "fadeUp .9s .1s both" }}>
            WHAT KENYA<br /><span style={{ background: `linear-gradient(100deg,${C.orange} 0%,${C.amber} 32%,${C.cyan} 68%,${C.blue} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "220% auto", animation: "shimmer 6s linear infinite" }}>IS PLAYING NOW</span>
          </h1>
          <p style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, fontSize: "clamp(15px,2vw,19px)", marginTop: 24, maxWidth: 540, lineHeight: 1.65, animation: "fadeUp .9s .25s both" }}>The live music chart for Kenya — ranked by real YouTube views, refreshed the moment you load. No guesses, no filler.</p>
          <div style={{ width: "min(440px,80vw)", marginTop: 36, animation: "fadeUp .9s .4s both" }}><EQ bars={42} h={50} /></div>
        </div>
      </div>

      {ticker.length > 0 && <Ticker items={ticker} />}

      <nav style={{ position: "sticky", bottom: 0, zIndex: 5, background: "rgba(6,7,16,.9)", backdropFilter: "blur(24px)", borderTop: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px", display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none" }}>
          {tabs.map(t => <button key={t} onClick={() => setTab(t)} style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 13.5, padding: "16px 18px", border: "none", background: "transparent", cursor: "pointer", whiteSpace: "nowrap", color: tab === t ? C.white : C.mist, position: "relative", transition: "color .2s" }}>{t}{tab === t && <span style={{ position: "absolute", left: 14, right: 14, bottom: 0, height: 3, background: `linear-gradient(90deg,${C.orange},${C.cyan})`, borderRadius: 3, boxShadow: `0 0 12px ${C.orange}` }} />}</button>)}
        </div>
      </nav>
    </header>
  );
}

function Ticker({ items }) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (!el) return; let x = 0; const id = setInterval(() => { x -= 1; if (Math.abs(x) > el.scrollWidth / 2) x = 0; el.style.transform = `translateX(${x}px)`; }, 22); return () => clearInterval(id); }, [items]);
  const dub = [...items, ...items];
  return <div style={{ overflow: "hidden", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, padding: "10px 0", background: "rgba(0,0,0,.35)", backdropFilter: "blur(8px)" }}><div ref={ref} style={{ display: "flex", whiteSpace: "nowrap", willChange: "transform" }}>{dub.map((t, i) => <span key={i} style={{ fontFamily: "'Space Mono',monospace", fontSize: 11.5, padding: "0 26px", display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ color: C.orange, fontWeight: 700 }}>#{(i % items.length) + 1}</span><span style={{ color: C.white }}>{t.title}</span><span style={{ color: C.dim }}>·</span><span style={{ color: C.mist }}>{t.artist}</span><span style={{ color: C.green }}>▶ {fmtN(t.views)}</span><span style={{ color: C.line, marginLeft: 10 }}>|</span></span>)}</div></div>;
}

/* ════════════════════════════════ CHARTS (redesigned) ═════════════════════ */
function Charts({ items, loading, onRefresh, refreshing, aiEngine, scanInfo }) {
  const [active, setActive] = useState(null);
  if (loading) return <Section><ChartSkeleton /></Section>;
  if (!items.length) return <Section><Empty /></Section>;

  const podium = items.slice(0, 3);
  const rest = items.slice(3, 20);
  const totalViews = items.reduce((s, x) => s + Number(x.views || 0), 0);

  return (
    <Section>
      {/* header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <div><Eye>AI-Filtered · Kenyan + Collabs Only</Eye><H2 sub="YouTube gives us Kenya's trending feed — then our AI sifts out everything that isn't Kenyan or a Kenyan collab. The real local chart, nothing foreign.">Trending Now</H2>
          {aiEngine && <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: -16, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.cyan, background: C.cyan + "14", border: `1px solid ${C.cyan}33`, padding: "4px 10px", borderRadius: 6 }}>
              ✦ AI: {aiEngine === "gemini" ? "Gemini" : aiEngine === "groq" ? "Groq" : "Database"} · scanned {scanInfo?.scanned || 0} → {scanInfo?.matched || 0} Kenyan
            </span>
          </div>}
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="cta" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 13, padding: "11px 20px", border: `1px solid ${C.line}`, borderRadius: 11, cursor: "pointer", background: C.glass, color: C.white, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>⟳</span>{refreshing ? "Refreshing…" : "Refresh chart"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 18, marginBottom: 34, flexWrap: "wrap" }}>
        {[["Tracks ranked", items.length, false], ["Combined views", totalViews, true], ["Top track views", items[0]?.views || 0, true]].map(([l, n, f]) => (
          <div key={l} style={{ flex: "1 1 160px", background: C.glass, backdropFilter: "blur(16px)", border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 30, color: C.white, letterSpacing: -1 }}><CountUp to={Number(n)} fmt={f} /></div>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist }}>{l}</div>
          </div>
        ))}
      </div>

      {/* PODIUM — top 3 as big video cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18, marginBottom: 40 }}>
        {podium.map((t, i) => {
          const medal = ["#FFD23F", "#C9D2E8", "#E0915A"][i];
          return (
            <Reveal key={t.videoId} d={i * 100}>
              <div onClick={() => setActive(t)} className="podium" style={{ position: "relative", borderRadius: 22, overflow: "hidden", cursor: "pointer", border: `1px solid ${medal}55`, boxShadow: `0 18px 50px ${medal}1f`, background: C.void, aspectRatio: i === 0 ? "16/11" : "16/10" }}>
                {t.thumb && <img src={t.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .8 }} />}
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg,transparent 30%,${C.void}f0 100%)` }} />
                {/* rank medal */}
                <div style={{ position: "absolute", top: 16, left: 16, width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg,${medal},${medal}99)`, display: "grid", placeItems: "center", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: C.void, boxShadow: `0 6px 20px ${medal}66` }}>{i + 1}</div>
                <div style={{ position: "absolute", top: 18, right: 16 }}><YTBadge /></div>
                {/* play glow */}
                <div className="playbtn" style={{ position: "absolute", top: "42%", left: "50%", transform: "translate(-50%,-50%)", width: 58, height: 58, borderRadius: "50%", background: "rgba(255,255,255,.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.3)", display: "grid", placeItems: "center", fontSize: 20, color: C.white }}>▶</div>
                <div style={{ position: "absolute", left: 18, right: 18, bottom: 16 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: i === 0 ? 22 : 18, color: C.white, lineHeight: 1.1, marginBottom: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t.title}</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: C.mist, marginBottom: 10 }}>{t.artist}</div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 15, color: C.green }}>▶ {fmtN(t.views)}</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: C.pink }}>♥ {fmtN(t.likes)}</span>
                    <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: C.dim, marginLeft: "auto" }}>{ago(t.published)}</span>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {/* THE REST — rich list rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rest.map((t, i) => {
          const maxV = items[0]?.views || 1;
          return (
            <Reveal key={t.videoId} d={i * 30}>
              <div onClick={() => setActive(t)} className="row" style={{ display: "flex", alignItems: "center", gap: 15, padding: "12px 16px", background: C.glass, backdropFilter: "blur(14px)", borderRadius: 14, border: `1px solid ${C.line}`, cursor: "pointer", position: "relative", overflow: "hidden" }}>
                {/* subtle view-share fill behind row */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(t.views / maxV) * 100}%`, background: `linear-gradient(90deg,${C.blue}14,transparent)`, pointerEvents: "none" }} />
                <span style={{ width: 26, textAlign: "center", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: C.mist, zIndex: 1 }}>{t.rank}</span>
                {t.thumb && <img src={t.thumb} alt="" style={{ width: 64, height: 42, borderRadius: 8, objectFit: "cover", zIndex: 1 }} />}
                <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14.5, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, marginTop: 2 }}>{t.artist} · <span style={{ color: C.dim }}>{ago(t.published)}</span></div>
                </div>
                <div className="hideSm" style={{ textAlign: "right", zIndex: 1 }}>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: C.pink }}>♥ {fmtN(t.likes)}</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 70, zIndex: 1 }}>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 14, color: C.green }}>{fmtN(t.views)}</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: C.green, letterSpacing: .5 }}>▶ LIVE VIEWS</div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {active && <VideoModal track={active} onClose={() => setActive(null)} />}
    </Section>
  );
}

function VideoModal({ track, onClose }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(3,4,10,.86)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 20, animation: "fadeIn .25s" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(880px,100%)", background: C.night, borderRadius: 22, overflow: "hidden", border: `1px solid ${C.line}`, boxShadow: "0 40px 100px rgba(0,0,0,.6)" }}>
        <div style={{ position: "relative", aspectRatio: "16/9", background: "#000" }}>
          <iframe title={track.title} src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1&rel=0`} allow="autoplay;encrypted-media;fullscreen" allowFullScreen frameBorder="0" style={{ width: "100%", height: "100%", border: 0 }} />
          <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,.6)", color: C.white, border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20, color: C.white }}>{track.title}</div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13.5, color: C.mist, marginTop: 3 }}>{track.artist}</div></div>
            <YTBadge />
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 16 }}>
            {[["▶ Views", fmtN(track.views), C.green], ["♥ Likes", fmtN(track.likes), C.pink], ["💬 Comments", fmtN(track.comments), C.sky], ["Uploaded", ago(track.published), C.mist]].map(([l, v, col]) => <div key={l}><div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 16, color: col }}>{v}</div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: C.dim }}>{l}</div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <div><Eye>The Live Chart · Region KE</Eye><H2 sub="Contacting YouTube for Kenya's live music chart…">Loading the real ranking…</H2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18, marginBottom: 30 }}>{[0, 1, 2].map(i => <div key={i} style={{ aspectRatio: "16/10", borderRadius: 22, background: C.glass, border: `1px solid ${C.line}`, animation: "shimmerBg 1.6s infinite" }} />)}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{Array(7).fill(0).map((_, i) => <div key={i} style={{ height: 66, borderRadius: 14, background: C.glass, border: `1px solid ${C.line}`, animation: "shimmerBg 1.6s infinite", animationDelay: `${i * .1}s` }} />)}</div></div>;
}
function Empty() {
  return <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 48, marginBottom: 16 }}>📡</div><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 22, color: C.white, marginBottom: 8 }}>No live chart yet</div><p style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>The YouTube chart couldn't be reached. Confirm <code style={{ color: C.amber }}>YOUTUBE_API_KEY</code> is set in your Supabase Edge Function secrets, then refresh.</p></div>;
}

/* ════════════════════════════ RISING (from real data) ════════════════════ */
function Rising({ items, loading }) {
  if (loading) return <Section><H2 sub="Analysing the chart…">Rising</H2></Section>;
  // Rising = strong views relative to very recent upload date
  const scored = items.map(t => { const days = Math.max((Date.now() - new Date(t.published)) / 864e5, 1); return { ...t, velocity: Number(t.views) / days }; }).sort((a, b) => b.velocity - a.velocity).slice(0, 8);
  const maxVel = scored[0]?.velocity || 1;
  return (
    <Section>
      <Eye color={C.cyan}>Momentum · Live</Eye>
      <H2 sub="Ranked by view velocity — views earned per day since upload. The tracks gaining the fastest right now.">Rising Fast</H2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {scored.map((t, i) => (
          <Reveal key={t.videoId} d={i * 60}>
            <div className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 18, padding: 18, border: `1px solid ${C.line}`, display: "flex", gap: 14, alignItems: "center" }}>
              {t.thumb && <img src={t.thumb} alt="" style={{ width: 68, height: 68, borderRadius: 12, objectFit: "cover" }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11.5, color: C.mist, marginBottom: 8 }}>{t.artist} · {ago(t.published)}</div>
                <Bar pct={(t.velocity / maxVel) * 100} color={C.cyan} d={i * 70} />
              </div>
              <div style={{ textAlign: "right" }}><div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, color: C.cyan }}>{fmtN(Math.round(t.velocity))}</div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: C.dim }}>views/day</div></div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ════════════════════════════ GENRES (derived from chart) ═════════════════ */
function Genres({ items, loading }) {
  if (loading || !items.length) return <Section><H2 sub="Analysing the chart…">Genres</H2></Section>;
  // crude but real: bucket trending tracks by keyword in title/artist
  const buckets = { Gengetone: 0, "Afro-Pop": 0, Bongo: 0, Gospel: 0, "Hip-Hop / Drill": 0, Other: 0 };
  const kw = { Gengetone: /gengetone|arbantone|odi/i, "Afro-Pop": /afro|love|baby|mood/i, Bongo: /bongo|tanzania|diamond|harmonize|rayvanny/i, Gospel: /gospel|yesu|mungu|bwana|praise/i, "Hip-Hop / Drill": /drill|rap|hip ?hop|wakadinali|khaligraph/i };
  items.forEach(t => { const s = `${t.title} ${t.artist}`; let hit = false; for (const g in kw) { if (kw[g].test(s)) { buckets[g] += Number(t.views); hit = true; break; } } if (!hit) buckets.Other += Number(t.views); });
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
  const cols = { Gengetone: C.blue, "Afro-Pop": C.orange, Bongo: C.cyan, Gospel: C.purple, "Hip-Hop / Drill": C.amber, Other: C.dim };
  const data = Object.entries(buckets).map(([name, v]) => ({ name, share: Math.round((v / total) * 100), color: cols[name] })).filter(d => d.share > 0).sort((a, b) => b.share - a.share);
  const max = data[0]?.share || 1;
  return (
    <Section>
      <Eye color={C.purple}>Genre Split · Live</Eye>
      <H2 sub="Computed live from the trending chart — which sounds are pulling the most views in Kenya right now.">Sound of the Nation</H2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {data.map((g, i) => (
          <Reveal key={g.name} d={i * 60}>
            <div className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 16, padding: 22, border: `1px solid ${g.color}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 19, color: C.white }}>{g.name}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 36, color: g.color, lineHeight: 1 }}>{g.share}%</div>
              </div>
              <Bar pct={(g.share / max) * 100} color={g.color} d={i * 70} />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ════════════════════════════ PLATFORMS ═══════════════════════════════════ */
function Platforms({ items }) {
  const ytTotal = items.reduce((s, x) => s + Number(x.views || 0), 0);
  const P = [
    { name: "YouTube", icon: "▶️", val: ytTotal, sub: "live chart total views", color: "#FF2B2B", live: true },
    { name: "Spotify", icon: "🎵", val: null, sub: "connect Spotify API to enable", color: "#1DB954", live: false },
    { name: "TikTok", icon: "🎶", val: null, sub: "no public API — aggregator needed", color: "#22E0DC", live: false },
    { name: "Boomplay", icon: "🎸", val: null, sub: "connect chart feed to enable", color: "#FF6B00", live: false },
  ];
  return (
    <Section>
      <Eye>Platform Coverage</Eye>
      <H2 sub="What's wired in. We show you exactly what's live and what isn't — no fake numbers.">Where the Data Comes From</H2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 18 }}>
        {P.map((p, i) => (
          <Reveal key={p.name} d={i * 60}>
            <div className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 18, padding: 24, border: `1px solid ${p.live ? p.color + "55" : C.line}`, opacity: p.live ? 1 : .72, boxShadow: p.live ? `0 8px 30px ${p.color}14` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><span style={{ fontSize: 30 }}>{p.icon}</span>{p.live ? <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: C.green, background: C.green + "1c", padding: "4px 8px", borderRadius: 5, fontWeight: 700 }}>● LIVE</span> : <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: C.dim, background: "rgba(255,255,255,.05)", padding: "4px 8px", borderRadius: 5 }}>OFF</span>}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 19, color: C.white, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: p.val != null ? 34 : 20, color: p.live ? p.color : C.dim, letterSpacing: -1 }}>{p.val != null ? <CountUp to={p.val} /> : "—"}</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, marginTop: 6 }}>{p.sub}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ════════════════════════════ EVENTS / CHALLENGES / MIXES (Supabase) ═══════ */
function Events({ rows }) {
  return <Section><Eye color={C.amber}>Shows & Events</Eye><H2 sub="Concerts and festivals on the calendar. Curated in your Supabase — edit anytime.">On Stage Soon</H2>
    {rows.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 18 }}>{rows.map((e, i) => <Reveal key={e.id || i} d={i * 60}><div className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 18, padding: 22, border: `1px solid ${C.line}`, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, background: `radial-gradient(circle,${C.orange}22,transparent 70%)` }} /><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.orange, background: C.orange + "1c", padding: "5px 10px", borderRadius: 6, fontWeight: 700 }}>{(e.event_type || "").toUpperCase()}</span><span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: C.sky }}>{e.event_date}</span></div><div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17, color: C.white, marginBottom: 6 }}>{e.title}</div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, marginBottom: 16 }}>📍 {e.venue}</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, color: C.gold }}>{e.price}</span><button className="cta" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "8px 16px", background: `linear-gradient(90deg,${C.orange},${C.amber})`, color: C.white, border: "none", borderRadius: 9, cursor: "pointer" }}>Get Tickets →</button></div></div></Reveal>)}</div> : <Empty />}
  </Section>;
}
function Challenges({ rows }) {
  return <Section><Eye color={C.pink}>Viral Challenges</Eye><H2 sub="Dance & sound challenges taking over feeds. Curated in Supabase.">Trending Challenges</H2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>{rows.map((c, i) => <Reveal key={c.id || i} d={i * 60}><div className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 16, padding: 22, border: `1px solid ${C.line}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: C.white }}>{c.name}</div><span style={{ fontSize: 18 }}>{c.platform === "TikTok" ? "🎶" : "📸"}</span></div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, color: C.mist, marginBottom: 16 }}>by {c.creator} · {c.platform}</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}><div><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: C.white }}>{c.videos}</div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: C.mist }}>videos</div></div><span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 16, color: C.green }}>{c.trend}</span></div></div></Reveal>)}</div>
  </Section>;
}
function DJMixes({ items, loading }) {
  const [active, setActive] = useState(null);
  if (loading) return <Section><H2 sub="Analysing the chart…">DJ Mixes</H2></Section>;
  return (
    <Section>
      <Eye color={C.cyan}>DJ Sets · AI-Detected</Eye>
      <H2 sub="Our AI tells DJ mixes apart from regular songs — these are the Kenyan mixes, mashups and nonstop sets trending on YouTube right now.">Trending DJ Mixes</H2>
      {items.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {items.map((m, i) => (
            <Reveal key={m.videoId} d={i * 60}>
              <div onClick={() => setActive(m)} className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 16, overflow: "hidden", border: `1px solid ${C.line}`, cursor: "pointer" }}>
                <div style={{ position: "relative", aspectRatio: "16/9" }}>
                  {m.thumb && <img src={m.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg,transparent 40%,${C.void}e0)` }} />
                  <div style={{ position: "absolute", top: 12, left: 12, fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.cyan, background: "rgba(0,0,0,.6)", padding: "4px 9px", borderRadius: 6, fontWeight: 700 }}>🎧 DJ MIX</div>
                  <div style={{ position: "absolute", bottom: 12, left: 14, right: 14 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 14, color: C.white, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{m.title}</div>
                  </div>
                </div>
                <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{m.artist}</span>
                  <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, color: C.green }}>▶ {fmtN(m.views)}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      ) : <div style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, padding: "30px 0" }}>No Kenyan DJ mixes in the current trending feed. Check back after a refresh.</div>}
      {active && <VideoModal track={active} onClose={() => setActive(null)} />}
    </Section>
  );
}

function Tribal({ items, loading }) {
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("all");
  if (loading) return <Section><H2 sub="Analysing the chart…">Tribal & Cultural</H2></Section>;
  const genres = [
    { id: "all", label: "All", color: C.orange },
    { id: "mugithi", label: "Mugithi", color: "#FF5A1F" },
    { id: "ohangla", label: "Ohangla", color: "#2F6BFF" },
    { id: "benga", label: "Benga", color: "#FFD23F" },
    { id: "kalenjin", label: "Kalenjin", color: "#16E085" },
    { id: "kamba", label: "Kamba", color: "#9D5BFF" },
    { id: "kisii", label: "Kisii", color: "#22CCFF" },
  ];
  const shown = filter === "all" ? items : items.filter(t => (t.tribal_genre || t.genre) === filter);
  return (
    <Section>
      <Eye color={C.purple}>Roots · Tribal & Cultural</Eye>
      <H2 sub="The heartbeat of Kenya's regions — Mugithi, Ohangla, Benga and more, surfaced live from the trending feed by our AI. Nobody else charts this.">Sounds of the Tribes</H2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 26 }}>
        {genres.map(g => (
          <button key={g.id} onClick={() => setFilter(g.id)} style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "8px 16px", borderRadius: 9, cursor: "pointer", border: `1px solid ${filter === g.id ? g.color : C.line}`, background: filter === g.id ? g.color : "rgba(255,255,255,.04)", color: filter === g.id ? C.void : C.mist, transition: "all .2s" }}>{g.label}</button>
        ))}
      </div>
      {shown.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {shown.map((t, i) => (
            <Reveal key={t.videoId} d={i * 55}>
              <div onClick={() => setActive(t)} className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 16, overflow: "hidden", border: `1px solid ${C.purple}33`, cursor: "pointer" }}>
                <div style={{ position: "relative", aspectRatio: "16/10" }}>
                  {t.thumb && <img src={t.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg,transparent 45%,${C.void}e8)` }} />
                  <div style={{ position: "absolute", top: 12, left: 12, fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.white, background: C.purple + "cc", padding: "4px 10px", borderRadius: 6, fontWeight: 700, textTransform: "uppercase" }}>{t.tribal_genre || t.genre}</div>
                  <div style={{ position: "absolute", bottom: 12, left: 14, right: 14 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 14, color: C.white, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t.title}</div>
                  </div>
                </div>
                <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{t.artist}</span>
                  <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, color: C.green }}>▶ {fmtN(t.views)}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      ) : <div style={{ fontFamily: "'Outfit',sans-serif", color: C.mist, padding: "30px 0" }}>No {filter !== "all" ? filter : "tribal"} tracks in the current trending feed. This updates as regional songs chart — try refreshing the main chart.</div>}
      {active && <VideoModal track={active} onClose={() => setActive(null)} />}
    </Section>
  );
}

/* ════════════════════════════ STUDIO (persistent bg) ═════════════════════ */
function Studio({ clips, setClips, reloadClips }) {
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(""); const [q, setQ] = useState(""); const [res, setRes] = useState([]); const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  const onUpload = async e => {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true); setMsg("Uploading to Supabase Storage…");
    try { await uploadClip(f); await reloadClips(); setMsg("✓ Saved. This clip now persists across refreshes."); }
    catch (err) { setMsg("Upload failed: " + err.message); } setBusy(false);
  };
  const addLink = async () => {
    const id = ytId(link); if (!id) { setMsg("Couldn't read that YouTube link."); return; }
    await sbIns("bg_clips", { label: link, youtube_video_id: id, source: "youtube", active: true });
    await reloadClips(); setLink(""); setMsg("✓ Saved. This video now persists across refreshes.");
  };
  const search = async () => {
    if (!q.trim()) return; setSearching(true); setRes([]);
    try { setRes(await ytSearchFn(q + " Kenya", 6)); } catch { setMsg("Search failed — check Edge Function secret."); } setSearching(false);
  };
  const addRes = async r => { if (!r.videoId) return; await sbIns("bg_clips", { label: r.title || r.videoId, youtube_video_id: r.videoId, source: "youtube", active: true }); await reloadClips(); setMsg(`✓ "${r.title}" saved to background.`); };
  const remove = async c => { await sbDel("bg_clips", `id=eq.${c.id}`); await reloadClips(); setMsg("Removed."); };

  return (
    <Section>
      <Eye>Studio</Eye>
      <H2 sub="Drive the homepage background. Everything you add is saved to Supabase and sticks until you remove it — refresh-proof.">Background Studio</H2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 18, marginBottom: 26 }}>
        <StudioCard icon="📤" title="Upload a clip" body="MP4 or WebM. Stored in Supabase, looped behind the hero.">
          <input ref={fileRef} type="file" accept="video/mp4,video/webm" onChange={onUpload} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={btn(`linear-gradient(90deg,${C.orange},${C.amber})`)}>{busy ? "Uploading…" : "Choose video"}</button>
        </StudioCard>
        <StudioCard icon="▶️" title="Paste a YouTube link" body="Any music video — plays muted & looped in the background.">
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="youtube.com/watch?v=…" style={inp} />
          <button onClick={addLink} style={btn(`linear-gradient(90deg,${C.blue},${C.sky})`)}>Save to background</button>
        </StudioCard>
        <StudioCard icon="🔍" title="Search YouTube" body="Find Kenyan music and pick a video to set as background.">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="e.g. Sauti Sol, Bien…" style={inp} />
          <button onClick={search} disabled={searching} style={btn(`linear-gradient(90deg,${C.pink},${C.orange})`)}>{searching ? "Searching…" : "Search"}</button>
        </StudioCard>
      </div>

      {res.length > 0 && <div style={{ marginBottom: 26 }}>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, color: C.white, marginBottom: 12 }}>Tap a result to set as background</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }}>{res.map((r, i) => <div key={i} onClick={() => addRes(r)} className="card" style={{ background: C.glass, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `1px solid ${C.line}` }}>{r.thumb && <img src={r.thumb} alt="" style={{ width: "100%", height: 110, objectFit: "cover" }} />}<div style={{ padding: "10px 12px" }}><div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 12, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div><div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.green, marginTop: 4 }}>{r.views ? fmtN(r.views) + " views" : ""}</div></div></div>)}</div>
      </div>}

      {msg && <div style={{ marginBottom: 18, fontFamily: "'Space Mono',monospace", fontSize: 12.5, color: msg.startsWith("✓") ? C.green : C.amber }}>{msg}</div>}

      {clips.length > 0 && <div><div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, color: C.white, marginBottom: 12 }}>Saved backgrounds — persist across refreshes ({clips.length})</div><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{clips.map((c, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,.05)", borderRadius: 10, border: `1px solid ${C.line}` }}><span>{c.type === "youtube" ? "▶️" : "🎬"}</span><span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.mist, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span><button onClick={() => remove(c)} style={{ background: "none", border: "none", color: C.pink, cursor: "pointer", fontSize: 15 }}>×</button></div>)}</div></div>}
    </Section>
  );
}
const inp = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.04)", color: C.white, fontFamily: "'Outfit',sans-serif", fontSize: 14, marginBottom: 12, outline: "none" };
const btn = bg => ({ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 14, padding: "12px 22px", background: bg, color: C.white, border: "none", borderRadius: 11, cursor: "pointer", width: "100%" });
function StudioCard({ icon, title, body, children }) {
  return <div className="card" style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 18, padding: 26, border: `1px solid ${C.line}` }}><div style={{ fontSize: 30, marginBottom: 12 }}>{icon}</div><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 6 }}>{title}</div><p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: C.mist, marginBottom: 18, lineHeight: 1.5 }}>{body}</p>{children}</div>;
}
function ytId(s) { if (!s) return null; const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/); if (m) return m[1]; if (/^[A-Za-z0-9_-]{11}$/.test(s.trim())) return s.trim(); return null; }

/* ════════════════════════════ AI ANALYST ═════════════════════════════════ */
function AIAnalyst({ items }) {
  const [loading, setLoading] = useState(false); const [out, setOut] = useState("");
  const [topic, setTopic] = useState("what's driving the top of the chart right now");
  const topics = ["what's driving the top of the chart right now", "which rising track will break next", "the genre winning Kenya this week", "what these numbers say about the scene"];
  const run = async () => {
    setLoading(true); setOut("");
    const top = items.slice(0, 8).map(t => `${t.rank}. "${t.title}" — ${t.artist} (${fmtN(t.views)} views, uploaded ${ago(t.published)})`).join("; ");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: "You are KenyaBeats AI, a sharp music-industry analyst for Kenyan & East African music (Gengetone, Afro-Pop, Bongo, Gospel, Kenyan Hip-Hop/Drill). You are given the REAL live YouTube chart for Kenya. Write 3 punchy, specific analyst paragraphs grounded in the actual data given. Reference real titles/artists from the data. Under 230 words. No preamble.", messages: [{ role: "user", content: `Live YouTube Kenya chart right now: ${top}. Analyse: ${topic}. Give a data-grounded read and one bold prediction.` }] }) });
      const d = await r.json(); setOut(d.content?.find(b => b.type === "text")?.text || "No response.");
    } catch { setOut("Analysis unavailable — check connection."); } setLoading(false);
  };
  return (
    <div style={{ position: "relative", background: `linear-gradient(165deg,${C.night},#0b0e22)`, borderTop: `1px solid ${C.line}`, padding: "64px 24px", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -80, right: "6%", width: 360, height: 360, background: `radial-gradient(circle,${C.blue}1c,transparent 70%)` }} />
      <div style={{ position: "absolute", bottom: -100, left: "4%", width: 320, height: 320, background: `radial-gradient(circle,${C.orange}14,transparent 70%)` }} />
      <div style={{ maxWidth: 880, margin: "0 auto", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}><div style={{ width: 46, height: 46, borderRadius: 13, background: `linear-gradient(135deg,${C.blue},${C.orange})`, display: "grid", placeItems: "center", fontSize: 21, animation: "float 4s ease-in-out infinite" }}>🤖</div><div><div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 23, color: C.white }}>KenyaBeats <span style={{ color: C.sky }}>AI Analyst</span></div><div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: C.mist, letterSpacing: 2 }}>READS THE LIVE CHART · POWERED BY CLAUDE</div></div></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>{topics.map(t => <button key={t} onClick={() => setTopic(t)} style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12.5, padding: "8px 15px", borderRadius: 10, cursor: "pointer", border: `1px solid ${topic === t ? C.sky : C.line}`, background: topic === t ? C.blue + "2c" : "rgba(255,255,255,.04)", color: topic === t ? C.white : C.mist, transition: "all .2s" }}>{t}</button>)}</div>
        <button onClick={run} disabled={loading} style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, padding: "14px 32px", background: loading ? "rgba(255,255,255,.06)" : `linear-gradient(90deg,${C.orange},${C.amber})`, color: C.white, border: "none", borderRadius: 12, cursor: loading ? "wait" : "pointer", marginBottom: 22 }}>{loading ? "◌  Reading the live chart…" : "✦  Generate AI Brief"}</button>
        {out && <Reveal><div style={{ background: C.glass, backdropFilter: "blur(16px)", borderRadius: 16, padding: 26, border: `1px solid ${C.sky}33`, borderLeft: `3px solid ${C.sky}` }}><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14.5, color: "#E8ECFF", lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{out}</div></div></Reveal>}
      </div>
    </div>
  );
}

/* ════════════════════════════════ ROOT ═══════════════════════════════════ */
export default function App() {
  const [tab, setTab] = useState("Charts");
  const [clips, setClips] = useState([]);
  const [chart, setChart] = useState([]);          // Kenyan + collab songs
  const [djMixes, setDjMixes] = useState([]);      // Kenyan DJ mixes
  const [tribal, setTribal] = useState([]);        // tribal/cultural songs
  const [aiEngine, setAiEngine] = useState("");
  const [scanInfo, setScanInfo] = useState({ scanned: 0, matched: 0 });
  const [chartLoading, setChartLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [events, setEvents] = useState([]); const [challenges, setChallenges] = useState([]);

  // Load persisted backgrounds from Supabase
  const reloadClips = useCallback(async () => {
    const rows = await sbGet("bg_clips", "&active=eq.true&order=created_at.asc");
    setClips(rows.map(r => r.source === "youtube" ? { id: r.id, type: "youtube", videoId: r.youtube_video_id, label: r.label } : { id: r.id, type: "upload", url: `${SB}/storage/v1/object/public/bg-clips/${r.storage_path}`, label: r.label }));
  }, []);

  // Load the SMART live chart: cache for instant paint, then AI-filtered live fetch
  const loadChart = useCallback(async (force = false) => {
    // 1. cache for instant paint (already-classified Kenyan songs)
    if (!force) {
      const cached = await sbGet("trending_now", "&order=rank.asc");
      if (cached.length) { setChart(cached.map(c => ({ ...c, videoId: c.video_id }))); setChartLoading(false); setLive(true); }
    }
    // 2. live smart fetch: trending -> DB match -> Gemini/Groq classify -> Kenyan only
    try {
      const d = await ytSmart(40);
      if (d.songs) {
        setChart(d.songs); setDjMixes(d.mixes || []); setTribal(d.tribal || []);
        setAiEngine(d.aiEngine || "db"); setScanInfo({ scanned: d.scanned, matched: d.matched });
        setLive(true);
        // cache the clean Kenyan song snapshot
        await sbDel("trending_now", "rank=gt.0");
        if (d.songs.length) await sbIns("trending_now", d.songs.slice(0, 20).map(f => ({ rank: f.rank, video_id: f.videoId, title: f.title, artist: f.artist, views: f.views, likes: f.likes, comments: f.comments, thumb: f.thumb, published: f.published })));
      }
    } catch (e) { console.error("smart chart:", e); }
    setChartLoading(false);
  }, []);

  useEffect(() => {
    reloadClips();
    loadChart();
    sbGet("events").then(setEvents);
    sbGet("challenges").then(setChallenges);
  }, [reloadClips, loadChart]);

  const refresh = async () => { setRefreshing(true); await loadChart(true); setRefreshing(false); };

  const sections = {
    Charts: <Charts items={chart} loading={chartLoading} onRefresh={refresh} refreshing={refreshing} aiEngine={aiEngine} scanInfo={scanInfo} />,
    Rising: <Rising items={chart} loading={chartLoading} />,
    Tribal: <Tribal items={tribal} loading={chartLoading} />,
    Genres: <Genres items={chart} loading={chartLoading} />,
    "DJ Mixes": <DJMixes items={djMixes} loading={chartLoading} />,
    Events: <Events rows={events} />,
    Challenges: <Challenges rows={challenges} />,
    Studio: <Studio clips={clips} setClips={setClips} reloadClips={reloadClips} />,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.white }}>
      <style>{`
        ${FONTS}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.ink};overflow-x:hidden}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:${C.line};border-radius:2px}::-webkit-scrollbar-track{background:${C.ink}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.4)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes shimmer{to{background-position:220% center}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmerBg{0%,100%{opacity:.4}50%{opacity:.7}}
        .card{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s,border-color .25s}
        .card:hover{transform:translateY(-4px)}
        .row{transition:transform .2s,border-color .2s}
        .row:hover{transform:translateX(5px);border-color:${C.blue}55!important}
        .podium{transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s}
        .podium:hover{transform:translateY(-6px) scale(1.01)}
        .podium:hover .playbtn{background:${C.orange};border-color:${C.orange};box-shadow:0 0 30px ${C.orange}}
        .cta:hover{filter:brightness(1.12)}
        @media(max-width:600px){.hideSm{display:none!important}}
        input::placeholder{color:${C.mist}66}input:focus{border-color:${C.blue}!important}
      `}</style>

      <Hero tab={tab} setTab={setTab} clips={clips} live={live} ticker={chart.slice(0, 12)} />
      <main style={{ background: C.ink }}><div key={tab} style={{ animation: "fadeUp .45s both" }}>{sections[tab]}</div></main>
      <AIAnalyst items={chart} />
      <footer style={{ background: C.void, borderTop: `1px solid ${C.line}`, padding: "30px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: C.mist, letterSpacing: 2 }}>KENYABEATS · {live ? "✦ LIVE — YOUTUBE KENYA MUSIC CHART (REGION KE)" : "CONNECTING…"} · © 2026</div>
      </footer>
    </div>
  );
}
