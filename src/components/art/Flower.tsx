/**
 * 程序化花朵（原创 SVG）。坐标系：根部在 (0,0)，向上为 -y，开花高度约 100 单位。
 * 花种：rose 玫瑰 / iris 鸢尾 / sunflower 向日葵 / lily 铃兰
 * 阶段：seed 种子 / sprout 嫩芽 / leaf 生叶 / bud 花苞 / bloom 开花；open ∈ [0,1] 用于花瓣展开动画
 * 所有变化由 seed 决定（同一株植物每次绘制一致），不使用随机数。
 */
import React from "react";
import { colorOf, type StageKey } from "@/lib/flora";

export type FlowerProps = {
  species: string; color: string; stage: StageKey; open?: number; seed?: number; uid: string;
  withGround?: boolean;
};

const SAGE = { light: "#C3D1B6", mid: "#9CAF91", deep: "#62775E", ink: "#4A5C48" };

function rnd(seed: number, i: number) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function Leaf({ x, y, len, w, rot, uid, flip = false }: { x: number; y: number; len: number; w: number; rot: number; uid: string; flip?: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s} 1)`}>
      <path d={`M0 0 C ${w} ${-len * 0.22} ${w * 0.72} ${-len * 0.78} 0 ${-len} C ${-w * 0.5} ${-len * 0.8} ${-w * 0.85} ${-len * 0.25} 0 0Z`} fill={`url(#${uid}-leaf)`} stroke={SAGE.ink} strokeOpacity={0.35} strokeWidth={0.45} />
      <path d={`M0 -1 Q ${w * 0.12} ${-len * 0.5} 0 ${-len * 0.96}`} stroke={SAGE.ink} strokeOpacity={0.45} strokeWidth={0.5} fill="none" />
      {[0.3, 0.5, 0.7].map((t, i) => (
        <path key={i} d={`M${w * 0.06} ${-len * t} q ${w * 0.32} ${-len * 0.06} ${w * 0.55} ${-len * 0.16}`} stroke={SAGE.ink} strokeOpacity={0.25} strokeWidth={0.35} fill="none" />
      ))}
      <path d={`M${-w * 0.35} ${-len * 0.3} Q ${-w * 0.45} ${-len * 0.6} ${-w * 0.12} ${-len * 0.88}`} stroke="#fff" strokeOpacity={0.25} strokeWidth={0.6} fill="none" />
    </g>
  );
}

function Stem({ h, bend, uid }: { h: number; bend: number; uid: string }) {
  const d = `M0 0 C ${bend * 0.4} ${-h * 0.35} ${bend * 1.1} ${-h * 0.65} ${bend} ${-h}`;
  return (
    <g>
      <path d={d} stroke={SAGE.deep} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d={d} stroke={`url(#${uid}-stem)`} strokeWidth={1.2} fill="none" strokeLinecap="round" transform="translate(-0.4 0)" />
    </g>
  );
}

function Ground({ uid, wide = 1 }: { uid: string; wide?: number }) {
  return (
    <g>
      <ellipse cx={0} cy={1.5} rx={13 * wide} ry={3.6} fill={`url(#${uid}-soil)`} />
      <path d={`M${-11 * wide} 1.2 Q 0 ${-3.2} ${11 * wide} 1.2`} fill="#8A7260" opacity={0.55} />
      {[-7, -2, 4, 8].map((x, i) => <circle key={i} cx={x * wide} cy={1 + (i % 2)} r={0.6} fill="#5B4A3E" opacity={0.6} />)}
    </g>
  );
}

/* ───── 花头 ───── */

