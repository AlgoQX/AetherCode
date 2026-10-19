"use client";

import { useActionState, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Field, FormMessage, Select, SubmitButton, TextArea, TextInput, initialActionState, type ActionState } from "@/components/staff/form";
import { cn, languageName } from "@/lib/utils";

/** Judge language keys, as Submission and Judge name them. */
export const LANGUAGES = ["c", "cpp17", "java", "python3", "javascript", "go"];

export function QuestionForm({ action }: { action: (previous: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState(false);
  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" htmlFor="question-title" className="sm:col-span-2">
          <TextInput id="question-title" name="title" required maxLength={300} placeholder="Sum of two numbers" />
        </Field>
        <Field label="Difficulty" htmlFor="question-difficulty">
          <Select id="question-difficulty" name="difficulty" defaultValue="easy">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="question-prompt" className="text-[13px] font-medium text-ink">
            Statement
          </label>
          <div className="flex rounded-[var(--radius-control)] bg-hover p-0.5 text-xs">
            {["Write", "Preview"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setPreview(label === "Preview")}
                className={cn("rounded-[8px] px-2.5 py-1", (label === "Preview") === preview ? "bg-surface font-medium text-ink shadow-[var(--shadow-hairline)]" : "text-ink-muted")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <TextArea
          id="question-prompt"
          name="prompt_markdown"
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={"Read two integers a and b and print their sum.\n\n### Input\nOne line with `a b`.\n\n### Output\nPrint `a + b`."}
          className={cn("min-h-64 font-mono text-[13px]", preview && "hidden")}
        />
        {preview && (
          <div className="min-h-64 rounded-[var(--radius-control)] border border-line bg-surface p-4">
            {prompt ? <Markdown>{prompt}</Markdown> : <p className="text-sm text-ink-muted">Nothing to preview yet.</p>}
          </div>
        )}
        <p className="mt-1.5 text-xs text-ink-muted">Markdown: headings, lists, `code` and fenced code blocks.</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink">Languages students may use</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((language) => (
            <label key={language} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="checkbox" name="languages" value={language} defaultChecked={language === "python3" || language === "c" || language === "cpp17" || language === "java"} className="accent-[var(--brand)]" />
              {languageName(language)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Time limit (seconds)" htmlFor="question-time">
          <TextInput id="question-time" name="time_limit_seconds" type="number" min={0.1} max={60} step={0.1} defaultValue={2} required />
        </Field>
        <Field label="Memory limit (MB)" htmlFor="question-memory">
          <TextInput id="question-memory" name="memory_limit_mb" type="number" min={16} max={2048} defaultValue={256} required />
        </Field>
        <Field label="Slug (optional)" htmlFor="question-slug" hint="A short unique id; made from the title if empty.">
          <TextInput id="question-slug" name="slug" pattern="[a-z0-9-]{3,80}" placeholder="sum-of-two-numbers" />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Create draft</SubmitButton>
    </form>
  );
}
