"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   TCP three-way handshake simulator.
   Correct state machine:
     Client: CLOSED → (send SYN) → SYN_SENT → (recv SYN-ACK, send ACK) → ESTABLISHED
     Server: CLOSED → (listen)   → LISTEN   → (recv SYN, send SYN-ACK) → SYN_RECEIVED
                                                → (recv ACK) → ESTABLISHED
   Sequence numbers are real: ISN_C / ISN_S chosen once; ack = peer_seq + 1.
   ------------------------------------------------------------------ */

// ── Types ──────────────────────────────────────────────────────────────────

type TcpState = "CLOSED" | "LISTEN" | "SYN_SENT" | "SYN_RECEIVED" | "ESTABLISHED";
type DeviceKind = "client" | "server";

interface Pos { x: number; y: number; }
interface PktAnim { stepIdx: number; progress: number; }
interface LogEntry { dir: string; label: string; seq: number; ack: number | null; flags: string[]; }

// ── Constants ──────────────────────────────────────────────────────────────

const ISN_C = 1742;   // client initial sequence number
const ISN_S = 4892;   // server initial sequence number
const DW    = 112;    // device box width  (px)
const DH    = 72;     // device box height (px)
const ANIM  = 820;    // packet travel time (ms)

const STEPS = [
  { label: "SYN",     from: "client" as DeviceKind, seq: ISN_C,     ack: null,       flags: ["SYN"]        },
  { label: "SYN-ACK", from: "server" as DeviceKind, seq: ISN_S,     ack: ISN_C + 1,  flags: ["SYN", "ACK"] },
  { label: "ACK",     from: "client" as DeviceKind, seq: ISN_C + 1, ack: ISN_S + 1,  flags: ["ACK"]        },
] as const;

// State applied when packet is SENT (before animation)
const ON_SEND: Record<number, { who: DeviceKind; state: TcpState } | undefined> = {
  0: { who: "client", state: "SYN_SENT" },
};

