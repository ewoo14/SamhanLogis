# #1110 S8 — S7 최종 재검증 및 라이브 QA

## 결론

- 브랜치/HEAD: `fix/1110-collab-revision-authority` / `5a922e547b09f13f3f3b9d0fd44ae095ce20ec0e`
- PR #1115 CI: **42/42 pass** (`nonSuccess=0`)
- 제품 코드, commit/push, 컨테이너 rebuild/restart, DB 직접 변경 없음
- RED-B와 라이브로 밟은 RED-C는 headless 실 gateway/SSE/REST에서 다시 통과했다.
- FIFO는 실제 기본 상한 2,048을 넘겨 경계를 확인했다. 창 안 중복은 한 번만 소비하지만 퇴출된 ID는 다시 소비된다. 실 InMemory broker에 같은 `commitId`를 재주입할 공개 수단이 없어 broker 중복 재주입은 **판정 불가**다.
- 동시 복원은 배포본에서도 `200 + 409`가 아니었다. 2요청 12회와 별도 Playwright 1회가 전부 `200,200`, 8요청 burst 5회도 전부 200이었다. 500은 관측되지 않았지만 두 요청이 모두 RESTORE revision을 남겼다.
- 409가 발생하더라도 현재 UI는 BE 충돌 이유를 버리고 일반 실패 문구만 표시한다.
- **S8 결함 수: 2.** 따라서 이 라운드 기준 머지 게이트는 닫히지 않았다.

## 환경 확인 — 직접 확인한 배포본

| 항목 | 직접 확인값 |
|---|---|
| git | `fix/1110-collab-revision-authority` / `5a922e547b09f13f3f3b9d0fd44ae095ce20ec0e` |
| 컨테이너 | `samhan-partner-order-service` / `b382ac38d40bde5a27561a03ce140f32ec135922a2a4580010300e67b47e60e3` |
| image | `sha256:0042cb1ded15f72aeebea57f4b28dd696dbdffd8b741c1573278d16ca8261c3f` |
| container created | `2026-08-07T14:56:46.768879019Z` = `2026-08-07 23:56:46.768 KST` |
| container started | `2026-08-07T14:56:52.58061199Z` = `2026-08-07 23:56:52.580 KST` |
| 상태/profile | `healthy` / `dev` |
| 배포 JAR | `/app/app.jar`의 `PartnerOrderRevisionService.class` 존재 |
| 배포 클래스 문자열 | `OptimisticLockingFailureException` 참조 2건, `CONFLICT` 1건 |

렌더러는 S6와 같은 `VITE_API_BASE_URL=http://127.0.0.1:8080`, mock off, `vite.renderer.dev.config.ts`, HashRouter, `headless: true`로 실행했다. 인앱 브라우저 backend는 0개여서 repo에 이미 있던 S6 headless Playwright 하네스를 수정 없이 재실행했다. QA 종료 때 renderer 프로세스와 자식 프로세스를 회수했다.

## 1. 동시 복원 409 실측

### 측정 결과

대상 주문 `2026-08-07-1`, 대상 revision `39`에 대해 실 gateway로 같은 복원을 동시에 보냈다.

| 시도 | 결과 | revision 변화 |
|---|---|---:|
| 2요청 동시 × 12회 | **12/12 모두 `200,200`** | `39 → 63`, 정확히 `+24` |
| 8요청 동시 burst × 5회 | **40/40 모두 `200`** | `63 → 103`, 정확히 `+40` |
| headless Playwright 별도 2요청 | **`200,200`** | 두 요청 모두 성공 |

- 전체 측정에서 409는 0건, 500도 0건이었다.
- 적어도 한 요청이 정상 완료되어야 한다는 조건은 충족했으나, 패자가 없고 양쪽 모두 RESTORE revision을 생성했다.
- 실 detail 재조회는 HTTP 200이었다. 성공한 복원의 최종 상태는 정상 조회됐다.
- 서비스 로그에도 이 측정 구간의 `ObjectOptimisticLockingFailureException`, unhandled 500, “동시 복원 충돌” 로그는 없었다.

### 원인 경계

S7 변경은 `saveAndFlush`가 실제로 `OptimisticLockingFailureException`을 던질 때만 409로 번역한다. `PartnerOrder`에는 `@Version(lock_version)`이 있으나, 두 트랜잭션의 읽기/flush가 겹치지 않고 순차 유효화되면 두 번째 요청도 정상 커밋된다. 즉 예외 번역은 500 누출을 막지만, 동일 복원 요청을 단일 승자로 만드는 직렬화/멱등 조건은 아니다. 이번 측정은 이 셋째 갈래를 일관되게 재현했다.

