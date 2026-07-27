# Windows-only (System.Drawing GDI+)
# PowerShell mock QA screenshots for SP-08-4-2 partner order edit PUT.
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$CommittedDir = Join-Path $PSScriptRoot "..\docs\qa\sp-08-4-2-partner-order-edit-put\screenshots"
$OutputDir = if ($env:QA_SHOTS_DIR) { $env:QA_SHOTS_DIR } else { Join-Path $CommittedDir '_local' }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function K {
    param([string]$Base64)
    [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Base64))
}

$T = @{
    EditTitle = K "7KO866y47IScIOyImOyglQ=="
    PartnerCode = K "6rGw656Y7LKYIOy9lOuTnA=="
    DueDate = K "64Kp6riw"
    Memo = K "7JqU7LKt7IKs7ZWt"
    MemoValue = K "7Jik7KCEIOuCqe2SiCDsmpTssq0="
    Lines = K "7KO866y4IOudvOyduA=="
    Line1 = K "7Iuk7Jm46riwIC8gQUowNDBSWEg0QkMxIC8g7ZmI66mA7YuwIC8gMyAvIDEyNSwwMDDsm5A="
    Line2 = K "67K96rG47J20IOyLpOuCtOq4sCAvIEFSMDlCOTE1MEhaIC8g7Iux6riAIOyEuO2KuCAvIDEgLyAzMTAsMDAw7JuQ"
    Save = K "7KCA7J6l"
    ReloadTitle = K "7KO866y47IScIOyerO2ZleyduA=="
    Conflict = K "64uk66W4IOyCrOyaqeyekOqwgCDrqLzsoIAg7IiY7KCV7ZaI7Iq164uI64ukLiDstZzsi6Ag64K07Jqp7Jy866GcIOuLpOyLnCDrtojrn6zsmKgg65KkIOuLpOyLnCDsoIDsnqXtlbQg7KO87IS47JqULg=="
    Reload = K "7LWc7IugIOuCtOyaqSDrtojrn6zsmKTquLA="
    AuditTitle = K "7IiY7KCVIOydtOugpQ=="
    Audit1 = K "7JiB7JeF64u064u57J6QICAgIDIwMjYuIDUuIDE3LiDsmKTsoIQgMTA6MDUgICAg7KO866y4IOyImOyglQ=="
    Audit2 = K "6rSA66as7J6QICAgICAgICAyMDI2LiA1LiAxNi4g7Jik7ZuEIDAzOjIwICAgIOyalOyyreyCrO2VrQ=="
    Audit3 = K "7Jik67OR7Iq5ICAgICAgICAyMDI2LiA1LiAxNS4g7Jik7ZuEIDAxOjEwICAgIOuCqeq4sA=="
    GuardTitle = K "6rGw656Y7LKYIOq2jO2VnCDtmZTrqbQ="
    Detail = K "7KO866y47IScIOyDgeyEuA=="
    PartnerTitle = K "6rGw656Y7LKYIMK3IOyXmOyXkOydtOyLnOyKpO2FnOyXkOyWtCAgICDtmZXsoJU="
    Total = K "7ZWp6rOEIDMsNzAwLDAwMOybkA=="
    OneLine = K "65287J24IDHqsbQ="
}

function New-Canvas {
    param([string]$Title, [string]$FileName, [scriptblock]$DrawBody)

    $bmp = New-Object System.Drawing.Bitmap 1280, 820
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))

    $fontTitle = New-Object System.Drawing.Font "Malgun Gothic", 28, ([System.Drawing.FontStyle]::Bold)
    $font = New-Object System.Drawing.Font "Malgun Gothic", 15
    $brushText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 41, 59))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(203, 213, 225)), 1

    $g.DrawString($Title, $fontTitle, $brushText, 54, 36)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), 54, 100, 1172, 650)
    $g.DrawRectangle($pen, 54, 100, 1172, 650)

    & $DrawBody $g $font $brushText

    $path = Join-Path $OutputDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

function Draw-Label {
    param($Graphics, $Font, $Text, $X, $Y)
    $Graphics.DrawString($Text, $Font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(71, 85, 105))), $X, $Y)
}

function Draw-Box {
    param($Graphics, $Text, $X, $Y, $W, $H)
    $font = New-Object System.Drawing.Font "Malgun Gothic", 14
    $Graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255))), $X, $Y, $W, $H)
    $Graphics.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(203, 213, 225)), 1), $X, $Y, $W, $H)
    $Graphics.DrawString($Text, $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 23, 42))), ($X + 12), ($Y + 12))
}

New-Canvas -Title $T.EditTitle -FileName "01-edit-form.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Label $g $font $T.PartnerCode 88 132
    Draw-Box $g "1234567890" 88 164 330 48
    Draw-Label $g $font $T.DueDate 452 132
    Draw-Box $g "2026-05-30" 452 164 250 48
    Draw-Label $g $font $T.Memo 736 132
    Draw-Box $g $T.MemoValue 736 164 430 48
    Draw-Label $g $font $T.Lines 88 246
    Draw-Box $g $T.Line1 88 286 1078 50
    Draw-Box $g $T.Line2 88 348 1078 50
    Draw-Box $g $T.Save 1010 662 156 52
}

New-Canvas -Title $T.ReloadTitle -FileName "02-reload.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Box $g $T.Conflict 88 136 820 74
    Draw-Box $g $T.Reload 936 148 210 48
    Draw-Label $g $font $T.PartnerCode 88 250
    Draw-Box $g "1234567890" 88 282 330 48
    Draw-Label $g $font $T.Lines 88 372
    Draw-Box $g $T.Line1 88 410 1078 50
}

New-Canvas -Title $T.AuditTitle -FileName "03-audit-timeline.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Box $g $T.Audit1 88 150 1078 58
    Draw-Box $g $T.Audit2 88 222 1078 58
    Draw-Box $g $T.Audit3 88 294 1078 58
}

New-Canvas -Title $T.GuardTitle -FileName "04-role-guard-partner.png" -DrawBody {
    param($g, $font, $brushText)
    Draw-Label $g $font $T.Detail 88 140
    Draw-Box $g $T.PartnerTitle 88 182 1078 58
    Draw-Box $g $T.Total 88 254 260 48
    Draw-Box $g $T.OneLine 88 330 260 48
}

Get-ChildItem $OutputDir -Filter *.png | Select-Object Name, Length
