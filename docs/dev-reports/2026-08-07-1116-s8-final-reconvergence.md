# PR #1118 / 이슈 #1116 — S8 S7 머지 전 최종 재수렴

## 결론

exact head `325c926794f396856a3a0e4c865630ed05051e51`에서 기존 CI 43/43, 자격 discovery 계약 7/7, 하네스 51/51, G8a 384건과 199건 축소 RED, 자격 discovery의 기존 변주 축은 모두 확인했다. S7의 삭제 경로 `..` 정규화, 동일 파일 삭제·재생성, cold-cache invalidate도 통과했다.

그러나 **S8 결함은 2건**이다.

1. 호출자가 `invalidateEvidenceWriterDiscovery(changedFiles)`를 한 번 빠뜨리면, 캐시 생성 후 추가된 실 writer를 G3가 보지 못한다. S6의 stale false-green이 자동으로 닫힌 것이 아니라 명시적 신호가 있을 때만 닫힌 상태다.
2. 삭제된 파일을 junction 별칭 경로로 invalidate하면 canonical 경로로 저장된 cache 항목이 남는다. `path.resolve()`는 `..`만 정규화하고 junction/symlink의 파일시스템 정체성을 해석하지 않는다.

따라서 **S6: 1 → S8: 2**이며, 0결함 머지 조건은 충족하지 못했다.

## 1. 호출 누락 실증과 도달 가능성

### 호출자 전수 검색

`invalidateEvidenceWriterDiscovery(`의 코드 호출은 S7이 추가한 하나의 회귀 테스트에만 3회 있다.

```text
definition  harness-false-green-guard.test.ts:108
calls       harness-false-green-guard.test.ts:1051, 1057, 1062
other code callers: 0
```

현재 51개 원본 하네스 테스트 중 실 파일을 생성·삭제하는 것은 S7 회귀 테스 하나이며, 이 호출자는 현재 invalidate를 하고 있다. 따라서 오늘의 정상 CI 순서에서는 호출 누락이 실행되지 않는다.

그러나 도달 불가능한 이론상 구멍은 아니다. 이 저장소는 실 파일 probe를 회귀 수단으로 계속 사용해 왔고, 향후 같은 Vitest 프로세스에 writer 파일 mutation 하나를 추가하면 직접 도달한다. 새 테스트가 호출을 빠뜨려도 CI의 현재 S7 계약은 그 누락을 단언하지 않는다.

### 적대 mutation

동일 프로세스에서 다음 순서를 임시 테스했다.

1. `discoveredEvidenceWriters()`로 cache를 채운다.
2. `clients/desktop/scripts/.s8-omitted-invalidation-probe.mjs`를 생성한다. 내용은 `docs/qa` writer이며 G3a 실 위반 형태다.
3. invalidate를 의도적으로 호출하지 않고 `walkG3Sources()`가 probe를 보는지 단언한다.
4. `finally`에서 probe를 삭제하고 cache를 회수한다.

```text
FAIL  S8 probe: 호출자가 invalidate를 빠뜨려도 새 writer를 발견해야 한다
expected [ …(80) ] to include .../.s8-omitted-invalidation-probe.mjs
exit 1
```

G3의 위반 목록에 probe가 들어오지 않았으므로, 같은 mutation을 원본 G3a로만 판정하면 **조용한 GREEN**이다. 적대 테스트는 이 false-green을 검출하려고 반대 단언을 두었기 때문에 RED가 됐다.

## 2. S7 신규 표면

| 표면 | mutation | 결과 | 판정 |
|---|---|---|---|
| 삭제 + 경로 정규화 | canonical 경로로 cache에 추가 → 파일 삭제 → `scripts/../scripts/...` 경로로 invalidate | PASS | `path.resolve()`가 `..`를 정규화하여 retained에서 제거함 |
| 동일 파일 삭제·재생성 | 생성·invalidate·포함 → 삭제·invalidate·제거 → 같은 경로 재생성·invalidate·포함 | PASS | 양방향 반영 |
| cold cache | probe 생성 → cache `undefined` → invalidate → 첫 discovery | PASS | invalidate는 no-op이고 첫 전수 discovery가 probe를 발견 |
| junction 별칭 | canonical 경로로 cache 추가 → 삭제 → junction 별칭으로 invalidate | **FAIL** | canonical cache 항목이 남음 |

