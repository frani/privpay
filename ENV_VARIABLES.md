# Environment Variables Documentation

This document lists all required environment variables for both frontend and backend.

## Frontend Environment Variables

Create a `.env` file in the `frontend/` directory:

### Required Variables

```env
# Privy App ID - Get this from your Privy dashboard
# https://dashboard.privy.io/
VITE_PRIVY_APP_ID=your-privy-app-id-here

# Backend API URL (optional, defaults to http://localhost:8080)
VITE_API_URL=http://localhost:8080
```

**How to get:**
1. Sign up/login at https://dashboard.privy.io/
2. Create a new app or select an existing one
3. Copy the App ID from the dashboard

---

## Backend Environment Variables

Create a `.env` file in the `backend/` directory:

### Required Variables

```env
# Server port (default: 8080)
PORT=8080

# MongoDB connection string
# Local: mongodb://localhost:27017/privpay
# MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/privpay
MONGODB_URI=mongodb://localhost:27017/privpay

# Polygon RPC URL
# Public: https://polygon-rpc.com
# Alchemy: https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
# Infura: https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID
POLYGON_RPC_URL=https://polygon-rpc.com

# Private key of the wallet that will process payments
# IMPORTANT: Never commit this to version control!
# This wallet should have MATIC/USDC for gas and payments
PAYMENT_WALLET_PRIVATE_KEY=your-private-key-here

# x402 Contract Address on Polygon
# Replace with your actual x402 protocol contract address
X402_CONTRACT_ADDRESS=your-x402-contract-address-here
```

### Optional Variables

```env
# Node environment (development, production, test)
NODE_ENV=development
```

---

## Setup Instructions

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env  # if .env.example exists
   # or create manually
   ```

3. Add your Privy App ID:
   ```env
   VITE_PRIVY_APP_ID=your-actual-privy-app-id
   ```

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create `.env` file:
   ```bash
   # Create .env file manually
   ```

3. Fill in all required variables:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/privpay
   POLYGON_RPC_URL=https://polygon-rpc.com
   PAYMENT_WALLET_PRIVATE_KEY=0x...
   X402_CONTRACT_ADDRESS=0x...
   ```

### MongoDB Setup

**Option 1: Local MongoDB**
- Install MongoDB locally
- Start MongoDB service
- Use: `mongodb://localhost:27017/privpay`

**Option 2: MongoDB Atlas (Cloud)**
- Sign up at https://www.mongodb.com/cloud/atlas
- Create a free cluster
- Get connection string
- Use: `mongodb+srv://username:password@cluster.mongodb.net/privpay`

---

## Security Notes

⚠️ **IMPORTANT:**
- Never commit `.env` files to version control
- `.env` files are already in `.gitignore`
- Keep `PAYMENT_WALLET_PRIVATE_KEY` secure and never share it
- Use environment-specific values (development vs production)
- For production, use secure secret management (AWS Secrets Manager, etc.)

---

## Quick Start Checklist

- [ ] Frontend `.env` created with `VITE_PRIVY_APP_ID`
- [ ] Backend `.env` created with all required variables
- [ ] MongoDB running (local or Atlas connection working)
- [ ] Privy app created and App ID obtained
- [ ] Polygon RPC URL configured
- [ ] Payment wallet private key set (with funds for testing)
- [ ] x402 contract address configured

---

## Testing Environment Variables

### Frontend
```bash
cd frontend
pnpm dev
# Check browser console for any Privy errors
```

### Backend
```bash
cd backend
pnpm dev
# Check terminal for MongoDB connection and server startup
```

