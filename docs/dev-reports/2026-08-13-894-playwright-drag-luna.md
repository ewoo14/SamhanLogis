# #894 S2 Desktop Playwright 드래그 실패 판정 — CODEX LUNA

검증 시각: 2026-08-13 KST  
대상: `feat/894-internal-chat` · PR #1193  
제약: git 변경 계열 명령 미사용 · 공유 DB 쓰기 미수행

## 결론

판정은 **(c) flaky/환경 의존 실패**다. S2 독립 Electron 앱 추가가 대량 목록 드래그 계약을 깨뜨렸다는 근거는 없다. 현재 브랜치와 main 작업공간에서 같은 계약을 반복 실행했지만 모두 통과했고, 실패 스펙과 관련 구현은 `origin/main...HEAD`에 차이가 없다.

따라서 테스트를 느슨하게 고치거나 제품 코드를 수정하지 않았다. RED→GREEN 사이클도 해당 없음이다.

## 실행 및 재현율

실패 지점은 `clients/desktop/playwright/product-catalog/product-catalog.spec.ts` 시나리오 9의 다음 계약이다.

```text
대량 목록에서도 마우스 드래그 후 첫 행이 변경되어야 함
```

현재 PR 브랜치(`bf713eb8446679bb4762dc79147d8563311db6e2`):

```text
npx playwright test playwright/product-catalog/product-catalog.spec.ts --grep "시나리오 9" --repeat-each=5 --reporter=line
Running 5 tests using 1 worker
5 passed (26.4s)
실패 0 / 5, 재현율 0%
```

같은 브랜치에서 해당 스펙 파일 전체를 3회 반복했다.

```text
npx playwright test playwright/product-catalog/product-catalog.spec.ts --repeat-each=3 --reporter=line
Running 45 tests using 1 worker
45 passed (59.9s)
실패 0 / 45, 재현율 0%
```

main 대조 작업공간(`b8de5691af004038ee64d567640ad650cb8012e7`)에서도 동일 시나리오를 5회 실행했다.

```text
Running 5 tests using 1 worker
5 passed (29.6s)
실패 0 / 5, 재현율 0%
```

현재 `origin/main` 참조는 `ecb6785d8c37e28e6620fd8dc7b186d1acae06a9`이며, main 작업공간은 그보다 뒤처져 있다. `origin/main...HEAD` 비교에서 실패 스펙과 `ProductCatalogPage` 구현은 변경 없음이다. `origin/main`에는 날짜 테스트 핫픽스 PR #1194가 반영되어 있다.

CI의 동일 오류 2회와 이번 양쪽 작업공간의 반복 성공을 함께 보면, 헤드리스 마우스 드래그 타이밍에 의한 간헐 실패로 판정한다. 다만 이번 라운드의 로컬 표본은 0/5 및 0/45 실패이며, CI 실패를 로컬에서 다시 재현하지 못했다.

## (a)/(b)/(c) 근거

- **(a) 아님:** S2 독립 앱 파일은 `clients/internal-chat-desktop`에 추가되었고, 드래그 스펙/품목 카탈로그 구현은 `origin/main...HEAD`에서 차이가 없다. 독립 앱 추가가 desktop 드래그 런타임에 영향을 준 증거가 없다.
- **(b)로 단정하지 않음:** main 작업공간에서도 5회 모두 통과했다. 따라서 현재 재현 결과만으로 main 상시 실패라고 할 수 없다.
- **(c) 판정:** CI에서 같은 드래그 단언이 2회 실패했지만 현재 브랜치 5회 + 스펙 전체 45회 + main 5회가 모두 통과했다. 실패가 지속적 결함이 아니라 실행 환경/타이밍에 의존한다.

## 검증 결과

```text
clients/desktop npm run typecheck: EXIT 0
clients/desktop npm run build:     EXIT 0
```

`clients/desktop npm test`는 현재 PR 브랜치에서 기존 날짜 의존 테스트 1건으로 EXIT 1이다. 실패 원문은 다음과 같다.

```text
FAIL src/renderer/routes/SlipFormPage.test.tsx
preserves a user-edited N when M changes and exposes an M/N validation error
AssertionError: expected '2026-08-10' to be '2026-08-14'
Expected: "2026-08-14"
Received: "2026-08-10"
```

이는 S2와 무관한 기존 테스트이며, `origin/main`의 PR #1194 핫픽스 대상이다. 이 워크트리는 해당 머지 커밋을 포함하지 않으므로 현재 브랜치에서 전체 test green을 확인하지 못했다. 실패한 테스트를 느슨하게 변경하거나 이 PR에 핫픽스를 복제하지 않았다.

## 라이브 QA 불변식 재확인

선행 Live QA 산출물의 확인 내용을 변경하지 않았고, 다음을 잃지 않았다.

```text
패키징 앱 창 표시 · 본체 꺼져 있어도 독립 실행
트레이 상주 · 재열기 · 삼한이 아이콘 · 명시적 종료
NSIS 81,646,509 bytes · portable 81,495,134 bytes
본체(clients/desktop) typecheck · build 통과
arologis-desktop typecheck · test · build 통과
```

이번 라운드에는 패키징 앱을 다시 만들거나 라이브 QA를 재실행하지 않았다. 공유 DB 쓰기는 수행하지 않았다.

## 라운드 종료 점검

```text
git ls-files --deleted:
tools/.s24-build-only/build/deep/tracked-writer.mjs

git status --short:
 D tools/.s24-build-only/build/deep/tracked-writer.mjs

Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs:
False
```

삭제 추적 파일 한 줄: `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태지만 실제 파일이 없으며, git 변경 금지에 따라 복원하지 않았다.

Playwright/Vite/Electron 임시 프로세스는 테스트 종료 후 남지 않았다. 다른 Codex 세션의 일반 Node 프로세스는 식별 불가 상태에서 종료하지 않았다.