function RoseHead({ uid, open }: { uid: string; open: number }) {
  // 3/4 侧视的杯状玫瑰：后瓣 → 花心螺旋 → 内瓣 → 前方杯瓣 → 两侧外翻瓣
  const r = 19;
  const k = 0.55 + 0.45 * open;
  const back = (a: number, len: number, w: number) => (
    <path transform={`rotate(${a * (0.55 + 0.45 * open)})`} d={`M0 ${-r * 0.1} C ${-w} ${-r * 0.2} ${-w * 1.05} ${-len} 0 ${-len * 1.04} C ${w * 1.05} ${-len} ${w} ${-r * 0.2} 0 ${-r * 0.1}Z`}
      fill={`url(#${uid}-cup)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.6} />
  );
  const front = (cx: number, w: number, top: number, bottom: number, key: number) => (
    <g key={key}>
      <path d={`M${cx - w} ${top} C ${cx - w * 1.05} ${bottom * 0.75} ${cx + w * 1.05} ${bottom * 0.75} ${cx + w} ${top} C ${cx + w * 0.45} ${top + r * 0.16} ${cx - w * 0.45} ${top + r * 0.16} ${cx - w} ${top}Z`}
        fill={`url(#${uid}-cup)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.65} />
      <path d={`M${cx - w * 0.92} ${top + 0.4} C ${cx - w * 0.4} ${top + r * 0.13} ${cx + w * 0.4} ${top + r * 0.13} ${cx + w * 0.92} ${top + 0.4}`} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.9} fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <g transform={`scale(${k})`}>
      {[-150, 150, 180].map((a, i) => (
        <path key={`s${i}`} transform={`rotate(${a})`} d={`M0 0 C -1.8 -5 -1 ${-r * 0.9} 0 ${-r * 1.02} C 1 ${-r * 0.9} 1.8 -5 0 0Z`} fill={SAGE.deep} />
      ))}
      {back(-62, r * 0.95, r * 0.55)}
      {back(62, r * 0.95, r * 0.55)}
      {back(-24, r * 1.05, r * 0.6)}
      {back(24, r * 1.05, r * 0.6)}
      <ellipse cx={0} cy={-r * 0.42} rx={r * 0.62} ry={r * 0.26} fill={`url(#${uid}-petal2)`} />
      <path d={`M${-r * 0.42} ${-r * 0.42} C ${-r * 0.3} ${-r * 0.68} ${r * 0.36} ${-r * 0.66} ${r * 0.4} ${-r * 0.4}`} stroke={`url(#${uid}-deep)`} strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <path d={`M${-r * 0.2} ${-r * 0.44} C ${-r * 0.1} ${-r * 0.58} ${r * 0.2} ${-r * 0.56} ${r * 0.16} ${-r * 0.42} C ${r * 0.1} ${-r * 0.34} ${-r * 0.06} ${-r * 0.38} ${-r * 0.02} ${-r * 0.46}`} stroke={`url(#${uid}-deep)`} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      {/* 外翻的两侧瓣 */}
      <path transform={`rotate(${-4 - 10 * open})`} d={`M${-r * 0.2} ${-r * 0.12} C ${-r * 0.95} ${-r * 0.34} ${-r * 1.22} ${r * 0.16} ${-r * 0.82} ${r * 0.42} C ${-r * 0.52} ${r * 0.58} ${-r * 0.26} ${r * 0.36} ${-r * 0.2} ${-r * 0.12}Z`} fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.6} />
      <path transform={`rotate(${4 + 10 * open})`} d={`M${r * 0.2} ${-r * 0.12} C ${r * 0.95} ${-r * 0.34} ${r * 1.22} ${r * 0.16} ${r * 0.82} ${r * 0.42} C ${r * 0.52} ${r * 0.58} ${r * 0.26} ${r * 0.36} ${r * 0.2} ${-r * 0.12}Z`} fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.6} />
      {front(-r * 0.36, r * 0.42, -r * 0.34, r * 0.72, 1)}
      {front(r * 0.36, r * 0.42, -r * 0.3, r * 0.74, 2)}
      {front(0, r * 0.5, -r * 0.18, r * 0.86, 3)}
    </g>
  );
}

function IrisHead({ uid, open }: { uid: string; open: number }) {
  const s = 0.55 + 0.45 * open;
  const fall = "M0 0 C -9 4 -12 16 -6 25 C -3 29 3 29 6 25 C 12 16 9 4 0 0Z";
  const std = "M0 0 C -6 -5 -8 -16 -3 -24 C -1 -27 1 -27 3 -24 C 8 -16 6 -5 0 0Z";
  return (
    <g transform={`scale(${s})`}>
      {/* 后方垂瓣 */}
      {[-58, 58].map((a, i) => (
        <g key={i} transform={`rotate(${a * (0.6 + 0.4 * open)}) scale(0.92)`}>
          <path d={fall} fill={`url(#${uid}-petal2)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.6} />
          {[-2.5, 0, 2.5].map((x, j) => <path key={j} d={`M${x * 0.4} 3 Q ${x} 12 ${x * 1.2} 21`} stroke={`url(#${uid}-deep)`} strokeOpacity={0.6} strokeWidth={0.45} fill="none" />)}
        </g>
      ))}
      {/* 旗瓣（直立） */}
      {[-24, 24].map((a, i) => (
        <g key={i} transform={`rotate(${a * (0.5 + 0.5 * open)})`}><path d={std} fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.6} /></g>
      ))}
      <path d={std} transform="scale(1.06)" fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.6} />
      <path d="M0 -2 Q 0.6 -12 0 -22" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.7} fill="none" />
      {/* 前方垂瓣 */}
      <g transform={`rotate(0) scale(1.08)`}>
        <path d={fall} fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.7} />
        {[-3.5, -1.2, 1.2, 3.5].map((x, j) => <path key={j} d={`M${x * 0.3} 4 Q ${x} 13 ${x * 1.25} 22`} stroke={`url(#${uid}-deep)`} strokeOpacity={0.55} strokeWidth={0.45} fill="none" />)}
        <path d="M0 2 Q 0.5 7 0 11" stroke="#E7C56E" strokeWidth={2.2} strokeLinecap="round" fill="none" />
        <path d="M0 2 Q 0.5 7 0 11" stroke="#FFF1C4" strokeWidth={0.8} strokeLinecap="round" fill="none" />
      </g>
      <ellipse cx={0} cy={0} rx={2.4} ry={1.6} fill={SAGE.deep} />
    </g>
  );
}

