# PR #145 TM 통합 검증 — P1-5 arologis 배차 admin UI 3건

- **PR**: [#145](https://github.com/ewoo14/SamhanLogis/pull/145)
- **branch**: `feature/p1-5-arologis-admin-ui`
- **base**: `main` (45f201d)
- **검증일**: 2026-05-11
- **TM**: PM 산하 통합 검증
- **회귀 가드 범위**: PR #134~#144 회고 가드 전체

## 1. 산출물 인벤토리

| 카테고리 | 파일 | 비고 |
| --- | --- | --- |
| BE controller | `DispatchAdminV1Controller.java` (208 LOC, 5 endpoint) | `/api/v1/arologis/admin` prefix, MASTER/MANAGER |
| BE service | `DispatchAdminService.java` (190 LOC) | DispatchService 위임 + 신규 listDispatches/changeDriver/findAvailableDrivers |
| BE DTO | `DispatchPageResponse.java` / `AvailableDriverResponse.java` / `ManualAssignRequest.java` / `DriverChangeRequest.java` | record + Bean Validation |
| BE migration | `V6__seed_p15_validation_fixture.sql` (254 LOC) | Idempotent ON CONFLICT, BaseEntity 7 audit fields, V2 unique 준수 |
| BE IT | `DispatchAdminV1ControllerIT.java` (298 LOC, 9 TC) | extends AbstractPostgresIT, 5 @MockBean lenient |
| BE IT | `P15ValidationIT.java` (440 LOC, 9 TC) | extends AbstractPostgresIT, slipServiceClient stub |
| BE | `MobileSalesController.java` (180 LOC) | slip-service P1-4 통합 (별도) |
| FE API | `arologisAdminDispatchApi.ts` (재작성) | BE V1 controller record 1:1 |
| FE page | `KakaoAutoDispatchPage.tsx` / `ManualDispatchAdminPage.tsx` / `DriverAssignmentPage.tsx` | 재구성 (BE shape 준수) |
| Designer | `DISPATCH-DESIGN.md` (647 LOC) | wireframe + raw hex 0건 + data-testid 27종 |
| 매뉴얼 | `01-카카오톡-배차.md` / `02-수동-배차.md` / `03-기사-배정.md` | ⛔ → ✅ 갱신 |
| dev-report | `p1-5-arologis-dispatch-validation.md` | DevOps 산출물 보고 |

## 2. 통합 cross-check 결과

| Check | 검증 결과 | fix commit |
| --- | --- | --- |
| **UUID 정합성** (cross-service) | ✅ PASS — V6 seed UUID 결정적 (`00000000-0015-0000-...`), Driver/Dispatch/Vehicle/VehicleStop FK 의존 순서 정확. P15ValidationIT 가 `setUp()` 에서 deleteAll 후 자체 fixture (DRV-P15-T001~003) 등록 — V6 seed 충돌 없음 | (이미 OK) |
| **API contract 정합성** (FE↔BE) | ⚠️ **CRITICAL BLOCKER → fix 적용** — FE arologisAdminDispatchApi.ts 가 호출하던 5 endpoint 중 4건이 BE 신규 controller (`/api/v1/arologis/admin`) 와 prefix/shape 모두 불일치, 1건 (drivers/available) 은 endpoint 자체 미존재. driverName/vehicleLabel/region/currentDispatchCount 등 도메인에 없는 필드 사용. PR #134~144 회고 가드 "BE-FE record 1:1" 정면 위반 | **<fix-commit-1>** |
| **디자인 일관성** | ✅ PASS — design-system Badge/Button/Card/Modal 100% 사용, raw hex 0건 (fallback 만 var(--token, #hex) 패턴), data-testid 일관 | (이미 OK) |
| **도메인 정합성** (Layer 4) | ✅ PASS — DispatchAdminService 가 DispatchService.autoMatch / assignDriverManual 위임 (불필요 중복 X), changeDriver 는 `vehicle.assignDriver(MatchSource.MANUAL)` 단일 호출, findAvailableDrivers 는 ASSIGNED+DEPARTED 차량의 driverId Set 으로 정확 차감 | (이미 OK) |
| **Flyway 의존성** | ✅ PASS — V6 가 V1~V5 후 적용, ON CONFLICT DO NOTHING idempotent, V2 ux_dispatches_date_type_active 충돌 없음 (5건 모두 (date,type) 고유) | (이미 OK) |
| **메모리 가드** | ✅ PASS — 한국어 commit/Javadoc/error message, UUID 비공개 (driverCode/phoneNumber/vehicleType 만 노출), Role 풀네임 (MASTER/MANAGER), @MockBean lenient 4종, extends AbstractPostgresIT | (이미 OK) |

## 3. BLOCKER 상세 (CRITICAL — 자가 fix 적용)

### 3.1 BE-FE API 계약 5건 불일치 (PR #134~144 회고 위반)

| # | FE 호출 (수정 전) | BE 실제 endpoint | 결함 |
| --- | --- | --- | --- |
| 1 | `POST /admin/arologis/dispatches/parse-kakao` body{date} | `POST /admin/arologis/dispatches/parse-kakao` body{kakaoText} → ParsedDispatchResponse | **body field 다름** (date vs kakaoText), response 형식 (`AutoMatchResponse{date,totalSlips,matchedCount,unmatchedCount,entries[]}`) vs 실제 ParsedDispatchResponse → 자동 매칭 자체가 동작 불가 |
| 2 | `GET /admin/arologis/dispatches?date&status` → `DispatchListResponse{dispatches[]{dispatchCode,driverName,vehicleLabel,...}}` | `GET /admin/arologis/dispatches?date&type` → `List<DispatchResponse>` (배열) | **response shape 완전 불일치** (envelope 형식 + 필드 구성) |
| 3 | `GET /admin/arologis/drivers/available?date` → `{date, drivers:[{driverCode, driverName, phone, vehicleLabel, region, active, currentDispatchCount}]}` | **endpoint 자체 미존재** | **404** — `/admin/arologis/drivers` 만 있고 `/available` 미구현 |
| 4 | `POST /admin/arologis/dispatches/{dispatchCode}/assign` body{driverCode} → `AssignDriverResponse{dispatchCode,driverCode,driverName}` | `POST /admin/arologis/dispatches/{id}/vehicles/{seq}/assign-driver` (UUID + seq 필수) | **endpoint shape 완전 불일치** — vehicleSeq 없음, dispatchCode 비즈니스 코드 vs UUID |
| 5 | 권한 `MASTER/MANAGER/DISPATCH` | `MASTER/MANAGER` | DISPATCH role backend 미허용 (BE @PreAuthorize 강제) |

**Impact**: 신규 BE controller `DispatchAdminV1Controller` 가 FE 에서 호출되지 않는 dead code 였고, FE 가 호출한 endpoint 는 4/5 가 404 또는 schema mismatch — 실 사용 시 모든 admin 화면 동작 불가.

### 3.2 자가 fix 결정

PR 의 BE neo controller (`/api/v1/arologis/admin`) 가 5 endpoint + IT 9 TC + V6 seed 까지 완비된 반면, FE 는 별도 envisioned schema (driverName/vehicleLabel 등 도메인 부재 필드) 호출. 가장 안전한 fix = **FE 를 BE 신규 V1 controller record 1:1 로 정렬**.

수정 사항:
- `arologisAdminDispatchApi.ts` 전면 재작성 — endpoint prefix `/api/v1/arologis/admin`, body/response BE record 정확 일치, DriverSource enum 1:1 추가
- `KakaoAutoDispatchPage.tsx` — 배차 list → 행별 자동매칭 trigger (BE 가 dispatchId 단건 기반)
- `ManualDispatchAdminPage.tsx` — DriverSelectModal 에 vehicleSeq input 추가 (BE 가 vehicleSeq 필수)
- `DriverAssignmentPage.tsx` — vehicleSeqMap state + PATCH /driver 호출 (BE changeDriver 의 newDriverCode body)
- `ARO_ADMIN_DISPATCH_ROLES`: DISPATCH 제거 (`MASTER/MANAGER` only — BE 정책 일치)

### 3.3 검증

- `npm run typecheck` (clients/desktop) — **PASS**
- `./gradlew :services:arologis-service:compileJava :compileTestJava -q` — **PASS**

## 4. WARNING (블록 X, 후속 backlog)

| # | 이슈 | 권장 |
| --- | --- | --- |
| W-1 | `Driver` entity 에 `driverName` field 부재 — FE 의 driverName/region/vehicleLabel/currentDispatchCount 표시는 backlog (BE Driver schema 확장 필요) | Phase 11 P1-5b — Driver name/region/active 컬럼 추가 (V7 migration) |
| W-2 | DriverAssignmentPage 가 PATCH /driver 만 호출 (이미 ASSIGNED 차량 변경) — 미배정 차량 신규 배정은 ManualDispatchAdminPage 에서 처리. UX 가이드 명확화 | 매뉴얼 03-기사-배정.md 에 "기사 변경" 화면 정체성 명시 |
| W-3 | ManualDispatchAdminPage 의 vehicleSeq 가 numeric input (1~vehicleCount) — 차량별 거래처/주소 컨텍스트 부재 (BE list endpoint 가 vehicle detail 미반환) | Phase 11 — DispatchSummary 에 vehicles[{seq, label, status}] 추가 시 select 로 교체 |
| W-4 | `auto-match` body 가 `Map<String,String>` raw — record DTO 권장 | 후속 cleanup |

## 5. nit (선택)

- `confidence` percent 색상 함수 (KakaoAutoDispatchPage 의 confidenceVariant) 가 fix 후 미사용 — 결과 banner 만 표시. 향후 BE 가 차량별 매칭 신뢰도 반환 시 재사용 가능 (현재 제거 — 사용처 없음 의도)

## 6. CI / 빌드 결과

- BE compile: **PASS** (`gradlew :services:arologis-service:compileJava :compileTestJava -q`)
- FE typecheck: **PASS** (`npm run typecheck`)
- IT 수행 (P15ValidationIT, DispatchAdminV1ControllerIT) — Windows Docker 한계로 PM 풀빌드 검증 위임

## 7. PM 위임

| 항목 | 위임 사유 |
| --- | --- |
| 풀빌드 (`gradlew assemble` 전체) | TM 은 산출물 정합성, PM 은 회귀 검증 |
| CI watch (gh pr checks --watch) | PR #134~144 회고 가드 (자동 CI watch) |
| 5-team agent reviewer 디스패치 | TM-led discussion 패턴 (PM 책임) |
| 머지 요청 | 개발책임자 본인 (feedback_user_merge_authority) |

## 8. TM 결론

**PASS — 자가 fix 1건 적용 후 정합성 회복**.

5 endpoint × 5 cross-check × 6 메모리 가드 모두 통과. CRITICAL BLOCKER 1건 (BE-FE API 계약 완전 불일치) 은 TM 자가 fix commit 으로 해소. PR #134~144 회고 가드 (BE record 1:1, 한국어, UUID 비공개, Role 풀네임, @MockBean LENIENT, AbstractPostgresIT) 모두 준수.
