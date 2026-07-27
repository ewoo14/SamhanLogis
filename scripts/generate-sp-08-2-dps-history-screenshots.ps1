$ErrorActionPreference = 'Stop'

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\sp-08-2-dps-history\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Segoe UI'
$Bg = [System.Drawing.ColorTranslator]::FromHtml('#F4F7FA')
$Ink = [System.Drawing.ColorTranslator]::FromHtml('#17212B')
$Muted = [System.Drawing.ColorTranslator]::FromHtml('#596579')
$Line = [System.Drawing.ColorTranslator]::FromHtml('#D7DEE8')
$Card = [System.Drawing.Color]::White
$Blue = [System.Drawing.ColorTranslator]::FromHtml('#2563EB')
$SoftBlue = [System.Drawing.ColorTranslator]::FromHtml('#EFF6FF')
$Green = [System.Drawing.ColorTranslator]::FromHtml('#16A34A')
$SoftGreen = [System.Drawing.ColorTranslator]::FromHtml('#ECFDF5')
$Red = [System.Drawing.ColorTranslator]::FromHtml('#DC2626')
$SoftRed = [System.Drawing.ColorTranslator]::FromHtml('#FEF2F2')
$Amber = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
$SoftAmber = [System.Drawing.ColorTranslator]::FromHtml('#FFF7ED')

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
    Draw-Rect $G 0 0 240 900 ([System.Drawing.ColorTranslator]::FromHtml('#17212B'))
    Draw-Text $G 'Samhan Public' 28 28 26 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $G 'Warehouse' 28 112 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    Draw-Rect $G 24 148 188 38 ([System.Drawing.ColorTranslator]::FromHtml('#1E3A5F')) $Blue
    Draw-Text $G 'DPS Compare' 42 158 15 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $G 'DPS By Product' 42 204 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $G 'Inventory Audit' 42 250 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))

    Draw-Text $G $Title 280 34 28 $Ink 'Bold'
    Draw-Text $G $Subtitle 282 72 14 $Muted
}

function Draw-Tabs($G, [int]$Active) {
    $runFill = if ($Active -eq 0) { $Blue } else { $Card }
    $runText = if ($Active -eq 0) { [System.Drawing.Color]::White } else { $Ink }
    $listFill = if ($Active -eq 1) { $Blue } else { $Card }
    $listText = if ($Active -eq 1) { [System.Drawing.Color]::White } else { $Ink }
    Draw-Button $G '실행' 280 112 96 $runFill $runText
    Draw-Button $G '저장내역' 384 112 120 $listFill $listText
}

