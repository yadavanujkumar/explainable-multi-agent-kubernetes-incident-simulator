terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

provider "helm" {
  kubernetes {
    config_path = "~/.kube/config"
  }
}

# Namespace for the Simulator Platform
resource "kubernetes_namespace" "simulator_system" {
  metadata {
    name = "simulator-system"
  }
}

# Base Helm Release for vcluster (Dynamic provisioning is handled by Go API)
# This is the base template for deploying vcluster via Terraform
resource "helm_release" "base_vcluster" {
  name       = "base-vcluster"
  repository = "https://charts.loft.sh"
  chart      = "vcluster"
  namespace  = kubernetes_namespace.simulator_system.metadata[0].name
  
  set {
    name  = "vcluster.image"
    value = "rancher/k3s:v1.27.3-k3s1"
  }
}
