$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.mjs'
node $Script
