import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/layout/Layout'

const ObservatoryPage = lazy(() => import('./pages/ObservatoryPage'))
const StationPage = lazy(() => import('./pages/StationPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="animate-pulse">Chargement...</div>
      </div>
    }>
      {children}
    </Suspense>
  )
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-lg mb-6">Page non trouvée</p>
      <a href="/" className="text-blue-400 hover:text-blue-300 underline">Retour à l'observatoire</a>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <SuspenseWrapper><ObservatoryPage /></SuspenseWrapper> },
      { path: 'station/*', element: <SuspenseWrapper><StationPage /></SuspenseWrapper> },
      { path: 'alerts', element: <SuspenseWrapper><AlertsPage /></SuspenseWrapper> },
      { path: 'compare', element: <SuspenseWrapper><ComparePage /></SuspenseWrapper> },
      { path: '*', element: <SuspenseWrapper><NotFoundPage /></SuspenseWrapper> },
    ],
  },
])
