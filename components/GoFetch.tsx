"use client";

import { useState, useCallback, useEffect } from "react";

/* ------------------------------------------------------------------
   GoFetch Attack Simulator

   Models the Data Memory-dependent Prefetcher (DMP) side-channel
   attack against Apple M-series chips, disclosed March 2024.
   Paper: "GoFetch: Breaking Constant-Time Cryptographic Implementations
   Using Data Memory-Dependent Prefetchers" — Baddeley et al.

   Core mechanic — one round per key bit:
     ① PRIME   — attacker fills shared cache lines with own data,
                  evicting any victim residue
     ② TRIGGER — victim processes attacker-crafted input; if the
                  secret bit = 1, an intermediate computation value
                  lands in the DMP's "pointer-like" range, triggering
                  a hardware prefetch into the shared cache
     ③ PROBE   — attacker times access to a known address:
                  fast (<100 cy) → cache hit → DMP fired → bit = 1
                  slow (≥100 cy) → cache miss → no prefetch → bit = 0

   Repeating 8× over the demo key extracts all 8 bits.
   Real GoFetch applies this to cryptographic scalar multiplications
   (X25519, RSA, CRYSTALS-Kyber, etc.) over thousands of oracle
   queries to recover full-length private keys.
   ------------------------------------------------------------------ */

// ---- simulation constants ----
const N_BITS = 8;
const CACHE_SIZE = 16;
const PROBE_HIT_THRESHOLD = 100; // cycles; below this = L2 cache hit

// The victim's secret key (unknown to attacker — revealed at end)
// 0b10110100 = 0xB4 = 180
const SECRET_BITS: ReadonlyArray<0 | 1> = [1, 0, 1, 1, 0, 1, 0, 0];

// Simplified "pointer-like" range check.
// Real criterion: falls within valid macOS/arm64 userspace VA range.
// The DMP only prefetches values that look like plausible pointers.
const PTR_LO = 0x14000;
const PTR_HI = 0x1c000;

/**
 * Returns the intermediate value that the victim's computation
 * produces for key bit `b` given the attacker's crafted input.
 *
 * The attacker chooses their challenge so that:
 *   secretBit = 1  →  intermediate ∈ [PTR_LO, PTR_HI]   (DMP fires)
 *   secretBit = 0  →  intermediate outside that range     (DMP silent)
 */
function computeIntermediate(bitIdx: number, secretBit: 0 | 1): number {
  if (secretBit === 1) {
    return PTR_LO + bitIdx * 0x400 + 0x200;  // pointer-like
  } else {
    return 0x5000 + bitIdx * 0x100;           // not pointer-like
  }
}

function isPointerLike(v: number): boolean {
  return v >= PTR_LO && v <= PTR_HI;
}

/** Simulated probe access time in cycles. */
function simulatedProbeCycles(dmpFired: boolean): number {
  if (dmpFired) {
    return 25 + Math.floor(Math.random() * 35);   // L2 hit: 25–60 cy
  } else {
    return 185 + Math.floor(Math.random() * 90);  // DRAM: 185–275 cy
  }
}

// ---- types ----
type Phase =
  | "idle"       // waiting for user
  | "priming"    // ① attacker evicts cache
  | "victim"     // ② victim computes
  | "dmp"        // hardware DMP check
  | "probing"    // ③ attacker measures timing
  | "extracted"  // bit recovered; ready for next round
  | "complete";  // all bits extracted

type ExtractedBit = 0 | 1 | null;

interface CacheLine {
  owner: "empty" | "primed" | "dmp";
  address: number | null;
}

interface LogEntry {
  kind: "attack" | "victim" | "dmp" | "probe" | "reveal";
  text: string;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle:       "ready",
  priming:    "① prime",
  victim:     "② trigger",
  dmp:        "dmp check",
  probing:    "③ probe",
  extracted:  "bit extracted",
  complete:   "key recovered",
};

