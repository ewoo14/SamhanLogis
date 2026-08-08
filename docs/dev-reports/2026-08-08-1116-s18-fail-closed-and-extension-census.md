# #1116 S18 — fail-closed 및 확장자 census

## 판정

S17에서 남은 탐지 범위 결함 3건을 수정했다.

- 파일 후보를 읽지 못하면 `continue`하지 않고 `unable to read evidence candidate` 오류로 실패한다. 읽기 실패를 non-writer로 취급하는 fail-open 경로를 제거했다.
- `git ls-files -z`로 저장소 확장자 집합을 만들고, 각 확장자가 관할(`.bat`, `.cjs`, `.cts`, `.ejs`, `.js`, `.mjs`, `.ps1`, `.py`, `.sh`, `.ts`, `.tsx`) 또는 이유가 적힌 명시적 제외 맵에 속하는지 테스트한다.
- `.cts`와 `.bat`를 discovery/G3 관할에 추가했다.
- Python writer 휴리스틱을 Pillow `.save`/`savefig`뿐 아니라 `open(...).write(...)`, `Path.write_text`, `Path.write_bytes`, `cv2.imwrite`, `imageio.imwrite`까지 확장했다. Batch는 `>`, `>>`, `copy`, `xcopy`, `type`의 `docs\\qa`/`docs\\manual` 목적지를 검사한다.

Python 휴리스틱은 정적 근사다. Python AST 전체를 해석하지 않으므로 동적으로 조립된 호출, 별칭을 통한 임의 writer, subprocess가 실행하는 writer까지 완전하게 덮지는 않는다. 현재 가드가 책임지는 저장 경로 신호를 명시적으로 덮고, 미지원 형태는 이 한계로 남긴다.

## 테스트 우선 검증

먼저 추가한 S18 테스트는 다음 결함을 RED로 재현했다.

- 읽기 실패 테스트: `Cannot redefine property`를 피하기 위해 실제 discovery read seam을 주입해 후보 read 예외를 재현했다. 수정 전에는 예외 없이 후보가 탈락했다.
- extension census: `git ls-files -z` 출력이 Node 기본 `spawnSync` 버퍼를 넘을 수 있어 `maxBuffer`를 고정했다.
- Python/batch probe: 수정 전 Python probe는 모집단에 들어오지 않았고 Batch probe는 writer로 판정되지 않았다.

수정 후 S18 신규 3건은 모두 통과했다.

## 지정 전체 명령 원문

명령은 파이프 없이 `clients/desktop`에서 실행했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 56 passed (56)
Vitest Duration 19.59s (transform 62ms, setup 0ms, collect 150ms, tests 18.99s, environment 0ms, prepare 101ms)
```

실행 결과 exit code는 0이다. 외부 wall-clock은 **21.3초**로 측정됐다. S17 최종 기준 19.70초보다 **약 1.60초 증가**했다. 226초 제한을 넘지 않았다.

추가로 `npx tsc -p tsconfig.web.json --noEmit`을 실행했으나, 현재 worktree에서 `@samhan/design-system` 모듈을 해석하지 못해 실패했다. 해당 모듈 누락으로 인한 기존 implicit-any 연쇄 오류가 함께 발생했으며, S18 변경 파일의 오류로 시작하지 않았다.

## 유지 확인

전체 56건에서 다음 기존 계약이 계속 GREEN이다.

- 내용 SHA-256 기반 cache invalidation
- ignored output 제외 및 non-ignored generator RED
- `.ts`와 중첩 `.ps1` 도달
- 저장소 밖 link 제외
- 주석/문자열 언급·문서·marker 보유 파일 green
- `git diff --check` 통과

## probe 정리 및 파일 상태

S18에서 만든 `tools/.s18-probes` 아래 probe는 각 테스트의 `finally`에서 제거했고, 최종 `Test-Path tools/.s18-probes`는 `False`였다.

이번 라운드 신규 파일은 다음 보고서 1건이다.

- `docs/dev-reports/2026-08-08-1116-s18-fail-closed-and-extension-census.md`

수정 파일은 `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`다. 기존에 작업 트리에 있던 S13/S17 미추적 보고서는 건드리지 않았다. 커밋·push는 하지 않았다.

## 미실시

- 커밋·push·Docker 조작
- SHA-256 충돌 공격
- Linux/macOS 파일 잠금 동작
- Python AST 전체 파싱 또는 동적 subprocess writer 탐지
