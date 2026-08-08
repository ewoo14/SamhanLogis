# #1116 S6 — S5 머지 전 최종 재수렴

## 결론

PR #1118의 exact head `d5236a9bc4de092cefc5cb96dbfe0b95427580ff`에서 CI 43/43은 모두 성공했고, S5가 추가한 `자격 소비자 discovery 계약 테스트`도 실제 GitHub Actions 로그에서 실행됐다. 자격 discovery의 확장자·키·접근 문법·새 루트 뮤테이션도 전부 RED를 만들었다.

그러나 **S6 결함은 1건**이다. 모듈 수준 `discoveredEvidenceWritersCache`는 한 번 계산된 뒤 무효화할 방법이 없어, 같은 Vitest 프로세스에서 한 테스트가 새 writer 파일을 만들면 뒤 호출은 낡은 캐시를 반환한다. 실제 순서 뮤테이션이 `exit 1`로 이 상태를 재현했다. 따라서 이 검증 기준으로는 아직 머지 게이트 0결함이 아니다.

## 1. CI runner 실행 확인

### exact SHA와 체크 수

```text
PR:       #1118
head:     d5236a9bc4de092cefc5cb96dbfe0b95427580ff
CI run:   31185572761
job:      92889124828
workflow: CI
job name: Credential Plaintext Guard (SP-08-8)
checks:   43/43 SUCCESS
```

GitHub job API와 원문 로그에서 다음 step을 확인했다.

```text
자격 소비자 discovery 계약 테스트
run: node --test scripts/lib/qa-credentials.test.cjs
started:   2026-08-07T14:03:03Z
completed: 2026-08-07T14:03:07Z
tests 7 / pass 7 / fail 0 / cancelled 0 / skipped 0
duration_ms 3160.852094
```

따라서 이 계약 테스트는 43개 check 중 `Credential Plaintext Guard (SP-08-8)` check 내부의 실제 step으로 실행됐다. 잡 전체도 `conclusion: success`다.

### `scripts/**`만 바뀌는 커밋의 트리거

`.github/workflows/ci.yml`은 `pull_request`와 main `push`에 `paths` 허용 목록을 두지 않고 `paths-ignore`만 둔다. 제외 목록은 아로로지스 전용 경로, 일부 workflow, `infrastructure/grafana/**`, `docs/**`이며 `scripts/**`는 없다. 따라서 `scripts/**`만 바뀐 PR은 `pull_request` CI를, main 반영은 `push` CI를 발동시킨다. 최근 200개 커밋에는 변경 파일 전부가 `scripts/**`인 표본이 없어 과거 서버 run으로 교차 확인하지는 못했으며, 이 판정은 exact SHA의 workflow 이벤트/필터 정적 판독이다.

### 지금 위반 파일을 넣었을 때 CI가 RED인가

커밋·push 금지 조건 때문에 GitHub에 고의 red run을 만들지는 않았다. 대신 CI step과 정확히 같은 명령을 사용했다.

1. `scripts/.s6-ci-red-probe.mjs`에 `process.env.qa_password` 직접 읽기를 임시 추가했다.
2. `node --test scripts/lib/qa-credentials.test.cjs` 실행 결과 **exit 1, fail 1**.
3. probe를 즉시 삭제했다.

Actions step의 shell은 `/usr/bin/bash -e`이고 run 명령도 위 한 줄이므로, 이 파일을 PM이 push하면 해당 step의 non-zero가 잡을 RED로 만든다. 이는 로컬 동등 명령에 의한 확인이며 실제 GitHub 고의-red run을 실행했다는 뜻은 아니다.

## 2. discovery 뮤테이션 재실행

### 확장자·키 이름·접근 문법

계약 테스트의 해당 case만 별도 실행했다.

```text
node --test --test-name-pattern "확장자·키 대소문자·접근 문법" scripts/lib/qa-credentials.test.cjs
1 passed / 0 failed / exit 0 / 3,086.6805 ms
```

이 case는 레포 루트 아래 임시 디렉터리를 만들고 다음 파일을 모두 discovery 결과에 포함한다고 각각 단언한 뒤 `finally`에서 디렉터리를 삭제한다.

| 축 | 임시 파일과 내용 | 결과 |
|---|---|---|
| 확장자 | `.bat`, `.cmd`, `.psm1`, `.zsh`, `.cts`, 무확장 | 6/6 발견 |
| 키 | `QA_PASSWORD`, `qa_password`, `MY_QA_SECRET_PASSWORD` | 대소문자·복합 키 모두 발견 |
| 접근 문법 | `%…%`, `$env:…`, `${…}`, `process.env.…`, `os.environ.get(…)`, `getenv(…)` | 모두 발견 |

