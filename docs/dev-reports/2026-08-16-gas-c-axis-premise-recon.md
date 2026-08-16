```text
cwd   C:/dev/Samhan-Public   (main, 읽기 전용)
HEAD  f6e9e132458f54e09d65cd53b688bd959b88a48b
```

# GAS Ⓒ 축 남은 5개 전제 정찰

- 정찰일: 2026-08-16 (Asia/Seoul)
- 정찰 범위: `docs/dev-reports/2026-08-16-gas-difference-triage.md`의 남은 Ⓒ 축 5개, 현행 제품 코드·화면 라우트·공유 DB, `.claude/memory/*.md`, `docs/decisions/*.md`, GitHub 전체 상태 이슈
- 안전 조건: 제품 코드와 컨테이너를 변경하지 않았다. 공유 PostgreSQL 조회는 모두 `BEGIN; SET TRANSACTION READ ONLY; ...; ROLLBACK;`으로 실행했다. 집계값만 기록했고 UUID와 자격 문자열은 출력하지 않았다.

## 1. 결론 요약

| 축 | 딸린 Ⓒ 규칙 ID | 전제 확정 | 결정 필요 여부 |
|---|---|---|---|
| ① 발송금지 정책 | DS-R06 · DS-R07 · DS-R09 | 운영 정본은 `partner_db.blocked_partners`; Notion runtime은 퇴역했고 CSV 6행은 일회성 미적재분이다. 경고 유지·복사/발송 제외·조회 장애 fail-closed도 이미 Ⓐ 규칙과 완전계승 결정에 들어 있다. | **결정 불필요** — 6행 적재와 현행 불일치 해소가 남은 구현/데이터 작업이다. |
| ② 회계자료 원천 | REM-R01 · REM-R02 · REM-R03 · REM-R05 · REM-R06 · REM-R10 · REM-R12 · REM-R13 · REM-R16 | 내부 판매·구매전표, POSTED 분개, 입금보고서, 세금계산서와 공급자 프로필 DB가 운영 원천이다. 레거시 업로드 파일은 이관·대조 자료이고 홈택스 Excel은 입력 원천이 아니라 출력물이다. | **결정 불필요** — 기존 결정과 다른 현행 경로는 회계 원천을 다시 고를 문제가 아니라 계약 불일치다. |
| ③ 품목별 DPS 목적 | B-01 · B-02 · B-03 | 목적은 `가입고 → 품목별 DPS 대조 → 실입고 확정`; DPS Excel만 외부 입력이고 왼쪽 이카운트 파일은 내부 입고전표로 대체됐다. | **결정 불필요** — #1011에서 목적과 흐름이 이미 확정됐다. |
| ④ 입출고 원천·기간 | I-01 · I-04 · A-03 | Drive Excel/CSV가 아니라 내부 확정 입출고전표가 원천이다. 기간 기능은 최대 12개월 계승, 연도 비교는 고정 숫자가 아니라 최신 두 연도의 의미를 보존한다. | **결정 불필요** — #1012 완전계승 결정과 외부 원천 DB 치환 결정이 소유한다. 현재 무제한 서버 조회는 구현 불일치다. |
| ⑤ 이익 지표 정의 | A-01 | 내부 전표의 VAT 제외 공급단가로 `판매단가-매입단가`; 이익률은 그 차액을 매입단가로 나눈 값이다. 회계상 영업이익·순이익이 아니다. | **결정 불필요** — #1012 후속 정정과 구현·실데이터 검증에서 이미 정의됐다. |

**결정 불필요로 닫힌 축: 5 / 5개.** 열린 #1238은 이 다섯 축에 대해 새 선택을 받아야 할 근거가 되지 않는다. CLOSED 이슈가 구현 완료를 자동 증명하지는 않지만, 여기서는 이슈 본문에 남은 개발책임자 결정이 “무엇을 정했는가”의 증거이고, 구현·DB 실측은 “지금 어디까지 도달했는가”를 별도로 보여 준다.

---

## 2. ① 발송금지 정책

### 딸린 규칙

`DS-R06`, `DS-R07`, `DS-R09` (`docs/dev-reports/2026-08-16-gas-difference-triage.md:117-119`).

### 현행 실재 여부

