import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import Icon from "./Icon";
import { supabase } from "../supabase";
import { workerFetch } from "../lib/storeApi";
import { getCachedProducts } from "../productsCache";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const rs = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `Rs ${Math.round(Number(n)).toLocaleString()}`);
const num = (n) => (Number(n) || 0).toLocaleString();
const roas = (rev, spend) => (spend > 0 ? (rev / spend).toFixed(2) : "—");
const blank = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };

// Ads manager: campaign -> ad set -> ad, Meta stats at every level, a product SKU per level for costing, on/off and budget.
// The SKU of an ad is its own, else its ad set's, else its campaign's. Profit = revenue - purchases x product cost - spend.
export default function AdsTree({ storeId, ordersStore, datePreset }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const T = (k) => t(`adsTree.${k}`);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState({}); // { [campaignId|adsetId]: true }
  const [budgetEdit, setBudgetEdit] = useState(null); // { level, id, value }
  const [products, setProducts] = useState([]);
  const [costs, setCosts] = useState({}); // { sku: cost }

  const call = useCallback((path, extra = {}) => workerFetch(CF_URL, path, { method: "POST", body: JSON.stringify({ store_id: storeId, ...extra }) }), [storeId]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const { data: d } = await call("/meta-ads-tree", { date_preset: datePreset });
    setLoading(false);
    if (d && !d.error) { setData(d); setError(""); return; }
    setError(d?.error || "failed");
  }, [storeId, datePreset, call]);

  useEffect(() => { load(); }, [load]);

  // products (SKU list) + the current cost of each SKU (product_costs is versioned by effective_from)
  useEffect(() => {
    if (!storeId) return;
    const eneezamId = ordersStore?.eneezam_id;
    if (eneezamId) getCachedProducts(eneezamId).then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
    supabase.from("product_costs").select("sku,cost_price,effective_from").eq("store_id", storeId).then(({ data: rows }) => {
      const today = new Date().toISOString().slice(0, 10);
      const best = {};
      for (const r of rows || []) {
        const eff = r.effective_from || "0000-01-01";
        if (eff > today) continue;
        if (!best[r.sku] || eff > best[r.sku].eff) best[r.sku] = { eff, cost: Number(r.cost_price) };
      }
      setCosts(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.cost])));
    });
  }, [storeId, ordersStore?.eneezam_id]);

  const skuOptions = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const p of products) {
      const title = p.title || p.raw_data?.title || "";
      for (const v of p.raw_data?.variants || []) {
        if (!v?.sku || seen.has(v.sku)) continue;
        seen.add(v.sku);
        const vt = v.title && v.title !== "Default Title" ? ` / ${v.title}` : "";
        out.push({ sku: v.sku, label: `${v.sku} — ${title}${vt}`, price: Number(v.price) || 0 });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);
  const priceOf = useMemo(() => Object.fromEntries(skuOptions.map((o) => [o.sku, o.price])), [skuOptions]);

  const own = useMemo(() => {
    const m = {};
    for (const r of data?.products || []) m[`${r.level}:${r.object_id}`] = r.sku;
    return m;
  }, [data]);

  const adsetsOf = (cid) => (data?.adsets || []).filter((x) => x.campaign_id === cid);
  const adsOf = (sid) => (data?.ads || []).filter((x) => x.adset_id === sid);
  const statOf = (level, id) => data?.stats?.[level]?.[id] || blank;
  const skuForAd = (ad) => own[`ad:${ad.id}`] || own[`adset:${ad.adset_id}`] || own[`campaign:${ad.campaign_id}`] || null;

  // profit of an ad (null when its SKU or the SKU's cost is unknown)
  const adProfit = (ad) => {
    const s = statOf("ad", ad.id);
    const sku = skuForAd(ad);
    if (!sku || costs[sku] === undefined) return null;
    return s.revenue - s.purchases * costs[sku] - s.spend;
  };
  // ad set / campaign: the sum over its ads; "partial" when some ad with spend has no costed SKU
  const sumProfit = (ads) => {
    let total = 0; let partial = false; let any = false;
    for (const ad of ads) {
      const p = adProfit(ad);
      if (p === null) { if (statOf("ad", ad.id).spend > 0) partial = true; continue; }
      total += p; any = true;
    }
    return { value: any ? total : null, partial };
  };
  const beRoas = (sku) => {
    const price = priceOf[sku];
    const cost = costs[sku];
    if (!sku || !price || cost === undefined || price <= cost) return "—";
    return (price / (price - cost)).toFixed(2);
  };

  const setSku = async (level, id, sku) => {
    setBusy(`sku:${id}`);
    const { data: d } = await call("/meta-ad-set-product", { level, object_id: id, sku: sku || null });
    setBusy("");
    if (d?.success) {
      setData((prev) => {
        if (!prev) return prev;
        const rest = (prev.products || []).filter((r) => !(r.level === level && r.object_id === id));
        return { ...prev, products: sku ? [...rest, { level, object_id: id, sku }] : rest };
      });
      return;
    }
    setError(d?.error || "save_failed");
  };

  const update = async (level, id, fields) => {
    setBusy(`up:${id}`);
    const { data: d } = await call("/meta-ad-update", { level, object_id: id, ...fields });
    setBusy("");
    if (d?.success) { setBudgetEdit(null); await load(); return; }
    setError(d?.meta_message ? `${T("updateFailed")} (${d.meta_message})` : T("updateFailed"));
  };

  const acc = data?.account;
  const totals = data?.stats?.total || blank;
  const allProfit = sumProfit(data?.ads || []);
  const errText = { meta_no_ad_account: T("noAdAccount"), meta_token_invalid: T("reconnect"), ads_unavailable: T("unavailable") }[error] || (error ? `${T("unavailable")} (${error})` : "");

  const cell = { padding: "9px 10px", borderBottom: "1px solid var(--ne-border-inner, var(--ne-border))", fontSize: 12.5, whiteSpace: "nowrap", textAlign: "right" };
  const nameCell = { ...cell, textAlign: "left", whiteSpace: "normal", minWidth: 220 };

  const statusPill = (level, x) => {
    const on = x.status === "ACTIVE";
    return (
      <button type="button" className={`ne-adt-switch${on ? " on" : ""}`} disabled={!!busy} aria-pressed={on} title={x.effective_status || x.status}
        onClick={() => update(level, x.id, { status: on ? "PAUSED" : "ACTIVE" })}><span /></button>
    );
  };

  const budgetCell = (level, x) => {
    if (level === "ad") return <td style={cell}>—</td>;
    if (budgetEdit && budgetEdit.id === x.id) {
      return (
        <td style={cell}>
          <span style={{ display: "inline-flex", gap: 4 }}>
            <input dir="ltr" inputMode="numeric" value={budgetEdit.value} onChange={(e) => setBudgetEdit({ ...budgetEdit, value: e.target.value.replace(/\D/g, "").slice(0, 8) })} style={{ width: 80, padding: "4px 6px", fontSize: 12 }} aria-label={T("dailyBudget")} />
            <button type="button" className="ne-acc-outline" disabled={!!busy || !budgetEdit.value} onClick={() => update(level, x.id, { daily_budget: Number(budgetEdit.value) })}>{T("save")}</button>
          </span>
        </td>
      );
    }
    if (x.daily_budget) return <td style={cell}><button type="button" className="ne-asset-link" style={{ marginTop: 0 }} onClick={() => setBudgetEdit({ level, id: x.id, value: String(Math.round(x.daily_budget)) })}>{rs(x.daily_budget)}/{T("day")}</button></td>;
    if (x.lifetime_budget) return <td style={cell}>{rs(x.lifetime_budget)} {T("lifetime")}</td>;
    return <td style={{ ...cell, color: "var(--ne-muted)" }}>{level === "adset" ? T("campaignBudget") : "—"}</td>;
  };

  const skuCell = (level, id, inherited) => {
    const mine = own[`${level}:${id}`] || "";
    return (
      <td style={{ ...cell, textAlign: "left" }}>
        <select value={mine} disabled={!!busy || data?.products_available === false} onChange={(e) => setSku(level, id, e.target.value)} aria-label={T("product")}
          style={{ maxWidth: 190, fontSize: 12, padding: "4px 6px" }}>
          <option value="">{inherited ? `↳ ${inherited}` : T("pickProduct")}</option>
          {skuOptions.map((o) => <option key={o.sku} value={o.sku}>{o.label}</option>)}
        </select>
      </td>
    );
  };

  const row = (level, x, depth, extra) => {
    const s = statOf(level, x.id);
    const profit = extra.profit;
    return (
      <tr key={`${level}-${x.id}`} className={`ne-adt-row ne-adt-${level}`}>
        <td style={{ ...nameCell, paddingLeft: 10 + depth * 22 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {extra.toggle ? <button type="button" className="ne-adt-caret" onClick={extra.toggle} aria-expanded={!!extra.open} aria-label={T("expand")}><Icon name={extra.open ? "chevronDown" : "chevronRight"} size={13} /></button> : <span style={{ width: 20 }} />}
            {statusPill(level, x)}
            {x.thumbnail && <img src={x.thumbnail} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: "cover" }} />}
            <span>
              <span style={{ fontWeight: 600, display: "block" }}>{x.name || x.id}</span>
              <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{T(`level_${level}`)} · {String(x.effective_status || x.status || "").toLowerCase().replace(/_/g, " ")}</span>
            </span>
          </span>
        </td>
        {budgetCell(level, x)}
        <td style={cell}>{rs(s.spend)}</td>
        <td style={cell}>{num(s.purchases)}</td>
        <td style={cell}>{s.purchases > 0 ? rs(s.spend / s.purchases) : "—"}</td>
        <td style={cell}>{rs(s.revenue)}</td>
        <td style={cell}>{roas(s.revenue, s.spend)}</td>
        {skuCell(level, x.id, extra.inherited)}
        <td style={{ ...cell, fontWeight: 700, color: profit.value === null ? "var(--ne-muted)" : profit.value >= 0 ? "var(--ne-success)" : "var(--ne-danger)" }}>
          {profit.value === null ? "—" : rs(profit.value)}{profit.partial && <span title={T("partial")} style={{ marginLeft: 4 }}>*</span>}
        </td>
        <td style={cell}>{extra.be}</td>
      </tr>
    );
  };

  if (!storeId) return null;

  return (
    <div className="ne-adt">
      <div className="ne-adt-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{T("title")}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted)" }}>{T("subtitle")}</p>
        </div>
        <button type="button" className="ne-acc-outline" onClick={load} disabled={loading}><Icon name="refresh" size={13} /> {loading ? T("loading") : T("refresh")}</button>
      </div>

      {errText && <div className="ne-assets-warn" style={{ marginBottom: 10 }}>{errText}</div>}

      {acc && (
        <div className="ne-adt-account">
          <span><strong>{acc.name || acc.id}</strong> · {acc.status === 1 ? T("accountActive") : acc.status === 2 ? T("accountDisabled") : `${T("accountStatus")} ${acc.status ?? "—"}`}</span>
          <span>{T("amountSpent")}: <strong>{rs(acc.amount_spent)}</strong></span>
          {acc.balance !== null && <span>{T("balance")}: <strong>{rs(acc.balance)}</strong></span>}
          {acc.spend_cap && <span>{T("spendCap")}: <strong>{rs(acc.spend_cap)}</strong></span>}
          {acc.payment_method && <span>{T("payment")}: <strong>{acc.payment_method}</strong></span>}
          <a href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${acc.id}`} target="_blank" rel="noopener noreferrer" className="ne-asset-link" style={{ marginTop: 0 }}>{T("billing")}</a>
        </div>
      )}

      {data && (
        <div className="ne-adt-cards">
          {[[T("spend"), rs(totals.spend)], [T("purchases"), num(totals.purchases)], [T("revenue"), rs(totals.revenue)], ["ROAS", roas(totals.revenue, totals.spend)], [T("profit"), allProfit.value === null ? "—" : `${rs(allProfit.value)}${allProfit.partial ? "*" : ""}`]].map(([k, v]) => (
            <div key={k} className="ne-adt-card"><span>{k}</span><strong>{v}</strong></div>
          ))}
        </div>
      )}

      {data && (
        <div style={{ overflowX: "auto", border: "1px solid var(--ne-border)", borderRadius: 12, background: "var(--ne-surface-2)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[T("name"), T("budget"), T("spend"), T("purchases"), T("costPerPurchase"), T("revenue"), "ROAS", T("product"), T("profit"), T("beRoas")].map((h, i) => (
                  <th key={h} style={{ ...cell, textAlign: i === 0 || i === 7 ? "left" : "right", fontSize: 11.5, color: "var(--ne-muted)", fontWeight: 700, background: "var(--ne-surface)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.campaigns || []).length === 0 && <tr><td colSpan={10} style={{ ...cell, textAlign: "center", color: "var(--ne-muted)" }}>{T("empty")}</td></tr>}
              {(data.campaigns || []).map((c) => {
                const sets = adsetsOf(c.id);
                const cOpen = !!open[c.id];
                const cAds = (data.ads || []).filter((a) => a.campaign_id === c.id);
                const cSku = own[`campaign:${c.id}`];
                return (
                  <Fragment key={c.id}>
                    {row("campaign", c, 0, { toggle: () => setOpen((o) => ({ ...o, [c.id]: !cOpen })), open: cOpen, profit: sumProfit(cAds), be: beRoas(cSku) })}
                    {cOpen && sets.map((st) => {
                      const sOpen = !!open[st.id];
                      const sSku = own[`adset:${st.id}`] || cSku;
                      return (
                        <Fragment key={st.id}>
                          {row("adset", st, 1, { toggle: () => setOpen((o) => ({ ...o, [st.id]: !sOpen })), open: sOpen, profit: sumProfit(adsOf(st.id)), inherited: own[`adset:${st.id}`] ? null : cSku, be: beRoas(sSku) })}
                          {sOpen && adsOf(st.id).map((ad) => {
                            const p = adProfit(ad);
                            const inh = own[`ad:${ad.id}`] ? null : own[`adset:${st.id}`] || cSku;
                            return row("ad", ad, 2, { profit: { value: p, partial: p === null && statOf("ad", ad.id).spend > 0 }, inherited: inh, be: beRoas(skuForAd(ad)) });
                          })}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <p style={{ fontSize: 11.5, color: "var(--ne-muted)", marginTop: 8 }}>{T("footnote")}</p>}
    </div>
  );
}
