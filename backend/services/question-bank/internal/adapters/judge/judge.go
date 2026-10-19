// Package judge makes Question Bank a Judge client for model-solution checks
// (ADR-0033). It submits a check as an execution job under its own mTLS
// identity, so Judge returns to it only its own completions, and records each
// completion's per-test verdicts through the projection worker role.
package judge

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strings"
	"time"

	"github.com/aethercode/aethercode/libs/pkg/config"
	judgev1 "github.com/aethercode/aethercode/libs/proto/gen/go/aethercode/judge/v1"
	"github.com/aethercode/aethercode/services/question-bank/internal/app"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

const (
	rpcTimeout   = 10 * time.Second
	pollInterval = 2 * time.Second
	pullLimit    = 20
	leaseSeconds = 60
	// Judge's accepted bounds, as Submission's dispatcher applies them.
	maxCPUTimeMS   = 60_000
	maxWallTimeMS  = 120_000
	maxMemoryBytes = 2 << 30
	wallTimeFactor = 3
	processLimit   = 64
	// fairnessKey groups model checks in Judge's fair scheduling.
	fairnessKey = "question-bank:model-checks"
	jobLifetime = time.Hour
)

// Runtime is the Judge endpoint and the client identity. An empty address
// turns model checks off.
type Runtime struct {
	Address    string
	CertFile   string
	KeyFile    string
	CAFile     string
	ServerName string
	ConsumerID string
}

// LoadRuntime reads QBANK_JUDGE_*; the certificate defaults to Question
// Bank's own (QBANK_GRPC_TLS_*), whose subject Judge must allow.
func LoadRuntime() (Runtime, error) {
	runtime := Runtime{
		Address:    strings.TrimSpace(os.Getenv("QBANK_JUDGE_GRPC_ADDR")),
		CertFile:   firstSet("QBANK_JUDGE_TLS_CERT_FILE", "QBANK_GRPC_TLS_CERT_FILE"),
		KeyFile:    firstSet("QBANK_JUDGE_TLS_KEY_FILE", "QBANK_GRPC_TLS_KEY_FILE"),
		CAFile:     firstSet("QBANK_JUDGE_TLS_CA_FILE", "QBANK_GRPC_CLIENT_CA_FILE"),
		ServerName: strings.TrimSpace(os.Getenv("QBANK_JUDGE_TLS_SERVER_NAME")),
		ConsumerID: firstSet("QBANK_JUDGE_CONSUMER_ID"),
	}
	if runtime.Address == "" {
		return runtime, nil
	}
	host, _, err := net.SplitHostPort(runtime.Address)
	if err != nil || host == "" {
		return Runtime{}, fmt.Errorf("QBANK_JUDGE_GRPC_ADDR must be host:port")
	}
	if runtime.CertFile == "" || runtime.KeyFile == "" || runtime.CAFile == "" {
		return Runtime{}, fmt.Errorf("model checks need a client certificate, key and CA (QBANK_JUDGE_TLS_* or QBANK_GRPC_TLS_*)")
	}
	if runtime.ServerName == "" {
		runtime.ServerName = host
	}
	if runtime.ConsumerID == "" {
		runtime.ConsumerID = "question-bank-model-checks"
	}
	return runtime, nil
}