// ---- component ----
export default function GoFetch() {
  const [bit,          setBit]          = useState(0);
  const [phase,        setPhase]        = useState<Phase>("idle");
  const [extracted,    setExtracted]    = useState<ExtractedBit[]>(Array(N_BITS).fill(null));
  const [cache,        setCache]        = useState<CacheLine[]>(
    Array.from({ length: CACHE_SIZE }, () => ({ owner: "empty", address: null }))
  );
  const [iv,           setIv]           = useState<number | null>(null);
  const [dmpFired,     setDmpFired]     = useState<boolean | null>(null);
  const [probeCycles,  setProbeCycles]  = useState<number | null>(null);
  const [log,          setLog]          = useState<LogEntry[]>([]);
  const [auto,         setAuto]         = useState(false);

  const addLog = useCallback((kind: LogEntry["kind"], text: string) => {
    setLog(l => [{ kind, text }, ...l].slice(0, 22));
  }, []);

  const reset = useCallback(() => {
    setBit(0);
    setPhase("idle");
    setExtracted(Array(N_BITS).fill(null));
    setCache(Array.from({ length: CACHE_SIZE }, () => ({ owner: "empty", address: null })));
    setIv(null);
    setDmpFired(null);
    setProbeCycles(null);
    setLog([]);
    setAuto(false);
  }, []);

  // ---- phase transition functions ----

  const doPrime = useCallback((bitIdx: number) => {
    setCache(Array.from({ length: CACHE_SIZE }, (_, i) => ({
      owner: "primed",
      address: 0x80000 + i * 0x200,
    })));
    setIv(null);
    setDmpFired(null);
    setProbeCycles(null);
    setPhase("priming");
    addLog("attack",
      `PRIME  [bit ${bitIdx}] evicting cache lines — filling with attacker-owned data`);
  }, [addLog]);

  const doVictim = useCallback((bitIdx: number) => {
    const secretBit = SECRET_BITS[bitIdx];
    const v = computeIntermediate(bitIdx, secretBit);
    setIv(v);
    setPhase("victim");
    addLog("victim",
      `TRIGGER  crafted input sent → victim intermediate = 0x${v.toString(16).toUpperCase()}`);
  }, [addLog]);

  const doDmp = useCallback((bitIdx: number, v: number) => {
    const fired = isPointerLike(v);
    setDmpFired(fired);
    const targetLine = bitIdx % CACHE_SIZE;
    if (fired) {
      setCache(prev => prev.map((l, i) =>
        i === targetLine
          ? { owner: "dmp", address: v }
          : l
      ));
      addLog("dmp",
        `DMP  0x${v.toString(16).toUpperCase()} ∈ pointer range [0x${PTR_LO.toString(16)}, 0x${PTR_HI.toString(16)}] → prefetch ↑`);
    } else {
      addLog("dmp",
        `DMP  0x${v.toString(16).toUpperCase()} outside pointer range → no prefetch`);
    }
    setPhase("dmp");
  }, [addLog]);

  const doProbe = useCallback((bitIdx: number, fired: boolean) => {
    const cycles = simulatedProbeCycles(fired);
    const hit    = cycles < PROBE_HIT_THRESHOLD;
    const result: 0 | 1 = hit ? 1 : 0;
    setProbeCycles(cycles);
    setExtracted(prev => {
      const n = [...prev];
      n[bitIdx] = result;
      return n;
    });
    addLog("probe",
      `PROBE  access time: ${cycles} cycles — ${hit ? "CACHE HIT" : "CACHE MISS"}`);
    addLog("reveal",
      `KEY BIT ${bitIdx} = ${result}  (actual secret: ${SECRET_BITS[bitIdx]})`);
    setPhase(bitIdx >= N_BITS - 1 ? "complete" : "extracted");
  }, [addLog]);

  // ---- step button handler ----
  const step = useCallback(() => {
    if (phase === "idle") {
      doPrime(bit);
    } else if (phase === "priming") {
      doVictim(bit);
    } else if (phase === "victim" && iv !== null) {
      doDmp(bit, iv);
    } else if (phase === "dmp" && dmpFired !== null) {
      doProbe(bit, dmpFired);
    } else if (phase === "extracted" && bit < N_BITS - 1) {
      setBit(b => b + 1);
      setPhase("idle");
    }
  }, [phase, bit, iv, dmpFired, doPrime, doVictim, doDmp, doProbe]);

  // ---- auto-run: advance through phases automatically ----
  useEffect(() => {
    if (!auto || phase === "complete") return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "idle") {
      t = setTimeout(() => doPrime(bit), 350);
    } else if (phase === "priming") {
      t = setTimeout(() => doVictim(bit), 750);
    } else if (phase === "victim" && iv !== null) {
      t = setTimeout(() => doDmp(bit, iv), 650);
    } else if (phase === "dmp" && dmpFired !== null) {
      t = setTimeout(() => doProbe(bit, dmpFired), 750);
    } else if (phase === "extracted") {
      t = setTimeout(() => {
        setBit(b => b + 1);
        setPhase("idle");
      }, 550);
    }
    return () => clearTimeout(t);
  }, [auto, phase, bit, iv, dmpFired, doPrime, doVictim, doDmp, doProbe]);

  // ---- derived display values ----
  const probeBarPct     = probeCycles ? Math.min(100, (probeCycles / 300) * 100) : 0;
  const thresholdPct    = (PROBE_HIT_THRESHOLD / 300) * 100;
  const probeIsHit      = probeCycles !== null && probeCycles < PROBE_HIT_THRESHOLD;
  const probeColor      = probeCycles === null ? "var(--faint)"
                        : probeIsHit            ? "var(--green)"
                        :                         "var(--magenta)";
  const extractedHex    = extracted.map(b => b ?? 0)
    .reduce((acc: number, b, i) => acc | (b << (7 - i)), 0);
  const secretHex       = (SECRET_BITS as ReadonlyArray<number>)
    .reduce((acc: number, b, i) => acc | (b << (7 - i)), 0);
  const canStep = phase !== "complete"
    && !(phase === "extracted" && bit >= N_BITS - 1);

  return (
    <div className="gf">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="panel">
        {/* header bar */}
        <div className="panel-bar mono">
          <span className="dot" />
          gofetch.ts — DMP side-channel · Apple M-series
          <span className="phase-chip mono">{PHASE_LABEL[phase]}</span>
        </div>

        <div className="grid2">

          {/* ============ LEFT COLUMN ============ */}
          <div className="left">

            {/* extracted key */}
            <div>
              <div className="sec-hdr mono">recovered key bits</div>
              <div className="key-row mono">
                {extracted.map((b, i) => (
                  <div
                    key={i}
                    className={[
                      "kbit",
                      i === bit && phase !== "complete" ? "active" : "",
                      b !== null ? "known" : "",
                    ].join(" ")}
                    title={`bit ${i}`}
                  >
                    {b === null ? "?" : b}
                  </div>
                ))}
              </div>
              {phase === "complete" && (
                <div className="key-hex mono">
                  <span style={{ color: "var(--magenta)" }}>
                    0x{extractedHex.toString(16).padStart(2, "0").toUpperCase()}
                  </span>
                  <span style={{ color: "var(--faint)", fontSize: 12, marginLeft: 10 }}>
                    actual: 0x{secretHex.toString(16).padStart(2, "0").toUpperCase()}
                    {" "}({extractedHex === secretHex ? "✓ match" : "✗ mismatch"})
                  </span>
                </div>
              )}
            </div>

            {/* current round info */}
            {phase !== "complete" && (
              <div className="round-info mono">
                <span style={{ color: "var(--faint)", fontSize: 11 }}>attacking bit</span>
                <span style={{ color: "var(--magenta)", fontSize: 22, fontWeight: 700 }}>
                  {bit}
                </span>
                <span style={{ color: "var(--faint)", fontSize: 11 }}>/ {N_BITS - 1}</span>
              </div>
            )}

            {/* intermediate value */}
            <div>
              <div className="sec-hdr mono">intermediate value</div>
              <div className="iv-box mono">
                {iv !== null ? (
                  <>
                    <span className="iv-val" style={{ color: "var(--cyan)" }}>
                      0x{iv.toString(16).toUpperCase().padStart(5, "0")}
                    </span>
                    <span
                      className="iv-tag"
                      style={{
                        color: isPointerLike(iv) ? "var(--magenta)" : "var(--faint)",
                        borderColor: isPointerLike(iv)
                          ? "var(--magenta)" : "var(--line)",
                      }}
                    >
                      {isPointerLike(iv) ? "ptr-like ✓" : "not a ptr ✗"}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "var(--faint)" }}>—</span>
                )}
              </div>
              <div className="ptr-range mono">
                pointer range: 0x{PTR_LO.toString(16)} – 0x{PTR_HI.toString(16)}
              </div>
            </div>

            {/* probe timing */}
            <div>
              <div className="sec-hdr mono">probe timing</div>
              <div className="timing-wrap">
                <div className="timing-bar">
                  <div
                    className="timing-fill"
                    style={{
                      width: `${probeBarPct}%`,
                      background: probeIsHit ? "var(--green)" : "var(--magenta)",
                    }}
                  />
                  <div
                    className="thresh-mark"
                    style={{ left: `${thresholdPct}%` }}
                    title={`threshold: ${PROBE_HIT_THRESHOLD} cycles`}
                  />
                </div>
                <div className="timing-label mono">
                  {probeCycles !== null ? (
                    <>
                      <span style={{ color: probeColor, fontWeight: 700 }}>
                        {probeCycles} cy
                      </span>
                      <span style={{ color: "var(--faint)", marginLeft: 6 }}>
                        threshold: {PROBE_HIT_THRESHOLD}
                      </span>
                      <span style={{ color: probeColor, marginLeft: 8 }}>
                        {probeIsHit ? "↑ HIT (DMP fired)" : "↓ MISS (no prefetch)"}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--faint)" }}>awaiting probe…</span>
                  )}
                </div>
              </div>
            </div>

            {/* buttons */}
            <div className="btn-row">
              <button
                className="mono btn step-btn"
                onClick={step}
                disabled={!canStep}
              >
                step →
              </button>
              <button
                className={`mono btn auto-btn ${auto ? "running" : ""}`}
                onClick={() => setAuto(a => !a)}
                disabled={phase === "complete"}
              >
                {auto ? "pause ⏸" : "auto ▶"}
              </button>
              <button className="mono btn reset-btn" onClick={reset}>
                reset
              </button>
            </div>

          </div>{/* /left */}

          {/* ============ RIGHT COLUMN ============ */}
          <div className="right">

            {/* cache visualiser */}
            <div className="sec-hdr mono">
              shared cache ({CACHE_SIZE} lines)
              <span style={{ color: "var(--faint)", marginLeft: 8, fontWeight: 400 }}>
                — showing ownership
              </span>
            </div>
            <div className="cache-grid mono">
              {cache.map((line, i) => (
                <div
                  key={i}
                  className={`cl cl-${line.owner}`}
                >
                  <span className="cl-i">{i.toString().padStart(2, "0")}</span>
                  <span className="cl-addr">
                    {line.owner === "empty"  && "—"}
                    {line.owner === "primed" &&
                      `0x${line.address!.toString(16).toUpperCase()}`}
                    {line.owner === "dmp"    &&
                      <span style={{ color: "var(--magenta)" }}>
                        0x{line.address!.toString(16).toUpperCase()} ← DMP
                      </span>
                    }
                  </span>
                </div>
              ))}
            </div>

            {/* legend */}
            <div className="legend mono">
              <span className="lg lg-primed">attacker (primed)</span>
              <span className="lg lg-dmp">DMP prefetch</span>
              <span className="lg lg-empty">empty</span>
            </div>

            {/* attack log */}
            <div className="sec-hdr mono" style={{ marginTop: 12 }}>attack log</div>
            <div className="atk-log mono">
              {log.length === 0 ? (
                <div style={{ color: "var(--faint)" }}>
                  press step or auto ▶ to begin the attack
                </div>
              ) : log.map((e, i) => (
                <div key={i} className={`le le-${e.kind}`}>
                  <span className="le-tag">[{e.kind}]</span>{" "}{e.text}
                </div>
              ))}
            </div>

          </div>{/* /right */}

        </div>{/* /grid2 */}
      </div>{/* /panel */}
    </div>
  );
}

