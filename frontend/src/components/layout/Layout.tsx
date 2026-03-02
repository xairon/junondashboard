import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Breadcrumb } from './Breadcrumb'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-bg-primary text-text-primary font-sans">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-blue-600 focus:text-white focus:p-2 focus:rounded focus:z-[100]"
      >
        Aller au contenu principal
      </a>

      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-bg-card/90 backdrop-blur-md border border-white/10 rounded-lg"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5 text-text-primary" />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - drawer on mobile, static on desktop */}
      <div
        className={`
          fixed md:relative z-40 h-full
          transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Mobile close button */}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute top-3 right-3 z-50 p-1.5 hover:bg-bg-hover rounded-lg"
            aria-label="Fermer le menu"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        )}
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <Breadcrumb />
        <main id="main-content" className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
