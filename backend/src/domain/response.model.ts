import type { ResponseStatus } from "@pulse-board/shared";
import mongoose, { Schema } from "mongoose";

export type AnswerSub = {
  questionId: mongoose.Types.ObjectId;
  optionId: mongoose.Types.ObjectId;
};

export type ResponseProps = {
  pollId: mongoose.Types.ObjectId;
  respondentId: mongoose.Types.ObjectId | null;
  status: ResponseStatus;
  ipHash: string;
  answers: AnswerSub[];
  createdAt: Date;
};

export type ResponseDoc = mongoose.HydratedDocument<ResponseProps>;

const answerSchema = new Schema<AnswerSub>(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    optionId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const responseSchema = new Schema<ResponseProps>(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", required: true },
    respondentId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      required: true,
      enum: ["partial", "complete"],
    },
    ipHash: { type: String, required: true },
    answers: { type: [answerSchema], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

responseSchema.index({ pollId: 1 });
responseSchema.index({ pollId: 1, ipHash: 1 });
responseSchema.index({ pollId: 1, status: 1 });

export const ResponseModel =
  mongoose.models.Response ??
  mongoose.model<ResponseProps>("Response", responseSchema);