/* ---- scoped styles ---- */
const css = `
.gf .panel {
  border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface); overflow: hidden;
}

/* header */
.gf .panel-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid var(--line);
  font-size: 12px; color: var(--dim);
  background: rgba(255,255,255,0.02);
}
.gf .dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--magenta); box-shadow: var(--glow) var(--magenta);
}
.gf .phase-chip {
  margin-left: auto; font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--magenta);
  border: 1px solid var(--magenta); padding: 2px 8px; border-radius: 3px;
  opacity: 0.85;
}

/* two-column grid */
.gf .grid2 {
  display: grid; grid-template-columns: 320px 1fr;
}
@media (max-width: 820px) {
  .gf .grid2 { grid-template-columns: 1fr; }
}

/* left panel */
.gf .left {
  padding: 20px; border-right: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 18px;
}
@media (max-width: 820px) {
  .gf .left { border-right: none; border-bottom: 1px solid var(--line); }
}

/* right panel */
.gf .right {
  padding: 20px; display: flex; flex-direction: column; gap: 6px;
}

/* section headers */
.gf .sec-hdr {
  font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--faint); margin-bottom: 8px; font-weight: 500;
}

/* key bits row */
.gf .key-row {
  display: flex; gap: 5px; flex-wrap: wrap;
}
.gf .kbit {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700;
  border: 1px solid var(--line); border-radius: 5px;
  color: var(--faint); transition: all .2s; cursor: default;
}
.gf .kbit.active {
  border-color: rgba(255,77,141,0.6);
  box-shadow: 0 0 10px rgba(255,77,141,0.2);
}
.gf .kbit.known {
  color: var(--magenta); border-color: var(--magenta);
  background: rgba(255,77,141,0.08);
}
.gf .key-hex {
  margin-top: 10px; font-size: 20px; font-weight: 700;
  display: flex; align-items: baseline; gap: 0;
}

/* round counter */
.gf .round-info {
  display: flex; align-items: baseline; gap: 6px;
}

/* intermediate value */
.gf .iv-box {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; background: var(--surface-2);
  border: 1px solid var(--line); border-radius: 5px;
  min-height: 40px;
}
.gf .iv-val { font-size: 15px; font-weight: 700; }
.gf .iv-tag {
  font-size: 10px; padding: 2px 7px;
  border-radius: 3px; border: 1px solid;
}
.gf .ptr-range {
  font-size: 10px; color: var(--faint); margin-top: 4px;
}

/* timing bar */
.gf .timing-wrap { display: flex; flex-direction: column; gap: 5px; }
.gf .timing-bar {
  position: relative; height: 10px;
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 3px; overflow: visible;
}
.gf .timing-fill {
  height: 100%; border-radius: 3px;
  transition: width 0.45s ease;
}
.gf .thresh-mark {
  position: absolute; top: -2px; height: calc(100% + 4px);
  width: 2px; background: var(--amber); opacity: 0.75;
  border-radius: 1px;
}
.gf .timing-label { font-size: 11px; display: flex; align-items: center; }

/* buttons */
.gf .btn-row { display: flex; gap: 8px; margin-top: 2px; }
.gf .btn {
  flex: 1; font-size: 12px; padding: 9px 4px;
  border-radius: 5px; cursor: pointer;
  border: 1px solid var(--line); transition: all .15s;
}
.gf .btn:disabled { opacity: .4; cursor: default; pointer-events: none; }
.gf .step-btn { background: var(--surface-2); color: var(--ink); }
.gf .step-btn:hover { border-color: var(--line-bright); }
.gf .auto-btn {
  background: var(--magenta); color: var(--void);
  font-weight: 700; border-color: var(--magenta);
}
.gf .auto-btn:not(:disabled):hover { box-shadow: var(--glow) var(--magenta); }
.gf .auto-btn.running {
  background: var(--surface-2); color: var(--magenta); border-color: var(--magenta);
}
.gf .reset-btn { background: transparent; color: var(--dim); }
.gf .reset-btn:hover { border-color: var(--line-bright); color: var(--ink); }

/* cache grid */
.gf .cache-grid {
  display: flex; flex-direction: column; gap: 2px;
  max-height: 280px; overflow-y: auto;
}
.gf .cl {
  display: grid; grid-template-columns: 24px 1fr;
  gap: 8px; font-size: 11px;
  padding: 4px 8px; border-radius: 3px;
  border: 1px solid transparent; transition: all .2s;
}
.gf .cl-i { color: var(--faint); }
.gf .cl-addr { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gf .cl-empty {
  color: var(--faint); background: rgba(255,255,255,0.01);
}
.gf .cl-primed {
  color: var(--cyan); background: rgba(43,217,255,0.04);
  border-color: rgba(43,217,255,0.12);
}
.gf .cl-dmp {
  background: rgba(255,77,141,0.1); border-color: var(--magenta);
}

/* cache legend */
.gf .legend {
  display: flex; gap: 12px; flex-wrap: wrap;
  font-size: 10px; margin-top: 6px;
}
.gf .lg {
  display: flex; align-items: center; gap: 5px; color: var(--faint);
}
.gf .lg::before {
  content: ''; width: 10px; height: 10px; border-radius: 2px;
  border: 1px solid transparent; flex-shrink: 0;
}
.gf .lg-primed::before {
  background: rgba(43,217,255,0.04); border-color: rgba(43,217,255,0.4);
}
.gf .lg-dmp::before {
  background: rgba(255,77,141,0.1); border-color: var(--magenta);
}
.gf .lg-empty::before {
  background: rgba(255,255,255,0.01); border-color: var(--line);
}

/* attack log */
.gf .atk-log {
  font-size: 11px; flex: 1; max-height: 190px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
}
.gf .le { color: var(--dim); line-height: 1.5; }
.gf .le-tag { font-weight: 700; }
.gf .le-attack .le-tag { color: var(--cyan); }
.gf .le-victim .le-tag { color: var(--amber); }
.gf .le-dmp    .le-tag { color: var(--magenta); }
.gf .le-probe  .le-tag { color: var(--violet); }
.gf .le-reveal { color: var(--magenta); font-weight: 600; }
.gf .le-reveal .le-tag { color: var(--magenta); }
`;
