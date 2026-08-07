# 아로로지스 독립 서비스 분리 — 설계서

> 작성일: 2026-05-14
> 작성자: PM (Claude Opus 4.7) + 개발책임자 (ewoo14)
> 상태: brainstorming 완료, 5-team 디스패치 대기

---

## 1. 배경 / 목적

아로로지스 (`arologis-service`, Phase 10 W10-1 ~ W10-4) 는 현재 **Samhan Public** monorepo 의 14 마이크로서비스 중 하나로 운영되고 있다. 본 작업은 아로로지스를 **독립 운영 단위로 분리** 하되, 같은 Samhan Public AWS 서버에 함께 배포하고 service-to-service 데이터 통신을 유지하는 것을 목표로 한다.

**핵심 목표**:
- 사용자 입장에서 "아로로지스 = 별도 제품" 인식 (별도 도메인, 별도 로그인, 별도 mobile/desktop app)
- 코드/빌드/배포는 monorepo 안에서 운영 단위만 분리 (재명명 비용 회피)
- AWS 비용 변경 0 (같은 EC2 + 같은 RDS 공유)

**비목표**:
- 코드 재명명 (`com.samhanair.logis.*` 패키지, `samhan-logis` repo 이름) 은 그대로
- Phase 11 AWS migration 자체 (별도 진행 중)

---

## 2. 9개 핵심 결정 (사용자 확정 2026-05-14)

| # | 결정 | 결정값 |
|---|---|---|
| D-AX-01 | 분리 수준 | **monorepo 유지 + build/배포만 분리** |
| D-AX-02 | service-to-service 통신 | **Eureka 클러스터 공유** (현 방식 유지) |
| D-AX-03 | Client UI 처리 | **clients/arologis-desktop + clients/arologis-mobile 신규 추출** |
| D-AX-04 | DB 인스턴스 | **공유 RDS 인스턴스 + arologis_db 격리** |
| D-AX-05 | 운영 도메인 | **arologis.samhan-air.com 하위** (api / app / mobile) |
| D-AX-06 | PR 구조 | **단일 통합 PR (5-team 병렬)** |
| D-AX-07 | 계정/인증 | **완전 별도** (자체 auth + user 도메인) |
| D-AX-08 | Auth 패키징 | **arologis-service 내장** (단일 jar) |
| D-AX-09 | 기사 인증 | **휴대번호 passwordless** (사전 등록 기사 항상 허용) |

---

## 3. 전체 아키텍처

```
┌────────────────────────────────────────────────────────────────────┐
│  AWS 단일 환경 (Seoul, m5.xlarge 1대 + db.t3.medium 1대 — 공유)     │
│                                                                    │
│  ┌─────────────────────── EC2 m5.xlarge ────────────────────────┐ │
│  │  docker-compose (단일 호스트, 같은 docker network samhan-net) │ │
│  │                                                              │ │
│  │  ┌─ Samhan Public 영역 ─┐    ┌─ 아로로지스 영역 (NEW) ────┐   │ │
│  │  │ eureka-server        │←──→│ arologis-service:8097     │   │ │
│  │  │ api-gateway          │    │  (자체 auth + user 내장)  │   │ │
│  │  │ auth-service         │    └───────────────────────────┘   │ │
│  │  │ user-service         │           ↑↓ (Eureka 공유)          │ │
│  │  │ partner-service ←────┘                                    │ │
│  │  │ slip-service ←────────────────── (REST + X-Internal)      │ │
│  │  │ notification-service ←──                                  │ │
│  │  │ … (총 14 service)                                         │ │
│  │  └───────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─────────────── RDS db.t3.medium (공유) ───────────────────────┐ │
│  │  samhanlogis_db / arologis_db / … (DB 격리, 인스턴스 공유)    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘

           ↑                                ↑
           │ HTTPS (Route53 + ACM wildcard *.samhan-air.com)
           │                                │
┌──────────────────────┐         ┌──────────────────────────────┐
│  Samhan Public       │         │  아로로지스 (NEW)            │
│  api.samhan-air.com  │         │  api.arologis.samhan-air.com │
│  app.samhan-air.com  │         │  app.arologis.samhan-air.com │
└──────────────────────┘         │  mobile.arologis.samhan-air. │
           ↑                     └──────────────────────────────┘
   ┌────────────────┐                      ↑
   │ desktop client │            ┌──────────────────────────┐
   │ mobile-staff   │            │ arologis-desktop (NEW)   │
   │                │            │ arologis-mobile  (NEW)   │
   └────────────────┘            └──────────────────────────┘
```

