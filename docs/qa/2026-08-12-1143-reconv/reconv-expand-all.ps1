$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$referencePath = Join-Path $PSScriptRoot '..\2026-08-12-1143-sol\post-v39-expanded-values.csv'
$outputPath = Join-Path $PSScriptRoot 'current-head-expanded-values.csv'
$reference = @(Import-Csv -LiteralPath $referencePath)
$parents = @($reference | Select-Object -ExpandProperty parent_model_code -Unique)
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Add('X-Internal-Token', 'dev-internal-token-change-me')
$rows = [System.Collections.Generic.List[object]]::new()
$errors = [System.Collections.Generic.List[string]]::new()

foreach ($parent in $parents) {
    $requestJson = [ordered]@{
        parentModelCode = $parent
        setQty = 1
        setUnitOverride = $null
        options = $null
    } | ConvertTo-Json -Compress
    $content = [System.Net.Http.StringContent]::new($requestJson, [Text.Encoding]::UTF8, 'application/json')
    $response = $client.PostAsync('http://127.0.0.1:43384/products/internal/expand', $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
        $errors.Add("$parent|$([int]$response.StatusCode)|$body")
        continue
    }
    $data = ($body | ConvertFrom-Json).data
    $lineNo = 0
    foreach ($line in $data) {
        $lineNo++
        $rows.Add([pscustomobject][ordered]@{
            parent_model_code = $parent
            line_no = [string]$lineNo
            component_model_code = [string]$line.modelCode
            quantity = ([decimal]$line.quantity).ToString('0.00', [Globalization.CultureInfo]::InvariantCulture)
            unit_price = ([decimal]$line.unitPrice).ToString('0.00', [Globalization.CultureInfo]::InvariantCulture)
            component_kind = [string]$line.componentKind
            set_head = if ([bool]$line.setHead) { 'True' } else { 'False' }
        })
    }
}
$client.Dispose()

$rows | Export-Csv -LiteralPath $outputPath -NoTypeInformation -Encoding UTF8
$current = @(Import-Csv -LiteralPath $outputPath)
$referenceValues = @($reference | ForEach-Object { "$($_.parent_model_code)|$($_.line_no)|$($_.component_model_code)|$($_.quantity)|$($_.unit_price)|$($_.component_kind)|$($_.set_head)" })
$currentValues = @($current | ForEach-Object { "$($_.parent_model_code)|$($_.line_no)|$($_.component_model_code)|$($_.quantity)|$($_.unit_price)|$($_.component_kind)|$($_.set_head)" })
$diff = @(Compare-Object $referenceValues $currentValues)

"SETS=$($parents.Count)"
"LINES=$($current.Count)"
"ERRORS=$($errors.Count)"
"TOTAL_UNIT_PRICE=$(($current | Measure-Object -Property unit_price -Sum).Sum)"
"VALUE_DIFF_ROWS=$($diff.Count)"
"SHA256_REFERENCE=$((Get-FileHash -LiteralPath $referencePath -Algorithm SHA256).Hash)"
"SHA256_CURRENT=$((Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash)"
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { "EXPAND_ERROR=$_" }
    exit 1
}
if ($diff.Count -gt 0) { exit 2 }
