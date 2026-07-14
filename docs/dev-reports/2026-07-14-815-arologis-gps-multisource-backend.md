# #815 — arologis 배차 상세 GPS 멀티소스 백엔드 노출 (FE-2)

- **일자**: 2026-07-14
- **PR**: #815 (feat/815-arologis-gps-multisource-backend)
- **연관**: #804(배차 상세 계약 정합·gpsSources 이연분) · spec `docs/specs/815-arologis-gps-multisource-backend-spec.md`
- **상태**: 구현 진행 중 (조기 PR 시드)

## 목표

`DispatchDetailResponse.VehicleDetail.gpsSources`를 실데이터로 채워 배차 상세 GPS 패널(`InsungLbsPanel`)을 원복한다. #804에서 FE 패널은 완성됐으나 BE 데이터 미구현으로 dead-path 게이팅(`gpsSources.length>0`) 상태였다.

## 개발책임자 결정 (2026-07-14 확정)

1. **Insung LBS = 배송시각 스냅샷 노출**: `signatures`(source=EXTERNAL_INSUNG_LBS)의 배송완료 좌표를 GPS 소스로 노출. 라벨 "인성 LBS", 배송시각이라 대개 stale, 좌표 null이면 미노출. active는 실시간 APP_GPS 우선.
2. **MANUAL = 관리자 수동입력 신설**: 관리자가 차량 위치를 수동 보정 입력하는 기능(BE 엔드포인트 + FE 폼)을 이번 슬라이스에 신설. `driver_locations`에 source=MANUAL로 적재.
3. **MANUAL FE UI 범위 = 이번 슬라이스 포함** (착수 시 재확인 결정): arologis-desktop 배차 상세 GPS 패널에 관리자 수동 위치 입력 폼 포함.

## 설계 정정 (착수 시 코드 실측 기반)

- **MANUAL 엔드포인트 라우팅**: spec 초안의 `POST /admin/arologis/vehicles/{vehicleId}/manual-location`은 **UUID 비공개 정책 위배**(FE엔 vehicleId UUID 없음·행 식별=sequence) → 기존 `assign-driver`/`stops/status` 패턴과 동일하게 **`POST /admin/arologis/dispatches/{id}/vehicles/{seq}/manual-location`**로 확정. `vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, seq)`로 해석.

## 구현

### BE (arologis-service)
- **`dto/GpsSource.java`** (신규 record): `source`(DriverLocationSource·FE GpsSourceKey 1:1)·`latitude`/`longitude`(BigDecimal nullable)·`lastReceivedAt`(LocalDateTime)·`active`(boolean). `inactive()`/`withActive()` 팩토리.
- **`dto/DispatchDetailResponse.java`**: `VehicleDetail.gpsSources` 추가. `from(...)`에 `Map<UUID,List<GpsSource>> gpsByVehicleId` 주입(기본 empty).
- **`service/GpsSourceAssembler.java`** (신규 @Service): `assemble(vehicles, stops)` → `Map<UUID,List<GpsSource>>`. driver_locations(APP_GPS_ACTIVE/BACKGROUND/MANUAL) + signatures(EXTERNAL_INSUNG_LBS) **source-family별 1회 배치조회(N+1 없음)**. latest-per-(driver,source)=desc+putIfAbsent. Insung=stop→vehicle 매핑·null좌표 제외. 우선순위 토큰 확장(`app-gps`→ACTIVE+BACKGROUND). active=config priority 순 중 stale(60s) 미초과 최상위 1건. Clock 주입(결정적 테스트).
- **repo read**: `DriverLocationRepository.findAllByDriverIdInAndSourceInOrderByCapturedAtDesc` · `SignatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc` (DDL 무변경·인덱스 기존재).
- **MANUAL 엔드포인트**: `POST /admin/arologis/dispatches/{id}/vehicles/{seq}/manual-location`(@RequirePermission DISPATCH_ADMIN UPDATE) → `DispatchService.recordManualLocation`(vehicle 해석 404·미배정 기사 400·`DriverLocation.of(driverId,lat,lng,now(),MANUAL)` 적재). `dto/ManualLocationRequest`(@NotNull·@DecimalMin/Max 범위). 응답 UUID 미노출.
- **조립 배선**: `ArologisAdminController.findById`가 assembler 호출 → `DispatchDetailResponse.from` 주입.

### FE (arologis-desktop)
- **`api/arologisDispatchDetail.ts`**: `RawGpsSource` + gpsSources 매핑 + `recordManualLocation(dispatchCode,seq,lat,lng)` POST.
- **`DispatchDetailPage.tsx`**: GPS 패널 게이트 원복(`(ASSIGNED||DELIVERED)&&driverCode`·`length>0` 제거→empty는 "위치 정보 없음") + `onDataChanged` refetch 스레딩 + `ManualLocationForm` 렌더.
- **`routes/index.tsx`**: `loadDetail` useCallback → `onDataChanged` 전달.
- **`components/ManualLocationForm.tsx`** (신규): lat/lng 입력·범위검증·POST·저장 후 refetch.
- **`components/InsungLbsPanel.tsx`**: 하드코딩 priority 재정렬 제거 → **BE config priority 순서 그대로 렌더**(rank=index+1). BE=우선순위 단일 진실원.
- **`api/mock.ts`**: mock 상세에 gpsSources + manual-location POST mock.

## DDL 변경 (착수 시 spec 대비 추가)

