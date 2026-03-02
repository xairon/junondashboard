import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import ObservatoryPage from './pages/ObservatoryPage'
import StationPage from './pages/StationPage'
import TrendsPage from './pages/TrendsPage'
import AlertsPage from './pages/AlertsPage'
import ComparePage from './pages/ComparePage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ObservatoryPage /> },
      { path: '/station/piezo/:code', element: <StationPage /> },
      { path: '/station/hydro/:code', element: <StationPage /> },
      { path: '/trends', element: <TrendsPage /> },
      { path: '/alerts', element: <AlertsPage /> },
      { path: '/compare', element: <ComparePage /> },
    ],
  },
])
