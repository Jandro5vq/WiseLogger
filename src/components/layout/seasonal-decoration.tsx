import type { CSSProperties } from 'react'
import type { ActiveSeasonalTheme } from '@/lib/seasonal-theme'

interface SeasonalDecorationProps {
  theme: ActiveSeasonalTheme
  placement: 'header' | 'sidebar'
  preview?: boolean
}

export function SeasonalDecoration({ theme, placement, preview = false }: SeasonalDecorationProps) {
  if (theme === 'none') return null

  const header = placement === 'header'
  return (
    <div
      aria-hidden="true"
      data-seasonal-theme={theme}
      data-seasonal-placement={placement}
      className={`seasonal-decoration pointer-events-auto select-none ${header
        ? `ml-auto h-14 w-72 shrink-0 ${preview ? 'max-w-[calc(100%-7rem)]' : 'hidden lg:block xl:h-16 xl:w-80'}`
        : 'h-14 w-16 shrink-0'}`}
    >
      <svg viewBox={header ? '0 0 288 56' : '0 0 64 56'} className="h-full w-full overflow-hidden" fill="none" focusable="false">
        {header ? <HeaderArtwork theme={theme} /> : <SidebarArtwork theme={theme} />}
      </svg>
    </div>
  )
}

// Animated elements never carry a `transform` attribute: the CSS animation would replace it.
const delay = (seconds: number): CSSProperties => ({ animationDelay: `${-seconds}s` })
const n = (value: number) => Number(value.toFixed(1))

function Star({ x, y, size = 4, color = '#fbbf24', wait = 0 }: { x: number; y: number; size?: number; color?: string; wait?: number }) {
  const s = size
  return (
    <path
      className="seasonal-twinkle"
      style={delay(wait)}
      d={`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`}
      fill={color}
    />
  )
}

// ── Christmas ────────────────────────────────────────────────────────────────

const BULB_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6']

function Bulb({ x, y, index }: { x: number; y: number; index: number }) {
  const color = BULB_COLORS[index % BULB_COLORS.length]
  const wait = (index * 0.7) % 2.8
  return (
    <g transform={`rotate(${index % 2 ? 9 : -9} ${x} ${y})`}>
      <circle className="seasonal-glow" style={delay(wait)} cx={x} cy={y + 11} r="11" fill={color} opacity=".18" />
      <rect x={x - 2.5} y={y} width="5" height="4.5" rx="1" fill="#475569" />
      <path
        className="seasonal-twinkle"
        style={delay(wait)}
        d={`M${x} ${y + 4}c-3.6 0-5.2 3.2-5.2 6.4 0 3.8 2.6 6.8 5.2 6.8s5.2-3 5.2-6.8c0-3.2-1.6-6.4-5.2-6.4Z`}
        fill={color}
      />
      <ellipse cx={x - 1.8} cy={y + 9} rx="1.1" ry="2.2" fill="white" opacity=".6" />
    </g>
  )
}

function Snowflake({ x, y, size = 4, wait = 0 }: { x: number; y: number; size?: number; wait?: number }) {
  const arms = [0, 60, 120].map((angle) => {
    const dx = size * Math.cos((angle * Math.PI) / 180)
    const dy = size * Math.sin((angle * Math.PI) / 180)
    return `M${n(x - dx)} ${n(y - dy)}L${n(x + dx)} ${n(y + dy)}`
  })
  return (
    <g className="seasonal-float" style={delay(wait)}>
      <path d={arms.join('')} stroke="#93c5fd" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx={x} cy={y} r="1.1" fill="#bfdbfe" />
    </g>
  )
}

// Points on the two quadratic swags of the garland (t = .2 … .8), so bulbs sit on the wire.
const GARLAND_BULBS: Array<[number, number]> = [
  [32, 15], [60, 19.8], [88, 20.2], [116, 16.2], [172, 16.2], [200, 20.2], [228, 19.8], [256, 15],
]

