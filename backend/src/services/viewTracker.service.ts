import mongoose from "mongoose";
import { PollModel } from "../domain/poll.model.js";
import { runPollStatusCheck } from "../domain/pollStatus.js";
import { ViewHistoryModel } from "../domain/viewHistory.model.js";
import { hashIP } from "../lib/ipHasher.js";
import { maskIpAddress } from "../lib/ipMasker.js";
import { isViewTrackingEnabled } from "../lib/viewTracking.js";
import { detectBot } from "./botDetector.service.js";
import { detectDevice, truncateUserAgent } from "./deviceDetector.service.js";
import { lookup as geolocateIp } from "./ipGeolocator.service.js";

const DB_WRITE_TIMEOUT_MS = 5_000;

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id);
}

async function writeViewRecord(input: {
  pollId: string;
  ipAddress: string;
  userAgent: string;
  respondentId: string | null;
}): Promise<void> {
  let ipHash: string | null = null;
  try {
    ipHash = hashIP(input.ipAddress);
  } catch (err) {
    console.error("IP hashing failed:", {
      pollId: input.pollId,
      maskedIp: maskIpAddress(input.ipAddress),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const geo = await geolocateIp(input.ipAddress);
  const deviceType = detectDevice(input.userAgent);
  const botClassification = detectBot(input.userAgent);
  const userAgent = truncateUserAgent(input.userAgent ?? "");

  const writePromise = ViewHistoryModel.create({
    pollId: new mongoose.Types.ObjectId(input.pollId),
    ipAddress: input.ipAddress,
    ipHash,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    deviceType,
    botClassification,
    userAgent,
    respondentId: input.respondentId
      ? new mongoose.Types.ObjectId(input.respondentId)
      : null,
    viewedAt: new Date(),
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("View history write timed out")),
      DB_WRITE_TIMEOUT_MS,
    );
  });

  await Promise.race([writePromise, timeoutPromise]);
}

export async function recordView(
  pollId: string,
  ipAddress: string,
  userAgent: string,
  respondentId: string | null,
): Promise<void> {
  try {
    if (!isValidObjectId(pollId)) {
      return;
    }

    if (!ipAddress?.trim()) {
      console.error("View tracking skipped: missing IP address", { pollId });
      return;
    }

    const poll = await PollModel.findById(pollId);
    if (!poll || poll.deletedAt) {
      return;
    }

    const nextStatus = runPollStatusCheck(poll);
    if (nextStatus !== poll.status) {
      poll.status = nextStatus;
      await poll.save();
    }

    if (!isViewTrackingEnabled(poll.status)) {
      return;
    }

    await writeViewRecord({
      pollId,
      ipAddress: ipAddress.trim(),
      userAgent: userAgent ?? "",
      respondentId,
    });
  } catch (err) {
    console.error("View tracking failed:", {
      pollId,
      maskedIp: maskIpAddress(ipAddress),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function cascadeDeleteViewHistory(
  pollId: string,
): Promise<void> {
  await ViewHistoryModel.deleteMany({
    pollId: new mongoose.Types.ObjectId(pollId),
  });
}
