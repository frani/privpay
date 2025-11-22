import mongoose, { Document, Schema } from 'mongoose'

export interface ICheckout extends Document {
  name: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  userId: mongoose.Types.ObjectId
  transactionHash?: string
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
      type: Number,
      required: true,
      min: 0,
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
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<ICheckout>('Checkout', CheckoutSchema)

