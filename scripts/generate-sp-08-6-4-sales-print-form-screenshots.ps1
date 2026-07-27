param(
    [string]$OutputDir = ''
)
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# 대조-1 (2026-07-28 R1 적대검증): 이전에는 이 param 기본값 자체가 무가드 인라인
# 삼항식($env:QA_SHOTS_DIR 를 그대로 대입)이라 discoverQaResolverSources() 의 함수
# 선언 전용 탐지 정규식 밖이었다. 공유 Resolve-QaShotsDir 로 옮겨 물리 판정을 받는다.
if (-not $OutputDir) { $OutputDir = Resolve-QaShotsDir -CommittedDir (Join-Path $PSScriptRoot '..\docs\qa\sp-08-6-4-sales-print-form\screenshots') }
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Unicode escape helper (SP-08-5-5 pattern)
function U {
    param([string]$Text)
    return [regex]::Replace($Text, "\\u([0-9A-Fa-f]{4})", {
        param($m)
        [char][Convert]::ToInt32($m.Groups[1].Value, 16)
    })
}

function New-Font {
    param([int]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
    $mg = "Malgun Gothic"
    $families = @("Pretendard", $mg)
    foreach ($family in $families) {
        try {
            $font = New-Object System.Drawing.Font($family, $Size, $Style)
            if ($font.Name -eq $family) { return $font }
        } catch { }
    }
    return New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $Size, $Style)
}

$fT  = New-Font 18 ([System.Drawing.FontStyle]::Bold)
$fH  = New-Font 14 ([System.Drawing.FontStyle]::Bold)
$fSH = New-Font 11 ([System.Drawing.FontStyle]::Bold)
$fB  = New-Font 11
$fS  = New-Font 9
$fX  = New-Font 8

$bk   = [System.Drawing.Brushes]::Black
$bMut = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 98, 115))
$bBlu = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
$bGrn = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(4, 120, 87))
$bRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
$bGry = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(156, 163, 175))
$bOrg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 83, 9))
$bWht = [System.Drawing.Brushes]::White
$bLG  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 249, 250))
$bHdr = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 246, 255))
$pBrd = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(55, 65, 81), 1)
$pSft = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(209, 213, 219), 1)
$pDsh = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(156, 163, 175), 1)
$pDsh.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash

