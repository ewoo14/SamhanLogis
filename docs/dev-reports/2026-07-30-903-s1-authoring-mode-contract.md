# PR #998 / #903 슬라이스 1 — 저작 방식 공통 계약

- 구현일: 2026-07-30
- 범위: `WORD | EXCEL` 저작 방식 계약만 추가
- 제외: API, DB, migration, UI, renderer, 견적서·판매전표 출력 경로

## 고정한 계약

구현 파일은 `clients/desktop/src/renderer/print/templateAuthoringMode.ts`다.

- `TemplateAuthoringMode`는 `WORD | EXCEL`만 허용한다.
- 사용자 표시 라벨은 `워드 방식`, `엑셀 방식`으로 한 곳에서 제공한다.
- mode가 없던 legacy 양식의 기본값은 `WORD`다. 현재 결재 양식 renderer와 같은 안전한 기본값이다.
- `normalizeTemplateAuthoringMode(value: unknown)`는 정확히 `WORD`와 `EXCEL`만 보존한다.
- `undefined`, `null`, 빈 문자열, 대소문자가 다른 값, `PDF` 같은 미지의 문자열, 숫자·객체는 모두 `WORD`로 normalize한다.

이번 슬라이스에서는 새 계약을 기존 `TemplateEnvelope`나 저장/API/렌더 경로에 import하지 않았다. 따라서 다음 슬라이스가 계약을 import할 수 있지만 현재 동작은 그대로다.

## 불변식 확인

1. **기존 출력물 무변경**
   - 기존 `templateSchema.ts`, `DocumentRenderer.tsx`, `PrintLayout.tsx`, `ApprovalDocView.tsx`, `QuoteView.tsx`, `DispatchView.tsx`를 수정하거나 새 계약에 연결하지 않았다.
   - 기존 출력 관련 테스트를 실행했다: `document-template-fixtures.test.ts` 8개, `ApprovalDocView.test.tsx` 29개, 총 37개 통과.
2. **mode 누락 legacy 안전성**
   - `undefined`, `null`, 빈 문자열을 normalize 테스트에 넣고 모두 `DEFAULT_TEMPLATE_AUTHORING_MODE`인 `WORD`가 되는 것을 고정했다.
   - 기존 양식 parser/renderer에는 변경이 없어 누락 mode가 기존 경로에 영향을 줄 연결점이 없다.
3. **미지의 mode에서 비정상 renderer 선택 방지**
   - `word`, `PDF`, 숫자, 객체를 테스트하고 모두 `WORD`로 수렴하는 것을 고정했다.
   - 이번 파일은 renderer를 선택하지 않고 계약값만 반환하므로 미지의 값이 renderer 분기로 전달되지 않는다.
4. **다음 슬라이스의 안정적인 import 계약**
   - mode tuple, 타입, 라벨 map, 기본값, normalize 함수를 named export로 고정했다.
   - `npm run typecheck`가 통과해 strict TypeScript 계약을 확인했다.
5. **DB·API·migration 미변경**
   - 신규 파일은 FE 계약, FE 테스트, 이 리포트뿐이다.
   - `services/`, `migration/`, 기존 API·DB 타입과 package manifest에는 변경이 없다.

## 테스트 및 타입검증

계약 테스트:

```text
npx vitest run src/renderer/print/templateAuthoringMode.test.ts
Test Files  1 passed (1)
Tests       9 passed (9)
```

기존 출력 경로 회귀 테스트:

```text
npx vitest run src/renderer/print/document-template-fixtures.test.ts src/renderer/print/ApprovalDocView.test.tsx
Test Files  2 passed (2)
Tests       37 passed (37)
```

요구된 타입검증 명령 실행 원문:

```text
npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

ℹ tests 2
ℹ pass 2
ℹ fail 0

✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외)
...
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

첫 실행은 로컬 `file:` 의존성의 `clients/web/design-system/dist/index.d.ts`가 없어 중단됐다. 디자인 시스템에서 `npm ci`와 `npm run build`를 실행해 파생 산출물을 준비한 뒤 같은 `npm run typecheck`를 재실행했고, 위와 같이 종료 코드 0으로 통과했다. Docker·Gradle은 실행하지 않았다.

## 변경·신규 파일 목록 및 줄 수

`git diff --no-index --numstat -- NUL <파일>`로 신규 파일을 파일별 측정했다. 삭제 파일과 기존 추적 파일 변경은 없다.

신규 파일:

- `clients/desktop/src/renderer/print/templateAuthoringMode.ts` — `+18 / −0`
- `clients/desktop/src/renderer/print/templateAuthoringMode.test.ts` — `+24 / −0`
- `docs/dev-reports/2026-07-30-903-s1-authoring-mode-contract.md` — `+93 / −0`

변경 파일:

- 없음
