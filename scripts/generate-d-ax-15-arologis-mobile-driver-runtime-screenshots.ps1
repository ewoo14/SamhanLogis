# D-AX-15 screenshot generator wrapper.
# Runs the Playwright mock capture from qa/playwright so @playwright/test resolves
# from that package's node_modules.

$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.mjs'
node $Script
