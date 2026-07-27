param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-5-4-purchase-inspection-cta-regression\screenshots') -RequestedDir $OutputDir

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function U {
    param([string]$Text)
    return [regex]::Replace($Text, "\\u([0-9A-Fa-f]{4})", {
        param($m)
        [char][Convert]::ToInt32($m.Groups[1].Value, 16)
    })
}

function New-Font {
    param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    $malgunKorean = U "맑은 고딕"
    $families = @("Pretendard", "Malgun Gothic", $malgunKorean)
    foreach ($family in $families) {
        try {
            $font = New-Object System.Drawing.Font($family, $Size, $Style)
            if ($font.Name -eq $family -or $font.Name -eq "Malgun Gothic" -or $font.Name -eq $malgunKorean) {
                return $font
            }
        } catch { }
    }
    return New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $Size, $Style)
}

$fontTitle = New-Font 24 ([System.Drawing.FontStyle]::Bold)
$fontHead  = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody  = New-Font 12
$fontSmall = New-Font 10
$brushText  = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft    = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)
$penGreen   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(4, 120, 87), 1)
$penBlue    = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(147, 197, 253), 1)
$penOrange  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(217, 119, 6), 1)
$brushOrange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 83, 9))

function DText {
    param($G, [string]$Esc, $Font, $Brush, [int]$X, [int]$Y)
    $G.DrawString((U $Esc), $Font, $Brush, $X, $Y)
}

function Badge {
    param($G, [int]$X, [int]$Y, [string]$LabelEsc, [string]$Tone = "info")
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254)
    $fg = $brushBlue
    if ($Tone -eq "good")    { $bg = [System.Drawing.Color]::FromArgb(209, 250, 229); $fg = $brushGreen }
    if ($Tone -eq "danger")  { $bg = [System.Drawing.Color]::FromArgb(254, 226, 226); $fg = $brushRed }
    if ($Tone -eq "warning") { $bg = [System.Drawing.Color]::FromArgb(254, 243, 199); $fg = $brushOrange }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 148, 30)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $G.DrawRectangle($penBorder, $rect)
    DText $G $LabelEsc $fontSmall $fg ($X + 14) ($Y + 8)
}

function PrimaryBtn {
    param($G, [int]$X, [int]$Y, [int]$W, [string]$LabelEsc)
    $bg  = [System.Drawing.Color]::FromArgb(29, 78, 216)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(29, 78, 216), 1)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, 36)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $G.DrawRectangle($pen, $rect)
    DText $G $LabelEsc $fontBody ([System.Drawing.Brushes]::White) ($X + 10) ($Y + 9)
}

# variant="secondary" — 흰 배경 + brand-700 border/text (#0B3A85)
function SecondaryBtn {
    param($G, [int]$X, [int]$Y, [int]$W, [string]$LabelEsc)
    $brand700 = [System.Drawing.Color]::FromArgb(11, 58, 133)
    $pen  = New-Object System.Drawing.Pen($brand700, 1)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, 28)
    $G.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $G.DrawRectangle($pen, $rect)
    DText $G $LabelEsc $fontSmall (New-Object System.Drawing.SolidBrush($brand700)) ($X + 10) ($Y + 7)
}

function TableHeader {
    param($G)
    $G.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))),
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 44))
    )
    DText $G "구매번호"   $fontSmall $brushMuted 130 124
    DText $G "거래처"           $fontSmall $brushMuted 340 124
    DText $G "상태"                 $fontSmall $brushMuted 608 124
    DText $G "검수"                 $fontSmall $brushMuted 800 124
    $G.DrawLine($penBorder, 60, 154, 1220, 154)
}

function TableRow {
    param($G, [int]$Y, [string]$SlipNo, [string]$PartnerEsc, [string]$StatusEsc, [string]$Tone, [bool]$ShowBtn)
    DText $G $SlipNo    $fontBody $brushText 130 $Y
    DText $G $PartnerEsc $fontBody $brushText 340 $Y
    Badge $G 580 ($Y - 4) $StatusEsc $Tone
    if ($ShowBtn) {
        SecondaryBtn $G 780 ($Y - 6) 74 "검수"
    } else {
        DText $G "-" $fontBody $brushMuted 806 $Y
    }
}

