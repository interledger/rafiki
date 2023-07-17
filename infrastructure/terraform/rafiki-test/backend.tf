terraform {
  required_version = ">= 1.5.3"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.73.2"
    }
  }
  backend "gcs" {
    bucket  = "coil-rafiki-terraform-state"
    // IF YOU COPY THIS FILE CHANGE THE PREFIX BELOW
    prefix  = "test-stacks/rafiki-test-1"
  }
}

provider "google" {
  region      = var.region 
}
