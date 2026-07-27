# Windows-only QA screenshot generator for SP-08-4-3.
# Korean text is stored as ASCII unicode escapes so Windows PowerShell 5.1 script
# decoding cannot mojibake the labels before System.Drawing receives them.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
$CommittedDir = Join-Path $PSScriptRoot "..\docs\qa\sp-08-4-3-order-delete-and-estimate-convert\screenshots"
$OutputDir = Resolve-QaShotsDir -CommittedDir $CommittedDir
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function T {
    param([string]$Value)
    return [regex]::Unescape($Value)
}

function New-Font {
    param(
        [float]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )
    foreach ($name in @("Pretendard", "Malgun Gothic", "Noto Sans CJK KR", "Arial Unicode MS", "Segoe UI")) {
        try {
            return New-Object -TypeName System.Drawing.Font -ArgumentList $name, $Size, $Style
        } catch {
        }
    }
    return New-Object -TypeName System.Drawing.Font -ArgumentList ([System.Drawing.FontFamily]::GenericSansSerif), $Size, $Style
}

function New-Brush {
    param([int]$R, [int]$G, [int]$B)
    return New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($R, $G, $B))
}

function New-Pen {
    param([int]$R, [int]$G, [int]$B, [float]$Width = 1)
    return New-Object -TypeName System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb($R, $G, $B)), $Width
}

function Draw-Text {
    param($Graphics, [string]$Text, [float]$X, [float]$Y, [float]$Size = 15, [int]$R = 15, [int]$G = 23, [int]$B = 42, [switch]$Bold)
    $font = New-Font $Size ($(if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }))
    $brush = New-Brush $R $G $B
    $Graphics.DrawString((T $Text), $font, $brush, $X, $Y)
    $font.Dispose()
    $brush.Dispose()
}

function Draw-Box {
    param($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$SubText = "")
    $fill = New-Brush 255 255 255
    $pen = New-Pen 203 213 225
    $Graphics.FillRectangle($fill, $X, $Y, $W, $H)
    $Graphics.DrawRectangle($pen, $X, $Y, $W, $H)
    Draw-Text $Graphics $Text ($X + 16) ($Y + 12) 14 15 23 42 -Bold
    if ($SubText -ne "") {
        Draw-Text $Graphics $SubText ($X + 16) ($Y + 40) 12 71 85 105
    }
    $fill.Dispose()
    $pen.Dispose()
}

function Draw-Button {
    param($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Kind = "primary")
    if ($Kind -eq "danger") {
        $brush = New-Brush 220 38 38
    } elseif ($Kind -eq "secondary") {
        $brush = New-Brush 100 116 139
    } elseif ($Kind -eq "success") {
        $brush = New-Brush 16 185 129
    } else {
        $brush = New-Brush 37 99 235
    }
    $Graphics.FillRectangle($brush, $X, $Y, $W, $H)
    Draw-Text $Graphics $Text ($X + 18) ($Y + 12) 14 255 255 255 -Bold
    $brush.Dispose()
}

function Draw-Badge {
    param($Graphics, [string]$Text, [int]$X, [int]$Y, [int]$W, [string]$Kind = "info")
    if ($Kind -eq "danger") {
        $bg = New-Brush 254 226 226
        $fg = @(153, 27, 27)
    } elseif ($Kind -eq "success") {
        $bg = New-Brush 209 250 229
        $fg = @(6, 95, 70)
    } else {
        $bg = New-Brush 238 242 255
        $fg = @(55, 48, 163)
    }
    $Graphics.FillRectangle($bg, $X, $Y, $W, 28)
    Draw-Text $Graphics $Text ($X + 10) ($Y + 5) 11 $fg[0] $fg[1] $fg[2] -Bold
    $bg.Dispose()
}

function New-Canvas {
    param([string]$Title, [string]$FileName, [scriptblock]$DrawBody)

    $bmp = New-Object System.Drawing.Bitmap 1280, 820
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))

    Draw-Text $g "\uC0BC\uD55C \uC601\uC5C5 \u00B7 SP-08-4-3" 54 28 12 100 116 139 -Bold
    Draw-Text $g $Title 54 52 27 15 23 42 -Bold

    $card = New-Brush 255 255 255
    $line = New-Pen 203 213 225
    $g.FillRectangle($card, 54, 108, 1172, 642)
    $g.DrawRectangle($line, 54, 108, 1172, 642)
    $card.Dispose()
    $line.Dispose()

    & $DrawBody $g

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

New-Canvas -Title "\uC8FC\uBB38\uC11C \uC0AD\uC81C \uD655\uC778" -FileName "01-delete-confirm-dialog.png" -DrawBody {
    param($g)
    Draw-Box $g "\uC8FC\uBB38\uC11C \uC0C1\uC138" 92 138 1030 96 "\uAC70\uB798\uCC98 \u00B7 \uC5D8\uC5D0\uC774\uC2DC\uC2A4\uD15C\uC5D0\uC5B4    \uD569\uACC4 550,000\uC6D0"
    Draw-Badge $g "\uD655\uC815 \uCC98\uB9AC\uC911" 930 154 132 "info"
    Draw-Box $g "\uC8FC\uBB38\uC11C 2026/05/17-1\uC744(\uB97C) \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?" 286 294 708 78 "\uC0AD\uC81C \uD6C4 \uBAA9\uB85D\uACFC \uC0C1\uC138 \uC870\uD68C\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4."
    Draw-Button $g "\uCDE8\uC18C" 724 404 118 48 "secondary"
    Draw-Button $g "\uC0AD\uC81C" 860 404 118 48 "danger"
}

