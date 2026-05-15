$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-16-arologis-mobile-signature-copy-screenshots.mjs'
node $Script