junction mutation의 원문은 다음과 같다.

```text
FAIL  S8 probe: junction 별칭으로 삭제를 알려도 canonical cache 항목을 뺀다
junction과 canonical 경로를 같은 파일로 봐야 한다
expected [ …(385) ] to not include .../.s8-junction-delete-probe.mjs
exit 1
```

현재 S7 회귀 호출자는 `REPO_ROOT`에서 만든 canonical 경로만 넘기므로 junction 결함은 오늘 원본 51개에서 즉시 도달하지 않는다. S7 검증에서 쓴 junction은 Vitest 의존성을 연결한 `node_modules`였지 evidence writer의 `changedFiles` 경로가 아니었다. 다만 API가 임의 파일 경로를 받는 형태인데 파일 정체성을 텍스트 `resolve`로만 비교하므로, 요청된 신규 표면의 별도 결함으로 계산했다.

## 3. 대안과 셋째 가능성

### `fs.watch`

자동이라는 장점은 있지만 이 테스트에는 권장하지 않는다. 이벤트 배치·지연·rename 표현이 OS별로 다르고, mutation 직후 가드가 이벤트보다 먼저 실행되는 race를 새로 만든다. watcher 해제를 빠뜨리면 프로세스 잔류 표면도 생긴다.

### mtime/디렉터리 스냅샷

기존 파일의 변경은 개별 mtime로 볼 수 있지만 새 파일 추가를 보려면 디렉터리 트리를 다시 열거해야 한다. 내용 파싱 384건을 반복하는 139초 전수 재스캔보다는 가벼울 수 있지만, 매 호출 트리 열거의 실측 없이 성능 대안으로 확정할 수는 없다.

### 테스트 훅 자동 invalidate

`fs.writeFileSync`/`rmSync`를 감싼 mutation helper가 경로 journal과 invalidate를 소유하게 하면 호출 누락 가능성을 낮춘다. 그러나 raw `fs` 호출을 금지·단언하지 않으면 결국 다른 명시적 약속이다. Vitest `beforeEach`에서 cache를 단순 제거하면 매 테스트 전수 스캔으로 회귀하므로 금지 조건을 위반한다.

### 셋째 가능성 — 공유 cache를 변하는 저장소에 쓰지 않는다

권장할 대안은 **원본 저장소의 가드 discovery를 불변 snapshot으로 정의하고, mutation 계약은 작은 임시 fixture tree에서 캐시 없는 순수 함수를 검증하는 구조**다.

- 실 CI 가드: 불변 checkout을 최초 1회 전수 discovery하고 모든 가드가 같은 snapshot을 읽는다.
- mutation 계약: `discoverEvidenceWriters(repoRoot)`를 추출해 작은 temp fixture의 생성·삭제·재생성·junction을 각 호출에서 새로 읽는다.
- 성능: 384건 실 저장소 전수 스캔은 여전히 1회이고, mutation은 작은 fixture만 읽는다.
- 정확성: 호출자 invalidate 기억·watcher race·삭제된 junction 경로 정체성 문제가 사라진다.

이는 전수 재스캔으로 돌아가지 않으면서 “호출자가 잊지 않아야 한다”는 규약을 제거한다.

## 4. 기존 축 전수

### CI runner

```text
PR                 #1118
head               325c926794f396856a3a0e4c865630ed05051e51
checks             43/43 SUCCESS
CI run             31192024660
credential job     92910938577
step               자격 소비자 discovery 계약 테스트
command            node --test scripts/lib/qa-credentials.test.cjs
result             tests 7 / pass 7 / fail 0 / skipped 0
CI duration         3010.082166 ms
```

