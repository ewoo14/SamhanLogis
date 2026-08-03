# 1001 R19 SOL 머지 전 재수렴 적대검증

- 대상 PR: #1061 (`feat/1001-ledger-spec-rest`)
- 요청 HEAD: `bb16f6416`
- 검증 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 시작 동기화: `git pull` → `Already up to date.`
- 금지 범위 준수: 코드/데이터 변경, Docker 재배포, commit/push, 전체 테스트 미실행

## 검증 진행

### 각도 1 — 정상 노출/차단 및 실 데이터 건수

#### 결함 1

① **무필터 원장 집계가 정본 판매전표를 가진 정상 거래처 13곳을 식별 불가·0원으로 내려 원장 진입과 일괄 인쇄를 차단한다.**

② 실 사용자 재현 절차

1. `dev_master`로 로그인해 `회계 → 거래처 원장`으로 이동한다.
2. 기간을 `2026-01-01 ~ 2026-03-31`, 거래처 코드는 비워 두고 `조회`한다.
3. `거래처-P-2026-0049` 등 행이 거래처 코드 `-`, 매출 `—`이고 checkbox와 `원장 보기`가 비활성임을 확인한다.
4. 같은 기간에 거래처 코드 `P-2026-0031`을 직접 입력해 다시 조회한다.
5. 동일 거래처가 `P-2026-0031 / 마산냉난방기기 / 229,900원`으로 식별되고 `원장 보기`가 활성화되며, 상세 1라인 합계가 `229,900원`임을 확인한다.

③ 관측 원문

```text
실 화면, 무필터:
unfilteredRows=43, normalRows=29, dashRows=14
거래처-P-2026-0049 | code=- | sales=— | checkboxDisabled=true | buttonDisabled=true
거래처-P-2026-0048 | code=- | sales=— | checkboxDisabled=true | buttonDisabled=true

실 화면, P-2026-0031 직접 검색:
P-2026-0031 | 5031710961 | 마산냉난방기기 | 229,900 | buttonDisabled=false
2026-01-31 | 2026/01/31-1 | 매출 | 테스트제품-TEST-MODEL-0011 | 차변 229,900
합계 229,900

게이트웨이 API/DB 교차 대조:
무필터: 정상 코드 29행 + code='-' 14행; '-' 14행 salesTotal 합계=0
정상인데 무필터에서 누락된 코드=13곳 / 전표=13건 / 라인=35건 / 금액=87,562,200원
각 13코드 직접 검색: aggregateRows=1, documents=1, type=SALE, 집계=상세 금액 일치
```

누락 코드:

```text
P-2026-0031, P-2026-0032, P-2026-0033, P-2026-0039,
P-2026-0041, P-2026-0042, P-2026-0043, P-2026-0044,
P-2026-0045, P-2026-0046, P-2026-0047, P-2026-0048, P-2026-0049
```

④ 영향 건수: **정상 거래처 13곳, 정본 전표 13건, 품목 라인 35건, 87,562,200원**. 무필터 집계·원장 진입·일괄 인쇄에서 차단되며 코드 직접 검색 때만 도달한다.

구조 원인: 무필터 산출 시 journal/cash로 먼저 만든 `groups`의 UUID만 partner master batch lookup한다. 판매전표에만 등장한 `partnerId`는 master로 해소하지 않고 `unresolved`로 보내며, `unresolved`에는 `slipSales → salesTotal` 대입도 하지 않아 정상 거래처 snapshot이 `-`/0원으로 동결된다. 선택 코드 조회에서는 먼저 `selectedSummary`를 얻으므로 같은 전표가 정상 해소된다.

#### 증거 무결성 예외

요청문의 `활성 거래처 50곳`은 현재 read-only DB와 다르다. `partner_code ~ '^P-2026-[0-9]{4}$'`, `is_deleted=false`는 총 50곳이지만 상태는 **ACTIVE 45곳 + SUSPENDED 5곳**이다. 따라서 실 화면의 정상 코드 노출 지표는 ACTIVE 기준 **29/45곳**이며, 위 결함 13곳은 모두 ACTIVE이다.

### 각도 2 — 정본 상태 집합 4경로 일관성

추가 도달 결함 없음. 상태 정본은 slip 내부 endpoint 한 곳에서 `PartnerLedgerContract.CANONICAL_SALE_STATUSES`를 받아 적용하고, 그 결과를 공통 산출기가 집계와 상세에 공급한다. 인쇄는 상세 public 응답을 다시 소비하며, 식별 불가 묶음도 같은 무필터 산출 결과에서 생성된다.

관측 원문:

```text
GET slip /internal/slips/partner-ledger-sales, 2026-01-01~2026-03-31
CONFIRMED = 4전표 / 10라인 / 32,138,700원
DELIVERED = 10전표 / 35라인 / 106,845,200원
COMPLETED = 7전표 / 17라인 / 58,492,500원
합계 = 21전표 / 62라인 / 197,476,400원

동기간 비정본 DB 원문:
INSPECTING = 5전표 / 12라인 / 87,841,600원
SHIPPING = 5전표 / 15라인 / 68,803,900원

P-2026-0017 DB: INSPECTING 1전표 / 2라인 / 12,276,000원
P-2026-0017 public: salesTotal=20,000,000; documents=[SALE_SUMMARY 20,000,000]
P-2026-0026 DB: COMPLETED 1전표 / 1라인 / 5,656,200원
P-2026-0026 public: salesTotal=5,656,200; documents=[SALE 5,656,200]
```

