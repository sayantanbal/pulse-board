import type {
  CreatePollBody,
  PollWire,
  ResponseMode,
  UpdatePollBody,
} from "@pulse-board/shared";
import {
  MAX_OPTIONS_PER_QUESTION,
  createPollBodySchema,
  objectIdStringSchema,
  pollOptionInputSchema,
  responseModeSchema,
  updatePollBodySchema,
} from "@pulse-board/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import {
  useFieldArray,
  useForm,
  type FieldErrors,
  type Control,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  FileText,
  Link2,
  Play,
  Plus,
  Radio,
  Save,
  Share2,
  Trash2,
} from "lucide-react";
import { z } from "zod";
import { apiClient } from "../data/api/client";
import { usePollLinks } from "../data/usePollLinks";

type PollFormValues = {
  title: string;
  description: string;
  expiresAt: string;
  responseMode: ResponseMode;
  allowCreatorResponses: boolean;
  allowResponseChanges: boolean;
  timerSeconds: number;
  timerMode: "none" | "attached" | "detached";
  questions: Array<{
    _id?: string;
    prompt: string;
    isRequired: boolean;
    options: Array<{
      _id?: string;
      text: string;
      isCorrect?: boolean;
    }>;
  }>;
};

type DirtyFields = Partial<Record<keyof PollFormValues, unknown>>;

const objectIdRegex = /^[a-f0-9]{24}$/i;

const pollOptionFormSchema = pollOptionInputSchema
  .omit({ order: true })
  .extend({ _id: objectIdStringSchema.optional() });

const pollQuestionFormSchema = z
  .object({
    _id: objectIdStringSchema.optional(),
    prompt: z.string().min(1).max(2000),
    isRequired: z.boolean(),
    options: z
      .array(pollOptionFormSchema)
      .min(2, "At least two options are required")
      .max(MAX_OPTIONS_PER_QUESTION),
  })
  .superRefine((q, ctx) => {
    const marked = q.options.filter((o) => o.isCorrect === true);
    if (marked.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most one option can be marked correct per question",
        path: ["options"],
      });
    }
  });

const pollFormSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  expiresAt: z
    .string()
    .refine(
      (value) => value === "" || !Number.isNaN(new Date(value).getTime()),
      "Invalid date",
    ),
  responseMode: responseModeSchema,
  allowCreatorResponses: z.boolean(),
  allowResponseChanges: z.boolean(),
  timerSeconds: z.coerce.number().min(0).max(3600).default(0),
  timerMode: z.enum(["none", "attached", "detached"]).default("none"),
  questions: z.array(pollQuestionFormSchema).min(1),
});

function toInputDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function createOption(text = "") {
  return { text, isCorrect: false };
}

function createQuestion() {
  return {
    prompt: "",
    isRequired: true,
    options: [createOption(""), createOption("")],
  };
}

function createEmptyPoll(): PollFormValues {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return {
    title: "",
    description: "",
    expiresAt: toInputDateTime(expires),
    responseMode: "anonymous",
    allowCreatorResponses: true,
    allowResponseChanges: false,
    timerSeconds: 0,
    timerMode: "none",
    questions: [createQuestion()],
  };
}

function toFormValues(poll: PollWire): PollFormValues {
  const questions = [...poll.questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      _id: q._id,
      prompt: q.prompt,
      isRequired: q.isRequired,
      options: [...q.options]
        .sort((a, b) => a.order - b.order)
        .map((o) => ({
          _id: o._id,
          text: o.text,
          isCorrect: o.isCorrect === true,
        })),
    }));

  return {
    title: poll.title,
    description: poll.description ?? "",
    expiresAt: toInputDateTime(poll.expiresAt),
    responseMode: poll.responseMode,
    allowCreatorResponses: poll.allowCreatorResponses ?? true,
    allowResponseChanges: poll.allowResponseChanges ?? false,
    timerSeconds: poll.timerSeconds ?? 0,
    timerMode: (poll.timerMode as "none" | "attached" | "detached") ?? "none",
    questions: questions.length ? questions : [createQuestion()],
  };
}

function buildQuestionPayload(
  questions: PollFormValues["questions"],
  includeIds: boolean,
): CreatePollBody["questions"] {
  return questions.map((q, qIndex) => ({
    ...(includeIds && q._id ? { _id: q._id } : {}),
    prompt: q.prompt.trim(),
    isRequired: q.isRequired,
    order: qIndex,
    options: q.options.map((o, oIndex) => ({
      ...(includeIds && o._id ? { _id: o._id } : {}),
      text: o.text.trim(),
      order: oIndex,
      isCorrect: o.isCorrect === true,
    })),
  }));
}

