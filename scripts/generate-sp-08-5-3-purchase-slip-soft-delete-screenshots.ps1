param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
if (-not $OutputDir) { $OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-5-3-purchase-slip-soft-delete\screenshots') }

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# UTF-16 BOM 회피: 한국어 문자는 \uXXXX unicode escape 로 기재 후 런타임 변환
# (memory feedback_powershell_utf8_writes 정책)
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
            if ($font.Name -eq $family -or
                $font.Name -eq "Malgun Gothic" -or
                $font.Name -eq $malgunKorean) {
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
$brushText   = [System.Drawing.Brushes]::Black
$brushMuted  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft     = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)
$penDanger   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(185, 28, 28), 1)

function Text {
    param($Graphics, [string]$Value, $Font, $Brush, [int]$X, [int]$Y)
    $Graphics.DrawString((U $Value), $Font, $Brush, $X, $Y)
}

function Badge {
    param($Graphics, [int]$X, [int]$Y, [string]$Value, [string]$Tone = "info")
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254); $fg = $brushBlue
    if ($Tone -eq "good")   { $bg = [System.Drawing.Color]::FromArgb(209, 250, 229); $fg = $brushGreen }
    if ($Tone -eq "danger") { $bg = [System.Drawing.Color]::FromArgb(254, 226, 226); $fg = $brushRed }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 148, 30)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $fg ($X + 14) ($Y + 8)
}

function Field {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [string]$Label, [string]$Value)
    Text $Graphics $Label $fontSmall $brushMuted $X $Y
    $rect = New-Object System.Drawing.Rectangle($X, ($Y + 22), $W, 38)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontBody $brushText ($X + 12) ($Y + 32)
}

function Canvas {
    param([string]$FileName, [string]$Title, [string]$Subtitle)
    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Text $g $Title    $fontTitle $brushText  44 34
    Text $g $Subtitle $fontBody  $brushMuted 46 76
    return @($bmp, $g, (Join-Path $OutputDir $FileName))
}

function Save {
    param($Bitmap, $Graphics, [string]$Path)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Graphics.Dispose()
    $Bitmap.Dispose()
    Write-Host "generated $Path"
}

# ──────────────────────────────────────────────────────────────────────────────
# Shot 1: 삭제 확인 Modal
# ──────────────────────────────────────────────────────────────────────────────
function Shot1 {
    $c    = Canvas "01-delete-confirm-modal.png" `
                   "매입 전표 삭제 확인" `
                   "DRAFT/SAVED 전표 삭제 확인 Modal (비즘니스 식별자만 표시)"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    # modal panel
    $panel = New-Object System.Drawing.Rectangle(290, 220, 700, 420)
    $g.FillRectangle([System.Drawing.Brushes]::White, $panel)
    $g.DrawRectangle($penBorder, $panel)

    # modal header
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))),
        (New-Object System.Drawing.Rectangle(290, 220, 700, 56))
    )
    Text $g "매입 전표 삭제" $fontHead $brushText 330 238

    # body
    Text $g "전표번호: " $fontBody $brushMuted 330 308
    Text $g "2026/05/18-1" $fontHead $brushBlue 430 306

    $g.DrawRectangle(
        $penDanger,
        (New-Object System.Drawing.Rectangle(330, 340, 600, 52))
    )
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 242, 242))),
        (New-Object System.Drawing.Rectangle(330, 340, 600, 52))
    )
    Text $g "⚠  삭제된 전표는 복구할 수 없습니다." `
         $fontBody $brushRed 352 358

    # footer buttons — No / Yes
    $btnNo = New-Object System.Drawing.Rectangle(470, 560, 160, 44)
    $g.FillRectangle([System.Drawing.Brushes]::White, $btnNo)
    $g.DrawRectangle($penBorder, $btnNo)
    Text $g "취소" $fontBody $brushMuted 536 570

    $btnYes = New-Object System.Drawing.Rectangle(650, 560, 160, 44)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 38, 38))),
        $btnYes
    )
    Text $g "삭제" $fontBody ([System.Drawing.Brushes]::White) 716 570

    # UUID 비공개 안내 footer
    Text $g "✓  사용자 화면에는 내부 UUID 미노출 — 전표번호만 표시" `
         $fontSmall $brushMuted 330 830

    Save $bmp $g $path
}