`__ENV.…`는 `ACCESS_PATTERNS`에 포함된다. `perf/k6/mixed-load.js`만 정확한 파일 단위 런타임 경계 예외이고, S4에서 `perf`의 다른 임시 파일이 같은 접근을 쓰면 RED임을 확인했다. 이번 S6의 새 루트 probe는 `process.env`를 사용해 이 예외가 루트 전체로 번지지 않았음도 다시 확인했다.

### 새 루트

각 루트에 `.s6-credential-probe.mjs` 한 파일만 만들고 CI와 같은 전체 계약 테스트를 실행한 뒤, 다음 루트로 가기 전에 삭제했다. 내용은 `process.env.MY_QA_SECRET_PASSWORD` 직접 읽기다.

| 임시 경로 | 결과 |
|---|---|
| `tools/.s6-credential-probe.mjs` | exit 1, fail 1, probe 지목 |
| `perf/.s6-credential-probe.mjs` | exit 1, fail 1, probe 지목 |
| `infrastructure/.s6-credential-probe.mjs` | exit 1, fail 1, probe 지목 |
| `shared/.s6-credential-probe.mjs` | exit 1, fail 1, probe 지목 |
| `services/.s6-credential-probe.mjs` | exit 1, fail 1, probe 지목 |
| `migration/.s6-credential-probe.mjs` | exit 1, fail 1, probe 지목 |

죽은 registry/확장자 walker를 제거했어도 이 여섯 루트와 파일명 변주는 실제 `walkRepositoryFiles(repoRoot)`/내용 기반 discovery가 계속 잡는다. 최종 종료 검사에서 `.s6-*`, `.s10-discovery-*`, `.s12-credential-discovery-*` 잔류를 다시 확인한다.

## 3. cache 공유의 대가

### 정상 불변 체크아웃

CI와 같은 Vitest `2.1.4`로 전체 하네스 스펙을 실행했다.

```text
50 passed / 0 failed
G3a 30,395 ms
tests 32.78 s / Vitest 전체 33.91 s
```

파일시스템이 실행 중 바뀌지 않으면 G3a가 최초 스캔을 채운 뒤 G3b·G8a·G8b·G8c·G9가 같은 배열 객체를 재사용하므로 현재 테스트 순서 자체를 원인으로 한 결과 차이는 관측되지 않았다.

### 파일 생성 뒤 낡은 cache 재현 — 결함 S6-1

임시 test를 같은 스펙에 넣어 다음 순서를 한 프로세스 안에서 실행했다.

1. `discoveredEvidenceWriters()`를 호출해 모듈 cache를 채운다.
2. `scripts/.s6-cache-order-probe.mjs`를 만들며 `docs/qa` writer 코드를 넣는다.
3. `discoveredEvidenceWriters()`를 다시 호출해 새 probe 포함을 단언한다.
4. `finally`에서 probe를 삭제한다.

결과는 **exit 1, `toContain(.s6-cache-order-probe.mjs)` 실패, probe 잔류 false**였다. cache는 두 번째 호출에서도 첫 배열을 그대로 반환한다. 즉 “한 테스트가 파일을 만들고 뒤 테스트가 발견한다”는 순서에서 실제 false-green 표면이 생긴다. 삭제의 반대 방향에서는 cache에 남은 경로를 뒤 테스트가 `statSync`/`readFileSync`할 때 순서 의존 실패도 날 수 있다.

현재 CI checkout은 테스트 도중 불변이고 기존 하네스 스펙의 합성 뮤테이션은 대부분 문자열 단위라 정상 50/50은 통과한다. 그러나 이 저장소가 실제 파일 probe를 회귀 수단으로 사용하며, cache reset/invalidation 경계가 없다는 사실은 요청한 조건에서 재현된 구조 결함이다.

### CI 실측 시간

S4와 S6의 독립 `Harness Guard` job 로그를 같은 기준으로 비교했다.

| 항목 | S4 `01545ba09` | S6 `d5236a9bc` | 변화 |
|---|---:|---:|---:|
| G3a 최초 discovery | 46,460 ms | 43,838 ms | -2,622 ms (-5.6%) |
| G8b 추가 discovery | 45,044 ms | slow-test 행 없음 | 공유 cache 사용, 별도 45초 재스캔 제거 |
| G8c 추가 discovery | 46,726 ms | slow-test 행 없음 | 공유 cache 사용, 별도 46.7초 재스캔 제거 |
| 스펙 tests | 138,996 ms | 44,580 ms | -94,416 ms (-67.9%) |
| Vitest 전체 | 139.56 s | 45.07 s | -94.49 s (-67.7%) |

Vitest verbose 로그는 느린 테스트만 개별 ms를 출력한다. S6의 G8b/G8c는 개별 행이 없으므로 정확한 사후 ms를 0으로 꾸미지 않는다. 로그상 별도 45초급 재스캔이 없어졌고 전체 시간이 최초 전수 스캔 한 번 수준으로 줄었다는 것이 측정 가능한 결론이다.

