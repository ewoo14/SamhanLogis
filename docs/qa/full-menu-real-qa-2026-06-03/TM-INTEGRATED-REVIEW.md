# Samhan Public Desktop 전체 메뉴 재검증 TM 통합 리뷰

검증일: 2026-06-03
대상: Samhan Public Desktop, local Docker 실 서비스, API Gateway `http://localhost:8080`, desktop renderer `http://127.0.0.1:5179`
계정: `dev_master`
산출물: `docs/qa/full-menu-real-qa-2026-06-03`

## 최종 판정

출시 불가입니다.

매출/매입 운영 전표의 생성, 수정, 삭제 기본 플로우는 실 Docker에서 통과했습니다. 다만 전체 메뉴 실사용 기준으로는 회계, 배차, 아로로지스, 사진 감사, 전표 수정 요청 화면에 사용자 차단 결함이 남아 있습니다. 특히 일계표 기본 오류 화면 노출, 사진 감사 SQL 예외 노출, 거래처별 보고서의 UUID 노출은 사용자에게 그대로 보여서는 안 되는 항목입니다.

## UUID 미노출 규칙 재검산

개발책임자 확인 사항에 따라 UUID 판정 근거를 다시 분리했습니다. `qa-results.json`의 기존 자동 이벤트에 기록된 UUID는 전표 CRUD 흐름의 내부 URL/slipId 2건뿐이고, 거래처별 미수금/미지급금 화면의 UUID 노출은 스크린샷 육안/TM 검수에서 확인된 사용자-visible 결함입니다. 즉 결함 판정은 유지하되, 최초 자동 QA 계측은 UUID 미노출 규칙을 명시적으로 검사하지 못했습니다.

후속 재실행에서 같은 문제가 raw 탐지 누락으로 남지 않도록 `clients/desktop/scripts/capture-full-menu-real-qa.cjs`에 사용자 화면 본문 UUID detector를 추가했습니다. 이제 화면 본문에 UUID 형식 식별자가 있으면 `menu-user-visible-uuid` error 이슈로 기록됩니다.

## 검증 범위

- Docker 실 서비스 기반 전체 메뉴 85개 캡처
- 스크린샷 107장 생성
- 로그인 후 마스터 권한 메뉴 전체 순회
- 매출전표 생성, 상세 조회, 수정, 삭제
- 매입전표 생성, 상세 조회, 수정, 삭제
- 회계 매출/매입 전표 날짜 변경 후 배분 라인 로드 및 DRAFT 저장 가능 여부 확인
- 직접 API probe로 주요 404/500 재현
- DB probe로 QA 생성 전표와 라인 soft-delete 정합성 확인
- 5-agent 리뷰: Backend, Frontend, Designer, DevOps, QA
- TM 통합 판정

## 직접 검증 결과

| 항목 | 결과 | 메모 |
|---|---:|---|
| `clients/web/design-system npm run build` | PASS | desktop 의존 패키지 빌드 |
| `clients/desktop npm run typecheck` | PASS | TypeScript 정적 검증 |
| Docker 실 서비스 | 부분 PASS | gateway, slip, accounting, arologis 등 핵심 서비스 healthy. `samhan-nginx`는 unhealthy이나 이번 QA는 gateway 직접 경유 |
| 전체 메뉴 캡처 | PASS | 85개 메뉴, 107장 스크린샷 생성 |
| 매출전표 create/edit/delete | PASS | 201/200/200 |
| 매입전표 create/edit/delete | PASS | 201/200/200 |
| DB soft-delete | PASS | QA 생성 매출/매입 전표와 라인 모두 `is_deleted=true` |
| 거래처 코드 스냅샷 | FAIL 후보 | UI에서 거래처를 선택했지만 QA 생성 전표의 `partner_code`가 공백 |
| 회계 날짜 변경 플로우 | FAIL | `/internal/slips/by-period` 404, 배분 라인 0건, 저장 버튼 비활성 |

## P0 Release Blockers

