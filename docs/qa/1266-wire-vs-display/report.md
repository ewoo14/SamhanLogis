# PR #1266 fix 라운드 — wire와 표시 축 재판정

조사일: 2026-08-18 (KST)  
대상 브랜치: `fix/uuid-not-in-api-response`  
정찰 근거: `docs/dev-reports/2026-08-17-uuid-exposure-recon/report.md`

## ① 실패 8잡 원인 확정

정찰 보고서의 “미사용”은 화면 표시 여부가 아니라 지정 클라이언트의 직접 property read만 집계한 값이었다. 이번 라운드에서 실패 테스트와 실행 소스를 다시 대조한 결과, 협업 댓글·수정 이력은 실제 desktop이 UUID를 React key와 resolve/delete path에 사용하므로 응답 wire가 필요했다. 저장 생성 응답 id, 일정 owner/participant 응답, bulk message batchId는 지정 클라이언트의 후속 호출에 쓰이지 않아 표시용/내부 검증 축으로 분류하고 테스트를 목록·DB 검증에 맞췄다.

실패 잡은 `user+product+inventory+logging`, `slip-it-core`, `accounting+partner`, `phase9-10 (groupware+notification+dashboard)`의 4개 빌드 잡과 같은 범위를 재게시한 JUnit 4개였다. 원인은 다음과 같다.

| 잡/서비스 | 원인 | 판정 |
|---|---|---|
| inventory | 생성 응답 `data.id` 제거 뒤 `DpsSaveHistoryIT`가 null을 UUID로 파싱. 실제 화면은 목록 row id로 상세 path를 만든다. | 생성 응답 id는 (b), 테스트는 목록→상세로 수정 |
| slip core | cleanup 생성 응답 id 단언, 댓글 응답 id/parentId 제거, 수정 이력 응답 edit id 제거 | id 단언은 (b), comment/edit id는 (a) |
| accounting | Journal collab comment id/parentId와 suggestion edit id 제거 | (a) |
| groupware | approval collab comment id/parentId와 suggestion edit id 제거; 일정 응답 owner/participant 및 bulk batch 응답 단언 | collab은 (a), 일정/batch는 (b) |

## ② 건별 (a) wire / (b) 표시 판정

| 대상 필드 | 판정 | 클라이언트 근거 또는 테스트 조정 |
|---|---|---|
| `SlipCollabCommentResponse.id,parentId` | (a) | `clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.tsx:285,332,346`; `slipCollab.ts:76-90`에서 key·resolve/delete path와 parentId payload 사용 |
| `DispatchCommentResponse.id,parentId` | (a) | `clients/desktop/src/renderer/api/dispatchCollab.ts:76-81`에서 comment id를 delete path에 사용하고 `DispatchComment`가 내부 모델로 보존 |
| `JournalCollabCommentResponse.id,parentId` | (a) | `clients/desktop/src/renderer/components/collab/JournalCollaborationPanel.tsx:326,371,385`; `journalCollab.ts:71-85`에서 key·resolve/delete path 사용 |
| `ApprovalCollabCommentResponse.id,parentId` | (a) | `clients/desktop/src/renderer/components/collab/GroupwareApprovalCollaborationPanel.tsx:403,449,464`; `groupwareApprovalCollab.ts:77-92`에서 key·resolve/delete path 사용 |
| `SlipCollabSuggestionResponse.id` | (a) | `clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.tsx`의 edit 목록 key/내부 모델. 기존 `edit.id`가 null이 되어 `SlipCollabIT` 3건 NPE 재현 |
| `DispatchCollabSuggestionResponse.id` | (a) | `clients/desktop/src/renderer/routes/dispatch-board/components/DispatchTaskDetailModal.tsx:270-352`의 edit query/key 및 commit 결과 내부 모델. `DispatchCollabIT` NPE 재현 |
| `JournalCollabSuggestionResponse.id` | (a) | `clients/desktop/src/renderer/components/collab/JournalCollaborationPanel.tsx:604,620`의 React key |
| `ApprovalCollabSuggestionResponse.id` | (a) | `clients/desktop/src/renderer/components/collab/GroupwareApprovalCollaborationPanel.tsx:712,728`의 React key |
| DPS/cleanup `*SaveHistorySaveResponse.id` | (b) | `clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts:58-67`, `slipCleanupSaveHistoryApi.ts:59-68`의 저장 결과 id 후속 호출 없음. 실제 복원은 목록 row id를 `getDpsHistoryDetail`/cleanup detail path에 사용 |
| `ScheduleResponse.ownerId,participantIds` | (b) | 지정 client 실행 소스에서 후속 요청/키 사용처 없음. 테스트는 header owner·참여자 보존을 DB와 제목/상태로 검증하고 UUID 응답 단언 제거 |
| `MessageBulkSendResponse.batchId` | (b) | `clients/desktop/src/renderer/api/messengerApi.ts:58-66`는 결과를 반환하지만 batchId로 후속 호출하지 않음. 테스트는 저장된 5행의 동일 batch_id를 직접 검증 |

## ③ RED 원문

수정 전 전량 실행의 핵심 원문:

