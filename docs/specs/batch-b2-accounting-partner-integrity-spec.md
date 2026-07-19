# 배치 B2 — accounting partner_code 폭 + 세금계산서 audit (기획 spec v3)

> OPUS 기획 · 백로그 번다운. **CODEX SOL 기획검수 R1(BLOCKING 6·분할) 반영 v2.** 초안(#839+#831+#838)에서 **#831(lookup 붕괴 sweep) 분리**(13사이트·per-caller 계약·⚠️세금계산서 businessNo=null 무결성 정책=개발책임자 결정 대기). B2 = **#839(accounting 유효 스키마 한정) + #838(audit·결정배치 선확인)**.

## 1. 결정

### D-B2-01 (#839) accounting partner_code VARCHAR(50)→100 (accounting 유효 스키마 한정·SOL 정정)
⚠️ SOL 실측 정정: spec 초안 `bank_transactions.partner_code`는 **실재 안 함** — V59가 만든 것은 `bank_depositor_partner_mapping.partner_code`(엔티티 `BankDepositorPartnerMapping.partnerCodeSnapshot` length=50). 신규 accounting 마이그 = **V63**(최신 V62·충돌 없음).
- **V63(accounting) VARCHAR(100)**: `tax_invoice_batch_exclusions.partner_code`(V13)·`bank_depositor_partner_mapping.partner_code`(V59)·**staging `ecount_sales_ledger_raw.partner_code`·`ecount_purchase_ledger_raw.partner_code`(V31/V34)** — ⚠️staging 빈테이블(0행)이라 **분포 무관 무조건 100**(MIG-11 importer가 partnerCode 직접 INSERT·행단위 catch 없어 51자=배치 롤백). `ALTER TYPE` 짧은 ACCESS EXCLUSIVE lock·배포 순서(신버전 배포→V63) 명시.
- **엔티티(SOL HIGH)**: `TaxInvoiceBatchExclusion.length=50→100`·`BankDepositorPartnerMapping.partnerCodeSnapshot length=50→100`.
- **DTO @Size 100**: `TaxInvoiceBatchExclusionRequest`·`BankDepositorPartnerMappingRequest.partnerCode`(신규 @Size 100)·`CashReceiptRequest`·`CreateCollectionPlanRequest`·`CreateNotesReceivableRequest`(50→100).
- **FK/인덱스(SOL HIGH)**: 물리 FK 없음·partial unique(batch_exclusions)·B-tree(staging) 재생성 불요.
- ⚠️ **범위 명시(SOL BLOCKING-3)**: 본 슬라이스 = **accounting-service 유효 스키마 한정**. partner_db/partner_order_db/slip_db/notification/groupware/arologis/partner_auth 의 **12 추가 partner_code 컬럼(40/50/30자)은 별도 cross-service sweep**(개발책임자 우선순위 대기·본 PR 명시 제외표). "전 계열 통일" 주장 철회.

### D-B2-02 (#838) 세금계산서 거래처 교체 audit (결정배치 #6 선확인)
`TaxInvoiceService.update()`(`:133 snapshot`·`:160 diff`)가 partnerName만 기록 → 상호 동일 P1→P2 교체 audit 전무. **fix(SOL HIGH 반영)**:
- **변경감지 = `partnerId` 기준·값 비교(SOL R2 B-2)**: 수정 전 `oldPartnerId`/`oldPartnerCode`/`oldPartnerName` snapshot → **`boolean partnerChanged = !Objects.equals(oldPartnerId, ti.getPartnerId())`**(⚠️`!=` 참조비교 금지·역직렬화 동일 UUID 오감사 방지). `partnerChanged`면 **전용 `recordPartnerChanged(...)`**(⚠️기존 `recordIfChanged()` 재사용 금지 — old/new 문자열 동등 시 return하여 동일코드/동일상호 별UUID 교체 누락). 회귀 IT 양방향: 동일 UUID+description만 변경→partner audit **0건** / 다른 UUID+동일 code·name→partner audit **1건**.
- audit **field name**(예 `taxInvoice.partner`)·old/new = **인간가독 문자열만**: 코드 존재 `"상호X (코드A)"`·**코드 없음(nullable) `"상호X (코드 미등록)"`**·상호 blank 방어 fallback. **UUID 금지 범위 = `changes[*].oldValue/newValue`(+fieldName)** 한정([[feedback_uuid_no_user_visibility]]) — SSE envelope `actorId`·DB audit `entity_id/actor_id`는 내부 감사키로 허용(기존 `AuditEventPayloadBuilder` 계약).
- audit 엔티티/스키마 변경 **불요**(V5 `field_name VARCHAR(50)`·`old/new TEXT` 수용).
- best-effort audit(실패를 mutation 성공 처리)·actor zero UUID/system = 기존 정책 유지 명시.

## 2. 검증 (SOL BLOCKING-6·hard gate 분리·클래스명 고정)
- **#839**: **fresh + V62→V63 upgrade Postgres probe**(V1~V63 순차·`ON_ERROR_STOP`)·4 유효 컬럼 `information_schema=100` 단언·**86자 및 정확히 100자 저장·왕복 성공·101자 HTTP 400**·batch_exclusion·depositor_mapping 실 entity flush·**sales/purchase ledger 실 importer 86자 XLSX import**·V62 기존 행/인덱스 보존.
- **#838**: **실 Spring/Postgres audit 영속 IT**(단위 mock verify 불충분·`recordIfChanged` RuntimeException 삼킴·`AuditLogRecorder` optional): PUT `/accounting/tax-invoices/{id}` 성공·partnerId/code P2 변경·`accounting_audit_logs`에 partner 교체 row 존재·**`changes[*].oldValue/newValue`에 UUID 문자열 없음**(SSE `actorId`·DB `entity_id/actor_id` 내부키 허용)·표시값 code/name만.
- **CI 클래스별 hard gate(SOL R2 H-1·클래스명·경로 고정)**: 신규 IT `PartnerCodeWidthMigrationIT`(V63 fresh·4컬럼 information_schema=100·flush)·`PartnerCodeWidthUpgradeIT`(V62→V63 upgrade probe·기존 행/인덱스 보존)·`TaxInvoicePartnerChangeAuditIT`(동일명 교체 audit 영속·양방향)·(MIG-11 importer 경계 별도 클래스) — 각 `services/accounting-service/build/test-results/test/TEST-<FQCN>.xml` **존재·`tests>0`·`failures=0`·`errors=0`·`skipped=0`** 명시 검사(⚠️`skipped=0`만은 0-test report/잘못된 필터 놓침). ci.yml accounting 잡 등재.
- 라이브QA: accounting 재배포 후 86자 코드 등록(#839)·동일명 교체 audit(#838) 실서버 실증.

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec v2·PR #859) → CODEX SOL 기획검수(R1 BLOCKING 6→v2·재검수 GO) → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green → 머지·**#839/#838 close**.

## 4. 스코프·후속(개발책임자 대기)
- B2 = accounting partner_code(#839 유효 스키마) + audit(#838).
- **#831 lookup 붕괴 sweep = 별도 PR·⚠️세금계산서 두 경로 businessNo=null on lookup 실패 정책(NOT_FOUND도 차단? 법정 snapshot 무결성)=개발책임자 결정 필요**(배치 미포함·[[feedback_integrity_domain_policy_preconfirm]]). 13 unguarded 사이트·per-caller 계약(importer 행격리/mutation 5xx/발행 원자)·전용 503 code.
- **partner_code cross-service 12컬럼 full sweep = 개발책임자 우선순위**(7 서비스 마이그).