function ChristmasHeader() {
  return <>
    <path d="M4 6Q74 34 144 8Q214 34 284 6" stroke="#475569" strokeWidth="1.4" strokeLinecap="round" />
    {GARLAND_BULBS.map(([x, y], index) => <Bulb key={x} x={x} y={y} index={index} />)}
    <g>
      <path d="M144 9l-5 9M144 9l5 9" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" />
      <path d="M144 8c-7-6-12-2-9 2 2 3 6 1 9-2Zm0 0c7-6 12-2 9 2-2 3-6 1-9-2Z" fill="#dc2626" />
      <circle cx="144" cy="8.5" r="2.2" fill="#991b1b" />
    </g>
    <Snowflake x={46} y={45} wait={0.4} />
    <Snowflake x={104} y={42} size={3.2} wait={1.6} />
    <Snowflake x={158} y={46} size={4.5} wait={0.9} />
    <Snowflake x={214} y={44} size={3.4} wait={2.1} />
    <Snowflake x={270} y={40} wait={1.2} />
    <Star x={144} y={34} size={3} color="#fde68a" wait={1} />
  </>
}

function Gift({ x, y, color, ribbon = '#fde68a' }: { x: number; y: number; color: string; ribbon?: string }) {
  return <>
    <rect x={x} y={y} width="11" height="9" rx="1" fill={color} />
    <path d={`M${x + 5.5} ${y}v9M${x} ${y + 3.5}h11`} stroke={ribbon} strokeWidth="1.5" />
    <path d={`M${x + 5.5} ${y}c-4-4-6-1-3 0m3 0c4-4 6-1 3 0`} stroke={ribbon} strokeWidth="1.3" strokeLinecap="round" />
  </>
}

function ChristmasTree() {
  return <>
    <ellipse cx="32" cy="52" rx="26" ry="2.2" fill="#94a3b8" opacity=".18" />
    <rect x="29" y="45" width="6" height="7" rx="1" fill="#92400e" />
    <path d="M32 25 12 45Q32 50 52 45Z" fill="#15803d" />
    <path d="M32 15 17 33Q32 37.5 47 33Z" fill="#16a34a" />
    <path d="M32 7 22 22Q32 25 42 22Z" fill="#22c55e" />
    <path d="M22 28Q32 32 43 27M17 40Q32 45 47 39" stroke="#fde68a" strokeWidth="1.1" strokeLinecap="round" />
    {[[35, 19, '#ef4444'], [24, 30, '#f59e0b'], [40, 32, '#3b82f6'], [19, 42, '#ef4444'], [32, 42, '#f59e0b'], [45, 42, '#a855f7']].map(([x, y, color], index) => (
      <circle key={index} className="seasonal-twinkle" style={delay(index * 0.45)} cx={x} cy={y} r="1.9" fill={color as string} />
    ))}
    <Star x={32} y={6} size={5} />
    <Gift x={4} y={43} color="#ef4444" />
    <Gift x={49} y={44} color="#3b82f6" ribbon="#f8fafc" />
  </>
}

// ── Halloween ────────────────────────────────────────────────────────────────

function Bat({ x, y, scale = 1, wait = 0 }: { x: number; y: number; scale?: number; wait?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="seasonal-float" style={delay(wait)}>
        <path
          className="text-zinc-700 dark:text-zinc-300"
          fill="currentColor"
          d="M0-2.5C1.2-5 2.2-5.5 2.8-2.6 8-8 15-8 20-3c-4 .4-5 4-4 7.5-3-2.5-6-1.8-7 1.5-1.8-2.5-4-2.8-6-1L0 7l-3-2c-2-1.8-4.2-1.5-6 1-1-3.3-4-4-7-1.5 1-3.5 0-7.1-4-7.5 5-5 12-5 17.2.4C-2.2-5.5-1.2-5 0-2.5Z"
        />
        <circle cx="-1.4" cy="-.6" r=".8" fill="#fbbf24" />
        <circle cx="1.4" cy="-.6" r=".8" fill="#fbbf24" />
      </g>
    </g>
  )
}

