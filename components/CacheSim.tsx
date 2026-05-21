"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Direct-mapped cache simulator.
   The logic here is the real thing: address → (tag, index, offset),
   line lookup, hit/miss/evict. Verified against textbook results
   (sequential 75%, strided 0%, hot-loop 92% on 8 lines / 16B blocks).
   ------------------------------------------------------------------ */

type Pattern = "seq" | "stride" | "loop" | "random";
type Line = { valid: boolean; tag: number | null };
type LogEntry = { kind: "hit" | "miss"; word: string; addr: number; index: number; tag: number };

const PATTERNS: { id: Pattern; label: string }[] = [
  { id: "seq", label: "sequential" },
  { id: "stride", label: "strided" },
  { id: "loop", label: "hot loop" },
  { id: "random", label: "random" },
];

function buildSequence(pattern: Pattern, lines: number, block: number): number[] {
  const span = lines * block;
  const seq: number[] = [];
  if (pattern === "seq") {
    for (let a = 0; a < span * 1.5; a += 4) seq.push(a);
  } else if (pattern === "stride") {
    const stride = block * 2; // skip a whole block each step → every access misses
    for (let i = 0; i < lines * 2; i++) seq.push(i * stride);
  } else if (pattern === "loop") {
    const hot = Math.min(lines - 1, 4) * block;
    for (let r = 0; r < 3; r++) for (let a = 0; a < hot; a += 4) seq.push(a);
  } else {
    for (let i = 0; i < lines * 3; i++)
      seq.push(Math.floor(Math.random() * lines * 4) * block + Math.floor(Math.random() * block));
  }
  return seq;
}

