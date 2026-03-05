package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProvisionClusterHandler(t *testing.T) {
	reqBody := ProvisionRequest{UserID: "test-user-123", Level: 1}
	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", "/api/v1/cluster/provision", bytes.NewBuffer(bodyBytes))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(ProvisionClusterHandler)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusAccepted {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusAccepted)
	}

	var res ProvisionResponse
	if err := json.NewDecoder(rr.Body).Decode(&res); err != nil {
		t.Errorf("failed to decode response: %v", err)
	}

	expectedClusterID := "vcluster-test-user-123"
	if res.ClusterID != expectedClusterID {
		t.Errorf("handler returned unexpected cluster ID: got %v want %v", res.ClusterID, expectedClusterID)
	}
}
