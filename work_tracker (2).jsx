import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/* ── FONTS ── */
if (!document.getElementById("tr-fonts")) {
  const l = document.createElement("link");
  l.id = "tr-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=JetBrains+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}
if (!document.getElementById("tr-css")) {
  const s = document.createElement("style");
  s.id = "tr-css";
  s.textContent = `
    *{box-sizing:border-box;margin:0;padding:0}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:#1e3050;border-radius:2px}
    ::selection{background:rgba(0,201,167,.2)}
    .hov:hover{opacity:.82;transform:translateY(-1px)}
    .hov-row{cursor:pointer;transition:background .15s}
    .hov-row:hover{background:#132030!important}
    .nav-item:hover{background:rgba(0,201,167,.07)!important;color:#c8d8ef!important}
    .nav-item.on{background:rgba(0,201,167,.12)!important;color:#00c9a7!important;border-left-color:#00c9a7!important}
    .wt-in:focus{outline:none;border-color:#00c9a7!important;box-shadow:0 0 0 2px rgba(0,201,167,.12)!important}
    @keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes spin{to{transform:rotate(360deg)}}
    .up{animation:up .2s ease both}
    .spin{display:inline-block;animation:spin .7s linear infinite}
    .overlay{background:rgba(3,5,10,.85);backdrop-filter:blur(6px)}
    button{font-family:'DM Sans',sans-serif}
  `;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
const SOURCES = {
  team:     { label:"Team Task",     color:"#60a5fa", icon:"◈" },
  personal: { label:"Personal Task", color:"#a78bfa", icon:"◎" },
};
const AREAS = ["Pipeline","Data Quality","Investigation","Logic","Documentation","Meeting","Analysis","Other"];
const EFFORTS = [
  { v:"quick",  label:"Quick",  sub:"< 1 hour",   c:"#34d399" },
  { v:"medium", label:"Medium", sub:"1–4 hours",  c:"#fbbf24" },
  { v:"heavy",  label:"Heavy",  sub:"4+ hours",   c:"#f87171" },
];
const TKEY = "tr_tasks_v2";
const RKEY = "tr_reviews_v2";

/* ══════════════════════════════════════════════
   THEME
══════════════════════════════════════════════ */
const C = {
  bg:"#06080e", surface:"#0a0f1c", panel:"#0d1425", card:"#101828",
  border:"#15253a", borderM:"#1c3050",
  accent:"#00c9a7", accentL:"rgba(0,201,167,.14)",
  text:"#c8d8ef", muted:"#5a7898", faint:"#243855",
  danger:"#f87171", success:"#34d399", warn:"#fbbf24",
  team:"#60a5fa", personal:"#a78bfa",
};

/* ══════════════════════════════════════════════
   STORAGE
══════════════════════════════════════════════ */
const store = {
  async load()         { try { const r=await window.storage.get(TKEY); return r?JSON.parse(r.value):[]; } catch{return[];} },
  async save(t)        { try { await window.storage.set(TKEY,JSON.stringify(t)); } catch{} },
  async loadReviews()  { try { const r=await window.storage.get(RKEY); return r?JSON.parse(r.value):{week:[],month:[],year:[]}; } catch{return{week:[],month:[],year:[]};} },
  async saveReviews(r) { try { await window.storage.set(RKEY,JSON.stringify(r)); } catch{} },
};

/* ══════════════════════════════════════════════
   DATE HELPERS
══════════════════════════════════════════════ */
const uid      = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
const today    = () => new Date().toISOString().split("T")[0];
const fmtD     = iso => new Date(iso+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const fmtShort = iso => new Date(iso+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"});

const periodStart = p => {
  const d = new Date();
  if (p==="week")  d.setDate(d.getDate()-6);
  if (p==="month") d.setDate(d.getDate()-29);
  if (p==="year")  d.setFullYear(d.getFullYear()-1);
  return d.toISOString().split("T")[0];
};
const inPeriod = (t,p) => t.date >= periodStart(p);

/* ══════════════════════════════════════════════
   COPY TEXT BUILDER
══════════════════════════════════════════════ */
const buildCopyText = (tasks, period) => {
  const labels = { week:"this week", month:"this month", year:"this year" };
  const range  = `${fmtShort(periodStart(period))} – ${fmtShort(today())}`;
  const lines  = [...tasks]
    .sort((a,b)=>a.date.localeCompare(b.date))
    .map(t=>[
      `[${t.source==="team"?"Team":"Personal"}]`,
      `[${t.effort}]`,
      `[${t.area}]`,
      t.title,
      t.outcome ? `→ ${t.outcome}` : "",
      `(${fmtShort(t.date)})`,
    ].filter(Boolean).join(" "));

  return [
    `Here are my completed tasks for ${labels[period]} (${range}):`,
    `Total: ${tasks.length} tasks`,
    "",
    ...lines,
    "",
    `Please generate a structured work review with exactly these four sections.`,
    `For each section write 2–4 bullet points starting with "• ".`,
    `Be specific, reference actual tasks and patterns. Be honest and constructive.`,
    "",
    `## Achievements`,
    `## Strengths`,
    `## Areas for Improvement`,
    `## Recommendations`,
  ].join("\n");
};

/* ══════════════════════════════════════════════
   CHART BUILDER
══════════════════════════════════════════════ */
const buildChartData = (tasks, period) => {
  if (period==="week") {
    return Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-(6-i));
      const iso=d.toISOString().split("T")[0];
      const dt=tasks.filter(t=>t.date===iso);
      return { label:d.toLocaleDateString("en-GB",{weekday:"short"}),
        team:dt.filter(t=>t.source==="team").length,
        personal:dt.filter(t=>t.source==="personal").length };
    });
  }
  if (period==="month") {
    return Array.from({length:4},(_,i)=>{
      const end=new Date(); end.setDate(end.getDate()-(i*7));
      const start=new Date(end); start.setDate(start.getDate()-6);
      const s=start.toISOString().split("T")[0], e=end.toISOString().split("T")[0];
      const wt=tasks.filter(t=>t.date>=s&&t.date<=e);
      return { label:fmtShort(s), team:wt.filter(t=>t.source==="team").length,
        personal:wt.filter(t=>t.source==="personal").length };
    }).reverse();
  }
  return Array.from({length:12},(_,i)=>{
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    const prefix=d.toISOString().slice(0,7);
    const mt=tasks.filter(t=>t.date.startsWith(prefix));
    return { label:d.toLocaleDateString("en-GB",{month:"short"}),
      team:mt.filter(t=>t.source==="team").length,
      personal:mt.filter(t=>t.source==="personal").length };
  }).reverse();
};

/* ══════════════════════════════════════════════
   REVIEW PARSER
══════════════════════════════════════════════ */
const parseReview = text => {
  const s = { Achievements:[], Strengths:[], "Areas for Improvement":[], Recommendations:[] };
  let cur = null;
  text.split("\n").forEach(line=>{
    const h=line.match(/^##\s+(.+)/);
    if (h&&s[h[1]]!==undefined){cur=h[1];return;}
    if (cur&&line.trim().startsWith("•")) s[cur].push(line.replace(/^[•\s]+/,"").trim());
  });
  return s;
};

/* ══════════════════════════════════════════════
   STYLE HELPERS
══════════════════════════════════════════════ */
const inp = (x={}) => ({
  width:"100%", background:C.surface, border:`1px solid ${C.borderM}`,
  borderRadius:7, padding:"9px 12px", fontSize:13, color:C.text,
  fontFamily:"'DM Sans',sans-serif", transition:"border .15s", ...x,
});
const btnP = (x={}) => ({
  background:C.accentL, color:C.accent, border:`1px solid ${C.accent}40`,
  borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer", transition:"all .15s", ...x,
});
const btnO = (x={}) => ({
  background:"none", color:C.muted, border:`1px solid ${C.borderM}`,
  borderRadius:7, fontSize:12, fontWeight:500, cursor:"pointer", transition:"all .15s", ...x,
});
const Lbl = ({children}) => (
  <label style={{display:"block",fontSize:11,fontWeight:600,color:C.muted,
    letterSpacing:".05em",textTransform:"uppercase",marginBottom:7}}>
    {children}
  </label>
);

/* ══════════════════════════════════════════════
   TASK FORM (shared by Add + Edit modals)
══════════════════════════════════════════════ */
const TaskForm = ({init, onSubmit, onClose, mode="add"}) => {
  const [f,setF] = useState({
    title:"", source:"team", area:"Pipeline",
    effort:"medium", notes:"", outcome:"", date:today(), ...init,
  });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  const ok  = f.title.trim().length>0;

  return (
    <div className="overlay" style={{position:"fixed",inset:0,zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div className="up" style={{background:C.panel,border:`1px solid ${C.borderM}`,
        borderRadius:14,padding:28,width:500,maxWidth:"95vw",maxHeight:"92vh",overflowY:"auto"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.text}}>
              {mode==="add"?"Log Completed Task":"Edit Task"}
            </h2>
            <p style={{fontSize:11,color:C.muted,marginTop:3}}>
              {mode==="add"?"What did you get done?":"Update the task details"}
            </p>
          </div>
          <button onClick={onClose}
            style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:22}}>×</button>
        </div>

        {/* Title */}
        <div style={{marginBottom:16}}>
          <Lbl>What did you complete?</Lbl>
          <input className="wt-in" value={f.title} onChange={set("title")} autoFocus
            placeholder="e.g. Fixed sales pipeline schema drift issue" style={inp()}/>
        </div>

        {/* Date */}
        <div style={{marginBottom:16}}>
          <Lbl>Date completed</Lbl>
          <input className="wt-in" type="date" value={f.date} onChange={set("date")}
            style={inp({fontFamily:"'JetBrains Mono',monospace",fontSize:12,colorScheme:"dark"})}/>
        </div>

        {/* Source */}
        <div style={{marginBottom:16}}>
          <Lbl>Task Source</Lbl>
          <div style={{display:"flex",gap:8}}>
            {Object.entries(SOURCES).map(([k,v])=>(
              <button key={k} onClick={()=>setF(p=>({...p,source:k}))}
                style={{flex:1,padding:"10px 8px",borderRadius:8,cursor:"pointer",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                  color:f.source===k?v.color:C.muted,
                  background:f.source===k?v.color+"15":C.surface,
                  border:`1px solid ${f.source===k?v.color+"40":C.borderM}`,
                  transition:"all .15s"}}>
                <span style={{fontSize:18}}>{v.icon}</span>
                <span style={{fontSize:12,fontWeight:600}}>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Area */}
        <div style={{marginBottom:16}}>
          <Lbl>Area</Lbl>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {AREAS.map(a=>(
              <button key={a} onClick={()=>setF(p=>({...p,area:a}))}
                style={{padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:500,
                  color:f.area===a?C.accent:C.muted,
                  background:f.area===a?C.accentL:C.surface,
                  border:`1px solid ${f.area===a?C.accent+"40":C.borderM}`,
                  transition:"all .15s"}}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Effort */}
        <div style={{marginBottom:16}}>
          <Lbl>Effort</Lbl>
          <div style={{display:"flex",gap:8}}>
            {EFFORTS.map(e=>(
              <button key={e.v} onClick={()=>setF(p=>({...p,effort:e.v}))}
                style={{flex:1,padding:"8px 6px",borderRadius:7,cursor:"pointer",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                  color:f.effort===e.v?e.c:C.muted,
                  background:f.effort===e.v?e.c+"15":C.surface,
                  border:`1px solid ${f.effort===e.v?e.c+"40":C.borderM}`,
                  transition:"all .15s"}}>
                <span style={{fontSize:12,fontWeight:700}}>{e.label}</span>
                <span style={{fontSize:9,opacity:.7}}>{e.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Outcome — the key field for review quality */}
        <div style={{marginBottom:14}}>
          <Lbl>
            Outcome / What you learned
            <span style={{color:C.accent,fontWeight:400,textTransform:"none",marginLeft:6}}>
              makes your review much more meaningful
            </span>
          </Lbl>
          <input className="wt-in" value={f.outcome} onChange={set("outcome")}
            placeholder="e.g. resolved root cause, learned about schema evolution, unblocked team"
            style={inp()}/>
        </div>

        {/* Notes */}
        <div style={{marginBottom:22}}>
          <Lbl>Notes <span style={{color:C.faint,fontWeight:400,textTransform:"none"}}>(optional)</span></Lbl>
          <input className="wt-in" value={f.notes} onChange={set("notes")}
            placeholder="Any extra context" style={inp()}/>
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={btnO({padding:"8px 18px"})}>Cancel</button>
          <button className="hov" onClick={()=>ok&&onSubmit(f)} disabled={!ok}
            style={btnP({padding:"8px 24px",opacity:ok?1:.4,cursor:ok?"pointer":"default"})}>
            {mode==="add"?"Log Task ✓":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   STAT CARD
══════════════════════════════════════════════ */
const Stat = ({label,value,sub,color}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px",flex:1}}>
    <p style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:".05em",
      textTransform:"uppercase",marginBottom:8}}>{label}</p>
    <p style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,
      color:color||C.text,letterSpacing:"-.02em"}}>{value}</p>
    {sub&&<p style={{fontSize:11,color:C.faint,marginTop:4}}>{sub}</p>}
  </div>
);

/* ══════════════════════════════════════════════
   CHART TOOLTIP
══════════════════════════════════════════════ */
const ChartTip = ({active,payload,label}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:C.panel,border:`1px solid ${C.borderM}`,
      borderRadius:8,padding:"8px 12px",fontSize:11}}>
      <p style={{color:C.muted,marginBottom:5,fontWeight:600}}>{label}</p>
      {payload.map(p=>(
        <p key={p.name} style={{color:p.fill,marginBottom:2}}>
          {p.name==="team"?"Team":"Personal"}: {p.value}
        </p>
      ))}
      <p style={{color:C.text,marginTop:4,fontWeight:600}}>
        Total: {payload.reduce((s,p)=>s+p.value,0)}
      </p>
    </div>
  );
};

/* ══════════════════════════════════════════════
   REVIEW SECTION
══════════════════════════════════════════════ */
const ReviewSection = ({title,bullets,color,icon}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
      <span style={{fontSize:16}}>{icon}</span>
      <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color}}>{title}</h3>
    </div>
    {bullets.map((b,i)=>(
      <div key={i} style={{display:"flex",gap:8,marginBottom:i<bullets.length-1?8:0}}>
        <span style={{color,fontSize:14,flexShrink:0,marginTop:1}}>•</span>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.7}}>{b}</p>
      </div>
    ))}
    {bullets.length===0&&(
      <p style={{fontSize:12,color:C.faint}}>No content parsed — check formatting</p>
    )}
  </div>
);

/* ══════════════════════════════════════════════
   TASK ROW
══════════════════════════════════════════════ */
const TaskRow = ({task,onEdit,onDelete,style={}}) => {
  const src = SOURCES[task.source];
  const eff = EFFORTS.find(e=>e.v===task.effort)||EFFORTS[1];
  return (
    <div className="hov-row" onClick={()=>onEdit(task)}
      style={{display:"flex",alignItems:"center",gap:12,
        padding:"11px 16px",background:"transparent",...style}}>
      <span style={{fontSize:14,flexShrink:0}}>{src.icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:13,fontWeight:500,color:C.text,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</p>
        {task.outcome&&(
          <p style={{fontSize:11,color:C.accent,marginTop:2,opacity:.8,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            → {task.outcome}
          </p>
        )}
        {!task.outcome&&task.notes&&(
          <p style={{fontSize:11,color:C.faint,marginTop:2,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.notes}</p>
        )}
      </div>
      <span style={{fontSize:10,color:C.muted,background:C.surface,
        borderRadius:5,padding:"2px 8px",flexShrink:0,whiteSpace:"nowrap"}}>{task.area}</span>
      <span style={{fontSize:10,color:eff.c,background:eff.c+"15",
        borderRadius:5,padding:"2px 8px",flexShrink:0}}>{eff.label}</span>
      <span style={{fontSize:10,color:src.color,background:src.color+"15",
        borderRadius:5,padding:"2px 8px",flexShrink:0}}>{src.label}</span>
      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,
        color:C.faint,flexShrink:0,minWidth:60,textAlign:"right"}}>{fmtShort(task.date)}</span>
      <button onClick={e=>{e.stopPropagation();onDelete(task.id);}}
        style={{background:"none",border:"none",color:C.faint,cursor:"pointer",
          fontSize:16,flexShrink:0,padding:"2px 6px",lineHeight:1,transition:"color .15s"}}
        onMouseOver={e=>e.currentTarget.style.color=C.danger}
        onMouseOut={e=>e.currentTarget.style.color=C.faint}>×</button>
    </div>
  );
};

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
const Toast = ({msg,type}) => {
  const col=type==="err"?C.danger:type==="warn"?C.warn:C.success;
  return (
    <div className="up" style={{position:"fixed",bottom:24,right:24,zIndex:200,
      color:col,background:col+"15",border:`1px solid ${col}30`,
      borderRadius:8,padding:"10px 16px",fontSize:12,fontWeight:500,
      backdropFilter:"blur(8px)",maxWidth:380}}>
      {msg}
    </div>
  );
};

/* ══════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════ */
export default function App() {
  const [tasks,     setTasks]     = useState([]);
  const [reviews,   setReviews]   = useState({week:[],month:[],year:[]});
  const [view,      setView]      = useState("dashboard");
  const [modal,     setModal]     = useState(null);   // null | "add" | task-object
  const [toast,     setToast]     = useState(null);
  const [ready,     setReady]     = useState(false);
  const [search,    setSearch]    = useState("");
  const [srcFilter, setSrcFilter] = useState("all");
  const [period,    setPeriod]    = useState("week");
  const [pasteText, setPasteText] = useState("");
  const [copied,    setCopied]    = useState(false);

  useEffect(()=>{
    Promise.all([store.load(),store.loadReviews()]).then(([t,r])=>{
      setTasks(t); setReviews(r); setReady(true);
    });
  },[]);

  const notify = useCallback((msg,type="ok")=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),3000);
  },[]);

  /* ── task ops ── */
  const addTask = useCallback(form=>{
    const t = {
      id:uid(), title:form.title.trim(), source:form.source,
      area:form.area, effort:form.effort,
      notes:form.notes.trim(), outcome:form.outcome.trim(),
      date:form.date, createdAt:new Date().toISOString(),
    };
    setTasks(p=>{ const n=[t,...p]; store.save(n); return n; });
    setModal(null); notify("Task logged ✓");
  },[notify]);

  const editTask = useCallback(form=>{
    setTasks(p=>{
      const n=p.map(t=>t.id===form.id?{...t,...form,
        title:form.title.trim(),notes:form.notes.trim(),outcome:form.outcome.trim()}:t);
      store.save(n); return n;
    });
    setModal(null); notify("Task updated ✓");
  },[notify]);

  const deleteTask = useCallback(id=>{
    setTasks(p=>{ const n=p.filter(t=>t.id!==id); store.save(n); return n; });
    notify("Task removed","warn");
  },[notify]);

  /* ── review ops ── */
  const saveReview = useCallback(()=>{
    if (!pasteText.trim()) return;
    const count = tasks.filter(t=>inPeriod(t,period)).length;
    const label = {
      week:  `Week of ${fmtShort(periodStart("week"))}`,
      month: `Month of ${new Date().toLocaleDateString("en-GB",{month:"long",year:"numeric"})}`,
      year:  `Year ${new Date().getFullYear()}`,
    }[period];
    const entry = { text:pasteText.trim(), period, label, taskCount:count, savedAt:new Date().toISOString() };
    setReviews(prev=>{
      const u={...prev,[period]:[...prev[period],entry]};
      store.saveReviews(u); return u;
    });
    setPasteText(""); notify("Review saved ✓");
  },[pasteText,period,tasks,notify]);

  const deleteReview = useCallback((p,idx)=>{
    setReviews(prev=>{
      const u={...prev,[p]:prev[p].filter((_,i)=>i!==idx)};
      store.saveReviews(u); return u;
    });
    notify("Review deleted","warn");
  },[notify]);

  /* ── copy ── */
  const copyTasks = useCallback(()=>{
    const pt = tasks.filter(t=>inPeriod(t,period));
    if (!pt.length) return;
    const text = buildCopyText(pt,period);
    // try clipboard API, fallback to textarea trick
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(()=>{
        setCopied(true); setTimeout(()=>setCopied(false),2500);
        notify("Copied! Paste into Claude.ai →");
      }).catch(()=>fallbackCopy(text));
    } else { fallbackCopy(text); }
  },[tasks,period,notify]);

  const fallbackCopy = text => {
    const ta=document.createElement("textarea");
    ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); notify("Copied! Paste into Claude.ai →"); setCopied(true); setTimeout(()=>setCopied(false),2500); }
    catch { notify("Copy failed — select text manually","err"); }
    document.body.removeChild(ta);
  };

  /* ── derived ── */
  const periodTasks = useMemo(()=>tasks.filter(t=>inPeriod(t,period)),[tasks,period]);
  const chartData   = useMemo(()=>buildChartData(tasks,period),[tasks,period]);

  const todayCount  = tasks.filter(t=>t.date===today()).length;
  const weekCount   = tasks.filter(t=>inPeriod(t,"week")).length;
  const monthCount  = tasks.filter(t=>inPeriod(t,"month")).length;

  const filteredAll = tasks
    .filter(t=>srcFilter==="all"||t.source===srcFilter)
    .filter(t=>!search||[t.title,t.area,t.notes,t.outcome].join(" ").toLowerCase().includes(search.toLowerCase()));

  if (!ready) return (
    <div style={{background:C.bg,height:"100vh",display:"flex",alignItems:"center",
      justifyContent:"center",gap:10,color:C.muted,fontFamily:"'Syne',sans-serif",fontSize:13}}>
      <span className="spin" style={{fontSize:18}}>◌</span> Loading…
    </div>
  );

  const PeriodTabs = () => (
    <div style={{display:"flex",gap:8,marginBottom:24}}>
      {[{k:"week",l:"This Week"},{k:"month",l:"This Month"},{k:"year",l:"This Year"}].map(({k,l})=>(
        <button key={k} onClick={()=>{ setPeriod(k); setPasteText(""); }}
          style={{padding:"7px 18px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:600,
            color:period===k?C.accent:C.muted,
            background:period===k?C.accentL:C.card,
            border:`1px solid ${period===k?C.accent+"40":C.border}`,
            transition:"all .15s"}}>
          {l}
        </button>
      ))}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,
        padding:"0 14px",background:C.card,borderRadius:7,border:`1px solid ${C.border}`}}>
        <span style={{fontSize:11,color:C.muted}}>{periodTasks.length} tasks</span>
        <span style={{width:6,height:6,borderRadius:"50%",
          background:periodTasks.length>0?C.success:C.faint}}/>
      </div>
    </div>
  );

  const ChartBlock = ({height=160}) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} barSize={20} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
        <XAxis dataKey="label" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false}/>
        <Tooltip content={<ChartTip/>} cursor={{fill:"rgba(255,255,255,.03)"}}/>
        <Bar dataKey="team"     stackId="a" fill={C.team}     radius={[0,0,0,0]}/>
        <Bar dataKey="personal" stackId="a" fill={C.personal} radius={[4,4,0,0]}/>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,color:C.text,
      height:"100vh",display:"flex",overflow:"hidden"}}>

      {/* ════ SIDEBAR ════ */}
      <div style={{width:210,minWidth:210,background:C.surface,
        borderRight:`1px solid ${C.border}`,display:"flex",
        flexDirection:"column",padding:"22px 0",overflow:"auto"}}>

        <div style={{padding:"0 20px 22px"}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,
            color:C.text,letterSpacing:"-.01em"}}>Work Tracker</div>
          <div style={{fontSize:10,color:C.muted,marginTop:3}}>Personal Progress Log</div>
        </div>

        <div style={{padding:"0 12px 16px"}}>
          <button className="hov" onClick={()=>setModal("add")}
            style={btnP({width:"100%",padding:"9px",fontSize:12,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6})}>
            + Log Task
          </button>
        </div>

        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,flex:1}}>
          {[
            {k:"dashboard", icon:"⊞", label:"Dashboard"},
            {k:"tasks",     icon:"≡",  label:"All Tasks"},
            {k:"reports",   icon:"◈",  label:"Reports & Review"},
          ].map(({k,icon,label})=>(
            <button key={k} className={`nav-item ${view===k?"on":""}`}
              onClick={()=>setView(k)}
              style={{display:"flex",alignItems:"center",gap:10,width:"100%",
                padding:"9px 20px",fontSize:12,fontWeight:view===k?600:400,
                color:view===k?C.accent:C.muted,background:"none",border:"none",
                borderLeft:"2px solid transparent",cursor:"pointer",
                transition:"all .15s",textAlign:"left"}}>
              <span style={{fontSize:14}}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Quick stats */}
        <div style={{margin:"16px 12px 0",borderTop:`1px solid ${C.border}`,paddingTop:16}}>
          {[{label:"Today",val:todayCount},{label:"This week",val:weekCount},{label:"All time",val:tasks.length}]
            .map(({label,val})=>(
            <div key={label} style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:8,padding:"0 8px"}}>
              <span style={{fontSize:11,color:C.muted}}>{label}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,
                fontWeight:600,color:C.text}}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ════ MAIN ════ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && (
          <div style={{flex:1,overflow:"auto",padding:"28px 32px"}}>
            <div style={{marginBottom:24}}>
              <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,
                color:C.text,letterSpacing:"-.02em",marginBottom:4}}>Dashboard</h1>
              <p style={{fontSize:12,color:C.muted}}>
                {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
              </p>
            </div>

            {/* Stats */}
            <div style={{display:"flex",gap:14,marginBottom:24}}>
              <Stat label="Today"     value={todayCount} sub="tasks completed"  color={C.accent}/>
              <Stat label="This week" value={weekCount}  sub="tasks completed"  color={C.team}/>
              <Stat label="This month"value={monthCount} sub="tasks completed"  color={C.personal}/>
              <Stat label="All time"  value={tasks.length} sub="total logged"   color={C.muted}/>
            </div>

            {/* Period + Chart together */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,
              borderRadius:12,padding:"20px 24px",marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.text}}>
                  Progress Chart
                </h3>
                <div style={{display:"flex",gap:6}}>
                  {[{k:"week",l:"Week"},{k:"month",l:"Month"},{k:"year",l:"Year"}].map(({k,l})=>(
                    <button key={k} onClick={()=>setPeriod(k)}
                      style={{padding:"4px 12px",borderRadius:5,cursor:"pointer",fontSize:11,
                        color:period===k?C.accent:C.muted,
                        background:period===k?C.accentL:"none",
                        border:`1px solid ${period===k?C.accent+"40":C.borderM}`,
                        transition:"all .15s"}}>
                      {l}
                    </button>
                  ))}
                  <div style={{display:"flex",gap:10,marginLeft:8,alignItems:"center"}}>
                    {[{c:C.team,l:"Team"},{c:C.personal,l:"Personal"}].map(({c,l})=>(
                      <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{width:7,height:7,borderRadius:2,background:c}}/>
                        <span style={{fontSize:10,color:C.muted}}>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <ChartBlock height={150}/>
            </div>

            {/* Recent tasks */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.text}}>
                  Recent Tasks
                </h3>
                <button onClick={()=>setView("tasks")}
                  style={{fontSize:11,color:C.accent,background:"none",border:"none",cursor:"pointer"}}>
                  View all →
                </button>
              </div>
              {tasks.length===0
                ? <div style={{textAlign:"center",padding:"32px",color:C.faint,fontSize:12,
                    border:`1px dashed ${C.border}`,borderRadius:12}}>
                    No tasks yet — hit + Log Task to get started
                  </div>
                : <div style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                    {tasks.slice(0,6).map((t,i,arr)=>(
                      <TaskRow key={t.id} task={t}
                        onEdit={t=>setModal(t)}
                        onDelete={deleteTask}
                        style={{borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}/>
                    ))}
                  </div>
              }
            </div>
          </div>
        )}

        {/* ── ALL TASKS ── */}
        {view==="tasks" && (
          <div style={{flex:1,overflow:"auto",padding:"28px 32px"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",marginBottom:22}}>
              <div>
                <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,
                  color:C.text,letterSpacing:"-.02em",marginBottom:4}}>All Tasks</h1>
                <p style={{fontSize:12,color:C.muted}}>{tasks.length} tasks · click any row to edit</p>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {[{k:"all",l:"All"},{k:"team",l:"Team"},{k:"personal",l:"Personal"}].map(({k,l})=>(
                  <button key={k} onClick={()=>setSrcFilter(k)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:6,cursor:"pointer",
                      color:srcFilter===k?C.accent:C.muted,
                      background:srcFilter===k?C.accentL:"none",
                      border:`1px solid ${srcFilter===k?C.accent+"40":C.borderM}`,
                      transition:"all .15s"}}>
                    {l}
                  </button>
                ))}
                <input className="wt-in" value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search tasks…"
                  style={inp({fontSize:12,padding:"6px 12px",width:200})}/>
              </div>
            </div>

            {filteredAll.length===0
              ? <div style={{textAlign:"center",padding:"48px",color:C.faint,fontSize:12,
                  border:`1px dashed ${C.border}`,borderRadius:12}}>No tasks found</div>
              : <div style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                  {filteredAll.map((t,i)=>(
                    <TaskRow key={t.id} task={t}
                      onEdit={t=>setModal(t)}
                      onDelete={deleteTask}
                      style={{borderBottom:i<filteredAll.length-1?`1px solid ${C.border}`:"none"}}/>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── REPORTS & REVIEW ── */}
        {view==="reports" && (
          <div style={{flex:1,overflow:"auto",padding:"28px 32px"}}>
            <div style={{marginBottom:22}}>
              <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,
                color:C.text,letterSpacing:"-.02em",marginBottom:4}}>Reports & Review</h1>
              <p style={{fontSize:12,color:C.muted}}>
                Select a period → copy tasks → paste into Claude.ai → save the review back here
              </p>
            </div>

            <PeriodTabs/>

            {/* Stats for period */}
            <div style={{display:"flex",gap:12,marginBottom:22}}>
              <Stat label="Total"      value={periodTasks.length}                                    sub="tasks completed"/>
              <Stat label="Team"       value={periodTasks.filter(t=>t.source==="team").length}       sub="assigned work"  color={C.team}/>
              <Stat label="Personal"   value={periodTasks.filter(t=>t.source==="personal").length}   sub="self-driven"    color={C.personal}/>
              <Stat label="Heavy"      value={periodTasks.filter(t=>t.effort==="heavy").length}      sub="4h+ effort"     color={C.warn}/>
            </div>

            {/* Chart */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
              padding:"20px 24px",marginBottom:22}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>
                  {period==="week"?"Daily":period==="month"?"Weekly":"Monthly"} breakdown
                </h3>
                <div style={{display:"flex",gap:10}}>
                  {[{c:C.team,l:"Team"},{c:C.personal,l:"Personal"}].map(({c,l})=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{width:7,height:7,borderRadius:2,background:c}}/>
                      <span style={{fontSize:10,color:C.muted}}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ChartBlock height={180}/>
            </div>

            {/* Area breakdown */}
            {periodTasks.length>0 && (()=>{
              const ac=AREAS.map(a=>({a,n:periodTasks.filter(t=>t.area===a).length}))
                .filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
              const mx=Math.max(...ac.map(x=>x.n),1);
              return (
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                  padding:"20px 24px",marginBottom:22}}>
                  <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,
                    color:C.text,marginBottom:14}}>Work by Area</h3>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {ac.map(({a,n})=>(
                      <div key={a} style={{display:"flex",alignItems:"center",gap:12}}>
                        <span style={{fontSize:11,color:C.muted,width:110,flexShrink:0}}>{a}</span>
                        <div style={{flex:1,height:5,background:C.surface,borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${(n/mx)*100}%`,height:"100%",background:C.accent,borderRadius:3}}/>
                        </div>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,
                          color:C.text,width:18,textAlign:"right",flexShrink:0}}>{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ══ GET REVIEW FROM CLAUDE ══ */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,
              borderRadius:12,padding:"24px",marginBottom:24}}>
              <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,
                color:C.text,marginBottom:4}}>
                Get Your {period==="week"?"Weekly":period==="month"?"Monthly":"Yearly"} Review
              </h3>
              <p style={{fontSize:11,color:C.muted,marginBottom:20,lineHeight:1.7}}>
                Step 1: copy your tasks → Step 2: paste into Claude.ai → Step 3: paste the review back here
              </p>

              {/* Step 1 */}
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:22,height:22,borderRadius:"50%",background:C.accentL,
                      color:C.accent,fontSize:10,fontWeight:700,display:"flex",
                      alignItems:"center",justifyContent:"center",flexShrink:0}}>1</span>
                    <span style={{fontSize:12,fontWeight:600,color:C.text}}>Copy task list</span>
                  </div>
                  <button className="hov" onClick={copyTasks} disabled={periodTasks.length===0}
                    style={btnP({padding:"6px 18px",fontSize:11,
                      background: copied ? C.success+"20" : C.accentL,
                      color:       copied ? C.success       : C.accent,
                      borderColor: copied ? C.success+"40"  : C.accent+"40",
                      opacity:periodTasks.length===0?.4:1,
                      cursor:periodTasks.length===0?"default":"pointer"})}>
                    {copied ? "✓ Copied!" : `⎘ Copy ${periodTasks.length} tasks`}
                  </button>
                </div>

                {/* Preview of what gets copied */}
                <div style={{background:C.surface,borderRadius:8,padding:"10px 14px",
                  border:`1px solid ${C.border}`,maxHeight:130,overflowY:"auto"}}>
                  {periodTasks.length===0
                    ? <p style={{fontSize:11,color:C.faint}}>No tasks in this period yet</p>
                    : [...periodTasks].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>(
                        <p key={t.id} style={{fontSize:10,color:C.muted,
                          fontFamily:"'JetBrains Mono',monospace",marginBottom:3,lineHeight:1.5}}>
                          [{t.source==="team"?"Team":"Personal"}] [{t.effort}] [{t.area}] {t.title}
                          {t.outcome?` → ${t.outcome}`:""} ({fmtShort(t.date)})
                        </p>
                      ))
                  }
                </div>
                <p style={{fontSize:10,color:C.faint,marginTop:6}}>
                  The copy button packages this list with a review prompt — paste the whole thing into Claude.ai
                </p>
              </div>

              {/* Step 2 */}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{width:22,height:22,borderRadius:"50%",background:C.accentL,
                    color:C.accent,fontSize:10,fontWeight:700,display:"flex",
                    alignItems:"center",justifyContent:"center",flexShrink:0}}>2</span>
                  <span style={{fontSize:12,fontWeight:600,color:C.text}}>
                    Paste Claude's review here to save it
                  </span>
                </div>
                <textarea className="wt-in" value={pasteText}
                  onChange={e=>setPasteText(e.target.value)}
                  placeholder={"Paste Claude's response here…\n\nExpected format:\n## Achievements\n• …\n\n## Strengths\n• …\n\n## Areas for Improvement\n• …\n\n## Recommendations\n• …"}
                  rows={7}
                  style={{width:"100%",background:C.surface,border:`1px solid ${C.borderM}`,
                    borderRadius:7,padding:"10px 14px",fontSize:12,color:C.text,
                    fontFamily:"'DM Sans',sans-serif",lineHeight:1.7,resize:"vertical",
                    transition:"border .15s"}}/>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                  <button className="hov" onClick={saveReview} disabled={!pasteText.trim()}
                    style={btnP({padding:"7px 20px",fontSize:11,
                      color:C.success,background:C.success+"15",borderColor:C.success+"40",
                      opacity:pasteText.trim()?1:.4,cursor:pasteText.trim()?"pointer":"default"})}>
                    Save Review ✓
                  </button>
                </div>
              </div>
            </div>

            {/* ══ SAVED REVIEWS ══ */}
            {reviews[period]?.length>0 && (
              <div>
                <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,
                  color:C.text,marginBottom:14}}>
                  Saved {period==="week"?"Weekly":period==="month"?"Monthly":"Yearly"} Reviews
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,
                    color:C.muted,fontWeight:400,marginLeft:10}}>
                    ({reviews[period].length})
                  </span>
                </h3>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {[...reviews[period]].reverse().map((r,i)=>{
                    const parsed = parseReview(r.text);
                    const realIdx = reviews[period].length-1-i;
                    return (
                      <div key={i} className="up" style={{background:C.card,
                        border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",padding:"12px 20px",
                          borderBottom:`1px solid ${C.border}`,background:C.surface}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,
                              fontSize:13,color:C.text}}>{r.label}</span>
                            <span style={{fontSize:10,color:C.muted,
                              fontFamily:"'JetBrains Mono',monospace"}}>{r.taskCount} tasks</span>
                          </div>
                          <div style={{display:"flex",gap:10,alignItems:"center"}}>
                            <span style={{fontSize:10,color:C.faint,
                              fontFamily:"'JetBrains Mono',monospace"}}>{fmtD(r.savedAt.split("T")[0])}</span>
                            <button onClick={()=>deleteReview(period,realIdx)}
                              style={{background:"none",border:"none",color:C.faint,
                                cursor:"pointer",fontSize:16,lineHeight:1,transition:"color .15s"}}
                              onMouseOver={e=>e.currentTarget.style.color=C.danger}
                              onMouseOut={e=>e.currentTarget.style.color=C.faint}>×</button>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,padding:16}}>
                          {[
                            {k:"Achievements",          color:C.success, icon:"🏆"},
                            {k:"Strengths",             color:C.team,    icon:"💪"},
                            {k:"Areas for Improvement", color:C.warn,    icon:"🎯"},
                            {k:"Recommendations",       color:C.accent,  icon:"→"},
                          ].map(({k,color,icon})=>(
                            parsed[k]?.length>0
                              ? <ReviewSection key={k} title={k} bullets={parsed[k]} color={color} icon={icon}/>
                              : null
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════ MODALS ════ */}
      {modal==="add" && (
        <TaskForm mode="add" onSubmit={addTask} onClose={()=>setModal(null)}/>
      )}
      {modal && modal!=="add" && (
        <TaskForm mode="edit" init={modal} onSubmit={editTask} onClose={()=>setModal(null)}/>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type}/>}
    </div>
  );
}
