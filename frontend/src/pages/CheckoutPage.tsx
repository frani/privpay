import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { ethers } from "ethers";
import apiClient from "../lib/axios";
import { fromStorageFormat } from "../utils.js";
import {
  ensureRailgunReady,
  deriveShieldPrivateKey,
  buildShieldTransactionRequest,
} from "../railgun/shield";

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
} from "@chakra-ui/react";

interface Checkout {
  _id: string;
  name: string;
  amount: string; // Stored as 6-digit string (USDC format: 1000000 = 1.00)
  createdAt: string;
  status: string;
  transactionHash?: string;
  checkoutRailgunAddress?: string; // Dirección 0zk del checkout
  shieldTransactionHash?: string; // Hash de la transacción de shield
  privateTransferHash?: string; // Hash de la transferencia privada
}

interface X402PaymentInstruction {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  amount: string;
  description: string;
  mimeType: string;
  outputSchema: any;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    name: string;
    version: string;
  };
}

interface X402Response {
  x402Version: number;
  accepts: X402PaymentInstruction[];
  error: string;
}

type ShieldContext = {
  signer: ethers.Signer;
  userAddress: string;
  chainId: number;
  config: any;
  tokenAddress: string;
  railgunContractAddress: string;
  usdcContract: ethers.Contract;
  shieldTxRequest: ethers.TransactionRequest;
  totalRequired: bigint;
};

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function DOMAIN_SEPARATOR() external view returns (bytes32)",
  "function nonces(address owner) external view returns (uint256)",
];

const RAILGUN_ABI = [
  "function shield(bytes32[2] recipient, address token, uint256 amount) external",
  "function getShieldFee(uint256 amount) external view returns (uint256)",
];

