# PR #1175 재수렴 적대검증

- 검증일: 2026-08-12
- 대상: `feat/883-s4-order-ds-migration`, 사용자 제공 HEAD `9f16ff9ce`
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 제약 준수: git 명령 미사용, 공유 `samhan-*` 스택 쓰기 미수행
- 진행 판정: 완료

## 1. 기준점 및 증거 무결성 1차 측정

### 실행 명령

```powershell
$p='clients/desktop/src/renderer/components/sales/sales.module.css'; $lines=(Get-Content -LiteralPath $p -Encoding UTF8).Count; $selectors=(Select-String -LiteralPath $p -Pattern '^\.[A-Za-z_][A-Za-z0-9_-]*' -AllMatches | ForEach-Object { $_.Matches.Value.TrimStart('.') } | Sort-Object -Unique).Count; "lines=$lines`nunique_top_level_class_selectors=$selectors"
```

### 실행 원문

```text
lines=533
unique_top_level_class_selectors=44
```

### 판정

현재 파일은 최초 이관 보고서와 브리핑의 `513줄`이 아니라 **533줄**이다. 원인은 fix1에서 살아 있는 `.btnMini` 규칙 20줄(주석·공백 포함)을 복구했기 때문이다. 따라서 `1,194 → 513줄`을 현재 HEAD의 원문/실측으로 계속 제시하면 재현되지 않는다. 현재 HEAD의 재현 수치는 **1,194 → 533줄**이다.

위 `44`는 중첩·pseudo selector의 줄까지 세는 단순 기준점이므로 class 정의 개수 판정에는 사용하지 않는다. 별도 파서로 importer 참조와 독립 정의를 대조한다.

이 항목은 사용자 도달 결함이 아니라, 사용자 지시의 유일한 예외인 **증거 무결성 불일치**로 잠정 등록한다.

## 2. fix3 Playwright 재현

### 실행 명령

```powershell
npx playwright test playwright/phase-2-6a-order-convert --reporter=line
```

실행 위치: `clients/desktop`

### 실행 원문

```text
Running 12 tests using 1 worker

