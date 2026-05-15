# scripts/generate-arologis-dispatch-pages-screenshots.ps1
#
# D-AX-11 arologis-desktop dispatch pages screenshot fallback.
# Uses .NET System.Drawing so the capture is reproducible on Windows without
# browser/device setup.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$OutDir = Join-Path $PSScriptRoot '..\docs\qa\arologis-dispatch-pages-extract\screenshots'
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$AppBg = [System.Drawing.Color]::FromArgb(250, 251, 252)
$Card = [System.Drawing.Color]::FromArgb(255, 255, 255)
$Line = [System.Drawing.Color]::FromArgb(225, 229, 235)
$Text = [System.Drawing.Color]::FromArgb(26, 31, 46)
$Muted = [System.Drawing.Color]::FromArgb(74, 83, 101)
$Subtle = [System.Drawing.Color]::FromArgb(138, 149, 164)
$Brand = [System.Drawing.Color]::FromArgb(30, 64, 175)
$BrandSoft = [System.Drawing.Color]::FromArgb(219, 234, 254)
$Success = [System.Drawing.Color]::FromArgb(16, 185, 129)
$SuccessBg = [System.Drawing.Color]::FromArgb(209, 250, 229)
$Warning = [System.Drawing.Color]::FromArgb(245, 158, 11)
$WarningBg = [System.Drawing.Color]::FromArgb(254, 243, 199)
$Danger = [System.Drawing.Color]::FromArgb(239, 68, 68)
$DangerBg = [System.Drawing.Color]::FromArgb(254, 226, 226)

$FontTitle = New-Object System.Drawing.Font('Arial', 20, [System.Drawing.FontStyle]::Bold)
$FontH2 = New-Object System.Drawing.Font('Arial', 15, [System.Drawing.FontStyle]::Bold)
$FontBody = New-Object System.Drawing.Font('Arial', 11)
$FontSmall = New-Object System.Drawing.Font('Arial', 9)
$FontMono = New-Object System.Drawing.Font('Consolas', 10)

function New-Canvas {
    $bmp = New-Object System.Drawing.Bitmap(1440, 960)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear($AppBg)
    return @{ Bitmap = $bmp; Graphics = $g }
}

function New-Brush($color) {
    return New-Object System.Drawing.SolidBrush($color)
}

function New-LinePen($color, [int]$width = 1) {
    return New-Object System.Drawing.Pen($color, $width)
}

function Draw-Text {
    param($Canvas, [string]$Value, [System.Drawing.Font]$Font, $Color, [int]$X, [int]$Y)
    $Canvas.Graphics.DrawString($Value, $Font, (New-Brush $Color), $X, $Y)
}

function Draw-Rect {
    param($Canvas, [int]$X, [int]$Y, [int]$W, [int]$H, $Fill, $Border = $Line)
    $Canvas.Graphics.FillRectangle((New-Brush $Fill), $X, $Y, $W, $H)
    $Canvas.Graphics.DrawRectangle((New-LinePen $Border), $X, $Y, $W, $H)
}

function Draw-Chip {
    param($Canvas, [string]$Value, [int]$X, [int]$Y, $Fill, $Fg)
    Draw-Rect $Canvas $X $Y 132 30 $Fill $Fill
    Draw-Text $Canvas $Value $FontSmall $Fg ($X + 12) ($Y + 7)
}

function Draw-Nav {
    param($Canvas, [string]$Active)
    Draw-Rect $Canvas 0 0 1440 58 $Card $Line
    Draw-Text $Canvas 'Arologis' $FontH2 $Text 28 17
    $items = @('Dispatch', 'Drivers')
    $x = 180
    foreach ($item in $items) {
        $isActive = $item -eq $Active
        $fill = if ($isActive) { $BrandSoft } else { $Card }
        $fg = if ($isActive) { $Brand } else { $Muted }
        Draw-Rect $Canvas $x 13 96 32 $fill $fill
        Draw-Text $Canvas $item $FontBody $fg ($x + 18) 20
        $x += 112
    }
    Draw-Text $Canvas 'admin (AROLOGIS_MASTER)' $FontSmall $Muted 1190 21
}

