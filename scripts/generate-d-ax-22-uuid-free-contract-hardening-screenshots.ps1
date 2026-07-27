$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\d-ax-22-uuid-free-contract-hardening\screenshots'
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

function Draw-Badge($Graphics, [string]$Text, [int]$X, [int]$Y, $Fill, $TextColor) {
    Draw-Rect $Graphics $X $Y 150 30 $Fill $Fill
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
    Draw-Badge $g 'D-AX22' 1010 30 $Teal ([System.Drawing.Color]::White)

    $positions = @(
        @{ X = 40; Y = 126; W = 540; H = 230 },
        @{ X = 620; Y = 126; W = 540; H = 230 },
        @{ X = 40; Y = 386; W = 540; H = 250 },
        @{ X = 620; Y = 386; W = 540; H = 250 }
    )
    for ($i = 0; $i -lt $Cards.Count; $i++) {
        $p = $positions[$i]
        $c = $Cards[$i]
        Draw-Card $g $p.X $p.Y $p.W $p.H $c.Title $c.Lines $c.Accent
    }

    Draw-Text $g $Footer 40 706 14 $Muted
    $Path = Join-Path $OutDir $FileName
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $Path"
}

$slides = @(
    @{
        File = '01-driver-today-target-contract.png'
        Title = 'Today target 계약'
        Subtitle = '기사 앱은 내부 PK 대신 배차유형, 차량순번, 정차순번, 카카오 순번으로 정차를 지정한다.'
        Cards = @(
            @{ Title='공개 target'; Lines=@('dispatchType = NIGHT', 'vehicleSequence = 1', 'stopSequence = 1', 'parsedKakaoSeq = 1234'); Accent=$Teal },
            @{ Title='숨김 영역'; Lines=@('배차 내부키 비공개', '차량 내부키 비공개', '정차 내부키 비공개', '기사 내부키 비공개'); Accent=$Red },
            @{ Title='업무번호 원칙'; Lines=@('전표번호 = YYYY/MM/DD-순번', '순번은 메뉴/업무 속성별 scope', '판매 1번과 구매 1번은 공존 가능'); Accent=$Blue },
            @{ Title='검증'; Lines=@('MockMvc body scan', '모바일 normalize test', 'QA 캡처 privacy guard'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 01 - UUID PK 는 내부 정합성용, 기사-facing target 은 공개 sequence 만 사용'
    },
    @{
        File = '02-admin-visible-contract-no-uuid.png'
        Title = '운영자 표시 계약'
        Subtitle = '관리 화면과 PR 캡처에는 전표번호, 거래처명, 상태, 마스킹 연락처만 표시한다.'
        Cards = @(
            @{ Title='표시 필드'; Lines=@('2026/05/16-1', '삼한공조 시스템', '배송 완료', '010-****-1234'); Accent=$Teal },
            @{ Title='비표시 필드'; Lines=@('내부 PK', '원본 파일 주소', '저장소 객체 경로', '서명 내부키'); Accent=$Red },
            @{ Title='데스크톱 guard'; Lines=@('typecheck 접근 금지', 'lint/build 통과', '화면 text scan 준비'); Accent=$Violet },
            @{ Title='모바일 guard'; Lines=@('Jest UI tree scan', 'toast/accessibility 검증', '공유 파일명 검증'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 02 - 화면과 접근성 라벨까지 내부 식별자 비노출'
    },
    @{
        File = '03-source-warehouse-slip-detail.png'
        Title = '전표 상세 창고명 fallback'
        Subtitle = 'slip-service full detail 은 창고 UUID 문자열을 sourceWarehouseName 으로 내려보내지 않는다.'
        Cards = @(
            @{ Title='문제 차단'; Lines=@('sourceWarehouseId 문자열화 금지', '창고명 lookup 없는 경로 보정', '중립 표시명으로 fallback'); Accent=$Red },
            @{ Title='응답 예시'; Lines=@('slipNo: 2026/05/16-1', 'partnerName: 거래처명', 'sourceWarehouseName: 창고명 확인 필요'); Accent=$Teal },
            @{ Title='테스트'; Lines=@('sourceWarehouseId fixture 생성', 'full detail API 호출', 'UUID regex 불일치 assertion'); Accent=$Blue },
            @{ Title='사용자 원칙'; Lines=@('UUID 는 숨김 PK', '복구/이력은 audit 로 보존', '표시는 업무번호와 표시명만'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 03 - 창고명은 사용자 표시명이며 내부키 fallback 이 아니다'
    },
    @{
        File = '04-gps-response-uuid-free.png'
        Title = 'GPS 보고 응답 hardening'
        Subtitle = '위치 저장 성공 후 기사 앱 응답에는 성공 여부, 시각, source 만 남긴다.'
        Cards = @(
            @{ Title='요청'; Lines=@('latitude / longitude', 'capturedAt', 'source = APP_GPS_BACKGROUND', 'JWT 기사 권한'); Accent=$Blue },
            @{ Title='응답'; Lines=@('accepted = true', 'capturedAt 유지', 'source 유지', '내부 위치키 없음'); Accent=$Teal },
            @{ Title='테스트'; Lines=@('ArologisDriverAppControllerIT', 'body 문자열 scan', 'source fallback 확인'); Accent=$Green },
            @{ Title='UI'; Lines=@('성공 toast 는 시각 중심', '좌표 raw 값 화면 미표시', '내부키 파일명 미사용'); Accent=$Amber }
        )
        Footer = 'D-AX22 QA 04 - GPS row key 는 서버 저장용이며 driver-facing 응답에서 제거'
    },
    @{
        File = '05-sign-copy-success-uuid-free.png'
        Title = '서명 사본 성공 응답'
        Subtitle = '성공 시 PNG 와 마스킹 연락처만 공개하고, 서명 내부키는 header/body 모두 제거한다.'
        Cards = @(
            @{ Title='성공 응답'; Lines=@('HTTP 200 image/png', 'masked phone header', 'slip bridge 성공 header', '사본 발송 시각 header'); Accent=$Teal },
            @{ Title='제거'; Lines=@('서명 내부키 header 제거', '저장 경로 미공개', '원본 URL 미공개', '파일명은 target 기반'); Accent=$Red },
            @{ Title='모바일'; Lines=@('Share Sheet 캐시 파일명', 'toast 에 업무번호만 표시', '재시도 상태 보존'); Accent=$Blue },
            @{ Title='검증'; Lines=@('SignAndSendCopyIT', 'DriverSignatureScreen Jest', 'typecheck 접근 금지'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 05 - 성공 사본은 PNG 자체만 공유하고 내부 저장 식별자는 숨김'
    },
    @{
        File = '06-sign-copy-recipient-missing.png'
        Title = '인수자 번호 없음'
        Subtitle = '서명 저장은 성공하되 사본 발송은 JSON 원인 코드로만 응답한다.'
        Cards = @(
            @{ Title='응답'; Lines=@('copySent = false', 'reason = 번호 없음', 'slipBridged = true', 'renderer 미호출'); Accent=$Amber },
            @{ Title='비공개'; Lines=@('서명 내부키 없음', '저장 경로 없음', '원본 URL 없음', 'stack trace 없음'); Accent=$Red },
            @{ Title='기사 UI'; Lines=@('번호 확인 안내', '재시도 버튼 없음', '업무번호/거래처만 표시'); Accent=$Teal },
            @{ Title='테스트'; Lines=@('SignatureCopyMissingPhoneIT', 'JSON body scan', 'renderer never 호출 검증'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 06 - 실패 JSON 은 운영 사유만 남기고 내부 저장 정보를 숨김'
    },
    @{
        File = '07-sign-copy-renderer-retry.png'
        Title = '사본 renderer 재시도'
        Subtitle = 'timeout/error 는 재시도 가능 상태로 보여주되 내부 경로나 식별자를 드러내지 않는다.'
        Cards = @(
            @{ Title='1차 실패'; Lines=@('reason = 렌더링 지연', 'copySent = false', 'failure count 증가', '사본 시각 없음'); Accent=$Amber },
            @{ Title='2차 성공'; Lines=@('동일 target 재시도', 'PNG 생성', '마스킹 연락처 유지'); Accent=$Teal },
            @{ Title='비공개'; Lines=@('renderer path 미표시', '저장소 key 미표시', '서명 내부키 미표시'); Accent=$Red },
            @{ Title='테스트'; Lines=@('SignatureCopyRendererTimeoutIT', '재시도 성공 assertion', 'body scan assertion'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 07 - retry UX 는 상태만 공개하고 내부 경로를 숨김'
    },
    @{
        File = '08-mobile-ui-uuid-free-regression-matrix.png'
        Title = '모바일/데스크톱 회귀 매트릭스'
        Subtitle = 'API normalize, UI tree, typecheck, Docker backend test 를 한 번에 묶어 PR gate 로 둔다.'
        Cards = @(
            @{ Title='Backend'; Lines=@('slip-service 전체 테스트', 'arologis-service 전체 테스트', 'Docker TCP 환경 사용'); Accent=$Blue },
            @{ Title='Mobile'; Lines=@('Jest 전체 통과', 'typecheck 통과', 'Expo install check'); Accent=$Teal },
            @{ Title='Desktop'; Lines=@('typecheck 통과', 'lint warning 기존 3건', 'build 통과'); Accent=$Violet },
            @{ Title='PR 캡처'; Lines=@('PNG 8장', 'raw 링크 200 확인', '본문 인라인 첨부'); Accent=$Green }
        )
        Footer = 'D-AX22 QA 08 - PM gate: 코드, 문서, 캡처, CI 재점검 후 머지'
    }
)

foreach ($slide in $slides) {
    New-Slide $slide.File $slide.Title $slide.Subtitle $slide.Cards $slide.Footer
}
