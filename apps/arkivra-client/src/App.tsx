import { ThemeProvider } from '@/components/theme-provider'
import { SidebarConfigProvider } from '@/contexts/sidebar-context'
import { AppRouter } from '@/components/router/app-router'
import { useEffect } from 'react'
import { initGTM } from '@/utils/analytics'
import { Toaster } from '@/components/ui/sonner'
import { HeaderActionsProvider } from '@/contexts/header-actions-context'

function App() {
  // Initialize GTM on app load
  useEffect(() => {
    initGTM();
  }, []);

  return (
    <div className="font-sans antialiased" style={{ fontFamily: 'var(--font-inter)' }}>
      <ThemeProvider defaultTheme="system">
        <SidebarConfigProvider>
          <HeaderActionsProvider>
            <AppRouter />
          </HeaderActionsProvider>
          <Toaster />
        </SidebarConfigProvider>
      </ThemeProvider>
    </div>
  )
}

export default App
