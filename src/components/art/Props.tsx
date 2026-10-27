/**
 * 星球地表的原创道具与角色（可替换资产）。坐标系与花朵一致：底部中心为 (0,0)，向上为 -y。
 * 角色：旅行者（原创形象：深色短发、雾紫色连帽长外套、铜色小水壶）与向导“星灯”（漂浮光团）。
 */
import React from "react";

export function Bench({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C9A27A" /><stop offset="100%" stopColor="#8E6A4B" />
        </linearGradient>
      </defs>
      <ellipse cx={0} cy={0.6} rx={18} ry={2.2} fill="#000" opacity={0.18} />
      {[-12, 12].map((x) => <path key={x} d={`M${x} 0 L ${x} -9 M${x - 2} 0 L ${x + 0.6} -9`} stroke="#3B3550" strokeWidth={1.3} />)}
      <rect x={-16} y={-11} width={32} height={2.6} rx={1} fill={`url(#${uid}-wood)`} />
      <rect x={-16} y={-14.2} width={32} height={2.2} rx={1} fill={`url(#${uid}-wood)`} opacity={0.95} />
      <rect x={-15} y={-21} width={30} height={2.4} rx={1} fill={`url(#${uid}-wood)`} />
      <rect x={-15} y={-25} width={30} height={2.4} rx={1} fill={`url(#${uid}-wood)`} />
      {[-12, 12].map((x) => <path key={x} d={`M${x} -11 L ${x + 0.8} -26`} stroke="#3B3550" strokeWidth={1.2} />)}
      <path d="M-15 -24.4 L 15 -24.4" stroke="#F5EEDF" strokeOpacity={0.35} strokeWidth={0.5} />
    </g>
  );
}

export function Lamp({ uid, lit = true }: { uid: string; lit?: boolean }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0%" stopColor="#FFE9B8" stopOpacity={0.9} />
          <stop offset="35%" stopColor="#D7B779" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#D7B779" stopOpacity={0} />
        </radialGradient>
      </defs>
      {lit && <circle cx={0} cy={-50} r={26} fill={`url(#${uid}-halo)`} className="kv-lamp-halo" />}
      <ellipse cx={0} cy={0.5} rx={6} ry={1.6} fill="#000" opacity={0.2} />
      <path d="M-3.5 0 L 3.5 0 L 2 -4 L -2 -4Z" fill="#2E2A45" />
      <path d="M0 -4 L 0 -44" stroke="#2E2A45" strokeWidth={1.6} />
      <path d="M0 -44 Q 0 -49 4 -49" stroke="#2E2A45" strokeWidth={1.2} fill="none" />
      <path d="M-5 -44 L 5 -44 L 3.6 -55 L -3.6 -55Z" fill={lit ? "#FFE2A6" : "#8C86A6"} stroke="#2E2A45" strokeWidth={1} />
      <path d="M0 -44 L 0 -55" stroke="#2E2A45" strokeWidth={0.6} opacity={0.6} />
      <path d="M-5.5 -55 L 5.5 -55 L 0 -60Z" fill="#2E2A45" />
      <circle cx={0} cy={-61} r={1.1} fill="#2E2A45" />
    </g>
  );
}

export function Greenhouse({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E9E3F7" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#B8ACD9" stopOpacity={0.25} />
        </linearGradient>
      </defs>
      <ellipse cx={0} cy={0.8} rx={24} ry={3} fill="#000" opacity={0.18} />
      <path d="M-20 0 L -20 -20 Q 0 -44 20 -20 L 20 0Z" fill={`url(#${uid}-glass)`} stroke="#EDE6D3" strokeOpacity={0.85} strokeWidth={1} />
      {[-10, 0, 10].map((x) => <path key={x} d={`M${x} 0 L ${x} ${x === 0 ? -32 : -27}`} stroke="#EDE6D3" strokeOpacity={0.7} strokeWidth={0.7} />)}
      <path d="M-20 -20 L 20 -20 M-20 -10 L 20 -10" stroke="#EDE6D3" strokeOpacity={0.6} strokeWidth={0.6} />
      <path d="M-15 -26 Q -6 -37 4 -38" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      {[-13, -6, 7, 14].map((x, i) => (
        <g key={i} transform={`translate(${x} 0)`}>
          <path d="M0 0 Q 0.5 -4 0 -7" stroke="#62775E" strokeWidth={0.9} fill="none" />
          <ellipse cx={-1.4} cy={-5} rx={1.6} ry={0.8} transform="rotate(-30 -1.4 -5)" fill="#9CAF91" />
          <ellipse cx={1.4} cy={-6} rx={1.6} ry={0.8} transform="rotate(30 1.4 -6)" fill="#9CAF91" />
          <circle cx={0} cy={-7.6} r={1.1} fill={["#D98C9A", "#F3E9D6", "#B8ACD9", "#E2C27F"][i]} />
        </g>
      ))}
      <rect x={-3.5} y={-12} width={7} height={12} fill="#2E2A45" opacity={0.25} />
    </g>
  );
}

