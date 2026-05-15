$ErrorActionPreference = 'Stop'

$Script = Join-Path $PSScriptRoot '..\qa\playwright\scripts\generate-d-ax-19-mobile-staff-driver-retirement-screenshots.mjs'
node $Script
