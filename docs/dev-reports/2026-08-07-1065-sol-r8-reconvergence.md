# PR #1066 (Issue #1065) SOL 5.6 R8 재수렴

- 검증 HEAD: `6119128c37cf19bd8dc43b1b5bdabc6d1d881f96`
- 검증 시각: 2026-08-07 KST
- 범위: 실 사용자 경로의 도달성만. 검증 품질은 증거 무결성 예외 외 조사·판정하지 않았다.
- 변경 금지 준수: 제품 코드, git index, DB, 라이브 컨테이너를 변경하지 않았다. 라이브 측정은 GET만 사용했다.

## 판정

**도달 결함 1건. R8은 아직 재수렴하지 않았다.**

- D2가 허용 대상인 결재선 개인의 상세 진입은 열었다. 라이브 현재값에서 ACCOUNTANT 결재선 개인 1명은 `OUTBOUND × INSPECTING` 6건 모두 상세 GET 200, `canInspect=true`였다.
- 그러나 `/sales/:id`의 정적 가드를 전부 제거해 **전표별 자격이 없는 인증 사용자도 라우트에 진입**한다. 서버 403 뒤 `전표를 불러오지 못했습니다.`가 표시된다. 이는 보안 우회가 아니라, 기존 가드가 명시한 “권한 없는 직접 URL은 홈으로 전환하고 403을 사용자에게 노출하지 않는다”는 도달 UX의 회귀다.
- D1이 정당한 OUTBOUND 검수자를 닫는 현재 사용자 경로는 찾지 못했다. INBOUND 및 `inspect` 이외 액션 회귀도 찾지 못했다.
- 개발책임자가 다음 라운드 반영으로 확정한 `COMPLETED → ship → deliver → confirm`은 판정에서 제외했다.

## 원문 기준

Issue #1065 원문은 의도된 결재선 개인의 두 차단을 다음처럼 적었다.

> `kimgicheol   검수 완료 버튼이 disabled`
>
> `kimeunji     전표 상세에서 "전표를 불러오지 못했습니다"`

그리고 영향은 다음과 같다.

> `실 사용자 중 누구도 출고 전표를 검수할 수 없습니다.`
>
> `INSPECTING → COMPLETED 가 결재선의 어느 계정으로도 진행되지 않습니다.`

R8 전의 개발책임자 결정 원문은 범위를 전역 역할이 아닌 전표별 자격으로 제한했다.

> `결재선 지정 = 그 전표·그 액션 권한 자동 부여`
>
> `ACCOUNTANT kimeunji   해당 전표 상세 조회 200 (다른 OUTBOUND 전표는 여전히 403)`
>
> `전역 권한 부여가 아니라 그 전표 범위로 한정합니다.`

프런트 가드 자체의 원문도 거부 UX를 명시한다.

> `권한 없음 → 홈 redirect (사이드바에도 없으므로 404 동일 효과)`
>
> `메뉴·목록·상세가 모두 같은 유형 판정을 소비해야 403을 사용자에게 노출하지 않는다.`

따라서 “결재선 후보를 서버까지 보내야 한다”와 “모든 인증 사용자를 서버 403 화면까지 보낸다”는 같은 요구가 아니다. R8은 전자를 달성하면서 후자의 불변식을 제거했다.

## 도달 결함 D-R8-1 — 비결재자도 `/sales/:id` 오류 화면까지 열린다

### 실 사용자 도달 경로

1. OUTBOUND 정적 조회 자격이 없고 해당 전표의 `OUTBOUND_INSPECT` 결재선에도 없는 인증 사용자가 공유 링크, 브라우저 이력 또는 직접 URL `/#/sales/{id}`를 연다.
2. `routes/index.tsx:565`의 `/sales/:id`는 더 이상 `PermissionGuard`를 사용하지 않는다.
3. `SlipReadGuard`는 `allowApprovalLineCandidate=true`이면 OUTBOUND의 `hasReadAccess=false`도 통과시킨다(`PermissionGuard.tsx:79-96`). 이 단계에서는 실제 결재선 후보인지 확인하지 않는다.
4. `SlipDetailPage`가 `GET /slips/{id}`를 호출한다(`SlipDetailPage.tsx:1574-1577`).
5. 서버는 비결재자에게 403을 반환한다. 이는 올바른 서버 강제다.
6. 화면은 상태코드를 구분하지 않고 `전표를 불러오지 못했습니다.`를 렌더한다(`SlipDetailPage.tsx:2316-2321`). 이전의 홈 전환 대신 이슈 원문과 같은 가림 화면에 도달한다.

