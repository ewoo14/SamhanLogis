# scripts/generate-samhan-dispatch-board-screenshots.ps1
# Samhan Public 배차 메뉴 (Phase A) QA 6 시나리오 mock PNG 생성기.
# .NET System.Drawing 으로 layout 명세 + 핵심 text 표기 + arologis-teal brand color 를 PNG 로 렌더링.
# Designer 의 docs/uiux/samhan-dispatch-board/01~05.md 화면 토큰 + spec § 5 UI Layout 기반.
#
# 사용법:
#   pwsh ./scripts/generate-samhan-dispatch-board-screenshots.ps1
#
# 출력: docs/qa/samhan-dispatch-board/screenshots/01~06.png (6장)
#
# 가드:
#   - UTF-8 BOM (Windows PowerShell 5.1 한글 parse, [[feedback_powershell_utf8_writes]])
#   - Join-Path 단일 arg (PowerShell 5.1 호환)
#   - arologis-teal `#2A9D8F` brand 일관
#   - 재실행 가능 (한 번 실행으로 6장 재생성)
#   - Pretendard 폰트 fallback → 시스템 default 'Segoe UI'

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

$Green500 = [System.Drawing.ColorTranslator]::FromHtml('#22C55E')
$Green100 = [System.Drawing.ColorTranslator]::FromHtml('#DCFCE7')
$Red500   = [System.Drawing.ColorTranslator]::FromHtml('#EF4444')
$Red100   = [System.Drawing.ColorTranslator]::FromHtml('#FEE2E2')
$Amber500 = [System.Drawing.ColorTranslator]::FromHtml('#F59E0B')
$Blue500  = [System.Drawing.ColorTranslator]::FromHtml('#3B82F6')
$Blue100  = [System.Drawing.ColorTranslator]::FromHtml('#DBEAFE')

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\samhan-dispatch-board\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if(-not (Test-Path $OutDir)){ New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
Write-Host "[generate-samhan-dispatch-board-screenshots] output dir: $OutDir"

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
    Write-Host ("  saved {0,-44} {1,6:N1} KB" -f $fi.Name, ($fi.Length / 1KB))
}

# Shared layout — desktop sidebar + chrome
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

