# scripts/generate-samhan-signature-copy-screenshots.ps1
# Phase F (samhan-signature-copy) QA 7 시나리오 mock PNG 생성기.
# .NET System.Drawing 으로 layout 명세 + 핵심 text 표기 + arologis-teal brand color 를 PNG 로 렌더링.
# Designer 의 docs/uiux/samhan-signature-copy/01~03.md 화면 토큰 + spec § 7 UI 흐름 + plan F3/F5 RN 코드 기반.
#
# 사용법:
#   pwsh ./scripts/generate-samhan-signature-copy-screenshots.ps1
#
# 출력: docs/qa/samhan-signature-copy/screenshots/01~07.png (7장)
#
# 가드:
#   - UTF-8 BOM 파일 자체 ([feedback_powershell_utf8_writes])
#   - Join-Path 단일 arg (PowerShell 5.1 호환)
#   - arologis-teal `#2A9D8F` brand 일관 (Phase A/C 와 동일 팔레트)
#   - 재실행 가능 (한 번 실행으로 7장 재생성)
#   - 폰트: Malgun Gothic Bold 강제 (PR #191 회고 — 한글 글리프 누락 fix)
#   - 이모지 사용 금지 → 한글/영어 라벨 ([차], [전화], [사진] 등) 로 교체
#   - 하단 탭 (홈/배차/출고/내정보) 제거 (Phase F 무관 + 작은 폰트 글리프 누락 회피)
#   - 메타 텍스트는 toast 와 겹치지 않도록 별도 footer 영역 배치
#   - 모든 텍스트 최소 12px (가독성 + 글리프 누락 회피)
#
# 시나리오 매핑 (docs/qa/samhan-signature-copy/scenarios.md §1 참조):
#   01 - 1-tap 완료+발송 success (시나리오 1)
#   02 - Android Share Sheet (시나리오 1)
#   03 - iOS Share Sheet (시나리오 1)
#   04 - RECIPIENT_PHONE_MISSING toast (시나리오 3)
#   05 - RENDERER_TIMEOUT + 재시도 (시나리오 4)
#   06 - 409 COPY_ALREADY_SENT (시나리오 2)
#   07 - 사진 → 서명 chain (시나리오 7, D-DF-13)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

# 폰트 패밀리 (PR #191 fix — Malgun Gothic Bold 강제)
$FontHan = 'Malgun Gothic'
$FontMono = 'Consolas'

# arologis brand teal palette (Designer §3.1, Phase A/C 와 일관)
$ArologisTeal500 = [System.Drawing.ColorTranslator]::FromHtml('#2A9D8F')
$ArologisTeal600 = [System.Drawing.ColorTranslator]::FromHtml('#218074')
$ArologisTeal700 = [System.Drawing.ColorTranslator]::FromHtml('#1B665C')
$ArologisTeal400 = [System.Drawing.ColorTranslator]::FromHtml('#3FB59C')
$ArologisTeal100 = [System.Drawing.ColorTranslator]::FromHtml('#D2F0EA')
$ArologisTeal50  = [System.Drawing.ColorTranslator]::FromHtml('#EFFAF8')

$Neutral0   = [System.Drawing.Color]::White
$Neutral50  = [System.Drawing.ColorTranslator]::FromHtml('#F7F8FA')
$Neutral100 = [System.Drawing.ColorTranslator]::FromHtml('#EDF0F4')
$Neutral200 = [System.Drawing.ColorTranslator]::FromHtml('#D6DCE3')
$Neutral300 = [System.Drawing.ColorTranslator]::FromHtml('#B8C0CB')
$Neutral500 = [System.Drawing.ColorTranslator]::FromHtml('#6B7280')
$Neutral700 = [System.Drawing.ColorTranslator]::FromHtml('#363D49')
$Neutral900 = [System.Drawing.ColorTranslator]::FromHtml('#0F1216')

$Green500 = [System.Drawing.ColorTranslator]::FromHtml('#22C55E')
$Green100 = [System.Drawing.ColorTranslator]::FromHtml('#DCFCE7')
$Red500   = [System.Drawing.ColorTranslator]::FromHtml('#EF4444')
$Red100   = [System.Drawing.ColorTranslator]::FromHtml('#FEE2E2')
$Amber500 = [System.Drawing.ColorTranslator]::FromHtml('#F59E0B')
$Amber100 = [System.Drawing.ColorTranslator]::FromHtml('#FEF3C7')
$Blue500  = [System.Drawing.ColorTranslator]::FromHtml('#3B82F6')
$Blue100  = [System.Drawing.ColorTranslator]::FromHtml('#DBEAFE')
$Purple500 = [System.Drawing.ColorTranslator]::FromHtml('#8B5CF6')
$Yellow500 = [System.Drawing.ColorTranslator]::FromHtml('#FBBF24')

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\samhan-signature-copy\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if(-not (Test-Path $OutDir)){ New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
Write-Host "[generate-samhan-signature-copy-screenshots] output dir: $OutDir"

function New-Bitmap {
    param([int]$Width, [int]$Height, [System.Drawing.Color]$Background)
    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($Background)
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Draw-FilledRect {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [System.Drawing.Color]$Color)
    $brush = New-Object System.Drawing.SolidBrush $Color
    $Graphics.FillRectangle($brush, $X, $Y, $W, $H)
    $brush.Dispose()
}

function Draw-StrokeRect {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [System.Drawing.Color]$Color, [int]$Width = 1)
    $pen = New-Object System.Drawing.Pen $Color, $Width
    $Graphics.DrawRectangle($pen, $X, $Y, $W, $H)
    $pen.Dispose()
}

