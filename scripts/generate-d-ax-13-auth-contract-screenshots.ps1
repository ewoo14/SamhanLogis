# D-AX-13 auth contract screenshot generator wrapper.
# Runs the Playwright evidence capture from qa/playwright so @playwright/test resolves
# from that package's node_modules.

$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-13-auth-contract-screenshots.mjs'
node $Script
