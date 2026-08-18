# PR #1248 CODEX SOL 적대검증 머지 판정 라운드 2

검증 대상은 PR HEAD `8675e036fb0e8a3f56aac6061be3418c545dff75`이다. 로컬 HEAD와 PR head가 일치했다. 공유 스택 대신 전용 포트의 격리 PostgreSQL·회계 서비스·PR HEAD 게이트웨이·Vite를 사용했다.

PR HEAD에서 새로 만든 JAR와 격리 컨테이너 `/app/app.jar`의 SHA-256은 각각 일치했다.

| 대상 | SHA-256 | 호스트/컨테이너 일치 |
|---|---|---:|
| api-gateway | `cff9011b4aaec3b9e9831ebdf6ea6444d80c9aa0e55c4aabd8ed038c62adca54` | 예 |
| accounting-service | `e5889b18547f35f9e825dfb3292c7f550e9e7c55063cb4383198a4e35fbd0ed7` | 예 |

격리 gateway 로그인은 200, 정상 직원 토큰의 `/auth/admin/menu-catalog`는 200(응답 19,785 bytes)이었다. Playwright Chromium은 `headless: true`로 `clients/desktop` 패키지 안에서 실행했고, `POST /auth/login { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') }` 후 `window.samhanAuth`를 주입했다.

## ① 직전 세 결함 재현 시도 결과

### 결함 1 — 연속 입력 중 재조회 응답이 폼을 덮어 입력값 유실

**고쳐졌다.** 실제 화면에서 총 결제금액 → 장비대 → 선지급 → 설치비 → 안전관리비를 차례로 입력했다.

| 순서 | 저장 요청에 누적된 핵심 값 |
|---:|---|
| 1 | total=2000000, equipment=0, prepaid=0, install=0, safety=0 |
| 2 | total=2000000, equipment=300000, prepaid=0, install=0, safety=0 |
| 3 | total=2000000, equipment=300000, prepaid=40000, install=0, safety=0 |
| 4 | total=2000000, equipment=300000, prepaid=40000, install=50000, safety=0 |
| 5 | total=2000000, equipment=300000, prepaid=40000, install=50000, safety=6000 |

최종 화면 입력은 `2000000 / 300000 / 40000 / 50000 / 6000`, 화면 총액은 `₩2,000,000`이었다. 격리 DB도 다섯 값을 모두 보존했다. 이 입력 구간의 상세 GET 재조회 증분은 0건이었다. 즉 종전처럼 각 자동 저장 뒤 stale 상세 GET이 폼을 다시 덮는 사용자 경로가 사라졌고, 연속 입력도 유실되지 않았다.

참고로 일반 상세 query의 전역 설정은 `refetchOnWindowFocus: false`라 포커스 재조회는 실제 사용자 경로에서 발생하지 않았다. 직전 LUNA 보고의 “다음 focus 재조회는 가능” 설명은 실측 근거로 사용하지 않았다.

### 결함 2 — 응답 순서 역전 3회에서 마지막 입력 B 결과가 남지 않음

**직전과 동일한 응답 전달 역전 조건에서는 고쳐졌다.** A 요청이 서버 처리를 마친 뒤 응답 전달만 늦추고 B 응답을 먼저 전달했다. 세 번 모두 실제 응답 순서가 `B → A`였다.

| 회 | A(느린 응답) | B(빠른 응답) | 실제 응답 순서 | 응답 후 화면 | DB | 새로고침 후 |
|---:|---:|---:|---|---|---|---|
| 1 | 101 | 202 | 202 → 101 | 입력 202 / `₩202` | 202.000000 | 입력 202 / `₩202` |
| 2 | 3030 | 4040 | 4040 → 3030 | 입력 4040 / `₩4,040` | 4040.000000 | 입력 4040 / `₩4,040` |
| 3 | 50505 | 60606 | 60606 → 50505 | 입력 60606 / `₩60,606` | 60606.000000 | 입력 60606 / `₩60,606` |

세 경우 모두 서버 처리 순서는 A → B였고, 클라이언트에 전달된 응답만 B → A였다. 마지막 입력 B가 화면·DB·새로고침 후 화면에 남았다.

### 결함 3 — 저장 후 금액이 `.000000`으로 화면 노출

**고쳐졌다.** 정수 `1234567` 저장 직후와 새로고침 후를 모두 확인했다.

| 시점 | 입력 | 화면 총액 | 화면 지급액 |
|---|---:|---:|---:|
| 저장 직후 | 1234567 | `₩1,234,567` | `₩746,110` |
| 새로고침 후 | 1234567 | `₩1,234,567` | `₩746,110` |

DB 원문은 `1234567.000000`이지만 화면 노출 검사 결과 `.000000`은 0건이었다. 즉 저장 스케일은 유지하되 사용자 화면에서는 불필요한 소수부를 제거한다.

## ② 새로 발견한 도달 결함

### 요청의 서버 도착 순서가 역전되면 마지막 입력 B가 재진입 후 유지되지 않음

실 사용자가 느린 네트워크에서 A를 입력하고 곧바로 B로 고치는 경로다. A 요청을 브라우저에서 포착한 뒤 서버 전달 전 1,000ms 지연하고 B를 정상 전달했다.

| 항목 | 실측 |
|---|---|
| A | 717171 |
| B | 828282 |
| 서버 처리 완료 순서 | 828282 → 717171 |
| 브라우저 응답 순서 | 828282 → 717171 |
| 응답 직후 화면 | 입력 828282 / `₩828,282` |
| 두 응답 후 격리 DB | **717171.000000** |
| 새로고침 후 화면 | **입력 717171 / `₩717,171`** |

