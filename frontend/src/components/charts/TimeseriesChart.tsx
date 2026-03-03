import { useMemo, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, Area, ReferenceArea,
} from 'recharts'
import { CHART_TOOLTIP_STYLE } from '../../lib/types'
import type { StationPercentiles } from '../../lib/types'

interface Props {
  data: any[]
  valueKey: string
  valueLabel: string
  unit: string
  precipKey?: string
  percentiles?: StationPercentiles | null
}

const PERIODS = [
  { label: '1a', months: 12 },
  { label: '5a', months: 60 },
  { label: 'Max', months: Infinity },
] as const

const ZONE_BANDS = [
  { key: 'tres_haut', label: 'Très haut', color: 'rgba(99,102,241,0.10)' },
  { key: 'haut',      label: 'Haut',      color: 'rgba(59,130,246,0.10)' },
  { key: 'normal',    label: 'Normal',    color: 'rgba(34,197,94,0.10)'  },
  { key: 'bas',       label: 'Bas',       color: 'rgba(249,115,22,0.10)' },
  { key: 'tres_bas',  label: 'Très bas',  color: 'rgba(239,68,68,0.10)'  },
] as const

const ZONE_DOT_COLORS = {
  tres_haut: '#818cf8',
  haut:      '#60a5fa',
  normal:    '#4ade80',
  bas:       '#fb923c',
  tres_bas:  '#f87171',
} as const

export function TimeseriesChart({ data, valueKey, valueLabel, unit, precipKey = 'precipitation_totale', percentiles }: Props) {
  const [period, setPeriod] = useState<number>(60)

  const filteredData = useMemo(() => {
    if (period === Infinity) return data
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - period)
    const cutoffMs = cutoff.getTime()
    return data.filter((d: any) => {
      const dateStr = d.mois || d.date
      if (!dateStr) return false
      return new Date(dateStr).getTime() >= cutoffMs
    })
  }, [data, period])

  if (!filteredData.length) {
    return <div className="flex items-center justify-center h-64 text-text-secondary text-sm">Aucune donnée</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{valueLabel}</h3>
        <div className="flex gap-1">
          {PERIODS.map(({ label, months }) => (
            <button
              key={label}
              onClick={() => setPeriod(months)}
              aria-pressed={period === months}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                period === months
                  ? 'bg-accent-cyan/20 text-accent-cyan'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div role="img" aria-label={`Graphique chronologique montrant l'évolution des mesures`}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={filteredData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            {percentiles?.p10 != null && percentiles.p25 != null && percentiles.p75 != null && percentiles.p90 != null && (
              <>
                <ReferenceArea yAxisId="left" y2={percentiles.p10}  fill="rgba(239,68,68,0.10)"   ifOverflow="visible" />
                <ReferenceArea yAxisId="left" y1={percentiles.p10}  y2={percentiles.p25} fill="rgba(249,115,22,0.10)"  ifOverflow="visible" />
                <ReferenceArea yAxisId="left" y1={percentiles.p25}  y2={percentiles.p75} fill="rgba(34,197,94,0.10)"   ifOverflow="visible" />
                <ReferenceArea yAxisId="left" y1={percentiles.p75}  y2={percentiles.p90} fill="rgba(59,130,246,0.10)"  ifOverflow="visible" />
                <ReferenceArea yAxisId="left" y1={percentiles.p90}  fill="rgba(99,102,241,0.10)"  ifOverflow="visible" />
              </>
            )}
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey={(d: any) => d.mois || d.date}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(v: string) => {
                const d = new Date(v)
                return `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
              }}
              stroke="transparent"
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              stroke="transparent"
              label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              reversed
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              stroke="transparent"
              label={{ value: 'mm', angle: 90, position: 'insideRight', fill: '#9ca3af', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(v: string) => new Date(v).toLocaleDateString('fr-FR')}
            />
            <Area
              yAxisId="right"
              dataKey={precipKey}
              fill="rgba(56,189,248,0.15)"
              stroke="rgba(56,189,248,0.4)"
              strokeWidth={1}
              name="Précipitations (mm)"
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={valueKey}
              stroke="#06b6d4"
              strokeWidth={1.5}
              dot={false}
              name={valueLabel}
              connectNulls={false}
            />
            <Brush
              dataKey={(d: any) => d.mois || d.date}
              height={24}
              stroke="rgba(6,182,212,0.3)"
              fill="#0a0e1a"
              tickFormatter={() => ''}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {percentiles?.p10 != null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-end">
          {ZONE_BANDS.map(z => (
            <span key={z.key} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ZONE_DOT_COLORS[z.key] }} />
              {z.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