| 영역 | 증거 | 사용자 영향 | 원인 판단 | 권장 조치 |
|---|---|---|---|---|
| 사진 감사 | `screenshots/menu-070-main-----admin-photo-audit.png`, `GET /api/v1/slips/admin/photo-audit?page=0&size=50` 500 | JDBC/SQL 원문과 PostgreSQL 오류가 화면에 노출됨 | `slipNo`가 비어 있을 때 JPQL `lower(concat(...))`가 PostgreSQL에서 `lower(bytea)`로 타입 추론. generic 500 응답이 `ex.getMessage()`를 그대로 반환 | query null 분기 또는 명시 cast 추가. generic 500 사용자 문구 마스킹. PostgreSQL 기반 IT 추가 |
| 일계표 | `screenshots/menu-037-main-----accounting-reports-daily-summary.png`, pageerror `items is not iterable` | React Router 기본 오류 화면, 로컬 경로, stack trace, 영문 개발자 안내가 그대로 노출됨 | API는 `data.date`, `data.accountSummary[]`를 반환하지만 FE는 `summaryDate`, `accountTotals[]`를 기대 | FE-BE 응답 계약 정렬. 배열 fallback. 사용자용 `errorElement` 추가 |
| 거래처별 미수금/미지급금 | `screenshots/menu-033-main-----accounting-reports-partner-aging-type-RECEIVABLE.png`, `screenshots/menu-034-main-----accounting-reports-partner-aging-type-PAYABLE.png` | 거래처코드 컬럼에 UUID가 대량 노출되고 거래처명은 `(미조회)`로 표시됨 | partner aging 응답 또는 FE fallback이 UUID를 사용자 식별자로 사용 | UUID fallback 금지. 거래처코드/거래처명/사업자번호 중심 표시. 미조회는 안전한 업무 문구로 표시 |

## P1 Functional Blockers

| 영역 | 증거 | 원인 판단 | 권장 조치 |
|---|---|---|---|
| 회계 매출/매입 전표 목록 | `GET /admin/sales-slips`, `GET /admin/purchase-slips` 404, `menu-020`, `menu-021` | accounting-service controller는 존재하나 gateway no-prefix route가 `/admin/accounting/**`만 처리 | gateway에 `/admin/sales-slips/**`, `/admin/purchase-slips/**`, `/admin/tax-invoices/**` route 추가 또는 FE를 `/api/v1/accounting/**`로 이전 |
| 세금계산서 발행 묶음/수신 세금계산서 | `/admin/tax-invoices/*` 404, `menu-025`, `menu-026` | 같은 accounting admin gateway route 누락 | 위 route 정리와 함께 contract test 추가 |
| 배차 메뉴 | `POST /admin/dispatch-tasks` 404, `GET /admin/dispatch-board/undispatched-slips` 404, `menu-009` | slip-service controller는 존재하나 gateway가 `/admin/dispatch-*`를 slip-service로 라우팅하지 않음 | gateway에 `/admin/dispatch-tasks/**`, `/admin/dispatch-board/**` no-strip route 추가. 응답 wrapper 계약 확인 |
| 회계 전표 날짜 변경 | `flow-sales-accounting-02-date-changed.png`, `flow-purchase-accounting-02-date-changed.png`, `/internal/slips/by-period` 404 | renderer가 서비스 간 internal endpoint를 직접 호출. gateway 미노출 및 internal token 계약과 불일치 | 공개 관리자용 배분 source API를 `/api/v1/slips/...`로 제공하거나 제한된 route를 JWT 권한으로 노출 |
| 아로로지스 주요 화면 | `menu-056`, `menu-057`, `menu-061`, `menu-062`, `menu-063`, `menu-064` | gateway와 arologis-service가 CORS header를 중복 설정하여 브라우저 차단 | gateway 경유 CORS 단일화. `Access-Control-Allow-Origin` 1개만 남기는 회귀 검증 추가 |
| 전표 수정 요청 | `GET /api/v1/slips/edit-requests?status=PENDING` 400, `menu-069` | BE는 `targetRole` 필수, FE는 `status`만 전송. 화면에 `SlipEditTargetRole` 내부 타입명 노출 | FE에서 role 기반 `targetRole` 전달 또는 BE가 인증 정보에서 추론. 내부 타입명 사용자 문구 제거 |
| 거래처 코드 정합성 | DB probe: QA 생성 매출/매입 전표의 `partner_code` 공백 | UI 거래처 선택 후 저장 payload 또는 backend snapshot 저장 경로 누락 가능성 | SlipForm 저장 payload와 slip-service 저장 로직 확인. partnerCode 저장 회귀 테스트 추가 |

## P2 Follow-Up Items

