# scripts/generate-samhan-dispatch-modification-screenshots.ps1
# Samhan Public 배차 수정/취소 흐름 (Phase C) QA 6 시나리오 mock PNG 생성기.
# .NET System.Drawing 으로 layout 명세 + 핵심 text 표기 + arologis-teal brand color 를 PNG 로 렌더링.
# Designer 의 docs/uiux/samhan-dispatch-modification/01~04.md 화면 토큰 + spec § 6 UI Layout 기반.
# PR #185/#187/#188 (Phase A) 의 generate-samhan-dispatch-board-screenshots.ps1 패턴 일관.
#
# 사용법:
#   pwsh ./scripts/generate-samhan-dispatch-modification-screenshots.ps1
#
# 출력: docs/qa/samhan-dispatch-modification/screenshots/01~06.png (6장)
#
# 가드:
#   - UTF-8 BOM (Windows PowerShell 5.1 한글 parse, [[feedback_powershell_utf8_writes]])
#   - Join-Path 단일 arg (PowerShell 5.1 호환)
#   - arologis-teal `#2A9D8F` brand 일관
#   - 재실행 가능 (한 번 실행으로 6장 재생성)
#   - Pretendard 폰트 fallback → 시스템 default 'Segoe UI'
#   - Phase C 6 신규 상태 색상: 보라 (REQUESTED) / 녹색 (ACCEPTED) / 빨강 (REJECTED) / 회색 (CANCELLED)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

# arologis brand teal palette (Designer §3.1)
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

