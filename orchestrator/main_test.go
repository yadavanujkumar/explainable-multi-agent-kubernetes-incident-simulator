package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ─────────────────────────────────────────────
// HealthHandler
// ─────────────────────────────────────────────

func TestHealthHandler(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "/healthz", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	http.HandlerFunc(HealthHandler).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 got %d", rr.Code)
	}

	var resp HealthResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("expected status 'ok' got %q", resp.Status)
	}
}

// ─────────────────────────────────────────────
// ProvisionClusterHandler — happy path
// ─────────────────────────────────────────────

func TestProvisionClusterHandler(t *testing.T) {
	reqBody := ProvisionRequest{UserID: "test-user-123", Level: 1}
	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequest(http.MethodPost, "/api/v1/cluster/provision", bytes.NewBuffer(bodyBytes))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	http.HandlerFunc(ProvisionClusterHandler).ServeHTTP(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Errorf("expected 202 got %d", rr.Code)
	}

	var res ProvisionResponse
	if err := json.NewDecoder(rr.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	expectedClusterID := "vcluster-test-user-123"
	if res.ClusterID != expectedClusterID {
		t.Errorf("unexpected cluster ID: got %q want %q", res.ClusterID, expectedClusterID)
	}
	if res.Status != "provisioning" {
		t.Errorf("unexpected status: got %q want %q", res.Status, "provisioning")
	}
}

func TestProvisionClusterHandler_MethodNotAllowed(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/cluster/provision", nil)
	rr := httptest.NewRecorder()
	http.HandlerFunc(ProvisionClusterHandler).ServeHTTP(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 got %d", rr.Code)
	}
}

func TestProvisionClusterHandler_InvalidJSON(t *testing.T) {
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/cluster/provision", bytes.NewBufferString("{bad json}"))
	rr := httptest.NewRecorder()
	http.HandlerFunc(ProvisionClusterHandler).ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 got %d", rr.Code)
	}
}

func TestProvisionClusterHandler_InvalidUserID(t *testing.T) {
	body, _ := json.Marshal(ProvisionRequest{UserID: "user; DROP TABLE clusters;--", Level: 1})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/cluster/provision", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	http.HandlerFunc(ProvisionClusterHandler).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422 got %d", rr.Code)
	}
}

func TestProvisionClusterHandler_LevelOutOfRange(t *testing.T) {
	body, _ := json.Marshal(ProvisionRequest{UserID: "user123", Level: 99})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/cluster/provision", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	http.HandlerFunc(ProvisionClusterHandler).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422 got %d", rr.Code)
	}
}

// ─────────────────────────────────────────────
// InjectFaultHandler
// ─────────────────────────────────────────────

func TestInjectFaultHandler(t *testing.T) {
	body, _ := json.Marshal(InjectFaultRequest{ClusterID: "vcluster-user123", FaultType: "rbac-denial"})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/cluster/inject-fault", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	http.HandlerFunc(InjectFaultHandler).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 got %d", rr.Code)
	}

	var res InjectFaultResponse
	if err := json.NewDecoder(rr.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if res.Status != "injected" {
		t.Errorf("expected status 'injected' got %q", res.Status)
	}
}

func TestInjectFaultHandler_MethodNotAllowed(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/cluster/inject-fault", nil)
	rr := httptest.NewRecorder()
	http.HandlerFunc(InjectFaultHandler).ServeHTTP(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 got %d", rr.Code)
	}
}

// ─────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────

func TestValidateProvisionRequest(t *testing.T) {
	tests := []struct {
		name    string
		req     ProvisionRequest
		wantErr bool
	}{
		{"valid", ProvisionRequest{UserID: "user-01", Level: 3}, false},
		{"empty user_id", ProvisionRequest{UserID: "", Level: 1}, true},
		{"special chars in user_id", ProvisionRequest{UserID: "user;cmd", Level: 1}, true},
		{"level too low", ProvisionRequest{UserID: "user01", Level: 0}, true},
		{"level too high", ProvisionRequest{UserID: "user01", Level: 6}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateProvisionRequest(&tt.req)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateProvisionRequest() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

