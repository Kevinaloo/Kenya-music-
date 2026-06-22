import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================================
   KENYABEATS — Music Intelligence Platform
   Live data: Supabase (charts/artists/genres/events) + YouTube Data API
   AI: Claude analyst
   ============================================================================ */

const SUPABASE_URL = "https://uinxdkpnxwyrecnxjhdm.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbnhka3BueHd5cmVjbnhqaGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTU4MTEsImV4cCI6MjA5NzczMTgxMX0.icGL80eUNTJkZNvX39GpfJbhKmAh9xFqpsoBKSHHDUE";
const YT_FN = `${SUPABASE_URL}/functions/v1/youtube-sync`;
const HEADERS = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function sbGet(table, qs = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${qs}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`${table} ${r.status}`);
  return r.json();
}

async function sbUpload(file) {
  const path = `clip_${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/bg-clips/${path}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": file.type },
    body: file,
  });
  if (!up.ok) throw new Error("upload failed");
  await fetch(`${SUPABASE_URL}/rest/v1/bg_clips`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ label: file.name, storage_path: path, source: "upload" }),
  });
  return `${SUPABASE_URL}/storage/v1/object/public/bg-clips/${path}`;
}

// ── YouTube via Edge Function ────────────────────────────────────────────────
async function ytSearch(q, max = 10) {
  const r = await fetch(`${YT_FN}?action=search&q=${encodeURIComponent(q)}&max=${max}`);
  if (!r.ok) throw new Error("yt search failed");
  const d = await r.json();
  return d.items || [];
}

async function ytStats(ids) {
  if (!ids?.length) return {};
  const r = await fetch(`${YT_FN}?action=stats&ids=${ids.join(",")}`);
  if (!r.ok) throw new Error("yt stats failed");
  const d = await r.json();
  return Object.fromEntries((d.items || []).map(i => [i.videoId, i]));
}

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  ink: "#05060D", night: "#0A0C18",
  panel: "rgba(16,19,36,0.78)", border: "rgba(100,130,255,0.13)",
  blue: "#2E6BFF", sky: "#27C4FF", orange: "#FF5A1F", amber: "#FFB020", gold: "#FFD23F",
  white: "#FFFFFF", mist: "#9AAAC8", green: "#1EE07F", pink: "#FF4D8D",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
`;

// ── Animation helpers ────────────────────────────────────────────────────────
function useOnScreen() {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, vis];
}

function Reveal({ children, delay = 0 }) {
  const [ref, vis] = useOnScreen();
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(22px)", transition: `opacity .65s ease ${delay}ms, transform .65s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

function CountUp({ to, dur = 1400 }) {
  const [val, setVal] = useState(0);
  const [ref, vis] = useOnScreen();
  useEffect(() => {
    if (!vis) return;
    let raf; const t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(to * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vis, to, dur]);
  const fmt = val >= 1e6 ? (val / 1e6).toFixed(1) + "M" : val >= 1e3 ? (val / 1e3).toFixed(0) + "K" : val.toLocaleString();
  return <span ref={ref}>{fmt}</span>;
}

function Bar({ pct, color, delay = 0 }) {
  const [w, setW] = useState(0);
  const [ref, vis] = useOnScreen();
  useEffect(() => { if (vis) { const t = setTimeout(() => setW(pct), delay); return () => clearTimeout(t); } }, [vis, pct, delay]);
  return (
    <div ref={ref} style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: `linear-gradient(90deg,${color},${color}88)`, borderRadius: 3, transition: "width 1.1s cubic-bezier(.2,.8,.2,1)", boxShadow: `0 0 10px ${color}55` }} />
    </div>
  );
}