# ------------------------------------------------------------
# 01 — desktop 배차 메뉴 메인 (좌: 미배차 list / 우: 차량 그룹)
# ------------------------------------------------------------
function Render-01-DesktopBoard {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  배차 메뉴 (/dispatch-board)'
    Draw-DesktopSidebar $g $W $H 220

    # main area
    $mx = 220 + 24
    $my = 56
    $mw = $W - $mx - 24
    $mh = $H - $my - 24

    # title bar
    Draw-Text $g '배차 메뉴' $mx $my 22 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '미배차 출고전표를 차량 그룹에 배정합니다.' $mx ($my + 32) 13 $Neutral500

    # left panel — 미배차 출고전표
    $leftX = $mx
    $leftY = $my + 70
    $leftW = [int](($mw - 24) * 0.45)
    $leftH = $mh - 70
    Draw-FilledRect $g $leftX $leftY $leftW $leftH $Neutral0
    Draw-StrokeRect $g $leftX $leftY $leftW $leftH $Neutral200 1

    Draw-Text $g '미배차 출고전표 (150)' ($leftX + 16) ($leftY + 14) 15 $Neutral900 'Segoe UI' 'Bold'

    # filter row
    $filterY = $leftY + 46
    Draw-Text $g '날짜' ($leftX + 16) $filterY 12 $Neutral500
    Draw-FilledRect $g ($leftX + 50) ($filterY - 4) 130 26 $Neutral50
    Draw-StrokeRect $g ($leftX + 50) ($filterY - 4) 130 26 $Neutral200 1
    Draw-Text $g '5/13 ~ 5/15 ▾' ($leftX + 58) ($filterY) 12 $Neutral900
    Draw-Text $g '상태' ($leftX + 196) $filterY 12 $Neutral500
    Draw-FilledRect $g ($leftX + 230) ($filterY - 4) 100 26 $Neutral50
    Draw-StrokeRect $g ($leftX + 230) ($filterY - 4) 100 26 $Neutral200 1
    Draw-Text $g '미배차 ▾' ($leftX + 240) $filterY 12 $Neutral900

    # divider
    Draw-FilledRect $g ($leftX + 16) ($leftY + 86) ($leftW - 32) 1 $Neutral200

    # slip rows
    $slips = @(
        @('SL-001','대구공조','P-1234','9시까지 배송'),
        @('SL-002','한진산업','P-2345','오후 2시'),
        @('SL-003','영진통상','P-3456','당일'),
        @('SL-004','마트로닉','P-4567','오전 11시'),
        @('SL-005','중부냉동','P-5678','상온 보관'),
        @('SL-006','광주물류','P-6789','조심 운반'),
        @('SL-007','부산항만','P-7890','10시 도착'),
        @('SL-008','강원유통','P-8901','3시까지'),
        @('SL-009','제주항공','P-9012','파손 주의'),
        @('SL-010','인천공조','P-0123','오후 발송')
    )
    $rowY = $leftY + 102
    foreach($slip in $slips){
        Draw-Text $g '☰' ($leftX + 16) $rowY 14 $Neutral500
        Draw-Text $g $slip[0] ($leftX + 40) $rowY 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $slip[1] ($leftX + 120) $rowY 13 $Neutral900
        Draw-Text $g $slip[3] ($leftX + 240) $rowY 12 $Neutral500
        Draw-FilledRect $g ($leftX + 16) ($rowY + 20) ($leftW - 32) 1 $Neutral100
        $rowY += 28
    }

    # pagination
    $pageY = $leftY + $leftH - 38
    Draw-FilledRect $g ($leftX + 16) $pageY ($leftW - 32) 1 $Neutral200
    Draw-CenteredText $g '◀  1 / 3  ▶   (50 / page · total 150)' ([int]($leftX + $leftW / 2)) ($pageY + 8) 12 $Neutral700

    # right panel — 차량 그룹
    $rightX = $leftX + $leftW + 24
    $rightY = $leftY
    $rightW = $mw - $leftW - 24
    $rightH = $leftH
    Draw-FilledRect $g $rightX $rightY $rightW $rightH $Neutral0
    Draw-StrokeRect $g $rightX $rightY $rightW $rightH $Neutral200 1

    Draw-Text $g '차량 그룹 (DT-20260514-001)' ($rightX + 16) ($rightY + 14) 15 $Neutral900 'Segoe UI' 'Bold'

    # add vehicle button
    $addBtnX = $rightX + $rightW - 130
    Draw-FilledRect $g $addBtnX ($rightY + 12) 114 28 $ArologisTeal500
    Draw-CenteredText $g '+ 차량 추가' ($addBtnX + 57) ($rightY + 18) 12 $Neutral0 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($rightX + 16) ($rightY + 50) ($rightW - 32) 1 $Neutral200

    # vehicle groups
    $vgY = $rightY + 64
    $vgCardW = $rightW - 32

    # group 1: 1톤 #1 (3 slips)
    $vgH1 = 142
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral50
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral200 1
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW 30 $ArologisTeal500
    Draw-Text $g '1톤  #1' ($rightX + 28) ($vgY + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '3 건' ($rightX + $vgCardW - 50) ($vgY + 8) 12 $Neutral0
    $itemY = $vgY + 40
    foreach($pair in @(@('①','SL-001','대구공조'),@('②','SL-005','중부냉동'),@('③','SL-009','제주항공'))){
        Draw-Text $g $pair[0] ($rightX + 30) $itemY 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $pair[1] ($rightX + 60) $itemY 13 $Neutral900 'Segoe UI' 'Bold'
        Draw-Text $g $pair[2] ($rightX + 140) $itemY 13 $Neutral700
        Draw-Text $g '×' ($rightX + $vgCardW - 28) $itemY 13 $Neutral500
        $itemY += 30
    }
    $vgY += $vgH1 + 12

    # group 2: 다마스 #2 (1 slip)
    $vgH2 = 82
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH2 $Neutral50
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH2 $Neutral200 1
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW 30 $ArologisTeal500
    Draw-Text $g '다마스  #2' ($rightX + 28) ($vgY + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '1 건' ($rightX + $vgCardW - 50) ($vgY + 8) 12 $Neutral0
    Draw-Text $g '①' ($rightX + 30) ($vgY + 50) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g 'SL-007' ($rightX + 60) ($vgY + 50) 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '부산항만' ($rightX + 140) ($vgY + 50) 13 $Neutral700
    Draw-Text $g '×' ($rightX + $vgCardW - 28) ($vgY + 50) 13 $Neutral500
    $vgY += $vgH2 + 12

    # group 3: 5톤 #3 (empty — drag here)
    $vgH3 = 60
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH3 $ArologisTeal50
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH3 $ArologisTeal400 2
    Draw-Text $g '5톤  #3   (비어 있음)' ($rightX + 28) ($vgY + 8) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-CenteredText $g '⬇ 미배차 전표를 여기로 드래그하세요' ([int]($rightX + $vgCardW / 2 + 16)) ($vgY + 36) 12 $ArologisTeal600
    $vgY += $vgH3 + 16

    # 배차 완료 button
    $btnY = $rightY + $rightH - 56
    Draw-FilledRect $g ($rightX + 16) $btnY ($rightW - 32) 40 $ArologisTeal500
    Draw-CenteredText $g '✓ 배차 완료' ([int]($rightX + $rightW / 2)) ($btnY + 10) 15 $Neutral0 'Segoe UI' 'Bold'

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 1 (미배차 50개 페이지네이션 + 좌/우 split)' 16 ($H - 22) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '01-desktop-board.png')
}

# ------------------------------------------------------------
# 02 — mobile-staff tab 전환 + 터치 드래그 indicator
# ------------------------------------------------------------
function Render-02-MobileBoardTab {
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

    # tab bar
    $tabY = 108
    Draw-FilledRect $g 0 $tabY $W 44 $Neutral0
    Draw-StrokeRect $g 0 ($tabY + 43) $W 1 $Neutral200 1
    $tabActive = '미배차 전표'
    $tabInactive = '차량 그룹'
    Draw-CenteredText $g $tabActive ([int]($W / 4)) ($tabY + 14) 14 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-FilledRect $g ([int]($W / 4) - 60) ($tabY + 38) 120 3 $ArologisTeal500
    Draw-CenteredText $g $tabInactive ([int]($W * 3 / 4)) ($tabY + 14) 14 $Neutral500

    # filter pill
    $fyY = 168
    Draw-FilledRect $g 16 $fyY ($W - 32) 36 $Neutral0
    Draw-StrokeRect $g 16 $fyY ($W - 32) 36 $Neutral200 1
    Draw-Text $g '🗓 5/13 ~ 5/15' 28 ($fyY + 10) 13 $Neutral700
    Draw-Text $g '·' 130 ($fyY + 10) 13 $Neutral500
    Draw-Text $g '미배차 50건' 144 ($fyY + 10) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g '▾' ($W - 36) ($fyY + 10) 13 $Neutral500

    # slip rows (mobile)
    $slips = @(
        @('SL-001','대구공조','9시까지 배송'),
        @('SL-002','한진산업','오후 2시'),
        @('SL-003','영진통상','당일','dragging'),
        @('SL-004','마트로닉','오전 11시'),
        @('SL-005','중부냉동','상온 보관'),
        @('SL-006','광주물류','조심 운반'),
        @('SL-007','부산항만','10시 도착'),
        @('SL-008','강원유통','3시까지')
    )
    $rowY = 220
    foreach($slip in $slips){
        $isDragging = ($slip.Length -ge 4 -and $slip[3] -eq 'dragging')
        $cardBg = if($isDragging){ $ArologisTeal50 } else { $Neutral0 }
        $cardBorder = if($isDragging){ $ArologisTeal500 } else { $Neutral200 }
        $cardStroke = if($isDragging){ 2 } else { 1 }
        Draw-FilledRect $g 16 $rowY ($W - 32) 60 $cardBg
        Draw-StrokeRect $g 16 $rowY ($W - 32) 60 $cardBorder $cardStroke
        Draw-Text $g '☰' 30 ($rowY + 22) 14 $Neutral500
        Draw-Text $g $slip[0] 56 ($rowY + 10) 14 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $slip[1] 56 ($rowY + 30) 13 $Neutral900
        Draw-Text $g $slip[2] 180 ($rowY + 30) 12 $Neutral500
        if($isDragging){
            Draw-Text $g 'long-press 250ms +' 200 ($rowY + 10) 11 $ArologisTeal600 'Segoe UI' 'Bold'
            Draw-Text $g '드래그 시작' 200 ($rowY + 24) 11 $ArologisTeal600 'Segoe UI' 'Bold'
        }
        $rowY += 68
    }

    # bottom nav
    $bnY = $H - 80
    Draw-FilledRect $g 0 $bnY $W 80 $Neutral0
    Draw-StrokeRect $g 0 $bnY $W 1 $Neutral200 1
    $navItems = @(@('홈','🏠',$false), @('배차','📋',$true), @('출고','📦',$false), @('내정보','👤',$false))
    $navX = 0
    $navW = [int]($W / 4)
    foreach($n in $navItems){
        $cx = $navX + [int]($navW / 2)
        $color = if($n[2]){ $ArologisTeal700 } else { $Neutral500 }
        $style = if($n[2]){ 'Bold' } else { 'Regular' }
        Draw-CenteredText $g $n[1] $cx ($bnY + 14) 22 $color 'Segoe UI' $style
        Draw-CenteredText $g $n[0] $cx ($bnY + 46) 11 $color 'Segoe UI' $style
        $navX += $navW
    }

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 3 (tab + TouchSensor)' 12 ($H - 100) 9 $Neutral500

    Save-Bitmap $pack (Join-Path $OutDir '02-mobile-board-tab.png')
}

# ------------------------------------------------------------
# 03 — 차량 추가 modal (9 종류 3x3 carousel + [추가])
# ------------------------------------------------------------
function Render-03-AddVehicleModal {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  차량 추가 modal'
    Draw-DesktopSidebar $g $W $H 220

    # dim overlay simulation
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 15, 18, 22))
    $g.FillRectangle($overlay, 220, 36, $W - 220, $H - 36)
    $overlay.Dispose()

    # modal centered
    $modW = 720; $modH = 660
    $modX = [int]((($W - 220) / 2) + 220 - ($modW / 2))
    $modY = [int]((($H - 36) / 2) + 36 - ($modH / 2))
    Draw-FilledRect $g $modX $modY $modW $modH $Neutral0
    Draw-StrokeRect $g $modX $modY $modW $modH $Neutral200 1

    # header
    Draw-FilledRect $g $modX $modY $modW 56 $Neutral50
    Draw-Text $g '차량 추가' ($modX + 24) ($modY + 18) 18 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '×' ($modX + $modW - 36) ($modY + 14) 24 $Neutral500
    Draw-FilledRect $g $modX ($modY + 56) $modW 1 $Neutral200

    Draw-Text $g '운영 가능한 9 종류 (legacy 2 제외)' ($modX + 24) ($modY + 76) 13 $Neutral500

    # 3x3 carousel (9 types, TONNAGE_1 selected)
    $types = @(
        @('🏍','오토바이','MOTORCYCLE',$false),
        @('🚐','다마스','DAMAS',$false),
        @('🚚','1톤','TONNAGE_1',$true),
        @('🚚','1.5톤','TONNAGE_1_5',$false),
        @('🚛','2.5톤','TONNAGE_2_5',$false),
        @('🚛','3톤','TONNAGE_3',$false),
        @('🚛','5톤','TONNAGE_5',$false),
        @('🚚','10톤','TONNAGE_10',$false),
        @('🚛','20톤','TONNAGE_20',$false)
    )
    $cardW = 200; $cardH = 130; $gap = 20
    $gridX = $modX + 30
    $gridY = $modY + 120
    for($i = 0; $i -lt 9; $i++){
        $col = $i % 3
        $row = [int]([math]::Floor($i / 3))
        $cx = $gridX + $col * ($cardW + $gap)
        $cy = $gridY + $row * ($cardH + $gap)
        $selected = $types[$i][3]
        $bg = if($selected){ $ArologisTeal50 } else { $Neutral0 }
        $bd = if($selected){ $ArologisTeal500 } else { $Neutral200 }
        $bw = if($selected){ 2 } else { 1 }
        Draw-FilledRect $g $cx $cy $cardW $cardH $bg
        Draw-StrokeRect $g $cx $cy $cardW $cardH $bd $bw
        Draw-CenteredText $g $types[$i][0] ($cx + [int]($cardW / 2)) ($cy + 16) 36 $Neutral900
        $textColor = if($selected){ $ArologisTeal700 } else { $Neutral900 }
        $textStyle = if($selected){ 'Bold' } else { 'Regular' }
        Draw-CenteredText $g $types[$i][1] ($cx + [int]($cardW / 2)) ($cy + 70) 16 $textColor 'Segoe UI' $textStyle
        Draw-CenteredText $g $types[$i][2] ($cx + [int]($cardW / 2)) ($cy + 96) 11 $Neutral500
        if($selected){
            $chkX = $cx + $cardW - 26
            $chkY = $cy + 8
            $brush = New-Object System.Drawing.SolidBrush $ArologisTeal500
            $g.FillEllipse($brush, $chkX, $chkY, 18, 18)
            $brush.Dispose()
            Draw-Text $g '✓' ($chkX + 4) ($chkY + 1) 12 $Neutral0 'Segoe UI' 'Bold'
        }
    }

    # buttons
    $btnY = $modY + $modH - 60
    Draw-FilledRect $g $modX ($modY + $modH - 70) $modW 1 $Neutral200
    Draw-FilledRect $g ($modX + $modW - 240) $btnY 100 36 $Neutral100
    Draw-StrokeRect $g ($modX + $modW - 240) $btnY 100 36 $Neutral300 1
    Draw-CenteredText $g '취소' ($modX + $modW - 190) ($btnY + 10) 14 $Neutral700
    Draw-FilledRect $g ($modX + $modW - 130) $btnY 110 36 $ArologisTeal500
    Draw-CenteredText $g '추가' ($modX + $modW - 75) ($btnY + 10) 14 $Neutral0 'Segoe UI' 'Bold'

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 2 (차량 추가 modal - 1톤 선택)' 16 ($H - 22) 11 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '03-add-vehicle-modal.png')
}

