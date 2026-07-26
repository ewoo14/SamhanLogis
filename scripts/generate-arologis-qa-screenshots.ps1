# scripts/generate-arologis-qa-screenshots.ps1
# 아로로지스 독립 분리 PR #184 QA 6 시나리오 mock PNG 생성기.
# .NET System.Drawing 으로 layout 명세 + 핵심 text 표기 + arologis-teal brand color 를 PNG 로 렌더링.
# Designer 의 docs/uiux/arologis-extract/01~05.md 화면 토큰 기반.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

# arologis brand teal palette (Designer §3.1)
$ArologisTeal500 = [System.Drawing.ColorTranslator]::FromHtml('#2A9D8F')
$ArologisTeal600 = [System.Drawing.ColorTranslator]::FromHtml('#218074')
$ArologisTeal700 = [System.Drawing.ColorTranslator]::FromHtml('#1B665C')
$ArologisTeal400 = [System.Drawing.ColorTranslator]::FromHtml('#3FB59C')
$ArologisTeal300 = [System.Drawing.ColorTranslator]::FromHtml('#6BC9B5')
$ArologisTeal100 = [System.Drawing.ColorTranslator]::FromHtml('#D2F0EA')
$ArologisTeal200 = [System.Drawing.ColorTranslator]::FromHtml('#A4DFD3')
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
$Red500   = [System.Drawing.ColorTranslator]::FromHtml('#EF4444')
$Amber500 = [System.Drawing.ColorTranslator]::FromHtml('#F59E0B')

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\arologis-extract\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if(-not (Test-Path $OutDir)){ New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
Write-Host "[generate-arologis-qa-screenshots] output dir: $OutDir"

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
    Write-Host ("  saved {0,-40} {1,6:N1} KB" -f $fi.Name, ($fi.Length / 1KB))
}

# ------------------------------------------------------------
# 1. 01-admin-login.png  (1280 x 800)
# ------------------------------------------------------------
function Render-01-AdminLogin {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $ArologisTeal100
    $g = $pack.Graphics

    # gradient-ish background — paint two-tone bands
    Draw-FilledRect $g 0 0 $W ([int]($H / 2)) $ArologisTeal100
    Draw-FilledRect $g 0 ([int]($H / 2)) $W ([int]($H / 2)) $ArologisTeal200

    # title bar (window chrome simulation)
    Draw-FilledRect $g 0 0 $W 36 $Neutral700
    Draw-Text -Graphics $g -Text 'arologis-desktop  -  https://app.arologis.samhan-air.com' -X 16 -Y 9 -Size 14 -Color $Neutral0 -Style 'Regular'
    # window control dots
    $dotY = 12
    foreach($i in 0..2){
        $c = @($Red500, $Amber500, $Green500)[$i]
        $brush = New-Object System.Drawing.SolidBrush $c
        $g.FillEllipse($brush, ($W - 80 + $i * 22), $dotY, 12, 12)
        $brush.Dispose()
    }

    # central card
    $cardW = 420; $cardH = 440
    $cardX = [int](($W - $cardW) / 2)
    $cardY = [int](($H - $cardH) / 2) + 10
    Draw-FilledRect $g $cardX $cardY $cardW $cardH $Neutral0
    Draw-StrokeRect $g $cardX $cardY $cardW $cardH $Neutral200 1

    # logo + title
    Draw-CenteredText $g '아로로지스' ([int]($W / 2)) ($cardY + 32) 32 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-CenteredText $g 'Arologis Admin' ([int]($W / 2)) ($cardY + 72) 14 $Neutral500
    # divider
    Draw-FilledRect $g ($cardX + 32) ($cardY + 110) ($cardW - 64) 1 $Neutral200

    # loginId field
    $labelX = $cardX + 32
    $inputX = $cardX + 32
    $inputW = $cardW - 64
    Draw-Text $g '아이디' $labelX ($cardY + 130) 14 $Neutral700 'Segoe UI' 'Bold'
    Draw-FilledRect $g $inputX ($cardY + 154) $inputW 40 $Neutral50
    Draw-StrokeRect $g $inputX ($cardY + 154) $inputW 40 $Neutral300 1
    Draw-Text $g 'admin' ($inputX + 12) ($cardY + 165) 16 $Neutral900 'Consolas'

    # password field
    Draw-Text $g '비밀번호' $labelX ($cardY + 210) 14 $Neutral700 'Segoe UI' 'Bold'
    Draw-FilledRect $g $inputX ($cardY + 234) $inputW 40 $Neutral50
    Draw-StrokeRect $g $inputX ($cardY + 234) $inputW 40 $Neutral300 1
    Draw-Text $g '••••••••' ($inputX + 12) ($cardY + 240) 22 $Neutral900 'Consolas'
    Draw-Text $g '영문/숫자/특수 8자 이상' $labelX ($cardY + 282) 12 $Neutral500

    # login button (arologis-500)
    $btnY = $cardY + 320
    Draw-FilledRect $g $inputX $btnY $inputW 44 $ArologisTeal500
    Draw-CenteredText $g '아로로지스 로그인' ([int]($W / 2)) ($btnY + 12) 16 $Neutral0 'Segoe UI' 'Bold'

    # forgot password
    Draw-CenteredText $g '비밀번호를 잊으셨나요?' ([int]($W / 2)) ($cardY + 390) 13 $ArologisTeal600

    # footer
    Draw-CenteredText $g '© 2026 Arologis · Samhan Public 운영' ([int]($W / 2)) ($H - 40) 12 $Neutral700
    # mock label
    Draw-Text $g 'QA Mock - 시나리오 1 (loginId/password)' 16 ($H - 24) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '01-admin-login.png')
}