function Draw-Button {
    param($Canvas, [string]$Value, [int]$X, [int]$Y, [int]$W = 118, [string]$Tone = 'primary')
    if ($Tone -eq 'primary') {
        Draw-Rect $Canvas $X $Y $W 34 $Brand $Brand
        Draw-Text $Canvas $Value $FontSmall ([System.Drawing.Color]::White) ($X + 14) ($Y + 8)
    } else {
        Draw-Rect $Canvas $X $Y $W 34 $Card $Line
        Draw-Text $Canvas $Value $FontSmall $Muted ($X + 14) ($Y + 8)
    }
}

function Draw-Table {
    param($Canvas, [int]$X, [int]$Y, [string[]]$Headers, [object[]]$Rows)
    $W = 1220
    Draw-Rect $Canvas $X $Y $W 42 ([System.Drawing.Color]::FromArgb(247, 248, 250)) $Line
    $colW = [math]::Floor($W / $Headers.Length)
    for ($i = 0; $i -lt $Headers.Length; $i++) {
        Draw-Text $Canvas $Headers[$i] $FontSmall $Muted ($X + 14 + $i * $colW) ($Y + 13)
    }
    $rowY = $Y + 42
    foreach ($row in $Rows) {
        Draw-Rect $Canvas $X $rowY $W 42 $Card $Line
        for ($i = 0; $i -lt $Headers.Length; $i++) {
            Draw-Text $Canvas ([string]$row[$i]) $FontSmall $Text ($X + 14 + $i * $colW) ($rowY + 12)
        }
        $rowY += 42
    }
}

function Save-Canvas {
    param($Canvas, [string]$Name)
    $path = Join-Path $OutDir $Name
    $Canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Canvas.Graphics.Dispose()
    $Canvas.Bitmap.Dispose()
    Write-Host "saved: $path"
}

$c = New-Canvas
Draw-Nav $c 'Dispatch'
Draw-Text $c 'Manual Dispatch' $FontTitle $Text 42 88
Draw-Text $c 'Kakao text reference plus manual vehicle/stop draft' $FontBody $Muted 42 124
Draw-Rect $c 42 160 620 640 $Card $Line
Draw-Text $c 'Kakao Text' $FontH2 $Text 68 188
Draw-Rect $c 68 230 560 220 ([System.Drawing.Color]::FromArgb(247, 248, 250)) $Line
Draw-Text $c "Day dispatch sample`n1. Main warehouse`n- Seoul Gangnam, Teheran-ro 123" $FontMono $Muted 86 250
Draw-Button $c 'Preview' 68 474 118 'secondary'
Draw-Rect $c 68 532 560 180 ([System.Drawing.Color]::FromArgb(247, 248, 250)) $Line
Draw-Text $c 'Preview Result' $FontH2 $Text 88 556
Draw-Text $c 'OK - 1 vehicle / 2 stops / driver auto-match pending' $FontBody $Muted 88 594
Draw-Rect $c 704 160 660 640 $Card $Line
Draw-Text $c 'Dispatch Input' $FontH2 $Text 730 188
Draw-Table $c 730 246 @('Vehicle', 'Tonnage', 'Stop', 'Partner', 'Address') @(
    @('1', '1t', '1', 'Daegu HVAC', 'Seoul Gangnam Teheran-ro 123'),
    @('1', '1t', '2', 'Incheon Cold', 'Incheon Namdong-daero 45')
)
Draw-Button $c 'Save' 1230 730 90 'primary'
Save-Canvas $c '01-manual-dispatch.png'

