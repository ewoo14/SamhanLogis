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

---

# #2 2-pane 배차 보드 고도화 (PR #471)

## 구현 (Codex)
좌 미배차 전표 풀 ↔ 우 차량 캡슐 2-pane. 전표 드래그/전표번호 입력 그룹핑·중복 붉은표시·차종 가시·상태색·체크박스 **선택 전송(그룹 단위 발송상태 추적)**.

- **그룹 단위 발송상태**(`DispatchVehicleGroupDispatchStatus` PENDING/DISPATCHED, V42): 선택 전송 = PENDING 그룹만 arologis 발송 → markDispatched. 전 그룹 DISPATCHED 시에만 task DISPATCHING. confirm 은 DISPATCHED 그룹 sequence 만 수락. **미배차/가배차 균일**(개발책임자 결정).
- **차종/톤수 축소**(active subset): 승용차·축차·추레라 + 1.2·14·18·25톤 선택지 제외 → 차종9/톤수6. enum 값 유지·matrix/FE/validate 만 제한(마이그 불요). 부수효과로 14·18·25톤 lossy 대부분 해소.

## 다모델 리뷰 3라운드 (각 QA agent + Docker 실QA 스크린샷, 각 별도 게시)
- **Opus 5-agent**(P1 0, FE/UX CLEAN): BE 정합 P1(선택전송 task 전체 전이→미선택 그룹 좌초) → 그룹 단위 추적 도입. QA: active subset(차종9/톤수6) + 캡슐(미발송 배지·전표번호·체크박스).
- **Codex 5-agent**(P1 5): 발송그룹 전표변경 BE 가드 누락(false-green)·cross-task race·unavailable 비대칭·FE optimistic slipNo 누락·MODIFICATION redispatch. QA: today-draft 재사용(F5 동일 taskCode).
- **Fable5 5-agent**(P1 2, Codex 와 수렴): DISPATCHED 그룹 drop 무방비·mount-creates-new-task 교착. QA: active subset 라이브.

## P1 수렴 fix (`6b8fd514`)
- **DispatchTaskService**: assignSlip/reorderSlips/removeSlipFromGroup 에 `isDispatchPending()` else CONFLICT 가드(FE/mock 계약 BE 누락 false-green 해소). assignSlip cross-task advisory xact lock. `findOrCreateTodayDraft`(오늘 최신 DRAFT 재사용 → F5 교착 해소).
- **DispatchTaskCompletionService**: 선택전송 mixed selection CONFLICT. **DispatchTaskUnavailableService**: confirm 대칭 DRAFT 허용. **Controller**: POST /today-draft. **Repository**: findFirst…DispatchDateAndStatus…CreatedAtDesc.
- **DispatchEndToEndIT**: confirm/unavailable 실 dispatch 경로(CI red 해소) + 음성 IT(3가드·today-draft 멱등성).
- **FE**: assignSlip optimistic 제거→invalidate-only(실 응답 slipNo 누락 해소). DispatchBoardPage ensureTodayDraft + drag 발송그룹 가드. VehicleGroupCard droppable disabled. mock today-draft + mixed 거부.

## 🚩 개발책임자 결정 (PR 결정 기록 누적)
- 선택 전송 = 그룹 단위 발송상태 추적("제대로"). 그룹 단위 발송 = 미배차/가배차 균일.
- 차종/톤수 축소: 승용차·축차·추레라·1.2·14·18·25톤 제외(미배차·가배차 모두).

## 후속(#3 수정제안 영역, 미배선이라 회귀 아님)
- `markBackToDraftForRedispatch`(MODIFICATION_ACCEPTED→DRAFT) 가 #3 에서 배선될 때 **그룹 dispatchStatus PENDING 리셋** 동반 의무. arologis multi-dispatch-id 정밀 전이는 별도 트랙.

## QA (라이브 실서버, mock OFF, 재빌드 slip V42, dev_master)
- docs/qa/dispatch-board-2pane/add-vehicle-active-subset.png·board-capsule.png (Opus 라운드).
- codex-round-today-draft-reuse.png (F5 reload 동일 taskCode=교착 해소 실증), fable5-round-active-subset.png (Fable5 라운드).
- slip-service compileJava+compileTestJava·desktop typecheck·dispatch-board mock 2 passed·라이브 fixes-real-qa 2 passed. slip-it-core IT CI Linux green.