- **도메인과 DB가 실재한다.** `BlockedPartner`는 `blocked_partners` 테이블을 소유한다 (`services/partner-service/src/main/java/com/samhanair/logis/partner/domain/BlockedPartner.java:21-32`). 목록·등록·CSV import·해제 API는 `/api/v1/partners/admin/blocks`에 있다 (`services/partner-service/src/main/java/com/samhanair/logis/partner/controller/PartnerBlockAdminController.java:50,66,88,109,122`).
- **화면이 실재한다.** `/admin/blocked-partners` 라우트가 등록돼 있다 (`clients/desktop/src/renderer/routes/index.tsx:1559`; 화면 `clients/desktop/src/renderer/routes/admin/BlockedPartnersPage.tsx:2,98,226-278`).
- **소비 경로가 실재한다.** 배차문자 preview는 거래처코드로 차단 여부를 조회하고 `blocked`와 `발송금지 업체입니다.`를 응답에 남긴다 (`services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchPreviewService.java:121-146`). 조회 실패는 현재 `false`로 내려간다 (`:164-171`). 화면 clipboard 행은 현재 `blocked` 필터 없이 전 행을 조립한다 (`clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:233-250`). 즉 기능은 있으나 fail-open·복사 포함 불일치도 실재한다.
- **실데이터:** `partner_db.blocked_partners` 활성 **0건**, 삭제 포함 전체 **0건**. 2026-08-16 현재 빈 집합이다.

### 레거시 원천 생존 여부

- Notion runtime read는 현행 운영 코드에서 퇴역했다. 네 Notion 파생 표를 DB CRUD로 치환하고 runtime 의존을 0으로 둔 결정이 있다 (`.claude/memory/project_sp_08_legacy_gas_parity.md:13-22`).
- BLOCK CSV snapshot **6행은 살아 있지만 운영 정본과 경합하지 않는다.** 일회성 적재 원천이며 자동 추종이 없다 (`docs/dev-reports/2026-08-16-legacy-data-load-gaps.md:20-25,49-57`). #1234는 6행을 포함한 전체 적재를 확정했으나 아직 OPEN이다.

### 기존 결정 대조

- 운영 정본은 DB이고 CSV는 이관 원천이라는 개발책임자 확정 (`docs/decisions/2026-08-16-gas-c-axis-decisions.md:9-28`).
- #1234 OPEN: BLOCK 6행 포함 전체 일회성 적재 확정. OPEN인 이유는 데이터 작업이 남았기 때문이지 정책 선택이 남았기 때문이 아니다.
- Ⓐ에 이미 `DS-R08`(금지 전표를 숨기지 않고 사유 표시), `S-06`(조회 장애 fail-closed), `N-02`(발송제한 예외·사유 표시)가 분류돼 있다 (`docs/dev-reports/2026-08-16-gas-difference-triage.md:51,66,75`).

### 결정 필요 여부

**결정 불필요.** 차단 데이터 6행 적재, 차단행 clipboard 제외, 조회 장애 fail-closed, 금지 전표 경고 유지가 이미 정해졌으며 현재 0건·fail-open·clipboard 포함은 결정 공백이 아니라 데이터/구현 불일치다.

---

## 3. ② 회계자료 원천

### 딸린 규칙

`REM-R01`, `REM-R02`, `REM-R03`, `REM-R05`, `REM-R06`, `REM-R10`, `REM-R12`, `REM-R13`, `REM-R16` (`docs/dev-reports/2026-08-16-gas-difference-triage.md:122-130`).

### 현행 실재 여부

