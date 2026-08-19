// Hero-stack AWB label — ported from the reference eneezam-label-FINAL.html mockup into
// a real print flow wired to actual order data. Field-resolution priority (recipient
// name/phone, address, city, items, COD amount) mirrors the worker's /dex-book-order
// handler exactly, so the printed label always matches what was actually booked with Dex.
// JsBarcode/qrcodejs are loaded via CDN <script> tags inside the opened print document only
// (same libraries/approach as the reference mockup) — no npm equivalent was already wired
// into this app, and pulling barcode/QR rendering into the main bundle for a print-only
// feature isn't worth it.
import { supabase } from "../supabase";
// ?inline forces Vite to emit this as a base64 data: URI instead of a build-hashed file
// path — the label document is opened via a Blob URL (its own base URI, unrelated to the
// app's real origin), so a root-relative "/assets/..." path would 404/break there.
import dexLogo from "../assets/couriers/dex.png?inline";

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Orders.jsx ke liveSkuForLineItem() jaisa hi priority chain, is file ke liye mirror kiya
// gaya (koi shared/exported function nahi hai Orders.jsx mein — sirf default export). Priority:
// raw line_item.sku (non-empty) -> variant_id se products_cache lookup -> product_id +
// variant_title se lookup (variant delete/recreate ke baad naya variant_id mila ho to bhi
// recover ho jaye) -> kuch na mile to caller title+variantTitle ko hi SKU-line par dikhata hai.
const normVariantTitleKey = (vt) => (vt && vt !== "Default Title" ? vt : "Default Title");
const displayVariantTitle = (vt) => (vt && vt !== "Default Title" ? vt : "");

function resolveLineItemSkuAndVariant(li, variantMap, productVariantMap) {
  const rawSku = (li?.sku || "").trim();
  let resolvedSku = rawSku;
  let variantInfo = null;

  if (!resolvedSku) {
    const key = li?.variant_id != null ? String(li.variant_id) : null;
    if (key && variantMap[key]) {
      variantInfo = variantMap[key];
      resolvedSku = variantInfo.sku || "";
    }
  }
  if (!resolvedSku) {
    const productId = li?.product_id ?? li?.shopify_product_id;
    if (productId != null) {
      const pvKey = `${productId}::${normVariantTitleKey(li?.variant_title)}`;
      if (productVariantMap[pvKey]) {
        variantInfo = productVariantMap[pvKey];
        resolvedSku = variantInfo.sku || "";
      }
    }
  }

  const resolvedVariantTitle = displayVariantTitle(li?.variant_title) || variantInfo?.variantTitle || "";
  return { sku: resolvedSku, variantTitle: resolvedVariantTitle };
}

// Same resolution order as worker's /dex-book-order: staff-confirmed order_statuses
// (agentData) first, then Shopify shipping_address, then billing_address fallback.
function resolveEneezamLabelData({ raw, agentData, store, pickupAddr, variantMap, productVariantMap }) {
  const customer = raw.customer || {};
  const shippingAddr = raw.shipping_address || {};
  const billingAddr = raw.billing_address || {};

  const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Customer";
  const customerPhone = customer.phone || shippingAddr.phone || billingAddr.phone || "";
  const resolvedAddress = agentData.address || shippingAddr.address1 || billingAddr.address1 || "";
  const resolvedCity = agentData.city || shippingAddr.city || billingAddr.city || "";
  const cityDisplay = agentData.matched_city
    ? (agentData.matched_area ? `${agentData.matched_city} - ${agentData.matched_area}` : agentData.matched_city)
    : resolvedCity;

  const hasOverride = agentData.line_items_override && agentData.line_items_override.length > 0;
  const itemsSource = hasOverride ? agentData.line_items_override : (raw.line_items || []);
  const items = itemsSource.map((li) => {
    const { sku, variantTitle } = resolveLineItemSkuAndVariant(li, variantMap || {}, productVariantMap || {});
    return {
      title: li.title || li.name || "Item",
      variantTitle,
      sku, // "" agar kahin se resolve nahi hui — itemsHtml() display-time par title+variant fallback dikhata hai, dash nahi
      qty: li.quantity || 1,
    };
  });
  const totalQty = items.reduce((sum, i) => sum + (i.qty || 0), 0);

  const totalPrice = hasOverride
    ? agentData.line_items_override.reduce((sum, li) => sum + ((Number(li.price) - (Number(li.discount) || 0)) * (li.quantity || 1)), 0)
    : (Number(raw.total_price) || 0);

  const weight = Number(store?.default_weight_kg) || 0.5;
  const trackingNumber = agentData.dex_tracking_number || "";
  const labelDisplayMode = store?.label_display_mode || "both";

  return {
    labelDisplayMode,
    codAmount: `Rs. ${totalPrice.toLocaleString()}`,
    recipient: { name: customerName, addr: resolvedAddress, city: cityDisplay, phone: customerPhone },
    trackingNumber,
    codeData: `${trackingNumber}, ${totalPrice}`,
    sender: {
      name: pickupAddr?.contact_name || pickupAddr?.label || "eNeezam",
      addr: pickupAddr ? `${pickupAddr.address_line || ""}, ${pickupAddr.city || ""}` : "",
      phone: pickupAddr?.contact_phone || "",
    },
    orderNumber: raw.name || "—",
    weight: `${weight} kg`,
    totalQty,
    createdDate: raw.created_at ? new Date(raw.created_at).toLocaleDateString("en-GB") : "—",
    printDate: new Date().toLocaleDateString("en-GB"),
    items,
  };
}

