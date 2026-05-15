import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

const DEVICE_TYPES = ["mobile", "tablet", "desktop", "unknown"] as const;
const BOT_CLASSIFICATIONS = [
  "human",
  "legitimate_crawler",
  "suspicious_bot",
  "unknown",
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];
export type BotClassification = (typeof BOT_CLASSIFICATIONS)[number];

export type ViewHistoryProps = {
  pollId: Types.ObjectId;
  ipAddress: string;
  ipHash: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: DeviceType;
  botClassification: BotClassification;
  userAgent: string;
  respondentId: Types.ObjectId | null;
  viewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const viewHistorySchema = new Schema<ViewHistoryProps>(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", required: true },
    ipAddress: { type: String, required: true, maxlength: 45 },
    ipHash: { type: String, maxlength: 64, default: null },
    country: { type: String, maxlength: 100, default: null },
    region: { type: String, maxlength: 100, default: null },
    city: { type: String, maxlength: 100, default: null },
    deviceType: { type: String, required: true, enum: DEVICE_TYPES },
    botClassification: {
      type: String,
      required: true,
      enum: BOT_CLASSIFICATIONS,
    },
    userAgent: { type: String, required: true, maxlength: 1000 },
    respondentId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    viewedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

viewHistorySchema.index({ pollId: 1 });
viewHistorySchema.index({ pollId: 1, viewedAt: -1 });
viewHistorySchema.index({ viewedAt: 1 }, { expireAfterSeconds: 7_776_000 });
viewHistorySchema.index({ pollId: 1, respondentId: 1 });

export type ViewHistoryDoc = InferSchemaType<typeof viewHistorySchema> & {
  _id: Types.ObjectId;
};

export const ViewHistoryModel =
  mongoose.models.ViewHistory ??
  mongoose.model<ViewHistoryProps>("ViewHistory", viewHistorySchema);
