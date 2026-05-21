# MIG-14 admin UI 4 화면 통합 dev-report

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-14-admin-ui-4-screens`
> 기준 문서: `docs/superpowers/specs/2026-05-21-mig-14-admin-ui-4-screens-design.md`, `docs/superpowers/plans/2026-05-21-mig-14-admin-ui-4-screens.md`

---

## 1. 범위

MIG-14는 MIG-7~11에서 만들어진 회계 마이그레이션 도메인을 운영자가 조회할 수 있도록 Samhan Public desktop admin UI에 4개 화면군을 연결한다. 동시에 MIG-12 백로그였던 `DynamicPermissionClient @MockBean` deprecation warning을 shared/security 통합 인터페이스 기반으로 청소한다.

| 영역 | 범위 |
|---|---|
| Cash | 지출/입금 거래 조회, 페이지네이션, 거래처/전표번호/종류/일자 필터 |
| Order | 주문 목록, 진행상태/담당자/거래처 필터, 주문 상세 + 라인 조회 |
| AgingSnapshot | `partner_aging_snapshot` materialized view 조회, net 컬럼 표시, refresh |
| Ledger | 매출장/매입장 staging 조회, DailyClosing 대조 결과 표시 |
| Permission | V25 PageCode MIG14 4종 + `PermissionGuard` 적용 |
| Test cleanup | 30+ IT의 deprecated service-local `DynamicPermissionClient` mock을 shared/security 통합 인터페이스 mock으로 교체 |

---

## 2. Endpoints / Pages

### Backend endpoints

| 화면군 | Endpoint | 비고 |
|---|---|---|
| Cash | `GET /api/v1/accounting/cash-disbursements` | page/size/filter, UUID 비공개 DTO |
| Cash | `GET /api/v1/accounting/cash-receipts` | page/size/filter, UUID 비공개 DTO |
| Order | `GET /api/v1/accounting/orders` | `progressStatus`, `managerName`, `partnerName` filter |
| Order | `GET /api/v1/accounting/orders/{orderNo}` | `orderNo` 비즈니스 식별자 path |
| AgingSnapshot | `GET /api/v1/accounting/aging-snapshot` | `partnerName`, `sort=net_receivable_desc` |
| AgingSnapshot | `POST /api/v1/accounting/aging-snapshot/refresh` | MIG-9 refresh endpoint 재사용 |
| Ledger | `GET /api/v1/accounting/ledger/sales` | sales ledger staging 조회 |
| Ledger | `GET /api/v1/accounting/ledger/purchase` | purchase ledger staging 조회 |

### Desktop pages

`clients/desktop/src/renderer/routes/accounting/admin/` 아래에 7개 페이지를 둔다.

| 페이지 | 역할 |
|---|---|
| `CashDisbursementListPage.tsx` | 지출결의서 기반 CashDisbursement 조회 |
| `CashReceiptListPage.tsx` | 입금보고서 기반 CashReceipt 조회 |
| `OrderListPage.tsx` | 이카운트 주문 목록 조회 |
| `OrderDetailPage.tsx` | 주문 상세 + OrderLine 조회 |
| `PartnerAgingSnapshotPage.tsx` | 거래처별 미수/미지급/현금 net snapshot 조회 |
| `SalesLedgerPage.tsx` | 매출장 staging + DailyClosing 대조 조회 |
| `PurchaseLedgerPage.tsx` | 매입장 staging + DailyClosing 대조 조회 |

---

## 3. UUID privacy / credential guard

- 모든 화면과 API 응답 DTO는 내부 UUID를 표시하지 않는다. 사용자에게 보이는 식별자는 `slipNo`, `journalNo`, `orderNo`, `partnerName`, `managerName`, `accountCode`, `transactionDate` 같은 업무 식별자로 제한한다.
- `OrderDetailPage` path는 `orderNo`를 사용한다. 내부 `orderId`, `partnerId`, `managerEmployeeId`, staging row id는 renderer text/test id/screenshot에 노출하지 않는다.
- Playwright fixture는 실 계정, 사업자등록번호, API key, Sheet ID, token을 포함하지 않는다. 테스트 데이터는 `거래처A~E`, `주문-샘플`, `J-샘플` 등 placeholder만 사용한다.
- CI에는 기존 `credential-plaintext-guard` job이 `scripts/check-credential-plaintext.sh`를 실행한다. MIG-14 Playwright spec은 해당 shell guard와 GitGuardian을 전제로 하고, fixture 안에 평문 자격이나 운영 secret-like 문자열을 추가하지 않는다.
- `.github/workflows/ci.yml`의 주석 기준으로 Playwright fixture hard gate는 후속 슬라이스로 남아 있다. MIG-14에서는 문서/spec reference와 shell guard 준수를 완료 조건에 포함한다.

---

## 4. DynamicPermissionClient cleanup note

SP-D5 이후 service-local `DynamicPermissionClient`는 shared/security의 `com.samhanair.logis.security.permission.DynamicPermissionClient`를 확장하는 deprecated adapter다. MIG-14 청소 범위는 deprecated 타입 제거가 아니라 IT mock 대상 정렬이다.

| 대상 | 작업 |
|---|---|
| accounting-service IT | TaxInvoice / EcountMig / Sales/PurchaseAccountingSlip 계열 mock 교체 |
| user-service IT | 직원/권한 관련 3건 mock 교체 |
| inventory-service IT | 재고/창고 관련 2건 mock 교체 |
| slip-service IT | 전표/견적 관련 5건 mock 교체 |
| notification-service IT | 알림 관련 3건 mock 교체 |
| partner-order-service IT | 주문 관련 1건 mock 교체 |

Deprecated adapter 완전 삭제는 운영 검증 후 별도 슬라이스로 둔다.

---

## 4.1 Cycle 1c 권한 보강

Claude cycle 1c 지적에 따라 MIG-14 조회 컨트롤러도 FE `PermissionGuard`와 동일한 PageCode를 BE에서 직접 시행한다.

| Endpoint | PageCode | 정책 |
|---|---|---|
| `GET /api/v1/accounting/cash-disbursements` | `ecount.mig14.cash-list` | `VIEW` |
| `GET /api/v1/accounting/cash-receipts` | `ecount.mig14.cash-list` | `VIEW` |
| `GET /api/v1/accounting/orders` | `ecount.mig14.order-list` | `VIEW` |
| `GET /api/v1/accounting/orders/{orderNo}` | `ecount.mig14.order-list` | `VIEW` |
| `GET /api/v1/accounting/aging-snapshot` | `ecount.mig14.aging-snapshot` | `VIEW` |
| `GET /api/v1/accounting/ledger/sales` | `ecount.mig14.ledger` | `VIEW` |
| `GET /api/v1/accounting/ledger/purchase` | `ecount.mig14.ledger` | `VIEW` |

- `@PreAuthorize` 정적 역할은 `MASTER`, `MANAGER`, `ACCOUNTANT`로 확장한다.
- V25 auth seed는 `ACCOUNTANT × 4 PageCode`를 `can_view=true`, `can_edit=false`로 추가한다.
- 동적 권한은 SP-D5 `@RequirePermission(action = "VIEW")` AOP로 시행하며, `DynamicPermissionClient.canView(roleCode, pageCode)=false`이면 403으로 차단한다.

---

## 5. QA / verification placeholders

| 항목 | 명령 / 산출 | 상태 |
|---|---|---|
| Backend 회귀 | `./gradlew :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon` | TODO |
| Desktop typecheck | `cd clients/desktop && npm run typecheck` | TODO |
| Desktop lint | `cd clients/desktop && npm run lint` | TODO |
| Desktop build | `cd clients/desktop && npm run build` | TODO |
| Playwright | `cd clients/desktop && npx playwright test mig-14-*` | TODO |
| Credential guard | `bash scripts/check-credential-plaintext.sh` | TODO |
| UUID scan | 신규 DTO/renderer/screenshot/test id에서 UUID regex 노출 0건 | TODO |
| QA screenshots | `docs/qa/mig-14-admin-ui-4-screens/screenshots/*.png` 4장 이상 | TODO |

Cycle 1c local verification:

- `./gradlew.bat :services:accounting-service:test :services:auth-service:test --no-daemon`은 sandbox 네트워크 제한으로 Gradle zip 다운로드 단계에서 실패했다.
- 동일 task를 로컬 캐시 Gradle 8.10.2로 재실행해 `BUILD SUCCESSFUL` 확인.
- `cd clients/desktop && npm run typecheck` 통과.
- `cd clients/desktop && npm run build` 통과. Pretendard runtime font resolve warning은 기존 경고다.

Cycle 1e follow-up:

- `POST /admin/accounting/aging-snapshot/refresh`는 MIG-14 화면 액션이므로 `ecount.mig14.aging-snapshot` PageCode `EDIT` 권한으로 검증한다.
- `ACCOUNTANT`는 V25 seed에서 `can_view=true`, `can_edit=false`이므로 조회는 가능하지만 refresh는 403으로 차단된다.
- Ledger `dailyDiff`는 필터된 row 합계가 아니라, 같은 거래일의 전체 raw 합계(`raw_totals`)와 `daily_closings` 합계를 비교한다. partner/status 필터는 화면 row에만 적용된다.
- Cash 조회 API는 `partnerName` query를 수신하고 partner-service lookup 결과의 `partnerId`로 cash 도메인을 필터링한다.
- AgingSnapshot refresh 버튼은 `ecount.mig14.aging-snapshot` edit 권한이 로드되어 true일 때만 표시한다.

---

## 6. CI path finding

`.github/workflows/ci.yml`은 `clients/desktop/**`를 `paths-ignore`에 포함하지 않는다. 따라서 `clients/desktop` 변경은 PR에서 `frontend-desktop` job을 트리거하며, 해당 job은 design-system 사전 빌드 후 desktop `typecheck`, `lint`, `build`를 실행한다.

이번 DevOps/TM 문서 작업은 `docs/**` 중심이라 현 CI 설정상 자동 PR CI는 트리거되지 않는 것이 의도와 일치한다. `clients/desktop` source 변경이 들어오는 병렬 FE 작업은 별도 커밋/PR diff에서 CI가 실행된다.

---

## 7. 문서 동기화

- `README.md`: 최신 진행 메모에 MIG-14 진행 상태 추가
- `ROADMAP.md`: Phase 10.6 진행 메모와 참조 문서에 MIG-14 추가
- `migration/decisions/DECISIONS.md`: D-MIG-14-01~09 추가
- `clients/desktop/README.md`: MIG-14 admin UI route/guard/QA 계약 추가
- `services/accounting-service/README.md`: MIG-14 조회 endpoint 계약 추가
- `docs/handoff/CURRENT-WORK.md`: 현재 브랜치와 병렬 작업 주의사항 갱신
- `docs/samhan-public-overview.html`: nav badge와 Phase 10.6 진행 문구 갱신

---

## 8. Minor backlog / 회고

| 항목 | 처리 |
|---|---|
| BE-MIN-1 `partnerNames` N+1 | PartnerLookupClient batch endpoint 도입 슬라이스에서 처리 |
| BE-MIN-2 AgingSnapshot 500 cap | 운영 초기는 500건 상한 유지. 대량 거래처 운영 확인 후 서버 페이지네이션 또는 cursor API로 확장 |
| BE-MIN-3 `LedgerListOptions.slipNo` orphan | cycle 1c에서 제거 |
| FE-MIN-1 권한 캐시 flash | SP-D PermissionGuard 일관 패턴 유지, skeleton/denied 상태 개선은 후속 |
| FE-MIN-2 라벨 design 불일치 | cycle 1c에서 `tokens.md`를 실제 enum 값 기준으로 정정 |
| FE-MIN-3 refresh 토스트 | AgingSnapshot refresh UX 개선 백로그 |
| Designer-MIN-2 chip + reset 미구현 | 필터 chip/reset 공통 컴포넌트화 시 처리 |
| QA-MIN-1 스크린샷 mock fallback | Windows `EPERM` 때문에 mock fallback PNG를 사용. Linux CI에서 재캡처 |
| QA-MIN-2 Playwright 정규식 | 화면 안정화 후 `data-testid` 중심으로 강화 |
| DevOps-MIN-1 BASE_URL fallback README | Playwright dev-server/BASE_URL 표준화 시 desktop README에 보강 |