`INSPECTING`·`SHIPPING`은 내부 판매전표 응답에 없고 선택 집계·상세에도 섞이지 않았다. 각도 1의 식별 불가 0원/차단은 상태 집합 불일치가 아니라 판매전표-only partner 해소 및 `unresolved.salesTotal` 산출 누락으로 별도 확정했다.

### 각도 3 — SALE_SUMMARY와 실제 slip 이중계상

추가 도달 결함 없음. 동기간 journal 401과 canonical slip이 모두 있는 ACTIVE 실 거래처는 6곳이며, 모두 journal과 slip을 더하지 않고 slip 문서 합을 public 합계로 1회만 사용했다.

관측 원문:

```text
code          journal401    canonical slip    public 집계/상세
P-2026-0007   30,000,000    17,209,500        17,209,500 / SALE 1건
P-2026-0008   17,000,000    12,679,700        12,679,700 / SALE 1건
P-2026-0009    4,000,000     4,683,800         4,683,800 / SALE 1건
P-2026-0018    7,000,000    24,646,600        24,646,600 / SALE 1건
P-2026-0019   24,000,000    21,575,400        21,575,400 / SALE 1건
P-2026-0026   23,000,000     5,656,200         5,656,200 / SALE 1건

SALE_SUMMARY와 SALE이 함께 나온 거래처 = 0
public salesTotal과 documents.amount 합 불일치 = 0
```

### 각도 4 — UUID public 노출

#### 결함 2

① **`SALE_SUMMARY.documentNo`가 `journal-summary:<partner UUID>`로 public 응답에 포함되고 상세·인쇄의 분개번호로 그대로 노출된다.**

② 실 사용자 재현 절차

1. `dev_master`로 로그인해 `회계 → 거래처 원장`으로 이동한다.
2. 기간 `2026-01-01 ~ 2026-03-31`, 거래처 `P-2026-0017`을 조회한다.
3. `원장 보기`를 눌러 상세 표의 분개번호를 확인한다.
4. `인쇄 미리보기`를 눌러 인쇄 표의 분개번호를 확인한다.
5. 두 곳 모두 `journal-summary:` 뒤에 동일한 UUID가 표시됨을 확인한다.

③ 관측 원문

```text
public JSON:
type=SALE_SUMMARY
documentNo=journal-summary:0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2
amount=20,000,000

실 화면 상세:
2026-01-01 | journal-summary:0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2 | 매출 | 대변 20,000,000

실 화면 인쇄:
2026-01-01 | journal-summary:0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2 | 대변 20,000,000
```

④ 영향 건수: 무필터에서 식별되는 29곳을 public 상세 전수 조회한 결과 **22거래처 / `SALE_SUMMARY` 22문서 / 351,000,000원**에서 UUID가 상세·인쇄에 노출된다.

구조 원인: 공통 산출기가 journal-only 문서번호를 `"journal-summary:" + group.partnerId`로 생성하고, `PartnerLedgerResponse.Document.documentNo`가 이를 제거하지 않는다. Desktop `buildPartnerLedgerLines`와 인쇄 뷰는 public `documentNo`를 분개번호로 그대로 렌더링한다.

#### 증거 무결성 예외

R18 보고서의 다음 인용은 실제와 다르다.

```text
"public PartnerLedgerResponse에는 UUID 필드가 없다."
"문서번호는 내부 그룹 키일 뿐 public UUID가 아니다."
```

별도 `partnerId` 필드는 없지만 UUID 값 자체가 public `documents[].documentNo`에 포함되어 사용자 상세·인쇄까지 도달한다.

### 각도 5 — shared/common 신설의 타 서비스 영향

추가 도달 결함 없음.

관측 원문:

```text
shared/common diff = 신규 PartnerLedgerContract.java 1파일 / 12라인
참조자 = accounting-service PartnerLedgerReadModelService,
         slip-service SlipInternalController
기존 shared/common 클래스/Gradle 설정 변경 = 0

samhan-accounting-service running/healthy
samhan-slip-service       running/healthy
samhan-product-service    running/healthy
samhan-inventory-service  running/healthy
samhan-user-service       running/healthy
samhan-partner-service    running/healthy
samhan-dashboard-service  running/healthy
samhan-groupware-service  running/healthy
samhan-arologis-service   running/healthy
```

상태 상수의 새 소비자는 accounting/slip 두 곳으로 한정되고, 기존 API/공용 타입 변경은 없다. 다른 서비스의 실 사용자 경로에 도달하는 변경은 발견하지 못했다.

## 최종 판정

실 사용자 경로로 재현 가능한 결함은 **2건**이다.

1. 무필터 집계에서 정상 거래처 13곳·정본 전표 13건·35라인·87,562,200원이 식별 불가/0원으로 변환되어 원장·일괄 인쇄가 차단된다.
2. `SALE_SUMMARY` 22문서가 partner UUID를 public 상세·인쇄 분개번호로 노출한다.

증거 무결성 불일치도 2건 확인했다.

1. `활성 거래처 50곳`이 아니라 `ACTIVE 45 + SUSPENDED 5`이다.
2. R18의 `public UUID 없음`·`문서번호는 public UUID가 아님` 인용과 달리 UUID가 `documentNo`로 노출된다.

**머지 가능 여부: 현재 상태로 머지 불가.**

검증 중 코드·실데이터·Docker를 변경하거나 재배포하지 않았고, commit/push 및 전체 Playwright/전체 Gradle suite를 실행하지 않았다. 실 화면 재현용으로만 띄운 로컬 Vite 프로세스는 검증 직후 종료했다.
