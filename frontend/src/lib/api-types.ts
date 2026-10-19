// Response shapes of the platform endpoints the frontend uses. The services'
// api/openapi.yaml files are the source of truth.

export type Problem = { code: string; message: string };

export type Page<T> = { items: T[]; next_cursor?: string };

export type RoleName =
  | "super_admin"
  | "placement_user"
  | "college_admin"
  | "department_user"
  | "mentor"
  | "student";

/** GET /user/v1/me */
export type Me = {
  principal_id: string;
  roles: {
    role_name: RoleName;
    scope_kind: string;
    tenant_id?: string;
    scope_id?: string;
  }[];
  student: { tenant_id: string } | null;
};

/** GET /identity/v1/principals/{self} */
export type Principal = {
  id: string;
  username?: string;
  email?: string;
  display_name: string;
};

/** GET /assessment/v1/tenants/{t}/candidate-assignments */
export type CandidateAssignment = {
  id: string;
  tenant_id: string;
  exam_id: string;
  exam_version_id: string;
  title: string;
  instructions_markdown: string;
  duration_seconds: number;
  available_from: string;
  available_until: string;
  lifecycle_state: "assigned" | "revoked" | "started" | "completed" | "expired";
};

export type AttemptState = "created" | "active" | "submitted" | "grading" | "graded" | "expired" | "cancelled";

/** GET /submission/v1/tenants/{t}/attempts/{id} */
export type Attempt = {
  id: string;
  tenant_id: string;
  exam_id: string;
  exam_version_id: string;
  candidate_assignment_id: string;
  attempt_number: number;
  lifecycle_state: AttemptState;
  submission_deadline: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  version: number;
};

/** GET /submission/v1/tenants/{t}/attempts/{id}/paper */
export type Paper = {
  attempt_id: string;
  exam_id: string;
  title: string;
  instructions_markdown: string;
  items: PaperItem[];
};

export type PaperItem = {
  exam_item_id: string;
  position: number;
  title: string;
  prompt_markdown: string;
  maximum_score: string;
  supported_languages: string[];
  time_limit_ms: number;
  memory_limit_kib: number;
  /** The candidate's latest saved answer, so a reload or a crashed browser resumes where it left off. */
  latest_answer: { language: string; source: string; revision_number: number } | null;
};

/** PUT .../answers/{item}: one saved answer revision (metadata only). */
export type AnswerRevision = {
  id: string;
  exam_item_id: string;
  revision_number: number;
  language_id: string;
  created_at: string;
  attempt_version: number;
};

export type RunUnit = {
  unit_number: number;
  verdict: string;
  stdin: string | null;
  expected_output: string | null;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  execution_time_ms: number | null;
  memory_kib: number | null;
};

export type CodeRun = {
  id: string;
  exam_item_id: string;
  language_id: string;
  lifecycle_state: "queued" | "dispatched" | "completed" | "failed" | "cancelled";
  verdict: string | null;
  passed_units?: number;
  total_units?: number;
  created_at: string;
  completed_at: string | null;
  units?: RunUnit[];
};

/** GET .../items/{item}/submissions: evaluations of one question, newest first. */
export type ItemSubmission = {
  id: string;
  origin: "item_submit" | "final";
  lifecycle_state: "queued" | "dispatched" | "completed" | "failed" | "cancelled";
  language_id?: string;
  revision_number?: number;
  queued_at: string;
  completed_at: string | null;
  verdict: string | null;
  score: string | null;
  maximum_score?: string;
  passed_units: number | null;
  total_units: number | null;
  /** Hidden tests are reported as counts per verdict only. */
  verdict_counts: Record<string, number>;
};

// ---- Staff --------------------------------------------------------------

export type Tenant = { id: string; slug: string; legal_name: string; display_name: string; status: string };

export type Department = {
  id: string;
  tenant_id?: string;
  placement_organization_id?: string;
  department_type: "college" | "placement";
  code: string;
  name: string;
  status: string;
};

export type Batch = { id: string; tenant_id: string; department_id: string; code: string; name: string; academic_year: string; status: string };

export type PlacementOrganization = { id: string; code: string; legal_name: string; status: string };

export type Student = {
  id: string;
  principal_id: string;
  enrollment_number: string;
  status: string;
  college_department_id?: string;
  placement_department_id?: string;
};

export type IssuedCredential = { principal_id: string; username?: string; display_name: string; password: string };

export type ImportedStudent = { student_id: string; principal_id: string; roll_number: string; name: string; username: string; password: string };

export type StudentImportResult = { imported: ImportedStudent[]; skipped: string[] };

export type QuestionVersion = {
  id: string;
  question_id: string;
  version_number: number;
  title: string;
  prompt_markdown: string;
  difficulty: "easy" | "medium" | "hard";
  supported_languages: string[];
  time_limit_ms: number;
  memory_limit_kib: number;
  status: "draft" | "published" | "retired";
  published_at?: string;
  version: number;
  sample_test_case_count: number;
  hidden_test_case_count: number;
};

export type QuestionDetail = { question: { id: string; slug: string; lifecycle_state: string; version: number }; question_version: QuestionVersion };

export type Exam = { id: string; tenant_id: string; external_reference?: string; lifecycle_state: string; version: number; created_at: string };

export type ExamVersion = {
  id: string;
  exam_id: string;
  version_number: number;
  content_version: number;
  title: string;
  instructions_markdown: string;
  opens_at: string;
  closes_at: string;
  duration_seconds: number;
  proctor_policy_version_id: string;
  status: "draft" | "published" | "retired";
};

export type ExamVersionContent = {
  sections: {
    id: string;
    position: number;
    title: string;
    items: { id: string; position: number; question_version_id: string; question_title: string | null; maximum_score: string }[];
  }[];
  assignment_rules: {
    id: string;
    target_type: "batch" | "department" | "placement_department" | "student";
    target_id: string;
    available_from: string;
    available_until: string;
    disabled_at: string | null;
    assigned_candidates: number;
  }[];
};

export type ProctorPolicy = { id: string; name: string; version: number; lifecycle_state: string };
export type ProctorPolicyVersion = { id: string; proctor_policy_id: string; version_number: number; status: string };

export type SebPolicy = { enabled: boolean; accepted_keys: string[]; title: string };

/** GET /analytics/v1/tenants/{t}/exam-results?exam_version_id= */
export type ExamResult = {
  candidate_id: string;
  attempt_id: string;
  attempt_number: number;
  lifecycle_state: string;
  score: string;
  maximum_score: string;
  submitted_at: string | null;
  graded_at: string | null;
};

/** A message staff post to everyone sitting an exam (ADR-0027). */
export type Announcement = { id: string; body: string; created_at: string };

/** One assigned candidate on the live monitor; attempt fields are null until they start. */
export type MonitorCandidate = {
  candidate_id: string;
  attempt_id: string | null;
  lifecycle_state: string | null;
  started_at: string | null;
  submission_deadline: string | null;
  submitted_at: string | null;
  items_answered: number;
  score: number | null;
  maximum_score: number | null;
};

export type ExamMonitor = {
  exam_version_id: string;
  results_released_at: string | null;
  announcements: Announcement[];
  candidates: MonitorCandidate[];
};

/** What an open exam screen polls: staff may extend the deadline or post a message. */
export type AttemptLiveState = { lifecycle_state: string; submission_deadline: string; announcements: Announcement[] };

/** A candidate's score, present only after staff release results. */
export type AttemptResult =
  | { released: false }
  | {
      released: true;
      released_at: string;
      score: number;
      maximum_score: number;
      items: { exam_item_id: string; position: number | null; title: string | null; score: number; maximum_score: number }[];
    };
