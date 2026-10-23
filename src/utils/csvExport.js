// Client-side CSV export helpers (Blob + anchor download, no backend storage). Relocated
// out of FinanceStatement.jsx so other pages (e.g. BookedOrders.jsx) can reuse the exact
// same escaping/download logic instead of duplicating it.
export const csvEscapeCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const sanitizeFilenamePart = (s) => String(s || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || "store";

export const downloadCsv = (filename, csvContent) => {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Generic builder: headers is an array of header strings, rows is an array of row-arrays
// (already in the same order as headers). Every cell goes through csvEscapeCell.
export const buildCsvFromRows = (headers, rows) => {
  const lines = [headers.map(csvEscapeCell).join(",")];
  rows.forEach((row) => {
    lines.push(row.map(csvEscapeCell).join(","));
  });
  return lines.join("\r\n");
};
