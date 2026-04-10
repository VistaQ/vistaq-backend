#!/usr/bin/env bash

# ---------------------------------------------------------------------------
# test-manager.sh — CLI wrapper for the vistaq-backend API test suites
#
# Usage:
#   ./scripts/test-manager.sh <command>
#
# Commands:
#   all        Run every test suite
#   groups     Run only the groups test suite
#   events     Run only the events test suite
#   watch      Run all tests in watch mode
#   coverage   Run all tests with a coverage report
#   help       Show this help message
# ---------------------------------------------------------------------------

set -euo pipefail

# Resolve the project root relative to the location of this script so the
# script can be called from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

print_header() {
  local title="$1"
  local width=60
  local border
  border=$(printf '%0.s-' $(seq 1 $width))
  echo ""
  echo "${border}"
  printf "  %s\n" "${title}"
  echo "${border}"
  echo ""
}

print_result() {
  local exit_code="$1"
  local suite="$2"
  echo ""
  if [ "${exit_code}" -eq 0 ]; then
    echo "PASSED — ${suite} completed successfully."
  else
    echo "FAILED — ${suite} finished with errors (exit code ${exit_code})."
  fi
  echo ""
}

show_help() {
  cat <<HELP

test-manager.sh — vistaq-backend API test suite manager

USAGE
  ./scripts/test-manager.sh <command>

COMMANDS
  all        Run every test suite
  groups     Run only the groups test suite
  events     Run only the events test suite
  watch      Run all tests in watch mode
  coverage   Run all tests with a coverage report
  help       Show this help message

NOTES
  Must be run from the project root: vistaq-backend/api
  Seed user password: TestPass123!

HELP
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

COMMAND="${1:-help}"

cd "${PROJECT_ROOT}"

case "${COMMAND}" in

  all)
    print_header "Running ALL test suites"
    set +e
    npm test -- --runInBand
    EXIT_CODE=$?
    set -e
    print_result "${EXIT_CODE}" "All suites"
    exit "${EXIT_CODE}"
    ;;

  groups)
    print_header "Running GROUPS test suite"
    set +e
    npm test -- --testPathPattern="tests/groups\.test\.ts" --runInBand
    EXIT_CODE=$?
    set -e
    print_result "${EXIT_CODE}" "Groups suite"
    exit "${EXIT_CODE}"
    ;;

  events)
    print_header "Running EVENTS test suite"
    set +e
    npm test -- --testPathPattern="tests/events\.test\.ts" --runInBand
    EXIT_CODE=$?
    set -e
    print_result "${EXIT_CODE}" "Events suite"
    exit "${EXIT_CODE}"
    ;;

  watch)
    print_header "Running ALL test suites in WATCH mode"
    npm test -- --watch
    ;;

  coverage)
    print_header "Running ALL test suites with COVERAGE report"
    set +e
    npm test -- --coverage --runInBand
    EXIT_CODE=$?
    set -e
    print_result "${EXIT_CODE}" "Coverage run"
    exit "${EXIT_CODE}"
    ;;

  help|--help|-h)
    show_help
    exit 0
    ;;

  *)
    echo ""
    echo "ERROR: Unknown command '${COMMAND}'"
    show_help
    exit 1
    ;;

esac
