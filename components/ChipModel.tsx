"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport, Edges } from "@react-three/drei";
import { useState, Suspense } from "react";

/* ------------------------------------------------------------------
   Apple M1 die floorplan — react-three-fiber interactive 3D model.

   Layer Y-stack (no shared surfaces → no z-fighting):
     PCB       centre  0.00   height 0.20   top  0.10
     Substrate centre  0.13   height 0.05   top  0.155
     Die       centre  0.22   height 0.10   top  0.27
     Blocks    centre  0.292  height 0.04   (0.002 gap above die top)
     IHS/lid   centre  0.50   height 0.26   bottom 0.37

   Die footprint 1.4 × 1.4 units. Floorplan rows (Z, top→bottom):
     Row 1  Z -0.70→-0.38   CPU cluster (4 P-cores + 4 E-cores)
     Row 2  Z -0.35→-0.13   System Level Cache
     Row 3  Z -0.10→ 0.30   Memory controller | GPU | PCIe/TB
     Row 4  Z  0.32→ 0.68   Neural Engine | Media Engine | ISP
   ------------------------------------------------------------------ */

// ── Types ──────────────────────────────────────────────────────────────────

type LayerKey = "package" | "substrate" | "lid" | "die" | "blocks" | "pins";

// ── Layer toggle definitions ───────────────────────────────────────────────

const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "package",   label: "package"       },
  { key: "substrate", label: "substrate"     },
  { key: "lid",       label: "IHS / lid"     },
  { key: "die",       label: "die"           },
  { key: "blocks",    label: "func. blocks"  },
  { key: "pins",      label: "solder balls"  },
];

// ── Y-stack constants ──────────────────────────────────────────────────────

const PCB_Y   = 0.00;
const PCB_H   = 0.20;   // top = 0.10
const SUB_Y   = 0.13;
const SUB_H   = 0.05;   // top = 0.155
const DIE_Y   = 0.22;
const DIE_H   = 0.10;
const DIE_TOP = DIE_Y + DIE_H / 2;   // 0.27
const BLK_H   = 0.04;
const BLK_Y   = DIE_TOP + 0.002 + BLK_H / 2;  // 0.292 — clear of die surface
const LID_Y   = 0.50;
const LID_H   = 0.26;   // bottom = 0.37, well above block tops at 0.312

// ── M1 die floorplan blocks ────────────────────────────────────────────────

interface Block {
  pos:   [number, number, number];
  size:  [number, number, number];
  color: string;
  name:  string;
  desc:  string;
}

const BLOCKS: Block[] = [
  // ── Row 1: CPU cluster (Z: -0.70 → -0.38) ──────────────────────────────
  { pos: [-0.56, BLK_Y, -0.54], size: [0.26, BLK_H, 0.32], color: "#ffb02b", name: "P-Core 0",           desc: "Firestorm · high-perf"       },
  { pos: [-0.28, BLK_Y, -0.54], size: [0.26, BLK_H, 0.32], color: "#ffb02b", name: "P-Core 1",           desc: "Firestorm · high-perf"       },
  { pos: [ 0.00, BLK_Y, -0.54], size: [0.26, BLK_H, 0.32], color: "#ffb02b", name: "P-Core 2",           desc: "Firestorm · high-perf"       },
  { pos: [ 0.28, BLK_Y, -0.54], size: [0.26, BLK_H, 0.32], color: "#ffb02b", name: "P-Core 3",           desc: "Firestorm · high-perf"       },
  { pos: [ 0.58, BLK_Y, -0.54], size: [0.22, BLK_H, 0.32], color: "#c07820", name: "E-Core Cluster",     desc: "×4 Icestorm · efficiency"    },

  // ── Row 2: System Level Cache (Z: -0.35 → -0.13) ───────────────────────
  { pos: [ 0.00, BLK_Y, -0.24], size: [1.36, BLK_H, 0.22], color: "#2bd9ff", name: "System Level Cache", desc: "16 MB shared SLC"            },

  // ── Row 3: Memory / GPU / PCIe (Z: -0.10 → 0.30) ───────────────────────
  { pos: [-0.60, BLK_Y,  0.10], size: [0.18, BLK_H, 0.40], color: "#1a7aaa", name: "Memory Controller",  desc: "LPDDR4X · unified memory"    },
  { pos: [ 0.03, BLK_Y,  0.10], size: [1.00, BLK_H, 0.40], color: "#9d7bff", name: "GPU — 8 cores",      desc: "Apple Silicon GPU cluster"   },
  { pos: [ 0.62, BLK_Y,  0.10], size: [0.14, BLK_H, 0.40], color: "#4a5a52", name: "PCIe / Thunderbolt", desc: "TB4 · USB4 · PCIe 4.0"       },

  // ── Row 4: Neural / Media / ISP (Z: 0.32 → 0.68) ───────────────────────
  { pos: [-0.48, BLK_Y,  0.50], size: [0.38, BLK_H, 0.36], color: "#ff4d8d", name: "Neural Engine",      desc: "16-core · 11 TOPS"           },
  { pos: [ 0.07, BLK_Y,  0.50], size: [0.68, BLK_H, 0.36], color: "#19b06b", name: "Media Engine",       desc: "H.264 · H.265 · ProRes"      },
  { pos: [ 0.57, BLK_Y,  0.405], size: [0.22, BLK_H, 0.17], color: "#5a6a62", name: "ISP / Display",      desc: "Image signal processor"      },
  { pos: [ 0.57, BLK_Y,  0.595], size: [0.22, BLK_H, 0.15], color: "#2bff9a", name: "Secure Enclave",     desc: "ARMv8 · crypto · fused keys"  },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function BgaPins() {
  const positions: [number, number, number][] = [];
  for (let x = -1.12; x <= 1.13; x += 0.28)
    for (let z = -1.12; z <= 1.13; z += 0.28)
      positions.push([x, PCB_Y - PCB_H / 2 - 0.06, z]);

  return (
    <group>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.055, 8, 6]} />
          <meshStandardMaterial color="#c4c8d4" metalness={0.92} roughness={0.14} />
        </mesh>
      ))}
    </group>
  );
}

