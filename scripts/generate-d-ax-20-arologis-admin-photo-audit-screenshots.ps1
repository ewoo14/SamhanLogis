$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-20-arologis-admin-photo-audit-screenshots.mjs'
node $Script
