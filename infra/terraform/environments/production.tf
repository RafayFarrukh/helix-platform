# Production is four cells. Adding a fifth — for a new market, or to shrink the
# blast radius of an existing one — is a new block, not a new architecture.

module "cell_us_east" {
  source      = "../modules/cell"
  cell_name   = "helix-us-east"
  region      = "us-east-1"
  residency   = "us"
  api_min     = 8
  api_max     = 120
  db_replicas = 2
}

module "cell_us_west" {
  source    = "../modules/cell"
  cell_name = "helix-us-west"
  region    = "us-west-2"
  residency = "us"
  api_min   = 4
  api_max   = 60
}

# EU tenants never leave the EU. Enforced by Tenant.region at the application
# layer and by this cell holding the only copy of their data.
module "cell_eu_central" {
  source    = "../modules/cell"
  cell_name = "helix-eu-central"
  region    = "eu-central-1"
  residency = "eu"
  api_min   = 6
  api_max   = 80
}

module "cell_ap_south" {
  source    = "../modules/cell"
  cell_name = "helix-ap-south"
  region    = "ap-south-1"
  residency = "ap"
  api_min   = 4
  api_max   = 60
}
