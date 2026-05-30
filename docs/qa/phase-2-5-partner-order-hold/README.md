# Phase 2.5 — 거래처 주문 보류(ON_HOLD) + 리스트 필터 QA 결과

**브랜치**: `feat/phase-2-5-partner-order-hold-status-filter`  
**HEAD**: f9674163  
**QA 일시**: 2026-05-30  
**대상 서비스**: `samhan-partner-order-service` (:8288 host, :8088 container)  
**DB**: `samhan-postgres` / `partner_order_db`

---

## 1. 재빌드 이력

| 단계 | 결과 |
|---|---|
| `./gradlew :services:partner-order-service:bootJar` | BUILD SUCCESSFUL in 15s |
| docker compose 재빌드 | influxd(PID 1956) 가 호스트 8088 점유 → 8288 포트 우회 docker run |
| health check `GET /actuator/health` | `{"status":"UP"}` |

**influxd 포트 우회**: influxd 프로세스가 host port 8088 점유. compose override 대신 `docker run -p 127.0.0.1:8288:8088` 직접 기동.

---

## 2. 컨테이너 health

```
samhan-partner-order-service  Up  127.0.0.1:8288->8088/tcp
GET http://localhost:8288/actuator/health  ->  {"status":"UP"}
```

---

## 3. 촬영 PNG 목록

### 3-A. 실 desktop renderer 연동 캡처 (2026-05-30 추가, 실 연동 확인됨)

캡처 환경:
- **Vite dev server**: `http://localhost:5175` (VITE_MOCK_MODE 미설정 — 실 모드)
- **Gateway API base**: `http://localhost:8080` (실 JWT, 실 DB)
- **인증**: `window.samhanAuth` IPC stub — 실 JWT (`dev_master / dev_p05_pass!`) 주입
- **캡처 도구**: Playwright headless Chromium, viewport 1440x900
- **실 API 적중 확인**: network interceptor 로 `GET http://localhost:8080/api/v1/partner-orders?page=0&size=50&status=DRAFT` 요청 확인

| 파일 | 크기 | 시나리오 | 실 DB 수치 |
|---|---|---|---|
| `screenshots/01-list-draft.png` | 110 KB | 주문 리스트 필터 DRAFT(진행중) | 전체 9건 |
| `screenshots/02-list-confirmed.png` | 116 KB | 주문 리스트 필터 CONFIRMED(완료) | 전체 50건 |
| `screenshots/03-list-onhold.png` | 81 KB | 주문 리스트 필터 ON_HOLD(보류) | PO-2026-0002 1건 |
| `screenshots/04-detail-draft.png` | 91 KB | 주문 상세 DRAFT — "보류" 버튼 노출 | 주문 2026/04/15-5 |
| `screenshots/05-hold-executed.png` | 92 KB | 보류 클릭 후 ON_HOLD — "보류 해제" 버튼 전환 | 실 POST /hold 응답 |
| `screenshots/06-release-executed.png` | 91 KB | 보류 해제 후 DRAFT 복귀 — "보류" 버튼 재노출 | 실 POST /release 응답 |
| `screenshots/07-label-badges.png` | 45 KB | ON_HOLD 필터 — "보류" 배지 한글 라벨 확인 | PO-2026-0002 보류 배지 |

### 3-B. 이전 단계 raw JSON + curl 증빙

| 파일 | 시나리오 |
|---|---|
| `sc01-list-draft-raw.json` | DRAFT 필터 API 응답 raw |
| `sc02-list-confirmed-raw.json` | CONFIRMED 필터 API 응답 raw |
| `sc03-list-onhold-raw.json` | ON_HOLD 필터 API 응답 raw |
| `sc04-draft-detail-raw.json` | DRAFT 주문 상세 API 응답 raw |
| `sc05-hold-response-raw.json` | POST /hold 응답 raw |
| `sc06-release-response-raw.json` | POST /release 응답 raw |

---

## 4. 실 적중 증빙

### 4-1. DRAFT → ON_HOLD (hold)

```
POST http://localhost:8288/api/v1/partner-orders/0baf0222-aa49-40a7-a1cc-884475686632/hold
X-User-Id: test-master-001
X-User-Role: MASTER
X-Internal-Token: dev-internal-token-change-me

Response 200:
{
  "status": "ON_HOLD",
  "orderNumber": "PO-2026-0001",
  ...
}
```

