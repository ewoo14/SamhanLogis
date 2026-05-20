# MIG-13 Minor 백로그 청소 — Plan

> Codex `mcp__codex__codex sandbox=workspace-write`.

작은 BE 한정 슬라이스 — Javadoc + 정규식 + 주석 + dev-report stale 정정.

## 작업 그룹 18 (Codex 일괄)

### Task 1: PartnerLookupClient Javadoc 정정
`services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java:22-23` 의 'fail-soft 패턴' 문구 → V32 (MIG-12) 후 401/403 fail-fast 격상 명시:
```java
/**
 * ... 401/403 응답은 fail-fast (MIG12_INTERNAL_AUTH_MISS throw). 404/EmptyResult/5xx 는 Optional.empty() ...
 */
```

### Task 2: MIG-9 dev-report 정정
`docs/dev-reports/ecount-mig-9-cash-journal-aging.md` — `journal_no = J-` 표현을 `JD-` (CashDisbursement) / `JR-` (CashReceipt) 로 정정. 1e fix 결과 반영.

### Task 3: EcountSalesPurchaseSummaryImporter footer regex 확장
`services/accounting-service/src/main/java/.../service/EcountSalesPurchaseSummaryImporter.java:114` 의 footer 정규식 확장:
- 기존: `\\d{4}/\\d{2}\\s*계\\s*\\(.*건.*`
- 변경: `[\\d０-９]{4}/[\\d０-９]{2}[\\s\\u00A0]*계[\\s\\u00A0]*\\(.*건.*` (full-width 숫자 + NBSP 공백)
- 동일 `누계` / `오전|오후` 정규식도 동일 패턴 확장
- 단위 테스트: `full_width_숫자_footer_정확_skip` 회귀 케이스 추가

### Task 4: EcountStockTransferImporter dead branch 제거
`services/inventory-service/src/main/java/.../service/EcountStockTransferImporter.java:337` 의 `case MIG5_LOOKUP_MISS -> c[3]` 분기:
- MIG5_LOOKUP_MISS 는 본 importer 에서 throw 안 됨 (WAREHOUSE_LOOKUP_MISS / PRODUCT_LOOKUP_MISS 만)
- 분기 제거 + 주석 명시 "다른 importer (Expense/Deposit) 와 enum 공유 — 본 importer 에서는 사용 안 됨"

### Task 5: AbstractPostgresIT 주석 추가
`services/accounting-service/src/test/java/.../it/AbstractPostgresIT.java:46` 의 HikariCP `maximum-pool-size=5` 에 주석:
```java
// PostgreSQL 단일 Testcontainers reuse 가정 — test parallelism 도입 시 connection 부족 회귀 가능, 재검토 필요 (사후 재점검 회고)
```

### Task 6: 단위 테스트 + dev-report

- `EcountSalesPurchaseSummaryImporterTest` 의 full-width footer 회귀 케이스 1건
- `docs/dev-reports/mig-13-minor-cleanup.md` 신규 (Minor 5건 정리 요약)
- `migration/decisions/DECISIONS.md` (D-MIG-13-01~05)

## 검증

```
./gradlew.bat :shared:common:test :services:accounting-service:test :services:inventory-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit:

```
chore(mig-13): Minor 백로그 청소 (Javadoc + footer regex + dead branch + 주석 5건)

- PartnerLookupClient Javadoc 정정 (MIG-12 V32 후 fail-fast 격상 명시)
- MIG-9 dev-report journal_no JD-/JR- 분리 정정
- EcountSalesPurchaseSummaryImporter footer regex full-width 숫자 + NBSP 허용
- EcountStockTransferImporter MIG5_LOOKUP_MISS dead branch 제거 + 주석
- AbstractPostgresIT HikariCP pool=5 회고 주석

DynamicPermissionClient @MockBean 일괄 청소는 MIG-14 admin UI 슬라이스 이연.

옵션 A 12단계 적용.

local 검증: 3 service BUILD SUCCESSFUL ✓
```

push: `origin spec/2026-05-21-mig-13-minor-cleanup`