### 왜 감수 가능한 UX가 아닌가

- 보안 결함은 아니다. 서버는 라이브 GET 72/72를 403으로 거부했다.
- 하지만 저장소의 명시된 도달 계약은 “권한 없는 직접 URL → 홈 redirect” 및 “403 비노출”이다.
- 개발책임자 결정도 다른 OUTBOUND 전표는 종전대로 403이라고 했지, 모든 인증 사용자의 라우트를 오류 화면까지 열라고 하지 않았다.
- 그러므로 이는 **열리면 안 되는 사용자 표면이 열린 도달 결함**이다. 서버 인가 성공/실패와 별개다.

### 역할별 실 건수

2026-08-07 현재 라이브 읽기 측정:

- 활성 계정 27개
- `OUTBOUND × INSPECTING` 전표 6건
- 결재선 개인 2명: SALES 1명, ACCOUNTANT 1명
- 현재 비결재자 403 조합: 12계정 × 6전표 = 72건, 기타 HTTP 오류 0건

| 역할 | 활성 계정 | 전표별 상세 결과 | 현재 오류 화면 도달 계정 | 현재 조합 수 |
|---|---:|---|---:|---:|
| SALES | 10 | 60/60 GET 200; 결재선 개인 1명은 `canInspect=true` | 0 | 0 |
| MANAGER | 2 | 12/12 GET 200; 두 계정 모두 `canInspect=false` | 0 | 0 |
| MASTER | 2 | 12/12 GET 200 | 0 | 0 |
| ACCOUNTANT | 6 | 결재선 개인 1명은 6/6 GET 200; 나머지 5명은 30/30 GET 403 | 5 | 30 |
| DEVELOPER | 2 | 12/12 GET 403 | 2 | 12 |
| DISPATCH | 1 | 6/6 GET 403 | 1 | 6 |
| INVENTORY | 1 | 6/6 GET 403 | 1 | 6 |
| DRIVER | 1 | 6/6 GET 403 | 1 | 6 |
| WAREHOUSE | 1 | 6/6 GET 403 | 1 | 6 |
| STAFF | 1 | 6/6 GET 403 | 1 | 6 |

개발 시드 계정을 제외해도 이름 있는 운영 계정 기준 재현자는 ACCOUNTANT 4명, DEVELOPER 1명으로 **5명**이며, 6개 표본과의 재현 조합은 **30건**이다. 이 수치는 장애 발생 로그 건수가 아니라, 현재 데이터에서 즉시 재현 가능한 사용자×전표 실측 건수다.

## (b) D1 — `canInspect` 기본값·DTO 생성 경로

### 조사 결과

현재 사용자 경로의 정당한 검수자를 닫는 결함은 찾지 못했다.

- 버튼이 소비하는 상세 데이터는 `getSlip(id)`의 `GET /slips/{id}` 한 경로다.
- 서버 단건 GET은 `SlipService.getOne(id, userId)`를 호출하고, `isOutboundInspectApprovalMember(...)`를 계산해 6-인자 `SlipDetailResponse.from(..., canInspect)`으로 반환한다(`SlipService.java:1429-1441`).
- 이 계산은 `OUTBOUND && INSPECTING && 실사용자 ID`일 때만 결재선을 조회한다(`SlipService.java:1003-1017`). 현재 결재선 개인 두 명은 6개 INSPECTING 표본 모두 `canInspect=true`였다.
- `SlipDetailResponse.from(slip)`, 생성·복사·수정·mutation 응답 등 기본값 경로는 `canInspect=false`다. 그러나 lifecycle transition 성공 응답은 상세 캐시에 넣지 않고 `['slip', id]`를 invalidate하여 단건 GET으로 다시 계산한다(`SlipDetailPage.tsx:1713-1748`).
- 수정 응답을 상세 캐시에 직접 넣는 두 경로는 DRAFT/SAVED 직접 수정 경로다. `inspect` 버튼이 존재하는 INSPECTING 상태에는 도달하지 않는다.
- 목록 DTO에는 `canInspect`가 없지만 목록 데이터가 상세 버튼 판정에 직접 사용되지 않는다. 상세 화면 진입 후 단건 GET이 다시 권위값을 받는다.
- 견적 변환은 `convertedSlipId`로 `/sales/:id`에 이동할 뿐, 견적 DTO를 `SlipDetail` 캐시에 주입하지 않는다. 질문에 든 `SlipDetailResponse.from(estimate)` 경로는 존재하지 않는다.

