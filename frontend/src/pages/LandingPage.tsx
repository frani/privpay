import { usePrivy } from '@privy-io/react-auth'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  Spinner,
  VStack,
  Image,
} from '@chakra-ui/react'
import logo from '../assets/pp.png'

function LandingPage() {
  const { ready, authenticated, login } = usePrivy()
  const navigate = useNavigate()

  const handleSignIn = () => {
    login()
  }

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

  return (
    <Box
      minH="100vh"
      bgGradient="linear(to-br, blue.50, indigo.100)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
    >
      <Container maxW="4xl" textAlign="center">
        <VStack spacing={8}>
          <Image src={logo} alt="PrivPay" height="80px" />
          <Heading as="h1" size="2xl" color="gray.900">
            Welcome to PrivPay
          </Heading>
          <Text fontSize="xl" color="gray.600">
            Easy for Merchants.
            Simple for Customers.
            Private for everyone.
          </Text>
          { !authenticated && (
          <Button
            onClick={handleSignIn}
            colorScheme="blue"
            size="lg"
            px={8}
            py={6}
            fontSize="md"
            fontWeight="semibold"
            boxShadow="lg"
            _hover={{ transform: 'scale(1.05)' }}
            transition="all 0.2s"
          >
            Sign In / Sign Up
          </Button>
          )}
          {authenticated && (
          <Button
            onClick={() => navigate('/dashboard')}
            colorScheme="blue"
            size="lg"
            px={8}
            py={6}
            fontSize="md"
            fontWeight="semibold"
            boxShadow="lg"
            _hover={{ transform: 'scale(1.05)' }}
            transition="all 0.2s"
          >
            Go to Dashboard
          </Button>
          )}
          
        </VStack>
      </Container>
    </Box>
  )
}

export default LandingPage
