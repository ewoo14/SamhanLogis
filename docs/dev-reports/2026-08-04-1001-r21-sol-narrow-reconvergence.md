# PR #1061 R21 SOL 좁힌 재수렴

- 대상 브랜치: `feat/1001-ledger-spec-rest`
- 기대 HEAD: `e0466bb4b`
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 범위: R20의 `PartnerLedgerReadModelService` 변경 2건과 그 사용자 노출 경로
- 금지 준수: 재배포·DB 쓰기·코드 수정·전체 회귀 미실행

## 진행 기록

### 0. 시작 상태

- `git pull`: `Already up to date.`

### 1. R20 선등록 14행의 실제 귀속

실행 범위는 `2026-01-01~2026-03-31`, 활성 OUTBOUND, 상태
`CONFIRMED|DELIVERED|COMPLETED`이다. `slip_db.slips.partner_id`를
`partner_db.partners.id`와 read-only로 교차 대조하고, 같은 기간의 사용자 public 집계를 조회했다.

관측 원문:

```text
canonical cohort: 21전표 / 62라인 / 197,476,400원
R19 당시 '-'였던 판매전표-only 행: 14거래처
  ACTIVE 13거래처 / 13전표 / 35라인 / 87,562,200원
  SUSPENDED 1거래처(P-2026-0030) / 1전표 / 5라인 / 4,048,000원

14/14 slip.partner_id = partner master.id
master 미존재 = 0
삭제된 master = 0
partner_code 중복 = 0

GET /accounting/sales/aggregate?from=2026-01-01&to=2026-03-31
43행 / partnerCode '-' 0행
P-2026-0031 = 229,900원
P-2026-0049 = 11,929,500원
```

전표 snapshot의 `partner_code`와 `business_number`는 21건 모두 공란이고 이름은
`거래처-P-2026-NNNN` 형태였지만, R20은 이 비권위 snapshot을 추측 매칭하지 않고 전표에 저장된
`partner_id`와 partner master의 동일 ID를 사용했다. 14행 모두 그 master의 코드·이름·사업자번호로
해소됐으며 다른 거래처 ID로 붙은 행은 0건이다. SUSPENDED 1곳은 삭제 거래처가 아니라 과거 거래를
가진 현존 master이고, 이 경로는 원장 read-only 조회다.

판정: 선등록으로 엉뚱한 거래처에 귀속되거나 열리면 안 되는 삭제/미존재 거래처가 열린 결함은
재현되지 않았다.

### 2. `SALE_SUMMARY.documentNo` 중복

사용자 목록 43행의 각 `partnerCode`로 public 상세 endpoint를 전수 조회했다. 인쇄와 일괄인쇄는
이 상세 응답을 사용하는 `/print/partner-ledger?partnerCode=...` 라우트를 단건 또는 선택 건수만큼
반복한다.

관측 원문:

```text
aggregateRows=43
detailSuccess=43 / detailFailures=0
documents=43
SALE_SUMMARY=22 / 합계 351,000,000원

중복 aggregate partnerCode=0
서로 다른 거래처의 동일 SALE_SUMMARY.documentNo=0
거래처당 SALE_SUMMARY 2건 이상=0

P-2026-0005 -> SALE_SUMMARY.documentNo=P-2026-0005 / 26,000,000원
P-2026-0017 -> SALE_SUMMARY.documentNo=P-2026-0017 / 20,000,000원
```

partner master의 활성 코드 unique 제약과 public 43행 실측 모두에서 코드 중복은 0건이다.
`SALE_SUMMARY`는 각 거래처에 정확히 1건이고, 서로 다른 문서가 같은 공개번호를 갖는 현상은
재현되지 않았다.

### 3. UUID public 누출 — 목록·상세·인쇄·일괄인쇄 원천

목록 응답 1건과 목록의 43개 거래처 상세 응답 원문 전체를 UUID 정규식으로 검사했다.

```text
검사 응답: aggregate 1 + partner-ledger detail 43
UUID_HITS=0
```

상세 화면과 단건 인쇄는 같은 `documents[].documentNo`를 표시하고, 일괄인쇄는 선택된 코드마다
동일 인쇄 라우트를 새 창으로 반복한다. 43개 전체 데이터 원천에서 UUID 값은 0건이었다.

에러 응답도 read-only 입력 오류와 미존재 코드로 확인했다.

```text
aggregate 역전 기간: 400 INVALID_INPUT / UUID 0
detail 역전 기간:    400 INVALID_INPUT / UUID 0
aggregate 잘못된 날짜: 400 INVALID_INPUT / UUID 0
detail 미존재 코드:  200 + documents=[] / UUID 0
```

판정: 목록·상세·단건 인쇄·일괄인쇄 데이터 원천·에러 응답에서 UUID 누출은 재현되지 않았다.

### 4. R9 수치 재현

실 DB와 현재 게이트웨이 public 응답을 새로 조회하고, R9가 커밋한 동일 R20 실 화면 캡처의
목록·상세·인쇄도 직접 열어 대조했다.

```text
무필터 public 목록 = 43행
partnerCode '-' = 0행

정본 DB cohort = 21전표 / 62라인 / 197,476,400원

P-2026-0005 bizNo=1653510155
  aggregate=26,000,000 / detail=26,000,000 / SALE_SUMMARY documentNo=P-2026-0005
P-2026-0017 bizNo=3211910527
  aggregate=20,000,000 / detail=20,000,000 / SALE_SUMMARY documentNo=P-2026-0017
P-2026-0026 bizNo=4388210806
  aggregate=5,656,200 / detail=5,656,200 / SALE documentNo=2026/01/26-1

P-2026-0049 bizNo=7374311519 / 11,929,500원
P-2026-0031 bizNo=5031710961 / 229,900원
```

R9 캡처 대조:

- `01-unfiltered-ledger.png`: 총 43건, `5031710961 / 229,900`,
  `7374311519 / 11,929,500`, `-` 행 없음.
- `02-P-2026-0017-detail.png`: 분개번호 `P-2026-0017`, 합계 `20,000,000`.
- `03-P-2026-0017-print-preview.png`: 분개번호 `P-2026-0017`, 대변/합계 `20,000,000`.

요청문에 인용된 R9 수치는 전부 재현됐다. 증거 무결성 예외는 없다.

## 최종 판정

실 사용자 경로로 재현 가능한 결함은 **0건**이다.

### 이 라운드가 보지 않은 것

- R19에서 결함 없음으로 확인했고 요청에서 제외한 상태 집합 일관성, `SALE_SUMMARY` 이중계상,
  `shared/common` 타 서비스 영향은 다시 검증하지 않았다.
- 전체 652 Playwright와 전체 Gradle suite는 실행하지 않았다.
- 서비스 중단을 유도해야 하는 partner/slip dependency outage 오류 응답은 만들지 않았다.
- 새 UI 세션·새 캡처는 만들지 않았고, R9의 동일 R20 실 화면 캡처를 직접 열어 현재 public API/DB
  재측정값과 대조했다.

**머지 가능 여부: R21의 R20 변경 표면 기준 머지 가능.**
