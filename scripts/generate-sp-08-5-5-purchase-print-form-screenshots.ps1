param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
# 2026-07-28 재수렴 D-C: 무조건 호출 — -OutputDir 명시 시에도 물리 가드를 받는다(T-1).
$OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-5-5-purchase-print-form\screenshots') -RequestedDir $OutputDir

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

$fontTitle  = New-Font 18 ([System.Drawing.FontStyle]::Bold)
$fontHead   = New-Font 14 ([System.Drawing.FontStyle]::Bold)
$fontBody   = New-Font 11
$fontSmall  = New-Font 9
$fontTiny   = New-Font 8

$brushText   = [System.Drawing.Brushes]::Black
$brushMuted  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$brushBlue   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$brushGreen  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$brushRed    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$brushGray   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(156, 163, 175))
$brushOrange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 83, 9))

$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(55, 65, 81), 1)
$penSoft   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(209, 213, 219), 1)
$penBlue   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(147, 197, 253), 1)
$penGreen  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(4, 120, 87), 1)
$penOrange = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(217, 119, 6), 1)
$penDash   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(156, 163, 175), 1)
$penDash.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$K_PURCHASE_TITLE = U "\uB9E4 \uC785  \uC804  \uD45C"
$K_COMPANY = U "(\uC8FC)\uC0BC\uD55C\uACF5\uC870\uC2DC\uC2A4\uD15C"
$K_SLIP_NO_LABEL = U "\uC804\uD45C\uBC88\uD638:"
$K_ISSUE_DATE_LABEL = U "\uBC1C\uD589\uC77C:"
$K_PARTNER_INFO = U "\uAC70\uB798\uCC98 \uC815\uBCF4"
$K_PARTNER_LABEL = U "\uAC70\uB798\uCC98:"
$K_BIZ_NO_LABEL = U "\uC0AC\uC5C5\uC790\uBC88\uD638:"
$K_WAREHOUSE_LABEL = U "\uC785\uACE0\uCC3D\uACE0:"
$K_PARTNER_NAME = U "\uC0BC\uD55C\uACF5\uC870"
$K_WAREHOUSE_NAME = U "\uC591\uC7AC \uBCF8\uC0AC \uCC3D\uACE0"
$K_ITEM_SPEC = U "\uD488\uBAA9 / \uADDC\uACA9"
$K_QTY = U "\uC218\uB7C9"
$K_UNIT_PRICE = U "\uB2E8\uAC00"
$K_AMOUNT = U "\uAE08\uC969"
$K_MEMO = U "\uBE44\uACE0"
$K_PRODUCT_COL = U "\uD488\uBAA9\uBA85"
$K_SPEC_COL = U "\uADDC\uACA9"
$K_SUPPLY_COL = U "\uACF5\uAE09\uAC00\uC561"
$K_VAT_COL = U "\uBD80\uAC00\uC138"
$K_MEMO_COL = U "\uC801\uC694"
$K_SUPPLY = U "\uACF5\uAE09\uAC00\uCCF5:"
$K_VAT = U "\uBD80\uAC00\uC138 (10%):"
$K_TOTAL = U "\uD569\uACC4:"
$K_INSPECT_SECTION = U "\uAC80\uC218 \uD655\uC778\uB780"
$K_INSPECT_BLANK = U "\uAC80\uC218 \uD655\uC778\uB780 (\uD604\uC7A5 \uC218\uAE30 \uC791\uC131)"
$K_INSPECTOR = U "\uAC80\uC218\uC790:"
$K_INSPECT_DATE = U "\uAC80\uC218\uC77C\uC790:"
$K_HANDLER = U "\uB2F5\uB2F9\uC790:"
$K_SUPPLIER_CONFIRM = U "\uACF5\uAE09\uCC98 \uD655\uC778:"
$K_HANDWRITE_SIGN = U "(\uC218\uAE30 \uC11C\uBA85 \uC601\uC5ED)"
$K_HANDWRITE_DATE = U "(\uC218\uAE30 \uAE30\uC785)"
$K_INSPECTOR_NAME = U "\uAE40\uCB51\uACE0"
$K_INSPECTOR2_NAME = U "\uC774\uAC80\uC218"
$K_A_GRADE = U "A\uAE09"
$K_B_GRADE = U "B\uAE09"
$K_INV = U "\uC778\uBC84\uD130"
$K_HEATPUMP = U "\uD604\uD2B8\uD675\uD2B8"
$K_TON1 = U "1\uD264"
$K_TON1_5 = U "1.5\uD264"
$K_NEW_STR = U "\uC2E0\uADDC"
$K_IN_MARK = U "[\uC778]"
$K_ITEM_SPEC_HEADER = U "\uD488\uBAA9/\uADDC\uACA9"
$K_GAS_TITLE = U "LEGACY GAS \uC591\uC2DD"
$K_GAS_DOC_TITLE = U "\uB9E4 \uC785  \uC804  \uD45C  (\uAD6C\uAE00 \uC2DC\uD2B8 GAS)"
$K_GAS_DATE = U "\uB0A0\uC7A5: 2026-05-18"
$K_GAS_PARTNER = U "\uAC70\uB798\uCC98: \uC0BC\uD55C\uACF5\uC870"
$K_GAS_TOTAL = U "\uD569\uACC4: 44,660,000 \uC6D0"
$K_GAS_LIMITS = U "GAS \uC591\uC2DD \uD55C\uACC4:"
$K_GAS_L1 = U "x  \uC0AC\uC5C5\uC790\uBC88\uD638 \uD45C\uAE30 \uC5C6\uC74C"
$K_GAS_L2 = U "x  \uAC80\uC218\uC77C\uC790 \uD544\uB4DC \uC5C6\uC74C"
$K_GAS_L3 = U "x  \uC03C\uB9BD\uBC88\uD638 UUID \uC9C1\uC811 \uB178\uCD9C"
$K_GAS_L4 = U "x  @media print \uBBF8\uC801\uC6A9"
$K_GAS_L5 = U "x  A4 \uD398\uC774\uC9C0 \uD06C\uAE30 \uBBF8\uBCF4\uC7A5"
$K_SP_TITLE = U "Samhan Public \uB9E4\uC785 \uC804\uD45C"
$K_SP_SLIP_NO = U "\uC804\uD45C\uBC88\uD638: 2026/05/18-1"
$K_SP_ISSUE = U "\uBC1C\uD589\uC77C: 2026-05-18"
$K_SP_PARTNER_ROW = U "\uAC70\uB798\uCC98: \uC0BC\uD55C\uACF5\uC870"
$K_SP_BIZ = U "\uC0AC\uC5C5\uC790\uBC88\uD638: 214-87-20659"
$K_SP_WAREHOUSE = U "\uC785\uACE0\uCC3D\uACE0: \uC591\uC7AC \uBCF8\uC0AC \uCC3D\uACE0"
$K_SP_TOTAL = U "\uD569\uACC4: 44,660,000 \uC6D0"
$K_SP_INSPECT = U "\uAC80\uC218\uC790: \uAE40\uCB51\uACE0 [\uC778]     \uAC80\uC218\uC77C\uC790: 2026-05-18"
$K_SP_SUPPLIER_SIGN = U "\uACF5\uAE09\uCC98 \uD655\uC778: _____________ [\uC778]"
$K_SP_GAINS = U "\uAC1C\uC120 \uC0AC\uD56D:"
$K_SP_G1 = U "v  \uC0AC\uC5C5\uC790\uBC88\uD638 \uD45C\uAE30 (\uD544\uC218 \uC138\uBB34 \uC815\uBCF4)"
$K_SP_G2 = U "v  \uAC80\uC218\uC77C\uC790 / \uAC80\uC218\uC790 \uD544\uB4DC \uC2E0\uADDC"
$K_SP_G3 = U "v  \uC804\uD45C\uBC88\uD638(slipNo) \uAE30\uC900  UUID \uBBF8\uB178\uCD9C"
$K_SP_G4 = U "v  @media print A4 portrait \uC790\uB3D9 \uC801\uC6A9"
$K_SP_G5 = U "v  window.print() \uB610\uB294 \uC778\uC0B0 \uBC84\uD2BC \uC81C\uACF5"
$K_COMPARE_TITLE = U "legacy GAS \uC591\uC2DD vs Samhan Public \uB9E4\uC785 \uC804\uD45C  Side-by-side \uBE44\uAD50"
$K_FOOTER1 = U "\u203B \uC785\uACE0 \uC218\uB7C9 / \uD488\uBAA9 / \uC0C1\uD0DC \uC774\uC0C1 \uC720\uBB34 \uD655\uC778 \uD6C4 \uAC80\uC218\uC790 \uC11C\uBA85 \uD544\uC218."
$K_FOOTER2 = U "\u203B \uBCF8 \uC804\uD45C\uB294 \uC804\uC0B0 \uBC1C\uD589\uB41C \uB9E4\uC785 \uC804\uD45C\uC785\uB2C8\uB2E4.  UUID \uBBF8\uB178\uCD9C  -  \uC804\uD45C\uBC88\uD638 \uAE30\uC900 \uC2DD\uBCC4."
$K_NOTE1 = U "SP-08-5-5 \uB9E4\uC785 \uC778\uC0B0 \uC591\uC2DD  A4 portrait  /  \uD5BC\uB354-\uAC70\uB798\uCC98-\uB78C\uC778\uD45C-\uD569\uACC4-\uAC80\uC218\uB780-\uD4CE\uD130 6 \uC120\uC124  /  UUID \uBBF8\uB178\uCD9C"
$K_NOTE3 = U "10+ \uD589 \uB77C\uC778\uB040  /  page-break-inside: avoid \uACC4\uC57D \uD655\uC778  /  \uB2E4\uC911 \uD398\uC774\uC9C0 \uBD84\uD560 \uAC00\uB2A5"
$K_NOTE4 = U "\uAC80\uC218\uB780 blank  /  inspector == null \uC2DC \uBBEC \uCB5C \uC720\uC9C0 \uACC4\uC57D  /  \uC218\uAE30 \uC791\uC131 \uC601\uC5ED \uAC15\uC790  /  UUID \uBBF8\uB178\uCD9C"
function DStr {
    param($G, [string]$Str, $Font, $Brush, [int]$X, [int]$Y)
    $G.DrawString($Str, $Font, $Brush, $X, $Y)
}

