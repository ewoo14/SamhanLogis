# mock only — Segoe UI + hex literal; 실 화면은 Pretendard 9 weight + CSS var(--color-*) 사용 (sub-sub-task PR 에서 교체)
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\sp-08-3-dispatch-parity\screenshots'
$OutDir = Resolve-QaShotsDir -CommittedDir $CommittedDir
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Segoe UI'
$Bg = [System.Drawing.ColorTranslator]::FromHtml('#F5F7FA')
$Ink = [System.Drawing.ColorTranslator]::FromHtml('#17212B')
$Muted = [System.Drawing.ColorTranslator]::FromHtml('#596579')
$Line = [System.Drawing.ColorTranslator]::FromHtml('#D7DEE8')
$Card = [System.Drawing.Color]::White
$Blue = [System.Drawing.ColorTranslator]::FromHtml('#2563EB')
$SoftBlue = [System.Drawing.ColorTranslator]::FromHtml('#EFF6FF')
$Green = [System.Drawing.ColorTranslator]::FromHtml('#16A34A')
$SoftGreen = [System.Drawing.ColorTranslator]::FromHtml('#ECFDF5')
$Amber = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
$SoftAmber = [System.Drawing.ColorTranslator]::FromHtml('#FFF7ED')
$Red = [System.Drawing.ColorTranslator]::FromHtml('#DC2626')
$SoftRed = [System.Drawing.ColorTranslator]::FromHtml('#FEF2F2')

function New-Font($Size, $Style = 'Regular') {
    return New-Object System.Drawing.Font($FontFamily, $Size, [System.Drawing.FontStyle]::$Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text($G, [string]$Text, [int]$X, [int]$Y, [int]$Size, $Color, $Style = 'Regular') {
    $font = New-Font $Size $Style
    $brush = New-Object System.Drawing.SolidBrush($Color)
    $G.DrawString($Text, $font, $brush, $X, $Y)
    $brush.Dispose()
    $font.Dispose()
}

function Draw-Rect($G, [int]$X, [int]$Y, [int]$W, [int]$H, $Fill, $Border = $null) {
    $brush = New-Object System.Drawing.SolidBrush($Fill)
    $G.FillRectangle($brush, $X, $Y, $W, $H)
    $brush.Dispose()
    if ($null -ne $Border) {
        $pen = New-Object System.Drawing.Pen -ArgumentList $Border, 1
        $G.DrawRectangle($pen, $X, $Y, $W, $H)
        $pen.Dispose()
    }
}

function Draw-Button($G, [string]$Text, [int]$X, [int]$Y, [int]$W, $Fill, $TextColor) {
    Draw-Rect $G $X $Y $W 34 $Fill $Fill
    Draw-Text $G $Text ($X + 14) ($Y + 8) 14 $TextColor 'Bold'
}

function Draw-Chrome($G, [string]$Title, [string]$Subtitle) {
    Draw-Rect $G 0 0 1280 900 $Bg
    Draw-Rect $G 0 0 246 900 ([System.Drawing.ColorTranslator]::FromHtml('#17212B'))
    Draw-Text $G 'Samhan Public' 28 28 26 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $G 'Dispatch parity' 28 112 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    Draw-Rect $G 24 148 198 38 ([System.Drawing.ColorTranslator]::FromHtml('#1E3A5F')) $Blue
    Draw-Text $G 'Pre-classify' 42 158 15 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $G 'Unassigned' 42 204 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $G 'Slip cleanup' 42 250 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $G 'Dispatch SMS' 42 296 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))

    Draw-Text $G $Title 286 34 28 $Ink 'Bold'
    Draw-Text $G $Subtitle 288 72 14 $Muted
}

function Draw-HeaderRow($G, [int]$Y) {
    Draw-Text $G 'legacy GAS' 304 $Y 14 $Muted 'Bold'
    Draw-Text $G 'current endpoint' 514 $Y 14 $Muted 'Bold'
    Draw-Text $G 'history endpoint' 810 $Y 14 $Muted 'Bold'
    Draw-Text $G 'programType' 1060 $Y 14 $Muted 'Bold'
}