function Ring({ score, color, size = 56 }) {
  const r = size / 2 - 5, circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  const [ref, vis] = useOnScreen();
  useEffect(() => { if (vis) { const t = setTimeout(() => setDash((score / 100) * circ), 250); return () => clearTimeout(t); } }, [vis, score, circ]);
  return (
    <svg ref={ref} width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={circ - dash} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 4px ${color})` }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform:"rotate(90deg)", transformOrigin:"center", fill:C.white, fontSize:13, fontFamily:"'Space Mono',monospace", fontWeight:700 }}>{score}</text>
    </svg>
  );
}

// ── Equalizer ────────────────────────────────────────────────────────────────
function EQ({ bars = 36, h = 54, color }) {
  const [vals, setVals] = useState(() => Array(bars).fill(0).map(() => Math.random()));
  useEffect(() => { const id = setInterval(() => setVals(Array(bars).fill(0).map(() => Math.random())), 130); return () => clearInterval(id); }, [bars]);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:h }}>
      {vals.map((v, i) => (
        <div key={i} style={{ flex:1, height:`${18+v*82}%`, background:`linear-gradient(180deg,${color||C.sky},${C.orange})`, borderRadius:3, transition:"height .13s ease", opacity:.6+v*.4 }} />
      ))}
    </div>
  );
}

// ── Animated mesh background (fallback when no video) ───────────────────────
function Mesh() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf, t = 0;
    const blobs = [
      {bx:.22,by:.28,r:340,c:C.blue,sx:.00016,sy:.00012},
      {bx:.78,by:.32,r:310,c:C.orange,sx:.00013,sy:.00019},
      {bx:.5,by:.72,r:360,c:C.sky,sx:.00020,sy:.00010},
      {bx:.82,by:.82,r:260,c:C.pink,sx:.00009,sy:.00016},
    ];
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    resize(); window.addEventListener("resize", resize);
    const draw = () => {
      t += 14; ctx.clearRect(0,0,cv.width,cv.height);
      ctx.globalCompositeOperation = "lighter";
      blobs.forEach(b => {
        const x = (b.bx + Math.sin(t*b.sx)*.13)*cv.width;
        const y = (b.by + Math.cos(t*b.sy)*.13)*cv.height;
        const g = ctx.createRadialGradient(x,y,0,x,y,b.r);
        g.addColorStop(0,b.c+"4A"); g.addColorStop(1,b.c+"00");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,b.r,0,7); ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize",resize); };
  }, []);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%" }} />;
}

// ── Video background (uploaded clips + YouTube embeds) ───────────────────────
function VideoBG({ clips }) {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const cur = clips[idx];

  useEffect(() => {
    if (!clips.length) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => { setIdx(i => (i + 1) % clips.length); setFading(false); }, 800);
    }, 9000);
    return () => clearInterval(id);
  }, [clips.length]);

  return (
    <div style={{ position:"absolute",inset:0,overflow:"hidden",zIndex:0 }}>
      {!clips.length && <Mesh />}
      {cur?.type === "upload" && (
        <video key={cur.url} src={cur.url} autoPlay muted loop playsInline
          style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:fading?0:.52,transition:"opacity .8s ease" }} />
      )}
      {cur?.type === "youtube" && (
        <iframe key={cur.videoId} title="bg"
          src={`https://www.youtube.com/embed/${cur.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${cur.videoId}&modestbranding=1&rel=0&showinfo=0`}
          allow="autoplay;encrypted-media" frameBorder="0"
          style={{ position:"absolute",top:"50%",left:"50%",width:"177.78vh",minWidth:"100%",height:"100vh",minHeight:"56.25vw",transform:"translate(-50%,-50%)",opacity:fading?0:.44,transition:"opacity .8s ease",pointerEvents:"none" }} />
      )}
      {/* overlay */}
      <div style={{ position:"absolute",inset:0,background:`linear-gradient(180deg,${C.ink}d0 0%,${C.ink}88 45%,${C.ink}f2 100%)` }} />
      <div style={{ position:"absolute",inset:0,background:`radial-gradient(ellipse 80% 55% at 50% 0%,${C.blue}1f,transparent 68%)` }} />
    </div>
  );
}

// ── Live ticker ──────────────────────────────────────────────────────────────
function LiveTicker({ items }) {
  const [pos, setPos] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let x = 0;
    const id = setInterval(() => { x -= 1; if (Math.abs(x) > el.scrollWidth / 2) x = 0; el.style.transform = `translateX(${x}px)`; }, 20);
    return () => clearInterval(id);
  }, [items]);
  const doubled = [...items, ...items];
  return (
    <div style={{ overflow:"hidden", borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:"9px 0", background:"rgba(0,0,0,.3)", backdropFilter:"blur(8px)" }}>
      <div ref={ref} style={{ display:"flex", gap:0, whiteSpace:"nowrap", willChange:"transform" }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:C.mist, padding:"0 28px" }}>
            <span style={{ color:C.orange, marginRight:8 }}>#{i % items.length + 1}</span>
            <span style={{ color:C.white }}>{item.title}</span>
            <span style={{ color:C.mist }}> — {item.artist}</span>
            {item.live_views && <span style={{ color:C.green, marginLeft:10 }}>▶ {Number(item.live_views).toLocaleString()} views</span>}
            <span style={{ color:C.border, margin:"0 12px" }}>|</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Platform chip ────────────────────────────────────────────────────────────
function Chip({ p }) {
  const map = { spotify:["#1DB954","Spotify"], youtube:["#FF2B2B","YouTube"], tiktok:["#27E0DC","TikTok"] };
  const [col, label] = map[p] || ["#888", p];
  return <span style={{ background:col+"20",color:col,border:`1px solid ${col}44`,borderRadius:5,padding:"3px 8px",fontSize:10,fontFamily:"'Space Mono',monospace",fontWeight:700,letterSpacing:.4 }}>{label}</span>;
}

function Delta({ prev, rank }) {
  const d = (prev||rank) - rank;
  if (d > 0) return <span style={{ color:C.green,fontSize:11,fontFamily:"'Space Mono',monospace",width:28 }}>▲{d}</span>;
  if (d < 0) return <span style={{ color:C.pink,fontSize:11,fontFamily:"'Space Mono',monospace",width:28 }}>▼{-d}</span>;
  return <span style={{ color:C.mist,width:28,textAlign:"center" }}>—</span>;
}

function pill(active) {
  return { fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12.5,padding:"8px 17px",border:`1px solid ${active?C.orange:C.border}`,cursor:"pointer",borderRadius:9,background:active?C.orange:"rgba(255,255,255,0.04)",color:active?C.white:C.mist,transition:"all .2s" };
}

