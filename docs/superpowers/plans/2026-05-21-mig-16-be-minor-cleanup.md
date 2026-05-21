# MIG-16 BE Minor 청소 — Plan

> Codex `mcp__codex__codex sandbox=workspace-write`. 옵션 C 21단계.

## 작업 (Codex 일괄)

### Task 1: partner-service batch lookup endpoint
- `POST /internal/partners/lookup-by-ids` — body: `{"ids":["uuid1","uuid2"]}` → response: `{"partners":[{"id":"...","name":"..."},...]}`
- X-Internal-Token 가드 + IT 4 case (정상 / 빈 결과 / 토큰 누락 / 일부 미존재)
- PartnerLookupClient batch 메서드 신규 (`findByPartnerIdsBatch(List<UUID>) → Map<UUID, String>`)

### Task 2: AccountingAdminQueryService batch partner lookup
- `partnerNames` 호출 → `partnerNamesBatch(List<UUID>)` 단일 batch
- 7 endpoint (Cash 2 + Order 2 + Aging 1 + Ledger 2) 모두 적용
- 단위 테스트: batch 호출 1회 + N=50 검증

### Task 3: AGING_LIMIT 페이지네이션
- AccountingAdminQueryService.listAgingSnapshot(Pageable, filter) 시그니처 변경
- 기본 size=100, max size=500
- `GET /aging-snapshot?page=N&size=M&sort=net_receivable_desc`
- AccountingAdminQueryController 갱신

### Task 4: PartnerAgingSnapshotPage refresh 토스트
- react-hot-toast 또는 기존 toast 컴포넌트 (Mig9CashJournalController 사용처 grep)
- 성공: "새로고침 완료 — last_refreshed_at"
- 실패: "새로고침 실패 — 운영자 문의" + error 콘솔

### Task 5: AppLayout 권한 로딩 처리
- dynamicCanAccess 캐시 미로드 시 → false (보수적 deny 변경)
- 또는 sidebar 메뉴 skeleton loader 추가
- SP-D 일관성: 회계 19 페이지 동일 패턴 적용 여부 확인

### Task 6: dev-report + 문서 동기화
- `docs/dev-reports/mig-16-be-minor-cleanup.md`
- DECISIONS D-MIG-16-01~06
- handoff / overview HTML (nav-badge `Phase 10.6 · MIG-16 BE Minor 청소`)

## 검증

```
./gradlew :services:accounting-service:test :services:partner-service:test :shared:common:test --no-daemon
cd clients/desktop && npm run typecheck && npm run build
```

BUILD SUCCESSFUL 후 commit:

```
chore(mig-16): BE Minor 청소 (partnerNames batch + AGING pagination + refresh 토스트 + 권한 flash)

D-MIG-16-01: partner-service /internal/partners/lookup-by-ids batch endpoint
D-MIG-16-02: AccountingAdminQueryService partnerNames N+1 → 1 batch HTTP
D-MIG-16-03: AGING_LIMIT 500 → Pageable (기본 100 / 최대 500)
D-MIG-16-04: PartnerAgingSnapshotPage refresh 성공/실패 토스트
D-MIG-16-05: AppLayout 권한 로딩 중 admin 메뉴 hidden (보수적 deny)

옵션 C 21단계.
```
