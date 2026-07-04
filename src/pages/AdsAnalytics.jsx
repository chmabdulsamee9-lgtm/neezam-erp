import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const DATE_FILTERS = [
  { label: "Today", value: "today", metaPreset: "today" },
  { label: "Yesterday", value: "yesterday", metaPreset: "yesterday" },
  { label: "Last 7 Days", value: "7days", metaPreset: "last_7d" },
  { label: "Last 30 Days", value: "30days", metaPreset: "last_30d" },
];

const OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
];

const rupees = (n) => (n === null || n === undefined ? "—" : `Rs. ${Math.round(Number(n)).toLocaleString()}`);

const getSource = (order) => {
  const ref = order.referring_site || "";
  if (ref.includes("facebook") || ref.includes("meta") || ref.includes("fb")) return "Meta";
  if (ref.includes("tiktok")) return "TikTok";
  if (ref.includes("snapchat")) return "Snapchat";
  if (ref.includes("google")) return "Google";
  return "Direct";
};

export default function AdsAnalytics({ ordersData, storeId, ordersStore, cfUrl }) {
  const [dateFilter, setDateFilter] = useState("today");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [insights, setInsights] = useState(null);
  const [balance, setBalance] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [editingBudgetValue, setEditingBudgetValue] = useState("");
  const [busyCampaignId, setBusyCampaignId] = useState(null);

  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [campaignForm, setCampaignForm] = useState({ name: "", objective: "OUTCOME_TRAFFIC", daily_budget: "" });
  const [adsetForm, setAdsetForm] = useState({ name: "", daily_budget: "", countries: "PK", age_min: "18", age_max: "65" });
  const [adForm, setAdForm] = useState({ name: "", page_id: "", message: "", link: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isConnected = !!ordersStore?.meta_ad_account_id;

  useEffect(() => {
    if (storeId && isConnected) {
      fetchInsights();
      fetchCampaigns();
    }
  }, [storeId, dateFilter, isConnected]);

  useEffect(() => {
    if (storeId && isConnected) fetchBalance();
  }, [storeId, isConnected]);

  const authedFetch = async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    return res.json();
  };

  const fetchInsights = async () => {
    setLoading(true);
    setError("");
    try {
      const preset = DATE_FILTERS.find(f => f.value === dateFilter)?.metaPreset || "today";
      const qs = new URLSearchParams({ store_id: storeId, date_preset: preset }).toString();
      const data = await authedFetch(`/meta-insights?${qs}`, { method: "GET" });
      if (data.error) { setError(data.error); setLoading(false); return; }
      setInsights((data.data && data.data[0]) || {});
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const fetchBalance = async () => {
    try {
      const qs = new URLSearchParams({ store_id: storeId }).toString();
      const data = await authedFetch(`/meta-account-balance?${qs}`, { method: "GET" });
      if (!data.error) setBalance(data);
    } catch (err) {
      // balance ek secondary metric hai, error yahan crash nahi karayenge
    }
  };

  const fetchCampaigns = async () => {
    try {
      const qs = new URLSearchParams({ store_id: storeId }).toString();
      const data = await authedFetch(`/meta-campaigns?${qs}`, { method: "GET" });
      if (!data.error) setCampaigns(data.data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleCampaignStatus = async (campaign) => {
    setBusyCampaignId(campaign.id);
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const data = await authedFetch(`/meta-update-campaign`, {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, campaignId: campaign.id, updates: { status: newStatus } }),
      });
      if (data.error) { setError(data.error); setBusyCampaignId(null); return; }
      fetchCampaigns();
    } catch (err) {
      setError(err.message);
    }
    setBusyCampaignId(null);
  };

  const openEditBudget = (campaign) => {
    setEditingBudgetId(campaign.id);
    setEditingBudgetValue(String(campaign.daily_budget || campaign.lifetime_budget || ""));
  };

  const saveBudget = async (campaign) => {
    if (!editingBudgetValue) return;
    setBusyCampaignId(campaign.id);
    try {
      const field = campaign.lifetime_budget && !campaign.daily_budget ? "lifetime_budget" : "daily_budget";
      const data = await authedFetch(`/meta-update-campaign`, {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, campaignId: campaign.id, updates: { [field]: editingBudgetValue } }),
      });
      if (data.error) { setError(data.error); setBusyCampaignId(null); setEditingBudgetId(null); return; }
      fetchCampaigns();
    } catch (err) {
      setError(err.message);
    }
    setBusyCampaignId(null);
    setEditingBudgetId(null);
  };

  // TASK: Meta-attributed order revenue — sirf STORE-LEVEL aggregate hai (per-campaign
  // attribution nahi, kyunke orders data mein individual campaign ID track nahi hoti)
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === "today") return { from: today, to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "yesterday") {
      const y = new Date(today.getTime() - 86400000);
      return { from: y, to: today };
    }
    if (dateFilter === "7days") return { from: new Date(today.getTime() - 7 * 86400000), to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "30days") return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(today.getTime() + 86400000) };
    return { from: today, to: new Date(today.getTime() + 86400000) };
  };

  const metaRevenue = useMemo(() => {
    const { from, to } = getDateRange();
    return (ordersData || [])
      .filter(o => { const d = new Date(o.created_at); return d >= from && d < to && getSource(o) === "Meta"; })
      .reduce((s, o) => s + Number(o.total_price || 0), 0);
  }, [ordersData, dateFilter]);

  const metaSpend = Number(insights?.spend || 0);
  const roas = metaSpend > 0 ? metaRevenue / metaSpend : null;

  const createFullCampaign = async () => {
    setCreating(true);
    setCreateError("");
    try {
      const campaignData = await authedFetch(`/meta-create-campaign`, {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, name: campaignForm.name, objective: campaignForm.objective }),
      });
      if (campaignData.error || !campaignData.id) {
        setCreateError(campaignData.error?.message || campaignData.error || "Campaign create nahi hui");
        setCreating(false);
        return;
      }

      const adsetData = await authedFetch(`/meta-create-adset`, {
        method: "POST",
        body: JSON.stringify({
          store_id: storeId,
          name: adsetForm.name || `${campaignForm.name} - AdSet`,
          campaign_id: campaignData.id,
          daily_budget: adsetForm.daily_budget || campaignForm.daily_budget,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          targeting: {
            geo_locations: { countries: adsetForm.countries.split(",").map(c => c.trim()).filter(Boolean) },
            age_min: Number(adsetForm.age_min) || 18,
            age_max: Number(adsetForm.age_max) || 65,
          },
        }),
      });
      if (adsetData.error || !adsetData.id) {
        setCreateError((adsetData.error?.message || adsetData.error || "Ad set create nahi hua") + " (campaign ban chuki hai, PAUSED state mein)");
        setCreating(false);
        return;
      }

      const adData = await authedFetch(`/meta-create-ad`, {
        method: "POST",
        body: JSON.stringify({
          store_id: storeId,
          name: adForm.name || `${campaignForm.name} - Ad`,
          adset_id: adsetData.id,
          creative: {
            object_story_spec: {
              page_id: adForm.page_id,
              link_data: { message: adForm.message, link: adForm.link },
            },
          },
        }),
      });
      if (adData.error || !adData.id) {
        setCreateError((adData.error?.message || adData.error || "Ad create nahi hua") + " (campaign + ad set ban chuke hain, PAUSED state mein)");
        setCreating(false);
        return;
      }

      setShowNewCampaignModal(false);
      setWizardStep(1);
      setCampaignForm({ name: "", objective: "OUTCOME_TRAFFIC", daily_budget: "" });
      setAdsetForm({ name: "", daily_budget: "", countries: "PK", age_min: "18", age_max: "65" });
      setAdForm({ name: "", page_id: "", message: "", link: "" });
      fetchCampaigns();
    } catch (err) {
      setCreateError(err.message);
    }
    setCreating(false);
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" };
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 };
  const dateBtnStyle = (type) => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 700, border: "1px solid",
    borderColor: dateFilter === type ? "transparent" : "var(--ne-border)",
    background: dateFilter === type ? "var(--ne-grad)" : "var(--ne-surface-2)",
    color: dateFilter === type ? "#fff" : "var(--ne-muted)",
  });
  const dateFilterLabel = DATE_FILTERS.find(f => f.value === dateFilter)?.label || "Today";

  if (!isConnected) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📣 Ads Analytics</h1>
        <div style={{ marginTop: "1.5rem", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📣</div>
          Meta Ads abhi connected nahi hai. Pehle <strong>Meta Connect</strong> page se connect karo.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📣 Ads Analytics</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.meta_ad_account_name || "Meta Ads"}</p>
        </div>
        <button onClick={() => setShowNewCampaignModal(true)}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          + New Campaign
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, background: "var(--ne-danger-soft)", border: "1px solid var(--ne-danger)", color: "var(--ne-danger)", padding: "10px 14px", borderRadius: 9, fontSize: 12 }}>
          ❌ {error}
        </div>
      )}

      {/* Date Filter */}
      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap" }}>
        {DATE_FILTERS.map(f => (
          <button key={f.value} style={dateBtnStyle(f.value)} onClick={() => setDateFilter(f.value)}>{f.label}</button>
        ))}
      </div>

      {/* Hero Card */}
      <div style={{ background: "var(--ne-grad)", borderRadius: 18, padding: "1.4rem", marginBottom: "0.75rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontWeight: 600, marginBottom: 4 }}>
            {dateFilterLabel} — total spend
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>
            {loading ? "..." : rupees(insights?.spend)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Impressions", value: Number(insights?.impressions || 0).toLocaleString() },
            { label: "Clicks", value: Number(insights?.clicks || 0).toLocaleString() },
            { label: "CTR", value: `${Number(insights?.ctr || 0).toFixed(2)}%` },
            { label: "CPC", value: rupees(insights?.cpc) },
            { label: "Account Balance", value: rupees(balance?.balance) },
          ].map(chip => (
            <div key={chip.label} style={{ background: "rgba(255,255,255,.16)", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{chip.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", fontWeight: 600, whiteSpace: "nowrap" }}>{chip.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ROAS Comparison */}
      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📊 ROAS (Meta)</h2>
        <p style={{ margin: "0 0 10px", fontSize: 10.5, color: "var(--ne-muted-2)", lineHeight: 1.5 }}>
          ⚠️ Yeh sirf STORE-LEVEL aggregate hai — Meta ka total spend vs Neezam ke "Meta" source wale saare orders ka revenue (isi date range mein). Per-campaign attribution nahi hai, kyunke orders data mein individual campaign ID track nahi hoti.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "var(--ne-danger)", fontWeight: 700 }}>{rupees(metaSpend)} spend</span>
          <span style={{ color: "var(--ne-muted-2)" }}>→</span>
          <span style={{ fontSize: 14, color: "var(--ne-success)", fontWeight: 700 }}>{rupees(metaRevenue)} revenue</span>
          <span style={{ color: "var(--ne-muted-2)" }}>→</span>
          <span style={{ fontSize: 18, color: "var(--ne-accent)", fontWeight: 800 }}>{roas != null ? `${roas.toFixed(2)}x ROAS` : "—"}</span>
        </div>
      </div>

      {/* Campaigns */}
      <h2 style={{ fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, margin: "1.25rem 0 0.75rem" }}>📢 Campaigns ({campaigns.length})</h2>
      {campaigns.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>Koi campaign nahi mila.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {campaigns.map(c => {
            const isActive = c.status === "ACTIVE";
            const isEditingBudget = editingBudgetId === c.id;
            const budgetValue = c.daily_budget || c.lifetime_budget;
            return (
              <div key={c.id} style={{ ...cardStyle, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ne-text)" }}>{c.name}</span>
                    <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: isActive ? "var(--ne-success-soft)" : "var(--ne-surface)", color: isActive ? "var(--ne-success)" : "var(--ne-muted)" }}>
                      {isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)", marginTop: 3 }}>{c.objective}</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {isEditingBudget ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input type="number" autoFocus value={editingBudgetValue} onChange={e => setEditingBudgetValue(e.target.value)}
                        style={{ width: 90, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--ne-accent)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 12 }} />
                      <button onClick={() => saveBudget(c)} style={{ background: "var(--ne-grad)", border: "none", borderRadius: 6, color: "#fff", padding: "4px 9px", cursor: "pointer", fontSize: 11 }}>✓</button>
                      <button onClick={() => setEditingBudgetId(null)} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 6, color: "var(--ne-text)", padding: "4px 9px", cursor: "pointer", fontSize: 11 }}>✕</button>
                    </div>
                  ) : (
                    <span onClick={() => openEditBudget(c)} style={{ fontSize: 12, color: "var(--ne-text)", cursor: "pointer" }} title="Edit budget">
                      Budget: <strong>{budgetValue ?? "—"}</strong>
                    </span>
                  )}
                  <button disabled={busyCampaignId === c.id} onClick={() => toggleCampaignStatus(c)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: isActive ? "var(--ne-warning-soft)" : "var(--ne-success-soft)", color: isActive ? "var(--ne-warning)" : "var(--ne-success)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {busyCampaignId === c.id ? "⏳..." : isActive ? "⏸ Pause" : "▶ Resume"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Campaign Wizard Modal */}
      {showNewCampaignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 440, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>+ New Campaign — Step {wizardStep}/3</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--ne-muted)" }}>
                {wizardStep === 1 ? "Campaign details" : wizardStep === 2 ? "Ad Set (budget + targeting)" : "Ad (creative)"}
              </p>
            </div>

            <div style={{ padding: "16px 18px" }}>
              {wizardStep === 1 && (
                <>
                  <input type="text" placeholder="Campaign Name" value={campaignForm.name}
                    onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                  <select value={campaignForm.objective} onChange={e => setCampaignForm(f => ({ ...f, objective: e.target.value }))} style={inputStyle}>
                    {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input type="number" placeholder="Daily Budget" value={campaignForm.daily_budget}
                    onChange={e => setCampaignForm(f => ({ ...f, daily_budget: e.target.value }))} style={inputStyle} />
                </>
              )}

              {wizardStep === 2 && (
                <>
                  <input type="text" placeholder="Ad Set Name (optional)" value={adsetForm.name}
                    onChange={e => setAdsetForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                  <input type="number" placeholder="Daily Budget (agar campaign se alag ho)" value={adsetForm.daily_budget}
                    onChange={e => setAdsetForm(f => ({ ...f, daily_budget: e.target.value }))} style={inputStyle} />
                  <input type="text" placeholder="Countries (comma-separated, e.g. PK)" value={adsetForm.countries}
                    onChange={e => setAdsetForm(f => ({ ...f, countries: e.target.value }))} style={inputStyle} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" placeholder="Age Min" value={adsetForm.age_min}
                      onChange={e => setAdsetForm(f => ({ ...f, age_min: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                    <input type="number" placeholder="Age Max" value={adsetForm.age_max}
                      onChange={e => setAdsetForm(f => ({ ...f, age_max: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </>
              )}

              {wizardStep === 3 && (
                <>
                  <input type="text" placeholder="Ad Name (optional)" value={adForm.name}
                    onChange={e => setAdForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                  <input type="text" placeholder="Facebook Page ID" value={adForm.page_id}
                    onChange={e => setAdForm(f => ({ ...f, page_id: e.target.value }))} style={inputStyle} />
                  <textarea placeholder="Ad Text (message)" rows={3} value={adForm.message}
                    onChange={e => setAdForm(f => ({ ...f, message: e.target.value }))}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                  <input type="text" placeholder="Destination Link (https://...)" value={adForm.link}
                    onChange={e => setAdForm(f => ({ ...f, link: e.target.value }))} style={inputStyle} />
                  <p style={{ fontSize: 10.5, color: "var(--ne-muted-2)", margin: "-4px 0 10px" }}>
                    ⚠️ Simplified creative hai — koi image/video upload flow abhi nahi hai, sirf text link ad banega.
                  </p>
                </>
              )}

              {createError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{createError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                {wizardStep > 1 && (
                  <button type="button" onClick={() => setWizardStep(s => s - 1)}
                    style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                    ← Back
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button type="button" onClick={() => setWizardStep(s => s + 1)} disabled={wizardStep === 1 && !campaignForm.name}
                    style={{ flex: 1, padding: "10px", background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Next →
                  </button>
                ) : (
                  <button type="button" onClick={createFullCampaign} disabled={creating}
                    style={{ flex: 1, padding: "10px", background: creating ? "var(--ne-border)" : "var(--ne-success)", color: creating ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: creating ? "default" : "pointer" }}>
                    {creating ? "Create ho raha hai..." : "✓ Create Campaign"}
                  </button>
                )}
                <button type="button" onClick={() => { setShowNewCampaignModal(false); setWizardStep(1); setCreateError(""); }}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
