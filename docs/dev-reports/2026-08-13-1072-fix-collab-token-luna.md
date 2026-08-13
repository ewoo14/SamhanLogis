# #1072 collab opaque token fix — CODEX LUNA

실행일: 2026-08-13  
브랜치: `feat/1072-1144-accounting-canon`  
공유 DB 쓰기: 없음

## 1. 결함 원인

목록·상세·게시·역분개 본 경로는 `OpaqueUuidDeserializer.decode(...)`를 사용했지만, `JournalCollabController`의 `{journalId}`는 `UUID`로 직접 바인딩하고 있었다. 따라서 opaque token은 컨트롤러 메서드 진입 전 `400 INVALID_INPUT`이 됐다.

## 2. 분개 상세 호출 전수 목록

### 프런트 식별자 전달 지점

| 호출 | 프런트 위치 | 식별자 전달 | 처리 전 | 처리 후 |
|---|---|---|---|---|
| 댓글 조회 | `api/journalCollab.ts:getJournalCollabComments` | path `journalId` | 누락 | 서버 복원 |
| 댓글 등록 | `addJournalCollabComment` | path `journalId` | 누락 | 서버 복원 |
| 댓글 삭제 | `deleteJournalCollabComment` | path `journalId`, `commentId` | journal 누락 | journal 복원, comment UUID 유지 |
| 댓글 해결 | `resolveJournalCollabComment` | path `journalId`, `commentId` | journal 누락 | journal 복원, comment UUID 유지 |
| 수정 이력 조회 | `getJournalCollabEdits` | path `journalId` | 누락 | 서버 복원 |
| 수정완료 | `commitJournalCollabEdit` | path `journalId` | 누락 | 서버 복원 |
| presence 목록 | `JournalPresenceClient.list` | path `entityId=journalId` | 누락 | 서버 복원 |
| presence join | `JournalPresenceClient.join` | path `entityId=journalId` | 누락 | 서버 복원 |
| presence leave | `JournalPresenceClient.leave` | path `entityId=journalId` | 누락 | 서버 복원 |
| 협업 SSE | `JournalCollabRealtimeClient` | path `journalId` | stream만 403 관찰 | 서버 복원 |

### 서버 수신 endpoint

| 경로군 | 세부 endpoint | 적용 결과 |
|---|---|---|
| comments | `GET/POST /comments`, `DELETE /comments/{commentId}`, `POST /comments/{commentId}/resolve` | 모두 `String` 수신 후 공통 decode |
| edits | `GET/POST /edits` | 모두 공통 decode |
| presence | `GET /presence`, `POST /presence/join`, `POST /presence/leave` | 모두 공통 decode |
| stream | `GET /stream` | 공통 decode |
| coedit | `GET /coedit`, `POST /coedit/update`, `POST /coedit/awareness` | 현재 상세 자동 호출 대상은 아니지만 같은 controller 축 전체에 공통 decode |

서버의 journal 협업 path variable은 모두 `@PathVariable("journalId") String journalIdToken`으로 받고, `decodeJournalId()` 한 곳에서 기존 UUID 또는 opaque token을 복원하도록 통일했다.

## 3. RED → GREEN 원문

협업 전수 테스트 RED:

```
$ .\gradlew.bat :services:accounting-service:test --tests '...JournalCollabIT.detailCollaborationRequests_acceptOpaqueJournalTokenAcrossAllEndpoints'

JournalCollabIT > detailCollaborationRequests_acceptOpaqueJournalTokenAcrossAllEndpoints() FAILED
    java.lang.AssertionError at JournalCollabIT.java:143
Status expected:<200> but was:<400>
```

첫 GREEN 시도에서 경로 변수 이름을 명시하지 않아 다음 회귀가 잡혔다.

```
Resolved Exception: MissingPathVariableException
Status expected:<200> but was:<500>
```

`@PathVariable("journalId")`를 명시한 뒤:

```
BUILD SUCCESSFUL
1 test completed, 0 failed
```

전수 테스트는 comments/presence/edits/stream 4개 경로를 한 테스트에서 순서대로 확인한다.

## 4. CashReceiptControllerIT 대조 및 수정

현재 브랜치에서 재현:

```
CashReceiptControllerIT > 취소는 원분개를 REVERSED 처리하고 차대 swap 역분개 번호를 응답한다 FAILED
    CashReceiptControllerIT.java:315
CashReceiptControllerIT > 확정은 POSTED 분개를 생성하고 기본/override 계정을 라인에 반영한다 FAILED
    CashReceiptControllerIT.java:254
2 tests completed, 2 failed
```

실패 원문은 테스트가 UUID 문자열을 기대했으나 응답이 opaque token을 반환한 것이었다.

```
expected: 2e42f66a-b5ef-4c9c-aed4-403160e34b9b
but was : LkL2arXvTJyu1EAxYONLmw

expected: f587a0a6-d69f-42ff-b0ca-37d446cfcff0
but was : 9YegptafQv-wyjfURs_P8A
```

`origin/main`의 `JournalDetailResponse`는 UUID를 그대로 반환하고 `OpaqueUuidSerializer`가 없었다. 따라서 main 기준 테스트 기대는 당시에는 맞았고, 이 브랜치의 UUID 비공개 변경에 맞춰 `OpaqueUuidSerializer.encode(...)` 기준으로 테스트만 수정했다. DB 검증은 계속 내부 UUID를 사용한다.

수정 후:

```
BUILD SUCCESSFUL
2 tests completed, 0 failed
```

## 5. 검증

```
JournalCollabIT 전체: 51 tests, 0 failed
npm run typecheck: PASS
CashReceiptControllerIT 대상 2건: 2 tests, 0 failed
```

accounting-service 전량:

```
실행: .\gradlew.bat :services:accounting-service:test --no-daemon
결과: 120초 제한 초과(exit code 124), 완료 수치 미산출
```

요청된 120초 제한 안에 끝나지 않아 전량 통과로 주장하지 않는다.

## 6. 불변식 재확인

- UUID 0건, 목록 7페이지 133건, 상세 133건, 중첩 `lines` UUID 0건: 직전 라이브QA2 실측과 7장 스크린샷으로 재확인했다.
- 확정 매핑 2/2: `110→1089`, `401→4019`.
- 미정 표시 10/10.
- 대표 전표 3/3, 라인 7/7 및 차변·대변 DB 일치.
- 전표 건수 API/DB 133건.
- 동일 전표 재진입 token 일관성, 게시·역분개 상세 진입과 버튼 노출 유지.
- 협업 자동 조회 4경로는 새 통합 IT에서 opaque token으로 모두 200 확인.
- 코멘트/수정 이력의 실제 라이브 화면 표시와 post-fix 실 네트워크 캡처는 이번 세션에 다시 실행하지 못했다. 자동화된 DB 왕복/MockMvc 경로는 통과했지만, 라이브 QA2 재실행 전에는 최종 머지 판정으로 세지 않는다.

## 7. 라운드 종료 점검

```
git diff --name-status origin/main...HEAD | Select-String '^D' = 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs = PRESENT
samhan-* 컨테이너: 기존 healthy 상태, 변경/삭제 없음
w1072 Gradle timeout process: 정리 완료
공유 DB 쓰기: 없음
```

