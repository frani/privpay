import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "react-router-dom";
import apiClient from "../lib/axios";
import { fromStorageFormat } from "../utils.js";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  erc20Abi,
  type Chain,
} from "viem";
import { polygon } from "viem/chains";
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  Spinner,
  VStack,
  HStack,
  Card,
  CardBody,
  Badge,
  useToast,
  Image,
} from "@chakra-ui/react";
import CreateCheckoutModal from "../components/CreateCheckoutModal";
import logo from "../assets/pp.png";

interface Checkout {
  _id: string;
  name: string;
  amount: string; // Stored as 6-digit string (USDC format: 1000000 = 1.00)
  createdAt: string;
  status: string;
}

function Dashboard() {
  const { user, logout } = usePrivy();
  const navigate = useNavigate();
  const toast = useToast();
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  const syncUserWithBackend = useCallback(async () => {
    if (!user?.id) return;

    try {
      await apiClient.post("/api/signin", { privyId: user.id });
    } catch (error: any) {
      if (error.response?.status === 404) {
        try {
          await apiClient.post("/api/signup", {
            privyId: user.id,
            name: user.email?.address || user.wallet?.address || "User",
            email: user.email?.address,
            walletAddress: user.wallet?.address,
          });
        } catch (signupError) {
          console.error("Error signing up:", signupError);
          toast({
            title: "Signup Error",
            description:
              "Failed to create user account. Please ensure Railgun credentials are configured.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
        }
      }
    }
  }, [toast, user]);

  const fetchCheckouts = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await apiClient.get("/api/checkouts", {
        headers: {
          Authorization: `Bearer ${user.id}`,
        },
      });
      setCheckouts(response.data);
    } catch (error) {
      console.error("Error fetching checkouts:", error);
      toast({
        title: "Error",
        description: "Failed to fetch checkouts",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  const fetchBalance = useCallback(async () => {
    if (!user?.id || !user.wallet?.address) {
      setBalanceLoading(false);
      return;
    }

    try {
      setBalanceLoading(true);
      console.log("fetchBalance");

      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        console.warn("No injected wallet found for balance fetch");
        setBalance(null);
        return;
      }

      const expectedChainId = Number(
        import.meta.env.VITE_CHAIN_ID || polygon.id
      );
      const rpcUrl =
        import.meta.env.VITE_POLYGON_RPC_URL || polygon.rpcUrls.default.http[0];
      const blockExplorerUrl =
        import.meta.env.VITE_BLOCK_EXPLORER_URL ||
        polygon.blockExplorers?.default.url ||
        "https://polygonscan.com";
      const chainName = import.meta.env.VITE_CHAIN_NAME || "Polygon";
      const currencyName = import.meta.env.VITE_CHAIN_CURRENCY_NAME || "MATIC";
      const currencySymbol =
        import.meta.env.VITE_CHAIN_CURRENCY_SYMBOL || "MATIC";

      const customChain: Chain = defineChain({
        id: expectedChainId,
        name: chainName,
        nativeCurrency: {
          name: currencyName,
          symbol: currencySymbol,
          decimals: 18,
        },
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
        blockExplorers: {
          default: {
            name: chainName,
            url: blockExplorerUrl,
          },
        },
      });

      const targetChain: Chain =
        expectedChainId === polygon.id ? polygon : customChain;

      const walletClient = createWalletClient({
        chain: targetChain,
        transport: custom(ethereum),
      });

      const [userAddress] = await walletClient.requestAddresses();
      if (!userAddress) {
        setBalance(null);
        setBalanceLoading(false);
        return;
      }
      const chainId = await walletClient.getChainId();
      if (chainId !== expectedChainId) {
        try {
          await walletClient.switchChain({ id: expectedChainId });
          toast({
            title: "Network Switched",
            description: `Wallet switched to chain ID ${expectedChainId}.`,
            status: "success",
            duration: 3000,
            isClosable: true,
          });
        } catch (switchError: any) {
          if (switchError?.code === 4902) {
            try {
              await walletClient.addChain({ chain: targetChain });
              toast({
                title: "Network Added",
                description: `${targetChain.name} network added to your wallet.`,
                status: "success",
                duration: 3000,
                isClosable: true,
              });
            } catch (addError) {
              console.error("Failed to add target network", addError);
              toast({
                title: "Wrong Network",
                description: `Switch your wallet to chain ${expectedChainId} to view balance.`,
                status: "warning",
                duration: 5000,
                isClosable: true,
              });
              setBalance(null);
              setBalanceLoading(false);
              return;
            }
          } else {
            console.error("User rejected network switch", switchError);
            toast({
              title: "Wrong Network",
              description: `Switch your wallet to chain ${expectedChainId} to view balance.`,
              status: "warning",
              duration: 5000,
              isClosable: true,
            });
            setBalance(null);
            setBalanceLoading(false);
            return;
          }
        }
      }

      const tokenAddress =
        (import.meta.env.VITE_USDC_CONTRACT_ADDRESS as `0x${string}`) ||
        ("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const);

      const client = createPublicClient({
        chain: targetChain,
        transport: custom(ethereum),
      });

      const [rawBalance, decimals] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        }),
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);
      console.log("rawBalance :", rawBalance);

      setBalance(formatUnits(rawBalance as bigint, decimals as number));
    } catch (error) {
      console.error("Error fetching balance via wallet:", error);
    } finally {
      setBalanceLoading(false);
    }
  }, [toast, user?.id, user?.wallet?.address]);

  useEffect(() => {
    if (!user?.id) return;
    syncUserWithBackend();
    fetchCheckouts();
    fetchBalance();
  }, [user?.id, syncUserWithBackend, fetchCheckouts, fetchBalance]);

  const handleCreateCheckout = async (name: string, amount: number) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Please sign in to create a checkout",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const response = await apiClient.post(
        "/api/checkouts",
        { name, amount },
        {
          headers: {
            Authorization: `Bearer ${user.id}`,
          },
        }
      );
      setCheckouts([...checkouts, response.data]);
      setIsModalOpen(false);
      toast({
        title: "Success",
        description: "Checkout created successfully",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast({
        title: "Error",
        description: "Failed to create checkout. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const copyCheckoutLink = (id: string) => {
    const link = `${window.location.origin}/checkout/${id}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copied!",
      description: "Checkout link copied to clipboard",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "green";
      case "failed":
        return "red";
      default:
        return "yellow";
    }
  };

  return (
    <Box minH="100vh">
      <Box bg="white" shadow="sm" mb={8}>
        <Container maxW="7xl" py={4}>
          <HStack justify="space-between">
            <HStack spacing={3} onClick={() => navigate("/")} cursor="pointer">
              <Image src={logo} alt="PrivPay" height="40px" />
              <Heading size="lg" color="gray.900">
                PrivPay Dashboard
              </Heading>
            </HStack>
            <HStack spacing={4}>
              <Text fontSize="sm" color="gray.600">
                {user?.email?.address || user?.wallet?.address}
              </Text>
              <Button onClick={handleLogout} colorScheme="red" size="sm">
                Logout
              </Button>
            </HStack>
          </HStack>
        </Container>
      </Box>

      <Container maxW="7xl" py={8}>
        {/* Merchant Balance Panel */}
        <Card mb={6} bg="blue.50" borderColor="blue.200" borderWidth="1px">
          <CardBody>
            <HStack justify="space-between" align="center">
              <VStack align="start" spacing={1}>
                <Text fontSize="sm" color="gray.600" fontWeight="medium">
                  Your Balance
                </Text>
                {balanceLoading ? (
                  <Spinner size="sm" color="blue.500" />
                ) : (
                  <Text fontSize="3xl" fontWeight="bold" color="blue.600">
                    $
                    {balance !== null ? parseFloat(balance).toFixed(2) : "0.00"}{" "}
                    USDC
                  </Text>
                )}
              </VStack>
              <Button
                onClick={fetchBalance}
                size="sm"
                variant="outline"
                colorScheme="blue"
                isLoading={balanceLoading}
              >
                Refresh
              </Button>
            </HStack>
          </CardBody>
        </Card>

        <HStack justify="space-between" mb={6}>
          <Heading size="xl" color="gray.900">
            Your Checkouts
          </Heading>
          <Button
            onClick={() => setIsModalOpen(true)}
            colorScheme="blue"
            size="md"
          >
            Create New Checkout
          </Button>
        </HStack>

        {loading ? (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            py={12}
          >
            <Spinner size="xl" color="blue.500" />
          </Box>
        ) : checkouts.length === 0 ? (
          <Card>
            <CardBody textAlign="center" py={8}>
              <Text color="gray.500" fontSize="lg">
                No checkouts yet. Create your first one!
              </Text>
            </CardBody>
          </Card>
        ) : (
          <VStack spacing={4} align="stretch">
            {checkouts.map((checkout) => (
              <Card
                key={checkout._id}
                _hover={{ shadow: "md" }}
                transition="all 0.2s"
              >
                <CardBody>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={2}>
                      <Heading size="md" color="gray.900">
                        {checkout.name}
                      </Heading>
                      <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                        ${fromStorageFormat(checkout.amount)}
                      </Text>
                      <Text fontSize="sm" color="gray.500">
                        Created:{" "}
                        {new Date(checkout.createdAt).toLocaleDateString()}
                      </Text>
                      <Badge colorScheme={getStatusColor(checkout.status)}>
                        {checkout.status}
                      </Badge>
                    </VStack>
                    <Button
                      onClick={() => copyCheckoutLink(checkout._id)}
                      variant="outline"
                      size="sm"
                    >
                      Copy Link
                    </Button>
                  </HStack>
                </CardBody>
              </Card>
            ))}
          </VStack>
        )}
      </Container>

      {isModalOpen && (
        <CreateCheckoutModal
          onClose={() => setIsModalOpen(false)}
          onCreate={handleCreateCheckout}
        />
      )}
    </Box>
  );
}

export default Dashboard;
