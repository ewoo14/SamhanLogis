# 이슈 #1116 S1 — 가드 모집단 발견 전 목록 제거

## 결론

두 가드의 검사 대상 모집단에서 경로·루트·확장자 목록을 제거하고, 저장소 walker가 발견한 파일의 내용으로 판정하도록 바꿨다.

- `scripts/lib/qa-credentials.test.cjs`
  - 확장자 집합 제거
  - 대문자 전용 키 정규식 제거
  - `process.env`, `$env:`, `${}`, `__ENV`, `os.environ`, `getenv`, `%KEY%` 접근을 공통 발견 패턴으로 처리
  - `QA`/`DEV`/`LOADTEST`/`SAMHAN_DS4`/`AROLOGIS` 계열의 `PASSWORD`/`PW` suffix를 대소문자 무관하게 발견
  - k6 `perf/k6/mixed-load.js`는 기존 정당한 예외 유지
- `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`
  - G8c writer 발견을 확장자 필터가 아닌 전수 내용 scan으로 전환
  - G8c 관할 판정은 발견된 writer 자체를 대상으로 하며 `GUARD_ROOTS`의 경로/확장자 판정에 의존하지 않음
  - `.cts` 등 새 확장자 writer가 발견 기반 모집단에 들어옴

## 목록이 남아 있던 곳과 제거 방법

| 위치 | 기존 모집단 제한 | 변경 |
|---|---|---|
| `qa-credentials.test.cjs` | `EXECUTABLE_EXTENSIONS` | 저장소 전수 walker + generated/binary 디렉터리만 제외 |
| `qa-credentials.test.cjs` | `QA_CREDENTIAL_KEY` 대문자·prefix 형태 제한 | 대소문자 무관 suffix/namespace 발견 |
| `qa-credentials.test.cjs` | 파일 확장자별 접근 문법 분기 | 접근 문법을 파일 확장자와 독립된 공통 패턴으로 발견 |
| G8c | `GUARD_ROOTS`, `G3_ROOTS`의 루트·재귀·확장자 배열 | writer 내용을 전수 scan하고 발견 결과를 직접 사용 |
| G8c | `derivedEvidenceWriters()`의 JS/PS1/SH/PY 확장자별 walker | 전체 파일 walker + 내용 기반 writer 판정 |

제외 목록은 검사 대상 목록이 아니라 검사하지 않아야 하는 항목만 둔다: `.git`/생성 산출물/바이너리, 로더 자신, 두 가드 테스트 자신, 문서, 기존 평문 가드 spec, k6 런타임 경계, Docker/gradlew/_headers 같은 실행 대상이 아닌 설정·래퍼 파일, 애플리케이션의 정당한 org seed 예외.

## RED-A 원문 및 결과

추가한 회귀 테스트가 다음 원문을 임시 파일로 만들었다. 각 파일은 테스트의 `finally`에서 삭제된다.

```text
legacy.bat  : echo %QA_PASSWORD%
legacy.cmd  : echo %qa_password%
legacy.psm1 : $env:qa_password
legacy.zsh  : echo ${MY_QA_SECRET_PASSWORD}
legacy.cts  : process.env.qa_password
legacy      : os.environ.get('MY_QA_SECRET_PASSWORD')
              getenv('qa_password')
```

전수 discovery 결과 6개 모두 발견됐다. 새 파일 등록, 확장자 등록, 키 대소문자 등록 없이 통과한다.

## RED-B 측정

- 오탐: 자격 가드 테스트 7/7 통과. `Dockerfile`, `docker-compose*`, `gradlew*`, `_headers`는 소비자로 분류하지 않음.
- k6: `perf/k6/mixed-load.js`의 `__ENV` 접근 예외 유지.
- 스캔 시간: 기존 자격 가드 약 0.9초에서 전수 discovery 약 1.5초로 증가. 전체 `node --test` 실측 약 5.3초. generated 디렉터리와 바이너리(null byte)는 읽지 않는다.
- 임시 파일 잔류: 없음.
- 프로세스/창/컨테이너: 생성하지 않음.

## 검증

통과:

```text
node --test scripts/lib/qa-credentials.test.cjs
7 tests, 7 pass, 0 fail
```

추가 확인:

```text
node --check scripts/lib/qa-credentials.test.cjs  PASS
git diff --check                                      PASS
```

환경 제한:

```text
clients/desktop npm test: 기존 pretest 신선도 가드에서 중단
직접 vitest: vitest 의존성 미설치로 시작 단계 중단
```

따라서 G8c 전체 Vitest 실행 결과는 이 워크트리 환경에서 산출하지 못했다. 변경 자체는 `.cts` writer를 확장자와 무관하게 `derivedEvidenceWriters()`의 전수 내용 scan에 포함하도록 정리했다.

## 신규 파일 목록

- 이 보고서 1개
- RED-A 임시 probe: 6개 생성 후 전부 삭제, 저장소 잔류 0개