- **원장:** 판매전표와 POSTED 분개를 합성하고, 잔액 정본은 POSTED 분개라고 코드가 명시한다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:117-156`). 화면은 `/accounting/partner-ledger`와 `/accounting/ledgers`다 (`clients/desktop/src/renderer/routes/index.tsx:1073,1343`).
- **거래명세서:** 현행 batch는 ISSUED 세금계산서 snapshot을 읽는다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/StatementBatchService.java:31,46-60`). 화면은 `/accounting/statement-batch`다 (`clients/desktop/src/renderer/routes/index.tsx:1050`).
- **홈택스:** preview는 내부 판매/출고전표를 조회해 59열 Excel을 만든다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:269-280`). 화면은 `/accounting/hometax-export`다 (`clients/desktop/src/renderer/routes/index.tsx:1038`).
- **세금계산서:** `/accounting/tax-invoices` 계열 목록·묶음·수신·작성 화면이 모두 등록돼 있다 (`clients/desktop/src/renderer/routes/index.tsx:1417-1467`).
- **실데이터:** `accounting_db` 활성 분개 **165건**(DRAFT 45 · POSTED 91 · REVERSED 29), 분개라인 **373건**; 세금계산서 **19건**(DRAFT 4 · ISSUED 12 · CANCELLED 3), 세금계산서 라인 **22건**; 홈택스 batch **14건**, batch 제외 **0건**; 매출 회계전표/라인 **1/1건**, 매입 회계전표/라인 **2/2건**, 일마감 **3건**이다.

### 레거시 원천 생존 여부

- 레거시의 채권·매출·입금·계정별원장 업로드 파일은 이관/대조 snapshot으로는 남지만 runtime 정본이 아니다. Samhan Public이 이카운트를 대체하고 자체 DB가 system of record라는 결정이 있다 (`.claude/memory/project_replaces_ecount_gas_was_exporter.md:8-19`).
- 홈택스 Excel은 **외부 입력 원천이 아니라 내부 전표에서 생성하는 출력물**이다. 개발책임자는 전자세금계산서를 외부 ASP로 보내지 않고 GAS 방식의 홈택스 일괄 업로드 Excel을 유지한다고 확정했다 (`.claude/memory/project_external_integration_research.md:15-22,41-49`).
- 따라서 외부 파일과 내부 DB가 동시에 같은 회계 사실을 지배하는 경합 상태는 아니다. 이관용 raw/import 경로와 운영 read model을 구분해야 한다.

### 기존 결정 대조

- #1001 CLOSED: 거래처별 원장 행은 **출고된 판매전표와 입금보고서 두 종류**, 판매 품목은 VAT 포함 표시단가와 구조화 배송주소를 사용한다.
- #1072 CLOSED: 계정과목은 이카운트 코드 체계를 현행 `chart_of_accounts`에 이관한 체계가 정본이다. “외부 파일 runtime 정본” 결정이 아니라 내부 계정마스터 값의 계승 결정이다.
- #1144 CLOSED: 원장은 판매/구매전표 자체로 즉시 반영하고, 세금계산서는 연결된 매출/매입 회계전표를 게이트로 삼는 흐름이 개발책임자 명세다.
- #1014 CLOSED와 완전계승 정의는 원장·거래명세서의 기능/표현 데이터를 계승하되 저장소는 DB로 바꾸는 것을 허용한다 (`.claude/memory/feedback_gas_full_inheritance_definition.md:11-32`).
- 홈택스 작성일자·공급자·제외 단위도 “GAS 일괄 Excel 방식 그대로 유지” 결정의 기능/표현 계약에 포함된다. 현행이 다르면 새 정본을 고르는 문제가 아니라 계승 검증 대상이다.

### 결정 필요 여부

**결정 불필요.** 내부 판매·구매전표/POSTED 분개/세금계산서/공급자 프로필이 운영 원천이고, 원장·명세서·홈택스의 기존 결정도 존재한다. REM 규칙의 현행 차이는 그 계약에 대한 구현 정합성 문제다.

---

## 4. ③ 품목별 DPS 목적

### 딸린 규칙

`B-01`, `B-02`, `B-03` (`docs/dev-reports/2026-08-16-gas-difference-triage.md:135-137`).

### 현행 실재 여부

- **화면/API가 실재한다.** 화면은 `/warehouse/dps-compare/by-product` (`clients/desktop/src/renderer/routes/index.tsx:1823`), API는 `GET /warehouse/audit/dps-compare/by-product` (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:106-134`)다.
- **현재 실제 동작은 검수 pivot이다.** `inbound_inspections`의 PENDING/COMPLETED/CANCELED 수량을 품목별 집계한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/InboundInspectionLineRepository.java:48-71`). `diffFromDps=0`이고 DPS 연결은 후속으로 남겼다고 서비스가 명시한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsByProductService.java:20-41`).
- **DPS 파일 비교 경로도 별도로 실재한다.** `POST /warehouse/audit/dps-compare`는 DPS Excel 1개를 받고 내부 출고전표를 자동 조회한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:36-44,65-87`).
- **실데이터:** 활성 입고검수 header **1건(COMPLETED)**, 검수라인 **6건/6모델**, DPS 저장이력 **0건**이다.

### 레거시 원천 생존 여부

- DPS Excel은 지금도 살아 있는 외부 입력이다. 자동 취득할 수 없어 사용자가 올리는 계약이 controller에 명시돼 있다 (`DpsCompareController.java:36-44`).
- 레거시 왼쪽 이카운트 Excel은 살아 있는 운영 원천이 아니다. 내부 INBOUND 입고전표가 그 자리를 대체한다. 즉 **외부 DPS와 내부 입고전표의 의도적 대조**이지 두 정본의 경합이 아니다.

### 기존 결정 대조

- #1011 CLOSED: `가입고처리 → 품목별 DPS 비교 → 실입고 확정`을 한 흐름으로 두고, 이카운트 전송 대신 내부 입고전표(구매전표)를 사용한다고 개발책임자가 확정했다.
- 같은 조사 결과는 목표 흐름을 `DPS 가입고 업로드 → 내부 입고전표 발행 → DPS 정상입고 대조 → 검수 정상수량 확정 → 재고 반영 + 입고전표 확정`으로 기록한다 (`docs/dev-reports/2026-08-01-1011-provisional-receipt-recon.md:1-24`).
- 현재 by-product pivot은 이 목적 전체를 구현하지 않는다. CLOSED 이슈를 구현 증거로 쓰지 않고, 목적 결정 증거로만 쓴다.

### 결정 필요 여부

**결정 불필요.** 품목별 DPS의 목적은 “가입고 이후 실입고 확정”으로 이미 정해졌고, 현재 pivot·0 history는 그 목적에 덜 도달한 구현 상태다.

---

## 5. ④ 입출고 원천·기간

### 딸린 규칙

`I-01`, `I-04`, `A-03` (`docs/dev-reports/2026-08-16-gas-difference-triage.md:138-141`). `A-03`은 이익 산식이 아니라 비교 연도/기간 규칙이므로 이 축에 묶었다.

### 현행 실재 여부

- **내부 전표 집계 서비스가 실재한다.** INBOUND/OUTBOUND 전표를 기간 조회한 뒤 CONFIRMED/DELIVERED/COMPLETED 상태만 모델별로 집계한다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/service/InOutAnalysisService.java:32-60,74-83`).
- **API/화면이 실재한다.** `GET /slips/query/inout-analysis?dateFrom&dateTo` (`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipQueryController.java:67-76`), 화면 `/inventory/inout-analysis` (`clients/desktop/src/renderer/routes/index.tsx:670`)다.
- **현재 기간은 임의 입력이다.** 서버는 두 날짜를 그대로 받고 최대기간을 제한하지 않는다 (`SlipQueryController.java:67-76`). 이 점은 레거시 최대 12개월 계약과 다르다.
- **실데이터:** 활성 전표 **236건**, 활성 라인 **344건**, 전표일 범위 **2026-05-20~2026-08-16**. 현재 서비스 상태조건에 들어오는 전표는 INBOUND **27건**, OUTBOUND **21건**(합계 48건), 라인은 INBOUND **36건**, OUTBOUND **24건**(합계 60건), 모델 **11개**이며 연도는 2026년 하나다.

