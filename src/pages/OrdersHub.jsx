import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "../supabase";
import { useLanguage, useTranslation } from "../i18n";
import { workerFetch } from "../lib/storeApi";

// Orders entry point. The existing Shopify Orders page is untouched and stays the default; stores that sell
// on their own eNeezam storefront (a verified primary domain, or any native order) also get an "eNeezam"
// tab. Two sources are NOT merged into one list: the Shopify list is paginated and counted on the server
// from its own cache tables, so a merge would change its behavior; a source switch is the least risky option.
const Orders = lazy(() => import("./Orders"));
const EneezamOrders = lazy(() => import("./EneezamOrders"));

export default function OrdersHub(props) {
  const { storeId, cfUrl } = props;
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [hasNative, setHasNative] = useState(false);
  const [source, setSource] = useState(() => { try { return sessionStorage.getItem("orders-source") === "eneezam" ? "eneezam" : "shopify"; } catch { return "shopify"; } });

  useEffect(() => {
    let alive = true;
    setHasNative(false);
    if (!storeId) return undefined;
    (async () => {
      const [dom, list] = await Promise.all([
        supabase.from("stores").select("id, store_custom_domains(domain, role, status)").eq("id", storeId).maybeSingle(),
        workerFetch(cfUrl, `/list-store-orders?store_id=${storeId}&limit=1`),
      ]);
      if (!alive) return;
      const domains = dom.data?.store_custom_domains || [];
      const hasDomain = domains.some((d) => d.role === "primary" && d.status === "active");
      setHasNative(hasDomain || (list.status === 200 && Number(list.data?.total) > 0));
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]);

  const choose = (s) => { setSource(s); try { sessionStorage.setItem("orders-source", s); } catch { /* ignore */ } };
  const active = hasNative ? source : "shopify";
  const fallback = <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;

  return (
    <>
      {hasNative && (
        <div style={{ display: "flex", gap: 8, padding: "10px 1.25rem 0" }} role="tablist" aria-label={t("eneezamOrders.sourceLabel")}>
          {[["shopify", t("eneezamOrders.sourceShopify")], ["eneezam", t("eneezamOrders.sourceEneezam")]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => choose(id)}
              style={{ padding: "6px 16px", borderRadius: 18, border: "1px solid var(--ne-border)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: active === id ? "var(--ne-accent)" : "transparent", color: active === id ? "#fff" : "var(--ne-text)" }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <Suspense fallback={fallback}>
        {active === "eneezam" ? <EneezamOrders storeId={storeId} cfUrl={cfUrl} /> : <Orders {...props} />}
      </Suspense>
    </>
  );
}
