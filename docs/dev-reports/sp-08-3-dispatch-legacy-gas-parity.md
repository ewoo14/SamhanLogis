# SP-08-3 배차 legacy GAS DB/API parity dev-report

> 작성일: 2026-05-16  
> 범위: SP-08-3-1 기반 잠금 — 배차 6개 legacy GAS 화면의 DB/API history parity 기획, 정적 계약, QA 캡처

## 구현 요약

- `docs/planning/2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md`를 SP-08-3 마스터 기획서로 추가했다.
- `clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts`를 추가해 6개 화면 매트릭스, 기존 endpoint 보존, 신규 history endpoint 후속 범위, UUID literal zero, Notion runtime zero, secret-like marker zero를 정적 계약으로 잠갔다.
- `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`는 PowerShell `System.Drawing`으로 1280×900 PNG 6장을 생성한다.
- 본 PR은 DB table/Flyway/controller/UI 2-Tab 구현을 하지 않는다. 실제 history table은 SP-08-3-2~4에서 도메인별로 분리 구현한다.
- `clients/desktop/playwright` 스펙은 기존 SP-08-2와 같은 로컬 전용 정적 계약이다. GitHub Actions `qa-e2e.yml`은 `qa/playwright`만 실행하므로 본 PR의 Playwright 수치는 CI bundle 이 아니라 로컬 Playwright bundle 로 기록한다.

## 6 화면 매트릭스

| legacy GAS | 현재 endpoint | 신규 history endpoint | programType | 후속 PR |
|---|---|---|---|---|
| 가배차분류리스트 | `GET /admin/arologis/dispatches/pre-classify` | `POST/GET /admin/arologis/dispatches/history` | `PRE_CLASSIFY` | SP-08-3-2 |
| 지방가배차분류리스트 | `GET /admin/arologis/dispatches/regional` | `POST/GET /admin/arologis/dispatches/history` | `REGIONAL` | SP-08-3-2 |
| 미배차리스트 | `GET /admin/arologis/dispatches/unassigned` | `POST/GET /admin/arologis/dispatches/history` | `UNASSIGNED` | SP-08-3-2 |
| 운송사-실배차내역 비교 | `POST /admin/arologis/dispatch/reconcile` | `POST/GET /admin/arologis/dispatches/history` | `RECONCILE` | SP-08-3-2 |
| 전표정리리스트 | `GET /slips/cleanup` | `POST/GET /slips/cleanup/history` | `SLIP_CLEANUP` | SP-08-3-3 |
| 배차안내문자 | `POST /admin/notifications/dispatch-batch/{preview,send}` | `POST/GET /admin/notifications/dispatch-sms/history` | `DISPATCH_SMS` | SP-08-3-4 |

## Backend 계약

| 도메인 | 예정 table | saveMode | 구현 시점 |
|---|---|---|---|
| arologis-service | `dispatch_save_history` | `AUTO_LATEST`, `MANUAL_NAMED` | SP-08-3-2 |
| slip-service | `slip_cleanup_save_history` | `AUTO_LATEST`, `MANUAL_NAMED` | SP-08-3-3 |
| notification-service | `dispatch_sms_save_history` | `AUTO_LATEST`, `MANUAL_NAMED`, `SEND_AUDIT` | SP-08-3-4 |

- 모든 신규 entity는 BaseEntity 7 audit 필드와 Soft Delete only를 따른다.
- 모든 신규 controller/DTO/service/entity에는 한국어 Javadoc과 springdoc `@Operation`을 작성한다.
- 기존 endpoint의 `@PreAuthorize` role과 history endpoint role을 100% 매칭한다.
- Testcontainers IT는 도메인별 외부 client 전체를 `@MockBean`으로 격리한다. SP-08-3-2 진입 시 `rg "Client" services/arologis-service/src/main/java` 결과 전체를 grep 하고 `SlipServiceClient` 단건 확인으로 끝내지 않는다.
- notification `SEND_AUDIT`는 공통 `DispatchSaveMode`가 아니라 notification 전용 `DispatchSmsSaveMode`에만 둔다.
- SP-08-3-4 commit 직전 `services/notification-service/src/main/resources/db/migration/V*.sql` glob 을 즉시 확인한다.
- sub-sub-task 별 최소 IT: AUTO_LATEST race 1건 / MANUAL_NAMED append 1건 / latest empty 404 1건 / 타인 history 403 1건.

## Frontend 계약

| 요소 | testid |
|---|---|
| 실행 탭 | `dispatch-history-tab-run` 등 domain prefix 기반 |
| 저장내역 탭 | `dispatch-history-tab-list` |
| 자동 복원 배너 | `dispatch-history-restored-banner` |
| 저장 버튼 | `dispatch-history-save-button` |
| 저장주제 입력 | `dispatch-history-topic-input` |
| 저장내역 행 | `dispatch-history-row-{i}` |
| 배차문자 send audit 행 | `dispatch-sms-history-row-{i}-send-audit` |

UUID는 path param과 내부 상태에만 사용하고 화면 텍스트와 `data-testid`에는 노출하지 않는다.

- PRE_CLASSIFY/REGIONAL 토글은 `useEffect` 의존 배열에 `programType`을 포함해 programType 별 latest 자동 복원을 격리한다.
- 공통 컴포넌트 리팩토링 전 `DpsHistoryTab.tsx` props 인터페이스 snapshot 을 본 dev-report 후속 섹션에 기록한다.
- 각 page 는 `isSaving: boolean` prop 에 `mutation.isPending`을 외부 주입한다.
- design-system 검증은 `grep -r '<input\|<select' src/renderer/pages/<target>` PASS 를 포함한다.
- testid prefix 는 arologis=`dispatch`, slip=`slip-cleanup`, notification=`dispatch-sms`로 고정한다.
- SMS 발송 버튼은 `--color-warning` token + 이중 confirm dialog 를 적용한다.

## QA/IT 매핑 보강

| 항목 | 후속 검증 |
|---|---|
| 예외 #1 payload 100KB 초과 | 422 IT |
| 예외 #2 AUTO_LATEST race | partial unique + retry IT |
| 예외 #4 topic 미입력 | 400 IT |
| 예외 #5 soft-deleted 복원 | 404 IT |
| 예외 #6 타인 history 접근 | 403 IT |
| 예외 #10 send audit 저장 실패 | 명시 메시지 + 운영 로그 IT |
| 예외 #11 동일일 `from=to` | 당일 데이터 포함 IT |
| 예외 #12 `from`/`to` null | 전체 기간 동작 IT |
| 통합 운영자 동선 | SP-08-3-9 또는 후속에서 가배차 분류 → 미배차 확인 → 배차문자 send e2e |

## 검증 항목

| 항목 | 기준 |
|---|---|
| Local Playwright 단독 | `npx playwright test playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts --reporter=line` |
| Local Playwright 회귀 | `npx playwright test playwright/sp-08-3-dispatch-parity playwright/sp-08-2-dps-history playwright/sp-08-legacy-gas-db-api-parity playwright/full-menu-contract --reporter=line` |
| QA mock PNG | `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` — 6 PNG / 1280×900 / non-zero |
| Secret scan | docs / desktop Playwright / 신규 diff 0 matches |
| Notion runtime scan | arologis/slip/notification `src/main`, desktop renderer 0 matches |

## 후속 구현 순서

1. SP-08-3-2 — arologis 4 화면 history DB/API/UI.
2. SP-08-3-3 — slip 전표정리 history DB/API/UI.
3. SP-08-3-4 — notification 배차문자 preview/send/audit history DB/API/UI.