function SunflowerHead({ uid, open, seed }: { uid: string; open: number; seed: number }) {
  const n = 18;
  const ray = (len: number, w: number) => `M0 0 C ${-w} ${-len * 0.3} ${-w * 0.7} ${-len * 0.85} 0 ${-len} C ${w * 0.7} ${-len * 0.85} ${w} ${-len * 0.3} 0 0Z`;
  const disk = 9;
  const golden = 137.508 * (Math.PI / 180);
  const seeds = Array.from({ length: 70 }, (_, i) => {
    const rr = disk * 0.95 * Math.sqrt((i + 0.5) / 70);
    const th = i * golden;
    return { x: rr * Math.cos(th), y: rr * Math.sin(th), r: 0.42 + 0.35 * (rr / disk) };
  });
  return (
    <g transform={`scale(${0.6 + 0.4 * open} ${(0.6 + 0.4 * open) * 0.9})`}>
      {Array.from({ length: n }, (_, i) => (
        <g key={`b${i}`} transform={`rotate(${(360 / n) * i + 10}) translate(0 ${-disk * 0.7})`}>
          <path d={ray(15 * open + 3, 3.6)} fill={`url(#${uid}-petal2)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.5} />
        </g>
      ))}
      {Array.from({ length: n }, (_, i) => (
        <g key={`f${i}`} transform={`rotate(${(360 / n) * i + (rnd(seed, i) - 0.5) * 4}) translate(0 ${-disk * 0.75})`}>
          <path d={ray(14 * open + 3, 3.2)} fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.5} />
          <path d={`M0 -1 L0 ${-(14 * open + 2)}`} stroke="#fff" strokeOpacity={0.22} strokeWidth={0.5} />
        </g>
      ))}
      <circle r={disk} fill={`url(#${uid}-disk)`} />
      {seeds.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i % 3 ? "#4A3220" : "#8C6334"} opacity={0.85} />)}
      <circle r={disk} fill="none" stroke="#3E2A1A" strokeOpacity={0.35} strokeWidth={0.6} />
    </g>
  );
}

function LilyBells({ uid, open, count }: { uid: string; open: number; count: number }) {
  // 拱形花莛 + 下垂的小铃铛
  const pts = Array.from({ length: count }, (_, i) => {
    const t = 0.25 + (i / Math.max(1, count - 1)) * 0.72;
    const x = 24 * t; const y = -60 + 34 * t * t - 4 * t;
    return { x, y, s: 1.05 - t * 0.45 };
  });
  return (
    <g>
      <path d="M0 0 C 1 -30 6 -56 15 -61 C 22 -65 28 -58 29 -48" stroke={SAGE.deep} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {pts.map((p, i) => {
        const s = (0.45 + 0.55 * open) * p.s * 1.35;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <path d="M0 0 Q 1.6 2 1 4.2" stroke={SAGE.deep} strokeWidth={0.7} fill="none" />
            <g transform={`translate(1 4.4) scale(${s})`}>
              <path d="M-4.2 0 C -4.4 -5.8 4.4 -5.8 4.2 0 L 5 2.4 Q 3.6 1.2 2.5 2.8 Q 1.2 1.3 0 3 Q -1.2 1.3 -2.5 2.8 Q -3.6 1.2 -5 2.4 Z" transform="translate(0 4.6)"
                fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.45} />
              <path d="M-2.4 0.2 Q -2 3 -1.6 4.2" transform="translate(0 0.6)" stroke="#fff" strokeOpacity={0.5} strokeWidth={0.5} fill="none" />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/* ───── 花苞 ───── */
function Bud({ species, uid }: { species: string; uid: string }) {
  if (species === "sunflower") {
    return (
      <g>
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} transform={`rotate(${i * 36})`} d="M0 0 L -2.2 -7.5 L 0 -9.5 L 2.2 -7.5Z" fill={i % 2 ? SAGE.mid : SAGE.deep} />
        ))}
        <circle r={5.2} fill={SAGE.deep} />
        <circle r={3.2} cx={-1} cy={-1} fill={SAGE.mid} opacity={0.6} />
      </g>
    );
  }
  if (species === "lily") {
    return <LilyBells uid={uid} open={0} count={4} />;
  }
  if (species === "iris") {
    return (
      <g>
        <path d="M0 2 C -3 -4 -2.4 -14 0 -20 C 2.4 -14 3 -4 0 2Z" fill={`url(#${uid}-petal)`} />
        <path d="M-1 3 C -5 -3 -4 -10 -1.6 -13 L -0.6 2Z" fill={SAGE.deep} />
        <path d="M1 3 C 5 -3 4 -8 1.8 -10 L 0.6 2Z" fill={SAGE.mid} />
      </g>
    );
  }
  return (
    <g>
      <path d="M0 1 C -6 -2 -5.5 -12 0 -16 C 5.5 -12 6 -2 0 1Z" fill={`url(#${uid}-petal)`} stroke={`url(#${uid}-edge)`} strokeWidth={0.5} />
      <path d="M-0.5 -3 C -2 -7 -1 -11 0.8 -14" stroke={`url(#${uid}-deep)`} strokeWidth={0.7} fill="none" />
      {[-34, 0, 34].map((a, i) => <path key={i} transform={`rotate(${a})`} d="M0 1 C -2.5 -2 -2 -8 0 -11 C 2 -8 2.5 -2 0 1Z" fill={i === 1 ? SAGE.mid : SAGE.deep} opacity={i === 1 ? 0.75 : 0.95} />)}
    </g>
  );
}

export function FlowerDefs({ uid, color }: { uid: string; color: string }) {
  const c = colorOf(color);
  return (
    <defs>
      <radialGradient id={`${uid}-petal`} cx="50%" cy="85%" r="85%">
        <stop offset="0%" stopColor={c.deep} />
        <stop offset="45%" stopColor={c.petal} />
        <stop offset="100%" stopColor={c.light} />
      </radialGradient>
      <radialGradient id={`${uid}-petal2`} cx="50%" cy="90%" r="90%">
        <stop offset="0%" stopColor={c.deep} />
        <stop offset="70%" stopColor={c.petal} />
        <stop offset="100%" stopColor={c.petal} />
      </radialGradient>
      <linearGradient id={`${uid}-cup`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={c.light} />
        <stop offset="45%" stopColor={c.petal} />
        <stop offset="100%" stopColor={c.deep} />
      </linearGradient>
      <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={c.deep} stopOpacity={0.75} />
        <stop offset="100%" stopColor={c.deep} stopOpacity={0.25} />
      </linearGradient>
      <linearGradient id={`${uid}-deep`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={c.deep} />
        <stop offset="100%" stopColor={c.deep} stopOpacity={0.6} />
      </linearGradient>
      <linearGradient id={`${uid}-leaf`} x1="0" y1="1" x2="0.4" y2="0">
        <stop offset="0%" stopColor={SAGE.deep} />
        <stop offset="60%" stopColor={SAGE.mid} />
        <stop offset="100%" stopColor={SAGE.light} />
      </linearGradient>
      <linearGradient id={`${uid}-stem`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={SAGE.mid} stopOpacity={0.2} />
        <stop offset="100%" stopColor={SAGE.light} stopOpacity={0.8} />
      </linearGradient>
      <radialGradient id={`${uid}-soil`} cx="50%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#8E7461" />
        <stop offset="100%" stopColor="#5E4C40" />
      </radialGradient>
      <radialGradient id={`${uid}-disk`} cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#A87B3F" />
        <stop offset="100%" stopColor="#5A3B22" />
      </radialGradient>
      <radialGradient id={`${uid}-glow`}>
        <stop offset="0%" stopColor="#F5E3B0" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#D7B779" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

/** 完整植物（不含 <svg> 外壳）；调用方负责提供 FlowerDefs */
export function FlowerBody({ species, stage, open = 1, seed = 1, uid, withGround = true }: Omit<FlowerProps, "color">) {
  const bend = (rnd(seed, 1) - 0.5) * 10;
  const leafRot = (rnd(seed, 2) - 0.5) * 14;
  if (stage === "seed") {
    return (
      <g>
        <circle cx={0} cy={-4} r={9} fill={`url(#${uid}-glow)`} opacity={0.7} />
        <Ground uid={uid} wide={0.8} />
        <path d="M-3 -0.5 C -3 -5.5 3 -5.5 3 -0.5 C 1.6 0.6 -1.6 0.6 -3 -0.5Z" fill="#B99567" stroke="#7A5E3E" strokeWidth={0.5} />
        <path d="M-1.4 -3.2 Q 0 -4.4 1.3 -3.4" stroke="#F1DDB6" strokeWidth={0.6} fill="none" />
      </g>
    );
  }
  if (stage === "sprout") {
    return (
      <g>
        {withGround && <Ground uid={uid} wide={0.85} />}
        <path d={`M0 0 Q ${bend * 0.2} -8 ${bend * 0.25} -15`} stroke={SAGE.deep} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <Leaf x={bend * 0.25} y={-14} len={9} w={4.6} rot={-58} uid={uid} />
        <Leaf x={bend * 0.25} y={-14} len={9.5} w={4.6} rot={58} uid={uid} flip />
      </g>
    );
  }
  const h = stage === "leaf" ? 40 : stage === "bud" ? 62 : species === "lily" ? 20 : 74;
  const head = { x: bend, y: -h };
  const leaves = stage === "leaf" ? 3 : 4;
  return (
    <g>
      {withGround && <Ground uid={uid} />}
      {species === "lily" ? (
        <>
          <Leaf x={-1} y={0} len={stage === "leaf" ? 32 : 40} w={9.5} rot={-16 + leafRot * 0.3} uid={uid} />
          <Leaf x={1} y={0} len={stage === "leaf" ? 28 : 34} w={8.5} rot={18 + leafRot * 0.3} uid={uid} flip />
          {stage === "bud" && <g transform="translate(0 -2) scale(0.85)"><LilyBells uid={uid} open={0.15} count={4} /></g>}
          {stage === "bloom" && <g transform="translate(0 -2)"><LilyBells uid={uid} open={open} count={6} /></g>}
          {stage === "leaf" && <path d="M0 0 Q 2 -14 1 -24" stroke={SAGE.deep} strokeWidth={1.4} fill="none" />}
        </>
      ) : (
        <>
          <Stem h={h} bend={bend} uid={uid} />
          {Array.from({ length: leaves }, (_, i) => {
            const t = 0.18 + i * (0.6 / leaves);
            const side = i % 2 === 0;
            const len = (species === "iris" ? 30 : species === "sunflower" ? 17 : 13) * (1 - t * 0.35) * (stage === "leaf" ? 0.9 : 1);
            const w = species === "iris" ? 3.6 : species === "sunflower" ? 9 : 6.5;
            const rot = species === "iris" ? (side ? -10 : 12) : side ? -52 - leafRot : 52 + leafRot;
            return <Leaf key={i} x={bend * t * 0.9} y={-h * t} len={len} w={w} rot={rot} uid={uid} flip={!side} />;
          })}
          {stage === "leaf" && <Leaf x={bend} y={-h + 2} len={8} w={3.6} rot={-12} uid={uid} />}
          {stage === "bud" && <g transform={`translate(${head.x} ${head.y})`}><Bud species={species} uid={uid} /></g>}
          {stage === "bloom" && (
            <g transform={`translate(${head.x} ${head.y})`}>
              {species === "rose" && <RoseHead uid={uid} open={open} />}
              {species === "iris" && <g transform="translate(0 -2)"><IrisHead uid={uid} open={open} /></g>}
              {species === "sunflower" && <SunflowerHead uid={uid} open={open} seed={seed} />}
            </g>
          )}
        </>
      )}
    </g>
  );
}

/** 独立的花朵 SVG（档案页、选择花种等处使用） */
export function FlowerSvg({ size = 160, className, title, crop = false, ...p }: FlowerProps & { size?: number; className?: string; title?: string; crop?: boolean }) {
  // crop：按阶段裁剪视窗，小图标里的种子与嫩芽也清晰可见
  const vb = !crop ? "-50 -122 100 130" : p.stage === "seed" || p.stage === "sprout" ? "-18 -27 36 34" : p.stage === "leaf" ? "-32 -58 64 64" : "-50 -122 100 130";
  const [, , vw, vh] = vb.split(" ").map(Number);
  return (
    <svg viewBox={vb} width={size} height={(size * vh) / vw} className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <FlowerDefs uid={p.uid} color={p.color} />
      <FlowerBody {...p} />
    </svg>
  );
}

export function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 997) + 1;
}
