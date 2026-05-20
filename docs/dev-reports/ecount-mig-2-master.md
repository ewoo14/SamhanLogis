# MIG-2 이카운트 마스터 5종 일괄 마이그레이션 — dev-report (3-layer 누적)

> 작성일: 2026-05-20
> spec: [2026-05-20-ecount-mig-2-master-design.md](../superpowers/specs/2026-05-20-ecount-mig-2-master-design.md)
> plan: [2026-05-20-ecount-mig-2-master.md](../superpowers/plans/2026-05-20-ecount-mig-2-master.md)
> branch: `spec/2026-05-20-mig-2-master`
> PR: #270
> 입력: `docs/migration/ecount-data/raw/` 7종 — 품목(13컬럼) / 품목관계 / 품목계층그룹 / 계정상세내역 / 통장계좌 / 창고 / 부서코드

---

## 1. 산출 요약 (43 file → 사이클 보강 포함 최종 +15 file)

| 항목 | 결과 |
|---|---|
| Flyway 신규 | V7 product-service (Product 확장 + ProductAlias + staging 3 + ecount_item_alias) / V22 accounting (CardMaster + ChartOfAccount.code 폭 확장 + staging 2 + ecount_account_map) / V7 user (staging.ecount_department_raw + ecount_department_map) / V12 inventory (staging.ecount_warehouse_raw + ecount_warehouse_map) / V15 auth (PageCode MIG2 5종 + permission seed) / V8 product 보강 (model_code 100자 확장) |
| 도메인 변경 | Product 확장 (product_code/model_code 폭 100 + categoryGroup) + ProductAlias + ProductTaxType + CardMaster |
| 신규 service | EcountProductImporter / EcountAccountImporter / EcountCardImporter / EcountDepartmentImporter / EcountWarehouseImporter (5종 모두 @Transactional REQUIRES_NEW + pg_advisory_xact_lock + 사전 복구 CTE) |
| 신규 controller | 5 importer 별 `POST /admin/.../imports/ecount` (multipart, ROLE_MASTER+MANAGER) |
| 신규 ErrorCode | MIG2_ALIAS_DUPLICATE / MIG2_NO_MAIN_CANDIDATE / MIG2_CODE_OUT_OF_RANGE / MIG2_CSV_HEADER_MISMATCH / MIG2_FILE_HASH_INVALID 등 7종 |
| 공유 인프라 | `EcountCsvSupport` (BOM strip + meta row `데이터관리>` 인식 + strict header 검증 + advisoryLockKey UUID XOR + requireMaxLength) + OpenCSV 5.9 + commons-beanutils 1.11.0 (CVE-2025-48734) |
| 단위 테스트 | 5 importer × 7~16 case + EcountCsvSupportTest = **약 50건 PASS** — alias dedup / REJECT_NAME_NULL / MIG2_ALIAS_DUPLICATE / MIG2_NO_MAIN_CANDIDATE / MIG2_CODE_OUT_OF_RANGE / BOM_INPUT / MULTIPLE_ALIAS_RELATION / SOURCE_ROW_NO containsExactly / LOOKUP_MAP_IDEMPOTENT / soft-deleted 복구 / strict header / placeholder narrow |
| 자동 lookup map | `staging.ecount_item_alias` / `ecount_account_map` / `ecount_department_map` / `ecount_warehouse_map` — MIG-3+ 트랜잭션 transform 의 alias_code → main_product_uuid 자동 정규화 의존 해소 |
| raw CSV cross-check | classpath fixture 5종 (`src/test/resources/ecount-raw-fixtures/*.csv`) CI 강제 (assumeTrue skip 제거) |

검증: `./gradlew :services:product-service:test :services:accounting-service:test :services:user-service:test :services:inventory-service:test :services:auth-service:test :shared:common:test` → BUILD SUCCESSFUL 34 task

---

## 2. 결정 (D-MIG-2-01 ~ D-MIG-2-15)

[migration/decisions/DECISIONS.md](../../migration/decisions/DECISIONS.md) D-MIG-2 entry 참조.

핵심 결정 15건:
- D-MIG-2-01 한 PR 통합 5종 (단일 통합 PR 패턴)
- D-MIG-2-02 품목 alias = Product + product_aliases 별도 테이블 ([project_ecount_product_identity_rule] 사용자 확정)
- D-MIG-2-03 3-Tier (Excel → staging.raw → 도메인) MIG-1 PoC 100% 미러
- D-MIG-2-04 자동 lookup map 4종 (item_alias / account_map / department_map / warehouse_map) — MIG-3+ 의존 해소
- D-MIG-2-05 권한: ROLE_MASTER+MANAGER 만 can_edit (DISPATCH/MEMBER false fallback)
- D-MIG-2-06 멱등 키 = source_file_hash + source_row_no
- D-MIG-2-07 pg_advisory_xact_lock (UUID namespace XOR MD5(hash)) for race condition
- D-MIG-2-08 REQUIRES_NEW + READ_COMMITTED + saveAndFlush retry
- D-MIG-2-09 품목 main 선정: relation main > DB active `status='ACTIVE'+is_deleted=FALSE created_at ASC LIMIT 2` > 동명 다건 시 MIG2_NO_MAIN_CANDIDATE
- D-MIG-2-10 placeholder regex `^(-|0+|0+[- ]?0+[- ]?0+)$` (MIG-1 narrow 패턴 재사용)
- D-MIG-2-11 business key 초과 시 truncate 금지, MIG2_CODE_OUT_OF_RANGE reject
- D-MIG-2-12 EcountCsvSupport header strict 검증 (trailing column 거부)
- D-MIG-2-13 5 importer soft-deleted row 사전 복구 CTE (UPDATED 집계)
- D-MIG-2-14 V8 ALTER product.model_code VARCHAR(64→100) (V7 product_code 정합)
- D-MIG-2-15 commons-beanutils 1.11.0 전역 constraint (CVE-2025-48734 mitigation)

---

## 3. 5-team 사이클 결과 (9회차 워크플로우)

| 사이클 | head | Claude (BE/QA) | Codex (BE/QA/DevOps) |
|---|---|---|---|
| 1 | `1e273e66` | 5/5 APPROVE | 3 REQUEST CHANGES (alias 경합/main 선정/group1) |
| 2 | `c98ec070` | BE APPROVE 조건부 + QA APPROVE | BE+QA REQUEST CHANGES (6 P1+4 QA) |
| 3 | `c098e531` → `8ad95b79` | BE APPROVE + QA APPROVE 조건부 (Mockito 자택 환경 한정) | P1 1+P2 3 → 보강 fix 후 APPROVE |
| 3 보강-2 | `7b36b739` | — | Account CTE Nit 후속 가능 |

머지: `gh pr merge 270 --squash --delete-branch` ([feedback_user_merge_authority] 3 조건 충족)

다음 슬라이스: **MIG-3 회계 전표 묶음** (accounting-service, MIG-2 자동 lookup map 4종 의존 해소 후 첫 트랜잭션 transform)
