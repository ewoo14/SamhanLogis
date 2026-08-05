# PR #1061 R38 수집·분류 단계 구조 진단

- 진단 일자: 2026-08-04
- 작업 브랜치: `feat/1001-ledger-spec-rest`
- 기준 HEAD: `0560d83847b294b7bfd16a5695e5f8bf8ba9c5b0`
- 작업 루트: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 범위: 원천 수집 → 문서 분류 → 원장 fold의 구조 진단
- 금지 준수: 코드 수정, 컨테이너 조작, DB 직접 쓰기, commit/push를 수행하지 않는다.

## 0. 진행 기록

1. `git -C . rev-parse --show-toplevel` 결과가 지정 작업 루트와 일치함을 확인했다.
2. 브랜치와 HEAD가 각각 `feat/1001-ledger-spec-rest`, `0560d83847b294b7bfd16a5695e5f8bf8ba9c5b0`임을 확인했다.
3. 진단 시작 전 본 보고서를 생성했다.

4. 공통 `PartnerLedgerContract`는 문서가 이미 `SALE`/`SALE_SUMMARY`/`CASH_RECEIPT`/`JOURNAL_ONLY`로 분류된 뒤의 `fold`만 규정하며, 원천을 어느 문서 종류로 분류할지는 규정하지 않음을 확인했다.
5. 신규 read-model 수집기는 `PartnerLedgerReadModelService` 한 클래스 안에서 slip 판매, journal 집계, 확정 입금보고서를 각각 읽은 뒤 mutable flag와 계정코드 조건으로 문서 종류를 결정한다.

## 1. 원천과 분류 규칙 전수 지도 — 코드 기준

### 1.1 확정 상태 계약

- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java:16-18`: 판매 조회 상태를 `CONFIRMED`, `DELIVERED`, `COMPLETED`, `INSPECTING`, `SHIPPING`의 5개로 고정한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:78,399`: 내부 판매 조회가 위 공통 상태 집합을 사용하고 `/internal/slips/partner-ledger-sales`로 노출된다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:31`: accounting-service가 위 내부 API를 호출한다.

### 1.2 수집기의 세 원천

| 원천 | 읽는 위치 | 필터/집계 | 최초 문서 분류 |
|---|---|---|---|
| `slip_db` 판매 | `PartnerLedgerReadModelService.java:62,96,312-317` → `PartnerLedgerSalesClient.java:31` | 기간, 거래처 코드/UUID, 공통 상태 5개 | 각 행을 `saleDocument`로 보내 무조건 `SALE` (`PartnerLedgerReadModelService.java:130-135,207-214`) |
| `accounting_db` 게시 분개 | `PartnerLedgerReadModelService.java:65-81` → `JournalLineRepository.aggregatePostedByPartnerAccount` | 기간, partner, sourceType, account 단위 합계. `CASH_RECEIPT` sourceType은 건너뜀 | 판매가 하나도 없고 journal이 있을 때만 401/110 합계에 따라 `SALE_SUMMARY` 또는 상세 `JOURNAL_ONLY` (`:138-145`) |
| `accounting_db` 입금보고서 | `PartnerLedgerReadModelService.java:83-94,244-251` → `CashReceiptRepository.findAll(spec)` | `status=CONFIRMED`, 기간, 선택 partner | 각 입금보고서를 `CASH_RECEIPT`로 직접 생성 |

이 표는 현재 코드의 “읽기” 위치를 나타낸다. 실행 중 서버는 R36 이전 배포본이므로 아래 실행 기준 절에서 별도로 판정한다.

### 1.3 분류 규칙은 몇 벌인가

원장 관련 production 코드에는 같은 원천을 해석하는 규칙이 **4벌** 존재한다. 단, D1~D4를 직접 만드는 활성 상세 경로는 1번이다.

1. **신규 상세/저장 정본 — 활성 경로**: `PartnerLedgerReadModelService.java:58-153`. `PartnerLedgerReadService.java:51-61`이 Spring 주입된 read-model service에 즉시 위임하고, controller의 `/accounting/journals/partner-ledger`가 이를 반환한다(`AccountingReportController.java:155-163`). `SALE_SUMMARY`와 `JOURNAL_ONLY`를 구분하는 유일한 경로다.
2. **legacy 목록 집계 fallback**: 정상 Spring에서는 `SalesAggregateService.java:81-90`이 1번 read model에 위임한다. 그러나 `:91-240,259-377`에는 401을 매출, 110 대변을 수금 보조값, 확정 `cash_receipts.amount`를 수금으로 읽고 slip 판매가 있으면 journal 매출을 교체하는 독립 구현이 생성자/테스트 호환용으로 남아 있다.
3. **legacy 상세 fallback**: `PartnerLedgerReadService.java:63-151`. `readModelService == null`일 때 slip을 `SALE`, 확정 입금보고서를 `CASH_RECEIPT`로만 분류한다. 정상 Spring 운영에서는 도달하지 않지만 테스트/legacy 생성자 호환으로 살아 있다.
4. **구형 분개 원장**: `LedgerImageService.java:76-117`와 `/accounting/journals/ledger-data`(`AccountingReportController.java:126-141`). 모든 journal line을 차변 가산/대변 차감하는 별도 원장이다. `SALE` 등의 문서 타입은 없지만 같은 사용자 업무명 “거래처별 원장” 아래 병존한다.

snapshot 자체는 다섯 번째 분류기가 아니다. `LedgerSnapshotService.java:52-63,109-120`은 활성 상세 결과를 저장하며, 신규 `documents` payload와 구형 raw journal payload를 형상에 따라 역직렬화한다.

### 1.4 계정·sourceType별 활성 상세 분류표

| 입력 | 수집 시 처리 | 최종 문서/합계 영향 |
|---|---|---|
| slip 판매 | line `lineAmount` 합계(`PartnerLedgerReadModelService.java:341-346`) | `SALE`, VAT 포함 amount가 매출·잔액에 반영 |
| journal 401 대변/차변 | `journalSales += credit - debit` (`:77-80`) | **해당 partner에 기간 slip이 전혀 없을 때만** `SALE_SUMMARY` 후보 |
| journal 110 차변 | `journalReceivableDebit += debit` (`:80-81`) | `SALE_SUMMARY` amount 선택 시 401보다 우선(`:320-325`) |
| journal 110 대변 | `journalPaymentTotal += credit` (`:80-81`) | mutable 값만 누적되고 문서 생성에는 사용되지 않아 현재 fold 수금에는 들어가지 않음 |
| sourceType `CASH_RECEIPT` journal | journal 집계 루프에서 전부 제외(`:68-72`) | 원천 `cash_receipts`에서 다시 읽어 이중계상 방지 |
| 확정 `cash_receipts` | 상태·기간·partner 조건(`:244-251`) | `CASH_RECEIPT`, amount가 기간수금에 반영 |
| 기타 계정 journal | `journalSeen=true`이나 금액 누적 없음 | 판매가 없고 401 순액도 0이면 상세 line들을 `JOURNAL_ONLY`로 표시; fold 합계 영향 0 |

## 2. 실행 기준과 코드 기준 분리

### 2.1 실행 기준

가동 배포본은 R36 이전이다. `dev_manager`로 Gateway `:8080`에 로그인한 뒤 read-only GET을 다시 실행한 결과:

| 거래처 | 기간 | 기초 | 매출 | 수금 | 기말 | 문서 |
|---|---|---:|---:|---:|---:|---|
| P-2026-0001 | 2026-01-01~08-03 | 0 | 18,000,000 | 0 | 0 | JOURNAL_ONLY 10개 |
| P-2026-0028 | 동일 | 0 | 30,567,900 | 0 | 30,567,900 | SALE 1개 |
| P-2026-0032 | 동일 | 0 | 1,633,500 | 0 | 1,633,500 | SALE 1개 |

이 값은 현재 서버의 기준선일 뿐 HEAD R36의 `SALE_SUMMARY` 결과가 아니다.

### 2.2 HEAD R36 코드 기준

- P-2026-0001은 `SALE_SUMMARY=22,000,000`이 된다. 19,800,000원짜리 `SLIP/system` journal과 2,200,000원짜리 `MANUAL/SYSTEM_SEED` 110 차변을 같은 기간·거래처 합계로 섞기 때문이다.
- P-2026-0028은 기간 내 SALE이 있으므로 29,700,000원짜리 별도 `SLIP/system` journal을 만들지 않고 30,567,900원으로 남는다.
- P-2026-0032는 700,000원짜리 `MANUAL/system` 110 대변을 문서/수금으로 만들지 않아 1,633,500원으로 남는다.

## 3. 네 결함의 뿌리

### 3.1 판정

**구조적 뿌리는 하나다.**

> 원천 문서 한 건을 식별·중복제거·업무효과까지 분류하는 계약이 없어서, 기간·거래처 단위 boolean과 계정 총액이 “판매 존재 여부·판매금액·수금 여부”를 대신 결정한다.

직접 증상은 세 가지 정책 구멍이고 D4는 그 파생 결과다.

1. **식별 단위 오류(D1)**: `salesSeen`은 문서가 아니라 거래처+기간 단위다. 하나의 SALE이 모든 journal 문서 생성을 막는다.
2. **금액 귀속 오류(D2)**: `journalReceivableDebit`은 journal 한 건의 110이 아니라 거래처+기간 전체 110 차변이다. sourceType이 다른 `SYSTEM_SEED`까지 판매금액으로 합친다.
3. **업무효과 누락(D3)**: 수금 효과를 `cash_receipts` 원천에만 부여하고, 다른 journal의 명시적 110 대변 회수는 `journalPaymentTotal`에 쌓기만 한 뒤 문서/fold로 전달하지 않는다.
4. **경계 불연속(D4)**: 기간 수집은 위 boolean/총액 분기를 쓰지만 기초는 `110 누계 + 과거 slip 합계`라는 별도 알고리즘(`PartnerLedgerReadModelService.java:291-309`)을 쓴다. 동일 원천을 앞 기간에 두면 보이고 현재 기간에 합치면 숨는 것은 하나의 분류 계약이 양쪽에 없어서 생긴다.

따라서 D1~D3를 각각 if문으로 고치는 세 fix가 아니라, 문서 단위 분류 결과를 기간과 기초가 같이 소비하게 해야 한다.

## 4. 업무 금액과 시드·QA 잔재 분리

호스트 PostgreSQL `127.0.0.1:5432`에 직접 연결하고 `setReadOnly(true)` 및 `SET default_transaction_read_only=on`을 적용한 SELECT만 실행했다.

| cohort | 건수/금액 | 판정 근거 | 진단상 취급 |
|---|---:|---|---|
| `SLIP/system`, 활성 source slip 불일치 | 전체 29 journal. D1 겹침 12건 VAT 포함 209,000,000원 | `source_type=SLIP`, `created_by=system`; `[DEV-SEED]` 표식은 없으나 source_ref와 일치하는 활성 slip은 0 | 현재 회계 조회에 존재하는 orphan 업무형 원천. 실제 운영 매출로 확정하지는 않되, 계약상 `SALE_SUMMARY` 후보에서 누락하면 안 됨 |
| `MANUAL/SYSTEM_SEED` 110 차변 | 관련 3건 7,700,000원 | `created_by=posted_by=SYSTEM_SEED`, description/memo에 `[DEV-SEED]` | 업무 판매금액에서 명시적으로 제외. `JOURNAL_ONLY` 표시 여부는 별도 표현 정책 |
| `MANUAL/system` 외상매출금 회수 | 7건 7,600,000원 | `created_by=system`, 사람 계정 `posted_by`, description/memo가 외상매출금 회수, 102 차변/110 대변 | seed/QA 생성 정황은 있으나 현재 업무형 수금 경로에 도달. 단순 `system` 제외 금지; 분류 계약의 수금 fixture로 사용 |

## 5. 최소 변경 제안 — 구현하지 않음

### 5.1 계약으로 올릴 것

`PartnerLedgerContract.fold()` 앞에 순수한 **문서 단위 수집·분류 계약** 하나를 둔다. 이름은 예시로 `PartnerLedgerCollectionContract`라 한다.

계약 입력은 기간 합계가 아니라 다음을 가진 원자 evidence다.

- stable source key: slip id 또는 journal id/sourceRefId. 내부 식별용이며 public 응답에는 노출하지 않는다.
- source kind: canonical slip, SLIP journal, CASH_RECEIPT 원천/연결 journal, MANUAL, 기타.
- 한 journal에 속한 110/401/220/기타 line 묶음.
- 게시/확정 상태, 작성 출처(`SYSTEM_SEED` 포함), 거래일, 거래처.

계약 출력은 기존 네 `DocumentType`과 별개로 `Effect = SALE | PAYMENT | NONE`을 가진 문서다. 이 분리가 핵심이다.

1. canonical 상태 slip → `SALE + SALE effect`, VAT 포함 line amount.
2. 같은 source key의 canonical slip으로 대표되지 않는 게시 `SLIP` journal → **journal 한 건별** `SALE_SUMMARY + SALE effect`; amount는 그 journal 자체의 110 순차변(VAT 포함)으로 한정한다.
3. 확정 `cash_receipts` → `CASH_RECEIPT + PAYMENT effect`; 연결된 CASH_RECEIPT journal은 중복 억제한다.
4. 비-CASH_RECEIPT journal의 110 순대변 회수 → 표시 타입은 `JOURNAL_ONLY`로 보존하되 `PAYMENT effect`를 부여한다. 입금보고서가 아닌 문서를 “입금보고서”로 위장하지 않는다.
5. `SYSTEM_SEED`와 판매/수금으로 증명되지 않는 기타 journal → `JOURNAL_ONLY + NONE`. 110이라는 이유만으로 판매로 승격하지 않는다.

`fold`는 기존 네 타입명으로 효과를 재추론하지 않고 분류 계약이 준 `SALE/PAYMENT/NONE`만 합산한다. 정상 SALE/CASH_RECEIPT factory의 기존 불변식은 그대로 둔다.

### 5.2 같은 계약을 적용할 범위

- `PartnerLedgerReadModelService`의 `salesSeen`, `journalSeen`, 거래처 기간 합계 기반 `saleSummaryDocument()`를 제거 대상으로 삼고, journal 단위 projection을 분류기에 넘긴다.
- `openingBalances()`도 별도 산식을 유지하지 않고 **동일 분류기 결과 중 `date < from`의 effect를 fold**한다. 기간 합치기/분할 가법성이 여기서 생긴다.
- `SalesAggregateService`, 상세, 인쇄, 신규 snapshot은 같은 classified read model을 소비하게 한다. 목록에서 401/110을 다시 해석하지 않는다.

### 5.3 남길 것

- public 문서 타입 네 개와 JSON shape.
- `PartnerLedgerContract`의 VAT 포함 방향 검증, `opening + sales - payment` 산식.
- 판매 상태 5개 공통 상수.
- 구형 snapshot의 shape 판별 복원과 저장 당시 금액 불변 원칙.
- `LedgerImageService`의 구형 `/ledger-data`는 즉시 제거하지 않되 “거래처 원장 정본”이 아님을 명시하고 신규 집계에는 사용하지 않는다.

### 5.4 이 설계가 최소인 이유와 선행 데이터 계약

UI/DTO/문서 타입을 늘리지 않고 내부 분류 결과만 추가한다. 다만 정확한 중복제거에는 현재 accounting journal의 UUID `source_ref_id`와 대응하는 slip 내부 식별자가 필요하다. public UUID 노출 없이 internal API projection에 source key를 제공하거나, slip-service가 source 존재 여부를 batch로 답해야 한다. 이를 생략하면 “활성 slip과 같은 매출 journal”과 “slip 없는 orphan journal”을 확정적으로 가를 수 없다.

D3도 memo 문자열을 계약으로 삼아서는 안 된다. 신규 write에는 `RECEIVABLE_COLLECTION` 같은 내부 semantic kind를 남기고, legacy 자료만 `110 순대변 + 반대편 자산 차변 + reversal 상쇄` 규칙으로 보수적으로 분류해야 한다.

## 6. 제안이 깨뜨릴 수 있는 것

### 6.1 R13 세 경로와 P-2026-0028

- 집계·상세·인쇄가 하나의 classified read model을 소비하므로 **세 경로 일치 자체는 보존**된다.
- 그러나 현 DB의 2026/03/23-1 `SLIP/system` 29,700,000원을 확정 기준대로 SALE_SUMMARY에 포함하면 P-2026-0028의 2026-01-01~08-03 값은 **30,567,900 → 60,267,900원**으로 바뀐다.
- 따라서 “slip 없는 매출을 포함”과 “R13의 정확한 30,567,900원을 유지”는 이 DB에서는 동시에 만족할 수 없다. 29,700,000원을 QA 잔재로 quarantine한다는 별도 데이터 판정이 없다면, R13 fixture의 **경로 일치 조건은 유지하되 기대 금액은 갱신**해야 한다.

### 6.2 구형 snapshot 역직렬화

- 제안대로 effect를 내부 모델에만 두고 public type/JSON을 유지하면 구형 snapshot 역직렬화는 깨지지 않는다.
- 기존 snapshot은 restore 시 재-fold하지 않으므로 `LED-20260804-000001`은 계속 30,567,900원이다. 저장 당시 사실을 보존한다.
- 향후 구형 snapshot을 재계산하면 안 된다. 불가피하면 effect가 없는 legacy `JOURNAL_ONLY`의 기본값은 `NONE`이어야 한다.

### 6.3 상태 집합 5개

`CONFIRMED · DELIVERED · COMPLETED · INSPECTING · SHIPPING`은 변경하지 않는다. 위험은 분류기 구현자가 자체 상태 allowlist를 또 만드는 것이다. 반드시 `PartnerLedgerContract.CANONICAL_SALE_STATUSES` 하나만 소비해야 한다.

### 6.4 기타 위험

- 모든 110 대변을 수금으로 보면 매출취소·대손·상계·역분개를 수금으로 오인할 수 있다. journal bundle의 semantic kind와 reversal netting이 필요하다.
- `SYSTEM_SEED` 제외를 repository 전역에 적용하면 aging/보고서 QA가 달라질 수 있다. 제외는 원장 classification에만 한정한다.
- epoch부터 매 조회마다 전량 fetch하면 성능이 악화된다. 동일 분류 규칙을 SQL projection 두 구간(기초/기간)에 적용하되 규칙 자체는 한 계약이어야 한다.

## 7. 실 데이터 영향 예측

다음 “현재”는 배포본이 아니라 **HEAD R36을 현재 DB에 적용한 결정값**이다. 기간은 모두 2026-01-01~2026-08-03이며 확인된 cohort의 기초와 확정 `cash_receipts` 수금은 0이다.

### 7.1 D1 — 현재 SALE + 누락 SALE_SUMMARY

| 거래처 | 현재 매출/기말 | 추가 SALE_SUMMARY | 예상 매출/기말 |
|---|---:|---:|---:|
| P-2026-0006 | 6,316,200 | 14,300,000 | 20,616,200 |
| P-2026-0007 | 17,209,500 | 33,000,000 | 50,209,500 |
| P-2026-0008 | 12,679,700 | 18,700,000 | 31,379,700 |
| P-2026-0009 | 4,683,800 | 4,400,000 | 9,083,800 |
| P-2026-0017 | 12,276,000 | 22,000,000 | 34,276,000 |
| P-2026-0018 | 24,646,600 | 7,700,000 | 32,346,600 |
| P-2026-0019 | 21,575,400 | 26,400,000 | 47,975,400 |
| P-2026-0026 | 5,656,200 | 25,300,000 | 30,956,200 |
| P-2026-0027 | 15,559,500 | 11,000,000 | 26,559,500 |
| P-2026-0028 | 30,567,900 | 29,700,000 | 60,267,900 |
| P-2026-0029 | 23,122,000 | 15,400,000 | 38,522,000 |
| P-2026-0030 | 4,048,000 | 1,100,000 | 5,148,000 |
| **합계** | **178,340,800** | **209,000,000** | **387,340,800** |

### 7.2 D2 — SYSTEM_SEED 110 차변 분리

| 거래처 | HEAD 현재 SALE_SUMMARY/기말 | 업무 SLIP journal 금액 | 예상 SALE_SUMMARY/기말 | 변화 |
|---|---:|---:|---:|---:|
| P-2026-0001 | 22,000,000 | 19,800,000 | 19,800,000 | -2,200,000 |
| P-2026-0002 | 9,020,000 | 5,500,000 | 5,500,000 | -3,520,000 |
| P-2026-0003 | 26,180,000 | 24,200,000 | 24,200,000 | -1,980,000 |
| **합계** | **57,200,000** | **49,500,000** | **49,500,000** | **-7,700,000** |

### 7.3 D3 — 비-CASH_RECEIPT 외상매출금 회수

| 거래처 | 현재 매출 | 현재 수금 | 회수 추가 | 예상 수금 | 현재 기말 | 예상 기말 |
|---|---:|---:|---:|---:|---:|---:|
| P-2026-0032 | 1,633,500 | 0 | 700,000 | 700,000 | 1,633,500 | 933,500 |
| P-2026-0033 | 5,068,800 | 0 | 800,000 | 800,000 | 5,068,800 | 4,268,800 |
| P-2026-0035 | 21,428,000 | 0 | 1,000,000 | 1,000,000 | 21,428,000 | 20,428,000 |
| P-2026-0036 | 3,682,800 | 0 | 1,100,000 | 1,100,000 | 3,682,800 | 2,582,800 |
| P-2026-0037 | 10,626,000 | 0 | 1,200,000 | 1,200,000 | 10,626,000 | 9,426,000 |
| P-2026-0038 | 21,687,600 | 0 | 1,300,000 | 1,300,000 | 21,687,600 | 20,387,600 |
| P-2026-0040 | 19,415,000 | 0 | 1,500,000 | 1,500,000 | 19,415,000 | 17,915,000 |
| **합계** | **83,541,700** | **0** | **7,600,000** | **7,600,000** | **83,541,700** | **75,941,700** |

세 cohort는 위 표에서 중복되지 않는다. 전체 순 기말 변화는 D1 `+209,000,000`, D2 `-7,700,000`, D3 `-7,600,000`, 합계 **+193,700,000원**이다. 이는 현재 공유 DB의 업무형 원천을 포함한 예측이며 운영 재무 확정값을 뜻하지 않는다.

## 8. 최종 구조 판정

- **원천/분류 규칙 수**: production source에 구현체 4벌, 정상 Spring에서 활성인 정본은 `PartnerLedgerReadModelService` 1벌이다. 그러나 그 정본 내부에서도 period와 opening이 서로 다른 규칙이다.
- **뿌리 수**: 구조적 1뿌리. 문서 단위 수집·분류 계약 부재다.
- **최소 폐쇄점**: stable source identity를 가진 journal/slip 단위 evidence → `DocumentType + Effect` 분류 계약 하나 → period/opening/목록/상세/인쇄/snapshot이 동일 결과 소비.
- **추가 fix 금지 판정**: `salesSeen` 조건 완화, 110 차변 sourceType 필터, 110 대변 합산을 각각 넣는 방식은 세 증상을 따로 막을 뿐 D4 가법성과 다음 sourceType을 다시 깨뜨린다.

## 9. 이 진단이 보지 않은 것

- R36 이미지를 빌드·배포·재기동하지 않았고, 컨테이너 lifecycle이나 내부 명령을 실행하지 않았다. HEAD 결과는 코드 분기와 read-only DB 원천으로 계산했다.
- DB INSERT/UPDATE/DELETE, migration 적용, snapshot capture/copy, 코드 수정, commit/push를 하지 않았다.
- 29개 `SLIP/system` orphan journal이 실제 회사 거래인지 개발 데이터인지는 회계 증빙과 운영자 확인 없이 확정하지 않았다. 본 진단은 현재 조회 계약에서 도달하는 원천과 `[DEV-SEED]` 명시 행을 분리했을 뿐이다.
- D3의 7개 `MANUAL/system` 회수도 실제 은행 입금과 대조하지 않았다. semantic source field가 없는 legacy 자료여서 설명·계정쌍·게시자를 증거로 사용했다.
- 110 대변의 모든 형태(반품, 대손, 상계, 환불, 역분개)를 전수 분류하지 않았다. 제안 구현 전에 별도 fixture 전수표가 필요하다.
- 데이터 규모가 커졌을 때 epoch~조회일까지 동일 분류기를 적용하는 SQL/메모리 성능은 측정하지 않았다.
- `dev_accountant`의 실행 권한과 실제 GUI/인쇄 렌더는 새로 반복하지 않았다. 이번 구조 판정에는 `dev_manager` API 기준선과 코드 소비 경로를 사용했다.
- 현재 CI 실패/진행 상태의 원인은 조사하지 않았다. 이번 라운드는 수집·분류 구조 진단으로 한정했다.

