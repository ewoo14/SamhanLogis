function Get-SmokeVerdict {
    param(
        [string]$Status,
        [string]$Body
    )

    if ($Status -eq '200') { return 'OK' }
    if ($Status -eq '404') {
        try {
            $json = $Body | ConvertFrom-Json
            if ($json.code -eq 'NOT_FOUND') { return 'BUSINESS_404' }
        } catch {
            # 응답이 JSON이 아니면 경로 404로 남긴다.
        }
        return 'PATH_404'
    }
    return 'NON_200'
}

function Get-SmokeFailureCount {
    param([object[]]$Results)
    return @($Results | Where-Object { $_.Verdict -ne 'OK' }).Count
}
