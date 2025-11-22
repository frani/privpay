import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { ethers } from 'ethers'
import apiClient from '../lib/axios'
import { fromStorageFormat } from '../utils.js'

// Type for ethereum provider (using any to avoid conflicts with existing declarations)
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
  Code,
  Divider,
} from '@chakra-ui/react'

interface Checkout {
  _id: string
  name: string
  amount: string // Stored as 6-digit string (USDC format: 1000000 = 1.00)
  createdAt: string
  status: string
  transactionHash?: string
}

interface X402PaymentInstruction {
  scheme: string
  network: string
  maxAmountRequired: string
  resource: string
  amount: string
  description: string
  mimeType: string
  outputSchema: any
  payTo: string
  maxTimeoutSeconds: number
  asset: string
  extra: {
    name: string
    version: string
  }
}

interface X402Response {
  x402Version: number
  accepts: X402PaymentInstruction[]
  error: string
}

// USDC ERC20 ABI (minimal for transfer)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address account) external view returns (uint256)',
]

function CheckoutPage() {
  const { id } = useParams<{ id: string }>()
  const { ready, authenticated, login } = usePrivy()
  const toast = useToast()
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [paymentInstructions, setPaymentInstructions] = useState<X402PaymentInstruction | null>(null)
  const [paymentHash, setPaymentHash] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchCheckout()
    }
  }, [id, paymentHash])

  const fetchCheckout = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const headers: Record<string, string> = {}
      if (paymentHash) {
        headers['x-payment'] = paymentHash
      }

      const response = await apiClient.get(`/api/checkouts/${id}`, { headers })
      setCheckout(response.data)
      setPaymentInstructions(null)
    } catch (error: any) {
      console.error('Error fetching checkout:', error)
      
      // Handle 402 Payment Required response
      if (error.response?.status === 402) {
        const x402Response: X402Response = error.response.data
        if (x402Response.accepts && x402Response.accepts.length > 0) {
          setPaymentInstructions(x402Response.accepts[0])
          setError(null)
        } else {
          setError(x402Response.error || 'Payment required')
        }
      } else {
        setError(error.response?.data?.message || 'Checkout not found')
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!paymentInstructions) return

    // Check if user is authenticated
    if (!ready || !authenticated) {
      toast({
        title: 'Authentication Required',
        description: 'Please connect your wallet to make a payment',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      })
      await login()
      return
    }

    try {
      setProcessing(true)

      // Check for Ethereum provider
      const ethereum = (window as any).ethereum
      if (!ethereum) {
        throw new Error('No Ethereum wallet found. Please install MetaMask or connect a wallet.')
      }

      // Request account access if needed
      await ethereum.request({ method: 'eth_requestAccounts' })

      const ethersProvider = new ethers.BrowserProvider(ethereum)
      const signer = await ethersProvider.getSigner()
      const userAddress = await signer.getAddress()

      // Get USDC contract
      const usdcContract = new ethers.Contract(
        paymentInstructions.asset,
        ERC20_ABI,
        signer
      )

      // Get decimals for the token
      const decimals = await usdcContract.decimals()
      
      // paymentInstructions.amount is already in storage format (6-digit string like "1000000")
      // Convert to BigInt for token transfer (amount is already in smallest unit)
      const amount = BigInt(paymentInstructions.amount)

      // Check balance
      const balance = await usdcContract.balanceOf(userAddress)
      if (balance < amount) {
        throw new Error('Insufficient USDC balance')
      }

      // Send USDC transfer
      const tx = await usdcContract.transfer(paymentInstructions.payTo, amount)
      
      toast({
        title: 'Transaction Submitted',
        description: 'Waiting for confirmation...',
        status: 'info',
        duration: 3000,
        isClosable: true,
      })

      // Wait for transaction confirmation
      const receipt = await tx.wait()
      const txHash = receipt.hash

      // Store payment hash and retry fetching checkout
      setPaymentHash(txHash)
      
      toast({
        title: 'Payment Successful!',
        description: `Transaction: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      // Retry fetching checkout with payment header
      await fetchCheckout()
    } catch (error: any) {
      console.error('Error processing payment:', error)
      
      let errorMessage = 'Payment failed. Please try again.'
      if (error.code === 4001) {
        errorMessage = 'Transaction was rejected by user'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({
        title: 'Payment Failed',
        description: errorMessage,
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

  // Show payment required screen if we have payment instructions
  if (paymentInstructions && !checkout) {
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
                    Payment Required
                  </Heading>
                  <Text color="gray.500">{paymentInstructions.description}</Text>
                </VStack>

                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold">Payment Required to View Checkout</Text>
                    <Text fontSize="sm" mt={1}>
                      Please complete the payment to access checkout details
                    </Text>
                  </Box>
                </Alert>

                <Box bg="gray.50" borderRadius="lg" p={6}>
                  <VStack spacing={4} align="stretch">
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Text color="gray.600">Amount</Text>
                      <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                        ${fromStorageFormat(paymentInstructions.amount)} {paymentInstructions.extra.name}
                      </Text>
                    </Box>
                    <Divider />
                    <Box>
                      <Text fontSize="sm" color="gray.600" mb={1}>
                        Network
                      </Text>
                      <Badge colorScheme="purple" textTransform="capitalize">
                        {paymentInstructions.network}
                      </Badge>
                    </Box>
                    <Box>
                      <Text fontSize="sm" color="gray.600" mb={1}>
                        Recipient
                      </Text>
                      <Code fontSize="xs" p={2} borderRadius="md" display="block">
                        {paymentInstructions.payTo}
                      </Code>
                    </Box>
                  </VStack>
                </Box>

                <Button
                  onClick={handlePayment}
                  isLoading={processing}
                  loadingText="Processing Payment..."
                  colorScheme="blue"
                  size="lg"
                  w="full"
                  isDisabled={!ready || !authenticated}
                >
                  {!ready || !authenticated ? 'Connect Wallet to Pay' : 'Pay Now'}
                </Button>

                {!ready || !authenticated ? (
                  <Button
                    onClick={login}
                    variant="outline"
                    colorScheme="blue"
                    size="md"
                    w="full"
                  >
                    Connect Wallet
                  </Button>
                ) : null}
              </VStack>
            </CardBody>
          </Card>
        </Container>
      </Box>
    )
  }

  if (error && !paymentInstructions) {
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

  if (!checkout) {
    return null
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
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Text color="gray.600">Amount</Text>
                    <Text fontSize="3xl" fontWeight="bold" color="blue.600">
                      ${fromStorageFormat(checkout.amount)}
                    </Text>
                  </Box>
                  <Box borderTop="1px" borderColor="gray.200" pt={4}>
                    <Text fontSize="sm" color="gray.500">
                      Status:{' '}
                      <Badge colorScheme={checkout.status === 'completed' ? 'green' : 'yellow'}>
                        {checkout.status}
                      </Badge>
                    </Text>
                    {checkout.transactionHash && (
                      <Box mt={2}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Transaction Hash
                        </Text>
                        <Code fontSize="xs" p={2} borderRadius="md" display="block">
                          {checkout.transactionHash}
                        </Code>
                      </Box>
                    )}
                  </Box>
                </VStack>
              </Box>

              {checkout.status === 'completed' ? (
                <Alert status="success" borderRadius="md">
                  <AlertIcon />
                  Payment Completed
                </Alert>
              ) : (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  Payment Pending
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
