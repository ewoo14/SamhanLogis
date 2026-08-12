$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$uri = 'http://127.0.0.1:43384/api/v1/products/AC110CAMDHH1SY/components'
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Add('X-User-Id', 'reconv1143')
$client.DefaultRequestHeaders.Add('X-Is-System-Master', 'true')

function Get-Rows {
    $response = $client.GetAsync($uri).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
        throw "GET failed: $([int]$response.StatusCode) $body"
    }
    $parsed = $body | ConvertFrom-Json
    foreach ($item in $parsed) {
        Write-Output $item
    }
}

function To-Input([object]$row, [bool]$includeAllocation = $true) {
    $inputRow = [ordered]@{
        componentProductCode = $row.componentProductCode
        defaultQty = $row.defaultQty
        qtyMode = $row.qtyMode
        componentKind = $row.componentKind
        componentVariant = $row.componentVariant
        isDefault = $row.isDefault
        specText = $row.specText
    }
    if ($includeAllocation) {
        $inputRow.allocationMode = $row.allocationMode
        $inputRow.allocationWeight = $row.allocationWeight
        $inputRow.fixedAllocationAmount = $row.fixedAllocationAmount
    }
    return [pscustomobject]$inputRow
}

function Put-Rows([object[]]$rows) {
    $json = ConvertTo-Json -InputObject ([object[]]$rows) -Depth 6 -Compress
    $content = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
    $response = $client.PutAsync($uri, $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $body }
}

function Contract([object[]]$rows) {
    return @($rows | Sort-Object componentProductCode | ForEach-Object {
        "$($_.componentProductCode)|$($_.allocationMode)|$($_.allocationWeight)|$($_.fixedAllocationAmount)"
    })
}

$original = @(Get-Rows)
try {
    $before = Contract $original
    $fullResult = Put-Rows @($original | ForEach-Object { To-Input $_ $true })
    $afterFull = @(Get-Rows)
    "FULL_NOCHANGE_HTTP=$($fullResult.Status)"
    "FULL_NOCHANGE_DIFF_ROWS=$(@(Compare-Object $before (Contract $afterFull)).Count)"
    "FULL_NOCHANGE_AFTER=$((Contract $afterFull) -join ',')"

    $partialBefore = Contract $afterFull
    $partialResult = Put-Rows @($afterFull | ForEach-Object { To-Input $_ $false })
    $afterPartial = @(Get-Rows)
    "PARTIAL_HTTP=$($partialResult.Status)"
    "PARTIAL_ALLOCATION_DIFF_ROWS=$(@(Compare-Object $partialBefore (Contract $afterPartial)).Count)"
    "PARTIAL_AFTER=$((Contract $afterPartial) -join ',')"

    $badRows = @($afterPartial | ForEach-Object {
        $copy = To-Input $_ $true
        if ($copy.componentProductCode -eq 'AC110BXADHH1') { $copy.allocationWeight = 5 }
        $copy
    })
    $badResult = Put-Rows $badRows
    $afterBad = @(Get-Rows)
    "BAD_SUM_HTTP=$($badResult.Status)"
    "BAD_SUM_BODY=$($badResult.Body)"
    "BAD_SUM_MUTATION_DIFF_ROWS=$(@(Compare-Object (Contract $afterPartial) (Contract $afterBad)).Count)"

    $normalResult = Put-Rows @($afterPartial | ForEach-Object { To-Input $_ $true })
    "NORMAL_SUM10_HTTP=$($normalResult.Status)"

    $newRows = @($afterPartial | ForEach-Object { To-Input $_ $true })
    $newRows += [pscustomobject][ordered]@{
        componentProductCode = 'ACD-2558G'
        defaultQty = 1
        qtyMode = 'FOLLOW_SET'
        componentKind = 'ACCESSORY'
        componentVariant = $null
        isDefault = $false
        specText = $null
        allocationMode = 'FIXED'
        allocationWeight = $null
        fixedAllocationAmount = $null
    }
    $newResult = Put-Rows $newRows
    $afterNew = @(Get-Rows)
    $newRow = @($afterNew | Where-Object componentProductCode -eq 'ACD-2558G')[0]
    "NEW_ROW_HTTP=$($newResult.Status)"
    "NEW_ROW_MODE=$($newRow.allocationMode)"
    "NEW_ROW_WEIGHT=$($newRow.allocationWeight)"
    "NEW_ROW_FIXED_AMOUNT=$($newRow.fixedAllocationAmount)"
}
finally {
    $restoreResult = Put-Rows @($original | ForEach-Object { To-Input $_ $true })
    $restored = @(Get-Rows)
    "RESTORE_HTTP=$($restoreResult.Status)"
    "RESTORE_DIFF_ROWS=$(@(Compare-Object (Contract $original) (Contract $restored)).Count)"
    "RESTORE_ROW_COUNT=$($restored.Count)"
    $client.Dispose()
}
