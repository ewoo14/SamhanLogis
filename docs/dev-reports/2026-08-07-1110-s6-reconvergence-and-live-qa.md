# #1110 S6 — 머지 전 재수렴 및 독립 라이브 QA

## 결론

- 브랜치/HEAD: `fix/1110-collab-revision-authority` / `64978ee4350be8575499062a815f17a259916f37`
- 제품 코드, commit/push, 컨테이너 rebuild/redeploy, DB 직접 변경 없음
- 두 세션 핵심 ①②③⑤와 3세션·재연결·5초 경합·페이지 재진입은 headless 라이브에서 통과했다.
- 동일 `commitId` 2회(④)는 기존 소비자 단위 테스트에서 invalidate 3회만 발생함을 재확인했다. 실 broker에는 같은 `commitId`를 재주입/replay하는 경로가 없어 라이브 중복 주입은 하지 못했다.
- 경로별 RED-C는 직접 저장·협업 저장·revision 복원·soft delete/복원·상태전이를 라이브로 밟았다. 생성·전환·outbox는 비가역 외부 산출을 만들지 않기 위해 실제 서비스 경로 테스트로만 재확인했다.
- **S6 결함 수: 2.** 따라서 이 라운드 기준 머지 게이트 ①은 닫히지 않았다.

## 환경 확인 — 직접 확인한 배포본

| 항목 | 직접 확인값 |
|---|---|
| git HEAD | `64978ee4350be8575499062a815f17a259916f37` |
| 컨테이너 | `samhan-partner-order-service` / `8bed96d49305588f565c6aa1a552d716f3676eba8f50adc567bb72b46c9b4381` |
| image | `sha256:cb3877401aba3a851d0d2ead2feeb1635f4689b665fef35ef8800b6d13b00118` |
| image created | `2026-08-07T13:44:00.06888497Z` |
| container started | `2026-08-07T13:44:11.195155684Z` = 22:44:11 KST |
| 상태 | `running` / `healthy` |
| 배포 JAR | `/app/app.jar` 안에 `PartnerOrderAuthorityEventPublisher.class`, `$1.class` 존재 |

렌더러는 `VITE_API_BASE_URL=http://127.0.0.1:8080`, mock off, `vite.renderer.dev.config.ts`, HashRouter, `headless: true`로 실행했다. 첫 준비 실행에서 `vite.web.config.ts`를 사용해 BrowserRouter 홈에 착지한 false RED가 있었고 제품 판정에서 제외했다. 이후 목표 화면의 `partner-order-collaboration-panel`을 첫 단정으로 고정했다.

## 두 세션/세션 확장 실측

| 번호 | 결과 | 직접 측정 |
|---|---|---|
| ① B 저장 → A revision 목록 갱신 | PASS | A가 버전 overlay를 연 상태에서 B가 협업 저장. A의 `/revisions` GET 수와 화면 revision 행 수가 모두 증가. `A-02-red-c-save-refresh.png` |
| ② A 미저장 중 B 복원 → A 초안 생존 | PASS | A의 `S6-A-미저장-초안-*`가 B 복원 직후 및 5.5초 재조회 경합 뒤에도 동일. `A-03-unsaved-draft.png`, `A-05-draft-preserved-after-5s.png` |
| ③ 복원 후 A·B 동일 | PASS | A overlay 취소 후 A·B가 같은 서버 값. 추가 C 세션도 같은 값. `A-06-restored-converged.png`, `C-06-restored-converged.png` |
| ④ 같은 사건 2회 → 목록 2회 갱신 금지 | PASS(단위), 라이브 미실시 | `PartnerOrderCollaborationPanel.coedit.test.tsx`가 같은 `commit-1`을 2회 전달해도 상세/revision/목록 invalidate 합계 3회만 발생. 실 broker의 같은 identity 재주입 경로는 없음. |
| ⑤ 이후 A 편집 → B 계속 전파 | PASS | B 컨텍스트를 offline→online으로 강제 재연결한 뒤 A 저장이 B와 C 모두에 도달. `B-07-after-reconnect-propagated.png` |

