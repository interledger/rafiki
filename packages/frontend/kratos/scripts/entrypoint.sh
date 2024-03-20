#!/bin/sh
set -e

echo "Running Kratos Migrations..."
kratos -c /etc/config/kratos/kratos.yml migrate sql -e --yes

# TODO: Should we make this --dev flag conditional to dev environemnts, or is it fine for our localenv setup?
echo "Starting Kratos..."
exec kratos serve -c /etc/config/kratos/kratos.yml --dev --watch-courier