func firstSet(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

// ModelChecks submits checks to Judge and records their outcomes.
type ModelChecks struct {
	client  judgev1.JudgeServiceClient
	workers *pgxpool.Pool
	runtime Runtime
	logger  *slog.Logger
}

// New dials Judge lazily; workers is the projection worker pool, which may
// only finish model checks.
func New(runtime Runtime, workers *pgxpool.Pool, logger *slog.Logger) (*ModelChecks, *grpc.ClientConn, error) {
	tlsConfig, err := config.LoadMTLSClientConfig(runtime.CertFile, runtime.KeyFile, runtime.CAFile, runtime.ServerName)
	if err != nil {
		return nil, nil, err
	}
	connection, err := grpc.NewClient(runtime.Address, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
	if err != nil {
		return nil, nil, fmt.Errorf("configure Judge client: %w", err)
	}
	return &ModelChecks{client: judgev1.NewJudgeServiceClient(connection), workers: workers, runtime: runtime, logger: logger}, connection, nil
}

// Submit sends one check to Judge. The check id is the idempotency key and
// the correlation id, so a retry is the same job.
func (checks *ModelChecks) Submit(contextValue context.Context, check app.ModelCheckJob) error {
	cpuTimeMS := min(check.TimeLimitMS, maxCPUTimeMS)
	callContext, cancel := context.WithTimeout(contextValue, rpcTimeout)
	defer cancel()
	_, err := checks.client.SubmitExecution(callContext, &judgev1.SubmitExecutionRequest{
		IdempotencyKey:               check.ID,
		TenantFairnessKey:            fairnessKey,
		SubmissionCorrelationId:      check.ID,
		EvaluationBundleRef:          check.Bundle.ObjectKey,
		EvaluationBundleSha256:       check.Bundle.Checksum,
		EvaluationBundleKeyReference: check.Bundle.EncryptionKeyReference,
		SourceCiphertextRef:          check.Source.ObjectKey,
		SourceCiphertextSha256:       check.Source.Checksum,
		SourceKeyReference:           check.Source.EncryptionKeyReference,
		LanguageKey:                  check.Language,
		Limits: &judgev1.ExecutionLimits{
			CpuTimeMs:    uint32(cpuTimeMS),
			WallTimeMs:   uint32(min(cpuTimeMS*wallTimeFactor, maxWallTimeMS)),
			MemoryBytes:  min(uint64(check.MemoryLimitKiB)*1024, maxMemoryBytes),
			ProcessLimit: processLimit,
		},
		ExpiresAt: time.Now().Add(jobLifetime).UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return fmt.Errorf("submit model check to Judge: %w", err)
	}
	return nil
}

// Fail marks a check Judge never accepted.
func (checks *ModelChecks) Fail(contextValue context.Context, id string) error {
	_, err := checks.workers.Exec(contextValue, `SELECT qbank.finish_model_check($1, 'failed', 'internal_error', '[]'::jsonb)`, id)
	return err
}

type unitOutcome struct {
	UnitNumber uint32  `json:"unit_number"`
	Verdict    string  `json:"verdict"`
	Weight     uint32  `json:"weight"`
	TimeMS     *uint32 `json:"time_ms,omitempty"`
}

// Run pulls this client's completions until the context ends.
func (checks *ModelChecks) Run(contextValue context.Context) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		if err := checks.pullOnce(contextValue); err != nil && contextValue.Err() == nil {
			checks.logger.Warn("model check completions", "error", err)
		}
		select {
		case <-contextValue.Done():
			return
		case <-ticker.C:
		}
	}
}

func (checks *ModelChecks) pullOnce(contextValue context.Context) error {
	callContext, cancel := context.WithTimeout(contextValue, rpcTimeout)
	defer cancel()
	response, err := checks.client.PullCompletedExecutions(callContext, &judgev1.PullCompletedExecutionsRequest{
		ConsumerId: checks.runtime.ConsumerID, Limit: pullLimit, LeaseSeconds: leaseSeconds,
	})
	if err != nil {
		return fmt.Errorf("pull completions: %w", err)
	}
	for _, completion := range response.GetCompletions() {
		units := make([]unitOutcome, 0, len(completion.GetUnitResults()))
		for _, unit := range completion.GetUnitResults() {
			units = append(units, unitOutcome{
				UnitNumber: unit.GetUnitNumber(), Verdict: verdictName(unit.GetVerdictCode()),
				Weight: unit.GetWeight(), TimeMS: unit.ExecutionTimeMs,
			})
		}
		encoded, err := json.Marshal(units)
		if err != nil {
			return err
		}
		if _, err := checks.workers.Exec(contextValue, `SELECT qbank.finish_model_check($1, 'completed', $2, $3::jsonb)`,
			completion.GetSubmissionCorrelationId(), verdictName(completion.GetVerdictCode()), string(encoded)); err != nil {
			return fmt.Errorf("record model check: %w", err)
		}
		ackContext, ackCancel := context.WithTimeout(contextValue, rpcTimeout)
		_, err = checks.client.AcknowledgeCompletion(ackContext, &judgev1.AcknowledgeCompletionRequest{
			ConsumerId: checks.runtime.ConsumerID, EventId: completion.GetEventId(),
			DeliveryId: completion.GetDeliveryId(), LeaseId: completion.GetLeaseId(),
		})
		ackCancel()
		if err != nil {
			return fmt.Errorf("acknowledge completion: %w", err)
		}
	}
	return nil
}

// verdictName is Judge's verdict in the platform's vocabulary.
func verdictName(code judgev1.CompletionVerdict) string {
	switch code {
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_ACCEPTED:
		return "accepted"
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_WRONG_ANSWER:
		return "wrong_answer"
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_TIME_LIMIT_EXCEEDED:
		return "time_limit_exceeded"
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_MEMORY_LIMIT_EXCEEDED:
		return "memory_limit_exceeded"
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_RUNTIME_ERROR:
		return "runtime_error"
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_COMPILE_ERROR:
		return "compile_error"
	case judgev1.CompletionVerdict_COMPLETION_VERDICT_CANCELLED:
		return "cancelled"
	default:
		return "internal_error"
	}
}
