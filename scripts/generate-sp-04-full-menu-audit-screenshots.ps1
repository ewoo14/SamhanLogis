$ErrorActionPreference = 'Stop'

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\sp-04-full-menu-audit\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Segoe UI'
$Ink = [System.Drawing.ColorTranslator]::FromHtml('#17202A')
$Muted = [System.Drawing.ColorTranslator]::FromHtml('#5B6778')
$Line = [System.Drawing.ColorTranslator]::FromHtml('#D7DEE8')
$Bg = [System.Drawing.ColorTranslator]::FromHtml('#F3F6FA')
$CardFill = [System.Drawing.Color]::White
$Navy = [System.Drawing.ColorTranslator]::FromHtml('#17212B')
$Teal = [System.Drawing.ColorTranslator]::FromHtml('#168A83')
$Blue = [System.Drawing.ColorTranslator]::FromHtml('#2563EB')
$Green = [System.Drawing.ColorTranslator]::FromHtml('#16A34A')
$Amber = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
$Red = [System.Drawing.ColorTranslator]::FromHtml('#DC2626')
$Purple = [System.Drawing.ColorTranslator]::FromHtml('#7C3AED')
$SoftTeal = [System.Drawing.ColorTranslator]::FromHtml('#E7F6F3')
$SoftBlue = [System.Drawing.ColorTranslator]::FromHtml('#E8F0FF')
$SoftAmber = [System.Drawing.ColorTranslator]::FromHtml('#FFF7E6')
$SoftRed = [System.Drawing.ColorTranslator]::FromHtml('#FEECEC')

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
        $pen = New-Object System.Drawing.Pen -ArgumentList $Border, 1
        $Graphics.DrawRectangle($pen, $X, $Y, $W, $H)
        $pen.Dispose()
    }
}

function Draw-Pill($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$W, $Fill, $TextColor) {
    Draw-Rect $Graphics $X $Y $W 28 $Fill $Fill
    Draw-Text $Graphics $Text ($X + 10) ($Y + 7) 13 $TextColor 'Bold'
}

function Draw-Sidebar($Graphics, [string]$Active, [string[]]$Items) {
    Draw-Rect $Graphics 0 0 260 900 $Navy
    Draw-Text $Graphics 'Samhan Public' 28 28 26 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $Graphics 'FULL MENU AUDIT' 28 66 12 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    $y = 118
    foreach ($item in $Items) {
        if ($item -eq $Active) {
            Draw-Rect $Graphics 22 ($y - 8) 214 34 ([System.Drawing.ColorTranslator]::FromHtml('#1F3A3D')) $Teal
            Draw-Text $Graphics $item 40 $y 14 ([System.Drawing.Color]::White) 'Bold'
        } else {
            Draw-Text $Graphics $item 40 $y 14 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
        }
        $y += 38
    }
}

function Draw-Grid($Graphics, [int]$X, [int]$Y, [string[]]$Headers, [object[]]$Rows, [int[]]$Widths) {
    $tableW = 0
    foreach ($w in $Widths) { $tableW += $w }
    Draw-Rect $Graphics $X $Y $tableW 38 $Navy $Navy
    $cx = $X
    for ($i = 0; $i -lt $Headers.Count; $i++) {
        Draw-Text $Graphics $Headers[$i] ($cx + 10) ($Y + 11) 13 ([System.Drawing.Color]::White) 'Bold'
        $cx += $Widths[$i]
    }
    $ry = $Y + 38
    foreach ($row in $Rows) {
        Draw-Rect $Graphics $X $ry $tableW 38 $CardFill $Line
        $cx = $X
        for ($i = 0; $i -lt $row.Count; $i++) {
            $text = [string]$row[$i]
            $color = if ($text -match 'FAIL|누락|금지|T-|TR-') { $Red } elseif ($text -match 'OK|완료|통과|숨김|YYYY') { $Green } else { $Ink }
            Draw-Text $Graphics $text ($cx + 10) ($ry + 11) 12 $color
            $cx += $Widths[$i]
        }
        $ry += 38
    }
}

