# #999 `origin/main` 병합 충돌 해소 보고서 — CODEX LUNA

## 결론

`origin/main` 병합 중 발생한 충돌은 `clients/desktop/src/renderer/api/slip.ts` 한 파일이었다. 임의로 한쪽을 채택하지 않고 두 계약을 모두 보존했다.

- 브랜치 쪽 `getSlipByNumber(slipNo, slipType)` 유지: 재고수불부 전표번호 모달이 업무번호와 유형으로 조회하고, 검색 결과의 opaque 식별자를 내부 상세 요청에만 사용한다.
- `origin/main` 쪽 `getOutboundSlipBySlipNo(slipNo)` 유지: 출력/상세 진입 문서번호를 먼저 검색하고 날짜·전표번호 exact 재조회 후 상세로 진입한다.
- 두 함수 모두 화면 표시값은 전표번호이며 UUID를 표시하지 않는다. `getSlip`은 검색 결과 내부 opaque id로만 호출된다.

따라서 #1179의 상세 진입 계약과 이 브랜치의 opaque token 축·전표 모달 계약을 동시에 살렸다.

## 병합

실행 명령:

```text
git merge origin/main
```

원문:

```text
Auto-merging clients/desktop/src/renderer/api/slip.ts
CONFLICT (content): Merge conflict in clients/desktop/src/renderer/api/slip.ts
Automatic merge failed; fix conflicts and then commit the result.
```

충돌 표식은 제거했으나, 개발책임자 지시대로 `git add`·commit·push는 실행하지 않았다. 현재 Git 상태의 `UU`는 PM이 해결 내용을 확인한 뒤 stage/commit해야 한다는 뜻이다.

## 머지 후 검증 원문

### Desktop typecheck

명령:

```text
npm run typecheck
```

결과:

```text
Exit code: 0
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa
✔ playwright/... real-QA scope checks
ℹ tests 51
ℹ pass 51
ℹ fail 0
```

### Desktop 변경 모듈 테스트

명령:

```text
npm test -- --run src/renderer/api/slip.test.ts src/renderer/print/approvalSlipLineLink.test.ts src/renderer/routes/warehouse/StockSlipDetailModal.test.tsx src/renderer/routes/dispatch-board/components/SlipDetailModal.test.tsx
```

원문 요약:

```text
✓ src/renderer/api/slip.test.ts (11 tests)
✓ src/renderer/print/approvalSlipLineLink.test.ts (5 tests)
✓ src/renderer/routes/dispatch-board/components/SlipDetailModal.test.tsx (2 tests)
Test Files 3 passed (3)
Tests 18 passed (18)
```

`StockSlipDetailModal.test.tsx`는 저장소에 존재하지 않아 실행되지 않았다. 따라서 해당 모달의 별도 컴포넌트 자동 테스트는 못 돌렸다.

### inventory-service 전량

명령:

```text
.\gradlew :services:inventory-service:test --no-daemon
```

생성된 Gradle report 원문:

```text
tests 642
failures 0
ignored 1
successful 100%
```

opaque decoder 별도 계약:

```text
.\gradlew :services:inventory-service:test --tests com.samhanair.logis.inventory.client.SlipClientTest --no-daemon
BUILD SUCCESSFUL in 13s
18 actionable tasks: 1 from cache, 17 up-to-date
```

`OpaqueUuidDecoder` 및 `SlipClientTest.getSlip_decodesSlipServiceOpaqueIdsAcrossTheServiceBoundary` 계약은 통과했다.

### slip-service 전량

명령:

```text
.\gradlew :services:slip-service:test --no-daemon
```

원문:

```text
1875 tests completed, 45 failed
Task :services:slip-service:test FAILED
BUILD FAILED
```

Gradle report 집계도 다음과 같다.

```text
tests 1875
failures 45
ignored 0
successful 97%
```

실패 유형은 `IllegalArgumentException`, `DataIntegrityViolationException`, 권한/상태 전이 assertion 등이며, 이번 충돌 파일의 타입체크·변경 모듈 테스트 실패로 나타난 것은 아니다. 전량은 실패했으므로 PASS로 판정하지 않는다.

## 불변식 재확인

1. **양쪽 계약**: `getSlipByNumber`와 `getOutboundSlipBySlipNo`를 모두 보존했다. 상세 진입·뒤로가기 라우팅은 호출자 측 계약을 삭제하지 않았고, 전표 모달은 기존 `StockSlipDetailModal`의 `getSlipByNumber` 호출을 유지한다.
2. **요청 URL·응답 본문 UUID 0건**: `slip.test.ts`의 “검색·상세 요청 URL과 두 응답 본문 전체에 UUID가 없어야 한다” 테스트가 통과했다. opaque id는 내부 API 경계에서만 사용된다.
3. **라이브QA3 보존**: 이번 수정은 `slip.ts`의 조회 helper 병존만 변경했고, QR·serialKey·재고실사 바코드·수불부 집계·컬럼/태그·S2a 상태 잠금 도메인 코드는 건드리지 않았다. 2026-08-02~17 라이브QA3의 FINAL_GATE=PASS 결과를 재실행해 덮어쓰지는 않았다.
4. **inventory opaque decoder**: `SlipClientTest` 별도 통과로 서비스 경계 decoder 회귀가 없음을 확인했다.

## 전표 모달 실제 확인

공유 DB 쓰기 금지 조건 때문에 라이브 화면을 다시 열지 않았다. 대신 자동 렌더 테스트를 실행했고 `SlipDetailModal` 테스트 2건이 통과했다. 재고수불부 전용 `StockSlipDetailModal` 테스트 파일은 존재하지 않아 그 경로의 실제 렌더 자동 검증은 못 했다. 모달 네트워크 400/404/500의 라이브 재확인은 못 했으며, 기존 라이브QA3 결과를 보존 기록으로 남긴다.

## 라운드 종료 점검

추적 삭제 파일 확인 명령:

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
```

`tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재하며 삭제되지 않았다.

테스트가 만든 Gradle single-use daemon은 각 테스트 종료 시 종료되었다. 종료 점검에서 보인 Java 프로세스는 다른 워크트리 `w1072`의 `accounting-service` 테스트였으므로 건드리지 않았다. 본 라운드에서 격리 컨테이너/임시 디렉터리를 새로 만들지 않았고, 공유 DB 쓰기 명령은 실행하지 않았다.
