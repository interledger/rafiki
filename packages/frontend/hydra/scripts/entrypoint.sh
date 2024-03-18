#!/bin/sh
set -e

echo "Running Hydra Migrations..."
hydra migrate sql --yes $DSN

echo "Starting Hydra..."
exec hydra serve all --dev