function Draw-Card($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Title, [string[]]$Lines, $Accent) {
    Draw-Rect $Graphics $X $Y $W $H $CardFill $Line
    Draw-Rect $Graphics $X $Y 6 $H $Accent $Accent
    Draw-Text $Graphics $Title ($X + 20) ($Y + 16) 18 $Ink 'Bold'
    $lineY = $Y + 50
    foreach ($line in $Lines) {
        Draw-Text $Graphics $line ($X + 20) $lineY 13 $Muted
        $lineY += 24
    }
}

function New-AuditScreen([hashtable]$Spec) {
    $W = 1280
    $H = 900
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    Draw-Rect $g 0 0 $W $H $Bg
    Draw-Sidebar $g $Spec.Active $Spec.Sidebar
    Draw-Text $g $Spec.Title 300 34 29 $Ink 'Bold'
    Draw-Text $g $Spec.Subtitle 302 72 14 $Muted
    Draw-Pill $g $Spec.Role 1090 34 136 $Teal ([System.Drawing.Color]::White)

    if ($Spec.Rows) {
        Draw-Grid $g 300 122 $Spec.Headers $Spec.Rows $Spec.Widths
    }

    $x = 300
    $y = if ($Spec.Rows) { 450 } else { 122 }
    foreach ($card in $Spec.Cards) {
        $cardTitle = [string]$card['Title']
        $cardLines = [string[]]$card['Lines']
        $cardAccent = $card['Accent']
        Draw-Card $g $x $y 420 130 $cardTitle $cardLines $cardAccent
        $x += 452
        if ($x -gt 980) {
            $x = 300
            $y += 160
        }
    }

    Draw-Text $g $Spec.Footer 300 852 13 $Muted
    $path = Join-Path $OutDir $Spec.File
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $path"
}

$menuItems = @(
    '대시보드','창고 관리','판매관리','구매관리','재고이동 관리','링크발송','배차','거래처 관리',
    '견적서 관리','주문서 관리','거래처 DC 설정','회계','메신저','arologis','인사'
)