# ------------------------------------------------------------
# 2. 02-driver-crud.png  (1280 x 800)
# ------------------------------------------------------------
function Render-02-DriverCrud {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    # window chrome
    Draw-FilledRect $g 0 0 $W 36 $Neutral700
    Draw-Text $g 'arologis-desktop  -  기사 관리 (DriverManagementPage)' 16 9 14 $Neutral0

    # sidebar
    $sbW = 240
    Draw-FilledRect $g 0 36 $sbW ($H - 36) $Neutral50
    Draw-StrokeRect $g 0 36 $sbW ($H - 36) $Neutral200 1
    Draw-Text $g '아로로지스' 24 60 18 $ArologisTeal700 'Segoe UI' 'Bold'
    $menuItems = @('배차 관리','자동 매칭','기사 관리','지역 관리','감사 로그')
    $menuY = 110
    foreach($m in $menuItems){
        $highlight = ($m -eq '기사 관리')
        if($highlight){
            Draw-FilledRect $g 12 ($menuY - 6) ($sbW - 24) 32 $ArologisTeal50
            Draw-Text $g "▶ $m" 24 $menuY 14 $ArologisTeal700 'Segoe UI' 'Bold'
        } else {
            Draw-Text $g "▸ $m" 24 $menuY 14 $Neutral700
        }
        $menuY += 38
    }
    Draw-Text $g '김관리 (MASTER)' 24 ($H - 80) 13 $Neutral500
    Draw-Text $g '⏻ 로그아웃' 24 ($H - 56) 13 $Neutral700

    # main area
    $mx = $sbW + 32
    Draw-Text $g '◆ 기사 관리' $mx 60 22 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '사전 등록된 휴대번호만 어플 로그인 가능합니다.' $mx 92 13 $Neutral500

    # create form card
    $cardW = $W - $mx - 32
    Draw-FilledRect $g $mx 120 $cardW 130 $Neutral0
    Draw-StrokeRect $g $mx 120 $cardW 130 $Neutral200 1
    Draw-Text $g '신규 등록' ($mx + 16) 134 14 $ArologisTeal700 'Segoe UI' 'Bold'

    $col1 = $mx + 16
    $col2 = $mx + 270
    $col3 = $mx + 520
    Draw-Text $g 'driverCode' $col1 168 11 $Neutral500
    Draw-FilledRect $g $col1 184 230 32 $Neutral50
    Draw-StrokeRect $g $col1 184 230 32 $Neutral300 1
    Draw-Text $g 'DRV-001' ($col1 + 10) 192 14 $Neutral900 'Consolas'

    Draw-Text $g 'phoneNumber' $col2 168 11 $Neutral500
    Draw-FilledRect $g $col2 184 230 32 $Neutral50
    Draw-StrokeRect $g $col2 184 230 32 $Neutral300 1
    Draw-Text $g '010-1234-5678' ($col2 + 10) 192 14 $Neutral900 'Consolas'

    Draw-Text $g 'vehicleType' $col3 168 11 $Neutral500
    Draw-FilledRect $g $col3 184 200 32 $Neutral50
    Draw-StrokeRect $g $col3 184 200 32 $Neutral300 1
    Draw-Text $g '1톤 카고  ▼' ($col3 + 10) 192 14 $Neutral900

    # submit button
    $btnX = $mx + $cardW - 200
    Draw-FilledRect $g $btnX 180 180 36 $ArologisTeal500
    Draw-CenteredText $g '등록 + SMS 발송' ($btnX + 90) 187 14 $Neutral0 'Segoe UI' 'Bold'

    # table
    $ty = 280
    Draw-Text $g '등록된 기사 (총 5명, 활성 4 / 정지 1)' $mx $ty 14 $Neutral900 'Segoe UI' 'Bold'
    $ty += 28
    # header
    $hdrCols = @(
        @{ x = $mx;       w = 110; label = 'driverCode' },
        @{ x = $mx + 110; w = 110; label = '기사명' },
        @{ x = $mx + 220; w = 180; label = 'phoneNumber' },
        @{ x = $mx + 400; w = 110; label = 'vehicleType' },
        @{ x = $mx + 510; w = 90;  label = '상태' },
        @{ x = $mx + 600; w = 200; label = '마지막 로그인' },
        @{ x = $mx + 800; w = 120; label = '액션' }
    )
    Draw-FilledRect $g $mx $ty $cardW 36 $Neutral100
    foreach($c in $hdrCols){
        Draw-Text $g $c.label ($c.x + 10) ($ty + 10) 12 $Neutral700 'Segoe UI' 'Bold'
    }
    $ty += 36

    # rows
    $rows = @(
        @('DRV-001','김운송','010-1234-5678','1톤',  '활성','2026-05-14 08:30','수정 | 정지'),
        @('DRV-002','박배송','010-2345-6789','1톤',  '활성','2026-05-14 07:55','수정 | 정지'),
        @('DRV-003','이수송','010-3456-7890','2.5톤','활성','2026-05-13 22:10','수정 | 정지'),
        @('DRV-004','최운반','010-4567-8901','1톤',  '정지','2026-05-10 19:00','복구'),
        @('DRV-005','한택배','010-5678-9012','1.4톤','활성','2026-05-14 06:15','수정 | 정지')
    )
    foreach($r in $rows){
        if($r[4] -eq '정지'){
            Draw-FilledRect $g $mx $ty $cardW 36 $Neutral50
        }
        Draw-StrokeRect $g $mx $ty $cardW 36 $Neutral100 1
        for($i = 0; $i -lt $hdrCols.Count; $i++){
            $col = $hdrCols[$i]
            $val = $r[$i]
            $txtColor = $Neutral900
            $family = 'Segoe UI'
            $style = 'Regular'
            if($col.label -eq 'driverCode' -or $col.label -eq 'phoneNumber'){ $family = 'Consolas' }
            if($col.label -eq '상태'){
                if($val -eq '활성'){
                    $dotBrush = New-Object System.Drawing.SolidBrush $Green500
                    $g.FillEllipse($dotBrush, ($col.x + 10), ($ty + 14), 10, 10)
                    $dotBrush.Dispose()
                    Draw-Text $g '활성' ($col.x + 26) ($ty + 10) 13 $Neutral700
                } else {
                    $dotBrush = New-Object System.Drawing.SolidBrush $Neutral500
                    $g.FillEllipse($dotBrush, ($col.x + 10), ($ty + 14), 10, 10)
                    $dotBrush.Dispose()
                    Draw-Text $g '정지' ($col.x + 26) ($ty + 10) 13 $Neutral500
                }
            } elseif($col.label -eq '액션'){
                Draw-Text $g $val ($col.x + 10) ($ty + 10) 12 $ArologisTeal600
            } else {
                Draw-Text $g $val ($col.x + 10) ($ty + 10) 13 $txtColor $family $style
            }
        }
        $ty += 36
    }
    # caption
    Draw-Text $g 'Soft Delete (deleted_at audit) - UUID 비공개, driverCode 만 사용자 노출' $mx ($H - 60) 12 $Neutral500 'Segoe UI' 'Italic'
    Draw-Text $g 'QA Mock - 시나리오 2 (driverCode / phoneNumber / vehicleType 사전 등록 + soft delete 토글)' $mx ($H - 36) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '02-driver-crud.png')
}

