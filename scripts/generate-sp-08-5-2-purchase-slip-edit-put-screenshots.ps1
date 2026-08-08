param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-5-2-purchase-slip-edit-put\screenshots') -RequestedDir $OutputDir

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
$fontHead = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody = New-Font 12
$fontSmall = New-Font 10
$brushText = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$brushAmber = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 83, 9))
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)

function Text {
    param($Graphics, [string]$Value, $Font, $Brush, [int]$X, [int]$Y)
    $Graphics.DrawString((U $Value), $Font, $Brush, $X, $Y)
}

function Badge {
    param($Graphics, [int]$X, [int]$Y, [string]$Value, [string]$Tone)
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254)
    $fg = $brushBlue
    if ($Tone -eq "good") { $bg = [System.Drawing.Color]::FromArgb(209, 250, 229); $fg = $brushGreen }
    if ($Tone -eq "danger") { $bg = [System.Drawing.Color]::FromArgb(254, 226, 226); $fg = $brushRed }
    if ($Tone -eq "warn") { $bg = [System.Drawing.Color]::FromArgb(254, 243, 199); $fg = $brushAmber }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 148, 30)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $fg ($X + 14) ($Y + 8)
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
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Text $g $Title $fontTitle $brushText 44 34
    Text $g $Subtitle $fontBody $brushMuted 46 76
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
    $c = Canvas "01-purchase-edit-form.png" "\uB9E4\uC785 \uC804\uD45C \uC218\uC815" "\uAD6C\uB9E4\uBC88\uD638\u00b7\uAC70\uB798\uCC98\u00b7\uD488\uBAA9\u00b7\uB2E8\uAC00\u00b7\uD569\uACC4"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $panel = New-Object System.Drawing.Rectangle(140, 126, 1000, 660)
    $g.FillRectangle([System.Drawing.Brushes]::White, $panel)
    $g.DrawRectangle($penBorder, $panel)
    Text $g "\uB9E4\uC785 \uC804\uD45C \uC218\uC815" $fontHead $brushText 180 166
    Badge $g 930 164 "\uC800\uC7A5 \uAC00\uB2A5" "good"
    InputBox $g 180 230 210 "\uAD6C\uB9E4\uBC88\uD638" "2026/05/18-1"
    InputBox $g 420 230 260 "\uAC70\uB798\uCC98" "\uC0BC\uD55C\uACF5\uC870"
    InputBox $g 710 230 250 "\uC0AC\uC5C5\uC790\uBC88\uD638" "123-45-67890"
    InputBox $g 180 320 780 "\uBE44\uACE0" "\uC785\uACE0 \uD655\uC778 \uD6C4 \uB2E8\uAC00 \uC870\uC815"
    $g.DrawLine($penSoft, 180, 424, 1100, 424)
    Text $g "\uD488\uBAA9" $fontSmall $brushMuted 200 460
    Text $g "\uBAA8\uB378" $fontSmall $brushMuted 430 460
    Text $g "\uC218\uB7C9" $fontSmall $brushMuted 650 460
    Text $g "\uB2E8\uAC00" $fontSmall $brushMuted 760 460
    Text $g "\uD569\uACC4" $fontSmall $brushMuted 930 460
    Text $g "\uC2E4\uC678\uAE30" $fontBody $brushText 200 504
    Text $g "PUR-001" $fontBody $brushText 430 504
    Text $g "3" $fontBody $brushText 650 504
    Text $g "120,000\uC6D0" $fontBody $brushText 760 504
    Text $g "360,000\uC6D0" $fontBody $brushText 930 504
    Text $g "\uC2E4\uB0B4\uAE30" $fontBody $brushText 200 568
    Text $g "PUR-002" $fontBody $brushText 430 568
    Text $g "1" $fontBody $brushText 650 568
    Text $g "80,000\uC6D0" $fontBody $brushText 760 568
    Text $g "80,000\uC6D0" $fontBody $brushText 930 568
    Text $g "\uD569\uACC4 440,000\uC6D0" $fontHead $brushBlue 868 690
    Save $bmp $g $path
}

