// One place for the details that appear on the legal pages (privacy, terms, data deletion).
export const LEGAL = {
  contactEmail: "support@eneezam.com",
  lastUpdated: "7 November 2026",
};

/** replaces the {email} placeholder of a translated legal text */
export const withContact = (text) => String(text).replaceAll("{email}", LEGAL.contactEmail);
