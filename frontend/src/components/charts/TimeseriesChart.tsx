import { useMemo, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, Area,
} from 'recharts'
import { CHART_TOOLTIP_STYLE } from '../../lib/types'

interface Props {
  data: any[]
  valueKey: string
  valueLabel: string
  unit: string
  precipKey?: string
}

const PERIODS = [
  { label: '1a', months: 12 },
  { label: '5a', months: 60 },
  { label: 'Max', months: Infinity },
] as const

export function TimeseriesChart({ data, valueKey, valueLabel, unit, precipKey = 'precipitation_totale' }: Props) {
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
    </div>
  )
}