S5가 연결한 `ci.yml:648-649`의 runner는 exact S7 head에서 실제 실행됐고 job은 SUCCESS였다.

### 자격 discovery mutation

fresh 원본 계약:

```text
node --test scripts/lib/qa-credentials.test.cjs
7 passed / 0 failed / exit 0 / 3990.6721 ms
```

계약의 실 임시 파일이 다음을 검증했다.

- 확장자: `.bat`, `.cmd`, `.psm1`, `.zsh`, `.cts`, 무확장 — 6/6 발견
- 키: `QA_PASSWORD`, `qa_password`, `MY_QA_SECRET_PASSWORD` — 소문자·복합키 발견
- 문법: `%KEY%`, `process.env`, `$env:`, `${}`, `__ENV.`, `os.environ.get`, `getenv` — 모두 발견

새 루트에는 각각 `process.env.MY_QA_SECRET_PASSWORD`를 읽는 `.s8-credential-root-probe.mjs` 하나만 두고, `실행 자격 소비자는…` 계약을 루트별로 독립 실행했다.

| 루트 | 결과 |
|---|---|
| `tools` | exit 1, `tools\.s8-credential-root-probe.mjs` 지목 |
| `perf` | exit 1, `perf\.s8-credential-root-probe.mjs` 지목 |
| `infrastructure` | exit 1, `infrastructure\.s8-credential-root-probe.mjs` 지목 |
| `shared` | exit 1, `shared\.s8-credential-root-probe.mjs` 지목 |
| `services` | exit 1, `services\.s8-credential-root-probe.mjs` 지목 |
| `migration` | exit 1, `migration\.s8-credential-root-probe.mjs` 지목 |

### 오탐 0

- `perf/k6/mixed-load.js`의 `__ENV.LOADTEST_PASSWORD`는 정확한 파일 단위 runtime boundary 예외로 남았고, 원본 7/7을 깨지 않았다. `perf` 다른 probe는 RED였으므로 루트 전체 예외가 아니다.
- `gradlew*`, `Dockerfile*`, `_headers`는 실행 자격 소비자가 아닌 파일명 경계로 제외된다.
- `scripts/lib/qa-credentials.d.cts`는 확장자로 일괄 제외되지 않는다. 현재 내용은 타입 선언만 있고 환경변수 접근이 없어 소비자로 분류되지 않았다.
- 원본 계약 7/7과 하네스 51/51에서 이 파일들을 지목한 오탐은 0건이었다.

### G8a

현재 모집단은 exact 단언 `toBe(384)`로 임시 강화해 통과시켰다.

```text
G8a exact population: 384 / PASS / exit 0
```

`discoveredEvidenceWriters()`의 첫 반환을 임시 `.slice(0, 199)`로 축소한 mutation은 다음과 같이 RED였다.

```text
expected 199 to be greater than 200
1 failed / 50 skipped / exit 1
```

두 mutation은 즉시 원복했다.

### 하네스 원본 회귀

```text
vitest 2.1.4
51 passed / 0 failed / exit 0
G3a local fresh    21,967 ms
tests              23.61 s
Vitest duration    24.57 s
```

로컬 수치는 Windows 캐시 영향이 있으므로 CI 성능 판정은 아래 exact Actions 로그를 우선한다.

## 5. CI 실측 스캔 시간

S7 exact head의 Harness Guard run/job은 `31192024887 / 92910939329`이다.

| 항목 | S6 CI `d5236a9bc` | S7 CI `325c92679` | 변화 |
|---|---:|---:|---:|
| G3a 최초 discovery | 43,838 ms | 46,685 ms | +2,847 ms (+6.5%) |
| spec tests | 44,580 ms | 47,452 ms | +2,872 ms (+6.4%) |
| Vitest 전체 | 45.07 s | 47.94 s | +2.87 s (+6.4%) |

질문의 “늘지 않았는가”에 대한 답은 **늘었다**이다. 다만 추가 시간은 최초 G3a discovery의 증가와 거의 같고, G8b/G8c에 45초급 행이 다시 출력되지 않았다. 따라서 139초의 중복 전수 재스캔으로 회귀한 증거는 없고, 최초 1회 스캔 자체가 S6보다 2.87초 느려진 것이 실측 결과다.

