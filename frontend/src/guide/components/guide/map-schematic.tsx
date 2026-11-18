import type { Place, Route } from '@/content/types'

/**
 * Simplified Origin Lands map (Playbook §4: "Labeled map with arrows; add legend").
 * It shows zones and the direction of advance only. Exact city positions are on the
 * community map image. Colors come from theme tokens, so light and dark mode both work.
 */
export function MapSchematic() {
  const ink = 'var(--foreground)'
  const quiet = 'var(--muted-foreground)'
  const line = 'var(--border)'
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox="0 0 400 520"
        role="img"
        aria-label="Simplified map: Anubis base in the north, Horus base in the south, war zone rings around the Capital"
        className="h-auto w-full max-w-md self-center"
        fontFamily="inherit"
      >
        <defs>
          <marker id="arrow-anubis" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--anubis)" />
          </marker>
          <marker id="arrow-horus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--horus)" />
          </marker>
        </defs>

        {/* North base */}
        <rect x="8" y="8" width="384" height="96" rx="10" fill="var(--anubis)" fillOpacity="0.14" stroke="var(--anubis)" strokeWidth="1.5" />
        <text x="200" y="44" textAnchor="middle" fontSize="16" fontWeight="600" fill={ink}>Anubis camp base (North)</text>
        <text x="200" y="66" textAnchor="middle" fontSize="12" fill={quiet}>Lv.1–2 Pyramids · Lv.1–2 Oases</text>
        <text x="200" y="84" textAnchor="middle" fontSize="12" fill={quiet}>Build the Alliance Center here</text>

        {/* War zone */}
        <rect x="8" y="120" width="384" height="280" rx="10" fill="var(--primary)" fillOpacity="0.07" stroke={line} strokeWidth="1.5" />
        <text x="24" y="142" fontSize="12" fill={quiet}>Outer war zone · Lv.3</text>
        <rect x="64" y="156" width="272" height="208" rx="10" fill="var(--primary)" fillOpacity="0.08" stroke={line} />
        <text x="80" y="176" fontSize="12" fill={quiet}>Inner war zone · Lv.4–5</text>
        <rect x="120" y="196" width="160" height="128" rx="10" fill="var(--primary)" fillOpacity="0.12" stroke={line} />
        <text x="200" y="216" textAnchor="middle" fontSize="12" fill={quiet}>Temple ring · Lv.6</text>
        <circle cx="200" cy="268" r="34" fill="var(--primary)" fillOpacity="0.3" stroke="var(--primary)" strokeWidth="2" />
        <text x="200" y="264" textAnchor="middle" fontSize="12" fontWeight="600" fill={ink}>Capital</text>
        <text x="200" y="280" textAnchor="middle" fontSize="10.5" fill={ink}>Royal Court</text>

        {/* Gate lines */}
        <line x1="8" y1="112" x2="244" y2="112" stroke={quiet} strokeWidth="2" strokeDasharray="6 5" />
        <line x1="8" y1="408" x2="244" y2="408" stroke={quiet} strokeWidth="2" strokeDasharray="6 5" />
        <text x="390" y="116" textAnchor="end" fontSize="10.5" fill={quiet}>Border Gates Lv.3 / Lv.6</text>
        <text x="390" y="412" textAnchor="end" fontSize="10.5" fill={quiet}>Border Gates Lv.3 / Lv.6</text>

        {/* Advance arrows */}
        <path d="M300 92 C 300 160, 260 220, 232 250" fill="none" stroke="var(--anubis)" strokeWidth="2.5" markerEnd="url(#arrow-anubis)" />
        <path d="M100 428 C 100 360, 140 310, 168 288" fill="none" stroke="var(--horus)" strokeWidth="2.5" markerEnd="url(#arrow-horus)" />

        {/* South base */}
        <rect x="8" y="416" width="384" height="96" rx="10" fill="var(--horus)" fillOpacity="0.14" stroke="var(--horus)" strokeWidth="1.5" />
        <text x="200" y="452" textAnchor="middle" fontSize="16" fontWeight="600" fill={ink}>Horus camp base (South)</text>
        <text x="200" y="474" textAnchor="middle" fontSize="12" fill={quiet}>Lv.1–2 Pyramids · Lv.1–2 Oases</text>
        <text x="200" y="492" textAnchor="middle" fontSize="12" fill={quiet}>Build the Alliance Center here</text>
      </svg>
      <figcaption className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>Simplified map. City level increases toward the Capital. Arrows show the direction of advance for each camp.</span>
        <span>Zone positions are approximate. Use the full map for exact city positions.</span>
      </figcaption>
    </figure>
  )
}

/*
 * Simplified map for a season with 8 camps (S6 Ragnarok).
 * Built from season data only: camp colours come from the routes, Temple and Altar markers from the
 * measured pins of the places, zone names from the places. Camp sectors follow the in-game Season
 * Map: a pinwheel where each camp holds one corner (No.1 north-west … No.8 west).
 */
const CAMP_SECTORS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'No.1': { x: 0, y: 0, w: 42, h: 14 },
  'No.2': { x: 42, y: 0, w: 44, h: 14 },
  'No.3': { x: 86, y: 0, w: 14, h: 46 },
  'No.4': { x: 86, y: 46, w: 14, h: 40 },
  'No.5': { x: 58, y: 86, w: 42, h: 14 },
  'No.6': { x: 14, y: 86, w: 44, h: 14 },
  'No.7': { x: 0, y: 54, w: 14, h: 46 },
  'No.8': { x: 0, y: 14, w: 14, h: 40 },
}