# ------------------------------------------------------------
# 04 — 출고전표 상세 modal (SL-001 대구공조 + 인수자 + 정차 순서)
# ------------------------------------------------------------
function Render-04-SlipDetailModal {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  출고전표 상세 modal'
    Draw-DesktopSidebar $g $W $H 220

    # dim overlay
    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(100, 15, 18, 22))
    $g.FillRectangle($overlay, 220, 36, $W - 220, $H - 36)
    $overlay.Dispose()

    # side modal (right-aligned)
    $modW = 560; $modH = $H - 36
    $modX = $W - $modW
    $modY = 36
    Draw-FilledRect $g $modX $modY $modW $modH $Neutral0
    Draw-StrokeRect $g $modX $modY $modW $modH $Neutral200 1

    # header
    Draw-FilledRect $g $modX $modY $modW 64 $ArologisTeal500
    Draw-Text $g 'SL-001 출고전표 상세' ($modX + 24) ($modY + 22) 18 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g '×' ($modX + $modW - 36) ($modY + 18) 24 $Neutral0

    # section: 거래처
    $y = $modY + 88
    Draw-Text $g '거래처' ($modX + 24) $y 12 $Neutral500
    Draw-Text $g '대구공조' ($modX + 24) ($y + 18) 18 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '(P-1234)' ($modX + 130) ($y + 24) 13 $Neutral500
    $y += 60

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # section: 인수자
    Draw-Text $g '인수자' ($modX + 24) $y 12 $Neutral500
    Draw-Text $g '김인수' ($modX + 24) ($y + 18) 16 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '☎' ($modX + 24) ($y + 50) 13 $Neutral500
    Draw-Text $g '010-1234-5678' ($modX + 44) ($y + 50) 13 $Neutral900 'Consolas'
    Draw-Text $g '(dev dummy)' ($modX + 160) ($y + 52) 11 $Neutral500
    $y += 88

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # section: 배송 주소
    Draw-Text $g '배송 주소' ($modX + 24) $y 12 $Neutral500
    Draw-Text $g '인천 남동구 남동대로215번길 30' ($modX + 24) ($y + 18) 14 $Neutral900
    Draw-Text $g '(우) 21657 · 1층 검수실 옆 출입구' ($modX + 24) ($y + 38) 12 $Neutral500
    $y += 76

    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16

    # section: 요청사항
    Draw-Text $g '요청사항' ($modX + 24) $y 12 $Neutral500
    Draw-FilledRect $g ($modX + 24) ($y + 20) ($modW - 48) 50 $Neutral50
    Draw-StrokeRect $g ($modX + 24) ($y + 20) ($modW - 48) 50 $Neutral200 1
    Draw-Text $g '9시까지 배송 (당일 출하 조건)' ($modX + 34) ($y + 36) 13 $Neutral900
    $y += 92

    # section: 정차 순서 (배차 그룹 매핑)
    Draw-FilledRect $g ($modX + 24) $y ($modW - 48) 1 $Neutral200
    $y += 16
    Draw-Text $g '배차 정보' ($modX + 24) $y 12 $Neutral500
    Draw-FilledRect $g ($modX + 24) ($y + 20) ($modW - 48) 68 $ArologisTeal50
    Draw-StrokeRect $g ($modX + 24) ($y + 20) ($modW - 48) 68 $ArologisTeal400 1
    Draw-Text $g '🚚 1톤  #1  그룹의' ($modX + 38) ($y + 32) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g '① 첫 번째 정차' ($modX + 38) ($y + 56) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g 'DT-20260514-001' ($modX + 320) ($y + 32) 12 $Neutral700
    Draw-Text $g 'status: DRAFT' ($modX + 320) ($y + 56) 12 $Neutral700
    $y += 108

    # footer buttons
    $btnY = $modY + $modH - 64
    Draw-FilledRect $g $modX ($btnY - 8) $modW 1 $Neutral200
    Draw-FilledRect $g ($modX + 24) $btnY 100 40 $Neutral100
    Draw-StrokeRect $g ($modX + 24) $btnY 100 40 $Neutral300 1
    Draw-CenteredText $g '닫기' ($modX + 74) ($btnY + 12) 14 $Neutral700
    Draw-FilledRect $g ($modX + $modW - 180) $btnY 156 40 $ArologisTeal500
    Draw-CenteredText $g '그룹에서 제거' ($modX + $modW - 102) ($btnY + 12) 14 $Neutral0 'Segoe UI' 'Bold'

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 4 (UUID 비공개 + 정차 순서 표시)' 16 ($H - 22) 11 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '04-slip-detail-modal.png')
}

