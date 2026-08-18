# PR #1266 fix 라운드 4 보고서

## ① cutoff 원인과 fix

재판정의 원인대로 `SlipCutoffResponse.id`가 표시용 필드로 오인되어 제거되어 있었다. 그러나 데스크톱은 `row.id`를 화면에 표시하지 않고 수정·삭제 path param으로만 사용한다.

수정은 `services/slip-service/.../SlipCutoffResponse.java`에 `UUID id`와 `cutoff.getId()` 매핑을 복원한 2줄이다. 화면 컬럼·라벨·tooltip에는 id를 추가하지 않았다.

## ② 지운 필드 전수 × 호출처 유무

PR 1차 제거 diff의 DTO 필드 46개를 `clients/desktop`, `clients/web`, `clients/mobile*` 전체에서 호출 기준으로 확인했다. 테스트가 아니라 실제 호출 파일·줄만 근거로 삼았다.

| 응답 DTO | 지운 필드 | 클라이언트 호출처 유무·근거 |
|---|---|---|
| JournalCollabCommentResponse | `id`, `parentId` | **있음(wire)** — `clients/desktop/src/renderer/api/journalCollab.ts:71-85` 삭제·해결 path에 `commentId`; 타입 `:11-16` |
| JournalCollabSuggestionResponse | `id` | **없음** — 지정 3 client에서 `suggestion.id`/`suggestionId` 호출 0. 기존 4개 suggestion wire 복원 상태는 유지 |
| ArologisAuditLogResponse | `id`, `entityId`, `actorId` | 없음 — 지정 3 client 전체 호출처 0 |
| ArologisEditRequestResponse | `id`, `entityId`, `requesterId`, `decidedById` | 없음 — 지정 3 client 전체 호출처 0 |
| MessageBulkSendResponse | `batchId` | 없음 — 지정 3 client 전체에서 응답 `batchId` 소비 0 |
| ScheduleResponse | `ownerId`, `participantIds` | 없음 — 지정 3 client에 일정 API/화면 route 호출처 0 |
| ApprovalCollabCommentResponse | `id`, `parentId` | **있음(wire)** — `clients/desktop/src/renderer/api/groupwareApprovalCollab.ts:77-92` 삭제·해결 path; 타입 `:12-16` |
| ApprovalCollabSuggestionResponse | `id` | **없음** — 지정 3 client에서 `suggestion.id`/`suggestionId` 호출 0. 기존 4개 suggestion wire 복원 상태는 유지 |
| InventoryAuditLogResponse | `id`, `entityId`, `actorId` | 없음 — 지정 3 client 전체 호출처 0 |
| InventoryEditRequestResponse | `id`, `entityId`, `requesterId`, `decidedById` | 없음 — 지정 3 client 전체 호출처 0 |
| DpsSaveHistorySaveResponse | `id` | **없음(표시용/생성 응답)** — `clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts:25,59-60`은 `savedAt`만 소비. 상세 wire id는 목록 행 `clients/desktop/src/renderer/components/DpsHistoryTab.tsx:108-110`의 `row.id`이며 제거 대상과 다름 |
| DeductionResponse.DeductedLotEntry | `lotId` | 없음 — 지정 3 client 전체 호출처 0 |
| StockLotResponse | `sourceTransferId` | 없음 — 지정 3 client 전체 호출처 0 |
| StockMovementResponse | `lotId`, `referenceId`, `actorUserId` | 없음 — 지정 3 client 전체 호출처 0 |
| TransferDetailResponse | `requesterId`, `approverId`, `sourceLotId`, `destinationLotId` | 없음 — 지정 3 client 전체 호출처 0 |
| TransferResponse | `requesterId`, `approverId` | 없음 — 지정 3 client 전체 호출처 0 |
| SlipAttachmentResponse | `slipId` | 없음 — 지정 3 client 전체 호출처 0 |
| SlipCommentResponse | `id`, `slipId` | 현재 제거본 직접 소비 0. 별도 협업 댓글 wire는 아래 `SlipCollabCommentResponse`이며 화면 진입 경로에서 정상 사용 |
| SlipClosingBaselineResponse | `id` | 없음 — 지정 3 client 전체 호출처 0 |
| **SlipCutoffResponse** | **`id`** | **있음(wire)** — `clients/desktop/src/renderer/routes/admin/SlipCutoffConfigPage.tsx:188,216,321,377`, API path 조립 `clients/desktop/src/renderer/api/slipCutoff.ts:114-128` |
| SlipCollabCommentResponse | `id`, `parentId` | **있음(wire)** — `clients/desktop/src/renderer/api/slipCollab.ts:11-16,76-90`; resolve/delete URL에 `commentId` |
| SlipCollabSuggestionResponse | `id` | **없음** — 지정 3 client에서 `suggestion.id`/`suggestionId` 호출 0. 기존 4개 suggestion wire 복원 상태는 유지 |
| DispatchCollabSuggestionResponse | `id` | **없음** — 지정 3 client에서 `suggestion.id`/`suggestionId` 호출 0. 기존 4개 suggestion wire 복원 상태는 유지 |
| DispatchCommentResponse | `id`, `parentId` | **있음(wire)** — `clients/desktop/src/renderer/api/dispatchCollab.ts:76-81` 삭제 path 및 타입 wire key |
| SlipCleanupSaveHistorySaveResponse | `id` | **없음(표시용/생성 응답)** — `clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts:26,60-61`은 `savedAt`만 소비. 상세 wire id는 목록 `clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx:110,116`의 `row.id` |

