#!/bin/sh
set -e

echo "Running Kratos Migrations..."
kratos -c /etc/config/kratos/kratos.yml migrate sql -e --yes

if [ "$DEV_MODE" = true ]; then
  echo "Starting Kratos in dev mode..."
  exec kratos serve -c /etc/config/kratos/kratos.yml --dev --watch-courier
else
  echo "Starting Kratos..."
  exec kratos serve -c /etc/config/kratos/kratos.yml
fi
