import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { Layout } from '@/components/Layout'
import HomePage from '@/pages/Home'
import RightsPage from '@/pages/Rights'
import RightsDetailPage from '@/pages/RightsDetail'
import ChatPage from '@/pages/Chat'

// Import i18n (side-effect: initializes i18next)
import '@/i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/rights" element={<RightsPage />} />
            <Route path="/rights/:slug" element={<RightsDetailPage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </Layout>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
