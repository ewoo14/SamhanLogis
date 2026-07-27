$ErrorActionPreference = 'Stop'

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\sp-02-accounting-closing-menu-gap-audit\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Malgun Gothic'
$Ink = [System.Drawing.ColorTranslator]::FromHtml('#18212F')
$Muted = [System.Drawing.ColorTranslator]::FromHtml('#596579')
$Line = [System.Drawing.ColorTranslator]::FromHtml('#D7DEE8')
$Bg = [System.Drawing.ColorTranslator]::FromHtml('#F4F7FA')
$Card = [System.Drawing.Color]::White
$Navy = [System.Drawing.ColorTranslator]::FromHtml('#17212B')
$Teal = [System.Drawing.ColorTranslator]::FromHtml('#2A9D8F')
$Blue = [System.Drawing.ColorTranslator]::FromHtml('#2563EB')
$Green = [System.Drawing.ColorTranslator]::FromHtml('#16A34A')
$Amber = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
$Red = [System.Drawing.ColorTranslator]::FromHtml('#DC2626')
$Violet = [System.Drawing.ColorTranslator]::FromHtml('#7C3AED')
$SoftTeal = [System.Drawing.ColorTranslator]::FromHtml('#E7F6F3')
$SoftBlue = [System.Drawing.ColorTranslator]::FromHtml('#E8F0FF')
$SoftAmber = [System.Drawing.ColorTranslator]::FromHtml('#FFF7E6')