const LOGO_SVG = `<svg viewBox="0 0 32 32" width="12" height="12"><path d="M6 24 L14 13 L20 18 L27 7" stroke="#5C7CFA" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="6" cy="24" r="3.5" fill="#5C7CFA"/><circle cx="14" cy="13" r="3.5" fill="#5C7CFA"/><circle cx="20" cy="18" r="3.5" fill="#A855F7"/></svg>`;

function itemsHtml(items, displayMode) {
  const mode = displayMode || "both";
  return items
    .map((i) => {
      const showName = mode === "name" || mode === "both";
      const showSku = mode === "sku" || mode === "both";
      const parts = [];
      if (showName) {
        let namePart = `<span class="il-title">${escapeHtml(i.title)}</span>`;
        if (i.variantTitle) {
          namePart += ` <span class="il-variant">- ${escapeHtml(i.variantTitle)}</span>`;
        }
        parts.push(namePart);
      }
      if (showSku) {
        const skuText = i.sku || "—";
        parts.push(`<span class="il-sku">SKU: ${escapeHtml(skuText)}</span>`);
      }
      const infoLine = parts.join(' <span class="il-sep">•</span> ');
      return `<div class="il"><div class="il-info">${infoLine}</div><span class="il-qty">Qty: ${escapeHtml(i.qty)}</span></div>`;
    })
    .join("");
}

function buildLabelHtml(d) {
  const itemCount = (d.items || []).length;
  const scaleTier =
    itemCount <= 4 ? "" :
    itemCount <= 6 ? "items-tier-2" :
    itemCount <= 9 ? "items-tier-3" :
    "items-tier-4";
  return `<div class="label">
    <div class="top">
      <div class="top-logo"><img src="${dexLogo}" alt="Dex" class="dex-logo" /></div>
      <div class="top-opt"><div>STANDARD</div><div>Sales_order</div></div>
    </div>
    <div class="cod-hero"><div class="l">COD</div><div class="r"><div class="amt">${escapeHtml(d.codAmount)}</div><div class="sub">Collectable amount</div></div></div>
    <div class="addr-hero">
      <div class="lbl">Deliver to</div>
      <div class="name">${escapeHtml(d.recipient.name)}</div>
      <div class="line">${escapeHtml(d.recipient.addr)}</div>
      <div class="city">${escapeHtml(d.recipient.city)}</div>
      <div class="phone">Mobile: ${escapeHtml(d.recipient.phone)}</div>
    </div>
    <div class="bc-full"><svg class="bc" data-value="${escapeHtml(d.trackingNumber)}"></svg><div class="tn">${escapeHtml(d.trackingNumber)}</div></div>
    <div class="sender-hero">
      <div class="info">
        <div class="lbl">Sender</div>
        <div class="name">${escapeHtml(d.sender.name)}</div>
        <div class="line">${escapeHtml(d.sender.addr)}</div>
        <div class="phone">Mobile: ${escapeHtml(d.sender.phone)}</div>
      </div>
      <div class="qr" data-value="${escapeHtml(d.codeData)}"></div>
    </div>
    <div class="meta-row"><span>Order: <b>${escapeHtml(d.orderNumber)}</b></span><span>Weight: <b>${escapeHtml(d.weight)}</b></span><span>Total Qty: <b>${escapeHtml(d.totalQty)}</b></span></div>
    <div class="dates-row"><span>Order Created: <b>${escapeHtml(d.createdDate)}</b></span><span>AWB Printed: <b>${escapeHtml(d.printDate)}</b></span></div>
    <div class="items ${scaleTier}"><div class="h">Items in this package</div>${itemsHtml(d.items, d.labelDisplayMode)}</div>
    <div class="footer">${LOGO_SVG}<span>booked via eNeezam</span></div>
  </div>`;
}