function HLine { param($G, [int]$Y) $G.DrawLine($penSoft, 50, $Y, 760, $Y) }

function SectionLabel {
    param($G, [string]$Label, [int]$Y)
    $bg = [System.Drawing.Color]::FromArgb(243, 244, 246)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), (New-Object System.Drawing.Rectangle(50, $Y, 710, 22)))
    DStr $G $Label $fontSmall $brushMuted 56 ($Y + 4)
}

function Canvas {
    param([string]$FileName)
    $bmp = New-Object System.Drawing.Bitmap(810, 1150)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.DrawRectangle($penBorder, (New-Object System.Drawing.Rectangle(40, 40, 730, 1070)))
    return @($bmp, $g, (Join-Path $OutputDir $FileName))
}

function Save {
    param($Bitmap, $Graphics, [string]$Path)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Graphics.Dispose()
    $Bitmap.Dispose()
    Write-Host "generated $Path"
}

function DrawDocHeader {
    param($G, [string]$SlipNo, [string]$SlipDate, [string]$Handler = "")
    # 3열: 좌(회사명) / 중앙(양식 제목) / 우(전표번호/일자/담당자)
    DStr $G $K_COMPANY $fontSmall $brushMuted 56 50       # 좌 — 회사명
    DStr $G $K_PURCHASE_TITLE $fontTitle $brushText 255 44  # 중앙 — 양식 제목 (20pt 700)
    DStr $G $K_SLIP_NO_LABEL $fontTiny $brushMuted 560 48
    DStr $G $SlipNo $fontSmall $brushBlue 624 48
    DStr $G "$K_ISSUE_DATE_LABEL $SlipDate" $fontTiny $brushMuted 560 64
    if ($Handler -ne "") { DStr $G "담당자: $Handler" $fontTiny $brushMuted 560 80 }
    $G.DrawLine($penBorder, 50, 98, 760, 98)
}

