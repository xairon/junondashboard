import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { CHART_TOOLTIP_STYLE } from '../../lib/types'

const MONTH_LABELS_HYDRO = ['Sep', 'Oct', 'Nov', 'D\u00e9c', 'Jan', 'F\u00e9v', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Ao\u00fb']
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

    // Build chart data in calendar order (months 0-11)
    const calendarData = Array.from({ length: 12 }, (_, i) => {
      const row: any = { monthIndex: i }
      years.forEach(y => { row[String(y)] = byYear[y]?.[i] ?? null })
      return row
    })

    // Reorder to hydrological year: Sep (8), Oct (9), Nov (10), Dec (11), Jan (0), ..., Aug (7)
    const hydroOrder = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7]
    const chartData = hydroOrder.map((monthIdx, pos) => ({
      ...calendarData[monthIdx],
      month: MONTH_LABELS_HYDRO[pos],
    })).filter(Boolean)

    return { chartData, years }
  }, [data, valueKey])

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-3">Saisonnalit\u00e9 - {label}</h3>
      <div role="img" aria-label={`Graphique de saisonnalit\u00e9 pour ${label}`}>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
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
    </div>
  )
}
