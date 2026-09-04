# Managed Kubernetes for one cell. Nodes live only in the private tier.

variable "name"       { type = string }
variable "region"     { type = string }
variable "vpc_id"     { type = string }
variable "subnet_ids" { type = list(string) }
variable "min_nodes"  { type = number }
variable "max_nodes"  { type = number }

resource "aws_eks_cluster" "this" {
  name     = var.name
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_public_access  = false   # reachable only from the private network
    endpoint_private_access = true
  }

  # Kubernetes Secrets are encrypted with the cell's own CMK, not just at rest
  # on the volume.
  encryption_config {
    resources = ["secrets"]
    provider { key_arn = var.kms_key_arn }
  }
}

variable "kms_key_arn" {
  type    = string
  default = ""
}

resource "aws_eks_node_group" "workers" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.name}-workers"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.subnet_ids

  scaling_config {
    min_size     = var.min_nodes
    max_size     = var.max_nodes
    desired_size = var.min_nodes
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${var.name}-cluster"
  assume_role_policy = data.aws_iam_policy_document.eks_assume.json
}

resource "aws_iam_role" "node" {
  name               = "${var.name}-node"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "eks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

output "api_endpoint" { value = aws_eks_cluster.this.endpoint }