function Draw-CompareResult($G) {
    $headers = @('카테고리', '전표번호', '품번', '거래처', '출고', 'DPS', '사유')
    $x = 296
    foreach ($h in $headers) {
        Draw-Text $G $h $x 470 14 $Muted 'Bold'
        $x += 122
    }
    Draw-Rect $G 280 498 900 1 $Line
    Draw-Rect $G 292 526 112 26 $SoftAmber $Amber
    Draw-Text $G '수량 불일치' 304 532 13 $Amber 'Bold'
    Draw-Text $G '2026/05/16-1' 418 532 13 $Ink
    Draw-Text $G 'AJ052RXH5BC1' 540 532 13 $Ink
    Draw-Text $G 'P-001' 668 532 13 $Ink
    Draw-Text $G '5' 796 532 13 $Ink
    Draw-Text $G '4' 918 532 13 $Ink
    Draw-Text $G '출고: 5 / DPS: 4' 1034 532 13 $Amber
    Draw-Rect $G 292 572 112 26 ([System.Drawing.ColorTranslator]::FromHtml('#F3F4F6')) $Line
    Draw-Text $G 'DPS 미발견' 304 578 13 $Muted 'Bold'
    Draw-Text $G '2026/05/16-2' 418 578 13 $Ink
    Draw-Text $G 'MWR-WE10N' 540 578 13 $Ink
    Draw-Text $G 'P-002' 668 578 13 $Ink
    Draw-Text $G '3' 796 578 13 $Ink
    Draw-Text $G '0' 918 578 13 $Ink
    Draw-Text $G 'DPS 엑셀에서 매칭 row 미발견' 1034 578 13 $Muted
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

Save-Shot '01-tab-run.png' {
    param($G)
    Draw-Chrome $G 'DPS 입고 비교' '출고전표 자동 조회 + DPS 엑셀 업로드 + 저장내역 복원'
    Draw-Tabs $G 0
    Draw-Rect $G 280 168 900 190 $Card $Line
    Draw-Text $G '조회 기간 시작  2026-05-01' 304 196 15 $Ink
    Draw-Text $G '조회 기간 종료  2026-05-16' 530 196 15 $Ink
    Draw-Text $G '매칭 단위  SLIP' 756 196 15 $Ink
    Draw-Button $G 'DPS 엑셀 업로드' 304 250 150 $Blue ([System.Drawing.Color]::White)
    Draw-Button $G '비교 실행' 466 250 108 $Green ([System.Drawing.Color]::White)
    Draw-Button $G '내역으로 저장' 1040 306 126 $Blue ([System.Drawing.Color]::White)
    Draw-CompareResult $G
}

Save-Shot '02-restored-banner.png' {
    param($G)
    Draw-Chrome $G 'DPS 입고 비교' 'latest AUTO_LATEST 자동 복원'
    Draw-Tabs $G 0
    Draw-Rect $G 280 168 900 46 $SoftBlue $Blue
    Draw-Text $G '이전 결과 복원됨 · 2026-05-16 14:32' 304 181 15 $Blue 'Bold'
    Draw-Button $G '닫기' 1112 174 54 $Card $Blue
    Draw-CompareResult $G
}

Save-Shot '03-tab-list.png' {
    param($G)
    Draw-Chrome $G 'DPS 저장내역' '기간 조회 + 명시 저장 목록'
    Draw-Tabs $G 1
    Draw-Rect $G 280 168 900 70 $Card $Line
    Draw-Text $G '기간 시작 2026-05-01     기간 종료 2026-05-16     모드 명시 저장만' 304 192 15 $Ink
    Draw-Button $G '조회' 1110 186 58 $Blue ([System.Drawing.Color]::White)
    Draw-Rect $G 280 264 900 260 $Card $Line
    Draw-Text $G '작성시각' 304 288 14 $Muted 'Bold'
    Draw-Text $G '작성자' 504 288 14 $Muted 'Bold'
    Draw-Text $G '저장주제' 668 288 14 $Muted 'Bold'
    Draw-Text $G '구분' 900 288 14 $Muted 'Bold'
    Draw-Text $G 'mismatch 수' 1030 288 14 $Muted 'Bold'
    Draw-Text $G '2026. 05. 16. 14:32' 304 336 14 $Ink
    Draw-Text $G '오병승' 504 336 14 $Ink
    Draw-Text $G '오전 마감 점검' 668 336 14 $Ink
    Draw-Text $G '명시' 900 336 14 $Ink
    Draw-Text $G '2' 1070 336 14 $Ink
    Draw-Text $G '2026. 05. 15. 09:15' 304 382 14 $Ink
    Draw-Text $G '오병승' 504 382 14 $Ink
    Draw-Text $G '월말 마감' 668 382 14 $Ink
    Draw-Text $G '명시' 900 382 14 $Ink
    Draw-Text $G '0' 1070 382 14 $Ink
}

Save-Shot '04-restore-navigate.png' {
    param($G)
    Draw-Chrome $G 'DPS 입고 비교' '저장내역 행 클릭 후 실행 탭 복원'
    Draw-Tabs $G 0
    Draw-Rect $G 280 168 900 46 $SoftGreen $Green
    Draw-Text $G "복원: 2026-05-16 14:32 오병승 '오전 마감 점검'" 304 181 15 $Green 'Bold'
    Draw-CompareResult $G
}

Save-Shot '05-save-dialog.png' {
    param($G)
    Draw-Chrome $G 'DPS 결과 저장' 'MANUAL_NAMED 저장주제 입력'
    Draw-Tabs $G 0
    Draw-Rect $G 0 0 1280 900 ([System.Drawing.Color]::FromArgb(110, 23, 33, 43))
    Draw-Rect $G 430 250 460 250 $Card $Line
    Draw-Text $G 'DPS 결과 저장' 462 284 22 $Ink 'Bold'
    Draw-Text $G '저장주제' 462 336 14 $Muted 'Bold'
    Draw-Rect $G 462 360 360 36 ([System.Drawing.Color]::White) $Line
    Draw-Text $G '오전 마감 점검' 474 369 14 $Ink
    Draw-Button $G '취소' 612 430 76 ([System.Drawing.ColorTranslator]::FromHtml('#F3F4F6')) $Ink
    Draw-Button $G '저장' 704 430 76 $Blue ([System.Drawing.Color]::White)
}

Save-Shot '06-by-product-pattern.png' {
    param($G)
    Draw-Chrome $G '품목별 DPS 분석' 'DPS_BY_PRODUCT 저장내역 격리'
    Draw-Tabs $G 0
    Draw-Rect $G 280 168 900 46 $SoftBlue $Blue
    Draw-Text $G '이전 결과 복원됨 · 2026-05-16 14:32' 304 181 15 $Blue 'Bold'
    Draw-Rect $G 280 250 900 300 $Card $Line
    Draw-Text $G '상품코드' 304 276 14 $Muted 'Bold'
    Draw-Text $G '상품명' 450 276 14 $Muted 'Bold'
    Draw-Text $G '완료' 704 276 14 $Muted 'Bold'
    Draw-Text $G '반품' 800 276 14 $Muted 'Bold'
    Draw-Text $G 'DPS차이' 910 276 14 $Muted 'Bold'
    Draw-Text $G 'PRD-0001' 304 326 14 $Ink
    Draw-Text $G '냉난방 실외기 (5HP)' 450 326 14 $Ink
    Draw-Text $G '85' 704 326 14 $Ink
    Draw-Text $G '-2' 800 326 14 $Red
    Draw-Text $G '0' 910 326 14 $Ink
    Draw-Button $G '내역으로 저장' 1040 600 126 $Blue ([System.Drawing.Color]::White)
}

Save-Shot '07-uuid-hidden-scan.png' {
    param($G)
    Draw-Chrome $G 'UUID 비노출 스캔' 'data-testid 는 row index 기반'
    Draw-Rect $G 280 150 900 280 $Card $Line
    Draw-Text $G 'PASS' 312 188 36 $Green 'Bold'
    Draw-Text $G 'dps-history-row-{i} / dps-history-row-{i}-created-at 형식 사용' 312 246 18 $Ink
    Draw-Text $G '화면 표시 식별자: 저장주제, 작성자, 작성시각, mismatch 수' 312 286 18 $Ink
    Draw-Text $G 'UUID 정규식 매치: 0' 312 326 18 $Green 'Bold'
    Draw-Text $G 'Notion runtime 호출 매치: 0' 312 366 18 $Green 'Bold'
}

$pngs = Get-ChildItem $OutDir -Filter '*.png'
if ($pngs.Count -lt 6) {
    throw "expected at least 6 PNGs, got $($pngs.Count)"
}
