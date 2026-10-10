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
      <svg viewBox={header ? '0 0 192 36' : '0 0 64 56'} className="h-full w-full overflow-hidden" fill="none" focusable="false">
        {header ? <HeaderArtwork theme={theme} /> : <SidebarArtwork theme={theme} />}
      </svg>
    </div>
  )
}

function Star({ x, y, size = 4 }: { x: number; y: number; size?: number }) {
  return <path className="seasonal-twinkle" d={`M${x} ${y - size}l${size / 3} ${size * 2 / 3}L${x + size} ${y}l-${size * 2 / 3} ${size / 3}L${x} ${y + size}l-${size / 3}-${size * 2 / 3}L${x - size} ${y}l${size * 2 / 3}-${size / 3}Z`} fill="#fbbf24" />
}

function Bulb({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle className="seasonal-glow" style={{ animationDelay: `${x % 5 * -.3}s` }} cx={x} cy={y + 4} r="7" fill={color} opacity=".12" />
      <path d={`M${x} ${y - 3}v4`} stroke="#64748b" strokeWidth="2" />
      <ellipse className="seasonal-twinkle" style={{ animationDelay: `${x % 5 * -.3}s` }} cx={x} cy={y + 4} rx="3" ry="4" fill={color} />
      <path d={`M${x - 1} ${y + 2}v2`} stroke="white" strokeOpacity=".7" strokeLinecap="round" />
    </g>
  )
}

function Bat({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="text-slate-600 dark:text-slate-400">
      <path className="seasonal-float" d="M0 0-3-4-4 0C-8-5-13-5-17-3l5 8 4-2 4 4L0 5l4 2 4-4 4 2 5-8C13-5 8-5 4 0L3-4 0 0Z" fill="currentColor" />
    </g>
  )
}

function Flower({ x, y, color, scale = 1 }: { x: number; y: number; color: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="seasonal-sway">
        {[0, 60, 120, 180, 240, 300].map((angle) => <ellipse key={angle} cy="-4" rx="2.8" ry="4" fill={color} transform={`rotate(${angle})`} />)}
        <circle r="2.5" fill="#fbbf24" />
      </g>
    </g>
  )
}

function HeaderArtwork({ theme }: { theme: ActiveSeasonalTheme }) {
  switch (theme) {
    case 'winter':
      return <>
        <path d="M0 3Q48 29 96 8T192 6" stroke="#64748b" strokeWidth="1.2" />
        <Bulb x={15} y={10} color="#ef4444" /><Bulb x={44} y={16} color="#fbbf24" />
        <Bulb x={75} y={15} color="#22c55e" /><Bulb x={108} y={4} color="#60a5fa" />
        <Bulb x={140} y={0} color="#ef4444" /><Bulb x={176} y={0} color="#fbbf24" />
      </>
    case 'halloween':
      return <>
        <g stroke="#94a3b8" strokeWidth=".8" opacity=".65">
          <path d="M192 0h-45m45 0-39 30m39-30-16 34m16-34v35" />
          <path d="M177 0q-1 5 2 10 4 0 8 4 1-4 5-4M164 0q0 9 6 17 7 0 12 6 4-6 10-6M151 0q0 13 10 24 9 0 16 9 7-9 15-8" />
        </g>
        <Bat x={105} y={14} /><Bat x={54} y={25} scale={.7} />
      </>
    case 'spring':
      return <>
        <path d="M15 23q40-20 80-7t78-7" stroke="#65a30d" strokeWidth="1.3" />
        <path d="m36 16-9-7q12-3 13 6m35 0 9-8q-12-2-13 8m60 0 9 6q-12 4-12-6" fill="#84cc16" />
        <Flower x={52} y={14} color="#f472b6" scale={.8} /><Flower x={110} y={18} color="#c084fc" scale={.65} />
        <Flower x={167} y={10} color="#fb7185" scale={.8} />
      </>
    case 'summer':
      return <>
        <g className="seasonal-sun" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round">
          <path d="M36 3v4m0 20v4M22 17h4m20 0h4M26 7l3 3m14 14 3 3M26 27l3-3M43 10l3-3" />
          <circle cx="36" cy="17" r="7" fill="#fbbf24" />
        </g>
        <path className="seasonal-float" d="M65 19q9-8 18 0t18 0 18 0 18 0 18 0 18 0M74 28q9-8 18 0t18 0 18 0 18 0 18 0" stroke="#38bdf8" strokeOpacity=".7" strokeWidth="1.5" strokeLinecap="round" />
      </>
    default: return null
  }
}

