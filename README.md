# PrivPay Monorepo

A monorepo for PrivPay - a secure payment checkout system with blockchain integration.

## Structure

- **frontend**: React.js application with Chakra UI and Privy authentication
- **backend**: Express.js server with MongoDB and x402 payment integration

## Prerequisites

- Node.js (v18 or higher)
- pnpm (v8 or higher)
- MongoDB (local or cloud instance)

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:

**Frontend** (`frontend/.env`):
```
VITE_PRIVY_APP_ID=your-privy-app-id-here
```

**Backend** (`backend/.env`):
```
PORT=8080
MONGODB_URI=mongodb://localhost:27017/privpay
POLYGON_RPC_URL=https://polygon-rpc.com
PAYMENT_WALLET_PRIVATE_KEY=your-private-key-here
X402_CONTRACT_ADDRESS=your-x402-contract-address-here
```

3. Make sure MongoDB is running

## Running the Application

### Development Mode

Run both frontend and backend:
```bash
pnpm dev
```

Or run them separately:
```bash
# Frontend only
pnpm dev:frontend

# Backend only
pnpm dev:backend
```

### Production Build

```bash
pnpm build
```

## Features

### Frontend Routes

- `/` - Landing page with Privy signin/signup
- `/dashboard` - Private dashboard to view and create checkouts
- `/checkout/:id` - Public checkout page for payment execution

### Backend API Routes

- `POST /api/signin` - Sign in with Privy ID
- `POST /api/signup` - Sign up with Privy ID
- `POST /api/checkouts` - Create a new checkout (requires auth)
- `GET /api/checkouts` - Get list of user's checkouts (requires auth)
- `GET /api/checkouts/:id` - Get checkout details (public)
- `POST /api/checkouts/:id/pay` - Process payment with x402 (public)

## Technologies

- **Frontend**: React, TypeScript, Vite, Chakra UI, Privy, React Router
- **Backend**: Express, TypeScript, MongoDB, Mongoose, Ethers.js
- **Package Manager**: pnpm
- **Database**: MongoDB

## Notes

- The x402 payment integration is currently a placeholder. You'll need to implement the actual contract interactions based on your x402 protocol setup.
- Make sure to configure your Privy app ID in the frontend environment variables.
- The backend uses Privy ID for authentication (passed in Authorization header as Bearer token).
- User signup requires Railgun credentials (name, railgunPrivateKey, railgunAddress). You'll need to integrate Railgun SDK to generate these.
- See `ENV_VARIABLES.md` for detailed environment variable setup instructions.

