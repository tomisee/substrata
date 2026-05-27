import Link from "next/link";
import { TOPICS, liveTopics } from "@/lib/topics";
import HeroPreview from "@/components/HeroPreview";

export default function Home() {
  const liveCount = liveTopics().length;
  const plannedCount = TOPICS.length - liveCount;

  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="kicker">interactive systems explainers</div>
            <h1>
              Understand the layer <em>beneath</em> the one you work in.
            </h1>
            <p>
              Each piece here is a working model, not a diagram — poke at the inputs and watch the
              real mechanics respond. Built to grow: every topic I learn well enough to simulate
              becomes a new page.
            </p>
            <div className="hero-stats">
              <div className="stat">
                <div className="stat-num">{liveCount}</div>
                <div className="stat-label">live topics</div>
              </div>
              <div className="stat">
                <div className="stat-num">{plannedCount}</div>
                <div className="stat-label">planned</div>
              </div>
              <div className="stat">
                <div className="stat-num">100%</div>
                <div className="stat-label">client-side</div>
              </div>
            </div>
          </div>
          <div className="hero-preview-slot">
            <HeroPreview />
            <div className="hero-preview-caption mono">
              ↑ topic 01 running in miniature — open it to change the access pattern
            </div>
          </div>
        </div>
        <div className="hero-glow" />
      </section>

      <div className="wrap">
        <div className="section-label mono" id="index"><span>{"// topic index"}</span></div>
        <div className="topics">
          {TOPICS.map((t) => {
            const planned = t.status === "planned";
            const card = (
              <div className={`card ${planned ? "soon" : ""}`}>
                <div className="card-head">
                  <span className="idx mono">{t.index}</span>
                  {planned && <span className="badge mono">soon</span>}
                </div>
                <h3>{t.title}</h3>
                <p>{t.blurb}</p>
                <span
                  className="tag mono"
                  style={planned ? {} : { color: `var(${t.accent})`, borderColor: `var(${t.accent})` }}
                >
                  {t.tag}
                </span>
              </div>
            );
            return planned ? (
              <div key={t.slug} aria-disabled="true">{card}</div>
            ) : (
              <Link key={t.slug} href={`/topics/${t.slug}`} style={{ color: "inherit" }}>
                {card}
              </Link>
            );
          })}
        </div>

        <div className="section-label mono" id="about"><span>{"// about"}</span></div>
        <div className="about mono">
          <p>
            substrata is a portfolio built around a simple loop: pick a low-level concept, learn it
            well enough to <b>simulate</b> it correctly, and ship the simulation as an interactive
            page. The constraint forces real understanding — you can&apos;t fake a working model.
          </p>
          <p style={{ marginTop: 14 }}>
            on the bench: <span style={{ color: "var(--violet)" }}>floating-point rounding</span> ·{" "}
            <span style={{ color: "var(--amber)" }}>the stack frame</span> ·{" "}
            <span style={{ color: "var(--cyan)" }}>encryption</span>
          </p>
        </div>
      </div>

      <HeroStyles />
    </main>
  );
}

function HeroStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.hero{padding:88px 0 64px;border-bottom:1px solid var(--line);position:relative;overflow:hidden;}
.hero-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:48px;align-items:center;}
.hero-copy .kicker{margin-bottom:18px;}
.hero h1{font-family:var(--sans);font-size:54px;line-height:1.05;font-weight:700;letter-spacing:-0.025em;max-width:17ch;}
.hero h1 em{font-style:normal;color:var(--neon);text-shadow:var(--glow) var(--neon);}
.hero p{margin-top:22px;font-size:17px;color:var(--dim);max-width:52ch;}
.hero-stats{margin-top:32px;display:flex;gap:36px;flex-wrap:wrap;}
.stat{display:flex;flex-direction:column;gap:4px;}
.stat-num{font-family:var(--mono);font-size:28px;font-weight:700;color:var(--neon);letter-spacing:-0.02em;font-variant-numeric:tabular-nums;line-height:1;}
.stat-label{font-family:var(--mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--faint);}
.hero-preview-slot{display:flex;flex-direction:column;gap:12px;}
.hero-preview-caption{font-size:11px;color:var(--faint);letter-spacing:0.04em;}
.hero-glow{position:absolute;width:600px;height:600px;right:-220px;top:-220px;border-radius:50%;background:radial-gradient(circle,rgba(255,176,43,0.06),transparent 70%);pointer-events:none;}
@media(max-width:960px){
  .hero{padding:72px 0 56px;}
  .hero-grid{grid-template-columns:1fr;gap:36px;}
  .hero h1{font-size:42px;}
}
.section-label{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:56px 0 20px;display:flex;align-items:center;gap:12px;}
.section-label::after{content:'';flex:1;height:1px;background:var(--line);}
.topics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
@media(max-width:1100px){.topics{grid-template-columns:repeat(2,1fr);}}
@media(max-width:680px){.topics{grid-template-columns:1fr;}}
.card{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:20px;cursor:pointer;transition:border-color .18s,transform .18s,box-shadow .18s;height:100%;display:flex;flex-direction:column;}
.card:hover{border-color:var(--neon);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.4),inset 0 0 30px rgba(43,255,154,0.03);}
.card-head{display:flex;justify-content:space-between;align-items:center;}
.card .idx{font-size:11px;color:var(--faint);}
.card .badge{font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:2px 7px;border-radius:3px;border:1px dashed var(--line-bright);color:var(--dim);}
.card h3{font-size:17px;margin:8px 0 6px;font-weight:600;font-family:var(--sans);letter-spacing:-0.01em;}
.card p{font-size:13px;color:var(--dim);line-height:1.5;flex:1;}
.card .tag{align-self:flex-start;margin-top:14px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:3px;border:1px solid var(--line);color:var(--dim);}
.card.soon{cursor:default;border-style:dashed;background:transparent;}
.card.soon h3{color:var(--dim);}
.card.soon:hover{transform:none;border-color:var(--line-bright);box-shadow:none;}
.about{font-size:14px;color:var(--dim);line-height:1.7;max-width:64ch;}
.about b{color:var(--ink);}
`,
      }}
    />
  );
}
