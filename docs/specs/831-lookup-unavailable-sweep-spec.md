# #831 — partner lookup UNAVAILABLE→NOT_FOUND 붕괴 계열 sweep (기획 · OPUS 4.8)

> 상태: 기획 확정 (2026-07-24) · 배치 D 정찰(라이브 실증) 근거 · main `15a6310dd`
> 성격: **FIX (도달 가능한 결함)** — partner-service 일시 장애 시 사용자 오진 + 무음 오데이터
> 규모: 중형 — 단일 서비스(accounting) 13 호출부 / 10 파일 + RED-first 13건 + 라이브QA. 1슬라이스.

---

## 1. 결함 정의 (라이브 실증됨)

`accounting-service` 의 거래처 조회 13 호출부가 3분류 API(`PartnerLookupClient.LookupResult` — `FOUND`/`NOT_FOUND`/`UNAVAILABLE`, `client/PartnerLookupClient.java:38-57`)를 쓰지 않고 **`Optional`/`List` 반환 API** 를 써서, partner-service **일시 장애(UNAVAILABLE)** 가 **empty 로 붕괴**한다 → 사용자에게 3가지 방식으로 오작동:

**A군 — "없음" 오진 (9 호출부)** — 실존 거래처를 미등록으로 오인해 **중복 등록** 유발
| 파일:라인 | 붕괴 결과 |
|---|---|
| `CashReceiptService.java:454·463·473` | `"거래처코드/거래처명/사업자번호로 거래처를 찾을 수 없습니다"` |
| `DailyClosingService.java:123·259` | `"존재하지 않는 거래처입니다"` (일마감 생성·unlock) |
| `CollectionPlanService.java:267·276·286` | `"…거래처를 찾을 수 없습니다"` |
| `NotesReceivableService.java:135·144·154` | 동일 |
| `LedgerImageService.java:59` · `LedgerService.java:92` | `"존재하지 않는 거래처입니다"` |

**B군 — 오류조차 없이 빈 결과 (2 · 더 위험)**
| 파일:라인 | 붕괴 결과 |
|---|---|
| `SalesAggregateService.java:67-71` | `summary==null → List.of()` — **매출집계가 조용히 0건** |
| `report/JournalStatusReportService.java:184`+`:76-78` | `orElse(null) → emptyResponse()` — **전표현황이 조용히 0건** |

**C군 — 무음 null 필드 (2)**
| 파일:라인 | 붕괴 결과 |
|---|---|
| `TaxInvoiceBatchFromSalesSlipsService.java:126` · `TaxInvoiceInboundService.java:126` | `businessNo=null` → **사업자번호 없는 세금계산서 발행** |

**라이브 실증** (`:8080`, dev_master):
```
GET /api/accounting/ledgers?partnerCode=ZZZ-NOPE-999&from=2026-07-01&to=2026-07-24
  → HTTP 404 {"code":"NOT_FOUND","message":"존재하지 않는 거래처입니다: ZZZ-NOPE-999"}
```
partner-service 5xx/타임아웃 시 `LedgerService:92` 는 **동일한 404 "존재하지 않는 거래처입니다"** 를 반환 = 사용자가 실존 거래처를 미등록으로 오인하는 도달 가능 경로.

**정답 패턴이 이미 사내에 있다** — #810(`git log -S findByPartnerCodeResult` = `1865cf255` 1건)이 4곳(`BankTransactionService:382`·`CodefImportService:295`·`DepositMatchService:315`·`DepositorMappingService:370·378`)을 3분류로 전환. `partner-order-service/.../vendor/client/PartnerLookupClient.java` 는 `PartnerLookupUnavailableException` 보유(#853 산출). accounting 13 호출부만 미전환.

---

## 2. 불변식 (수단은 구현자 재량)

