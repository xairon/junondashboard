import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { CHART_TOOLTIP_STYLE } from '../../lib/types'

interface Props {
  data: any[]
  xKey: string
  yKey: string
  xLabel: string
  yLabel: string
}

const LAG_OPTIONS = [0, 1, 3, 6, 12]

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n < 3) return 0
  const rank = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const ranks = new Array(n)
    sorted.forEach((item, r) => { ranks[item.i] = r + 1 })
    return ranks
  }
  const rx = rank(x)
  const ry = rank(y)
  const d2 = rx.reduce((sum, r, i) => sum + (r - ry[i]) ** 2, 0)
  return 1 - (6 * d2) / (n * (n * n - 1))
}

export function CorrelationScatter({ data, xKey, yKey, xLabel, yLabel }: Props) {
  const [lag, setLag] = useState(0)

  const scatterData = useMemo(() => {
    if (!data.length) return []
    return data
      .map((d: any, i: number) => {
        const lagIdx = i - lag
        if (lagIdx < 0) return null
        const xVal = data[lagIdx]?.[xKey]
        const yVal = d[yKey]
        if (xVal == null || yVal == null) return null
        return { x: xVal, y: yVal }
      })
      .filter(Boolean)
  }, [data, xKey, yKey, lag])

  const correlation = useMemo(() => {
    if (!scatterData || scatterData.length < 3) return null
    const filtered = scatterData.filter((d: any) => d.x != null && d.y != null)
    const x = filtered.map((d: any) => d.x)
    const y = filtered.map((d: any) => d.y)
    if (x.length < 3) return null
    return spearmanCorrelation(x, y)
  }, [scatterData])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Corrélation</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Lag:</span>
          {LAG_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => setLag(l)}
              aria-pressed={lag === l}
              className={`px-2 py-0.5 rounded text-xs ${lag === l ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {l}m
            </button>
          ))}
          {correlation !== null && (
            <span className="text-xs text-gray-400 ml-2">
              ρ = {correlation.toFixed(3)}
            </span>
          )}
        </div>
      </div>
      <div role="img" aria-label={`Graphique de corrélation entre ${xLabel} et ${yLabel}`}>
        <ResponsiveContainer width="100%" height={250}>
          <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="x"
              type="number"
              name={xLabel}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              stroke="transparent"
            />
            <YAxis
              dataKey="y"
              type="number"
              name={yLabel}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              stroke="transparent"
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
            />
            <Scatter data={scatterData} fill="#06b6d4" fillOpacity={0.5} r={2} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