function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, authenticated, login, user: privyUser } = usePrivy();
  const toast = useToast();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentInstructions, setPaymentInstructions] =
    useState<X402PaymentInstruction | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [checkingAllowance, setCheckingAllowance] = useState(false);
  const [approving, setApproving] = useState(false);
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [userBalanceLoading, setUserBalanceLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCheckout();
    }
  }, [id, paymentHash]);

  useEffect(() => {
    fetchUserBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, privyUser?.id]);

  const fetchCheckout = async () => {
    try {
      setLoading(true);
      setError(null);

      const headers: Record<string, string> = {};
      if (paymentHash) {
        headers["x-payment"] = paymentHash;
      }

      const response = await apiClient.get(`/api/checkouts/${id}`, { headers });
      setCheckout(response.data);
      setPaymentInstructions(null);
    } catch (error: any) {
      console.error("Error fetching checkout:", error);

      // Handle 402 Payment Required response
      if (error.response?.status === 402) {
        const x402Response: X402Response = error.response.data;
        if (x402Response.accepts && x402Response.accepts.length > 0) {
          setPaymentInstructions(x402Response.accepts[0]);
          setError(null);
        } else {
          setError(x402Response.error || "Payment required");
        }
      } else {
        setError(error.response?.data?.message || "Checkout not found");
      }
    } finally {
      setLoading(false);
    }
  };

  const getShieldContext = async (): Promise<ShieldContext> => {
    if (!checkout?.checkoutRailgunAddress) {
      throw new Error("Checkout not loaded");
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      throw new Error(
        "No Ethereum wallet found. Please install MetaMask or connect a wallet."
      );
    }

    await ethereum.request({ method: "eth_requestAccounts" });

    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    const network = await signer.provider?.getNetwork();
    const chainId = Number(network?.chainId || 137n);

    const tokenAddress =
      import.meta.env.VITE_USDC_CONTRACT_ADDRESS ||
      "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
    const amount = BigInt(checkout.amount);

    const config = await ensureRailgunReady(chainId);
    const shieldPrivateKey = await deriveShieldPrivateKey(signer);
    const shieldTxRequest = await buildShieldTransactionRequest({
      config,
      shieldPrivateKey,
      tokenAddress,
      amount,
      recipientAddress: checkout.checkoutRailgunAddress,
    });

    const railgunContractAddress = await Promise.resolve(shieldTxRequest.to);
    if (!railgunContractAddress) {
      throw new Error("Unable to resolve Railgun contract address");
    }

    const usdcContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const railgunContract = new ethers.Contract(
      railgunContractAddress,
      RAILGUN_ABI,
      signer
    );

    const shieldFee = await railgunContract.getShieldFee(amount);
    const totalRequired = amount + shieldFee;

    const balance = await usdcContract.balanceOf(userAddress);
    if (balance < totalRequired) {
      throw new Error("Insufficient USDC balance (amount + fee)");
    }

    return {
      signer,
      userAddress,
      chainId,
      config,
      tokenAddress,
      railgunContractAddress,
      usdcContract,
      shieldTxRequest,
      totalRequired,
    };
  };

  const fetchUserBalance = async () => {
    if (!ready || !authenticated || !privyUser?.id) return;
    try {
      setUserBalanceLoading(true);
      const res = await apiClient.get("/api/user/balance", {
        headers: { Authorization: `Bearer ${privyUser.id}` },
      });
      setUserBalance(res.data.balanceFormatted || res.data.balance);
    } catch (err) {
      console.error("Error fetching user balance", err);
      setUserBalance(null);
    } finally {
      setUserBalanceLoading(false);
    }
  };

  const verifyAllowance = async (ctx: ShieldContext) => {
    setCheckingAllowance(true);
    try {
      const allowance = await ctx.usdcContract.allowance(
        ctx.userAddress,
        ctx.railgunContractAddress
      );
      const needs = allowance < ctx.totalRequired;
      setNeedsApproval(needs);
      return !needs;
    } finally {
      setCheckingAllowance(false);
    }
  };

  const handleApprove = async () => {
    if (!checkout?.checkoutRailgunAddress) return;

    if (!ready || !authenticated) {
      toast({
        title: "Authentication Required",
        description: "Please connect your wallet to continue",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      await login();
      return;
    }

    try {
      setApproving(true);
      const ctx = await getShieldContext();
      const hasAllowance = await verifyAllowance(ctx);

      if (hasAllowance) {
        toast({
          title: "Already Approved",
          description: "USDC is already approved for Railgun",
          status: "info",
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      toast({
        title: "Approval Required",
        description: "Please confirm the approval transaction in your wallet",
        status: "info",
        duration: 4000,
        isClosable: true,
      });

      const approveTx = await ctx.usdcContract.approve(
        ctx.railgunContractAddress,
        ctx.totalRequired
      );
      await approveTx.wait();
      setNeedsApproval(false);

      toast({
        title: "Approval Successful",
        description: "USDC approved for Railgun shield",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      console.error("Error approving USDC:", error);
      let message = "Approval failed. Please try again.";
      if (error?.code === 4001) {
        message = "Approval transaction was rejected";
      } else if (error?.message) {
        message = error.message;
      }
      toast({
        title: "Approval Error",
        description: message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setApproving(false);
    }
  };

  const handleShieldPayment = async () => {
    if (!checkout?.checkoutRailgunAddress) return;

    if (!ready || !authenticated) {
      toast({
        title: "Authentication Required",
        description: "Please connect your wallet to make a payment",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      await login();
      return;
    }

    try {
      setProcessing(true);

      const ctx = await getShieldContext();
      const hasAllowance = await verifyAllowance(ctx);

      if (!hasAllowance) {
        toast({
          title: "Approval Needed",
          description: "Please approve USDC for Railgun before shielding",
          status: "warning",
          duration: 4000,
          isClosable: true,
        });
        return;
      }

      toast({
        title: "Shielding Payment",
        description: "Sending private payment to checkout address...",
        status: "info",
        duration: 3000,
        isClosable: true,
      });

      const shieldTx = await ctx.signer.sendTransaction({
        ...ctx.shieldTxRequest,
        to: ctx.railgunContractAddress,
        chainId: ctx.config.chainId,
        from: ctx.userAddress,
      });

      toast({
        title: "Shield Transaction Submitted",
        description: "Waiting for confirmation...",
        status: "info",
        duration: 3000,
        isClosable: true,
      });

      const receipt = await shieldTx.wait();
      if (!receipt) {
        throw new Error("Shield transaction confirmation not available");
      }
      const txHash = receipt.hash;

      await apiClient.post(`/api/checkouts/${checkout._id}/shield`, {
        transactionHash: txHash,
        tokenAddress: ctx.tokenAddress,
      });

      toast({
        title: "Shield Successful!",
        description: `Transaction: ${txHash.slice(0, 10)}...${txHash.slice(
          -8
        )}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      await fetchCheckout();

      setTimeout(async () => {
        try {
          await apiClient.post(
            `/api/checkouts/${checkout._id}/transfer-private`
          );
          await fetchCheckout();
        } catch (error) {
          console.error("Error triggering private transfer:", error);
        }
      }, 2000);
    } catch (error: any) {
      console.error("Error processing shield payment:", error);

      let errorMessage = "Shield payment failed. Please try again.";
      if (error.code === 4001) {
        errorMessage = "Transaction was rejected by user";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Shield Payment Failed",
        description: errorMessage,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentInstructions) return;

    // Check if user is authenticated
    if (!ready || !authenticated) {
      toast({
        title: "Authentication Required",
        description: "Please connect your wallet to make a payment",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      await login();
      return;
    }

    try {
      setProcessing(true);

      // Check for Ethereum provider
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error(
          "No Ethereum wallet found. Please install MetaMask or connect a wallet."
        );
      }

      // Request account access if needed
      await ethereum.request({ method: "eth_requestAccounts" });

      const ethersProvider = new ethers.BrowserProvider(ethereum);
      const signer = await ethersProvider.getSigner();
      const userAddress = await signer.getAddress();

      // Get USDC contract
      const usdcContract = new ethers.Contract(
        paymentInstructions.asset,
        ERC20_ABI,
        signer
      );

      // paymentInstructions.amount is already in storage format (6-digit string like "1000000")
      // Convert to BigInt for token transfer (amount is already in smallest unit)
      const amount = BigInt(paymentInstructions.amount);

      // Check balance
      const balance = await usdcContract.balanceOf(userAddress);
      if (balance < amount) {
        throw new Error("Insufficient USDC balance");
      }

      // Send USDC transfer
      const tx = await usdcContract.transfer(paymentInstructions.payTo, amount);

      toast({
        title: "Transaction Submitted",
        description: "Waiting for confirmation...",
        status: "info",
        duration: 3000,
        isClosable: true,
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      const txHash = receipt.hash;

      // Store payment hash and retry fetching checkout
      setPaymentHash(txHash);

      toast({
        title: "Payment Successful!",
        description: `Transaction: ${txHash.slice(0, 10)}...${txHash.slice(
          -8
        )}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      // Retry fetching checkout with payment header
      await fetchCheckout();
    } catch (error: any) {
      console.error("Error processing payment:", error);

      let errorMessage = "Payment failed. Please try again.";
      if (error.code === 4001) {
        errorMessage = "Transaction was rejected by user";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Payment Failed",
        description: errorMessage,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setProcessing(false);
    }
  };

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
    );
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
                  <Text color="gray.500">
                    {paymentInstructions.description}
                  </Text>
                </VStack>

                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold">
                      Payment Required to View Checkout
                    </Text>
                    <Text fontSize="sm" mt={1}>
                      Please complete the payment to access checkout details
                    </Text>
                  </Box>
                </Alert>

                <Box bg="gray.50" borderRadius="lg" p={6}>
                  <VStack spacing={4} align="stretch">
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Text color="gray.600">Amount</Text>
                      <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                        ${fromStorageFormat(paymentInstructions.amount)}{" "}
                        {paymentInstructions.extra.name}
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
                      <Text
                        fontSize="sm"
                        color="gray.600"
                        mb={1}
                        fontWeight="bold"
                      >
                        Recipient: (Railgun private address)
                      </Text>
                      <Code
                        fontSize="xs"
                        p={2}
                        borderRadius="md"
                        display="block"
                        bg="purple.50"
                        color="purple.700"
                      >
                        {paymentInstructions.payTo}
                      </Code>
                      <Text fontSize="xs" color="gray.600" mt={2}>
                        Note: send via the shield flow (Pay Now); MetaMask
                        cannot transfer directly to 0zk addresses.
                      </Text>
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
                  {!ready || !authenticated
                    ? "Connect Wallet to Pay"
                    : "Pay Now"}
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
    );
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
            <Text color="gray.600">{error || "Checkout not found"}</Text>
          </CardBody>
        </Card>
      </Box>
    );
  }

  if (!checkout) {
    return null;
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
                {ready && authenticated && (
                  <Text fontSize="sm" color="gray.600">
                    Balance:{" "}
                    {userBalanceLoading
                      ? "…"
                      : userBalance
                      ? `${userBalance} USDC`
                      : "Unavailable"}
                  </Text>
                )}
              </VStack>

              <Box bg="gray.50" borderRadius="lg" p={6}>
                <VStack spacing={4} align="stretch">
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text color="gray.600">Amount</Text>
                    <Text fontSize="3xl" fontWeight="bold" color="blue.600">
                      ${fromStorageFormat(checkout.amount)}
                    </Text>
                  </Box>
                  <Divider />
                  {checkout.checkoutRailgunAddress && (
                    <Box>
                      <Text
                        fontSize="sm"
                        color="gray.600"
                        mb={1}
                        fontWeight="bold"
                      >
                        🔐 Recipient: Railgun private address (0zk)
                      </Text>
                      <Code
                        fontSize="xs"
                        p={2}
                        borderRadius="md"
                        display="block"
                        bg="purple.50"
                        color="purple.700"
                      >
                        {checkout.checkoutRailgunAddress}
                      </Code>
                      <Alert
                        status="info"
                        borderRadius="md"
                        mt={2}
                        fontSize="xs"
                      >
                        <AlertIcon boxSize="12px" />
                        <Text fontSize="xs">
                          <strong>Note:</strong> You cannot send directly to
                          this address from MetaMask. Click "Pay Privately" to
                          use Railgun's shield function.
                        </Text>
                      </Alert>
                    </Box>
                  )}
                  <Divider />
                  <Box>
                    <Text fontSize="sm" color="gray.500">
                      Status:{" "}
                      <Badge
                        colorScheme={
                          checkout.status === "completed" ? "green" : "yellow"
                        }
                      >
                        {checkout.status}
                      </Badge>
                    </Text>
                    {checkout.shieldTransactionHash && (
                      <Box mt={2}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Shield Transaction
                        </Text>
                        <Code
                          fontSize="xs"
                          p={2}
                          borderRadius="md"
                          display="block"
                        >
                          {checkout.shieldTransactionHash}
                        </Code>
                      </Box>
                    )}
                    {checkout.privateTransferHash && (
                      <Box mt={2}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Private Transfer Hash
                        </Text>
                        <Code
                          fontSize="xs"
                          p={2}
                          borderRadius="md"
                          display="block"
                        >
                          {checkout.privateTransferHash}
                        </Code>
                      </Box>
                    )}
                    {checkout.transactionHash && (
                      <Box mt={2}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Transaction Hash
                        </Text>
                        <Code
                          fontSize="xs"
                          p={2}
                          borderRadius="md"
                          display="block"
                        >
                          {checkout.transactionHash}
                        </Code>
                      </Box>
                    )}
                  </Box>
                </VStack>
              </Box>

              {checkout.status === "completed" ? (
                <Alert status="success" borderRadius="md">
                  <AlertIcon />
                  Payment Completed
                </Alert>
              ) : checkout.checkoutRailgunAddress &&
                !checkout.shieldTransactionHash ? (
                <VStack spacing={3}>
                  <Alert status="info" borderRadius="md">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="bold">Private Payment Available</Text>
                      <Text fontSize="sm" mt={1}>
                        Pay privately using Railgun. Your payment will be
                        shielded and transferred privately to the merchant.
                      </Text>
                    </Box>
                  </Alert>
                  {needsApproval && (
                    <Alert status="warning" borderRadius="md">
                      <AlertIcon />
                      USDC approval is required before shielding.
                    </Alert>
                  )}
                  <Button
                    onClick={handleApprove}
                    isLoading={approving || checkingAllowance}
                    loadingText="Checking approval..."
                    variant="outline"
                    colorScheme="purple"
                    size="lg"
                    w="full"
                    isDisabled={!ready || !authenticated}
                  >
                    {needsApproval
                      ? "Approve USDC for Railgun"
                      : "Check Approval / Approve"}
                  </Button>
                  <Button
                    onClick={handleShieldPayment}
                    isLoading={processing}
                    loadingText="Shielding Payment..."
                    colorScheme="purple"
                    size="lg"
                    w="full"
                    isDisabled={!ready || !authenticated || needsApproval}
                  >
                    {!ready || !authenticated
                      ? "Connect Wallet to Pay Privately"
                      : "Pay Privately with Railgun"}
                  </Button>
                  {(!ready || !authenticated) && (
                    <Button
                      onClick={login}
                      variant="outline"
                      colorScheme="purple"
                      size="md"
                      w="full"
                    >
                      Connect Wallet
                    </Button>
                  )}
                </VStack>
              ) : checkout.shieldTransactionHash &&
                !checkout.privateTransferHash ? (
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  Shield completed. Private transfer to merchant in progress...
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
  );
}

export default CheckoutPage;
