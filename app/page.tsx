import Link from "next/link";
import { TOPICS, liveTopics } from "@/lib/topics";

export default function Home() {
  const liveCount = liveTopics().length;

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">interactive systems explainers</div>
          <h1>
            Understand the layer <em>beneath</em> the one you work in.
          </h1>
          <p>
            Each piece here is a working model, not a diagram — poke at the inputs and watch the
            real mechanics respond. Built to grow: every topic I learn well enough to simulate
            becomes a new page.
          </p>
          <div className="meta mono">
            <span>status: <b>live</b></span>
            <span>topics: <b>{liveCount}</b> / many</span>
            <span>runs client-side</span>
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
                <div className="idx mono">{t.index}</div>
                <h3>{t.title}</h3>
                <p>{t.blurb}</p>
                <span className="tag mono" style={planned ? {} : { color: `var(${t.accent})`, borderColor: `var(${t.accent})` }}>
                  {t.tag}
                </span>
              </div>
            );
            return planned ? (
              <div key={t.slug}>{card}</div>
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
            next up: <span style={{ color: "var(--cyan)" }}>TCP handshake</span> ·{" "}
            <span style={{ color: "var(--violet)" }}>floating-point rounding</span> ·{" "}
            <span style={{ color: "var(--amber)" }}>the stack frame</span>
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
.hero{padding:88px 0 60px;border-bottom:1px solid var(--line);position:relative;overflow:hidden;}
.hero .kicker{margin-bottom:18px;}
.hero h1{font-family:var(--mono);font-size:48px;line-height:1.06;font-weight:800;letter-spacing:-0.03em;max-width:17ch;}
.hero h1 em{font-style:normal;color:var(--neon);text-shadow:var(--glow) var(--neon);}
.hero p{margin-top:22px;font-size:17px;color:var(--dim);max-width:56ch;}
.hero .meta{margin-top:30px;font-size:12px;color:var(--faint);display:flex;gap:18px;flex-wrap:wrap;}
.hero .meta b{color:var(--neon);font-weight:500;}
.hero-glow{position:absolute;width:600px;height:600px;right:-200px;top:-200px;border-radius:50%;background:radial-gradient(circle,rgba(43,255,154,0.07),transparent 70%);pointer-events:none;}
.section-label{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:56px 0 20px;display:flex;align-items:center;gap:12px;}
.section-label::after{content:'';flex:1;height:1px;background:var(--line);}
.topics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
@media(max-width:820px){.topics{grid-template-columns:1fr;}}
.card{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:20px;cursor:pointer;transition:all .18s;height:100%;}
.card:hover{border-color:var(--neon);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.4),inset 0 0 30px rgba(43,255,154,0.03);}
.card .idx{font-size:11px;color:var(--faint);}
.card h3{font-size:17px;margin:8px 0 6px;font-weight:600;font-family:var(--mono);}
.card p{font-size:13px;color:var(--dim);line-height:1.5;}
.card .tag{display:inline-block;margin-top:14px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:3px;border:1px solid var(--line);color:var(--dim);}
.card.soon{opacity:.5;cursor:default;}
.card.soon:hover{transform:none;border-color:var(--line);box-shadow:none;}
.about{font-size:14px;color:var(--dim);line-height:1.7;max-width:64ch;}
.about b{color:var(--ink);}
`,
      }}
    />
  );
}