function CornerWeb({ cx, cy }: { cx: number; cy: number }) {
  const angles = [95, 115, 135, 155, 175]
  const point = (radius: number, angle: number) => {
    const r = (angle * Math.PI) / 180
    return [n(cx + radius * Math.cos(r)), n(cy + radius * Math.sin(r))]
  }
  const spokes = angles.map((angle) => { const [x, y] = point(52, angle); return `M${cx} ${cy}L${x} ${y}` })
  const rings = [14, 28, 42].map((radius) => angles.map((angle, index) => {
    const [x, y] = point(radius, angle)
    if (index === 0) return `M${x} ${y}`
    const [qx, qy] = point(radius * 0.84, angle - 10)
    return `Q${qx} ${qy} ${x} ${y}`
  }).join(''))
  return <path d={[...spokes, ...rings].join('')} stroke="#94a3b8" strokeWidth=".9" strokeOpacity=".85" />
}

function Spider({ x }: { x: number }) {
  return (
    <g className="seasonal-float" style={delay(0.8)}>
      <path d={`M${x} 0V22`} stroke="#94a3b8" strokeWidth=".8" />
      <g className="text-zinc-800 dark:text-zinc-200" fill="currentColor" stroke="currentColor">
        <path
          d={`M${x - 3} 25l-5-3-2 3M${x - 3} 27l-6 0-2 3M${x - 3} 29l-5 3-1 3M${x + 3} 25l5-3 2 3M${x + 3} 27l6 0 2 3M${x + 3} 29l5 3 1 3`}
          fill="none"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <circle cx={x} cy={23} r="2.6" stroke="none" />
        <ellipse cx={x} cy={28.5} rx="3.6" ry="4.4" stroke="none" />
      </g>
      <circle cx={x - 1} cy={22.6} r=".6" fill="#ef4444" />
      <circle cx={x + 1} cy={22.6} r=".6" fill="#ef4444" />
    </g>
  )
}

function MiniPumpkin({ x, y, wait = 0 }: { x: number; y: number; wait?: number }) {
  return <>
    <path d={`M${x + 1} ${y - 7}q-1-4 3-5`} stroke="#65a30d" strokeWidth="2" strokeLinecap="round" />
    <ellipse cx={x} cy={y} rx="10" ry="7.5" fill="#ea580c" />
    <ellipse cx={x} cy={y} rx="5.5" ry="7.5" fill="#f97316" />
    <path
      className="seasonal-twinkle"
      style={delay(wait)}
      d={`M${x - 6} ${y - 2}l3-2.4.2 3Zm12 0-3-2.4-.2 3ZM${x - 5} ${y + 2.5}h10l-2 2.6h-6Z`}
      fill="#fde68a"
    />
  </>
}

function HalloweenHeader() {
  return <>
    <circle className="seasonal-glow" cx="24" cy="28" r="17" fill="#fde68a" opacity=".2" />
    <path d="M28 15A13 13 0 1 0 28 41 10 13 0 0 1 28 15Z" fill="#fde68a" />
    <Star x={50} y={12} size={2.6} color="#fde68a" wait={0.6} />
    <Star x={62} y={42} size={2} color="#fde68a" wait={1.7} />
    <Bat x={96} y={22} scale={1.15} />
    <Bat x={150} y={36} scale={0.75} wait={1.1} />
    <Bat x={190} y={16} scale={0.9} wait={2} />
    <MiniPumpkin x={124} y={46} wait={0.5} />
    <Spider x={222} />
    <CornerWeb cx={288} cy={0} />
  </>
}

function Pumpkin() {
  return <>
    <ellipse cx="32" cy="52" rx="24" ry="2" fill="#94a3b8" opacity=".18" />
    <path d="M33 15q-3-8 4-10" stroke="#65a30d" strokeWidth="3" strokeLinecap="round" />
    <path d="M35 10q10-5 11 2-6 4-11-2" fill="#84cc16" />
    <ellipse cx="32" cy="33" rx="23" ry="18" fill="#ea580c" />
    <ellipse cx="32" cy="33" rx="15" ry="18" fill="#f97316" />
    <ellipse cx="32" cy="33" rx="7" ry="18" fill="#fb923c" />
    <path d="M17 19q-6 14 0 28M47 19q6 14 0 28" stroke="#c2410c" strokeOpacity=".55" />
    <path d="m18 30 8-5-1 9h-7Zm28 0-8-5 1 9h7ZM21 39l5 2 3-2 3 3 3-3 3 2 5-2-5 7H26Z" fill="#422006" />
    <path className="seasonal-twinkle" d="m20 30 4-2v4h-4Zm24 0-4-2v4h4ZM26 43h12l-2 2h-8Z" fill="#fde68a" />
  </>
}

