$ErrorActionPreference = 'Stop'

$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\sp-01-partner-ui-menu-gap-audit\screenshots'
$OutDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Malgun Gothic'
$Ink = [System.Drawing.ColorTranslator]::FromHtml('#17212B')
$Muted = [System.Drawing.ColorTranslator]::FromHtml('#5B6675')
$Line = [System.Drawing.ColorTranslator]::FromHtml('#D8DEE7')
$Bg = [System.Drawing.ColorTranslator]::FromHtml('#F5F7FA')
$Card = [System.Drawing.Color]::White
$Teal = [System.Drawing.ColorTranslator]::FromHtml('#2A9D8F')
$Blue = [System.Drawing.ColorTranslator]::FromHtml('#2563EB')
$Green = [System.Drawing.ColorTranslator]::FromHtml('#16A34A')
$Amber = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
$Red = [System.Drawing.ColorTranslator]::FromHtml('#DC2626')
$Violet = [System.Drawing.ColorTranslator]::FromHtml('#7C3AED')

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
        Draw-Text $Graphics $line ($X + 22) $lineY 16 $Muted
        $lineY += 30
    }
}

function New-Screen([string]$FileName, [string]$Title, [string]$Subtitle, [string]$Role, [object[]]$Cards, [string]$Footer) {
    $W = 1280
    $H = 820
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    Draw-Rect $g 0 0 $W $H $Bg
    Draw-Rect $g 0 0 240 $H $Ink
    Draw-Text $g 'Samhan Public' 30 28 28 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $g '판매' 30 108 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    Draw-Text $g '판매조회' 44 142 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Rect $g 28 176 184 38 ([System.Drawing.ColorTranslator]::FromHtml('#1F3A3D')) $Teal
    Draw-Text $g '거래처 관리' 44 185 16 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $g '견적서' 44 226 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $g '주문서 조회' 44 260 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $g '발송금지 거래처' 44 294 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $g '인사 (대표실)' 30 366 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    Draw-Text $g '거래처 관리 quick link' 44 400 14 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))

    Draw-Text $g $Title 280 34 30 $Ink 'Bold'
    Draw-Text $g $Subtitle 282 72 15 $Muted
    Draw-Pill $g $Role 1080 34 150 $Teal ([System.Drawing.Color]::White)

    $positions = @(
        @{ X = 280; Y = 120; W = 440; H = 230 },
        @{ X = 760; Y = 120; W = 440; H = 230 },
        @{ X = 280; Y = 388; W = 440; H = 250 },
        @{ X = 760; Y = 388; W = 440; H = 250 }
    )
    for ($i = 0; $i -lt $Cards.Count; $i++) {
        $p = $positions[$i]
        $c = $Cards[$i]
        Draw-Card $g $p.X $p.Y $p.W $p.H $c.Title $c.Lines $c.Accent
    }

    Draw-Text $g $Footer 280 760 14 $Muted
    $Path = Join-Path $OutDir $FileName
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $Path"
}

