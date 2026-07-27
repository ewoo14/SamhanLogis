$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
$CommittedDir = Join-Path $PSScriptRoot '..\docs\qa\sp-03-purchase-inspection-cta\screenshots'
$OutDir = Resolve-QaShotsDir -CommittedDir $CommittedDir
New-Item -ItemType Directory -Force $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing

$FontFamily = 'Segoe UI'
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
        if ($Border -is [array]) { $Border = $Border[0] }
        $pen = New-Object System.Drawing.Pen -ArgumentList $Border, 1
        $Graphics.DrawRectangle($pen, $X, $Y, $W, $H)
        $pen.Dispose()
    }
}

function Draw-Pill($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$W, $Fill, $TextColor) {
    Draw-Rect $Graphics $X $Y $W 30 $Fill $Fill
    Draw-Text $Graphics $Text ($X + 12) ($Y + 7) 14 $TextColor 'Bold'
}

function Draw-Sidebar($Graphics, [string]$Role, [bool]$ShowInspection) {
    Draw-Rect $Graphics 0 0 250 860 $Navy
    Draw-Text $Graphics 'Samhan Public' 30 28 28 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $Graphics 'Sales' 30 104 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    Draw-Text $Graphics 'Sales Management' 44 138 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Rect $Graphics 28 166 194 36 ([System.Drawing.ColorTranslator]::FromHtml('#1F3A3D')) $Teal
    Draw-Text $Graphics 'Purchase Management' 44 174 15 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $Graphics 'Partner Admin' 44 212 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $Graphics 'Warehouse Ops' 30 292 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
    if ($ShowInspection) {
        Draw-Text $Graphics 'Inbound Inspection' 44 326 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    } else {
        Draw-Text $Graphics 'Stock Query' 44 326 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    }
    Draw-Text $Graphics 'DPS By Product' 44 364 15 ([System.Drawing.ColorTranslator]::FromHtml('#C7D2DF'))
    Draw-Text $Graphics $Role 30 790 13 ([System.Drawing.ColorTranslator]::FromHtml('#A7B1BF')) 'Bold'
}

function Draw-Table($Graphics, [int]$X, [int]$Y, [bool]$ShowInspect) {
    $headers = @('No', 'Purchase No', 'Partner', 'Status', 'Amount', 'Warehouse', 'Memo')
    $widths = @(54, 138, 150, 100, 112, 112, 128)
    if ($ShowInspect) {
        $headers += 'Inspect'
        $widths += 86
    }
    $tableW = 0
    foreach ($w in $widths) { $tableW += $w }

    Draw-Rect $Graphics $X $Y $tableW 42 $Navy $Navy
    $colX = $X
    for ($i = 0; $i -lt $headers.Count; $i++) {
        Draw-Text $Graphics $headers[$i] ($colX + 10) ($Y + 12) 14 ([System.Drawing.Color]::White) 'Bold'
        $colX += $widths[$i]
    }

    $rows = @(
        @('1', '2026/05/10-1', 'Samsung', 'SAVED', '3,700,000', 'HQ', 'Return trip', 'Inspect'),
        @('2', '2026/05/10-2', 'LG', 'CONFIRMED', '2,120,000', 'HQ', '-', 'Inspect'),
        @('3', '2026/05/09-3', 'Carrier', 'COMPLETED', '1,450,000', 'HQ', 'Return', '-'),
        @('4', '2026/05/09-4', 'Daewoo', 'SAVED', '5,100,000', 'Branch', 'Borrow', 'Inspect')
    )
    $rowY = $Y + 42
    foreach ($row in $rows) {
        Draw-Rect $Graphics $X $rowY $tableW 46 $Card $Line
        $colX = $X
        $limit = if ($ShowInspect) { $row.Count } else { $row.Count - 1 }
        for ($i = 0; $i -lt $limit; $i++) {
            if ($ShowInspect -and $i -eq ($limit - 1) -and $row[$i] -eq 'Inspect') {
                Draw-Pill $Graphics 'Inspect' ($colX + 10) ($rowY + 8) 66 $Teal ([System.Drawing.Color]::White)
            } else {
                $color = if ($row[$i] -eq '-') { $Muted } else { $Ink }
                Draw-Text $Graphics $row[$i] ($colX + 10) ($rowY + 13) 14 $color
            }
            $colX += $widths[$i]
        }
        $rowY += 46
    }
}

function Draw-Card($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Title, [string[]]$Lines, $Accent) {
    Draw-Rect $Graphics $X $Y $W $H $Card $Line
    Draw-Rect $Graphics $X $Y 6 $H $Accent $Accent
    Draw-Text $Graphics $Title ($X + 22) ($Y + 18) 19 $Ink 'Bold'
    $lineY = $Y + 56
    foreach ($textLine in $Lines) {
        Draw-Text $Graphics $textLine ($X + 22) $lineY 14 $Muted
        $lineY += 27
    }
}