function buildCreatePayload(
  values: PollFormValues,
  status?: "draft" | "active",
): CreatePollBody {
  const description = values.description.trim();
  const mode = values.timerMode;
  const secs = values.timerSeconds;
  // Attached mode: expiry is computed server-side, send a placeholder far future date
  const expiresAt =
    mode === "attached" && secs > 0
      ? new Date(Date.now() + secs * 1000 + 5000) // server will override
      : new Date(values.expiresAt);
  return {
    title: values.title.trim(),
    description: description.length ? description : undefined,
    expiresAt,
    responseMode: values.responseMode,
    allowCreatorResponses: values.allowCreatorResponses,
    allowResponseChanges: values.allowResponseChanges,
    ...(secs > 0 ? { timerSeconds: secs } : {}),
    timerMode: mode,
    status,
    questions: buildQuestionPayload(values.questions, false),
  } as CreatePollBody;
}

function buildUpdatePayload(
  values: PollFormValues,
  includeIds: boolean,
  status?: "draft" | "active",
): UpdatePollBody {
  const description = values.description.trim();
  const mode = values.timerMode;
  const secs = values.timerSeconds;
  const expiresAt =
    mode === "attached" && secs > 0
      ? undefined // server controls expiry in attached mode
      : new Date(values.expiresAt);
  return {
    title: values.title.trim(),
    description: description.length ? description : null,
    ...(expiresAt ? { expiresAt } : {}),
    responseMode: values.responseMode,
    allowCreatorResponses: values.allowCreatorResponses,
    allowResponseChanges: values.allowResponseChanges,
    ...(secs > 0 ? { timerSeconds: secs } : { timerSeconds: 0 }),
    timerMode: mode,
    status,
    questions: buildQuestionPayload(values.questions, includeIds),
  } as UpdatePollBody;
}

function isFieldDirty(field: unknown): boolean {
  if (field === true) {
    return true;
  }
  if (!field) {
    return false;
  }
  if (Array.isArray(field)) {
    return field.some(isFieldDirty);
  }
  if (typeof field === "object") {
    return Object.values(field as Record<string, unknown>).some(isFieldDirty);
  }
  return false;
}

