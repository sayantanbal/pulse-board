import mongoose, { Schema } from "mongoose";

/**
 * Short-lived mutex rows so two concurrent anonymous submissions with the same
 * dedup key serialize instead of both passing the pre-transaction findOne check.
 * Rows are removed in the same transaction as the response write; TTL cleans
 * up any orphaned claim if a worker crashes mid-transaction.
 */
export type AnonResponseClaimProps = {
  pollId: mongoose.Types.ObjectId;
  dedupKey: string;
  createdAt: Date;
};

const anonResponseClaimSchema = new Schema<AnonResponseClaimProps>(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", required: true },
    dedupKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

anonResponseClaimSchema.index({ pollId: 1, dedupKey: 1 }, { unique: true });
anonResponseClaimSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const AnonResponseClaimModel =
  mongoose.models.AnonResponseClaim ??
  mongoose.model<AnonResponseClaimProps>("AnonResponseClaim", anonResponseClaimSchema);