function Draw-Line {
    param($Graphics, [int]$X1, [int]$Y1, [int]$X2, [int]$Y2, [System.Drawing.Color]$Color, [int]$Width = 1)
    $pen = New-Object System.Drawing.Pen $Color, $Width
    $Graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2)
    $pen.Dispose()
}

# Min size guard — 모든 텍스트 ≥12px (PR #191 fix)
function Draw-Text {
    param($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$Size, [System.Drawing.Color]$Color, [string]$Family = $null, [string]$Style = 'Bold')
    if($null -eq $Family){ $Family = $script:FontHan }
    if($Size -lt 12){ $Size = 12 }
    $fontStyle = [System.Drawing.FontStyle]::$Style
    $font = New-Object System.Drawing.Font $Family, $Size, $fontStyle, ([System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush $Color
    $Graphics.DrawString($Text, $font, $brush, [single]$X, [single]$Y)
    $font.Dispose()
    $brush.Dispose()
}

function Measure-Text {
    param($Graphics, [string]$Text, [int]$Size, [string]$Family = $null, [string]$Style = 'Bold')
    if($null -eq $Family){ $Family = $script:FontHan }
    if($Size -lt 12){ $Size = 12 }
    $fontStyle = [System.Drawing.FontStyle]::$Style
    $font = New-Object System.Drawing.Font $Family, $Size, $fontStyle, ([System.Drawing.GraphicsUnit]::Pixel)
    $sz = $Graphics.MeasureString($Text, $font)
    $font.Dispose()
    return $sz
}

function Draw-CenteredText {
    param($Graphics, [string]$Text, [int]$CenterX, [int]$Y, [int]$Size, [System.Drawing.Color]$Color, [string]$Family = $null, [string]$Style = 'Bold')
    if($null -eq $Family){ $Family = $script:FontHan }
    $sz = Measure-Text -Graphics $Graphics -Text $Text -Size $Size -Family $Family -Style $Style
    $x = [int]($CenterX - $sz.Width / 2)
    Draw-Text -Graphics $Graphics -Text $Text -X $x -Y $Y -Size $Size -Color $Color -Family $Family -Style $Style
}

function Save-Bitmap {
    param($Pack, [string]$Path)
    $Pack.Graphics.Dispose()
    $Pack.Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Pack.Bitmap.Dispose()
    $fi = Get-Item $Path
    Write-Host ("  saved {0,-44} {1,6:N1} KB" -f $fi.Name, ($fi.Length / 1KB))
}

# Mobile chrome (status bar + app bar) — arologis-mobile 일관
function Draw-MobileChrome {
    param($Graphics, [int]$W, [string]$ScreenTitle)
    # status bar
    Draw-FilledRect $Graphics 0 0 $W 44 $Neutral0
    Draw-Text $Graphics '9:41' 18 14 14 $Neutral900
    Draw-Text $Graphics '5G   100%' ($W - 100) 14 13 $Neutral700
    # app bar
    Draw-FilledRect $Graphics 0 44 $W 56 $ArologisTeal500
    Draw-Text $Graphics '< 뒤로' 16 64 14 $Neutral0
    Draw-Text $Graphics $ScreenTitle 80 60 16 $Neutral0
    Draw-Text $Graphics '설정' ($W - 50) 64 14 $Neutral0
}

# QA 캡처 footer (PR #191 fix — 메타 텍스트 toast 와 분리, 별도 영역)
function Draw-MetaFooter {
    param($Graphics, [int]$W, [int]$H, [string[]]$Lines, [string]$Caption)
    # 하단 탭 제거 — Phase F 무관 + 작은 폰트 글리프 누락 회피
    # 대신 별도 메타 footer (toast 와 명확히 분리)
    $footerH = 4 + ($Lines.Count * 16) + 22
    $footerY = $H - $footerH
    Draw-FilledRect $Graphics 0 $footerY $W $footerH $Neutral100
    Draw-Line $Graphics 0 $footerY $W $footerY $Neutral200 1
    $ly = $footerY + 6
    foreach($line in $Lines){
        Draw-Text $Graphics $line 12 $ly 12 $Neutral700
        $ly += 16
    }
    if($Caption){
        Draw-Text $Graphics $Caption 12 ($H - 16) 12 $Neutral500 $script:FontHan 'Italic'
    }
}

# Signature pad (squiggle 시각 — 실 서명 흉내)
function Draw-SignaturePad {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Label, [bool]$Signed)
    Draw-FilledRect $Graphics $X $Y $W $H $Neutral0
    Draw-StrokeRect $Graphics $X $Y $W $H $Neutral300 1
    # corner label
    Draw-Text $Graphics $Label ($X + 8) ($Y + 6) 12 $Neutral500
    if($Signed){
        # mock signature stroke
        $pen = New-Object System.Drawing.Pen $Neutral900, 2
        $cy = $Y + [int]($H / 2)
        $points = @()
        $cx = $X + 20
        for($i = 0; $i -lt 18; $i++){
            $px = $cx + ($i * 8)
            $py = $cy + [math]::Sin($i * 0.7) * 12 - ($i % 3) * 4
            $points += New-Object System.Drawing.PointF([single]$px, [single]$py)
        }
        if($points.Count -ge 2){
            $Graphics.DrawCurve($pen, [System.Drawing.PointF[]]$points)
        }
        $pen.Dispose()
        Draw-Text $Graphics '[OK] 서명 완료' ($X + $W - 100) ($Y + $H - 24) 12 $Green500
    } else {
        Draw-CenteredText $Graphics '여기에 서명하세요' ($X + [int]($W / 2)) ($Y + [int]($H / 2) - 8) 13 $Neutral300 $script:FontHan 'Italic'
    }
}

function Draw-Toast {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [System.Drawing.Color]$BgColor, [System.Drawing.Color]$BorderColor, [string]$IconText, [string]$Title, [string]$Body)
    Draw-FilledRect $Graphics $X $Y $W $H $BgColor
    Draw-StrokeRect $Graphics $X $Y $W $H $BorderColor 1
    # 아이콘은 텍스트 라벨로 (이모지 글리프 누락 회피)
    Draw-Text $Graphics $IconText ($X + 12) ($Y + 12) 14 $BorderColor
    Draw-Text $Graphics $Title ($X + 56) ($Y + 8) 14 $Neutral900
    Draw-Text $Graphics $Body ($X + 56) ($Y + 28) 12 $Neutral700
}

