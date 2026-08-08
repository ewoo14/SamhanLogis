# PR #1138 / 이슈 #1116 — S6 재수렴 적대검증

- 대상 HEAD: `d12c5e5cf`
- 판정: **BLOCKING 1건**
- 중단 사유: 여섯 resolver가 같은 선언 계약을 구현한다는 전제가 실제 실행에서 틀렸다. 사용자 지시인 “전제가 틀리면 고치지 말고 중단·보고”에 따라 결함 재현 후 나머지 각도는 중단했다.
- Docker: 조회·재기동·변경 없음
- 커밋된 QA/매뉴얼 증거: 덮어쓰기 없음

## 결함 1 — Bash의 `regenerate` 선언이 무시되어 매뉴얼 재생성 도구를 과차단한다

`scripts/lib/qa-shots-dir.sh`는 두 번째 인자 `regenerate`를 받아 `protect=0`으로 계산한다(249~251행). 그러나 이후 보호 분기(265~285행)는 `$protect`를 한 번도 참조하지 않는다. `QA_SHOTS_DIR`가 있으면 보호 루트를 항상 계산하고, 그 안이면 항상 `QA_ALLOW_OVERWRITE=1`을 요구한다.

커밋 파일을 쓰지 않도록 이미 존재하는 `docs/manual/screenshots` 자체를 `committedDir`와 `QA_SHOTS_DIR`에 동일하게 넣고 재생성 선언만 직접 실행했다.

```bash
source scripts/lib/qa-shots-dir.sh
export QA_SHOTS_DIR="$PWD/docs/manual/screenshots"
unset QA_ALLOW_OVERWRITE
resolve_qa_shots_dir "$QA_SHOTS_DIR" regenerate
```

실제 결과:

```text
[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: .../docs/manual/screenshots.
명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.
exit 1
```

동일 입력에서 다른 다섯 구현은 모두 재생성 선언을 받아 exit 0이었다.

| 구현 | 재생성 선언 | 결과 |
|---|---|---:|
| `.ts` | `{ protect: false }` | ALLOW, exit 0 |
| `.mjs` | `{ protect: false }` | ALLOW, exit 0 |
| `.cjs` | `{ protect: false }` | ALLOW, exit 0 |
| `.ps1` | `-ProtectionMode Regenerate` | ALLOW, exit 0 |
| `.sh` | 두 번째 인자 `regenerate` | **BLOCK, exit 1** |
| `.py` | `protect=False` | ALLOW, exit 0 |

따라서 “`.ts`·`.mjs`·`.cjs`·`.ps1`·`.sh`·`.py` 여섯 벌의 같은 선언 계약”은 성립하지 않는다. Bash 소비자가 커밋된 캡처를 의도적으로 재생성하려 하면 `QA_ALLOW_OVERWRITE=1`이라는 별도 전역 우회를 요구하므로 과차단이다.

## 행위 울타리가 이 결함을 놓친 이유

`S5 행위 울타리 — 커밋 캡처가 있는 docs 루트는 보호 또는 재생성 선언으로 분류된다`는 Git 모집단은 실제로 계산하지만, resolver 행위 배열은 `.cjs`·`.mjs`·`.ts` 세 벌만 포함한다(`qa-output-path-guard.test.cjs` 152~157행). `.ps1`·`.sh`·`.py`의 재생성 행위는 검사하지 않는다.

재생성 도구 세 곳도 실제 호출 결과가 아니라 소스에 문자열 `protect: false`가 들어 있는지만 센다(158~166행). 그 결과 전체 가드가 53/53 GREEN이어도 `.sh`의 죽은 `protect` 변수와 `regenerate` 과차단을 잡지 못했다. 현재 울타리는 Git 모집단 계산 면에서는 행위 기반이지만, **6종 선언 parity와 재생성 분류 면에서는 행위 기반이 아니다.**

사용자가 요구한 뮤테이션 두 건은 전제 불일치 중단 뒤 실행하지 않았으므로 별도 판정을 내리지 않는다.

## 커밋 캡처 모집단과 기본 보호

