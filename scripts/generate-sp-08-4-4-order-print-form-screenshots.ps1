param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
if (-not $OutputDir) { $OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-4-4-order-print-form\screenshots') }

Add-Type -AssemblyName System.Drawing

function K([string]$Escaped) {
    return ConvertFrom-Json ('"' + $Escaped + '"')
}

function New-Canvas([string]$Path, [string]$Title, [string]$Subtitle, [scriptblock]$DrawBody) {
    $width = 1365
    $height = 768
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(246, 248, 251))

    $fontTitle = New-Object System.Drawing.Font("Malgun Gothic", 24, [System.Drawing.FontStyle]::Bold)
    $fontSub = New-Object System.Drawing.Font("Malgun Gothic", 12, [System.Drawing.FontStyle]::Regular)
    $black = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 24, 39))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(107, 114, 128))

    $g.DrawString($Title, $fontTitle, $black, 40, 28)
    $g.DrawString($Subtitle, $fontSub, $muted, 43, 68)
    & $DrawBody $g

    New-Item -ItemType Directory -Force -Path (Split-Path $Path) | Out-Null
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

function Draw-Button($g, [int]$x, [int]$y, [int]$w, [string]$text, [System.Drawing.Color]$color) {
    $brush = New-Object System.Drawing.SolidBrush($color)
    $font = New-Object System.Drawing.Font("Malgun Gothic", 11, [System.Drawing.FontStyle]::Bold)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $rect = New-Object System.Drawing.Rectangle $x, $y, $w, 38
    $g.FillRectangle($brush, $rect)
    $g.DrawString($text, $font, $white, ($x + 18), ($y + 8))
}

function Draw-A4Order($g, [int]$x, [int]$y, [double]$scale, [bool]$success) {
    $paperW = [int](520 * $scale)
    $paperH = [int](700 * $scale)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(31, 41, 55), 1)
    $light = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(243, 244, 246))
    $text = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 24, 39))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(75, 85, 99))
    $fontH = New-Object System.Drawing.Font("Malgun Gothic", [float](20 * $scale), [System.Drawing.FontStyle]::Bold)
    $font = New-Object System.Drawing.Font("Malgun Gothic", [float](10 * $scale), [System.Drawing.FontStyle]::Regular)
    $fontB = New-Object System.Drawing.Font("Malgun Gothic", [float](10 * $scale), [System.Drawing.FontStyle]::Bold)

    $g.FillRectangle($white, $x, $y, $paperW, $paperH)
    $g.DrawRectangle($pen, $x, $y, $paperW, $paperH)
    $g.DrawString((K "\uAC70\uB798\uCC98 \uC8FC\uBB38\uC11C"), $fontH, $text, ($x + 185 * $scale), ($y + 28 * $scale))

    $boxY = $y + [int](90 * $scale)
    $boxW = [int](225 * $scale)
    foreach ($i in 0..1) {
        $bx = $x + [int]((32 + ($i * 245)) * $scale)
        $g.DrawRectangle($pen, $bx, $boxY, $boxW, [int](128 * $scale))
        $g.FillRectangle($light, $bx, $boxY, $boxW, [int](25 * $scale))
        $title = if ($i -eq 0) { K "\uAC70\uB798\uCC98 \uC815\uBCF4" } else { K "\uC8FC\uBB38 \uC815\uBCF4" }
        $g.DrawString($title, $fontB, $text, ($bx + 8 * $scale), ($boxY + 5 * $scale))
    }
    $g.DrawString((K "\uAC70\uB798\uCC98\uBA85  \uC0BC\uD55C\uD14C\uC2A4\uD2B8\uACF5\uC870"), $font, $muted, ($x + 44 * $scale), ($y + 128 * $scale))
    $g.DrawString((K "\uC0AC\uC5C5\uC790\uBC88\uD638  1010101010"), $font, $muted, ($x + 44 * $scale), ($y + 160 * $scale))
    $g.DrawString((K "\uC8FC\uBB38\uBC88\uD638  2026/05/17-45"), $font, $muted, ($x + 290 * $scale), ($y + 128 * $scale))
    $g.DrawString((K "\uB0A9\uAE30  2026-05-30"), $font, $muted, ($x + 290 * $scale), ($y + 160 * $scale))
    $g.DrawString((K "\uC0C1\uD0DC  \uD655\uC815"), $font, $muted, ($x + 290 * $scale), ($y + 192 * $scale))

    $tableX = $x + [int](32 * $scale)
    $tableY = $y + [int](245 * $scale)
    $tableW = $paperW - [int](64 * $scale)
    $rowH = [int](34 * $scale)
    for ($r = 0; $r -lt 6; $r++) {
        if ($r -eq 0) { $g.FillRectangle($light, $tableX, ($tableY + $r * $rowH), $tableW, $rowH) }
        $g.DrawRectangle($pen, $tableX, ($tableY + $r * $rowH), $tableW, $rowH)
    }
    $g.DrawString((K "\uD488\uBA85      \uBAA8\uB378\uBA85      \uAD6C\uBD84      \uC218\uB7C9      \uB2E8\uAC00      \uAE08\uC561"), $fontB, $text, ($tableX + 8), ($tableY + 8))
    $g.DrawString((K "\uC2E4\uC678\uAE30   AJ040RXH4BC1   \uD648\uBA40\uD2F0   2   120,000   240,000"), $font, $text, ($tableX + 8), ($tableY + $rowH + 9))
    $g.DrawString((K "\uC18C\uACC4 218,182     \uBD80\uAC00\uC138 21,818     \uD569\uACC4 240,000"), $fontB, $text, ($x + 250 * $scale), ($y + 475 * $scale))
    $g.DrawString((K "\uC0AC\uC6A9\uC790 \uD655\uC778"), $fontB, $text, ($x + 95 * $scale), ($y + 610 * $scale))
    $g.DrawString((K "\uAC70\uB798\uCC98 \uD655\uC778"), $fontB, $text, ($x + 340 * $scale), ($y + 610 * $scale))

    if ($success) {
        $ok = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(5, 150, 105))
        $g.DrawString((K "\uC778\uC1C4 \uAC00\uB2A5"), $fontB, $ok, ($x + 32 * $scale), ($y + 18 * $scale))
    }
}

