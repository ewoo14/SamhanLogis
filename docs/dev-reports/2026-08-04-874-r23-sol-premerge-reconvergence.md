# PR #1057 R23 SOL 머지 전 재수렴

- 일시: 2026-08-04
- 범위: R21·R22 (`SlipDetailPage` 상태별 액션 매핑, lifecycle contract, inspect/complete API 계약)
- 판정 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 제외: 시나리오 2~5, 이슈 #1064·#1065 자체, 검증 품질, 미배포 런타임

## 기준점

- `git pull`: `Already up to date.`
- 사용자 제공 CI: 42/42 green

## 조사 기록

### 각도 1 — R21·R22 화면 액션과 도메인 전이 대조

- HEAD: `e9898181b`; R21 `0a5c71766`, R22 `2028f9fc8`; R22 이후 제품 코드 커밋 없음(`67efda908`, `e9898181b`는 QA 문서).
- 화면 원문: `PROCESSING -> ['complete']`, `INSPECTING -> ['inspect']`.
- 도메인 원문: `Slip.complete()`는 `requireStatus(PROCESSING)` 후 `INSPECTING`; `Slip.inspect(...)`는 `requireStatus(INSPECTING)` 후 `COMPLETED`.
- 상태 열거 원문: `PROCESSING("처리중")`, `INSPECTING("검수중")`, `COMPLETED("처리완료")`; 주석도 `PROCESSING → INSPECTING → COMPLETED`.
- 중간 판정: R21·R22 두 매핑은 실제 도메인 전이와 일치한다. 유형별 화면 진입·`mode` 결합은 별도 대조한다.

### 각도 2 — 전표 유형·누락 상태/분기 대조

- 지원 전표 유형 원문: `SlipType`은 `OUTBOUND`, `INBOUND` 2종뿐이다. 재고 이관은 `/transfers/:id`의 `TransferDetailPage` 및 별도 transfer 상태 머신이며 `SlipDetailPage`를 사용하지 않는다.
- 라우트 원문: `/sales/:id`는 `mode="OUTBOUND"`, `/purchases/:id`는 `mode="INBOUND"`; 공통 단계의 `complete`/`inspect`는 동일 endpoint이고 `COMPLETED` 이후만 OUTBOUND=`ship`, INBOUND=`confirm`으로 분기한다.
- 종결 상태 원문: `REJECTED`, `CANCELED`, `CONFIRMED`는 `actionsForStatus` default `[]`; 도메인에도 재전송 전이가 없다. 반려 후 재전송 경로는 실제 상태 머신에 존재하지 않는다.
- 누락 분기 원문: 도메인 `Slip.reject()`는 `SENT`, `ACCEPTED`, **`INSPECTING`**에서 허용하며 `SlipDomainTest.reject_fromInspecting_isAllowed`가 이를 고정한다. 그러나 화면 `actionsForStatus('INSPECTING')`는 `['inspect']`만 반환한다. 반려 입력/버튼은 `possibleActions.includes('reject')`일 때만 렌더되므로 INSPECTING 실사용자는 반려를 수행할 수 없다.
- 결함 후보 A: INSPECTING 검수 반려 사용자 경로 누락. OUTBOUND·INBOUND 공통이며, 권한 보유자도 상세 화면에서 반려 UI가 전혀 나타나지 않는다.

### 각도 3 — 사용자 라벨과 클릭 시 실제 업무 효과

- 모바일 원문: PROCESSING의 primary action은 `검수 시작` 한 줄이며 클릭 즉시 `/complete`를 호출한다. 데스크톱은 `완료 (검수 시작)`이다.
- 상태 전이 원문: `/complete`는 `PROCESSING → INSPECTING`이므로 결과 상태 관점에서 `검수 시작`과 일치한다.
- 업무 효과 원문: 같은 호출에서 OUTBOUND batch는 예약 재고 `deduct(..., true)`, serial은 `shipInstances(...)`; INBOUND는 `inventoryClient.inbound(...)`/회수 입고를 수행한다. 서비스 테스트도 `complete_outbound_callsInventoryDeduct_fromReservationTrue`, `complete_inbound_callsInventoryInbound`로 고정한다.
- 중간 판정: 상태명은 맞지만 모바일의 단독 라벨 `검수 시작`은 실제로 출고 차감/입고 반영까지 확정하는 동작임을 알리지 않는다. R21이 이 라벨을 유지한 채 실제 `/complete`에 연결했으므로, 사용자가 검수 착수만으로 이해하고 재고 확정 동작을 실행할 수 있는 업무 의미 불일치가 있다.

### 각도 4 — DB 읽기 영향 수(로컬 DB 스냅샷)

- 읽기 전용 집계: active `INSPECTING` 8건(INBOUND 2, OUTBOUND 6), active `PROCESSING` 12건(INBOUND 5, OUTBOUND 7).
- 증거 무결성 구분: `created_by/requester_id = system` 기준으로 INSPECTING 8건 중 NON_SYSTEM 1건(OUTBOUND), PROCESSING 12건 중 NON_SYSTEM 1건(OUTBOUND)이다. 나머지는 system seed 성격이므로 실사용 데이터 건수로 부풀리지 않는다.
- 결함 후보 A의 현재 로컬 실사용 계열 영향: NON_SYSTEM INSPECTING 1건; 코드 표면 영향은 INBOUND·OUTBOUND 2유형의 모든 INSPECTING 전표.
- 라벨 불일치의 현재 로컬 실사용 계열 영향: NON_SYSTEM PROCESSING 1건; 코드 표면 영향은 INBOUND·OUTBOUND 2유형의 모든 PROCESSING 전표.

