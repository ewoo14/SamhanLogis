# Dev Report — 배차 보드 에픽 E1: 2축 차량 모델 (PR #470) · 2026-06-12

> 개발책임자 결정 #1 (4대 결정 중 1번, "1,2,3,4 순서대로 진행"). spec: `docs/superpowers/specs/2026-06-11-dispatch-board-enhancement-spec.md` §1.

## 구현 (Codex)
slip `DispatchVehicleGroup.vehicleType`(단일 9-enum, 종류+톤수 혼합)을 **차종+톤수 2축**으로 확장. **additive** — legacy `vehicleType` 컬럼을 (차종,톤수)→nearest 파생으로 유지해 arologis 송수신 와이어 무변경(개발책임자 확정).

- **차종(12)**: 오토바이·승용차·다마스·라보·카고·윙바디·탑차·리프트·냉장냉동탑·무진동·축차·추레라 (`DispatchVehicleBodyType`).
- **톤수(10)**: 1·1.2·1.4·2.5·3.5·5·11·14·18·25톤 (`DispatchTonnage`).
- **동적 종속**(`DispatchVehicleTypeMatrix`): 소형 4종=톤수 불요(null), 화물 8종=10톤수 전체. 단일 static 맵(부분집합 조정 용이). 기본값 카고/1톤.
- V41 마이그레이션: 컬럼 추가 + 기존 9값 backfill + NOT NULL + 축별 CHECK + 차종↔톤수 조합 CHECK.
- DTO 신 필드(+한글 display), FE AddVehicleModal 차종→유효 톤수 동적(소형 숨김)·stale reset, VehicleGroupCard/Column 라벨, mock 핸들러.

## 다모델 리뷰 3라운드 (각 QA agent + Docker 실QA 스크린샷)
- **Opus 5-agent**(P1 0): spec 정합·BE/마이그·FE matrix↔BE CLEAN. P2 3(matrix 위반 500→400·add-group mock·FE 런타임 spec) fix. QA: 차종 카고→톤수 10 동적.
- **Codex 5-agent**(P1 1): **arologis lossy(T_14→TONNAGE_10) 발송 정확도** — 개발책임자 결정 "lossy 유지". QA: 소형→톤수 숨김.
- **Fable5 5-agent**(P1 1): Opus fix 가 노출한 **view-only 보드 mount auto-create 403 회귀**(CI 적색) → DispatchBoardPage 읽기전용 정렬 + spec 갱신 fix. QA: 보드 정상 렌더.

## 🚩 개발책임자 확정 결정
- **#1 additive(arologis 무변경)**: legacy vehicleType 파생 유지. ([[item-exposure-and-menu-5cat]] 배차 보드 에픽)
- **arologis lossy 유지**: 신 톤수(1.2/3.5/11/14/18 등)는 nearest legacy 로 손실 발송(14톤→10톤). 실 인성퀵 벤더 연동 시 톤수 정확도 손실 — **풀해상도는 arologis VehicleTonnage 확장(후속 슬라이스)**. 현재 MockDriverMatcher 라 미발현.

## QA (라이브 실서버, mock OFF, 재빌드 slip V41)
- docs/qa/dispatch-2axis-vehicle/add-vehicle-2axis.png — 차종 카고 → 톤수 10종 동적 노출.
- add-vehicle-2axis-small.png — 소형(오토바이) → 톤수 숨김.
- dispatch-board-page.png — view-only fix 후 보드 정상 렌더.
- (view-only 읽기전용 자체는 시드 view-only 계정 부재로 Playwright mock 23 passed 커버.)

## 다음 (배차 보드 에픽 잔여)
- **#2 2-pane 배차 보드**(가배차리스트 좌우분할 — 좌 전표 풀, 우 차량 캡슐 드래그/전표번호 그룹핑·중복 붉은표시·차종 가시·상태색).
- #3 수정제안 mutation + 수동기입 정책. #4 §7 전역 협업. (개발책임자 "1,2,3,4 순서대로 진행".)
- E2 체크박스 일괄전송 / E3 수정이력 / E4 취소연동 / E5 실시간 / E6 전표 모달.

원칙: [[codex-implements-claude-reviews]]·[[temp-multimodel-workflow]](각 라운드 QA 스크린샷)·[[enum-expansion-check-constraint]]·[[no-fake-data-ever]]·[[review-posting-and-zero-skip]](Opus·Codex·Fable5 각 별도 게시).
