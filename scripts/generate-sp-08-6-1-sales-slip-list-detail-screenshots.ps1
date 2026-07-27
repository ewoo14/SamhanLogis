param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-6-1-sales-slip-list-detail\screenshots') -RequestedDir $OutputDir

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function U {
    param([string]$Text)
    return [regex]::Replace($Text, "\\u([0-9A-Fa-f]{4})", {
        param($m)
        [char][Convert]::ToInt32($m.Groups[1].Value, 16)
    })
}

function New-Font {
    param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    try { return New-Object System.Drawing.Font("Pretendard", $Size, $Style) }
    catch { return New-Object System.Drawing.Font("Malgun Gothic", $Size, $Style) }
}

$fontTitle = New-Font 24 ([System.Drawing.FontStyle]::Bold)
$fontHead  = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody  = New-Font 12
$fontSmall = New-Font 10
$brushText  = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft    = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)
$penYellow  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(251, 191, 36), 1)

function Text {
    param($Graphics, [string]$Value, $Font, $Brush, [int]$X, [int]$Y)
    $Graphics.DrawString((U $Value), $Font, $Brush, $X, $Y)
}

function Badge {
    param($Graphics, [int]$X, [int]$Y, [string]$Value, [string]$Tone)
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254)
    $fg = $brushBlue
    if ($Tone -eq "good")   { $bg = [System.Drawing.Color]::FromArgb(209, 250, 229); $fg = $brushGreen }
    if ($Tone -eq "danger") { $bg = [System.Drawing.Color]::FromArgb(254, 226, 226); $fg = $brushRed }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 136, 30)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $fg ($X + 14) ($Y + 8)
}

function SecondaryButton {
    param($Graphics, [int]$X, [int]$Y, [string]$Value)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 92, 34)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $brushText ($X + 22) ($Y + 9)
}

function InputBox {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [string]$Label, [string]$Value)
    Text $Graphics $Label $fontSmall $brushMuted $X $Y
    $rect = New-Object System.Drawing.Rectangle($X, ($Y + 22), $W, 38)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontBody $brushText ($X + 12) ($Y + 32)
}

function Canvas {
    param([string]$FileName, [string]$Title, [string]$Subtitle)
    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Text $g $Title    $fontTitle $brushText  44 34
    Text $g $Subtitle $fontBody  $brushMuted 46 76
    return @($bmp, $g, (Join-Path $OutputDir $FileName))
}

function Save {
    param($Bitmap, $Graphics, [string]$Path)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Graphics.Dispose()
    $Bitmap.Dispose()
    Write-Host "generated $Path"
}