# ------------------------------------------------------------
# 05 — 배차 완료 후 (DISPATCHED 배지 + 기사 정보 D-001 홍길동)
# ------------------------------------------------------------
function Render-05-DispatchCompleted {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  배차 완료 (DISPATCHED)'
    Draw-DesktopSidebar $g $W $H 220

    # main area
    $mx = 220 + 24
    $my = 56
    $mw = $W - $mx - 24
    $mh = $H - $my - 24

    Draw-Text $g '배차 메뉴' $mx $my 22 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '배차 완료 — 매칭 결과 자동 갱신됨' $mx ($my + 32) 13 $Green500 'Segoe UI' 'Bold'

    # left — 미배차 (SL-001 사라짐)
    $leftX = $mx
    $leftY = $my + 70
    $leftW = [int](($mw - 24) * 0.45)
    $leftH = $mh - 70
    Draw-FilledRect $g $leftX $leftY $leftW $leftH $Neutral0
    Draw-StrokeRect $g $leftX $leftY $leftW $leftH $Neutral200 1
    Draw-Text $g '미배차 출고전표 (149)' ($leftX + 16) ($leftY + 14) 15 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '⤴ SL-001 → 배차 완료 (DISPATCHED) 로 이동' ($leftX + 16) ($leftY + 38) 11 $Green500

    Draw-FilledRect $g ($leftX + 16) ($leftY + 60) ($leftW - 32) 1 $Neutral200

    $slips2 = @(
        @('SL-002','한진산업'),
        @('SL-003','영진통상'),
        @('SL-004','마트로닉'),
        @('SL-005','중부냉동'),
        @('SL-006','광주물류'),
        @('SL-008','강원유통'),
        @('SL-010','인천공조'),
        @('SL-011','서울특수'),
        @('SL-012','경기상사')
    )
    $rowY = $leftY + 78
    foreach($slip in $slips2){
        Draw-Text $g '☰' ($leftX + 16) $rowY 14 $Neutral500
        Draw-Text $g $slip[0] ($leftX + 40) $rowY 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $slip[1] ($leftX + 120) $rowY 13 $Neutral900
        Draw-FilledRect $g ($leftX + 16) ($rowY + 20) ($leftW - 32) 1 $Neutral100
        $rowY += 28
    }

    # right — 차량 그룹 + DISPATCHED 배지
    $rightX = $leftX + $leftW + 24
    $rightY = $leftY
    $rightW = $mw - $leftW - 24
    $rightH = $leftH
    Draw-FilledRect $g $rightX $rightY $rightW $rightH $Neutral0
    Draw-StrokeRect $g $rightX $rightY $rightW $rightH $Neutral200 1

    Draw-Text $g '차량 그룹 (DT-20260514-001)' ($rightX + 16) ($rightY + 14) 15 $Neutral900 'Segoe UI' 'Bold'

    # status pill — DISPATCHED
    $pillX = $rightX + $rightW - 168
    Draw-FilledRect $g $pillX ($rightY + 14) 152 26 $Green100
    Draw-StrokeRect $g $pillX ($rightY + 14) 152 26 $Green500 1
    Draw-CenteredText $g '✓ 배차 완료' ($pillX + 76) ($rightY + 20) 12 $Green500 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($rightX + 16) ($rightY + 50) ($rightW - 32) 1 $Neutral200

    # group 1: 1톤 #1 — DISPATCHED + driver info
    $vgY = $rightY + 64
    $vgCardW = $rightW - 32
    $vgH1 = 220
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral0
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Green500 2
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW 30 $Green500
    Draw-Text $g '1톤  #1' ($rightX + 28) ($vgY + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g 'DISPATCHED' ($rightX + $vgCardW - 110) ($vgY + 8) 12 $Neutral0 'Segoe UI' 'Bold'

    # driver info row
    $diY = $vgY + 40
    Draw-FilledRect $g ($rightX + 28) $diY ($vgCardW - 24) 60 $Green100
    Draw-StrokeRect $g ($rightX + 28) $diY ($vgCardW - 24) 60 $Green500 1
    Draw-Text $g '👤' ($rightX + 42) ($diY + 18) 18 $Green500
    Draw-Text $g '기사' ($rightX + 78) ($diY + 8) 11 $Neutral500
    Draw-Text $g 'D-001 홍길동' ($rightX + 78) ($diY + 24) 14 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '☎ 010-1234-5678' ($rightX + 230) ($diY + 24) 13 $Neutral700 'Consolas'
    Draw-Text $g '·' ($rightX + 360) ($diY + 24) 13 $Neutral500
    Draw-Text $g 'MOCK source' ($rightX + 374) ($diY + 24) 11 $Amber500 'Segoe UI' 'Bold'

    # slip rows (SL-001 DISPATCHED)
    $itemY = $vgY + 116
    Draw-Text $g '①' ($rightX + 30) $itemY 13 $Green500 'Segoe UI' 'Bold'
    Draw-Text $g 'SL-001' ($rightX + 60) $itemY 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '대구공조' ($rightX + 140) $itemY 13 $Neutral700
    Draw-Text $g '✓ 배차 완료' ($rightX + 230) $itemY 12 $Green500 'Segoe UI' 'Bold'
    $itemY += 28
    Draw-Text $g '②' ($rightX + 30) $itemY 13 $Green500 'Segoe UI' 'Bold'
    Draw-Text $g 'SL-005' ($rightX + 60) $itemY 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '중부냉동' ($rightX + 140) $itemY 13 $Neutral700
    Draw-Text $g '✓ 배차 완료' ($rightX + 230) $itemY 12 $Green500 'Segoe UI' 'Bold'
    $itemY += 28
    Draw-Text $g '③' ($rightX + 30) $itemY 13 $Green500 'Segoe UI' 'Bold'
    Draw-Text $g 'SL-009' ($rightX + 60) $itemY 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '제주항공' ($rightX + 140) $itemY 13 $Neutral700
    Draw-Text $g '✓ 배차 완료' ($rightX + 230) $itemY 12 $Green500 'Segoe UI' 'Bold'

    $vgY += $vgH1 + 12

    # toast notification (top right)
    $tx = $rightX + 16
    $ty = $vgY
    Draw-FilledRect $g $tx $ty ($rightW - 32) 56 $Green100
    Draw-StrokeRect $g $tx $ty ($rightW - 32) 56 $Green500 1
    Draw-Text $g '🔔' ($tx + 16) ($ty + 16) 18 $Green500
    Draw-Text $g '배차 완료 (1톤 #1)' ($tx + 52) ($ty + 10) 13 $Green500 'Segoe UI' 'Bold'
    Draw-Text $g '기사 D-001 홍길동 · 010-1234-5678 매칭됨' ($tx + 52) ($ty + 30) 12 $Neutral700

    # mock label
    Draw-Text $g 'QA Mock - 시나리오 5 (DISPATCHED + 기사 정보)' 16 ($H - 22) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '05-dispatch-completed.png')
}

