

`000014_list_draft_questions` adds `qbank.list_draft_questions`, behind
`GET /v1/questions?status=draft`: the caller's questions whose latest
version is still a draft, for the staff authoring screen.

`000015_question_exports` adds `export_question_version` and the
`question_export_events` log (ADR-0032). It needs a write context on
`qbank.question_exports`, which only college and platform administrators can
obtain, records every export, and returns the version's content with the
storage references of its evaluation and sample bundles. Rollback drops both.

`000016_model_checks` adds model-solution checks (ADR-0033): the
`model_checks` table, `start_model_check` (an author, with a write context on
question versions; the language must be allowed and at most three checks per
version run at once), `list_model_checks` and `finish_model_check` for the
Judge completion worker. Rollback drops them.

`000017_mcq` adds multiple-choice versions (ADR-0035): `kind`, `choices`,
`correct_choices` and `multiple_choice`, `set_question_version_choices`,
publication rules per kind (the language and bundle constraints apply to
coding versions only), and the resolve function's new columns. Rollback
refuses while mcq versions or language-less versions exist.