export function MapSchematicCamps({ routes, places }: { routes: Route[]; places: Place[] }) {
  const S = 4 // percent → SVG units (400 × 400)
  const ink = 'var(--foreground)'
  const quiet = 'var(--muted-foreground)'
  const name = (id: string, fallback: string) => places.find((p) => p.id === id)?.name ?? fallback
  const pins = (id: string) => places.find((p) => p.id === id)?.pins ?? []
  const throne = { x: 31, y: 30, w: 38, h: 40 }
  const inThrone = (p: { x: number; y: number }) => p.x > throne.x && p.x < throne.x + throne.w && p.y > throne.y && p.y < throne.y + throne.h
  const edge = (p: { x: number; y: number }) => Math.min(p.x, p.y, 100 - p.x, 100 - p.y)
  const templeLv = (p: { x: number; y: number }) => (inThrone(p) ? 3 : edge(p) < 14 ? 1 : 2)
  const supreme = pins('supreme-temple')[0] ?? { x: 50, y: 50 }

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox="0 0 400 400" role="img" aria-label="Simplified Ragnarok map: 8 Camp Bases around the Land of Strife and the Temple Throne" className="h-auto w-full max-w-lg self-center" fontFamily="inherit">
        <defs>
          <marker id="arrow-camp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={quiet} />
          </marker>
        </defs>

        {/* Land of Strife (the whole inner square) */}
        <rect x={14 * S} y={14 * S} width={72 * S} height={72 * S} rx="8" fill="var(--primary)" fillOpacity="0.08" stroke="var(--border)" strokeWidth="1.5" />
        <text x={200} y={14 * S + 18} textAnchor="middle" fontSize="12" fill={quiet}>{name('land-of-strife', 'Land of Strife')}</text>

        {/* Temple Throne */}
        <rect x={throne.x * S} y={throne.y * S} width={throne.w * S} height={throne.h * S} rx="8" fill="var(--primary)" fillOpacity="0.16" stroke="var(--primary)" strokeOpacity="0.5" strokeWidth="1.5" />
        <text x={200} y={throne.y * S + 16} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={ink}>{name('temple-throne-zone', 'Temple Throne')}</text>

        {/* Camp Bases */}
        {routes.map((r) => {
          const z = CAMP_SECTORS[r.camp]
          if (!z) return null
          const vertical = z.h > z.w
          const cx = (z.x + z.w / 2) * S
          const cy = (z.y + z.h / 2) * S
          return (
            <g key={r.camp}>
              <rect x={z.x * S + 1.5} y={z.y * S + 1.5} width={z.w * S - 3} height={z.h * S - 3} rx="6" fill={r.color} />
              <text
                x={cx}
                y={cy + 4.5}
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill={r.ink ?? 'white'}
                transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
              >
                {r.camp}
              </text>
            </g>
          )
        })}

        {/* Direction of advance: each camp toward the centre */}
        {routes.map((r) => {
          const z = CAMP_SECTORS[r.camp]
          if (!z) return null
          const sx = (z.x + z.w / 2) * S
          const sy = (z.y + z.h / 2) * S
          const k = 0.42
          return (
            <line key={`a-${r.camp}`} x1={sx + (200 - sx) * 0.3} y1={sy + (200 - sy) * 0.3} x2={sx + (200 - sx) * k + (200 - sx) * 0.12} y2={sy + (200 - sy) * k + (200 - sy) * 0.12} stroke={quiet} strokeWidth="2" markerEnd="url(#arrow-camp)" />
          )
        })}

        {/* Judgement Altars */}
        {pins('judgement-altar').map((p, i) => (
          <g key={`al-${i}`}>
            <rect x={p.x * S - 9} y={p.y * S - 9} width="18" height="18" rx="3" transform={`rotate(45 ${p.x * S} ${p.y * S})`} fill="#7fa83a" stroke="white" strokeWidth="1.5" />
            <text x={p.x * S} y={p.y * S + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">6</text>
          </g>
        ))}

        {/* Ancient Temples */}
        {pins('ancient-temple').map((p, i) => (
          <g key={`t-${i}`}>
            <rect x={p.x * S - 10} y={p.y * S - 10} width="20" height="20" rx="4" fill="#3b5ba5" stroke="white" strokeWidth="1.5" />
            <text x={p.x * S} y={p.y * S + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="white">{templeLv(p)}</text>
          </g>
        ))}

        {/* Supreme Temple */}
        <circle cx={supreme.x * S} cy={supreme.y * S} r="17" fill="var(--primary)" stroke="white" strokeWidth="2" />
        <text x={supreme.x * S} y={supreme.y * S + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--primary-foreground)">★</text>
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded-[3px] bg-[#3b5ba5] text-[9px] font-bold text-white">1</span>{name('ancient-temple', 'Ancient Temple')} (level)</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rotate-45 rounded-[2px] bg-[#7fa83a]" />{name('judgement-altar', 'Judgement Altar')}</span>
        <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">★</span>{name('supreme-temple', 'Supreme Temple')}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-[3px] bg-[#e0524f]" />{name('camp-base', 'Camp Base')}</span>
      </figcaption>
    </figure>
  )
}