psql 확인:
```sql
SELECT order_no, status, modified_at FROM partner_orders
WHERE id='0baf0222-aa49-40a7-a1cc-884475686632';
-- PO-2026-0001 | ON_HOLD | 2026-05-30 09:22:33.931319
```

### 4-2. ON_HOLD → DRAFT (release)

```
POST http://localhost:8288/api/v1/partner-orders/0baf0222-aa49-40a7-a1cc-884475686632/release

Response 200:
{
  "status": "DRAFT",
  "orderNumber": "PO-2026-0001",
  ...
}
```

psql 확인:
```sql
-- PO-2026-0001 | DRAFT | 2026-05-30 09:23:04.653613
```

### 4-3. status=ON_HOLD 필터

```
GET /api/v1/partner-orders?status=ON_HOLD&page=0&size=5
Response 200: totalElements=1, content[0].status="ON_HOLD"  (PO-2026-0002)
```

이전 빌드(2시간 전): `INTERNAL_ERROR — Failed to convert value 'ON_HOLD'` (500)  
재빌드 후: 200 OK — ON_HOLD enum 전환 정상

### 4-4. CONFIRMED 주문 hold 시도 — 409

```
POST /api/v1/partner-orders/339c0fb4.../hold  (PO-2026-0006, status=CONFIRMED)

Response:
{
  "code": "CONFLICT",
  "message": "진행중(DRAFT) 주문만 보류할 수 있습니다. 현재 상태: CONFIRMED"
}
```

---

## 5. mock 우회 부분 vs 실 적중 부분

| 항목 | 방식 |
|---|---|
| hold/release API | **실 적중** — 직접 curl + psql DB 확인 |
| status 필터 API | **실 적중** — 직접 curl |
| 409 (CONFIRMED hold 거부) | **실 적중** — 직접 curl |
| 인증 (X-User-Role/X-Internal-Token) | **헤더 직접 주입** — 게이트웨이 우회 (설계 허용) |
| partnerName 필드 | **null** — partner-service 조회 없음 (리스트 응답에서 null) |
| FE 화면 스크린샷 | **실 desktop renderer 캡처** — Vite 5175 (실 모드) + 실 JWT stub + Playwright headless Chromium |

---

## 6. 발견 결함

### [DEFECT-1] 이전 빌드 ON_HOLD 필터 500

- **심각도**: P1 (기능 미동작)
- **현상**: 재빌드 전 컨테이너에서 `GET /api/v1/partner-orders?status=ON_HOLD` → 500 INTERNAL_ERROR
- **원인**: 2시간 전 빌드 이미지에 `ON_HOLD` enum 값이 없음 (구 빌드)
- **해결**: `bootJar` 재빌드 + docker run 재기동으로 해소. 현재 200 OK 확인.
- **방지책**: CI 빌드 후 컨테이너 이미지 태그를 git commit hash 로 관리 필요

### [DEFECT-2] influxd 포트 8088 상시 충돌

- **심각도**: P2 (로컬 기동 장애)
- **현상**: influxd(PID 1956)가 host 8088 상시 점유 → compose up 실패
- **해결**: `docker run -p 8288:8088` 우회
- **방지책**: compose override 파일에 `partner-order-service.ports: ["127.0.0.1:8288:8088"]` 영구 적용 또는 influxd 서비스 포트 변경

---

## 7. 도메인 정합성 SQL 결과

```sql
-- ON_HOLD 주문이 DB에 실제 존재하는지 확인
SELECT order_no, status FROM partner_orders
WHERE status = 'ON_HOLD';
-- PO-2026-0002 | ON_HOLD  (1 row)

-- status 분포
SELECT status, count(*) FROM partner_orders
WHERE is_deleted = false
GROUP BY status;
-- DRAFT     | 8
-- ON_HOLD   | 1
-- CONFIRMED | 51
```

---

## 8. 컨테이너 최종 상태

```
GET http://localhost:8288/actuator/health  ->  {"status":"UP"}
이미지: infrastructure-partner-order-service:latest (재빌드 2026-05-30T09:xx)
네트워크: samhan-net (내부 서비스 간 통신 정상)
```
