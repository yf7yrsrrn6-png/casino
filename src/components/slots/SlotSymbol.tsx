import { useId, type ReactNode } from 'react'

/**
 * Hand-built vector slot symbols — faceted gems and metallic gold icons.
 * The server refers to symbols by these stable keys; this component turns a key
 * into crafted 3D-looking art so the reels never fall back to flat emoji.
 */

const OUTER = '50,7 87,28 87,72 50,93 13,72 13,28'
const TABLE = '50,29 68,39.5 68,60.5 50,71 32,60.5 32,39.5'
const FACET_TOP = ['50,7 87,28 68,39.5 50,29', '13,28 50,7 50,29 32,39.5']
const FACET_BOTTOM = ['87,72 50,93 50,71 68,60.5', '50,93 13,72 32,60.5 50,71']

type GemColors = { light: string; mid: string; dark: string }

const GEMS: Record<string, GemColors> = {
  ruby: { light: '#ffd0dc', mid: '#e0203f', dark: '#7c0c22' },
  sapphire: { light: '#c9ecff', mid: '#2e9dff', dark: '#0b3f75' },
  emerald: { light: '#c4f7dc', mid: '#22c06f', dark: '#0b5a37' },
  amethyst: { light: '#eaccff', mid: '#a855f7', dark: '#46197e' },
  topaz: { light: '#ffe9b0', mid: '#ffab2e', dark: '#8a520f' },
  diamond: { light: '#ffffff', mid: '#bfe6ff', dark: '#5e97c6' },
}

function Gem({ colors, extraSparkle = false }: { colors: GemColors; extraSparkle?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.light} />
          <stop offset="0.5" stopColor={colors.mid} />
          <stop offset="1" stopColor={colors.dark} />
        </linearGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor={colors.light} />
          <stop offset="1" stopColor={colors.mid} />
        </linearGradient>
      </defs>
      <polygon
        points={OUTER}
        fill={`url(#b${id})`}
        stroke={colors.light}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 4px 6px rgba(0,0,0,0.5))` }}
      />
      {FACET_TOP.map((p, i) => (
        <polygon key={`ft${i}`} points={p} fill="#ffffff" opacity="0.22" />
      ))}
      {FACET_BOTTOM.map((p, i) => (
        <polygon key={`fb${i}`} points={p} fill="#000000" opacity="0.22" />
      ))}
      <polygon points={TABLE} fill={`url(#t${id})`} stroke="#ffffff" strokeOpacity="0.4" strokeWidth="0.8" />
      <path d="M40 34 l2.4 4 4 2.4 -4 2.4 -2.4 4 -2.4 -4 -4 -2.4 4 -2.4 z" fill="#ffffff" opacity="0.9" />
      {extraSparkle && (
        <path d="M63 55 l1.6 2.6 2.6 1.6 -2.6 1.6 -1.6 2.6 -1.6 -2.6 -2.6 -1.6 2.6 -1.6 z" fill="#ffffff" opacity="0.8" />
      )}
    </svg>
  )
}

function GoldDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`g${id}`} x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor="#fff6d8" />
        <stop offset="0.28" stopColor="#ffd873" />
        <stop offset="0.55" stopColor="#f4b32e" />
        <stop offset="0.72" stopColor="#c8811f" />
        <stop offset="1" stopColor="#ffe08a" />
      </linearGradient>
      <radialGradient id={`r${id}`} cx="0.5" cy="0.32" r="0.75">
        <stop offset="0" stopColor="#3a2a52" />
        <stop offset="1" stopColor="#150c2b" />
      </radialGradient>
    </defs>
  )
}

function GoldSvg({ children }: { children: (id: string) => ReactNode }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={{ overflow: 'visible' }}>
      <GoldDefs id={id} />
      {children(id)}
    </svg>
  )
}

function Seven() {
  return (
    <GoldSvg>
      {(id) => (
        <g style={{ filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.55))' }}>
          <circle cx="50" cy="50" r="44" fill={`url(#r${id})`} stroke={`url(#g${id})`} strokeWidth="3" />
          <text
            x="50"
            y="52"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Unbounded, system-ui, sans-serif"
            fontWeight="900"
            fontSize="62"
            fill={`url(#g${id})`}
            stroke="#7a4d12"
            strokeWidth="1.4"
          >
            7
          </text>
        </g>
      )}
    </GoldSvg>
  )
}

