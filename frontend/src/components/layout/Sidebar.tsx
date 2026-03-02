import { NavLink } from 'react-router-dom'
import { Map, TrendingUp, AlertTriangle, GitCompareArrows } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', icon: Map, label: 'Observatoire' },
  { to: '/trends', icon: TrendingUp, label: 'Tendances' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alertes' },
  { to: '/compare', icon: GitCompareArrows, label: 'Comparer' },
] as const

export function Sidebar() {
  return (
    <nav className="w-16 hover:w-48 transition-all duration-300 bg-bg-card border-r border-white/5 flex flex-col items-center py-4 gap-1 group overflow-hidden shrink-0">
      <div className="mb-6 flex items-center gap-3 px-3 w-full">
        <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center shrink-0">
          <span className="text-accent-cyan font-bold text-lg">H</span>
        </div>
        <span className="text-sm font-semibold text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Hydro Dashboard
        </span>
      </div>

      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-colors ${
              isActive
                ? 'bg-accent-cyan/10 text-accent-cyan'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`
          }
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
