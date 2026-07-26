param(
    [string]$OutputDir = $(if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { "docs/qa/sp-08-6-2-sales-slip-edit-put/screenshots/_local" })
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }
function U { param([string]$Text)
    return [regex]::Replace($Text, "\\u([0-9A-Fa-f]{4})", { param($m) [char][Convert]::ToInt32($m.Groups[1].Value, 16) }) }
function New-Font { param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    try { return New-Object System.Drawing.Font("Pretendard", $Size, $Style) } catch { return New-Object System.Drawing.Font("Malgun Gothic", $Size, $Style) } }
$fontTitle = New-Font 24 ([System.Drawing.FontStyle]::Bold)
$fontHead  = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody  = New-Font 12
$fontSmall = New-Font 10
$brushText  = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$brushAmber = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 83, 9))
$penBorder  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft    = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)
function Text { param($Graphics, [string]$Value, $Font, $Brush, [int]$X, [int]$Y)
    $Graphics.DrawString((U $Value), $Font, $Brush, $X, $Y) }
function Badge { param($Graphics, [int]$X, [int]$Y, [string]$Value, [string]$Tone)
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254); $fg = $brushBlue
    if ($Tone -eq "good")   { $bg = [System.Drawing.Color]::FromArgb(209, 250, 229); $fg = $brushGreen }
    if ($Tone -eq "danger") { $bg = [System.Drawing.Color]::FromArgb(254, 226, 226); $fg = $brushRed   }
    if ($Tone -eq "warn")   { $bg = [System.Drawing.Color]::FromArgb(254, 243, 199); $fg = $brushAmber }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 148, 30)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontSmall $fg ($X + 14) ($Y + 8) }
function InputBox { param($Graphics, [int]$X, [int]$Y, [int]$W, [string]$Label, [string]$Value)
    Text $Graphics $Label $fontSmall $brushMuted $X $Y
    $rect = New-Object System.Drawing.Rectangle($X, ($Y + 22), $W, 38)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    Text $Graphics $Value $fontBody $brushText ($X + 12) ($Y + 32) }
function Canvas { param([string]$FileName, [string]$Title, [string]$Subtitle)
    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Text $g $Title $fontTitle $brushText 44 34
    Text $g $Subtitle $fontBody $brushMuted 46 76
    return @($bmp, $g, (Join-Path $OutputDir $FileName)) }
function Save { param($Bitmap, $Graphics, [string]$Path)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Graphics.Dispose(); $Bitmap.Dispose()
    Write-Host "generated $Path" }