- **I-1** partner-service 일시 장애(UNAVAILABLE)와 실제 미존재(NOT_FOUND)를 **구별**한다. UNAVAILABLE 을 "존재하지 않는 거래처" 로 사용자에게 보이지 않는다.
- **I-2 (A군)** UNAVAILABLE 시 fail-closed — 작업(일마감·수금계획·받을어음·원장조회 등)을 **일시 장애임이 구별되는 에러**(예: 503/UNPROCESSABLE `"거래처 조회를 일시적으로 할 수 없습니다"`)로 중단한다. NOT_FOUND 메시지 재사용 금지.
- **I-3 (B군)** UNAVAILABLE 시 **조용히 빈 결과(0건)를 반환하지 않는다** — 매출집계·전표현황이 장애를 성공(0건)으로 위장하면 안 된다. 명시적 에러로 표면화.
- **I-4 (C군)** UNAVAILABLE 시 **null businessNo 로 세금계산서를 발행하지 않는다** — 발행을 차단하거나 장애 에러로 중단.
- **I-5** FOUND/NOT_FOUND 정상 동작 무회귀 — 실존 거래처는 여전히 조회되고, 진짜 미등록은 여전히 "존재하지 않는 거래처".
- **I-6** #810 이 이미 전환한 4곳은 건드리지 않는다(무회귀).

## 3. PM 설계 방향 (강제 아님 · 정답 패턴 이식)

`PartnerLookupClient` 에 3분류 조회 메서드(`findByPartnerCodeResult` 류)가 이미 있으면 13 호출부를 그것으로 전환. 없으면 #810 이 쓴 메서드를 재사용. UNAVAILABLE 처리는 **전용 예외**(partner-order-service 의 `PartnerLookupUnavailableException` 정신) 또는 각 서비스의 fail-closed 분기로. 공통 처리기(`@ExceptionHandler`)로 503/UNPROCESSABLE 한국어 메시지 일관화 권장.

## 4. 범위

**수정** — `accounting-service` 10 파일 13 호출부(§1 A·B·C군). 필요 시 `PartnerLookupClient` 에 3분류 메서드 보강.
**범위 밖** — #810 전환 완료 4곳 · `notification-service`/`partner-order-service` 의 동일 패턴(계열 확장 후보지만 별 서비스 = 별 슬라이스) · UUID 노출 규칙 무관.

## 5. 테스트 (RED-first 13건)

각 호출부마다 **partner-service UNAVAILABLE(5xx/타임아웃) 상황에서 붕괴를 재현하는 실패 테스트**를 먼저 쓴다:
- A군: `@MockBean PartnerLookupClient` 가 UNAVAILABLE 반환 → 서비스가 **"존재하지 않는 거래처" 가 아닌** 일시장애 에러를 던지는지(RED = 현재는 NOT_FOUND 메시지).
- B군: UNAVAILABLE → 집계/현황이 **0건이 아니라 에러**인지(RED = 현재 0건).
- C군: UNAVAILABLE → 세금계산서 발행이 **차단**되는지(RED = 현재 null businessNo 발행).
- 🚨 `@MockBean` 우회 금지([[feedback_it_mockbean_external_clients]]) — 외부 RestClient 계약테스트 false-green 주의([[feedback_restclient_contract_test_false_green]]). UNAVAILABLE 은 실제로 partner-service 5xx/timeout 을 mock 해 재현.
- 뮤테이션: fix 후 3분류 분기를 제거하면 RED 재발.

## 6. 라이브QA (실서버)

partner-service 를 **일시 중단**(docker stop) 또는 5xx 주입 후, 실 accounting 화면(원장 조회·일마감·매출집계)에서 UNAVAILABLE 이 "존재하지 않는 거래처" 오진이 아니라 **일시장애 안내**로 뜨는지, 매출집계가 0건이 아니라 에러인지 실 GUI 스크린샷. partner-service 복구 후 정상 무회귀.
⚠️ 공유 실데이터 write 금지 — 읽기 경로만. partner-service 중단은 로컬 스택 한정.

## 7. 하네스 지표
수렴비 `c` < 0.45 목표. 매 라운드 `c`·`r` PR 기록. 계열 13건이라 fix-유발률(회귀) 주시.
