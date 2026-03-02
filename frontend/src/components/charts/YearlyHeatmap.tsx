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

  const legendW = 200
  const legendH = 12
  const legendSteps = [
    { t: 0, color: '#ef4444', label: min === Infinity ? '' : min.toFixed(1) },
    { t: 0.2, color: '#f97316', label: '' },
    { t: 0.4, color: '#eab308', label: '' },
    { t: 0.6, color: '#10b981', label: '' },
    { t: 0.8, color: '#3b82f6', label: max === -Infinity ? '' : max.toFixed(1) },
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-3">{label}</h3>
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="font-mono" role="img" aria-label={`${label} - heatmap annuelle`}>
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

      {/* Color scale legend */}
      {min !== Infinity && max !== -Infinity && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] text-text-secondary">{min.toFixed(1)}</span>
          <svg width={legendW} height={legendH} className="flex-shrink-0">
            <defs>
              <linearGradient id="heatmap-grad" x1="0" x2="1" y1="0" y2="0">
                {legendSteps.map((s, i) => (
                  <stop key={i} offset={`${s.t * 100}%`} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={legendW} height={legendH} rx={3} fill="url(#heatmap-grad)" opacity={0.8} />
          </svg>
          <span className="text-[10px] text-text-secondary">{max.toFixed(1)}</span>
        </div>
      )}
    </div>
  )
}
