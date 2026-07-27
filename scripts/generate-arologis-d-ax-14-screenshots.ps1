# scripts/generate-arologis-d-ax-14-screenshots.ps1
#
# D-AX-14 (자동 폰번호 인식 + 1-tap 로그인) mock screenshot 3장 생성.
# .NET System.Drawing 활용 — Python PIL 미가용 환경 (Windows 기본) 우회.
#
# 사용법:
#   pwsh ./scripts/generate-arologis-d-ax-14-screenshots.ps1
#
# 출력: docs/qa/arologis-extract/screenshots/d-ax-14/01~03.png

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
$CommittedDir = "$PSScriptRoot\..\docs\qa\arologis-extract\screenshots\d-ax-14"
$outDir = Resolve-QaShotsDir -CommittedDir $CommittedDir
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$arologisTeal = [System.Drawing.Color]::FromArgb(42, 157, 143)
$inkPrimary = [System.Drawing.Color]::FromArgb(33, 41, 52)
$inkSecondary = [System.Drawing.Color]::FromArgb(85, 97, 112)
$inkTertiary = [System.Drawing.Color]::FromArgb(145, 158, 171)
$surfaceCard = [System.Drawing.Color]::White
$surfaceApp = [System.Drawing.Color]::FromArgb(247, 249, 252)
$lineDefault = [System.Drawing.Color]::FromArgb(220, 226, 234)
$onPrimary = [System.Drawing.Color]::White

# 폰트
$fontHeading = New-Object System.Drawing.Font("Pretendard", 22, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font("Pretendard", 14)
$fontPhone = New-Object System.Drawing.Font("Pretendard", 28, [System.Drawing.FontStyle]::Bold)
$fontButton = New-Object System.Drawing.Font("Pretendard", 16, [System.Drawing.FontStyle]::Bold)
$fontLink = New-Object System.Drawing.Font("Pretendard", 13, [System.Drawing.FontStyle]::Underline)
$fontHint = New-Object System.Drawing.Font("Pretendard", 11)
$fontDialogTitle = New-Object System.Drawing.Font("Pretendard", 16, [System.Drawing.FontStyle]::Bold)

function New-MobileCanvas {
    param([int]$Width = 390, [int]$Height = 844)
    $bmp = New-Object System.Drawing.Bitmap($Width, $Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear($surfaceApp)
    return @{ Bitmap = $bmp; Graphics = $g; Width = $Width; Height = $Height }
}

function Add-Card {
    param($Canvas, [int]$X = 20, [int]$Y = 80, [int]$W = 350, [int]$H = 480)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
    $brush = New-Object System.Drawing.SolidBrush($surfaceCard)
    $Canvas.Graphics.FillRectangle($brush, $rect)
    $pen = New-Object System.Drawing.Pen($lineDefault, 1)
    $Canvas.Graphics.DrawRectangle($pen, $rect)
    return @{ X = $X; Y = $Y; W = $W; H = $H }
}

function Save-Canvas {
    param($Canvas, [string]$Path)
    $Canvas.Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Canvas.Graphics.Dispose()
    $Canvas.Bitmap.Dispose()
    Write-Host "saved: $Path ($([math]::Round((Get-Item $Path).Length / 1KB, 1)) KB)"
}

#
# 01 — 자동 인식 카드 (autoFilled=true, source=android-native)
#
$c = New-MobileCanvas
$card = Add-Card -Canvas $c -Y 120 -H 560

$headingBrush = New-Object System.Drawing.SolidBrush($inkPrimary)
$c.Graphics.DrawString("아로로지스 기사", $fontHeading, $headingBrush, ($card.X + 80), ($card.Y + 30))

$bodyBrush = New-Object System.Drawing.SolidBrush($inkSecondary)
$c.Graphics.DrawString("본인 번호로 바로 접속하세요.", $fontBody, $bodyBrush, ($card.X + 50), ($card.Y + 90))

$phoneBrush = New-Object System.Drawing.SolidBrush($arologisTeal)
$c.Graphics.DrawString("010-1234-5678", $fontPhone, $phoneBrush, ($card.X + 50), ($card.Y + 170))

$btnRect = New-Object System.Drawing.Rectangle(($card.X + 30), ($card.Y + 280), ($card.W - 60), 60)
$btnBrush = New-Object System.Drawing.SolidBrush($arologisTeal)
$c.Graphics.FillRectangle($btnBrush, $btnRect)
$onPrimaryBrush = New-Object System.Drawing.SolidBrush($onPrimary)
$c.Graphics.DrawString("본인 번호로 로그인", $fontButton, $onPrimaryBrush, ($card.X + 80), ($card.Y + 297))

$linkBrush = New-Object System.Drawing.SolidBrush($arologisTeal)
$c.Graphics.DrawString("다른 번호로 로그인", $fontLink, $linkBrush, ($card.X + 110), ($card.Y + 370))

$hintBrush = New-Object System.Drawing.SolidBrush($inkTertiary)
$c.Graphics.DrawString("휴대전화 번호 권한으로 본인 번호를", $fontHint, $hintBrush, ($card.X + 60), ($card.Y + 440))
$c.Graphics.DrawString("자동 인식했습니다.", $fontHint, $hintBrush, ($card.X + 105), ($card.Y + 460))

Save-Canvas -Canvas $c -Path (Join-Path $outDir "01-auto-detected.png")

#
# 02 — Android READ_PHONE_NUMBERS 권한 요청 dialog (overlay)
#
$c2 = New-MobileCanvas

# 배경 (dimmed)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
$c2.Graphics.FillRectangle($bgBrush, 0, 0, 390, 844)

# 후면 card (희미)
$dimCard = Add-Card -Canvas $c2 -Y 120 -H 200
$dimBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 255, 255, 255))
$c2.Graphics.FillRectangle($dimBrush, $dimCard.X, $dimCard.Y, $dimCard.W, $dimCard.H)
$c2.Graphics.DrawString("아로로지스 기사", $fontHeading, $headingBrush, ($dimCard.X + 80), ($dimCard.Y + 30))
$c2.Graphics.DrawString("본인 번호를 자동으로 인식하는 중…", $fontBody, $bodyBrush, ($dimCard.X + 35), ($dimCard.Y + 90))