다음 명령으로 현재 HEAD의 커밋 캡처를 다시 계산했다.

```powershell
git -c core.quotePath=false ls-files -- 'docs/**/*.png' 'docs/**/*.jpg' 'docs/**/*.jpeg'
```

| Git 계산 루트 | 파일 수 |
|---|---:|
| `docs/character` | 8 |
| `docs/design` | 13 |
| `docs/dev-reports` | 23 |
| `docs/manual` | 161 |
| `docs/migration` | 16 |
| `docs/qa` | 6,042 |
| `docs/qa-shots` | 452 |
| `docs/templates` | 1 |
| 합계 | **6,716** |

전체 경로 가드 실행은 53 passed / 0 failed였다. 이 실행에서 Node 3벌 기준으로 8개 Git 계산 루트의 기본 보호, 선언을 잊은 `docs/dev-reports` spec의 기본 차단, 기본 `<committedDir>/_local`, `QA_ALLOW_OVERWRITE=1`, 외부 경로, 자기 UNC·LAN IP UNC·subst·junction 및 외부 UNC 허용이 통과했다. 다만 위 결함 때문에 이것을 여섯 구현 전체의 통과로 확대하지 않는다.

## `protect: false` 세 도구의 실제 실행

세 호출자는 모두 `docs/manual/screenshots` 계열을 재생성하는 도구이며 확정 QA 증거를 쓰는 도구로 관측되지 않았다.

의존성 미설치 상태의 첫 실행은 `playwright`·`sharp` 모듈 부재로 실패했다. `tools/manual-capture/package.json`과 README가 선언한 대로 해당 디렉터리에서 `npm install --no-package-lock` 후 저장소 밖 임시 `QA_SHOTS_DIR`로 다시 실행했다.

| 도구 | 실행 조건 | 실제 결과 |
|---|---|---|
| `capture-manual-all.js` | `SAMPLE_ONLY=1`, `BASE_URL=http://127.0.0.1:1` | exit 0, 자체 fallback placeholder 2장 생성 |
| `generate-mobile-placeholders.js` | 외부 `QA_SHOTS_DIR` | exit 0, placeholder 8장 생성 |
| `sync-screenshots.js` | 문서화된 `output/` + placeholder 선행조건 구성, 외부 `QA_SHOTS_DIR` | exit 0, 143장 복사, 매뉴얼 링크 130/130 존재 |

첫 sync 실행은 문서화된 `tools/manual-capture/output` 선행조건이 없어 exit 1이었고, 그 디렉터리와 placeholder를 구성한 재실행은 exit 0이었다. 이는 가드 과차단이 아니라 도구가 명시한 입력 선행조건이다.

## 실행 위생

- 공유 Docker 스택 명령: 0건
- 공유 Gradle 데몬 명령: 0건
- 커밋된 QA 또는 매뉴얼 PNG 대상 쓰기: 0건
- 캡처 산출: 전부 `%TEMP%/samhan-1116-s6-*` 아래
- 코드·테스트 수정, 커밋, push: 없음
- 저장소 신규 추적 대상: 본 보고서 1개
- 검증을 위해 일시 생성한 ignored 항목: `tools/manual-capture/node_modules/`, `tools/manual-capture/output/_placeholder-screenshot-pending.png` (라운드 종료 전에 제거)

## 이 라운드가 보지 않은 것

전제 불일치 시 중단하라는 지시에 따라 다음은 판정하지 않았다.

- 기본값을 `protect=false`로 뒤집는 뮤테이션의 RED 여부
- Git 계산을 하드코딩 목록으로 바꾸는 뮤테이션의 RED 여부
- `.ps1`·`.sh`·`.py`를 포함한 여섯 구현의 전체 동일 입력 행렬(재생성 선언 행렬만 직접 실행)
- `committedDir`가 `docs` 밖일 때의 여섯 구현 전체 행렬
- H-2 가드 전수
- design-system 회귀
- `VITE_API_BASE_URL=http://127.0.0.1:1` Desktop mock 격리 회귀
- 현재 PR SHA의 GitHub CI 상태
