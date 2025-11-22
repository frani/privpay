import { usePrivy } from '@privy-io/react-auth'
import { Navigate } from 'react-router-dom'
import { Box, Spinner } from '@chakra-ui/react'

interface PrivateRouteProps {
  children: React.ReactNode
}

function PrivateRoute({ children }: PrivateRouteProps) {
  const { ready, authenticated } = usePrivy()

  if (!ready) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minH="100vh"
      >
        <Spinner size="xl" color="blue.500" />
      </Box>
    )
  }

  if (!authenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default PrivateRoute