# 앱 아이콘 (이모지 대신 텍스트 약자) — Share Sheet 용
function Draw-AppIconBox {
    param($Graphics, [int]$CenterX, [int]$Y, [int]$Size, [System.Drawing.Color]$BgColor, [string]$IconLabel, [string]$AppName, [System.Drawing.Color]$TextColor)
    $x = $CenterX - [int]($Size / 2)
    Draw-FilledRect $Graphics $x $Y $Size $Size $BgColor
    Draw-CenteredText $Graphics $IconLabel $CenterX ($Y + [int]($Size / 2 - 8)) 14 $Neutral0
    Draw-CenteredText $Graphics $AppName $CenterX ($Y + $Size + 4) 12 $TextColor
}

# ------------------------------------------------------------
# 01 — DriverSignatureScreen 1-tap 완료+발송 success
# ------------------------------------------------------------
function Render-01-SignatureSuccess {
    $W = 390; $H = 900
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    Draw-MobileChrome $g $W '서명 + 사본 발송'

    # context card
    Draw-FilledRect $g 16 116 ($W - 32) 70 $Neutral0
    Draw-StrokeRect $g 16 116 ($W - 32) 70 $Neutral200 1
    Draw-Text $g '[차] 1톤 #1   [1] SL-001' 28 128 13 $ArologisTeal700
    Draw-Text $g '대구공조 (P-1234)' 28 150 14 $Neutral900
    Draw-Text $g '인천 남동구 남동대로215번길 30' 28 170 12 $Neutral500

    # signature panels
    Draw-Text $g '서명 (자신 + 인수자)' 16 200 13 $Neutral700

    # driver pad
    Draw-Text $g '기사 본인' 16 222 12 $Neutral500
    Draw-SignaturePad $g 16 240 ($W - 32) 130 'Driver' $true

    # recipient pad
    Draw-Text $g '인수자' 16 384 12 $Neutral500
    Draw-SignaturePad $g 16 402 ($W - 32) 130 'Recipient' $true

    # masked phone display
    Draw-FilledRect $g 16 548 ($W - 32) 60 $ArologisTeal50
    Draw-StrokeRect $g 16 548 ($W - 32) 60 $ArologisTeal400 1
    Draw-Text $g '[전화] 인수자 번호 (마스킹)' 28 558 12 $ArologisTeal700
    Draw-Text $g '010-****-5678' 28 578 18 $ArologisTeal700 $FontMono 'Bold'
    Draw-Text $g '(DB 풀 번호 보관, 응답/UI 마스킹)' ($W - 200) 582 12 $Neutral500

    # 1-tap button (success state — sending)
    $btnY = 624
    Draw-FilledRect $g 16 $btnY ($W - 32) 56 $ArologisTeal500
    Draw-CenteredText $g '발송 중...' ([int]($W / 2)) ($btnY + 18) 16 $Neutral0

    # toast — success (별도 영역, 메타와 분리)
    Draw-Toast $g 16 696 ($W - 32) 64 $Green100 $Green500 '[OK]' '서명 저장 완료' 'Share Sheet 에서 인수자에게 보내세요'

    # meta footer (toast 와 명확히 분리, 하단 탭 없음)
    Draw-MetaFooter $g $W $H @(
        'X-Slip-Bridged: true',
        'X-Copy-Sent-At: 14:30:12 KST',
        '응답: 200 image/png (signature-copy.png)'
    ) 'QA Mock - 시나리오 1 (1-tap success → Share Sheet)'

    Save-Bitmap $pack (Join-Path $OutDir '01-signature-1tap-success.png')
}

