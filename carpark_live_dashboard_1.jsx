import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  AreaChart, Area
} from "recharts";
import Papa from "papaparse";

// ━━━ Google Sheets Published CSV URL ━━━
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSpcNe_oAPGLGZpUO-v3d8dPzWl1qOG26ItP2MmvadOnGQsAWfyrtKBgmttTybcR-hhU4d299zKP9En/pub?gid=0&single=true&output=csv";

const REFRESH_MS = 5 * 60 * 1000;

// ━━━ Theme ━━━ (Light Theme with WCAG 2.1 AA/AAA compliance)
const C = {
  bg: "#f8fafc", bg2: "#f1f5f9",
  card: "#ffffff", cardHi: "#f8fafc",
  border: "#e2e8f0", borderHi: "#cbd5e1",
  tx: "#0f172a", txm: "#475569", txd: "#94a3b8",
  orange: "#ea580c", orangeD: "#c2410c",
  blue: "#2563eb", blueD: "#1e40af",
  purple: "#7c3aed", purpleD: "#6d28d9",
  green: "#16a34a", greenD: "#15803d",
  yellow: "#ca8a04", red: "#dc2626",
  cyan: "#0891b2", pink: "#db2777",
};
const locClr = l => l === "คอนโด" ? C.orange : l === "ที่ทำงาน" ? C.blue : l === "โรงแรม" ? C.purple : l === "อื่นๆ" ? C.pink : C.txm;
const locIco = l => l === "คอนโด" ? "🏠" : l === "ที่ทำงาน" ? "🏢" : l === "โรงแรม" ? "🏨" : "📍";

// ━━━ Noise filter ━━━
const isJunk = (note = "") => {
  const n = note.toLowerCase();
  return n.includes("welcome to gboard") || n.includes("touch and hold") || n.includes("unpinned clips");
};

// ━━━ Parse rows ━━━
function parseRows(csvData) {
  return csvData
    .map(row => ({
      timestamp: (row.Date || "").trim(),
      mapUrl: (row.parkingMap || "").trim(),
      floor: (row.parkingFloor || "").trim(),
      note: (row.note || "").trim(),
      location: (row.parkingLocation || "").trim(),
      exitDate: (row["exitDateReminder "] || row.exitDateReminder || "").trim(),
      status: (Object.values(row).pop() || "").trim(),
    }))
    .filter(r => {
      if (!r.location || r.location === "") return false;
      if (isJunk(r.note)) return false;
      if (r.note.toLowerCase().includes("test") || r.note.includes("ทดสอบ") || r.note.includes("ทดลอง")) return false;
      if (!r.timestamp || r.timestamp === "") return false;
      return true;
    });
}