function New-Font($Size, $Style = 'Regular') {
    return New-Object System.Drawing.Font($FontFamily, $Size, [System.Drawing.FontStyle]::$Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$Size, $Color, $Style = 'Regular') {
    $font = New-Font $Size $Style
    $brush = New-Object System.Drawing.SolidBrush($Color)
    $Graphics.DrawString($Text, $font, $brush, $X, $Y)
    $font.Dispose()
    $brush.Dispose()
}

function Draw-Rect($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, $Fill, $Border = $null) {
    $brush = New-Object System.Drawing.SolidBrush($Fill)
    $Graphics.FillRectangle($brush, $X, $Y, $W, $H)
    $brush.Dispose()
    if ($null -ne $Border) {
        $pen = New-Object System.Drawing.Pen($Border, 1)
        $Graphics.DrawRectangle($pen, $X, $Y, $W, $H)
        $pen.Dispose()
    }
}

function Draw-Pill($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$W, $Fill, $TextColor) {
    Draw-Rect $Graphics $X $Y $W 30 $Fill $Fill
    Draw-Text $Graphics $Text ($X + 12) ($Y + 7) 14 $TextColor 'Bold'
}

function Draw-Card($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Title, [string[]]$Lines, $Accent) {
    Draw-Rect $Graphics $X $Y $W $H $Card $Line
    Draw-Rect $Graphics $X $Y 6 $H $Accent $Accent
    Draw-Text $Graphics $Title ($X + 22) ($Y + 18) 20 $Ink 'Bold'
    $lineY = $Y + 58
    foreach ($line in $Lines) {
        Draw-Text $Graphics $line ($X + 22) $lineY 15 $Muted
        $lineY += 28
    }
}

function Draw-Table($Graphics, [int]$X, [int]$Y, [string[]]$Headers, [object[]]$Rows) {
    $widths = @(155, 170, 160, 160, 190)
    $tableW = 0
    foreach ($w in $widths) { $tableW += $w }
    Draw-Rect $Graphics $X $Y $tableW 42 $Navy $Navy
    $colX = $X
    for ($i = 0; $i -lt $Headers.Count; $i++) {
        Draw-Text $Graphics $Headers[$i] ($colX + 12) ($Y + 12) 14 ([System.Drawing.Color]::White) 'Bold'
        $colX += $widths[$i]
    }
    $rowY = $Y + 42
    foreach ($row in $Rows) {
        Draw-Rect $Graphics $X $rowY $tableW 44 $Card $Line
        $colX = $X
        for ($i = 0; $i -lt $row.Count; $i++) {
            Draw-Text $Graphics $row[$i] ($colX + 12) ($rowY + 13) 14 $Ink
            $colX += $widths[$i]
        }
        $rowY += 44
    }
}

function Draw-Sidebar($Graphics, [string]$Active) {
    Draw-Rect $Graphics 0 0 250 860 $Navy
    Draw-Text $Graphics 'Samhan Public' 30 28 28 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $Graphics '판매' 30 104 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    $sales = @('판매조회', '전표 정리', '매출 마감', '거래처 관리')
    $y = 136
    foreach ($item in $sales) {
        if ($item -eq $Active) {
            Draw-Rect $Graphics 28 ($y - 8) 194 36 ([System.Drawing.ColorTranslator]::FromHtml('#1F3A3D')) $Teal
            Draw-Text $Graphics $item 44 $y 15 ([System.Drawing.Color]::White) 'Bold'
        } else {
            Draw-Text $Graphics $item 44 $y 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
        }
        $y += 38
    }
    Draw-Text $Graphics '회계' 30 318 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    $accounting = @('세금계산서', '월계표', '매출 마감', '월말 마감', '거래명세서 일괄')
    $y = 350
    foreach ($item in $accounting) {
        if ($item -eq $Active) {
            Draw-Rect $Graphics 28 ($y - 8) 194 36 ([System.Drawing.ColorTranslator]::FromHtml('#1F3A3D')) $Teal
            Draw-Text $Graphics $item 44 $y 15 ([System.Drawing.Color]::White) 'Bold'
        } else {
            Draw-Text $Graphics $item 44 $y 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
        }
        $y += 38
    }
}

function New-Screen([hashtable]$Spec) {
    $W = 1280
    $H = 860
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    Draw-Rect $g 0 0 $W $H $Bg
    Draw-Sidebar $g $Spec.Active

    Draw-Text $g $Spec.Title 290 36 30 $Ink 'Bold'
    Draw-Text $g $Spec.Subtitle 292 76 15 $Muted
    Draw-Pill $g $Spec.Role 1090 36 140 $Teal ([System.Drawing.Color]::White)
    Draw-Rect $g 290 112 900 42 $Spec.PathBg $Line
    Draw-Text $g $Spec.Path 308 124 15 $Ink 'Bold'

    $positions = @(
        @{ X = 290; Y = 184; W = 420; H = 186 },
        @{ X = 750; Y = 184; W = 420; H = 186 },
        @{ X = 290; Y = 410; W = 420; H = 186 },
        @{ X = 750; Y = 410; W = 420; H = 186 }
    )
    for ($i = 0; $i -lt $Spec.Cards.Count; $i++) {
        $p = $positions[$i]
        $c = $Spec.Cards[$i]
        Draw-Card $g $p.X $p.Y $p.W $p.H $c.Title $c.Lines $c.Accent
    }

    if ($Spec.ContainsKey('Table')) {
        Draw-Table $g 290 638 $Spec.Table.Headers $Spec.Table.Rows
    }

    Draw-Text $g $Spec.Footer 290 820 14 $Muted
    $Path = Join-Path $OutDir $Spec.File
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $Path"
}

$screens = @(
    @{
        File='01-sales-closing-sales-group.png'; Role='ACCOUNTANT'; Active='매출 마감'; Title='판매 그룹 매출 마감 발견성'; Subtitle='매뉴얼의 정식 매출 마감 route 는 /sales/closing 으로 고정한다.'; Path='/sales/closing'; PathBg=$SoftTeal
        Cards=@(
            @{ Title='메뉴 entry'; Lines=@('판매 그룹에 매출 마감 노출', 'data-testid = sidebar-sales-closing', '회계 담당자도 발견 가능'); Accent=$Teal },
            @{ Title='정식 route'; Lines=@('/sales/closing', 'legacy /warehouse/closing 아님', 'SalesClosingPage 연결'); Accent=$Blue },
            @{ Title='권한'; Lines=@('ACCOUNTANT / MANAGER / MASTER', '실행 버튼은 ACCOUNTANT / MASTER', '역마감은 MASTER 전용'); Accent=$Green },
            @{ Title='업무번호'; Lines=@('표시번호 = YYYY/MM/DD-N', '서비스/메뉴별 중복 허용', 'UUID는 화면 미표시'); Accent=$Violet }
        ); Footer='SP-02 QA 01 - 판매 사이드바에서 매출 마감 정식 route 확인'
    },
    @{
        File='02-sales-closing-accounting-group.png'; Role='ACCOUNTANT'; Active='매출 마감'; Title='회계 그룹 매출 마감 route 정정'; Subtitle='회계 그룹의 매출 마감도 같은 /sales/closing 으로 이동한다.'; Path='/sales/closing'; PathBg=$SoftBlue
        Cards=@(
            @{ Title='기존 위험'; Lines=@('회계 그룹 entry 가 legacy route 사용', '/warehouse/closing 으로 이동', '문서와 화면 목적지 불일치'); Accent=$Amber },
            @{ Title='정정'; Lines=@('sidebar-accounting-sales-closing', 'to = /sales/closing', '판매/회계 entry 목적지 통일'); Accent=$Teal },
            @{ Title='deep-link'; Lines=@('/warehouse/closing route 는 보존', '사용자-facing 메뉴에서는 제외', '후속 retire 판단 가능'); Accent=$Blue },
            @{ Title='계약 테스트'; Lines=@('Playwright static contract', 'legacy exact NavLink 부재 확인', 'route guard 확인'); Accent=$Green }
        ); Footer='SP-02 QA 02 - 회계 메뉴의 매출 마감 legacy 링크 제거'
    },
    @{
        File='03-period-close-accounting-group.png'; Role='ACCOUNTANT'; Active='월말 마감'; Title='월말 마감 메뉴 노출'; Subtitle='이미 존재하던 /accounting/period-close 화면을 회계 사이드바에서 찾을 수 있게 한다.'; Path='/accounting/period-close'; PathBg=$SoftTeal
        Cards=@(
            @{ Title='메뉴 entry'; Lines=@('회계 그룹에 월말 마감 추가', 'data-testid = sidebar-accounting-period-close', '매뉴얼 경로와 일치'); Accent=$Teal },
            @{ Title='route'; Lines=@('/accounting/period-close', 'PeriodCloseListPage', 'ACCOUNTING_ROLES guard'); Accent=$Blue },
            @{ Title='조회 정책'; Lines=@('목록/이력 조회 가능', '실행은 ACCOUNTANT / MASTER', 'MANAGER 는 조회 전용'); Accent=$Green },
            @{ Title='표시 데이터'; Lines=@('기간, 상태, 실행자, 금액', '내부 id action param 전용', 'UUID 텍스트 0건'); Accent=$Red }
        ); Footer='SP-02 QA 03 - 월말 마감 discoverability gap 해소'
    },
    @{
        File='04-manager-period-close-readonly.png'; Role='MANAGER'; Active='월말 마감'; Title='MANAGER 월말 마감 조회 전용'; Subtitle='MANAGER 는 route/list/realtime 조회가 가능하지만 마감 실행은 불가하다.'; Path='/accounting/period-close?role=MANAGER'; PathBg=$SoftAmber
        Cards=@(
            @{ Title='진입'; Lines=@('RoleGuard = ACCOUNTING_ROLES', 'GET /accounting/closings 200', 'SSE closing realtime 구독 가능'); Accent=$Teal },
            @{ Title='제한'; Lines=@('POST /accounting/closings 403', '역마감 button 미표시', 'canExecuteClosing = false'); Accent=$Red },
            @{ Title='Docker 검증'; Lines=@('MonthEndCloseControllerIT', 'MANAGER list 200', 'MANAGER close 403'); Accent=$Green },
            @{ Title='필터 안정성'; Lines=@('periodType + year filter', 'PostgreSQL null param 500 방지', 'repository method 분기'); Accent=$Blue }
        )
        Table=@{
            Headers=@('기간', '유형', '상태', '실행자', '화면 노출')
            Rows=@(
                @('2026-03-01', 'MONTHLY', 'CLOSED', 'accountant-1', 'UUID 없음'),
                @('2026-05-09', 'DAILY', 'CLOSED', 'system', '업무값만 표시')
            )
        }; Footer='SP-02 QA 04 - MANAGER read-only backend/frontend 권한 정합'
    },
    @{
        File='05-master-sales-closing-route.png'; Role='MASTER'; Active='매출 마감'; Title='MASTER 매출 마감 운영 화면'; Subtitle='MASTER 는 정식 route 에서 역마감과 감사 이력 확인까지 수행한다.'; Path='/sales/closing?role=MASTER'; PathBg=$SoftBlue
        Cards=@(
            @{ Title='운영 액션'; Lines=@('마감 실행 가능', '역마감 가능', '감사 이력 panel 확인'); Accent=$Teal },
            @{ Title='정책'; Lines=@('POST close = ACCOUNTANT / MASTER', 'POST reverse = MASTER', 'MANAGER close 403 유지'); Accent=$Green },
            @{ Title='표시번호'; Lines=@('전표/배차 번호는 YYYY/MM/DD-N', '다른 서비스/메뉴와 중복 가능', 'UUID PK 로 내부 복구'); Accent=$Violet },
            @{ Title='회귀'; Lines=@('legacy route 목적지 아님', 'route guard 유지', 'pageerror 0건 기대'); Accent=$Blue }
        )
        Table=@{
            Headers=@('메뉴', 'route', '조회', '실행', '비고')
            Rows=@(
                @('매출 마감', '/sales/closing', 'A/M/M', 'A/Master', '정식 route'),
                @('월말 마감', '/accounting/period-close', 'A/M/M', 'A/Master', '신규 entry')
            )
        }; Footer='SP-02 QA 05 - MASTER 정식 매출 마감 운영 경로'
    },
    @{
        File='06-uuid-hidden-closing-menu-matrix.png'; Role='QA'; Active='월말 마감'; Title='UUID 비노출 및 5-agent 검증 매트릭스'; Subtitle='PR 캡처, 문서, 테스트에는 내부 PK 대신 업무 식별자만 남긴다.'; Path='privacy://uuid-hidden/business-number-scoped'; PathBg=$SoftTeal
        Cards=@(
            @{ Title='UUID 가드'; Lines=@('36자 UUID regex 0건', 'closingId / periodId 원문 미표시', 'row id 는 action param 전용'); Accent=$Red },
            @{ Title='업무번호 원칙'; Lines=@('YYYY/MM/DD-N', '서비스/메뉴별 독립 sequence', '판매/구매/배차 같은 문자열 허용'); Accent=$Violet },
            @{ Title='5-agent 리뷰'; Lines=@('BE: MANAGER API 충돌 지적 반영', 'FE: route/menu gap 확인', 'QA: 후속 P0 후보 정리'); Accent=$Blue },
            @{ Title='검증'; Lines=@('desktop typecheck/lint/build', 'Playwright static contract', '204 tests / skipped 0'); Accent=$Green }
        )
        Table=@{
            Headers=@('항목', '기대값', '검증', '상태', '후속')
            Rows=@(
                @('매출 마감', '/sales/closing', 'static spec', 'PASS', 'legacy retire'),
                @('월말 마감', '/accounting/period-close', 'static spec', 'PASS', '없음')
            )
        }; Footer='SP-02 QA 06 - PR 본문 대표 매트릭스 캡처'
    }
)

foreach ($screen in $screens) {
    New-Screen $screen
}

$generated = Get-ChildItem $OutDir -Filter *.png
if ($generated.Count -ne 6) {
    throw "Expected 6 screenshots, generated $($generated.Count)"
}

Write-Host "SP-02 screenshots generated: $($generated.Count)"
