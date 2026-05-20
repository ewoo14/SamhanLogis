# MIG-13 Minor 백로그 청소 — 설계 (Design Spec)

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-13-minor-cleanup`
> 입력: MIG-1~11 사후 재점검 + 사이클 누적 Minor 백로그

---

## 1. 개요

사용자 결정 5번 (Minor 청소). 작은 BE 한정 슬라이스 — admin UI 슬라이스 (MIG-14) 진입 전 코드 정리.

- baseline: MIG-1~12 모두 머지 완료
- 옵션 A 12단계 적용
- **DynamicPermissionClient @MockBean 일괄 청소 = MIG-14 admin UI 슬라이스로 이연** (PermissionGuard 단일화 SP-D5 자연 연장)

---

## 2. 청소 항목 (작은 BE 한정)

### 2.1 PartnerLookupClient Javadoc 정정 (MIG-12-MIN-2)
- `services/accounting-service/src/main/java/.../client/PartnerLookupClient.java:22-23`
- 기존: "fail-soft 패턴 — 404 / 401 / 5xx / 네트워크 모두 empty 반환"
- 변경: V32 follow-up (MIG-12) 후 401/403 fail-fast 격상 명시
- **fix**: Javadoc 1줄 정정 + 동작 검증 (이미 PartnerLookupClientTest 4 case 통과)

### 2.2 MIG-9 dev-report `journal_no` prefix stale (Agent 3 발견)
- `docs/dev-reports/ecount-mig-9-cash-journal-aging.md`
- 기존: `journal_no = J- + slip_no`
- 변경: MIG-9 사이클 1e fix 에서 `JD-` / `JR-` 접두사 분리됨 (cross-table 충돌 안전)
- **fix**: 1줄 정정

### 2.3 MIG-4 footer regex full-width 숫자 허용 (Agent 1 발견 P2)
- `services/accounting-service/src/main/java/.../service/EcountSalesPurchaseSummaryImporter.java:114`
- 기존: `\\d{4}/\\d{2}\\s*계\\s*\\(.*건.*` (ASCII 만)
- 변경: full-width 숫자 (`０-９`) + NBSP 공백 허용
- **fix**: 정규식 확장 + 단위 테스트 회귀 가드

### 2.4 ProductLookupClient/PartnerLookupClient sampleRawValue dead branch (Agent 1 발견)
- `services/inventory-service/src/main/java/.../EcountStockTransferImporter.java:337`
- `case MIG5_LOOKUP_MISS -> c[3]` dead branch (MIG5_WAREHOUSE_LOOKUP_MISS/PRODUCT_LOOKUP_MISS 만 throw)
- **fix**: dead branch 제거 + 주석 명시

### 2.5 MIG-3 AbstractPostgresIT HikariCP pool=5 hard-code 회고 명시 (Agent 1 발견)
- `services/accounting-service/src/test/java/.../it/AbstractPostgresIT.java:46`
- maximum-pool-size=5 / minimum-idle=1 magic number — test parallelism 도입 시 회귀 위험
- **fix**: 주석 추가 명시 (변경 X, future-proof 가드만)

---

## 3. 산출 예정 (5~10 file, 약 100~200 LOC)

| 영역 | 변경 |
|---|---|
| accounting-service | PartnerLookupClient Javadoc + EcountSalesPurchaseSummaryImporter 정규식 + AbstractPostgresIT 주석 |
| inventory-service | EcountStockTransferImporter dead branch 제거 |
| dev-report | MIG-9 stale 정정 |

---

## 4. DynamicPermissionClient 일괄 청소 — MIG-14 이연

30+ IT 가 `@MockBean DynamicPermissionClient` 의존. admin UI 슬라이스 (MIG-14) 가 PermissionGuard 단일화 (SP-D5 연장) 와 함께 처리 시 가장 자연 — 본 슬라이스 X.

---

## 5. 옵션 A 12단계 (사이클 1 첫 적용)

(이전 MIG-12 와 동일)

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 자율 진행