결론: comment 8개와 이번 cutoff `id`는 실제 호출처가 있어 wire로 복원/보존해야 한다. suggestion 4개는 현재 지정 client 호출처가 0이지만 이미 복원된 12개 wire 상태를 잃지 않도록 그대로 유지했다. 나머지는 지정 client에서 호출처가 없어 표시용 제거가 맞다. 특히 path 조립은 `/${id}` 및 template literal을 별도로 집중 검색했고 cutoff만 이번 라운드에서 추가 결함으로 확인됐다. `clients/web`, `clients/mobile*`에서는 위 제거 필드의 호출처가 없었다.

## ③ RED 원문

수정 전, attestation을 주입한 테스트 실행에서 다음 RED를 확보했다.

```text
SlipCutoffAdminControllerIT > crud_happyPath() FAILED
    java.lang.IllegalStateException at SlipCutoffAdminControllerIT.java:214

private static String extractId(String json) {
    String marker = "\"id\":\"";
    int start = json.indexOf(marker);
    if (start < 0) {
        throw new IllegalStateException("id 필드를 찾을 수 없습니다");
    }
}

1 test completed, 1 failed
BUILD FAILED
```

수정 후 동일 클래스 전체는 `BUILD SUCCESSFUL`이며 cutoff IT 전 테스트가 통과했다.

## ④ 라이브 — 마감시간 수정·저장 확인

- 공유 `samhan-postgres`의 `slip_db`를 읽기 전용 dump로 격리 PostgreSQL `codex1266-r4-pg`에 복제했다. 브랜치 JAR는 별도 `slip-service:28086`으로 기동했고 `SAMHAN_GATEWAY_ATTESTATION`을 주입했다. auth-service는 공유 인스턴스를 사용했다.
- headless Chromium에서 실제 로그인 → 인사 → `출고 마감시간 설정` 화면을 통과했다.
- 목록 **4행** 확인. `경동화물` 수정에서 `PATCH /admin/slip-cutoffs/bbfd82f8-2546-4a4c-ba92-7520c37a8f17` **200**, `15:00 → 23:57` 저장 후 목록 재조회에서 **23:57** 확인.
- 별도 직접 API 재확인도 목록 4행, id 존재, `PATCH=200`, `15:00 → 23:58`, 저장 재조회 `23:58`이었다.