function DrawPartnerSection {
    param($G, [string]$BizNo, [int]$Y)
    # 거래처 정보 — 2열 그리드 (좌: 거래처/사업자번호, 우: 입고창고/담당자)
    $G.DrawRectangle($penBorder, (New-Object System.Drawing.Rectangle(50, $Y, 710, 54)))
    $G.DrawLine($penSoft, 405, $Y, 405, ($Y + 54))   # 가운데 구분선
    # 좌열
    DStr $G $K_PARTNER_LABEL $fontTiny $brushMuted 58 ($Y + 5)
    DStr $G $K_PARTNER_NAME $fontSmall $brushText 126 ($Y + 4)
    DStr $G $K_BIZ_NO_LABEL $fontTiny $brushMuted 58 ($Y + 24)
    DStr $G $BizNo $fontSmall $brushText 126 ($Y + 23)
    # 우열
    DStr $G $K_WAREHOUSE_LABEL $fontTiny $brushMuted 412 ($Y + 5)
    DStr $G $K_WAREHOUSE_NAME $fontSmall $brushText 478 ($Y + 4)
    DStr $G "담당자:" $fontTiny $brushMuted 412 ($Y + 24)
    DStr $G "홍길동" $fontSmall $brushText 478 ($Y + 23)
    return $Y + 60
}

