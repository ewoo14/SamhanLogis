# PR #1057 R28 `COMPLETED` 편집·전이 정합성 수정

- 대상 HEAD: `6e497e2de` (detached HEAD, 사용자 제공값)
- 목적: R27이 확인한 OUTBOUND `COMPLETED → SHIPPING` 중 편집 폼 잔존으로 인한 409 도달 결함 수정
- 조사 원칙: RED-first. RED-A/B/C를 먼저 추가·실행하고 실패 원문을 기록한 뒤 최소 수정한다.
- 금지 범위: git 명령, Docker 이미지 재빌드·서비스 재배포, DB 쓰기, 지정된 동시 작업 파일, 백엔드 전이 의미 변경, 전체 테스트 스위트

## 작업 로그

### 2026-08-04 — 시작

- `docs/dev-reports/2026-08-04-874-r27-review.md`를 먼저 읽었다.
- R27의 재현 경로는 `COMPLETED` 상세에서 `수정` 진입 → 값 변경 → `완료 (배송 시작)` 성공 → `SHIPPING` 상태 갱신 후에도 편집 폼 유지 → `수정완료` 요청 409이다.
- R28의 불변식 A~E와 검증 명령을 작업 기준으로 고정했다.

### 원인 분석 — 수정 전

- `SlipDetailPage.tsx`의 `collabEditMode`는 `수정` 진입에서 `true`가 되지만, `transitionMutation.onSuccess`는 전표·목록·redline query만 invalidate하고 편집 모드를 닫지 않는다.
- `COMPLETED`의 OUTBOUND footer는 `ship`과 `collab-edit`를 동시에 제공한다. 따라서 `수정` 폼이 열린 상태에서 `완료 (배송 시작)`을 실행할 수 있다.
- 배송 시작 성공 뒤 상세 상태가 `SHIPPING`으로 바뀌면 백엔드 협업 수정 가드가 409를 반환하므로, 열린 폼을 성공 전이 직후 닫는 것이 상태 정합성을 회복하는 최소 수정이다.
- 가설: 전이 성공 callback에서 `setCollabEditMode(false)`를 호출하면 B를 해소하고, 전이 버튼/편집 진입 및 전이 없는 `수정완료` 경로에는 영향을 주지 않아 A·C·D·E를 보존한다.

## RED

### 수정 전 실행 원문

명령: `cd clients/desktop; npm exec vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ❯ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (10 tests | 1 failed) 18ms
   × SlipDetailPage lifecycle contract > RED-B: 전이 후 편집 폼 경로에서 409가 나지 않는다 10ms
     → expected '\n      void queryClient.invalidateQu…' to contain 'setCollabEditMode(false)'

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  12:04:41
   Duration  2.87s (transform 1.43s, setup 0ms, collect 2.21s, tests 18ms, environment 0ms, prepare 102ms)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-B: 전이 후 편집 폼 경로에서 409가 나지 않는다
AssertionError: expected '\n      void queryClient.invalidateQu…' to contain 'setCollabEditMode(false)'

- Expected
+ Received

- setCollabEditMode(false)
+
+       void queryClient.invalidateQueries({ queryKey: ['slip', id] })
+       void queryClient.invalidateQueries({ queryKey: ['slips'] })
+       // S2d-1 NB6: 임계 전이(send/inspect)가 redline anchor 를 세팅하므로 redline 도 갱신한다.
+       void queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
+       setRejectReason('')
+     },
+   })

 ❯ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts:76:36
    74|     )
    75|
    76|     expect(transitionSuccess?.[1]).toContain('setCollabEditMode(false)')
       |                                    ^
    77|   })
    78|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

- RED-A: 1개 통과 — `COMPLETED`에서 `ship`/`confirm`과 `collab-edit`가 함께 노출된다.
- RED-B: 1개 실패 — 전이 성공 callback이 `collabEditMode`를 닫지 않는다.
- RED-C: 1개 통과 — 전이와 독립된 `수정완료` 성공 callback은 여전히 편집 모드를 닫는다.

### RED 완료 — 수정 착수

- 실패 원인은 코드에서 확인한 가설과 일치한다. 전이 성공 후 상태 query만 무효화하고 `setCollabEditMode(false)`를 호출하지 않는 것이 RED-B의 직접 원인이다.
- 수정 범위는 `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`의 전이 성공 callback 1곳으로 제한한다.

## GREEN

### lifecycle contract GREEN 원문

명령: `cd clients/desktop; npm exec vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (10 tests) 9ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  12:05:35
   Duration  2.76s (transform 1.39s, setup 0ms, collect 2.16s, tests 9ms, environment 0ms, prepare 105ms)