function FunctionalBlock({
  block, active, onHover, onToggle,
}: {
  block: Block;
  active: boolean;
  onHover: (h: boolean) => void;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const lit = hover || active;

  return (
    <mesh
      position={block.pos}
      onPointerEnter={(e) => { e.stopPropagation(); setHover(true); onHover(true); }}
      onPointerLeave={() => { setHover(false); onHover(false); }}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <boxGeometry args={block.size} />
      <meshStandardMaterial
        color={block.color}
        metalness={0.25}
        roughness={0.55}
        transparent
        opacity={lit ? 1.0 : 0.90}
        emissive={block.color}
        emissiveIntensity={active ? 0.65 : hover ? 0.40 : 0.14}
      />
      <Edges color={lit ? block.color : "#334433"} threshold={15} />
    </mesh>
  );
}

// One shared no-op raycast disables pointer picking on static meshes
const noRaycast = () => null;

function Scene({ visible, anyHovered, activeBlock, onBlockHover, onBlockToggle }: {
  visible: Record<LayerKey, boolean>;
  anyHovered: boolean;
  activeBlock: string | null;
  onBlockHover: (h: boolean) => void;
  onBlockToggle: (name: string) => void;
}) {
  return (
    <>
      {/* ── Lighting ── */}
      <ambientLight intensity={0.5} color="#c8d8cc" />
      <directionalLight position={[ 5,  9,  5]} intensity={1.1} />
      <directionalLight position={[-4,  3, -4]} intensity={0.3} color="#4488bb" />
      {/* warm point light above die — suggests thermal activity */}
      <pointLight position={[0, 2, 0]} intensity={0.7} color="#ffb050" distance={6} decay={2} />

      {/* ── PCB / package — raycast disabled, it's decorative ── */}
      {visible.package && (
        <mesh position={[0, PCB_Y, 0]} raycast={noRaycast}>
          <boxGeometry args={[3.1, PCB_H, 3.1]} />
          <meshStandardMaterial color="#0c3318" metalness={0.05} roughness={0.88} />
        </mesh>
      )}

      {/* ── BGA solder balls ── */}
      {visible.pins && <BgaPins />}

      {/* ── Organic substrate — raycast disabled ── */}
      {visible.substrate && (
        <mesh position={[0, SUB_Y, 0]} raycast={noRaycast}>
          <boxGeometry args={[2.32, SUB_H, 2.32]} />
          <meshStandardMaterial color="#192a1e" metalness={0.12} roughness={0.78} />
        </mesh>
      )}

      {/* ── Silicon die — raycast disabled ── */}
      {visible.die && (
        <>
          <mesh position={[0, DIE_Y, 0]} raycast={noRaycast}>
            <boxGeometry args={[1.4, DIE_H, 1.4]} />
            {/* polygonOffset pushes die surface away in z-buffer — belt-and-braces z-fight fix */}
            <meshStandardMaterial
              color="#1c2c40"
              metalness={0.65}
              roughness={0.30}
              polygonOffset
              polygonOffsetFactor={2}
              polygonOffsetUnits={2}
            />
          </mesh>

          {/* Subtle circuit grid etched on die surface */}
          <gridHelper
            args={[1.4, 14, "#243650", "#1a2a3c"]}
            position={[0, DIE_TOP + 0.001, 0]}
          />
        </>
      )}

      {/* ── Functional blocks — only interactive meshes in the scene ── */}
      {visible.blocks && BLOCKS.map((b, i) => (
        <FunctionalBlock
          key={i}
          block={b}
          active={activeBlock === b.name}
          onHover={onBlockHover}
          onToggle={() => onBlockToggle(b.name)}
        />
      ))}

      {/* ── IHS / integrated heat spreader — raycast disabled ── */}
      {visible.lid && (
        <mesh position={[0, LID_Y, 0]} raycast={noRaycast}>
          <boxGeometry args={[2.46, LID_H, 2.46]} />
          {/* semi-transparent so die/blocks remain visible underneath */}
          <meshStandardMaterial
            color="#a8b0bc"
            metalness={0.90}
            roughness={0.18}
            transparent
            opacity={0.78}
          />
        </mesh>
      )}

      {/* ── Floor grid ── */}
      <gridHelper args={[12, 24, "#2a3a33", "#1c2622"]} position={[0, -0.58, 0]} />

      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={14}
        autoRotate={!anyHovered && !activeBlock}
        autoRotateSpeed={0.5}
      />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={["#ff4d8d", "#2bff9a", "#2bd9ff"]} labelColor="#ede8da" />
      </GizmoHelper>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ChipModel() {
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    package: true, substrate: true, lid: true, die: true, blocks: true, pins: true,
  });
  const [anyHovered,  setAnyHovered]  = useState(false);
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const toggle = (k: LayerKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));
  const toggleBlock = (name: string) => setActiveBlock((cur) => cur === name ? null : name);
  const activeData = BLOCKS.find((b) => b.name === activeBlock) ?? null;

  return (
    <div className="chip">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="panel">
        <div className="panel-bar mono">
          <span className="dot" /> chip-m1.tsx — Apple M1 die floorplan · react-three-fiber
        </div>
        <div className="canvas-host">
          {activeData && (
            <div className="block-label mono" style={{ borderColor: activeData.color, boxShadow: `0 0 16px ${activeData.color}44` }}>
              <div className="bl-name" style={{ color: activeData.color }}>{activeData.name}</div>
              <div className="bl-desc">{activeData.desc}</div>
            </div>
          )}
          <Canvas
            camera={{ position: [4.0, 3.2, 4.4], fov: 40 }}
            dpr={[1, 2]}
            onPointerMissed={() => setActiveBlock(null)}
          >
            <Suspense fallback={null}>
              <Scene
                visible={visible}
                anyHovered={anyHovered}
                activeBlock={activeBlock}
                onBlockHover={setAnyHovered}
                onBlockToggle={toggleBlock}
              />
            </Suspense>
          </Canvas>
        </div>
        <div className="layers">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              className={`mono lyr ${visible[l.key] ? "on" : ""}`}
              onClick={() => toggle(l.key)}
            >
              {l.label}
            </button>
          ))}
          <span className="hint mono">drag · scroll · click blocks to label</span>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const css = `
.chip .panel{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;}
.chip .panel-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim);background:rgba(255,255,255,0.02);}
.chip .dot{width:8px;height:8px;border-radius:50%;background:var(--violet);box-shadow:var(--glow) var(--violet);}
.chip .canvas-host{width:100%;height:480px;position:relative;}
.chip .block-label{position:absolute;top:14px;left:14px;z-index:10;background:rgba(13,18,16,0.97);border:1px solid;border-radius:6px;padding:10px 16px;pointer-events:none;}
.chip .bl-name{font-size:13px;font-weight:700;letter-spacing:.06em;}
.chip .bl-desc{font-size:11px;color:var(--dim);margin-top:4px;letter-spacing:.03em;}
.chip .layers{display:flex;gap:8px;padding:14px 16px;border-top:1px solid var(--line);flex-wrap:wrap;align-items:center;}
.chip .lyr{font-size:11px;padding:7px 12px;border-radius:5px;cursor:pointer;background:transparent;border:1px solid var(--line);color:var(--dim);transition:all .15s;}
.chip .lyr.on{border-color:var(--violet);color:var(--violet);background:rgba(157,123,255,0.08);}
.chip .lyr:hover:not(.on){border-color:var(--line-bright);color:var(--ink);}
.chip .hint{margin-left:auto;font-size:11px;color:var(--faint);}
`;
