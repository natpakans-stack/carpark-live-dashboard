import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
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
    .map(row => {
      const timestamp = (row.Date || "").trim();
      const exitRaw = (row["exitDateReminder "] || row.exitDateReminder || "").trim();
      // กรอกย้อนหลัง: ไม่มี exitDate → ใช้วันที่จาก Date column แทน
      const exitDate = exitRaw || (timestamp ? new Date(timestamp).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) : "");
      return {
        timestamp,
        time: (row.timeForgot || "").trim(),
        mapUrl: (row.parkingMap || "").trim(),
        floor: (row.parkingFloor || "").trim(),
        note: (row.note || "").trim(),
        location: (row.parkingLocation || "").trim(),
        exitDate,
        status: (row.NoteType || "").trim(),
      };
    })
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
      background: C.card, borderRadius: 16, padding: 28,
      border: `1px solid ${C.border}`,
      animation: `fadeUp .5s ${delay}ms ease both`,
    }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: C.tx }}>{title}</h3>
      {subtitle && <p style={{ margin: "0 0 16px", fontSize: 11, color: C.txm }}>{subtitle}</p>}
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
  const [avgPeriod, setAvgPeriod] = useState("all");

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

  // Removed: timeDist and dayDist (not needed)

  // Avg arrival time per location (from TimeUseTracking)
  const avgByLoc = useMemo(() => {
    const now = new Date();
    const bangkokNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const g = {};
    data.forEach(d => {
      if (!d.location || !d.time) return;
      const [h, m] = d.time.split(":").map(Number);
      if (isNaN(h)) return;
      if (avgPeriod === "week" && d.timestamp) {
        const dt = new Date(d.timestamp);
        const bangkokDt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const day = bangkokNow.getDay() || 7;
        const weekStart = new Date(bangkokNow);
        weekStart.setDate(bangkokNow.getDate() - day + 1);
        weekStart.setHours(0, 0, 0, 0);
        if (bangkokDt < weekStart) return;
      } else if (avgPeriod === "month" && d.timestamp) {
        const dt = new Date(d.timestamp);
        const bangkokDt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        if (bangkokDt.getMonth() !== bangkokNow.getMonth() || bangkokDt.getFullYear() !== bangkokNow.getFullYear()) return;
      }
      if (!g[d.location]) g[d.location] = [];
      g[d.location].push(h * 60 + (m || 0));
    });
    return Object.entries(g).map(([loc, times]) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return { location: loc, display: `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(Math.round(avg % 60)).padStart(2, "0")}`, avg, count: times.length };
    }).sort((a, b) => a.avg - b.avg);
  }, [data, avgPeriod]);

  // Arrival time trend (separate by location, from TimeUseTracking)
  const arrivalTrend = useMemo(() => {
    const byDate = {};
    data.forEach(d => {
      if (!d.time || !d.exitDate) return;
      const [h, m] = d.time.split(":").map(Number);
      if (isNaN(h)) return;
      const dayOfWeek = new Date(d.exitDate).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return;
      const date = d.exitDate.slice(5);
      if (!byDate[date]) byDate[date] = {};
      if (d.location === "คอนโด") byDate[date].condo = h * 60 + (m || 0);
      if (d.location === "ที่ทำงาน") byDate[date].work = h * 60 + (m || 0);
    });
    return Object.entries(byDate)
      .map(([date, times]) => ({ date, ...times }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Daily count (based on timestamp/Date column)
  const daily = useMemo(() => {
    const c = {};
    filtered.forEach(d => {
      if (!d.timestamp) return;
      const dt = new Date(d.timestamp);
      const date = dt.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(5);
      c[date] = (c[date] || 0) + 1;
    });
    return Object.entries(c).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
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
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
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
          .chart-card { padding: 20px !important; }

          /* Recent table: hide หมายเหตุ + สถานะ on mobile */
          .recent-table th:nth-child(5),
          .recent-table td:nth-child(5),
          .recent-table th:nth-child(6),
          .recent-table td:nth-child(6) { display: none; }
          .recent-table th,
          .recent-table td { padding: 8px 6px !important; font-size: 11px !important; }
          .loc-badge { white-space: nowrap !important; font-size: 10px !important; padding: 2px 7px !important; }
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
            <div style={{ fontSize: 11, fontWeight: 600, color: "#ffffff", opacity: .9, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>
              🚗 carpark tracker
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: "#ffffff" }}>วันนี้จอดรถที่ไหน?</h1>
            <p className="header-desc" style={{ fontSize: 12, color: "#ffffff", opacity: .9, margin: "4px 0 0" }}>
              Real-time Dashboard — Auto refresh ทุก 5 นาที จาก Google Sheets
            </p>
          </div>
          <div style={{
            background: "#1e293b", borderRadius: 12, padding: "12px 16px",
            fontSize: 12, minWidth: 200, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: error ? C.red : C.green,
                boxShadow: `0 0 10px ${error ? C.red : C.green}`,
                animation: "pulse2 2s infinite",
              }} />
              <span style={{ fontWeight: 700, color: "#ffffff" }}>{loading ? "Loading..." : error ? "Error" : "Live"}</span>
              <span style={{ color: "#cbd5e1", marginLeft: "auto" }}>{data.length} rows</span>
            </div>
            {lastRefresh && <div style={{ color: "#cbd5e1", fontSize: 11 }}>Updated: {lastRefresh.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}</div>}
            <div style={{ color: "#cbd5e1", fontSize: 11, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 20, marginTop: 28 }}>
          <KpiCard icon="🚗" label="เที่ยวทั้งหมด" value={totalTrips} suffix="ครั้ง" color={C.orange} delay={100} />
          <KpiCard icon="🏠" label="คอนโด" value={condoTrips} suffix="ครั้ง" color={C.orange} delay={160} />
          <KpiCard icon="🏢" label="ที่ทำงาน" value={workTrips} suffix="ครั้ง" color={C.blue} delay={220} />
          <KpiCard icon="🅿️" label="ชั้นบ่อยสุด (คอนโด)" value={`ชั้น ${topFloor}`} suffix="" color={C.green} delay={280} />
          <KpiCard icon="📊" label="บันทึกทั้งหมด" value={data.length} suffix="ครั้ง" color={C.purple} delay={340} />
        </div>

        {/* ━━━ Row 1 ━━━ */}
        <div className="grid-2col" style={{ marginTop: 28 }}>
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

        {/* ━━━ Row 2 removed (time/day charts) ━━━ */}

        {/* ━━━ Arrival Time Trend ━━━ */}
        <div style={{ marginTop: 28 }}>
          <ChartCard
            title="⏰ เวลาที่บันทึก — Trend"
            subtitle="เวลาที่ถึงสถานที่และบันทึกที่จอดรถ"
            delay={640}
          >
          <div style={{ marginTop: -8 }}>
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={arrivalTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" stroke={C.txm} fontSize={11} />
                <YAxis stroke={C.txm} fontSize={11} domain={["dataMin - 30", "dataMax + 30"]}
                  tickFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 12, padding: "12px 16px", boxShadow: "0 8px 24px rgba(0,0,0,.1)" }}>
                      <div style={{ color: C.txm, fontSize: 11, marginBottom: 6 }}>{d.date}</div>
                      {d.condo !== undefined && (
                        <div style={{ color: C.orange, fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono'", marginBottom: 2 }}>
                          🏠 {Math.floor(d.condo / 60).toString().padStart(2, "0")}:{(d.condo % 60).toString().padStart(2, "0")}
                        </div>
                      )}
                      {d.work !== undefined && (
                        <div style={{ color: C.blue, fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono'" }}>
                          🏢 {Math.floor(d.work / 60).toString().padStart(2, "0")}:{(d.work % 60).toString().padStart(2, "0")}
                        </div>
                      )}
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="condo" name="คอนโด" stroke={C.orange} strokeWidth={3}
                  dot={{ r: 5, fill: C.orange, stroke: C.bg, strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: C.orange, stroke: C.bg, strokeWidth: 2 }}
                  connectNulls={false} />
                <Line type="monotone" dataKey="work" name="ที่ทำงาน" stroke={C.blue} strokeWidth={3}
                  dot={{ r: 5, fill: C.blue, stroke: C.bg, strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: C.blue, stroke: C.bg, strokeWidth: 2 }}
                  connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        </div>

        {/* ━━━ Avg by Location ━━━ */}
        <div style={{
          background: C.card, borderRadius: 16, padding: 28, border: `1px solid ${C.border}`, marginTop: 28,
          animation: "fadeUp .5s 700ms ease both",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.tx }}>📊 เวลาที่บันทึกเฉลี่ย แยกตามสถานที่</h3>
            <div style={{ display: "flex", gap: 4, background: C.bg2, borderRadius: 10, padding: 3 }}>
              {[["all", "ทั้งหมด"], ["week", "สัปดาห์นี้"], ["month", "เดือนนี้"]].map(([key, label]) => (
                <button key={key} onClick={() => setAvgPeriod(key)} style={{
                  padding: "5px 12px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer", transition: "all .2s",
                  background: avgPeriod === key ? C.card : "transparent",
                  color: avgPeriod === key ? C.tx : C.txm,
                  boxShadow: avgPeriod === key ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            {avgByLoc.map((item, i) => (
              <div key={i} style={{
                background: `${locClr(item.location)}0a`, borderRadius: 14, padding: "20px 22px",
                border: `1px solid ${locClr(item.location)}25`, transition: "border-color .2s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = locClr(item.location) + "55"}
                onMouseLeave={e => e.currentTarget.style.borderColor = locClr(item.location) + "25"}
              >
                <div style={{ fontSize: 13, color: C.txm, marginBottom: 6 }}>{locIco(item.location)} {item.location}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: locClr(item.location), fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.display}
                </div>
                <div style={{ fontSize: 11, color: C.txd }}>เฉลี่ย ({item.count} ครั้ง)</div>
              </div>
            ))}
          </div>
        </div>

        {/* ━━━ Spot Frequency section removed ━━━ */}

        {/* ━━━ Daily Timeline ━━━ */}
        <div style={{ marginTop: 28 }}>
          <ChartCard title="📈 จำนวนบันทึกรายวัน" subtitle="Timeline การบันทึกข้อมูล" delay={820}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" stroke={C.txm} fontSize={10} angle={-45} textAnchor="end" height={56} />
              <YAxis stroke={C.txm} fontSize={12} allowDecimals={false} />
              <Tooltip content={<Tip />} />
              <Line type="monotone" dataKey="count" name="บันทึก" stroke={C.green} strokeWidth={2.5}
                dot={({ cx, cy, payload }) => (
                  payload.count >= 2 ? (
                    <g key={payload.date}>
                      <circle cx={cx} cy={cy} r={10} fill={C.green} stroke={C.bg} strokeWidth={2} />
                      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={11} fontWeight={700}>✓</text>
                    </g>
                  ) : (
                    <circle key={payload.date} cx={cx} cy={cy} r={4} fill={C.green} stroke={C.bg} strokeWidth={2} />
                  )
                )} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        </div>

        {/* ━━━ Recent Table ━━━ */}
        <div style={{
          background: C.card, borderRadius: 16, padding: 28, border: `1px solid ${C.border}`, marginTop: 28,
          animation: "fadeUp .5s 880ms ease both",
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>🕑 รายการล่าสุด</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="recent-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["วันที่", "เวลา", "สถานที่", "ชั้น", "หมายเหตุ", "สถานะ"].map(h => (
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
                    <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono'", fontWeight: 700, borderBottom: `1px solid ${C.border}15` }}>
                      {r.time || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}15` }}>
                      <span className="loc-badge" style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: `${locClr(r.location)}15`, color: locClr(r.location),
                        border: `1px solid ${locClr(r.location)}35`, whiteSpace: "nowrap",
                        display: "inline-block",
                      }}>
                        {locIco(r.location)} {r.location}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono'", fontWeight: 700, color: r.floor === "-" ? C.txd : C.orange, borderBottom: `1px solid ${C.border}15` }}>{r.floor}</td>
                    <td style={{ padding: "10px 12px", color: C.txm, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}15` }}>{r.note || "—"}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}15` }}>
                      {r.status.startsWith("SENT") ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.green, background: `${C.green}15`, padding: "2px 8px", borderRadius: 6 }}>✓ Sent</span>
                      ) : r.status.includes("กรอกย้อนหลัง") ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.orange, background: `${C.orange}15`, padding: "2px 8px", borderRadius: 6 }}>กรอกย้อนหลัง</span>
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
        <div style={{ textAlign: "center", marginBottom: 0, lineHeight: 0, height: 200, overflow: "hidden" }}>
          <img src="https://natpakans-stack.github.io/talk-to-figma-mcp/assets/aw-mascot.avif" alt="Aw mascot" style={{ width: 320, height: "auto" }} />
        </div>
        <div style={{ textAlign: "center", padding: "24px 20px 40px", color: C.txd, fontSize: 14, borderTop: "1px solid #e4e4eb" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <a href="https://natpakans-stack.github.io/line-messaging-portfolio" style={{ color: "#a259ff", textDecoration: "none" }}>line-messaging-portfolio</a>
            <a href="https://natpakans-stack.github.io/parking-reminder-portfolio" style={{ color: "#a259ff", textDecoration: "none" }}>parking-reminder-portfolio</a>
            <a href="https://natpakans-stack.github.io/carpark_live_dashboard" style={{ color: "#a259ff", textDecoration: "none" }}>carpark_live_dashboard</a>
          </div>
        </div>
      </div>
    </div>
  );
}