## 6. 결함 수와 머지 판정

```text
S4: 3 → S6: 1 → S8: 2
```

| 번호 | 결함 | 현재 도달성 |
|---|---|---|
| S8-1 | invalidate 호출 누락 시 stale false-green | 현재 원본 51개의 정상 순서는 미도달; 향후 실 파일 mutation 테스트 추가 시 즉시 도달 가능 |
| S8-2 | junction/symlink 별칭 삭제가 canonical cache 항목을 제거하지 못함 | 현재 S7 호출자는 canonical 경로만 써 미도달; 별칭 경로를 `changedFiles`로 넘기면 재현 |

S8-1은 S6 결함의 조건부 잔존, S8-2는 S7이 만든 경로 기반 증분 무효화의 신규 표면이다. 요청한 0결함 기준으로는 머지를 권고하지 않는다.

## 7. 라이브QA 대체 근거

이 트랙은 사용자 화면, API, DB, 실서비스 시나리오를 변경하지 않고 정적 가드의 모집단 discovery·cache·CI runner 계약만 다룬다. 따라서 브라우저·스크린샷·컨테이너 기반 라이브QA의 대상 표면이 없다.

대신 실 저장소 파일시스템에 위반 probe를 넣고 GREEN↔RED 민감도를 확인하는 mutation을 사용했다. 호출 누락, 삭제 정규화, 삭제·재생성, cold cache, junction, G8a 축소, 자격 확장자·키·문법·새 루트가 화면 QA의 자리를 대신한 실증 근거다.

## 8. 본 범위와 안 본 범위

본 범위:

- PR #1118 exact head/43 checks, Credential Plaintext Guard 실 runner/log, Harness Guard exact Actions log
- S7 cache/invalidation 데이터 흐름과 전체 호출자
- invalidate 누락 false-green과 실무 도달 가능성
- 삭제 경로 정규화, 삭제·재생성, cold cache, junction 별칭
- G8a 384 exact population과 199 축소 RED
- 자격 discovery의 확장자·키·문법·새 루트 6곳, 명시된 오탐 경계
- exact S7 CI 스캔 시간과 S6 비교
- 원본 하네스 51/51, 자격 계약 7/7, probe·junction·프로세스·의존성 잔류

안 본 범위:

- 코드 수정, 결함 수정 구현, commit/push/PR/Issue 작업
- 고의 red commit/push로 GitHub Actions를 새로 발화하는 것; 로컬 동일 명령과 exact head의 기존 Actions 로그로 대체
- 컨테이너 재빌드·API·DB·제품 화면 라이브QA
- `seed-local-stack.ps1:70-74` 리터럴 5건 재판정
- 명시된 문법 밖 모든 언어의 완전 파싱
- `fs.watch`·mtime·fixture 추출 대안의 구현/벤치마크
- junction 외 hard link, 네트워크 파일시스템, 대소문자 혼용 별칭

## 9. 신규 파일 목록

```text
docs/dev-reports/2026-08-07-1116-s8-final-reconvergence.md
```

새 코드 파일은 남기지 않았다. 적대 테스트, `.s8-*` probe, evidence junction, Vitest `node_modules` junction은 모두 회수했다.

## 10. 종료 검증

- HEAD: `325c926794f396856a3a0e4c865630ed05051e51`
- 원본 `harness-false-green-guard.test.ts`: code diff 0
- 원본 하네스: 51/51 PASS, exit 0
- 원본 자격 discovery 계약: 7/7 PASS, exit 0
- `.s8-*` probe/junction: 0건
- `clients/desktop/node_modules`: 실행 전·후 모두 부재
- `t1116`/`harness-false-green`/`qa-credentials`/`vitest` 관련 `node`·`npm`·`npx`·`bash`·`wsl` 프로세스: 0건
- 최종 새 파일: 본 보고서 1건만
