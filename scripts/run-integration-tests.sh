#!/bin/bash

# This script runs the integration tests. It starts the test environment, runs the tests,
# saves the container logs to a file, and stops the containers.
# Usage:
#   ./script.sh            # Run the script with default options
#   ./script.sh --build    # Re-build the docker images (-b or --build)

log_file="/tmp/rafiki_integration_logs.txt"
build_flag=""
test_container_name="rafik-integration-test-runner"

# Parse cli args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--build)
      build_flag="--build"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Run tests on hostmachine
# pnpm --filter integration testenv:compose down --volumes
# pnpm --filter integration testenv:compose up -d --wait $build_flag
# pnpm --filter integration testenv:compose logs -f --tail=0 > "$log_file" 2>&1 &
# pnpm --filter integration test
# pnpm --filter integration testenv:compose down --volumes

# Run tests in docker
pnpm --filter integration testenv:compose down --volumes
pnpm --filter integration testenv:compose up -d --wait $build_flag
pnpm --filter integration testenv:compose logs -f > "$log_file" 2>&1 &

# logs without docker container names and only the test-runner logs
# pnpm --filter integration testenv:compose logs --no-log-prefix "test-runner" -f --tail=0 > "$log_file" 2>&1 &


# Attempt 1 to get exit code that didnt work
# for some reason this doesnt catch exit codes of 1? its always 0.
# but if i run this all manually from cli then i can get exit code
# cant figure out why this doesnt work. its always 0. maybe try this, which
# also uses docker wait? https://medium.com/swlh/the-ultimate-guide-to-integration-testing-with-docker-compose-and-sql-f288f05032c9

# test_exit_code=`docker wait "$test_container_name"`
# docker wait "$test_container_name"
# test_exit_code=$?  # Get the exit status of the container's process

# Attempt 2 to get exit code
# https://stackoverflow.com/a/46300611
# Similar as first way, just with a different command.
# Incorrectly reports 0, even when tests fail. Works fine on cli. Same as first way.
# docker inspect rafik-integration-test-runner --format='{{.State.ExitCode}}'
# test_exit_code=$?

# Attempt 3 to get exit code
# also from https://stackoverflow.com/a/46300611
# Similar as second way but accounts for running or not
# Shows running:0 or exited:1. I see running:0. maybe the problem with above?
# Would need to poll this (or maybe use some healthcheck on test-runner? but container stops when tests finish)
# docker inspect rafik-integration-test-runner --format={{.State.Status}}:{{.State.ExitCode}}
# test_exit_code=$?

# Attempt 4 to get exit code
# sleep forever in Dockerfile command and start tests from here.
# works to get exit code reliably. Had trouble collecting/showing logs though.
# docker exec "$test_container_name" sh -c "npm test"
# test_exit_code=$?

# Attempt 5 to get exit code
# same as attempt 1 but calls docker using command substitution (backticks, ``)
# works and was able to handle logs fine.
# https://medium.com/swlh/the-ultimate-guide-to-integration-testing-with-docker-compose-and-sql-f288f05032c9
# test_exit_code=`docker wait "$test_container_name"`

# Attempt 6 to get exit code
# same as attempt 5 but using a more preferred way of command substitution
# https://stackoverflow.com/questions/22709371/backticks-vs-braces-in-bash
test_exit_code=$(docker wait "$test_container_name")

cat "$log_file"
docker logs $test_container_name

if [ $test_exit_code -ne 0 ]; then
  echo "❌ Tests failed with exit code: $test_exit_code."
  exit_code=1
else
  echo "✅ Tests passed."
  exit_code=0
fi

pnpm --filter integration testenv:compose down --volumes

exit $exit_code