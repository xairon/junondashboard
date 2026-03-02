import { useMemo } from 'react'

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

interface Props {
  data: any[]
  valueKey: string
  label: string
}

function valueToColor(value: number, min: number, max: number): string {
  if (max === min) return '#1f2937'
  const t = (value - min) / (max - min)
  if (t < 0.2) return '#ef4444'
  if (t < 0.4) return '#f97316'
  if (t < 0.6) return '#eab308'
  if (t < 0.8) return '#10b981'
  return '#3b82f6'
}

export function YearlyHeatmap({ data, valueKey, label }: Props) {
  const { grid, years, min, max } = useMemo(() => {
    const grid: Record<number, Record<number, number | null>> = {}
    let min = Infinity, max = -Infinity

    data.forEach((d: any) => {
      const dt = new Date(d.mois || d.date)
      const year = dt.getFullYear()
      const month = dt.getMonth()
      const val = d[valueKey]
      if (!grid[year]) grid[year] = {}
      grid[year][month] = val
      if (val != null) {
        min = Math.min(min, val)
        max = Math.max(max, val)
      }
    })

    const years = Object.keys(grid).map(Number).sort()
    return { grid, years, min, max }
  }, [data, valueKey])

  if (!years.length) return null

  const cellW = 36
  const cellH = 20
  const labelW = 44
  const svgW = labelW + 12 * cellW + 10
  const svgH = 24 + years.length * cellH + 10

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-3">{label}</h3>
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="font-mono">
          {MONTH_LABELS.map((m, i) => (
            <text key={i} x={labelW + i * cellW + cellW / 2} y={14} textAnchor="middle"
              fill="#9ca3af" fontSize={10}>{m}</text>
          ))}
          {years.map((year, yi) => (
            <g key={year}>
              <text x={labelW - 4} y={24 + yi * cellH + cellH / 2 + 4} textAnchor="end"
                fill="#9ca3af" fontSize={10}>{year}</text>
              {Array.from({ length: 12 }, (_, mi) => {
                const val = grid[year]?.[mi]
                const fill = val != null ? valueToColor(val, min, max) : '#1f2937'
                return (
                  <rect
                    key={mi}
                    x={labelW + mi * cellW}
                    y={24 + yi * cellH}
                    width={cellW - 2}
                    height={cellH - 2}
                    rx={3}
                    fill={fill}
                    opacity={val != null ? 0.8 : 0.2}
                  >
                    <title>{val != null ? `${year}-${String(mi + 1).padStart(2, '0')}: ${val.toFixed(2)}` : 'N/A'}</title>
                  </rect>
                )
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