# ===== Korean string constants (ALL \uXXXX escape - no raw Korean chars) =====
# 거   래   명   세   서 = "거 래 명 세 서"
$STMT  = U "거 래 명 세 서"
# 세   금   계   산   서 = "세 금 계 산 서"
$INVT  = U "세 금 계 산 서"
# (gonggeupbadneunja bogyanyong)
$INVSUB= U "(공급받는자 보관용)"
# (ju)samhan gongjosiseutem
$COMP  = U "(주)삼한공조시스템"
# Seoul Seocho-gu ...
$CADDR = U "서울 서초구 마방로2길 9"
# saeopjabeonho: 214-87-20659
$CBIZ  = U "사업자번호: 214-87-20659"
# daepyoja: kim mi seon
$CCEO  = U "대표자: 김미선"
# jeonpyobeonho
$SLNL  = U "전표번호"
# balhaengil
$ISSDL = U "발행일"
# geuraecheo
$PARTL = U "거래처"
# saeopjabeonho
$BIZNL = U "사업자번호"
# gonggeupgaaek
$SUPL  = U "공급가액"
# bugase
$VATL  = U "부가세"
# hapgye
$TOTL  = U "합계"
# pumok
$PRODL = U "품목"
# gyugyeok
$SPCL  = U "규격"
# sulyang
$QTYL  = U "수량"
# danga
$PRCL  = U "단가"
# bigo
$NOTL  = U "비고"
# gonggeupja
$SUPR  = U "공급자"
# gonggeupbadneunja
$RECVR = U "공급받는자"
# samhan gongjo (ju)
$PNMV  = U "삼한공조 (주)"
# damdangja
$SGNL  = U "담당자"
# insuja
$RCPL  = U "인수자"
# [in]
$SEAL  = U "[인]"
# [jikin]
$DSEAL = U "[직인]"
# insae
$PRNL  = U "인쇄"
# sangserero doragagi
$BCKL  = U "상세로 돌아가기"
# [UUID bigongae] slipNo man pyosi
$UUIDL = U "[UUID 비공개] slipNo 만 표시"
# insae si michullyeok
$NOPRL = U "(인쇄 시 미출력)"
# daejung rain 12hang
$MLTIL = U "다중 라인 (12행)"
# page bunhal rain
$PGBKL = U "--- 페이지 분할 라인 ---"
# deungrokbeonho
$REGNL = U "등록번호"
# sangho(beobin myeong)
$CNML  = U "상호(법인명)"
# saeopjangjooso
$BADRL = U "사업장주소"
# eoptae
$BTPL  = U "업태"
# jongmok
$BITML = U "종목"
# domaee mit somaeeob
$BTPV  = U "도매 및 소매업"
# gongjoseolbi naengnanbangi
$BITMV = U "공조설비, 냉난방기"
# jakseong inja
$WDTL  = U "작성일자"
# gong geup ga aek (spaced)
$SUPLC = U "공 급 가 액"
# se aek (spaced)
$VATC  = U "세 액"
# hapgye geum aek
$TAMT  = U "합계금액"
# hangul ilgeum palbaegwon jeong
$KAMT  = U "한글: 일금 팔백원 정"
# yeongsu/cheongu check
$RCHK  = U "□ 영수  ■ 청구"
# products
$P1    = U "냉방기 에어콘 4호"
$P2    = U "동기 유닛"
$P3    = U "팬코일 유닛"
$P4    = U "조절밸브"
$P5    = U "프레온"
$P6    = U "필터마트"
$P7    = U "냉매유"
$P8    = U "코일클리너"
$P9    = U "버터플라이"
$P10   = U "드레인파이프"
$P11   = U "인실레이션"
$P12   = U "보온재"
$PRODS = @($P1,$P2,$P3,$P4,$P5,$P6,$P7,$P8,$P9,$P10,$P11,$P12)
# chaekbeonho
$BKNO  = U "책번호         권              호"
# iryeonbeonho:
$SRLNO = U "일련번호: 20260518-0007"
# Seoul Gangnam-gu
$ADR   = U "서울시 강남구"
# yeollakcheo:
$PHON  = U "연락처: 02-1234-5678"
# jejoeeob
$MFG   = U "제조업"
# gigyebupum
$MPART = U "기계부품"
# compare panel
$CTIT  = U "[SP-08-6-4] legacy GAS vs Samhan Public 비교"
$CFOOT = U "[SP-08-6-4 T2/T3] legacy GAS 매칭 개선 항목"
$CGL   = U "legacy GAS (Google Apps Script)"
$CSL   = U "Samhan Public (SP-08-6-4)"
$CL1   = U "슬립번호"
$CL2   = U "사업자번호"
$CL3   = U "@page 규칙"
$CL4   = U "@media print"
$CL5   = U "공급가액 분리"
$CL6   = U "window.print"
$CL7   = U "한글 금액"
$CL8   = U "2-panel 계산서"
$GV1   = U "UUID 직접 노출 (v4)"
$GV2   = U "공급자 미존재"
$GV3   = U "page 미적용 -- 크기 미보장"
$GV4   = U "media print 미적용"
$GV5   = U "단일 합계칸만"
$GV6   = U "수동 Ctrl+P"
$GV7   = U "미지원"
$GV8   = U "없음 -- 단일 양식"
$SV1   = U "slipNo (2026/05/18-7) 만 표시"
$SV2   = U "COMPANY.businessRegNo 표시"
$SV3   = U "@page { size: A4; } 적용"
$SV4   = U ".no-print 숨김 + A4 보장"
$SV5   = U "supply / vat / total 3열 분리"
$SV6   = U "PrintLayout 인쇄 버튼 자동"
$SV7   = U "toKoreanAmount() 한글 표기"
$SV8   = U "공급자 + 공급받는자 NTS"
$KIMSH = U "김삼한  [인]"
$ARR   = U "→"
# ============================================================
# PNG 01 -- sales-statement-full
# ============================================================
Write-Host "PNG 01: sales-statement-full..."
$W = 794; $H = 1123
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.FillRectangle($bLG, 0, 0, $W, 36)
$g.DrawRectangle($pSft, 0, 0, $W - 1, 35)
$g.DrawString($BCKL, $fS, $bMut, 10, 10)
$g.DrawString($PRNL, $fS, $bBlu, 120, 10)
$g.DrawString($NOPRL, $fX, $bGry, 200, 12)
$g.DrawRectangle($pBrd, 20, 44, $W - 40, $H - 64)
$g.FillRectangle($bHdr, 21, 45, $W - 42, 80)
$g.DrawRectangle($pSft, 21, 45, $W - 42, 80)
$g.DrawString($COMP, $fSH, $bk, 32, 52)
$g.DrawString($CBIZ, $fX, $bMut, 32, 70)
$g.DrawString($CCEO, $fX, $bMut, 32, 85)
$sz = $g.MeasureString($STMT, $fT)
$g.DrawString($STMT, $fT, $bk, ($W - $sz.Width) / 2, 55)
$g.DrawString($SLNL + ": 2026/05/18-7", $fS, $bk, 560, 52)
$g.DrawString($ISSDL + ": 2026-05-18", $fS, $bk, 560, 68)
$g.DrawString($UUIDL, $fX, $bGrn, 560, 84)
$g.DrawRectangle($pSft, 21, 125, $W - 42, 55)
$g.DrawString($PARTL + ": " + $PNMV, $fB, $bk, 32, 132)
$g.DrawString($BIZNL + ": 123-45-67890", $fS, $bMut, 32, 148)
$g.DrawString($ADR, $fX, $bMut, 350, 132)
$g.DrawString($PHON, $fX, $bMut, 350, 148)
$tY = 185
$g.FillRectangle($bHdr, 21, $tY, $W - 42, 22)
$g.DrawRectangle($pBrd, 21, $tY, $W - 42, 22)
$cs = @(30, 70, 230, 320, 380, 460, 560, 660)
$hs = @("No.", $PRODL, $SPCL, $QTYL, $PRCL, $SUPL, $VATL, $NOTL)
for ($i = 0; $i -lt $hs.Count; $i++) {
    $g.DrawString($hs[$i], $fX, $bk, $cs[$i], $tY + 5)
    if ($i -gt 0) { $g.DrawLine($pSft, $cs[$i] - 5, $tY, $cs[$i] - 5, $tY + 22) }
}
$lA = @(6000000, 1700000, 450000, 960000, 240000, 127500)
$lQ = @("5", "2", "10", "3", "20", "15")
$lP = @("1,200,000", "850,000", "45,000", "320,000", "12,000", "8,500")
$lS = @("RAC-400", "OD-100A", "FC-200", "VLV-50B", "PRE-A3", "FM-300")
$lN = @($P1, $P2, $P3, $P4, $P5, $P6)
for ($r = 0; $r -lt 6; $r++) {
    $rY = $tY + 22 + ($r * 20)
    if ($r % 2 -eq 1) { $g.FillRectangle($bLG, 22, $rY, $W - 44, 20) }
    $g.DrawLine($pSft, 21, $rY + 20, $W - 21, $rY + 20)
    $g.DrawString(($r + 1).ToString(), $fX, $bk, $cs[0], $rY + 4)
    $g.DrawString($lN[$r], $fX, $bk, $cs[1], $rY + 4)
    $g.DrawString($lS[$r], $fX, $bMut, $cs[2], $rY + 4)
    $g.DrawString($lQ[$r], $fX, $bk, $cs[3], $rY + 4)
    $g.DrawString($lP[$r], $fX, $bk, $cs[4], $rY + 4)
    $g.DrawString($lA[$r].ToString("N0"), $fX, $bk, $cs[5], $rY + 4)
    $g.DrawString(([int]($lA[$r] * 0.1)).ToString("N0"), $fX, $bk, $cs[6], $rY + 4)
}
$tSup = ($lA | Measure-Object -Sum).Sum
$tVat = [int]($tSup * 0.1)
$tTot = $tSup + $tVat
$sy1 = $tY + 22 + (6 * 20)
$g.FillRectangle($bHdr, 21, $sy1, $W - 42, 22)
$g.DrawRectangle($pSft, 21, $sy1, $W - 42, 22)
$g.DrawString($SUPL + ": " + $tSup.ToString("N0"), $fS, $bk, 400, $sy1 + 4)
$g.DrawString($VATL + ": " + $tVat.ToString("N0"), $fS, $bk, 550, $sy1 + 4)
$sy2 = $sy1 + 22
$g.FillRectangle($bHdr, 21, $sy2, $W - 42, 22)
$g.DrawRectangle($pBrd, 21, $sy2, $W - 42, 22)
$g.DrawString($TOTL + ": " + $tTot.ToString("N0"), $fSH, $bk, 530, $sy2 + 3)
$ny = $sy2 + 28
$g.DrawString($NOTL + ":", $fS, $bMut, 32, $ny)
$g.DrawRectangle($pDsh, 21, $ny + 18, $W - 42, 30)
$fy = $ny + 60
$fw = ($W - 42) / 3
$g.DrawRectangle($pSft, 21, $fy, $fw, 55)
$g.DrawString($SGNL, $fS, $bMut, 32, $fy + 8)
$g.DrawString($KIMSH, $fB, $bk, 32, $fy + 28)
$g.DrawRectangle($pSft, 21 + $fw, $fy, $fw, 55)
$g.DrawString($RCPL, $fS, $bMut, 32 + $fw, $fy + 8)
$g.DrawString($SEAL, $fB, $bGry, 32 + $fw, $fy + 28)
$g.DrawRectangle($pSft, 21 + 2*$fw, $fy, $fw, 55)
$g.DrawString($COMP, $fS, $bk, 32 + 2*$fw, $fy + 8)
$g.DrawString($DSEAL, $fB, $bk, 32 + 2*$fw, $fy + 28)
$g.DrawString("[SP-08-6-4] " + $UUIDL, $fX, $bGrn, 32, $H - 30)
$bmp.Save("$OutputDir\01-sales-statement-full.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "  OK: 01"

# ============================================================
# PNG 02 -- sales-invoice-full (2-panel)
# ============================================================
Write-Host "PNG 02: sales-invoice-full..."
$W = 794; $H = 1123
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.FillRectangle($bLG, 0, 0, $W, 36)
$g.DrawRectangle($pSft, 0, 0, $W - 1, 35)
$g.DrawString($BCKL, $fS, $bMut, 10, 10)
$g.DrawString($PRNL, $fS, $bBlu, 120, 10)
$g.DrawRectangle($pBrd, 20, 44, $W - 40, $H - 64)
$g.DrawString($BKNO, $fS, $bMut, 32, 52)
$g.DrawString($SRLNO, $fS, $bMut, 32, 68)
$isz = $g.MeasureString($INVT, $fT)
$g.DrawString($INVT, $fT, $bRed, ($W - $isz.Width) / 2 - 60, 52)
$g.DrawString($INVSUB, $fS, $bRed, ($W - $isz.Width) / 2 + 140, 76)
$pY = 100; $pH = 130; $mX = [int]($W / 2)
$g.DrawRectangle($pBrd, 20, $pY, $mX - 20, $pH)
$g.FillRectangle($bHdr, 21, $pY + 1, 28, $pH - 2)
$g.DrawLine($pSft, 49, $pY, 49, $pY + $pH)
$g.DrawString($SUPR, $fX, $bk, 22, $pY + 50)
$sLbls = @($REGNL, $CNML, $BADRL, $BTPL, $BITML)
$sVals = @("214-87-20659", $COMP, $CADDR, $BTPV, $BITMV)
for ($i = 0; $i -lt 5; $i++) {
    $ry = $pY + 5 + ($i * 22)
    $g.DrawString($sLbls[$i], $fX, $bMut, 54, $ry)
    $g.DrawString($sVals[$i], $fX, $bk, 130, $ry)
    if ($i -lt 4) { $g.DrawLine($pSft, 50, $ry + 17, $mX - 21, $ry + 17) }
}
$g.DrawRectangle($pBrd, $mX, $pY, $mX - 20, $pH)
$g.FillRectangle($bHdr, $mX + 1, $pY + 1, 28, $pH - 2)
$g.DrawLine($pSft, $mX + 29, $pY, $mX + 29, $pY + $pH)
$g.DrawString($RECVR, $fX, $bk, $mX + 2, $pY + 45)
$rLbls = @($REGNL, $CNML, $BADRL, $BTPL, $BITML)
$rVals = @("987-65-43210", $PNMV, $ADR, $MFG, $MPART)
for ($i = 0; $i -lt 5; $i++) {
    $ry = $pY + 5 + ($i * 22)
    $g.DrawString($rLbls[$i], $fX, $bMut, $mX + 34, $ry)
    $g.DrawString($rVals[$i], $fX, $bk, $mX + 120, $ry)
    if ($i -lt 4) { $g.DrawLine($pSft, $mX + 1, $ry + 17, $W - 21, $ry + 17) }
}
$aY = $pY + $pH + 5
$g.DrawRectangle($pBrd, 20, $aY, $W - 40, 44)
$g.FillRectangle($bHdr, 21, $aY + 1, 70, 43)
$g.DrawString($WDTL, $fX, $bMut, 24, $aY + 5)
$g.DrawString("2026. 05. 18.", $fS, $bk, 24, $aY + 22)
$g.DrawLine($pSft, 90, $aY, 90, $aY + 44)
$g.DrawString($SUPLC, $fX, $bMut, 96, $aY + 5)
$g.DrawString("9,477,500", $fSH, $bk, 96, $aY + 22)
$g.DrawLine($pSft, 440, $aY, 440, $aY + 44)
$g.DrawString($VATC, $fX, $bMut, 450, $aY + 5)
$g.DrawString("947,750", $fSH, $bk, 450, $aY + 22)
$tiY = $aY + 50
$g.FillRectangle($bHdr, 21, $tiY, $W - 42, 20)
$g.DrawRectangle($pBrd, 21, $tiY, $W - 42, 20)
$tiC = @(26, 54, 80, 250, 340, 400, 480, 590, 680)
$tiHd = @(U "월", U "일", U "품 목", U "규 격", U "수 량", U "단 가", $SUPLC, $VATC, U "비 고")
for ($i = 0; $i -lt $tiHd.Count; $i++) {
    $g.DrawString($tiHd[$i], $fX, $bk, $tiC[$i], $tiY + 4)
    if ($i -gt 0) { $g.DrawLine($pSft, $tiC[$i] - 3, $tiY, $tiC[$i] - 3, $tiY + 20) }
}
$tiA = @(6000000, 1700000, 450000, 0)
$tiN = @($P1, $P2, $P3, "")
$tiS = @("RAC-400", "OD-100A", "FC-200", "")
$tiQ = @("5", "2", "10", "")
$tiP = @("1,200,000", "850,000", "45,000", "")
for ($r = 0; $r -lt 4; $r++) {
    $ry = $tiY + 20 + ($r * 18)
    if ($r % 2 -eq 1) { $g.FillRectangle($bLG, 22, $ry, $W - 44, 18) }
    $g.DrawLine($pSft, 21, $ry + 18, $W - 21, $ry + 18)
    if ($tiA[$r] -gt 0) {
        $g.DrawString("05", $fX, $bk, $tiC[0], $ry + 3)
        $g.DrawString("18", $fX, $bk, $tiC[1], $ry + 3)
        $g.DrawString($tiN[$r], $fX, $bk, $tiC[2], $ry + 3)
        $g.DrawString($tiS[$r], $fX, $bMut, $tiC[3], $ry + 3)
        $g.DrawString($tiQ[$r], $fX, $bk, $tiC[4], $ry + 3)
        $g.DrawString($tiP[$r], $fX, $bk, $tiC[5], $ry + 3)
        $g.DrawString($tiA[$r].ToString("N0"), $fX, $bk, $tiC[6], $ry + 3)
        $g.DrawString(([int]($tiA[$r] * 0.1)).ToString("N0"), $fX, $bk, $tiC[7], $ry + 3)
    }
}
$btY = $tiY + 20 + (4 * 18) + 5
$g.DrawRectangle($pBrd, 21, $btY, $W - 42, 40)
$g.DrawString($TAMT, $fS, $bk, 30, $btY + 5)
$g.DrawString("8,425,250", $fSH, $bk, 120, $btY + 5)
$g.DrawString($KAMT, $fS, $bMut, 30, $btY + 24)
$g.DrawString($RCHK, $fB, $bk, 560, $btY + 12)
$g.DrawString("[SP-08-6-4] " + $UUIDL, $fX, $bGrn, 32, $H - 30)
$bmp.Save("$OutputDir\02-sales-invoice-full.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "  OK: 02"

# ============================================================
# PNG 03 -- multiline 12 rows
# ============================================================
Write-Host "PNG 03: multiline..."
$W = 794; $H = 1123
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.FillRectangle($bLG, 0, 0, $W, 36)
$g.DrawRectangle($pSft, 0, 0, $W - 1, 35)
$g.DrawString($BCKL, $fS, $bMut, 10, 10)
$g.DrawString($PRNL, $fS, $bBlu, 120, 10)
$g.DrawRectangle($pBrd, 20, 44, $W - 40, $H - 64)
$g.FillRectangle($bBlu, 30, 52, 160, 22)
$g.DrawString($MLTIL, $fS, $bWht, 35, 56)
$g.FillRectangle($bHdr, 21, 80, $W - 42, 60)
$mlx = ($W - 300) / 2
$g.DrawString($STMT, $fH, $bk, $mlx, 88)
$g.DrawString($SLNL + ": 2026/05/18-8", $fS, $bk, 560, 86)
$g.DrawString($ISSDL + ": 2026-05-18", $fS, $bk, 560, 102)
$m2Y = 148
$g.FillRectangle($bHdr, 21, $m2Y, $W - 42, 20)
$g.DrawRectangle($pBrd, 21, $m2Y, $W - 42, 20)
for ($i = 0; $i -lt $hs.Count; $i++) {
    $g.DrawString($hs[$i], $fX, $bk, $cs[$i], $m2Y + 4)
    if ($i -gt 0) { $g.DrawLine($pSft, $cs[$i] - 5, $m2Y, $cs[$i] - 5, $m2Y + 20) }
}
$mlTot = 0
for ($r = 0; $r -lt 12; $r++) {
    $rY = $m2Y + 20 + ($r * 18)
    if ($r % 2 -eq 1) { $g.FillRectangle($bLG, 22, $rY, $W - 44, 18) }
    $g.DrawLine($pSft, 21, $rY + 18, $W - 21, $rY + 18)
    $amt = 100000 + ($r * 50000)
    $mlTot += $amt
    $g.DrawString(($r + 1).ToString(), $fX, $bk, $cs[0], $rY + 3)
    $g.DrawString($PRODS[$r], $fX, $bk, $cs[1], $rY + 3)
    $g.DrawString("TYPE-" + ($r + 1).ToString("D2"), $fX, $bMut, $cs[2], $rY + 3)
    $g.DrawString("1", $fX, $bk, $cs[3], $rY + 3)
    $g.DrawString($amt.ToString("N0"), $fX, $bk, $cs[4], $rY + 3)
    $g.DrawString($amt.ToString("N0"), $fX, $bk, $cs[5], $rY + 3)
    $g.DrawString(([int]($amt * 0.1)).ToString("N0"), $fX, $bk, $cs[6], $rY + 3)
}
$mlV = [int]($mlTot * 0.1)
$mlG = $mlTot + $mlV
$ms1 = $m2Y + 20 + (12 * 18)
$g.FillRectangle($bHdr, 21, $ms1, $W - 42, 22)
$g.DrawRectangle($pBrd, 21, $ms1, $W - 42, 22)
$g.DrawString($SUPL + ": " + $mlTot.ToString("N0"), $fS, $bk, 340, $ms1 + 4)
$g.DrawString($VATL + ": " + $mlV.ToString("N0"), $fS, $bk, 510, $ms1 + 4)
$ms2 = $ms1 + 22
$g.FillRectangle($bHdr, 21, $ms2, $W - 42, 22)
$g.DrawRectangle($pBrd, 21, $ms2, $W - 42, 22)
$g.DrawString($TOTL + ": " + $mlG.ToString("N0"), $fSH, $bk, 510, $ms2 + 3)
$pbY = $H - 130
$g.DrawLine($pDsh, 20, $pbY, $W - 20, $pbY)
$g.DrawString($PGBKL, $fX, $bOrg, 80, $pbY + 3)
$g.DrawString("[SP-08-6-4 T1] " + $MLTIL, $fX, $bGrn, 32, $H - 30)
$bmp.Save("$OutputDir\03-multiline.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "  OK: 03"

# ============================================================
# PNG 04 -- legacy-compare
# ============================================================
Write-Host "PNG 04: legacy-compare..."
$W = 900; $H = 620
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(249, 250, 251))
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.FillRectangle($bBlu, 0, 0, $W, 40)
$g.DrawString($CTIT, $fSH, $bWht, 20, 10)
$g.FillRectangle($bWht, 10, 50, 400, 545)
$g.DrawRectangle($pBrd, 10, 50, 400, 545)
$g.FillRectangle($bOrg, 10, 50, 400, 28)
$g.DrawString($CGL, $fS, $bWht, 18, 57)
$gasL = @($CL1, $CL2, $CL3, $CL4, $CL5, $CL6, $CL7, $CL8)
$gasV = @($GV1, $GV2, $GV3, $GV4, $GV5, $GV6, $GV7, $GV8)
for ($i = 0; $i -lt 8; $i++) {
    $iy = 90 + ($i * 60)
    $g.FillRectangle($bLG, 14, $iy, 392, 54)
    $g.DrawRectangle($pSft, 14, $iy, 392, 54)
    $g.DrawString($gasL[$i], $fS, $bk, 20, $iy + 6)
    $g.DrawString($gasV[$i], $fX, $bRed, 20, $iy + 28)
}
$g.FillRectangle($bWht, 490, 50, 400, 545)
$g.DrawRectangle($pBrd, 490, 50, 400, 545)
$g.FillRectangle($bGrn, 490, 50, 400, 28)
$g.DrawString($CSL, $fS, $bWht, 498, 57)
$spL = @($CL1, $CL2, $CL3, $CL4, $CL5, $CL6, $CL7, $CL8)
$spV = @($SV1, $SV2, $SV3, $SV4, $SV5, $SV6, $SV7, $SV8)
for ($i = 0; $i -lt 8; $i++) {
    $iy = 90 + ($i * 60)
    $g.FillRectangle($bLG, 494, $iy, 392, 54)
    $g.DrawRectangle($pSft, 494, $iy, 392, 54)
    $g.DrawString($spL[$i], $fS, $bk, 500, $iy + 6)
    $g.DrawString($spV[$i], $fX, $bGrn, 500, $iy + 28)
}
for ($i = 0; $i -lt 8; $i++) {
    $g.DrawString($ARR, $fH, $bBlu, 432, 107 + ($i * 60))
}
$g.DrawString($CFOOT, $fX, $bBlu, 20, 600)
$bmp.Save("$OutputDir\04-legacy-compare.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "  OK: 04"

$fT.Dispose(); $fH.Dispose(); $fSH.Dispose()
$fB.Dispose(); $fS.Dispose(); $fX.Dispose()
$bMut.Dispose(); $bBlu.Dispose(); $bGrn.Dispose()
$bRed.Dispose(); $bGry.Dispose(); $bOrg.Dispose()
$bLG.Dispose(); $bHdr.Dispose()
$pBrd.Dispose(); $pSft.Dispose(); $pDsh.Dispose()

Write-Host ""
Write-Host "SP-08-6-4 PNG 4 files done" -ForegroundColor Green