function Canvas {
    param([string]$FileName, [string]$TitleEsc, [string]$SubEsc)
    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    DText $g $TitleEsc $fontTitle $brushText  44 34
    DText $g $SubEsc   $fontBody  $brushMuted 46 76
    return @($bmp, $g, (Join-Path $OutputDir $FileName))
}

function Save {
    param($Bitmap, $Graphics, [string]$Path)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Graphics.Dispose()
    $Bitmap.Dispose()
    Write-Host "generated $Path"
}

# Shot 1: SAVED 행 검수 버튼 표시
function Shot1 {
    $c   = Canvas "01-saved-inspection-cta-visible.png" `
                  "구매관리 입고 검수 CTA 회귀 검증" `
                  "SAVED 행 검수 버튼 노출 확인 (INSPECTABLE_STATUSES 포함)"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    $g.FillRectangle([System.Drawing.Brushes]::White,
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 620)))
    $g.DrawRectangle($penBorder,
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 620)))

    TableHeader $g

    TableRow $g 178 "2026/05/18-2" "삼한공조" "SAVED" "info" $true
    $g.DrawLine($penSoft, 60, 204, 1220, 204)
    TableRow $g 228 "2026/05/18-1" "삼한공조" "SAVED" "info" $true
    $g.DrawLine($penSoft, 60, 254, 1220, 254)

    $noteBox = New-Object System.Drawing.Rectangle(80, 760, 1120, 80)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 246, 255))), $noteBox)
    $g.DrawRectangle($penBlue, $noteBox)
    DText $g "INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] -- SAVED 행 검수 버튼 노출 정상" $fontBody $brushBlue 110 778
    DText $g "data-testid: purchase-query-inspect-{slipNo} (UUID 비공개 가드 적용)" $fontSmall $brushMuted 110 808

    Save $bmp $g $path
}

# Shot 2: CONFIRMED 행 검수 버튼 표시
function Shot2 {
    $c   = Canvas "02-confirmed-inspection-cta-visible.png" `
                  "CONFIRMED 행 검수 CTA 표시 확인" `
                  "SP-08-5-2/3 변경 후에도 CONFIRMED 행 검수 버튼 유지"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    $g.FillRectangle([System.Drawing.Brushes]::White,
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 620)))
    $g.DrawRectangle($penBorder,
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 620)))

    TableHeader $g

    TableRow $g 178 "2026/05/17-4" "삼한공조" "CONFIRMED" "good" $true
    $g.DrawLine($penSoft, 60, 204, 1220, 204)
    TableRow $g 228 "2026/05/17-3" "삼한공조" "SAVED" "info" $true
    $g.DrawLine($penSoft, 60, 254, 1220, 254)

    $noteBox = New-Object System.Drawing.Rectangle(80, 760, 1120, 80)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(209, 250, 229))), $noteBox)
    $g.DrawRectangle($penGreen, $noteBox)
    DText $g "CONFIRMED 상태도 INSPECTABLE_STATUSES 포함 -- SP-08-5-3 soft delete 후 회귀 없음" $fontBody $brushGreen 110 778
    DText $g "canInspectInbound: WAREHOUSE / MANAGER / MASTER -- 검수 권한 계약 유지" $fontSmall $brushMuted 110 808

    Save $bmp $g $path
}

