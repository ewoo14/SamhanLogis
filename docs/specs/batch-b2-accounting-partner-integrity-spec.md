# 배치 B2 — 회계/거래처 BE 데이터 정합 (기획 spec)

> OPUS 기획 · 백로그 번다운(B1-A/B1-B 후속). **BE 회계/거래처 데이터 정합 3건**을 한 배치로 정식 검증·close. 대상 **#839**(partner_code 50→100 sweep)·**#831**(lookup UNAVAILABLE→NOT_FOUND 붕괴 sweep)·**#838**(세금계산서 거래처 교체 audit). FE 잔여(#836 권한 UI·#832 mock)=B2-FE 후속 PR. ⚠️ SOL 기획검수가 과대 판정 시 #831 단독 등 분할 가능.

## 1. 배경·범위
전부 accounting-service(일부 partner-service 스냅샷) BE·pre-existing·회계/거래처 데이터 무결성. #838 audit 은 회계 무결성 정책이나 **2026-07-19 결정 배치 #6 선확인 완료**([[project_pending_decisions_2026_07_19]]·추가 승인·oldPartnerCode/partnerId snapshot+audit diff) → 재확인 불요.

## 2. 결정

### D-B2-01 (#839) partner_code VARCHAR(50)/@Size(50) → 100 defect-family sweep
`partners.partner_code`=VARCHAR(100)(실측 max 86·partner-service V11)인데 스냅샷/DTO 다수 50자 → 51~86자 코드 시 오류/400. **전 계열 100 통일**(전표 V18/V19·TaxInvoice #825 슬2 V61과 정합):
- **신규 Flyway 마이그(accounting) VARCHAR(100)**: `tax_invoice_batch_exclusions.partner_code`(V13)·`bank_transactions.partner_code`(V59). ⚠️ 적용된 마이그 불변([[feedback_applied_migration_immutable]])·신규 V만.
- **staging** `ecount_*_ledger_raw.partner_code`(V31/V34): **실분포 확인 후**(max len query) 위반 있으면 100 마이그·없으면 스코프 노트.
- **DTO `@Size(max=50)`→100**: `CashReceiptRequest`·`CreateCollectionPlanRequest`·`CreateNotesReceivableRequest`(테이블 컬럼 무·DTO-only).
- **fresh Postgres probe**([[feedback_migration_fresh_postgres_probe]]·Windows skip 가림)·`information_schema.character_maximum_length=100` 단언 + 86자 코드 실 flush IT.

### D-B2-02 (#831) partner lookup UNAVAILABLE→NOT_FOUND 붕괴 sweep
PartnerLookupClient 일시장애(5xx/네트워크/파싱)를 NOT_FOUND(empty)로 붕괴 → 실존 거래처 오진(중복 등록·조회 오표기). #829가 #810 경로 3분류(`LookupResult` FOUND/NOT_FOUND/UNAVAILABLE) sweep 완료. **pre-#810 회계 도메인 10사이트 동일 적용**:
- 대상(재확인): `CashReceiptService:453`·`DailyClosingService:120·246`·`CollectionPlanService:267`·`NotesReceivableService:135`·`LedgerImageService:59`·`LedgerService:92`·`SalesAggregateService:67`·`TaxInvoiceBatchFromSalesSlipsService:122`·`TaxInvoiceInboundService:122`·`JournalStatusReportService:184`.
- **UNAVAILABLE = 명확 오류**(재시도 가능·5xx/네트워크 fail-closed·[[feedback_it_mockbean_external_clients]] 정신)·**배치는 행 격리**(1행 실패가 전체 중단 아님)·**NOT_FOUND 만 "없음"**.
- **실 HTTP 회귀**([[feedback_enforcement_real_http_test]]·[[feedback_restclient_contract_test_false_green]]): `MockRestServiceServer` 로 partner-service 5xx→UNAVAILABLE(오류/재시도) vs 200 empty→NOT_FOUND("없음") 분기 게이트. @MockBean 우회 금지.

### D-B2-03 (#838) 세금계산서 거래처 교체 audit (결정 배치 선확인)
`TaxInvoiceService.update()` audit diff(`:126-141,160-169`)가 partnerName/Address/supplyDate/description 만 기록 → **상호 동일 P1→P2 교체 시 audit 전무**(partnerId/partnerCode만 변경·partnerName diff 없음). **fix**: `oldPartnerCode`(+partnerId) snapshot + audit diff 항목 추가. ⚠️ **감사 UI UUID 직접 노출 금지**([[feedback_uuid_no_user_visibility]])·partnerCode/name 조합 인간가독. **동일명 교체 IT**(P1 상호X 코드A → P2 상호X 코드B 교체 시 audit 에 code 변경 기록).

## 3. 검증
- **#839**: fresh Postgres probe(V1~신규 순차·`ON_ERROR_STOP`)·`information_schema` 100 단언·86자 코드 실 flush IT(각 스냅샷)·변경 모듈 전체 test([[feedback_changed_module_full_test_before_push]]).
- **#831**: 10사이트 각 `MockRestServiceServer` 5xx→UNAVAILABLE·200 empty→NOT_FOUND 실 HTTP IT(false-green 방지)·배치 행격리 IT.
- **#832 아님**(FE)·라이브QA: accounting 재배포 후 86자 코드 등록(#839)·partner-service down 시 UNAVAILABLE 오표기 아님(#831)·동일명 교체 audit(#838) 실서버 실증(가능 범위).
- CI skipped=0·ci.yml accounting 잡 신규 IT 포함.

## 4. 워크플로우 (풀 캐논)
OPUS 기획(본 spec·조기 PR·Closes #839/#831/#838) → CODEX SOL 기획검수(다회 GO) → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green → 머지·3이슈 close.

## 5. 스코프
BE 회계/거래처 데이터 정합 3건. FE(#836 PartnersPage 권한·#832 mock parity)=**B2-FE 후속**. 자동완성/UI(B1)·신기능 = 밖.
