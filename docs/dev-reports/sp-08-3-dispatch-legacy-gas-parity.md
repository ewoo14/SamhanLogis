# SP-08-3 배차 legacy GAS DB/API parity dev-report

> 작성일: 2026-05-16  
> 범위: SP-08-3-1 기반 잠금 — 배차 6개 legacy GAS 화면의 DB/API history parity 기획, 정적 계약, QA 캡처

## 구현 요약

- `docs/planning/2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md`를 SP-08-3 마스터 기획서로 추가했다.
- `clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts`를 추가해 6개 화면 매트릭스, 기존 endpoint 보존, 신규 history endpoint 후속 범위, UUID literal zero, Notion runtime zero, secret-like marker zero를 정적 계약으로 잠갔다.
- `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`는 PowerShell `System.Drawing`으로 1280×900 PNG 6장을 생성한다.
- 본 PR은 DB table/Flyway/controller/UI 2-Tab 구현을 하지 않는다. 실제 history table은 SP-08-3-2~4에서 도메인별로 분리 구현한다.

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
- Testcontainers IT는 외부 client를 `@MockBean`으로 격리한다.

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

## 검증 항목

| 항목 | 기준 |
|---|---|
| Playwright 단독 | `npx playwright test playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts --reporter=line` |
| Playwright 회귀 | `npx playwright test playwright/sp-08-3-dispatch-parity playwright/sp-08-2-dps-history playwright/sp-08-legacy-gas-db-api-parity playwright/full-menu-contract --reporter=line` |
| QA mock PNG | `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` — 6 PNG / 1280×900 / non-zero |
| Secret scan | docs / desktop Playwright / 신규 diff 0 matches |
| Notion runtime scan | arologis/slip/notification `src/main`, desktop renderer 0 matches |

## 후속 구현 순서

1. SP-08-3-2 — arologis 4 화면 history DB/API/UI.
2. SP-08-3-3 — slip 전표정리 history DB/API/UI.
3. SP-08-3-4 — notification 배차문자 preview/send/audit history DB/API/UI.
