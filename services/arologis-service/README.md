# arologis-service — 독립 운영 단위 (Phase 10.5, 2026-05-14 분리)

> **Phase 10.5 — 아로로지스 독립 분리 (D-AX-01~10, 2026-05-14)** — Samhan Public 14 마이크로서비스 묶음에서 별도 운영 단위로 분리. monorepo 유지 + build/배포만 분리 + 자체 auth + 휴대번호 passwordless 기사 인증 + `arologis.samhan-air.com` 도메인. 같은 AWS 환경 (EC2 m5.xlarge + RDS db.t3.medium) 공유.
>
> 기존 Phase: W10-1 skeleton (PR #97) + W10-3 모바일 driver tab (PR #98) + W10-4 slip-service 전자서명 통합 (PR #99) 완료. 본 분리 작업 = Phase 10.5 통합 PR.

배차 마이크로서비스 — 카톡 메시지 파싱 → 차량/정차/기사 매칭 → 전자서명 (slip-service 연동) → GPS 추적 (30일 자동 cleanup) — **+ 자체 auth/user 도메인 (admin loginId+password / driver phoneNumber passwordless)**.

| 항목 | 값 |
|---|---|
| 포트 | **8097** (기존 14 service 8081~8095 + 8096 migration 예약 다음) |
| DB | **arologis_db** (service-per-DB, 공유 RDS 인스턴스) |
| 운영 단위 | **독립** (Samhan Public 14 service 와 별도 build/배포 cadence, 같은 docker network `samhan-net` + 같은 Eureka 공유) |
| Docker image | `samhanpublic/arologis-service:VERSION` (별도 ghcr.io tag `arologis-v*`) |
| 진입 도메인 | `api.arologis.samhan-air.com` (Nginx host-header → 8097, api-gateway 우회) |
| 외부 의존성 | **3 client** — partner-service (8095) / slip-service (8084) / notification-service (8093). **UserClient 제거 (D-AX-07, 자체 user 도메인)** |
| 인증 | **자체 JWT HS256** (`/auth/admin/login` loginId+password BCrypt / `/auth/driver/login` phoneNumber passwordless / `/auth/refresh` rotation / `/auth/logout` / `/auth/me`) — Samhan Public auth-service 와 무관 |
| 외부 vendor | 인성데이타 퀵프로그램 (5만 프리랜서 풀, W10-2 통합 시점) |

## 1. 도입 배경

기존 14 service 와 별도 도메인 (배차 = 외부 vendor 매칭 + 모바일 어플 + GPS 추적) — 단일 service-per-DB 격리 + 향후 외부 vendor 교체 가능 (DriverMatcher 추상화) 의도.

사용자 핵심 요구:
- 카톡 메시지 (5만 프리랜서 그룹 채팅 표준 양식) 자동 파싱 → 배차 1건 = 메시지 1건
- 외부 vendor (인성데이타) 5만 프리랜서 매칭 자동화 — vendor 교체 가능 design
- 본 어플 (RN Expo, W10-3) 사용 driver 의 GPS 추적 + 전자서명
- 30일 GPS 데이터 자동 cleanup (대용량 위치 데이터 운영 부담 회피)

## 2. Domain (5 entity + DriverLocation)

| Entity | 설명 |
|---|---|
| **Dispatch** | 배차 1건 = 카톡 1 메시지. `dispatchDate` (8일착) + `dispatchType` (DAY/NIGHT/EXPRESS) + `rawKakaoText` (audit) |
| **Vehicle** | 차량 1대 = 카톡 "1." 그룹. `(dispatchId, sequence)` unique. `tonnage` / `assignedDriverId` / `matchSource` / `status` |
| **VehicleStop** | 정차 1건 = 카톡 라인. `(vehicleId, sequence)` unique. `rawText` / `parsedAddress` / `parsedPartnerName` / `parsedPartnerCode` (전표번호) / `notes` / `status` |
| **Driver** | 배송기사. `driverCode` / `phoneNumber` 활성 unique. `source` (INTERNAL / EXTERNAL_INSUNG_QUICK / ...) / `appInstalled` / `appUserId` |
| **Signature** | 전자서명 (slip-service 통합 W10-4). `stopId` / `source` (LINK/APP) / `imageRef` / GPS NUMERIC(10,7) |
| **DriverLocation** | GPS 추적 — BaseEntity 미상속 (30일 hard DELETE). NUMERIC(10,7) ~1.1cm 정확도 |

7 enum — DispatchType / VehicleTonnage / VehicleStatus / StopStatus / DriverSource / MatchSource / SignatureSource.

각 entity = `BaseEntity` 7 audit + Soft Delete (`@SQLRestriction("is_deleted = false")`) + partial unique index (`WHERE is_deleted = FALSE`).

## 3. REST API

### Internal API (X-Internal-Token + ROLE_MASTER, `/internal/**` prefix 한정)

- `POST /internal/arologis/dispatches/sync` — 외부 vendor (W10-2 인성데이타) callback (배차 상태 동기화). W10-1 = ack only, W10-2 = 실 처리 활성

### Admin API (JWT + ROLE_MANAGER)

- `POST /admin/arologis/dispatches/parse-kakao` — 카톡 텍스트 파싱 미리보기 (저장 X)
- `POST /admin/arologis/dispatches` — Dispatch 저장 (수동 보정 후)
- `GET /admin/arologis/dispatches?date=&type=` — 목록 조회
- `GET /admin/arologis/dispatches/{id}` — 단건 조회 (vehicles + stops 포함)
- `POST /admin/arologis/dispatches/{id}/auto-match` — 모든 vehicle 에 대해 자동 매칭 (DriverMatcher)
- `POST /admin/arologis/dispatches/{id}/vehicles/{seq}/match-external` — 특정 차량 외부 매칭 trigger
- `POST /admin/arologis/dispatches/{id}/vehicles/{seq}/assign-driver` — 수동 기사 배정
- `PUT /admin/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/status` — 정차 상태 갱신
- `GET /admin/arologis/drivers?source=&phoneNumber=&appInstalled=` — 기사 목록
- `PUT /admin/arologis/dispatches/{id}/delete` — Soft Delete

### Driver-app API (W10-3 활성, JWT + ROLE_DRIVER)

- `GET /driver-app/arologis/dispatches/today` — 본인에게 배정된 dispatch 목록
- `POST /driver-app/arologis/locations` — GPS 위치 보고 (DriverLocation 적재)
- `POST /driver-app/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign` — 전자서명 + slip-service bridge (W10-4)

**Driver client ownership — W10-3 historical / D-AX-19 이후 현재 상태**:
- W10-3 당시 client 는 `clients/mobile-staff/src/api/arologis.ts` 였으나, D-AX-19 이후 배송기사 런타임은 `clients/arologis-mobile` 이 전담하고 해당 mobile-staff client 는 삭제됨.
- `clients/mobile-staff` 는 `/driver-app/arologis/**` 를 더 이상 호출하지 않으며 estimate WebView 단일 진입만 제공한다.
- Driver-app API 계약(`today` / `locations` / `sign`) 과 GPS source(`APP_GPS_ACTIVE` / `APP_GPS_BACKGROUND` / `EXTERNAL_INSUNG_LBS`) 는 유지한다.
- D-AX-19 는 backend endpoint / DB / Flyway 변경이 없으므로 backend Docker/Testcontainers 필수 검증 대상이 아니다. backend controller/client 변경이 동반될 때만 `arologis-service` IT 로 격상한다.

**W10-4 (PR #99) — slip-service 통합 활성**:
- `SlipClient.registerSignature` 시그니처 변경 (UUID + SignaturePayload) + skeleton-mode 실 호출 분기
- `SlipResolver` 신규 service — partnerCode → slipId 매핑 (UUID 비공개 가드 fallback) + partnerId 직접 lookup
- `ArologisDriverAppController.sign` 통합 호출 — 양쪽 저장 + slipBridged 응답 schema
- 응답 schema 확장: `signatureId` / `slipBridged` / `capturedAt` 3 필드
- graceful fallback: skeleton-mode true / PartnerClient empty / slip-service 5xx 모두 자체 INSERT 유지 (운영 영향 0)
- `SignatureIntegrationIT` 신규 — 양쪽 저장 시나리오 IT (SlipClient @MockBean 격리, PR #17 회고)
- 환경변수 `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false` (W10-4 시점 활성)

## 4. 환경변수 (chained-default 표준)

```bash
SAMHAN_AROLOGIS_PORT=8097
SAMHAN_AROLOGIS_DB_HOST=...
SAMHAN_AROLOGIS_DB_PORT=5432
SAMHAN_AROLOGIS_DB_NAME=arologis_db
SAMHAN_AROLOGIS_DB_USER=...
SAMHAN_AROLOGIS_DB_PASSWORD=...
SAMHAN_INTERNAL_TOKEN=...
SAMHAN_DISCOVERY_PROVIDER=eureka
SAMHAN_PARTNER_SERVICE_URL=http://localhost:8095
SAMHAN_USER_SERVICE_URL=http://localhost:8083
SAMHAN_SLIP_SERVICE_URL=http://localhost:8084
SAMHAN_NOTIFICATION_SERVICE_URL=http://localhost:8093
SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false       # W10-4 (PR #99) 시점 활성 — slip-service 양쪽 저장 활성
SAMHAN_AROLOGIS_MATCHER_PROVIDER=mock            # mock (W10-1) | insung-quick (W10-2)
SAMHAN_INSUNG_QUICK_API_URL=...                  # W10-2 활성
SAMHAN_INSUNG_QUICK_API_KEY=...                  # W10-2 활성
SAMHAN_INSUNG_QUICK_PARTNER_ID=...               # W10-2 활성
SAMHAN_AROLOGIS_LOCATION_RETENTION_DAYS=30
```

## 5. 테스트

- 단위 18 case — KakaoDispatchParserTest (8) / MockDriverMatcherTest (3) / InsungQuickDriverMatcherTest (2) / DispatchServiceTest (5) / DriverLocationCleanupSchedulerTest (2). 합 20 case (8+3+2+5+2).
- IT 13 case — ArologisInternalControllerIT (4) + ArologisAdminControllerIT (9). Docker 가용 환경 PASS.
- KakaoDispatchParserTest 는 사용자 제공 카톡 예시 (13 차량 / ~50 정차 / 1톤 12 + 1.4톤 1) 80% 정확도 회귀 검증.

## 6. GPS 하이브리드 정책 (사용자 결정 4, 2026-05-07)

W10-1 BE-1 / QA-3 / Designer-2 통합 채택 fix — `DriverLocationSource` enum 4값 + `samhan.arologis.gps.priority` env (default `insung-lbs,app-gps,manual`).

| Source | 의미 | 활성 시점 |
|---|---|---|
| `EXTERNAL_INSUNG_LBS` | 인성 LBS (W10-2 통합 시점 활성) | 우선순위 1 (default) |
| `APP_GPS_ACTIVE` | 본 어플, 활성 사용 중 (foreground 권한 O) | 우선순위 2 |
| `APP_GPS_BACKGROUND` | 본 어플, 백그라운드 (foreground 권한 X 시점) | 우선순위 2 (보강) |
| `MANUAL` | 수동 입력 fallback (admin 보정) | 우선순위 3 |

W10-3 모바일 어플 권한 정책:

- **foreground 권한 = 의무** (배송 도중 위치 추적)
- **background 권한 = 선택** (운영 시점 결정)
- 거부 fallback = 어플 사용 불가 (사용자 명시 2026-05-07)
- 인성 LBS 우선 + 본 어플 GPS 보강 (`samhan.arologis.gps.priority=insung-lbs,app-gps,manual`)

W10-1 시점 = 본 어플 endpoint (`POST /driver-app/arologis/locations`) 만 활성 — `APP_GPS_ACTIVE` 으로 적재. W10-2 진입 시점에 Insung LBS callback endpoint 활성 + `EXTERNAL_INSUNG_LBS` 적재.

## 7. 알림 분담 정책 (사용자 결정 3, 2026-05-07)

W10-1 BE-2 / QA-3 통합 채택 fix — 배차 단계 알림과 본 시스템 알림 분리.

| 알림 종류 | 채널 | 활성 시점 |
|---|---|---|
| **배차 단계 알림** (vendor 매칭 / 배송 진행) | **인성 알림톡** (W10-2 시점 인성 vendor 직접 호출, notification-service 우회) | W10-2 진입 시점 |
| **본 시스템 알림** (어플 설치 invite / 일반 사용자 push) | **notification-service Aligo** | 즉시 (W3 활성) |

W10-1 시점: notification-service skeleton-mode 토글 (`samhan.arologis.client.skeleton-mode=true`) 로 호출 차단.
W10-2 진입 시점: 인성 알림톡 직접 호출 + notification-service 호출 = 어플 설치 invite 만 (분리 정책).

DECISIONS — `D-P10-06` (2026-05-07).

## 8. Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (2026-05-15)

[D-DF-01~13](../../migration/decisions/DECISIONS.md#d-df-00) — 사용자 결정 13건. 자세한 dev-report = [`docs/dev-reports/samhan-signature-copy.md`](../../docs/dev-reports/samhan-signature-copy.md).

### 8.1 신규 endpoint

| method | path | 비고 |
|---|---|---|
| POST | `/driver-app/dispatches/{dispatchId}/stops/{stopId}/sign-and-send-copy` | 1-tap 서명 + PNG 사본 응답 (image/png) 또는 JSON fail (200) / duplicate (409). 권한 = `ROLE_AROLOGIS_DRIVER` + `JWT.driverId == dispatch.driverId` |
| POST | `/driver-app/dispatches/{dispatchId}/stops/{stopId}/sign` | **`@Deprecated`** — 후속 PR 에서 제거 예정 |

### 8.2 환경변수 (4건 신규)

| 환경변수 | 기본값 | 비고 |
|---|---|---|
| `AROLOGIS_SIGNATURE_COPY_DIR` | `/var/lib/arologis/signature-copies` | PNG 사본 disk path. Phase 11 cutover 시 S3 키 prefix 로 갈아탐 |
| `AROLOGIS_PLAYWRIGHT_BROWSER_PATH` | `/ms-playwright/chromium-...` | Docker image 내 Chromium 실행 파일 경로 |
| `AROLOGIS_PRINT_RENDERER_PATH` | `file:///app/print-renderer/index.html` | OutboundView 양식 정적 HTML URL (Vite multi-entry 산출물) |
| `AROLOGIS_COPY_RENDERER_TIMEOUT_MS` | `1024` | Playwright Chromium PNG 캡처 timeout (ms). 초과 시 Tx2 fail (`RENDERER_TIMEOUT`) |

`SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE` 는 Phase F 부터 `false` (default 활성).

### 8.3 Flyway V11 신규 컬럼 (`signatures` 4건)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `copy_sent_at` | `TIMESTAMP NULL` | 사본 PNG download 시각 (성공 1회 가드, NULL → 호출 OK, NOT NULL → 409) |
| `copy_send_failure_count` | `INT NOT NULL DEFAULT 0` | Tx2 fail 누적 카운트 (모니터링 alert 임계치용) |
| `copy_image_path` | `VARCHAR(255) NULL` | disk 저장 경로 |
| `copy_recipient_phone` | `VARCHAR(20) NULL` | 발송 시점 slip `recipientPhoneNumber` 풀 번호 스냅샷 |

### 8.4 Docker 빌드 (Playwright + Chromium + 한글 폰트)

`services/arologis-service/Dockerfile` — Playwright Java SDK 1.47 + Chromium headless + `fonts-noto-cjk` apt 패키지 설치.

```bash
docker build -t arologis-service:phase-f services/arologis-service/
docker run --rm -p 8097:8097 \
  -e AROLOGIS_SIGNATURE_COPY_DIR=/var/lib/arologis/signature-copies \
  -e AROLOGIS_PRINT_RENDERER_PATH=file:///app/print-renderer/index.html \
  -e AROLOGIS_COPY_RENDERER_TIMEOUT_MS=1024 \
  -e SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false \
  -v /var/lib/arologis/signature-copies:/var/lib/arologis/signature-copies \
  arologis-service:phase-f
```

### 8.5 PNG 합성 출처

`clients/desktop/print-renderer/` (Vite multi-entry 별도 빌드 산출물) — `OutboundView.tsx` a4-portrait variant 단일 출처. 빌드 = `cd clients/desktop && npm run build:print-renderer` → `dist/print-renderer/{index.html,assets/index-*.js}` → arologis-service Docker image `/app/print-renderer/` 동봉.

---

## 9. Phase 11 AWS cutover 영향

- arologis_db RDS 호환 (Postgres standard SQL only — VARCHAR + NUMERIC + partial unique index 의무)
- ShedLock 클러스터 — Phase 11 W11-2 시점에 통합 (DB 단일 lock 테이블 그대로 사용)
- DriverMatcher 추상화 — vendor 변경 영향 0 (provider 토글)
- 모바일 어플 (RN Expo, W10-3) — Phase 11 cutover 시 deep link / push token 갱신만
- DriverLocation 30일 cleanup — Phase 11 시점에 Aurora partition table 으로 전환 가능 (옵션)

---

## 빠른 실행

```bash
./gradlew :services:arologis-service:bootRun         # http://localhost:8097
./gradlew :services:arologis-service:test            # 단위 + IT (Docker 가용 시)

# 카톡 파싱 미리보기 호출 (admin)
curl -X POST http://localhost:8097/admin/arologis/dispatches/parse-kakao \
  -H "X-User-Id: admin" -H "X-User-Role: MANAGER" \
  -H "Content-Type: application/json" \
  -d '{"kakaoText":"8일착 야상입니다\n1. 상일+초월\n-인천 남동구 구월동(에스엠하나공조-214)아침8시\n1톤"}'
```