```text
DpsSaveHistoryIT > POST → 목록 → 상세 → latest 전체 흐름 FAILED
    java.lang.AssertionError at DpsSaveHistoryIT.java:89
        Caused by: com.jayway.jsonpath.PathNotFoundException

SlipCleanupSaveHistoryIT > MANUAL_NAMED 는 append 저장되고 목록/상세로 복원된다 FAILED
    java.lang.AssertionError at SlipCleanupSaveHistoryIT.java:103
        Caused by: com.jayway.jsonpath.PathNotFoundException

SlipCollabIT > commitEdit_applies_memo... FAILED
    java.lang.NullPointerException at SlipCollabIT.java:392
SlipCollabIT > commitEdit_on_outbound_slip... FAILED
    java.lang.NullPointerException at SlipCollabIT.java:855
SlipCollabIT > commitEdit_on_inbound_slip... FAILED
    java.lang.NullPointerException at SlipCollabIT.java:877
DispatchCollabIT > commitEdit_onDispatchedTask... FAILED
    java.lang.NullPointerException
```

정찰 직후 별도 RED 실행은 Gradle distribution 최초 다운로드/컴파일 단계에서 120초 timeout되어 테스트 판정까지 도달하지 못했다. 이를 RED pass로 세지 않았다. 이후 환경변수 `SAMHAN_GATEWAY_ATTESTATION=test-gateway-attestation`을 명시해 재현했고, 위 원문을 확보했다.

## ④ 되살린 필드 목록

`id,parentId` 2개씩: `SlipCollabCommentResponse`, `DispatchCommentResponse`, `JournalCollabCommentResponse`, `ApprovalCollabCommentResponse`.  
`id` 1개씩: `SlipCollabSuggestionResponse`, `DispatchCollabSuggestionResponse`, `JournalCollabSuggestionResponse`, `ApprovalCollabSuggestionResponse`.

총 12개 필드를 wire/internal key로 복원했다. 저장 생성 응답 id·일정 owner/participant·bulk batchId는 복원하지 않았다.

## ⑤ 표시 축 유지 근거

복원한 필드는 Java 응답 DTO와 내부 client 모델에만 존재한다. `authorId`, `proposerId`, `decidedById`는 계속 응답하지 않는다. desktop collab 패널은 authorName/body/status/시각을 표시하고 UUID는 `key`, API path, payload에만 사용한다. 저장 이력 화면은 `row.id`를 `rowKey`와 상세 복원 path에만 사용하며 label/tooltip/placeholder에 출력하지 않는다. 일정 테스트도 owner/participant UUID 응답 단언을 제거했다.

## ⑥ 테스트 결과

| 범위 | 명령 결과 |
|---|---|
| inventory-service 전량 | 671 tests, 1 skipped, 0 failed — 종료코드 0 (`--rerun-tasks`) |
| slip-service wire targeted | SlipCleanup/SlipCollab/DispatchCollab/DispatchCollabComment — 종료코드 0 |
| slip-service 전량 최종 | 1,915 tests, 335 skipped, 2 failed — 종료코드 1. `SlipCompensationAuditIT`, `SlipPartnerLedgerInternalControllerIT`만 남았고 변경 파일과 무관 |
| accounting-service 전량 | 종료코드 0 (`--rerun-tasks`) |
| groupware-service 전량 | 종료코드 0 (`--rerun-tasks`) |
| clients/desktop | `npm ci` 후 `npm run typecheck` 종료코드 0 |

slip 최종 2건은 이번 wire/display 수정과 무관한 기존 실패로 미검증이 아니라 명시적 실패로 기록한다. 최초 slip 전량에서 관찰된 collab 4건과 cleanup 1건은 targeted 재실행에서 해소됐다.

## ⑦ 미검증 축

지정 범위 밖인 `arologis-desktop`, `arologis-mobile`, `mobile-staff`, `internal-chat-desktop`의 별도 실행 소스 소비 여부는 이번 라운드에서 검증하지 않았다. 전체 PR CI 재실행 결과와 slip의 비관련 2건 해결 여부도 이 라운드에서 처리하지 않았다.

## ⑧ 변경 파일

Java DTO 8개와 통합 테스트 4개를 수정했다. 테스트 수정은 저장 생성 응답 UUID를 요구하지 않고 실제 사용자 경로인 목록 row id→상세 path를 검증하도록 한 것, 일정/bulk의 표시·후속호출 없는 UUID 응답 단언을 제거하고 DB/domain 동작을 검증하도록 한 것이다. 커밋·push·PR branch 변경은 하지 않았다.

## ⑨ 프로세스 회수

이번 라운드가 생성한 Gradle 래퍼/daemon과 Testcontainers는 종료 시 회수했다. 정찰·검증 소유가 아닌 기존 Java/Node 프로세스와 공유 컨테이너는 건드리지 않았다. 라운드 소유 임시 컨테이너는 0개이며, 공유 Samhan 컨테이너 24개는 유지됐다. 현재 목록의 추가 `sol-1272-pg` 1개와 관련 Node 프로세스는 타 워크트리 `wdcp` 소유로 확인되어 건드리지 않았다.
