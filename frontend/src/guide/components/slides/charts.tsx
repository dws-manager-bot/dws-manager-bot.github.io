import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import type { Briefing } from '@/content/types'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

/*
 * Charts follow the dataviz rules: one series = one hue (theme primary), no legend box (the title
 * names the series), thin bars with 4px rounded data ends, recessive grid, hover tooltip on each
 * bar, selective direct labels, and a table view for screen readers and exact values.
 */

const fmtM = (v: number) => (v === 0 ? '0' : `${v % 1 === 0 ? v : v.toFixed(1)}M`)

/** Great Merit: points needed for each level. Each step is about 1.5× the step before it. */
export function MeritChart({ levels }: { levels: Briefing['meritLevels'] }) {
  const data = levels.map((l, i) => ({
    key: `${l.rank} ${l.stars}`,
    tick: '★'.repeat(l.stars),
    rank: l.rank,
    stars: l.stars,
    points: l.points / 1_000_000,
    // direct label only on the top step of each rank
    label: i === levels.length - 1 || levels[i + 1]?.rank !== l.rank ? fmtM(l.points / 1_000_000) : '',
  }))
  const ranks = [...new Set(levels.map((l) => l.rank))]
  const config = { points: { label: 'Points required', color: 'var(--primary)' } } satisfies ChartConfig

  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-64 w-full sm:h-72">
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="0" stroke="var(--border)" />
          <XAxis dataKey="key" tickFormatter={(_, i) => data[i]?.tick ?? ''} tickLine={false} axisLine={false} interval={0} fontSize={10} />
          <YAxis tickFormatter={fmtM} tickLine={false} axisLine={false} width={44} fontSize={11} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, p) => {
                  const d = p?.[0]?.payload as (typeof data)[number] | undefined
                  return d ? `${d.rank} ${'★'.repeat(d.stars)}` : ''
                }}
                formatter={(v) => (
                  <span className="font-mono font-medium tabular-nums">{(Number(v) * 1_000_000).toLocaleString('en-US')} points</span>
                )}
              />
            }
          />
          <Bar dataKey="points" fill="var(--color-points)" radius={[4, 4, 0, 0]} maxBarSize={36}>
            <LabelList dataKey="label" position="top" offset={6} className="fill-foreground" fontSize={11} />
          </Bar>
        </BarChart>
      </ChartContainer>
      {/* rank groups under the star ticks */}
      <div className="grid grid-cols-4 gap-1 pl-11 text-center text-[11px] text-muted-foreground sm:text-xs">
        {ranks.map((r) => (
          <span key={r} className="border-t pt-1">
            {r}
          </span>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="font-normal">Rank</th>
              <th className="font-normal">Stars</th>
              <th className="text-right font-normal">Points required</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={`${l.rank}-${l.stars}`} className="border-t">
                <td>{l.rank}</td>
                <td>{l.stars}</td>
                <td className="text-right font-mono tabular-nums">{l.points.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Season Growth Rebate: medals for each Holy Altar level step. */
export function RebateChart({ rows }: { rows: Briefing['growthRebate'] }) {
  const data = rows.map((r) => ({ level: `Lv.${r.level}`, medals: r.medals }))
  const config = { medals: { label: 'Season Medals', color: 'var(--primary)' } } satisfies ChartConfig
  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="level" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent />} />
          <Bar dataKey="medals" fill="var(--color-medals)" radius={[4, 4, 0, 0]} maxBarSize={40}>
            <LabelList dataKey="medals" position="top" offset={6} className="fill-foreground" fontSize={11} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.level} className="border-t">
                <td>
                  {r.altar} to Lv.{r.level}
                </td>
                <td className="text-right font-mono tabular-nums">{r.medals} medals</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Influence by city level (player report). One series, one hue. */
export function InfluenceChart({ rows }: { rows: NonNullable<Briefing['influenceLevels']> }) {
  const config = { influence: { label: 'Influence', color: 'var(--primary)' } } satisfies ChartConfig
  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="level" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent />} />
          <Bar dataKey="influence" fill="var(--color-influence)" radius={[4, 4, 0, 0]} maxBarSize={40}>
            <LabelList dataKey="influence" position="top" offset={6} className="fill-foreground" fontSize={11} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.level} className="border-t">
                <td>{r.level} city</td>
                <td className="text-right font-mono tabular-nums">{r.influence} Influence</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Shelter Value: troop penalty by distance from the shelter, computed from the in-game rule. */
export function ShelterChart({ rule }: { rule: NonNullable<Briefing['shelter']> }) {
  const data = [0, 10, 20, 30, 40, 50, 60, 70].map((tiles) => {
    const lost = Math.max(0, tiles - rule.freeTiles)
    return {
      tiles: `${tiles}`,
      dealt: Math.round(Math.min(rule.dealtMax, lost * rule.dealtPerPoint) * 10) / 10,
      taken: Math.round(Math.min(rule.takenMax, lost * rule.takenPerPoint) * 10) / 10,
    }
  })
  const config = {
    dealt: { label: 'Damage dealt − %', color: 'var(--primary)' },
    taken: { label: 'Damage taken + %', color: 'var(--destructive)' },
  } satisfies ChartConfig
  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-60 w-full">
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 14 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="tiles"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            label={{ value: 'Tiles from your shelter or Portal Point', position: 'insideBottom', offset: -10, fontSize: 11 }}
          />
          <YAxis tickLine={false} axisLine={false} width={40} fontSize={11} unit="%" />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent labelFormatter={(l) => `${l} tiles`} />} />
          <Bar dataKey="dealt" fill="var(--color-dealt)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="taken" fill="var(--color-taken)" radius={[4, 4, 0, 0]} maxBarSize={22}>
            <LabelList dataKey="taken" position="top" offset={6} className="fill-foreground" fontSize={10} formatter={(v) => (Number(v) ? `+${v}%` : '')} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" aria-hidden /> Damage dealt (less)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-destructive" aria-hidden /> Damage taken (more)</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="font-normal">Tiles</th>
              <th className="text-right font-normal">Damage dealt</th>
              <th className="text-right font-normal">Damage taken</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.tiles} className="border-t">
                <td>{d.tiles}</td>
                <td className="text-right font-mono tabular-nums">−{d.dealt}%</td>
                <td className="text-right font-mono tabular-nums">+{d.taken}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
