import { useState, useCallback, useRef, useEffect } from 'react'
import { Play, Pause, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ClassificationTimeline } from '../../lib/types'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

function formatPeriod(period: string): string {
  const [year, month] = period.split('-')
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`
}

function formatSeason(period: string): string {
  const month = parseInt(period.split('-')[1], 10)
  if (month <= 2 || month === 12) return 'Hiver'
  if (month <= 5) return 'Printemps'
  if (month <= 8) return 'Ete'
  return 'Automne'
}

interface Props {
  onPeriodChange: (periodIndex: number | null, timeline: ClassificationTimeline | null) => void
}

export function TimelineSlider({ onPeriodChange }: Props) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['classification-timeline'],
    queryFn: () => api.common.classificationTimeline(),
    staleTime: 3_600_000 * 24, // 24h
  })

  const [active, setActive] = useState(false)
  const [index, setIndex] = useState<number>(0)
  const [playing, setPlaying] = useState(false)
  const playRef = useRef(false)
  const indexRef = useRef(0)

  const maxIndex = (timeline?.periods?.length ?? 1) - 1

  // Sync ref for animation
  useEffect(() => {
    playRef.current = playing
    indexRef.current = index
  }, [playing, index])

  // Animation loop
  useEffect(() => {
    if (!playing || !timeline) return
    const interval = setInterval(() => {
      if (!playRef.current) return
      const next = indexRef.current + 1
      if (next > maxIndex) {
        setPlaying(false)
        return
      }
      setIndex(next)
      onPeriodChange(next, timeline)
    }, 150)
    return () => clearInterval(interval)
  }, [playing, timeline, maxIndex, onPeriodChange])

  const handleActivate = useCallback(() => {
    if (!timeline || maxIndex < 1) return
    setActive(true)
    const lastIdx = maxIndex
    setIndex(lastIdx)
    onPeriodChange(lastIdx, timeline)
  }, [timeline, maxIndex, onPeriodChange])

  const handleDeactivate = useCallback(() => {
    setActive(false)
    setPlaying(false)
    setIndex(0)
    onPeriodChange(null, null)
  }, [onPeriodChange])

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    setIndex(val)
    if (timeline) onPeriodChange(val, timeline)
  }, [timeline, onPeriodChange])

  const togglePlay = useCallback(() => {
    if (!timeline) return
    if (!playing && index >= maxIndex) {
      // Restart from beginning
      setIndex(0)
      onPeriodChange(0, timeline)
    }
    setPlaying(p => !p)
  }, [playing, index, maxIndex, timeline, onPeriodChange])

  if (isLoading || !timeline) return null

  // Year ticks for the slider
  const years = new Set(timeline.periods.map(p => p.split('-')[0]))
  const yearList = [...years].sort()

  if (!active) {
    return (
      <button
        onClick={handleActivate}
        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-bg-card/90 backdrop-blur-md border border-white/10 rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-accent-cyan/30 transition-colors"
      >
        <Play className="w-3.5 h-3.5 inline mr-2 -mt-0.5" />
        Timeline historique
      </button>
    )
  }

  const currentPeriod = timeline.periods[index] ?? ''

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-4xl bg-bg-card/95 backdrop-blur-md border border-white/10 rounded-lg px-4 py-3 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 transition-colors"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <div className="text-sm">
            <span className="text-text-primary font-medium">{formatPeriod(currentPeriod)}</span>
            <span className="text-text-secondary ml-2">· {formatSeason(currentPeriod)}</span>
          </div>
        </div>
        <button
          onClick={handleDeactivate}
          className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Fermer la timeline"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={index}
          onChange={handleSliderChange}
          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-cyan
            [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.4)]
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-accent-cyan [&::-moz-range-thumb]:border-0"
        />
        {/* Year labels */}
        <div className="flex justify-between mt-1 text-[9px] text-text-secondary px-1">
          {yearList.filter((_, i) => i % Math.max(1, Math.floor(yearList.length / 10)) === 0 || i === yearList.length - 1).map(year => (
            <span key={year}>{year}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
