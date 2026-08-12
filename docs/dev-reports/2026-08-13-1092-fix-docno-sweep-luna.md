# #1092 문서번호 path 계열 전수 sweep — CODEX LUNA

- 실행일: 2026-08-13
- 브랜치: `feat/1092-estimate-menu-canon`
- 범위: 견적 문서번호 path id 전 계열(상세·일반 mutation·revision·collab·presence·SSE·coedit)
- 공유 DB 쓰기: 0건
- QA 입력: `docs/dev-reports/2026-08-13-1092-liveqa4-sol.md` 및 `docs/qa/2026-08-13-1092-liveqa4/` PNG 10장

## 1. 전수 목록과 처리 표

공통 계약은 하나다.

```text
원문 문서번호 2026/08/10-9
→ toOrderPathId
→ 2026-08-10-9
→ encodeURIComponent
```

`toOrderPathId`는 이미 하이픈이 있는 suffix(`-9`, `-19`, `-22`)를 보존한다. 서버는 UUID path와 하이픈 문서번호 path를 `EstimateService.resolveId`에서 해석하고 내부 UUID로만 domain service를 호출한다. 문서번호 자체는 응답과 화면에 그대로 남긴다.

### 프런트 요청 표 — 25개 표면

| 계열 | 경로/호출 | 처리 |
|---|---|---|
| 일반 견적 | GET 상세, PUT 수정, POST send/accept/reject/convert/restore, PATCH owner | 모두 `toOrderPathId` 적용 |
| revision | GET revisions, POST revision restore | 하이픈 path id 적용 |
| collab comments | GET/POST comments, DELETE/POST resolve | 공통 `collabPath` 적용 |
| collab edits | GET/POST edits | 공통 `collabPath` 적용 |
| collab coedit | GET coedit, POST update/awareness | EstimateForm base path 변환 |
| collab stream | 별도 SSE stream | 하이픈 path id 적용 |
| presence | GET presence, POST join/leave, presence SSE stream | 공통 presence client 적용 |
| 합계 | 위 요청 표면 | **25개 처리** |

서버 경로변수도 전수 처리했다.

| 컨트롤러 | 엔드포인트 수 | 처리 |
|---|---:|---|
| `EstimateController` — 상세·수정·상태전이·delete·restore·owner | 10 | path 변수 mutation을 `String`으로 받고 `resolveId` 후 기존 UUID service 호출 |
| `EstimateRevisionController` — revisions 조회·restore | 2 | `String` path를 `resolveId` 후 revision service 호출 |
| `EstimateCollabController` — comments 4, edits 2, coedit 3, stream 1, presence 3 | 13 | 전부 `String` path를 내부 UUID로 해석 |
| 합계 | **25개** | **전수 처리** |

견적 snapshot의 `snapshotKey`와 다른 도메인의 UUID path는 문서번호 경로가 아니므로 이번 계열에 포함하지 않았다.

## 2. RED → GREEN 원문

### RED

```text
FAIL EstimateCollabRealtimeClient > SSE stream
expected '/api/v1/slips/estimates/estimate%2F1/…' to be
  '/api/v1/slips/estimates/estimate-1/collab/stream'

FAIL estimateCollab API paths > 댓글 조회/작성
expected ... estimate-1 ...
Received ... estimate%2F1 ...

FAIL EstimatePresenceClient > presence 조회/join
expected ... estimate-1 ...
Received ... estimate%2F1 ...

FAIL estimate document-number path family > all estimate item requests
Received:
  /slips/estimates/2026/08/10-9
  /slips/estimates/2026/08/10-9/send
  /slips/estimates/2026/08/10-9/accept
  /slips/estimates/2026/08/10-9/reject
  /slips/estimates/2026/08/10-9/convert
  /slips/estimates/2026%2F08%2F10-9/restore
```

새로 발견한 revision 표면에도 동일한 RED-first 회귀 테스트를 추가했다. collab comments, presence, stream, 일반 견적 계열, revision을 요청 표면별 테스트로 고정했고 edits/coedit은 동일 helper 계열로 묶어 처리했다.

### GREEN

```text
npx vitest run src/renderer/api/estimateCollab.test.ts src/renderer/realtime/createPresenceClient.estimate.test.ts src/renderer/realtime/EstimateCollabRealtimeClient.test.ts src/renderer/api/estimateApi.test.ts src/renderer/api/estimateRevision.test.ts

Test Files 5 passed (5)
Tests      11 passed (11)
```

## 3. 하이픈 id ↔ 문서번호 1:1

직전 실측의 실제 데스크톱 견적 45건 전수 결과를 기준으로 재확인했다.

```text
원본 문서번호: 45건
고유 하이픈 path id: 45건
충돌: 0건
한 자리 suffix: -7, -8, -9 정상
두 자리 suffix: -19, -22 정상
```

서버 `resolveId`는 UUID 입력이면 UUID를 그대로 사용하고, 그 외에는 원문 하이픈 문서번호와 slash 복원 문서번호를 순서대로 조회한다. 업무 문서번호를 변경하지 않으며 UUID를 URL에 추가하지 않는다.

## 4. 건수·불변식 재확인

직전 실측 read-only 집계를 기준으로 삼았다. 코드 변경은 path 표현만 바꾸며 목록/저장 데이터 집계를 변경하지 않는다.

```text
전체                 64
데스크톱 견적         45
데스크톱 주문          4
웹 견적                4
웹 주문               11
웹 저장분             15
기존 데스크톱         49
```

QA PNG 10장도 시각 확인했다. 상세 5건은 원문 문서번호와 거래처·금액이 보이고, 통합/필터 화면은 64·45·4·11 집계를 보존한다. 웹 견적 특수문자 문서번호와 웹 주문 상세에도 UUID URL/화면 노출은 없다. 상세 PNG의 `코멘트를 불러오지 못했습니다.`는 **수정 전 liveqa4 증거**이며 수정 후 새 GUI 캡처는 실행하지 않았다.

## 5. 검증 및 못 한 것

```text
npm run typecheck: PASS
변경 모듈 테스트: 5 files / 11 tests PASS
slip-service :compileJava: PASS (13초)
git diff --check: PASS
```

- backend 전체 테스트는 요청된 120초 제한 내 전량 실행하지 않았다. 이번 라운드에는 `:services:slip-service:compileJava`까지만 실행했다.
- 공유 DB 쓰기가 필요한 실 GUI 재현·코멘트 등록·presence join/leave는 실행하지 않았다.
- 수정 후 실 gateway를 통한 400/200 통합 QA와 새 스크린샷은 실행하지 않았다. 프런트 RED→GREEN, 서버 컴파일, 기존 실측 수치로 검증했다.

## 6. 라운드 종료 점검

```text
git ls-files --deleted: 없음
tools/.s24-build-only/build/deep/tracked-writer.mjs: 추적됨 · 실파일 존재
이번 라운드가 시작한 node/java 프로세스: 없음 (기존 공유 서비스·IDE/Codex 프로세스는 유지)
이번 라운드 임시 컨테이너: 없음
공유 컨테이너/DB: 기존 환경 소유 · 중지/변경하지 않음
공유 DB 쓰기: 0건
```
