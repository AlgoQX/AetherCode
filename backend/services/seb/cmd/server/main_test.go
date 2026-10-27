package main

import (
	"strings"
	"testing"
)

func TestLoadLaunchSettingsRejectsWeakOrMalformedPasswords(t *testing.T) {
	for name, password := range map[string]string{
		"too short":       "abc123",
		"not hexadecimal": strings.Repeat("g", 48),
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("SEB_LAUNCH_BASE_URL", "https://exam.example.edu")
			t.Setenv("SEB_LAUNCH_PASSWORD", password)

			if _, err := loadLaunchSettings(); err == nil {
				t.Fatal("loadLaunchSettings() accepted a weak or malformed password")
			}
		})
	}
}

func TestLoadLaunchSettingsAcceptsGeneratedPasswordFormat(t *testing.T) {
	password := strings.Repeat("ab", 24)
	t.Setenv("SEB_LAUNCH_BASE_URL", "https://exam.example.edu")
	t.Setenv("SEB_LAUNCH_PASSWORD", password)

	settings, err := loadLaunchSettings()
	if err != nil {
		t.Fatalf("loadLaunchSettings() error = %v", err)
	}
	if settings.Password != password {
		t.Fatal("loadLaunchSettings() returned a different password")
	}
}
