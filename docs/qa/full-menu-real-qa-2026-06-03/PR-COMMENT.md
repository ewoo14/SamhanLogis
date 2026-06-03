## Samhan Public Desktop 전체 메뉴 실 Docker 재검증 결과

2026-06-03 기준으로 Samhan Public Desktop 전체 메뉴 QA를 실 Docker 환경에서 다시 수행했습니다.

- 환경: local Docker 실 서비스 + API Gateway `http://localhost:8080` + Desktop renderer `http://127.0.0.1:5179`
- 계정: `dev_master`
- 메뉴 캡처: 85개
- 스크린샷: 107장
- 기본 검증: design-system build PASS, desktop typecheck PASS
- 핵심 플로우: 매출/매입 전표 create/edit/delete PASS, 회계 전표 날짜 변경 플로우 FAIL
- 상세 산출물: [TM 통합 리뷰](https://github.com/ewoo14/SamhanLogis/blob/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/TM-INTEGRATED-REVIEW.md), [전체 캡처 폴더](https://github.com/ewoo14/SamhanLogis/tree/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/screenshots)

### TM 최종 판정

출시 불가입니다.

매출/매입 운영 전표의 생성, 수정, 삭제는 실 Docker에서 통과했지만, 전체 메뉴 실사용 기준으로는 P0 3건과 P1 다수가 남아 있습니다. 특히 사용자 화면에 SQL 예외, React stack trace, UUID가 그대로 노출되는 항목은 운영 배포 전 반드시 차단해야 합니다.

### P0

| 영역 | 증거 | 요약 |
|---|---|---|
| 사진 감사 | `menu-070-main-----admin-photo-audit.png` | 빈 검색어 기본 진입에서 500 발생. JDBC/SQL 원문과 PostgreSQL 오류가 화면에 노출됨 |
| 일계표 | `menu-037-main-----accounting-reports-daily-summary.png` | React Router 기본 오류 화면, 로컬 경로, stack trace 노출. API 응답 shape와 FE 기대값 불일치 |
| 거래처별 미수금/미지급금 | `menu-033...RECEIVABLE.png`, `menu-034...PAYABLE.png` | 거래처코드 컬럼에 UUID 대량 노출, 거래처명 `(미조회)` 표시 |

### P1

| 영역 | 증거 | 요약 |
|---|---|---|
| 회계 매출/매입 전표 목록 | `/admin/sales-slips`, `/admin/purchase-slips` 404 | accounting-service controller는 있으나 gateway route 누락 |
| 세금계산서 발행/수신 | `/admin/tax-invoices/*` 404 | accounting admin no-prefix route 누락 |
| 배차 메뉴 | `/admin/dispatch-tasks`, `/admin/dispatch-board/*` 404 | slip-service dispatch admin route가 gateway에 연결되지 않음 |
| 회계 날짜 변경 | `/internal/slips/by-period` 404 | renderer가 internal endpoint를 직접 호출해 배분 라인을 불러오지 못함 |
| 아로로지스 주요 화면 | CORS 중복 ACAO | gateway와 arologis-service CORS header 중복으로 브라우저 차단 |
| 전표 수정 요청 | `/api/v1/slips/edit-requests?status=PENDING` 400 | BE는 `targetRole` 필수, FE는 전달하지 않음. 내부 타입명도 화면 노출 |
| 거래처 코드 정합성 | DB probe | QA 생성 전표는 soft-delete 정합성은 맞지만 `partner_code`가 공백 |

### 5-Agent 리뷰 요약

| Team | 판정 |
|---|---|
| Backend | photo-audit 500/SQL 노출, internal endpoint 직접 호출, gateway route 누락을 차단 결함으로 판단 |
| Frontend | DailySummary 응답 shape mismatch, API helper 경로 mismatch, 사용자용 ErrorBoundary 부재를 차단 결함으로 판단 |
| Designer | SQL, stack trace, UUID, 내부 개발 문구 노출 때문에 실사용 승인 불가로 판단 |
| DevOps | gateway route 공백과 Arologis CORS 중복을 우선 인프라 보완 대상으로 판단 |
| QA | 전체 메뉴 실사용 기준 출시 불가. `eventCount=0` raw warning은 오탐 후보로 분리 |
| TM | P0/P1 해소 전 실사용 승인 불가 |

### 대표 스크린샷

![일계표 오류](https://github.com/ewoo14/SamhanLogis/blob/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-037-main-----accounting-reports-daily-summary.png?raw=1)

![사진 감사 SQL 오류](https://github.com/ewoo14/SamhanLogis/blob/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-070-main-----admin-photo-audit.png?raw=1)

![거래처 UUID 노출](https://github.com/ewoo14/SamhanLogis/blob/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-033-main-----accounting-reports-partner-aging-type-RECEIVABLE.png?raw=1)

![회계 전표 날짜 변경 실패](https://github.com/ewoo14/SamhanLogis/blob/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-accounting-02-date-changed.png?raw=1)

![매출전표 CRUD 통과 증거](https://github.com/ewoo14/SamhanLogis/blob/codex/full-menu-real-qa-2026-06-03/docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-07-after-delete.png?raw=1)

### 보완 권장 순서

1. SQL, stack trace, UUID 등 사용자 노출 차단
2. accounting/slip admin gateway route 누락 보완
3. Arologis CORS header 단일화
4. 회계 전표 배분 source API 계약 재정렬
5. 전표 수정 요청 `targetRole` 계약 정렬
6. 거래처 코드 스냅샷 저장 정합성 보완
7. 전체 메뉴 실 Docker QA 재실행