function DrawTableHeader {
    param($G, [int]$Y)
    $G.FillRectangle(
        (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 240, 240))),
        (New-Object System.Drawing.Rectangle(50, $Y, 710, 22)))
    # 8 columns: No.(8mm) / 품목명(36) / 규격(28) / 수량(16) / 단가(26) / 공급가액(28) / 부가세(22) / 적요(가변)
    # pixel mapping (810px = 210mm → ~3.86px/mm)
    DStr $G "No."           $fontTiny $brushMuted  54 ($Y + 5)   # col-no
    DStr $G $K_PRODUCT_COL  $fontTiny $brushMuted  88 ($Y + 5)   # col-product
    DStr $G $K_SPEC_COL     $fontTiny $brushMuted 232 ($Y + 5)   # col-spec
    DStr $G $K_QTY          $fontTiny $brushMuted 344 ($Y + 5)   # col-qty
    DStr $G $K_UNIT_PRICE   $fontTiny $brushMuted 408 ($Y + 5)   # col-price
    DStr $G $K_SUPPLY_COL   $fontTiny $brushMuted 510 ($Y + 5)   # col-supply
    DStr $G $K_VAT_COL      $fontTiny $brushMuted 620 ($Y + 5)   # col-vat
    DStr $G $K_MEMO_COL     $fontTiny $brushMuted 706 ($Y + 5)   # col-memo
    $G.DrawLine($penBorder, 50, $Y, 760, $Y)
    $G.DrawLine($penBorder, 50, $Y + 22, 760, $Y + 22)
    return $Y + 22
}

function DrawTableRow {
    param($G, [int]$Y, [int]$No, [string]$Item, [string]$Spec, [int]$Qty, [string]$Price, [string]$Supply, [string]$Vat, [string]$Memo = "")
    # 8 columns aligned to DrawTableHeader positions
    DStr $G "$No"     $fontTiny $brushText  54 ($Y + 4)    # col-no
    DStr $G $Item     $fontTiny $brushText  88 ($Y + 4)    # col-product
    DStr $G $Spec     $fontTiny $brushGray 232 ($Y + 4)    # col-spec
    DStr $G "$Qty"    $fontTiny $brushText 344 ($Y + 4)    # col-qty
    DStr $G $Price    $fontTiny $brushText 400 ($Y + 4)    # col-price
    DStr $G $Supply   $fontTiny $brushText 502 ($Y + 4)    # col-supply
    DStr $G $Vat      $fontTiny $brushText 612 ($Y + 4)    # col-vat
    if ($Memo -ne "") { DStr $G $Memo $fontTiny $brushMuted 706 ($Y + 4) }  # col-memo
    $G.DrawLine($penSoft, 50, $Y + 26, 760, $Y + 26)
    return $Y + 26
}

function DrawTotals {
    param($G, [int]$Y, [string]$Supply, [string]$Vat, [string]$Total)
    $G.DrawLine($penBorder, 50, $Y, 760, $Y)
    $Y += 6
    DStr $G $K_SUPPLY $fontSmall $brushMuted 490 $Y
    DStr $G $Supply $fontBody $brushText 594 $Y
    $Y += 20
    DStr $G $K_VAT $fontSmall $brushMuted 490 $Y
    DStr $G $Vat $fontBody $brushText 594 $Y
    $Y += 20
    $G.DrawLine($penSoft, 480, $Y, 760, $Y)
    $Y += 5
    DStr $G $K_TOTAL $fontSmall $brushText 490 $Y
    DStr $G $Total $fontHead $brushText 572 ($Y - 2)
    return $Y + 28
}

