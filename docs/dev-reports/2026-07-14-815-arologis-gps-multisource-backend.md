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

## 검증

_(테스트·라이브 QA — 리뷰 라운드에서 채움)_

## 리뷰 이력

- **Codex 개발**: `codex exec`(effort high) 구현 → **MCP Codex 인수·독립검증**(genuine 1건 fix: InsungLbsPanel 하드코딩 priority가 BE config 순서 무시 → 서버 순서 보존 + active/stale 60s 경계·null·latest-per-source·Insung 회귀 테스트 + MANUAL 권한 UPDATE WebMvc 가드 IT 보강). BE `--rerun-tasks --no-build-cache` BUILD SUCCESSFUL·FE typecheck+터치 4파일 17 tests pass.
- _(Opus 5-agent ↔ Codex 5-agent 적대 — 진행 예정)_
