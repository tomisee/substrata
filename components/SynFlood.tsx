"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------
   SYN flood / state-exhaustion attack simulator.

   Server keeps a SYN backlog: each half-open connection occupies one
   slot from the moment the SYN is received until either (a) the
   client's ACK arrives (slot promoted to ESTABLISHED, then freed
   from the backlog), or (b) all SYN-ACK retransmits time out.

   Real Linux: tcp_max_syn_backlog default ≈ 256, SYN-ACK retransmit
   schedule 1s, 3s, 7s, 15s, 31s, 63s with tcp_synack_retries=5 → total
   ~63s a slot can stay occupied by one un-ACKed half-open conn.

   For visibility we use BACKLOG=8 and a 10× time compression
   (called out in the UI). Mechanism is faithful; magnitudes scaled.

   Defence: SYN cookies. Server skips the slot allocation entirely,
   encodes the connection state into the ISN of the SYN-ACK, and only
   commits state if/when a valid ACK comes back. Backlog stops filling.
   ------------------------------------------------------------------ */

// ── Constants ──────────────────────────────────────────────────────────────

const BACKLOG = 8;          // visible queue depth (real Linux default ≈ 256)
const PKT_MS = 620;         // packet flight time across the wire
const SLOT_TTL_MS = 6300;   // compressed ~63s timeout (10×) for un-ACKed slot
const LEGIT_ACK_DELAY = 280; // pause between SYN-ACK arrival and client ACK
const TIME_SCALE_NOTE = "10×";

// Real Linux SYN-ACK retransmit schedule, scaled 10× for display.
// We don't actually re-emit packets; the schedule is just for the
// progress bar that ticks down each slot's remaining lifetime.
const RETRANSMIT_SCHEDULE_S = [1, 3, 7, 15, 31, 63];

// ── Types ──────────────────────────────────────────────────────────────────

type SrcKind = "attack" | "legit";
type PktKind =
  | "syn-attack"
  | "syn-legit"
  | "synack-attack"   // sent into the void (spoofed src)
  | "synack-legit"
  | "ack-legit"
  | "rst-legit";      // server's "go away, queue full"

interface Slot {
  id: number;
  kind: SrcKind;
  src: string;        // spoofed or real IP
  allocAt: number;    // ms since sim start
  ttl: number;        // ms until expiry
  promoted?: boolean; // legit only — ACK received, will be freed next frame
}

interface Packet {
  id: number;
  kind: PktKind;
  startAt: number;
  durationMs: number;
  src: string;        // src IP carried with the packet for tooltips
  slotId?: number;    // slot it relates to, if any
}

