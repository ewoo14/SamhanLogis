$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.mjs'
node $Script
