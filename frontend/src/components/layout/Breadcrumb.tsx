import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  to?: string
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation()
  const params = useParams()
  const path = location.pathname

  const items: BreadcrumbItem[] = [{ label: 'Observatoire', to: '/' }]

  if (path === '/') {
    return items
  }

  if (path === '/trends') {
    items.push({ label: 'Tendances' })
    return items
  }

  if (path === '/alerts') {
    items.push({ label: 'Alertes' })
    return items
  }

  if (path === '/compare') {
    items.push({ label: 'Comparaison' })
    return items
  }

  if (path.startsWith('/station/')) {
    items.push({ label: 'Station' })
    // Extract the code from the path (after /station/piezo/ or /station/hydro/)
    const segments = path.split('/')
    const code = segments.slice(3).join('/') || params['*'] || ''
    if (code) {
      items.push({ label: code })
    }
    return items
  }

  return items
}

export function Breadcrumb() {
  const items = useBreadcrumbs()

  // Don't show breadcrumb on home page
  if (items.length <= 1) return null

  return (
    <nav aria-label="Fil d'Ariane" className="px-6 pt-3 pb-0">
      <ol className="flex items-center gap-1 text-xs">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-text-secondary/50" />}
              {isLast || !item.to ? (
                <span className={isLast ? 'text-text-primary font-medium' : 'text-text-secondary'}>
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
