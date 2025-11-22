import mongoose, { Document, Schema } from 'mongoose'

export interface ICheckout extends Document {
  name: string
  amount: string
  status: 'pending' | 'completed' | 'failed'
  userId: mongoose.Types.ObjectId
  transactionHash?: string
  checkoutRailgunAddress?: string // Dirección 0zk única para este checkout
  shieldTransactionHash?: string // Hash de la transacción de shield
  privateTransferHash?: string // Hash de la transferencia privada
  createdAt: Date
  updatedAt: Date
}

const CheckoutSchema = new Schema<ICheckout>(
  {
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    transactionHash: {
      type: String,
    },
    checkoutRailgunAddress: {
      type: String,
    },
    shieldTransactionHash: {
      type: String,
    },
    privateTransferHash: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<ICheckout>('Checkout', CheckoutSchema)