function buildDirtyUpdatePayload(
  values: PollFormValues,
  dirtyFields: DirtyFields,
): UpdatePollBody {
  const payload: UpdatePollBody = {};
  const description = values.description.trim();
  const mode = values.timerMode;
  const secs = values.timerSeconds;

  if (isFieldDirty(dirtyFields.title)) {
    payload.title = values.title.trim();
  }
  if (isFieldDirty(dirtyFields.description)) {
    payload.description = description.length ? description : null;
  }
  if (isFieldDirty(dirtyFields.responseMode)) {
    payload.responseMode = values.responseMode;
  }
  if (isFieldDirty(dirtyFields.allowCreatorResponses)) {
    payload.allowCreatorResponses = values.allowCreatorResponses;
  }
  if (isFieldDirty(dirtyFields.allowResponseChanges)) {
    payload.allowResponseChanges = values.allowResponseChanges;
  }
  if (isFieldDirty(dirtyFields.timerSeconds)) {
    payload.timerSeconds = secs;
  }
  if (isFieldDirty(dirtyFields.timerMode)) {
    payload.timerMode = mode;
  }
  if (isFieldDirty(dirtyFields.expiresAt)) {
    if (!(mode === "attached" && secs > 0)) {
      payload.expiresAt = new Date(values.expiresAt);
    }
  }
  if (isFieldDirty(dirtyFields.questions)) {
    payload.questions = buildQuestionPayload(values.questions, true);
  }

  return payload;
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

type QuestionFieldsProps = {
  index: number;
  control: Control<PollFormValues>;
  register: ReturnType<typeof useForm<PollFormValues>>["register"];
  watch: UseFormWatch<PollFormValues>;
  setValue: UseFormSetValue<PollFormValues>;
  errors: FieldErrors<PollFormValues>;
  removeQuestion: (index: number) => void;
  disableRemove: boolean;
};

function QuestionFields({
  index,
  control,
  register,
  watch,
  setValue,
  errors,
  removeQuestion,
  disableRemove,
}: QuestionFieldsProps) {
  const {
    fields: optionFields,
    append: appendOption,
    remove: removeOption,
  } = useFieldArray({
    control,
    name: `questions.${index}.options` as const,
  });

  const questionErrors = errors.questions?.[index];

  return (
    <div className="poll-card stack">
      <div className="split">
        <strong>Question {index + 1}</strong>
        <button
          className="button ghost danger"
          type="button"
          onClick={() => removeQuestion(index)}
          disabled={disableRemove}
        >
          <span className="button-content">
            <Trash2 size={16} />
            Remove
          </span>
        </button>
      </div>

      <label className="field">
        <span>Prompt</span>
        <input className="input" {...register(`questions.${index}.prompt`)} />
        {questionErrors?.prompt?.message ? (
          <span className="muted">{questionErrors.prompt.message}</span>
        ) : null}
      </label>

      <label className="row">
        <input type="checkbox" {...register(`questions.${index}.isRequired`)} />
        <span>Required</span>
      </label>

      <div className="stack">
        <div className="split">
          <span className="muted">Options</span>
          <button
            className="button ghost"
            type="button"
            onClick={() => appendOption(createOption(""))}
            disabled={optionFields.length >= MAX_OPTIONS_PER_QUESTION}
          >
            <span className="button-content">
              <Plus size={16} />
              Add option
            </span>
          </button>
        </div>

        {optionFields.map((option, optionIndex) => (
          <div key={option.id} className="row" style={{ alignItems: "center" }}>
            <input
              className="input"
              placeholder={`Option ${optionIndex + 1}`}
              {...register(`questions.${index}.options.${optionIndex}.text`)}
            />
            <label
              className="row"
              style={{ flexShrink: 0, gap: "0.35rem", whiteSpace: "nowrap" }}
            >
              <input
                type="radio"
                name={`correct-q-${index}`}
                checked={
                  watch(`questions.${index}.options.${optionIndex}.isCorrect`) ===
                  true
                }
                onChange={() => {
                  optionFields.forEach((_, oi) => {
                    setValue(
                      `questions.${index}.options.${oi}.isCorrect`,
                      oi === optionIndex,
                      { shouldDirty: true },
                    );
                  });
                }}
              />
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Correct
              </span>
            </label>
            <button
              className="button ghost danger"
              type="button"
              onClick={() => removeOption(optionIndex)}
              disabled={optionFields.length <= 2}
            >
              <span className="button-content">
                <Trash2 size={16} />
                Remove
              </span>
            </button>
          </div>
        ))}
        {questionErrors?.options?.message ? (
          <span className="muted">{questionErrors.options.message}</span>
        ) : null}
      </div>
    </div>
  );
}

export function PollBuilderPage() {
  const { id } = useParams();
  const pollId = typeof id === "string" && objectIdRegex.test(id) ? id : null;
  const isEdit = Boolean(pollId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<PollWire["status"] | null>(
    isEdit ? null : "active",
  );
  const {
    notice: linkNotice,
    error: linkError,
    handleCopyLink: _handleCopyLink,
    handleShareLink: _handleShareLink,
  } = usePollLinks();
  const handleCopyLink = () => _handleCopyLink(pollId ?? "");
  const handleShareLink = () => _handleShareLink(pollId ?? "");

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<PollFormValues>({
    resolver: zodResolver(pollFormSchema),
    defaultValues: createEmptyPoll(),
  });

  const responseModeValue = watch("responseMode");
  const timerSecondsValue = watch("timerSeconds");
  const timerModeValue = watch("timerMode");

  const {
    fields: questionFields,
    append: appendQuestion,
    remove: removeQuestion,
  } = useFieldArray({
    control,
    name: "questions",
  });

  const pollQuery = useQuery({
    queryKey: ["poll", pollId],
    enabled: isEdit && Boolean(pollId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ poll: PollWire }>(
        `/polls/${pollId}`,
      );
      return data.poll;
    },
  });

  useEffect(() => {
    if (pollQuery.data) {
      reset(toFormValues(pollQuery.data));
      setPollStatus(pollQuery.data.status);
    }
  }, [pollQuery.data, reset]);

  const createMutation = useMutation({
    mutationFn: async (payload: CreatePollBody) => {
      const { data } = await apiClient.post<{ poll: PollWire }>(
        "/polls",
        payload,
      );
      return data.poll;
    },
    onSuccess: (poll) => {
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      navigate(`/app/polls/${poll._id}/edit`, { replace: true });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdatePollBody) => {
      if (!pollId) {
        throw new Error("Missing poll id");
      }
      const { data } = await apiClient.patch<{ poll: PollWire }>(
        `/polls/${pollId}`,
        payload,
      );
      return data.poll;
    },
    onSuccess: (poll) => {
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      queryClient.invalidateQueries({ queryKey: ["poll", pollId] });
      setPollStatus(poll.status);
      setNotice("Poll saved.");
    },
  });

  const loading = isEdit && pollQuery.isLoading;
  const loadError = pollQuery.isError
    ? formatErrorMessage(pollQuery.error, "Failed to load poll")
    : null;

  const questionCount = useMemo(
    () => questionFields.length,
    [questionFields.length],
  );

  const saving =
    isSubmitting || createMutation.isPending || updateMutation.isPending;
  const PrimaryActionIcon = isEdit ? Save : Plus;

  const onSave = handleSubmit(async (values) => {
    setError(null);
    setNotice(null);

    try {
      if (isEdit && pollId) {
        const payload = buildDirtyUpdatePayload(values, dirtyFields);
        if (Object.keys(payload).length === 0) {
          setNotice("No changes to save.");
          return;
        }
        const validation = updatePollBodySchema.safeParse(payload);
        if (!validation.success) {
          setError(validation.error.issues[0]?.message ?? "Validation failed.");
          return;
        }
        await updateMutation.mutateAsync(payload);
      } else {
        const payload = buildCreatePayload(values, "active");
        const validation = createPollBodySchema.safeParse(payload);
        if (!validation.success) {
          setError(validation.error.issues[0]?.message ?? "Validation failed.");
          return;
        }
        await createMutation.mutateAsync(payload);
      }
    } catch (err) {
      setError(formatErrorMessage(err, "Unable to save poll"));
    }
  });

  const onSaveDraft = handleSubmit(async (values) => {
    setError(null);
    setNotice(null);

    try {
      const payload = buildCreatePayload(values, "draft");
      const validation = createPollBodySchema.safeParse(payload);
      if (!validation.success) {
        setError(validation.error.issues[0]?.message ?? "Validation failed.");
        return;
      }
      await createMutation.mutateAsync(payload);
    } catch (err) {
      setError(formatErrorMessage(err, "Unable to save draft"));
    }
  });

  const onActivate = handleSubmit(async (values) => {
    setError(null);
    setNotice(null);

    try {
      const payload = buildUpdatePayload(values, true, "active");
      const validation = updatePollBodySchema.safeParse(payload);
      if (!validation.success) {
        setError(validation.error.issues[0]?.message ?? "Validation failed.");
        return;
      }
      await updateMutation.mutateAsync(payload);
    } catch (err) {
      setError(formatErrorMessage(err, "Unable to activate poll"));
    }
  });

  if (!isEdit && id) {
    return (
      <main className="page stack">
        <h1 className="title">Poll builder</h1>
        <div className="card stack">
          <p className="muted">That link does not look like a valid poll id.</p>
          <Link className="button ghost" to="/app/polls">
            <span className="button-content">
              <ArrowLeft size={16} />
              Back to polls
            </span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page stack">
      <header className="split">
        <div className="stack" style={{ gap: "0.4rem" }}>
          <h1 className="title">{isEdit ? "Edit poll" : "Create poll"}</h1>
          <p className="subtitle">
            {isEdit
              ? "Update your poll details and questions."
              : "Draft the poll questions before you share it."}
          </p>
          {pollStatus ? (
            <span className="pill">Status: {pollStatus}</span>
          ) : null}
        </div>
        <div className="nav-actions">
          <Link className="button ghost" to="/app/polls">
            <span className="button-content">
              <ArrowLeft size={16} />
              Back to polls
            </span>
          </Link>
          {pollId && pollStatus !== "draft" ? (
            <Link className="button ghost" to={`/p/${pollId}`}>
              <span className="button-content">
                <Link2 size={16} />
                Public link
              </span>
            </Link>
          ) : null}
          {pollId && pollStatus !== "draft" ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => void handleCopyLink()}
            >
              <span className="button-content">
                <Copy size={16} />
                Copy link
              </span>
            </button>
          ) : null}
          {pollId && pollStatus !== "draft" ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => void handleShareLink()}
            >
              <span className="button-content">
                <Share2 size={16} />
                Share
              </span>
            </button>
          ) : null}
        </div>
      </header>

      {loading ? <div className="card">Loading poll...</div> : null}
      {loadError ? <div className="card muted">{loadError}</div> : null}
      {error ? <div className="card muted">{error}</div> : null}
      {notice ? <div className="card">{notice}</div> : null}
      {linkError ? <div className="card muted">{linkError}</div> : null}
      {linkNotice ? <div className="card">{linkNotice}</div> : null}

      {!loading ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Poll details</h2>
          <label className="field">
            <span>Title</span>
            <input className="input" {...register("title")} />
            {errors.title?.message ? (
              <span className="muted">{errors.title.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Description</span>
            <textarea className="input" rows={3} {...register("description")} />
            {errors.description?.message ? (
              <span className="muted">{errors.description.message}</span>
            ) : null}
          </label>
          <label className="field">
            <span>Response mode</span>
            <select className="input" {...register("responseMode")}>
              <option value="anonymous">Anonymous</option>
              <option value="authenticated">Authenticated</option>
            </select>
          </label>

          {/* ── Timer ──────────────────────────────────────────────────── */}
          {timerSecondsValue > 0 ? (
            <div className="field">
              <label className="field">
                <span>⏱ Timer mode</span>
                <select className="input" {...register("timerMode")}>
                  <option value="none">No timer behaviour</option>
                  <option value="attached">
                    Attached — expiry locked to now + timer
                  </option>
                  <option value="detached">
                    Detached — auto-submit user answers when timer ends
                  </option>
                </select>
              </label>
              {timerModeValue === "attached" && (
                <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                  ⚠️ Expiry will be set to{" "}
                  <strong>now + {timerSecondsValue}s</strong> when the poll
                  activates. You cannot change it afterwards.
                </p>
              )}
              {timerModeValue === "detached" && (
                <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                  Respondents' current answers will be auto-submitted when the
                  timer reaches 0, even if incomplete. Poll stays open until its
                  expiry.
                </p>
              )}
            </div>
          ) : null}

          <div className="field">
            <label className="field">
              <span
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span>⏱ Timer (seconds)</span>
                <span
                  className="muted"
                  style={{ fontSize: "0.8rem", fontWeight: 400 }}
                >
                  0 = no timer
                </span>
              </span>
              <input
                className="input"
                type="number"
                min={0}
                max={3600}
                step={5}
                placeholder="e.g. 30"
                {...register("timerSeconds", { valueAsNumber: true })}
              />
              {errors.timerSeconds?.message ? (
                <span className="muted">{errors.timerSeconds.message}</span>
              ) : null}
            </label>
            <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Common: 30s, 60s, 90s. Set 0 to disable.
            </p>
          </div>

          {/* Expiry — hidden when attached (server computes it) */}
          {timerModeValue !== "attached" ? (
            <label className="field">
              <span>Expiry</span>
              <input
                className="input"
                type="datetime-local"
                {...register("expiresAt")}
              />
              {errors.expiresAt?.message ? (
                <span className="muted">{errors.expiresAt.message}</span>
              ) : null}
            </label>
          ) : (
            <div
              className="poll-card"
              style={{ fontSize: "0.85rem", color: "#475569" }}
            >
              🔒 Expiry auto-set to <strong>now + {timerSecondsValue}s</strong>{" "}
              on activation
            </div>
          )}

          <div className="grid-2">
            {responseModeValue === "authenticated" ? (
              <label className="row">
                <input type="checkbox" {...register("allowCreatorResponses")} />
                <span>Allow creator responses</span>
              </label>
            ) : null}
            <label className="row">
              <input type="checkbox" {...register("allowResponseChanges")} />
              <span>Allow response changes</span>
            </label>
          </div>
        </section>
      ) : null}

      {!loading ? (
        <section className="card stack">
          <div className="split">
            <h2 style={{ margin: 0 }}>Questions ({questionCount})</h2>
            <button
              className="button ghost"
              type="button"
              onClick={() => appendQuestion(createQuestion())}
            >
              <span className="button-content">
                <Plus size={16} />
                Add question
              </span>
            </button>
          </div>

          <div className="stack">
            {questionFields.map((question, index) => (
              <QuestionFields
                key={question.id}
                index={index}
                control={control}
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                removeQuestion={removeQuestion}
                disableRemove={questionFields.length <= 1}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loading ? (
        <div className="row">
          <button
            className="button"
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
          >
            <span className="button-content">
              <PrimaryActionIcon size={16} />
              {saving ? "Saving..." : isEdit ? "Save poll" : "Create poll"}
            </span>
          </button>
          {!isEdit ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => void onSaveDraft()}
              disabled={saving}
            >
              <span className="button-content">
                <FileText size={16} />
                Save draft
              </span>
            </button>
          ) : null}
          {isEdit && pollStatus === "draft" ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => void onActivate()}
              disabled={saving}
            >
              <span className="button-content">
                <Play size={16} />
                Activate poll
              </span>
            </button>
          ) : null}
          {isEdit && pollId && pollStatus === "active" ? (
            <Link className="button live" to={`/app/polls/${pollId}/live`}>
              <span className="button-content">
                <Radio size={16} />
                Go Live
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