### 레거시 원천 생존 여부

- 레거시 `이카운트입출고내역.xlsx`와 Drive 입·출고 CSV 폴더는 runtime 원천으로 퇴역했다. 외부 Excel 업로드를 DB로 치환한다는 개발책임자 결정이 있다 (`.claude/memory/project_sheets_to_db_full_migration.md:1-12`).
- 파일 snapshot이 대조 자료로 남는 것과 운영 조회가 파일을 읽는 것은 다르다. 현행 화면과 API는 `slip_db`를 읽으므로 경합은 없다.

### 기존 결정 대조

- #1012 CLOSED: 입출고 내역(19)·분석(20) **완전계승**, 복수 칩·품목별 이익률·판매추이 기반 구매예측까지 함께 설계한다고 확정했다.
- 완전계승 정의는 기능·표현 데이터를 보존하고 저장수단은 바꿀 수 있다고 명시한다 (`.claude/memory/feedback_gas_full_inheritance_definition.md:11-32`). 따라서 최대 12개월은 기능 계약이고, `2025/2026` 숫자 자체가 아니라 전년/당년 비교 의미가 계약이다.
- 현행은 최근 두 연도를 선택한다 (`clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts:86-102`). 2025/2026 literal을 계속 고정하지 않으면서 두 연도 비교 의미를 유지한 구현이다.

### 결정 필요 여부

**결정 불필요.** 원천은 내부 전표 DB, 기간 기능은 최대 12개월 계승, 연도는 동적 전년/당년이라는 기존 결정으로 닫힌다. 서버의 무제한 기간은 결정할 선택지가 아니라 계약과의 차이다.

---

## 6. ⑤ 이익 지표 정의

### 딸린 규칙

`A-01` (`docs/dev-reports/2026-08-16-gas-difference-triage.md:140`).

