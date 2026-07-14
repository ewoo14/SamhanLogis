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

## 구현 (작성 예정)

_(구현 완료 시 채움)_

## 검증 (작성 예정)

_(테스트·라이브 QA 완료 시 채움)_

## 리뷰 이력 (작성 예정)

_(캐논 듀얼 라운드 완료 시 채움)_
