import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "orders", label: "Orders" },
  { id: "courier", label: "Courier Tracking" },
  { id: "ads", label: "Ads Analytics" },
  { id: "pnl", label: "Profit & Loss" },
  { id: "ledger", label: "Supplier Ledger" },
  { id: "returns", label: "Returns" },
  { id: "cities", label: "City Performance" },
  { id: "products", label: "Products" },
  { id: "budget", label: "Budget Calculator" },
  { id: "suggestions", label: "Suggestions" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "store-connect", label: "Store Connect" },
];

export default function Team({ storeId, storeName, cfUrl }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState(["orders"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (storeId) fetchMembers();
  }, [storeId]);

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_stores")
      .select("permissions, profiles(id, email, full_name, phone, role)")
      .eq("store_id", storeId);
    setMembers(data || []);
    setLoading(false);
  };

  const togglePermission = (moduleId) => {
    setPermissions(prev =>
      prev.includes(moduleId) ? prev.filter(p => p !== moduleId) : [...prev, moduleId]
    );
  };

  const toggleMemberPermission = async (member, moduleId) => {
    const current = member.permissions || [];
    const updated = current.includes(moduleId)
      ? current.filter(p => p !== moduleId)
      : [...current, moduleId];
    await supabase
      .from("user_stores")
      .update({ permissions: updated })
      .eq("user_id", member.profiles.id)
      .eq("store_id", storeId);
    setMembers(prev => prev.map(m => m.profiles.id === member.profiles.id ? { ...m, permissions: updated } : m));
  };

  const removeMember = async (member) => {
    if (!window.confirm(`${member.profiles.full_name || member.profiles.email} ko remove karna chahte ho?`)) return;
    await supabase
      .from("user_stores")
      .delete()
      .eq("user_id", member.profiles.id)
      .eq("store_id", storeId);
    setMembers(prev => prev.filter(m => m.profiles.id !== member.profiles.id));
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    setError("");
    if (!fullName.trim() || !phone.trim() || !email.trim() || password.length < 6) {
      setError("Sab fields fill karo, password kam az kam 6 characters ka ho");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${cfUrl}/create-staff-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim(),
          role: "staff",
          store_id: storeId,
          permissions,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSaving(false);
        return;
      }
      setShowAddForm(false);
      setFullName(""); setPhone(""); setEmail(""); setPassword(""); setPermissions(["orders"]);
      fetchMembers();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ne-text)" }}>👥 Team — {storeName}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ne-muted)" }}>Apne staff ko add karo aur unhe access do</p>
      </div>

      {!showAddForm ? (
        <button onClick={() => setShowAddForm(true)}
          style={{ width: "100%", padding: "14px", background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: "1.5rem", boxShadow: "0 6px 20px rgba(92,124,250,.25)" }}>
          + Naya Staff Add Karo
        </button>
      ) : (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>Naya Staff</h2>
          <form onSubmit={handleAddStaff}>
            <input type="text" placeholder="Naam" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
            <input type="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Password (min 6 characters)" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />

            <p style={{ fontSize: 12, color: "var(--ne-muted)", margin: "12px 0 8px" }}>Kis modules ka access dena hai:</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, marginBottom: 16 }}>
              {MODULES.map(m => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ne-text)", cursor: "pointer", background: "var(--ne-bg)", border: "1px solid var(--ne-border)", padding: "6px 8px", borderRadius: 8 }}>
                  <input type="checkbox" checked={permissions.includes(m.id)} onChange={() => togglePermission(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>

            {error && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: "10px", background: saving ? "var(--ne-border)" : "var(--ne-success)", color: saving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                {saving ? "Add ho raha hai..." : "✓ Add Karo"}
              </button>
              <button type="button" onClick={() => { setShowAddForm(false); setError(""); }}
                style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <h2 style={{ fontSize: 14, color: "var(--ne-muted)", marginBottom: 10, fontWeight: 600 }}>Team Members ({members.length})</h2>

      {loading ? (
        <div style={{ color: "var(--ne-muted-2)", fontSize: 13, textAlign: "center", padding: "2rem" }}>Loading...</div>
      ) : members.length === 0 ? (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)", fontSize: 13 }}>
          Abhi koi team member nahi hai.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {members.map(m => (
            <div key={m.profiles.id} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ne-text)" }}>{m.profiles.full_name || "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--ne-muted-2)" }}>{m.profiles.email} · {m.profiles.phone || "no phone"}</div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: m.profiles.role === "admin" ? "var(--ne-accent-soft)" : "var(--ne-surface)", color: m.profiles.role === "admin" ? "var(--ne-accent)" : "var(--ne-muted)", marginTop: 4, display: "inline-block", fontWeight: 600 }}>
                    {m.profiles.role}
                  </span>
                </div>
                {m.profiles.role !== "admin" && (
                  <button onClick={() => removeMember(m)}
                    style={{ background: "transparent", border: "none", color: "var(--ne-danger)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    🗑️ Remove
                  </button>
                )}
              </div>
              {m.profiles.role === "staff" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {MODULES.map(mod => {
                    const has = (m.permissions || []).includes(mod.id);
                    return (
                      <button key={mod.id} onClick={() => toggleMemberPermission(m, mod.id)}
                        style={{
                          padding: "3px 10px", borderRadius: 14, fontSize: 10, border: "1px solid", fontWeight: 600,
                          background: has ? "var(--ne-success-soft)" : "var(--ne-bg)",
                          color: has ? "var(--ne-success)" : "var(--ne-muted-2)",
                          borderColor: has ? "var(--ne-success)" : "var(--ne-border)",
                          cursor: "pointer",
                        }}>
                        {has ? "✓ " : ""}{mod.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}