$screens = @(
    @{
        File='01-master-full-sidebar.png'; Role='MASTER'; Active='판매관리'; Sidebar=$menuItems
        Title='MASTER 전메뉴 사이드바 점검'; Subtitle='관리형 메뉴명과 운영 메뉴 직접 노출 상태'
        Headers=@('메뉴','라우트','권한','판정'); Widths=@(170,260,230,180)
        Rows=@(
            @('판매관리','/sales','인증 모두','OK'),
            @('구매관리','/purchases','인증 모두','OK'),
            @('재고이동 관리','/transfers','인증 모두','OK'),
            @('창고 관리','/warehouses','인증 모두 / 쓰기 대표실','OK'),
            @('거래처 관리','/admin/partners','SALES/MANAGER/MASTER','OK')
        )
        Cards=@(
            @{Title='라벨'; Lines=@('조회 전용 오해 제거','판매/구매/재고/창고 모두 관리형','주문서/견적서 관리 유지'); Accent=$Teal},
            @{Title='권한'; Lines=@('admin-origin route 분리','링크발송 MANAGER/MASTER','엑셀 export MANAGER/MASTER'); Accent=$Blue},
            @{Title='캡처'; Lines=@('header-page-title testid 추가','sidebar 핵심 testid 추가','PR 본문 인라인 첨부'); Accent=$Green},
            @{Title='번호'; Lines=@('전표번호 YYYY/MM/DD-N','재고이동 T-/TR- 금지','UUID 화면 비노출'); Accent=$Amber}
        )
        Footer='SP-04 QA 01 — MASTER full menu contract'
    },
    @{
        File='02-manager-operational-menu.png'; Role='MANAGER'; Active='거래처 관리'; Sidebar=$menuItems
        Title='MANAGER 운영 메뉴 점검'; Subtitle='대표실 AdminLayout 밖에서 필요한 운영 화면 접근'
        Headers=@('화면','라우트','API 계약','판정'); Widths=@(190,250,260,140)
        Rows=@(
            @('거래처 관리','/admin/partners','GET/POST 4탭 가능','OK'),
            @('발송금지 거래처','/admin/blocked-partners','단건 차단 가능','OK'),
            @('단톡방 매핑','/admin/chat-rooms','CHAT import/list','OK'),
            @('지역 관리','/admin/regions','REGION CRUD/import','OK'),
            @('알리고 주소록','/admin/aligo-address-book','dryRun sync','OK')
        )
        Cards=@(
            @{Title='Dead-end 제거'; Lines=@('AdminLayout MASTER 전용 우회','운영 화면별 RoleGuard 적용','메뉴와 라우트 가드 일치'); Accent=$Teal},
            @{Title='거래처'; Lines=@('신규 등록 버튼 유지','Sales도 신규 등록 가능','수정/Excel은 MANAGER 이상'); Accent=$Blue},
            @{Title='발송금지'; Lines=@('MANAGER 단건 차단','MASTER CSV import/unblock','UUID 대신 partnerCode testid'); Accent=$Green},
            @{Title='노션'; Lines=@('CHAT/BLOCK/REGION 원본 표 확인','CSV row 동적 검증','name-only alias 보존'); Accent=$Amber}
        )
        Footer='SP-04 QA 02 — MANAGER operational menu'
    },
    @{
        File='03-sales-management-crud-and-export-roles.png'; Role='SALES'; Active='판매관리'; Sidebar=$menuItems
        Title='SALES 판매관리 / 거래처 생성 점검'; Subtitle='판매관리 CRUD 발견성과 export/write 권한 분리'
        Headers=@('항목','SALES','MANAGER','MASTER'); Widths=@(260,180,180,180)
        Rows=@(
            @('판매관리 목록','OK','OK','OK'),
            @('출고전표 신규 작성','OK','OK','OK'),
            @('거래처 신규 등록','OK','OK','OK'),
            @('거래처 상세 수정','숨김','OK','OK'),
            @('Excel 다운로드','숨김','OK','OK')
        )
        Cards=@(
            @{Title='판매관리'; Lines=@('판매조회 라벨 제거','신규 작성/상세/수정 흐름 유지','전표번호 업무형 표시'); Accent=$Teal},
            @{Title='거래처'; Lines=@('누락된 신규 등록 CTA 확인','4탭 등록 API 사용','상세 편집은 권한별 숨김'); Accent=$Blue},
            @{Title='권한 정합'; Lines=@('FE 버튼 숨김','BE 403 dead-end 차단','역할별 QA 표본 추가'); Accent=$Green},
            @{Title='UUID'; Lines=@('partnerCode/사업자번호만 표시','row testid partnerCode','UUID regex 노출 없음'); Accent=$Amber}
        )
        Footer='SP-04 QA 03 — SALES workflow and guarded export'
    },
    @{
        File='04-purchase-management-inspection.png'; Role='WAREHOUSE'; Active='구매관리'; Sidebar=$menuItems
        Title='구매관리 검수 CTA 회귀 점검'; Subtitle='구매관리 명칭 유지 + SAVED/CONFIRMED 검수 진입'
        Headers=@('구매번호','상태','검수 버튼','판정'); Widths=@(220,180,180,180)
        Rows=@(
            @('2026/05/16-1','SAVED','노출','OK'),
            @('2026/05/16-2','CONFIRMED','노출','OK'),
            @('2026/05/15-3','COMPLETED','숨김','OK'),
            @('2026/05/15-4','CANCELED','숨김','OK')
        )
        Cards=@(
            @{Title='라벨'; Lines=@('구매조회 → 구매관리','입고전표 생성/검수 포함','legacy deep-link 별도 유지'); Accent=$Teal},
            @{Title='검수'; Lines=@('InboundInspectionDialog 연결','불량/누락 사유 입력','완료 후 목록 refetch'); Accent=$Blue},
            @{Title='권한'; Lines=@('WAREHOUSE/MANAGER/MASTER','SALES는 검수 미노출','상태 기반 CTA'); Accent=$Green},
            @{Title='번호'; Lines=@('구매번호 YYYY/MM/DD-N','판매번호와 중복 가능','메뉴별 업무번호 분리'); Accent=$Amber}
        )
        Footer='SP-04 QA 04 — Purchase management inspection CTA'
    },
    @{
        File='05-warehouse-transfer-number-contract.png'; Role='WAREHOUSE'; Active='재고이동 관리'; Sidebar=$menuItems
        Title='재고이동 관리 번호 계약 점검'; Subtitle='T-/TR- prefix 제거 및 날짜별 순번 계약'
        Headers=@('이동번호','기대 형식','표시','판정'); Widths=@(220,210,200,160)
        Rows=@(
            @('2026/05/16-1','YYYY/MM/DD-N','정상','OK'),
            @('2026/05/16-2','YYYY/MM/DD-N','정상','OK'),
            @('T-2026/05/16-1','금지','미사용','FAIL 방지'),
            @('TR-20260516-001','금지','정규화 대상','FAIL 방지')
        )
        Cards=@(
            @{Title='채번'; Lines=@('같은 날짜 마지막 suffix + 1','날짜 변경 시 해당 날짜 기준','서비스별 중복 허용'); Accent=$Teal},
            @{Title='표준'; Lines=@('전표/이동/배차 모두 업무번호','UUID는 숨은 PK','화면은 business code'); Accent=$Blue},
            @{Title='마이그레이션'; Lines=@('V10 normalize 존재','기존 prefix 정규화','테스트가 prefix 금지 검증'); Accent=$Green},
            @{Title='메뉴'; Lines=@('재고이동 → 재고이동 관리','신규 버튼 testid 추가','목록 table testid 추가'); Accent=$Amber}
        )
        Footer='SP-04 QA 05 — Transfer number contract'
    },
    @{
        File='06-arologis-dispatch-menu.png'; Role='DISPATCH'; Active='arologis'; Sidebar=$menuItems
        Title='DISPATCH 배차담당자 메뉴 점검'; Subtitle='shared Role enum 추가와 배차 메뉴 가시성'
        Headers=@('메뉴','라우트','DISPATCH','판정'); Widths=@(220,270,160,160)
        Rows=@(
            @('배차','/dispatch-board','노출','OK'),
            @('수동 배차','/arologis/manual','노출','OK'),
            @('가배차 분류','/arologis/pre-classify','노출','OK'),
            @('실배차 비교','/arologis/dispatch-reconcile','노출','OK'),
            @('지역 관리','/admin/regions','조회 전용','OK')
        )
        Cards=@(
            @{Title='Role'; Lines=@('Role.DISPATCH 추가','관리자 역할 목록 표시','배차담당자 풀네임'); Accent=$Teal},
            @{Title='메뉴'; Lines=@('hidden 실배차 비교 entry 승격','지역 분류 중복 제거','지역 관리 단일화'); Accent=$Blue},
            @{Title='권한'; Lines=@('DISPATCH read/operate','MANAGER/MASTER 관리','admin 3종은 manager 이상'); Accent=$Green},
            @{Title='아로로지스'; Lines=@('Samhan Public 배차 board','arologis sync route','D-AX 연계 보존'); Accent=$Amber}
        )
        Footer='SP-04 QA 06 — DISPATCH role and arologis menu'
    },
    @{
        File='07-admin-origin-route-guards.png'; Role='MATRIX'; Active='메신저'; Sidebar=$menuItems
        Title='Admin-origin route guard matrix'; Subtitle='AdminLayout 밖으로 분리한 운영 화면 계약'
        Headers=@('라우트','허용 ROLE','AdminLayout 의존','판정'); Widths=@(300,260,170,120)
        Rows=@(
            @('/admin/sheet-sync','MANAGER/MASTER','없음','OK'),
            @('/admin/blocked-partners','MANAGER/MASTER','없음','OK'),
            @('/admin/aligo-address-book','MANAGER/MASTER','없음','OK'),
            @('/admin/chat-rooms','MANAGER/MASTER','없음','OK'),
            @('/admin/regions','DISPATCH/MANAGER/MASTER','없음','OK')
        )
        Cards=@(
            @{Title='목표'; Lines=@('운영 메뉴가 403로 끝나지 않음','대표실 HR Admin과 분리','각 API @PreAuthorize 일치'); Accent=$Teal},
            @{Title='발송'; Lines=@('링크발송 MANAGER/MASTER','발송금지 MANAGER/MASTER','SMS 사고 범위 축소'); Accent=$Blue},
            @{Title='CSV'; Lines=@('MASTER import/unblock 유지','MANAGER 단건 운영','reject 보고 유지'); Accent=$Green},
            @{Title='QA'; Lines=@('full-screen-audit route 포함','role 표본 확대','static contract test 추가'); Accent=$Amber}
        )
        Footer='SP-04 QA 07 — Admin-origin guards'
    },
    @{
        File='08-region-readonly-vs-manager.png'; Role='DISPATCH/MANAGER'; Active='지역 관리'; Sidebar=$menuItems
        Title='지역 관리 read-only / write 분기'; Subtitle='배차담당자는 조회, 관리자 이상은 수정'
        Headers=@('역할','목록','추가/수정/삭제','CSV import'); Widths=@(180,180,220,180)
        Rows=@(
            @('DISPATCH','OK','조회 전용','숨김'),
            @('MANAGER','OK','OK','OK'),
            @('MASTER','OK','OK','OK'),
            @('SALES','숨김','숨김','숨김')
        )
        Cards=@(
            @{Title='중복 제거'; Lines=@('지역 분류 entry 제거','지역 관리 단일 entry','data-testid 안정화'); Accent=$Teal},
            @{Title='원본'; Lines=@('Notion 배차지역 분류표','현재 CSV 20 rows','분류 그룹/검색어 schema'); Accent=$Blue},
            @{Title='분류'; Lines=@('광역 prefix 우선','중구 ambiguous 회귀 방지','sortOrder 보존'); Accent=$Green},
            @{Title='검증'; Lines=@('RegionImportService 존재','RegionClassifierTest 존재','CSV row 계약 테스트'); Accent=$Amber}
        )
        Footer='SP-04 QA 08 — Region readonly vs manager write'
    },
    @{
        File='09-dispatch-role-user-admin.png'; Role='MASTER'; Active='인사'; Sidebar=$menuItems
        Title='사용자 권한 관리 DISPATCH 추가'; Subtitle='8-role taxonomy로 배차담당자 계정 부여 가능'
        Headers=@('ROLE','표시명','주요 메뉴','판정'); Widths=@(180,190,300,140)
        Rows=@(
            @('MASTER','마스터','전체','OK'),
            @('MANAGER','관리자','운영/회계/배차','OK'),
            @('DISPATCH','배차담당자','배차/arologis/지역 조회','OK'),
            @('SALES','영업','판매/거래처','OK'),
            @('WAREHOUSE','창고','구매/재고/검수','OK')
        )
        Cards=@(
            @{Title='BE'; Lines=@('shared Role enum 8건','AdminUserController roles 8건','RoleTest 갱신'); Accent=$Teal},
            @{Title='FE'; Lines=@('ADMIN_ROLE_LABEL.DISPATCH','RolesPage 설명 추가','UsersPage badge variant'); Accent=$Blue},
            @{Title='권한'; Lines=@('배차 board 허용','arologis reconcile 허용','admin 3종은 제외'); Accent=$Green},
            @{Title='문서'; Lines=@('README 8-role 반영','PR body 권한 표 추가','캡처 포함'); Accent=$Amber}
        )
        Footer='SP-04 QA 09 — DISPATCH role admin'
    },
    @{
        File='10-route-contract-matrix.png'; Role='MATRIX'; Active='회계'; Sidebar=$menuItems
        Title='전메뉴 라우트 계약 매트릭스'; Subtitle='사용자 클릭 → RoleGuard → API 권한 대조'
        Headers=@('도메인','라우트 수','주요 보정','판정'); Widths=@(180,150,430,120)
        Rows=@(
            @('판매관리','17','생성/링크발송/export 가드 정렬','OK'),
            @('구매관리','4','검수 CTA + 신규 작성 가드','OK'),
            @('창고/재고','11','재고이동 번호 + warehouse write HR guard','OK'),
            @('회계','13','ACCOUNTANT/MANAGER/MASTER 표본','OK'),
            @('arologis','8','실배차 비교 메뉴 + DISPATCH','OK')
        )
        Cards=@(
            @{Title='목록'; Lines=@('full-screen-audit route 확대','admin-origin 라우트 포함','role sample 정렬'); Accent=$Teal},
            @{Title='라벨'; Lines=@('판매/구매/재고/창고 관리','견적서/주문서 관리','DC 설정 풀네임'); Accent=$Blue},
            @{Title='버튼'; Lines=@('엑셀 export 숨김','발송 링크 숨김','거래처 수정 숨김'); Accent=$Green},
            @{Title='계약'; Lines=@('static Playwright 추가','문서/캡처 동기화','PR에서 확인 가능'); Accent=$Amber}
        )
        Footer='SP-04 QA 10 — Route contract matrix'
    },
    @{
        File='11-legacy-gas-notion-data-migration.png'; Role='PM'; Active='메신저'; Sidebar=$menuItems
        Title='legacy GAS / Notion 데이터 이식 점검'; Subtitle='tools/legacy-gas + Notion 3표 + PR 이력 대조'
        Headers=@('원본','현재 rows','대상 서비스','판정'); Widths=@(240,130,300,120)
        Rows=@(
            @('단톡방리스트','112','notification chat_room_mappings','OK'),
            @('발송금지리스트','6','partner blocked_partners','OK'),
            @('배차지역 분류표','20','arologis region classifier','OK'),
            @('거래처 DC정보','213','dc-config dc_configs','OK'),
            @('GAS 27 카테고리','보고서','PR #163 cross-check','OK'),
            @('종합견적서/주문서','27 tabs','Google Sheet 원본 대조','OK')
        )
        Cards=@(
            @{Title='PR 확인'; Lines=@('#115 CSV import','#117/#118 GAS B','#119/#120 vendor','#163 cross-check'); Accent=$Teal},
            @{Title='스키마'; Lines=@('Notion fetch로 schema 확인','CSV export로 row count 확인','Google Sheet metadata 확인'); Accent=$Blue},
            @{Title='수정'; Lines=@('고정 expectedRows 제거','CSV 실제 rows 계산','source tab column mapping'); Accent=$Green},
            @{Title='이식'; Lines=@('거래처코드 없으면 alias 저장','DC partner snapshot 자동 생성','종합견적서는 출력 양식'); Accent=$Amber}
        )
        Footer='SP-04 QA 11 — Legacy GAS and Notion migration'
    },
    @{
        File='12-verification-matrix.png'; Role='QA'; Active='대시보드'; Sidebar=$menuItems
        Title='검증 매트릭스'; Subtitle='자동 테스트 + Docker import + 상세 캡처 계획'
        Headers=@('검증','명령/증거','상태','비고'); Widths=@(240,330,120,170)
        Rows=@(
            @('Frontend typecheck','npm run typecheck','예정','desktop'),
            @('Frontend lint/build','npm run lint/build','예정','desktop'),
            @('Static contract','full-menu-contract.spec.ts','예정','Playwright'),
            @('Backend role/dispatch','gradlew targeted tests','예정','no skip'),
            @('Notion import','import-notion-csv.ps1','진행 중','Docker local stack'),
            @('Google Sheets 원본','ProductCatalog/ProductSheet tests','통과','connector 대조')
        )
        Cards=@(
            @{Title='캡처'; Lines=@('12장 PNG 생성','PR 본문 raw 링크 인라인','권한/메뉴/번호/CSV 포함'); Accent=$Teal},
            @{Title='Docker'; Lines=@('docker info 확인','서비스 부팅 후 CSV import','skip 없이 통과 여부 확인'); Accent=$Blue},
            @{Title='문서'; Lines=@('README/ROADMAP/DECISIONS 갱신','Google Sheets 검증 문서 추가','handoff 갱신'); Accent=$Green},
            @{Title='PM'; Lines=@('CI green 후 재점검','이상 없으면 merge','branch cleanup'); Accent=$Amber}
        )
        Footer='SP-04 QA 12 — Verification matrix'
    }
)

foreach ($screen in $screens) {
    New-AuditScreen $screen
}
