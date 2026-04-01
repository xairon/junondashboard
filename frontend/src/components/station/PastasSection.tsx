import { Activity } from 'lucide-react'
import { usePastasSummary, usePastasTimeseries, usePastasSGI } from '../../hooks/usePastas'
import { PastasModelCard } from './PastasModelCard'
import { PastasTimeseriesChart } from '../charts/PastasTimeseriesChart'
import { WaterBalanceChart } from '../charts/WaterBalanceChart'
import { IRFChart } from '../charts/IRFChart'
import { DroughtIndexChart } from '../charts/DroughtIndexChart'

interface Props {
  code: string
}

export function PastasSection({ code }: Props) {
  const { data: summary, isLoading: summaryLoading } = usePastasSummary(code)
  const { data: timeseries } = usePastasTimeseries(code, 'monthly')
  const { data: sgiData } = usePastasSGI(code)

  // No model for this station — render nothing
  if (!summaryLoading && !summary) return null

  // Loading state
  if (summaryLoading) {
    return (
      <section className="bg-gray-900/50 rounded-xl border border-white/5 p-5 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/3 mb-4" />
        <div className="h-32 bg-white/5 rounded" />
      </section>
    )
  }

  return (
    <section className="bg-gray-900/50 rounded-xl border border-white/5 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
        <Activity className="w-4 h-4" />
        Modélisation PASTAS
      </h2>

      {summary && <PastasModelCard summary={summary} />}

      {timeseries && timeseries.length > 0 && (
        <div className="bg-bg-card border border-white/5 rounded-xl p-5">
          <PastasTimeseriesChart data={timeseries} />
        </div>
      )}

      {timeseries && timeseries.length > 0 && (
        <div className="bg-bg-card border border-white/5 rounded-xl p-5">
          <WaterBalanceChart data={timeseries} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sgiData && sgiData.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <DroughtIndexChart
              data={sgiData.map(d => ({ mois: d.date, value: d.sgi, sgi: d.sgi, classification: d.classification }))}
              indexKey="sgi"
              label="Indice standardisé (SGI — PASTAS)"
            />
          </div>
        )}

        {summary?.block_response && summary.block_response.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <IRFChart
              blockResponse={summary.block_response}
              tmaxDays={summary.tmax_days}
            />
          </div>
        )}
      </div>
    </section>
  )
}
