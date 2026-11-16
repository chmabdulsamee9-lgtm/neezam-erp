// A faithful, demo-data replica of the real eNeezam admin (same sidebar, topbar, cards, chips, tables
// as src/theme.css), used on the marketing site. Never shows real store data.
import { useEffect, useRef, useState } from "react";
import { Monogram } from "../../../components/Logo";
import Icon from "../../../components/Icon";
import "./appui.css";

export const SCREENS = ["home", "orders", "whatsapp", "booked", "returns", "ads", "pnl", "store", "neezi"];

const NAV = [
  { group: null, items: [["home", "home", "Home"]] },
  { group: "Orders", items: [["orders", "package", "Orders"], ["booked", "truck", "Booked Orders"], ["returns", "undo", "Returns"], ["products", "products", "Products"]] },
  { group: "Analytics", items: [["dashboard", "chart", "Dashboard"], ["courier-dashboard", "map", "Courier Dashboard"]] },
  { group: "Finance", items: [["pnl", "calculator", "Income Statement"], ["ledger", "building", "Supplier Ledger"], ["budget", "cash", "Budget Calculator"]] },
  { group: "Sales channels", items: [["store", "shop", "Online Store"], ["shopify", "link", "Shopify"]] },
  { group: "Growth", items: [["ads", "megaphone", "Meta Ads"], ["neezi", "sparkle", "Neezi AI"], ["whatsapp", "comment", "WhatsApp"]] },
];
const TITLES = { home: "Home", orders: "Orders", booked: "Booked Orders", returns: "Returns", ads: "Meta Ads", pnl: "Income Statement", store: "Online Store", whatsapp: "WhatsApp", neezi: "Neezi AI" };

const rs = (n) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const CITIES = ["Karachi", "Lahore", "Islamabad", "Multan", "Faisalabad", "Peshawar", "Sialkot", "Hyderabad", "Quetta", "Gujranwala", "Bahawalpur", "Sargodha"];
const NAMES = ["Ayesha K.", "Bilal A.", "Hina R.", "Usman T.", "Sana M.", "Hamza S.", "Mahnoor F.", "Ali R.", "Zainab Q.", "Fahad N.", "Iqra B.", "Saad J."];
const SRC = ["Shopify", "Store", "TikTok", "Shopify", "Store"];
const pick = (arr, i) => arr[i % arr.length];

function useTicker(on, ms = 2400) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return t;
}
function useVisible(ref) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setV(true); return; }
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return v;
}

const Chip = ({ k, children }) => <span className={`au-chip ${k}`}>{children}</span>;

// ---------------- screens ----------------
function Home({ t }) {
  const orders = 128 + t, booked = 97 + Math.floor(t * 0.8);
  return (
    <div className="au-pad">
      <div className="au-hello"><div><b>Assalam o Alaikum, Demo Brand</b><span>Aaj ka haal ek nazar mein</span></div><span className="au-btn">+ New order</span></div>
      <div className="au-kpis">
        <div className="au-card"><span>Today's orders</span><b>{orders}</b><em className="up">+12%</em></div>
        <div className="au-card"><span>Confirmed (WhatsApp)</span><b>{Math.round(orders * 0.82)}</b><em className="up">82%</em></div>
        <div className="au-card"><span>Booked</span><b>{booked}</b><em>Nex · Dex</em></div>
        <div className="au-card grad"><span>Net profit</span><b>{rs(84250 + t * 640)}</b><em>this month</em></div>
      </div>
      <div className="au-row2">
        <div className="au-card">
          <div className="au-card-h"><b>Orders · last 14 days</b><span>Delivered %</span></div>
          <div className="au-area">{[42, 55, 48, 62, 58, 71, 66, 74, 70, 82, 77, 88, 84, 92].map((h, i) => <i key={i} style={{ "--h": `${h}%`, "--i": i }} />)}</div>
        </div>
        <div className="au-card au-todo">
          <div className="au-card-h"><b>Aaj ke kaam</b></div>
          {[["warning", "14 orders confirm hone baqi"], ["accent", "9 orders Ready to Sync"], ["danger", "3 returns receive karne hain"], ["success", "Dex payout aa gaya"]].map(([k, s]) => <div key={s}><i className={k} />{s}</div>)}
        </div>
      </div>
    </div>
  );
}