// ━━━ Tooltip ━━━
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 12, padding: "12px 16px", fontSize: 13, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <p style={{ color: C.txm, marginBottom: 4, fontSize: 11 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || C.tx, fontWeight: 700, margin: "2px 0" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

// ━━━ KPI Card ━━━
function KpiCard({ icon, label, value, suffix, color, delay }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: "18px 20px 16px",
      border: `1px solid ${C.border}`, position: "relative", overflow: "hidden",
      transition: "all .25s cubic-bezier(.4,0,.2,1)", cursor: "default",
      animation: `fadeUp .5s ${delay}ms ease both`,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + "55"; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 30px ${color}18`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}00)` }} />
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 11, color: C.txm, fontWeight: 500, marginBottom: 3, letterSpacing: .3 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
        {value}
        {suffix && <span style={{ fontSize: 13, fontWeight: 500, color: C.txm, marginLeft: 5 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ━━━ Chart Card ━━━
function ChartCard({ title, subtitle, children, delay = 0 }) {
  return (
    <div className="chart-card" style={{
      background: C.card, borderRadius: 16, padding: 24,
      border: `1px solid ${C.border}`,
      animation: `fadeUp .5s ${delay}ms ease both`,
    }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: C.tx }}>{title}</h3>
      {subtitle && <p style={{ margin: "0 0 14px", fontSize: 11, color: C.txm }}>{subtitle}</p>}
      {children}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━ MAIN DASHBOARD ━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [month, setMonth] = useState("all");
  const [loc, setLoc] = useState("all");

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(SHEET_CSV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      setData(parseRows(parsed.data));
      setLastRefresh(new Date());
      setCountdown(REFRESH_MS / 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, REFRESH_MS); return () => clearInterval(iv); }, [fetchData]);
  useEffect(() => { const iv = setInterval(() => setCountdown(p => p <= 1 ? REFRESH_MS / 1000 : p - 1), 1000); return () => clearInterval(iv); }, []);

  // ── Filtered ──
  const filtered = useMemo(() => {
    let d = [...data];
    if (month !== "all") d = d.filter(r => r.exitDate.startsWith(month));
    if (loc !== "all") d = d.filter(r => r.location === loc);
    return d;
  }, [data, month, loc]);

  const months = useMemo(() => {
    const s = new Set(data.map(d => d.exitDate.slice(0, 7)).filter(Boolean));
    return ["all", ...Array.from(s).sort()];
  }, [data]);

  const locations = useMemo(() => {
    const s = new Set(data.map(d => d.location).filter(Boolean));
    return ["all", ...Array.from(s).sort()];
  }, [data]);

  // ── Stats ──
  const totalTrips = filtered.length;
  const condoTrips = filtered.filter(d => d.location === "คอนโด").length;
  const workTrips = filtered.filter(d => d.location === "ที่ทำงาน").length;

  // Location pie
  const locDist = useMemo(() => {
    const c = {};
    filtered.forEach(d => c[d.location] = (c[d.location] || 0) + 1);
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Floor bar (condo only)
  const floorDist = useMemo(() => {
    const c = {};
    data.filter(d => d.location === "คอนโด" && d.floor && d.floor !== "-")
      .forEach(d => c[d.floor] = (c[d.floor] || 0) + 1);
    return Object.entries(c).map(([floor, count]) => ({ floor, count })).sort((a, b) => b.count - a.count);
  }, [data]);
  const topFloor = floorDist[0]?.floor || "-";

  // Time of day (from timestamp - when parked)
  const timeDist = useMemo(() => {
    let m = 0, a = 0, e = 0;
    filtered.forEach(d => {
      const dt = new Date(d.timestamp);
      const h = dt.getHours();
      if (h >= 5 && h < 12) m++;
      else if (h >= 12 && h < 18) a++;
      else e++;
    });
    return [
      { name: "เช้า (5-12)", value: m, fill: C.yellow },
      { name: "บ่าย (12-18)", value: a, fill: C.orange },
      { name: "เย็น-ดึก", value: e, fill: C.purple },
    ];
  }, [filtered]);

  // Day of week
  const dayDist = useMemo(() => {
    const names = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    const c = Array(7).fill(0);
    filtered.forEach(d => { const day = new Date(d.exitDate).getDay(); if (!isNaN(day)) c[day]++; });
    return names.map((n, i) => ({ name: n, count: c[i] }));
  }, [filtered]);

  // Avg arrival time per location (from timestamp)
  const avgByLoc = useMemo(() => {
    const g = {};
    data.forEach(d => {
      if (!d.location || !d.timestamp) return;
      const dt = new Date(d.timestamp);
      const h = dt.getHours();
      const m = dt.getMinutes();
      if (isNaN(h)) return;
      if (!g[d.location]) g[d.location] = [];
      g[d.location].push(h * 60 + m);
    });
    return Object.entries(g).map(([loc, times]) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return { location: loc, display: `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(Math.round(avg % 60)).padStart(2, "0")}`, avg };
    }).sort((a, b) => a.avg - b.avg);
  }, [data]);

  // Arrival time trend (all locations)
  const arrivalTrend = useMemo(() => {
    return data.map(d => {
      const dt = new Date(d.timestamp);
      const h = dt.getHours();
      const m = dt.getMinutes();
      return {
        date: d.timestamp?.slice(5, 10) || "",
        time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        min: h * 60 + m,
        location: d.location
      };
    }).filter(d => d.date && d.min >= 0).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Daily count
  const daily = useMemo(() => {
    const c = {};
    filtered.forEach(d => c[d.exitDate] = (c[d.exitDate] || 0) + 1);
    return Object.entries(c).map(([date, count]) => ({ date: date.slice(5), count })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // Recent
  const recent = useMemo(() => [...filtered].sort((a, b) => b.exitDate.localeCompare(a.exitDate) || b.timestamp.localeCompare(a.timestamp)).slice(0, 12), [filtered]);

  // Removed: spotFreq (not needed)

  const fmtCD = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const sel = {
    background: C.card, color: C.tx, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "10px 14px", fontSize: 13,
    fontFamily: "inherit", cursor: "pointer", outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", color: C.tx,
      fontFamily: "'IBM Plex Sans Thai', 'SF Pro Display', -apple-system, sans-serif",
      background: `linear-gradient(180deg, #e0f2fe 0%, ${C.bg} 100%)`,
      paddingBottom: 60,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse2 { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-thumb { background:${C.borderHi}; border-radius:3px; }
        ::-webkit-scrollbar-track { background:transparent; }

        /* Responsive Grid Classes */
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 768px) {
          .grid-2col { grid-template-columns: 1fr; }
        }

        /* Mobile Adjustments */
        @media (max-width: 640px) {
          .mobile-text-sm { font-size: 12px !important; }
          .mobile-p-sm { padding: 16px !important; }

          /* Header responsive */
          h1 { font-size: 22px !important; }
          .header-desc { font-size: 11px !important; }

          /* Improve contrast on small screens */
          body { -webkit-font-smoothing: antialiased; }

          /* Card padding */
          .chart-card { padding: 18px !important; }
        }

        /* Tablet Breakpoint */
        @media (max-width: 1024px) and (min-width: 769px) {
          /* Charts remain 2-column on tablets */
        }
      `}</style>

      {/* ━━━ Header ━━━ */}
      <div style={{
        background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
        padding: "28px 24px 24px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -50, right: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
        <div style={{ position: "absolute", bottom: -70, left: 30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,.03)" }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: .7, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>
              🚗 carpark tracker
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>วันนี้จอดรถที่ไหน?</h1>
            <p className="header-desc" style={{ fontSize: 12, opacity: .7, margin: "4px 0 0" }}>
              Real-time Dashboard — Auto refresh ทุก 5 นาที จาก Google Sheets
            </p>
          </div>
          <div style={{
            background: "rgba(0,0,0,.25)", borderRadius: 12, padding: "12px 16px",
            fontSize: 12, backdropFilter: "blur(12px)", minWidth: 200,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: error ? C.red : C.green,
                boxShadow: `0 0 10px ${error ? C.red : C.green}`,
                animation: "pulse2 2s infinite",
              }} />
              <span style={{ fontWeight: 700 }}>{loading ? "Loading..." : error ? "Error" : "Live"}</span>
              <span style={{ color: "rgba(255,255,255,.5)", marginLeft: "auto" }}>{data.length} rows</span>
            </div>
            {lastRefresh && <div style={{ opacity: .6, fontSize: 11 }}>Updated: {lastRefresh.toLocaleTimeString("th-TH")}</div>}
            <div style={{ opacity: .6, fontSize: 11, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>
              Next refresh: {fmtCD(countdown)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>

        {/* ━━━ Filters ━━━ */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={sel}>
            <option value="all">📅 ทุกเดือน</option>
            {months.filter(m => m !== "all").map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={loc} onChange={e => setLoc(e.target.value)} style={sel}>
            <option value="all">📍 ทุกสถานที่</option>
            {locations.filter(l => l !== "all").map(l => <option key={l} value={l}>{locIco(l)} {l}</option>)}
          </select>
          <button onClick={fetchData} disabled={loading} style={{
            ...sel, background: loading ? C.border : "linear-gradient(135deg, #2563eb, #1e40af)",
            color: "#fff", fontWeight: 700, border: "none", transition: "all .2s",
            opacity: loading ? .6 : 1,
          }}>
            {loading ? "⏳ Loading..." : "🔄 Refresh Now"}
          </button>
        </div>

        {/* ━━━ KPIs ━━━ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 14, marginTop: 16 }}>
          <KpiCard icon="🚗" label="เที่ยวทั้งหมด" value={totalTrips} suffix="ครั้ง" color={C.orange} delay={100} />
          <KpiCard icon="🏠" label="คอนโด" value={condoTrips} suffix="ครั้ง" color={C.orange} delay={160} />
          <KpiCard icon="🏢" label="ที่ทำงาน" value={workTrips} suffix="ครั้ง" color={C.blue} delay={220} />
          <KpiCard icon="🅿️" label="ชั้นบ่อยสุด (คอนโด)" value={`ชั้น ${topFloor}`} suffix="" color={C.green} delay={280} />
          <KpiCard icon="📊" label="บันทึกทั้งหมด" value={data.length} suffix="ครั้ง" color={C.purple} delay={340} />
        </div>

        {/* ━━━ Row 1 ━━━ */}
        <div className="grid-2col" style={{ marginTop: 18 }}>
          <ChartCard title="📍 สัดส่วนสถานที่จอด" subtitle="จำนวนครั้งแยกตามสถานที่" delay={400}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={locDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={52} strokeWidth={3} stroke={C.bg}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} style={{ fontSize: 11 }}>
                  {locDist.map((e, i) => <Cell key={i} fill={locClr(e.name)} />)}
                </Pie>
                <Tooltip content={<Tip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="🅿️ ชั้นจอดรถที่คอนโด" subtitle={`ชั้นที่จอดบ่อยสุด: ${topFloor}`} delay={460}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={floorDist} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="floor" stroke={C.txm} fontSize={12} />
                <YAxis stroke={C.txm} fontSize={12} allowDecimals={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="count" name="จำนวนครั้ง" radius={[8, 8, 0, 0]}>
                  {floorDist.map((_, i) => <Cell key={i} fill={i === 0 ? C.orange : "#2a3050"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ━━━ Row 2 ━━━ */}
        <div className="grid-2col" style={{ marginTop: 16 }}>
          <ChartCard title="🕐 ช่วงเวลาที่จอด" subtitle="เช้า / บ่าย / เย็น-ดึก" delay={520}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={timeDist} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" stroke={C.txm} fontSize={11} />
                <YAxis stroke={C.txm} fontSize={12} allowDecimals={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="value" name="ครั้ง" radius={[8, 8, 0, 0]}>
                  {timeDist.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="📅 วันในสัปดาห์" subtitle="วันไหนบันทึกบ่อยสุด" delay={580}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dayDist} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" stroke={C.txm} fontSize={12} />
                <YAxis stroke={C.txm} fontSize={12} allowDecimals={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="count" name="ครั้ง" fill={C.purple} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ━━━ Arrival Time Trend ━━━ */}
        <ChartCard
          title="⏰ เวลาที่บันทึก — Trend"
          subtitle="เวลาที่ถึงสถานที่และบันทึกที่จอดรถ"
          delay={640}
        >
          <div style={{ marginTop: -8 }}>
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={arrivalTrend}>
                <defs>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.blue} stopOpacity={.35} />
                    <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" stroke={C.txm} fontSize={11} />
                <YAxis stroke={C.txm} fontSize={11} domain={["dataMin - 30", "dataMax + 30"]}
                  tickFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 12, padding: "12px 16px", boxShadow: "0 8px 24px rgba(0,0,0,.1)" }}>
                      <div style={{ color: C.txm, fontSize: 11 }}>{d.date} • {d.location}</div>
                      <div style={{ color: C.blue, fontWeight: 800, fontSize: 22, fontFamily: "'JetBrains Mono'" }}>{d.time}</div>
                    </div>
                  );
                }} />
                <Area type="monotone" dataKey="min" stroke={C.blue} strokeWidth={3} fill="url(#gB)"
                  dot={{ r: 5, fill: C.blue, stroke: C.bg, strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: C.blue, stroke: C.bg, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ━━━ Avg by Location ━━━ */}
        <div style={{
          background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.border}`, marginTop: 16,
          animation: "fadeUp .5s 700ms ease both",
        }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: C.tx }}>📊 เวลาที่บันทึกเฉลี่ย แยกตามสถานที่</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {avgByLoc.map((item, i) => (
              <div key={i} style={{
                background: `${locClr(item.location)}0a`, borderRadius: 14, padding: "18px 20px",
                border: `1px solid ${locClr(item.location)}25`, transition: "border-color .2s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = locClr(item.location) + "55"}
                onMouseLeave={e => e.currentTarget.style.borderColor = locClr(item.location) + "25"}
              >
                <div style={{ fontSize: 13, color: C.txm, marginBottom: 6 }}>{locIco(item.location)} {item.location}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: locClr(item.location), fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.display}
                </div>
                <div style={{ fontSize: 11, color: C.txd }}>เฉลี่ย (น.)</div>
              </div>
            ))}
          </div>
        </div>

        {/* ━━━ Spot Frequency section removed ━━━ */}

        {/* ━━━ Daily Timeline ━━━ */}
        <ChartCard title="📈 จำนวนบันทึกรายวัน" subtitle="Timeline การบันทึกข้อมูล" delay={820}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" stroke={C.txm} fontSize={10} angle={-45} textAnchor="end" height={56} />
              <YAxis stroke={C.txm} fontSize={12} allowDecimals={false} />
              <Tooltip content={<Tip />} />
              <Line type="monotone" dataKey="count" name="บันทึก" stroke={C.green} strokeWidth={2.5}
                dot={{ r: 4, fill: C.green, stroke: C.bg, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ━━━ Recent Table ━━━ */}
        <div style={{
          background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.border}`, marginTop: 16,
          animation: "fadeUp .5s 880ms ease both",
        }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>🕑 รายการล่าสุด</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["วันที่", "เวลาเตือน", "สถานที่", "ชั้น", "หมายเหตุ", "สถานะ"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.txm, fontWeight: 600, fontSize: 11, borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} style={{ transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.cardHi}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono'", fontSize: 12, borderBottom: `1px solid ${C.border}15` }}>{r.exitDate}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono'", fontWeight: 700, borderBottom: `1px solid ${C.border}15` }}>{r.time}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}15` }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: `${locClr(r.location)}15`, color: locClr(r.location),
                        border: `1px solid ${locClr(r.location)}35`,
                      }}>
                        {locIco(r.location)} {r.location}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono'", fontWeight: 700, color: r.floor === "-" ? C.txd : C.orange, borderBottom: `1px solid ${C.border}15` }}>{r.floor}</td>
                    <td style={{ padding: "10px 12px", color: C.txm, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}15` }}>{r.note || "—"}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}15` }}>
                      {r.status.startsWith("SENT") ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.green, background: `${C.green}15`, padding: "2px 8px", borderRadius: 6 }}>✓ Sent</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.red, background: `${C.red}15`, padding: "2px 8px", borderRadius: 6 }} title={r.status}>✗ Fail</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ━━━ Footer ━━━ */}
        <div style={{ textAlign: "center", marginTop: 36, color: C.txd, fontSize: 11 }}>
          🚗 Carpark Tracker Dashboard — Google Sheets CSV → React (recharts) — Auto refresh every 5 min
        </div>
      </div>
    </div>
  );
}