function Draw-MatrixRow($G, [int]$Y, [string]$Legacy, [string]$Endpoint, [string]$History, [string]$Program) {
    Draw-Text $G $Legacy 304 $Y 13 $Ink
    Draw-Text $G $Endpoint 514 $Y 13 $Ink
    Draw-Text $G $History 810 $Y 13 $Ink
    Draw-Text $G $Program 1060 $Y 13 $Blue 'Bold'
}

function Save-Shot([string]$Name, [scriptblock]$Draw) {
    $bitmap = New-Object System.Drawing.Bitmap 1280, 900
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    & $Draw $graphics
    $path = Join-Path $OutDir $Name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $file = Get-Item $path
    if ($file.Length -le 0) { throw "empty PNG: $path" }
    Write-Host "generated $($file.FullName) $($file.Length) bytes"
}

Save-Shot '01-six-endpoint-matrix.png' {
    param($G)
    Draw-Chrome $G 'SP-08-3 Dispatch 6-screen matrix' 'Lock legacy GAS save/restore/preview/send flow to Samhan DB/API history'
    Draw-Rect $G 286 132 900 380 $Card $Line
    Draw-HeaderRow $G 162
    Draw-MatrixRow $G 210 'Pre-classify' 'GET /admin/arologis/dispatches/pre-classify' '/admin/arologis/dispatches/history' 'PRE_CLASSIFY'
    Draw-MatrixRow $G 258 'Regional pre-classify' 'GET /admin/arologis/dispatches/regional' '/admin/arologis/dispatches/history' 'REGIONAL'
    Draw-MatrixRow $G 306 'Unassigned' 'GET /admin/arologis/dispatches/unassigned' '/admin/arologis/dispatches/history' 'UNASSIGNED'
    Draw-MatrixRow $G 354 'Carrier reconcile' 'POST /admin/arologis/dispatch/reconcile' '/admin/arologis/dispatches/history' 'RECONCILE'
    Draw-MatrixRow $G 402 'Slip cleanup' 'GET /slips/cleanup' '/slips/cleanup/history' 'SLIP_CLEANUP'
    Draw-MatrixRow $G 450 'Dispatch SMS' 'POST /admin/notifications/dispatch-batch/*' '/admin/notifications/dispatch-sms/history' 'DISPATCH_SMS'
}

Save-Shot '02-arologis-history-seat.png' {
    param($G)
    Draw-Chrome $G 'arologis history seat lock' 'SP-08-3-2 target: pre-classify/regional/unassigned/reconcile'
    Draw-Rect $G 286 138 900 254 $Card $Line
    Draw-Text $G 'dispatch_save_history' 316 174 24 $Blue 'Bold'
    Draw-Text $G 'Flyway: re-check V*.sql then latest+1 - AUTO_LATEST / MANUAL_NAMED' 316 216 16 $Ink
    Draw-Rect $G 316 264 824 1 $Line
    Draw-Text $G 'Shared endpoint: POST/GET /admin/arologis/dispatches/history' 316 292 16 $Ink
    Draw-Text $G 'detail/latest: /history/{id}, /history/latest?programType=' 316 326 16 $Muted
    Draw-Text $G 'row testid: pre-classify/unassigned/dispatch-reconcile-history-row-{i}; UUID hidden' 316 360 16 $Green 'Bold'
}

Save-Shot '03-slip-cleanup-history-seat.png' {
    param($G)
    Draw-Chrome $G 'Slip cleanup history seat lock' 'SP-08-3-3 target: /sales/slip-cleanup run/history tabs'
    Draw-Rect $G 286 138 900 254 $Card $Line
    Draw-Text $G 'slip_cleanup_save_history' 316 174 24 $Blue 'Bold'
    Draw-Text $G 'Flyway: re-check V*.sql then latest+1 - programType=SLIP_CLEANUP' 316 216 16 $Ink
    Draw-Rect $G 316 264 824 1 $Line
    Draw-Text $G 'Current source: GET /slips/cleanup' 316 292 16 $Ink
    Draw-Text $G 'history: POST/GET /slips/cleanup/history' 316 326 16 $Ink
    Draw-Text $G 'Month-end cleanup result uses topic-based MANUAL_NAMED append' 316 360 16 $Green 'Bold'
}