$c = New-Canvas
Draw-Nav $c 'Dispatch'
Draw-Text $c 'Pre-classify' $FontTitle $Text 42 88
Draw-Text $c 'Classify outbound slips by region and metro prefix' $FontBody $Muted 42 124
Draw-Button $c 'Region' 42 160 130 'primary'
Draw-Button $c 'Metro' 184 160 130 'secondary'
Draw-Text $c 'Realtime polling - 30s' $FontSmall $Subtle 1210 168
Draw-Rect $c 42 220 1322 560 $Card $Line
Draw-Text $c 'Seoul region (3)' $FontH2 $Text 70 250
Draw-Table $c 70 292 @('Slip No', 'Partner Code', 'Partner', 'Address', 'Status') @(
    @('W10-001', '1001', 'Daegu HVAC', 'Seoul Gangnam', 'Planned'),
    @('W10-002', '1002', 'Seoul Cold', 'Seoul Songpa', 'Unassigned')
)
Draw-Rect $c 70 460 1180 160 $WarningBg $Warning
Draw-Text $c 'Unclassified partners (1)' $FontH2 $Warning 92 486
Draw-Text $c 'Address did not match REGION master data.' $FontBody $Warning 92 522
Save-Canvas $c '02-pre-classify.png'

$c = New-Canvas
Draw-Nav $c 'Dispatch'
Draw-Text $c 'Unassigned Slips' $FontTitle $Text 42 88
Draw-Text $c 'Review unassigned slips and jump into manual dispatch' $FontBody $Muted 42 124
Draw-Button $c 'Search' 260 160 86 'primary'
Draw-Button $c 'CSV' 358 160 132 'secondary'
Draw-Rect $c 42 220 1322 560 $Card $Line
Draw-Text $c '2026-05-15 - 3 unassigned / 17 total' $FontH2 $Text 70 250
Draw-Table $c 70 300 @('Slip No', 'Partner Code', 'Partner', 'Address', 'Action') @(
    @('W10-101', '2001', 'Busan HVAC', 'Busan Haeundae', 'Manual dispatch'),
    @('W10-102', '2002', 'Gwangju Cold', 'Gwangju Buk-gu', 'Manual dispatch'),
    @('W10-103', '-', 'Unlinked partner', 'Daejeon Seo-gu', 'Manual dispatch')
)
Save-Canvas $c '03-unassigned.png'

$c = New-Canvas
Draw-Nav $c 'Dispatch'
Draw-Text $c 'Carrier Reconcile' $FontTitle $Text 42 88
Draw-Text $c 'Compare carrier Excel files against local dispatch records' $FontBody $Muted 42 124
Draw-Rect $c 42 160 1322 145 ([System.Drawing.Color]::FromArgb(247, 248, 250)) $Line
Draw-Text $c 'Drop carrier .xlsx files or click to select' $FontH2 $Text 430 202
Draw-Text $c '.xlsx only - max 5MB per file - multi upload supported' $FontBody $Muted 500 238
Draw-Button $c 'Run compare' 42 335 110 'primary'
Draw-Chip $c 'Matched 128' 42 400 $SuccessBg $Success
Draw-Chip $c 'Carrier missing 2' 190 400 $WarningBg $Warning
Draw-Chip $c 'Local missing 1' 366 400 $DangerBg $Danger
Draw-Rect $c 42 462 1322 320 $Card $Line
Draw-Table $c 70 500 @('Status', 'Slip No', 'Date', 'Carrier', 'Local Time', 'Carrier Time', 'Note') @(
    @('Carrier missing', 'W10-301', '2026-05-15', '-', '10:30', '-', 'Not in carrier file'),
    @('Local missing', 'W10-302', '2026-05-15', 'CJ', '-', '11:20', 'No local dispatch')
)
Save-Canvas $c '04-reconcile.png'

Write-Host 'D-AX-11 screenshots generated:'
Get-ChildItem $OutDir -Filter '*.png' | Sort-Object Name | ForEach-Object {
    Write-Host "  $($_.Name) ($([math]::Round($_.Length / 1KB, 1)) KB)"
}
