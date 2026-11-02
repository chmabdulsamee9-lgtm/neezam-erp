// Pakistani local number (03XXXXXXXXX) -> wa.me format (92XXXXXXXXXX); same rule the Shopify orders list uses.
export const toWhatsAppPhone = (localPhone) => {
  if (!localPhone) return "";
  const digits = String(localPhone).replace(/\D/g, "");
  return digits.startsWith("0") ? "92" + digits.slice(1) : digits;
};
