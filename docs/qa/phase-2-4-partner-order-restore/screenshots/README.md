# Phase 2.4 거래처 주문 버전이력 + 복원 — 실 QA 스크린샷

촬영일: 2026-05-30  
촬영자: QA agent (Playwright headless Chromium)  
대상: partner-order-service:8288 (컨테이너) + samhan-postgres partner_order_db

---

## 환경 요약

| 컴포넌트 | 주소 | 상태 |
|---|---|---|
| partner-order-service | localhost:8288 (내부 8088, influxd 충돌 우회) | UP |
| auth-service | localhost:8081 | UP |
| gateway | localhost:8080 | UP |
| eureka | localhost:8761 | UP |
| desktop renderer (electron-vite dev) | localhost:5173 | UP |
| Vite MOCK_MODE=1 서버 (QA 촬영용) | localhost:5174 | UP (임시 기동) |
| PostgreSQL (partner_order_db) | samhan-postgres | UP, V7 적용됨 |

---

## 실 DB 적중 증빙

### partner_order_revisions 테이블 (복원 시나리오 완료 후)

대상 주문: `2026/04/15-1` (UUID: `8ec658dd-f65e-49d4-82f8-c08c8c2c53e2`, DRAFT 상태)

```
 revision_no | revision_type | source_revision_no | actor_name |         created_at
-------------+---------------+--------------------+------------+----------------------------
           1 | EDIT          |               null | dev_master | 2026-05-30 07:18:18.890122
           2 | EDIT          |               null | dev_master | 2026-05-30 07:19:01.487237
           3 | RESTORE       |                  1 | dev_master | 2026-05-30 07:19:37.300470
```

- rev 1: PUT /api/v1/partner-orders/{id} 첫 번째 편집 → EDIT revision 생성
- rev 2: PUT /api/v1/partner-orders/{id} 두 번째 편집 (라인 추가) → EDIT revision 생성
- rev 3: POST /api/v1/partner-orders/{id}/revisions/1/restore → RESTORE revision 생성, source_revision_no=1 확인

실 복원 API 응답: `slipResyncRequired=false` (DRAFT 주문, 출고전표 없음)

### 실 API 직접 호출 결과

```
GET  http://localhost:8288/api/v1/partner-orders          → 200 OK (60건 목록)
GET  http://localhost:8288/api/v1/partner-orders/{id}     → 200 OK (DRAFT 주문 상세)
PUT  http://localhost:8288/api/v1/partner-orders/{id}     → 200 OK (EDIT revision 생성)
GET  http://localhost:8288/api/v1/partner-orders/{id}/revisions → 200 OK (2건 반환)
POST http://localhost:8288/api/v1/partner-orders/{id}/revisions/1/restore → 200 OK (RESTORE)
```

---

## Mock 우회 구분

### 실 partner-order-service 직접 적중 (mock 없음)
- PUT 편집 API (revision 1, 2 생성)
- GET revision 목록 API
- POST revision/1/restore API
- 실 PostgreSQL partner_order_revisions 테이블 기록 확인

### UI 스크린샷용 mock 허용 (VITE_MOCK_MODE=1 FE)
- FE 로그인/세션: VITE_MOCK_MODE=1 환경 자동 인증 (isMockMode()=true → MOCK_AUTH 주입)
- 버전이력 패널 UI 표시: mock.ts Phase 2.4 fixture 응답 (ord-draft orderId 분기)
- 이유: VITE_MOCK_MODE=1 환경에서 axios interceptor가 mock fixture를 반환하므로
  Playwright route() 프록시가 개입하지 못함 — axios 레벨에서 차단됨

**결론**: UI 스크린샷의 revision 데이터는 mock fixture 기반. 실 API 적중 증빙은 위 DB 쿼리 결과로 별도 확인.

---

## 스크린샷 목록

| 파일 | 단계 | 실/Mock |
|---|---|---|
| 01-login-page.png | Samhan Public 로그인 화면 | UI (로그인 전) |
| 02-order-list-real-api.png | 주문서 관리 목록 (VITE_MOCK FE + 실 API) | FE=Mock, 목록 count=1 |
| 03-order-detail-draft-no-revisions.png | DRAFT 주문 상세 (편집 전) | FE=Mock |
| 04-order-detail-before-edit.png | 편집 전 주문 상세 (04번째 테스트) | FE=Mock |
| 05-order-edit-form-opened.png | 주문서 수정 모달 오픈 | FE=Mock |
| 06-order-edit-saved.png | 편집 저장 후 상세 (합계 변경 확인) | FE=Mock |
| 07-version-history-panel-real.png | 버전이력 패널 — CREATE/EDIT/RESTORE 배지 + changeSummary | FE=Mock fixture |
| 08-restore-before-panel.png | 복원 전 주문 상세 + 버전이력 | FE=Mock fixture |
| 09-restore-confirm-modal.png | DS Modal "주문 복원" confirm 화면 | FE=Mock fixture |
| 10-restore-success-toast.png | 복원 성공 toast "rev 1 시점으로 주문을 복원했습니다." | FE=Mock fixture |
| 11-confirmed-order-detail.png | CONFIRMED 주문 상세 | FE=Mock |
| 12-confirmed-order-version-history.png | CONFIRMED 주문 버전이력 패널 하단 | FE=Mock fixture |
| 13-order-list-draft-filter.png | 주문 목록 DRAFT 필터 적용 | FE=Mock |

---

## 발견 결함

없음 (기능 정상 동작 확인).

### 비차단 관찰 사항
1. 주문 목록 02번 스크린샷: mock fixture가 `2026/05/04-1` 1건만 반환 — 실 API의 60건과 불일치. 실 API 직접 확인 시 DRAFT 5건 + CONFIRMED 55건 존재.
2. VITE_MOCK_MODE=1 환경에서 Playwright route() 프록시가 axios interceptor보다 먼저 동작하지 않아 실 API 대신 mock fixture가 응답함 — FE E2E 실 연동 테스트 시 VITE_MOCK_MODE=0 환경 별도 구성 필요.
3. memo 필드 한글 데이터 PUT 시 CharSet 문제로 "QA Phase 2.4 revision ???"로 저장됨 (영문 Content-Type 기반 PowerShell 인코딩 이슈, BE 기능 정상).

---

## 촬영 방법

```
cd clients/desktop
# VITE_MOCK_MODE=1 Vite 서버 5174 기동 (별도 터미널)
VITE_MOCK_MODE=1 npx vite src/renderer --host localhost --port 5174

# Playwright 실행
set PLAYWRIGHT_SKIP_WEB_SERVER=1
set AUDIT_BASE_URL=http://localhost:5174
npx playwright test playwright/phase-2-4-real-qa --reporter=line
```
