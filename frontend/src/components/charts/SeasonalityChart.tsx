import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
const YEAR_COLORS = ['#06b6d4', '#6366f1', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#ec4899']

interface Props {
  data: any[]
  valueKey: string
  label: string
}

export function SeasonalityChart({ data, valueKey, label }: Props) {
  const { chartData, years } = useMemo(() => {
    const byYear: Record<number, Record<number, number>> = {}
    data.forEach((d: any) => {
      const dt = new Date(d.mois || d.date)
      const year = dt.getFullYear()
      const month = dt.getMonth()
      if (!byYear[year]) byYear[year] = {}
      byYear[year][month] = d[valueKey]
    })

    const years = Object.keys(byYear).map(Number).sort().slice(-5)
    const chartData = MONTH_LABELS.map((label, i) => {
      const row: any = { month: label }
      years.forEach(y => { row[String(y)] = byYear[y]?.[i] ?? null })
      return row
    })

    return { chartData, years }
  }, [data, valueKey])

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-3">Saisonnalite - {label}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {years.map((year, i) => (
            <Line
              key={year}
              type="monotone"
              dataKey={String(year)}
              stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