// ── Spring ───────────────────────────────────────────────────────────────────

function Flower({ x, y, color, center = '#fbbf24', scale = 1, wait = 0 }: { x: number; y: number; color: string; center?: string; scale?: number; wait?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="seasonal-sway" style={delay(wait)}>
        {[0, 60, 120, 180, 240, 300].map((angle) => <ellipse key={angle} cy="-4" rx="2.8" ry="4" fill={color} transform={`rotate(${angle})`} />)}
        <circle r="2.5" fill={center} />
      </g>
    </g>
  )
}

function Leaf({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d="M0 0C3-5 10-6 14-1 10 4 3 4 0 0Z" fill="#84cc16" />
      <path d="M1 0H12" stroke="#4d7c0f" strokeWidth=".7" />
    </g>
  )
}

function Butterfly({ x, y, wait = 0 }: { x: number; y: number; wait?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="seasonal-float" style={delay(wait)}>
        <g className="seasonal-flap">
          {[1, -1].map((side) => (
            <g key={side} transform={`scale(${side} 1)`}>
              <path d="M0 0C3-8 11-9 11-3 11 1 6 2 0 0Z" fill="#f59e0b" />
              <path d="M0 0C3 2 8 4 7.5 8 6.5 10 2 7 0 0Z" fill="#fb923c" />
              <circle cx="7" cy="-3.5" r="1.2" fill="#78350f" opacity=".7" />
            </g>
          ))}
        </g>
        <ellipse rx="1" ry="5" cy="1" fill="#78350f" />
        <path d="M0-4-2-8M0-4 2-8" stroke="#78350f" strokeWidth=".7" strokeLinecap="round" />
      </g>
    </g>
  )
}

function SpringHeader() {
  return <>
    <path d="M0 34C30 18 60 46 96 32S150 14 186 30 252 46 288 26" stroke="#65a30d" strokeWidth="2" strokeLinecap="round" />
    <Leaf x={22} y={27} angle={-35} /><Leaf x={70} y={38} angle={20} /><Leaf x={122} y={24} angle={-25} />
    <Leaf x={170} y={25} angle={30} /><Leaf x={228} y={39} angle={-15} /><Leaf x={272} y={31} angle={-45} />
    <Flower x={44} y={27} color="#f472b6" scale={1.3} />
    <Flower x={100} y={32} color="#c084fc" scale={1.1} wait={0.9} />
    <Flower x={150} y={21} color="#fb7185" scale={1.3} wait={1.8} />
    <Flower x={206} y={35} color="#fbbf24" center="#ea580c" scale={1.15} wait={0.5} />
    <Flower x={258} y={36} color="#f472b6" scale={1.25} wait={1.3} />
    <Butterfly x={182} y={11} />
    <Butterfly x={76} y={12} wait={1.4} />
  </>
}

function SpringPot() {
  return <>
    <path d="M18 44V26m15 18V18m13 26V31" stroke="#65a30d" strokeWidth="2" />
    <path d="m19 39-9-5q0 8 9 5m14-11 9-6q1 8-9 6m12 13 9-6q1 9-9 6" fill="#84cc16" />
    <Flower x={18} y={23} color="#f472b6" /><Flower x={33} y={16} color="#c084fc" wait={0.8} /><Flower x={46} y={28} color="#fb7185" scale={0.8} wait={1.6} />
    <path d="M12 43h39l-5 11H17Z" fill="#c2410c" /><path d="M11 43h41v4H11Z" fill="#ea580c" />
    <Butterfly x={54} y={10} />
  </>
}

// ── Summer ───────────────────────────────────────────────────────────────────