New-Canvas -Title "\uC8FC\uBB38\uC11C \uC0AD\uC81C \uC644\uB8CC \uD6C4 \uBAA9\uB85D" -FileName "02-delete-success.png" -DrawBody {
    param($g)
    Draw-Text $g "\uC8FC\uBB38\uC11C \uBAA9\uB85D" 92 136 19 15 23 42 -Bold
    Draw-Box $g "\uC0AD\uC81C \uC644\uB8CC" 92 184 1030 62 "\uC120\uD0DD\uD55C \uC8FC\uBB38\uC11C\uB294 \uC8FC\uBB38\uC11C \uBAA9\uB85D\uC5D0\uC11C \uC81C\uC678\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
    Draw-Box $g "2026/05/17-2    P-EST-001    550,000\uC6D0" 92 284 1030 54 "\uD655\uC815 \uCC98\uB9AC\uC911 \u00B7 \uC0AD\uC81C\uB41C 2026/05/17-1 \uBBF8\uB178\uCD9C"
    Draw-Box $g "2026/05/16-4    P-AC-120    1,240,000\uC6D0" 92 346 1030 54 "\uD655\uC815 \u00B7 SL-20260516-004"
    Draw-Box $g "2026/05/15-9    P-HQ-009    310,000\uC6D0" 92 408 1030 54 "\uC791\uC131\uC911"
}

New-Canvas -Title "\uACAC\uC801\uC5D0\uC11C \uC8FC\uBB38 \uC0DD\uC131" -FileName "03-from-estimate-success.png" -DrawBody {
    param($g)
    Draw-Button $g "\uC8FC\uBB38\uC11C \uC0DD\uC131 \uC644\uB8CC" 92 138 184 36 "success"
    Draw-Box $g "\uC0DD\uC131\uB41C \uC8FC\uBB38\uBC88\uD638" 92 184 1030 62 "2026/05/17-3    \uC8FC\uBB38 \uC0C1\uD0DC: \uCD08\uC548    \uC804\uD45C \uBC1C\uD589: \uBD88\uD544\uC694"
    Draw-Box $g "\uAC70\uB798\uCC98 / \uC0AC\uC5C5\uC790" 92 272 496 62 "P-EST-001 / 1010101010"
    Draw-Box $g "\uB0A9\uAE30 / \uC694\uCCAD\uC0AC\uD56D" 626 272 496 62 "2026-05-30 / \uACAC\uC801 \uBA54\uBAA8"
    Draw-Box $g "AJ040RXH4BC1    \uC2E4\uC678\uAE30    2\uAC1C    120,000\uC6D0" 92 382 1030 54 "\uC18C\uACC4 240,000\uC6D0"
    Draw-Box $g "AR09B9150HZ    \uBCBD\uAC78\uC774 \uC2E4\uB0B4\uAE30    1\uAC1C    310,000\uC6D0" 92 444 1030 54 "\uC18C\uACC4 310,000\uC6D0"
}

New-Canvas -Title "\uACAC\uC801 \uC911\uBCF5 \uBCC0\uD658 \uCC28\uB2E8" -FileName "04-from-estimate-already-converted.png" -DrawBody {
    param($g)
    Draw-Badge $g "409 Conflict" 92 138 120 "danger"
    Draw-Box $g "\uC774\uBBF8 \uC8FC\uBB38\uC73C\uB85C \uBCC0\uD658\uB41C \uACAC\uC801\uC785\uB2C8\uB2E4." 92 190 1030 76 "\uB3D9\uC77C \uACAC\uC801\uC73C\uB85C \uC0DD\uC131\uB41C \uC8FC\uBB38\uC774 \uC774\uBBF8 \uC874\uC7AC\uD569\uB2C8\uB2E4."
    Draw-Box $g "\uC548\uB0B4" 92 304 1030 62 "\uAE30\uC874 \uC8FC\uBB38 \uC0C1\uC138\uC5D0\uC11C \uC8FC\uBB38\uBC88\uD638\uC640 \uB77C\uC778\uC744 \uD655\uC778\uD558\uC138\uC694."
    Draw-Button $g "\uBAA9\uB85D\uC73C\uB85C" 820 410 132 48 "secondary"
    Draw-Button $g "\uC0C1\uC138 \uD655\uC778" 970 410 132 48 "primary"
}

New-Canvas -Title "\uC8FC\uBB38\uC11C \uC0C1\uC138" -FileName "05-role-guard-partner.png" -DrawBody {
    param($g)
    Draw-Box $g "\uC8FC\uBB38\uC11C \uC0C1\uC138" 92 138 1030 96 "\uAC70\uB798\uCC98 \uACC4\uC815\uC740 \uC8FC\uBB38 \uC870\uD68C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4."
    Draw-Badge $g "\uAC70\uB798\uCC98 \uACC4\uC815" 930 154 132 "info"
    Draw-Box $g "\uC218\uC815 / \uC0AD\uC81C \uBC84\uD2BC \uBBF8\uB178\uCD9C" 92 274 1030 62 "MASTER / MANAGER / SALES \uAD8C\uD55C\uC5D0\uC11C\uB9CC \uC989\uC2DC \uC218\uC815\uACFC soft delete \uD45C\uC2DC"
    Draw-Box $g "\uB77C\uC778 (2\uAC74)" 92 382 1030 62 "\uC0C1\uC138 \uC870\uD68C\uC640 \uD569\uACC4\uB294 \uADF8\uB300\uB85C \uD45C\uC2DC"
    Draw-Button $g "\u2190 \uBAA9\uB85D" 996 482 126 48 "secondary"
}

Get-ChildItem $OutputDir -Filter *.png | Sort-Object Name | Select-Object Name, Length