function Shot1 {
    $c   = Canvas "01-sales-query-list.png" "\uD310\uB9E4\uAD00\uB9AC" "\uB9E4\uCD9C \uC804\uD45C \uBAA9\uB85D"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    InputBox $g  46 124 170 "\uC2DC\uC791\uC77C" "2026-05-01"
    InputBox $g 232 124 170 "\uC885\uB8CC\uC77C" "2026-05-18"
    InputBox $g 418 124 230 "\uAC70\uB798\uCC98\uBA85" "\uC804\uCCB4"
    InputBox $g 664 124 230 "\uD310\uB9E4\uBC88\uD638" "2026/05/18-1"
    Badge $g 930 146 "50/page" "info"
    $rect = New-Object System.Drawing.Rectangle(46, 230, 1188, 490)
    $g.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $g.DrawRectangle($penBorder, $rect)
    $headers = @("\uD310\uB9E4\uBC88\uD638", "\uAC70\uB798\uCC98", "\uAC70\uB798\uCC98\uCF54\uB4DC", "\uBC30\uC1A1\uC8FC\uC18C", "\uAE08\uC561", "\uB2F4\uB2F9\uC790\uBA85", "\uC0C1\uD0DC", "\uC0C1\uC138")
    $xs = @(70, 220, 360, 478, 660, 838, 976, 1112)
    for ($i = 0; $i -lt $headers.Length; $i++) { Text $g $headers[$i] $fontSmall $brushMuted $xs[$i] 254 }
    $rows = @(
        @("2026/05/18-1", "\uC0BC\uC131\uBB3C\uC0B0", "123-45-67890", "\uC11C\uC6B8 \uAC15\uB0A8\uAD6C", "1,200,000\uC6D0", "\uD64D\uAE38\uB3D9", "\uC800\uC7A5\uC644\uB8CC"),
        @("2026/05/18-2", "\uD604\uB300\uAC74\uC124", "234-56-78901", "\uBD80\uC0B0 \uD574\uC6B4\uAD6C", "850,000\uC6D0", "\uAE40\uCCA0\uC218", "\uD655\uC815"),
        @("2026/05/17-3", "\uD55C\uD654\uADF8\uB8F9", "345-67-89012", "\uC778\uCC9C \uC0AC\uC6B0\uAD6C", "3,600,000\uC6D0", "\uD64D\uAE38\uB3D9", "\uC800\uC7A5\uC644\uB8CC"),
        @("2026/05/17-2", "\uB300\uC6B0\uAC74\uC124", "456-78-90123", "\uB300\uC804 \uC720\uC131\uAD6C", "720,000\uC6D0", "\uC774\uBBFC\uC900", "\uC800\uC7A5\uC644\uB8CC"),
        @("2026/05/16-1", "\uD3EC\uC2A4\uCF54", "567-89-01234", "\uAD11\uC8FC \uC11C\uAD6C", "480,000\uC6D0", "\uD64D\uAE38\uB3D9", "\uD655\uC815")
    )
    $y = 306
    foreach ($row in $rows) {
        for ($i = 0; $i -lt ($row.Length - 1); $i++) { Text $g $row[$i] $fontBody $brushText $xs[$i] $y }
        Badge $g $xs[6] ($y - 6) $row[6] "info"
        SecondaryButton $g 1112 ($y - 7) "\uC0C1\uC138"
        $g.DrawLine($penSoft, 64, $y + 42, 1216, $y + 42)
        $y += 66
    }
    Text $g "\uB0B4\uBD80 UUID\uB294 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uACE0 \uD310\uB9E4\uBC88\uD638(slipNo)\uB9CC \uB178\uCD9C -- UUID \uBE44\uACF5\uAC1C \uAC00\uB4DC \uC801\uC6A9" $fontSmall $brushMuted 46 830
    Save $bmp $g $path
}

function Shot2 {
    $c   = Canvas "02-sales-detail-view.png" "\uB9E4\uCD9C \uC0C1\uC138" "\uD310\uB9E4\uBC88\uD638 2026/05/18-1 \uC0C1\uC138"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $panel = New-Object System.Drawing.Rectangle(100, 130, 1080, 660)
    $g.FillRectangle([System.Drawing.Brushes]::White, $panel)
    $g.DrawRectangle($penBorder, $panel)
    Text $g "\uD310\uB9E4\uBC88\uD638 2026/05/18-1" $fontHead $brushText 140 170
    Badge $g 960 168 "\uC800\uC7A5\uC644\uB8CC" "info"
    Text $g "\uAC70\uB798\uCC98"       $fontSmall $brushMuted 140 230
    Text $g "\uC0BC\uC131\uBB3C\uC0B0" $fontBody  $brushText  140 256
    Text $g "\uAC70\uB798\uCC98\uCF54\uB4DC" $fontSmall $brushMuted 360 230
    Text $g "123-45-67890"             $fontBody  $brushText  360 256
    Text $g "\uCD9C\uACE0\uCC3D\uACE0" $fontSmall $brushMuted 600 230
    Text $g "\uBCF8\uC0AC\uCC3D\uACE0" $fontBody  $brushText  600 256
    Text $g "\uB2F4\uB2F9\uC790"       $fontSmall $brushMuted 840 230
    Text $g "\uD64D\uAE38\uB3D9"       $fontBody  $brushText  840 256
    $g.DrawLine($penSoft, 140, 308, 1140, 308)
    Text $g "\uD488\uBAA9\uBA85"   $fontSmall $brushMuted 160 344
    Text $g "\uBAA8\uB378\uCF54\uB4DC" $fontSmall $brushMuted 420 344
    Text $g "\uC218\uB7C9"         $fontSmall $brushMuted 620 344
    Text $g "\uB2E8\uAC00"         $fontSmall $brushMuted 730 344
    Text $g "\uC18C\uACC4"         $fontSmall $brushMuted 900 344
    Text $g "\uC5D0\uC5B4\uCF58 \uBB3C\uBCF4\uAD50\uCCB4" $fontBody $brushText 160 386
    Text $g "SAL-001"       $fontBody $brushText 420 386
    Text $g "2"             $fontBody $brushText 620 386
    Text $g "400,000\uC6D0" $fontBody $brushText 730 386
    Text $g "800,000\uC6D0" $fontBody $brushText 900 386
    Text $g "\uD55C\uC2DC\uC5D0\uC5B4\uCF58 \uD544\uD130" $fontBody $brushText 160 446
    Text $g "SAL-002"       $fontBody $brushText 420 446
    Text $g "4"             $fontBody $brushText 620 446
    Text $g "100,000\uC6D0" $fontBody $brushText 730 446
    Text $g "400,000\uC6D0" $fontBody $brushText 900 446
    $g.DrawLine($penSoft, 140, 500, 1140, 500)
    Text $g "\uD569\uACC4 1,200,000\uC6D0" $fontHead $brushBlue 860 640
    $ctaRect = New-Object System.Drawing.Rectangle(140, 700, 960, 60)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 245, 255))), $ctaRect)
    $g.DrawRectangle($penBorder, $ctaRect)
    Text $g "\uCD9C\uACE0\uC804\uD658 / \uAC70\uB798\uBA85\uC138\uC11C \uCD9C\uB825 / \uACC4\uC0B0\uC11C \uCD9C\uB825 -- SP-08-6-4 \uAD6C\uD604 \uC608\uC815" $fontSmall $brushMuted 160 724
    Save $bmp $g $path
}

