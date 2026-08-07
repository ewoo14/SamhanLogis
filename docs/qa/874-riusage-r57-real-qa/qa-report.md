# R57 라이브QA 보고서 — PR #1057 · 이슈 #874

실행일: 2026-08-05 (KST)  
대상 HEAD: `d61093969` (main 병합 완료본)  
렌더러: `http://localhost:5205`  
API: `VITE_API_BASE_URL=http://localhost:8080`, mock OFF  
계정: `dev_manager / ${QA_DEV_DEFAULT_PASSWORD}`, `dev_master / ${QA_DEV_DEFAULT_PASSWORD}`, 권한 검증 `dev_accountant`

## 배포 증적

재배포 시작: `2026-08-05T22:54:44+09:00`  
재배포 완료: `2026-08-05T22:55:36+09:00`  
api-gateway 공유 트랙 재배포 시각: `2026-08-05T22:55:30.333688993Z` 시작

| 컨테이너 | Created | StartedAt | 최종 상태 |
|---|---|---|---|
| slip-service | `2026-08-05T13:55:26.325243467Z` | `2026-08-05T13:55:36.128006865Z` | running / healthy |
| notification-service | `2026-08-05T13:55:26.329663634Z` | `2026-08-05T13:55:36.129200169Z` | running / healthy |
| api-gateway | `2026-08-05T13:55:20.45079612Z` | `2026-08-05T13:55:30.333688993Z` | running / healthy |

Flyway 최고 버전: `slip_db=112`, `notification_db=10`.

## 판정

| 항목 | 판정 | 캡처 | 근거 |
|---|---|---|---|
| ① 세트 `riUsage` 및 거래처 전역DC 실 화면 | **미실시** | [01-daily-closing-riusage-global-dc.png](screenshots/01-daily-closing-riusage-global-dc.png) | `2020-01-02`로 일마감 조회 후 매출전표를 선택했으나 상세 전표·모델별 재검증 행이 0건. 화면에는 `할인율` 열 머리글만 있고 실제 세트/전역DC 행 값은 없어 확인 불가. |
| ② 협업 수정 저장 및 알림 도달 | **FAIL** | [04-collab-edit-saved.png](screenshots/04-collab-edit-saved.png), [06-notification-history-after-collab-edit.png](screenshots/06-notification-history-after-collab-edit.png) | `2026/08/01-7` 전표를 다른 작성자 계정으로 협업 수정. 저장 POST는 HTTP 201, 105ms로 성공했고 outbox는 `SENT`였으나 알림센터 새 항목이 남지 않음. |
| ③-a TERMINAL 게이트웨이 경유·권한 | **PASS** | [05-terminal-gateway-response.png](screenshots/05-terminal-gateway-response.png) | `GET http://localhost:8080/admin/slip-collab-notifications/terminal`: `dev_master=200`, `dev_accountant=403`. 게이트웨이 404 전례는 재현되지 않음. |
| ③-b TERMINAL 응답 필드(UUID 비공개·전표번호/사유/시도횟수) | **미실시** | [05-terminal-gateway-response.png](screenshots/05-terminal-gateway-response.png) | 관리자 응답은 `200`, `data=[]`로 TERMINAL 표본이 0건이라 필드 계약을 실 데이터로 검증할 수 없음. 빈 배열을 PASS로 세지 않음. |
| ④ 저장·수정 차단 또는 눈에 띄는 지연 | **PASS** | [04-collab-edit-saved.png](screenshots/04-collab-edit-saved.png) | 실제 협업 수정 저장이 HTTP 201로 완료됐고 측정된 UI 대기시간은 105ms. 외부 notification 호출 완료를 기다린 뒤 응답한 정황은 없음(outbox 비동기 처리). |

## FAIL 재현 절차 — ②

1. `dev_manager`로 조회된 다른 작성자 전표 `2026/08/01-7`을 열었다.
2. 화면에서 `협업 수정`을 누르고 `메모 수정값`에 `R57 live QA ...`, 수정 사유에 `R57 라이브QA 협업 수정 알림 도달 검증`을 입력했다.
3. `수정완료`를 눌렀다. `POST /api/v1/slips/{slipId}/collab/edits`는 HTTP 201, 105ms였다.
4. outbox read-only 확인 결과 해당 행은 `SENT`였으나, `dev_master` 알림 내역 화면 및 `GET /api/notifications/history`에 해당 전표 수정 알림이 없었다.

따라서 저장 경로는 통과했지만 “협업 수정 알림이 실제로 도달하고 남는가” 게이트는 FAIL이다. 실제 vendor 발송은 수행하지 않았다.

## 생성 파일 목록

- `qa-report.md`
- `r57-live-qa.mjs` — Playwright 실 QA 드라이버
- `observations.json`
- `01-daily-closing-visible.txt`
- `02-slip-query-response.json`
- `03-terminal-gateway-response.json`
- `04-notification-history-response.json`
- `screenshots/01-daily-closing-riusage-global-dc.png`
- `screenshots/02-slip-detail-before-collab-edit.png`
- `screenshots/03-collab-edit-filled.png`
- `screenshots/04-collab-edit-saved.png`
- `screenshots/05-terminal-gateway-response.png`
- `screenshots/06-notification-history-after-collab-edit.png`

기존 `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 변경하지 않았다. git 명령은 실행하지 않았다.
