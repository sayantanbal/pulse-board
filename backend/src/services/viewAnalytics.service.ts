import { ERROR_CODES } from "@pulse-board/shared";
import mongoose from "mongoose";
import { PollModel } from "../domain/poll.model.js";
import {
  ViewHistoryModel,
  type BotClassification,
  type DeviceType,
} from "../domain/viewHistory.model.js";
import { maskIpAddress } from "../lib/ipMasker.js";
import { HttpError } from "../policies/httpError.js";

export type ViewQueryOptions = {
  pollId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  excludeOwner?: boolean;
  ownerId?: string;
};

export type ViewSummaryOptions = {
  pollId: string;
  startDate?: Date;
  endDate?: Date;
  excludeOwner?: boolean;
  ownerId?: string;
};

export type ViewRecord = {
  viewedAt: Date;
  maskedIpAddress: string;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: DeviceType;
  botClassification: BotClassification;
  respondentId?: string;
};

export type ViewSummary = {
  totalViews: number;
  uniqueVisitors: number;
  deviceBreakdown: Record<DeviceType, number>;
  botBreakdown: Record<BotClassification, number>;
  topCountries: Array<{ country: string; count: number }>;
};

function buildDateFilter(
  startDate?: Date,
  endDate?: Date,
): Record<string, unknown> {
  if (!startDate && !endDate) {
    return {};
  }

  const viewedAt: Record<string, Date> = {};
  if (startDate) {
    viewedAt.$gte = startDate;
  }
  if (endDate) {
    viewedAt.$lte = endDate;
  }
  return { viewedAt };
}

function buildOwnerExclusion(
  excludeOwner: boolean | undefined,
  ownerId: string | undefined,
): Record<string, unknown> {
  if (!excludeOwner || !ownerId) {
    return {};
  }
  return {
    respondentId: { $ne: new mongoose.Types.ObjectId(ownerId) },
  };
}

async function assertPollOwner(
  ownerId: string,
  pollId: string,
): Promise<{ ownerId: mongoose.Types.ObjectId }> {
  if (!mongoose.Types.ObjectId.isValid(pollId)) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, "Invalid poll id");
  }

  const poll = await PollModel.findOne({
    _id: pollId,
    ownerId: new mongoose.Types.ObjectId(ownerId),
    deletedAt: null,
  }).select("ownerId");

  if (!poll) {
    const exists = await PollModel.exists({ _id: pollId, deletedAt: null });
    if (!exists) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
    }
    throw new HttpError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
  }

  return { ownerId: poll.ownerId };
}

export { maskIpAddress };

export async function getViews(
  options: ViewQueryOptions,
): Promise<{ views: ViewRecord[]; total: number }> {
  await assertPollOwner(options.ownerId!, options.pollId);

  const pollObjectId = new mongoose.Types.ObjectId(options.pollId);
  const limit = options.limit ?? 100;

  const filter = {
    pollId: pollObjectId,
    ...buildDateFilter(options.startDate, options.endDate),
    ...buildOwnerExclusion(options.excludeOwner, options.ownerId),
  };

  const [docs, total] = await Promise.all([
    ViewHistoryModel.find(filter)
      .sort({ viewedAt: -1 })
      .limit(limit)
      .lean(),
    ViewHistoryModel.countDocuments(filter),
  ]);

  const views: ViewRecord[] = docs.map((doc) => ({
    viewedAt: doc.viewedAt,
    maskedIpAddress: maskIpAddress(doc.ipAddress),
    country: doc.country ?? null,
    region: doc.region ?? null,
    city: doc.city ?? null,
    deviceType: doc.deviceType,
    botClassification: doc.botClassification,
    ...(doc.respondentId
      ? { respondentId: doc.respondentId.toString() }
      : {}),
  }));

  return { views, total };
}

export async function getSummary(
  options: ViewSummaryOptions,
): Promise<ViewSummary> {
  await assertPollOwner(options.ownerId!, options.pollId);

  const pollObjectId = new mongoose.Types.ObjectId(options.pollId);
  const match = {
    pollId: pollObjectId,
    ...buildDateFilter(options.startDate, options.endDate),
    ...buildOwnerExclusion(options.excludeOwner, options.ownerId),
  };

  const [stats] = await ViewHistoryModel.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalViews: { $sum: 1 },
              uniqueVisitors: { $addToSet: "$ipHash" },
            },
          },
        ],
        devices: [{ $group: { _id: "$deviceType", count: { $sum: 1 } } }],
        bots: [{ $group: { _id: "$botClassification", count: { $sum: 1 } } }],
        countries: [
          { $match: { country: { $ne: null } } },
          { $group: { _id: "$country", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  const totals = stats?.totals?.[0];
  const deviceBreakdown: Record<DeviceType, number> = {
    mobile: 0,
    tablet: 0,
    desktop: 0,
    unknown: 0,
  };
  const botBreakdown: Record<BotClassification, number> = {
    human: 0,
    legitimate_crawler: 0,
    suspicious_bot: 0,
    unknown: 0,
  };

  for (const row of stats?.devices ?? []) {
    if (row._id in deviceBreakdown) {
      deviceBreakdown[row._id as DeviceType] = row.count;
    }
  }

  for (const row of stats?.bots ?? []) {
    if (row._id in botBreakdown) {
      botBreakdown[row._id as BotClassification] = row.count;
    }
  }

  const uniqueHashes = totals?.uniqueVisitors ?? [];
  const uniqueVisitors = uniqueHashes.filter(
    (h: string | null) => h != null && h.length > 0,
  ).length;

  return {
    totalViews: totals?.totalViews ?? 0,
    uniqueVisitors,
    deviceBreakdown,
    botBreakdown,
    topCountries: (stats?.countries ?? []).map(
      (row: { _id: string; count: number }) => ({
        country: row._id,
        count: row.count,
      }),
    ),
  };
}