# Dialog
$dlgY = 400
$dlgRect = New-Object System.Drawing.Rectangle(30, $dlgY, 330, 280)
$dlgBrush = New-Object System.Drawing.SolidBrush($surfaceCard)
$c2.Graphics.FillRectangle($dlgBrush, $dlgRect)
$pen = New-Object System.Drawing.Pen($lineDefault, 1)
$c2.Graphics.DrawRectangle($pen, $dlgRect)

$c2.Graphics.DrawString("본인 휴대전화 번호 자동 인식", $fontDialogTitle, $headingBrush, 50, ($dlgY + 25))
$c2.Graphics.DrawString("아로로지스 기사 어플은 본인 번호를", $fontBody, $bodyBrush, 50, ($dlgY + 75))
$c2.Graphics.DrawString("자동으로 입력하기 위해 휴대전화 번호", $fontBody, $bodyBrush, 50, ($dlgY + 100))
$c2.Graphics.DrawString("권한이 필요합니다.", $fontBody, $bodyBrush, 50, ($dlgY + 125))
$c2.Graphics.DrawString("거부하시면 수동 입력 화면이", $fontHint, $hintBrush, 50, ($dlgY + 165))
$c2.Graphics.DrawString("표시됩니다.", $fontHint, $hintBrush, 50, ($dlgY + 182))

# Buttons
$allowRect = New-Object System.Drawing.Rectangle(50, ($dlgY + 220), 130, 40)
$c2.Graphics.FillRectangle($btnBrush, $allowRect)
$c2.Graphics.DrawString("허용", $fontButton, $onPrimaryBrush, 100, ($dlgY + 230))

$denyRect = New-Object System.Drawing.Rectangle(195, ($dlgY + 220), 145, 40)
$denyBorder = New-Object System.Drawing.Pen($arologisTeal, 1)
$c2.Graphics.DrawRectangle($denyBorder, $denyRect)
$c2.Graphics.DrawString("거부 (수동 입력)", $fontButton, $linkBrush, 205, ($dlgY + 230))

Save-Canvas -Canvas $c2 -Path (Join-Path $outDir "02-permission-dialog.png")

#
# 03 — 수동 입력 fallback (autoFilled=false, 권한 거부 후)
#
$c3 = New-MobileCanvas
$card3 = Add-Card -Canvas $c3 -Y 120 -H 500

$c3.Graphics.DrawString("아로로지스 기사", $fontHeading, $headingBrush, ($card3.X + 80), ($card3.Y + 30))
$c3.Graphics.DrawString("본인 휴대번호로 로그인합니다.", $fontBody, $bodyBrush, ($card3.X + 50), ($card3.Y + 90))

# Input
$inputRect = New-Object System.Drawing.Rectangle(($card3.X + 30), ($card3.Y + 150), ($card3.W - 60), 56)
$inputBrush = New-Object System.Drawing.SolidBrush($surfaceCard)
$c3.Graphics.FillRectangle($inputBrush, $inputRect)
$inputPen = New-Object System.Drawing.Pen($lineDefault, 1)
$c3.Graphics.DrawRectangle($inputPen, $inputRect)
$c3.Graphics.DrawString("010-0000-0000", $fontPhone, $hintBrush, ($card3.X + 80), ($card3.Y + 160))

# Button
$btn3Rect = New-Object System.Drawing.Rectangle(($card3.X + 30), ($card3.Y + 240), ($card3.W - 60), 56)
$c3.Graphics.FillRectangle($btnBrush, $btn3Rect)
$c3.Graphics.DrawString("로그인", $fontButton, $onPrimaryBrush, ($card3.X + 145), ($card3.Y + 253))

# Hint
$c3.Graphics.DrawString("휴대전화 번호 권한이 거부되어 수동 입력합니다.", $fontHint, $hintBrush, ($card3.X + 30), ($card3.Y + 380))
$c3.Graphics.DrawString("관리자가 사전 등록한 번호로만 로그인됩니다.", $fontHint, $hintBrush, ($card3.X + 35), ($card3.Y + 400))

Save-Canvas -Canvas $c3 -Path (Join-Path $outDir "03-manual-fallback.png")

Write-Host ""
Write-Host "D-AX-14 mock screenshots 3장 생성 완료:"
Get-ChildItem $outDir -Filter "*.png" | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length / 1KB, 1)) KB)" }
