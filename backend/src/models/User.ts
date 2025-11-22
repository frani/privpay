import mongoose, { Document, Schema } from 'mongoose'

export interface IUser extends Document {
  name: string
  railgunPrivateKey: string
  railgunAddress: string
  email?: string
  walletAddress?: string
  privyId: string
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    railgunPrivateKey: {
      type: String,
      required: true,
    },
    railgunAddress: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      sparse: true,
    },
    walletAddress: {
      type: String,
      sparse: true,
    },
    privyId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IUser>('User', UserSchema)