### 결함 1 — `200 + 409` 단일 승자 계약 미충족

**FAIL.** 요청된 계약은 한 요청만 성공하고 나머지는 409여야 하지만, 배포본은 동시 호출을 모두 정상 복원으로 수용했다. S6의 `200,200` 비결정 갈래가 제거되지 않았다.

### 결함 2 — 409 사용자 메시지 손실

BE의 409 이유는 읽을 만하다.

```text
동시에 복원된 주문입니다. 다른 사용자의 복원이 먼저 완료되어 다시 조회해 주세요.
```

그러나 `PartnerOrderVersionHistoryPanel`의 restore mutation `onError`는 오류 본문을 읽지 않고 다음 고정 문구만 `role="alert"`로 표시한다.

```text
주문 복원에 실패했습니다. 다시 시도해 주세요.
```

따라서 실제 409가 발생해도 진 사용자는 다른 사용자의 선행 복원인지 알 수 없다. 이번 배포본에서는 409 자체가 발생하지 않아 실패 토스트의 라이브 캡처는 만들 수 없었지만, UI 소비 코드는 분기 없이 고정되어 있어 판정은 **FAIL**이다.

## 2. FIFO 2,048 경계와 RED-D

실 제품 모듈 `AuthorityCommitDeduper`를 기본 생성자로 실행해 2,048을 실제로 넘겼다.

```json
{
  "defaultMax": 2048,
  "sizeAtLimit": 2048,
  "insideDuplicate": false,
  "over": true,
  "sizeOver": 2048,
  "oldAgain": true,
  "finalSize": 2048
}
```

판정:

- 2,048개까지 크기 상한 유지: **PASS**
- 창 안 동일 `commitId` 중복 소비 1회: **PASS** (`consume` 두 번째 결과 `false`)
- 2,049번째 이후 크기 2,048 유지: **PASS**
- 퇴출된 가장 오래된 `commit-1` 재수신: 다시 `true`; 상세·revision·목록 3종이 다시 invalidate됨
- Vitest: deduper + consumer `2 files / 7 tests passed`

### 실 broker 재주입

**판정 불가.** 현재 dev 배포는 `InMemoryRealtimeBroker`다. `publish`는 JVM 내부 bean 메서드이고, 외부 authority publish/replay endpoint가 없다. `PartnerOrderAuthorityEventPublisher`는 매 발행마다 새 UUID를 만들며, Redis hook/backlog/`Last-Event-ID` replay도 현재 구성에는 없다. 컨테이너 재빌드·프로세스 instrumentation·새 주입 endpoint 없이 동일 identity를 실 broker에 넣을 수 없다. 따라서 synthetic FE 호출로 PASS를 만들지 않았다.

실무 도달성은 현재 transport에서 낮다. 한 mount가 유지되는 동안 2,049개의 서로 다른 권위 업무 쓰기가 같은 주문에 발생해야 퇴출이 시작되고, 퇴출된 UUID가 다시 오려면 현재 없는 replay가 추가로 필요하다. 다만 향후 broker replay/backlog가 생기면 RED-D 보장 범위가 달라지므로 server retention보다 큰 window 또는 서버 sequence가 필요하다.

## 3. RED-C 생성·전환·outbox 잔여

| 경로 | S8 라이브 | 다른 세션 목록 갱신 판정 | 발화 조건/근거 |
|---|---|---|---|
| 생성 | 미실시 | **판정 불가** | 새 주문 생성 transaction의 CREATE revision commit 후 authority publish |
| 전환 | 미실시 | **판정 불가** | `/partner-orders/{id}/convert-to-slip` 또는 merge 전환 성공 후 `CONVERT` publish; 판매전표·재고 산출 동반 |
| outbox | 미실시 | **판정 불가** | 전표 발행 outbox writer가 연결 주문을 `COMMITTED` 또는 영구 실패로 기록한 뒤 publish |

세 경로 모두 producer 계약과 공통 consumer 코드는 존재하지만, S8에는 기존 무수정 headless 하네스로 안전하게 발화할 표본이 없었다. 특히 전환/outbox는 실제 판매전표·재고/비동기 산출을 만들므로 이번 “코드 수정·DB 직접 변경·컨테이너 재빌드 금지” 범위에서 새 주입 하네스를 만들지 않았다. 이를 결함 0 또는 PASS로 세지 않는다.

## 4. RED-B 전수 및 라이브 RED-C 회귀

기존 S6 headless 하네스를 현재 배포본에 다시 실행했다: **3 passed (33.5s)**.