// ── HERO ─────────────────────────────────────────────────────────────────────
function Hero({ tab, setTab, clips, liveStatus, tracks }) {
  const tabs = ["Charts","Artists","Genres","Platforms","Events","Challenges","Mixes","Studio"];
  return (
    <header style={{ position:"relative",minHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden" }}>
      <VideoBG clips={clips} />
      <div style={{ position:"relative",zIndex:2,maxWidth:1240,width:"100%",margin:"0 auto",padding:"0 24px",flex:1,display:"flex",flexDirection:"column" }}>
        {/* Topbar */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 0" }}>
          <div style={{ display:"flex",alignItems:"center",gap:13 }}>
            <div style={{ width:42,height:42,borderRadius:13,background:`linear-gradient(135deg,${C.orange},${C.blue})`,display:"grid",placeItems:"center",boxShadow:`0 8px 24px ${C.blue}55`,animation:"float 4s ease-in-out infinite" }}>
              <span style={{ fontSize:20 }}>🎧</span>
            </div>
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:21,color:C.white,letterSpacing:-.5 }}>
                KENYA<span style={{ background:`linear-gradient(90deg,${C.orange},${C.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>BEATS</span>
              </div>
              <div style={{ fontFamily:"'Space Mono',monospace",fontSize:9,color:C.mist,letterSpacing:3 }}>MUSIC INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:"rgba(255,255,255,.05)",borderRadius:30,border:`1px solid ${C.border}`,backdropFilter:"blur(10px)" }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:liveStatus?C.green:"#666",boxShadow:liveStatus?`0 0 10px ${C.green}`:"none",animation:liveStatus?"pulse 1.6s infinite":"none" }} />
            <span style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:C.white,letterSpacing:1 }}>
              {liveStatus ? "LIVE · YOUTUBE + SUPABASE" : "CONNECTING…"}
            </span>
          </div>
        </div>

        {/* Main headline */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",paddingBottom:32 }}>
          <div style={{ fontFamily:"'Space Mono',monospace",fontSize:11,color:C.gold,letterSpacing:5,marginBottom:22,animation:"fadeUp .9s both" }}>◆ The Pulse of East Africa's Sound ◆</div>
          <h1 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"clamp(48px,9.5vw,120px)",color:C.white,margin:0,lineHeight:.88,letterSpacing:-3,animation:"fadeUp .9s .1s both" }}>
            WHERE KENYA<br />
            <span style={{ background:`linear-gradient(100deg,${C.orange} 0%,${C.amber} 35%,${C.sky} 72%,${C.blue} 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundSize:"200% auto",animation:"shimmer 6s linear infinite" }}>
              HITS DIFFERENT
            </span>
          </h1>
          <p style={{ fontFamily:"'Outfit',sans-serif",color:C.mist,fontSize:"clamp(14px,2vw,18px)",marginTop:24,maxWidth:520,lineHeight:1.65,animation:"fadeUp .9s .25s both" }}>
            Real-time rankings, AI artist intelligence and cross-platform analytics across YouTube, Spotify, TikTok & Boomplay.
          </p>
          <div style={{ width:"min(420px,78vw)",marginTop:36,animation:"fadeUp .9s .4s both" }}>
            <EQ bars={38} h={52} />
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"14px 38px",marginTop:40,animation:"fadeUp .9s .55s both" }}>
            {[["491M","Streams Tracked"],["2,840","Artists"],["847","Charting Tracks"],["34","Live Events"]].map(([v,l]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:C.white,letterSpacing:-1 }}>{v}</div>
                <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:C.mist }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker */}
      {tracks.length > 0 && <LiveTicker items={tracks} />}

      {/* Nav */}
      <nav style={{ position:"sticky",bottom:0,zIndex:5,background:"rgba(5,6,13,.88)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1240,margin:"0 auto",padding:"0 16px",display:"flex",gap:2,overflowX:"auto",scrollbarWidth:"none" }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13.5,padding:"15px 18px",border:"none",background:"transparent",cursor:"pointer",whiteSpace:"nowrap",color:tab===t?C.white:C.mist,position:"relative",transition:"color .2s" }}>
              {t}
              {tab===t && <span style={{ position:"absolute",left:14,right:14,bottom:0,height:3,background:`linear-gradient(90deg,${C.orange},${C.sky})`,borderRadius:3,boxShadow:`0 0 10px ${C.orange}` }} />}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

// ── CHARTS ───────────────────────────────────────────────────────────────────
function Charts({ tracks, ytData }) {
  const [period, setPeriod] = useState("Weekly");
  const filtered = tracks.filter(t => (t.period||"weekly").toLowerCase() === period.toLowerCase());
  const display = filtered.length ? filtered : tracks;

  return (
    <Section>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:16,marginBottom:28 }}>
        <div>
          <EyeLabel>Hot Charts · Live</EyeLabel>
          <H2 sub="Ranked by real stream counts — updated live from YouTube and Supabase.">Kenya Hot 10</H2>
        </div>
        <div style={{ display:"flex",gap:6 }}>
          {["Weekly","Monthly","Yearly"].map(p => <button key={p} onClick={() => setPeriod(p)} style={pill(period===p)}>{p}</button>)}
        </div>
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
        {display.map((t, i) => {
          const yt = ytData[t.youtube_video_id] || null;
          const streams = yt ? Number(yt.views).toLocaleString() : t.spotify_streams || t.youtube_views || "—";
          const isYtLive = !!yt;
          return (
            <Reveal key={t.id||i} delay={i*40}>
              <div className="row" style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 18px",background:C.panel,backdropFilter:"blur(14px)",borderRadius:13,border:`1px solid ${t.is_hot?C.orange+"55":C.border}`,boxShadow:t.is_hot?`0 0 26px ${C.orange}18`:"none",cursor:"pointer" }}>
                <span style={{ width:28,textAlign:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:t.rank<=3?25:17,color:t.rank===1?C.gold:t.rank===2?"#CCD0E0":t.rank===3?"#E09B5A":C.mist }}>{t.rank}</span>
                <Delta prev={t.prev_rank} rank={t.rank} />
                <span style={{ width:18,fontSize:14 }}>{t.is_hot?"🔥":""}</span>

                {/* Thumbnail if YouTube */}
                {yt?.thumb && <img src={yt.thumb} alt="" style={{ width:46,height:34,borderRadius:6,objectFit:"cover",opacity:.9 }} />}

                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14.5,color:C.white,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {yt?.title || t.title}
                  </div>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:C.mist,marginTop:2 }}>
                    {yt?.channel || t.artist}
                    {yt?.likes && <span style={{ color:C.mist,marginLeft:10 }}>♥ {Number(yt.likes).toLocaleString()}</span>}
                  </div>
                </div>

                <span className="hideSm" style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:C.mist,background:"rgba(255,255,255,.05)",padding:"4px 9px",borderRadius:5 }}>{t.genre}</span>
                <Chip p={t.platform} />

                <div style={{ textAlign:"right",minWidth:68 }}>
                  <div style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:13,color:isYtLive?C.green:C.sky }}>
                    {streams}
                  </div>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:9,color:isYtLive?C.green:C.mist,letterSpacing:.5 }}>
                    {isYtLive?"▶ LIVE VIEWS":"streams"}
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