### 현행 실재 여부

- **산식이 제품 코드에 실재한다.** 입고·출고의 VAT 제외 공급가액 합을 각 수량으로 나눠 매입단가·판매단가를 만든 뒤 `단위이익=판매단가-매입단가`, `이익금액=단위이익×출고수량`, `이익률=단위이익÷매입단가×100`으로 계산한다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/service/InOutAnalysisService.java:107-121`).
- 매입이 없는 판매 품목은 이익값을 `null`로 남긴다 (`:107-116`). 화면은 같은 `/inventory/inout-analysis`다 (`clients/desktop/src/renderer/routes/index.tsx:670`).
- **실데이터:** 현재 응답 집계와 같은 SQL에서 분석행 **11개**, 입고·출고가 모두 있는 행 **10개**, 이익률 산정 가능 행 **10개**, 판매만 있고 입고가 없는 행 **0개**다.

### 레거시 원천 생존 여부

- 레거시는 수량만 계산해 이 지표의 외부 원천이 없다. 이익은 내부 전표의 거래 snapshot에서 새로 파생되는 지표다.
- 매입/판매 기준값은 `slip_lines.supply_amount` 우선, 없으면 `unit_price×quantity`이며 둘 다 내부 DB 값이다 (`InOutAnalysisService.java:47-57`). 외부 파일과의 정본 경합이 아니다.

### 기존 결정 대조

- #1012 CLOSED는 원본보다 넓은 품목별 이익률을 요구했다.
- 후속 실데이터 조사는 개발책임자 정정에 따라 회계상 영업이익·순이익이 아니라 **품목별 판매 시 금액 − 입고 시 금액**으로 범위를 확정했다 (`docs/dev-reports/2026-08-01-1012-profit-basis.md:3-9`). VAT 제외 공급단가를 기준값으로 확정했고, 판관비·영업외손익·법인세 배부는 범위 밖이라고 분리했다.
- 구현·적대검증은 서로 다른 입고/출고 수량의 총액을 빼지 않고 단가를 비교하며, 분모를 매입단가로 사용한다 (`docs/dev-reports/2026-08-02-1012-reconvergence.md:107-122`).

### 결정 필요 여부

**결정 불필요.** 지표 이름과 산식은 이미 “매입·판매 단가 차익/매입단가 대비율”로 정정·구현돼 있으며, 회계상 순이익·영업이익으로 다시 정의하는 축이 아니다.

---

## 7. 읽기 전용 DB 조회 기록

모든 DB에서 같은 트랜잭션 형태를 사용했다.

```sql
BEGIN;
SET TRANSACTION READ ONLY;
-- COUNT/GROUP BY/MIN/MAX 집계만 실행
ROLLBACK;
```

집계 시각의 핵심 원문:

```text
partner_db     blocked_active=0, blocked_total=0
inventory_db   inspection_status:COMPLETED=1, inspection_lines_active=6,
               inspection_models_active=6, dps_history_active=0
accounting_db  journals_active=165 (DRAFT 45 / POSTED 91 / REVERSED 29),
               journal_lines_active=373,
               tax_invoices_active=19 (DRAFT 4 / ISSUED 12 / CANCELLED 3),
               tax_invoice_lines_active=22, tax_batches_active=14
slip_db        active_slips=236, active_lines=344,
               period=2026-05-20..2026-08-16,
               eligible slips INBOUND 27 / OUTBOUND 21,
               eligible lines INBOUND 36 / OUTBOUND 24,
               analysis_rows=11, profit_rate_nonnull=10
```

## 8. 최종 판정

이번 5개는 “레거시와 현행 중 어느 것을 새로 고를 것인가”라는 결정 목록이 아니다.

- 발송금지는 **승인된 일회성 원천이 아직 DB에 안 들어간 상태**다.
- 회계는 **외부 파일 이관 자료와 내부 운영 원천을 한 층으로 본 오해**다.
- 품목별 DPS는 **이미 정한 목적에 현재 pivot이 덜 도달한 상태**다.
- 입출고는 **퇴역 Drive 파일과 내부 전표 DB를 경합으로 본 오해**이며 기간 계약도 완전계승 결정에 포함된다.
- 이익은 **이미 정정된 거래 차익 지표를 회계상 영업이익·순이익 결정으로 다시 물은 상태**다.

따라서 다섯 축 모두 추가 결정 없이 닫고, 남은 차이는 데이터 적재와 구현 정합성으로 분류한다.
