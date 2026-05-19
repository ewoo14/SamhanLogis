# SP-08-FU2 BE 리뷰 — Claude Cycle 1

**HEAD**: `233b40c8`
**PR**: #250
**리뷰어**: Claude BE subagent
**리뷰일**: 2026-05-19

## 판정: APPROVE (P1 주의 1건)

### P2-2 warehouse name snapshot — PASS

- V26 migration NULLable + `IF NOT EXISTS` idempotent + ddl-auto=validate 호환
- `Slip.snapshotDestinationWarehouseName()` 도메인 메서드 chain (직접 set 금지)
- `WarehouseInternalClient.findWarehouseName()` fail-soft 3단계 (null 파라미터 / 401 / 5xx)
- 43 IT `@MockBean WarehouseInternalClient` 일관 적용 (SP-08-FU1 패턴 재사용)

### P1 주의 — `SlipService.createSlip()` INBOUND 만 snapshot, `updateSlip()` 미적용

스코프 의도 가능하지만, 전표 수정 시 `destinationWarehouseId` 변경 케이스에서 창고명 갱신 누락. Javadoc TODO 또는 다음 슬라이스에서 결정 권장.

### P2-3 PartnerLookupClient — PASS

- `PartnerInternalController.getPartnerSummary(@PathVariable UUID id)` 신규 endpoint
- `PartnerLookupClient.findByPartnerId(UUID)` placeholder → 실 RestClient + fail-soft (404/401/5xx)
- `PartnerInternalControllerIT` 2 케이스 + `PartnerAgingServiceTest` 회귀 2건 신규

### P2-4 LedgerLine.accountName — PASS (N+1 방지 양호)

- `LedgerService.getLedger()` accountCode Set 일괄 수집 → `findAllById()` batch → Map 캐시 → loop lookup (HTTP 추가 호출 0)
- `LedgerImageService.getLedger()` 동일 패턴
- `accountName` null 허용 (Java record nullable, Javadoc 명시)
- `LedgerImageServiceTest.accountNameMappedFromChartOfAccount()` 회귀 검증

### 잠재 회귀 종합

- 43 IT @MockBean WarehouseInternalClient SP-08-FU1 UserInternalClient 패턴 100% 재사용
- AbstractPostgresIT, SlipRealtimeBrokerConcurrencyIT 제외 정합

Claude BE — 2026-05-19