function Shot2 {
    $c = Canvas "02-purchase-edit-conflict-banner.png" "\uB0D9\uAD00\uC801 \uC7A0\uAE08 \uCDA9\uB3CC" "409 \uC751\uB2F5 \uC2DC \uCD5C\uC2E0 \uB0B4\uC6A9 \uBD88\uB7EC\uC624\uAE30 \uC548\uB0B4"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $banner = New-Object System.Drawing.Rectangle(164, 170, 952, 92)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 226, 226))), $banner)
    $g.DrawRectangle($penBorder, $banner)
    Text $g "\uB2E4\uB978 \uC0AC\uC6A9\uC790\uAC00 \uBA3C\uC800 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4." $fontHead $brushRed 204 194
    Text $g "\uCD5C\uC2E0 \uB0B4\uC6A9 \uBD88\uB7EC\uC624\uAE30 \uD6C4 \uB2E4\uC2DC \uC800\uC7A5\uD574 \uC8FC\uC138\uC694." $fontBody $brushRed 204 230
    $button = New-Object System.Drawing.Rectangle(830, 198, 220, 38)
    $g.FillRectangle([System.Drawing.Brushes]::White, $button)
    $g.DrawRectangle($penBorder, $button)
    Text $g "\uCD5C\uC2E0 \uB0B4\uC6A9 \uBD88\uB7EC\uC624\uAE30" $fontSmall $brushText 858 209
    InputBox $g 180 330 260 "\uAC70\uB798\uCC98" "\uC0BC\uD55C\uACF5\uC870"
    InputBox $g 470 330 260 "\uC218\uC815 \uC694\uCCAD \uC2DC\uAC01" "2026-05-18 14:22"
    Badge $g 760 352 "409" "danger"
    Text $g "\uC0AC\uC6A9\uC790 \uD654\uBA74\uC5D0\uB294 \uB0B4\uBD80 UUID\uB97C \uB178\uCD9C\uD558\uC9C0 \uC54A\uC74C" $fontSmall $brushMuted 180 720
    Save $bmp $g $path
}

function Shot3 {
    $c = Canvas "03-purchase-edit-audit-timeline.png" "\uAC10\uC0AC \uC774\uB825" "SLIP_EDIT 1 revision \uAE30\uB85D"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $card = New-Object System.Drawing.Rectangle(190, 150, 900, 610)
    $g.FillRectangle([System.Drawing.Brushes]::White, $card)
    $g.DrawRectangle($penBorder, $card)
    Text $g "\uBCC0\uACBD \uC774\uB825" $fontHead $brushText 240 194
    Badge $g 860 190 "SLIP_EDIT" "info"
    $g.DrawLine($penSoft, 260, 270, 260, 640)
    $points = @(302, 420, 538)
    foreach ($py in $points) {
        $g.FillEllipse($brushBlue, 252, $py, 16, 16)
    }
    Text $g "\uBCC0\uACBD\uC790" $fontSmall $brushMuted 310 292
    Text $g "\uAE40\uC6B4\uC601 \uB9E4\uB2C8\uC800" $fontBody $brushText 310 320
    Text $g "\uC77C\uC2DC" $fontSmall $brushMuted 310 410
    Text $g "2026-05-18 14:24" $fontBody $brushText 310 438
    Text $g "\uBCC0\uACBD \uD544\uB4DC" $fontSmall $brushMuted 310 528
    Text $g "\uAC70\uB798\uCC98, \uB2E8\uAC00, \uBE44\uACE0, \uD569\uACC4" $fontBody $brushText 310 556
    Text $g "\uB0B4\uBD80 actorId\uB294 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uACE0 \uBCC0\uACBD\uC790\uBA85\uB9CC \uC0AC\uC6A9" $fontSmall $brushMuted 240 690
    Save $bmp $g $path
}

function Shot4 {
    $c = Canvas "04-purchase-edit-inventory-guard.png" "\uAD8C\uD55C \uAC00\uB4DC" "INVENTORY \uC5ED\uD560\uC740 \uC218\uC815 \uBC84\uD2BC \uBE44\uB178\uCD9C"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    $card = New-Object System.Drawing.Rectangle(250, 220, 780, 360)
    $g.FillRectangle([System.Drawing.Brushes]::White, $card)
    $g.DrawRectangle($penBorder, $card)
    Badge $g 300 270 "403" "danger"
    Text $g "\uB9E4\uC785 \uC804\uD45C \uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" $fontHead $brushText 300 326
    Text $g "\uD5C8\uC6A9 \uC5ED\uD560: WAREHOUSE / MANAGER / MASTER" $fontBody $brushMuted 300 376
    Text $g "INVENTORY / SALES / ACCOUNTANT\uB294 direct PUT \uC811\uADFC \uC2DC 403\uC73C\uB85C \uCC28\uB2E8\uD569\uB2C8\uB2E4." $fontBody $brushMuted 300 416
    Text $g "\uD654\uBA74\uC5D0\uC11C\uB294 \uC218\uC815 \uBC84\uD2BC\uC744 \uB80C\uB354\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." $fontBody $brushBlue 300 486
    Save $bmp $g $path
}

Shot1
Shot2
Shot3
Shot4

Write-Host "SP-08-5-2 QA mock screenshots generated in $OutputDir"
