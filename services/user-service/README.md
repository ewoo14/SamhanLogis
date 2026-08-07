# user-service

Owns the **employees** and **departments** tables and exposes the org-chart / employee
provisioning REST surface for the SamhanLogis MSA.

## Responsibilities

- CRUD for employees (id is shared 1:1 with `auth-service.accounts.id`).
- Single-level department directory (대표실 / 영업1팀 / 영업2팀 / 영업3팀 / 회계팀).
- Org-chart projection used by the SPA home page.
- Provisioning orchestration: create Employee + create Account in Auth Service via the
  internal `/auth/internal/accounts` endpoints (saga-style — Auth first, compensation if
  the local persist fails).
- Display-name propagation: when an employee's `fullName` is updated, the change is
  synced into `auth-service.accounts.display_name` (Q2 — 개발책임자 확정).

## Endpoints

| Method | Path | Required role |
|---|---|---|
| `POST` | `/users/employees` | MASTER, MANAGER |
| `GET` | `/users/employees?departmentId=&role=` | any auth |
| `GET` | `/users/employees/{id}` | any auth |
| `POST` | `/users/employees/lookup` (max 100 ids) | any auth |
| `PATCH` | `/users/employees/{id}` | MASTER, MANAGER |
| `PATCH` | `/users/employees/{id}/role` | MASTER |
| `POST` | `/users/employees/{id}/terminate` | MASTER |
| `GET` | `/users/org-chart` | any auth |
| `GET` | `/users/departments` | any auth |

All ingress is via the API Gateway, which strips `/api/users` to `/users` and forwards
`X-User-Id` / `X-User-Role` headers.

## SP-D7 권한 정리

직원 생성, 수정 endpoint는 `admin.employees` EDIT grant와 기존 role guard가 동일해 `@RequirePermission`만 유지한다.
역할 변경과 퇴사 처리는 더 엄격한 MASTER 전용 행위이므로 `@PreAuthorize("hasRole('MASTER')")`와
`@RequirePermission(page = "admin.employees", action = "EDIT")`를 함께 유지한다.

## Default seed password

The `OrgChartSeeder` provisions the 16 real employees of Samhan Logis on first boot when
`app.user.seed-org=true`. Each account is created with the **default password
`QA_MASTER_PASSWORD`** (Q1 — 개발책임자 확정). Employees must change the password on first login.

## Internal service-to-service token

Both `user-service` (caller) and `auth-service` (callee) share `app.security.internal.token`,
overridable via env `INTERNAL_AUTH_TOKEN`. Default for dev: `dev-internal-token-change-me`.

**보안 가드**: `prod` 프로파일이 활성화된 상태에서 토큰이 dev 기본값으로 남아있으면
`InternalTokenGuard` 가 부팅을 거부한다. 운영 배포 전 반드시 `INTERNAL_AUTH_TOKEN` 환경변수로
강력한 랜덤 문자열을 주입할 것. (참조: `infrastructure/.env.example`)

## DB

PostgreSQL `user_db`. Schema is owned by Flyway:
- `V1__init_user_service.sql`
- `V2__seed_org_chart.sql`

## Local dev

```
gradlew :services:user-service:bootRun
```

Requires `eureka-server` and `auth-service` running, and `user_db` reachable on the
default datasource (or the `local` profile for H2).

## Phase 8 호환성 가드 (PR #88 / #89 / #90)

- **chained-default 환경변수** — `SAMHAN_<KEY>:${LEGACY_KEY:default}` 패턴 적용 (legacy 호환 100%, 무중단 cutover 가능)
- **12-factor 12/12 OK** + RDS 호환 (standard SQL 만, RDS 미지원 extension 부재)
- **AWS 서비스 매핑** — `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` 본 service 항목 참조
- **env-template** — `infrastructure/env-templates/user-service.env` 보유
- **ServiceDiscoveryClient (Phase 11 활성 대비)** — `shared:discovery-abstraction` 의존성 도입은 Phase 11 cutover 시점 (현재 Eureka 자체 EC2 운영 채택 — D-P8-07 보강)

## Phase 9 신규 service 매트릭스 (참조)

본 service 와 향후 연동될 Phase 9 신규 4 service:

| Service                | Port | DB                | 도메인                              |
| ---------------------- | ---- | ----------------- | ----------------------------------- |
| partner-service        | 8095 | partner_db        | 거래처 마스터 + 신용한도 + 거래내역 |
| groupware-service      | 8092 | groupware_db      | 결재선 + 메신저 + 일정              |
| notification-service   | 8093 | notification_db   | 푸시/이메일/SMS 통합 라우터         |
| dashboard-service      | 8094 | dashboard_db      | KPI + 실시간 재고 + 매출            |

상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조. user-service 는 groupware-service 의 직원 정보 / notification-service 의 수신자 정보 lookup 의 source-of-truth 로 동작 예정.

## post-W5 backlog cleanup — Employee.DEFAULT_HIRE_DATE 의도 주석 (D-P9-21, DevOps user-service backlog 채택)

`Employee.java` 에 `DEFAULT_HIRE_DATE = LocalDate.of(2026, 1, 1)` 상수 + 한국어 의도 주석 추가 (코드 동작 변경 0):

- W4 slip-service 시간 의존 회귀 회피 학습 적용
- 입사일 ({@code hireDate}) 미입력 시 fixture 용 default placeholder
- entity 의 `hireDate` 자체는 NotNull DB column — 입력 의무 보존
- 만료 비교 패턴 부재 보장 — 시간 진행에 따른 테스트 회귀 발생 X
- production 진입 시점에는 입사일 입력 의무 또는 사용자 입력 화면 추가 (Phase 10 user-service 화면 슬라이스 시점 정식 처리)

상세 결정은 `migration/decisions/DECISIONS.md` D-P9-21 참조.

## Ecount MIG-6 Importers

MIG-6는 이카운트 잔여 마스터 중 user-service 소유 3종을 이관한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountEmployeeImporter` | `POST /admin/user/employees/imports/ecount` | 사원 → `employees.ecount_code` 보강, 연락처/이메일/사용 여부 반영 |
| `EcountEmployeeCardImporter` | `POST /admin/user/employee-cards/imports/ecount` | 인사카드 → `employee_cards`, 주민등록번호는 `resident_number_masked`만 저장 |
| `EcountPayrollEmployeeImporter` | `POST /admin/user/payroll-employees/imports/ecount` | 급여관리사원 → `payroll_employees`, 사원/부서 lookup 기반 연결 |

PII 가드: 인사카드 CSV의 주민등록번호 평문은 staging에도 저장하지 않는다. import 시점에 앞 7자리만 보존하고 나머지 6자리를 `******`로 변환하며, fixture는 `XXXXXX-XXXXXXX` placeholder만 사용한다.
