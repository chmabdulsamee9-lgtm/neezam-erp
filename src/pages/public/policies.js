// Refund / Return / Cancellation, Shipping (service delivery) and FAQ pages of eneezam.com.
// Written for the payment-gateway (State Bank) website checks, Nov 2026. Placeholders {email} {phone} {address} {hours}
// are filled from legal.js. Plan prices come from landing/content.js (PLANS) so the two never disagree.
import { PLANS } from "./landing/content";

const price = (id) => {
  const p = PLANS.find((x) => x.id === id);
  return p ? `Rs ${p.price.toLocaleString("en-PK")}` : "";
};
const PRICES_EN = `Essential ${price("essential")}, Grow ${price("grow")} and Advance ${price("advance")} per month, and Shopify Connect only Rs 3,000 per month. All prices are in Pakistani Rupees (PKR).`;
const PRICES_UR = `Essential ${price("essential")}, Grow ${price("grow")} aur Advance ${price("advance")} mahana, aur sirf Shopify Connect Rs 3,000 mahana. Tamam qeematein Pakistani Rupee (PKR) mein hain.`;

export const POLICIES = {
  en: {
    refund: {
      title: "Refund, Return & Cancellation Policy",
      intro: "eNeezam sells monthly software subscriptions (plans) to businesses in Pakistan. This policy explains how payments, cancellations and refunds work. Questions: {email} or {phone} (Phone / WhatsApp), {hours}.",
      sections: [
        { title: "1. What you pay for", body: `eNeezam plans give your business access to the eNeezam online platform (orders, online store, courier booking, WhatsApp, ads and accounts tools). Current plans: ${PRICES_EN} The price shown on our Pricing page at the time of payment is the price you pay.` },
        { title: "2. Billing", body: "Plans are paid in advance for one month at a time. Payment is made online by debit/credit card or mobile wallet through our licensed payment partner. Your plan is activated after the payment is confirmed, and you receive a confirmation by email, SMS or WhatsApp." },
        { title: "3. Cancellation", body: "You can cancel your plan at any time by contacting us at {email} or on Phone / WhatsApp {phone}. After cancellation you are not charged again. Your account keeps working until the end of the month you have already paid for." },
        { title: "4. Refunds", body: "A month that has already started is not refundable, fully or partly, because the service is delivered online and is available to you from the moment the plan is activated. We do give a full refund in these cases: (a) you were charged twice for the same month; (b) you were charged after you had cancelled; (c) you were charged a wrong amount; (d) the payment was taken but your plan was not activated and we could not activate it within 3 working days." },
        { title: "5. How to ask for a refund", body: "Write to {email} or WhatsApp {phone} within 7 days of the payment, with your store name, the payment date, the amount and the transaction ID. We reply within 3 working days. An approved refund is sent back to the same card or wallet used for the payment within 7 to 14 working days (the exact time depends on your bank or wallet)." },
        { title: "6. Returns", body: "eNeezam does not sell physical goods, so there is nothing to return. Products sold by merchants on stores built with eNeezam are sold by those merchants, and their own return and refund policies apply. Customers of those stores should contact the store directly." },
        { title: "7. Changes and contact", body: "If we change this policy we update this page and the date above. eNeezam, {address}. Email {email}, Phone / WhatsApp {phone}, {hours}." },
      ],
    },
    shipping: {
      title: "Shipping & Service Delivery Policy",
      intro: "eNeezam is an online software service. Nothing is shipped to you physically. This page explains how and when the service is delivered.",
      sections: [
        { title: "1. Delivery method", body: "Your plan is delivered online. After your payment is confirmed your eNeezam account is upgraded, and you use the service in your web browser at portal.eneezam.com. There are no shipping or delivery charges." },
        { title: "2. Delivery time", body: "Plans are normally activated within a few minutes of a confirmed payment, and always within 24 hours. If your plan is not active within 24 hours, contact us at {email} or {phone} ({hours}) and we will activate it or refund you (see the Refund Policy)." },
        { title: "3. Setup services", body: "Store setup with Neezi AI and other setup work included in a plan are delivered inside your eNeezam portal. Their progress is shown in the portal, and we contact you on WhatsApp or email if we need anything from you." },
        { title: "4. Service area", body: "eNeezam serves businesses in Pakistan. Prices are in Pakistani Rupees (PKR)." },
        { title: "5. Orders of merchants' stores", body: "Merchants who use eNeezam ship their own products to their own customers through their chosen courier. Delivery times, shipping charges and tracking for those orders are set by the merchant and the courier, not by eNeezam." },
        { title: "6. Contact", body: "eNeezam, {address}. Email {email}, Phone / WhatsApp {phone}, {hours}." },
      ],
    },
    faq: {
      title: "Frequently Asked Questions",
      intro: "Short answers to common questions. Anything else: {email} or Phone / WhatsApp {phone}, {hours}.",
      sections: [
        { title: "What is eNeezam?", body: "An online platform for Pakistani online sellers: orders from Shopify and your own eNeezam store, WhatsApp order confirmation, courier booking, ads and profit reports, in one place." },
        { title: "How much does it cost?", body: PRICES_EN + " Every plan has unlimited orders." },
        { title: "How do I pay?", body: "Online by debit/credit card or mobile wallet through our licensed payment partner. Plans are paid one month at a time, in advance." },
        { title: "When does my plan start?", body: "Normally a few minutes after the payment is confirmed, and always within 24 hours. Nothing is shipped; you use eNeezam in your browser." },
        { title: "Can I cancel?", body: "Yes, at any time, by email or WhatsApp. You will not be charged again, and your account works until the end of the month you paid for." },
        { title: "Do you give refunds?", body: "A month that has started is not refundable. Double charges, charges after cancellation, wrong amounts, and payments where the plan could not be activated are refunded in full. Details are in our Refund Policy." },
        { title: "Is my data safe?", body: "Your data is stored with secure cloud providers and is only used to run your account. You can ask us to delete it at any time. Details are in our Privacy Policy." },
        { title: "Does eNeezam sell products to customers?", body: "No. eNeezam sells software to businesses. Products on stores built with eNeezam are sold by those businesses, under their own policies." },
        { title: "How do I contact support?", body: "Email {email}, Phone / WhatsApp {phone}, {hours}. Address: {address}." },
      ],
    },
  },
  ur: {
    refund: {
      title: "Refund, Return aur Cancellation Policy",
      intro: "eNeezam Pakistan ke businesses ko mahana software plans (subscription) bechta hai. Is policy mein payment, cancellation aur refund ka tareeqa likha hai. Sawal: {email} ya {phone} (Phone / WhatsApp), {hours}.",
      sections: [
        { title: "1. Aap kis cheez ki payment karte hain", body: `eNeezam plan se aap ke business ko eNeezam online platform milta hai (orders, online store, courier booking, WhatsApp, ads aur hisab ke tools). Maujooda plans: ${PRICES_UR} Payment ke waqt Pricing page par jo qeemat likhi ho, wahi lagti hai.` },
        { title: "2. Billing", body: "Plan ki payment har mahine pehle se hoti hai. Payment online debit/credit card ya mobile wallet se, hamare licensed payment partner ke zariye hoti hai. Payment confirm hone ke baad plan chalu hota hai aur aap ko email, SMS ya WhatsApp par confirmation milti hai." },
        { title: "3. Cancellation", body: "Aap kabhi bhi {email} par email ya {phone} par WhatsApp karke plan cancel kar sakte hain. Cancel ke baad dobara charge nahi hota. Jis mahine ki payment ho chuki hai, uske khatam hone tak account chalta rahega." },
        { title: "4. Refund", body: "Jo mahina shuru ho chuka ho uska poora ya aadha refund nahi hota, kyunke service online hai aur plan chalu hote hi aap ke liye haazir hoti hai. In soorton mein poora paisa wapas hota hai: (a) ek hi mahine ki payment do dafa kat gayi; (b) cancel karne ke baad payment kati; (c) ghalat raqam kati; (d) payment kat gayi lekin plan chalu nahi hua aur hum 3 working days mein chalu na kar sake." },
        { title: "5. Refund kaise mangein", body: "Payment ke 7 din ke andar {email} par likhein ya {phone} par WhatsApp karein: store ka naam, payment ki tareekh, raqam aur transaction ID. Hum 3 working days mein jawab dete hain. Manzoor refund usi card ya wallet mein 7 se 14 working days mein wapas aata hai (bank ya wallet par depend karta hai)." },
        { title: "6. Return", body: "eNeezam koi physical saamaan nahi bechta, is liye wapas karne ko kuch nahi. eNeezam par bane stores ke products wo merchants bechte hain, aur un par unki apni return aur refund policy lagti hai. Aise store ke customers seedha us store se rabta karein." },
        { title: "7. Tabdeeli aur rabta", body: "Is policy mein tabdeeli hui to ye page aur upar ki tareekh badal di jayegi. eNeezam, {address}. Email {email}, Phone / WhatsApp {phone}, {hours}." },
      ],
    },
    shipping: {
      title: "Shipping aur Service Delivery Policy",
      intro: "eNeezam ek online software service hai. Aap ko koi cheez courier se nahi bheji jaati. Is page par likha hai ke service kaise aur kab milti hai.",
      sections: [
        { title: "1. Delivery ka tareeqa", body: "Plan online milta hai. Payment confirm hone par aap ka eNeezam account upgrade ho jaata hai aur aap service browser mein portal.eneezam.com par istemal karte hain. Koi shipping ya delivery charges nahi." },
        { title: "2. Delivery ka waqt", body: "Payment confirm hone ke chand minute mein plan chalu ho jaata hai, aur har haal mein 24 ghante ke andar. Agar 24 ghante mein chalu na ho to {email} ya {phone} par rabta karein ({hours}), hum chalu kar denge ya paisa wapas kar denge (Refund Policy dekhein)." },
        { title: "3. Setup services", body: "Neezi AI se store setup aur plan mein shamil doosra setup kaam aap ke eNeezam portal ke andar diya jaata hai. Kaam ki progress portal mein nazar aati hai, aur kuch chahiye ho to hum WhatsApp ya email par rabta karte hain." },
        { title: "4. Service area", body: "eNeezam Pakistan ke businesses ke liye hai. Qeematein Pakistani Rupee (PKR) mein hain." },
        { title: "5. Merchants ke stores ke orders", body: "eNeezam istemal karne wale merchants apne products apne customers ko apne chune hue courier se bhejte hain. Un orders ki delivery ka waqt, shipping charges aur tracking merchant aur courier tay karte hain, eNeezam nahi." },
        { title: "6. Rabta", body: "eNeezam, {address}. Email {email}, Phone / WhatsApp {phone}, {hours}." },
      ],
    },
    faq: {
      title: "Aam Sawalat (FAQ)",
      intro: "Aam sawalon ke mukhtasar jawab. Koi aur sawal: {email} ya Phone / WhatsApp {phone}, {hours}.",
      sections: [
        { title: "eNeezam kya hai?", body: "Pakistani online sellers ke liye online platform: Shopify aur apne eNeezam store ke orders, WhatsApp par order confirmation, courier booking, ads aur munafe ki reports, sab ek jagah." },
        { title: "Kitne paise lagte hain?", body: PRICES_UR + " Har plan mein unlimited orders." },
        { title: "Payment kaise karein?", body: "Online debit/credit card ya mobile wallet se, hamare licensed payment partner ke zariye. Payment har mahine pehle se hoti hai." },
        { title: "Plan kab chalu hota hai?", body: "Payment confirm hone ke chand minute baad, aur har haal mein 24 ghante ke andar. Kuch bheja nahi jaata; aap eNeezam browser mein istemal karte hain." },
        { title: "Kya main cancel kar sakta hoon?", body: "Ji, kabhi bhi, email ya WhatsApp par bata kar. Dobara charge nahi hoga, aur jis mahine ki payment ki hai uske aakhir tak account chalega." },
        { title: "Kya refund milta hai?", body: "Shuru ho chuke mahine ka refund nahi hota. Double payment, cancel ke baad payment, ghalat raqam, aur aisi payment jis par plan chalu na ho saka, in sab ka poora paisa wapas hota hai. Tafseel Refund Policy mein hai." },
        { title: "Kya mera data mehfooz hai?", body: "Aap ka data mehfooz cloud providers ke paas rehta hai aur sirf aap ka account chalane ke liye istemal hota hai. Aap kabhi bhi delete karwa sakte hain. Tafseel Privacy Policy mein hai." },
        { title: "Kya eNeezam customers ko products bechta hai?", body: "Nahi. eNeezam businesses ko software bechta hai. eNeezam par bane stores ke products wo businesses apni policies ke saath bechte hain." },
        { title: "Support se kaise rabta karein?", body: "Email {email}, Phone / WhatsApp {phone}, {hours}. Pata: {address}." },
      ],
    },
  },
};
