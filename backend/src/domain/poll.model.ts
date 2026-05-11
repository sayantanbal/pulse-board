import type { PollStatus, ResponseMode } from "@pulse-board/shared";
import mongoose, { Schema } from "mongoose";

export type PollOptionSub = {
  _id: mongoose.Types.ObjectId;
  text: string;
  order: number;
};

export type PollQuestionSub = {
  _id: mongoose.Types.ObjectId;
  prompt: string;
  isRequired: boolean;
  order: number;
  options: PollOptionSub[];
};

export type PollProps = {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  expiresAt: Date;
  responseMode: ResponseMode;
  status: PollStatus;
  allowCreatorResponses: boolean;
  allowResponseChanges: boolean;
  timerSeconds?: number;
  timerMode?: "none" | "attached" | "detached";
  timerStartedAt?: Date;
  questions: PollQuestionSub[];
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PollDoc = mongoose.HydratedDocument<PollProps>;

const optionSchema = new Schema<PollOptionSub>(
  {
    text: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { _id: true },
);

const questionSchema = new Schema<PollQuestionSub>(
  {
    prompt: { type: String, required: true },
    isRequired: { type: Boolean, required: true },
    order: { type: Number, required: true },
    options: { type: [optionSchema], required: true },
  },
  { _id: true },
);

const pollSchema = new Schema<PollProps>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    expiresAt: { type: Date, required: true, index: true },
    responseMode: {
      type: String,
      required: true,
      enum: ["anonymous", "authenticated"],
    },
    status: {
      type: String,
      required: true,
      enum: ["draft", "active", "expired", "published"],
      default: "active",
    },
    allowCreatorResponses: { type: Boolean, required: true, default: true },
    allowResponseChanges: { type: Boolean, required: true, default: false },
    timerSeconds: { type: Number, default: 0 },
    timerMode: { type: String, enum: ["none", "attached", "detached"], default: "none" },
    timerStartedAt: { type: Date, default: null },
    questions: { type: [questionSchema], required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

pollSchema.index({ ownerId: 1, updatedAt: -1 });

export const PollModel =
  mongoose.models.Poll ?? mongoose.model<PollProps>("Poll", pollSchema);