---

## 4. Build & Release 파이프라인

### 4.1 Gradle build target 분리

```
samhan-logis/                     (monorepo, 그대로)
├── settings.gradle               (:services:arologis-service 유지)
├── services/arologis-service/    (변경: UserClient 제거, AuthController/User 추가)
├── clients/arologis-desktop/     (NEW)
├── clients/arologis-mobile/      (NEW)
└── shared/                       (5 모듈 그대로 link, user-client-abstraction 의존 제거)
```

| 영역 | 명령 | 산출 |
|---|---|---|
| Samhan Public 전체 | `gradle build -x :services:arologis-service:build` | 기존 14 service jar |
| 아로로지스 BE | `gradle :services:arologis-service:bootJar` | `arologis-service.jar` |
| 아로로지스 Desktop | `cd clients/arologis-desktop && npm run build:win` | Electron `.exe` |
| 아로로지스 Mobile | `cd clients/arologis-mobile && eas build` | RN APK/AAB |

### 4.2 Docker 이미지

| 이미지 | 태그 cadence |
|---|---|
| `samhanpublic/arologis-service:1.0.0` | 별도 semver (`arologis-vX.Y.Z` git tag) |
| `samhanpublic/eureka-server`, `samhanpublic/api-gateway` 등 14개 | Samhan Public Phase cadence |

### 4.3 GitHub Actions workflow

| Workflow | Path filter | 산출 |
|---|---|---|
| `.github/workflows/samhanlogis-ci.yml` (기존) | `services/**` (단 `services/arologis-service/**` 제외) + `clients/desktop/**` + `clients/mobile-staff/**` + `shared/**` | Samhan Public CI |
| `.github/workflows/arologis-ci.yml` (NEW) | `services/arologis-service/**` + `clients/arologis-*/**` + `shared/**` | 아로로지스 CI |
| `.github/workflows/arologis-deploy.yml` (NEW) | git tag `arologis-v*` | EC2 배포 |

