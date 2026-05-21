"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useState, Suspense } from "react";

/* ------------------------------------------------------------------
   Anatomy of a chip — react-three-fiber scene.
   Declarative meshes grouped into toggleable layers. Hovering a
   functional block raises a callout naming it. Stylized, not a real
   fabrication layout (a good "homework" refinement later).
   ------------------------------------------------------------------ */

type LayerKey = "package" | "lid" | "die" | "blocks" | "pins";

const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "package", label: "package" },
  { key: "lid", label: "lid" },
  { key: "die", label: "die" },
  { key: "blocks", label: "functional blocks" },
  { key: "pins", label: "pins" },
];

interface Block {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  name: string;
}

const BLOCKS: Block[] = [
  { pos: [-0.4, 0.24, -0.4], size: [0.5, 0.04, 0.5], color: "#ffb02b", name: "Core 0" },
  { pos: [0.25, 0.24, -0.4], size: [0.5, 0.04, 0.5], color: "#ffb02b", name: "Core 1" },
  { pos: [-0.4, 0.24, 0.3], size: [0.5, 0.04, 0.5], color: "#ffb02b", name: "Core 2" },
  { pos: [0.25, 0.24, 0.3], size: [0.5, 0.04, 0.5], color: "#ffb02b", name: "Core 3" },
  { pos: [0.0, 0.24, 0.0], size: [0.28, 0.04, 1.0], color: "#2bff9a", name: "Shared L3 cache" },
  { pos: [-0.55, 0.24, 0.0], size: [0.18, 0.04, 1.0], color: "#2bd9ff", name: "Memory controller" },
  { pos: [0.55, 0.24, 0.0], size: [0.18, 0.04, 1.0], color: "#2bd9ff", name: "I/O" },
];

function Pins() {
  const balls = [];
  for (let x = -1.2; x <= 1.2; x += 0.4)
    for (let z = -1.2; z <= 1.2; z += 0.4)
      balls.push([x, -0.16, z] as [number, number, number]);
  return (
    <group>
      {balls.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color="#b0b0b8" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function FunctionalBlock({ block }: { block: Block }) {
  const [hover, setHover] = useState(false);
  return (
    <mesh
      position={block.pos}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
    >
      <boxGeometry args={block.size} />
      <meshStandardMaterial
        color={block.color}
        metalness={0.4}
        roughness={0.5}
        transparent
        opacity={hover ? 1 : 0.9}
        emissive={block.color}
        emissiveIntensity={hover ? 0.5 : 0.12}
      />
      {hover && (
        <Html center distanceFactor={8} position={[0, 0.4, 0]}>
          <div style={{
            fontFamily: "var(--mono, monospace)", fontSize: 12, whiteSpace: "nowrap",
            background: "rgba(5,7,6,0.92)", color: "#d6f0e4",
            border: "1px solid #2a3a33", borderRadius: 4, padding: "4px 9px",
            transform: "translateY(-100%)", pointerEvents: "none",
          }}>
            <span style={{ color: block.color }}>▸</span> {block.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function Scene({ visible }: { visible: Record<LayerKey, boolean> }) {
  return (
    <>
      <ambientLight intensity={0.55} color="#99ccbb" />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <directionalLight position={[-5, 2, -3]} intensity={0.4} color="#2bff9a" />

      {visible.package && (
        <mesh>
          <boxGeometry args={[3, 0.18, 3]} />
          <meshStandardMaterial color="#0d3a1c" metalness={0.1} roughness={0.8} />
        </mesh>
      )}

      {visible.pins && <Pins />}

      {visible.lid && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2.4, 0.28, 2.4]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.85} roughness={0.35} />
        </mesh>
      )}

      {visible.die && (
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[1.4, 0.08, 1.4]} />
          <meshStandardMaterial color="#1a2436" metalness={0.5} roughness={0.4} />
        </mesh>
      )}

      {visible.blocks && BLOCKS.map((b, i) => <FunctionalBlock key={i} block={b} />)}

      <gridHelper args={[12, 24, "#2a3a33", "#1c2622"]} position={[0, -0.6, 0]} />

      <OrbitControls enablePan={false} minDistance={4} maxDistance={14} autoRotate autoRotateSpeed={0.6} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={["#ff4d8d", "#2bff9a", "#2bd9ff"]} labelColor="#d6f0e4" />
      </GizmoHelper>
    </>
  );
}

export default function ChipModel() {
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    package: true, lid: true, die: true, blocks: true, pins: true,
  });
  const toggle = (k: LayerKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));

  return (
    <div className="chip">
      <style>{css}</style>
      <div className="panel">
        <div className="panel-bar mono">
          <span className="dot live" /> chip.tsx — react-three-fiber scene
        </div>
        <div className="canvas-host">
          <Canvas camera={{ position: [4.2, 3.4, 4.6], fov: 40 }} dpr={[1, 2]}>
            <Suspense fallback={null}>
              <Scene visible={visible} />
            </Suspense>
          </Canvas>
        </div>
        <div className="layers">
          {LAYERS.map((l) => (
            <button key={l.key} className={`mono lyr ${visible[l.key] ? "on" : ""}`} onClick={() => toggle(l.key)}>
              {l.label}
            </button>
          ))}
          <span className="hint mono">drag to rotate · scroll to zoom · hover blocks</span>
        </div>
      </div>
    </div>
  );
}

const css = `
.chip .panel{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;}
.chip .panel-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim);background:rgba(255,255,255,0.02);}
.chip .dot{width:8px;height:8px;border-radius:50%;background:var(--neon);box-shadow:var(--glow) var(--neon);}
.chip .canvas-host{width:100%;height:440px;}
.chip .layers{display:flex;gap:8px;padding:14px 16px;border-top:1px solid var(--line);flex-wrap:wrap;align-items:center;}
.chip .lyr{font-size:11px;padding:7px 12px;border-radius:5px;cursor:pointer;background:transparent;border:1px solid var(--line);color:var(--dim);transition:all .15s;}
.chip .lyr.on{border-color:var(--amber);color:var(--amber);background:rgba(255,176,43,0.08);}
.chip .hint{margin-left:auto;font-size:11px;color:var(--faint);}
`;
