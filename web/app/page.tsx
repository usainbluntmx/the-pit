"use client";

import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { LiveBoard } from "@/components/LiveBoard";
import { Rich, useI18n } from "@/lib/i18n";

const PROGRAM = "4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar";

export default function Landing() {
  const { c } = useI18n();

  return (
    <div className="shell landing">
      <div className="grid-bg" />

      <header className="land-nav">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">THE PIT</div>
            <div className="brand-sub">private instant trading · {c.common.devnet}</div>
          </div>
        </div>
        <div className="land-nav-links">
          <a href="#how">{c.nav.how}</a>
          <a href="#bite">{c.nav.bite}</a>
          <a href="#stack">{c.nav.stack}</a>
          <Link href="/profile">{c.nav.profile}</Link>
          <LangSwitch />
          <Link className="btn" href="/play">
            {c.nav.play}
          </Link>
        </div>
      </header>

      <section className="land-hero">
        <div className="land-hero-copy">
          <div className="kicker">{c.hero.kicker}</div>
          <h1>
            {c.hero.titleA}
            <br />
            <em>{c.hero.titleEm}</em>
          </h1>
          <p className="lede">{c.hero.lede}</p>
          <div className="land-cta">
            <Link className="btn" href="/play">
              {c.hero.ctaPrimary}
            </Link>
            <Link className="btn ghost" href="/play?mode=solo">
              {c.hero.ctaSolo}
            </Link>
            <a className="btn ghost" href="#how">
              {c.hero.ctaGhost}
            </a>
          </div>
        </div>

        <LiveBoard />

        <div className="hero-stats">
          {c.hero.stats.map((s) => (
            <div key={s.v}>
              <b>{s.v}</b>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="land-section">
        <div className="land-head">
          <span className="land-kicker">{c.how.kicker}</span>
          <h2>{c.how.title}</h2>
        </div>
        <div className="land-steps">
          {c.how.steps.map((s) => (
            <article className="land-step" key={s.n}>
              <span className="mono">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="bite" className="land-section land-bite">
        <div className="land-head">
          <span className="land-kicker">{c.bite.kicker}</span>
          <h2>{c.bite.title}</h2>
          <p className="land-sub">
            <Rich text={c.bite.sub} />
          </p>
        </div>

        <div className="land-bite-grid">
          <div className="land-panel">
            <div className="land-gauge">
              <span>{c.bite.pressure}</span>
              <span className="land-gauge-track">
                <span className="land-gauge-fill" />
              </span>
              <span className="mono">MAD</span>
            </div>
            <div className="land-fever">
              <span className="mad-badge">{c.bite.fever}</span>
              <span className="mad-line">{c.bite.feverLine}</span>
              <span className="mad-sub">{c.bite.feverSub}</span>
            </div>
            <p className="hint" style={{ marginTop: 14 }}>
              {c.bite.hint}
            </p>
          </div>

          <ul className="land-rules">
            {c.bite.rules.map((r) => (
              <li key={r.b}>
                <b>{r.b}</b> {r.t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="stack" className="land-section">
        <div className="land-head">
          <span className="land-kicker">{c.stack.kicker}</span>
          <h2>{c.stack.title}</h2>
        </div>
        <div className="land-stack">
          {c.stack.cards.map((card) => (
            <article className="land-card" key={card.k}>
              <div className="land-card-top">
                <h3>{card.k}</h3>
                <span className="pill">{card.tag}</span>
              </div>
              <p>{card.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section land-series">
        <div className="land-head">
          <span className="land-kicker">{c.series.kicker}</span>
          <h2>{c.series.title}</h2>
        </div>
        <div className="land-series-grid">
          <div className="land-panel">
            <div className="series-head" style={{ padding: 0, marginBottom: 10 }}>
              <span className="mono">season-01</span>
              <span className="pill">{c.series.rounds}</span>
            </div>
            {[
              ["BULL-BLUE·EK", "23 pts", c.series.podiums],
              ["BULL-BLUE·1I", "18 pts", c.series.podiums],
              ["MANTIS-BLUE·IY", "18 pts", c.series.podiums],
            ].map(([n, p, s], i) => (
              <div className="row" key={n}>
                <span className="rank mono">{String(i + 1).padStart(2, "0")}</span>
                <span className="who">
                  <span className="who-line">{n}</span>
                  <small>{s}</small>
                </span>
                <span className="pnl up">{p}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="land-sub" style={{ marginTop: 0 }}>
              {c.series.sub}
            </p>
            <ul className="land-rules">
              {c.series.rules.map((r) => (
                <li key={r.b}>
                  <b>{r.b}</b> {r.t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="land-final">
        <h2>{c.final.title}</h2>
        <p>{c.final.text}</p>
        <div className="land-cta">
          <Link className="btn" href="/play">
            {c.nav.play}
          </Link>
          <a
            className="btn ghost"
            href={`https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            {c.final.program}
          </a>
        </div>
      </section>

      <footer className="land-foot">
        <span>
          program <span className="mono">{PROGRAM}</span>
        </span>
        <span>{c.footer.built}</span>
      </footer>
    </div>
  );
}
