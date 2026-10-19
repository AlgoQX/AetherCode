//go:build integration

package repo_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// asActor runs fn with a signed context for action on resource, then commits
// when fn succeeds, so the test sees exactly what that capability may do.
func asActor(ctx context.Context, t *testing.T, pool *pgxpool.Pool, actorID, action, resource string, fn func(pgx.Tx) error) error {
	t.Helper()
	transaction, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer transaction.Rollback(ctx) //nolint:errcheck
	var contextID string
	require.NoError(t, transaction.QueryRow(ctx, `
		INSERT INTO authz.request_contexts
		    (context_id, capability_id, backend_pid, transaction_id, actor_id, tenant_id,
		     authz_revision, action, resource, issued_at, expires_at)
		VALUES (gen_random_uuid(), gen_random_uuid(), pg_backend_pid(), txid_current(),
		        $1, $2, 1, $3, $4, clock_timestamp(), clock_timestamp() + interval '4 seconds')
		RETURNING context_id::text`, actorID, unitTenantID, action, resource).Scan(&contextID))
	_, err = transaction.Exec(ctx, `SELECT set_config('app.authz_context_id', $1, true)`, contextID)
	require.NoError(t, err)
	_, err = transaction.Exec(ctx, `SET LOCAL ROLE aether_submission_app`)
	require.NoError(t, err)
	if err := fn(transaction); err != nil {
		return err
	}
	return transaction.Commit(ctx)
}