function Sun({ x, y, r }: { x: number; y: number; r: number }) {
  const rays = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * 30 * Math.PI) / 180
    const inner = r + 3
    const outer = r + (index % 2 ? 6 : 9)
    return `M${n(x + inner * Math.cos(angle))} ${n(y + inner * Math.sin(angle))}L${n(x + outer * Math.cos(angle))} ${n(y + outer * Math.sin(angle))}`
  })
  return <>
    <circle className="seasonal-glow" cx={x} cy={y} r={r + 4} fill="#fbbf24" opacity=".18" />
    <path className="seasonal-spin" d={rays.join('')} stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
    <circle cx={x} cy={y} r={r} fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.2" />
  </>
}

function Gull({ x, y, wait = 0 }: { x: number; y: number; wait?: number }) {
  return <path className="seasonal-float" style={delay(wait)} d={`M${x} ${y}q4-5 8 0q4-5 8 0`} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
}

const wave = (from: number, y: number, count: number) => `M${from} ${y}${'q4-4 8 0t8 0'.repeat(count)}`

function SummerHeader() {
  return <>
    <Sun x={30} y={27} r={10} />
    <Gull x={70} y={16} /><Gull x={92} y={26} wait={1.2} /><Gull x={256} y={12} wait={0.6} />
    <path d={`M100 56Q106 42 112 42${'q4-4 8 0t8 0'.repeat(11)}V56Z`} fill="#38bdf8" opacity=".16" />
    <g className="seasonal-float" style={delay(0.7)}>
      <path d="M210 13v26" stroke="#78350f" strokeWidth="1.5" />
      <path d="M211.5 15v21h13Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth=".7" />
      <path d="M208.5 18v18h-11Z" fill="#ef4444" />
      <path d="M210 13l6 2.2-6 2.2Z" fill="#f59e0b" />
      <path d="M195 38h30l-5 7.5h-20Z" fill="#b45309" />
      <path d="M197 40.5h26" stroke="#fde68a" strokeWidth="1" />
    </g>
    <path className="seasonal-float" style={delay(1.5)} d={wave(112, 46, 11)} stroke="#0ea5e9" strokeWidth="1.6" strokeLinecap="round" />
    <path className="seasonal-float" style={delay(0.3)} d={wave(128, 52, 9)} stroke="#38bdf8" strokeOpacity=".7" strokeWidth="1.3" strokeLinecap="round" />
    <g transform="translate(150 33)">
      <g className="seasonal-spin" style={delay(3)}>
        <circle r="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth=".6" />
        <path d="M0-6A6 6 0 0 1 5.2 3L0 0Z" fill="#ef4444" />
        <path d="M5.2 3A6 6 0 0 1-5.2 3L0 0Z" fill="#3b82f6" />
        <path d="M-5.2 3A6 6 0 0 1 0-6L0 0Z" fill="#fbbf24" />
      </g>
    </g>
  </>
}

function BeachUmbrella() {
  return <>
    <path d="M7 50q25-10 50 0v5H7Z" fill="#fde68a" />
    <path d="M32 18v32" stroke="#92400e" strokeWidth="2" />
    <g className="seasonal-sway">
      <path d="M10 23q22-33 44 0-7-3-14 0-8-3-16 0-7-3-14 0Z" fill="#f97316" stroke="#ea580c" strokeWidth=".8" />
      <path d="M32 7q-8 6-8 16 8-3 16 0-1-10-8-16Z" fill="#fef3c7" />
    </g>
    <path d="M41 41h13M44 34l-6 13h17" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>
}

function HeaderArtwork({ theme }: { theme: ActiveSeasonalTheme }) {
  switch (theme) {
    case 'winter': return <ChristmasHeader />
    case 'halloween': return <HalloweenHeader />
    case 'spring': return <SpringHeader />
    case 'summer': return <SummerHeader />
    default: return null
  }
}

function SidebarArtwork({ theme }: { theme: ActiveSeasonalTheme }) {
  switch (theme) {
    case 'winter': return <ChristmasTree />
    case 'halloween': return <Pumpkin />
    case 'spring': return <SpringPot />
    case 'summer': return <BeachUmbrella />
    default: return null
  }
}
