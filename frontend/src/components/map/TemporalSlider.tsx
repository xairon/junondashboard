import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  dates: string[]
  currentIndex: number
  onIndexChange: (index: number) => void
  isPlaying: boolean
  onPlayToggle: () => void
  variable: 'total_precipitation' | 'temperature_2m'
  onVariableChange: (v: 'total_precipitation' | 'temperature_2m') => void
}

const VARIABLE_LABELS: { key: 'total_precipitation' | 'temperature_2m'; label: string }[] = [
  { key: 'total_precipitation', label: 'Précipitations' },
  { key: 'temperature_2m', label: 'Température' },
]

export function TemporalSlider({
  dates,
  currentIndex,
  onIndexChange,
  isPlaying,
  onPlayToggle,
  variable,
  onVariableChange,
}: Props) {
  if (!dates.length) return null

  const currentDate = dates[currentIndex] ?? ''
  const formatted = currentDate
    ? new Date(currentDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })
    : ''

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-bg-card/95 backdrop-blur-sm rounded-xl border border-white/10 px-4 py-3 flex items-center gap-3 shadow-xl w-[calc(100%-2rem)] md:min-w-[500px] md:w-auto">
      <div className="flex gap-1">
        {VARIABLE_LABELS.map((v) => (
          <button
            key={v.key}
            onClick={() => onVariableChange(v.key)}
            aria-pressed={variable === v.key}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              variable === v.key
                ? 'bg-accent-cyan/20 text-accent-cyan'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-white/10" />

      <button
        onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
        aria-label="Mois précédent"
        className="text-text-secondary hover:text-text-primary transition-colors"
        disabled={currentIndex === 0}
      >
        <ChevronLeft size={16} />
      </button>

      <button
        onClick={onPlayToggle}
        aria-label={isPlaying ? 'Pause' : 'Lecture'}
        className="w-7 h-7 rounded-full bg-accent-cyan/20 text-accent-cyan flex items-center justify-center hover:bg-accent-cyan/30 transition-colors"
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>

      <button
        onClick={() => onIndexChange(Math.min(dates.length - 1, currentIndex + 1))}
        aria-label="Mois suivant"
        className="text-text-secondary hover:text-text-primary transition-colors"
        disabled={currentIndex === dates.length - 1}
      >
        <ChevronRight size={16} />
      </button>

      <input
        type="range"
        min={0}
        max={dates.length - 1}
        value={currentIndex}
        onChange={(e) => onIndexChange(Number(e.target.value))}
        aria-label="Curseur temporel ERA5"
        className="flex-1 h-1 accent-accent-cyan cursor-pointer"
      />

      <span className="text-xs text-text-primary font-medium min-w-[70px] text-right">
        {formatted}
      </span>
    </div>
  )
}