function DrawInspectionSection {
    param($G, [int]$Y, [string]$InspectorName = "", [string]$InspDate = "")
    $G.DrawLine($penBorder, 50, $Y, 760, $Y)
    $Y += 6
    SectionLabel $G $K_INSPECT_SECTION $Y
    $Y += 26
    DStr $G $K_INSPECTOR $fontSmall $brushMuted 60 $Y
    if ($InspectorName -ne "") {
        DStr $G $InspectorName $fontBody $brushText 128 ($Y - 1)
        DStr $G $K_IN_MARK $fontBody $brushText 216 ($Y - 1)
    } else {
        $G.DrawRectangle($penDash, (New-Object System.Drawing.Rectangle(124, ($Y - 2), 180, 22)))
        DStr $G $K_HANDWRITE_SIGN $fontTiny $brushGray 152 $Y
    }
    DStr $G $K_INSPECT_DATE $fontSmall $brushMuted 370 $Y
    if ($InspDate -ne "") {
        DStr $G $InspDate $fontBody $brushText 448 ($Y - 1)
    } else {
        $G.DrawRectangle($penDash, (New-Object System.Drawing.Rectangle(444, ($Y - 2), 160, 22)))
        DStr $G $K_HANDWRITE_DATE $fontTiny $brushGray 468 $Y
    }
    $Y += 28
    DStr $G $K_HANDLER $fontSmall $brushMuted 60 $Y
    $G.DrawRectangle($penDash, (New-Object System.Drawing.Rectangle(124, ($Y - 2), 180, 22)))
    DStr $G $K_SUPPLIER_CONFIRM $fontSmall $brushMuted 370 $Y
    $G.DrawRectangle($penDash, (New-Object System.Drawing.Rectangle(462, ($Y - 2), 160, 22)))
    return $Y + 34
}

function DrawFooter {
    param($G, [int]$Y)
    $G.DrawLine($penBorder, 50, $Y, 760, $Y)
    $Y += 8
    DStr $G $K_FOOTER1 $fontTiny $brushMuted 56 $Y
    $Y += 14
    DStr $G $K_FOOTER2 $fontTiny $brushMuted 56 $Y
}

function DrawNote {
    param($G, [int]$Y, [string]$Msg, [string]$Tone = "info")
    $bg  = [System.Drawing.Color]::FromArgb(239, 246, 255)
    $pen = $penBlue
    $fg  = $brushBlue
    if ($Tone -eq "good")    { $bg = [System.Drawing.Color]::FromArgb(236, 253, 245); $pen = $penGreen; $fg = $brushGreen }
    if ($Tone -eq "warning") { $bg = [System.Drawing.Color]::FromArgb(255, 251, 235); $pen = $penOrange; $fg = $brushOrange }
    $rect = New-Object System.Drawing.Rectangle(50, $Y, 710, 40)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush($bg)), $rect)
    $G.DrawRectangle($pen, $rect)
    DStr $G $Msg $fontSmall $fg 60 ($Y + 12)
}

function Shot1 {
    $c = Canvas "01-purchase-print-form-full.png"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    DrawDocHeader $g "2026/05/18-1" "2026-05-18" "홍길동"
    $y = DrawPartnerSection $g "214-87-20659" 104
    $y = DrawTableHeader $g $y
    # 8컬럼: 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 적요
    $rows = @(
        @("SP-A100","220V/4HP",5,"1,200,000","6,000,000","600,000",""),
        @("SP-B200","380V/6HP",3,"1,800,000","5,400,000","540,000",""),
        @("SP-C300","220V/2HP",10,"680,000","6,800,000","680,000",""),
        @("SP-D400","380V/8HP",2,"2,500,000","5,000,000","500,000",""),
        @("SP-E500","220V/3HP",8,"920,000","7,360,000","736,000",""),
        @("FA-1001","1/2HP",4,"450,000","1,800,000","180,000",""),
        @("FA-2002","1HP",6,"550,000","3,300,000","330,000",""),
        @("FA-3003","2HP",2,"750,000","1,500,000","150,000",""),
        @("VD-001","",12,"380,000","4,560,000","456,000",$K_A_GRADE),
        @("VD-002","",7,"420,000","2,940,000","294,000",$K_B_GRADE)
    )
    $no = 1
    foreach ($row in $rows) { $y = DrawTableRow $g $y $no $row[0] $row[1] $row[2] $row[3] $row[4] $row[5] $row[6]; $no++ }
    $y = DrawTotals $g $y "40,600,000" "4,060,000" "44,660,000"
    $y = DrawInspectionSection $g $y $K_INSPECTOR_NAME "2026-05-18"
    DrawFooter $g $y
    DrawNote $g 1092 $K_NOTE1 "info"
    Save $bmp $g $path
}

