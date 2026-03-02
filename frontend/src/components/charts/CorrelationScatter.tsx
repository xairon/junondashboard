import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

interface Props {
  data: any[]
  xKey: string
  yKey: string
  xLabel: string
  yLabel: string
}

const LAG_OPTIONS = [0, 1, 3, 6, 12]

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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Correlation</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Lag:</span>
          {LAG_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => setLag(l)}
              className={`px-2 py-0.5 rounded text-xs ${lag === l ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {l}m
            </button>
          ))}
        </div>
      </div>
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
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Scatter data={scatterData} fill="#06b6d4" fillOpacity={0.5} r={2} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
