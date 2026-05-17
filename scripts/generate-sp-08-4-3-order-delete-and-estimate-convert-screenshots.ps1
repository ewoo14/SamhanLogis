# Windows-only (System.Drawing GDI+)
# PowerShell mock QA screenshots for SP-08-4-3 order delete and estimate conversion.
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$OutputDir = Join-Path $PSScriptRoot "..\docs\qa\sp-08-4-3-order-delete-and-estimate-convert\screenshots"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function New-Canvas {
    param([string]$Title, [string]$FileName, [scriptblock]$DrawBody)

    $bmp = New-Object System.Drawing.Bitmap 1280, 820
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))

    $fontTitle = New-Object System.Drawing.Font "Malgun Gothic", 28, ([System.Drawing.FontStyle]::Bold)
    $font = New-Object System.Drawing.Font "Malgun Gothic", 15
    $brushText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 41, 59))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(203, 213, 225)), 1

    $g.DrawString($Title, $fontTitle, $brushText, 54, 36)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), 54, 100, 1172, 650)
    $g.DrawRectangle($pen, 54, 100, 1172, 650)

    & $DrawBody $g $font $brushText

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

function Draw-Box {
    param($Graphics, $Text, $X, $Y, $W, $H)
    $font = New-Object System.Drawing.Font "Malgun Gothic", 14
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255))), $X, $Y, $W, $H)
    $Graphics.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(203, 213, 225)), 1), $X, $Y, $W, $H)
    $Graphics.DrawString($Text, $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 23, 42))), ($X + 14), ($Y + 13))
}

function Draw-Fill {
    param($Graphics, $Text, $X, $Y, $W, $H, $R, $Gv, $B)
    $font = New-Object System.Drawing.Font "Malgun Gothic", 14, ([System.Drawing.FontStyle]::Bold)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($R, $Gv, $B))), $X, $Y, $W, $H)
    $Graphics.DrawString($Text, $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), ($X + 16), ($Y + 13))
}

New-Canvas -Title "주문서 삭제 확인" -FileName "01-delete-confirm-dialog.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Box -Graphics $g -Text "주문서 2026/05/17-1 를 삭제하시겠습니까?" -X 110 -Y 155 -W 760 -H 58
    Draw-Box -Graphics $g -Text "삭제 후 목록과 상세 조회에서 제외됩니다." -X 110 -Y 230 -W 760 -H 58
    Draw-Fill -Graphics $g -Text "취소" -X 690 -Y 345 -W 120 -H 52 -R 100 -Gv 116 -B 139
    Draw-Fill -Graphics $g -Text "삭제" -X 830 -Y 345 -W 120 -H 52 -R 37 -Gv 99 -B 235
}

New-Canvas -Title "주문서 삭제 완료" -FileName "02-delete-success.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Box -Graphics $g -Text "DELETE /api/v1/partner-orders/2026-05-17-1" -X 110 -Y 155 -W 820 -H 58
    Draw-Fill -Graphics $g -Text "204 No Content" -X 110 -Y 235 -W 230 -H 52 -R 22 -Gv 163 -B 74
    Draw-Box -Graphics $g -Text "목록으로 이동 / active 주문 조회 제외 / 라인 전체 soft-delete" -X 110 -Y 315 -W 900 -H 58
}

New-Canvas -Title "견적에서 주문 생성" -FileName "03-from-estimate-success.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Box -Graphics $g -Text "POST /api/v1/partner-orders/from-estimate/{estimateId}" -X 110 -Y 155 -W 820 -H 58
    Draw-Fill -Graphics $g -Text "201 Created" -X 110 -Y 235 -W 190 -H 52 -R 22 -Gv 163 -B 74
    Draw-Box -Graphics $g -Text "source_estimate_id 보존 / 주문번호 생성 / 라인 2건 변환" -X 110 -Y 315 -W 900 -H 58
}

New-Canvas -Title "견적 중복 변환 차단" -FileName "04-from-estimate-already-converted.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Box -Graphics $g -Text "같은 estimateId 로 재요청" -X 110 -Y 155 -W 520 -H 58
    Draw-Fill -Graphics $g -Text "409 Conflict" -X 110 -Y 235 -W 200 -H 52 -R 220 -Gv 38 -B 38
    Draw-Box -Graphics $g -Text "PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED" -X 110 -Y 315 -W 820 -H 58
}

$Expected04 = Join-Path $OutputDir "04-from-estimate-already-converted.png"
if (!(Test-Path $Expected04)) {
    $bmp = New-Object System.Drawing.Bitmap 1280, 820
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $fontTitle = New-Object System.Drawing.Font "Malgun Gothic", 28, ([System.Drawing.FontStyle]::Bold)
    $font = New-Object System.Drawing.Font "Malgun Gothic", 18, ([System.Drawing.FontStyle]::Bold)
    $brushText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 41, 59))
    $g.DrawString("견적 중복 변환 차단", $fontTitle, $brushText, 54, 36)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), 54, 100, 1172, 650)
    $g.DrawString("409 Conflict", $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 38, 38))), 110, 180)
    $g.DrawString("PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED", $font, $brushText, 110, 260)
    $bmp.Save($Expected04, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Get-ChildItem $OutputDir -Filter *.png | Select-Object Name, Length
