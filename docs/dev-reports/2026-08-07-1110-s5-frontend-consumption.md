# #1110 S5 — 프런트 권위 사건 소비

작성일: 2026-08-07  
브랜치: `fix/1110-collab-revision-authority`  
HEAD: `60cf62ef2`

## 환경 확인

사용자 제공 문구를 전제로 하지 않고 직접 확인했다.

- `samhan-partner-order-service`: `Up 2 minutes (healthy)`, 생성 시각 `2026-08-07 22:44:03 +0900 KST`
- 실행 명령: `java -jar /app/app.jar`
- `/app/app.jar` 내부에 다음 클래스가 실제 존재했다.
  - `BOOT-INF/classes/com/samhanair/logis/partnerorder/realtime/PartnerOrderAuthorityEventPublisher.class`
  - `BOOT-INF/classes/com/samhanair/logis/partnerorder/realtime/PartnerOrderAuthorityEventPublisher$1.class`
- 컨테이너 재빌드·재생성은 하지 않았다.

## 구현 방법

`PartnerOrderCollaborationPanel`의 기존 `/collab/stream` 소비 경계에서 `partner-order:authority`만 별도 처리한다.

1. payload에서 `commitId`만 읽고, 문서 내용·snapshot·Y.Doc은 읽지 않는다.
2. 컴포넌트 생명주기 동안 `Set<commitId>`로 중복 사건을 버린다.
3. 최초 사건만 다음 query를 무효화한다.
   - `['partner-order', orderId]` — 상세 재조회
   - `['partner-order-revisions', orderId]` — revision 목록 재조회
   - `['partner-orders']` — 목록 재조회
4. 편집 overlay draft는 edit mode 진입 시 한 번만 초기화한다. 원격 상세 query가 갱신되어도 현재 세션의 미저장 값은 덮지 않는다.
5. 공유 Y.Doc에는 어떠한 서버 snapshot도 쓰지 않는다. 기존 coedit provider의 정상 Yjs update 경로는 그대로 둔다.

## RED-A~E 동시 판정

| 불변식 | 결과 | 증거 |
|---|---|---|
| RED-A 복원 결과가 활성 세션에 수렴 | GREEN | 두 세션 headless 실측: A overlay 종료 후 최신 revision 목록 표시, B 상세 최신값 표시 |
| RED-B 복원이 다른 세션 미저장 초안을 삭제하지 않음 | GREEN | A의 `S5-A-미저장-초안`이 B 복원 뒤 그대로 유지됨; `A-04-draft-preserved.png` |
| RED-C 모든 revision 경로 목록 갱신 | GREEN | B 저장 후 revision 증가/표시, 복원 후 목록 재조회; 단위 테스트는 상세·revision·목록 3 query를 고정 |
| RED-D 동일 commitId 중복 소비 결과 1회 | GREEN | `PartnerOrderCollaborationPanel.coedit.test.tsx`: 같은 사건 2회 전달에도 invalidate 3회만 발생 |
| RED-E 이후 정상 update 계속 병합 | GREEN | 복원 후 A 후속 저장이 B 상세에 도달; `B-06-after-restore-propagated.png` |

## 두 세션 실측

headless Chromium context A/B를 동시에 띄웠다. SSE는 gateway에 직접 연결해 장기 스트림을 버퍼링하지 않도록 했다.

1. B 저장 → A revision 목록 갱신 경로 확인.
2. A가 `S5-A-미저장-초안`을 입력한 상태에서 B가 이전 revision 복원.
3. A의 미저장 overlay 값 보존 확인.
4. A overlay 종료 후 revision 목록과 서버 상세 수렴 확인.
5. A 후속 저장 후 B의 `요청사항` 값 갱신 확인.
6. 매 실행 후 `finally`에서 A/B context를 닫았고, 남은 `5176` Vite PID도 실행 경로를 확인해 회수했다.

스크린샷: [`docs/qa-shots/1110-s5-live-qa`](../qa-shots/1110-s5-live-qa)

## 필수 3절

### 새 조합 열거 및 실행 결과

- 두 세션: 실행 GREEN.
- 편집 중 원격 복원: 실행 GREEN; A draft 보존.
- 동시 복원: 코드 경계상 각 사건은 commitId별 독립 처리되며 Y.Doc 직접 쓰기 없음. 동일 seed에 대한 destructive 동시 복원은 데이터 오염을 피하기 위해 별도 유발하지 않았다.
- overlay 열린 채 권위 갱신: 실행 GREEN.
- SSE 끊김 후 재연결: `createRealtimeClient`의 기존 reconnect 경로와 authority 소비 Set 보존을 정적 확인. 이번 라운드에서는 실 스트림을 강제 절단하지 않았다.
- 5초 재조회와 겹침: authority는 React Query invalidate만 수행하며 중복 commitId는 Set에서 차단. 단위 테스트로 1회 소비 고정.
- 같은 commitId 재수신: 실행 GREEN(단위 테스트). 재수신은 상세/revision/목록 invalidate를 추가 호출하지 않는다.

### 제거·이동·개명 식별자 grep

이번 변경에서 식별자를 제거·이동·개명하지 않았다. `rg` 전수 확인 결과 기존 `PartnerOrderCollabRealtimeClient`, `createCoeditProvider`, `PartnerOrderVersionHistoryPanel` 참조는 유지되고, 신규 사건 식별자는 `partner-order:authority` 한 곳의 소비 경계와 테스트에만 추가됐다.

### 변경 파일 참조 테스트 전부 실행

- `npx vitest run --config vitest.config.ts src/renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx`
  - 2 files, 25 tests passed
- `npx tsc -p tsconfig.web.json --noEmit` — passed
- `npx eslint src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx src/renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx` — passed
- headless Playwright `1110-s5-live-qa`: 1 test passed

`npm test` 전체 스크립트는 사전 가드에서 Electron `out/main/index.js`가 없다고 중단되므로, 해당 가드를 우회하지 않고 동일 Vitest 대상 파일을 직접 실행해 검증했다.

## 신규 파일 목록

- `clients/desktop/playwright/1110-s5-live-qa/1110-s5-live-qa.spec.ts`
- `clients/desktop/playwright/1110-s5-live-qa/playwright.config.ts`
- `docs/qa-shots/1110-s5-live-qa/A-01-initial.png`
- `docs/qa-shots/1110-s5-live-qa/A-02-unsaved-draft.png`
- `docs/qa-shots/1110-s5-live-qa/A-04-draft-preserved.png`
- `docs/qa-shots/1110-s5-live-qa/A-05-revision-converged.png`
- `docs/qa-shots/1110-s5-live-qa/B-01-initial.png`
- `docs/qa-shots/1110-s5-live-qa/B-03-authority-restore.png`
- `docs/qa-shots/1110-s5-live-qa/B-06-after-restore-propagated.png`

변경 파일은 커밋·푸시하지 않았다.
