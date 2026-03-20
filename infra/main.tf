terraform {
  required_version = ">= 1.6.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
}

# ─────────────────────────────────────────────
# Variables
# ─────────────────────────────────────────────

variable "kubeconfig_path" {
  description = "Path to the kubeconfig file for the host cluster."
  type        = string
  default     = "~/.kube/config"
}

variable "simulator_namespace" {
  description = "Namespace in which simulator platform resources are deployed."
  type        = string
  default     = "simulator-system"
}

variable "vcluster_chart_version" {
  description = "Version of the Loft vcluster Helm chart."
  type        = string
  default     = "0.19.2"
}

variable "k3s_image" {
  description = "k3s image used inside each vcluster."
  type        = string
  default     = "rancher/k3s:v1.29.4-k3s1"
}

# ─────────────────────────────────────────────
# Providers
# ─────────────────────────────────────────────

provider "kubernetes" {
  config_path = var.kubeconfig_path
}

provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_path
  }
}

# ─────────────────────────────────────────────
# Namespace
# ─────────────────────────────────────────────

resource "kubernetes_namespace" "simulator_system" {
  metadata {
    name = var.simulator_namespace
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
      "app.kubernetes.io/part-of"    = "k8s-incident-simulator"
    }
  }
}

# ─────────────────────────────────────────────
# RBAC – ServiceAccount for the Orchestrator
# ─────────────────────────────────────────────

resource "kubernetes_service_account" "orchestrator" {
  metadata {
    name      = "orchestrator"
    namespace = kubernetes_namespace.simulator_system.metadata[0].name
    labels = {
      "app.kubernetes.io/component" = "orchestrator"
    }
  }
}

resource "kubernetes_cluster_role" "orchestrator" {
  metadata {
    name = "simulator-orchestrator"
  }
  rule {
    api_groups = ["", "apps", "helm.cattle.io"]
    resources  = ["namespaces", "pods", "services", "deployments", "configmaps", "secrets"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }
}

resource "kubernetes_cluster_role_binding" "orchestrator" {
  metadata {
    name = "simulator-orchestrator"
  }
  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.orchestrator.metadata[0].name
  }
  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.orchestrator.metadata[0].name
    namespace = kubernetes_namespace.simulator_system.metadata[0].name
  }
}

# ─────────────────────────────────────────────
# Base vcluster Helm release (template instance)
# Dynamic provisioning is handled by the Go Orchestrator API.
# ─────────────────────────────────────────────

resource "helm_release" "base_vcluster" {
  name       = "base-vcluster"
  repository = "https://charts.loft.sh"
  chart      = "vcluster"
  version    = var.vcluster_chart_version
  namespace  = kubernetes_namespace.simulator_system.metadata[0].name

  set {
    name  = "vcluster.image"
    value = var.k3s_image
  }

  set {
    name  = "service.type"
    value = "ClusterIP"
  }

  # Security: disable host path mounts
  set {
    name  = "securityContext.runAsNonRoot"
    value = "true"
  }
}

# ─────────────────────────────────────────────
# Network Policy – restrict inter-pod traffic
# ─────────────────────────────────────────────

resource "kubernetes_network_policy" "default_deny" {
  metadata {
    name      = "default-deny-ingress"
    namespace = kubernetes_namespace.simulator_system.metadata[0].name
  }
  spec {
    pod_selector {}
    policy_types = ["Ingress"]
  }
}

# ─────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────

output "simulator_namespace" {
  description = "Kubernetes namespace hosting the simulator platform."
  value       = kubernetes_namespace.simulator_system.metadata[0].name
}

output "orchestrator_service_account" {
  description = "ServiceAccount used by the Orchestrator."
  value       = kubernetes_service_account.orchestrator.metadata[0].name
}
