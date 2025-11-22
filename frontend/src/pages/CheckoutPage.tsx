import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../lib/axios'
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  Spinner,
  VStack,
  Card,
  CardBody,
  Badge,
  useToast,
  Alert,
  AlertIcon,
} from '@chakra-ui/react'

interface Checkout {
  _id: string
  name: string
  amount: number
  createdAt: string
  status: string
}

function CheckoutPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (id) {
      fetchCheckout()
    }
  }, [id])

  const fetchCheckout = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(`/api/checkouts/${id}`)
      setCheckout(response.data)
    } catch (error: any) {
      console.error('Error fetching checkout:', error)
      setError(error.response?.data?.message || 'Checkout not found')
    } finally {
      setLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!checkout) return

    try {
      setProcessing(true)
      const response = await apiClient.post(`/api/checkouts/${id}/pay`)

      if (response.data.transactionHash) {
        toast({
          title: 'Payment Successful!',
          description: `Transaction: ${response.data.transactionHash}`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
        setCheckout({ ...checkout, status: 'completed' })
      }
    } catch (error: any) {
      console.error('Error processing payment:', error)
      toast({
        title: 'Payment Failed',
        description: error.response?.data?.message || 'Payment failed. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <Box
        minH="100vh"
        bg="gray.50"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner size="xl" color="blue.500" />
      </Box>
    )
  }

  if (error || !checkout) {
    return (
      <Box
        minH="100vh"
        bg="gray.50"
        display="flex"
        alignItems="center"
        justifyContent="center"
        px={4}
      >
        <Card maxW="md" w="full">
          <CardBody textAlign="center">
            <Heading size="lg" color="red.600" mb={4}>
              Error
            </Heading>
            <Text color="gray.600">{error || 'Checkout not found'}</Text>
          </CardBody>
        </Card>
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
      <Container maxW="md" w="full">
        <Card>
          <CardBody>
            <VStack spacing={6} align="stretch">
              <VStack align="start" spacing={2}>
                <Heading size="lg" color="gray.900">
                  {checkout.name}
                </Heading>
                <Text color="gray.500">Payment Checkout</Text>
              </VStack>

              <Box bg="gray.50" borderRadius="lg" p={6}>
                <VStack spacing={4} align="stretch">
                  <Box display="flex" justify="space-between" alignItems="center">
                    <Text color="gray.600">Amount</Text>
                    <Text fontSize="3xl" fontWeight="bold" color="blue.600">
                      ${checkout.amount.toFixed(2)}
                    </Text>
                  </Box>
                  <Box borderTop="1px" borderColor="gray.200" pt={4}>
                    <Text fontSize="sm" color="gray.500">
                      Status:{' '}
                      <Badge colorScheme={checkout.status === 'completed' ? 'green' : 'yellow'}>
                        {checkout.status}
                      </Badge>
                    </Text>
                  </Box>
                </VStack>
              </Box>

              {checkout.status === 'pending' ? (
                <Button
                  onClick={handlePayment}
                  isLoading={processing}
                  loadingText="Processing Payment..."
                  colorScheme="blue"
                  size="lg"
                  w="full"
                >
                  Pay Now
                </Button>
              ) : (
                <Alert status="success" borderRadius="md">
                  <AlertIcon />
                  Payment Completed
                </Alert>
              )}
            </VStack>
          </CardBody>
        </Card>
      </Container>
    </Box>
  )
}

export default CheckoutPage