추가로 C가 목록으로 이탈했다 상세로 재진입했을 때 최신 상세을 읽었다(`C-08-reentry-current-detail.png`). 세 브라우저 context는 각자 격리했고 매 테스트 `finally`에서 닫았다.

## S5 신규 표면

| 표면 | 판정 | 근거 |
|---|---|---|
| `authorityCommitIdsRef` 무한 증가 | **FAIL — 결함 1** | `useRef<Set<string>>(new Set())` 뒤 `has`/`add`만 있다. `delete`, `clear`, 크기 상한, TTL이 전혀 없다. 오래 열린 상세 화면에서 권위 커밋 수만큼 문자열이 누적된다. |
| SSE 재연결 후 이미 소비한 ID | 부분 PASS | 같은 mount의 Set은 재연결 동안 유지된다. offline→online 후 신규 사건 전달은 라이브 PASS. 서버/클라이언트가 `Last-Event-ID`나 사건 backlog를 구현하지 않아 이미 소비한 사건의 실제 replay는 발생시키지 못했다. |
| 페이지 이탈/재진입 | PASS(현재 transport) | remount로 Set은 초기화되지만 서버가 옛 사건을 replay하지 않아 최신 detail 1회로 진입했다. transport가 향후 replay를 도입하면 cross-mount dedupe는 없다. |
| 5초 재조회와 사건 경합 | PASS | 복원 사건과 coedit 5초 재조회가 겹쳐도 A overlay draft가 5.5초 뒤 유지됐다. |
| overlay 열린 채 권위 갱신 | PASS | 핵심 ②에서 직접 확인. |
| 동시 복원 | **FAIL — 결함 2** | 동일 revision을 동시 POST한 첫 실측이 `200,500`. 서버 로그는 `PartnerOrderRevisionService.restore:308`의 `ObjectOptimisticLockingFailureException`이 `GlobalExceptionHandler`의 unhandled 500으로 누출됨을 보였다. 재실행은 `200,200`으로 비결정적이었다. 성공한 경합 뒤 A 미저장 draft 자체는 5.5초 뒤에도 유지(`CONCURRENT-12-draft-preserved.png`). |
| 3개 이상 세션 | PASS | A/B/C가 복원 후 동일 값, 재연결 후 후속 저장도 B/C에 전달. |

### 결함 1 — commitId Set 수명 누수

제품 위치:

```text
PartnerOrderCollaborationPanel.tsx:138  new Set()
PartnerOrderCollaborationPanel.tsx:188  has(commitId)
PartnerOrderCollaborationPanel.tsx:189  add(commitId)
```

정리 경로 검색 결과 0건이다. 페이지를 떠나 unmount하면 회수되지만 장시간 열린 상세 화면에서는 무제한 증가한다.

### 결함 2 — 동시 복원 optimistic-lock 500

두 요청 중 하나가 커밋되는 경합에서 다른 요청의 `PartnerOrder` `@Version` 충돌이 업무 409로 변환되지 않는다.

```text
ObjectOptimisticLockingFailureException
  at PartnerOrderRevisionService.restore(PartnerOrderRevisionService.java:308)
  at PartnerOrderRevisionController.restoreRevision(...:161)
  → GlobalExceptionHandler: Unhandled exception
  → HTTP 500
```

사용자가 제시한 갈래 밖의 셋째 가능성은 **동시 복원이 정상 직렬화되거나 409로 수렴하지 않고, 타이밍에 따라 `200,500` 또는 `200,200`으로 갈리는 것**이다.

## 권위 경로 8개별 RED-C