| 항목 | 판정 | 직접 확인 |
|---|---|---|
| A 미저장 초안 + B 복원 | **PASS** | 복원 직후와 5.5초 재조회 뒤 동일 초안 유지; `A-05-draft-preserved-after-5s.png` |
| A·B·C 수렴 | **PASS** | overlay 취소 뒤 세 세션 동일 서버 값 |
| 재연결 후 후속 편집 전파 | **PASS** | B offline→online 후 A 협업 저장이 B/C에 도달; `B-07-after-reconnect-propagated.png` |
| 직접 저장 RED-C | **PASS** | 열린 다른 세션 revision GET/행 증가; `PATH-09-direct-save-refresh.png` |
| 협업 저장 RED-C | **PASS** | B 저장 뒤 A의 revision GET/행 증가; `A-02-red-c-save-refresh.png` |
| 복원 RED-C | **PASS** | B 복원 뒤 A 상세/revision 재조회와 A/B/C 수렴; `B-04-authority-restore.png` |
| 삭제/복원 RED-C | **PASS** | delete와 restore 각각 열린 세션 revision 재조회; `PATH-11-delete-restore-refresh.png` |
| 상태전이 RED-C | **PASS** | hold/release 각각 열린 세션 revision 재조회; `PATH-10-status-transition-refresh.png` |
| 동시 복원 중 A 초안 | **PASS** | `200,200` 뒤에도 즉시/5.5초 뒤 초안 유지; `CONCURRENT-12-draft-preserved.png` |
| 공유 Y.Doc snapshot 쓰기 금지 | **PASS(코드)** | authority handler는 `commitId` 소비 후 React Query 3종 invalidate만 수행. Y.Doc/coedit update/snapshot 호출 없음 |

스크린샷 17장은 `docs/qa-shots/1110-s8-live-qa/`에 있다. 실제 실행 시각은 `2026-08-08 00:15:47~00:16:12 KST`다.

## 검증 명령과 결과

```text
gh pr checks 1115 --json ...
  total=42, pass=42, nonSuccess=0

배포 JAR unzip/strings
  PartnerOrderRevisionService.class 존재
  OptimisticLockingFailureException=2, CONFLICT=1

동시 restore 실 gateway
  2요청 × 12회: 12/12 모두 200,200; revision +24
  8요청 × 5회: 40/40 모두 200; revision +40
  409=0, 500=0

기본 FIFO 경계 실행
  2,048 유지; 창 안 중복 false; 2,049번째 후 퇴출 ID 재소비 true

npx vitest run authorityCommitDeduper.test.ts PartnerOrderCollaborationPanel.coedit.test.tsx
  2 files / 7 tests passed

npx playwright test --config playwright/1110-s6-live-qa/playwright.config.ts
  3 passed (33.5s)
  concurrent restore statuses=200,200
```

## 결함 수

```text
S6: 2
S8: 2
```

1. 동시 복원이 단일 승자 `200 + 409`가 아니라 반복적으로 `200,200`; 중복 RESTORE revision 생성
2. 409 발생 시 FE가 동시 충돌 이유를 버리고 일반 실패 문구만 표시

FIFO 실 broker 중복 재주입과 생성·전환·outbox 라이브는 **판정 불가**이며 결함 0에 포함하지 않았다.

## 본 범위와 안 본 범위

본 범위:

- exact HEAD/42 checks/재배포 컨테이너·image·JAR 클래스 직접 확인
- 실 gateway 동시 복원 반복 및 고밀도 burst, 응답/후속 revision/detail 확인
- FIFO 실제 기본 상한 2,048 초과 실행과 consumer 단위 회귀
- 실 gateway/SSE/REST headless 3세션 RED-B
- 직접 저장·협업 저장·복원·삭제/복원·hold/release RED-C
- reconnect, remount, 5초 경합, 공유 Y.Doc 비쓰기 코드 확인
- 신규 스크린샷 육안 확인

안 본 범위:

- 동일 `commitId`의 실 InMemory broker 강제 재주입
- 생성·전환·outbox의 다른 세션 목록 갱신 라이브 E2E
- 실제 409 UI 토스트 캡처(배포본에서 409 미발생; 고정 generic `onError` 코드는 확인)
- CollabCoeditService in-memory 영속 문제
- 컨테이너 재빌드/restart, DB 직접 조회/수정, 코드 수정, commit/push

## 새 파일 목록

- `docs/dev-reports/2026-08-07-1110-s8-final-reconvergence.md`
- `docs/qa-shots/1110-s8-live-qa/*.png` (17장)

기존 미추적 `clients/desktop/playwright/1110-s5-live-qa/`, `1110-s6-live-qa/`는 수정하지 않았다. 하네스가 실행 중 기존 S6 추적 PNG를 갱신했으나 S8로 복제한 뒤 해당 S6 변경만 HEAD로 복원했다.
