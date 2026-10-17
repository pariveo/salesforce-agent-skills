#!/usr/bin/env bash
# Seeds the workspace with an sfdx project holding one legacy flow to audit.
set -euo pipefail
case_dir="$(cd "$(dirname "$0")" && pwd)"
mkdir -p force-app/main/default/flows
cp "$case_dir/fixtures/Opportunity_Legacy_Rollup.flow-meta.xml" force-app/main/default/flows/
printf '{"packageDirectories":[{"path":"force-app","default":true}],"sourceApiVersion":"67.0"}\n' > sfdx-project.json
