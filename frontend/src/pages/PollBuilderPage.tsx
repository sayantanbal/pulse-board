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
  pollQuestionInputSchema,
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
} from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  questions: Array<{
    _id?: string;
    prompt: string;
    isRequired: boolean;
    options: Array<{
      _id?: string;
      text: string;
    }>;
  }>;
};

const objectIdRegex = /^[a-f0-9]{24}$/i;

const pollOptionFormSchema = pollOptionInputSchema
  .omit({ order: true })
  .extend({ _id: objectIdStringSchema.optional() });

const pollQuestionFormSchema = pollQuestionInputSchema
  .omit({ order: true, options: true })
  .extend({
    _id: objectIdStringSchema.optional(),
    options: z
      .array(pollOptionFormSchema)
      .min(2, "At least two options are required")
      .max(MAX_OPTIONS_PER_QUESTION),
  });

const pollFormSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  expiresAt: z
    .string()
    .min(1)
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      "Invalid date",
    ),
  responseMode: responseModeSchema,
  allowCreatorResponses: z.boolean(),
  allowResponseChanges: z.boolean(),
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
  return { text };
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
        .map((o) => ({ _id: o._id, text: o.text })),
    }));

  return {
    title: poll.title,
    description: poll.description ?? "",
    expiresAt: toInputDateTime(poll.expiresAt),
    responseMode: poll.responseMode,
    allowCreatorResponses: poll.allowCreatorResponses ?? true,
    allowResponseChanges: poll.allowResponseChanges ?? false,
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
    })),
  }));
}

function buildCreatePayload(
  values: PollFormValues,
  status?: "draft" | "active",
): CreatePollBody {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    description: description.length ? description : undefined,
    expiresAt: new Date(values.expiresAt),
    responseMode: values.responseMode,
    allowCreatorResponses: values.allowCreatorResponses,
    allowResponseChanges: values.allowResponseChanges,
    status,
    questions: buildQuestionPayload(values.questions, false),
  };
}

function buildUpdatePayload(
  values: PollFormValues,
  includeIds: boolean,
  status?: "draft" | "active",
): UpdatePollBody {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    description: description.length ? description : null,
    expiresAt: new Date(values.expiresAt),
    responseMode: values.responseMode,
    allowCreatorResponses: values.allowCreatorResponses,
    allowResponseChanges: values.allowResponseChanges,
    status,
    questions: buildQuestionPayload(values.questions, includeIds),
  };
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
  errors: FieldErrors<PollFormValues>;
  removeQuestion: (index: number) => void;
  disableRemove: boolean;
};

function QuestionFields({
  index,
  control,
  register,
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
          Remove
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
            Add option
          </button>
        </div>

        {optionFields.map((option, optionIndex) => (
          <div key={option.id} className="row">
            <input
              className="input"
              placeholder={`Option ${optionIndex + 1}`}
              {...register(`questions.${index}.options.${optionIndex}.text`)}
            />
            <button
              className="button ghost danger"
              type="button"
              onClick={() => removeOption(optionIndex)}
              disabled={optionFields.length <= 2}
            >
              Remove
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
    formState: { errors, isSubmitting },
  } = useForm<PollFormValues>({
    resolver: zodResolver(pollFormSchema),
    defaultValues: createEmptyPoll(),
  });

  const responseModeValue = watch("responseMode");

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

  const onSave = handleSubmit(async (values) => {
    setError(null);
    setNotice(null);

    try {
      if (isEdit && pollId) {
        const payload = buildUpdatePayload(values, true);
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
          <Link className="button" to="/app/polls">
            Back to polls
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
        <div className="row">
          <Link className="button ghost" to="/app/polls">
            Back to polls
          </Link>
          {pollId && pollStatus !== "draft" ? (
            <Link className="button ghost" to={`/p/${pollId}`}>
              Public link
            </Link>
          ) : null}
          {pollId && pollStatus !== "draft" ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => void handleCopyLink()}
            >
              Copy link
            </button>
          ) : null}
          {pollId && pollStatus !== "draft" ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => void handleShareLink()}
            >
              Share
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
          <div className="grid-2">
            <label className="field">
              <span>Title</span>
              <input className="input" {...register("title")} />
              {errors.title?.message ? (
                <span className="muted">{errors.title.message}</span>
              ) : null}
            </label>
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
          </div>
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
              Add question
            </button>
          </div>

          <div className="stack">
            {questionFields.map((question, index) => (
              <QuestionFields
                key={question.id}
                index={index}
                control={control}
                register={register}
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
            {saving ? "Saving..." : isEdit ? "Save poll" : "Create poll"}
          </button>
          {!isEdit ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => void onSaveDraft()}
              disabled={saving}
            >
              Save draft
            </button>
          ) : null}
          {isEdit && pollStatus === "draft" ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => void onActivate()}
              disabled={saving}
            >
              Activate poll
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