클라이언트 sequence 가 늦은 A 응답의 화면 반영은 막지만, 서버가 더 늦게 받은 A 저장 자체는 막지 못한다. 사용자는 B가 저장된 것으로 보지만 재진입하면 A로 되돌아간다. 실제 화면 입력과 일반 네트워크 지연만으로 도달 가능하다.

**새로 발견한 도달 결함: 1건.**

## ③ 라이브 캡처와 행 수

이 화면은 표가 아니라 입력 폼과 결과 정의 목록이다. 빈 표를 정상으로 세지 않기 위해 각 캡처에서 금액 입력 행 5개, 결과 행 7개를 DOM으로 직접 셌다. `table tbody tr`은 화면 구조상 0개다. 8장 모두 실제 상세 화면과 해당 금액을 육안 확인했다.

| 캡처 | 금액 입력 행 | 결과 행 | 표 행 |
|---|---:|---:|---:|
| `screenshots/01-sequential-inputs-preserved-real-qa.png` | 5 | 7 | 0 |
| `screenshots/02-response-inversion-1-real-qa.png` | 5 | 7 | 0 |
| `screenshots/03-response-inversion-2-real-qa.png` | 5 | 7 | 0 |
| `screenshots/04-response-inversion-3-real-qa.png` | 5 | 7 | 0 |
| `screenshots/05-whole-network-inversion-before-reload-real-qa.png` | 5 | 7 | 0 |
| `screenshots/06-whole-network-inversion-after-reload-real-qa.png` | 5 | 7 | 0 |
| `screenshots/07-integer-money-before-reload-real-qa.png` | 5 | 7 | 0 |
| `screenshots/08-integer-money-after-reload-real-qa.png` | 5 | 7 | 0 |

구조화 원문은 `results.json`에 저장했다.

## ④ CI·GitGuardian 판정

현재 PR check는 **성공 45 / 전체 46, 실패 1**이다. 유일한 실패는 `GitGuardian Security Checks`다.

base `12e3908b7eb79bf1595bcfb7cc3bd1ccfa65f3bc`와 head 전체 diff를 다시 확인했다.

- `.env` 및 `.env.*` 변경: 0개
- 실제 자격·비밀 리터럴 추가: 0개
- 자격 모양 문자열 후보: 1개 — `clients/desktop/playwright/1248-luna-fix-real-qa/1248-luna-fix-real-qa.mjs`의 route mock 응답 `token: 'qa-token'`
- 실제 로그인은 `resolveQaCredential(...)`을 사용하며 위 `qa-token`은 외부 시스템에서 유효한 자격이 아닌 화면 mock 고정 문자열이다.

GitGuardian check 출력은 dashboard URL 외 탐지 상세를 제공하지 않았다. 그러나 전체 diff에 실자격과 `.env` 변경이 없고 유일한 후보가 명백한 route mock 문자열이므로 **GitGuardian 실패는 오탐**으로 판정한다.

## ⑤ 증거 무결성 점검

- LUNA 보고의 대상 Vitest는 fresh 실행에서 `Test Files 1 passed`, `Tests 10 passed`로 재현됐다.
- lint는 exit 0, `0 errors / 196 warnings`로 수치가 재현됐다.
- desktop build는 exit 0으로 재현됐다.
- 현재 HEAD에서 `npm run typecheck`는 코드 진단 전에 design-system `dist/index.d.ts`가 최신 소스보다 오래됐다는 로컬 파생물 신선도 가드로 exit 1이었다. 따라서 LUNA 보고의 typecheck exit 0을 **현재 로컬 HEAD의 fresh 출력으로는 재현했다고 쓰지 않는다.** 그 뒤 병합된 main 변경으로 로컬 dist가 오래된 상태이며, 현재 HEAD의 GitHub `Frontend Desktop (typecheck + lint + build)` check는 성공이다.
- LUNA 캡처가 실제 백엔드가 아닌 route mock fallback이라는 점은 원 보고에 명시돼 있었다. `playwright-results.json`의 행 수 5와 캡처 3개는 파일 원문과 일치했다.
- 이번 수치와 표는 성공한 마지막 Playwright 실행 직후 생성된 `results.json`에서 다시 읽었으며 오류 배열은 비어 있었다.

## ⑥ 머지 판정

**머지 불가 — 도달 결함 1건.**

직전 도달 결함 3건은 각 사용자 화면 경로에서 고쳐진 것을 확인했다. 그러나 요청이 서버에 도착하는 순서까지 역전되면 사용자가 마지막에 입력한 B가 DB에 남지 않고 재진입 후 A로 되돌아가는 신규 도달 결함이 있다. 유일한 질문에 대한 답은 **“예, 실 사용자가 화면을 통해 재현할 수 있는 결함이 1건 남아 있다”**이다.

## ⑦ 프로세스·격리 산출물 회수

```text
QA_CONTAINER_REMAINDER=0
QA_PORT_LISTENER_REMAINDER=0  (28648, 29648, 50648, 59648)
PLAYWRIGHT_CHROMIUM_REMAINDER=0
WORKTREE_JAVA_REMAINDER=0
QA_JAR_REMAINDER=0
TEMP_DUMP_REMAINDER=0
```

이번 격리 실행의 api-gateway/accounting-service Gradle build 디렉터리는 `clean`했고, 직전 라운드가 `docs/qa/1248-merge-verdict-*/`에 남긴 미추적 JAR 4개도 삭제했다. 이 파일들은 빌드로 재생성 가능한 미추적 산출물이다. 공유 컨테이너와 다른 워크트리는 건드리지 않았다. `git add`, `git commit`, `git push`는 실행하지 않았다.
