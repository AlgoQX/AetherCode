//go:build zitadel

package sso

import (
	"context"
	"net/http"
	"os"
	"testing"

	"github.com/aethercode/aethercode/services/identity/internal/app"
	"github.com/aethercode/aethercode/services/identity/internal/domain"
)

// TestDirectoryAgainstZitadel runs against a real ZITADEL with the argon2
// verifier enabled (ADR-0042): ZITADEL_TEST_URL, ZITADEL_TEST_PAT_FILE (an
// IAM owner's token) and ZITADEL_TEST_ORG_ID. It proves AetherCode's Argon2id
// hash signs the user in at the provider, and that a second sync links
// instead of duplicating.
func TestDirectoryAgainstZitadel(t *testing.T) {
	issuer, patFile, orgID := os.Getenv("ZITADEL_TEST_URL"), os.Getenv("ZITADEL_TEST_PAT_FILE"), os.Getenv("ZITADEL_TEST_ORG_ID")
	if issuer == "" || patFile == "" || orgID == "" {
		t.Skip("ZITADEL_TEST_URL, ZITADEL_TEST_PAT_FILE and ZITADEL_TEST_ORG_ID are not set")
	}
	provider := New(Config{Issuer: issuer, ClientID: "x", ClientSecret: "x", RedirectURI: "x",
		AdminTokenFile: patFile, OrganizationID: orgID, EmailDomain: "students.example.invalid"})
	ctx := context.Background()

	hash, err := domain.HashPassword("Practice2026ab")
	if err != nil {
		t.Fatal(err)
	}
	account := app.DirectoryAccount{Username: "21cs001", DisplayName: "Asha Kumar Rao", PasswordHash: hash}
	if found, err := provider.FindUser(ctx, account.Username); err != nil || found != "" {
		t.Fatalf("FindUser(before) = %q, %v; want none", found, err)
	}
	userID, err := provider.CreateUser(ctx, account)
	if err != nil || userID == "" {
		t.Fatalf("CreateUser = %q, %v", userID, err)
	}
	if found, err := provider.FindUser(ctx, "21CS001"); err != nil || found != userID {
		t.Fatalf("FindUser(after) = %q, %v; want %q", found, err, userID)
	}
	checkPassword(t, provider, account.Username, "Practice2026ab", true)
	checkPassword(t, provider, account.Username, "wrong-password-1", false)

	changed, err := domain.HashPassword("Changed2026xyz")
	if err != nil {
		t.Fatal(err)
	}
	account.PasswordHash, account.DisplayName = changed, "Asha Rao"
	if err := provider.UpdateUser(ctx, userID, account); err != nil {
		t.Fatalf("UpdateUser: %v", err)
	}
	checkPassword(t, provider, account.Username, "Changed2026xyz", true)
	checkPassword(t, provider, account.Username, "Practice2026ab", false)
}

// checkPassword signs in through ZITADEL's session API.
func checkPassword(t *testing.T, provider *Provider, username, password string, want bool) {
	t.Helper()
	headers, err := provider.adminHeaders()
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"checks": map[string]any{
		"user":     map[string]any{"loginName": username},
		"password": map[string]any{"password": password},
	}}
	err = provider.do(context.Background(), http.MethodPost, provider.config.Issuer+"/v2/sessions", headers, body, nil)
	if (err == nil) != want {
		t.Fatalf("password %q accepted = %v, want %v (%v)", password, err == nil, want, err)
	}
}