// ── ARTISTS ──────────────────────────────────────────────────────────────────
function Artists({ artists }) {
  const top = artists.filter(a => !a.is_breakthrough);
  const fresh = artists.filter(a => a.is_breakthrough);
  return (
    <Section>
      <EyeLabel>Artist Intelligence · Live</EyeLabel>
      <H2 sub="Power scores computed from streams, chart velocity and social momentum.">The Movers</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:16 }}>
        {top.map((a,i) => (
          <Reveal key={a.id||a.name} delay={i*55}>
            <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:18,padding:22,border:`1px solid ${C.border}`,boxShadow:i===0?`0 0 36px ${a.accent_color}28`:"none" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                <div style={{ width:52,height:52,borderRadius:14,background:`linear-gradient(135deg,${a.accent_color},${a.accent_color}55)`,display:"grid",placeItems:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.white }}>
                  {a.name.split(" ").map(w=>w[0]).join("").slice(0,2)}
                </div>
                <Ring score={a.score} color={a.accent_color} />
              </div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:16,color:C.white }}>{a.name}</div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12.5,color:C.mist,marginBottom:12 }}>{a.genre} · {a.hits} hits</div>
              <span style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:a.accent_color,background:a.accent_color+"1F",padding:"5px 9px",borderRadius:6 }}>{a.status}</span>
            </div>
          </Reveal>
        ))}
      </div>
      {fresh.length > 0 && (
        <div style={{ marginTop:44 }}>
          <EyeLabel>Breakthrough Artists</EyeLabel>
          <H2 sub="Fastest-rising names this cycle.">New Wave</H2>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14 }}>
            {fresh.map((a,i) => (
              <Reveal key={a.id||a.name} delay={i*70}>
                <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:14,padding:18,border:`1px solid ${C.border}`,display:"flex",gap:14,alignItems:"center" }}>
                  <div style={{ minWidth:46,height:46,borderRadius:12,background:`linear-gradient(135deg,${C.orange},${C.blue})`,display:"grid",placeItems:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:C.white }}>
                    {a.name.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14.5,color:C.white }}>{a.name}</div>
                    <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:11.5,color:C.mist,marginBottom:8 }}>{a.genre}</div>
                    <Bar pct={a.score} color={C.orange} delay={i*80} />
                  </div>
                  <div style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:14,color:C.green }}>{a.growth}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── GENRES ───────────────────────────────────────────────────────────────────
function Genres({ genres }) {
  return (
    <Section>
      <EyeLabel>Genre Landscape · Live</EyeLabel>
      <H2 sub="How Kenya's sounds split the market this period.">Sound of the Nation</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16 }}>
        {genres.map((g,i) => (
          <Reveal key={g.id||g.name} delay={i*65}>
            <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:16,padding:22,border:`1px solid ${g.accent_color}44` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14 }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:C.white }}>{g.name}</div>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:C.mist }}>{Number(g.tracks).toLocaleString()} tracks</div>
                </div>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:38,color:g.accent_color,lineHeight:1 }}>{g.share}%</div>
              </div>
              <Bar pct={(g.share/28)*100} color={g.accent_color} delay={i*80} />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── PLATFORMS ────────────────────────────────────────────────────────────────