# Shot1
$c = Canvas "01-sales-edit-form.png" "매출 전표 수정" "주문번호·거래처·품목·단가·합계"
$bmp = $c[0]; $g = $c[1]; $path = $c[2]
$panel = New-Object System.Drawing.Rectangle(140, 126, 1000, 660)
$g.FillRectangle([System.Drawing.Brushes]::White, $panel)
$g.DrawRectangle($penBorder, $panel)
Text $g "매출 전표 수정" $fontHead $brushText 180 166
Badge $g 898 162 "저장완료" "good"
InputBox $g 180 230 210 "주문번호" "2026/05/18-2"
InputBox $g 420 230 260 "거래처" "삼한항공"
InputBox $g 710 230 250 "사업자번호" "202-81-36619"
InputBox $g 180 320 780 "비고" "입고 확인 후 단가 조정"
$g.DrawLine($penSoft, 180, 424, 1100, 424)
Text $g "품목" $fontSmall $brushMuted 200 460
Text $g "모델" $fontSmall $brushMuted 430 460
Text $g "수량" $fontSmall $brushMuted 650 460
Text $g "단가" $fontSmall $brushMuted 760 460
Text $g "합계" $fontSmall $brushMuted 930 460
Text $g "에어콘" $fontBody $brushText 200 504
Text $g "SALES-001" $fontBody $brushText 430 504
Text $g "5" $fontBody $brushText 650 504
Text $g "250,000원" $fontBody $brushText 760 504
Text $g "1,250,000원" $fontBody $brushText 930 504
Text $g "합계 1,250,000원" $fontHead $brushBlue 820 690
Save $bmp $g $path
# Shot2
$c = Canvas "02-sales-edit-conflict-banner.png" "낙관적 잠금 충돌" "409 응답 시 최신 내용 불러오기 안내"
$bmp = $c[0]; $g = $c[1]; $path = $c[2]
$banner = New-Object System.Drawing.Rectangle(164, 170, 952, 92)
$g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 226, 226))), $banner)
$g.DrawRectangle($penBorder, $banner)
Text $g "다른 사용자가 먼저 수정했습니다." $fontHead $brushRed 204 194
Text $g "최신 내용 불러오기 후 다시 저장해 주세요." $fontBody $brushRed 204 230
$button = New-Object System.Drawing.Rectangle(830, 198, 220, 38)
$g.FillRectangle([System.Drawing.Brushes]::White, $button)
$g.DrawRectangle($penBorder, $button)
Text $g "최신 내용 불러오기" $fontSmall $brushText 848 209
InputBox $g 180 330 260 "거래처" "삼한항공"
InputBox $g 470 330 260 "수정 요청 시각" "2026-05-18 09:14"
Badge $g 760 352 "409" "danger"
Text $g "사용자 화면에는 내부 UUID를 노출하지 않음" $fontSmall $brushMuted 180 720
Save $bmp $g $path
# Shot3
$c = Canvas "03-sales-edit-audit-timeline.png" "감사 이력" "SLIP_EDIT 1 revision 기록"
$bmp = $c[0]; $g = $c[1]; $path = $c[2]
$card = New-Object System.Drawing.Rectangle(190, 150, 900, 610)
$g.FillRectangle([System.Drawing.Brushes]::White, $card)
$g.DrawRectangle($penBorder, $card)
Text $g "변경 이력" $fontHead $brushText 240 194
Badge $g 860 190 "SLIP_EDIT" "info"
$g.DrawLine($penSoft, 260, 270, 260, 640)
foreach ($py in @(302, 420, 538)) { $g.FillEllipse($brushBlue, 252, $py, 16, 16) }
Text $g "변경자" $fontSmall $brushMuted 310 292
Text $g "김미선 업무주임" $fontBody $brushText 310 320
Text $g "일시" $fontSmall $brushMuted 310 410
Text $g "2026-05-18 09:14" $fontBody $brushText 310 438
Text $g "변경 필드" $fontSmall $brushMuted 310 528
Text $g "거래처, 단가, 비고, 합계" $fontBody $brushText 310 556
Text $g "내부 actorId는 표시하지 않고 변경자명만 사용" $fontSmall $brushMuted 240 690
Save $bmp $g $path
# Shot4
$c = Canvas "04-sales-edit-permission-guard.png" "권한 가드" "INVENTORY / WAREHOUSE 역할은 수정 버튼 비노출"
$bmp = $c[0]; $g = $c[1]; $path = $c[2]
$card = New-Object System.Drawing.Rectangle(250, 220, 780, 360)
$g.FillRectangle([System.Drawing.Brushes]::White, $card)
$g.DrawRectangle($penBorder, $card)
Badge $g 300 270 "403" "danger"
Text $g "매출 전표 수정 권한이 없습니다" $fontHead $brushText 300 326
Text $g "허용 역할: SALES / MANAGER / MASTER" $fontBody $brushMuted 300 376
Text $g "INVENTORY / WAREHOUSE / ACCOUNTANT는 direct PUT 접근 시 403으로 차단합니다." $fontBody $brushMuted 300 416
Text $g "화면에서는 수정 버튼을 렌더하지 않습니다." $fontBody $brushBlue 300 486
Save $bmp $g $path
Write-Host "SP-08-6-2 QA mock screenshots generated."