# ------------------------------------------------------------
# 3. 03-mobile-phone-login.png  (390 x 844)
# ------------------------------------------------------------
function Render-03-MobilePhoneLogin {
    $W = 390; $H = 844
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral0
    $g = $pack.Graphics

    # status bar
    Draw-FilledRect $g 0 0 $W 44 $Neutral0
    Draw-Text $g '9:41' 16 14 13 $Neutral900 'Segoe UI' 'Bold'
    Draw-Text $g '100%' ($W - 56) 14 13 $Neutral900 'Segoe UI' 'Bold'

    # logo
    Draw-CenteredText $g '아로로지스' ([int]($W / 2)) 100 32 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-CenteredText $g '본인 번호로 접속' ([int]($W / 2)) 148 16 $Neutral700

    # divider
    Draw-FilledRect $g 64 192 ($W - 128) 1 $Neutral200

    # phone display
    $inpX = 48; $inpW = $W - 96; $inpY = 218
    Draw-FilledRect $g $inpX $inpY $inpW 72 $Neutral0
    Draw-StrokeRect $g $inpX $inpY $inpW 72 $ArologisTeal400 2
    Draw-CenteredText $g '010 - 1234 - 5' ([int]($W / 2)) ($inpY + 18) 30 $Neutral900 'Consolas' 'Bold'
    Draw-CenteredText $g '(10자리 입력 중)' ([int]($W / 2)) ($inpY + 80) 13 $Neutral500

    # numpad grid (3 x 4)
    $padX0 = 60; $padY0 = 350
    $btnSize = 72; $gap = 12
    $rows = @(
        @('1','2','3'),
        @('4','5','6'),
        @('7','8','9'),
        @('','0','⌫')
    )
    for($r = 0; $r -lt $rows.Count; $r++){
        for($c = 0; $c -lt 3; $c++){
            $val = $rows[$r][$c]
            if($val -eq ''){ continue }
            $bx = $padX0 + $c * ($btnSize + $gap)
            $by = $padY0 + $r * ($btnSize + $gap)
            Draw-FilledRect $g $bx $by $btnSize $btnSize $Neutral50
            Draw-StrokeRect $g $bx $by $btnSize $btnSize $Neutral200 1
            $txtColor = $Neutral900
            if($val -eq '⌫'){ $txtColor = $Red500 }
            Draw-CenteredText $g $val ($bx + [int]($btnSize / 2)) ($by + 22) 28 $txtColor 'Segoe UI' 'Bold'
        }
    }

    # submit button
    $sbY = $padY0 + 4 * ($btnSize + $gap) + 12
    Draw-FilledRect $g 48 $sbY ($W - 96) 56 $ArologisTeal500
    Draw-CenteredText $g '접속' ([int]($W / 2)) ($sbY + 16) 20 $Neutral0 'Segoe UI' 'Bold'

    # footer hint
    Draw-CenteredText $g '본인 번호 외 접속 금지 · passwordless 인증' ([int]($W / 2)) ($H - 56) 11 $Neutral500
    Draw-CenteredText $g 'QA Mock - 시나리오 3' ([int]($W / 2)) ($H - 28) 10 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '03-mobile-phone-login.png')
}

