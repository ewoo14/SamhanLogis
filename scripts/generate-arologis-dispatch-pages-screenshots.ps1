# D-AX-11 screenshot generator wrapper.
# Runs the Playwright mock capture from qa/playwright so @playwright/test resolves
# from that package's node_modules.

$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-arologis-dispatch-pages-screenshots.mjs'
node $Script