| 경로 | 다른 세션 revision 재조회 | 근거 수준 | 판정 |
|---|---:|---|---|
| 생성 | 공통 consumer 계약상 가능 | `PartnerOrderRevisionService.capture(CREATE)` 발행 테스트 + 공통 authority consumer 테스트 | PASS(서비스/소비 결합), **라이브 미실시** |
| 직접 저장 | 예 | 실 API 전체 PUT 뒤 열린 A overlay의 `/revisions` GET 증가; `PATH-09-direct-save-refresh.png` | PASS(라이브) |
| 협업 저장 | 예 | B 협업 저장 뒤 A GET/행 증가 | PASS(라이브) |
| revision 복원 | 예 | B 복원 뒤 A 상세/revision 재검증 및 A/B/C 수렴 | PASS(라이브) |
| 삭제 | 예 | soft delete 뒤 열린 타 세션 `/revisions` GET 증가, 제품 API로 즉시 복원 후 다시 GET 증가; `PATH-11-delete-restore-refresh.png` | PASS(라이브) |
| 상태전이 | 예 | hold와 release 각각 타 세션 `/revisions` GET 증가; `PATH-10-status-transition-refresh.png` | PASS(라이브) |
| 전환 | 공통 consumer 계약상 가능 | `PartnerOrderConvertServiceTest`, `PartnerOrderMergeConvertServiceTest` publisher 1회 단정 + 공통 consumer 테스트 | PASS(서비스/소비 결합), **라이브 미실시** |
| outbox | 공통 consumer 계약상 가능 | `SlipPublishOutboxResultWriterTest`의 연결 주문 COMMITTED publisher 단정 + 공통 consumer 테스트 | PASS(서비스/소비 결합), **라이브 미실시** |

S5 라이브가 실제로 밟은 것은 협업 저장과 revision 복원뿐이었다. 직접 저장·삭제·상태전이는 S6에서 추가했고, 생성·전환·outbox는 라이브로 밟지 않았다. 따라서 “8개 모두 라이브 E2E”라고 보고하지 않는다.

## 검증 명령과 결과

```text
npx playwright test --config playwright/1110-s6-live-qa/playwright.config.ts
  핵심 3세션: 1 passed (18.1s)
  경로별 직접 저장/상태/삭제: 1 passed (4.5s)
  동시 복원 관측: 첫 실행 200,500 + 서버 stack; 재실행 200,200, draft 보존 1 passed (9.0s)
  반복 통합 실행: 2 passed / 핵심 1 timeout(앞선 DELETE revision 누적으로 복원 표본 오염)
  복원 표본을 다시 만든 뒤 핵심 3세션 단독 fresh 재실행: 1 passed (17.9s)

npx vitest run ...PartnerOrderCollaborationPanel.coedit.test.tsx ...SalesPartnerOrderDetailPage.coedit.test.tsx
  2 files / 25 tests passed

gradlew :services:partner-order-service:test \
  --tests '*PartnerOrderAuthorityEventRedATest' \
  --tests '*PartnerOrderRevisionServiceTest' \
  --tests '*PartnerOrderDeleteServiceTest' \
  --tests '*PartnerOrderHoldServiceTest' \
  --tests '*PartnerOrderConvertServiceTest' \
  --tests '*PartnerOrderMergeConvertServiceTest' \
  --tests '*SlipPublishOutboxResultWriterTest'
  BUILD SUCCESSFUL
```

## 본 범위와 안 본 범위

본 범위:

- 현재 HEAD/배포 JAR 직접 확인
- headless 실 gateway/SSE/REST, 2~3 격리 세션
- 직접 저장·협업 저장·revision 복원·delete/restore·hold/release
- reconnect, remount, 5초 경합, overlay draft, 동시 restore
- 8개 producer의 관련 서비스 테스트와 공통 consumer 멱등 테스트

안 본 범위:

- 생성·전환·outbox의 라이브 E2E(새 주문/판매전표/outbox 외부 산출을 만들지 않음)
- 동일 commitId를 실 broker에 인위적으로 재주입하는 라이브 시험(주입 API/backlog 없음)
- 장시간 실제 heap profile(무상한 Set은 코드 경로로 확정)
- CollabCoeditService in-memory 영속 문제
- CI 42/42 재실행(사용자가 제시한 exact SHA 결과를 대체하지 않음)

## 새 파일 목록

- `clients/desktop/playwright/1110-s6-live-qa/playwright.config.ts`
- `clients/desktop/playwright/1110-s6-live-qa/1110-s6-live-qa.spec.ts`
- `docs/dev-reports/2026-08-07-1110-s6-reconvergence-and-live-qa.md`
- `docs/qa-shots/1110-s6-live-qa/*.png` (17장)
