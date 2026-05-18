## 요약

**SP-D3 — 매입/매출/배차 화면 6 페이지 @PreAuthorize → 동적 RBAC 점진 마이그레이션** (SP-D1 POC + SP-D2 회계 19 페이지 패턴 확장).

3 service (slip-service / arologis-service / notification-service) 모두 동일 `DynamicPermissionClient` 패턴 + 이중 가드 (기존 @PreAuthorize 보존 + 동적 row override). 사용자 요구 ② SALES/WAREHOUSE/DISPATCH hidden 일관.

## 변경 파일

### BE (3 service)
- **slip-service**: `DynamicPermissionClient` interface + Impl + 3 controller (Purchase/Sales/InboundInspection + ReceiptOcr) 이중 가드
- **arologis-service**: `DynamicPermissionClient` interface + Impl + `DispatchAdminV1Controller` dispatch.board 가드
- **notification-service**: `DynamicPermissionClient` interface + Impl + `DispatchSmsSaveHistoryController` notification.dispatch-sms.send-audit 가드

### IT (신규 + 기존 보강)
- 신규: `SlipDynamicPermissionIT` (6 case) + `ArologisDynamicPermissionIT` + `NotificationDynamicPermissionIT` + `DispatchSmsAuditDynamicPermissionIT`
- 기존 5개 IT 에 `@MockBean DynamicPermissionClient` + `@BeforeEach lenient stub` 자동 (SP-D2 P04 트랩 회귀 방지)

### FE (desktop)
- `routes/index.tsx` 6 라우트 PermissionGuard 적용 (sales/slips, purchases/slips, purchases/receipt-ocr, arologis/dispatch-sms/send-audit, dispatch-board, warehouse/inbound-inspections)
- `components/AppLayout.tsx` — showDispatchSms / showInboundInspection 동적 권한 전환 (SP-D1/D2 이미 적용된 항목 외 추가)

### QA
- Playwright 5 TC (T1 SALES / T2 WAREHOUSE / T3 DISPATCH / T4 권한 revoke / T5 직접 URL 차단)
- 도메인 정합성 SQL (6 PageCode + 역할별 기본 권한 + soft-delete + idempotency)
- scenarios + dev-report 10 section

## 검증

- [x] `./gradlew :services:slip-service:compileTestJava :services:arologis-service:compileTestJava :services:notification-service:compileTestJava` BUILD SUCCESSFUL
- [x] `npm run typecheck` (clients/desktop) PASS
- [x] false green 가드 0건 (실 코드 라인)
- [x] data-testid 18건
- [x] HashRouter 36건 정합
- [x] SP-D2 P04 트랩 회귀 방지 — 모든 기존 IT 에 lenient stub `@BeforeEach` 자동 적용

## 이중 가드 정책 (SP-D1/D2 일관)

| 상태 | 결과 |
|---|---|
| 동적 권한 row 없음 | fallback 통과 (기존 @PreAuthorize 만 적용) |
| canView=false + canEdit=false | row 미존재로 간주 → fallback 통과 |
| canView=true + canEdit=false | view-only override → POST/PUT 시 403 |
| canView=true + canEdit=true | 전체 통과 |
| actorRole=null/blank | 동적 검증 건너뜀 |

## 권한 매트릭스 (SP-D1 84 + SP-D2 49 = 133 row 중 SP-D3 관련)

| Role | purchases.slip.list | purchases.receipt-ocr | sales.slip.list | inbound.inspection | dispatch.board | notification.dispatch-sms.send-audit |
|---|---|---|---|---|---|---|
| MASTER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WAREHOUSE | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| SALES | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| DISPATCH | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| ACCOUNTANT | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

## SP-D 시리즈 진행

- ✅ SP-D1 동적 RBAC POC (#241)
- ✅ SP-D2 회계 19 페이지 마이그레이션 (#242)
- 🔄 **SP-D3 매입/매출/배차 6 페이지 (본 PR)**
- ⏭️ SP-D4 전체 121 @PreAuthorize 마이그레이션 (마지막)

연관 Issue: 사용자 요구 — 마스터 권한 관리 + 메뉴 hidden 시스템 점진 마이그레이션 (SP-D 시리즈)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