function Platforms() {
  const P = [
    { platform:"YouTube Music", icon:"▶️", streams:"198M", growth:"+31%", color:"#FF2B2B", share:52 },
    { platform:"Spotify",       icon:"🎵", streams:"142M", growth:"+24%", color:"#1DB954", share:38 },
    { platform:"TikTok",        icon:"🎶", streams:"87M",  growth:"+67%", color:"#27E0DC", share:23 },
    { platform:"Boomplay",      icon:"🎸", streams:"64M",  growth:"+18%", color:"#FF6B00", share:17 },
  ];
  return (
    <Section>
      <EyeLabel>Platform Intelligence</EyeLabel>
      <H2 sub="Cross-platform reach and momentum at a glance.">Where They Listen</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:18 }}>
        {P.map((p,i) => (
          <Reveal key={p.platform} delay={i*70}>
            <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:18,padding:24,border:`1px solid ${p.color}33`,boxShadow:`0 8px 28px ${p.color}12` }}>
              <div style={{ fontSize:32,marginBottom:14 }}>{p.icon}</div>
              <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.white,marginBottom:4 }}>{p.platform}</div>
              <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:36,color:p.color,letterSpacing:-1 }}>{p.streams}</div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:C.mist,marginBottom:16 }}>total streams</div>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10 }}>
                <span style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:14,color:C.green }}>{p.growth}</span>
                <span style={{ fontFamily:"'Space Mono',monospace",fontSize:11,color:C.mist }}>{p.share}% share</span>
              </div>
              <Bar pct={p.share} color={p.color} delay={i*90} />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── EVENTS ───────────────────────────────────────────────────────────────────
function Events({ events }) {
  return (
    <Section>
      <EyeLabel>Shows & Events · Live</EyeLabel>
      <H2 sub="The live calendar — concerts and festivals worth the ticket.">On Stage Soon</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18 }}>
        {events.map((e,i) => (
          <Reveal key={e.id||i} delay={i*70}>
            <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:18,padding:22,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden" }}>
              <div style={{ position:"absolute",top:-30,right:-30,width:120,height:120,background:`radial-gradient(circle,${C.orange}22,transparent 70%)` }} />
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14 }}>
                <span style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:C.orange,background:C.orange+"1F",padding:"5px 10px",borderRadius:6,fontWeight:700 }}>{(e.event_type||"").toUpperCase()}</span>
                <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.sky }}>{e.event_date}</span>
              </div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:17,color:C.white,marginBottom:6 }}>{e.title}</div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12.5,color:C.mist,marginBottom:16 }}>📍 {e.venue}</div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:13,color:C.gold }}>{e.price}</span>
                <button className="cta" style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12.5,padding:"8px 16px",background:`linear-gradient(90deg,${C.orange},${C.amber})`,color:C.white,border:"none",borderRadius:9,cursor:"pointer" }}>
                  Get Tickets →
                </button>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── CHALLENGES ───────────────────────────────────────────────────────────────
function Challenges({ challenges }) {
  return (
    <Section>
      <EyeLabel>Viral Challenges · Live</EyeLabel>
      <H2 sub="The dances and sounds taking over feeds right now.">Trending Now</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16 }}>
        {challenges.map((c,i) => (
          <Reveal key={c.id||i} delay={i*70}>
            <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:16,padding:22,border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10 }}>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.white }}>{c.name}</div>
                <span style={{ fontSize:18 }}>{c.platform==="TikTok"?"🎶":"📸"}</span>
              </div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12.5,color:C.mist,marginBottom:16 }}>by {c.creator} · {c.platform}</div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end" }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:C.white }}>{c.videos}</div>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,color:C.mist }}>videos</div>
                </div>
                <span style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:16,color:C.green }}>{c.trend}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── MIXES ────────────────────────────────────────────────────────────────────
