# PR #1151 R5 — 남은 호출 경로 조사 결과

## 결론

수정하지 않았다. 요청된 진단(`SlipInboundInstanceIT.입고_인스턴스_배치_생성`이 `sourceContext` 없이 호출)은 현재 HEAD `d1d9dfbab`와 일치하지 않는다. 해당 테스트에는 `입고_인스턴스_배치_생성`이라는 메서드가 없고, 존재하는 모든 `inboundInstances` 검증에는 이미 `any(SourceOperationContext.class)`가 있다.

또한 Desktop mock Playwright 게이트 소스에는 `SlipInboundInstanceIT`, `instances/batch`, `sourceContext`가 없다. 진단이 틀렸으므로 운영코드나 테스트를 임의로 고치지 않고 중단·보고한다.

## ① 재고 mutation 호출 기계적 전수

전수 기준은 `services/slip-service/src/main`·`src/test`의 `InventoryClient` mutation 호출과 `clients/desktop/playwright`의 관련 endpoint 문자열이다. 손으로 건수를 세지 않고 `rg -U`로 호출 블록을 수집했다.

| 호출 지점 | 파일:줄 | 구분 | sourceContext |
|---|---:|---|---|
| shipInstances | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1153` | 운영코드 | `sourceContext(slip)` 전달 |
| deduct | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1158` | 운영코드 | `sourceContext(slip)` 전달 |
| inboundInstances (`instances/batch`) | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1189-1192` | 운영코드 | `sourceContext(slip)` 전달 |
| inbound lot (line-id overload) | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1216` | 운영코드 | `sourceContext(slip)` 전달 |
| inbound lot | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1212` | 운영코드 | `sourceContext(slip)` 전달 |
| `SlipInboundInstanceIT` serial 정상/혼합/BORROW/실패 검증 | `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipInboundInstanceIT.java:120-122,157-159,175-177,303-305` | 테스트 | 모두 `any(SourceOperationContext.class)` |
| `SlipServiceTest` inboundInstances 검증 | `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java:447-546` | 테스트 | 모두 `any(SourceOperationContext.class)` |
| `InventoryClientTest` HTTP body | `services/slip-service/src/test/java/com/samhanair/logis/slip/client/InventoryClientTest.java:149-151` | 테스트 | `new SourceOperationContext(...)` 전달 |
| Desktop mock Playwright | `clients/desktop/playwright.config.ts:1-70` 및 `clients/desktop/playwright/**` | 게이트 | 관련 `SlipInboundInstanceIT`/`instances/batch`/`sourceContext` 0건 |

운영 client 자체도 `InventoryClient.java:110-258`의 4개 정방향 mutation에서 `putSourceContext`를 호출하며, `InventoryClient.java:326-327`에서 null을 즉시 거부한다. 운영코드 sourceContext 누락 호출은 0건이다.

## ② 기존 단정 삭제 유무

`git diff -- '*IT.java'` 원문:

```text
(출력 없음; 현재 워크트리에는 IT diff가 없음)
```

따라서 삭제된 기존 단정은 0건이다. 이번 조사에서 코드 단정은 삭제하지 않았다.

## ③ Desktop Playwright mock 회귀 hard gate 원문

실행 명령:

```text
cd clients/desktop
npx playwright test --config=playwright.config.ts --list
```

실행 원문:

```text
Error: Cannot find package '@playwright/test' imported from C:\dev\Samhan-Public\.claude\worktrees\t1142\clients\desktop\playwright.config.ts
code: 'ERR_MODULE_NOT_FOUND'
```

즉 게이트는 의존성 미설치로 시작하지 못했다. 실 DB 쓰기 금지 조건에 따라 JUnit/Testcontainers 실행도 하지 않았다.

## ④ 잃으면 안 되는 것 아홉 개

아래는 현재 워크트리의 기존 SOL/R4 기록에서 확인되는 원문이다. 이번 세션에서는 진단 불일치와 Playwright 의존성 미설치 때문에 DB를 쓰는 재실행으로 재확인하지 않았다.

1. **4개 API journal 정상 · revision 정확 · APPLIED** — `docs/dev-reports/2026-08-09-1151-r2-sol-reconv.md`: “다섯 call site(4 API)는 모두 `sourceContext(slip)`를 전달” 및 각 journal의 `APPLIED` 기록.
2. **5개 call site 제거 시 RED** — 같은 문서: “각 call site에서 context를 임시 제거했을 때 구계약 fail-fast가 RED”.
3. **실 Desktop 입고 완료 200 · journal NULL 0건** — 같은 문서의 Desktop 입고 완료 결과: “journal에 `slip_id`와 `slip_revision`을 남겼다”.
4. **전표 수정 revision 0→1 · journal slip_revision=1** — `docs/dev-reports/2026-08-09-1151-r2-sol-reconv.md`의 revision 회귀 결과.
5. **journal 제약 실패 전체 롤백** — `docs/dev-reports/2026-08-09-1151-r2-source-context.md`: “journal 제약/기록 실패 시 lot·잔량·movement와 함께 rollback”.
6. **NO_OP_EXISTING 생성 ID []** — `docs/dev-reports/2026-08-09-1151-s1-sol-review.md`: `instances/batch`의 기존 목표 수량 충족은 `NO_OP_EXISTING`이며 신규 ID 없음.
7. **정상 fixture 4/4 · 새 정방향 호출 0건 차단** — `docs/dev-reports/2026-08-09-1151-r4-module-sweep.md`: 최종 inventory `565 tests completed, 0 failed, 1 skipped`; 운영코드 누락 0건.
8. **Flyway V23→V24 validate · #1152 V25 순서** — 현재 HEAD에서 이 세션은 DB 검증을 실행하지 않았으며, 관련 기존 기록에도 이 항목의 실행 원문이 없어 확인 완료로 주장하지 않는다.
9. **기존 단정 삭제 0건 · 운영코드 누락 0건** — R4 기록의 “기존 단정 삭제 0건”, “운영코드의 sourceContext 누락 0건”; 현재 `git diff -- '*IT.java'`도 빈 출력.

## 신규 파일 경로 목록

- `docs/dev-reports/2026-08-09-1151-r5-remaining-call-site.md`

코드 변경·커밋·푸시는 없고, 실 DB 쓰기도 없었다.