## ⑤ 잃으면 안 되는 것 재현

재판정에서 정상 확인된 항목을 다시 훼손하지 않았고, 기존 증거와 코드 호출처를 대조했다.

| 항목 | 확인 수치/근거 |
|---|---|
| 코멘트 작성·목록·해결·삭제 | 작성 201, 목록 200, 해결 200, 삭제 후 0행 — 재판정 실측 유지 |
| 전표정리 목록→상세 복원 | 목록 12행, 상세 200, 복원 결과 1행 — 재판정 실측 유지 |
| DPS 목록→상세 복원 | 목록 13행, 상세 200, 복원 결과 1행 — 재판정 실측 유지 |
| 인쇄 | 거래명세서 15행, 세금계산서 5행, 배차 1행 — 재판정 실측 유지 |
| tooltip | hover 대상 54개, 표시 tooltip 31개, UUID 0개 — 재판정 실측 유지 |
| 협업 wire | comment 8개·suggestion 4개 = 12개 보존 상태 |

## ⑥ 표시 축 유지 근거

이번 코드 diff는 백엔드 응답 DTO의 `UUID id`와 엔티티 매핑 2줄뿐이다. 데스크톱 `SlipCutoff`의 `id`는 이미 “수정/삭제 경로 key 전용”으로 선언되어 있고, 테이블은 배송태그·마감시각·활성·관리만 렌더링한다. 라이브 캡처에서도 UUID, `ID` 컬럼, UUID tooltip, placeholder가 0개였다.

## ⑦ CI 귀속

CI red의 `SlipCutoffAdminControllerIT.crud_happyPath`는 PR에서 cutoff 응답 `id`를 제거한 동일 원인이다. 최신 main의 해당 계약은 id를 반환하며 테스트가 통과한다. 이 라운드에서는 수정 후 cutoff 클래스 전체 **성공**을 확인했고, 전체 slip 테스트는 이전 실행 프로세스가 남긴 `build/test-results/test/binary/output.bin` 잠금으로 timeout되어 재실행을 중단했다. 테스트를 약화하거나 skip하지 않았다.

## ⑧ 스크린샷(행 수·경로)

두 장 모두 `QA_SHOTS_DIR`를 지정한 `resolveQaShotsDir()` 경유 경로이며 headless Chromium 실행 후 직접 열어 확인했다.

| PNG | 행 수·내용 |
|---|---|
| [01-cutoff-rows-before.png](C:/dev/Samhan-Public/.claude/worktrees/wuuid/docs/qa/1266-fix-round4/screenshots/01-cutoff-rows-before.png) | 목록 **4행**, 경동화물·경동택배·지방·야적 |
| [02-cutoff-saved-2357.png](C:/dev/Samhan-Public/.claude/worktrees/wuuid/docs/qa/1266-fix-round4/screenshots/02-cutoff-saved-2357.png) | 수정 모달과 재조회 목록, 저장값 **23:57** |

## ⑨ `git status --porcelain` 원문

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/dto/cutoff/SlipCutoffResponse.java
?? docs/qa/1266-fix-round4/
?? docs/qa/1266-sol-reverdict-2/
```

`git add`, commit, push는 하지 않았다. 재판정 디렉터리는 기존 미추적 산출물이며 건드리지 않았다.

## ⑩ 프로세스 회수

- 브랜치 JAR `28086`, QA proxy `28126`, Vite `5126/5127/5128`, Playwright Chromium을 종료했다.
- 격리 컨테이너 `codex1266-r4-pg`를 삭제했다.
- 최종 공유 `samhan-*` 컨테이너 수는 **24개**이며 공유 스택은 내리거나 변경하지 않았다.
- `.pid`, `.log`, debug 캡처 및 `clients/desktop` 하위 임시 캡처는 회수했다.