# ------------------------------------------------------------
# 4. 04-eureka.png  (1280 x 800)
# ------------------------------------------------------------
function Render-04-Eureka {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    # browser chrome
    Draw-FilledRect $g 0 0 $W 64 $Neutral100
    Draw-StrokeRect $g 0 0 $W 64 $Neutral200 1
    foreach($i in 0..2){
        $c = @($Red500, $Amber500, $Green500)[$i]
        $brush = New-Object System.Drawing.SolidBrush $c
        $g.FillEllipse($brush, (16 + $i * 22), 22, 14, 14)
        $brush.Dispose()
    }
    Draw-FilledRect $g 96 18 ($W - 200) 30 $Neutral0
    Draw-StrokeRect $g 96 18 ($W - 200) 30 $Neutral300 1
    Draw-Text $g 'http://localhost:8761/   (Eureka Dashboard)' 108 24 13 $Neutral700 'Consolas'

    # page header
    Draw-FilledRect $g 0 64 $W 60 $Neutral700
    Draw-Text $g 'Spring Eureka' 32 80 22 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g 'System Status: UP - last refresh 2026-05-14T08:30:12Z' 32 110 11 $Neutral200

    # section header
    Draw-Text $g 'Instances currently registered with Eureka (15 total)' 32 148 16 $Neutral900 'Segoe UI' 'Bold'

    # table
    $ty = 184
    $colName = 32
    $colAmis = 360
    $colAv   = 540
    $colStat = 760
    $colHost = 920

    Draw-FilledRect $g 32 $ty ($W - 64) 32 $Neutral100
    Draw-Text $g 'Application'        $colName ($ty + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'AMIs'               $colAmis ($ty + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'Availability Zones' $colAv   ($ty + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'Status'             $colStat ($ty + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'Instance ID'        $colHost ($ty + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    $ty += 32

    $apps = @(
        @{ name='GATEWAY-SERVICE';      pkg='samhan-public'; port=8080 },
        @{ name='USER-SERVICE';         pkg='samhan-public'; port=8081 },
        @{ name='SLIP-SERVICE';         pkg='samhan-public'; port=8082 },
        @{ name='PARTNER-SERVICE';      pkg='samhan-public'; port=8083 },
        @{ name='INVENTORY-SERVICE';    pkg='samhan-public'; port=8084 },
        @{ name='PRODUCT-SERVICE';      pkg='samhan-public'; port=8085 },
        @{ name='VEHICLE-SERVICE';      pkg='samhan-public'; port=8086 },
        @{ name='SIGNATURE-SERVICE';    pkg='samhan-public'; port=8087 },
        @{ name='STORAGE-SERVICE';      pkg='samhan-public'; port=8088 },
        @{ name='SALES-SERVICE';        pkg='samhan-public'; port=8089 },
        @{ name='FINANCE-SERVICE';      pkg='samhan-public'; port=8090 },
        @{ name='REALTIME-SERVICE';     pkg='samhan-public'; port=8091 },
        @{ name='DASHBOARD-SERVICE';    pkg='samhan-public'; port=8092 },
        @{ name='NOTIFICATION-SERVICE'; pkg='samhan-public'; port=8093 },
        @{ name='AROLOGIS-SERVICE';     pkg='arologis';      port=8097 }
    )
    foreach($app in $apps){
        $isArologis = ($app.name -eq 'AROLOGIS-SERVICE')
        $bg = if($isArologis){ $ArologisTeal50 } else { $Neutral0 }
        Draw-FilledRect $g 32 $ty ($W - 64) 28 $bg
        Draw-StrokeRect $g 32 $ty ($W - 64) 28 $Neutral100 1
        $nameColor = if($isArologis){ $ArologisTeal700 } else { $Neutral900 }
        $nameStyle = if($isArologis){ 'Bold' } else { 'Regular' }
        Draw-Text $g $app.name $colName ($ty + 6) 12 $nameColor 'Consolas' $nameStyle
        Draw-Text $g 'n/a (DEV)' $colAmis ($ty + 6) 12 $Neutral500
        Draw-Text $g 'samhanlogis-net (1)' $colAv ($ty + 6) 12 $Neutral700
        # green badge UP
        Draw-FilledRect $g $colStat ($ty + 4) 50 20 $Green500
        Draw-CenteredText $g 'UP' ($colStat + 25) ($ty + 7) 11 $Neutral0 'Segoe UI' 'Bold'
        Draw-Text $g ("{0}:{1}" -f $app.name.ToLower(), $app.port) $colHost ($ty + 6) 12 $Neutral700 'Consolas'
        $ty += 28
    }

    # callout box for arologis
    $coY = $ty + 16
    Draw-FilledRect $g 32 $coY ($W - 64) 64 $ArologisTeal50
    Draw-StrokeRect $g 32 $coY ($W - 64) 64 $ArologisTeal500 2
    Draw-Text $g '확인: arologis-service (8097) 가 Samhan Public 14 service 와 동일 Eureka registry 에 UP 등록.' 48 ($coY + 10) 13 $ArologisTeal700 'Segoe UI' 'Bold'
    Draw-Text $g 'docker network: samhanlogis-net  -  같은 LAN, 다른 docker-compose 파일 (서비스 격리 + 디스커버리 공유).' 48 ($coY + 34) 12 $Neutral700

    Draw-Text $g 'QA Mock - 시나리오 4 (14 Samhan Public + 1 arologis-service Eureka 등록 확인)' 32 ($H - 28) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '04-eureka.png')
}

# ------------------------------------------------------------
# 5. 05-route53.png  (1280 x 800)
# ------------------------------------------------------------
function Render-05-Route53 {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background $Neutral50
    $g = $pack.Graphics

    # AWS-ish header bar
    Draw-FilledRect $g 0 0 $W 56 ([System.Drawing.ColorTranslator]::FromHtml('#232F3E'))
    Draw-Text $g 'AWS Route 53 - Hosted Zone: samhan-air.com' 24 18 18 $Neutral0 'Segoe UI' 'Bold'
    Draw-Text $g 'us-east-1 (Global)' ($W - 220) 22 13 $Neutral200

    # Two-column layout: Route53 records (left) + Nginx config (right)
    $colLY = 88
    Draw-Text $g 'Route 53 - Record Set' 24 $colLY 16 $Neutral900 'Segoe UI' 'Bold'
    # header row
    $tyL = $colLY + 32
    Draw-FilledRect $g 24 $tyL 620 32 $Neutral100
    Draw-Text $g 'Name'          40 ($tyL + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'Type'         260 ($tyL + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'Value'         320 ($tyL + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    Draw-Text $g 'TTL'           580 ($tyL + 8) 12 $Neutral700 'Segoe UI' 'Bold'
    $tyL += 32

    $records = @(
        @('app.samhan-air.com',          'A',     '13.124.10.20', '300'),
        @('api.samhan-air.com',          'A',     '13.124.10.20', '300'),
        @('order.samhan-air.com',        'A',     '13.124.10.20', '300'),
        @('app.arologis.samhan-air.com', 'A',     '13.124.10.20', '300'),
        @('api.arologis.samhan-air.com', 'A',     '13.124.10.20', '300'),
        @('*.arologis.samhan-air.com',   'CNAME', 'arologis-alb.elb', '300')
    )
    foreach($r in $records){
        $isArologis = $r[0].Contains('arologis')
        $bg = if($isArologis){ $ArologisTeal50 } else { $Neutral0 }
        Draw-FilledRect $g 24 $tyL 620 30 $bg
        Draw-StrokeRect $g 24 $tyL 620 30 $Neutral100 1
        $nameColor = if($isArologis){ $ArologisTeal700 } else { $Neutral900 }
        $nameStyle = if($isArologis){ 'Bold' } else { 'Regular' }
        Draw-Text $g $r[0]  40 ($tyL + 7) 12 $nameColor 'Consolas' $nameStyle
        Draw-Text $g $r[1] 260 ($tyL + 7) 12 $Neutral900 'Consolas'
        Draw-Text $g $r[2] 320 ($tyL + 7) 12 $Neutral900 'Consolas'
        Draw-Text $g $r[3] 580 ($tyL + 7) 12 $Neutral700 'Consolas'
        $tyL += 30
    }

    # right column - Nginx config snippet
    $colRX = 680
    Draw-Text $g 'EC2 Nginx - /etc/nginx/conf.d/arologis.conf' $colRX $colLY 16 $Neutral900 'Segoe UI' 'Bold'
    $confX = $colRX
    $confY = $colLY + 32
    $confW = $W - $colRX - 32
    $confH = 380
    Draw-FilledRect $g $confX $confY $confW $confH ([System.Drawing.ColorTranslator]::FromHtml('#1E1E1E'))
    Draw-StrokeRect $g $confX $confY $confW $confH $Neutral700 1
    $confLines = @(
        'server {',
        '    listen 443 ssl http2;',
        '    server_name api.arologis.samhan-air.com;',
        '',
        '    ssl_certificate     /etc/ssl/arologis/fullchain.pem;',
        '    ssl_certificate_key /etc/ssl/arologis/privkey.pem;',
        '',
        '    # ACM SAN: *.arologis.samhan-air.com',
        '',
        '    location / {',
        '        proxy_pass http://127.0.0.1:8097;',
        '        proxy_set_header Host $host;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '    }',
        '}',
        '',
        '# Samhan Public 14 service - 별도 server block',
        'server {',
        '    listen 443 ssl http2;',
        '    server_name api.samhan-air.com;',
        '    location / {',
        '        proxy_pass http://127.0.0.1:8080;  # gateway',
        '    }',
        '}'
    )
    $lineY = $confY + 12
    foreach($ln in $confLines){
        $col = [System.Drawing.ColorTranslator]::FromHtml('#D4D4D4')
        if($ln.TrimStart().StartsWith('#')){
            $col = [System.Drawing.ColorTranslator]::FromHtml('#6A9955')
        } elseif($ln -match 'arologis|8097'){
            $col = [System.Drawing.ColorTranslator]::FromHtml('#4EC9B0')
        }
        Draw-Text $g $ln ($confX + 12) $lineY 12 $col 'Consolas'
        $lineY += 16
    }

    # health check response panel
    $hcY = 540
    Draw-Text $g 'curl -sv https://api.arologis.samhan-air.com/actuator/health' 24 $hcY 13 $Neutral900 'Consolas' 'Bold'
    Draw-FilledRect $g 24 ($hcY + 28) ($W - 48) 130 ([System.Drawing.ColorTranslator]::FromHtml('#1E1E1E'))
    $hcLines = @(
        '> GET /actuator/health HTTP/2',
        '> Host: api.arologis.samhan-air.com',
        '* SSL handshake OK  -  cert SAN: *.arologis.samhan-air.com  -  ACM',
        '< HTTP/2 200',
        '< content-type: application/json',
        '< via: nginx (host-header routed to upstream 127.0.0.1:8097)',
        '',
        '{ "status":"UP", "app":{"name":"arologis-service","port":8097} }'
    )
    $lineY = $hcY + 38
    foreach($ln in $hcLines){
        $col = [System.Drawing.ColorTranslator]::FromHtml('#D4D4D4')
        if($ln.StartsWith('>')){ $col = [System.Drawing.ColorTranslator]::FromHtml('#569CD6') }
        elseif($ln.StartsWith('<')){ $col = [System.Drawing.ColorTranslator]::FromHtml('#4EC9B0') }
        elseif($ln.StartsWith('*')){ $col = [System.Drawing.ColorTranslator]::FromHtml('#DCDCAA') }
        elseif($ln.StartsWith('{')){ $col = [System.Drawing.ColorTranslator]::FromHtml('#CE9178') }
        Draw-Text $g $ln 36 $lineY 12 $col 'Consolas'
        $lineY += 14
    }

    Draw-Text $g 'QA Mock - 시나리오 5 (api.arologis.samhan-air.com -> Nginx host-header -> 8097)' 24 ($H - 28) 11 $Neutral700

    Save-Bitmap $pack (Join-Path $OutDir '05-route53.png')
}

# ------------------------------------------------------------
# 6. 06-docker-isolation.png  (1280 x 800)
# ------------------------------------------------------------
function Render-06-DockerIsolation {
    $W = 1280; $H = 800
    $pack = New-Bitmap -Width $W -Height $H -Background ([System.Drawing.ColorTranslator]::FromHtml('#0C0C0C'))
    $g = $pack.Graphics

    # terminal chrome
    Draw-FilledRect $g 0 0 $W 36 ([System.Drawing.ColorTranslator]::FromHtml('#2D2D2D'))
    foreach($i in 0..2){
        $c = @($Red500, $Amber500, $Green500)[$i]
        $brush = New-Object System.Drawing.SolidBrush $c
        $g.FillEllipse($brush, (16 + $i * 22), 12, 12, 12)
        $brush.Dispose()
    }
    Draw-Text $g 'PowerShell - docker compose 단독 down 검증' 96 9 13 $Neutral200

    $monoWhite = [System.Drawing.ColorTranslator]::FromHtml('#E0E0E0')
    $promptCyan = [System.Drawing.ColorTranslator]::FromHtml('#4EC9B0')
    $cmdYellow = [System.Drawing.ColorTranslator]::FromHtml('#DCDCAA')
    $okGreen = [System.Drawing.ColorTranslator]::FromHtml('#6A9955')
    $warnAmber = [System.Drawing.ColorTranslator]::FromHtml('#D7BA7D')
    $infoBlue = [System.Drawing.ColorTranslator]::FromHtml('#569CD6')

    $lines = @(
        @{ t='PS C:\dev\SamhanLogis>'; c=$promptCyan },
        @{ t=' docker compose -f docker-compose.arologis.yml down'; c=$cmdYellow; cont=$true },
        @{ t='[+] Running 2/2'; c=$monoWhite },
        @{ t=' Container arologis-service-1   Removed       2.1s'; c=$okGreen },
        @{ t=' Network samhanlogis-net        Kept (external, in use by samhan public)'; c=$infoBlue },
        @{ t=''; c=$monoWhite },
        @{ t='PS C:\dev\SamhanLogis>'; c=$promptCyan },
        @{ t=' .\scripts\check-samhan-public-health.ps1'; c=$cmdYellow; cont=$true },
        @{ t='[check] Eureka registry  -  AROLOGIS-SERVICE deregistered (14 instances remain)'; c=$infoBlue },
        @{ t=''; c=$monoWhite },
        @{ t=' port 8080  GATEWAY-SERVICE       -> 200 UP'; c=$okGreen },
        @{ t=' port 8081  USER-SERVICE          -> 200 UP'; c=$okGreen },
        @{ t=' port 8082  SLIP-SERVICE          -> 200 UP'; c=$okGreen },
        @{ t=' port 8083  PARTNER-SERVICE       -> 200 UP'; c=$okGreen },
        @{ t=' port 8084  INVENTORY-SERVICE     -> 200 UP'; c=$okGreen },
        @{ t=' port 8085  PRODUCT-SERVICE       -> 200 UP'; c=$okGreen },
        @{ t=' port 8086  VEHICLE-SERVICE       -> 200 UP'; c=$okGreen },
        @{ t=' port 8087  SIGNATURE-SERVICE     -> 200 UP'; c=$okGreen },
        @{ t=' port 8088  STORAGE-SERVICE       -> 200 UP'; c=$okGreen },
        @{ t=' port 8089  SALES-SERVICE         -> 200 UP'; c=$okGreen },
        @{ t=' port 8090  FINANCE-SERVICE       -> 200 UP'; c=$okGreen },
        @{ t=' port 8091  REALTIME-SERVICE      -> 200 UP'; c=$okGreen },
        @{ t=' port 8092  DASHBOARD-SERVICE     -> 200 UP'; c=$okGreen },
        @{ t=' port 8093  NOTIFICATION-SERVICE  -> 200 UP'; c=$okGreen },
        @{ t=' port 8097  AROLOGIS-SERVICE      -> connection refused  (expected)'; c=$warnAmber },
        @{ t=''; c=$monoWhite },
        @{ t='[result] Samhan Public 14 service 영향 0  -  격리 검증 PASS'; c=$ArologisTeal500 },
        @{ t=''; c=$monoWhite },
        @{ t='PS C:\dev\SamhanLogis>'; c=$promptCyan },
        @{ t=' docker compose -f docker-compose.arologis.yml up -d  # 복구'; c=$cmdYellow; cont=$true },
        @{ t='[+] Running 1/1'; c=$monoWhite },
        @{ t=' Container arologis-service-1   Started       4.7s   (UP again, 15 total)'; c=$okGreen }
    )
    $ty = 52
    $x = 24
    foreach($ln in $lines){
        Draw-Text $g $ln.t $x $ty 13 $ln.c 'Consolas'
        if(-not $ln.cont){ $ty += 18 } else { $ty += 0; $x = 24 }
        if($ln.cont){
            $ty += 18
            $x = 24
        }
    }

    # bottom QA caption (white bar)
    Draw-FilledRect $g 0 ($H - 36) $W 36 $Neutral700
    Draw-Text $g 'QA Mock - 시나리오 6 (docker-compose.arologis.yml 단독 down -> Samhan Public 14 service 영향 0)' 16 ($H - 27) 12 $Neutral0

    Save-Bitmap $pack (Join-Path $OutDir '06-docker-isolation.png')
}

Write-Host '[generate-arologis-qa-screenshots] start'
Render-01-AdminLogin
Render-02-DriverCrud
Render-03-MobilePhoneLogin
Render-04-Eureka
Render-05-Route53
Render-06-DockerIsolation
Write-Host '[generate-arologis-qa-screenshots] done'
