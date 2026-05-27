"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Hero preview — a small, always-running cache trace.
   Same direct-mapped logic as topic 01 (sequential walk on a tiny
   4-line / 16-byte cache), shown as a ticker of recent accesses so
   the homepage actually *demonstrates* the "working model" promise
   instead of just describing it. Pauses for reduced-motion users.
   ------------------------------------------------------------------ */

type Slot = { addr: number; hit: boolean };

const LINES = 4;
const BLOCK = 16;
const STREAM_LEN = 14;

function nextAddr(prev: number) {
  // Sequential walk that wraps, with one deliberate stride jump every 12 steps
  // to keep the trace visually varied (mostly hits, occasional miss bursts).
  const step = prev > 0 && prev % (BLOCK * 12) === BLOCK * 11 ? BLOCK * 5 : 4;
  return (prev + step) % (LINES * BLOCK * 4);
}

export default function HeroPreview() {
  const [stream, setStream] = useState<Slot[]>([]);
  const [stats, setStats] = useState({ hits: 0, total: 0 });
  const cacheRef = useRef<(number | null)[]>(Array(LINES).fill(null));
  const addrRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Render one static frame so the visual is still present, just not animating.
      const sample: Slot[] = Array.from({ length: STREAM_LEN }, (_, i) => ({
        addr: i * 4,
        hit: i % 4 !== 0,
      }));
      setStream(sample);
      setStats({ hits: sample.filter((s) => s.hit).length, total: sample.length });
      return;
    }

    const id = setInterval(() => {
      const addr = nextAddr(addrRef.current);
      addrRef.current = addr;
      const index = Math.floor(addr / BLOCK) % LINES;
      const tag = Math.floor(addr / (BLOCK * LINES));
      const hit = cacheRef.current[index] === tag;
      cacheRef.current[index] = tag;

      setStream((prev) => [...prev.slice(-(STREAM_LEN - 1)), { addr, hit }]);
      setStats((p) => ({ hits: p.hits + (hit ? 1 : 0), total: p.total + 1 }));
    }, 650);
    return () => clearInterval(id);
  }, []);

  const rate = stats.total === 0 ? 0 : Math.round((stats.hits / stats.total) * 100);

  return (
    <div className="hero-preview" aria-hidden="true">
      <div className="hp-head">
        <span className="hp-label">live · direct-mapped cache · sequential walk</span>
        <span className="hp-rate">
          hit rate <b>{rate}%</b>
        </span>
      </div>
      <div className="hp-stream">
        {Array.from({ length: STREAM_LEN }).map((_, i) => {
          const slot = stream[i];
          if (!slot) return <div key={i} className="hp-slot hp-empty" />;
          return (
            <div key={`${i}-${slot.addr}`} className={`hp-slot ${slot.hit ? "hp-hit" : "hp-miss"}`}>
              <span className="hp-addr">0x{slot.addr.toString(16).padStart(3, "0")}</span>
              <span className="hp-tick">{slot.hit ? "HIT" : "MISS"}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        .hero-preview {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%);
          padding: 16px 18px;
          font-family: var(--mono);
        }
        .hp-head {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--faint); margin-bottom: 12px;
        }
        .hp-rate b { color: var(--green); font-weight: 600; font-variant-numeric: tabular-nums; }
        .hp-stream {
          display: grid;
          grid-template-columns: repeat(${STREAM_LEN}, 1fr);
          gap: 4px;
        }
        .hp-slot {
          height: 44px;
          border-radius: 3px;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          font-size: 9px; line-height: 1.1;
          border: 1px solid var(--line);
          background: var(--void);
          transition: background .25s, border-color .25s, box-shadow .25s;
        }
        .hp-empty { opacity: 0.4; }
        .hp-hit {
          border-color: var(--green);
          background: color-mix(in srgb, var(--green) 12%, var(--void));
          box-shadow: 0 0 8px color-mix(in srgb, var(--green) 35%, transparent);
        }
        .hp-miss {
          border-color: var(--neon);
          background: color-mix(in srgb, var(--neon) 14%, var(--void));
          box-shadow: 0 0 8px color-mix(in srgb, var(--neon) 35%, transparent);
        }
        .hp-addr { color: var(--ink); font-size: 10px; letter-spacing: 0.02em; }
        .hp-tick {
          font-size: 8px; letter-spacing: 0.1em; margin-top: 3px;
          color: var(--dim);
        }
        .hp-hit .hp-tick { color: var(--green); }
        .hp-miss .hp-tick { color: var(--neon); }
        @media (max-width: 720px) {
          .hp-stream { grid-template-columns: repeat(7, 1fr); }
          .hp-slot:nth-child(n+8) { display: none; }
        }
      `}</style>
    </div>
  );
}
