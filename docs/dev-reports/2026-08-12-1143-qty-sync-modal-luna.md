# 1143 수량 동기화 모달 + 부자재 칩 — CODEX LUNA

## RED-first 원문

불변식 1~5를 겨냥한 `clients/desktop/src/renderer/routes/quantitySyncTargetModal.test.ts`를
구현 코드보다 먼저 추가했다.

실행:

```text
npm test -- --run src/renderer/routes/quantitySyncTargetModal.test.ts
```

기존 pretest actor 경계 검사는 5/5 통과했다. 신규 테스트는 다음 RED로 종료했다.

```text
Test Files  1 failed (1)
Tests       no tests
Error: Failed to load url ./quantitySyncTargetModal
Does the file exist?
```

이는 모달 도메인 모듈이 아직 없어 발생한 기능 부재 RED다.

## 설계 메모

- 기존 수량 동기화 rule/source/target API 계약과 replace-all 저장 경로를 유지한다.
- target에 특징(`componentVariant`)·형상(`componentShape`)을 추가하고, 형상 후보는
  빈 값·원형·사각으로 고정한다.
- 구성품 편집 화면의 특징 후보를 공유 상수로 추출해 PANEL은 기본·블랙·승강·공청,
  REMOTE는 기본·유선·컬러를 동일하게 사용한다.
- 기존 target을 모달 draft로 모두 복사한 뒤 저장하므로 무변경 저장에서 기존 26건을
  누락하지 않는다.

## 검증 결과

- RED 후 GREEN: `quantitySyncTargetModal.test.ts` 5 passed / 0 failed.
- 직전 표면 회귀 포함 focused: `ProductFormPage.test.tsx` 12 passed / 0 failed,
  `EstimateItemsCatalogPage.test.ts` 8 passed / 0 failed,
  `quantity-sync-chip.contract.test.ts` 5 passed / 0 failed,
  신규 테스트 5 passed / 0 failed. 합계 30 passed / 0 failed.
- Desktop 타입 컴파일: `npx tsc -p tsconfig.node.json --noEmit` 및
  `npx tsc -p tsconfig.web.json --noEmit` 통과.
- `npm run typecheck`는 두 tsc와 real-QA 개별 테스트까지 실행했으나,
  저장소의 real-QA 범위 검사 단계가 종료 코드 1로 끝났다. warning/경로 범위
  산출물 때문에 실패했으며 TypeScript 오류는 없었다.
- Desktop 전체 `npm test -- --run`은 다수 테스트 통과 후 Node 24 tinypool
  `Worker exited unexpectedly`로 종료되어 전량 성공을 주장하지 않는다.
- product-service `compileJava` 성공. `QuantitySyncRuleValidationTest` focused 성공.
- product-service 전체 테스트: `:services:product-service:test` 성공,
  `BUILD SUCCESSFUL` (2분 50초).
- 공유 DB 쓰기·격리 DB 기동·컨테이너 기동은 하지 않았다.

## 무변경 저장 26건 유지 원문

신규 RED/GREEN 테스트의 원문 assertion은 다음과 같다.

```text
const existing = Array.from({ length: 26 }, (_, index) => panel(`TARGET-${index + 1}`))
const request = toQuantitySyncTargetRequest(existing)
expect(request).toHaveLength(26)
expect(request.map((target) => target.productCode))
  .toEqual(existing.map((target) => target.modelCode))
```

GREEN 실행 결과:

```text
quantitySyncTargetModal.test.ts (5 tests) — 5 passed / 0 failed
```

replace-all API 요청도 기존 target draft 전체를 순서대로 매핑하고, 특징·형상은
빈 값이면 NULL로 보내므로 기존 26건을 삭제하지 않는다.

## 마이그레이션 근거

대조 명령은 git read-only `git ls-tree`로 각 local branch의
`services/product-service/src/main/resources/db/migration`을 검사했다.

```text
현재 HEAD/작업 브랜치: max V40 (V38 없음, V39·V40 존재)
main:                 max V37
머지 안 된 다른 local branch: max V37 이하 (V38~V40 없음)
```

따라서 신규 번호는 V41이며, 이미 적용된 V40은 수정하지 않았다.
추가 파일: `V41__quantity_sync_target_component_options.sql`.

## 미완료

- 라이브 QA 및 26건 실 DB 대조는 공유 DB 쓰기 금지 조건 때문에 수행하지 못했다.
- Desktop 전체 테스트 전량 green은 tinypool worker 종료 때문에 확인하지 못했다.
- 라운드 종료 시 추적 삭제 상태였던 `tools/.s24-build-only/build/deep/tracked-writer.mjs`
  는 HEAD 원문 한 줄로 복구했다. `.codex-tmp/1143-liveqa`의 종료된 임시 산출물과
  프로세스는 정리했다.
