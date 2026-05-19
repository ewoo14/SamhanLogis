# 🔵 Claude TM 통합 리뷰 — SP-08-FU2 Cycle 1

**HEAD**: `233b40c8`
**PR**: #250
**리뷰어**: Claude BE + Claude QA+FE+Designer+DevOps 통합 + Codex 5-section
**CI**: ✅ 27/27 PASS (단, P0 fail-soft 가 가려서 운영 데이터 손실 위험)

## 종합 판정: **FIX 요청** — cycle 2 통합 fix 4건

---

## P0 / CRITICAL — 1건 (Codex 단독 발견)

### P0-1 [Codex] WarehouseInternalClient path 불일치 — 운영 데이터 손실

- **위치**: `services/slip-service/src/main/java/.../client/WarehouseInternalClient.java:73`
- **문제**: `GET /internal/warehouses/{warehouseId}` 호출, 실제 inventory-service WarehouseController 는 `@RequestMapping("/inventory/warehouses")` 사용
- **결과**: fail-soft 가 404 를 가려 CI/IT 통과, 운영에서 `destinationWarehouseName` 영구 null
- **fix**: path `/inventory/warehouses/{warehouseId}` 정정

---

## P1 / HIGH — 1건

### P1-1 [Claude QA] JournalControllerIT @MockBean PartnerLookupClient 누락

- **위치**: `services/accounting-service/.../it/JournalControllerIT.java`
- **문제**: LedgerService / LedgerImageService 가 `PartnerLookupClient` (RestClient) 주입. JournalControllerIT 가 같은 컨텍스트 로드 시 Eureka 비활성 환경에서 5xx 또는 ApplicationContext 로드 실패 가능
- **fix**: `@MockBean PartnerLookupClient` + `@BeforeEach` lenient stub 추가

---

## P2 / MINOR — 1건

### P2-1 [Claude QA] LedgerControllerIT 신규 작성 누락

- **위치**: `services/accounting-service/.../it/LedgerControllerIT.java` (미존재)
- **문제**: Q3-1/Q3-2/Q3-3 시나리오 계획되었으나 IT 구현 미작성
- **fix**: 3 케이스 신규 작성 (accountName 채움 / null fallback / partnerCode 미지정 회귀)

---

## Minor — 1건

### M-1 [Codex] impact-analysis.md trailing whitespace

- **위치**: `docs/design/sp-08-fu2-test-safety-bulk/impact-analysis.md:3-4`
- **fix**: trailing whitespace 제거

---

## 5-team 종합

| Team | 판정 | 비고 |
|---|---|---|
| BE (Claude) | APPROVE | P1 주의 (updateSlip warehouse snapshot 미적용 — 스코프 의도) |
| FE | APPROVE | 변경 0 정상 |
| Designer | APPROVE | 영향 0 |
| QA | FIX | JournalControllerIT + LedgerControllerIT 2건 |
| DevOps | APPROVE | V26 + infrastructure 영향 0 |
| **Codex TM** | **FIX 요청** | P0 (WarehouseClient path) + minor whitespace |

## 운영 영향

- **P0**: fail-soft 가 가렸지만 운영에서 `destinationWarehouseName` snapshot 영구 null → SP-08-FU1 P2-2 목표 무력화
- **P1**: 향후 LedgerService 등 RestClient 의존 endpoint 가 JournalControllerIT 컨텍스트에 추가될 때 IT 회귀 가능

**TM 결정: FIX 요청 → cycle 2 통합 fix → head B 재검**

상세 cycle 1 리뷰:
- [`docs/qa/sp-08-fu2-test-safety-bulk/claude-be-cycle1.md`](docs/qa/sp-08-fu2-test-safety-bulk/claude-be-cycle1.md)
- [`docs/qa/sp-08-fu2-test-safety-bulk/claude-qa-fe-designer-devops-cycle1.md`](docs/qa/sp-08-fu2-test-safety-bulk/claude-qa-fe-designer-devops-cycle1.md)
- [`docs/qa/sp-08-fu2-test-safety-bulk/tm-codex-cycle1.md`](docs/qa/sp-08-fu2-test-safety-bulk/tm-codex-cycle1.md)

Claude TM — 2026-05-19