### 구버전 응답

FE의 `canInspect?: boolean`과 `slip.canInspect === true`는 필드 누락을 false로 처리한다. 따라서 새 FE와 `canInspect`가 없는 구 BE의 혼합 배포에서는 fail-closed다. 다만 그 구 BE에는 이 PR의 전표별 결재 capability 자체가 없으므로, R8이 새로 정상 사용자를 닫는 별도 실 경로로 세지 않았다. 배포 호환성은 이번 도달 결함 수에 포함하지 않는다.

## (c) INBOUND 및 `inspect` 이외 액션

회귀를 찾지 못했다.

- `/purchases/:id`는 종전대로 `PermissionGuard`와 `SlipReadGuard mode="INBOUND"`를 모두 유지한다(`routes/index.tsx:612-618`). D2 우회 플래그도 없다.
- D1의 조기 false는 `action === 'inspect' && mode === 'OUTBOUND'`에만 적용된다.
- INBOUND `inspect`는 여전히 `slip.transfer.process:update`와 `inbound.inspection:update` 두 정적 요구를 모두 만족해야 한다. `canInspect=true`를 잘못 전달해도 OUTBOUND 전용 fallback 조건 때문에 가산되지 않는다.
- `save/send/accept/process/complete/ship/deliver/confirm/reject/cancel`은 D1 조기 분기와 capability fallback 모두 타지 않는다.
- 실제 호출부의 mode는 라우트가 고정한다: `/sales/:id`는 `OUTBOUND`, `/purchases/:id`는 `INBOUND`. 사용자 데이터가 mode를 뒤집는 호출부는 찾지 못했다.

## 셋째 가능성

PM이 제시한 “정적 가드를 유지하면 결재선 ACCOUNTANT가 막힘 / 정적 가드를 없애면 모두가 오류 화면까지 열림”의 이지선다는 완전하지 않다.

셋째 가능성은 **전표별 비동기 진입 가드**다. 정적 OUTBOUND 조회자는 즉시 통과시키고, 정적 조회자가 아닌 인증 사용자는 전표별 읽기 capability를 확인한 뒤 결재선 개인에게만 상세 children을 렌더하며 나머지는 기존 홈 전환을 유지할 수 있다. 구현 방식은 지시하지 않으며 아래 불변식만 고정한다.

## Fix 지시서 — 불변식만

1. `/sales/:id`의 최종 진입 허용 집합은 다음 합집합과 정확히 같아야 한다.
   - 기존 OUTBOUND 정적 조회 허용 사용자
   - 해당 전표가 `INSPECTING`이고 해당 사용자가 `OUTBOUND_INSPECT` 결재선 개인인 경우
2. 위 합집합 밖의 인증 사용자는 상세 children과 상세 오류 배너에 도달하지 않고 종전과 같은 홈 전환을 해야 한다.
3. 결재선 판정 중에는 보호 화면을 먼저 렌더하지 않는다. 판정 완료 전 fail-closed를 유지한다.
4. 서버의 단건 GET 및 `/inspect` 인가는 계속 전표별 결재선을 강제한다. 프런트 진입 가드는 서버 인가를 대체하지 않는다.
5. OUTBOUND `inspect` 버튼은 `canInspect=true`일 때만 활성화한다. 정적 transfer 권한은 `canInspect=false`를 덮지 못하고, `canInspect=true`는 정적 transfer 권한 부재를 보완한다.
6. INBOUND `inspect`와 `inspect` 이외 모든 액션의 기존 정적 권한 요구는 변하지 않는다.
7. `canInspect`가 없는 응답을 true로 추론하지 않는다.