# 2026-07-28 R2 재수렴 D-B — $OutputDir 는 이제(Resolve-QaShotsDir 경유) 항상 절대경로다.
# 이전엔 기본값이 상대경로라 Get-Location 과 결합이 필요했지만, PowerShell Join-Path 는
# .NET Path.Combine 과 달리 두 번째 인자가 절대경로여도 첫 인자를 버리지 않고 그대로
# 이어붙인다 — absolute+absolute 결합이 "C:\...\C:\..." 형태로 깨져 New-Item/Save 가
# 전부 실패했다(그런데도 exit 0 + "Generated..." 문구 — 사용자가 알아챌 수 없었다).
# 다른 29개 스크립트와 동일하게 $OutputDir 를 그대로 쓴다(이미 절대경로이거나, 명시
# 상대경로 override 시에도 .NET 파일 I/O 가 현재 작업 디렉터리 기준으로 정상 처리한다).
$out = $OutputDir
New-Item -ItemType Directory -Force -Path $out | Out-Null

New-Canvas (Join-Path $out "01-desktop-print-preview.png") (K "\uC8FC\uBB38\uC11C \uC0C1\uC138 - \uC778\uC1C4 \uBC84\uD2BC") (K "SALES/MANAGER/MASTER Desktop \uC778\uC1C4 \uC9C4\uC785, PARTNER Desktop route \uCC28\uB2E8") {
    param($g)
    $panel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $line = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(203, 213, 225), 1)
    $font = New-Object System.Drawing.Font("Malgun Gothic", 12)
    $fontB = New-Object System.Drawing.Font("Malgun Gothic", 15, [System.Drawing.FontStyle]::Bold)
    $text = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 24, 39))
    $g.FillRectangle($panel, 40, 118, 1285, 560)
    $g.DrawRectangle($line, 40, 118, 1285, 560)
    $g.DrawString((K "\uC8FC\uBB38\uC11C \uC0C1\uC138  2026/05/17-45"), $fontB, $text, 72, 150)
    Draw-Button $g 1020 145 90 (K "\uC778\uC1C4") ([System.Drawing.Color]::FromArgb(71, 85, 105))
    Draw-Button $g 1120 145 90 (K "\uC218\uC815") ([System.Drawing.Color]::FromArgb(37, 99, 235))
    Draw-Button $g 1220 145 80 (K "\uC0AD\uC81C") ([System.Drawing.Color]::FromArgb(185, 28, 28))
    $g.DrawString((K "\uAC70\uB798\uCC98 \u00B7 \uC0BC\uD55C\uD14C\uC2A4\uD2B8\uACF5\uC870 (P-PRINT-A)"), $fontB, $text, 72, 230)
    $g.DrawString((K "\uD488\uBAA9\uBA85: \uC2E4\uC678\uAE30 / \uBAA8\uB378\uBA85: AJ040RXH4BC1 / \uD569\uACC4: 240,000\uC6D0"), $font, $text, 72, 290)
}

