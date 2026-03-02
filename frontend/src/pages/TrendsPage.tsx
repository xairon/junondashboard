import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { CLASSIFICATION_COLORS } from '../lib/constants'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

export default function TrendsPage() {
  const [dataType, setDataType] = useState<'piezo' | 'hydro'>('piezo')
  const { data: departments } = useQuery({
    queryKey: ['stats', 'departments'],
    queryFn: api.stats.departments,
  })
  const { data: stats } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  const sortedDepts = (departments ?? [])
    .filter((d: any) => d.pct_tres_bas != null)
    .sort((a: any, b: any) => (b.pct_tres_bas ?? 0) - (a.pct_tres_bas ?? 0))
    .slice(0, 20)

  const total = stats?.total_piezo ?? 1
  const tresBas = stats?.piezo_tres_bas ?? 0
  const bas = stats?.piezo_bas ?? 0
  const normal = stats?.piezo_normal ?? 0
  const haut = stats?.piezo_haut ?? 0
  const tresHaut = stats?.piezo_tres_haut ?? 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-text-primary">Tendances nationales</h1>
          <div className="flex gap-1">
            <button
              onClick={() => setDataType('piezo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                dataType === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Piezo
            </button>
            <button
              onClick={() => setDataType('hydro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                dataType === 'hydro' ? 'bg-accent-indigo/20 text-accent-indigo' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Hydro
            </button>
          </div>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Tres bas', count: tresBas, color: CLASSIFICATION_COLORS.TRES_BAS },
            { label: 'Bas', count: bas, color: CLASSIFICATION_COLORS.BAS },
            { label: 'Normal', count: normal, color: CLASSIFICATION_COLORS.NORMAL },
            { label: 'Haut', count: haut, color: CLASSIFICATION_COLORS.HAUT },
            { label: 'Tres haut', count: tresHaut, color: CLASSIFICATION_COLORS.TRES_HAUT },
          ].map((item) => (
            <div key={item.label} className="bg-bg-card border border-white/5 rounded-xl p-4 text-center">
              <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: item.color }} />
              <p className="text-2xl font-bold text-text-primary font-mono">
                {((item.count / total) * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-text-secondary mt-1">{item.label}</p>
              <p className="text-xs font-mono text-text-secondary">{item.count.toLocaleString('fr-FR')}</p>
            </div>
          ))}
        </div>

        {/* Department ranking */}
        <div className="bg-bg-card border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Top 20 departements - % stations tres bas
          </h3>
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={sortedDepts} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" unit="%" />
              <YAxis
                type="category"
                dataKey="nom_departement"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                stroke="transparent"
                width={75}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(val: number) => [`${val}%`, '% Tres bas']}
              />
              <Bar dataKey="pct_tres_bas" radius={[0, 4, 4, 0]}>
                {sortedDepts.map((d: any, i: number) => (
                  <Cell key={i} fill={d.pct_tres_bas > 60 ? '#ef4444' : d.pct_tres_bas > 40 ? '#f97316' : '#06b6d4'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
