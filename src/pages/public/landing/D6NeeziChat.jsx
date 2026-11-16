// Design 6 "Neezi Chat": the page is a conversation. The visitor picks their problem, Neezi types an
// answer and the matching screen of the real app slides in beside it.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, Magnet, goSignup, useInView } from "./shared";
import { AppScreen } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH, PAGE_ORDER, PAGE_ICONS } from "./pages";
import "./d6.css";

const Q = {
  ur: [
    ["Confirmation calls se thak gaya hoon", "whatsapp"], ["Returns bohot zyada hain", "returns"], ["Ads chal rahe hain, munafa nahi", "ads"],
    ["Courier ka hisab nahi milta", "courier"], ["Apna store chahiye", "store"], ["Asal profit kitna hai?", "finance"],
  ],
  en: [
    ["I'm tired of confirmation calls", "whatsapp"], ["Too many returns", "returns"], ["Ads run, profit doesn't", "ads"],
    ["Courier money never adds up", "courier"], ["I want my own store", "store"], ["What's my real profit?", "finance"],
  ],
};

export default function D6NeeziChat({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d6" navClass="d6-nav" appTheme="dark" logoDark />;
  return <D6Home />;
}

function D6Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const L = lang === "en" ? "en" : "ur";
  const P = PAGES[L];
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const [screen, setScreen] = useState(null);
  const box = useRef(null), chat = useRef(null);
  const seen = useInView(chat, 0.4);
  const started = useRef(false);
  const ask = (q, k) => {
    if (typing) return;
    setMsgs((m) => [...m, { me: true, text: q }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { me: false, text: P[k].sub, k }]);
      setScreen(P[k].screen);
    }, 1100);
  };
  useEffect(() => {
    if (seen && !started.current) { started.current = true; const t = setTimeout(() => ask(...Q[L][0]), 900); return () => clearTimeout(t); }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, typing]);
  const hello = lang === "en" ? "Hi, I'm Neezi! Tell me what's hard in your business, and I'll show you how eNeezam fixes it." : "Assalam o Alaikum, main Neezi hoon! Bataiye business mein kya mushkil hai, main dikhata hoon eNeezam kaise hal karta hai.";
  return (
    <div ref={root} className="lp-root d6">
      <div className="d6-bg" aria-hidden="true" />
      <LPNav c={c} lang={lang} setLang={setLang} className="d6-nav" logoDark />
      <section className="d6-hero">
        <div className="lp-wrap d6-hero-in">
          <div className="d6-hero-txt">
            <span className="d6-tag" data-rv="up"><img src="/brand/neezi/neezi-wave.webp" alt="" width="26" height="24" /> Neezi AI · eNeezam</span>
            <h1 data-rv="up" style={{ "--d": "80ms" }}>{lang === "en" ? <>Tell Neezi the problem.<br /><span className="lp-grad-t">See it solved.</span></> : <>Neezi ko masla batayein.<br /><span className="lp-grad-t">Hal khud dekhein.</span></>}</h1>
            <p data-rv="up" style={{ "--d": "160ms" }}>{c.hero.sub}</p>
            <div data-rv="up" style={{ "--d": "240ms" }} className="d6-cta"><Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet></div>
          </div>
          <div ref={chat} className="d6-chat" data-rv="scale">
            <div className="d6-chat-top"><img src="/brand/neezi/neezi-wave.webp" alt="" width="40" height="37" /><div><b>Neezi</b><span>{typing ? (lang === "en" ? "typing…" : "likh raha hai…") : "online"}</span></div></div>
            <div ref={box} className="d6-msgs">
              <div className="d6-msg bot">{hello}</div>
              {msgs.map((m, i) => (
                <div key={i} className={`d6-msg ${m.me ? "me" : "bot"}`}>
                  {m.text}
                  {!m.me && <button className="d6-msg-link" onClick={() => navigate(PAGE_PATH[m.k])}>{P[m.k].nav} <Icon name="arrowRight" size={11} /></button>}
                </div>
              ))}
              {typing && <div className="d6-msg bot d6-typing"><i /><i /><i /></div>}
            </div>
            <div className="d6-chips">{Q[L].map(([q, k]) => <button key={k} onClick={() => ask(q, k)} disabled={typing}>{q}</button>)}</div>
          </div>
          <div className={`d6-screen ${screen ? "on" : ""}`} aria-hidden={!screen}>{screen && <AppScreen key={screen} screen={screen} theme="dark" />}</div>
        </div>
      </section>

      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
          <div className="d6-grid">
            {PAGE_ORDER.map((k, i) => (
              <button key={k} className="d6-card" data-rv="up" style={{ "--d": `${(i % 4) * 60}ms` }} onClick={() => navigate(PAGE_PATH[k])}>
                <span><Icon name={PAGE_ICONS[k]} size={16} /></span><b>{P[k].nav}</b><p>{P[k].features[0].d}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
      <div id="how" />
      <HomeTail c={c} logoDark />
    </div>
  );
}
