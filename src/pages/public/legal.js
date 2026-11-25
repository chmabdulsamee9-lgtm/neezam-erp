// One place for the details that appear on the legal pages (privacy, terms, refund, shipping, FAQ) and in the footers.
// The address must match the utility bill given to the payment gateway (Rapid Gateway KYC, Nov 2026).
export const LEGAL = {
  businessName: "eNeezam",
  contactEmail: "support@eneezam.com",
  phone: "0315 2433123",
  whatsappLink: "https://wa.me/923152433123",
  address: "1st Floor, Shah Plaza, Near Moti Masjid, Banso Wala Bazar Chowk, Gawalmandi, Sarai Rattan Chand, Lahore, Pakistan",
  hours: { en: "Every day, 10:00 AM to 10:00 PM (Pakistan time)", ur: "Rozana, subah 10 baje se raat 10 baje tak (Pakistan time)" },
  lastUpdated: "24 November 2026",
};

/** replaces the {email}, {phone}, {address} and {hours} placeholders of a translated legal text */
export const withContact = (text, lang = "en") =>
  String(text)
    .replaceAll("{email}", LEGAL.contactEmail)
    .replaceAll("{phone}", LEGAL.phone)
    .replaceAll("{address}", LEGAL.address)
    .replaceAll("{hours}", LEGAL.hours[lang === "en" ? "en" : "ur"]);