// State applied when packet ARRIVES (after animation)
const ON_ARRIVE: Record<number, { who: DeviceKind; state: TcpState } | undefined> = {
  0: { who: "server", state: "SYN_RECEIVED" },
  1: { who: "client", state: "ESTABLISHED"  },
  2: { who: "server", state: "ESTABLISHED"  },
};

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TcpHandshake() {
  const canvasRef = useRef<HTMLDivElement>(null);

  // Device positions on canvas (null = not placed yet)
  const [clientPos, setClientPos] = useState<Pos | null>(null);
  const [serverPos, setServerPos] = useState<Pos | null>(null);

  // TCP state machine
  const [clientState, setClientState] = useState<TcpState>("CLOSED");
  const [serverState, setServerState] = useState<TcpState>("CLOSED");

  // Handshake progress: -1 = not started, 0-2 = current step index, 3 = done
  const [step,      setStep]      = useState(-1);
  const [animating, setAnimating] = useState(false);
  const [autoRun,   setAutoRun]   = useState(false);
  const [pktAnim,   setPktAnim]   = useState<PktAnim | null>(null);
  const [log,       setLog]       = useState<LogEntry[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progRef  = useRef(0);

  // Drag state held in a ref so event handlers don't go stale
  const dragRef = useRef<{
    kind: "palette-client" | "palette-server" | "device-client" | "device-server";
    ox: number; // pointer offset from device centre (canvas coords)
    oy: number;
  } | null>(null);

  const both    = clientPos !== null && serverPos !== null;
  const started = step >= 0;
  const done    = step >= 3;

  // Stop auto-run when handshake completes
  useEffect(() => { if (done) setAutoRun(false); }, [done]);

  // ── Drag helpers ────────────────────────────────────────────────────────

  const getCanvasRect = useCallback(() =>
    canvasRef.current?.getBoundingClientRect() ?? null, []);

  const onPaletteDown = useCallback((e: React.PointerEvent, kind: DeviceKind) => {
    if (kind === "client" && clientPos) return;
    if (kind === "server" && serverPos) return;
    e.preventDefault();
    dragRef.current = { kind: `palette-${kind}`, ox: 0, oy: 0 };
  }, [clientPos, serverPos]);

  const onDeviceDown = useCallback((e: React.PointerEvent, kind: DeviceKind) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = getCanvasRect();
    if (!rect) return;
    const pos = kind === "client" ? clientPos : serverPos;
    if (!pos) return;
    dragRef.current = {
      kind: `device-${kind}`,
      ox: (e.clientX - rect.left) - pos.x,
      oy: (e.clientY - rect.top)  - pos.y,
    };
  }, [getCanvasRect, clientPos, serverPos]);

  useEffect(() => {
    function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      const rect = getCanvasRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const x = clamp(cx - dragRef.current.ox, DW / 2, rect.width  - DW / 2);
      const y = clamp(cy - dragRef.current.oy, DH / 2, rect.height - DH / 2);
      if (dragRef.current.kind === "device-client") setClientPos({ x, y });
      if (dragRef.current.kind === "device-server") setServerPos({ x, y });
    }

    function onUp(e: PointerEvent) {
      if (!dragRef.current) return;
      const rect = getCanvasRect();
      if (rect && dragRef.current.kind.startsWith("palette-")) {
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        if (cx >= 0 && cx <= rect.width && cy >= 0 && cy <= rect.height) {
          function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
          const x = clamp(cx, DW / 2, rect.width  - DW / 2);
          const y = clamp(cy, DH / 2, rect.height - DH / 2);
          if (dragRef.current.kind === "palette-client" && !clientPos) setClientPos({ x, y });
          if (dragRef.current.kind === "palette-server" && !serverPos) setServerPos({ x, y });
        }
      }
      dragRef.current = null;
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup",   onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup",   onUp);
    };
  }, [getCanvasRect, clientPos, serverPos]);

  // ── Handshake logic ─────────────────────────────────────────────────────

  const runStep = useCallback((si: number) => {
    if (animating || si > 2) return;
    setAnimating(true);
    progRef.current = 0;
    setPktAnim({ stepIdx: si, progress: 0 });

    // Transition sender state as soon as packet is sent
    const send = ON_SEND[si];
    if (send) {
      if (send.who === "client") setClientState(send.state);
      else                       setServerState(send.state);
    }

    const s = STEPS[si];
    setLog(l => [...l, {
      dir: s.from === "client" ? "C → S" : "S → C",
      label: s.label, seq: s.seq, ack: s.ack, flags: [...s.flags],
    }]);

    timerRef.current = setInterval(() => {
      progRef.current += 16 / ANIM;
      const p = Math.min(progRef.current, 1);
      setPktAnim({ stepIdx: si, progress: p });

      if (p >= 1) {
        clearInterval(timerRef.current!);
        timerRef.current = null;

        // Transition receiver state when packet arrives
        const arrive = ON_ARRIVE[si];
        if (arrive) {
          if (arrive.who === "client") setClientState(arrive.state);
          else                         setServerState(arrive.state);
        }

        setPktAnim(null);
        setStep(si + 1);
        setAnimating(false);
      }
    }, 16);
  }, [animating]);

  // Auto-run: fire next step after a short pause when ready
  useEffect(() => {
    if (!autoRun || animating || done || step < 0 || step > 2) return;
    const delay = step === 0 ? 120 : 480;
    const t = setTimeout(() => runStep(step), delay);
    return () => clearTimeout(t);
  }, [autoRun, animating, done, step, runStep]);

  const startHandshake = useCallback(() => {
    setServerState("LISTEN");
    setClientState("CLOSED");
    setStep(0);
    setLog([]);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setClientState("CLOSED");
    setServerState("CLOSED");
    setStep(-1);
    setPktAnim(null);
    setLog([]);
    setAnimating(false);
    setAutoRun(false);
  }, []);

  // ── Packet position (canvas SVG coordinates) ─────────────────────────────

  const pktPos = (pktAnim && clientPos && serverPos) ? (() => {
    const s    = STEPS[pktAnim.stepIdx];
    const from = s.from === "client" ? clientPos : serverPos;
    const to   = s.from === "client" ? serverPos : clientPos;
    const t    = easeInOut(pktAnim.progress);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, label: s.label };
  })() : null;

  // ── Colour for state labels ───────────────────────────────────────────────

  const stateCol = (s: TcpState) => {
    if (s === "ESTABLISHED") return "var(--green)";
    if (s === "CLOSED")      return "var(--faint)";
    if (s === "LISTEN")      return "var(--cyan)";
    return "var(--neon)";
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="tcp">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="panel">
        <div className="panel-bar mono">
          <span className={`dot${done ? " established" : autoRun && started && !done ? " live" : ""}`} />
          tcp-handshake.ts — three-way handshake
        </div>

        <div className="tcp-layout">

          {/* ── Left sidebar ── */}
          <div className="tcp-side">

            <div className="side-label mono">// devices</div>

            {(["client", "server"] as DeviceKind[]).map(kind => {
              const placed = kind === "client" ? clientPos !== null : serverPos !== null;
              return (
                <div
                  key={kind}
                  className={`palette-item mono${placed ? " placed" : ""}`}
                  onPointerDown={placed ? undefined : (e) => onPaletteDown(e, kind)}
                  style={{ cursor: placed ? "default" : "grab" }}
                >
                  <span className={`p-icon ${kind === "client" ? "client-col" : "server-col"}`}>
                    {kind === "client" ? ">_" : "[▦]"}
                  </span>
                  <span>
                    <div className="p-name">{kind}</div>
                    <div className="p-hint">{placed ? "✓ on canvas" : "drag to canvas"}</div>
                  </span>
                </div>
              );
            })}

            {both && (
              <>
                <div className="side-label mono" style={{ marginTop: 18 }}>// control</div>

                {!started && (
                  <button className="mono ctrl-btn primary" onClick={startHandshake}>
                    ▶ begin handshake
                  </button>
                )}

                {started && !done && (
                  <>
                    <button
                      className="mono ctrl-btn"
                      onClick={() => { if (!animating) runStep(step); }}
                      disabled={animating}
                    >
                      step →
                    </button>
                    <button
                      className={`mono ctrl-btn${autoRun ? " active" : " primary"}`}
                      onClick={() => setAutoRun(r => !r)}
                    >
                      {autoRun ? "⏸ pause" : "▶▶ auto-run"}
                    </button>
                  </>
                )}

                {started && (
                  <button className="mono ctrl-btn reset-btn" onClick={reset}>
                    ↺ reset
                  </button>
                )}
              </>
            )}

            {started && (
              <>
                <div className="side-label mono" style={{ marginTop: 18 }}>// progress</div>
                {STEPS.map((s, i) => (
                  <div key={i} className={`prog-row mono${i < step ? " done" : i === step && !done ? " current" : ""}`}>
                    <span className="prog-n">{i + 1}.</span>
                    <span className="prog-lbl">{s.label}</span>
                    <span className="prog-dir">{s.from === "client" ? "C→S" : "S→C"}</span>
                  </div>
                ))}

                <div className="side-label mono" style={{ marginTop: 18 }}>// sequences</div>
                <div className="seq-row mono"><span className="seq-k">ISN<sub>c</sub></span><span className="seq-v cyan-col">{ISN_C}</span></div>
                <div className="seq-row mono"><span className="seq-k">ISN<sub>s</sub></span><span className="seq-v cyan-col">{ISN_S}</span></div>
              </>
            )}
          </div>

          {/* ── Right: canvas + packet log ── */}
          <div className="tcp-main">

            <div className="canvas" ref={canvasRef}>

              {!both && (
                <div className="canvas-hint mono">
                  drag {!clientPos && !serverPos ? "client + server" : !clientPos ? "the client" : "the server"} onto the canvas
                </div>
              )}

              {/* SVG: connection line + animated packet */}
              {both && (
                <svg className="canvas-svg">
                  <line
                    x1={clientPos!.x} y1={clientPos!.y}
                    x2={serverPos!.x} y2={serverPos!.y}
                    stroke={done ? "var(--green)" : started ? "var(--cyan)" : "var(--line-bright)"}
                    strokeWidth={done ? 2 : 1.5}
                    strokeDasharray={done ? undefined : "6 4"}
                    strokeOpacity={0.55}
                  />

                  {pktPos && (
                    <g style={{ filter: "drop-shadow(0 0 6px var(--cyan))" }}>
                      <rect
                        x={pktPos.x - 35} y={pktPos.y - 14}
                        width={70} height={28} rx={5}
                        fill="var(--surface-2)"
                        stroke="var(--cyan)" strokeWidth={1.5}
                      />
                      <text
                        x={pktPos.x} y={pktPos.y + 5}
                        textAnchor="middle"
                        style={{ fill: "var(--cyan)", fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: 1 }}
                      >
                        {pktPos.label}
                      </text>
                    </g>
                  )}
                </svg>
              )}

              {/* Client device */}
              {clientPos && (
                <div
                  className="device"
                  style={{ left: clientPos.x - DW / 2, top: clientPos.y - DH / 2, width: DW, height: DH }}
                  onPointerDown={(e) => onDeviceDown(e, "client")}
                >
                  <div className="dev-icon client-col mono">&gt;_</div>
                  <div className="dev-name mono">client</div>
                  <div className="dev-state mono" style={{ color: stateCol(clientState) }}>{clientState}</div>
                </div>
              )}

              {/* Server device */}
              {serverPos && (
                <div
                  className="device"
                  style={{ left: serverPos.x - DW / 2, top: serverPos.y - DH / 2, width: DW, height: DH }}
                  onPointerDown={(e) => onDeviceDown(e, "server")}
                >
                  <div className="dev-icon server-col mono">[▦]</div>
                  <div className="dev-name mono">server</div>
                  <div className="dev-state mono" style={{ color: stateCol(serverState) }}>{serverState}</div>
                </div>
              )}

              {done && (
                <div className="established-badge mono">✓ connection established</div>
              )}
            </div>

            {/* Packet log */}
            {log.length > 0 && (
              <div className="pkt-log mono">
                <div className="pkt-log-head">packet log</div>
                {log.map((e, i) => (
                  <div key={i} className="pkt-row">
                    <span className="pkt-dir">{e.dir}</span>
                    <span className="pkt-lbl">{e.label}</span>
                    <span className="pkt-seq">seq={e.seq}</span>
                    {e.ack !== null && <span className="pkt-ack">ack={e.ack}</span>}
                    <span className="pkt-flags">[{e.flags.join(",")}]</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const css = `
.tcp .panel{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;}
.tcp .panel-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim);background:rgba(255,255,255,0.02);}
.tcp .dot{width:8px;height:8px;border-radius:50%;background:var(--faint);flex-shrink:0;}
.tcp .dot.live{background:var(--neon);box-shadow:var(--glow) var(--neon);}
.tcp .dot.established{background:var(--green);box-shadow:var(--glow) var(--green);}

.tcp .tcp-layout{display:grid;grid-template-columns:210px 1fr;}
@media(max-width:700px){.tcp .tcp-layout{grid-template-columns:1fr;}}

/* ── Sidebar ── */
.tcp .tcp-side{padding:16px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:6px;min-width:0;}
@media(max-width:700px){.tcp .tcp-side{border-right:none;border-bottom:1px solid var(--line);}}
.tcp .side-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:2px;margin-bottom:2px;}

.tcp .palette-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:6px;font-size:12px;color:var(--dim);user-select:none;transition:all .15s;}
.tcp .palette-item:not(.placed):hover{border-color:var(--cyan);color:var(--ink);}
.tcp .palette-item.placed{opacity:.4;cursor:default;}
.tcp .p-icon{font-size:14px;min-width:30px;text-align:center;font-weight:700;}
.tcp .client-col{color:var(--neon);}
.tcp .server-col{color:var(--cyan);}
.tcp .cyan-col{color:var(--cyan);}
.tcp .p-name{font-weight:700;color:var(--ink);font-size:12px;}
.tcp .p-hint{font-size:10px;color:var(--faint);margin-top:1px;}

.tcp .ctrl-btn{width:100%;padding:8px 12px;font-size:12px;border-radius:5px;cursor:pointer;border:1px solid var(--line);background:var(--surface-2);color:var(--dim);transition:all .15s;text-align:left;}
.tcp .ctrl-btn:hover:not(:disabled){border-color:var(--cyan);color:var(--cyan);}
.tcp .ctrl-btn.primary{background:var(--neon);color:var(--void);border-color:var(--neon);font-weight:700;}
.tcp .ctrl-btn.primary:hover{filter:brightness(1.1);box-shadow:var(--glow) var(--neon);}
.tcp .ctrl-btn.active{background:var(--surface-2);border-color:var(--neon);color:var(--neon);}
.tcp .ctrl-btn.reset-btn{color:var(--faint);}
.tcp .ctrl-btn.reset-btn:hover{border-color:var(--magenta);color:var(--magenta);}
.tcp .ctrl-btn:disabled{opacity:.35;cursor:default;}

.tcp .prog-row{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--faint);padding:3px 0;}
.tcp .prog-row.done{color:var(--dim);}
.tcp .prog-row.done .prog-lbl::before{content:"✓ ";color:var(--green);}
.tcp .prog-row.current{color:var(--neon);}
.tcp .prog-row.current .prog-lbl::before{content:"→ ";}
.tcp .prog-n{width:14px;flex-shrink:0;}
.tcp .prog-lbl{flex:1;font-weight:600;}
.tcp .prog-dir{font-size:10px;color:var(--faint);}

.tcp .seq-row{display:flex;align-items:baseline;gap:8px;font-size:11px;padding:2px 0;}
.tcp .seq-k{color:var(--dim);min-width:40px;}
.tcp .seq-v{font-weight:700;}

/* ── Canvas ── */
.tcp .tcp-main{display:flex;flex-direction:column;min-height:340px;}
.tcp .canvas{position:relative;flex:1;min-height:340px;background:var(--surface);overflow:hidden;background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:24px 24px;}
.tcp .canvas-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;}
.tcp .canvas-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:12px;letter-spacing:.06em;pointer-events:none;}

.tcp .device{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid var(--line-bright);border-radius:8px;background:var(--surface-2);cursor:move;user-select:none;padding:8px 6px;transition:border-color .18s;box-shadow:0 4px 16px rgba(0,0,0,0.3);}
.tcp .device:hover{border-color:var(--cyan);}
.tcp .dev-icon{font-size:16px;line-height:1;font-weight:700;}
.tcp .dev-name{font-size:10px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;}
.tcp .dev-state{font-size:9px;letter-spacing:.04em;white-space:nowrap;margin-top:1px;}

.tcp .established-badge{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--green);letter-spacing:.1em;background:var(--surface-2);padding:5px 14px;border-radius:4px;border:1px solid var(--green);white-space:nowrap;text-shadow:var(--glow) var(--green);pointer-events:none;}

/* ── Packet log ── */
.tcp .pkt-log{border-top:1px solid var(--line);padding:10px 14px;background:var(--surface);}
.tcp .pkt-log-head{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-bottom:8px;}
.tcp .pkt-row{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;align-items:center;padding:3px 0;border-bottom:1px solid var(--line);}.tcp .pkt-row:last-child{border-bottom:none;}
.tcp .pkt-dir{color:var(--faint);min-width:36px;}
.tcp .pkt-lbl{color:var(--cyan);font-weight:700;min-width:58px;letter-spacing:.04em;}
.tcp .pkt-seq{color:var(--neon);}
.tcp .pkt-ack{color:var(--dim);}
.tcp .pkt-flags{color:var(--faint);}
`;
