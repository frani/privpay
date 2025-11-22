import express, { Request, Response } from "express";
import Checkout from "../models/Checkout.js";
import User from "../models/User.js";
import { processX402Payment } from "../services/x402Service.js";
import { toStorageFormat } from "../utils.js";

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

    const checkout = new Checkout({
      name,
      amount: amountString,
      userId: user._id,
      status: "pending",
    });

    await checkout.save();

    res.status(201).json({
      _id: checkout._id,
      name: checkout.name,
      amount: checkout.amount,
      status: checkout.status,
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
      createdAt: checkout.createdAt,
      transactionHash: checkout.transactionHash,
    });
  } catch (error: any) {
    console.error("Get checkout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /checkouts/:id/verify - Process payment with x402
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