function Star() {
  return (
    <GoldSvg>
      {(id) => (
        <g style={{ filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))' }}>
          <polygon
            points="50,8 61,38 93,39 67,59 77,90 50,71 23,90 33,59 7,39 39,38"
            fill={`url(#g${id})`}
            stroke="#7a4d12"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <polygon points="50,20 57,40 50,55 43,40" fill="#fff6d8" opacity="0.7" />
        </g>
      )}
    </GoldSvg>
  )
}

function Coin() {
  return (
    <GoldSvg>
      {(id) => (
        <g style={{ filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))' }}>
          <circle cx="50" cy="50" r="42" fill={`url(#g${id})`} stroke="#8a5a12" strokeWidth="3" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="#8a5a12" strokeWidth="2" opacity="0.6" />
          <text
            x="50"
            y="53"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Unbounded, system-ui, sans-serif"
            fontWeight="900"
            fontSize="42"
            fill="#7a4d12"
          >
            $
          </text>
          <ellipse cx="38" cy="32" rx="12" ry="6" fill="#fff6d8" opacity="0.55" transform="rotate(-30 38 32)" />
        </g>
      )}
    </GoldSvg>
  )
}

function Crown() {
  return (
    <GoldSvg>
      {(id) => (
        <g style={{ filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.55))' }}>
          <path
            d="M16 74 L12 34 L34 52 L50 22 L66 52 L88 34 L84 74 Z"
            fill={`url(#g${id})`}
            stroke="#7a4d12"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <rect x="16" y="74" width="68" height="12" rx="3" fill={`url(#g${id})`} stroke="#7a4d12" strokeWidth="2.4" />
          <circle cx="12" cy="32" r="6" fill="#ff3d8b" stroke="#7a4d12" strokeWidth="1.5" />
          <circle cx="88" cy="32" r="6" fill="#ff3d8b" stroke="#7a4d12" strokeWidth="1.5" />
          <circle cx="50" cy="20" r="6" fill="#3bd07a" stroke="#7a4d12" strokeWidth="1.5" />
          <circle cx="50" cy="66" r="5" fill="#e0203f" stroke="#7a4d12" strokeWidth="1.4" />
        </g>
      )}
    </GoldSvg>
  )
}

function Bell() {
  return (
    <GoldSvg>
      {(id) => (
        <g style={{ filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))' }}>
          <rect x="45" y="12" width="10" height="8" rx="3" fill={`url(#g${id})`} stroke="#7a4d12" strokeWidth="1.5" />
          <path
            d="M50 18 C30 18 34 52 22 72 L78 72 C66 52 70 18 50 18 Z"
            fill={`url(#g${id})`}
            stroke="#7a4d12"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <rect x="20" y="72" width="60" height="8" rx="4" fill={`url(#g${id})`} stroke="#7a4d12" strokeWidth="2" />
          <circle cx="50" cy="86" r="6" fill={`url(#g${id})`} stroke="#7a4d12" strokeWidth="2" />
          <ellipse cx="40" cy="38" rx="5" ry="14" fill="#fff6d8" opacity="0.5" transform="rotate(-12 40 38)" />
        </g>
      )}
    </GoldSvg>
  )
}

function Wild() {
  return (
    <GoldSvg>
      {(id) => (
        <g style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))' }}>
          <rect x="6" y="26" width="88" height="48" rx="12" fill={`url(#r${id})`} stroke={`url(#g${id})`} strokeWidth="3.5" />
          <text
            x="50"
            y="52"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Unbounded, system-ui, sans-serif"
            fontWeight="900"
            fontSize="24"
            letterSpacing="1"
            fill={`url(#g${id})`}
            stroke="#7a4d12"
            strokeWidth="0.8"
          >
            WILD
          </text>
        </g>
      )}
    </GoldSvg>
  )
}

const GOLD: Record<string, () => ReactNode> = {
  seven: Seven,
  star: Star,
  coin: Coin,
  crown: Crown,
  bell: Bell,
  wild: Wild,
}

export function SlotSymbol({ name, className }: { name: string; className?: string }) {
  let node: ReactNode
  if (name in GEMS) {
    node = <Gem colors={GEMS[name]} extraSparkle={name === 'diamond'} />
  } else if (name in GOLD) {
    node = GOLD[name]()
  } else {
    // Unknown key (e.g. a legacy emoji) — render it as text so nothing breaks.
    node = (
      <span className="flex h-full w-full items-center justify-center text-4xl sm:text-5xl">{name}</span>
    )
  }
  return <span className={`inline-flex h-full w-full items-center justify-center ${className ?? ''}`}>{node}</span>
}