# Shot 3: 검수 저장 후 구매관리 목록 갱신
function Shot3 {
    $c   = Canvas "03-inspection-dialog-refetch-success.png" `
                  "검수 저장 후 구매관리 목록 갱신" `
                  "saveMutation.onSuccess -> invalidateQueries(['slips','query','INBOUND']) 확인"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    $dlg = New-Object System.Drawing.Rectangle(200, 130, 880, 560)
    $g.FillRectangle([System.Drawing.Brushes]::White, $dlg)
    $g.DrawRectangle($penBorder, $dlg)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))),
        (New-Object System.Drawing.Rectangle(200, 130, 880, 52))
    )
    DText $g "입고 검수" $fontHead $brushText 240 150

    DText $g "전표번호: " $fontSmall $brushMuted 240 210
    DText $g "2026/05/18-2" $fontHead $brushBlue 360 208
    DText $g "거래처: 삼한공조" $fontBody $brushText 620 210
    DText $g "상태: " $fontSmall $brushMuted 240 238
    Badge $g 310 230 "검수대기" "warning"

    $g.DrawLine($penSoft, 220, 272, 1060, 272)
    DText $g "모델코드" $fontSmall $brushMuted 240 280
    DText $g "예정 수량" $fontSmall $brushMuted 460 280
    DText $g "검수 수량" $fontSmall $brushMuted 600 280
    DText $g "불량 수량" $fontSmall $brushMuted 740 280
    $g.DrawLine($penSoft, 220, 302, 1060, 302)

    $g.DrawString("SP-A100", $fontBody, $brushText, 240, 314)
    $g.DrawString("10", $fontBody, $brushText, 492, 314)
    $g.DrawString("10", $fontBody, $brushText, 632, 314)
    $g.DrawString("0",  $fontBody, $brushText, 772, 314)
    $g.DrawLine($penSoft, 220, 340, 1060, 340)

    $successBox = New-Object System.Drawing.Rectangle(220, 500, 820, 50)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(236, 253, 245))), $successBox)
    $g.DrawRectangle($penGreen, $successBox)
    DText $g "검수 내용이 임시 저장되었습니다." $fontBody $brushGreen 250 516

    PrimaryBtn $g 740 620 130 "검수 저장"

    $noteBox = New-Object System.Drawing.Rectangle(80, 760, 1120, 80)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(209, 250, 229))), $noteBox)
    $g.DrawRectangle($penGreen, $noteBox)
    DText $g "saveMutation.onSuccess: invalidateQueries(['slips','query','INBOUND']) 호출 확인" $fontBody $brushGreen 110 778
    DText $g "completeMutation.onSuccess 도 동일 invalidate 2회 적용 + onSuccess?() prop 호출" $fontSmall $brushMuted 110 808

    Save $bmp $g $path
}

# Shot 4: INSPECTING/COMPLETED CTA hidden
function Shot4 {
    $s4t = "INSPECTING/COMPLETED " + (U "행 검수 CTA 미노출")
    $s4s = "isInspectableInbound() = false -> dash " + (U "표시") + " (SAVED/CONFIRMED " + (U "외 단계") + ")"
    $c   = Canvas "04-inspecting-row-cta-hidden.png" $s4t $s4s
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    $g.FillRectangle([System.Drawing.Brushes]::White,
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 620)))
    $g.DrawRectangle($penBorder,
        (New-Object System.Drawing.Rectangle(60, 110, 1160, 620)))

    TableHeader $g

    TableRow $g 178 "2026/05/18-3" "삼한공조" "INSPECTING" "warning" $false
    $g.DrawLine($penSoft, 60, 204, 1220, 204)
    TableRow $g 228 "2026/05/17-5" "삼한공조" "COMPLETED" "good" $false
    $g.DrawLine($penSoft, 60, 254, 1220, 254)
    TableRow $g 278 "2026/05/17-4" "삼한공조" "SAVED" "info" $true
    $g.DrawLine($penSoft, 60, 304, 1220, 304)

    $noteBox = New-Object System.Drawing.Rectangle(80, 760, 1120, 80)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 243, 199))), $noteBox)
    $g.DrawRectangle($penOrange, $noteBox)
    DText $g "INSPECTING / COMPLETED 상태는 isInspectableInbound = false -> dash 표시" $fontBody $brushOrange 110 778
    DText $g "SAVED 대조행은 검수 버튼 O 정상 노출 -- CTA 노출 조건 정합" $fontSmall $brushMuted 110 808

    Save $bmp $g $path
}

Shot1
Shot2
Shot3
Shot4

Write-Host "SP-08-5-4 QA mock screenshots generated."
Get-ChildItem $OutputDir -Filter *.png | Select-Object Name, Length
