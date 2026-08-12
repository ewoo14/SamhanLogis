# #1092 견적 식별자 축 전환 — 2026-08-13

## 1. 증거 무결성 확인

결론부터 말하면 직전 sweep은 **목록만 만든 것이 아니다**. 소스에는 실제 적용이 있었다.

- `estimateApi`, `estimateCollab`, `estimateRevision`, `createPresenceClient`, `EstimateCollabRealtimeClient`가 `toOrderPathId`를 사용하고 있었다.
- `EstimateController`, `EstimateRevisionController`, `EstimateCollabController`의 path variable도 `String`으로 바뀌었고 `EstimateService.resolveId`가 하이픈/슬래시 문서번호를 해석했다.
- 그러나 실 GUI 요청은 여전히 `2026-08-10-9` 문서번호였다. 따라서 400/403은 “적용 목록 누락”이 아니라 **프런트가 문서번호를 응답의 `id`처럼 계속 운반한 계약 불일치**였다.
- 편집 버튼과 인쇄 deep-link는 별도로 `estimateNo`를 SPA path에 넣고 있어 `/sales/estimates/2026/08/10-9/edit` 404를 만들었다.
- 즉, 이전 sweep은 서버/helper의 형식만 바꾸었고, 응답 식별자 계약과 모든 상세 부속 deep-link까지 바꾸지 못했다. 이번 수정은 이 축을 바꾼 것이다.

## 2. 선택한 축과 이번에 다른 이유

`#1143`/`#1072`의 방식인 **UUID 16바이트를 padding 없는 Base64URL로 인코딩한 opaque token**을 정본으로 선택했다.

예: UUID `00000000-0000-0000-0000-000000000001` → `AAAAAAAAAAAAAAAAAAAAAQ`

문서번호 `2026/08/10-9`는 `estimateNo`로만 보존하고, URL/API 식별자는 opaque token으로 분리했다. 이 방식은 슬래시를 URL path로 해석할 지점 자체를 없애며, 기존 하이픈 문서번호 축을 다시 반복하지 않는다. 서버는 호환성을 위해 UUID·구형 문서번호도 당분간 해석하지만 공개 응답과 신규 URL은 opaque token만 만든다.

## 3. RED → GREEN 원문

### 편집 deep-link RED

기존 상세 fixture의 `id`가 `2026/08/10-9`일 때:

```text
No routes matched location "/sales/estimates/2026/08/10-9/edit"
```

opaque 응답 id와 `/sales/estimates/:id/edit` route를 적용한 뒤:

```text
✓ EstimateDetailPage.test.tsx (4 tests)
Test Files 1 passed, Tests 4 passed
```

### 인쇄 deep-link RED

```text
expected ... "/#/sales/estimates/opaque-estimate-token/print"
Received: "http://localhost:3000/#/sales/estimates/2026%2F08%2F08-1/print"
```

`handlePrint`도 `e.id` opaque token을 사용하도록 고친 뒤:

```text
✓ EstimateDetailPage.test.tsx (4 tests)
Test Files 1 passed, Tests 4 passed
```

### 공개 응답 계약 RED → GREEN

처음 opaque 계약 테스트는 예상 token 오기입으로 실패했다.

```text
expected AAAAAAAAAAAAAAAAAAA... but was AAAAAAAAAAAAAAAAAAAAAQ
```

정확한 Base64URL token 계약과 UUID 직렬화 가드를 반영한 뒤:

```text
BUILD SUCCESSFUL in 9s
EstimateOpaqueIdentifierContractTest: 3 tests passed
```

## 4. 상세 요청 전수 계약

상세 화면의 식별자 공급원을 `estimateDetailRequestContract.test.ts` 한 테스트에서 함께 확인했고, 각 요청 builder/client가 같은 opaque token을 전달하도록 유지했다.

| 요청 | 신규 path 식별자 | 상태 |
|---|---|---|
| comments GET | `/api/v1/slips/estimates/{token}/collab/comments` | 코드 계약 GREEN |
| presence GET | `/api/v1/slips/estimates/{token}/collab/presence` | 코드 계약 GREEN |
| edits GET | `/api/v1/slips/estimates/{token}/collab/edits` | 코드 계약 GREEN |
| coedit GET/stream | `/api/v1/slips/estimates/{token}/collab/coedit...` | 코드 계약 GREEN |
| revision GET | `/api/v1/slips/estimates/{token}/revisions` | 코드 계약 GREEN |
| stream | `/api/v1/slips/estimates/{token}/collab/stream` | 코드 계약 GREEN |
| 상세/편집/인쇄 SPA | `/sales/estimates/{token}/...` | 테스트 GREEN |

FE 관련 회귀 전량(전수 계약 테스트 포함):

```text
Test Files 10 passed, Tests 86 passed
npm run typecheck: exit 0
```

실 GUI의 동일 화면을 다시 열어 gateway 네트워크 전수를 재측정하는 단계는 이 세션에서 수행하지 못했다. in-app Browser가 `No browser is available`을 반환했고, 저장된 인증 세션/JWT도 없었다. 공유 DB 쓰기를 금지했으므로 real-QA 로그인/코멘트 작성 spec도 실행하지 않았다. 따라서 live 네트워크에서 400/403/404/500이 모두 사라졌다고 이 보고서에서 주장하지 않는다.

## 5. UUID·표시 형식·건수

- `EstimateReadResponse`/`EstimateDetailReadResponse`의 `id`는 opaque token이다.
- UUID typed 공개 응답 필드와 문자열형 `requesterId`도 opaque serializer를 적용했다.
- 화면 표시용 `estimateNo`는 `2026/08/10-9` 원본 형식을 유지한다.
- 목록/상세 화면 URL에는 문서번호 슬래시와 UUID를 사용하지 않는다.
- 직전 live-QA의 read-only 집계 재확인 값은 유지된다: 전체 `64`, 데스크톱 견적 `45`, 데스크톱 주문 `4`, 웹 견적 `4`, 웹 주문 `11`. 이번 세션에는 공유 DB 재조회/쓰기를 하지 않았다.

## 6. 검증 및 미수행 항목

- 통과: opaque identifier backend contract 3 tests.
- 통과: 변경 범위 FE 9 test files / 85 tests.
- 통과: `npm run typecheck`.
- 실패/기존 환경 결함: `:services:slip-service:test --tests 'com.samhanair.logis.slip.estimate.*' --tests 'com.samhanair.logis.slip.estimate.web.*'`는 147개 실행 중 13개 실패. `EstimateControllerIT`의 DB 무결성 오류, `EstimateRevisionRestoreIT`/`EstimateCollabIT`의 legacy document-number 해석 오류, `EstimateControllerSecurityContractTest`의 reflection signature 오류가 남았다.
- backend 전체 테스트는 안내된 120초 timeout 위험 때문에 완료 실행하지 못했다.
- live GUI 네트워크 전수 검증은 브라우저/인증 세션 부재로 못 했다.
- git 변경 계열 명령, commit/push, 공유 DB 쓰기는 수행하지 않았다.

## 7. 라운드 종료 점검

`git ls-files --deleted` 결과 삭제된 추적 파일은 없었다. 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재하며 길이 42 bytes로 확인했다. 검증을 위해 띄운 renderer(5175)는 종료했고, 해당 포트 listener가 남아 있지 않다.
