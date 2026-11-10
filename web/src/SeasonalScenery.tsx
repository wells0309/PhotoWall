import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from './Theme'
import type { Season } from './season'
import './seasonalScenery.css'

const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter']

// Stable per-particle variation keeps the scene natural without jumping on re-render.
function particleRandom(seed: number, salt: number) {
  let value = (seed + Math.imul(salt, 0x9e3779b9)) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}

function MapleLeaf() {
  return <svg className="season-maple-leaf" viewBox="0 0 64 72" aria-hidden="true">
    <path fill="currentColor" d="M32 2 38 17 43 13 40 33 51 23 52 30 61 28 57 39 62 42 43 49 46 56 34 53 30 53 18 57 21 49 2 42 8 39 4 28 12 30 13 23 24 33 21 13 26 17Z" />
    <path className="season-maple-veins" d="M32 52V12M32 43 17 30M32 43 48 30M32 48 12 42M32 48 52 42" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path className="season-maple-stem" d="M32 50Q34 61 29 69" fill="none" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
}

function Snowflake() {
  return <svg className="season-snowflake" viewBox="-60 -60 120 120" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round">
      {[0, 60, 120, 180, 240, 300].map(angle => <g transform={`rotate(${angle})`} key={angle}>
        <path d="M0-57V-7M0-47l-8-8M0-47l8-8M0-35l-13-10M0-35l13-10M0-23l-9-7M0-23l9-7M-8-41l-4-8M8-41l4-8" />
        <path d="M-4-53 0-57 4-53" />
      </g>)}
      <circle r="4" fill="#f7fbfd" />
    </g>
  </svg>
}

function SummerBranch() {
  return <svg viewBox="0 0 180 140" fill="currentColor" aria-hidden="true">
    <path d="M180 0Q113 34 43 125M139 23L89 26M116 50L150 85M94 73L45 65M72 98L89 132" fill="none" stroke="currentColor" strokeWidth="2" />
    <ellipse cx="100" cy="25" rx="24" ry="9" transform="rotate(7 100 25)" />
    <ellipse cx="147" cy="73" rx="23" ry="9" transform="rotate(48 147 73)" />
    <ellipse cx="57" cy="65" rx="24" ry="9" transform="rotate(12 57 65)" />
    <ellipse cx="86" cy="118" rx="20" ry="8" transform="rotate(67 86 118)" />
    <ellipse cx="146" cy="20" rx="22" ry="9" transform="rotate(-45 146 20)" />
  </svg>
}

function FallingElements({ season }: { season: Season }) {
  return <>{['left', 'right'].map((side, sideIndex) => <div className={`season-fall-lane season-fall-${side}`} key={side}>
    {Array.from({ length: season === 'winter' ? 26 : 18 }, (_, index) => {
      const seed = index * 7 + sideIndex * 13 + 17
      const random = (salt: number) => particleRandom(seed, salt)
      const snowDepth = index % 7 === 0 ? 'near' : index % 3 === 0 ? 'middle' : 'far'
      const duration = (season === 'winter' ? snowDepth === 'near' ? 9 : snowDepth === 'middle' ? 14 : 20 : season === 'autumn' ? 12 : 13) + random(1) * (season === 'winter' ? 9 : 15)
      const wind = (random(2) - .5) * 180
      const gust = (salt: number) => (random(salt) - .5) * 110
      return <span className={`season-particle${season === 'winter' ? ` snow-${snowDepth}` : ''}`} key={index} style={{
        left: `${season === 'winter' ? 4 + (index * 7 + sideIndex * 3) % 26 * 3.7 : 4 + (index * 7 + sideIndex * 3) % 18 * 5}%`,
        animationDuration: `${duration.toFixed(2)}s`,
        animationDelay: `${(-duration * random(3)).toFixed(2)}s`,
        '--sway-time': `${(3 + random(4) * 4).toFixed(2)}s`,
        '--sway-delay': `${(-random(5) * 7).toFixed(2)}s`,
        '--sway-distance': `${(5 + random(6) * 13).toFixed(1)}px`,
        '--particle-turn': `${((random(7) < .5 ? -1 : 1) * (35 + random(8) * 90)).toFixed(0)}deg`,
        '--drift-start': `${gust(9).toFixed(1)}px`,
        '--drift-one': `${(wind * .25 + gust(10)).toFixed(1)}px`,
        '--drift-two': `${(wind * .5 + gust(11)).toFixed(1)}px`,
        '--drift-three': `${(wind * .8 + gust(12)).toFixed(1)}px`,
        '--drift-end': `${(wind + gust(13)).toFixed(1)}px`,
        '--particle-size': `${season === 'winter' ? snowDepth === 'near' ? 18 + seed % 4 : snowDepth === 'middle' ? 14 + seed % 3 : 10 + seed % 3 : season === 'autumn' ? 18 + seed % 8 : 9 + seed % 6}px`,
        '--particle-angle': `${Math.round(random(14) * 180)}deg`,
      } as CSSProperties}><i>{season === 'autumn' ? <MapleLeaf /> : season === 'winter' ? <Snowflake /> : null}</i></span>
    })}
  </div>)}</>
}

export function WinterBookSnow() {
  return <div className="book-snow" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => {
    const random = (salt: number) => particleRandom(index + 201, salt)
    const lane = index % 3
    const left = lane === 0 ? 1 + random(1) * 7 : lane === 1 ? 47 + random(1) * 6 : 92 + random(1) * 7
    const duration = 9 + random(2) * 13
    return <span key={index} style={{
      left: `${left.toFixed(1)}%`, top: `${(random(3) * 94).toFixed(1)}%`,
      '--book-snow-size': `${10 + index % 5}px`,
      '--book-snow-shift': `${((random(4) - .5) * 44).toFixed(1)}px`,
      animationDuration: `${duration.toFixed(1)}s`, animationDelay: `${(-duration * random(5)).toFixed(1)}s`,
    } as CSSProperties}><Snowflake /></span>
  })}</div>
}

export default function SeasonalScenery({ season }: { season: Season }) {
  const { theme } = useTheme()
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.app-shell'))
  }, [])
  // Retain layers for a true crossfade; inactive animations remain paused.
  const scenery = <div className="seasonal-scenery" data-enabled={theme === 'light'} aria-hidden="true">
    {seasons.map(value => <div className={`season-layer season-${value}`} data-active={season === value} key={value}>
      <span className="season-wash" />
      {value === 'summer' ? <div className="season-summer-motion">
        <span className="season-sunlight season-sunlight-one" /><span className="season-sunlight season-sunlight-two" />
        <span className="season-sunlight season-sunlight-three" />
        <span className="season-branch season-branch-right"><SummerBranch /></span>
        <span className="season-branch season-branch-left"><SummerBranch /></span>
      </div> : <FallingElements season={value} />}
    </div>)}
  </div>
  // A single viewport layer avoids clipping and duplicate particles at book edges.
  return host && createPortal(scenery, host)
}