function Gift({ x, y, color }: { x: number; y: number; color: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width="12" height="10" rx="1" fill={color} />
    <path d="M6 0v10M0 3h12M6 0C-1-6 1-7 6 0c7-6 9-7 0 0" stroke="#fde68a" strokeWidth="1.5" />
  </g>
}

function SidebarArtwork({ theme }: { theme: ActiveSeasonalTheme }) {
  switch (theme) {
    case 'winter':
      return <>
        <ellipse cx="32" cy="51" rx="25" ry="2" fill="#94a3b8" opacity=".15" />
        <path d="M29 40h6v10h-6Z" fill="#92400e" />
        <path d="M32 6 18 24h7L13 35h9L9 45h46L42 35h9L39 24h7L32 6Z" fill="#15803d" stroke="#166534" strokeWidth=".7" strokeLinejoin="round" />
        <path d="m32 8-12 16h12V8Zm0 17-17 10h17V25Zm0 11L12 44h20v-8Z" fill="#22c55e" opacity=".4" />
        <path d="m21 23 18 7-16 6 20 6" stroke="#fde68a" strokeWidth="1" />
        <g className="seasonal-twinkle"><circle cx="27" cy="21" r="1.8" fill="#ef4444" /><circle cx="38" cy="32" r="1.8" fill="#60a5fa" /><circle cx="24" cy="41" r="1.8" fill="#ef4444" /></g>
        <Star x={32} y={6} size={5} /><Gift x={9} y={43} color="#ef4444" /><Gift x={44} y={44} color="#8b5cf6" />
      </>
    case 'halloween':
      return <>
        <ellipse cx="32" cy="51" rx="24" ry="2" fill="#94a3b8" opacity=".15" />
        <path d="M33 15q-3-8 4-10" stroke="#65a30d" strokeWidth="3" strokeLinecap="round" />
        <path d="M35 10q10-5 11 2-6 4-11-2" fill="#84cc16" />
        <ellipse cx="32" cy="33" rx="23" ry="18" fill="#ea580c" stroke="#c2410c" strokeWidth=".8" />
        <ellipse cx="32" cy="33" rx="15" ry="18" fill="#f97316" />
        <ellipse cx="32" cy="33" rx="7" ry="18" fill="#fb923c" />
        <path d="m18 30 8-5-1 9h-7Zm28 0-8-5 1 9h7ZM21 39l5 2 3-2 3 3 3-3 3 2 5-2-5 7H26Z" fill="#422006" />
        <path className="seasonal-twinkle" d="m20 30 4-2v4h-4Zm24 0-4-2v4h4ZM26 43h12l-2 2h-8Z" fill="#fde68a" />
      </>
    case 'spring':
      return <>
        <path d="M18 44V26m15 18V18m13 26V31" stroke="#65a30d" strokeWidth="2" />
        <path d="m19 39-9-5q0 8 9 5m14-11 9-6q1 8-9 6m12 13 9-6q1 9-9 6" fill="#84cc16" />
        <Flower x={18} y={23} color="#f472b6" /><Flower x={33} y={16} color="#c084fc" /><Flower x={46} y={28} color="#fb7185" scale={.8} />
        <path d="M12 43h39l-5 11H17Z" fill="#c2410c" /><path d="M11 43h41v4H11Z" fill="#ea580c" />
        <g className="seasonal-float">
          <path d="M52 10c-7-10-12-3-5 1-9 5-2 11 5 2 7 9 14 3 5-2 7-4 2-11-5-1Z" fill="#fbbf24" />
          <path d="M52 9v5" stroke="#92400e" strokeWidth="1.5" />
        </g>
      </>
    case 'summer':
      return <>
        <path d="M7 50q25-10 50 0v5H7Z" fill="#fde68a" />
        <path d="M32 18v32" stroke="#92400e" strokeWidth="2" />
        <g className="seasonal-sway">
          <path d="M10 23q22-33 44 0-7-3-14 0-8-3-16 0-7-3-14 0Z" fill="#f97316" stroke="#ea580c" strokeWidth=".8" />
          <path d="M32 7q-8 6-8 16 8-3 16 0-1-10-8-16Z" fill="#fef3c7" />
        </g>
        <path d="M41 41h13M44 34l-6 13h17" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    default: return null
  }
}