function Shot3 {
    $c   = Canvas "03-cta-shipment-confirm.png" "\uB9E4\uCD9C CTA \uC790\uB9AC" "\uCD9C\uACE0\uC804\uD658 / \uAC70\uB798\uBA85\uC138\uC11C / \uACC4\uC0B0\uC11C (SP-08-6-4 \uC608\uC815)"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $rect = New-Object System.Drawing.Rectangle(46, 140, 1188, 280)
    $g.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $g.DrawRectangle($penBorder, $rect)
    $headers = @("\uD310\uB9E4\uBC88\uD638", "\uAC70\uB798\uCC98", "\uAE08\uC561", "\uB2F4\uB2F9\uC790", "\uC0C1\uD0DC", "CTA (\uC790\uB9AC\uD45C\uC2DC)")
    $xs = @(70, 244, 480, 640, 790, 940)
    for ($i = 0; $i -lt $headers.Length; $i++) { Text $g $headers[$i] $fontSmall $brushMuted $xs[$i] 174 }
    Text $g "2026/05/18-1" $fontBody $brushText 70  226
    Text $g "\uC0BC\uC131\uBB3C\uC0B0" $fontBody $brushText 244 226
    Text $g "1,200,000\uC6D0" $fontBody $brushText 480 226
    Text $g "\uD64D\uAE38\uB3D9"       $fontBody $brushText 640 226
    Badge $g 788 218 "\uC800\uC7A5\uC644\uB8CC" "info"
    $ctaBtn1 = New-Object System.Drawing.Rectangle(938, 216, 108, 30)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 246, 255))), $ctaBtn1)
    $g.DrawRectangle($penBorder, $ctaBtn1)
    Text $g "\uCD9C\uACE0\uC804\uD658" $fontSmall $brushBlue 948 224
    $g.DrawLine($penSoft, 64, 270, 1216, 270)
    Text $g "2026/05/17-3" $fontBody $brushText 70  310
    Text $g "\uD55C\uD654\uADF8\uB8F9" $fontBody $brushText 244 310
    Text $g "3,600,000\uC6D0" $fontBody $brushText 480 310
    Text $g "\uD64D\uAE38\uB3D9"       $fontBody $brushText 640 310
    Badge $g 788 302 "\uD655\uC815" "good"
    $ctaBtn2 = New-Object System.Drawing.Rectangle(938, 300, 118, 30)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 246, 255))), $ctaBtn2)
    $g.DrawRectangle($penBorder, $ctaBtn2)
    Text $g "\uAC70\uB798\uBA85\uC138\uC11C" $fontSmall $brushBlue 944 308
    $noteRect = New-Object System.Drawing.Rectangle(46, 470, 1188, 190)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 251, 235))), $noteRect)
    $g.DrawRectangle($penYellow, $noteRect)
    Text $g "SP-08-6-4 \uAD6C\uD604 \uD6C4 \uD65C\uC131\uD654\uB418\uB294 CTA (SP-08-6-1 \uC2AC\uB77C\uC774\uC2A4\uC5D0\uC11C\uB294 \uC790\uB9AC\uD45C\uC2DC\uB9CC)" $fontBody $brushText 66 496
    Text $g "\uCD9C\uACE0\uC804\uD658: SAVED / CONFIRMED \uC0C1\uD0DC\uC5D0\uC11C \uD65C\uC131\uD654 \uD6C4 inventory-service /deduct \uD638\uCD9C" $fontSmall $brushMuted 66 530
    Text $g "\uAC70\uB798\uBA85\uC138\uC11C / \uACC4\uC0B0\uC11C \uCD9C\uB825: CONFIRMED \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uD65C\uC131\uD654 (SP-08-5-5 \uD328\uD134)" $fontSmall $brushMuted 66 558
    Text $g "SHIPPABLE_STATUSES = [SAVED, CONFIRMED] -- SP-03 INSPECTABLE_STATUSES \uB300\uCE6D \uAD6C\uC870" $fontSmall $brushMuted 66 590
    Save $bmp $g $path
}

