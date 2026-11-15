#!/usr/bin/env bash
# Seeds the workspace with the account-automation fixture project.
set -euo pipefail
fixture="$(cd "$(dirname "$0")/../fixtures/account-automation" && pwd)"
cp -R "$fixture/force-app" "$fixture/sfdx-project.json" .