function New-ListScreen([hashtable]$Spec) {
    $W = 1280
    $H = 860
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    Draw-Rect $g 0 0 $W $H $Bg
    Draw-Sidebar $g $Spec.Role $Spec.ShowInspectionMenu
    Draw-Text $g $Spec.Title 290 36 30 $Ink 'Bold'
    Draw-Text $g $Spec.Subtitle 292 76 15 $Muted
    Draw-Pill $g $Spec.Role 1090 36 140 $Teal ([System.Drawing.Color]::White)
    Draw-Rect $g 290 112 900 42 $Spec.PathBg $Line
    Draw-Text $g $Spec.Path 308 124 15 $Ink 'Bold'
    Draw-Table $g 290 184 $Spec.ShowInspect

    $positions = @(
        @{ X = 290; Y = 456; W = 420; H = 142 },
        @{ X = 750; Y = 456; W = 420; H = 142 },
        @{ X = 290; Y = 630; W = 420; H = 142 },
        @{ X = 750; Y = 630; W = 420; H = 142 }
    )
    for ($i = 0; $i -lt $Spec.Cards.Count; $i++) {
        $p = $positions[$i]
        $c = $Spec.Cards[$i]
        Draw-Card $g $p.X $p.Y $p.W $p.H $c.Title $c.Lines $c.Accent
    }

    Draw-Text $g $Spec.Footer 290 820 14 $Muted
    $Path = Join-Path $OutDir $Spec.File
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $Path"
}

function New-DialogScreen {
    $W = 1280
    $H = 860
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    Draw-Rect $g 0 0 $W $H $Bg
    Draw-Sidebar $g 'WAREHOUSE' $true
    Draw-Text $g 'Purchase Query Inspection Dialog' 290 36 30 $Ink 'Bold'
    Draw-Text $g 'After clicking Inspect on purchase no 2026/05/10-1' 292 76 15 $Muted
    Draw-Pill $g 'WAREHOUSE' 1090 36 140 $Teal ([System.Drawing.Color]::White)
    Draw-Table $g 290 124 $true

    Draw-Rect $g 390 214 760 520 $Card $Line
    Draw-Rect $g 390 214 760 58 $Navy $Navy
    Draw-Text $g 'Inbound Inspection' 420 232 22 ([System.Drawing.Color]::White) 'Bold'
    Draw-Text $g 'Purchase No 2026/05/10-1 / Samsung / HQ Warehouse' 420 292 16 $Ink 'Bold'
    Draw-Text $g 'Slip date 2026-05-10 / Status Pending' 420 322 14 $Muted

    $headers = @('Model', 'Product', 'Expected', 'Checked', 'Defect', 'Reason')
    $widths = @(120, 190, 76, 76, 76, 150)
    $tableX = 420
    $tableY = 366
    Draw-Rect $g $tableX $tableY 688 36 $SoftTeal $Line
    $x = $tableX
    for ($i = 0; $i -lt $headers.Count; $i++) {
        Draw-Text $g $headers[$i] ($x + 8) ($tableY + 10) 13 $Ink 'Bold'
        $x += $widths[$i]
    }
    $lines = @(
        @('AJ040RXH4BC1', 'System AC 4Way', '5', '5', '0', '-'),
        @('AJ052RXH5BC1', 'System AC 5Way', '3', '2', '1', 'Scratch'),
        @('MWR-WE10N', 'Wired Remote', '10', '10', '0', '-')
    )
    $y = $tableY + 36
    foreach ($detailRow in $lines) {
        Draw-Rect $g $tableX $y 688 40 $Card $Line
        $x = $tableX
        for ($i = 0; $i -lt $detailRow.Count; $i++) {
            Draw-Text $g $detailRow[$i] ($x + 8) ($y + 12) 13 $Ink
            $x += $widths[$i]
        }
        $y += 40
    }
    Draw-Pill $g 'Save' 830 666 72 $Blue ([System.Drawing.Color]::White)
    Draw-Pill $g 'Complete' 918 666 92 $Teal ([System.Drawing.Color]::White)
    Draw-Text $g 'UUID is API-only. The dialog displays business numbers and labels.' 420 760 14 $Muted

    $Path = Join-Path $OutDir '02-warehouse-inspection-dialog.png'
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "generated $Path"
}