// TestExamOperations proves ADR-0027: only staff capabilities reach the
// monitor, release and extra time; candidates see their score only after
// release; extra time moves only in-progress deadlines and keeps the attempt
// version, so the open exam screen keeps saving.
func TestExamOperations(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	pool := startSubmissionDatabase(ctx, t)

	item := newID(t)
	fixture := itemSubmitFixture{ctx, t, pool, seedAssignedAttempt(ctx, t, pool, "active", executableItem(item))}
	staffID := newID(t)
	authorizeActorsInTenant(ctx, t, pool, fixture.CandidateID, staffID)
	var versionID string
	require.NoError(t, pool.QueryRow(ctx, `
		UPDATE submission.attempts AS attempt SET exam_version_id = projection.exam_version_id
		FROM submission.assignment_projections AS projection
		WHERE attempt.id = $1 AND projection.candidate_assignment_id = attempt.candidate_assignment_id
		RETURNING projection.exam_version_id::text`, fixture.AttemptID).Scan(&versionID))

	staff := func(action, resource string, fn func(pgx.Tx) error) error {
		return asActor(ctx, t, pool, staffID, action, resource, fn)
	}
	candidate := func(fn func(pgx.Tx) error) error {
		return asActor(ctx, t, pool, fixture.CandidateID, "submission.read", "submission.attempts", fn)
	}
	deadline := func() (time.Time, int64) {
		var value time.Time
		var version int64
		require.NoError(t, pool.QueryRow(ctx, `SELECT submission_deadline, version FROM submission.attempts WHERE id = $1`,
			fixture.AttemptID).Scan(&value, &version))
		return value, version
	}

	t.Run("a candidate capability reaches none of the staff operations", func(t *testing.T) {
		err := candidate(func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.get_exam_monitor($1, $2)`, unitTenantID, versionID)
			return err
		})
		require.ErrorContains(t, err, "does not allow")
		err = asActor(ctx, t, pool, fixture.CandidateID, "submission.write", "submission.attempts", func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.extend_attempt_deadlines($1, $2, NULL, 600)`, unitTenantID, versionID)
			return err
		})
		require.ErrorContains(t, err, "does not allow")
	})

	t.Run("extra time moves the deadline and keeps the attempt version", func(t *testing.T) {
		before, version := deadline()
		var extended int
		require.NoError(t, staff("submission.write", "submission.attempt_events", func(transaction pgx.Tx) error {
			return transaction.QueryRow(ctx, `SELECT submission.extend_attempt_deadlines($1, $2, NULL, 600)`,
				unitTenantID, versionID).Scan(&extended)
		}))
		require.Equal(t, 1, extended)
		after, versionAfter := deadline()
		require.Equal(t, 10*time.Minute, after.Sub(before))
		require.Equal(t, version, versionAfter)

		var events int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM submission.attempt_events
			WHERE attempt_id = $1 AND event_type = 'submission.attempt.deadline_extended.v1'`, fixture.AttemptID).Scan(&events))
		require.Equal(t, 1, events)
	})

	t.Run("announcements reach the candidate's live state", func(t *testing.T) {
		require.NoError(t, staff("submission.write", "submission.attempt_events", func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.post_exam_announcement($1, $2, $3, '  Question 2 has a typo.  ')`,
				newID(t), unitTenantID, versionID)
			return err
		}))
		var live struct {
			Deadline      time.Time `json:"submission_deadline"`
			Announcements []struct {
				Body string `json:"body"`
			} `json:"announcements"`
		}
		require.NoError(t, candidate(func(transaction pgx.Tx) error {
			var raw []byte
			if err := transaction.QueryRow(ctx, `SELECT submission.get_attempt_live_state_for_candidate($1, $2)`,
				unitTenantID, fixture.AttemptID).Scan(&raw); err != nil {
				return err
			}
			return json.Unmarshal(raw, &live)
		}))
		require.Len(t, live.Announcements, 1)
		require.Equal(t, "Question 2 has a typo.", live.Announcements[0].Body)
		current, _ := deadline()
		require.True(t, live.Deadline.Equal(current))

		stranger := newID(t)
		authorizeActorsInTenant(ctx, t, pool, stranger)
		err := asActor(ctx, t, pool, stranger, "submission.read", "submission.attempts", func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.get_attempt_live_state_for_candidate($1, $2)`, unitTenantID, fixture.AttemptID)
			return err
		})
		require.ErrorContains(t, err, "not found", "another candidate cannot read this attempt")
	})

	t.Run("the score stays hidden until staff release it", func(t *testing.T) {
		fixture.save(item)
		state, requestIDs := fixture.endTest()
		require.Equal(t, "grading", state)
		fixture.complete(requestIDs[0], "accepted", allPassed)

		result := func() map[string]any {
			var response map[string]any
			require.NoError(t, candidate(func(transaction pgx.Tx) error {
				var raw []byte
				if err := transaction.QueryRow(ctx, `SELECT submission.get_attempt_result_for_candidate($1, $2)`,
					unitTenantID, fixture.AttemptID).Scan(&raw); err != nil {
					return err
				}
				return json.Unmarshal(raw, &response)
			}))
			return response
		}
		require.Equal(t, map[string]any{"released": false}, result())

		var monitor struct {
			Candidates []struct {
				LifecycleState string  `json:"lifecycle_state"`
				Score          float64 `json:"score"`
			} `json:"candidates"`
		}
		require.NoError(t, staff("submission.read", "submission.score_summaries", func(transaction pgx.Tx) error {
			var raw []byte
			if err := transaction.QueryRow(ctx, `SELECT submission.get_exam_monitor($1, $2)`, unitTenantID, versionID).Scan(&raw); err != nil {
				return err
			}
			return json.Unmarshal(raw, &monitor)
		}))
		require.Len(t, monitor.Candidates, 1)
		require.Equal(t, "graded", monitor.Candidates[0].LifecycleState)
		require.InDelta(t, 10, monitor.Candidates[0].Score, 0.001)

		require.NoError(t, staff("submission.write", "submission.score_summaries", func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.set_exam_results_release($1, $2, true)`, unitTenantID, versionID)
			return err
		}))
		released := result()
		require.Equal(t, true, released["released"])
		require.InDelta(t, 10, released["score"], 0.001)
		require.Len(t, released["items"], 1)

		err := staff("submission.write", "submission.attempt_events", func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.extend_attempt_deadlines($1, $2, $3, 600)`,
				unitTenantID, versionID, fixture.AttemptID)
			return err
		})
		require.ErrorContains(t, err, "not in progress", "a graded attempt cannot be reopened with extra time")

		require.NoError(t, staff("submission.write", "submission.score_summaries", func(transaction pgx.Tx) error {
			_, err := transaction.Exec(ctx, `SELECT submission.set_exam_results_release($1, $2, false)`, unitTenantID, versionID)
			return err
		}))
		require.Equal(t, map[string]any{"released": false}, result(), "hiding results again hides the score")
	})
}
