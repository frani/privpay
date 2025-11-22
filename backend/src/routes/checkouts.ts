import express, { Request, Response } from "express";
import Checkout from "../models/Checkout.js";
import User from "../models/User.js";
import { processX402Payment } from "../services/x402Service.js";
import { toStorageFormat } from "../utils.js";
import { 
  generateCheckoutRailgunAddress, 
  executeShield,
  executePrivateTransfer,
  verifyCheckoutPayment
} from "../services/railgunService.js";
import { ethers } from "ethers";

const router = express.Router();

// Middleware to get user from Privy ID
const getUserFromRequest = async (req: Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const privyId = authHeader.replace("Bearer ", "");
  return await User.findOne({ privyId });
};

// POST /checkouts
router.post("/checkouts", async (req: Request, res: Response) => {
  try {
    const { name, amount } = req.body;

    if (!name || amount === undefined || amount === null) {
      return res.status(400).json({ message: "Name and amount are required" });
    }

    if (typeof name !== "string" || name.length > 180) {
      return res.status(400).json({ message: "Name must be a string with less than 180 characters" });
    }

    // Convert amount to number if it's a string, then format as string with 6 decimals (USDC)
    let amountNumber: number;
    if (typeof amount === "string") {
      amountNumber = parseFloat(amount);
    } else if (typeof amount === "number") {
      amountNumber = amount;
    } else {
      return res.status(400).json({ message: "Amount must be a number or string" });
    }

    if (isNaN(amountNumber) || amountNumber < 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    // Format amount as 6-digit string (USDC storage format: 1000000 = 1.00)
    const amountString = toStorageFormat(amountNumber);

    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Crear checkout primero para obtener el ID
    const checkout = new Checkout({
      name,
      amount: amountString,
      userId: user._id,
      status: "pending",
    });

    // Generar dirección 0zk única para este checkout usando el ID
    checkout.checkoutRailgunAddress = generateCheckoutRailgunAddress(
      checkout._id.toString(),
      user._id.toString()
    );

    await checkout.save();

    res.status(201).json({
      _id: checkout._id,
      name: checkout.name,
      amount: checkout.amount,
      status: checkout.status,
      checkoutRailgunAddress: checkout.checkoutRailgunAddress,
      createdAt: checkout.createdAt,
    });
  } catch (error: any) {
    console.error("Create checkout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /checkouts
router.get("/checkouts", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const checkouts = await Checkout.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .select("_id name amount status createdAt");

    res.json(checkouts);
  } catch (error: any) {
    console.error("Get checkouts error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /checkouts/:id - Protected with x402 middleware
// Requires payment to access checkout details (unless already completed)
router.get("/checkouts/:id", async (req: Request, res: Response) => {
  try {
    const checkout = await Checkout.findById(req.params.id);
    if (!checkout) {
      return res.status(404).json({ message: "Checkout not found" });
    }

    // get x-payment header
    const paymentHeader = req.headers["x-payment"];

    // if payment header is not present, return 402
    if (!paymentHeader) {
      // generate payment instructions
      const response = {
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "polygon",
            maxAmountRequired: checkout.amount.toString(),
            resource: `https://${process.env.API_URL}/checkouts/${checkout._id}`,
            amount: checkout.amount.toString(),
            description: `Payment for checkout: ${checkout.name}`,
            mimeType: "application/json",
            outputSchema: null,
            payTo: "0x2306e12F56e45E698bFAfa9c5E7D4e77cDEb4d06",
            maxTimeoutSeconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            extra: {
              name: "USD Coin",
              version: "2",
            },
          },
        ],
        error: "X-PAYMENT header is required",
      };
      return res.status(402).json(response);
    }

    res.json({
      _id: checkout._id,
      name: checkout.name,
      amount: checkout.amount,
      status: checkout.status,
      checkoutRailgunAddress: checkout.checkoutRailgunAddress,
      createdAt: checkout.createdAt,
      transactionHash: checkout.transactionHash,
      shieldTransactionHash: checkout.shieldTransactionHash,
      privateTransferHash: checkout.privateTransferHash,
    });
  } catch (error: any) {
    console.error("Get checkout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /checkouts/:id/shield - Process shield payment to checkout 0zk address
router.post("/checkouts/:id/shield", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { transactionHash, tokenAddress } = req.body;

    const checkout = await Checkout.findById(id);
    if (!checkout) {
      return res.status(404).json({ message: "Checkout not found" });
    }

    if (!checkout.checkoutRailgunAddress) {
      return res.status(400).json({ message: "Checkout does not have a Railgun address" });
    }

    if (!tokenAddress) {
      return res.status(400).json({ message: "tokenAddress is required" });
    }

    // Si se proporciona un transactionHash, significa que el shield ya fue ejecutado
    // por el frontend, solo lo guardamos
    if (transactionHash) {
      checkout.shieldTransactionHash = transactionHash;
      checkout.status = "pending"; // Cambiar a "shielded" cuando se implemente
      await checkout.save();

      // Iniciar proceso de transferencia privada al merchant
      // Esto debería ejecutarse automáticamente después de confirmar el shield
      const user = await User.findById(checkout.userId);
      if (user && user.railgunAddress) {
        // TODO: Ejecutar transferencia privada en background
        // Por ahora, solo guardamos el estado
      }

      return res.json({
        message: "Shield transaction recorded",
        transactionHash,
        checkoutRailgunAddress: checkout.checkoutRailgunAddress,
      });
    }

    // Si no hay transactionHash, el frontend debe ejecutar el shield
    // Retornamos las instrucciones
    res.json({
      message: "Shield required",
      checkoutRailgunAddress: checkout.checkoutRailgunAddress,
      amount: checkout.amount,
      tokenAddress: tokenAddress || process.env.USDC_CONTRACT_ADDRESS,
    });
  } catch (error: any) {
    console.error("Shield processing error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /checkouts/:id/transfer-private - Execute private transfer from checkout to merchant
router.post("/checkouts/:id/transfer-private", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const checkout = await Checkout.findById(id);
    if (!checkout) {
      return res.status(404).json({ message: "Checkout not found" });
    }

    if (!checkout.checkoutRailgunAddress) {
      return res.status(400).json({ message: "Checkout does not have a Railgun address" });
    }

    if (!checkout.shieldTransactionHash) {
      return res.status(400).json({ message: "Shield must be completed first" });
    }

    const user = await User.findById(checkout.userId);
    if (!user || !user.railgunAddress) {
      return res.status(400).json({ message: "Merchant does not have a Railgun address" });
    }

    // Verificar que el pago fue recibido en la dirección del checkout
    const tokenAddress = process.env.USDC_CONTRACT_ADDRESS || "";
    const verification = await verifyCheckoutPayment(checkout, tokenAddress);

    if (!verification.paid) {
      return res.status(400).json({
        message: "Payment not received in checkout address",
        error: verification.error,
      });
    }

    // Ejecutar transferencia privada
    // NOTA: Esto requiere la clave privada del checkout, que debería estar
    // almacenada de forma segura o derivada determinísticamente
    const PRIVATE_KEY = process.env.CHECKOUT_WALLET_PRIVATE_KEY;
    if (!PRIVATE_KEY) {
      return res.status(500).json({
        message: "Checkout wallet private key not configured",
        error: "Private transfer requires wallet configuration"
      });
    }

    const result = await executePrivateTransfer(
      tokenAddress,
      checkout.amount,
      checkout.checkoutRailgunAddress,
      user.railgunAddress,
      PRIVATE_KEY
    );

    if (result.success && result.transactionHash) {
      checkout.privateTransferHash = result.transactionHash;
      checkout.status = "completed";
      await checkout.save();

      return res.json({
        message: "Private transfer completed",
        transactionHash: result.transactionHash,
      });
    } else {
      checkout.status = "failed";
      await checkout.save();

      return res.status(500).json({
        message: "Private transfer failed",
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error("Private transfer error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /checkouts/:id/pay - Process payment with x402 (legacy, mantener para compatibilidad)
router.post("/checkouts/:id/pay", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const checkout = await Checkout.findById(id);
    if (!checkout) {
      return res.status(404).json({ message: "Checkout not found" });
    }

    if (checkout.status === "completed") {
      return res.status(400).json({ message: "Checkout already completed" });
    }

    // Process x402 payment on Polygon
    const result = await processX402Payment(checkout);

    if (result.success) {
      checkout.status = "completed";
      checkout.transactionHash = result.transactionHash;
      await checkout.save();

      res.json({
        message: "Payment processed successfully",
        transactionHash: result.transactionHash,
      });
    } else {
      checkout.status = "failed";
      await checkout.save();

      res.status(500).json({
        message: "Payment processing failed",
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error("Payment processing error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