$Green500  = [System.Drawing.ColorTranslator]::FromHtml('#22C55E')
$Green100  = [System.Drawing.ColorTranslator]::FromHtml('#DCFCE7')
$Red500    = [System.Drawing.ColorTranslator]::FromHtml('#EF4444')
$Red100    = [System.Drawing.ColorTranslator]::FromHtml('#FEE2E2')
$Amber500  = [System.Drawing.ColorTranslator]::FromHtml('#F59E0B')
$Blue500   = [System.Drawing.ColorTranslator]::FromHtml('#3B82F6')
$Blue100   = [System.Drawing.ColorTranslator]::FromHtml('#DBEAFE')
$Purple500 = [System.Drawing.ColorTranslator]::FromHtml('#8B5CF6')
$Purple100 = [System.Drawing.ColorTranslator]::FromHtml('#EDE9FE')
$Gray500   = [System.Drawing.ColorTranslator]::FromHtml('#6B7280')
$Gray100   = [System.Drawing.ColorTranslator]::FromHtml('#E5E7EB')

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\samhan-dispatch-modification\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if(-not (Test-Path $OutDir)){ New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
Write-Host "[generate-samhan-dispatch-modification-screenshots] output dir: $OutDir"

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

function Draw-Text {
    param($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$Size, [System.Drawing.Color]$Color, [string]$Family = 'Segoe UI', [string]$Style = 'Regular')
    $fontStyle = [System.Drawing.FontStyle]::$Style
    $font = New-Object System.Drawing.Font $Family, $Size, $fontStyle, ([System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush $Color
    $Graphics.DrawString($Text, $font, $brush, [single]$X, [single]$Y)
    $font.Dispose()
    $brush.Dispose()
}

function Measure-Text {
    param($Graphics, [string]$Text, [int]$Size, [string]$Family = 'Segoe UI', [string]$Style = 'Regular')
    $fontStyle = [System.Drawing.FontStyle]::$Style
    $font = New-Object System.Drawing.Font $Family, $Size, $fontStyle, ([System.Drawing.GraphicsUnit]::Pixel)
    $sz = $Graphics.MeasureString($Text, $font)
    $font.Dispose()
    return $sz
}

function Draw-CenteredText {
    param($Graphics, [string]$Text, [int]$CenterX, [int]$Y, [int]$Size, [System.Drawing.Color]$Color, [string]$Family = 'Segoe UI', [string]$Style = 'Regular')
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
    Write-Host ("  saved {0,-50} {1,6:N1} KB" -f $fi.Name, ($fi.Length / 1KB))
}

# Shared layout — desktop sidebar + chrome (Phase A 패턴 일관)
function Draw-DesktopChrome {
    param($Graphics, [int]$W, [int]$H, [string]$TitleText)
    Draw-FilledRect $Graphics 0 0 $W 36 $Neutral700
    Draw-Text $Graphics $TitleText 16 9 14 $Neutral0
    $dotY = 12
    foreach($i in 0..2){
        $c = @($Red500, $Amber500, $Green500)[$i]
        $brush = New-Object System.Drawing.SolidBrush $c
        $Graphics.FillEllipse($brush, ($W - 80 + $i * 22), $dotY, 12, 12)
        $brush.Dispose()
    }
}

function Draw-DesktopSidebar {
    param($Graphics, [int]$W, [int]$H, [int]$SidebarWidth = 220)
    Draw-FilledRect $Graphics 0 36 $SidebarWidth ($H - 36) $Neutral50
    Draw-StrokeRect $Graphics 0 36 $SidebarWidth ($H - 36) $Neutral200 1
    Draw-Text $Graphics 'Samhan Public' 20 60 16 $ArologisTeal700 'Segoe UI' 'Bold'
    $menuItems = @('견적','주문','창고','배차 메뉴','회계','거래처')
    $menuY = 110
    foreach($m in $menuItems){
        $highlight = ($m -eq '배차 메뉴')
        if($highlight){
            Draw-FilledRect $Graphics 10 ($menuY - 6) ($SidebarWidth - 20) 32 $ArologisTeal50
            Draw-Text $Graphics "▶ $m" 22 $menuY 14 $ArologisTeal700 'Segoe UI' 'Bold'
        } else {
            Draw-Text $Graphics "▸ $m" 22 $menuY 14 $Neutral700
        }
        $menuY += 40
    }
    Draw-Text $Graphics '김배차 (배차담당)' 20 ($H - 80) 12 $Neutral500
    Draw-Text $Graphics '⏻ 로그아웃' 20 ($H - 56) 12 $Neutral700
}

# Status pill (Phase C 6 신규 상태)
function Draw-StatusPill {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Text, [System.Drawing.Color]$BgColor, [System.Drawing.Color]$BorderColor, [System.Drawing.Color]$TextColor)
    Draw-FilledRect $Graphics $X $Y $W $H $BgColor
    Draw-StrokeRect $Graphics $X $Y $W $H $BorderColor 1
    Draw-CenteredText $Graphics $Text ([int]($X + $W / 2)) ($Y + 6) 12 $TextColor 'Segoe UI' 'Bold'
}

# ------------------------------------------------------------
# 01 — DispatchTask DISPATCHED 상세 + 기사 정보 + [수정 요청] / [취소 요청] 버튼
# ------------------------------------------------------------
function Render-01-TaskDetailWithActions {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  DispatchTask 상세 (DISPATCHED)'
    Draw-DesktopSidebar $g $W $H 220

    # dim overlay
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(100, 15, 18, 22))
    $g.FillRectangle($overlay, 220, 36, $W - 220, $H - 36)
    $overlay.Dispose()

    # side modal (right-aligned)
    $modW = 580; $modH = $H - 36
    $modX = $W - $modW
    $modY = 36
    Draw-FilledRect $g $modX $modY $modW $modH $Neutral0
    Draw-StrokeRect $g $modX $modY $modW $modH $Neutral200 1

    # header
    Draw-FilledRect $g $modX $modY $modW 64 $Green500
    Draw-Text $g 'DT-20260514-001' ($modX + 24) ($modY + 14) 14 $Neutral0
    Draw-Text $g '배차 작업 상세' ($modX + 24) ($modY + 36) 18 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '×' ($modX + $modW - 36) ($modY + 18) 24 $Neutral0

    # status pill — DISPATCHED
    Draw-StatusPill $g ($modX + $modW - 156) ($modY + 14) 124 26 '✓ 배차 완료' $Green100 $Neutral0 $Green500

    # section: 배차 정보
    $y = $modY + 88
    Draw-Text $g '배차 정보' ($modX + 24) $y 12 $Neutral500
    Draw-Text $g '2026-05-14  (today)' ($modX + 24) ($y + 18) 14 $Neutral900
    $y += 50

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # section: 기사
    Draw-Text $g '기사' ($modX + 24) $y 12 $Neutral500
    Draw-FilledRect $g ($modX + 24) ($y + 20) ($modW - 48) 60 $Green100
    Draw-StrokeRect $g ($modX + 24) ($y + 20) ($modW - 48) 60 $Green500 1
    Draw-Text $g '👤' ($modX + 38) ($y + 36) 18 $Green500
    Draw-Text $g 'D-001  홍길동' ($modX + 74) ($y + 32) 14 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '☎ 010-1234-5678' ($modX + 74) ($y + 54) 13 $Neutral700 'Consolas'
    Draw-Text $g '(인성데이타)' ($modX + 240) ($y + 54) 11 $Amber500 'Segoe UI' 'Bold'
    $y += 96

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # section: 차량 그룹 + slip 정차 순서
    Draw-Text $g '차량 그룹 + 정차 순서' ($modX + 24) $y 12 $Neutral500
    $y += 20

    # group 1톤 #1 (3 slips)
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 30 $ArologisTeal500
    Draw-Text $g '🚚  1톤  #1' ($modX + 36) ($y + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '3 건' ($modX + $modW - 96) ($y + 8) 12 $Neutral0
    $y += 30
    foreach($pair in @(@('①','SL-001','대구공조'),@('②','SL-005','한솔'),@('③','SL-009','영진'))){
        Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 26 $Neutral50
        Draw-StrokeRect $g ($modX + 24) $y ($modW - 48) 26 $Neutral200 1
        Draw-Text $g $pair[0] ($modX + 38) ($y + 6) 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $pair[1] ($modX + 70) ($y + 6) 13 $Neutral900 'Segoe UI' 'Bold'
        Draw-Text $g $pair[2] ($modX + 150) ($y + 6) 13 $Neutral700
        $y += 26
    }
    $y += 12

    # section: 본 슬라이스 (Phase C) hint
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16
    Draw-Text $g '배차 완료 후 수정/취소 필요?' ($modX + 24) $y 12 $Neutral500
    Draw-Text $g '아로로지스에 요청 발송 → 수락 시 편집 가능' ($modX + 24) ($y + 18) 13 $Neutral700
    $y += 50

    # action buttons — [수정 요청] [취소 요청]
    $btnY = $modY + $modH - 76
    Draw-FilledRect $g $modX ($btnY - 12) $modW 1 $Neutral200

    # [✏ 수정 요청] arologis-teal primary
    Draw-FilledRect $g ($modX + 24) $btnY 252 48 $ArologisTeal500
    Draw-CenteredText $g '✏  수정 요청' ($modX + 24 + 126) ($btnY + 14) 16 $Neutral0 'Segoe UI' 'Bold'

    # [✗ 취소 요청] red secondary
    Draw-FilledRect $g ($modX + 300) $btnY 252 48 $Neutral0
    Draw-StrokeRect $g ($modX + 300) $btnY 252 48 $Red500 2
    Draw-CenteredText $g '✗  취소 요청' ($modX + 300 + 126) ($btnY + 14) 16 $Red500 'Segoe UI' 'Bold'

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 1 (DISPATCHED 상세 + 수정/취소 버튼 노출)' 16 ($H - 22) 11 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '01-task-detail-with-actions.png')
}

# ------------------------------------------------------------
# 02 — 수정 요청 dialog (사유 textarea + 발송 버튼)
# ------------------------------------------------------------
function Render-02-ModificationRequestDialog {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  수정 요청 dialog'
    Draw-DesktopSidebar $g $W $H 220

    # dim overlay (heavier — modal focus)
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(140, 15, 18, 22))
    $g.FillRectangle($overlay, 220, 36, $W - 220, $H - 36)
    $overlay.Dispose()

    # parent: DispatchTaskDetailModal (dimmed background)
    $parentX = $W - 580
    $parentY = 36
    Draw-FilledRect $g $parentX $parentY 580 ($H - 36) ([System.Drawing.Color]::FromArgb(220, 247, 248, 250))

    # modal centered
    $modW = 560; $modH = 440
    $modX = [int]((($W - 220) / 2) + 220 - ($modW / 2))
    $modY = [int]((($H - 36) / 2) + 36 - ($modH / 2))
    Draw-FilledRect $g $modX $modY $modW $modH $Neutral0
    Draw-StrokeRect $g $modX $modY $modW $modH $Neutral200 1

    # header — purple (REQUESTED 톤)
    Draw-FilledRect $g $modX $modY $modW 56 $Purple500
    Draw-Text $g '✏  수정 요청' ($modX + 24) ($modY + 18) 18 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '×' ($modX + $modW - 36) ($modY + 14) 24 $Neutral0

    # context: 작업 코드
    $y = $modY + 76
    Draw-Text $g '대상 배차 작업' ($modX + 24) $y 11 $Neutral500
    Draw-Text $g 'DT-20260514-001' ($modX + 24) ($y + 18) 14 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '(1톤 #1 그룹의 3건 · 기사 D-001 홍길동)' ($modX + 180) ($y + 22) 12 $Neutral500
    $y += 60

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # 사유 label
    Draw-Text $g '사유 (선택)' ($modX + 24) $y 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g '아로로지스 관리자에게 전달됩니다 · 최대 500자' ($modX + 110) ($y + 2) 11 $Neutral500
    $y += 24

    # textarea
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 104 $Neutral50
    Draw-StrokeRect $g ($modX + 24) $y ($modW - 48) 104 $Purple500 2
    Draw-Text $g '슬립 SL-009 추가 + 정차 순서 조정 필요' ($modX + 36) ($y + 14) 13 $Neutral900
    Draw-Text $g '|' ($modX + 286) ($y + 14) 13 $Purple500 'Segoe UI' 'Bold'
    Draw-Text $g '36 / 500' ($modX + $modW - 88) ($y + 84) 11 $Neutral500
    $y += 120

    # info banner
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 44 $Purple100
    Draw-StrokeRect $g ($modX + 24) $y ($modW - 48) 44 $Purple500 1
    Draw-Text $g 'ℹ' ($modX + 38) ($y + 12) 14 $Purple500
    Draw-Text $g '발송 후 아로로지스 응답을 5초간 대기합니다.' ($modX + 60) ($y + 8) 12 $Neutral700
    Draw-Text $g '수락 시 편집 모드 활성, 거부 시 사유와 함께 알림이 표시됩니다.' ($modX + 60) ($y + 24) 11 $Neutral500

    # footer buttons
    $btnY = $modY + $modH - 60
    Draw-FilledRect $g $modX ($modY + $modH - 70) $modW 1 $Neutral200
    Draw-FilledRect $g ($modX + $modW - 280) $btnY 110 40 $Neutral100
    Draw-StrokeRect $g ($modX + $modW - 280) $btnY 110 40 $Neutral300 1
    Draw-CenteredText $g '취소' ($modX + $modW - 225) ($btnY + 12) 14 $Neutral700

    # [요청 발송] arologis-teal primary
    Draw-FilledRect $g ($modX + $modW - 156) $btnY 132 40 $ArologisTeal500
    Draw-CenteredText $g '요청 발송' ($modX + $modW - 90) ($btnY + 12) 14 $Neutral0 'Segoe UI' 'Bold'

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 1 (ModificationRequestDialog - 사유 입력 + 발송)' 16 ($H - 22) 11 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '02-modification-request-dialog.png')
}

# ------------------------------------------------------------
# 03 — MODIFICATION_ACCEPTED 편집 모드 (drag-and-drop 활성 + [배차 완료] 재 + 보라→녹색 배지)
# ------------------------------------------------------------
function Render-03-ModificationAcceptedEditMode {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  MODIFICATION_ACCEPTED (편집 모드)'
    Draw-DesktopSidebar $g $W $H 220

    # main area
    $mx = 220 + 24
    $my = 56
    $mw = $W - $mx - 24
    $mh = $H - $my - 24

    Draw-Text $g '배차 메뉴' $mx $my 22 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '✓ 아로로지스 수락 — 편집 모드 활성' $mx ($my + 32) 13 $Green500 'Segoe UI' 'Bold'

    # left panel — 미배차
    $leftX = $mx
    $leftY = $my + 70
    $leftW = [int](($mw - 24) * 0.45)
    $leftH = $mh - 70
    Draw-FilledRect $g $leftX $leftY $leftW $leftH $Neutral0
    Draw-StrokeRect $g $leftX $leftY $leftW $leftH $Neutral200 1
    Draw-Text $g '미배차 출고전표 (149)' ($leftX + 16) ($leftY + 14) 15 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g 'drag → 우측 그룹으로 추가 가능' ($leftX + 16) ($leftY + 36) 11 $Green500

    Draw-FilledRect $g ($leftX + 16) ($leftY + 60) ($leftW - 32) 1 $Neutral200

    $slips = @(
        @('SL-002','한진산업'),
        @('SL-003','영진통상'),
        @('SL-004','마트로닉'),
        @('SL-006','광주물류'),
        @('SL-007','부산항만'),
        @('SL-008','강원유통'),
        @('SL-010','인천공조'),
        @('SL-020','신규거래처','dragging'),
        @('SL-021','동양로지'),
        @('SL-022','한라유통')
    )
    $rowY = $leftY + 78
    foreach($slip in $slips){
        $isDragging = ($slip.Length -ge 3 -and $slip[2] -eq 'dragging')
        $bg = if($isDragging){ $ArologisTeal50 } else { $Neutral0 }
        $bd = if($isDragging){ $ArologisTeal500 } else { $Neutral100 }
        $bw = if($isDragging){ 2 } else { 1 }
        Draw-FilledRect $g ($leftX + 16) $rowY ($leftW - 32) 26 $bg
        Draw-StrokeRect $g ($leftX + 16) $rowY ($leftW - 32) 26 $bd $bw
        Draw-Text $g '☰' ($leftX + 24) ($rowY + 6) 14 $Neutral500
        Draw-Text $g $slip[0] ($leftX + 50) ($rowY + 6) 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $slip[1] ($leftX + 130) ($rowY + 6) 13 $Neutral900
        if($isDragging){
            Draw-Text $g '드래그 중 →' ($leftX + 260) ($rowY + 6) 11 $ArologisTeal600 'Segoe UI' 'Bold'
        }
        $rowY += 28
    }

    # right panel — 차량 그룹 + status MODIFICATION_ACCEPTED 녹색 배지
    $rightX = $leftX + $leftW + 24
    $rightY = $leftY
    $rightW = $mw - $leftW - 24
    $rightH = $leftH
    Draw-FilledRect $g $rightX $rightY $rightW $rightH $Neutral0
    Draw-StrokeRect $g $rightX $rightY $rightW $rightH $Neutral200 1

    Draw-Text $g '차량 그룹 (DT-20260514-001)' ($rightX + 16) ($rightY + 14) 15 $Neutral900 'Segoe UI' 'Bold'

    # status pill — MODIFICATION_ACCEPTED (녹색) + 이전 REQUESTED 의 보라 transition hint
    $pillX = $rightX + $rightW - 200
    Draw-StatusPill $g $pillX ($rightY + 14) 184 26 '✓ 수정 가능 (편집 모드)' $Green100 $Green500 $Green500

    # transition arrow
    Draw-Text $g '보라 → 녹색 자동 전환 (5초)' ($rightX + 16) ($rightY + 38) 11 $Green500

    Draw-FilledRect $g ($rightX + 16) ($rightY + 50) ($rightW - 32) 1 $Neutral200

    # request reason banner
    $banY = $rightY + 60
    Draw-FilledRect $g ($rightX + 16) $banY ($rightW - 32) 40 $Green100
    Draw-StrokeRect $g ($rightX + 16) $banY ($rightW - 32) 40 $Green500 1
    Draw-Text $g '📋  요청 사유' ($rightX + 30) ($banY + 6) 11 $Green500 'Segoe UI' 'Bold'
    Draw-Text $g '슬립 SL-009 추가 + 정차 순서 조정 필요' ($rightX + 30) ($banY + 22) 12 $Neutral900

    # group 1톤 #1 — 편집 모드 (drag-and-drop 활성)
    $vgY = $banY + 56
    $vgCardW = $rightW - 32
    $vgH1 = 220
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral0
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Green500 2
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW 30 $Green500
    Draw-Text $g '🚚  1톤  #1' ($rightX + 28) ($vgY + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '편집 가능' ($rightX + $vgCardW - 80) ($vgY + 8) 12 $Neutral0 'Segoe UI' 'Bold'

    # slip rows + drag handle
    $itemY = $vgY + 40
    foreach($pair in @(@('①','SL-001','대구공조'),@('②','SL-005','한솔'),@('③','SL-009','영진'))){
        Draw-FilledRect $g ($rightX + 28) $itemY ($vgCardW - 24) 30 $Neutral50
        Draw-StrokeRect $g ($rightX + 28) $itemY ($vgCardW - 24) 30 $Neutral200 1
        Draw-Text $g '☰' ($rightX + 38) ($itemY + 8) 13 $Neutral500
        Draw-Text $g $pair[0] ($rightX + 62) ($itemY + 8) 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $pair[1] ($rightX + 88) ($itemY + 8) 13 $Neutral900 'Segoe UI' 'Bold'
        Draw-Text $g $pair[2] ($rightX + 170) ($itemY + 8) 13 $Neutral700
        Draw-Text $g '×' ($rightX + $vgCardW - 16) ($itemY + 8) 13 $Red500
        $itemY += 34
    }

    # drag drop hint zone
    Draw-FilledRect $g ($rightX + 28) ($itemY + 4) ($vgCardW - 24) 38 $ArologisTeal50
    Draw-StrokeRect $g ($rightX + 28) ($itemY + 4) ($vgCardW - 24) 38 $ArologisTeal400 2
    Draw-CenteredText $g '⬇ 미배차 전표를 여기로 드래그하세요' ([int]($rightX + $vgCardW / 2 + 16)) ($itemY + 16) 12 $ArologisTeal600 'Segoe UI' 'Bold'

    $vgY += $vgH1 + 12

    # 배차 완료 재 button (재 노출)
    $btnY = $rightY + $rightH - 56
    Draw-FilledRect $g ($rightX + 16) $btnY ($rightW - 32) 40 $ArologisTeal500
    Draw-CenteredText $g '✓ 배차 완료 (재 발송)' ([int]($rightX + $rightW / 2)) ($btnY + 10) 15 $Neutral0 'Segoe UI' 'Bold'

    Draw-Text $g 'arologis 가 기존 Dispatch soft-delete → 새 Dispatch 생성 (D-DC-04)' ($rightX + 16) ($btnY - 22) 11 $Neutral500

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 2~3 (MODIFICATION_ACCEPTED 편집 모드 + 재 배차 완료)' 16 ($H - 22) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '03-modification-accepted-edit-mode.png')
}

# ------------------------------------------------------------
# 04 — MODIFICATION_REJECTED 사유 표시 (red 배지 + rejectionReason)
# ------------------------------------------------------------
function Render-04-ModificationRejected {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  MODIFICATION_REJECTED (수정 거부)'
    Draw-DesktopSidebar $g $W $H 220

    # dim overlay
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(100, 15, 18, 22))
    $g.FillRectangle($overlay, 220, 36, $W - 220, $H - 36)
    $overlay.Dispose()

    # side modal
    $modW = 580; $modH = $H - 36
    $modX = $W - $modW
    $modY = 36
    Draw-FilledRect $g $modX $modY $modW $modH $Neutral0
    Draw-StrokeRect $g $modX $modY $modW $modH $Neutral200 1

    # header — red (REJECTED)
    Draw-FilledRect $g $modX $modY $modW 64 $Red500
    Draw-Text $g 'DT-20260514-002' ($modX + 24) ($modY + 14) 14 $Neutral0
    Draw-Text $g '배차 작업 상세' ($modX + 24) ($modY + 36) 18 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '×' ($modX + $modW - 36) ($modY + 18) 24 $Neutral0

    # status pill — REJECTED
    Draw-StatusPill $g ($modX + $modW - 156) ($modY + 14) 124 26 '✗ 수정 거부' $Red100 $Neutral0 $Red500

    # rejection reason banner (top emphasis)
    $y = $modY + 88
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 124 $Red100
    Draw-StrokeRect $g ($modX + 24) $y ($modW - 48) 124 $Red500 2
    Draw-Text $g '⚠' ($modX + 40) ($y + 14) 22 $Red500
    Draw-Text $g '아로로지스 수정 거부' ($modX + 76) ($y + 14) 14 $Red500 'Segoe UI' 'Bold'

    Draw-Text $g '요청 사유' ($modX + 40) ($y + 46) 11 $Neutral500
    Draw-Text $g '정차 순서 재 조정' ($modX + 110) ($y + 44) 13 $Neutral700

    Draw-Text $g '거부 사유' ($modX + 40) ($y + 70) 11 $Red500 'Segoe UI' 'Bold'
    Draw-Text $g 'arologis 관리자 reject:' ($modX + 110) ($y + 68) 13 $Neutral900
    Draw-Text $g '시뮬레이션 거부 (AUTO_ACCEPT=false)' ($modX + 110) ($y + 86) 13 $Neutral900

    Draw-Text $g '결정 시각: 2026-05-14 14:22:31 (요청 발송 후 5.2초)' ($modX + 40) ($y + 104) 11 $Neutral500
    $y += 140

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # 기사 정보 — 변경 없음 (DISPATCHED 흐름 유지)
    Draw-Text $g '기사 (DISPATCHED 흐름 유지)' ($modX + 24) $y 12 $Neutral500
    Draw-FilledRect $g ($modX + 24) ($y + 20) ($modW - 48) 60 $Green100
    Draw-StrokeRect $g ($modX + 24) ($y + 20) ($modW - 48) 60 $Green500 1
    Draw-Text $g '👤' ($modX + 38) ($y + 36) 18 $Green500
    Draw-Text $g 'D-001  홍길동' ($modX + 74) ($y + 32) 14 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '☎ 010-1234-5678' ($modX + 74) ($y + 54) 13 $Neutral700 'Consolas'
    $y += 92

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # 차량 그룹 (DISPATCHED 유지)
    Draw-Text $g '차량 그룹 (DISPATCHED 유지)' ($modX + 24) $y 12 $Neutral500
    $y += 20
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 30 $ArologisTeal500
    Draw-Text $g '🚚  1톤  #1' ($modX + 36) ($y + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g 'DISPATCHED' ($modX + $modW - 144) ($y + 8) 12 $Neutral0 'Segoe UI' 'Bold'
    $y += 30
    foreach($pair in @(@('①','SL-002','한진'),@('②','SL-006','광주'))){
        Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 26 $Neutral50
        Draw-StrokeRect $g ($modX + 24) $y ($modW - 48) 26 $Neutral200 1
        Draw-Text $g $pair[0] ($modX + 38) ($y + 6) 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $pair[1] ($modX + 70) ($y + 6) 13 $Neutral900 'Segoe UI' 'Bold'
        Draw-Text $g $pair[2] ($modX + 150) ($y + 6) 13 $Neutral700
        Draw-Text $g '✓' ($modX + $modW - 60) ($y + 6) 13 $Green500
        $y += 26
    }

    # action buttons — 재 요청 가능
    $btnY = $modY + $modH - 76
    Draw-FilledRect $g $modX ($btnY - 12) $modW 1 $Neutral200
    Draw-FilledRect $g ($modX + 24) $btnY 252 48 $ArologisTeal500
    Draw-CenteredText $g '✏  수정 재 요청' ($modX + 24 + 126) ($btnY + 14) 16 $Neutral0 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($modX + 300) $btnY 252 48 $Neutral0
    Draw-StrokeRect $g ($modX + 300) $btnY 252 48 $Red500 2
    Draw-CenteredText $g '✗  취소 요청' ($modX + 300 + 126) ($btnY + 14) 16 $Red500 'Segoe UI' 'Bold'

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 4 (MODIFICATION_REJECTED + rejectionReason + 재 요청 가능)' 16 ($H - 22) 11 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '04-modification-rejected.png')
}

# ------------------------------------------------------------
# 05 — CANCELLED + slip UNDISPATCHED 복귀 (배차 메뉴 미배차 list 에 복귀)
# ------------------------------------------------------------
function Render-05-CancellationAccepted {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  CANCELLED (slip UNDISPATCHED 복귀)'
    Draw-DesktopSidebar $g $W $H 220

    # main area
    $mx = 220 + 24
    $my = 56
    $mw = $W - $mx - 24
    $mh = $H - $my - 24

    Draw-Text $g '배차 메뉴' $mx $my 22 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '✓ 취소 수락 — 배차 작업 종료 + slip 복귀 완료' $mx ($my + 32) 13 $Gray500 'Segoe UI' 'Bold'

    # left — 미배차 (SL-030/031 복귀 강조)
    $leftX = $mx
    $leftY = $my + 70
    $leftW = [int](($mw - 24) * 0.45)
    $leftH = $mh - 70
    Draw-FilledRect $g $leftX $leftY $leftW $leftH $Neutral0
    Draw-StrokeRect $g $leftX $leftY $leftW $leftH $Neutral200 1
    Draw-Text $g '미배차 출고전표 (152 +2)' ($leftX + 16) ($leftY + 14) 15 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '⤴ DT-20260514-003 → 취소 → SL-030/031 UNDISPATCHED 복귀' ($leftX + 16) ($leftY + 38) 11 $ArologisTeal600 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($leftX + 16) ($leftY + 60) ($leftW - 32) 1 $Neutral200

    # highlight SL-030/031 (재 배차 후보)
    Draw-FilledRect $g ($leftX + 16) ($leftY + 76) ($leftW - 32) 28 $ArologisTeal50
    Draw-StrokeRect $g ($leftX + 16) ($leftY + 76) ($leftW - 32) 28 $ArologisTeal400 1
    Draw-Text $g '☰' ($leftX + 24) ($leftY + 82) 14 $ArologisTeal500
    Draw-Text $g 'SL-030' ($leftX + 50) ($leftY + 82) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g '동양상사' ($leftX + 130) ($leftY + 82) 13 $Neutral900
    Draw-Text $g '↺ 취소 복귀 — 재 배차 가능' ($leftX + 220) ($leftY + 82) 11 $ArologisTeal600 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($leftX + 16) ($leftY + 110) ($leftW - 32) 28 $ArologisTeal50
    Draw-StrokeRect $g ($leftX + 16) ($leftY + 110) ($leftW - 32) 28 $ArologisTeal400 1
    Draw-Text $g '☰' ($leftX + 24) ($leftY + 116) 14 $ArologisTeal500
    Draw-Text $g 'SL-031' ($leftX + 50) ($leftY + 116) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g '한라통상' ($leftX + 130) ($leftY + 116) 13 $Neutral900
    Draw-Text $g '↺ 취소 복귀 — 재 배차 가능' ($leftX + 220) ($leftY + 116) 11 $ArologisTeal600 'Segoe UI' 'Bold'

    $rowY = $leftY + 150
    foreach($slip in @(@('SL-002','한진산업'),@('SL-003','영진통상'),@('SL-004','마트로닉'),@('SL-005','중부냉동'),@('SL-006','광주물류'),@('SL-007','부산항만'),@('SL-008','강원유통'),@('SL-010','인천공조'))){
        Draw-Text $g '☰' ($leftX + 16) $rowY 14 $Neutral500
        Draw-Text $g $slip[0] ($leftX + 40) $rowY 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $slip[1] ($leftX + 120) $rowY 13 $Neutral900
        Draw-FilledRect $g ($leftX + 16) ($rowY + 20) ($leftW - 32) 1 $Neutral100
        $rowY += 28
    }

    # right — DispatchTask 카드 (CANCELLED dimmed)
    $rightX = $leftX + $leftW + 24
    $rightY = $leftY
    $rightW = $mw - $leftW - 24
    $rightH = $leftH
    Draw-FilledRect $g $rightX $rightY $rightW $rightH $Neutral0
    Draw-StrokeRect $g $rightX $rightY $rightW $rightH $Neutral200 1

    Draw-Text $g '배차 작업 이력 (DT-20260514-003)' ($rightX + 16) ($rightY + 14) 15 $Neutral500 'Segoe UI' 'Bold'

    # status pill — CANCELLED (gray)
    $pillX = $rightX + $rightW - 168
    Draw-StatusPill $g $pillX ($rightY + 14) 152 26 '✗ 취소됨' $Gray100 $Gray500 $Gray500

    Draw-FilledRect $g ($rightX + 16) ($rightY + 50) ($rightW - 32) 1 $Neutral200

    # cancellation reason banner
    $banY = $rightY + 64
    Draw-FilledRect $g ($rightX + 16) $banY ($rightW - 32) 80 $Gray100
    Draw-StrokeRect $g ($rightX + 16) $banY ($rightW - 32) 80 $Gray500 1
    Draw-Text $g '📋  취소 사유' ($rightX + 30) ($banY + 8) 11 $Gray500 'Segoe UI' 'Bold'
    Draw-Text $g '거래처 출고 일정 변경 요청' ($rightX + 30) ($banY + 24) 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '결정 시각: 2026-05-14 14:34:11 (요청 후 5.1초)' ($rightX + 30) ($banY + 46) 11 $Neutral500
    Draw-Text $g 'arologis Dispatch soft-delete + slip UNDISPATCHED cascade 완료 (D-DC-05)' ($rightX + 30) ($banY + 60) 11 $Gray500

    # dimmed group card (이력)
    $vgY = $banY + 96
    $vgCardW = $rightW - 32
    $vgH1 = 200
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral50
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral300 1
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW 30 $Gray500
    Draw-Text $g '🚚  1톤  #1  (취소됨)' ($rightX + 28) ($vgY + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g 'CANCELLED' ($rightX + $vgCardW - 102) ($vgY + 8) 12 $Neutral0 'Segoe UI' 'Bold'

    # dimmed slip rows
    $itemY = $vgY + 40
    foreach($pair in @(@('①','SL-030','동양상사','↺ UNDISPATCHED'),@('②','SL-031','한라통상','↺ UNDISPATCHED'))){
        Draw-Text $g $pair[0] ($rightX + 30) $itemY 13 $Gray500 'Segoe UI' 'Bold'
        Draw-Text $g $pair[1] ($rightX + 60) $itemY 13 $Neutral500 'Segoe UI' 'Bold'
        Draw-Text $g $pair[2] ($rightX + 140) $itemY 13 $Neutral500
        Draw-Text $g $pair[3] ($rightX + 240) $itemY 12 $ArologisTeal600 'Segoe UI' 'Bold'
        $itemY += 28
    }

    # 기사 정보 — soft-delete
    Draw-FilledRect $g ($rightX + 28) ($vgY + 110) ($vgCardW - 24) 60 $Neutral100
    Draw-StrokeRect $g ($rightX + 28) ($vgY + 110) ($vgCardW - 24) 60 $Neutral300 1
    Draw-Text $g '👤' ($rightX + 42) ($vgY + 130) 18 $Neutral300
    Draw-Text $g 'D-003  박기사' ($rightX + 78) ($vgY + 118) 14 $Neutral500
    Draw-Text $g '☎ 010-3456-7890  ·  매칭 해제 (soft-delete)' ($rightX + 78) ($vgY + 140) 12 $Neutral500
    Draw-Text $g 'MOCK' ($rightX + 380) ($vgY + 118) 11 $Neutral300 'Segoe UI' 'Bold'

    # toast
    $vgY += $vgH1 + 12
    $tx = $rightX + 16
    $ty = $vgY
    Draw-FilledRect $g $tx $ty ($rightW - 32) 56 $Gray100
    Draw-StrokeRect $g $tx $ty ($rightW - 32) 56 $Gray500 1
    Draw-Text $g '🔔' ($tx + 16) ($ty + 16) 18 $Gray500
    Draw-Text $g '배차 취소 완료 — DT-20260514-003' ($tx + 52) ($ty + 10) 13 $Gray500 'Segoe UI' 'Bold'
    Draw-Text $g 'SL-030 / SL-031 미배차 list 에 복귀 · 기사 D-003 매칭 해제' ($tx + 52) ($ty + 30) 12 $Neutral700

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 5 (CANCELLED + slip UNDISPATCHED + arologis Dispatch soft-delete)' 16 ($H - 22) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '05-cancellation-accepted.png')
}

# ------------------------------------------------------------
# 06 — mobile-staff 수정 요청 sheet (BottomSheet + 사유 입력)
# ------------------------------------------------------------
function Render-06-MobileModificationFlow {
    $W = 390; $H = 844
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    # status bar
    Draw-FilledRect $g 0 0 $W 44 $Neutral0
    Draw-Text $g '9:41' 18 14 14 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '5G   100%' ($W - 88) 14 12 $Neutral700

    # app bar
    Draw-FilledRect $g 0 44 $W 56 $ArologisTeal500
    Draw-Text $g 'mobile-staff' 18 60 16 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '배차 메뉴' 18 78 12 $Neutral0
    Draw-Text $g '⚙' ($W - 36) 64 18 $Neutral0

    # dim overlay (modal focus)
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 15, 18, 22))
    $g.FillRectangle($overlay, 0, 100, $W, $H - 100)
    $overlay.Dispose()

    # BottomSheet (sub-sheet stack) — bottom 70% of screen
    $sheetY = 280
    $sheetH = $H - $sheetY
    Draw-FilledRect $g 0 $sheetY $W $sheetH $Neutral0

    # rounded corners simulation — top border
    Draw-FilledRect $g 0 $sheetY $W 16 $Neutral0

    # handle bar
    Draw-FilledRect $g ([int]($W / 2 - 24)) ($sheetY + 8) 48 4 $Neutral300

    # sheet header
    $y = $sheetY + 24
    Draw-Text $g '✏  수정 요청' 24 $y 18 $Purple500 'Segoe UI' 'Bold'
    Draw-Text $g '×' ($W - 36) $y 22 $Neutral500
    $y += 32

    Draw-FilledRect $g 24 $y ($W - 48) 1 $Neutral200
    $y += 12

    # context
    Draw-Text $g '대상 배차 작업' 24 $y 11 $Neutral500
    Draw-Text $g 'DT-20260514-004' 24 ($y + 16) 14 $Neutral900 'Segoe UI' 'Bold'
    $y += 42

    Draw-Text $g '기사' 24 $y 11 $Neutral500
    Draw-Text $g 'D-004  최기사' 24 ($y + 16) 13 $Neutral700
    Draw-Text $g '·  010-4567-8901' 124 ($y + 18) 12 $Neutral500 'Consolas'
    $y += 44

    Draw-FilledRect $g 24 $y ($W - 48) 1 $Neutral200
    $y += 12

    # 사유 label
    Draw-Text $g '사유 (선택)' 24 $y 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g '· 최대 500자' 96 ($y + 1) 11 $Neutral500
    $y += 22

    # textarea (mobile)
    Draw-FilledRect $g 24 $y ($W - 48) 110 $Neutral50
    Draw-StrokeRect $g 24 $y ($W - 48) 110 $Purple500 2
    Draw-Text $g '슬립 SL-041 정차 위치 변경' 36 ($y + 12) 13 $Neutral900
    Draw-Text $g '|' 234 ($y + 12) 13 $Purple500 'Segoe UI' 'Bold'
    Draw-Text $g '20 / 500' ($W - 84) ($y + 88) 11 $Neutral500
    $y += 122

    # info banner (compact)
    Draw-FilledRect $g 24 $y ($W - 48) 60 $Purple100
    Draw-StrokeRect $g 24 $y ($W - 48) 60 $Purple500 1
    Draw-Text $g 'ℹ' 36 ($y + 14) 14 $Purple500
    Draw-Text $g '발송 후 5초간 아로로지스 응답 대기' 56 ($y + 8) 11 $Neutral700
    Draw-Text $g '수락 시 편집 모드 활성' 56 ($y + 24) 11 $Neutral700
    Draw-Text $g '거부 시 사유 알림 표시' 56 ($y + 40) 11 $Neutral700
    $y += 76

    # virtual keyboard hint (mobile)
    $kbY = $sheetY + $sheetH - 290
    Draw-FilledRect $g 0 $kbY $W 220 $Neutral100
    Draw-Text $g '─ 키보드 영역 (autoFocus) ─' ([int]($W / 2 - 100)) ($kbY + 8) 11 $Neutral500
    # mock key grid
    $kx = 8; $ky = $kbY + 30
    for($r = 0; $r -lt 4; $r++){
        for($c = 0; $c -lt 10; $c++){
            Draw-FilledRect $g ($kx + $c * 37) ($ky + $r * 44) 32 36 $Neutral0
            Draw-StrokeRect $g ($kx + $c * 37) ($ky + $r * 44) 32 36 $Neutral300 1
        }
    }

    # action buttons
    $btnY = $H - 64
    Draw-FilledRect $g 0 ($btnY - 8) $W 8 $Neutral200
    Draw-FilledRect $g 16 $btnY 100 48 $Neutral100
    Draw-StrokeRect $g 16 $btnY 100 48 $Neutral300 1
    Draw-CenteredText $g '취소' 66 ($btnY + 16) 14 $Neutral700

    # [요청 발송] full-ish width arologis-teal primary
    Draw-FilledRect $g 124 $btnY ($W - 140) 48 $ArologisTeal500
    Draw-CenteredText $g '요청 발송' ([int](124 + ($W - 140) / 2)) ($btnY + 16) 14 $Neutral0 'Segoe UI' 'Bold'

    # mock label (visible 위에 contrast white)
    Draw-Text $g 'QA Mock - 시나리오 6 (mobile BottomSheet)' 8 178 9 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '06-mobile-modification-flow.png')
}

# Render all 6
Render-01-TaskDetailWithActions
Render-02-ModificationRequestDialog
Render-03-ModificationAcceptedEditMode
Render-04-ModificationRejected
Render-05-CancellationAccepted
Render-06-MobileModificationFlow

Write-Host ''
Write-Host 'samhan-dispatch-modification mock screenshots 6장 생성 완료:'
Get-ChildItem $OutDir -Filter '*.png' | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0,-50} {1,6:N1} KB" -f $_.Name, ($_.Length / 1KB))
}
