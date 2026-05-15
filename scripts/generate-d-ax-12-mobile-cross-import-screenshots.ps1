# D-AX-12 screenshot generator wrapper.
# Runs the Playwright mock capture from qa/playwright so @playwright/test resolves
# from that package's node_modules.

$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-12-mobile-cross-import-screenshots.mjs'
node $Script