[1/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:188:3 › Phase 2.6a 출고전표 전환 › 시나리오 1: DRAFT 주문 → 전환 버튼 노출 · 클릭 → 모달(라인+비가역경고) 열림
[2/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:231:3 › Phase 2.6a 출고전표 전환 › 시나리오 2: 수량 입력 → 전환 → 부분전환 성공 토스트 (fullyConverted=false)
[3/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:270:3 › Phase 2.6a 출고전표 전환 › 시나리오 3: 전환 → 전량전환 성공 토스트 (fullyConverted=true)
[4/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:299:3 › Phase 2.6a 출고전표 전환 › 시나리오 4: ON_HOLD 주문 → 전환 버튼 노출
[5/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:314:3 › Phase 2.6a 출고전표 전환 › 시나리오 5: CONFIRMED 주문 → 전환 버튼 미노출
[6/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:331:3 › Phase 2.6a 출고전표 전환 › 시나리오 6: linkedSlipNo 있는 DRAFT 주문 → 전환 버튼 미노출
[7/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:355:3 › Phase 2.6a 출고전표 전환 › 시나리오 7: 부분전환 완료 라인 — 잔여 0 input disabled / 잔여 1 input 활성
[8/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:381:3 › Phase 2.6a 출고전표 전환 › 시나리오 8: 전환수량 모두 0 → 제출 버튼 disabled
[9/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:403:3 › Phase 2.6a 출고전표 전환 › 시나리오 9: 409 잔여초과 → 모달 내 에러 배너 (partner-order-convert-modal-error)
[10/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:445:3 › Phase 2.6a 출고전표 전환 › 시나리오 11: AC-1 — 창고 autocomplete 미선택 시 제출 비활성 → 선택 후 전환 성공
[11/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:496:3 › Phase 2.6a 출고전표 전환 › 시나리오 12: F-1 회귀 — 창고 미선택 상태에서 임의 텍스트 입력+blur 시 제출 버튼 disabled 유지
[12/12] [chromium] › playwright\phase-2-6a-order-convert\phase-2-6a-order-convert.spec.ts:540:3 › Phase 2.6a 출고전표 전환 › 시나리오 10: 회귀 — Phase 2.5 hold/release 버튼 여전히 노출

12 passed (13.8s)
```

### 판정

fix3가 옮긴 `연결 전표` 단정은 현재 DS 표시 구조에서 재현되며, 해당 12개 실행 경로에서 사용자 결함은 재현되지 않았다. 이 결과는 mock 브라우저 회귀이며 아래 격리 라이브 QA를 대체하지 않는다.

## 3. `sales.module.css` 제품 importer 전수 대조

### 실행 명령

```powershell
$css=Get-Content -LiteralPath clients/desktop/src/renderer/components/sales/sales.module.css -Raw -Encoding UTF8
$css=[regex]::Replace($css,'/\*[\s\S]*?\*/','')
$defs=@([regex]::Matches($css,'\.([A-Za-z_][A-Za-z0-9_-]*)') | ForEach-Object {$_.Groups[1].Value} | Sort-Object -Unique)
$prod=@(rg -l 'import styles from .*sales\.module\.css' clients/desktop/src/renderer -g '*.ts' -g '*.tsx')
$rawRefs=@()
foreach($f in $prod){
  $src=Get-Content -LiteralPath $f -Raw -Encoding UTF8
  foreach($m in [regex]::Matches($src,'styles(?:\.([A-Za-z_][A-Za-z0-9_-]*)|\[[''"]([A-Za-z_][A-Za-z0-9_-]*)[''"]\])')){
    if($m.Groups[1].Success){$rawRefs += $m.Groups[1].Value}else{$rawRefs += $m.Groups[2].Value}
  }
}
$refs=@($rawRefs|Sort-Object -Unique)
"PROD_IMPORTERS=$($prod.Count)"; $prod
"DEF_COUNT=$($defs.Count)"
"REF_COUNT=$($refs.Count)"
$missing=@($refs|Where-Object{$_ -notin $defs}); "MISSING_COUNT=$($missing.Count)"; $missing
$unused=@($defs|Where-Object{$_ -notin $refs}); "UNUSED_COUNT=$($unused.Count)"; $unused
```

### 실행 원문

```text
PROD_IMPORTERS=8
clients/desktop/src/renderer\components\sales\SalesSubNav.tsx
clients/desktop/src/renderer\routes\components\MergeConvertDialog.tsx
clients/desktop/src/renderer\routes\EstimateListPage.tsx
clients/desktop/src/renderer\routes\EstimatePricingConfigPage.tsx
clients/desktop/src/renderer\routes\SalesOrderApprovalsPage.tsx
clients/desktop/src/renderer\routes\SalesPartnerDcConfigPage.tsx
clients/desktop/src/renderer\routes\SalesPartnerOrderDetailPage.tsx
clients/desktop/src/renderer\routes\SalesPartnerOrderListPage.tsx
DEF_COUNT=49
REF_COUNT=45
MISSING_COUNT=0
UNUSED_COUNT=4
card
derivedRow
numeric
sumRow
```

### 판정

- 실제 제품 importer 8개의 `styles.name`/`styles['name']` 참조는 모두 literal이며 동적 key 조립은 없었다.
- **참조되지만 정의가 삭제된 class는 0개**다. 따라서 “살아 있는 selector를 지워 화면이 깨진다”는 가설은 현행 HEAD에서 기각한다.
- 반대로 현재 CSS에는 미참조 class `card`, `derivedRow`, `numeric`, `sumRow` 4개가 남아 있다. 사용자 도달 결함은 아니지만, 현재 HEAD를 두고 “죽은 selector 0”을 원문/실측으로 제시하면 재현되지 않는다. 증거 무결성 불일치 2로 등록한다.

## 4. 격리 라이브 스택과 데이터 표면

공유 `samhan-*` 컨테이너에는 로그인/API 호출을 하지 않았다. 전용 Docker network `recon1175-net`, 전용 PostgreSQL `recon1175-pg:39832`, 전용 서비스 포트와 renderer `39873`을 사용했다. 주문승인 라우트의 실제 소유 서비스인 `partner-auth-service`도 전용 DB `partner_auth_db`와 포트 `39891`로 올렸다.

### 실행 명령

```powershell
$services=@(@('auth',39881),@('partner-auth',39891),@('product',39884),@('partner',39895),@('slip',39886),@('order',39888),@('dc',39889),@('gateway',39880)); foreach($s in $services){try{$status=(Invoke-RestMethod -Uri "http://127.0.0.1:$($s[1])/actuator/health" -TimeoutSec 3).status}catch{$status='FAIL'}; "$($s[0])=$status@$($s[1])"}; docker exec recon1175-pg psql -U samhan -d partner_order_db -tAc "SELECT 'orders='||count(*) FROM partner_orders"; docker exec recon1175-pg psql -U samhan -d slip_db -tAc "SELECT 'estimates='||count(*) FROM estimates"
```

### 실행 원문

```text
auth=UP@39881
partner-auth=UP@39891
product=UP@39884
partner=UP@39895
slip=UP@39886
order=UP@39888
dc=UP@39889
gateway=UP@39880
orders=30
estimates=40
```

초기 격리 주문 seed는 `DRAFT`, `CONFIRMED` 두 상태뿐이어서, 상태 6종을 실제 사용자 화면에서 밟기 위해 **격리 DB 안에서만** 6개 주문의 상태를 분산했다.

### 실행 명령

```powershell
docker exec recon1175-pg psql -U samhan -d partner_order_db -c "WITH ranked AS (SELECT id, row_number() OVER (ORDER BY order_no) rn FROM partner_orders WHERE is_deleted=false), desired(rn,status) AS (VALUES (1,'DRAFT'),(2,'ON_HOLD'),(3,'CONFIRMING'),(4,'CONFIRMED'),(5,'CANCELED'),(6,'CONVERTED')) UPDATE partner_orders p SET status=d.status FROM ranked r JOIN desired d ON d.rn=r.rn WHERE p.id=r.id; SELECT status,count(*) FROM partner_orders GROUP BY status ORDER BY status;"
```

### 실행 원문

```text
UPDATE 6
   status   | count
------------+-------
 CANCELED   |     1
 CONFIRMED  |    21
 CONFIRMING |     1
 CONVERTED  |     1
 DRAFT      |     5
 ON_HOLD    |     1
(6 rows)
```

## 5. 격리 실서비스 라이브 QA 및 상태 11종 대조

### 실행 명령

```powershell
$env:REAL_QA_ALLOW_UNTRACKED='1'
$env:REAL_QA_RENDERER_BASE_URL='http://127.0.0.1:39873'
npx playwright test --config=playwright.real-qa.config.ts --project=renderer --reporter=line playwright/1175-reconvergence-real-qa/1175-reconvergence-real-qa.spec.ts
```

실행 위치: `clients/desktop`

### 실행 원문

```text
[real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.
디스크에는 있지만 Git 추적 목록에는 없는 스펙(공식 수치에 섞이지 않음):
- clients/desktop/playwright/1175-reconvergence-real-qa/1175-reconvergence-real-qa.spec.ts
의도적으로 미추적 로컬 스펙만 실행하려면 REAL_QA_ALLOW_UNTRACKED=1 을 설정하고 명시 경로를 전달하십시오.
[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.

Running 1 test using 1 worker

[1/1] [renderer] › playwright\1175-reconvergence-real-qa\1175-reconvergence-real-qa.spec.ts:86:1 › 격리 실서비스 주문·견적 네 화면과 상태 11종
ORDER_LIST_BADGES={"DRAFT":{"text":"진행중","color":"rgb(77, 85, 98)","backgroundColor":"rgb(237, 240, 244)","borderColor":"rgb(214, 220, 227)"},"ON_HOLD":{"text":"보류","color":"rgb(140, 92, 19)","backgroundColor":"rgb(254, 246, 231)","borderColor":"rgb(248, 218, 154)"},"CONFIRMING":{"text":"확인중","color":"rgb(27, 74, 107)","backgroundColor":"rgb(239, 246, 251)","borderColor":"rgb(174, 207, 231)"},"CONFIRMED":{"text":"완료","color":"rgb(4, 120, 87)","backgroundColor":"rgb(236, 253, 245)","borderColor":"rgb(167, 243, 208)"},"CANCELED":{"text":"취소","color":"rgb(153, 27, 27)","backgroundColor":"rgb(255, 241, 241)","borderColor":"rgb(254, 202, 202)"},"CONVERTED":{"text":"전환완료","color":"rgb(27, 74, 107)","backgroundColor":"rgb(239, 246, 251)","borderColor":"rgb(174, 207, 231)"}}
ORDER_DETAIL_BADGES={"DRAFT":{"text":"진행중","color":"rgb(77, 85, 98)","backgroundColor":"rgb(237, 240, 244)","borderColor":"rgb(214, 220, 227)"},"ON_HOLD":{"text":"보류","color":"rgb(140, 92, 19)","backgroundColor":"rgb(254, 246, 231)","borderColor":"rgb(248, 218, 154)"},"CONFIRMING":{"text":"확인중","color":"rgb(27, 74, 107)","backgroundColor":"rgb(239, 246, 251)","borderColor":"rgb(174, 207, 231)"},"CONFIRMED":{"text":"완료","color":"rgb(4, 120, 87)","backgroundColor":"rgb(236, 253, 245)","borderColor":"rgb(167, 243, 208)"},"CANCELED":{"text":"취소","color":"rgb(153, 27, 27)","backgroundColor":"rgb(255, 241, 241)","borderColor":"rgb(254, 202, 202)"},"CONVERTED":{"text":"전환완료","color":"rgb(27, 74, 107)","backgroundColor":"rgb(239, 246, 251)","borderColor":"rgb(174, 207, 231)"}}
ESTIMATE_LIST_BADGES={"QUOTE_DRAFT":{"text":"작성중","color":"rgb(77, 85, 98)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(77, 85, 98)"},"QUOTE_SENT":{"text":"발송완료","color":"rgb(27, 74, 107)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(27, 74, 107)"},"QUOTE_ACCEPTED":{"text":"수주완료","color":"rgb(4, 120, 87)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(4, 120, 87)"},"QUOTE_REJECTED":{"text":"거절","color":"rgb(153, 27, 27)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(153, 27, 27)"},"QUOTE_CONVERTED":{"text":"전표변환완료","color":"rgb(140, 92, 19)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(140, 92, 19)"}}
ESTIMATE_DETAIL_BADGES={"QUOTE_DRAFT":{"text":"작성중","color":"rgb(77, 85, 98)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(77, 85, 98)"},"QUOTE_SENT":{"text":"발송완료","color":"rgb(27, 74, 107)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(27, 74, 107)"},"QUOTE_ACCEPTED":{"text":"수주완료","color":"rgb(4, 120, 87)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(4, 120, 87)"},"QUOTE_REJECTED":{"text":"거절","color":"rgb(153, 27, 27)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(153, 27, 27)"},"QUOTE_CONVERTED":{"text":"전표변환완료","color":"rgb(140, 92, 19)","backgroundColor":"rgba(0, 0, 0, 0)","borderColor":"rgb(140, 92, 19)"}}

1 passed (6.3s)
```

### 밟은 사용자 경로와 판정

- 주문 목록: 전체 목록 로드, 상태별 필터 6회, 상태 6종 표시, UUID/`undefined` 비노출, 가로 overflow 없음.
- 주문 상세: 상태별 대표 주문 6건 진입, `Card + detail-grid`, 주문번호/품목/금액 표시, UUID/`undefined` 비노출.
- 견적 목록: 전체 목록 로드, 상태별 필터 5회, 상태 5종 표시, UUID/`undefined` 비노출, 가로 overflow 없음.
- 견적 상세: 상태별 대표 견적 5건 진입, `Card + detail-grid`, 견적번호/품목/금액 표시, UUID/`undefined` 비노출.
- 공유 CSS 유탄 대상: 주문승인, 거래처 DC 설정, 견적 가격 설정 화면을 추가 진입해 로딩 종료와 레이아웃을 확인했다.
- 주문 6종과 견적 5종 모두 목록과 상세의 `text/color/backgroundColor/borderColor`가 상태별로 완전히 동일했다.

주문승인 최초 캡처에서 503이 보였으나, 게이트웨이 설정상 `/api/v1/partner-approvals/**`의 소유자는 `partner-auth-service`였다. 빠진 서비스를 격리 DB/포트에 추가한 뒤 동일 화면이 정상 빈 상태로 로드됐고 최종 캡처로 교체했다. 이는 제품/rebase 결함이 아닌 격리 스택 구성 누락이었다.

### 스크린샷 파일 전부

- `docs/qa/2026-08-12-1175-reconvergence/01-order-list.png`
- `docs/qa/2026-08-12-1175-reconvergence/02-order-detail.png`
- `docs/qa/2026-08-12-1175-reconvergence/03-estimate-list.png`
- `docs/qa/2026-08-12-1175-reconvergence/04-estimate-detail.png`
- `docs/qa/2026-08-12-1175-reconvergence/05-order-approvals.png`
- `docs/qa/2026-08-12-1175-reconvergence/06-dc-config.png`
- `docs/qa/2026-08-12-1175-reconvergence/07-estimate-config.png`

## 6. 현재 결론

- **실 사용자 경로로 재현 가능한 결함: 0건.**
- rebase로 들어온 UUID sweep 이후에도 주문·견적 목록/상세에서 UUID, `undefined`, 빈 DS 필드 회귀는 재현되지 않았다.
- fix3 대상과 그 주변 전환 경로 12건은 통과했다.
- CSS 삭제 유탄은 importer 8개 전수 대조와 관련 화면 7종 라이브 렌더에서 재현되지 않았다.
- **증거 무결성 불일치: 2건.** 현재 HEAD의 CSS 실측은 `513줄`이 아니라 `533줄`, 미참조 selector는 `0개`가 아니라 `4개`다.

## 7. 최종 산출물 검증

### 실행 명령

```powershell
Add-Type -AssemblyName System.Drawing; $report='docs/dev-reports/2026-08-12-1175-reconvergence-sol.md'; "REPORT_EXISTS=$([IO.File]::Exists((Resolve-Path $report)))"; "REPORT_BYTES=$((Get-Item $report).Length)"; $pngs=@(Get-ChildItem 'docs/qa/2026-08-12-1175-reconvergence' -Filter *.png | Sort-Object Name); "PNG_COUNT=$($pngs.Count)"; foreach($f in $pngs){$img=[Drawing.Image]::FromFile($f.FullName); try{"$($f.Name)|$($img.Width)x$($img.Height)|$($f.Length)bytes"}finally{$img.Dispose()}}
```

### 실행 원문

```text
REPORT_EXISTS=True
REPORT_BYTES=15796
PNG_COUNT=7
01-order-list.png|1440x1815|284904bytes
02-order-detail.png|1440x1071|108846bytes
03-estimate-list.png|1440x1987|343928bytes
04-estimate-detail.png|1440x1100|114878bytes
05-order-approvals.png|1440x1071|95773bytes
06-dc-config.png|1440x1071|74356bytes
07-estimate-config.png|1440x1636|132661bytes
```