export function Observatory({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-dome`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F5EEDF" /><stop offset="100%" stopColor="#B8ACD9" />
        </linearGradient>
      </defs>
      <ellipse cx={0} cy={0.8} rx={16} ry={2.4} fill="#000" opacity={0.2} />
      <rect x={-12} y={-20} width={24} height={20} fill="#D9CFE9" stroke="#4A4466" strokeWidth={0.8} />
      <rect x={-12} y={-20} width={6} height={20} fill="#fff" opacity={0.25} />
      <path d="M-14 -20 A 14 13 0 0 1 14 -20Z" fill={`url(#${uid}-dome)`} stroke="#4A4466" strokeWidth={0.8} />
      <path d="M-2 -20 L -1 -32 L 2.2 -32 L 3 -20Z" fill="#2E2A45" opacity={0.85} />
      <path d="M1 -26 L 13 -37" stroke="#4A4466" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M11 -35.5 L 14.5 -38.5" stroke="#D7B779" strokeWidth={2.8} strokeLinecap="round" />
      <rect x={-3} y={-9} width={6} height={9} rx={3} fill="#4A4466" />
      <circle cx={-7} cy={-13} r={1.6} fill="#FFE2A6" />
    </g>
  );
}

export function Traveler({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-coat`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C9BEE6" /><stop offset="100%" stopColor="#8D7FBC" />
        </linearGradient>
      </defs>
      <ellipse cx={0} cy={0.6} rx={7} ry={1.6} fill="#000" opacity={0.22} />
      <path d="M-2.4 0 L -2 -6 M2.4 0 L 2 -6" stroke="#2E2A45" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M-6.2 -5 C -5.4 -12 -4.2 -18 -3.2 -21 L 3.2 -21 C 4.2 -18 5.4 -12 6.2 -5 Q 0 -3.4 -6.2 -5Z" fill={`url(#${uid}-coat)`} stroke="#5E5288" strokeWidth={0.5} />
      <path d="M0 -20.5 L 0 -5" stroke="#5E5288" strokeOpacity={0.5} strokeWidth={0.5} />
      <path d="M-3.4 -20.6 Q 0 -18 3.4 -20.6" stroke="#F5EEDF" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {/* 手臂与铜色小水壶 */}
      <path d="M3.4 -19 Q 6.6 -15 7.2 -12" stroke="#A497CF" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <g transform="translate(9 -11)">
        <path d="M-2.6 0 L 2.6 0 L 2.2 -3.8 L -2.2 -3.8Z" fill="#C79A5B" />
        <path d="M2.4 -2.6 L 6 -5.4" stroke="#C79A5B" strokeWidth={0.9} />
        <path d="M-1.6 -3.8 Q 0 -6.4 1.6 -3.8" stroke="#8E6A3B" strokeWidth={0.6} fill="none" />
      </g>
      <path d="M-3.4 -19 Q -5.4 -15 -5 -11.6" stroke="#A497CF" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {/* 头部：深色短发，背后垂着兜帽 */}
      <path d="M-4.6 -22 Q -6 -27 -3.6 -29.5 L 3.6 -29.5 Q 6 -27 4.6 -22Z" fill="#8D7FBC" opacity={0.9} />
      <circle cx={0} cy={-25.6} r={4} fill="#F3DCC8" />
      <path d="M-4.2 -25.4 C -4.6 -30.4 4.6 -30.8 4.2 -25.6 C 2.8 -27.4 0.4 -27.8 -1.2 -27 C -2.2 -26.4 -3.2 -26 -4.2 -25.4Z" fill="#2B2A44" />
      <circle cx={-1.4} cy={-24.8} r={0.45} fill="#2B2A44" />
      <circle cx={1.5} cy={-24.8} r={0.45} fill="#2B2A44" />
      <circle cx={-2.6} cy={-23.6} r={0.8} fill="#E8A9A6" opacity={0.5} />
      <circle cx={2.7} cy={-23.6} r={0.8} fill="#E8A9A6" opacity={0.5} />
    </g>
  );
}

/** 向导“星灯”：小型漂浮光团（独立 SVG） */
export function GuideOrb({ size = 40, thinking = false, className }: { size?: number; thinking?: boolean; className?: string }) {
  // 星灯：与 3D 场景中的小灯一致（暖光核心、纸罩、木质灯帽、下方小星），不画五官
  return (
    <svg viewBox="-20 -20 40 40" width={size} height={size} className={`kv-orb ${thinking ? "is-thinking" : ""} ${className ?? ""}`} aria-hidden="true">
      <defs>
        <radialGradient id="orb-halo"><stop offset="0%" stopColor="#FFE9B8" stopOpacity={0.85} /><stop offset="55%" stopColor="#DDB56D" stopOpacity={0.22} /><stop offset="100%" stopColor="#F2C9B6" stopOpacity={0} /></radialGradient>
        <radialGradient id="orb-core" cx="42%" cy="38%"><stop offset="0%" stopColor="#FFFDF4" /><stop offset="65%" stopColor="#FFE3A3" /><stop offset="100%" stopColor="#DDB56D" /></radialGradient>
      </defs>
      <circle r={19} fill="url(#orb-halo)" className="kv-orb-halo" />
      <circle r={9.5} fill="#FFF1D2" opacity={0.55} />
      <circle r={7} fill="url(#orb-core)" />
      <rect x={-4.2} y={-12.6} width={8.4} height={3.2} rx={1.4} fill="#8C5F40" />
      <circle cx={0} cy={-14.2} r={1.5} fill="none" stroke="#8C5F40" strokeWidth={0.9} />
      <path d="M0 10.5 L 1.6 13.6 L 0 16.6 L -1.6 13.6Z" fill="#FFF7E8" />
      <circle cx={-2.4} cy={-2.6} r={1.6} fill="#fff" opacity={0.75} />
    </svg>
  );
}

/** 可替换资产登记表：替换角色或道具只需修改这里 */
export const ASSETS = { Bench, Lamp, Greenhouse, Observatory, Traveler, GuideOrb };