$screens = @(
    @{
        File='01-sales-discoverability.png'; Role='SALES'; Title='SALES 거래처 관리 발견성'; Subtitle='판매 그룹에서 거래처 관리 entry 를 바로 찾고 공용 목록으로 이동한다.'
        Cards=@(
            @{ Title='사이드바'; Lines=@('판매 그룹에 거래처 관리 노출', 'data-testid = sidebar-sales-partners', 'disabled 아님'); Accent=$Teal },
            @{ Title='권한'; Lines=@('SALES / MANAGER / MASTER', 'WAREHOUSE / DISPATCH 숨김 또는 차단', 'Role 풀네임 표시'); Accent=$Blue },
            @{ Title='목록'; Lines=@('/admin/partners 공용 route', 'AdminLayout 대표실 가드 제외', '필터/테이블 즉시 표시'); Accent=$Green },
            @{ Title='UUID 가드'; Lines=@('partnerCode 중심 표시', '내부 id / UUID 텍스트 0건', 'raw key 노출 없음'); Accent=$Red }
        ); Footer='SP-01 QA 01 - SALES 가 거래처 등록/조회 흐름을 메뉴에서 발견 가능'
    },
    @{
        File='02-sales-create-success-return.png'; Role='SALES'; Title='SALES 신규 등록 성공 복귀'; Subtitle='영업 직원도 거래처 4탭 신규 등록 후 공용 목록으로 돌아온다.'
        Cards=@(
            @{ Title='입력'; Lines=@('거래처명: (주)SP01검증공조', '사업자번호: 123-45-67890', '유형: 고객'); Accent=$Teal },
            @{ Title='POST'; Lines=@('/api/v1/partners/full', '201 CREATED', 'partnerCode = P-SP01-0001'); Accent=$Blue },
            @{ Title='복귀'; Lines=@('/admin/partners', 'forbidden 미진입', '생성 거래처 표시'); Accent=$Green },
            @{ Title='비노출'; Lines=@('basic.id 없음', 'stack trace 없음', 'UUID regex 0건'); Accent=$Red }
        ); Footer='SP-01 QA 02 - 문서/FE/BE 모두 SALES 신규 등록 허용으로 정합'
    },
    @{
        File='03-manager-discoverability.png'; Role='MANAGER'; Title='MANAGER 거래처 경로'; Subtitle='매니저는 목록, 신규 등록, Excel 다운로드 경로를 한 화면에서 찾는다.'
        Cards=@(
            @{ Title='목록'; Lines=@('거래처 관리 제목', '검색 / 유형 / 상태 필터', '20건 페이지네이션'); Accent=$Teal },
            @{ Title='액션'; Lines=@('Excel 다운로드', '신규 등록 CTA', '행 클릭 상세 4탭'); Accent=$Blue },
            @{ Title='계약'; Lines=@('listAdminPartners', 'createPartnerFull', 'partnerCode path variable'); Accent=$Green },
            @{ Title='검증'; Lines=@('Playwright static contract PASS', 'desktop typecheck/lint/build', 'partner-service IT'); Accent=$Violet }
        ); Footer='SP-01 QA 03 - MANAGER 가 AdminLayout 없이 거래처 업무 수행'
    },
    @{
        File='04-create-validation-name.png'; Role='MANAGER'; Title='필수 거래처명 validation'; Subtitle='거래처명 공란 submit 은 탭 1에서 즉시 차단한다.'
        Cards=@(
            @{ Title='동작'; Lines=@('신규 등록 화면 진입', '거래처명 공란', '등록 클릭'); Accent=$Blue },
            @{ Title='기대'; Lines=@('탭 1 유지', '거래처명을 입력하세요.', 'network mutation 0건'); Accent=$Green },
            @{ Title='UX'; Lines=@('alert role 사용', '입력 위치 바로 확인', '한글 메시지'); Accent=$Teal },
            @{ Title='회귀 차단'; Lines=@('빈 name 저장 방지', 'backend 400 이전 차단', 'raw endpoint 미표시'); Accent=$Red }
        ); Footer='SP-01 QA 04 - 필수값 누락은 프론트에서 먼저 잡는다'
    },
    @{
        File='05-create-validation-bizno.png'; Role='MANAGER'; Title='사업자등록번호 validation'; Subtitle='000-00-00000 형식이 아니면 등록하지 않는다.'
        Cards=@(
            @{ Title='입력'; Lines=@('사업자번호: 1234567890', '거래처명 입력 완료', '등록 클릭'); Accent=$Blue },
            @{ Title='기대'; Lines=@('형식 오류 alert', '탭 1 유지', 'network mutation 0건'); Accent=$Green },
            @{ Title='데이터'; Lines=@('bizNo active unique', '중복은 backend 409', '정규화 후 저장'); Accent=$Teal },
            @{ Title='비노출'; Lines=@('내부 row id 없음', 'UUID 없음', 'stack trace 없음'); Accent=$Red }
        ); Footer='SP-01 QA 05 - 사업자번호 형식/중복 회귀 가드'
    },
    @{
        File='06-create-validation-discount.png'; Role='MANAGER'; Title='할인율 validation'; Subtitle='기본 할인율은 0~100 범위만 허용한다.'
        Cards=@(
            @{ Title='입력'; Lines=@('탭 2 단가/할인 정책', '기본 할인율 = 101', '등록 클릭'); Accent=$Blue },
            @{ Title='기대'; Lines=@('0~100 오류 메시지', '탭 2 활성', '저장 요청 없음'); Accent=$Green },
            @{ Title='DB 정합성'; Lines=@('basic_discount_rate >= 0', 'basic_discount_rate <= 100', '음수/초과 SQL 0 rows'); Accent=$Teal },
            @{ Title='권한'; Lines=@('SALES/MANAGER/MASTER 등록', '기존 거래처 수정은 후속 잠금 UX', 'scope 분리'); Accent=$Violet }
        ); Footer='SP-01 QA 06 - 할인율 범위는 UI와 DB 양쪽에서 보호'
    },
    @{
        File='07-create-validation-payment-term.png'; Role='MANAGER'; Title='결제 기간 validation'; Subtitle='결제 기간은 0 이상 정수로만 저장한다.'
        Cards=@(
            @{ Title='입력'; Lines=@('결제 기간 = -1', '탭 2 등록 클릭', 'creditLimit 공란 허용'); Accent=$Blue },
            @{ Title='기대'; Lines=@('0 이상 정수 오류', '저장 요청 없음', '한글 alert'); Accent=$Green },
            @{ Title='데이터'; Lines=@('payment_term_days >= 0', '현금 0 / 30일 / 60일', '범위 밖 SQL 0 rows'); Accent=$Teal },
            @{ Title='운영'; Lines=@('거래처별 결제 조건', '세금계산서/원장 후속 연계', 'UUID 비공개'); Accent=$Violet }
        ); Footer='SP-01 QA 07 - 결제 조건 입력값 회귀 가드'
    },
    @{
        File='08-create-validation-shipping.png'; Role='MANAGER'; Title='배송지 validation'; Subtitle='배송지를 추가하면 별칭과 주소가 필수다.'
        Cards=@(
            @{ Title='입력'; Lines=@('탭 3 배송지 추가', '별칭 또는 주소 공란', '등록 클릭'); Accent=$Blue },
            @{ Title='기대'; Lines=@('배송지 1 오류 메시지', '탭 3 활성', 'network mutation 0건'); Accent=$Green },
            @{ Title='정합성'; Lines=@('기본 배송지 최대 1개', 'radio UI', 'service layer unsetDefault'); Accent=$Teal },
            @{ Title='비노출'; Lines=@('addressId 화면 텍스트 금지', '삭제 path key 미표시', 'partnerCode만 표시'); Accent=$Red }
        ); Footer='SP-01 QA 08 - 배송지 필수값과 기본 배송지 단일성'
    },
    @{
        File='09-create-validation-contact.png'; Role='MANAGER'; Title='담당자 validation'; Subtitle='담당자를 추가하면 이름, 휴대전화, 주 담당자 1명이 필요하다.'
        Cards=@(
            @{ Title='입력'; Lines=@('탭 4 담당자 추가', '이름/휴대전화 공란', '주 담당자 미지정'); Accent=$Blue },
            @{ Title='기대'; Lines=@('담당자 validation alert', '탭 4 활성', '저장 요청 없음'); Accent=$Green },
            @{ Title='정합성'; Lines=@('주 담당자 최대 1명', 'radio UI', 'service layer unsetPrimary'); Accent=$Teal },
            @{ Title='비노출'; Lines=@('contactId 화면 텍스트 금지', 'UUID regex 0건', '담당자명 중심 표시'); Accent=$Red }
        ); Footer='SP-01 QA 09 - 담당자 필수값과 주 담당자 단일성'
    },
    @{
        File='10-manager-create-success-return.png'; Role='MANAGER'; Title='MANAGER 정상 등록'; Subtitle='정상 입력 후 201 응답과 공용 목록 복귀를 확인한다.'
        Cards=@(
            @{ Title='요청'; Lines=@('partnerCode: P-SP01-0001', 'name: (주)SP01검증공조', 'bizNo: 123-45-67890'); Accent=$Teal },
            @{ Title='응답'; Lines=@('201 CREATED', 'basic.partnerCode 표시', 'basic.id 없음'); Accent=$Green },
            @{ Title='복귀'; Lines=@('/admin/partners', 'forbidden 없음', '검색/테이블 표시'); Accent=$Blue },
            @{ Title='PR 대표 캡처'; Lines=@('본문 인라인 권장', 'raw URL 200 확인', 'image/png MIME 확인'); Accent=$Violet }
        ); Footer='SP-01 QA 10 - 대표 캡처 후보: MANAGER 등록 성공'
    },
    @{
        File='11-master-create-success-return.png'; Role='MASTER'; Title='MASTER 정상 등록'; Subtitle='대표실 여부와 무관하게 공용 거래처 관리 화면에서 신규 등록한다.'
        Cards=@(
            @{ Title='경로'; Lines=@('/admin/partners/new', 'RoleGuard = PARTNER_FULL_ROLES', 'AdminLayout 밖 route'); Accent=$Blue },
            @{ Title='응답'; Lines=@('201 CREATED', 'partnerCode/name 확인', '내부 id 없음'); Accent=$Green },
            @{ Title='복귀'; Lines=@('/admin/partners 공용 목록', '인사 셸 의존 없음', '테이블 행 표시'); Accent=$Teal },
            @{ Title='회귀'; Lines=@('MASTER 기존 quick link 유지', 'admin-nav-partners test id 유지', '라벨 = 거래처 관리'); Accent=$Violet }
        ); Footer='SP-01 QA 11 - MASTER 도 같은 공용 거래처 관리 흐름 사용'
    },
    @{
        File='12-master-adminlayout-quicklink.png'; Role='MASTER'; Title='대표실 quick link 회귀'; Subtitle='인사 셸의 거래처 quick link는 남기되 공용 화면으로 이동한다.'
        Cards=@(
            @{ Title='인사 셸'; Lines=@('신규 인사', '권한 조정', '부서', '단톡방 매핑'); Accent=$Teal },
            @{ Title='quick link'; Lines=@('admin-nav-partners 유지', '라벨 = 거래처 관리', 'to = /admin/partners'); Accent=$Blue },
            @{ Title='이동'; Lines=@('공용 목록으로 전환', 'SALES/MANAGER와 동일 화면', 'pageerror 0건'); Accent=$Green },
            @{ Title='의도'; Lines=@('거래처는 영업 도메인', '인사 메뉴 내부 용어 제거', 'discoverability 개선'); Accent=$Violet }
        ); Footer='SP-01 QA 12 - 대표실 인사 메뉴 회귀 없이 공용 거래처 화면 분리'
    },
    @{
        File='13-master-adminlayout-menu-set.png'; Role='MASTER'; Title='인사 메뉴 세트 유지'; Subtitle='거래처 공용 route 분리 후에도 기존 인사 메뉴 test id는 유지한다.'
        Cards=@(
            @{ Title='유지'; Lines=@('admin-nav-users-new', 'admin-nav-roles', 'admin-nav-departments'); Accent=$Teal },
            @{ Title='유지'; Lines=@('admin-nav-chat-rooms', 'admin-nav-dc-config', 'admin-nav-warehouses'); Accent=$Blue },
            @{ Title='변경'; Lines=@('admin-nav-partners 라벨', '거래처 마스터 -> 거래처 관리', 'test id 유지'); Accent=$Amber },
            @{ Title='검증'; Lines=@('AdminLayout smoke', 'Forbidden guard 유지', '대표실 조건 유지'); Accent=$Green }
        ); Footer='SP-01 QA 13 - 기존 인사 셸 회귀 없음'
    },
    @{
        File='14-uuid-hidden-assertions.png'; Role='ALL'; Title='UUID 비공개 회귀 매트릭스'; Subtitle='모든 거래처 UI와 캡처는 업무 식별자만 표시한다.'
        Cards=@(
            @{ Title='허용'; Lines=@('partnerCode', 'name', 'bizNo', 'phone'); Accent=$Green },
            @{ Title='금지'; Lines=@('partnerId', 'addressId', 'contactId', 'UUID regex'); Accent=$Red },
            @{ Title='테스트'; Lines=@('MockMvc id doesNotExist', 'Playwright body text scan', 'PR 캡처 금지어 rg'); Accent=$Blue },
            @{ Title='업무번호'; Lines=@('전표/배차 = YYYY/MM/DD-순번', '순번은 메뉴별 scope', 'UUID는 내부 PK'); Accent=$Violet }
        ); Footer='SP-01 QA 14 - UUID PK 는 복구/이력용, 화면은 업무 식별자만'
    }
)

foreach ($screen in $screens) {
    New-Screen $screen.File $screen.Title $screen.Subtitle $screen.Role $screen.Cards $screen.Footer
}