interface Counters {
  synAttack: number;
  synLegit: number;
  established: number;
  refused: number;
  expired: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function randIp() {
  // RFC-5737 documentation ranges + a sprinkle of others — looks "spoofed"
  // but obviously fake. Visual variety, not analytic value.
  const a = Math.floor(Math.random() * 223) + 1;
  const b = Math.floor(Math.random() * 256);
  const c = Math.floor(Math.random() * 256);
  const d = Math.floor(Math.random() * 254) + 1;
  return `${a}.${b}.${c}.${d}`;
}

const LEGIT_IP = "10.0.0.42";

// ── Component ──────────────────────────────────────────────────────────────

export default function SynFlood() {
  // ── Controls ──
  const [attackRate, setAttackRate] = useState(4);    // SYN/sec from attacker
  const [legitRate, setLegitRate] = useState(0.5);    // SYN/sec from legit client
  const [synCookies, setSynCookies] = useState(false);
  const [running, setRunning] = useState(false);

  // ── World state ──
  const [slots, setSlots] = useState<(Slot | null)[]>(() => Array(BACKLOG).fill(null));
  const [packets, setPackets] = useState<Packet[]>([]);
  const [counters, setCounters] = useState<Counters>({
    synAttack: 0, synLegit: 0, established: 0, refused: 0, expired: 0,
  });
  const [now, setNow] = useState(0);
  const [legitStatus, setLegitStatus] =
    useState<{ kind: "idle" | "connected" | "refused"; at: number } | null>(null);

  // ── Refs for the animation loop ──
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const lastAttackEmitRef = useRef(0);
  const lastLegitEmitRef = useRef(0);
  const pktIdRef = useRef(0);
  const slotIdRef = useRef(0);

  // Mirror state into refs so the rAF loop reads live values without
  // becoming a dependency of the effect (which would tear down and
  // restart the loop on every state change, doubling up frames).
  const slotsRef = useRef(slots);
  const attackRateRef = useRef(attackRate);
  const legitRateRef = useRef(legitRate);
  const synCookiesRef = useRef(synCookies);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  useEffect(() => { attackRateRef.current = attackRate; }, [attackRate]);
  useEffect(() => { legitRateRef.current = legitRate; }, [legitRate]);
  useEffect(() => { synCookiesRef.current = synCookies; }, [synCookies]);

  // ── Reset to clean slate ──
  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setRunning(false);
    setSlots(Array(BACKLOG).fill(null));
    setPackets([]);
    setCounters({ synAttack: 0, synLegit: 0, established: 0, refused: 0, expired: 0 });
    setNow(0);
    setLegitStatus(null);
    lastAttackEmitRef.current = 0;
    lastLegitEmitRef.current = 0;
    pktIdRef.current = 0;
    slotIdRef.current = 0;
  }, []);

  // ── Allocate a backlog slot if there's room; return slot id or null ──
  const tryAlloc = useCallback((
    cur: (Slot | null)[], kind: SrcKind, src: string, t: number,
  ): { next: (Slot | null)[]; slotId: number | null } => {
    const idx = cur.findIndex(s => s === null);
    if (idx === -1) return { next: cur, slotId: null };
    const id = ++slotIdRef.current;
    const next = cur.slice();
    next[idx] = { id, kind, src, allocAt: t, ttl: SLOT_TTL_MS };
    return { next, slotId: id };
  }, []);

  // ── Main animation loop ──
  useEffect(() => {
    if (!running) return;

    function frame(ts: number) {
      if (startRef.current === 0) startRef.current = ts;
      const t = ts - startRef.current;
      setNow(t);

      const aRate = attackRateRef.current;
      const lRate = legitRateRef.current;
      const cookies = synCookiesRef.current;

      // 1. Emit attacker SYNs at the configured rate ─────────────────────
      if (aRate > 0) {
        const interval = 1000 / aRate;
        while (t - lastAttackEmitRef.current >= interval) {
          lastAttackEmitRef.current += interval;
          const id = ++pktIdRef.current;
          setPackets(p => [...p, {
            id, kind: "syn-attack",
            startAt: lastAttackEmitRef.current,
            durationMs: PKT_MS,
            src: randIp(),
          }]);
        }
      } else {
        lastAttackEmitRef.current = t; // don't accumulate while paused
      }

      // 2. Emit legit SYNs ─────────────────────────────────────────────
      if (lRate > 0) {
        const interval = 1000 / lRate;
        while (t - lastLegitEmitRef.current >= interval) {
          lastLegitEmitRef.current += interval;
          const id = ++pktIdRef.current;
          setPackets(p => [...p, {
            id, kind: "syn-legit",
            startAt: lastLegitEmitRef.current,
            durationMs: PKT_MS,
            src: LEGIT_IP,
          }]);
        }
      } else {
        lastLegitEmitRef.current = t;
      }

      // 3. Process packet arrivals ────────────────────────────────────
      setPackets(prevPkts => {
        const survivors: Packet[] = [];
        const newOnes: Packet[] = [];
        let slotsLocal: (Slot | null)[] | null = null;
        let synAttack = 0, synLegit = 0, established = 0, refused = 0;
        let legitOutcome: { kind: "connected" | "refused"; at: number } | null = null;

        for (const pkt of prevPkts) {
          const age = t - pkt.startAt;
          if (age < pkt.durationMs) { survivors.push(pkt); continue; }

          // Packet has arrived. Handle by kind.
          if (pkt.kind === "syn-attack") {
            synAttack++;
            if (cookies) {
              // No state allocation. Send a SYN-ACK back to the spoofed src.
              // It vanishes into the void. We still draw it for honesty.
              newOnes.push({
                id: ++pktIdRef.current, kind: "synack-attack",
                startAt: t, durationMs: PKT_MS, src: pkt.src,
              });
            } else {
              const cur = slotsLocal ?? slotsRef.current;
              const { next, slotId } = tryAlloc(cur, "attack", pkt.src, t);
              slotsLocal = next;
              if (slotId !== null) {
                newOnes.push({
                  id: ++pktIdRef.current, kind: "synack-attack",
                  startAt: t, durationMs: PKT_MS, src: pkt.src, slotId,
                });
              }
              // If no slot, server silently drops (no SYN-ACK).
            }
          } else if (pkt.kind === "syn-legit") {
            synLegit++;
            if (cookies) {
              newOnes.push({
                id: ++pktIdRef.current, kind: "synack-legit",
                startAt: t, durationMs: PKT_MS, src: pkt.src,
              });
            } else {
              const cur = slotsLocal ?? slotsRef.current;
              const { next, slotId } = tryAlloc(cur, "legit", pkt.src, t);
              if (slotId !== null) {
                slotsLocal = next;
                newOnes.push({
                  id: ++pktIdRef.current, kind: "synack-legit",
                  startAt: t, durationMs: PKT_MS, src: pkt.src, slotId,
                });
              } else {
                // Queue full → server sends RST.
                refused++;
                legitOutcome = { kind: "refused", at: t };
                newOnes.push({
                  id: ++pktIdRef.current, kind: "rst-legit",
                  startAt: t, durationMs: PKT_MS, src: pkt.src,
                });
              }
            }
          } else if (pkt.kind === "synack-legit") {
            // Client receives SYN-ACK, sends ACK after a small think delay.
            newOnes.push({
              id: ++pktIdRef.current, kind: "ack-legit",
              startAt: t + LEGIT_ACK_DELAY, durationMs: PKT_MS,
              src: pkt.src, slotId: pkt.slotId,
            });
          } else if (pkt.kind === "ack-legit") {
            // Connection established. Free the slot (if any).
            established++;
            legitOutcome = { kind: "connected", at: t };
            if (pkt.slotId !== undefined) {
              const cur: (Slot | null)[] = slotsLocal ?? slotsRef.current;
              slotsLocal = cur.map(s => s && s.id === pkt.slotId ? { ...s, promoted: true } : s);
            }
          }
          // synack-attack, rst-legit: just vanish on arrival.
        }

        // Commit slot mutations + cleanup promoted (legit) slots.
        if (slotsLocal) {
          slotsLocal = slotsLocal.map(s => (s && s.promoted) ? null : s);
          setSlots(slotsLocal);
        }

        if (synAttack || synLegit || established || refused) {
          setCounters(c => ({
            ...c,
            synAttack: c.synAttack + synAttack,
            synLegit:  c.synLegit  + synLegit,
            established: c.established + established,
            refused: c.refused + refused,
          }));
        }
        if (legitOutcome) setLegitStatus(legitOutcome);

        return [...survivors, ...newOnes];
      });

      // 4. Expire slots whose TTL has elapsed ─────────────────────────
      setSlots(prev => {
        let expired = 0;
        const next = prev.map(s => {
          if (!s) return s;
          if (t - s.allocAt >= s.ttl) { expired++; return null; }
          return s;
        });
        if (expired) setCounters(c => ({ ...c, expired: c.expired + expired }));
        return next;
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, tryAlloc]);

  // Clear stale legit-client status indicator after a moment.
  useEffect(() => {
    if (!legitStatus) return;
    const id = setTimeout(() => setLegitStatus(null), 1400);
    return () => clearTimeout(id);
  }, [legitStatus]);

  // ── Derived ──
  const halfOpen = slots.filter(s => s !== null).length;
  const utilisation = halfOpen / BACKLOG;
  const saturated = halfOpen === BACKLOG;

  // ── Layout coords for the SVG canvas ──
  // Use a viewBox so positions stay stable across container sizes.
  const VB_W = 640, VB_H = 360;
  const ATT = { x: 70, y: 90 };
  const LEG = { x: 70, y: 270 };
  const SRV = { x: 470, y: 180 };

  // Compute live packet positions for rendering
  const pktViews = useMemo(() => packets.map(p => {
    const t = now - p.startAt;
    if (t < 0) return null; // not yet emitted (legit ACK has a delay)
    const prog = Math.min(t / p.durationMs, 1);
    const fromAttacker = p.kind === "syn-attack" || p.kind === "ack-legit" && p.src === LEGIT_IP;
    const fromLegit = p.kind === "syn-legit" || p.kind === "ack-legit";
    const fromServer = p.kind === "synack-attack" || p.kind === "synack-legit" || p.kind === "rst-legit";

    let from = ATT, to = SRV;
    if (fromLegit) { from = LEG; to = SRV; }
    if (fromServer) {
      from = SRV;
      to = p.kind === "synack-legit" || p.kind === "rst-legit" ? LEG : ATT;
    }
    if (p.kind === "syn-attack") { from = ATT; to = SRV; }

    const x = from.x + (to.x - from.x) * prog;
    const y = from.y + (to.y - from.y) * prog;
    return { ...p, x, y, prog };
  }).filter(Boolean) as (Packet & { x: number; y: number; prog: number })[], [packets, now]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="syn">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="panel">
        <div className="panel-bar mono">
          <span className={`dot ${running ? (saturated ? "saturated" : "live") : ""}`} />
          syn-flood.ts — state-exhaustion attack
          <span className="bar-meta">sim time: {(now / 1000).toFixed(1)}s · {TIME_SCALE_NOTE} compressed</span>
        </div>

        <div className="syn-layout">

          {/* ── Sidebar ── */}
          <div className="syn-side">
            <div className="side-label mono">// attacker</div>
            <label className="ctrl mono">
              <span>SYN rate</span>
              <span className="ctrl-v">{attackRate}/s</span>
            </label>
            <input
              type="range" min={0} max={20} step={1}
              value={attackRate}
              onChange={(e) => setAttackRate(Number(e.target.value))}
              className="slider att"
            />

            <div className="side-label mono">// legitimate client</div>
            <label className="ctrl mono">
              <span>SYN rate</span>
              <span className="ctrl-v">{legitRate.toFixed(1)}/s</span>
            </label>
            <input
              type="range" min={0} max={3} step={0.1}
              value={legitRate}
              onChange={(e) => setLegitRate(Number(e.target.value))}
              className="slider leg"
            />

            <div className="side-label mono">// defence</div>
            <button
              className={`mono toggle ${synCookies ? "on" : ""}`}
              onClick={() => setSynCookies(v => !v)}
            >
              <span className="led" /> SYN cookies {synCookies ? "ON" : "OFF"}
            </button>
            <div className="hint mono">
              {synCookies
                ? "Server is stateless — backlog won't fill."
                : "Server allocates a slot per half-open conn."}
            </div>

            <div className="side-label mono">// control</div>
            {!running
              ? <button className="mono ctrl-btn primary" onClick={() => { startRef.current = 0; setRunning(true); }}>▶ start</button>
              : <button className="mono ctrl-btn active" onClick={() => setRunning(false)}>⏸ pause</button>}
            <button className="mono ctrl-btn reset-btn" onClick={reset}>↺ reset</button>

            <div className="side-label mono">// counters</div>
            <div className="stat mono"><span>SYN (attack)</span><span className="att-col">{counters.synAttack}</span></div>
            <div className="stat mono"><span>SYN (legit)</span><span className="cyan-col">{counters.synLegit}</span></div>
            <div className="stat mono"><span>established</span><span className="ok-col">{counters.established}</span></div>
            <div className="stat mono"><span>refused</span><span className="bad-col">{counters.refused}</span></div>
            <div className="stat mono"><span>expired</span><span className="dim-col">{counters.expired}</span></div>
          </div>

          {/* ── Canvas ── */}
          <div className="syn-main">
            <svg className="canvas-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet">

              {/* connection lines */}
              <line x1={ATT.x} y1={ATT.y} x2={SRV.x} y2={SRV.y}
                stroke="var(--line-bright)" strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />
              <line x1={LEG.x} y1={LEG.y} x2={SRV.x} y2={SRV.y}
                stroke="var(--line-bright)" strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />

              {/* attacker */}
              <g>
                <rect x={ATT.x - 56} y={ATT.y - 30} width={112} height={60} rx={6}
                  fill="var(--surface-2)" stroke="var(--magenta)" strokeWidth={1.2} />
                <text x={ATT.x} y={ATT.y - 8} textAnchor="middle" className="lbl att-col">attacker</text>
                <text x={ATT.x} y={ATT.y + 10} textAnchor="middle" className="sub">spoofed sources</text>
                <text x={ATT.x} y={ATT.y + 24} textAnchor="middle" className="sub att-col">{attackRate}/s</text>
              </g>

              {/* legit */}
              <g>
                <rect x={LEG.x - 56} y={LEG.y - 30} width={112} height={60} rx={6}
                  fill="var(--surface-2)" stroke="var(--cyan)" strokeWidth={1.2} />
                <text x={LEG.x} y={LEG.y - 8} textAnchor="middle" className="lbl cyan-col">client</text>
                <text x={LEG.x} y={LEG.y + 10} textAnchor="middle" className="sub">{LEGIT_IP}</text>
                <text x={LEG.x} y={LEG.y + 24} textAnchor="middle" className="sub cyan-col">{legitRate.toFixed(1)}/s</text>
                {legitStatus && (
                  <text x={LEG.x} y={LEG.y - 40} textAnchor="middle"
                    className={legitStatus.kind === "connected" ? "tag ok-col" : "tag bad-col"}>
                    {legitStatus.kind === "connected" ? "✓ ESTABLISHED" : "✗ REFUSED"}
                  </text>
                )}
              </g>

              {/* server with backlog */}
              <g>
                <rect x={SRV.x - 70} y={SRV.y - 130} width={140} height={260} rx={8}
                  fill="var(--surface-2)" stroke={saturated ? "var(--magenta)" : "var(--cyan)"} strokeWidth={1.4}
                  style={saturated ? { filter: "drop-shadow(0 0 8px var(--magenta))" } : undefined} />
                <text x={SRV.x} y={SRV.y - 110} textAnchor="middle" className="lbl">server</text>
                <text x={SRV.x} y={SRV.y - 95} textAnchor="middle" className="sub">
                  backlog {halfOpen}/{BACKLOG}
                </text>

                {/* slot grid */}
                {slots.map((s, i) => {
                  const sx = SRV.x - 60;
                  const sy = SRV.y - 80 + i * 24;
                  const stroke =
                    !s ? "var(--line-bright)"
                      : s.kind === "attack" ? "var(--magenta)"
                      : "var(--cyan)";
                  const fill =
                    !s ? "transparent"
                      : s.kind === "attack" ? "rgba(255,77,141,0.10)"
                      : "rgba(43,217,255,0.10)";
                  const remaining = s ? Math.max(0, 1 - (now - s.allocAt) / s.ttl) : 0;
                  return (
                    <g key={i}>
                      <rect x={sx} y={sy} width={120} height={18} rx={3}
                        fill={fill} stroke={stroke} strokeWidth={1} />
                      {s && (
                        <>
                          <rect x={sx + 1} y={sy + 14} width={118 * remaining} height={3}
                            fill={stroke} opacity={0.6} />
                          <text x={sx + 6} y={sy + 12} className="slot-txt"
                            style={{ fill: stroke }}>{s.src}</text>
                        </>
                      )}
                      {!s && (
                        <text x={sx + 60} y={sy + 12} textAnchor="middle" className="slot-empty">— empty —</text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* packets */}
              {pktViews.map(p => {
                const colour =
                  p.kind === "syn-attack" || p.kind === "synack-attack" ? "var(--magenta)"
                    : p.kind === "rst-legit" ? "var(--magenta)"
                    : "var(--cyan)";
                return (
                  <g key={p.id} style={{ filter: `drop-shadow(0 0 4px ${colour})` }}>
                    <circle cx={p.x} cy={p.y} r={3.5} fill={colour} opacity={0.95} />
                  </g>
                );
              })}
            </svg>

            <div className={`gauge mono ${saturated ? "danger" : ""}`}>
              <div className="gauge-lbl">backlog utilisation</div>
              <div className="gauge-bar"><div className="gauge-fill" style={{ width: `${utilisation * 100}%` }} /></div>
              <div className="gauge-pct">{Math.round(utilisation * 100)}%</div>
            </div>

            <div className="note mono">
              Showing {BACKLOG} slots for visibility — Linux <code>tcp_max_syn_backlog</code> defaults to ≈ 256.
              Slot TTL ≈ {(SLOT_TTL_MS / 1000).toFixed(1)}s here, modelling the real
              {" "}{RETRANSMIT_SCHEDULE_S.join("/")}s SYN-ACK retransmit schedule compressed {TIME_SCALE_NOTE}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const css = `
.syn .panel{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;}
.syn .panel-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim);background:rgba(255,255,255,0.02);}
.syn .bar-meta{margin-left:auto;font-size:11px;color:var(--faint);}
.syn .dot{width:8px;height:8px;border-radius:50%;background:var(--faint);flex-shrink:0;}
.syn .dot.live{background:var(--cyan);box-shadow:var(--glow) var(--cyan);}
.syn .dot.saturated{background:var(--magenta);box-shadow:var(--glow) var(--magenta);}

.syn .syn-layout{display:grid;grid-template-columns:230px 1fr;}
@media(max-width:760px){.syn .syn-layout{grid-template-columns:1fr;}}

.syn .syn-side{padding:16px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:6px;min-width:0;}
@media(max-width:760px){.syn .syn-side{border-right:none;border-bottom:1px solid var(--line);}}
.syn .side-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:10px;margin-bottom:2px;}
.syn .side-label:first-child{margin-top:0;}

.syn .ctrl{display:flex;justify-content:space-between;font-size:11px;color:var(--dim);align-items:baseline;}
.syn .ctrl-v{color:var(--ink);font-weight:700;}
.syn .slider{width:100%;-webkit-appearance:none;appearance:none;height:4px;background:var(--surface-2);border:1px solid var(--line);border-radius:3px;outline:none;margin:4px 0 4px;}
.syn .slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;cursor:pointer;border:none;}
.syn .slider.att::-webkit-slider-thumb{background:var(--magenta);box-shadow:0 0 6px var(--magenta);}
.syn .slider.leg::-webkit-slider-thumb{background:var(--cyan);box-shadow:0 0 6px var(--cyan);}
.syn .slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;cursor:pointer;border:none;}
.syn .slider.att::-moz-range-thumb{background:var(--magenta);box-shadow:0 0 6px var(--magenta);}
.syn .slider.leg::-moz-range-thumb{background:var(--cyan);box-shadow:0 0 6px var(--cyan);}

.syn .toggle{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:5px;background:var(--surface-2);color:var(--dim);font-size:12px;cursor:pointer;transition:all .15s;text-align:left;}
.syn .toggle:hover{border-color:var(--green);color:var(--ink);}
.syn .toggle.on{border-color:var(--green);color:var(--green);}
.syn .led{width:8px;height:8px;border-radius:50%;background:var(--faint);}
.syn .toggle.on .led{background:var(--green);box-shadow:var(--glow) var(--green);}
.syn .hint{font-size:10px;color:var(--faint);line-height:1.4;padding:2px 0 4px;}

.syn .ctrl-btn{width:100%;padding:8px 12px;font-size:12px;border-radius:5px;cursor:pointer;border:1px solid var(--line);background:var(--surface-2);color:var(--dim);transition:all .15s;text-align:left;}
.syn .ctrl-btn:hover:not(:disabled){border-color:var(--magenta);color:var(--magenta);}
.syn .ctrl-btn.primary{background:var(--magenta);color:var(--void);border-color:var(--magenta);font-weight:700;}
.syn .ctrl-btn.primary:hover{filter:brightness(1.1);box-shadow:var(--glow) var(--magenta);}
.syn .ctrl-btn.active{background:var(--surface-2);border-color:var(--magenta);color:var(--magenta);}
.syn .ctrl-btn.reset-btn{color:var(--faint);}
.syn .ctrl-btn.reset-btn:hover{border-color:var(--magenta);color:var(--magenta);}

.syn .stat{display:flex;justify-content:space-between;font-size:11px;color:var(--dim);padding:2px 0;}
.syn .stat span:last-child{font-weight:700;}
.syn .att-col{color:var(--magenta);}
.syn .cyan-col{color:var(--cyan);}
.syn .ok-col{color:var(--green);}
.syn .bad-col{color:var(--magenta);}
.syn .dim-col{color:var(--dim);}

.syn .syn-main{display:flex;flex-direction:column;min-height:380px;padding:14px;gap:10px;}
.syn .canvas-svg{width:100%;height:380px;background:var(--surface);border:1px solid var(--line);border-radius:6px;background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:24px 24px;}
.syn .lbl{font-family:var(--mono);font-size:11px;fill:var(--ink);font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.syn .sub{font-family:var(--mono);font-size:9px;fill:var(--dim);}
.syn .tag{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.1em;}
.syn .slot-txt{font-family:var(--mono);font-size:9px;font-weight:600;}
.syn .slot-empty{font-family:var(--mono);font-size:8.5px;fill:var(--faint);letter-spacing:.1em;}

.syn .gauge{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);font-size:11px;color:var(--dim);}
.syn .gauge.danger{border-color:var(--magenta);color:var(--magenta);}
.syn .gauge-lbl{min-width:140px;}
.syn .gauge-bar{flex:1;height:6px;background:var(--surface);border-radius:3px;overflow:hidden;border:1px solid var(--line);}
.syn .gauge-fill{height:100%;background:var(--magenta);transition:width .15s linear;}
.syn .gauge-pct{min-width:40px;text-align:right;font-weight:700;color:var(--ink);}

.syn .note{font-size:10.5px;color:var(--faint);line-height:1.55;padding:6px 10px;border-left:2px solid var(--line-bright);}
.syn .note code{color:var(--dim);background:var(--surface-2);padding:1px 5px;border-radius:3px;font-size:10px;}
`;