# ------------------------------------------------------------
# 02 — Android expo-sharing Share Sheet
# ------------------------------------------------------------
function Render-02-ShareSheetAndroid {
    $W = 390; $H = 900
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    # status bar + app bar dim (overlay 위에 sheet)
    Draw-FilledRect $g 0 0 $W 100 $Neutral50
    Draw-Text $g '9:41' 18 14 14 $Neutral900
    Draw-Text $g 'Android   100%' ($W - 120) 14 13 $Neutral700
    Draw-FilledRect $g 0 44 $W 56 $ArologisTeal500
    Draw-Text $g '서명 + 사본 발송' 80 60 16 $Neutral0

    # dim background (signature screen blurred)
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 0, 0, 0))
    $g.FillRectangle($overlay, 0, 100, $W, $H - 100)
    $overlay.Dispose()

    # share sheet panel (bottom 60%)
    $sY = [int]($H * 0.36)
    Draw-FilledRect $g 0 $sY $W ($H - $sY) $Neutral0

    # handle
    Draw-FilledRect $g ([int]($W / 2 - 24)) ($sY + 8) 48 4 $Neutral300

    # title
    Draw-Text $g '공유' 24 ($sY + 24) 18 $Neutral900
    Draw-Text $g '김인수 님에게 출고전표 사본 보내기' 24 ($sY + 50) 13 $Neutral500
    Draw-Text $g '010-****-5678' 24 ($sY + 70) 13 $ArologisTeal700 $FontMono 'Bold'

    # PNG preview (small, label 로 명시)
    Draw-FilledRect $g ($W - 88) ($sY + 28) 72 88 $Neutral100
    Draw-StrokeRect $g ($W - 88) ($sY + 28) 72 88 $Neutral300 1
    Draw-CenteredText $g '[PNG]' ($W - 52) ($sY + 50) 13 $Neutral700
    Draw-CenteredText $g '~480KB' ($W - 52) ($sY + 96) 12 $Neutral500

    Draw-FilledRect $g 16 ($sY + 130) ($W - 32) 1 $Neutral200

    # row 1: 카카오톡, 메시지, Drive (suggested apps) — 텍스트 약자 라벨
    $r1y = $sY + 148
    $apps1 = @(
        @('Talk', '카카오톡', $Yellow500),
        @('SMS',  '메시지',   $Green500),
        @('Drive','Drive',    $Blue500),
        @('Mail', 'Gmail',    $Red500)
    )
    $colW = [int](($W - 32) / 4)
    for($i = 0; $i -lt 4; $i++){
        $cx = 16 + $i * $colW + [int]($colW / 2)
        Draw-AppIconBox $g $cx $r1y 56 $apps1[$i][2] $apps1[$i][0] $apps1[$i][1] $Neutral700
    }

    # row 2: 더 많은 앱
    $r2y = $r1y + 110
    $apps2 = @(
        @('Pic',  '갤러리',  $Purple500),
        @('File', '파일',    $Neutral500),
        @('Copy', '복사',    $Neutral500),
        @('More', '더보기',  $Neutral500)
    )
    for($i = 0; $i -lt 4; $i++){
        $cx = 16 + $i * $colW + [int]($colW / 2)
        Draw-AppIconBox $g $cx $r2y 56 $apps2[$i][2] $apps2[$i][0] $apps2[$i][1] $Neutral700
    }

    # divider
    Draw-FilledRect $g 16 ($r2y + 110) ($W - 32) 1 $Neutral200

    # cancel
    $cy = $r2y + 130
    Draw-FilledRect $g 16 $cy ($W - 32) 48 $Neutral100
    Draw-CenteredText $g '취소' ([int]($W / 2)) ($cy + 14) 14 $Neutral900

    # meta footer
    Draw-MetaFooter $g $W $H @(
        'expo-sharing.shareAsync({ mimeType: image/png })',
        'Android Intent.ACTION_SEND → 4+ 앱 노출'
    ) 'QA Mock - 시나리오 1 (Android expo-sharing OS Share Sheet)'

    Save-Bitmap $pack (Join-Path $OutDir '02-share-sheet-android.png')
}

