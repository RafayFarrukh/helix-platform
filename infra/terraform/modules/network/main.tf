# Three-tier VPC. The rule that matters: the isolated tier has no route to the
# internet in either direction, so a compromised application pod cannot exfiltrate
# from the database tier and nothing on the internet can reach it at all.

variable "name"               { type = string }
variable "region"             { type = string }
variable "availability_zones" { type = number }

resource "aws_vpc" "this" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

# public: load balancers and NAT only
resource "aws_subnet" "public" {
  count             = var.availability_zones
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

# private: compute, egress via NAT
resource "aws_subnet" "private" {
  count             = var.availability_zones
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

# isolated: data, no route out
resource "aws_subnet" "isolated" {
  count             = var.availability_zones
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index + 20)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_db_subnet_group" "isolated" {
  name       = "${var.name}-isolated"
  subnet_ids = aws_subnet.isolated[*].id
}

resource "aws_security_group" "db" {
  name   = "${var.name}-db"
  vpc_id = aws_vpc.this.id

  # Only the private (compute) tier may reach Postgres, and only on 5432.
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = aws_subnet.private[*].cidr_block
  }
}

output "vpc_id"                { value = aws_vpc.this.id }
output "private_subnet_ids"    { value = aws_subnet.private[*].id }
output "isolated_subnet_group" { value = aws_db_subnet_group.isolated.name }
output "db_security_group_id"  { value = aws_security_group.db.id }
