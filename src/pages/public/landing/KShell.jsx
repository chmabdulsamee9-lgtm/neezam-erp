// Shared page shell for the five Kahani versions: same nav, sections and tail as Kahani, own story hero.
import { LPNav } from "./shared";
import { ContentShell, useHomeRoot } from "./ContentPage";
import { FeatureGrid, NetworkFlow, KineticRows, Timeline, StoryTail, Marquee } from "./StoryKit";
import { Stats } from "./D2Story";
import { K } from "./kcontent";
import "./kstories.css";

export function makeKahani(id, Story, order) {
  function Home() {
    const { c, lang, setLang, root } = useHomeRoot();
    const k = K[lang === "en" ? "en" : "ur"][id];
    const block = {
      stats: <Stats key="stats" c={c} />,
      marquee: <Marquee key="marquee" />,
      features: <FeatureGrid key="features" c={c} />,
      network: <NetworkFlow key="network" lang={lang} />,
      kinetic: <KineticRows key="kinetic" scroller={root} />,
      timeline: <Timeline key="timeline" c={c} scroller={root} />,
    };
    return (
      <div ref={root} className={`lp-root d2 ${id}`}>
        <LPNav c={c} lang={lang} setLang={setLang} className="d2-nav" logoDark />
        <Story c={c} k={k} lang={lang} scroller={root} />
        {order.map((b) => block[b])}
        <StoryTail c={c} />
      </div>
    );
  }
  return function KahaniVersion({ page }) {
    if (page !== "home") return <ContentShell page={page} rootClass={`d2 ${id}`} navClass="d2-nav" appTheme="dark" logoDark />;
    return <Home />;
  };
}
