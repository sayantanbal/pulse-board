import { createPollBodySchema, pollIdParamsSchema, updatePollBodySchema } from "@pulse-board/shared";
import { Router } from "express";
import { requireAuth } from "../policies/requireAuth.js";
import { validateBody } from "../policies/validateBody.js";
import { validateParams } from "../policies/validateParams.js";
import {
  createPoll,
  deleteOwnerPoll,
  getOwnerPollById,
  getOwnerPolls,
  publishOwnerPoll,
  updateOwnerPoll,
} from "../services/poll.service.js";

export const pollRouter = Router();

pollRouter.use(requireAuth);

function getPollIdParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

pollRouter.post("/", validateBody(createPollBodySchema), async (req, res, next) => {
  try {
    const poll = await createPoll(req.user!.id, req.body);
    res.status(201).json({ poll });
  } catch (e) {
    next(e);
  }
});

pollRouter.get("/", async (req, res, next) => {
  try {
    const polls = await getOwnerPolls(req.user!.id);
    res.status(200).json({ polls });
  } catch (e) {
    next(e);
  }
});

pollRouter.get("/:id", validateParams(pollIdParamsSchema), async (req, res, next) => {
  try {
    const pollId = getPollIdParam(req.params.id);
    const poll = await getOwnerPollById(req.user!.id, pollId);
    res.status(200).json({ poll });
  } catch (e) {
    next(e);
  }
});

pollRouter.patch(
  "/:id",
  validateParams(pollIdParamsSchema),
  validateBody(updatePollBodySchema),
  async (req, res, next) => {
    try {
      const pollId = getPollIdParam(req.params.id);
      const poll = await updateOwnerPoll(req.user!.id, pollId, req.body);
      res.status(200).json({ poll });
    } catch (e) {
      next(e);
    }
  },
);

pollRouter.delete("/:id", validateParams(pollIdParamsSchema), async (req, res, next) => {
  try {
    const pollId = getPollIdParam(req.params.id);
    await deleteOwnerPoll(req.user!.id, pollId);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

pollRouter.patch(
  "/:id/publish",
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const pollId = getPollIdParam(req.params.id);
      const poll = await publishOwnerPoll(req.user!.id, pollId);
      res.status(200).json({ poll });
    } catch (e) {
      next(e);
    }
  },
);