function Mixes({ mixes }) {
  return (
    <Section>
      <EyeLabel>DJ & Club Mixes · Live</EyeLabel>
      <H2 sub="The sets ruling clubs and playlists across the country.">Trending Mixes</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16 }}>
        {mixes.map((m,i) => (
          <Reveal key={m.id||i} delay={i*70}>
            <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:16,padding:22,border:`1px solid ${C.border}` }}>
              <div style={{ width:54,height:54,borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.orange})`,display:"grid",placeItems:"center",fontSize:22,marginBottom:14 }}>🎧</div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:15,color:C.white,marginBottom:4 }}>{m.title}</div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:C.mist,marginBottom:16 }}>by {m.curator} · {m.duration}</div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:C.sky,background:C.sky+"1F",padding:"4px 9px",borderRadius:5 }}>{m.genre}</span>
                <span style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:13,color:C.amber }}>{m.plays} plays</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── STUDIO ───────────────────────────────────────────────────────────────────
function Studio({ clips, setClips, liveYt, setLiveYt }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ytInput, setYtInput] = useState("");
  const [ytSearch, setYtSearch] = useState("");
  const [ytResults, setYtResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  const upload = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setMsg("Uploading to Supabase Storage…");
    try {
      const url = await sbUpload(f);
      setClips(c => [...c, { type:"upload", url, label:f.name }]);
      setMsg("✓ Clip added to background rotation.");
    } catch (err) { setMsg("Upload failed: " + err.message); }
    setBusy(false);
  };

  const addYT = () => {
    const id = extractYTId(ytInput);
    if (!id) { setMsg("Couldn't parse that YouTube link."); return; }
    setClips(c => [...c, { type:"youtube", videoId:id, label:ytInput }]);
    setYtInput(""); setMsg("✓ YouTube video added to background rotation.");
  };

  const searchYT = async () => {
    if (!ytSearch.trim()) return;
    setSearching(true); setYtResults([]);
    try {
      const items = await ytSearch(ytSearch + " Kenya", 6);
      setYtResults(items);
    } catch { setMsg("YouTube search failed — check Edge Function secret."); }
    setSearching(false);
  };

  const addFromSearch = item => {
    if (!item.videoId) return;
    setClips(c => [...c, { type:"youtube", videoId:item.videoId, label:item.title||item.videoId }]);
    setMsg(`✓ "${item.title}" added to background.`);
  };

  return (
    <Section>
      <EyeLabel>Studio</EyeLabel>
      <H2 sub="Manage the homepage video background — upload clips or add YouTube music videos.">Background Studio</H2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:18,marginBottom:28 }}>
        {/* Upload */}
        <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:18,padding:26,border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:30,marginBottom:12 }}>📤</div>
          <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.white,marginBottom:6 }}>Upload a clip</div>
          <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,color:C.mist,marginBottom:18,lineHeight:1.5 }}>MP4 or WebM — stored in Supabase Storage, looped behind the hero.</p>
          <input ref={fileRef} type="file" accept="video/mp4,video/webm" onChange={upload} style={{ display:"none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14,padding:"12px 22px",background:`linear-gradient(90deg,${C.orange},${C.amber})`,color:C.white,border:"none",borderRadius:11,cursor:"pointer",width:"100%" }}>
            {busy ? "Uploading…" : "Choose video"}
          </button>
        </div>

        {/* YouTube paste */}
        <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:18,padding:26,border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:30,marginBottom:12 }}>▶️</div>
          <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.white,marginBottom:6 }}>Paste a YouTube link</div>
          <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,color:C.mist,marginBottom:18,lineHeight:1.5 }}>Any YouTube music video — plays muted and looped in the background.</p>
          <input value={ytInput} onChange={e => setYtInput(e.target.value)} placeholder="youtube.com/watch?v=…"
            style={{ width:"100%",padding:"11px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:"rgba(255,255,255,.04)",color:C.white,fontFamily:"'Outfit',sans-serif",fontSize:14,marginBottom:12,outline:"none" }} />
          <button onClick={addYT} style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14,padding:"12px 22px",background:`linear-gradient(90deg,${C.blue},${C.sky})`,color:C.white,border:"none",borderRadius:11,cursor:"pointer",width:"100%" }}>Add to background</button>
        </div>

        {/* YouTube search */}
        <div className="card" style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:18,padding:26,border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:30,marginBottom:12 }}>🔍</div>
          <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.white,marginBottom:6 }}>Search YouTube</div>
          <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,color:C.mist,marginBottom:18,lineHeight:1.5 }}>Search Kenyan music directly and pick a video to add to the background.</p>
          <input value={ytSearch} onChange={e => setYtSearch(e.target.value)} onKeyDown={e => e.key==="Enter" && searchYT()} placeholder="e.g. Sauti Sol, Khaligraph…"
            style={{ width:"100%",padding:"11px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:"rgba(255,255,255,.04)",color:C.white,fontFamily:"'Outfit',sans-serif",fontSize:14,marginBottom:12,outline:"none" }} />
          <button onClick={searchYT} disabled={searching} style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14,padding:"12px 22px",background:`linear-gradient(90deg,${C.pink},${C.orange})`,color:C.white,border:"none",borderRadius:11,cursor:"pointer",width:"100%" }}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {/* YouTube search results */}
      {ytResults.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14,color:C.white,marginBottom:12 }}>Search results — click to add to background</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12 }}>
            {ytResults.map((r,i) => (
              <div key={i} onClick={() => addFromSearch(r)} style={{ background:C.panel,borderRadius:12,overflow:"hidden",cursor:"pointer",border:`1px solid ${C.border}`,transition:"transform .2s" }}
                onMouseEnter={e => e.currentTarget.style.transform="translateY(-3px)"}
                onMouseLeave={e => e.currentTarget.style.transform="none"}>
                {r.thumb && <img src={r.thumb} alt="" style={{ width:"100%",height:110,objectFit:"cover" }} />}
                <div style={{ padding:"10px 12px" }}>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,color:C.white,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.title}</div>
                  <div style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:C.green,marginTop:4 }}>{r.views ? Number(r.views).toLocaleString()+" views" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && <div style={{ marginBottom:18,fontFamily:"'Space Mono',monospace",fontSize:12.5,color:msg.startsWith("✓")?C.green:C.amber }}>{msg}</div>}

      {/* Current rotation */}
      {clips.length > 0 && (
        <div>
          <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14,color:C.white,marginBottom:12 }}>In rotation ({clips.length})</div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:10 }}>
            {clips.map((c,i) => (
              <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(255,255,255,.05)",borderRadius:10,border:`1px solid ${C.border}` }}>
                <span>{c.type==="youtube"?"▶️":"🎬"}</span>
                <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:C.mist,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.label}</span>
                <button onClick={() => setClips(cl => cl.filter((_,j) => j!==i))} style={{ background:"none",border:"none",color:C.pink,cursor:"pointer",fontSize:15,lineHeight:1 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── AI ANALYST ───────────────────────────────────────────────────────────────
function AIAnalyst({ tracks }) {
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState("");
  const [topic, setTopic] = useState("this week's biggest movers and what's driving them");
  const topics = [
    "this week's biggest movers and what's driving them",
    "Gengetone vs Afro-Pop market battle right now",
    "Kenya's breakout artists — who to watch next",
    "how YouTube and TikTok are reshaping Kenyan music",
  ];

  const run = async () => {
    setLoading(true); setOut("");
    const top5 = tracks.slice(0,5).map(t => `${t.rank}. "${t.title}" — ${t.artist} (${t.genre}, ${t.live_views ? Number(t.live_views).toLocaleString()+" YT views" : t.spotify_streams || ""})`).join("; ");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1000,
          system:"You are KenyaBeats AI, a sharp music-industry analyst specialising in Kenyan and East African music (Gengetone, Afro-Pop, Bongo Flava, Afro-Soul, Kenyan Hip-Hop/Drill). Write 3 punchy, confident analyst paragraphs using real artist names and specific observations. Under 230 words. No preamble or sign-off.",
          messages:[{ role:"user", content:`Live Hot 5 right now: ${top5}. Analyse: ${topic}. Include trend insight, cross-platform read, and one bold prediction.` }],
        }),
      });
      const d = await r.json();
      setOut(d.content?.find(b => b.type==="text")?.text || "No response.");
    } catch { setOut("Analysis unavailable — check connection."); }
    setLoading(false);
  };

  return (
    <div style={{ position:"relative",background:`linear-gradient(160deg,${C.night},#0c0f24)`,borderTop:`1px solid ${C.border}`,padding:"60px 24px",overflow:"hidden" }}>
      <div style={{ position:"absolute",top:-60,right:"8%",width:340,height:340,background:`radial-gradient(circle,${C.blue}1e,transparent 70%)` }} />
      <div style={{ maxWidth:860,margin:"0 auto",position:"relative" }}>
        <div style={{ display:"flex",alignItems:"center",gap:13,marginBottom:20 }}>
          <div style={{ width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${C.blue},${C.orange})`,display:"grid",placeItems:"center",fontSize:20,animation:"float 4s ease-in-out infinite" }}>🤖</div>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:C.white }}>KenyaBeats <span style={{ color:C.sky }}>AI Analyst</span></div>
            <div style={{ fontFamily:"'Space Mono',monospace",fontSize:9,color:C.mist,letterSpacing:2 }}>READS LIVE CHART DATA · POWERED BY CLAUDE</div>
          </div>
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginBottom:18 }}>
          {topics.map(t => (
            <button key={t} onClick={() => setTopic(t)} style={{ fontFamily:"'Outfit',sans-serif",fontSize:12.5,padding:"8px 15px",borderRadius:10,cursor:"pointer",border:`1px solid ${topic===t?C.sky:C.border}`,background:topic===t?C.blue+"33":"rgba(255,255,255,.04)",color:topic===t?C.white:C.mist,transition:"all .2s" }}>{t}</button>
          ))}
        </div>
        <button onClick={run} disabled={loading} style={{ fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:15,padding:"13px 30px",background:loading?"rgba(255,255,255,.06)":`linear-gradient(90deg,${C.orange},${C.amber})`,color:C.white,border:"none",borderRadius:12,cursor:loading?"wait":"pointer",marginBottom:22,transition:"all .2s" }}>
          {loading ? "◌  Analysing the live charts…" : "✦  Generate AI Brief"}
        </button>
        {out && (
          <Reveal>
            <div style={{ background:C.panel,backdropFilter:"blur(14px)",borderRadius:16,padding:26,border:`1px solid ${C.sky}33`,borderLeft:`3px solid ${C.sky}` }}>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:14.5,color:"#E8ECFF",lineHeight:1.82,whiteSpace:"pre-wrap" }}>{out}</div>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

// ── Shared layout atoms ───────────────────────────────────────────────────────
function Section({ children }) {
  return <div style={{ maxWidth:1240,margin:"0 auto",padding:"64px 24px" }}>{children}</div>;
}
function EyeLabel({ children }) {
  return (
    <div style={{ display:"inline-flex",alignItems:"center",gap:9,marginBottom:14 }}>
      <span style={{ width:22,height:2,background:`linear-gradient(90deg,${C.orange},${C.sky})`,borderRadius:2 }} />
      <span style={{ fontFamily:"'Space Mono',monospace",fontSize:11,letterSpacing:4,color:C.orange,textTransform:"uppercase",fontWeight:700 }}>{children}</span>
    </div>
  );
}
function H2({ children, sub }) {
  return (
    <div style={{ marginBottom:30 }}>
      <h2 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"clamp(26px,4vw,42px)",color:C.white,margin:0,letterSpacing:-1,lineHeight:1.02 }}>{children}</h2>
      {sub && <p style={{ fontFamily:"'Outfit',sans-serif",color:C.mist,fontSize:14.5,marginTop:10,maxWidth:560,lineHeight:1.6 }}>{sub}</p>}
    </div>
  );
}

function extractYTId(s) {
  if (!s) return null;
  const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s.trim())) return s.trim();
  return null;
}

// ── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Charts");
  const [clips, setClips] = useState([]);
  const [tracks, setTracks]       = useState([]);
  const [artists, setArtists]     = useState([]);
  const [genres, setGenres]       = useState([]);
  const [events, setEvents]       = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [mixes, setMixes]         = useState([]);
  const [ytData, setYtData]       = useState({});
  const [liveStatus, setLiveStatus] = useState(false);
  const [liveYt, setLiveYt]       = useState(false);

  // 1. Load all tables from Supabase
  useEffect(() => {
    Promise.all([
      sbGet("tracks",     "&order=rank.asc"),
      sbGet("artists",    "&order=score.desc"),
      sbGet("genres",     "&order=share.desc"),
      sbGet("events"),
      sbGet("challenges"),
      sbGet("mixes"),
    ]).then(([t, a, g, e, c, m]) => {
      setTracks(t);
      setArtists(a);
      setGenres(g);
      setEvents(e);
      setChallenges(c);
      setMixes(m);
      setLiveStatus(true);
    }).catch(err => console.error("Supabase load error:", err));
  }, []);

  // 2. Once tracks load, fetch live YouTube view counts for any that have a video_id,
  //    AND searches YouTube RIGHT NOW for what is actually trending in Kenya (no hardcoded year)
  useEffect(() => {
    if (!tracks.length) return;

    (async () => {
      try {
        // A — tracks that already have youtube_video_id in Supabase
        const pinned = tracks.filter(t => t.youtube_video_id).map(t => t.youtube_video_id);

        // B — search YouTube live for top Kenyan tracks and merge by position
        // Run 3 parallel searches for what is actually trending RIGHT NOW in Kenya
        const [trending, gengetone, afropop] = await Promise.all([
          ytSearch("Kenya music trending", 5),
          ytSearch("Gengetone trending", 3),
          ytSearch("Kenya Afropop new", 3),
        ]);
        const searched = [...trending, ...gengetone, ...afropop].filter((v,i,a) => a.findIndex(x=>x.videoId===v.videoId)===i).slice(0,10);

        // Merge: update tracks with live YouTube data
        const merged = { ...ytData };
        searched.forEach(item => { if (item.videoId) merged[item.videoId] = item; });

        // If pinned IDs exist, fetch their stats too
        if (pinned.length) {
          const pinnedStats = await ytStats(pinned);
          Object.assign(merged, pinnedStats);
        }

        setYtData(merged);
        setLiveYt(true);

        // 3. Enrich tracks in Supabase: assign youtube_video_id if missing
        //    (zip by rank position so rank 1 gets the top YouTube result)
        const updates = tracks
          .filter(t => !t.youtube_video_id)
          .map((t, i) => searched[i] ? { id: t.id, youtube_video_id: searched[i].videoId, youtube_views: Number(searched[i].views||0) } : null)
          .filter(Boolean);

        // Fire-and-forget PATCH updates to Supabase
        updates.forEach(u => {
          fetch(`${SUPABASE_URL}/rest/v1/tracks?id=eq.${u.id}`, {
            method: "PATCH",
            headers: { ...HEADERS, "Content-Type":"application/json", Prefer:"return=minimal" },
            body: JSON.stringify({ youtube_video_id: u.youtube_video_id, youtube_views: u.youtube_views, last_synced: new Date().toISOString() }),
          }).catch(() => {});
        });

        // Refresh tracks from Supabase to get updated video IDs
        const refreshed = await sbGet("tracks", "&order=rank.asc");
        setTracks(refreshed);
      } catch (err) {
        console.error("YouTube live sync error:", err);
      }
    })();
  }, [tracks.length]);

  // 4. Annotate tracks with live YouTube view data for display
  const enrichedTracks = tracks.map((t, i) => {
    const yt = ytData[t.youtube_video_id];
    return yt ? { ...t, live_views: yt.views, live_thumb: yt.thumb, live_channel: yt.channel, live_title: yt.title } : t;
  });

  const sections = {
    Charts:     <Charts tracks={enrichedTracks} ytData={ytData} />,
    Artists:    <Artists artists={artists} />,
    Genres:     <Genres genres={genres} />,
    Platforms:  <Platforms />,
    Events:     <Events events={events} />,
    Challenges: <Challenges challenges={challenges} />,
    Mixes:      <Mixes mixes={mixes} />,
    Studio:     <Studio clips={clips} setClips={setClips} liveYt={liveYt} setLiveYt={setLiveYt} />,
  };

  return (
    <div style={{ minHeight:"100vh", background:C.ink, color:C.white }}>
      <style>{`
        ${FONTS}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.ink};overflow-x:hidden}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        ::-webkit-scrollbar-track{background:${C.ink}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.35)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
        @keyframes shimmer{to{background-position:200% center}}
        .card{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}
        .card:hover{transform:translateY(-4px)}
        .row{transition:transform .2s}
        .row:hover{transform:translateX(5px)}
        .cta:hover{filter:brightness(1.1)}
        @media(max-width:560px){.hideSm{display:none!important}}
        input::placeholder{color:${C.mist}77}
        input:focus{border-color:${C.blue}!important}
      `}</style>

      <Hero tab={tab} setTab={setTab} clips={clips} liveStatus={liveStatus} tracks={enrichedTracks} />

      <main style={{ background:C.ink }}>
        <div key={tab} style={{ animation:"fadeUp .45s both" }}>
          {sections[tab]}
        </div>
      </main>

      <AIAnalyst tracks={enrichedTracks} />

      <footer style={{ background:C.ink,borderTop:`1px solid ${C.border}`,padding:"26px 24px",textAlign:"center" }}>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:10,color:C.mist,letterSpacing:2 }}>
          KENYABEATS MUSIC INTELLIGENCE · {liveStatus && liveYt ? "✦ LIVE — SUPABASE + YOUTUBE DATA API" : liveStatus ? "✦ SUPABASE LIVE · YOUTUBE SYNCING…" : "CONNECTING…"} · © 2025
        </div>
      </footer>
    </div>
  );
}