# ------------------------------------------------------------
# 06 — 배차 불가 (FAILED 배지 + 사유 + [재배차])
# ------------------------------------------------------------
function Render-06-DispatchFailed {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    Draw-DesktopChrome $g $W $H 'desktop  -  배차 불가 (FAILED, MOCK_FAIL_RATE=1.0)'
    Draw-DesktopSidebar $g $W $H 220

    $mx = 220 + 24
    $my = 56
    $mw = $W - $mx - 24
    $mh = $H - $my - 24

    Draw-Text $g '배차 메뉴' $mx $my 22 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '배차 불가 — Mock matcher 시뮬레이션 결과' $mx ($my + 32) 13 $Red500 'Segoe UI' 'Bold'

    # left — 미배차 (SL-002 복귀)
    $leftX = $mx
    $leftY = $my + 70
    $leftW = [int](($mw - 24) * 0.45)
    $leftH = $mh - 70
    Draw-FilledRect $g $leftX $leftY $leftW $leftH $Neutral0
    Draw-StrokeRect $g $leftX $leftY $leftW $leftH $Neutral200 1
    Draw-Text $g '미배차 출고전표 (150)' ($leftX + 16) ($leftY + 14) 15 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '⤴ SL-002 → UNDISPATCHED 복귀' ($leftX + 16) ($leftY + 38) 11 $Red500 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($leftX + 16) ($leftY + 60) ($leftW - 32) 1 $Neutral200

    # highlight SL-002 (재배차 가능 후보)
    Draw-FilledRect $g ($leftX + 16) ($leftY + 76) ($leftW - 32) 28 $Red100
    Draw-Text $g '☰' ($leftX + 22) ($leftY + 80) 14 $Red500
    Draw-Text $g 'SL-002' ($leftX + 46) ($leftY + 80) 13 $Red500 'Segoe UI' 'Bold'
    Draw-Text $g '한진산업' ($leftX + 126) ($leftY + 80) 13 $Neutral900
    Draw-Text $g '↺ 재배차 대상' ($leftX + 230) ($leftY + 80) 11 $Red500 'Segoe UI' 'Bold'

    $rowY = $leftY + 116
    foreach($slip in @(@('SL-003','영진통상'),@('SL-004','마트로닉'),@('SL-005','중부냉동'),@('SL-006','광주물류'),@('SL-007','부산항만'),@('SL-008','강원유통'),@('SL-009','제주항공'),@('SL-010','인천공조'))){
        Draw-Text $g '☰' ($leftX + 16) $rowY 14 $Neutral500
        Draw-Text $g $slip[0] ($leftX + 40) $rowY 13 $ArologisTeal700 'Segoe UI' 'Bold'
        Draw-Text $g $slip[1] ($leftX + 120) $rowY 13 $Neutral900
        Draw-FilledRect $g ($leftX + 16) ($rowY + 20) ($leftW - 32) 1 $Neutral100
        $rowY += 28
    }

    # right — 차량 그룹 + FAILED 배지
    $rightX = $leftX + $leftW + 24
    $rightY = $leftY
    $rightW = $mw - $leftW - 24
    $rightH = $leftH
    Draw-FilledRect $g $rightX $rightY $rightW $rightH $Neutral0
    Draw-StrokeRect $g $rightX $rightY $rightW $rightH $Neutral200 1

    Draw-Text $g '차량 그룹 (DT-20260514-002)' ($rightX + 16) ($rightY + 14) 15 $Neutral900 'Segoe UI' 'Bold'

    # status pill — FAILED
    $pillX = $rightX + $rightW - 168
    Draw-FilledRect $g $pillX ($rightY + 14) 152 26 $Red100
    Draw-StrokeRect $g $pillX ($rightY + 14) 152 26 $Red500 1
    Draw-CenteredText $g '✕ 배차 불가' ($pillX + 76) ($rightY + 20) 12 $Red500 'Segoe UI' 'Bold'

    Draw-FilledRect $g ($rightX + 16) ($rightY + 50) ($rightW - 32) 1 $Neutral200

    # group 1: 1톤 #1 — FAILED
    $vgY = $rightY + 64
    $vgCardW = $rightW - 32
    $vgH1 = 280
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Neutral0
    Draw-StrokeRect $g ($rightX + 16) $vgY $vgCardW $vgH1 $Red500 2
    Draw-FilledRect $g ($rightX + 16) $vgY $vgCardW 30 $Red500
    Draw-Text $g '1톤  #1' ($rightX + 28) ($vgY + 8) 13 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g 'FAILED' ($rightX + $vgCardW - 80) ($vgY + 8) 12 $Neutral0 'Segoe UI' 'Bold'

    # failure reason card
    $frY = $vgY + 40
    Draw-FilledRect $g ($rightX + 28) $frY ($vgCardW - 24) 88 $Red100
    Draw-StrokeRect $g ($rightX + 28) $frY ($vgCardW - 24) 88 $Red500 1
    Draw-Text $g '⚠' ($rightX + 42) ($frY + 14) 22 $Red500
    Draw-Text $g '배차 불가 사유' ($rightX + 80) ($frY + 8) 11 $Red500 'Segoe UI' 'Bold'
    Draw-Text $g '1톤 차량 가용 기사 0명' ($rightX + 80) ($frY + 28) 14 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '(인성데이타 응답 — Mock 시뮬레이션)' ($rightX + 80) ($frY + 52) 12 $Neutral500
    Draw-Text $g 'failedVehicleGroups: [1]' ($rightX + 80) ($frY + 70) 11 $Neutral500

    # slip rows (UNDISPATCHED 복귀)
    $itemY = $vgY + 142
    Draw-Text $g '①' ($rightX + 30) $itemY 13 $Red500 'Segoe UI' 'Bold'
    Draw-Text $g 'SL-002' ($rightX + 60) $itemY 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '한진산업' ($rightX + 140) $itemY 13 $Neutral700
    Draw-Text $g '↺ UNDISPATCHED 복귀' ($rightX + 230) $itemY 12 $Red500 'Segoe UI' 'Bold'

    # 재배차 button
    $btnY = $vgY + $vgH1 - 56
    Draw-FilledRect $g ($rightX + 28) $btnY 160 36 $ArologisTeal500
    Draw-CenteredText $g '↺ 재배차' ($rightX + 108) ($btnY + 10) 14 $Neutral0 'Segoe UI' 'Bold'
    Draw-FilledRect $g ($rightX + 196) $btnY 140 36 $Neutral100
    Draw-StrokeRect $g ($rightX + 196) $btnY 140 36 $Neutral300 1
    Draw-CenteredText $g '그룹 해체' ($rightX + 266) ($btnY + 10) 14 $Neutral700

    $vgY += $vgH1 + 12

    # toast notification
    $tx = $rightX + 16
    $ty = $vgY
    Draw-FilledRect $g $tx $ty ($rightW - 32) 56 $Red100
    Draw-StrokeRect $g $tx $ty ($rightW - 32) 56 $Red500 1
    Draw-Text $g '🔔' ($tx + 16) ($ty + 16) 18 $Red500
    Draw-Text $g '배차 불가 — 1톤 #1' ($tx + 52) ($ty + 10) 13 $Red500 'Segoe UI' 'Bold'
    Draw-Text $g '사유: 1톤 차량 가용 기사 0명 · [재배차] 가능' ($tx + 52) ($ty + 30) 12 $Neutral700

    # env hint
    Draw-Text $g 'SAMHAN_AROLOGIS_MOCK_FAIL_RATE=1.0 (시뮬레이션 100% FAILED)' 16 ($H - 22) 11 $Amber500 'Segoe UI' 'Bold'

    Save-Bitmap $pack (Join-Path $OutDir '06-dispatch-failed.png')
}

# Render all 6
Render-01-DesktopBoard
Render-02-MobileBoardTab
Render-03-AddVehicleModal
Render-04-SlipDetailModal
Render-05-DispatchCompleted
Render-06-DispatchFailed

Write-Host ''
Write-Host 'samhan-dispatch-board mock screenshots 6장 생성 완료:'
Get-ChildItem $OutDir -Filter '*.png' | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0,-44} {1,6:N1} KB" -f $_.Name, ($_.Length / 1KB))
}
