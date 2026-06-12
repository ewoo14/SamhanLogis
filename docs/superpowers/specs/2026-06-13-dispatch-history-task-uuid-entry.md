# SPEC — 배차현황 진입 key task-UUID 통일 + 모바일 dispatch 계약 정렬 (dispatch-integration 후속 #1)

> 2026-06-13. 배차 #3(PR #472) **deferred 후속 1차**. dev-report `2026-06-12-dispatch-modification-redispatch.md` "알려진 한계" + Round F 비차단 관찰 2건 해소. 큰 #4(§7 전역 협업)는 개발책임자 스코핑 대기 — 본 슬라이스는 #3 실한계 정리(scoped).

## 0. 배경 (#3 에서 박제된 한계)
1. **배차현황 상세 진입 key = arologisDispatchId** → ① 재배차 직후(`start-redispatch` 가 `arologisDispatchId=null`) 그 key 로 상세 refetch 시 **404** (현재 react-query 병합으로 화면은 정합하나 직접 진입 불가) ② **수동-only 완료 task**(타사 수동 발송완료, arologis 미경유 → arologisDispatchId 없음)는 `DispatchHistoryPage` 행클릭 가드에 막혀 **상세 열람 불가**.
2. **모바일 dispatch BE 계약 부패**(pre-existing): 모바일 `DispatchTaskResponse` TS 인터페이스가 풀 계약 가정인데 BE 는 일부 endpoint 슬림(vehicleGroups/matchedDrivers 미포함) 반환 → 실 BE 진입 시 `task.vehicleGroups.length` 류 크래시 소지. #3 Round D 가 `matchedByGroup` 한 지점만 옵셔널체이닝.

## 1. 범위 (IN)
### 1-1. 배차현황 상세 진입 = task UUID 통일
- **BE**: 배차현황 summary 응답(`DispatchTaskSummaryResponse`)에 **task UUID(id)** 노출(이미 있으면 확인만). detail 조회 endpoint 는 task UUID resolve 지원 확인(리뷰서 "task UUID or arologisDispatchId resolve" — 확정). arologisDispatchId 의존 제거.
- **FE 데스크톱**: `DispatchHistoryPage` 행클릭 + react-query key 를 **task UUID** 로 전환 → ① 재배차 직후·② 수동-only 완료 task 모두 상세 정상 진입. **UUID 비공개 가드**: task UUID 는 row-click·query key 내부용만(화면 노출 금지 — 보드가 `task.id` 쓰는 패턴 동일, [[uuid-no-user-visibility]]). 모든 dispatch mutation invalidate 가 task UUID key 로 일관 → 재배차 직후 stale/404 해소(병합 의존 축소).
- 수동-only 완료 task 가 배차현황 목록·상세에 정상 노출(행클릭 가드 완화).

### 1-2. 모바일 dispatch 계약 정렬
- 모바일 `clients/mobile-staff/src/api/dispatchBoard.ts` `DispatchTaskResponse` 타입을 BE 실 계약과 정렬(슬림 응답 케이스 nullable/optional 정확) + 소비처(`DispatchBoardScreen`)의 `task.vehicleGroups`/`matchedDrivers` 접근 전수 옵셔널/가드. 크래시 소지 제거.

### 1-3. 테스트
- BE: 배차현황 summary task UUID 노출 + detail by-task-UUID resolve IT. 수동-only 완료 task(arologisDispatchId=null) 목록·상세 노출 IT.
- FE: 데스크톱 배차현황 행클릭(task UUID) — 재배차 후·수동-only 케이스 mock 스펙. 모바일 typecheck + 슬림 응답 가드.

## 2. 범위 밖 (DEFER)
- **그룹별/batch별 dispatch-id 정밀화**(D-DMR-04) + **matchAndNotify AFTER_COMMIT**(D-DMR-05) = arologis async 아키텍처 → 별도 dispatch-integration 슬라이스(개발책임자 스코핑).
- §7 전역 협업 플랫폼(#4) = 별도.

## 3. 컨벤션 가드
BaseEntity·Soft Delete·도메인 메서드 체인·한국어 Javadoc·**UUID 비공개(task UUID 내부 key 한정)**·번호 YYYY/MM/DD-N. 게이트웨이 no-strip 라우트 기성 커버 확인. 변경 모듈 전체 suite 완주.

## 4. 워크플로우
다모델: Opus 계획+조기 PR → Codex 개발 → 개발사항 PR 게시 → Opus·Codex·Fable5 리뷰(각 모델 자기 라운드 직접 fix) → 다음 리뷰어 0 오류 → 머지. ([[temp-multimodel-workflow]] 정정판)
