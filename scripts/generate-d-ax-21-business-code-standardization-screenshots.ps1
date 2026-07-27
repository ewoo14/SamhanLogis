$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\d-ax-21-business-code-standardization\screenshots'
$OutDir = Resolve-QaShotsDir -CommittedDir $CommittedDir
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Malgun Gothic'
$Teal = [System.Drawing.ColorTranslator]::FromHtml('#2A9D8F')
$TealDark = [System.Drawing.ColorTranslator]::FromHtml('#1B665C')
$Ink = [System.Drawing.ColorTranslator]::FromHtml('#17212B')
$Muted = [System.Drawing.ColorTranslator]::FromHtml('#5B6675')
$Line = [System.Drawing.ColorTranslator]::FromHtml('#D8DEE7')
$Bg = [System.Drawing.ColorTranslator]::FromHtml('#F5F7FA')
$Card = [System.Drawing.Color]::White
$Green = [System.Drawing.ColorTranslator]::FromHtml('#16A34A')
$Amber = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
$Blue = [System.Drawing.ColorTranslator]::FromHtml('#2563EB')
$Red = [System.Drawing.ColorTranslator]::FromHtml('#DC2626')

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

function Draw-Badge($Graphics, [string]$Text, [int]$X, [int]$Y, $Fill, $TextColor) {
    Draw-Rect $Graphics $X $Y 160 30 $Fill $Fill
    Draw-Text $Graphics $Text ($X + 14) ($Y + 6) 14 $TextColor 'Bold'
}

function Draw-Card($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Title, [string[]]$Lines, $Accent = $Teal) {
    Draw-Rect $Graphics $X $Y $W $H $Card $Line
    Draw-Rect $Graphics $X $Y 6 $H $Accent $Accent
    Draw-Text $Graphics $Title ($X + 22) ($Y + 18) 20 $Ink 'Bold'
    $lineY = $Y + 58
    foreach ($line in $Lines) {
        Draw-Text $Graphics $line ($X + 22) $lineY 16 $Muted
        $lineY += 31
    }
}

function New-Slide([string]$FileName, [string]$Title, [string]$Subtitle, [object[]]$Cards, [string]$Footer) {
    $W = 1200
    $H = 760
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Draw-Rect $g 0 0 $W $H $Bg
    Draw-Rect $g 0 0 $W 94 $Ink
    Draw-Text $g $Title 40 24 30 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $g $Subtitle 42 61 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Badge $g 'D-AX21' 1010 30 $Teal ([System.Drawing.Color]::White)

    $positions = @(
        @{ X = 40; Y = 126; W = 540; H = 230 },
        @{ X = 620; Y = 126; W = 540; H = 230 },
        @{ X = 40; Y = 386; W = 540; H = 250 },
        @{ X = 620; Y = 386; W = 540; H = 250 }
    )
    for ($i = 0; $i -lt $Cards.Count; $i++) {
        $p = $positions[$i]
        $accent = if ($Cards[$i].Accent) { $Cards[$i].Accent } else { $Teal }
        Draw-Card $g $p.X $p.Y $p.W $p.H $Cards[$i].Title $Cards[$i].Lines $accent
    }

    Draw-Rect $g 40 666 1120 50 ([System.Drawing.ColorTranslator]::FromHtml('#EAF7F4')) ([System.Drawing.ColorTranslator]::FromHtml('#B8E3DB'))
    Draw-Text $g $Footer 58 681 17 $TealDark 'Bold'

    $path = Join-Path $OutDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $path"
}