function Shot2 {
    $bmp = New-Object System.Drawing.Bitmap(1280, 820)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $path = Join-Path $OutputDir "02-purchase-print-form-legacy-compare.png"
    DStr $g $K_COMPARE_TITLE $fontHead $brushText 40 20
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 251, 235))),
        (New-Object System.Drawing.Rectangle(40, 56, 565, 620)))
    $g.DrawRectangle($penOrange, (New-Object System.Drawing.Rectangle(40, 56, 565, 620)))
    DStr $g $K_GAS_TITLE $fontSmall $brushOrange 232 64
    $g.FillRectangle([System.Drawing.Brushes]::White, (New-Object System.Drawing.Rectangle(56, 90, 534, 36)))
    $g.DrawRectangle($penBorder, (New-Object System.Drawing.Rectangle(56, 90, 534, 36)))
    DStr $g $K_GAS_DOC_TITLE $fontBody $brushText 128 103
    $g.DrawRectangle($penBorder, (New-Object System.Drawing.Rectangle(56, 130, 534, 24)))
    DStr $g $K_GAS_PARTNER $fontSmall $brushText 64 137
    DStr $g $K_GAS_DATE $fontSmall $brushMuted 366 137
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(243,244,246))), (New-Object System.Drawing.Rectangle(56,158,534,20)))
    $g.DrawRectangle($penBorder, (New-Object System.Drawing.Rectangle(56,158,534,20)))
    DStr $g $K_ITEM_SPEC_HEADER $fontTiny $brushMuted 76 163
    DStr $g $K_QTY $fontTiny $brushMuted 266 163
    DStr $g $K_UNIT_PRICE $fontTiny $brushMuted 362 163
    DStr $g $K_AMOUNT $fontTiny $brushMuted 466 163
    for ($i=0;$i-lt5;$i++) {
        $ry=180+$i*22
        $g.DrawRectangle($penBorder,(New-Object System.Drawing.Rectangle(56,$ry,534,22)))
        $g.DrawString("SP-A$($i+1)00",$fontTiny,$brushText,64,($ry+5))
        $g.DrawString("$(5+$i)",$fontTiny,$brushText,278,($ry+5))
        $g.DrawString("1,200,000",$fontTiny,$brushText,356,($ry+5))
        $g.DrawString("$(6000000+$i*600000)",$fontTiny,$brushText,454,($ry+5))
    }
    $g.DrawRectangle($penBorder,(New-Object System.Drawing.Rectangle(56,292,534,26)))
    DStr $g $K_GAS_TOTAL $fontBody $brushText 276 299
    $ly=336; DStr $g $K_GAS_LIMITS $fontSmall $brushOrange 64 $ly; $ly+=20
    foreach ($lim in @($K_GAS_L1,$K_GAS_L2,$K_GAS_L3,$K_GAS_L4,$K_GAS_L5)) { DStr $g $lim $fontTiny $brushRed 70 $ly; $ly+=18 }
    $g.DrawString("=>",$fontHead,$brushMuted,618,360)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(236,253,245))),(New-Object System.Drawing.Rectangle(660,56,580,620)))
    $g.DrawRectangle($penGreen,(New-Object System.Drawing.Rectangle(660,56,580,620)))
    DStr $g $K_SP_TITLE $fontSmall $brushGreen 798 64
    $g.FillRectangle([System.Drawing.Brushes]::White,(New-Object System.Drawing.Rectangle(676,90,548,50)))
    $g.DrawRectangle($penBorder,(New-Object System.Drawing.Rectangle(676,90,548,50)))
    DStr $g $K_COMPANY $fontTiny $brushMuted 684 94
    DStr $g $K_PURCHASE_TITLE $fontHead $brushText 820 90
    DStr $g $K_SP_SLIP_NO $fontTiny $brushMuted 960 94
    DStr $g $K_SP_ISSUE $fontTiny $brushMuted 960 108
    $g.DrawRectangle($penBorder,(New-Object System.Drawing.Rectangle(676,144,548,42)))
    DStr $g $K_SP_PARTNER_ROW $fontSmall $brushText 684 150
    DStr $g $K_SP_BIZ $fontSmall $brushText 684 166
    DStr $g $K_SP_WAREHOUSE $fontSmall $brushText 916 150
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240,240,240))),(New-Object System.Drawing.Rectangle(676,190,548,20)))
    # SP 측 8컬럼 헤더
    DStr $g "No." $fontTiny $brushMuted 680 194
    DStr $g $K_PRODUCT_COL $fontTiny $brushMuted 706 194
    DStr $g $K_SPEC_COL $fontTiny $brushMuted 826 194
    DStr $g $K_QTY $fontTiny $brushMuted 908 194
    DStr $g $K_UNIT_PRICE $fontTiny $brushMuted 950 194
    DStr $g $K_SUPPLY_COL $fontTiny $brushMuted 1040 194
    DStr $g $K_VAT_COL $fontTiny $brushMuted 1126 194
    DStr $g $K_MEMO_COL $fontTiny $brushMuted 1182 194
    for ($i=0;$i-lt5;$i++) {
        $ry=212+$i*22; $g.DrawLine($penSoft,676,$ry,1224,$ry)
        $g.DrawString("$($i+1)",$fontTiny,$brushText,682,($ry+4))
        $g.DrawString("SP-A$($i+1)00",$fontTiny,$brushText,702,($ry+4))
        $g.DrawString("220V/4HP",$fontTiny,$brushGray,822,($ry+4))
        $g.DrawString("$(5+$i)",$fontTiny,$brushText,914,($ry+4))
        $g.DrawString("1,200,000",$fontTiny,$brushText,940,($ry+4))
        $g.DrawString("$(6000000+$i*600000)",$fontTiny,$brushText,1026,($ry+4))
        $g.DrawString("$(600000+$i*60000)",$fontTiny,$brushText,1118,($ry+4))
    }
    $g.DrawLine($penBorder,676,324,1224,324); DStr $g $K_SP_TOTAL $fontBody $brushText 876 329
    $g.DrawRectangle($penDash,(New-Object System.Drawing.Rectangle(676,358,548,44)))
    DStr $g $K_SP_INSPECT $fontSmall $brushText 684 366
    DStr $g $K_SP_SUPPLIER_SIGN $fontSmall $brushMuted 684 383
    $ly=422; DStr $g $K_SP_GAINS $fontSmall $brushGreen 676 $ly; $ly+=20
    foreach ($gain in @($K_SP_G1,$K_SP_G2,$K_SP_G3,$K_SP_G4,$K_SP_G5)) { DStr $g $gain $fontTiny $brushGreen 682 $ly; $ly+=18 }
    Save $bmp $g $path
}