## 4. G8a 실질성

현재 정상 discovery는 **384건**이다. 임시로 기대값을 `> 1,000,000`으로 바꿔 실패 메시지의 actual을 읽었고 즉시 원복했다.

discovery 구현의 반환을 임시로 `.slice(0, 199)`로 망가뜨린 뒤 G8a만 실행한 결과는 다음과 같다.

```text
exit 1
expected 199 to be greater than 200
```

따라서 G8a는 더 이상 0건을 순회하는 vacuous 검사도, 항상 참인 파일 존재 검사만도 아니다. `200`은 현재 384건의 52.1%이며 184건의 감소 여유가 있다. 빈 결과나 대규모 discovery 붕괴를 막는 하한으로는 실질적이고 저장소 파일 증감에도 덜 취약하다. 반면 201~383건으로 줄어드는 부분 손실은 이 수량 단언 하나로는 잡지 못한다. G8a의 역할을 “vacuous/대규모 붕괴 방지”로 한정하면 적절하고, 모집단 완전성까지 뜻한다고 읽으면 부족하다. 이 한계는 이번 직접 요구의 결함 수에 별도 가산하지 않았다.

## 5. 결함 수와 머지 판정

**S4: 3 → S6: 1**

| 번호 | 결함 | 실측 영향 |
|---|---|---|
| S6-1 | 모듈 수준 discovery cache에 reset/invalidation 경계가 없음 | 같은 프로세스에서 cache 생성 후 writer 파일을 만들면 뒤 검사가 새 파일을 못 봄; 순서 뮤테이션 exit 1로 재현 |

CI runner 부재, 죽은 walker/vacuous G8a, G8b/G8c 중복 재스캔이라는 S4 3건은 해소됐다. 그러나 0결함 조건은 충족하지 못했으므로 이 보고서는 머지를 권고하지 않는다.

## 6. 라이브QA 대체

이 트랙은 사용자 화면·API·DB·실서비스 동작을 바꾸지 않고 정적 가드의 모집단 발견과 CI 실행 계약만 다룬다. 라이브QA 대상 표면이 없으므로 컨테이너·브라우저·화면 캡처를 실행하지 않았다. 실제 레포 파일시스템에 임시 위반을 넣어 GREEN→RED 민감도를 확인하고 모두 삭제한 뮤테이션 검증이 라이브QA를 대신한다.

## 7. 본 범위와 안 본 범위

본 범위:

- PR #1118 exact head의 43개 check 결론, CI job/step 원문 로그, 계약 테스트 7건 실행 여부
- `ci.yml`의 `scripts/**` PR/main push 트리거 필터
- 자격 discovery의 확장자·키 이름·접근 문법·새 루트 뮤테이션
- 하네스 discovery cache의 정상 재사용, 같은 프로세스 파일 생성 뒤 stale 여부
- S4 대비 exact CI Harness Guard 스캔 시간
- G8a 현재 수량과 discovery 축소 RED
- probe·의존성·프로세스·Git 잔류 여부

안 본 범위:

- 고의 위반 commit/push로 GitHub Actions 자체를 RED로 만드는 실행(금지 조건에 따라 로컬 동일 명령으로 대체)
- 제품 화면 라이브QA, API/DB, 컨테이너 실행·재빌드
- `seed-local-stack.ps1:70-74` 리터럴 5건 재판정
- 명시된 문법 밖의 모든 언어를 완전 파싱하는지 여부
- cache 결함 수정, 코드 수정, commit/push, 새 이슈 생성
- G8b/G8c의 로그에 출력되지 않은 개별 sub-300ms 값을 추정하는 일

## 8. 새 파일 목록

```text
docs/dev-reports/2026-08-07-1116-s6-final-reconvergence.md
```

임시 probe와 임시 Vitest 의존성은 최종 회수하며 새 코드 파일은 남기지 않는다.

## 9. 종료 검증

모든 뮤테이션 원복 후 fresh 명령으로 확인했다.

- `node --test scripts/lib/qa-credentials.test.cjs` — **7/7 PASS**, fail/cancelled/skipped 0, exit 0, `10,057.1441 ms`
- 원복 상태 `vitest 2.1.4 run ...harness-false-green-guard.test.ts` — **50/50 PASS**, exit 0, tests `32.78 s`, 전체 `33.49 s`
- `.s6-*`, `.s10-*`, `.s12-*` probe 파일 — **0건**
- 검증용 `clients/desktop/node_modules` — 설치 전과 같이 **부재**
- `t1116`/`qa-credentials`/`vitest` 관련 `node`·`npm`·`npx`·`bash`·`wsl` 프로세스 — **0건**
- `git diff --check` — **exit 0**
- HEAD — `d5236a9bc4de092cefc5cb96dbfe0b95427580ff`
- `git status --short` — 이 보고서 1개만 untracked, 코드 변경 0건