# ------------------------------------------------------------
# 03 — iOS expo-sharing Share Sheet
# ------------------------------------------------------------
function Render-03-ShareSheetIOS {
    $W = 390; $H = 900
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    # status bar (iOS notch)
    Draw-FilledRect $g 0 0 $W 100 $Neutral50
    Draw-FilledRect $g ([int]($W / 2 - 60)) 0 120 28 $Neutral900
    Draw-Text $g '9:41' 18 14 14 $Neutral900
    Draw-Text $g '5G    100%' ($W - 110) 14 13 $Neutral700
    Draw-FilledRect $g 0 44 $W 56 $ArologisTeal500
    Draw-Text $g '서명 + 사본 발송' 80 60 16 $Neutral0

    # dim
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 0, 0, 0))
    $g.FillRectangle($overlay, 0, 100, $W, $H - 100)
    $overlay.Dispose()

    # iOS share sheet (centered card)
    $sY = [int]($H * 0.30)
    $sH = $H - $sY - 110
    Draw-FilledRect $g 12 $sY ($W - 24) $sH $Neutral50
    Draw-StrokeRect $g 12 $sY ($W - 24) $sH $Neutral200 1

    # title bar with PNG icon
    Draw-Text $g 'signature-copy.png' 28 ($sY + 14) 14 $Neutral900
    Draw-Text $g 'iCloud Drive · 480 KB · PNG image' 28 ($sY + 34) 12 $Neutral500
    Draw-Text $g '닫기' ($W - 56) ($sY + 14) 13 $Neutral500

    # PNG preview thumb (left aligned, [PNG] 라벨 명시)
    Draw-FilledRect $g 28 ($sY + 60) 88 108 $Neutral100
    Draw-StrokeRect $g 28 ($sY + 60) 88 108 $Neutral300 1
    Draw-CenteredText $g '[PNG]' 72 ($sY + 86) 14 $Neutral700
    Draw-CenteredText $g '출고전표' 72 ($sY + 138) 12 $Neutral700
    Draw-CenteredText $g 'SL-001' 72 ($sY + 154) 12 $Neutral500

    # recipient hint
    Draw-Text $g '받는 사람' 132 ($sY + 64) 12 $Neutral500
    Draw-Text $g '김인수' 132 ($sY + 82) 16 $Neutral900
    Draw-Text $g '010-****-5678' 132 ($sY + 106) 13 $ArologisTeal700 $FontMono 'Bold'
    Draw-Text $g '(DB 풀 번호, UI 마스킹)' 132 ($sY + 128) 12 $Neutral500

    # divider
    Draw-FilledRect $g 16 ($sY + 188) ($W - 32) 1 $Neutral200

    # iOS app row (horizontal scroll suggestion) — 텍스트 약자
    $r1y = $sY + 206
    Draw-Text $g '제안' 24 $r1y 12 $Neutral500
    $apps = @(
        @('SMS',  'Messages', $Green500),
        @('Talk', '카카오톡',  $Yellow500),
        @('Mail', 'Mail',     $Blue500),
        @('Cloud','iCloud',   $Blue100)
    )
    $colW = [int](($W - 32) / 4)
    $r1y2 = $r1y + 22
    for($i = 0; $i -lt 4; $i++){
        $cx = 16 + $i * $colW + [int]($colW / 2)
        Draw-AppIconBox $g $cx $r1y2 56 $apps[$i][2] $apps[$i][0] $apps[$i][1] $Neutral900
    }

    # actions list (iOS style) — 이모지 대신 텍스트 라벨
    $aY = $r1y2 + 100
    Draw-FilledRect $g 16 $aY ($W - 32) 1 $Neutral200
    $actions = @(
        @('[복]', '복사'),
        @('[저]', '이미지 저장'),
        @('[파]', '파일에 저장'),
        @('[인]', 'AirPrint')
    )
    for($i = 0; $i -lt $actions.Count; $i++){
        $rowY = $aY + 8 + ($i * 36)
        Draw-Text $g $actions[$i][0] 28 ($rowY + 2) 13 $Neutral700
        Draw-Text $g $actions[$i][1] 70 ($rowY + 4) 13 $Neutral900
        Draw-Text $g '>' ($W - 32) ($rowY + 4) 14 $Neutral500
        Draw-FilledRect $g 16 ($rowY + 28) ($W - 32) 1 $Neutral100
    }

    # cancel button
    $cY = $H - 100
    Draw-FilledRect $g 12 $cY ($W - 24) 48 $Neutral0
    Draw-StrokeRect $g 12 $cY ($W - 24) 48 $Neutral200 1
    Draw-CenteredText $g '취소' ([int]($W / 2)) ($cY + 14) 16 $Blue500

    # meta footer
    Draw-MetaFooter $g $W $H @(
        'expo-sharing.shareAsync({ UTI: public.png })',
        'iOS UIActivityViewController → Suggested + Actions'
    ) 'QA Mock - 시나리오 1 (iOS expo-sharing Share Sheet)'

    Save-Bitmap $pack (Join-Path $OutDir '03-share-sheet-ios.png')
}