function Orders({ t }) {
  const rows = Array.from({ length: 7 }, (_, i) => {
    const n = 3176 + t - i;
    const st = i === 0 ? "New" : i < 3 ? "Approved" : i === 3 ? "Pending" : i === 5 ? "Cancelled" : "Approved";
    return { n, name: pick(NAMES, n), city: pick(CITIES, n * 7), amt: 1899 + ((n * 37) % 30) * 100, src: pick(SRC, n), st, wa: st !== "New" && st !== "Pending" };
  });
  const kind = { New: "info", Approved: "success", Pending: "warning", Cancelled: "danger" };
  return (
    <div className="au-pad">
      <div className="au-tabs">{["All", "New", "Approved", "Pending", "Ready to Sync", "Cancelled"].map((x, i) => <span key={x} className={i === 0 ? "on" : ""}>{x}{i === 1 && <b>{3 + (t % 4)}</b>}</span>)}</div>
      <div className="au-tools"><span className="au-search"><Icon name="search" size={11} /> Search order, phone, city</span><span className="au-btn ghost"><Icon name="filter" size={11} /> Filter</span><span className="au-btn">Book selected</span></div>
      <div className="au-table">
        <div className="au-tr au-th"><span>Order</span><span>Customer</span><span>City</span><span>Amount</span><span>Channel</span><span>Status</span></div>
        {rows.map((r, i) => (
          <div key={r.n} className={`au-tr ${i === 0 ? "new" : ""}`}>
            <span className="b">#T{r.n}</span><span>{r.name}</span><span className="m">{r.city}</span><span className="b">{rs(r.amt)}</span>
            <span><Chip k="muted">{r.src}</Chip></span>
            <span className="au-st"><Chip k={kind[r.st]}>{r.st}</Chip>{r.wa && <Icon name="comment" size={11} />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Booked({ t }) {
  const flow = ["Booked", "In Transit", "Out for Delivery", "Delivered"];
  const kind = { Booked: "info", "In Transit": "accent", "Out for Delivery": "warning", Delivered: "success", Returned: "danger" };
  const rows = Array.from({ length: 6 }, (_, i) => {
    const n = 88213 + i;
    const st = i === 4 ? "Returned" : flow[Math.min(3, (i + t) % 5 === 4 ? 3 : ((i + t) % 4))];
    return { n, city: pick(CITIES, n), cod: 1999 + ((n * 13) % 25) * 100, st };
  });
  return (
    <div className="au-pad">
      <div className="au-kpis">
        <div className="au-card"><span>Booked today</span><b>{41 + t}</b></div>
        <div className="au-card"><span>In transit</span><b>{186 + (t % 5)}</b></div>
        <div className="au-card"><span>Delivered</span><b>91.4%</b><em className="up">+2.1%</em></div>
        <div className="au-card"><span>COD pending</span><b>{rs(412500)}</b></div>
      </div>
      <div className="au-table">
        <div className="au-tr au-th c5"><span>Tracking</span><span>Courier</span><span>City</span><span>COD</span><span>Status</span></div>
        {rows.map((r) => (
          <div key={r.n} className="au-tr c5"><span className="b">DX{r.n}</span><span><Chip k="muted">{r.n % 3 ? "Nex" : "Dex"}</Chip></span><span className="m">{r.city}</span><span className="b">{rs(r.cod)}</span><span><Chip k={kind[r.st]}>{r.st}</Chip></span></div>
        ))}
      </div>
    </div>
  );
}

function Returns() {
  const rows = [["#T3102", "Customer refused", "In transit back", "warning"], ["#T3088", "Wrong size", "Received", "success"], ["#T3075", "Not reachable", "Re-attempt", "accent"], ["#T3061", "Damaged", "Claim filed", "danger"], ["#T3049", "Customer refused", "Received", "success"]];
  return (
    <div className="au-pad">
      <div className="au-kpis three">
        <div className="au-card"><span>Return rate</span><b>8.6%</b><em className="up">−1.9%</em></div>
        <div className="au-card"><span>In transit back</span><b>23</b></div>
        <div className="au-card"><span>Loss saved by re-attempt</span><b>{rs(61400)}</b></div>
      </div>
      <div className="au-table">
        <div className="au-tr au-th c4"><span>Order</span><span>Reason</span><span>Stage</span><span /></div>
        {rows.map(([o, r, s, k]) => <div key={o} className="au-tr c4"><span className="b">{o}</span><span className="m">{r}</span><span><Chip k={k}>{s}</Chip></span><span className="au-link">Open</span></div>)}
      </div>
    </div>
  );
}

function Ads({ t }) {
  const rows = [
    { lvl: 0, name: "Winter Serum · Sales", on: true, spend: 18400, ord: 31, rev: 77500, sku: "SRM-30", cost: 650 },
    { lvl: 1, name: "Broad · Women 18-45", on: true, spend: 11200, ord: 21, rev: 52500, sku: "↳ SRM-30", cost: 650 },
    { lvl: 2, name: "Video · UGC review", on: true, spend: 7300, ord: 15, rev: 37500, sku: "↳ SRM-30", cost: 650 },
    { lvl: 1, name: "Lookalike 2%", on: false, spend: 7200, ord: 10, rev: 25000, sku: "↳ SRM-30", cost: 650 },
    { lvl: 0, name: "Hair Oil · Retarget", on: true, spend: 9100, ord: 19, rev: 37050, sku: "HO-100", cost: 520 },
  ];
  return (
    <div className="au-pad">
      <div className="au-kpis">
        <div className="au-card"><span>Spend</span><b>{rs(27500 + t * 120)}</b></div>
        <div className="au-card"><span>Orders</span><b>{50 + Math.floor(t / 2)}</b></div>
        <div className="au-card"><span>ROAS</span><b>4.2x</b></div>
        <div className="au-card grad"><span>Profit after ads</span><b>{rs(54600 + t * 300)}</b></div>
      </div>
      <div className="au-table">
        <div className="au-tr au-th c7"><span>Name</span><span>Spend</span><span>Orders</span><span>ROAS</span><span>Product</span><span>Profit</span><span>BE ROAS</span></div>
        {rows.map((r) => {
          const profit = r.rev - r.ord * r.cost - r.spend;
          return (
            <div key={r.name} className={`au-tr c7 lv${r.lvl}`}>
              <span className="au-nm"><i className={`au-sw ${r.on ? "on" : ""}`} />{r.name}</span>
              <span>{rs(r.spend)}</span><span>{r.ord}</span><span className="b">{(r.rev / r.spend).toFixed(1)}x</span>
              <span><Chip k="muted">{r.sku}</Chip></span><span className={`b ${profit > 0 ? "pos" : "neg"}`}>{rs(profit)}</span><span className="m">1.4x</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pnl({ t }) {
  const rev = 1245000 + t * 4200, cogs = 412000, ads = 268000, courier = 121000, other = 46000;
  const net = rev - cogs - ads - courier - other;
  const lines = [["Revenue (delivered)", rev, "success"], ["Product cost", -cogs, "muted"], ["Meta ads", -ads, "accent"], ["Courier + returns", -courier, "warning"], ["Other expenses", -other, "muted"]];
  return (
    <div className="au-pad">
      <div className="au-tabs"><span className="on">This month</span><span>Last month</span><span>Custom</span></div>
      <div className="au-row2 pnl">
        <div className="au-card">
          {lines.map(([l, v, k]) => (
            <div key={l} className="au-pl"><span>{l}</span><i className={k} style={{ "--w": `${(Math.abs(v) / rev) * 100}%` }} /><b className={v < 0 ? "neg" : ""}>{v < 0 ? "−" : ""}{rs(Math.abs(v))}</b></div>
          ))}
          <div className="au-pl net"><span>Net profit</span><b>{rs(net)}</b></div>
        </div>
        <div className="au-card au-donut-c">
          <div className="au-donut" style={{ "--a": `${(cogs / rev) * 100}%`, "--b": `${((cogs + ads) / rev) * 100}%`, "--c": `${((cogs + ads + courier + other) / rev) * 100}%` }}><b>{Math.round((net / rev) * 100)}%</b><span>margin</span></div>
        </div>
      </div>
    </div>
  );
}

function Store() {
  return (
    <div className="au-pad au-store">
      <div className="au-store-side">
        <b>Theme</b>
        {["Aurora", "Bazaar", "Minimal"].map((x, i) => <div key={x} className={`au-theme ${i === 0 ? "on" : ""}`}><i className={`t${i}`} />{x}</div>)}
        <b>Sections</b>
        {["Announcement bar", "Hero banner", "Best sellers", "Reviews", "WhatsApp button"].map((x) => <div key={x} className="au-sec"><Icon name="grip" size={10} />{x}</div>)}
      </div>
      <div className="au-store-prev">
        <div className="au-sp-bar">Free delivery all over Pakistan · COD</div>
        <div className="au-sp-hero"><b>Winter Glow Serum</b><span>Rs 2,499 · Cash on delivery</span><i>Order now</i></div>
        <div className="au-sp-grid">{[0, 1, 2].map((i) => <div key={i}><i /><span /><span className="s" /></div>)}</div>
      </div>
    </div>
  );
}

function WhatsApp({ t }) {
  const step = t % 6;
  return (
    <div className="au-pad au-wa">
      <div className="au-phone">
        <div className="au-ph-top"><i />Demo Brand <span>Business account</span></div>
        <div className="au-ph-body">
          <div className="au-msg in">Assalam o Alaikum Ayesha! Aap ka order <b>#T3176</b> (Rs 2,499) mil gaya. Confirm karein?<div className="au-msg-btns"><span className={step >= 1 ? "hit" : ""}>Confirm</span><span>Cancel</span><span>Edit Address</span></div></div>
          {step >= 1 && <div className="au-msg out">Confirm</div>}
          {step >= 2 && <div className="au-msg in">Shukriya! Order confirm ho gaya ✓</div>}
          {step >= 3 && <div className="au-msg in">Aap ka order dispatch ho gaya. Tracking: <b>DX88213</b></div>}
          {step >= 4 && <div className="au-msg in">Aaj aap ka order deliver hoga. Rider rabta karega.</div>}
        </div>
      </div>
      <div className="au-wa-side">
        <div className="au-card"><span>Messages this month</span><b>1,284 / 2,000</b><div className="au-meter"><i style={{ width: "64%" }} /></div></div>
        <div className="au-card au-ev">
          {[["Order confirm", true], ["Dispatched", true], ["Out for delivery", true], ["Delivery failed", true]].map(([x, on]) => <div key={x}><span>{x}</span><i className={`au-sw ${on ? "on" : ""}`} /></div>)}
        </div>
      </div>
    </div>
  );
}

function Neezi({ t }) {
  const tips = [
    ["Campaign \"Lookalike 2%\" ka ROAS break-even (1.4x) se neeche hai. Isay band kar ke budget \"Broad\" mein daal dein?", "Haan, kar do"],
    ["Multan se 6 returns is hafte. 3 orders ke address adhoore hain, WhatsApp par naya address mangwa loon?", "Bhej do"],
    ["Hair Oil ka stock 4 din ka reh gaya hai. Supplier ko 300 units ka order bana doon?", "Draft banao"],
  ];
  const n = t % tips.length;
  return (
    <div className="au-pad au-neezi">
      <div className="au-nz-head"><img src="/brand/neezi/neezi-wave.webp" alt="" width="44" height="40" /><div><b>Neezi</b><span>Aap ka eNeezam AI</span></div></div>
      {tips.slice(0, n + 1).map(([m, a], i) => (
        <div key={i} className="au-nz-msg"><p>{m}</p><span className="au-btn">{a}</span><span className="au-btn ghost">Baad mein</span></div>
      ))}
    </div>
  );
}

const RENDER = { home: Home, orders: Orders, booked: Booked, returns: Returns, ads: Ads, pnl: Pnl, store: Store, whatsapp: WhatsApp, neezi: Neezi };

// AppWindow: the full admin shell. screen = which page shows; onNav lets visitors click around.
export function AppWindow({ screen = "home", theme = "light", onNav, compact = false, chrome = true, className = "", live = true }) {
  const ref = useRef(null);
  const vis = useVisible(ref);
  const t = useTicker(vis && live);
  const S = RENDER[screen] || Home;
  return (
    <div ref={ref} className={`au ${theme === "dark" ? "au-dark" : ""} ${compact ? "au-compact" : ""} ${className}`} aria-label="eNeezam app preview">
      {chrome && <div className="au-chrome"><i /><i /><i /><span>portal.eneezam.com/{screen}</span></div>}
      <div className="au-shell">
        <aside className="au-side">
          <div className="au-brand"><Monogram size={18} /><span><em>e</em>Neezam</span></div>
          {NAV.map((g, gi) => (
            <div key={gi}>
              {g.group && <div className="au-navlabel">{g.group}</div>}
              {g.items.map(([id, ic, label]) => (
                <div key={id} className={`au-navitem ${id === screen ? "active" : ""} ${RENDER[id] && onNav ? "click" : ""}`} onClick={() => RENDER[id] && onNav?.(id)}>
                  <span className="au-ic"><Icon name={ic} size={11} /></span><span className="au-navtext">{label}</span>
                </div>
              ))}
            </div>
          ))}
        </aside>
        <main className="au-main">
          <div className="au-topbar"><b>{TITLES[screen]}</b><span className="au-sync">Synced just now</span><span className="au-user"><i>DB</i>Demo Brand</span></div>
          <div className="au-content" key={screen}><S t={t} /></div>
        </main>
      </div>
    </div>
  );
}

// A single screen card without the shell (for bento tiles / feature cards)
export function AppScreen({ screen, theme = "light", className = "" }) {
  const ref = useRef(null);
  const vis = useVisible(ref);
  const t = useTicker(vis);
  const S = RENDER[screen] || Home;
  return <div ref={ref} className={`au au-solo ${theme === "dark" ? "au-dark" : ""} ${className}`}><div className="au-content"><S t={t} /></div></div>;
}

// Cycles through screens on its own until the visitor clicks a sidebar item.
export function useAutoScreen(list, ms = 4200) {
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(null);
  useEffect(() => {
    if (manual || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % list.length), ms);
    return () => clearInterval(id);
  }, [manual, list.length, ms]);
  return [manual || list[i], setManual];
}
