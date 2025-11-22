import { PrivyProvider } from '@privy-io/react-auth'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ChakraProvider } from '@chakra-ui/react'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import CheckoutPage from './pages/CheckoutPage'
import PrivateRoute from './components/PrivateRoute'

function App() {
  return (
    <ChakraProvider>
      <PrivyProvider
        appId={import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'}
        config={{
          loginMethods: ['email', 'wallet'],
          appearance: {
            theme: 'light',
            accentColor: '#676FFF',
          },
        }}
      >
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route path="/checkout/:id" element={<CheckoutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </PrivyProvider>
    </ChakraProvider>
  )
}

export default App

