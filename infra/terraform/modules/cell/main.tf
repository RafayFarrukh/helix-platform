# ---------------------------------------------------------------------------
# A "cell" is a complete, independent Helix stack serving a slice of tenants.
#
# The whole point of expressing it as a module is that a region must never be a
# hand-built snowflake: recovering a region, or opening a new one for a data
# residency commitment, is `terraform apply` with different variables — not
# archaeology through someone's console clicks.
# ---------------------------------------------------------------------------

variable "cell_name"    { type = string }
variable "region"       { type = string }
variable "residency" {
  type        = string
  description = "us | eu | ap - which tenants this cell may hold"
}
variable "api_min" {
  type    = number
  default = 6
}
variable "api_max" {
  type    = number
  default = 120
}
variable "db_instance" {
  type    = string
  default = "db.r6g.2xlarge"
}
variable "db_replicas" {
  type    = number
  default = 1
}

# --- Network ---------------------------------------------------------------
# Three tiers: public (load balancers only), private (compute), isolated (data).
# Nothing in the data tier has a route to the internet, in either direction.
module "network" {
  source             = "../network"
  name               = var.cell_name
  region             = var.region
  availability_zones = 3
}

# --- Data ------------------------------------------------------------------
resource "aws_db_instance" "primary" {
  identifier     = "${var.cell_name}-pg"
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance

  multi_az                     = true   # synchronous standby, automatic failover
  storage_encrypted            = true
  kms_key_id                   = aws_kms_key.cell.arn
  backup_retention_period      = 35     # supports PITR to any second in 35 days
  performance_insights_enabled = true
  deletion_protection          = true

  db_subnet_group_name   = module.network.isolated_subnet_group
  vpc_security_group_ids = [module.network.db_security_group_id]
}

resource "aws_db_instance" "replica" {
  count               = var.db_replicas
  identifier          = "${var.cell_name}-pg-replica-${count.index}"
  replicate_source_db = aws_db_instance.primary.identifier
  instance_class      = var.db_instance
}

# Per-cell CMK. Combined with per-tenant data keys, destroying a key is a
# provable deletion rather than a promise that rows were removed.
resource "aws_kms_key" "cell" {
  description             = "Helix ${var.cell_name} envelope encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

# --- Compute ---------------------------------------------------------------
module "cluster" {
  source       = "../eks"
  name         = var.cell_name
  region       = var.region
  vpc_id       = module.network.vpc_id
  subnet_ids   = module.network.private_subnet_ids
  kms_key_arn  = aws_kms_key.cell.arn
  min_nodes    = ceil(var.api_min / 4)
  max_nodes    = ceil(var.api_max / 4)
}

output "cell" {
  value = {
    name      = var.cell_name
    region    = var.region
    residency = var.residency
    endpoint  = module.cluster.api_endpoint
  }
}
