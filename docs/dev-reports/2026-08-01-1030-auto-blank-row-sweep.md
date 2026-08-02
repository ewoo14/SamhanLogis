# 1030 자동 빈행 방식 통일 개발 보고서

## 확인 1 — 작업 범위·현재 상태

- 요청 대상은 `EstimateFormPage.tsx`, `JournalFormPage.tsx`이며 `SlipFormPage.tsx`의 기존 자동 빈행 동작을 판매전표에서 유지한 채 공용화한다.
- 금지 범위는 입금보고서, 다른 서비스 모듈, 공유 Docker 재빌드·재기동, 실 DB 쓰기다.
- `design-system` 공용 컴포넌트는 변경하지 않는 방향으로 확인한다. 변경 시 Playwright mock 스위트를 별도 실행한다.

## 확인 2 — RED-first 원문

공용 계약 테스트 `src/renderer/utils/autoBlankRow.test.ts`를 먼저 작성하고 구현 없이 실행했다.

```text
RUN v2.1.9 .../clients/desktop
src/renderer/utils/autoBlankRow.test.ts (0 test)
Test Files 1 failed (1)
Tests no tests
Error: Failed to load url ./autoBlankRow ... Does the file exist?
```

실패 원인은 의도한 공용 유틸이 아직 없어 자동 빈행 계약을 충족하지 않는 상태였기 때문이다.

## 확인 3 — 공용화 설계 및 구현

- `clients/desktop/src/renderer/utils/autoBlankRow.ts`를 신설했다.
- `appendBlankRowIfLastChanged`: 마지막 행의 실제 내용 변경 때 변경 행 아래에 빈행 하나를 추가한다. 비마지막 행 편집은 변경만 반영한다.
- `filterMeaningfulRows`: 저장 시 빈행/불완전 행을 제외한다.
- `removeLinePreservingMinimum`: 판매전표 기준의 마지막 빈행 삭제 및 화면별 최소 행 전제를 공통 처리한다.
- `SlipFormPage.tsx`: 기존 자동 증식·실제 변경 판정·최소 1행 동작을 공용 유틸에 연결했다.
- `EstimateFormPage.tsx`: 사용자 입력 경로만 공용 자동 증식에 연결하고 협업 동기화/비동기 갱신은 증식에서 제외했다.
- `JournalFormPage.tsx`: 데스크톱·모바일 사용자 행 변경을 공용 자동 증식에 연결하고 최소 2행 삭제 전제를 유지했다. 합계는 기존처럼 모든 행을 합산하되 빈행은 0원이라 차·대변에 영향을 주지 않으며, 저장은 `filterMeaningfulRows`를 사용한다.

## 확인 4 — 불변식 B·C 실행 원문

공용 계약 테스트를 실행해 저장 제외와 균형 계산을 확인했다.

```text
npm exec vitest run src/renderer/utils/autoBlankRow.test.ts
✓ src/renderer/utils/autoBlankRow.test.ts (4 tests)
Test Files 1 passed (1)
Tests 4 passed (4)
```

핵심 출력: 저장 대상 uid는 `debit, credit`만 남고 `blank`는 제외되며, 차변 합계 `1000`, 대변 합계 `1000`으로 일치했다.

## 확인 5 — 대상 회귀 테스트 원문

```text
npm exec vitest run src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/JournalFormPage.test.tsx src/renderer/routes/SlipFormPage.test.tsx
Test Files 3 passed (3)
Tests 69 passed (69)
```

판매전표 기존 테스트 57건이 모두 통과해 기준 화면 동작이 바뀌지 않았고, 분개전표 기존 테스트 8건도 모두 유지됐다.

## 확인 6 — typecheck 원문

```text
npm run typecheck
Exit code: 0
typecheck:real-qa: tests 2, pass 2, fail 0
```

사전 신선도 게이트가 요구한 로컬 산출물은 `clients/web/design-system`과 데스크톱만 로컬 빌드했다. 공유 Docker·실 DB는 사용하지 않았다.

## 확인 7 — 데스크톱 전체 테스트 원문

```text
npm test -- --reporter=dot
Test Files 188 passed (188)
Tests 1712 passed (1712)
Exit code: 0
```

`design-system` 컴포넌트 소스는 수정하지 않았으므로 별도 Playwright mock 스위트는 필요하지 않았다.

## 확인 8 — 최종 재검증 원문

저장 필터 연결 후 최종 실행을 다시 확인했다.

```text
npm run typecheck
Exit code: 0
typecheck:real-qa: pass 2, fail 0

npm test -- --reporter=dot
Test Files 188 passed (188)
Tests 1712 passed (1712)
Exit code: 0
```

이번 작업에서는 `git` 명령, 공유 Docker 재빌드·재기동, 실 DB 쓰기를 실행하지 않았다.
