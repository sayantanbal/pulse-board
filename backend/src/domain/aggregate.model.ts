import mongoose, { Schema } from "mongoose";

export type AggregateProps = {
  pollId: mongoose.Types.ObjectId;
  questionId: mongoose.Types.ObjectId;
  optionId: mongoose.Types.ObjectId;
  count: number;
};

export type AggregateDoc = mongoose.HydratedDocument<AggregateProps>;

const aggregateSchema = new Schema<AggregateProps>(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", required: true },
    questionId: { type: Schema.Types.ObjectId, required: true },
    optionId: { type: Schema.Types.ObjectId, required: true },
    count: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: "aggregates" },
);

aggregateSchema.index({ pollId: 1 });
aggregateSchema.index(
  { pollId: 1, questionId: 1, optionId: 1 },
  { unique: true },
);

export const AggregateModel =
  mongoose.models.Aggregate ??
  mongoose.model<AggregateProps>("Aggregate", aggregateSchema);
