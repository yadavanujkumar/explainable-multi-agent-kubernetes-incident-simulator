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

  # Uncomment and configure for remote state in production:
  # backend "s3" {
  #   bucket         = "my-terraform-state-bucket"
  #   key            = "k8s-simulator/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-lock"
  # }
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

variable "orchestrator_replicas" {
  description = "Number of Orchestrator pod replicas."
  type        = number
  default     = 2
}

variable "max_vclusters_per_namespace" {
  description = "Maximum number of concurrent vcluster pods allowed in the simulator namespace."
  type        = number
  default     = 20
}

variable "quota_cpu_requests" {
  description = "Total CPU requests allowed in the simulator namespace."
  type        = string
  default     = "20"
}

variable "quota_cpu_limits" {
  description = "Total CPU limits allowed in the simulator namespace."
  type        = string
  default     = "40"
}

variable "quota_memory_requests" {
  description = "Total memory requests allowed in the simulator namespace."
  type        = string
  default     = "40Gi"
}

variable "quota_memory_limits" {
  description = "Total memory limits allowed in the simulator namespace."
  type        = string
  default     = "80Gi"
}

variable "quota_storage_requests" {
  description = "Total persistent storage requests allowed in the simulator namespace."
  type        = string
  default     = "100Gi"
}

variable "quota_pvc_count" {
  description = "Maximum number of PersistentVolumeClaims in the simulator namespace."
  type        = number
  default     = 50
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

resource "kubernetes_network_policy" "allow_intra_namespace" {
  metadata {
    name      = "allow-intra-namespace"
    namespace = kubernetes_namespace.simulator_system.metadata[0].name
  }
  spec {
    pod_selector {}
    policy_types = ["Ingress"]
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = var.simulator_namespace
          }
        }
      }
    }
  }
}

# ─────────────────────────────────────────────
# ResourceQuota – prevent runaway resource usage
# ─────────────────────────────────────────────

resource "kubernetes_resource_quota" "simulator_system" {
  metadata {
    name      = "simulator-system-quota"
    namespace = kubernetes_namespace.simulator_system.metadata[0].name
  }
  spec {
    hard = {
      pods                     = tostring(var.max_vclusters_per_namespace + 10)
      "requests.cpu"           = var.quota_cpu_requests
      "requests.memory"        = var.quota_memory_requests
      "limits.cpu"             = var.quota_cpu_limits
      "limits.memory"          = var.quota_memory_limits
      "requests.storage"       = var.quota_storage_requests
      "persistentvolumeclaims" = tostring(var.quota_pvc_count)
    }
  }
}

# ─────────────────────────────────────────────
# LimitRange – enforce sane container defaults
# ─────────────────────────────────────────────

resource "kubernetes_limit_range" "simulator_system" {
  metadata {
    name      = "simulator-system-limits"
    namespace = kubernetes_namespace.simulator_system.metadata[0].name
  }
  spec {
    limit {
      type = "Container"
      default = {
        cpu    = "500m"
        memory = "512Mi"
      }
      default_request = {
        cpu    = "100m"
        memory = "128Mi"
      }
      max = {
        cpu    = "4"
        memory = "8Gi"
      }
      min = {
        cpu    = "10m"
        memory = "32Mi"
      }
    }
    limit {
      type = "Pod"
      max = {
        cpu    = "8"
        memory = "16Gi"
      }
    }
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

output "resource_quota_name" {
  description = "Name of the ResourceQuota applied to the simulator namespace."
  value       = kubernetes_resource_quota.simulator_system.metadata[0].name
}
