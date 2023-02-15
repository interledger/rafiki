terraform {
  required_version = ">= 1.3.8"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.53.1"
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
