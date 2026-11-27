// /nex-terms: the NeX (Neezam Express) terms and policy merchants accept in the NeX KYC (NexKyc.jsx). Public page.
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";
import { NexTerms } from "../NexKyc";

export default function NexTermsPage() {
  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "2.5rem 1rem 4rem", display: "grid", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>NeX terms aur policy</h1>
          <p style={{ margin: "6px 0 0", color: "var(--ne-muted)", fontSize: 13.5 }}>NeX (Neezam Express), eNeezam ki courier service · version 2026-11</p>
        </div>
        <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 16, padding: 20 }}><NexTerms /></div>
        <p style={{ margin: 0, color: "var(--ne-muted)", fontSize: 13 }}>Sawal ke liye: support@eneezam.com</p>
      </main>
      <PublicFooter />
    </div>
  );
}
