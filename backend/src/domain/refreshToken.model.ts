import mongoose, { Schema } from "mongoose";

export type RefreshTokenProps = {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  replacedBy: mongoose.Types.ObjectId | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

export type RefreshTokenDoc = mongoose.HydratedDocument<RefreshTokenProps>;

const refreshTokenSchema = new Schema<RefreshTokenProps>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    replacedBy: { type: Schema.Types.ObjectId, ref: "RefreshToken", default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 });

export const RefreshTokenModel =
  mongoose.models.RefreshToken ??
  mongoose.model<RefreshTokenProps>("RefreshToken", refreshTokenSchema);