**shared/** 변경 시 양쪽 CI 모두 trigger (regression 가드).

---

## 5. Service-to-service 통신

분리 후 통신은 같은 docker network + 같은 Eureka. **BE service 호출 코드 변경 0** (단 UserClient 제거).

```
아로로지스 → Samhan Public (3 client, UserClient 제거)
─────────────────────────────────────────────
PartnerClient        →  partner-service:8095     (REST + Eureka)
SlipClient           →  slip-service:8084        (REST + Eureka + X-Internal-Token)
NotificationClient   →  notification-service:8093 (REST + Eureka)
                                                  — 기사 onboarding SMS invite 용
                                                  — (passwordless 라 OTP SMS 없음)

Samhan Public → 아로로지스
─────────────────────────────────────────────
external vendor / 내부 system → /internal/arologis/**  (X-Internal-Token + ROLE_MASTER)
admin (arologis-desktop)      → /admin/arologis/**     (JWT + ROLE_AROLOGIS_MANAGER)
driver (arologis-mobile)      → /driver-app/arologis/**(JWT + ROLE_AROLOGIS_DRIVER)
admin auth                    → /auth/admin/login       (loginId + password)
driver auth                   → /auth/driver/login      (phoneNumber 만, passwordless)
```

`shared:user-client-abstraction` 의존 제거 (자체 user 도메인 활용).

---

## 6. 자체 Auth + User 도메인 (D-AX-07, D-AX-08, D-AX-09)

### 6.1 신규 entity

| Entity | 필드 | 비고 |
|---|---|---|
| **AdminUser** | id (UUID, 비공개) / loginId (사용자 노출) / passwordHash / name / role (`AROLOGIS_MASTER` / `AROLOGIS_MANAGER`) / BaseEntity 7 + Soft Delete | arologis-desktop 사용자 |
| **Driver** (기존) | id (UUID, 비공개) / driverCode (사용자 노출) / phoneNumber (활성 unique) / vehicleType / source / appInstalled / appUserId (deprecated, AdminUser/Driver link 가 아님) / BaseEntity 7 + Soft Delete | arologis-mobile 사용자 — phoneNumber 가 로그인 식별자 |
| **RefreshToken** | id / userId (polymorphic — adminUserId or driverId) / tokenHash / expiresAt / revoked / BaseEntity 7 | 30일 유효, rotation 의무 |

`driverCode` / `loginId` 는 사용자 노출, `id` (UUID) 는 [[uuid-no-user-visibility]] 가드.

### 6.2 신규 endpoint

| Method | Path | Body | 반환 |
|---|---|---|---|
| POST | `/auth/admin/login` | `{ loginId, password }` | `{ accessToken, refreshToken, role, expiresAt }` |
| POST | `/auth/driver/login` | `{ phoneNumber }` | `{ accessToken, refreshToken, role, expiresAt }` 또는 401 (미등록) |
| POST | `/auth/refresh` | `{ refreshToken }` | 새 `accessToken` + 새 `refreshToken` (rotation) |
| POST | `/auth/logout` | `{ refreshToken }` | 204 (revoked 마킹) |
| GET | `/auth/me` | JWT bearer | 본인 정보 |

### 6.3 JWT claims

```json
{
  "sub": "<UUID>",
  "role": "AROLOGIS_MASTER" | "AROLOGIS_MANAGER" | "AROLOGIS_DRIVER",
  "loginId": "<loginId>"   // admin 만
  "driverCode": "<code>",  // driver 만
  "phoneNumber": "<phone>", // driver 만
  "iat": ..., "exp": ...
}
```

api-gateway 우회 직접 호출이므로 arologis-service 자체 `JwtFilter` 가 검증 후 `X-User-*` 헤더 주입 (controller 호환).

**PII note**: `phoneNumber` JWT claim 은 client 가 토큰 디코딩 시 보이는 평문. 본 PR scope 내에서는 그대로 두되, 향후 (Phase X 이후) 마스킹 (`010-****-1234`) 또는 별도 endpoint 조회로 분리 검토.

### 6.4 Flyway migration 신규

| 버전 | 내용 |
|---|---|
| `V7__add_arologis_auth_user.sql` | `auth_user` 테이블 + partial unique on `(login_id) WHERE is_deleted=false` |
| `V8__add_arologis_refresh_token.sql` | `auth_refresh_token` + index on `(user_id, expires_at)` |
| `V9__seed_arologis_master.sql` | dev seed — 초기 MASTER 계정 1개 (`admin/${QA_AROLOGIS_ADMIN_PASSWORD}` BCrypt) — prod 는 manual |

---

## 7. Client 추출 구조 (D-AX-03)

### 7.1 신규 폴더 구조

```
clients/
├── desktop/                                ← Samhan Public 그대로 (routes/arologis/ 삭제)
├── mobile-staff/                           ← Samhan Public 그대로 (driver 화면 삭제)
│
├── arologis-desktop/                       ← NEW (Electron + Vite + React, desktop 와 동일 stack)
│   ├── package.json
│   ├── electron/
│   ├── src/renderer/
│   │   ├── routes/
│   │   │   ├── login/                      (loginId + password)
│   │   │   ├── dispatches/                 (기존 routes/arologis/dispatches 이전)
│   │   │   ├── drivers/                    (Driver CRUD, phoneNumber 사전 등록)
│   │   │   ├── regions/
│   │   │   └── audit/
│   │   ├── api/
│   │   │   ├── auth.ts                     (POST /auth/admin/login)
│   │   │   ├── arologis.ts                 (/admin/arologis/**)
│   │   │   ├── partner.ts                  (partner-service)
│   │   │   └── notification.ts             (어플 invite SMS)
│   │   └── components/
│   └── vite.config.ts
│
└── arologis-mobile/                        ← NEW (RN Expo, mobile-staff 와 동일 stack)
    ├── app.json                            (bundle id: com.samhanair.arologis.driver)
    ├── package.json
    ├── src/
    │   ├── screens/
    │   │   ├── PhoneLoginScreen.tsx        (휴대번호만 입력, passwordless)
    │   │   ├── DispatchListScreen.tsx      (본인 dispatch)
    │   │   ├── DispatchDetailScreen.tsx
    │   │   ├── GpsPermissionScreen.tsx     (foreground 의무, 거부 시 사용 불가)
    │   │   └── SignatureScreen.tsx         (전자서명 → /driver-app/arologis/**/sign)
    │   ├── api/
    │   │   ├── auth.ts                     (POST /auth/driver/login)
    │   │   └── arologis.ts                 (/driver-app/arologis/**)
    │   └── components/
    └── eas.json
```

### 7.2 이전 매트릭스

| 기존 위치 | 신규 위치 | 처리 |
|---|---|---|
| `clients/desktop/src/renderer/routes/arologis/*` (`DISPATCH-DESIGN.md` 포함) | `clients/arologis-desktop/src/renderer/routes/dispatches/` | `git mv` 후 import path 갱신 |
| `clients/desktop/src/renderer/api/arologis*.ts` (존재 시) | `clients/arologis-desktop/src/renderer/api/arologis.ts` | `git mv` |
| `clients/mobile-staff/src/api/arologis.ts` | `clients/arologis-mobile/src/api/arologis.ts` | `git mv` |
| `clients/mobile-staff/src/screens/driver/*` (있다면) | `clients/arologis-mobile/src/screens/` | `git mv` |

### 7.3 배포 채널

- **arologis-desktop**: 별도 Electron installer (`Arologis-Setup-1.0.0.exe`)
- **arologis-mobile**: 별도 Google Play / App Store 앱 (별도 bundle id, 별도 EAS Build profile)

---

## 8. AWS 운영 환경 (D-AX-04, D-AX-05)

### 8.1 인프라 (Phase 11 계획 그대로, 비용 변경 0)

| 자원 | 사양 |
|---|---|
| EC2 | m5.xlarge 1대 (Seoul) — Samhan Public + 아로로지스 같은 호스트 |
| RDS | db.t3.medium 1대 (Seoul) — `arologis_db` 가 추가 DB |
| Route53 | hostedzone `samhan-air.com` — A 레코드 3개 추가 |
| ACM | wildcard `*.samhan-air.com` **+ 별도 SAN `*.arologis.samhan-air.com` 추가 의무** (2-level wildcard 는 1-level 와일드카드로 커버 안 됨 — Terraform main.tf 의 `aws_acm_certificate.main.subject_alternative_names` 갱신 별도 PR) |
| Nginx | host-header 기반 라우팅 (`api.arologis.samhan-air.com` → 8097) |

### 8.2 Route53 신규 레코드

```
api.arologis.samhan-air.com      A   → EC2 public IP
app.arologis.samhan-air.com      A   → EC2 public IP   (electron 다운로드 페이지)
mobile.arologis.samhan-air.com   A   → EC2 public IP   (store deeplink 페이지)
```

### 8.3 Nginx 라우팅 (EC2 내)

```nginx
server {
    server_name api.samhan-air.com;
    location / { proxy_pass http://api-gateway:8080; }
}
server {
    server_name api.arologis.samhan-air.com;
    location / { proxy_pass http://arologis-service:8097; }  # gateway 우회
}
server {
    server_name app.arologis.samhan-air.com;
    root /var/www/arologis-desktop;  # installer 다운로드 페이지
}
server {
    server_name mobile.arologis.samhan-air.com;
    root /var/www/arologis-mobile;  # store deeplink 페이지
}
```

### 8.4 Docker 운영 — 같은 network, 별도 compose

```yaml
# infrastructure/docker/docker-compose.arologis.yml (NEW)
version: '3.8'
services:
  arologis-service:
    image: samhanpublic/arologis-service:1.0.0
    container_name: arologis-service
    ports: ["8097:8097"]
    environment:
      SAMHAN_AROLOGIS_DB_HOST: postgres
      EUREKA_CLIENT_SERVICEURL_DEFAULTZONE: http://eureka-server:8761/eureka/
      SAMHAN_INTERNAL_TOKEN: ${SAMHAN_INTERNAL_TOKEN}
      …
    networks:
      - samhan-net
networks:
  samhan-net:
    external: true  # 기존 Samhan Public network 에 join
```

### 8.5 배포 절차 (별도 cadence)

```
arologis-deploy.yml workflow:
  1. arologis-v1.0.0 tag push 또는 manual trigger
  2. Gradle bootJar → Docker build → push samhanpublic/arologis-service:VERSION
  3. EC2 ssh: docker-compose -f docker-compose.arologis.yml pull && up -d
  4. health check (curl http://arologis-service:8097/actuator/health)
  5. Slack 알림
```

Samhan Public 의 release 와 **완전 독립** — 한 쪽 배포가 다른 쪽 영향 0.

### 8.6 비용

| 항목 | 현재 | 분리 후 | 차이 |
|---|---|---|---|
| EC2 + RDS + Route53 + ACM | 월 ₩405K | 월 ₩405K | 0 |

---

## 9. 문서 + 메모리 재구성

### 9.1 신규 작성

| 파일 | 내용 |
|---|---|
| `docs/migration/arologis-extract/README.md` | 분리 작업 readiness checklist (9 결정 요약 + before/after 다이어그램) |
| `docs/migration/arologis-extract/01-build-pipeline.md` | Gradle target / Docker / GitHub Actions workflow 가이드 |
| `docs/migration/arologis-extract/02-client-extraction.md` | 추출 매트릭스 + import path 갱신 가이드 |
| `docs/migration/arologis-extract/03-auth-domain.md` | 자체 auth/user 도메인 스키마 + JWT issuer + passwordless login 흐름 |
| `docs/migration/arologis-extract/04-aws-deployment.md` | Route53 + Nginx + docker-compose.arologis.yml + release cadence |
| `docs/migration/arologis-extract/05-rollback-runbook.md` | 5 단계 reversible 절차 |
| `clients/arologis-desktop/README.md` | NEW client 가이드 |
| `clients/arologis-mobile/README.md` | NEW client 가이드 |
| `docs/dev-reports/arologis-extract.md` | TM 통합 PR dev-report |

### 9.2 갱신

| 파일 | 변경 |
|---|---|
| `README.md` (root) | "Samhan Public 14 service + 아로로지스 (독립 서비스)" 구조 명시 |
| `ROADMAP.md` | 분리 작업 milestone 추가 — 작업명 = "**Phase 10.5 — 아로로지스 독립 분리**" (Phase 10 의 W10-1~W10-5 완료 후 Phase 11 AWS migration 진입 전 단일 sub-milestone) |
| `services/arologis-service/README.md` | "Samhan Public 의 마이크로서비스" → "독립 서비스, AWS 환경 공유" — 자체 auth/user + 3 client (UserClient 제거) 갱신 |
| `migration/decisions/DECISIONS.md` | `D-AX-01` ~ `D-AX-09` 9 entry 추가 |
| `CLAUDE.md` | "Samhan Public" / "아로로지스" 명칭 규칙 + 신규 메모리 링크 추가 |

### 9.3 메모리 (양 PC sync)

| 신규 | 내용 |
|---|---|
| `.claude/memory/project_arologis_independent.md` | "아로로지스 = Samhan Public 의 독립 서비스 (2026-05-14)" + 9 결정 정리 |
| `.claude/memory/feedback_arologis_name.md` | (이미 작성) 한국어 표기 "아로로지스" 정식 |
| `.claude/memory/feedback_samhan_public_name.md` | (이미 작성) 외부 호칭 "Samhan Public" |

`.claude/memory/MEMORY.md` 갱신 → `scripts/sync-claude-memory.ps1` 으로 양 PC 동기화.

### 9.4 Grafana / Prometheus

- `infrastructure/grafana/provisioning/dashboards/arologis-slip-bridge.json` — 그대로 (Eureka 공유 + scrape target 변경 0)
- `infrastructure/prometheus/prometheus.yml` — arologis-service job 그대로

### 9.5 삭제 / 이전

| 대상 | 처리 |
|---|---|
| `clients/desktop/src/renderer/routes/arologis/` | `git mv` 이동 후 빈 폴더 정리 |
| `clients/mobile-staff/src/screens/driver/` (있다면) | `git mv` 이동 |
| `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/UserClient.java` | 삭제 |
| `services/arologis-service/build.gradle` 의 `:shared:user-client-abstraction` 의존 | 제거 |

---

## 10. 테스트 + 롤백

### 10.1 회귀 가드 (기존 33 case PASS)

| 영역 | 기존 | 변경 |
|---|---|---|
| 단위 | 20 case | UserClient 관련 case → 자체 UserService 로 대체 |
| IT | 13 case | `@MockBean UserClient` 제거 + 자체 AuthService MockBean 추가 |

### 10.2 신규 IT 의무

| Case | 검증 |
|---|---|
| `ArologisAdminAuthIT` | `/auth/admin/login` loginId+password → JWT → `/admin/arologis/**` 호출 가능 |
| `ArologisDriverAuthIT` | `/auth/driver/login` phoneNumber → 사전 등록 시 JWT, 미등록 시 401 |
| `ArologisAuthSecurityIT` | 만료 JWT / 잘못된 password / Soft Deleted Driver 차단 |
| `ArologisRefreshTokenIT` | rotation 정상 / revoked 사용 차단 / 만료 토큰 차단 |

### 10.3 QA 시나리오 (TM 통합 PR 본문 첨부 의무)

| # | 시나리오 | 캡처 |
|---|---|---|
| 1 | arologis-desktop 로그인 (admin/${QA_AROLOGIS_ADMIN_PASSWORD}) → 배차 등록 → 자동매칭 | 1장 |
| 2 | arologis-desktop 의 Driver CRUD — phoneNumber 사전 등록 | 1장 |
| 3 | arologis-mobile 본인 번호 로그인 → dispatch 목록 → 전자서명 | 1장 |
| 4 | 같은 Eureka 에 14 + 1 service 등록 확인 (`/actuator/services`) | 1장 |
| 5 | Route53 + Nginx host-header 라우팅 (`api.arologis.samhan-air.com` → 8097 health) | 1장 |
| 6 | `docker-compose.arologis.yml` 단독 down → Samhan Public 14 service 영향 0 확인 | 1장 |

### 10.4 롤백 절차 (5 단계 reversible)

| Step | 절차 | 시간 |
|---|---|---|
| 1. DNS 회수 | Route53 의 `*.arologis.samhan-air.com` 3 레코드 삭제 | 5분 |
| 2. Docker 회수 | `docker-compose -f docker-compose.arologis.yml down` (기존 14 service 영향 0) | 2분 |
| 3. Client 회수 | `git mv` 역순으로 `clients/arologis-*` → `clients/desktop` + `clients/mobile-staff` 복귀 | 30분 |
| 4. Code 회수 | 자체 auth/user 도메인 제거 + UserClient 복원 (PR revert 1 commit) | 1시간 |
| 5. DB 회수 | `auth_user` + `auth_refresh_token` 테이블 drop (`V7`/`V8` undo) | 10분 |

arologis_db 의 기존 데이터 (dispatch / vehicle / stop / driver) 는 그대로 — 분리 작업이 데이터 마이그레이션을 수반하지 않음.

### 10.5 CI green 의무

- `arologis-ci.yml` PASS (BE bootJar + Docker build + IT 17 case)
- `samhanlogis-ci.yml` PASS (Samhan Public 14 service 회귀 0)
- 둘 다 green → TM 통합 PR comment 자동 알림 → 개발책임자 머지 trigger

---

## 11. 5-team 디스패치 — 단일 통합 PR (D-AX-06)

본 분리 작업은 메모리 [[feedback_multi_agent_team_pattern]] + [[feedback_integrated_pr_pattern]] 일관 — **단일 통합 PR**, 5-team 병렬 + TM 검토.

### 11.1 팀별 산출

| Team | 작업 범위 |
|---|---|
| **BE** | (a) 자체 auth + user 도메인 entity/repo/service/controller (b) UserClient 제거 + shared:user-client-abstraction 의존 제거 (c) JwtFilter 자체 구현 (d) Flyway V7/V8/V9 (e) 신규 IT 4 case |
| **FE** | (a) `clients/arologis-desktop/` 신규 (b) `git mv` 이전 + import path 갱신 (c) `clients/arologis-mobile/` 신규 (d) auth.ts 호출 흐름 (admin loginId+password / driver phoneNumber only) |
| **Designer** | (a) arologis-desktop 로그인 화면 (b) arologis-mobile PhoneLoginScreen + GpsPermissionScreen 디자인 (c) installer 다운로드 페이지 mock (`app.arologis.samhan-air.com`) (d) store 페이지 mock (`mobile.arologis.samhan-air.com`) |
| **QA** | (a) 6 시나리오 캡처 (b) IT 신규 17 case 검증 SQL (c) 회귀 33 case 0 결함 확인 (d) 롤백 절차 dry-run |
| **DevOps** | (a) `arologis-ci.yml` + `arologis-deploy.yml` workflow (b) `docker-compose.arologis.yml` (c) Route53 + Nginx 설정 (d) `samhanpublic/arologis-service` 이미지 build/push (e) EC2 health check Lambda 영향 0 확인 |

### 11.2 TM 검토

- BE+FE 컴파일 검증 ([[feedback_pm_integration_build_check]])
- shared 모듈 영향 분석 (회귀 0)
- UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])
- 한국어 PR/Issue ([[feedback_korean_commits]])
- 양 PC 메모리 sync ([[feedback_continuous_docs_sync]])

### 11.3 PM 자동 CI 모니터링 + 머지 trigger

- PR 발행 즉시 `gh pr checks --watch` ([[feedback_pr_ci_monitoring]])
- 5-team 0 결함 + CI green → PM 승인 → 개발책임자 머지 요청 ([[feedback_user_merge_authority]])

---

## 12. 메모리 링크

- [[feedback_arologis_name]] — "아로로지스" 정식
- [[feedback_samhan_public_name]] — 외부 호칭 "Samhan Public"
- [[feedback_multi_agent_team_pattern]] — 5-team 디스패치
- [[feedback_integrated_pr_pattern]] — 단일 통합 PR
- [[feedback_user_merge_authority]] — PM 자동 머지 권한
- [[feedback_pm_integration_build_check]] — 통합 풀빌드 가드
- [[feedback_uuid_no_user_visibility]] — UUID 비공개
- [[feedback_continuous_docs_sync]] — 문서 동기화 의무
- [[feedback_korean_commits]] — 한국어 PR/커밋
- [[feedback_pr_ci_monitoring]] — CI 자동 watch
- [[project_arologis_phase10]] — Phase 10 기존 컨텍스트
- [[project_phase11_aws]] — Phase 11 AWS 인프라