- **V23 마이그레이션 신규**: `ix_driver_locations_driver_source_captured (driver_id, source, captured_at DESC)`. spec 초안은 "DDL 변경 없음"이었으나, R1 DevOps 리뷰가 `DISTINCT ON (driver_id, source)` 조회 패턴을 기존 `(driver_id, captured_at)` 인덱스가 커버 못함을 포착 → 복합 인덱스 추가. `CREATE INDEX IF NOT EXISTS` 멱등.

## 검증

- **BE**: `./gradlew :services:arologis-service:test --rerun-tasks --no-build-cache` → **561 tests·0 fail·0 skip** (Testcontainers Postgres IT 11 컨텍스트 로드·V23 마이그레이션 적용 실행). 신규 `GpsSourceAssemblerTest`(60s 경계·null·future-skew·all-stale·priority 확장·MANUAL·latest-per-source·Insung multi-stop dedup)·`DispatchServiceTest`(recordManualLocation 404/400/success captor)·`ArologisAdminControllerIT`(gpsSources jsonPath·manual-location write-then-read·404·400)·`DispatchDetailResponseTest`·`ArologisPermissionControllerIT`(manual-location UPDATE 권한).
- **FE**: `npm run typecheck` clean · `npx vitest run` **9 파일 49 tests·0 fail** (packaging-invariants 6·InsungLbsPanel 3·ManualLocationForm 4·DispatchDetailPage 5·arologisDispatchDetail 6 등).
- **라이브 QA** (Docker 실서버 :8097 재배포·V23 적용·mock OFF·admin AROLOGIS_MASTER·투명 QA 시드→캡처→즉시 정리):
  - **BE API 실증**: GET 배차 상세 → gpsSources = 인성LBS(active=false·30분 stale)·APP_GPS_ACTIVE(**active=true**·10초 fresh)·APP_GPS_BACKGROUND(false·5분 stale) — 개발책임자 결정(Insung 스냅샷 stale→실시간 APP_GPS active) 실증. POST manual-location 200→재조회 MANUAL 등장·범위초과 400·없는차량 404.
  - **실 GUI 스샷** (`docs/qa/815-arologis-gps-multisource/`): `[1]인성LBS ⚠오래됨·[2]앱GPS(활성)●active·[3]앱GPS(백그라운드)⚠오래됨` 고정 순위번호 + 활성 소스 요약 + DS Input/Button 수동입력 폼 → 저장 → **`[4]수동입력` 등장 + "저장됨" + 페이지 blank 없이 in-place 갱신**(stale-while-revalidate).

## 리뷰 이력 (표준 캐논 듀얼)

- **Codex 개발**: `codex exec`(effort high) 구현 → **MCP Codex 인수·독립검증**(개발책임자 지시로 MCP 전환).
- **R1 Opus 5-agent**(FE/BE/Design/DevOps/QA·실행=게시 1:1): genuine 다수 포착 →
  - 🔴 **Design: InsungLbsPanel rank 회귀** — MCP Codex 가 하드코딩 priority 제거·`index+1` 도입한 것이 디자인 spec 고정 순위번호(인성=1~수동=4) 위배 → **origin/main 원복**(MCP Codex 과잉수정 되돌림). *(FE 에이전트는 "OK"로 판정했으나 Design 이 spec 대조로 포착 — 다중 렌즈 가치.)*
  - 🔴 **Design: ManualLocationForm 하드롤** → `@samhan/design-system` Input/Button refactor(focus-visible·aria-invalid·per-field error·loading·"저장됨"·용어 "수동 입력").
  - 🔴 **Design+FE: 저장 시 전체 페이지 blank** + **stale-response 취소가드 상실** → route wrapper `loadDetail(isRefresh)` stale-while-revalidate + `activeCodeRef` 가드.
  - 🔴 **DevOps: driver_locations 무한정 조회** → `DISTINCT ON` 네이티브 쿼리 + V23 인덱스.
  - 🔴 **FE: mock.ts regex 형제 endpoint 잠식**(pre-classify/unassigned/regional/history) → reserved 제외.
  - 🟡 **BE: isStale 미래 타임스탬프 영구 fresh** → `deltaMs<0` stale · Clock 주입 · recordManualLocation 단위/IT 커버.
  - → fix(Opus 서브에이전트)+게시. 양측 green 재검증.
- **R2 Codex 적대검증**(mcp__codex__codex): genuine 2 → fix — manual-location 응답 dispatchId UUID 제거(sequence/source만·mock parity·IT 미노출 검증) · route wrapper `requestSeqRef`(같은 dispatchCode 연속 refresh 겹침 가드).
- **R3 Opus 재수렴**(BE/FE 독립 재검·Design/DevOps/QA no-delta disposition): BE 0 · FE **genuine 1**(refetch **stale-closure 하이재킹** — save 후 네비 중 POST 늦은 resolve 시 옛 dispatchCode 로 가드 하이재킹) → fix `latestDispatchCodeRef`(렌더마다 갱신·현재 dispatchCode 참조).
- **R4 Codex terminal**: 전 5차원 clean·R3 fix sound·무변경 → **0 blocking**.
- **R5 Opus terminal**(FE): R3 fix 6케이스 전수 추적·typecheck/eslint/49 tests green → **0 blocking**.
- **→ 양측 0수렴** (R1 Opus6 → R2 Codex2 → R3 Opus1 → R4 Codex0 → R5 Opus0). PM 종합 9-게이트·CI 10/10 green.
- *비차단 P3(후속)*: `routes/index.tsx` 전용 async 레이스 회귀 테스트 부재(정적 추적+49 green 안전 확인·fake-timer 테스트 후속 권장).
