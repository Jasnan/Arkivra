import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarConfigProvider } from '@/contexts/sidebar-context'
import { AppRouter } from '@/components/router/app-router'
import { useEffect } from 'react'
import { initGTM } from '@/utils/analytics'
import { Toaster } from '@/components/ui/sonner'
import { HeaderActionsProvider } from '@/contexts/header-actions-context'

// Get basename from environment (for deployment) or use empty string for development
const basename = import.meta.env.VITE_BASENAME || ''

function App() {
  // Initialize GTM on app load
  useEffect(() => {
    initGTM();
  }, []);

  return (
    <div className="font-sans antialiased" style={{ fontFamily: 'var(--font-inter)' }}>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <SidebarConfigProvider>
          <HeaderActionsProvider>
            <Router basename={basename}>
              <AppRouter />
            </Router>
          </HeaderActionsProvider>
          <Toaster />
        </SidebarConfigProvider>
      </ThemeProvider>
    </div>
  )
}

export default App
