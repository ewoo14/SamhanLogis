param(
    [string]$OutputDir = $(if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { "docs/qa/sp-08-4-1-partner-order-list-detail/screenshots/_local" })
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function New-Font {
    param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    try {
        return New-Object System.Drawing.Font("Pretendard", $Size, $Style)
    } catch {
        return New-Object System.Drawing.Font("Malgun Gothic", $Size, $Style)
    }
}

$fontTitle = New-Font 24 ([System.Drawing.FontStyle]::Bold)
$fontHead = New-Font 15 ([System.Drawing.FontStyle]::Bold)
$fontBody = New-Font 12
$fontSmall = New-Font 10
$brushText = [System.Drawing.Brushes]::Black
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 216, 226), 1)
$penSoft = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(229, 231, 235), 1)

function Draw-Input {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [string]$Label, [string]$Value)
    $Graphics.DrawString($Label, $fontSmall, $brushMuted, $X, $Y)
    $rect = New-Object System.Drawing.Rectangle($X, ($Y + 22), $W, 38)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    $Graphics.DrawString($Value, $fontBody, $brushText, ($X + 12), ($Y + 32))
}

function Draw-Status {
    param($Graphics, [int]$X, [int]$Y, [string]$Text, [string]$Tone)
    $bg = [System.Drawing.Color]::FromArgb(219, 234, 254)
    $fg = $brushBlue
    if ($Tone -eq "good") {
        $bg = [System.Drawing.Color]::FromArgb(209, 250, 229)
        $fg = $brushGreen
    }
    if ($Tone -eq "danger") {
        $bg = [System.Drawing.Color]::FromArgb(254, 226, 226)
        $fg = $brushRed
    }
    $rect = New-Object System.Drawing.Rectangle($X, $Y, 96, 26)
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    $Graphics.DrawString($Text, $fontSmall, $fg, ($X + 16), ($Y + 6))
}

function Draw-Table {
    param($Graphics, [int]$Y, [string[]]$Rows)
    $rect = New-Object System.Drawing.Rectangle(46, $Y, 1188, 430)
    $Graphics.FillRectangle([System.Drawing.Brushes]::White, $rect)
    $Graphics.DrawRectangle($penBorder, $rect)
    $Graphics.DrawString("주문번호", $fontSmall, $brushMuted, 70, $Y + 24)
    $Graphics.DrawString("거래처", $fontSmall, $brushMuted, 244, $Y + 24)
    $Graphics.DrawString("발송일", $fontSmall, $brushMuted, 500, $Y + 24)
    $Graphics.DrawString("금액", $fontSmall, $brushMuted, 704, $Y + 24)
    $Graphics.DrawString("상태", $fontSmall, $brushMuted, 900, $Y + 24)
    $Graphics.DrawLine($penSoft, 64, $Y + 58, 1216, $Y + 58)

    $rowY = $Y + 82
    $i = 0
    foreach ($row in $Rows) {
        $parts = $row.Split("|")
        $Graphics.DrawString($parts[0], $fontBody, $brushText, 70, $rowY)
        $Graphics.DrawString($parts[1], $fontBody, $brushText, 244, $rowY)
        $Graphics.DrawString($parts[2], $fontBody, $brushText, 500, $rowY)
        $Graphics.DrawString($parts[3], $fontBody, $brushText, 704, $rowY)
        Draw-Status $Graphics 890 ($rowY - 3) $parts[4] $parts[5]
        $Graphics.DrawLine($penSoft, 64, $rowY + 40, 1216, $rowY + 40)
        $rowY += 64
        $i += 1
    }
}