$slides = @(
    @{
        File = '01-business-number-scope-policy.png'
        Title = '업무번호 범위 정책'
        Subtitle = '전표번호는 전역 unique가 아니라 메뉴/업무 속성별 날짜 시퀀스입니다.'
        Footer = '판매전표 2026/05/16-1 과 구매전표 2026/05/16-1 은 동시에 존재 가능, 내부 구분은 UUID PK + slip_type.'
        Cards = @(
            @{ Title = '개발책임자 최신 결정'; Accent = $Teal; Lines = @('UUID는 숨겨진 내부 PK', '공개번호는 YYYY/MM/DD-{순번}', '판매/구매/배차 등 업무별 독립 증가', '같은 날짜 같은 순번의 업무 간 중복 허용') },
            @{ Title = '금지된 해석'; Accent = $Red; Lines = @('전역 공개번호 unique 요구 아님', 'SL-2026, S-2026, DT- prefix 폐기', '3자리 padding 고정 폐기', '화면/URL에 내부 UUID 노출 금지') },
            @{ Title = '사용자 표시 예시'; Accent = $Blue; Lines = @('판매전표: 2026/05/16-1', '구매전표: 2026/05/16-1', '배차번호: 2026/05/16-1', '메뉴명이 다르면 같은 번호 허용') },
            @{ Title = '복구/이력 원칙'; Accent = $Amber; Lines = @('soft-delete와 audit 이력을 유지', '복구 시 기존 UUID와 상태 보존', '복구하지 않으면 해당 날짜 마지막 순번 이후', '업무번호는 사람이 보는 식별자') }
        )
    },
    @{
        File = '02-slip-sequence-contract.png'
        Title = 'SlipNumberService 계약'
        Subtitle = '날짜 + SlipType 단위로 sequence를 조회/생성/증가합니다.'
        Footer = '단위 테스트: OUTBOUND 2026/05/04-1, INBOUND 2026/05/04-1 동시 허용 케이스 추가.'
        Cards = @(
            @{ Title = '신규 API'; Accent = $Teal; Lines = @('next(LocalDate, SlipType)', '기존 next(LocalDate)는 OUTBOUND 호환 경로', 'format = yyyy/MM/dd-N', 'extractSeqNo는 마지막 dash 뒤 숫자 파싱') },
            @{ Title = 'Repository'; Accent = $Blue; Lines = @('findBySlipDateAndSlipType(date, type)', 'findBySlipDate 단독 조회 제거', '시퀀스 생성도 SlipType 필수', '동일 날짜 다른 유형은 다른 row') },
            @{ Title = 'DB 보강'; Accent = $Amber; Lines = @('slip_number_sequences.slip_type 추가', 'UNIQUE(slip_date, slip_type)', 'slips unique = slip_type + slip_no + active', '기존 slip_date 단독 unique drop') },
            @{ Title = '호출자 정렬'; Accent = $Green; Lines = @('SlipService.create(req.slipType)', 'PublishSlipResponse OUTBOUND 명시', 'Estimate/PartnerOrder 변환 OUTBOUND 명시', 'Mobile partner order OUTBOUND 명시') }
        )
    },
    @{
        File = '03-sales-purchase-duplicate-matrix.png'
        Title = '판매/구매 중복 허용 검증'
        Subtitle = '같은 날짜 같은 공개번호가 다른 메뉴에서는 정상 데이터입니다.'
        Footer = '중복 판정은 slip_no 단독이 아니라 slip_type + slip_no 조합으로 수행합니다.'
        Cards = @(
            @{ Title = '판매전표 row'; Accent = $Blue; Lines = @('slip_type = OUTBOUND', 'slip_no = 2026/05/07-1', 'seq_no = 1', '화면: 판매 메뉴에서만 조회') },
            @{ Title = '구매전표 row'; Accent = $Amber; Lines = @('slip_type = INBOUND', 'slip_no = 2026/05/07-1', 'seq_no = 1', '화면: 구매 메뉴에서만 조회') },
            @{ Title = '조회 원칙'; Accent = $Teal; Lines = @('공개 endpoint는 업무 context를 함께 사용', '첨부 공개 조회는 OUTBOUND 명시', 'Admin 목록은 slipType column 포함', '복구는 UUID PK 기준') },
            @{ Title = '회귀 테스트'; Accent = $Green; Lines = @('SlipNumberServiceTest 타입 독립성', 'SlipNumberServiceIT 타입 독립성', 'SlipServiceTest 타입별 채번 mock', 'SlipSeeder 타입별 seq map') }
        )
    },
    @{
        File = '04-dispatch-number-standard.png'
        Title = '배차번호 표준화'
        Subtitle = '배차 작업 코드도 전표번호와 같은 공개 형식으로 통일했습니다.'
        Footer = '배차 도메인의 내부 id는 그대로 UUID이며, 기사/사무실 화면에는 taskCode만 표시합니다.'
        Cards = @(
            @{ Title = '이전 형식'; Accent = $Red; Lines = @('DT-YYYYMMDD-NNN 폐기', '임시 test code DT-x 제거', '문서 주석의 DT 예시 제거', 'zero padding 의존 제거') },
            @{ Title = '신규 형식'; Accent = $Teal; Lines = @('2026/05/14-1', '2026/05/14-2', '날짜별 증가', 'dispatch_task.task_code는 공개 식별자') },
            @{ Title = '프론트 표기'; Accent = $Blue; Lines = @('desktop dispatchTask 주석 갱신', 'dispatchBoard slipNumber 예시 갱신', '수정 요청 placeholder 갱신', '모바일 fixture도 새 전표번호로 갱신') },
            @{ Title = '테스트'; Accent = $Green; Lines = @('DispatchTaskServiceTest 신규 형식', 'DispatchTaskTest 신규 형식', 'DispatchEndToEndIT prefix 갱신', 'ArologisDispatchClientTest 갱신') }
        )
    },
    @{
        File = '05-seed-and-cross-service-flow.png'
        Title = '시드와 연동 데이터 흐름'
        Subtitle = '로컬/dev 시드와 알림/주문 연동 샘플도 새 형식으로 맞췄습니다.'
        Footer = 'seed fixture는 운영 코드가 아니지만 QA 화면의 기준 데이터가 되므로 함께 정리했습니다.'
        Cards = @(
            @{ Title = 'SlipSeeder'; Accent = $Teal; Lines = @('SequenceKey = slipDate + slipType', 'formatSlipNo = yyyy/MM/dd-N', 'idempotency = type + slipNo', 'UUID 대신 partnerCode/productCode 표시') },
            @{ Title = 'PartnerOrderSeeder'; Accent = $Blue; Lines = @('PUBLISHED slipNo = 2026/04/15-N', '3자리 zfill 제거', '주문번호 PO는 별도 도메인 형식 유지', 'cross-service sample만 표준화') },
            @{ Title = 'NotificationSeeder'; Accent = $Amber; Lines = @('payload slipNo = 2026/05/DD-N', '본문 token도 padding 제거', 'actor는 loginId로 표시', '알림 예시의 SL prefix 제거') },
            @{ Title = 'Arologis copy/detail'; Accent = $Green; Lines = @('기사 전표 상세 fixture 갱신', 'PNG copy renderer fixture 갱신', '응답 JSON에서 내부 id 제거 유지', 'downloadUrl 노출 금지 회귀 유지') }
        )
    },
    @{
        File = '06-docker-backend-verification.png'
        Title = 'Docker 백엔드 검증'
        Subtitle = 'Windows 로컬 JDK 편차를 피하고 Docker JDK 17에서 Gradle 테스트를 실행했습니다.'
        Footer = '새 skip은 추가하지 않았고, 기존 Testcontainers skip debt는 D-AX24 no-skip hardening 후보로 유지합니다.'
        Cards = @(
            @{ Title = 'Targeted RED/Green'; Accent = $Green; Lines = @('초기 RED: 12 tests / 6 failed', '구식 001 padding과 DT prefix 확인', '수정 후 targeted test PASS', 'SlipNumber + SlipService + DispatchTask') },
            @{ Title = 'slip-service 전체'; Accent = $Teal; Lines = @('Docker JDK 17', ':services:slip-service:test', '463 tests / 0 failures / 0 errors', '기존 skipped 172 확인') },
            @{ Title = 'arologis-service 전체'; Accent = $Blue; Lines = @('Docker JDK 17', ':services:arologis-service:test', '236 tests / 0 failures / 0 errors', '기존 skipped 75 확인') },
            @{ Title = '해석'; Accent = $Amber; Lines = @('skip은 이번 PR 신규 추가 아님', 'V24 PostgreSQL smoke PASS', 'Testcontainers provider skip은 별도 debt', 'PR 본문에 skip debt 명시') }
        )
    },
    @{
        File = '07-client-and-ci-verification.png'
        Title = '클라이언트와 CI 문법 검증'
        Subtitle = '모바일/데스크톱 계약과 GitHub Actions YAML을 함께 확인했습니다.'
        Footer = 'workflow parse 오류는 다음 CI 신뢰성을 막는 P0라 본 PR에 최소 수정으로 포함했습니다.'
        Cards = @(
            @{ Title = 'Arologis Mobile'; Accent = $Green; Lines = @('Jest 2 suites PASS', '8 tests PASS', 'DriverSlipDetailScreen 새 slipNo', 'tsc --noEmit PASS') },
            @{ Title = 'Desktop'; Accent = $Blue; Lines = @('npm run typecheck PASS', 'dispatchBoard/dispatchTask 주석 갱신', '수정 요청 placeholder 갱신', '실 UI 로직 변경 없음') },
            @{ Title = 'actionlint'; Accent = $Teal; Lines = @('arologis-ci step name quote', 'nightly issue body-file 변환', 'SA rotation body-file 변환', 'arologis-deploy shellcheck 정리') },
            @{ Title = '결과'; Accent = $Green; Lines = @('actionlint .github/workflows/*.yml PASS', 'YAML syntax PASS', 'shellcheck warning 0', '다음 PR CI 실행 가능성 회복') }
        )
    },
    @{
        File = '08-pr-capture-checklist.png'
        Title = 'PR 캡처 체크리스트'
        Subtitle = 'PR 본문에 raw GitHub URL로 인라인 표시할 상세 캡처 목록입니다.'
        Footer = '모든 캡처는 1200px 폭 PNG이며, raw URL HEAD 200 검사를 PR 발행 후 수행합니다.'
        Cards = @(
            @{ Title = '정책 캡처'; Accent = $Teal; Lines = @('01 범위 정책', '02 SlipNumber 계약', '03 판매/구매 중복 허용', '04 배차번호 표준') },
            @{ Title = '데이터/검증 캡처'; Accent = $Blue; Lines = @('05 시드와 연동 흐름', '06 Docker 백엔드 검증', '07 클라이언트와 CI 검증', '08 PR 캡처 체크리스트') },
            @{ Title = '비공개 가드'; Accent = $Amber; Lines = @('실제 UUID 값 없음', 'downloadUrl 없음', 'SL/DT legacy 예시 없음', '업무번호만 표시') },
            @{ Title = 'PM gate'; Accent = $Green; Lines = @('5-agent 감사 반영', 'Docker 테스트 반영', 'actionlint 반영', 'CI green 후 재점검/머지') }
        )
    }
)

foreach ($slide in $slides) {
    New-Slide $slide.File $slide.Title $slide.Subtitle $slide.Cards $slide.Footer
}