| 영역 | 증거 | 판단 | 권장 조치 |
|---|---|---|---|
| React key warning | `menu-040`, `menu-050`, `menu-080`, console duplicate key 다수 | 화면은 렌더링되지만 row 누락/중복 위험 | row key를 안정적인 business key로 변경 |
| Pretendard font warning | console warning 1243건 | 기능 차단은 아니나 디자인 시스템 전제 훼손 및 로그 오염 | desktop public font 배치와 MIME/복사 경로 확인 |
| 내부/개발자 문구 | `menu-055`, `menu-060`, `menu-062`, `menu-080` | 운영 화면에 PR, MOCK, enum, 내부 정책 문구가 보임 | 업무 용어 중심 문구로 정리 |
| latest history 404 | `/warehouse/audit/dps-history/latest`, `/admin/notifications/dispatch-sms/history/latest` | 저장 이력 없음 404일 수 있어 조건부 항목 | QA에서는 info로 분리하거나 backend가 200/null 또는 204 반환 |
| nginx unhealthy | `samhan-nginx` unhealthy | 이번 QA는 gateway 직접 호출이라 직접 실패 원인은 아님 | nginx 경유 QA를 별도 시나리오로 분리 |

## 오탐으로 분리한 항목

- `eventCount=0`인 warning 12건은 화면 본문 문자열에 `404`, `500`, `오류`가 포함되어 잡힌 raw 탐지 후보입니다. 실제 HTTP/console 이벤트가 없어 출시 차단 결함으로 보지 않았습니다.
- 삭제 후 `/slips/{id}` 404 2건은 soft-delete 이후 상세 재조회로 보이며, sales/purchases delete flow 자체는 PASS입니다.
- DPS/배차 SMS latest 404는 저장 이력 없음 계약일 수 있어 기능 영향 범위를 추가 재현해야 합니다.

## 5-Agent 통합 요약

| Team | 판정 | 핵심 내용 |
|---|---|---|
| Backend | 차단 결함 있음 | photo-audit 500/SQL 노출, internal endpoint 직접 호출, gateway route 누락, targetRole 계약 불일치 |
| Frontend | 차단 결함 있음 | DailySummary 응답 shape mismatch, API helper 경로 mismatch, 사용자용 ErrorBoundary 부재, key/font warning |
| Designer | 출시 불가 | 영문 개발자 오류 화면, SQL 원문, UUID 노출, 내부 개발 문구 노출 |
| DevOps | route/CORS 보완 필요 | gateway no-prefix route 공백, Arologis CORS 중복, nginx unhealthy는 이번 QA 실패 원인 아님 |
| QA | 출시 불가 | 핵심 CRUD 일부 PASS이나 전체 메뉴 실사용 기준 P0/P1 결함 존재. first-screen capture 외 세부 버튼 flow는 추가 검증 필요 |
| TM | 출시 불가 | P0 3건과 P1 다수 해소 전 실사용 승인 불가 |

## 스크린샷 산출물

전체 캡처본은 `docs/qa/full-menu-real-qa-2026-06-03/screenshots/`에 107장 저장했습니다. 대표 증거는 아래 파일입니다.

- `screenshots/01-dashboard-after-login.png`
- `screenshots/flow-sales-02-created-list.png`
- `screenshots/flow-sales-07-after-delete.png`
- `screenshots/flow-purchases-02-created-list.png`
- `screenshots/flow-purchases-07-after-delete.png`
- `screenshots/flow-sales-accounting-02-date-changed.png`
- `screenshots/flow-purchase-accounting-02-date-changed.png`
- `screenshots/menu-009-main-----dispatch-board.png`
- `screenshots/menu-020-main-----accounting-sales-slips.png`
- `screenshots/menu-021-main-----accounting-purchase-slips.png`
- `screenshots/menu-033-main-----accounting-reports-partner-aging-type-RECEIVABLE.png`
- `screenshots/menu-037-main-----accounting-reports-daily-summary.png`
- `screenshots/menu-056-main-----arologis-pre-classify.png`
- `screenshots/menu-063-main-----arologis-admin-manual-dispatch.png`
- `screenshots/menu-069-main-----admin-slip-edit-requests.png`
- `screenshots/menu-070-main-----admin-photo-audit.png`

## 권장 보완 순서

1. 사용자에게 내부 오류, SQL, stack trace, UUID가 보이는 P0 3건을 먼저 차단합니다.
2. gateway route 누락과 Arologis CORS 중복을 해결합니다.
3. 회계 전표 배분 source API를 internal 전용 계약에서 사용자 화면용 계약으로 분리합니다.
4. 전표 수정 요청 `targetRole` 계약을 정렬합니다.
5. 거래처 코드 스냅샷 공백을 저장 payload와 backend 저장 경로에서 추적합니다.
6. 전체 메뉴 재캡처를 다시 수행하고, P0/P1 0건일 때만 실사용 승인 후보로 봅니다.