Save-Shot '04-dispatch-sms-preview-send.png' {
    param($G)
    Draw-Chrome $G 'Dispatch SMS preview/send audit' 'SP-08-3-4 target: preview save + send audit append'
    Draw-Rect $G 286 138 900 330 $Card $Line
    Draw-Text $G 'dispatch_sms_save_history' 316 174 24 $Blue 'Bold'
    Draw-Text $G 'Flyway: re-check V*.sql then latest+1 - DISPATCH_SMS' 316 216 16 $Ink
    Draw-Rect $G 316 262 230 80 $SoftBlue $Blue
    Draw-Text $G 'PREVIEW' 338 286 18 $Blue 'Bold'
    Draw-Text $G 'AUTO_LATEST / MANUAL_NAMED' 338 318 14 $Ink
    Draw-Rect $G 574 262 230 80 $SoftAmber $Amber
    Draw-Text $G 'SEND' 596 286 18 $Amber 'Bold'
    Draw-Text $G 'SEND_AUDIT append' 596 318 14 $Ink
    Draw-Rect $G 832 262 230 80 $SoftGreen $Green
    Draw-Text $G 'DRY RUN' 854 286 18 $Green 'Bold'
    Draw-Text $G 'Aligo live API disabled' 854 318 14 $Ink
    Draw-Text $G 'send audit row: dispatch-sms-history-row-{i}-send-audit' 316 398 16 $Green 'Bold'
}

Save-Shot '05-uuid-notion-zero-scan.png' {
    param($G)
    Draw-Chrome $G 'UUID / Notion runtime zero guard' 'Static contract and grep guard block SP-08-1 regression'
    Draw-Rect $G 286 138 900 300 $Card $Line
    Draw-Text $G 'PASS' 316 180 38 $Green 'Bold'
    Draw-Text $G 'UUID literal scan: 0' 316 246 18 $Ink
    Draw-Text $G 'Notion runtime markers: api.notion.com / Notion-Version / @notionhq = 0' 316 292 18 $Ink
    Draw-Text $G 'Secret-like markers: Notion key / DB id / Sheet id / Aligo key / PRIVATE KEY = 0' 316 338 18 $Ink
    Draw-Text $G 'User-facing ids: topic, author, createdAt, slipNo, partnerName' 316 384 18 $Blue 'Bold'
}

Save-Shot '06-sp-08-2-pattern-consistency.png' {
    param($G)
    Draw-Chrome $G 'Reuse SP-08-2 DPS pattern' 'All six dispatch screens follow the same 2-tab history UX'
    Draw-Rect $G 286 138 900 360 $Card $Line
    Draw-Text $G 'Run tab' 326 182 22 $Blue 'Bold'
    Draw-Text $G 'latest AUTO_LATEST restore; silent auto-save after run; named save button' 326 226 16 $Ink
    Draw-Rect $G 326 270 790 1 $Line
    Draw-Text $G 'History tab' 326 306 22 $Blue 'Bold'
    Draw-Text $G 'from/to range; mode select; row click detail restore; row index testid' 326 350 16 $Ink
    Draw-Rect $G 326 394 790 1 $Line
    Draw-Text $G 'BaseEntity 7 audit + Soft Delete only + JSONB payload + user isolation' 326 430 16 $Green 'Bold'
}

$expected = @(
    '01-six-endpoint-matrix.png',
    '02-arologis-history-seat.png',
    '03-slip-cleanup-history-seat.png',
    '04-dispatch-sms-preview-send.png',
    '05-uuid-notion-zero-scan.png',
    '06-sp-08-2-pattern-consistency.png'
)

$pngs = Get-ChildItem $OutDir -Filter '*.png'
foreach ($name in $expected) {
    $path = Join-Path $OutDir $name
    if (-not (Test-Path $path)) {
        throw "Missing $name"
    }
}

if ($pngs.Count -ne $expected.Count) {
    throw "expected exactly $($expected.Count) PNGs, got $($pngs.Count)"
}

foreach ($png in $pngs) {
    $image = [System.Drawing.Image]::FromFile($png.FullName)
    try {
        if ($image.Width -ne 1280 -or $image.Height -ne 900) {
            throw "unexpected PNG size: $($png.FullName) $($image.Width)x$($image.Height)"
        }
    } finally {
        $image.Dispose()
    }
}