function New-Shot {
    param(
        [string]$FileName,
        [string]$Title,
        [string]$Subtitle,
        [string[]]$Rows,
        [string]$Partner = "",
        [string]$Keyword = "",
        [bool]$ShowDetail = $false,
        [bool]$Empty = $false
    )

    $bmp = New-Object System.Drawing.Bitmap(1280, 900)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $g.DrawString($Title, $fontTitle, $brushText, 44, 34)
    $g.DrawString($Subtitle, $fontBody, $brushMuted, 46, 76)

    Draw-Input $g 46 124 156 "시작일" "2026-05-01"
    Draw-Input $g 218 124 156 "종료일" "2026-05-17"
    Draw-Input $g 390 124 248 "거래처" $(if ($Partner) { $Partner } else { "전체" })
    Draw-Input $g 654 124 148 "상태" "확정"
    Draw-Input $g 818 124 260 "검색어" $(if ($Keyword) { $Keyword } else { "주문번호·품목명" })
    $button = New-Object System.Drawing.Rectangle(1094, 146, 140, 38)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))), $button)
    $g.DrawString("조회", $fontBody, [System.Drawing.Brushes]::White, 1148, 156)

    if ($Empty) {
        Draw-Table $g 226 @()
        $g.DrawString("조건에 맞는 주문이 없습니다", $fontHead, $brushText, 506, 430)
        $g.DrawString("기간 또는 검색어를 조정해 다시 조회하세요.", $fontBody, $brushMuted, 486, 464)
    } else {
        Draw-Table $g 226 $Rows
    }

    if ($ShowDetail) {
        $dialog = New-Object System.Drawing.Rectangle(300, 170, 680, 560)
        $g.FillRectangle([System.Drawing.Brushes]::White, $dialog)
        $g.DrawRectangle($penBorder, $dialog)
        $g.DrawString("주문서 상세", $fontHead, $brushText, 330, 202)
        $g.DrawString("주문번호 2026/05/17-1", $fontBody, $brushMuted, 330, 236)
        Draw-Status $g 846 202 "확정" "good"
        $g.DrawString("거래처", $fontSmall, $brushMuted, 330, 288)
        $g.DrawString("삼한공조", $fontBody, $brushText, 330, 312)
        $g.DrawString("거래처 코드", $fontSmall, $brushMuted, 520, 288)
        $g.DrawString("P-001", $fontBody, $brushText, 520, 312)
        $g.DrawString("연결 전표", $fontSmall, $brushMuted, 710, 288)
        $g.DrawString("2026/05/17 - 4", $fontBody, $brushText, 710, 312)
        $g.DrawLine($penSoft, 330, 366, 950, 366)
        $g.DrawString("품목명", $fontSmall, $brushMuted, 346, 394)
        $g.DrawString("모델명", $fontSmall, $brushMuted, 560, 394)
        $g.DrawString("수량", $fontSmall, $brushMuted, 760, 394)
        $g.DrawString("소계", $fontSmall, $brushMuted, 850, 394)
        $g.DrawString("실외기", $fontBody, $brushText, 346, 430)
        $g.DrawString("AJ040RXH4BC1", $fontBody, $brushText, 560, 430)
        $g.DrawString("2", $fontBody, $brushText, 760, 430)
        $g.DrawString("240,000원", $fontBody, $brushText, 850, 430)
        $g.DrawString("천장형 실내기", $fontBody, $brushText, 346, 486)
        $g.DrawString("AC060TN4PBH1", $fontBody, $brushText, 560, 486)
        $g.DrawString("1", $fontBody, $brushText, 760, 486)
        $g.DrawString("180,000원", $fontBody, $brushText, 850, 486)
        $g.DrawString("합계 420,000원", $fontHead, $brushBlue, 746, 626)
    }

    $g.DrawString("주문번호·거래처 코드·품목명 기준 조회", $fontSmall, $brushMuted, 44, 824)

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $path"
}

$rows = @(
    "2026/05/17-1|삼한공조|2026/05/17|420,000원|확정|good",
    "2026/05/16-2|서울냉열|2026/05/16|180,000원|처리중|info",
    "2026/05/15-1|동부설비|2026/05/15|95,000원|취소|danger"
)

New-Shot "01-list-filters.png" "주문서 관리" "기간·거래처·상태·검색어 필터" $rows
New-Shot "02-filtered-results.png" "주문 필터 결과" "기간과 상태를 적용한 조회 결과" @($rows[0]) "삼한공조" "실외기"
New-Shot "03-detail-dialog.png" "주문 상세 확인" "헤더·거래처·라인 품목 확인" $rows "삼한공조" "실외기" $true
New-Shot "04-empty-keyword.png" "주문 검색 결과" "검색어 적용 후 빈 결과 안내" @() "" "없는품목" $false $true

Write-Host "SP-08-4-1 QA mock screenshots generated in $OutputDir"