// Each label wrapped in its own "page" — break-after between pages (not after the last one,
// so no trailing blank page) so a multi-order print produces one label per physical page.
function buildPagesHtml(dataList) {
  return dataList
    .map((d, i) => {
      const breakStyle = i < dataList.length - 1 ? ' style="page-break-after: always; break-after: page;"' : "";
      return `<div class="label-page"${breakStyle}>${buildLabelHtml(d)}</div>`;
    })
    .join("");
}

function buildDocumentHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A5; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #ccc; padding: 20px; }
  .controls { display: flex; justify-content: center; margin-bottom: 16px; }
  .controls button { padding: 8px 20px; border-radius: 8px; border: none; background: #5C7CFA; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
  .stage { display: flex; flex-direction: column; align-items: center; gap: 20px; }
  .label { position: relative; width: 148mm; height: 210mm; background: #fff; color: #000; text-align: left; overflow: hidden; display: flex; flex-direction: column; border: 2px solid #000; }
  .top { display: flex; border-bottom: 2px solid #000; }
  .top-logo { width: 55%; display: flex; align-items: center; justify-content: center; gap: 10px; border-right: 2px solid #000; padding: 14px; }
  .top-logo .dex-logo { height: 40px; width: auto; display: block; }
  .top-opt { flex: 1; display: flex; flex-direction: column; }
  .top-opt div { flex: 1; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; text-align: center; }
  .top-opt div:last-child { border-bottom: none; }
  .cod-hero { background: #111; color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  .cod-hero .l { font-size: 22px; font-weight: bold; }
  .cod-hero .r { text-align: right; }
  .cod-hero .r .amt { font-size: 24px; font-weight: bold; }
  .cod-hero .r .sub { font-size: 10px; opacity: 0.75; }
  .addr-hero { padding: 14px 18px; border-bottom: 2px solid #000; }
  .addr-hero .lbl { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .addr-hero .name { font-size: 20px; font-weight: bold; margin: 3px 0; }
  .addr-hero .line { font-size: 13px; line-height: 1.45; }
  .addr-hero .city { font-size: 15px; font-weight: bold; margin-top: 4px; }
  .addr-hero .phone { font-size: 13px; margin-top: 3px; font-weight: bold; }
  .bc-full { padding: 13px 18px; text-align: center; border-bottom: 2px solid #000; display: flex; flex-direction: column; justify-content: center; }
  .bc-full svg { width: 90%; height: 69px; display: block; margin: 0 auto; }
  .bc-full .tn { font-size: 13px; font-weight: bold; margin-top: 4px; }
  .sender-hero { padding: 10px 18px; border-bottom: 2px solid #000; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .sender-hero .info { flex: 1; }
  .sender-hero .lbl { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .sender-hero .name { font-size: 13px; font-weight: bold; margin: 2px 0; }
  .sender-hero .line { font-size: 11px; line-height: 1.35; color: #333; }
  .sender-hero .phone { font-size: 11px; margin-top: 2px; }
  .sender-hero .qr canvas, .sender-hero .qr img { width: 56px !important; height: 56px !important; }
  .meta-row { padding: 7px 18px; font-size: 10.5px; border-bottom: 2px solid #000; display: flex; justify-content: space-between; gap: 8px; }
  .dates-row { padding: 6px 18px; font-size: 10px; border-bottom: 2px solid #000; display: flex; justify-content: space-between; color: #444; }
  .meta-row b { font-weight: bold; }
  .items { flex: 1; padding: 10px 18px; overflow: hidden; min-height: 0; }
  .items .h { font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 6px; }
  .il {
    display: flex; align-items: baseline;
    justify-content: space-between; gap: 8px;
    margin-bottom: 2px; padding: 2px 0;
    border-bottom: 1px dashed #ccc;
    font-size: 13px;
  }
  .il-info { flex: 1; min-width: 0; }
  .il-title { font-weight: bold; font-size: 14px; }
  .il-variant { font-weight: normal; color: #555; font-size: 13px; }
  .il-sep { color: #999; margin: 0 2px; }
  .il-sku { color: #333; font-weight: bold; font-size: 13px; }
  .il-qty { flex-shrink: 0; white-space: nowrap; font-weight: 600; font-size: 14px; }

  .items-tier-2 .il { margin-bottom: 2px; padding: 1px 0; }
  .items-tier-2 .il-title { font-size: 12px; }
  .items-tier-2 .il-variant, .items-tier-2 .il-sku { font-size: 11px; }
  .items-tier-2 .il-qty { font-size: 12px; }

  .items-tier-3 .il { margin-bottom: 1px; padding: 1px 0; }
  .items-tier-3 .il-title { font-size: 11px; }
  .items-tier-3 .il-variant, .items-tier-3 .il-sku { font-size: 10px; }
  .items-tier-3 .il-qty { font-size: 11px; }

  .items-tier-4 .il { margin-bottom: 1px; padding: 0.5px 0; }
  .items-tier-4 .il-title { font-size: 10px; line-height: 1.15; }
  .items-tier-4 .il-variant, .items-tier-4 .il-sku { font-size: 9px; }
  .items-tier-4 .il-qty { font-size: 10px; }
  .footer { position: static; flex-shrink: 0; margin-top: auto; text-align: center; padding: 6px; border-top: 2px solid #000; background: #fff; display: flex; align-items: center; justify-content: center; gap: 5px; }
  .footer svg { width: 12px; height: 12px; }
  .footer span { font-size: 8px; color: #888; }
  @media print {
    body { background: #fff; padding: 0; }
    .controls { display: none; }
    .stage { gap: 0; }
  }
</style>
</head>
<body>
<div class="controls"><button onclick="window.print()">Print</button></div>
<div class="stage" id="stage">${bodyHtml}</div>
<script>
  function renderCodes() {
    document.querySelectorAll(".bc").forEach(function (el) {
      JsBarcode(el, el.dataset.value, { format: "CODE128", displayValue: false, height: 52, margin: 0 });
      // JsBarcode sets its own natural width/height on the svg. Setting viewBox to
      // the barcode's real rendered size + preserveAspectRatio="xMidYMid meet" scales
      // it uniformly (no squish) to fit within the CSS box, centered — "none" used to
      // stretch it non-uniformly to fill width:100%, distorting the bars.
      var bbox = el.getBBox();
      el.setAttribute("viewBox", "0 0 " + bbox.width + " " + bbox.height);
      el.setAttribute("preserveAspectRatio", "xMidYMid meet");
    });
    document.querySelectorAll(".qr").forEach(function (el) {
      el.innerHTML = "";
      new QRCode(el, { text: el.dataset.value, width: 56, height: 56, correctLevel: QRCode.CorrectLevel.M });
    });
  }
  if (window.QRCode && window.JsBarcode) { renderCodes(); }
  else { window.addEventListener("load", renderCodes); }
</script>
</body>
</html>`;
}

// window.open()+document.write renders as a small popup (window-feature strings are only a
// hint browsers frequently ignore/downgrade). Building the doc into a Blob and clicking a
// programmatic <a target="_blank"> instead reliably opens a full new tab.
function openLabelDocument(html) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function fetchLabelDeps(storeId) {
  const { data: storeRow } = await supabase.from("stores").select("default_weight_kg, label_display_mode").eq("id", storeId).single();
  const { data: addrRows } = await supabase.from("pickup_addresses").select("*").eq("store_id", storeId).order("created_at");
  const pickupAddr = (addrRows || []).find((a) => a.is_default) || (addrRows || [])[0] || null;

  // Orders.jsx ka variantSkuMap/productVariantSkuMap jaisa hi do-tier lookup, is file ke
  // liye mirror kiya gaya — variant_id-tier pehle try hoti hai, product_id+variant_title-tier
  // fallback (variant delete/recreate ke baad naya variant_id mila ho to bhi SKU recover ho).
  const { data: productsRows } = await supabase
    .from("products_cache")
    .select("shopify_product_id, raw_data->title, raw_data->variants")
    .eq("store_id", storeId);

  const variantMap = {};
  const productVariantMap = {};
  (productsRows || []).forEach((p) => {
    (p.variants || []).forEach((v) => {
      const variantTitle = displayVariantTitle(v?.title);
      const info = { sku: v?.sku || "", title: p.title || "", variantTitle };
      if (v?.id != null) variantMap[String(v.id)] = info;
      if (p.shopify_product_id != null) {
        productVariantMap[`${p.shopify_product_id}::${normVariantTitleKey(v?.title)}`] = info;
      }
    });
  });

  return { storeRow, pickupAddr, variantMap, productVariantMap };
}

// order = an entry from BookedOrders.jsx's `orders` array (agent_data = order_statuses row).
// Fetches the full Shopify raw_data + store defaults + pickup address fresh (BookedOrders.jsx's
// list only carries a lightweight subset — no line_items/billing_address on it) so the label
// always reflects the same source data /dex-book-order itself reads from.
export async function printEneezamLabel({ order, storeId }) {
  const orderId = order.agent_data?.order_id;
  if (!orderId) {
    alert("This is a manual/unmatched order (no linked Shopify order) — an eNeezam label can't be built for it.");
    return;
  }
  const [{ data: cacheRow }, { storeRow, pickupAddr, variantMap, productVariantMap }] = await Promise.all([
    supabase.from("shopify_orders_cache").select("raw_data").eq("id", orderId).single(),
    fetchLabelDeps(storeId),
  ]);
  const raw = cacheRow?.raw_data || {};
  const d = resolveEneezamLabelData({ raw, agentData: order.agent_data || {}, store: storeRow, pickupAddr, variantMap, productVariantMap });
  openLabelDocument(buildDocumentHtml(`eNeezam Shipping Label — ${d.orderNumber}`, buildPagesHtml([d])));
}

// Bulk variant for BookedOrders.jsx's multi-select — concatenates every selected order's
// label into ONE print-ready document (page-break-after between labels) instead of one
// window per order. Manual/unmatched orders (no linked Shopify order) are skipped the same
// way the single-order print blocks them, with a summary alert instead of silently dropping them.
export async function printEneezamLabelsMerged({ orders, storeId }) {
  const skippedNames = [];
  const bookable = [];
  orders.forEach((o) => {
    if (o.agent_data?.order_id) bookable.push(o);
    else skippedNames.push(o.name || o.id);
  });
  if (bookable.length === 0) {
    alert("None of the selected orders can be printed as eNeezam labels — all are manual/unmatched orders (no linked Shopify order).");
    return;
  }

  const orderIds = bookable.map((o) => o.agent_data.order_id);
  const [{ data: cacheRows }, { storeRow, pickupAddr, variantMap, productVariantMap }] = await Promise.all([
    supabase.from("shopify_orders_cache").select("id, raw_data").in("id", orderIds),
    fetchLabelDeps(storeId),
  ]);
  const rawMap = {};
  (cacheRows || []).forEach((r) => { rawMap[r.id] = r.raw_data; });

  const dataList = bookable.map((o) =>
    resolveEneezamLabelData({ raw: rawMap[o.agent_data.order_id] || {}, agentData: o.agent_data || {}, store: storeRow, pickupAddr, variantMap, productVariantMap })
  );

  if (skippedNames.length > 0) {
    alert(`${skippedNames.length} manual/unmatched order(s) skipped (no linked Shopify order): ${skippedNames.join(", ")}`);
  }

  openLabelDocument(buildDocumentHtml(`eNeezam Shipping Labels (${dataList.length})`, buildPagesHtml(dataList)));
}