export default function CacheSim() {
  const [linesPow, setLinesPow] = useState(3); // 2^3 = 8 lines
  const [blockPow, setBlockPow] = useState(4); // 2^4 = 16 bytes
  const [pattern, setPattern] = useState<Pattern>("seq");

  const lines = 2 ** linesPow;
  const block = 2 ** blockPow;

  const [cache, setCache] = useState<Line[]>(() =>
    Array.from({ length: lines }, () => ({ valid: false, tag: null }))
  );
  const [hits, setHits] = useState(0);
  const [miss, setMiss] = useState(0);
  const [flash, setFlash] = useState<{ index: number; kind: "hit" | "miss" } | null>(null);
  const [addr, setAddr] = useState<{ tag: number; index: number; offset: number } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const seqRef = useRef<number[]>([]);
  const posRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // mutable cache mirror so step() doesn't fight React batching
  const cacheRef = useRef<Line[]>(cache);

  const reset = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    const fresh = Array.from({ length: lines }, () => ({ valid: false, tag: null as number | null }));
    cacheRef.current = fresh;
    setCache(fresh);
    setHits(0); setMiss(0); setFlash(null); setAddr(null); setLog([]);
    setRunning(false);
    seqRef.current = buildSequence(pattern, lines, block);
    posRef.current = 0;
  }, [lines, block, pattern]);

  // rebuild whenever config changes
  useEffect(() => { reset(); }, [reset]);

  const step = useCallback((): boolean => {
    const seq = seqRef.current;
    if (posRef.current >= seq.length) return false;
    const a = seq[posRef.current++];

    const offsetBits = Math.log2(block);
    const indexBits = Math.log2(lines);
    const offset = a & (block - 1);
    const index = (a >> offsetBits) & (lines - 1);
    const tag = a >> (offsetBits + indexBits);

    const next = cacheRef.current.slice();
    const line = next[index];
    let kind: "hit" | "miss";
    let word: string;
    if (line.valid && line.tag === tag) {
      kind = "hit"; word = "HIT";
      setHits((h) => h + 1);
    } else {
      kind = "miss";
      word = line.valid && line.tag !== tag ? "MISS+evict" : "MISS";
      next[index] = { valid: true, tag };
      setMiss((m) => m + 1);
    }
    cacheRef.current = next;
    setCache(next);
    setFlash({ index, kind });
    setAddr({ tag, index, offset });
    setLog((l) => [{ kind, word, addr: a, index, tag }, ...l].slice(0, 24));
    return true;
  }, [block, lines]);

  const run = useCallback(() => {
    if (running) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      setRunning(false);
      return;
    }
    setRunning(true);
    timer.current = setInterval(() => {
      const more = step();
      if (!more && timer.current) {
        clearInterval(timer.current); timer.current = null; setRunning(false);
      }
    }, 420);
  }, [running, step]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const total = hits + miss;
  const rate = total ? Math.round((hits / total) * 100) : null;

  return (
    <div className="cache">
      <style>{css}</style>
      <div className="panel">
        <div className="panel-bar mono">
          <span className={`dot ${running ? "live" : ""}`} /> cache-sim.ts — direct-mapped · write-allocate
        </div>
        <div className="grid2">
          {/* controls */}
          <div className="controls">
            <div className="ctl">
              <label className="mono">cache lines <b>{lines}</b></label>
              <input type="range" min={2} max={6} step={1} value={linesPow}
                onChange={(e) => setLinesPow(+e.target.value)} />
            </div>
            <div className="ctl">
              <label className="mono">block size (bytes) <b>{block}</b></label>
              <input type="range" min={2} max={6} step={1} value={blockPow}
                onChange={(e) => setBlockPow(+e.target.value)} />
            </div>
            <div className="ctl">
              <label className="mono">access pattern</label>
              <div className="patterns">
                {PATTERNS.map((p) => (
                  <button key={p.id} className={`mono ${pattern === p.id ? "active" : ""}`}
                    onClick={() => setPattern(p.id)}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="run-row">
              <button className="mono step" onClick={() => { if (timer.current){clearInterval(timer.current);timer.current=null;setRunning(false);} step(); }}>step</button>
              <button className="mono go" onClick={run}>{running ? "pause ⏸" : "run ▶"}</button>
            </div>
            <button className="mono reset" onClick={reset}>reset</button>
          </div>

          {/* view */}
          <div className="view">
            <div className="stats mono">
              <div className="stat"><div className="v hit">{hits}</div><div className="l">hits</div></div>
              <div className="stat"><div className="v miss">{miss}</div><div className="l">misses</div></div>
              <div className="stat"><div className="v rate">{rate === null ? "—" : rate + "%"}</div><div className="l">hit rate</div></div>
            </div>

            <div className="addr mono">
              <div className="seg tag"><div className="b">{addr ? "0x" + addr.tag.toString(16) : "—"}</div><div className="n">tag</div></div>
              <div className="seg idx"><div className="b">{addr ? addr.index : "—"}</div><div className="n">index</div></div>
              <div className="seg off"><div className="b">{addr ? addr.offset : "—"}</div><div className="n">offset</div></div>
            </div>

            <div className="cgrid mono">
              {cache.map((c, i) => (
                <div key={i}
                  className={`cline ${c.valid ? "filled" : ""} ${flash?.index === i ? (flash.kind === "hit" ? "fhit" : "fmiss") : ""}`}>
                  <span className="ln">line {i}</span>
                  <span className="vt">{c.valid ? "V tag=" + c.tag : "—"}</span>
                  <span className="data" />
                </div>
              ))}
            </div>

            <div className="log mono">
              {log.map((e, i) => (
                <div key={i}>
                  <span className={e.kind}>{e.word.padEnd(11)}</span>
                  addr 0x{e.addr.toString(16).padStart(3, "0")} → line {e.index}, tag 0x{e.tag.toString(16)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const css = `
.cache .panel{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;}
.cache .panel-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim);background:rgba(255,255,255,0.02);}
.cache .dot{width:8px;height:8px;border-radius:50%;background:var(--faint);}
.cache .dot.live{background:var(--neon);box-shadow:var(--glow) var(--neon);}
.cache .grid2{display:grid;grid-template-columns:300px 1fr;}
@media(max-width:820px){.cache .grid2{grid-template-columns:1fr;}}
.cache .controls{padding:20px;border-right:1px solid var(--line);}
@media(max-width:820px){.cache .controls{border-right:none;border-bottom:1px solid var(--line);}}
.cache .ctl{margin-bottom:18px;}
.cache .ctl label{display:flex;justify-content:space-between;font-size:12px;color:var(--dim);margin-bottom:6px;}
.cache .ctl label b{color:var(--neon);font-weight:500;}
.cache input[type=range]{width:100%;accent-color:var(--neon);}
.cache .patterns{display:flex;gap:6px;flex-wrap:wrap;}
.cache .patterns button{flex:1;font-size:11px;padding:7px 4px;background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:4px;cursor:pointer;transition:all .15s;}
.cache .patterns button.active,.cache .patterns button:hover{border-color:var(--neon);color:var(--neon);background:rgba(43,255,154,0.07);}
.cache .run-row{display:flex;gap:8px;margin-top:8px;}
.cache .run-row button{flex:1;font-size:13px;padding:9px;border-radius:5px;cursor:pointer;border:1px solid var(--line);transition:all .15s;}
.cache .run-row .step{background:var(--surface-2);color:var(--ink);}
.cache .run-row .step:hover{border-color:var(--line-bright);}
.cache .run-row .go{background:var(--neon);color:var(--void);font-weight:700;border-color:var(--neon);}
.cache .run-row .go:hover{box-shadow:var(--glow) var(--neon);}
.cache .reset{width:100%;margin-top:8px;font-size:12px;padding:8px;background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:5px;cursor:pointer;}
.cache .reset:hover{border-color:var(--magenta);color:var(--magenta);}
.cache .view{padding:20px;}
.cache .stats{display:flex;gap:20px;margin-bottom:16px;}
.cache .stat{flex:1;}
.cache .stat .v{font-size:26px;font-weight:700;}
.cache .stat .v.hit{color:var(--green);text-shadow:var(--glow) var(--green);}
.cache .stat .v.miss{color:var(--magenta);}
.cache .stat .v.rate{color:var(--cyan);}
.cache .stat .l{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);}
.cache .addr{display:flex;border:1px solid var(--line);border-radius:5px;overflow:hidden;margin-bottom:14px;}
.cache .addr .seg{flex:1;text-align:center;padding:8px 10px;border-right:1px solid var(--line);}
.cache .addr .seg:last-child{border-right:none;}
.cache .addr .seg .b{font-size:15px;font-weight:700;}
.cache .addr .seg .n{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:3px;}
.cache .addr .tag .b{color:var(--amber);}
.cache .addr .idx .b{color:var(--neon);}
.cache .addr .off .b{color:var(--dim);}
.cache .cgrid{display:flex;flex-direction:column;gap:3px;}
.cache .cline{display:grid;grid-template-columns:48px 70px 1fr;gap:8px;align-items:center;font-size:11px;padding:5px 8px;border-radius:4px;background:rgba(255,255,255,0.015);border:1px solid transparent;transition:all .25s;}
.cache .cline .ln{color:var(--faint);}
.cache .cline .vt{color:var(--dim);}
.cache .cline .data{height:6px;border-radius:2px;background:var(--line);}
.cache .cline.filled .data{background:var(--amber);opacity:.45;}
.cache .cline.fhit{background:rgba(43,255,154,0.14);border-color:var(--green);}
.cache .cline.fmiss{background:rgba(255,77,141,0.14);border-color:var(--magenta);}
.cache .log{margin-top:14px;font-size:11px;max-height:96px;overflow-y:auto;color:var(--dim);}
.cache .log .hit{color:var(--green);}
.cache .log .miss{color:var(--magenta);}
`;