# ──────────────────────────────────────────────────────────────────────────────
# Shot 2: 422 검수 완료 차단 alert
# ──────────────────────────────────────────────────────────────────────────────
function Shot2 {
    $c    = Canvas "02-delete-inspection-completed-alert.png" `
                   "검수 완료 삭제 차단" `
                   "422 UNPROCESSABLE_ENTITY — SLIP_DELETE_INSPECTION_COMPLETED"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    # alert banner
    $banner = New-Object System.Drawing.Rectangle(190, 200, 900, 120)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 226, 226))),
        $banner
    )
    $g.DrawRectangle($penDanger, $banner)

    Badge $g 220 218 "422" "danger"
    Text $g "검수 진행 중이거나 완료된 매입 전표는 삭제할 수 없습니다." `
         $fontHead $brushRed 240 222
    Text $g "DRAFT / SAVED 상태의 전표만 삭제 가능합니다." `
         $fontBody $brushRed 240 260

    # slip info
    Field $g 220 370 300 "전표번호" "2026/05/18-1"
    Field $g 560 370 260 "거래처" "삼한공조"
    Field $g 220 460 200 "상태" "INSPECTING"

    $statusBox = New-Object System.Drawing.Rectangle(220, 482, 200, 38)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 243, 199))),
        $statusBox
    )
    $g.DrawRectangle($penBorder, $statusBox)
    Text $g "INSPECTING" $fontBody `
         (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 83, 9))) `
         232 492

    # policy note
    Text $g "ErrorCode: SLIP_DELETE_INSPECTION_COMPLETED (HTTP 422) — 도메인 deleteForPurchase() 내부 가드" `
         $fontSmall $brushMuted 220 720

    Save $bmp $g $path
}

# ──────────────────────────────────────────────────────────────────────────────
# Shot 3: 삭제 성공 + 목록 갱신 toast
# ──────────────────────────────────────────────────────────────────────────────
function Shot3 {
    $c    = Canvas "03-delete-success-redirect.png" `
                   "삭제 성공 후 리다이렉트" `
                   "200 OK — /purchases 목록 이동 + toast 안내"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    # simulated purchase list area
    $listPanel = New-Object System.Drawing.Rectangle(80, 130, 1120, 580)
    $g.FillRectangle([System.Drawing.Brushes]::White, $listPanel)
    $g.DrawRectangle($penBorder, $listPanel)

    Text $g "매입 전표 목록" $fontHead $brushText 120 160

    # column headers
    $g.DrawLine($penSoft, 80, 200, 1200, 200)
    Text $g "전표번호" $fontSmall $brushMuted 130 210
    Text $g "거래처" $fontSmall $brushMuted 340 210
    Text $g "상태" $fontSmall $brushMuted 600 210
    Text $g "전표일" $fontSmall $brushMuted 780 210
    Text $g "합계금액" $fontSmall $brushMuted 1000 210
    $g.DrawLine($penSoft, 80, 236, 1200, 236)

    # row 1 — remaining slip
    Text $g "2026/05/17-3" $fontBody $brushText 130 258
    Text $g "삼한공조" $fontBody $brushText 340 258
    Badge $g 590 252 "SAVED" "info"
    Text $g "2026-05-17" $fontBody $brushText 780 258
    Text $g "580,000원" $fontBody $brushText 1000 258
    $g.DrawLine($penSoft, 80, 284, 1200, 284)

    # row 2 — remaining slip
    Text $g "2026/05/16-1" $fontBody $brushText 130 306
    Text $g "삼한공조" $fontBody $brushText 340 306
    Badge $g 590 300 "CONFIRMED" "good"
    Text $g "2026-05-16" $fontBody $brushText 780 306
    Text $g "1,200,000원" $fontBody $brushText 1000 306
    $g.DrawLine($penSoft, 80, 332, 1200, 332)

    # deleted slip not in list (visual indication)
    Text $g "* 2026/05/18-1 전표 삭제 완료 — 목록에서 제거됨" `
         $fontSmall $brushMuted 130 360

    # toast notification (top right)
    $toast = New-Object System.Drawing.Rectangle(890, 770, 340, 60)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))),
        $toast
    )
    Text $g "✓  전표가 삭제되었습니다" `
         $fontBody ([System.Drawing.Brushes]::White) 916 788

    # UUID 비공개 안내
    Text $g "✓  리다이렉트 state.toast 메시지 — UUID 미포함" `
         $fontSmall $brushMuted 80 856

    Save $bmp $g $path
}

# ──────────────────────────────────────────────────────────────────────────────
# Shot 4: INVENTORY 권한 가드 (403)
# ──────────────────────────────────────────────────────────────────────────────
function Shot4 {
    $c    = Canvas "04-delete-permission-guard.png" `
                   "권한 가드 — INVENTORY 적용" `
                   "INVENTORY 역할은 삭제 버튼 비노출 + BE 403 차단"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]

    # slip detail card (no delete button)
    $detailPanel = New-Object System.Drawing.Rectangle(160, 160, 960, 420)
    $g.FillRectangle([System.Drawing.Brushes]::White, $detailPanel)
    $g.DrawRectangle($penBorder, $detailPanel)

    Text $g "매입 전표 상세" $fontHead $brushText 200 194

    Field $g 200 240 300 "전표번호" "2026/05/18-1"
    Field $g 540 240 280 "거래처" "삼한공조"

    $g.DrawLine($penSoft, 200, 340, 1080, 340)
    Badge $g 200 354 "DRAFT" "info"

    # toolbar — no delete button for INVENTORY
    $toolbar = New-Object System.Drawing.Rectangle(160, 616, 960, 60)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))),
        $toolbar
    )
    $g.DrawRectangle($penSoft, $toolbar)

    $btnList = New-Object System.Drawing.Rectangle(980, 626, 120, 38)
    $g.FillRectangle([System.Drawing.Brushes]::White, $btnList)
    $g.DrawRectangle($penBorder, $btnList)
    Text $g "목록으로" $fontSmall $brushMuted 1002 638

    # no delete button indicator
    $noDeleteBox = New-Object System.Drawing.Rectangle(280, 700, 720, 60)
    $g.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(249, 250, 251))),
        $noDeleteBox
    )
    $g.DrawRectangle($penSoft, $noDeleteBox)
    Text $g "삭제 버튼 미노출 — INVENTORY 역할은 canDirectDeletePurchase = false" `
         $fontSmall $brushMuted 308 722

    # BE 403 note
    Badge $g 240 800 "403" "danger"
    Text $g "허용 역할: WAREHOUSE / MANAGER / MASTER — @PreAuthorize" `
         $fontBody $brushRed 410 806
    Text $g "INVENTORY / SALES / ACCOUNTANT 직접 DELETE 호출 시 BE에서 403 차단" `
         $fontSmall $brushMuted 240 845

    Save $bmp $g $path
}

Shot1
Shot2
Shot3
Shot4

Write-Host "SP-08-5-3 QA mock screenshots generated."
Get-ChildItem $OutputDir -Filter *.png | Select-Object Name, Length
