import mongoose, { Schema } from "mongoose";

export type UserDoc = mongoose.HydratedDocument<UserProps>;

export type UserProps = {
  email: string;
  passwordHash: string;
  createdAt: Date;
};

const userSchema = new Schema<UserProps>(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const UserModel =
  mongoose.models.User ?? mongoose.model<UserProps>("User", userSchema);