function Shot3 {
    $c = Canvas "03-purchase-print-form-multiline.png"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    DrawDocHeader $g "2026/05/18-3" "2026-05-18" "홍길동"
    $y = DrawPartnerSection $g "214-87-20659" 104
    $y = DrawTableHeader $g $y
    # 8컬럼: 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 적요
    $rows = @(
        @("SP-A100","220V/4HP",5,"1,200,000","6,000,000","600,000",""),
        @("SP-B200","380V/6HP",3,"1,800,000","5,400,000","540,000",""),
        @("SP-C300","220V/2HP",10,"680,000","6,800,000","680,000",""),
        @("SP-D400","380V/8HP",2,"2,500,000","5,000,000","500,000",""),
        @("SP-E500","220V/3HP",8,"920,000","7,360,000","736,000",""),
        @("FA-1001","1/2HP",4,"450,000","1,800,000","180,000",""),
        @("FA-2002","1HP",6,"550,000","3,300,000","330,000",""),
        @("FA-3003","2HP",2,"750,000","1,500,000","150,000",""),
        @("VD-001","",12,"380,000","4,560,000","456,000",$K_A_GRADE),
        @("VD-002","",7,"420,000","2,940,000","294,000",$K_B_GRADE),
        @("VD-003","",3,"500,000","1,500,000","150,000",""),
        @("AC-501",$K_TON1,1,"3,200,000","3,200,000","320,000",$K_NEW_STR),
        @("AC-502",$K_TON1_5,1,"4,100,000","4,100,000","410,000",$K_NEW_STR),
        @("AC-601",$K_INV,2,"2,800,000","5,600,000","560,000",""),
        @("AC-701",$K_HEATPUMP,1,"5,600,000","5,600,000","560,000","")
    )
    $no=1; foreach ($row in $rows) { $y = DrawTableRow $g $y $no $row[0] $row[1] $row[2] $row[3] $row[4] $row[5] $row[6]; $no++ }
    $y = DrawTotals $g $y "64,660,000" "6,466,000" "71,126,000"
    $y = DrawInspectionSection $g $y $K_INSPECTOR2_NAME "2026-05-18"
    DrawFooter $g $y
    DrawNote $g 1092 $K_NOTE3 "info"
    Save $bmp $g $path
}