$screens = @(
    @{
        File='01-warehouse-purchase-inspect-cta.png'; Role='WAREHOUSE'; Title='WAREHOUSE Purchase Management CTA'; Subtitle='Inspect button appears only on SAVED / CONFIRMED rows.'; Path='/purchases'; PathBg=$SoftTeal; ShowInspect=$true; ShowInspectionMenu=$true
        Cards=@(
            @{ Title='Role'; Lines=@('Inspection column visible', 'No New Purchase Slip CTA', 'Inbound Inspection menu visible'); Accent=$Teal },
            @{ Title='Status'; Lines=@('SAVED / CONFIRMED button', 'COMPLETED uses dash', 'No disabled fake button'); Accent=$Blue },
            @{ Title='Action'; Lines=@('Button stops row selection', 'Dialog opens', 'List refetch on success'); Accent=$Green },
            @{ Title='Identifier'; Lines=@('Purchase no 2026/05/10-1', 'No row id text', 'UUID regex 0'); Accent=$Red }
        ); Footer='SP-03 QA 01 - WAREHOUSE purchase row inspection CTA'
    },
    @{
        File='03-manager-purchase-dual-cta.png'; Role='MANAGER'; Title='MANAGER Purchase Management CTA'; Subtitle='Manager can inspect rows and create new inbound slips.'; Path='/purchases?role=MANAGER'; PathBg=$SoftBlue; ShowInspect=$true; ShowInspectionMenu=$true
        Cards=@(
            @{ Title='Row action'; Lines=@('SAVED/CONFIRMED Inspect', 'Dialog reused', 'Query refetch'); Accent=$Teal },
            @{ Title='Toolbar'; Lines=@('New Inbound Slip visible', '/purchases/new route', 'canCreateSlip unchanged'); Accent=$Blue },
            @{ Title='Contract'; Lines=@('canInspectInbound helper', 'Menu and page share it', 'Backend roles match'); Accent=$Green },
            @{ Title='Number'; Lines=@('YYYY/MM/DD-N', 'Sales/Purchase duplicate OK', 'Transfer no max+1'); Accent=$Violet }
        ); Footer='SP-03 QA 03 - MANAGER inspection and create flows'
    },
    @{
        File='04-master-purchase-inspect-cta.png'; Role='MASTER'; Title='MASTER Purchase Management CTA'; Subtitle='Master sees the same purchase inspection route.'; Path='/purchases?role=MASTER'; PathBg=$SoftTeal; ShowInspect=$true; ShowInspectionMenu=$true
        Cards=@(
            @{ Title='Access'; Lines=@('Inspection column visible', 'SAVED/CONFIRMED button', 'Menu visible'); Accent=$Teal },
            @{ Title='Ops'; Lines=@('Dialog save/complete', 'Inventory API connected', 'Audit follow-up ready'); Accent=$Blue },
            @{ Title='Gateway'; Lines=@('/api/v1/inventory/**', 'StripPrefix -> /inventory/**', 'Dual mapping fixed'); Accent=$Green },
            @{ Title='Regression'; Lines=@('No legacy dependency', '/purchases is canonical', 'Static spec locked'); Accent=$Violet }
        ); Footer='SP-03 QA 04 - MASTER canonical purchase inspection route'
    },
    @{
        File='05-inventory-no-inspect-cta.png'; Role='INVENTORY'; Title='INVENTORY No Inspection CTA'; Subtitle='Inventory role does not own the current inspection API contract.'; Path='/purchases?role=INVENTORY'; PathBg=$SoftAmber; ShowInspect=$false; ShowInspectionMenu=$false
        Cards=@(
            @{ Title='CTA'; Lines=@('No Inspect column', 'No Inspect button', 'Row select only'); Accent=$Amber },
            @{ Title='Menu'; Lines=@('No Inbound Inspection menu', 'Stock query focus', 'Avoids permission confusion'); Accent=$Blue },
            @{ Title='Backend'; Lines=@('INVENTORY returns 403', 'WAREHOUSE/MANAGER/MASTER OK', 'ControllerIT locks it'); Accent=$Red },
            @{ Title='Future'; Lines=@('If INVENTORY is needed', 'Backend role must change', 'Needs separate decision'); Accent=$Violet }
        ); Footer='SP-03 QA 05 - INVENTORY negative role matrix'
    },
    @{
        File='06-business-number-uuid-hidden-matrix.png'; Role='QA'; Title='Business Number Scope and UUID Guard'; Subtitle='Business numbers are scoped by service/menu/type. UUID stays internal.'; Path='privacy://business-number-scoped'; PathBg=$SoftTeal; ShowInspect=$true; ShowInspectionMenu=$true
        Cards=@(
            @{ Title='Business number'; Lines=@('YYYY/MM/DD-N', 'Independent per menu/type', 'Transfer no max+1 no T/TR'); Accent=$Violet },
            @{ Title='UUID guard'; Lines=@('row id is API param only', 'test id is slipNo based', 'screenshots UUID regex 0'); Accent=$Red },
            @{ Title='5-agent'; Lines=@('FE/QA found missing CTA', 'BE found gateway path risk', 'Designer matrix applied'); Accent=$Blue },
            @{ Title='Verification'; Lines=@('desktop typecheck/lint/build', 'SP-03 Playwright static', 'inventory/slip Docker IT'); Accent=$Green }
        ); Footer='SP-03 QA 06 - PR inline summary capture'
    }
)

New-ListScreen $screens[0]
New-DialogScreen
for ($i = 1; $i -lt $screens.Count; $i++) {
    New-ListScreen $screens[$i]
}

$generated = Get-ChildItem $OutDir -Filter *.png
if ($generated.Count -ne 6) {
    throw "Expected 6 screenshots, generated $($generated.Count)"
}

Write-Host "SP-03 screenshots generated: $($generated.Count)"