function Shot4 {
    $c   = Canvas "04-permission-guard-inventory.png" "\uAD8C\uD55C \uAC00\uB4DC" "INVENTORY / WAREHOUSE \uC5ED\uD560 403 \uCC28\uB2E8"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $card = New-Object System.Drawing.Rectangle(200, 180, 880, 380)
    $g.FillRectangle([System.Drawing.Brushes]::White, $card)
    $g.DrawRectangle($penBorder, $card)
    Badge $g 260 230 "403 Forbidden" "danger"
    Text $g "\uB9E4\uCD9C \uC804\uD45C \uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" $fontHead $brushText 260 286
    Text $g "\uD5C8\uC6A9 \uC5ED\uD560: SALES / MANAGER / MASTER" $fontBody $brushMuted 260 336
    Text $g "INVENTORY: \uBC30\uC1A1/\uAC80\uC218 \uB2E8\uACC4\uB9CC \uCC98\uB9AC\uAD8C, \uB9E4\uCD9C \uC870\uD68C \uBBF8\uD5C8\uAC00" $fontSmall $brushMuted 260 374
    Text $g "WAREHOUSE: INBOUND(\uC785\uACE0) \uC870\uD68C\uB9CC \uD5C8\uC6A9, OUTBOUND(\uCD9C\uACE0/\uB9E4\uCD9C) \uBBF8\uD5C8\uAC00" $fontSmall $brushMuted 260 408
    Text $g "\uADFC\uAC70: SP-03 \uAD8C\uD55C \uB9E4\uD2B8\uB9AD\uC2A4 - \uCD9C\uACE0(OUTBOUND) \uC804\uD45C\uB294 \uC601\uC5C5/\uAD00\uB9AC \uC9C1\uAD70 \uC804\uC6A9" $fontSmall $brushMuted 260 442
    $tableRect = New-Object System.Drawing.Rectangle(200, 600, 880, 210)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(249, 250, 251))), $tableRect)
    $g.DrawRectangle($penBorder, $tableRect)
    Text $g "\uC5ED\uD560"           $fontSmall $brushMuted 230 630
    Text $g "OUTBOUND(\uB9E4\uCD9C)"  $fontSmall $brushMuted 430 630
    Text $g "INBOUND(\uB9E4\uC785)"   $fontSmall $brushMuted 700 630
    $g.DrawLine($penSoft, 210, 652, 1060, 652)
    Text $g "SALES"                   $fontBody $brushText 230 668
    Badge $g 418 662 "\uD5C8\uC6A9" "good"
    Badge $g 688 662 "\uAC70\uBD80" "danger"
    Text $g "INVENTORY"               $fontBody $brushText 230 720
    Badge $g 418 714 "\uAC70\uBD80" "danger"
    Badge $g 688 714 "\uAC70\uBD80" "danger"
    Text $g "WAREHOUSE"               $fontBody $brushText 230 756
    Badge $g 418 750 "\uAC70\uBD80" "danger"
    Badge $g 688 750 "\uD5C8\uC6A9" "good"
    Save $bmp $g $path
}

Shot1
Shot2
Shot3
Shot4

Write-Host "SP-08-6-1 QA mock screenshots generated in $OutputDir"