function Shot4 {
    $c = Canvas "04-purchase-print-form-blank-inspection.png"
    $bmp = $c[0]; $g = $c[1]; $path = $c[2]
    DrawDocHeader $g "2026/05/18-4" "2026-05-18" "홍길동"
    $y = DrawPartnerSection $g "214-87-20659" 104
    $y = DrawTableHeader $g $y
    # 8컬럼: 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 적요
    $rows = @(
        @("SP-A100","220V/4HP",5,"1,200,000","6,000,000","600,000",""),
        @("SP-B200","380V/6HP",3,"1,800,000","5,400,000","540,000",""),
        @("SP-C300","220V/2HP",10,"680,000","6,800,000","680,000","")
    )
    $no=1; foreach ($row in $rows) { $y = DrawTableRow $g $y $no $row[0] $row[1] $row[2] $row[3] $row[4] $row[5] $row[6]; $no++ }
    $y = DrawTotals $g $y "16,527,272" "1,652,728" "18,180,000"
    $G=$g; $G.DrawLine($penBorder,50,$y,760,$y); $y+=6
    SectionLabel $G $K_INSPECT_BLANK $y; $y+=26
    DStr $G $K_INSPECTOR $fontSmall $brushMuted 60 $y
    $ib=New-Object System.Drawing.Rectangle(124,($y-2),200,28)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,251,235))),$ib)
    $G.DrawRectangle($penDash,$ib); DStr $G $K_HANDWRITE_SIGN $fontTiny $brushGray 150 ($y+8)
    DStr $G $K_INSPECT_DATE $fontSmall $brushMuted 370 $y
    $db=New-Object System.Drawing.Rectangle(448,($y-2),180,28)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,251,235))),$db)
    $G.DrawRectangle($penDash,$db); DStr $G "____-__-__" $fontSmall $brushGray 468 ($y+6)
    $y+=42
    DStr $G $K_HANDLER $fontSmall $brushMuted 60 $y
    $hb=New-Object System.Drawing.Rectangle(124,($y-2),200,28)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,251,235))),$hb)
    $G.DrawRectangle($penDash,$hb); DStr $G $K_HANDWRITE_SIGN $fontTiny $brushGray 150 ($y+8)
    DStr $G $K_SUPPLIER_CONFIRM $fontSmall $brushMuted 370 $y
    $sb=New-Object System.Drawing.Rectangle(468,($y-2),200,28)
    $G.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,251,235))),$sb)
    $G.DrawRectangle($penDash,$sb); DStr $G $K_HANDWRITE_SIGN $fontTiny $brushGray 492 ($y+8)
    $y+=48; DrawFooter $g $y
    DrawNote $g 1092 $K_NOTE4 "warning"
    Save $bmp $g $path
}

Shot1; Shot2; Shot3; Shot4

Write-Host "SP-08-5-5 QA mock screenshots generated."
Get-ChildItem $OutputDir -Filter *.png | Select-Object Name, Length