## 양방향 RED

### RED-A — 허용 방향 보존

```text
given  ACCOUNTANT, 정적 OUTBOUND 조회권한 없음,
       대상은 OUTBOUND × INSPECTING,
       현재 사용자는 그 전표의 OUTBOUND_INSPECT 결재선 개인
when   /sales/:id 직접 진입
then   홈으로 redirect 하지 않는다
and    상세 GET 200의 화면을 렌더한다
and    canInspect=true이면 inspect 버튼이 활성화된다
```

현재 라이브 데이터에서 ACCOUNTANT 결재선 개인 1명 × INSPECTING 6건 = 6/6가 서버 200·`canInspect=true`다. fix가 D2를 되돌려 이 방향을 다시 닫으면 안 된다.

### RED-B — 거부 방향(현재 실패)

```text
given  정적 OUTBOUND 조회권한 없음,
       현재 사용자는 대상 전표의 OUTBOUND_INSPECT 결재선 개인도 아님
when   /sales/:id 직접 진입
then   홈으로 redirect 한다
and    SlipDetailPage와 "전표를 불러오지 못했습니다."를 렌더하지 않는다
and    서버 GET /slips/{id}의 403은 상세 오류 화면으로 노출되지 않는다
```

현재 R8은 이 RED를 실패한다. `allowApprovalLineCandidate`가 후보 여부를 확인하지 않고 모든 OUTBOUND 비정적 사용자를 통과시키기 때문이다. 라이브 서버 거부는 72/72로 확인됐다.

### D1 양방향 고정

```text
OUTBOUND inspect: canInspect=false + 정적 transfer=true  => false
OUTBOUND inspect: canInspect=true  + 정적 transfer=false => true
INBOUND inspect:  canInspect=true만으로는                 => false
```

## 증거 무결성

- HEAD는 요청값과 같은 `6119128c37cf19bd8dc43b1b5bdabc6d1d881f96`이었다.
- R5가 변경한 `2026/08/07-3`은 현재 read-only GET에서 `COMPLETED`, `completedAt=2026-08-07T07:40:04.311283`로 확인됐다. 새 결함이나 INSPECTING 표본으로 세지 않았다.
- R5 보고서의 당시 값은 `OUTBOUND × INSPECTING` 7건이었고, 위 1건이 COMPLETED로 전이된 현재값은 6건이다. 수치가 정확히 연결된다.
- R8 커밋 보고서와 PR 원문은 참조 테스트 8파일 222건 PASS, typecheck exit 0·TS 오류 0·부속 테스트 50/50을 기록한다. 이번 라운드는 이를 재실행하거나 품질 판정하지 않았다.
- 현재 :5200 renderer는 R8 HEAD 워크트리가 아닌 기존 `qa-combo` 프로세스이므로 R8 GUI 실측 증거로 재사용하지 않았다. 금지된 rebuild/restart도 하지 않았다. 도달 결론은 R8 소스 경로와 현재 라이브 GET 역할 매트릭스를 결합했다.
- 내부 UUID는 보고서에 기록하지 않았다.

## 이번 라운드가 보지 않은 것

- 개발책임자가 다음 라운드 반영으로 확정한 `COMPLETED` 이후 `ship → deliver → confirm` 정책 및 `CONFIRMED` 도달.
- 성능, 접근성, 디자인, 코드 스타일, 테스트 구성·커버리지 등 검증 품질 전반.
- POST/PUT/DELETE를 동반하는 라이브 재실행, DB 직접 조회·쓰기, 컨테이너 또는 renderer 재빌드·재기동.
- 전체 테스트 스위트와 CI 재실행.
- 구 BE/신 FE 혼합 배포 운영 정책 자체. 필드 누락 시 fail-closed라는 코드 효과만 추적했다.
