package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

var tracer trace.Tracer

func init() {
	// Initialize mock OpenTelemetry tracer
	tracer = otel.Tracer("orchestrator-service")
}

type ProvisionRequest struct {
	UserID string `json:"user_id"`
	Level  int    `json:"level"`
}

type ProvisionResponse struct {
	ClusterID string `json:"cluster_id"`
	Status    string `json:"status"`
}

// ProvisionClusterHandler simulates deploying a vcluster
func ProvisionClusterHandler(w http.ResponseWriter, r *http.Request) {
	_, span := tracer.Start(r.Context(), "ProvisionCluster")
	defer span.End()

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ProvisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// TODO: Integrate K8s Client-Go to deploy Loft vcluster
	log.Printf("Provisioning ephemeral vcluster for user: %s at level %d", req.UserID, req.Level)

	res := ProvisionResponse{
		ClusterID: fmt.Sprintf("vcluster-%s", req.UserID),
		Status:    "provisioning",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(res)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/cluster/provision", ProvisionClusterHandler)

	log.Println("Orchestrator starting on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