### 각도 5 — 라이브 8·9·10차 원인 분리

- 8차 원문: PROCESSING에서 `POST /complete`가 200, 상태 `INSPECTING`으로 전환 성공. R21 매핑이 실제 사용자 경로로 재현된다.
- 9차 원문: INSPECTING 버튼 클릭이 `/inspect`까지 도달한 뒤 `출고 검수 권한이 없습니다 — 검수자 결재자(그룹/개인)만 처리할 수 있습니다`. 이는 R22 endpoint 매핑이 적용되었고 이후 결재선 gate에서 차단된 증거다.
- 10차 김기철 disabled·김은지 상세 조회 실패는 프런트 `canAccess`/조회 권한 표면이며 `/inspect` 대신 다른 endpoint를 호출한 증거가 없다. 따라서 매핑 원인이 아니다. 이슈 #1065 범위로 유지하며 본 PR 결함으로 재보고하지 않는다.
- 실행 확인 제한: 현재 런타임은 다른 트랙(#1061) 빌드이므로 새 라이브 실행은 판정 근거로 사용하지 않았다. R21/R22 배포 반영 후 추가 실행이 필요한 부분은 배포 미반영으로 미판정한다.

### 각도 6 — fresh 좁은 검증

- Desktop: `npm exec vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts` → `Test Files 1 passed`, `Tests 3 passed`.
- Domain/service: `:services:slip-service:test`에서 `SlipDomainTest`, `SlipServiceTest`만 `--rerun-tasks`로 실행 → `BUILD SUCCESSFUL`, `18 actionable tasks: 18 executed`.
- 이 결과는 R21/R22의 두 endpoint 매핑과 도메인 전이를 확인한다. 아래 결함은 그 매핑 성공 여부와 별개로 실제 상태 머신/업무 효과를 화면이 빠뜨리거나 축약한 제품 표면이다.

## 결함 판정

### 결함 1

① 한 줄 요약: `INSPECTING`에서 도메인이 허용하는 검수 반려(`/reject`)를 `SlipDetailPage`가 OUTBOUND·INBOUND 모두 숨겨 실사용자가 반려할 수 없다.

② 실 사용자 재현 절차:

1. `slip.reject UPDATE`와 해당 전표 조회 권한이 있는 계정으로 로그인한다.
2. 상태가 `INSPECTING`인 매출 또는 매입 전표 상세를 연다.
3. 모바일 더보기와 데스크톱 하단을 확인한다.
4. `처리 완료`만 있고 `반려` 버튼 및 반려 사유 입력 영역이 없는 것을 확인한다.

③ 관측 원문:

```text
SlipDetailPage: case 'INSPECTING': return ['inspect']
SlipDetailPage: {possibleActions.includes('reject') ? (...) : null}
Slip.reject(): SENT || ACCEPTED || INSPECTING 이외는 CONFLICT
SlipDomainTest: reject_fromInspecting_isAllowed
```

④ 영향 건수: 코드 표면 2유형(OUTBOUND·INBOUND)의 모든 INSPECTING 전표. 로컬 active 8건(INBOUND 2, OUTBOUND 6)이며, 증거 무결성상 NON_SYSTEM은 OUTBOUND 1건이다.

### 결함 2

① 한 줄 요약: 모바일 PROCESSING 주동작이 `검수 시작`으로만 표시되지만 실제 `/complete`는 출고 재고 차감/시리얼 출고 또는 입고 재고 반영까지 확정한다.

② 실 사용자 재현 절차:

1. 모바일 폭에서 `slip.transfer.process UPDATE` 권한 계정으로 PROCESSING 매출 또는 매입 전표 상세를 연다.
2. primary action이 `검수 시작`으로만 표시되는 것을 확인한다.
3. 버튼을 누르면 `POST /slips/{id}/complete`가 호출되고 상태가 INSPECTING으로 바뀐다.
4. OUTBOUND는 예약 재고 차감/시리얼 출고, INBOUND는 입고 재고 반영이 같은 호출에서 수행된다.

③ 관측 원문:

```text
mobilePrimaryAction.label = transitionActionLabel(...)  // "검수 시작"
mobile-action-primary = {mobilePrimaryAction.label}
SlipService.complete(): OUTBOUND deduct(..., true) / shipInstances(...)
SlipService.complete(): INBOUND inventoryClient.inbound(...)
SlipServiceTest: complete_outbound_callsInventoryDeduct_fromReservationTrue
SlipServiceTest: complete_inbound_callsInventoryInbound
```

④ 영향 건수: 코드 표면 2유형의 모든 PROCESSING 전표. 로컬 active 12건(INBOUND 5, OUTBOUND 7)이며, 증거 무결성상 NON_SYSTEM은 OUTBOUND 1건이다. 현재 런타임은 #1061 빌드이므로 R21 반영 모바일 실측은 **배포 미반영으로 미판정**이다.

## 결론

- R21·R22 endpoint 매핑 자체가 다른 전표 유형을 깨는 증거는 없다. 지원 유형은 OUTBOUND·INBOUND뿐이고 이관은 별도 화면/상태 머신이다.
- CANCELED·REJECTED·CONFIRMED 이후 재전송/재전이는 실제 상태 머신에도 없다.
- 9차 권한 원문과 10차 두 계정 문제는 `/inspect` 매핑 이후의 권한/조회 차단이며 매핑 원인이 아니다. #1065로 유지한다.
- 머지 가능 여부: **실 사용자 재현 가능 결함 2건이 있어 현 HEAD의 즉시 머지는 불가**.