New-Canvas (Join-Path $out "02-a4-order-print-form.png") (K "\uC8FC\uBB38 \uC778\uC1C4 \uC591\uC2DD A4 mock") (K "Pretendard Variable \uC6B0\uC120, \uAC70\uB798\uCC98\uBA85/\uD55C\uAD6D\uC5B4 \uC0C1\uD0DC/\uB0A0\uC778\uB780 \uD3EC\uD568") {
    param($g)
    Draw-A4Order $g 510 32 1.0 $false
}

New-Canvas (Join-Path $out "03-partner-own-order-print-success.png") (K "PARTNER \uBCF8\uC778 \uC8FC\uBB38 \uC778\uC1C4") (K "X-Partner-Code=P-PRINT-A \uB9E4\uCE6D \uC2DC 200 HTML") {
    param($g)
    Draw-A4Order $g 510 32 1.0 $true
}

New-Canvas (Join-Path $out "04-partner-other-order-print-403.png") (K "PARTNER \uD0C0 \uAC70\uB798\uCC98 \uC8FC\uBB38 403") (K "\uBCF8\uC778 \uAC70\uB798\uCC98 \uC8FC\uBB38\uC11C\uB9CC \uC778\uC1C4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.") {
    param($g)
    $panel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $danger = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(153, 27, 27))
    $dangerBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 226, 226))
    $fontH = New-Object System.Drawing.Font("Malgun Gothic", 30, [System.Drawing.FontStyle]::Bold)
    $font = New-Object System.Drawing.Font("Malgun Gothic", 16, [System.Drawing.FontStyle]::Bold)
    $g.FillRectangle($panel, 340, 180, 680, 320)
    $g.FillRectangle($dangerBg, 390, 265, 580, 110)
    $g.DrawString("403", $fontH, $danger, 620, 205)
    $g.DrawString((K "\uBCF8\uC778 \uAC70\uB798\uCC98 \uC8FC\uBB38\uC11C\uB9CC \uC778\uC1C4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."), $font, $danger, 430, 305)
}

# 2026-07-28 R2 재수렴 N-3 — D-B(절대경로 이중결합)가 New-Item/Save 를 전부 실패시키고도
# exit 0 + 아래 "Generated..." 문구를 그대로 찍어 QA 실행자가 실패를 알아챌 수 없었다.
# 근본 원인(위 $out 결합)은 고쳤지만, 같은 "성공 문구인데 산출물 0" 형태의 재발(예: 디스크
# 공간 부족, 권한 거부 등 다른 원인)을 흡수하지 않도록 산출물 존재·비어있지 않음을 직접
# 확인하고, 부족하면 성공 문구 대신 terminating error 로 exit 0 이 아니게 만든다.
$expectedFiles = @(
    '01-desktop-print-preview.png',
    '02-a4-order-print-form.png',
    '03-partner-own-order-print-success.png',
    '04-partner-other-order-print-403.png'
)
$missingOrEmpty = $expectedFiles | Where-Object {
    $candidate = Join-Path $out $_
    -not (Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -eq 0
}
if ($missingOrEmpty.Count -gt 0) {
    throw "[SP-08-4-4 QA 스크린샷 생성 실패] 누락/빈 파일: $($missingOrEmpty -join ', ') (출력 디렉터리: $out)"
}

Write-Host "Generated SP-08-4-4 QA screenshots in $out"