# ------------------------------------------------------------
# 04 — RECIPIENT_PHONE_MISSING toast (시나리오 3)
# ------------------------------------------------------------
function Render-04-RecipientPhoneMissing {
    $W = 390; $H = 920
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    Draw-MobileChrome $g $W '서명 + 사본 발송'

    # context (different slip — null phone test)
    Draw-FilledRect $g 16 116 ($W - 32) 70 $Neutral0
    Draw-StrokeRect $g 16 116 ($W - 32) 70 $Neutral200 1
    Draw-Text $g '[차] 1톤 #1   [2] SL-T-NULL' 28 128 13 $ArologisTeal700
    Draw-Text $g '시험거래처 (P-TEST)' 28 150 14 $Neutral900
    Draw-Text $g '서울 강남구 역삼동 (테스트용)' 28 170 12 $Neutral500

    Draw-Text $g '서명 (자신 + 인수자)' 16 200 13 $Neutral700
    Draw-Text $g '기사 본인' 16 222 12 $Neutral500
    Draw-SignaturePad $g 16 240 ($W - 32) 130 'Driver' $true
    Draw-Text $g '인수자' 16 384 12 $Neutral500
    Draw-SignaturePad $g 16 402 ($W - 32) 130 'Recipient' $true

    # masked phone — empty/missing
    Draw-FilledRect $g 16 548 ($W - 32) 60 $Amber100
    Draw-StrokeRect $g 16 548 ($W - 32) 60 $Amber500 1
    Draw-Text $g '[!] 인수자 번호 미등록' 28 558 12 $Amber500
    Draw-Text $g '(없음)' 28 578 18 $Neutral500 $FontMono 'Bold'
    Draw-Text $g 'recipient_phone_number = NULL' ($W - 220) 582 12 $Neutral500

    # button — done state (after request)
    $btnY = 624
    Draw-FilledRect $g 16 $btnY ($W - 32) 56 $Neutral300
    Draw-CenteredText $g '[OK] 완료 + 사본 발송' ([int]($W / 2)) ($btnY + 18) 16 $Neutral0

    # toast — phone missing skip
    Draw-Toast $g 16 696 ($W - 32) 80 $Amber100 $Amber500 '[!]' '서명 저장 완료' '인수자 번호 미등록 — Admin 재발송 필요'

    # meta footer — toast 와 충분히 분리
    Draw-MetaFooter $g $W $H @(
        '응답: 200 application/json',
        'copyFailureReason: "RECIPIENT_PHONE_MISSING"',
        'copy_sent_at = NULL · slipBridged = true · 1회 가드 미소비'
    ) 'QA Mock - 시나리오 3 (RECIPIENT_PHONE_MISSING)'

    Save-Bitmap $pack (Join-Path $OutDir '04-recipient-phone-missing.png')
}

# ------------------------------------------------------------
# 05 — RENDERER_TIMEOUT + 재시도 (시나리오 4)
# ------------------------------------------------------------
function Render-05-RendererTimeoutRetry {
    $W = 390; $H = 920
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    Draw-MobileChrome $g $W '서명 + 사본 발송'

    # context
    Draw-FilledRect $g 16 116 ($W - 32) 70 $Neutral0
    Draw-StrokeRect $g 16 116 ($W - 32) 70 $Neutral200 1
    Draw-Text $g '[차] 1톤 #1   [1] SL-001' 28 128 13 $ArologisTeal700
    Draw-Text $g '대구공조 (P-1234)' 28 150 14 $Neutral900
    Draw-Text $g '인천 남동구 남동대로215번길 30' 28 170 12 $Neutral500

    Draw-Text $g '서명 (자신 + 인수자)' 16 200 13 $Neutral700
    Draw-Text $g '기사 본인' 16 222 12 $Neutral500
    Draw-SignaturePad $g 16 240 ($W - 32) 130 'Driver' $true
    Draw-Text $g '인수자' 16 384 12 $Neutral500
    Draw-SignaturePad $g 16 402 ($W - 32) 130 'Recipient' $true

    # masked phone
    Draw-FilledRect $g 16 548 ($W - 32) 60 $ArologisTeal50
    Draw-StrokeRect $g 16 548 ($W - 32) 60 $ArologisTeal400 1
    Draw-Text $g '[전화] 인수자 번호 (마스킹)' 28 558 12 $ArologisTeal700
    Draw-Text $g '010-****-5678' 28 578 18 $ArologisTeal700 $FontMono 'Bold'

    # disabled completed button
    $btnY = 624
    $halfW = [int](($W - 32) / 2 - 6)
    Draw-FilledRect $g 16 $btnY $halfW 56 $Neutral200
    Draw-CenteredText $g '[OK] 완료됨' (16 + [int]($halfW / 2)) ($btnY + 18) 14 $Neutral500

    # retry button (active)
    $rbX = 16 + $halfW + 12
    Draw-FilledRect $g $rbX $btnY $halfW 56 $Amber500
    Draw-CenteredText $g '재시도' ($rbX + [int]($halfW / 2)) ($btnY + 18) 16 $Neutral0

    # toast — fail with retry
    Draw-Toast $g 16 696 ($W - 32) 80 $Red100 $Red500 '[X]' '사본 합성 실패' 'RENDERER_TIMEOUT — [재시도] 또는 사무실 요청'

    # meta footer
    Draw-MetaFooter $g $W $H @(
        '응답: 200 application/json',
        'copyFailureReason: "RENDERER_TIMEOUT"',
        'copy_send_failure_count = 1 · copy_sent_at = NULL · 재호출 가능'
    ) 'QA Mock - 시나리오 4 (RENDERER_TIMEOUT + 재시도 OK)'

    Save-Bitmap $pack (Join-Path $OutDir '05-renderer-timeout-retry.png')
}