```

- RED-A/B/C가 모두 GREEN이다.
- 변경은 전이 성공 callback의 `setCollabEditMode(false)`와 그 이유를 설명하는 주석뿐이다.

### partner-required GREEN 원문

명령: `cd clients/desktop; npm exec vitest run src/renderer/routes/SlipDetailPage.partner-required.test.tsx`

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ✓ src/renderer/routes/SlipDetailPage.partner-required.test.tsx (4 tests) 5ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  12:05:51
   Duration  2.75s (transform 1.43s, setup 0ms, collect 2.17s, tests 5ms, environment 0ms, prepare 124ms)
```

## 재현 경로와 해소 내용

### 결함 재현 경로

1. 거래처가 연결된 OUTBOUND `COMPLETED` 상세에서 `수정`을 눌러 협업 편집 폼에 진입한다.
2. 값을 변경한 채 `완료 (배송 시작)`을 누른다.
3. `/ship` 성공 후 상세 상태는 `SHIPPING`으로 갱신되지만, 수정 전에는 `collabEditMode=true`가 남아 `수정완료`가 노출됐다.
4. `수정완료`가 SHIPPING 협업 수정 가드에 도달해 409를 반환했다.

### 해소 내용

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1454`의 `transitionMutation.onSuccess`에서 `setCollabEditMode(false)`를 query invalidate보다 먼저 호출하도록 추가했다.
- 전이 성공 즉시 편집 폼이 닫히므로 새 상태 `SHIPPING`과 화면의 편집 affordance가 어긋나지 않고, 남은 폼에서 409를 다시 제출할 수 없다.
- `desktopFooterActions`의 `COMPLETED` 전이·편집 동시 제공은 유지했다(A).
- `SlipCollaborationPanel`의 전이 없는 `수정 → 수정완료` 성공 callback은 변경하지 않았다(C·D).
- `actionsForStatus`, `shouldBlockPartnerlessSend`, `삭제 요청` 렌더링, INSPECTING `inspect + reject`, 일반 SENT 취소, `PARTNER_ORDER` SENT 취소 미노출에는 변경이 없다(E).

### 검증 판정

- RED-A/B/C lifecycle contract: 10/10 GREEN.
- partner-required: 4/4 GREEN.
- 수정 파일: `SlipDetailPage.tsx`, `SlipDetailPage.lifecycle-contract.test.ts`.
- 수정하지 않은 금지 파일: 사용자 지정 목록 전체.

## 이 라운드가 보지 않은 것

- 실제 GUI/라이브 API로 DB 전표를 변경하거나 `COMPLETED → SHIPPING`을 발화하지 않았다. DB 쓰기와 공유 라이브 스택 변경 금지 조건 때문이다.
- 백엔드 서비스 코드는 읽거나 수정하지 않았고, `/ship` 의미와 SHIPPING 협업 수정 409 가드는 재현하지 않았다. R27 보고서의 끝단 추적과 이번 FE lifecycle contract를 근거로 검증했다.
- 전체 Vitest/전체 테스트 스위트, Docker 이미지 재빌드, 서비스 재배포, Git 작업은 수행하지 않았다.
- 캡처·실사용자 권한 조합·동시 사용자 경합은 이번 라운드 범위에 포함하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-04-874-r28-completed-edit-transition-fix.md` (본 보고서)
