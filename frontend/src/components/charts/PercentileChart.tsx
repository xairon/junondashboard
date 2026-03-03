import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea, Cell,
} from 'recharts'
import { CHART_TOOLTIP_STYLE } from '../../lib/types'
import type { YearlyPiezoData, YearlyHydroData } from '../../lib/types'

type Props = {
  data: YearlyPiezoData[] | YearlyHydroData[]
  type: 'piezo' | 'hydro'
}

function getPercentile(d: YearlyPiezoData | YearlyHydroData, type: 'piezo' | 'hydro'): number | null {
  if (type === 'piezo') return (d as YearlyPiezoData).percentile_niveau_historique ?? null
  return (d as YearlyHydroData).percentile_resultat_historique ?? null
}

function percentileColor(v: number): string {
  if (v < 10)  return '#f87171'
  if (v < 25)  return '#fb923c'
  if (v < 75)  return '#4ade80'
  if (v < 90)  return '#60a5fa'
  return '#818cf8'
}

function classLabel(v: number): string {
  if (v < 10)  return 'Très bas'
  if (v < 25)  return 'Bas'
  if (v < 75)  return 'Normal'
  if (v < 90)  return 'Haut'
  return 'Très haut'
}

export function PercentileChart({ data, type }: Props) {
  const chartData = data
    .map(d => ({
      annee: String((d as YearlyPiezoData | YearlyHydroData).annee),
      centile: getPercentile(d, type),
    }))
    .filter(d => d.centile != null)
    .sort((a, b) => a.annee.localeCompare(b.annee))

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
        Données de rang centile non disponibles
      </div>
    )
  }

  return (
    <div role="img" aria-label="Graphique du rang centile historique annuel">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <ReferenceArea y1={0}   y2={10}  fill="rgba(239,68,68,0.08)"   ifOverflow="visible" />
          <ReferenceArea y1={10}  y2={25}  fill="rgba(249,115,22,0.08)"  ifOverflow="visible" />
          <ReferenceArea y1={25}  y2={75}  fill="rgba(34,197,94,0.08)"   ifOverflow="visible" />
          <ReferenceArea y1={75}  y2={90}  fill="rgba(59,130,246,0.08)"  ifOverflow="visible" />
          <ReferenceArea y1={90}  y2={100} fill="rgba(99,102,241,0.08)"  ifOverflow="visible" />
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="annee"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            stroke="transparent"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            stroke="transparent"
            label={{ value: 'Centile', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${Math.round(value)}e centile — ${classLabel(value)}`, 'Rang']}
          />
          <Bar dataKey="centile" radius={[2, 2, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.annee}
                fill={percentileColor(entry.centile!)}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