# ------------------------------------------------------------
# 06 — 409 COPY_ALREADY_SENT (시나리오 2)
# ------------------------------------------------------------
function Render-06-AlreadySent409 {
    $W = 390; $H = 920
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    Draw-MobileChrome $g $W '서명 + 사본 발송'

    # context
    Draw-FilledRect $g 16 116 ($W - 32) 70 $Neutral0
    Draw-StrokeRect $g 16 116 ($W - 32) 70 $Neutral200 1
    Draw-Text $g '[차] 1톤 #1   [1] SL-001' 28 128 13 $ArologisTeal700
    Draw-Text $g '대구공조 (P-1234)' 28 150 14 $Neutral900
    Draw-Text $g '인천 남동구 남동대로215번길 30' 28 170 12 $Neutral500

    # already sent banner
    Draw-FilledRect $g 16 196 ($W - 32) 80 $Red100
    Draw-StrokeRect $g 16 196 ($W - 32) 80 $Red500 2
    Draw-Text $g '[중복]' 28 220 18 $Red500
    Draw-Text $g '이미 발송된 사본' 96 208 16 $Red500
    Draw-Text $g '이전 발송: 2026-05-15 14:30:12 (KST)' 96 232 13 $Neutral700
    Draw-Text $g 'Admin 재발송 필요 시 사무실에 요청' 96 252 12 $Neutral500

    # context: signature pads (read-only/dimmed)
    Draw-Text $g '서명 (이미 저장됨)' 16 290 13 $Neutral500
    Draw-FilledRect $g 16 312 ($W - 32) 100 $Neutral100
    Draw-StrokeRect $g 16 312 ($W - 32) 100 $Neutral300 1
    Draw-Text $g 'Driver' 24 320 12 $Neutral500
    Draw-Text $g '[잠금] read-only' ($W - 130) 320 12 $Neutral500
    Draw-CenteredText $g '서명 saved (PR #99 LINK 또는 Phase F APP)' ([int]($W / 2)) 360 13 $Neutral500 $FontHan 'Italic'

    Draw-FilledRect $g 16 424 ($W - 32) 100 $Neutral100
    Draw-StrokeRect $g 16 424 ($W - 32) 100 $Neutral300 1
    Draw-Text $g 'Recipient' 24 432 12 $Neutral500
    Draw-Text $g '[잠금] read-only' ($W - 130) 432 12 $Neutral500
    Draw-CenteredText $g '인수자 서명 saved' ([int]($W / 2)) 472 13 $Neutral500 $FontHan 'Italic'

    # button disabled
    $btnY = 548
    Draw-FilledRect $g 16 $btnY ($W - 32) 56 $Neutral300
    Draw-CenteredText $g '[OK] 완료 + 사본 발송 (불가)' ([int]($W / 2)) ($btnY + 18) 14 $Neutral500

    # admin contact card
    Draw-FilledRect $g 16 624 ($W - 32) 88 $ArologisTeal50
    Draw-StrokeRect $g 16 624 ($W - 32) 88 $ArologisTeal400 1
    Draw-Text $g '[전화] 사무실 연락' 28 636 13 $ArologisTeal700
    Draw-Text $g '02-1234-5678 (배차담당 김배차)' 28 658 13 $ArologisTeal700 $FontMono 'Regular'
    Draw-Text $g '재발송 사유 + signatureId 전달' 28 680 12 $Neutral500

    # meta footer
    Draw-MetaFooter $g $W $H @(
        '응답: 409 application/json',
        '{ error: "COPY_ALREADY_SENT" }',
        'previousCopySentAt: "2026-05-15T14:30:12+09:00"'
    ) 'QA Mock - 시나리오 2 (409 COPY_ALREADY_SENT)'

    Save-Bitmap $pack (Join-Path $OutDir '06-already-sent-409.png')
}

