param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
if (-not $OutputDir) { $OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-5-2-purchase-slip-edit-put\screenshots') }

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
    $malgunKorean = U "\uB9D1\uC740 \uACE0\uB515"
    $families = @("Pretendard", "Malgun Gothic", $malgunKorean)
    foreach ($family in $families) {
        try {
            $font = New-Object System.Drawing.Font($family, $Size, $Style)
            if ($font.Name -eq $family -or $font.Name -eq "Malgun Gothic" -or $font.Name -eq $malgunKorean) {
                return $font
            }
        } catch {
            # Try next Korean-capable fallback.
        }
    }
    return New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $Size, $Style)
}

$fontTitle = New-Font 24 ([System.Drawing.FontStyle]::Bold)
$fontHead = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody = New-Font 12
$fontSmall = New-Font 10
$brushText = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)

function Text {
    param($Graphics, [string]$Value, $Font, $Brush, [int]$X, [int]$Y)
    $Graphics.DrawString((U $Value), $Font, $Brush, $X, $Y)
}

function Badge {
    param($Graphics, [int]$X, [int]$Y, [string]$Value)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 148, 30)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 226, 226))), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $brushRed ($X + 14) ($Y + 8)
}

function InputBox {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [string]$Label, [string]$Value)
    Text $Graphics $Label $fontSmall $brushMuted $X $Y
    $rect = New-Object System.Drawing.Rectangle($X, ($Y + 22), $W, 38)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontBody $brushText ($X + 12) ($Y + 32)
}

$bmp = New-Object System.Drawing.Bitmap(1280, 900)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

Text $g "\uB0D9\uAD00\uC801 \uC7A0\uAE08 \uCDA9\uB3CC" $fontTitle $brushText 44 34
Text $g "409 \uC751\uB2F5 \uC2DC \uCD5C\uC2E0 \uB0B4\uC6A9 \uBD88\uB7EC\uC624\uAE30 \uC548\uB0B4" $fontBody $brushMuted 46 76

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
Badge $g 760 352 "409"
Text $g "\uC0AC\uC6A9\uC790 \uD654\uBA74\uC5D0\uB294 \uB0B4\uBD80 UUID\uB97C \uB178\uCD9C\uD558\uC9C0 \uC54A\uC74C" $fontSmall $brushMuted 180 720

$outPath = Join-Path $OutputDir "02-purchase-edit-conflict-banner.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "generated $outPath"