# ------------------------------------------------------------
# 07 — 사진 → 서명 chain (시나리오 7, D-DF-13 W10-4 deep link)
# ------------------------------------------------------------
function Render-07-PhotoSignatureChain {
    $W = 390; $H = 980
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    Draw-MobileChrome $g $W 'D-DF-13 사진->서명 chain'

    # split view: top = SignaturePhotoScreen done, bottom = DriverSignatureScreen entry

    # top half: SignaturePhotoScreen (DELIVERY 업로드 완료)
    $topY = 116
    $topH = 380
    Draw-FilledRect $g 16 $topY ($W - 32) 28 $ArologisTeal500
    Draw-Text $g 'SignaturePhotoScreen (P1-8 Stage 4)' 24 ($topY + 6) 13 $Neutral0

    Draw-FilledRect $g 16 ($topY + 28) ($W - 32) ($topH - 28) $Neutral0
    Draw-StrokeRect $g 16 ($topY + 28) ($W - 32) ($topH - 28) $Neutral200 1

    # toggle ON + DELIVERY type
    Draw-FilledRect $g 28 ($topY + 42) ($W - 56) 30 $ArologisTeal50
    Draw-Text $g '[ON] 사진 첨부 · 유형: DELIVERY' 36 ($topY + 48) 13 $ArologisTeal700

    # 3 thumb mock — 텍스트 라벨 ([사진 1])
    $thumbY = $topY + 84
    for($i = 0; $i -lt 3; $i++){
        $tx = 28 + $i * 110
        Draw-FilledRect $g $tx $thumbY 100 130 $Neutral100
        Draw-StrokeRect $g $tx $thumbY 100 130 $Neutral300 1
        # placeholder 명시 텍스트 ([사진 N])
        Draw-CenteredText $g ("[사진 $($i+1)]") ($tx + 50) ($thumbY + 36) 14 $Neutral700
        Draw-CenteredText $g ("delivery_$($i+1).jpg") ($tx + 50) ($thumbY + 78) 12 $Neutral700
        Draw-CenteredText $g '~720KB · 1MB 압축' ($tx + 50) ($thumbY + 94) 12 $Neutral500
        Draw-CenteredText $g '[OK] 업로드' ($tx + 50) ($thumbY + 110) 12 $Green500
    }

    # GPS exif + uploaded indicator
    $upY = $topY + 232
    Draw-FilledRect $g 28 $upY ($W - 56) 60 $Green100
    Draw-StrokeRect $g 28 $upY ($W - 56) 60 $Green500 1
    Draw-Text $g '[OK] 3장 업로드 완료' 40 ($upY + 6) 13 $Green500
    Draw-Text $g 'batchToken · slip_attachments INSERT (slip-service V14)' 40 ($upY + 26) 12 $Neutral700
    Draw-Text $g 'EXIF GPS: 37.4979, 127.0276 · capturedAt 보관' 40 ($upY + 42) 12 $Neutral500

    # auto navigate notice (W10-4 deep link)
    Draw-FilledRect $g 28 ($upY + 68) ($W - 56) 38 $ArologisTeal500
    Draw-CenteredText $g 'onUploaded -> DriverSignatureScreen 자동 진입 (W10-4 deep link)' ([int]($W / 2)) ($upY + 80) 12 $Neutral0

    # arrow (텍스트 화살표)
    Draw-CenteredText $g 'V' ([int]($W / 2)) ($topY + $topH + 6) 22 $ArologisTeal500

    # bottom half: DriverSignatureScreen (chain 진입 완료)
    $botY = $topY + $topH + 40
    $botH = $H - $botY - 110
    Draw-FilledRect $g 16 $botY ($W - 32) 28 $ArologisTeal700
    Draw-Text $g 'DriverSignatureScreen (Phase F D-DF-07)' 24 ($botY + 6) 13 $Neutral0

    Draw-FilledRect $g 16 ($botY + 28) ($W - 32) ($botH - 28) $Neutral0
    Draw-StrokeRect $g 16 ($botY + 28) ($W - 32) ($botH - 28) $Neutral200 1

    Draw-Text $g 'SL-001 대구공조 (P-1234) · 010-****-5678' 28 ($botY + 42) 13 $ArologisTeal700
    Draw-Text $g '사진 3장 첨부됨 (DELIVERY) — slip-service attachment 적재' 28 ($botY + 62) 12 $Neutral500

    # mini sign pads
    Draw-SignaturePad $g 28 ($botY + 88) 152 70 'Driver' $true
    Draw-SignaturePad $g 192 ($botY + 88) 162 70 'Recipient' $true

    # 1-tap 완료+발송 button
    $btnY = $botY + 174
    Draw-FilledRect $g 28 $btnY ($W - 56) 48 $ArologisTeal500
    Draw-CenteredText $g '[OK] 완료 + 사본 발송 (1-tap)' ([int]($W / 2)) ($btnY + 14) 14 $Neutral0

    # SQL audit overlay
    Draw-Text $g '검증 SQL (slip-service):' 28 ($botY + 234) 12 $Neutral700
    Draw-Text $g 'SELECT ... FROM slip_attachments WHERE slip_id=? AND type=DELIVERY' 28 ($botY + 250) 12 $Neutral500 $FontMono 'Regular'
    Draw-Text $g '-> 3 row · uploaded_at = chain 시각 +-5초' 28 ($botY + 266) 12 $Green500 $FontMono 'Regular'

    # meta footer
    Draw-MetaFooter $g $W $H @(
        'D-DF-13 chain: SignaturePhotoScreen.onUploaded -> navigate(DriverSignature)',
        'slip-service V14 slip_attachments 적재 검증 SQL'
    ) 'QA Mock - 시나리오 7 (D-DF-13 사진->서명 chain)'

    Save-Bitmap $pack (Join-Path $OutDir '07-photo-then-signature-chain.png')
}

# Render all 7
Render-01-SignatureSuccess
Render-02-ShareSheetAndroid
Render-03-ShareSheetIOS
Render-04-RecipientPhoneMissing
Render-05-RendererTimeoutRetry
Render-06-AlreadySent409
Render-07-PhotoSignatureChain

Write-Host ''
Write-Host 'samhan-signature-copy mock screenshots 7장 생성 완료:'
Get-ChildItem $OutDir -Filter '*.png' | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0,-44} {1,6:N1} KB" -f $_.Name, ($_.Length / 1KB))
}
