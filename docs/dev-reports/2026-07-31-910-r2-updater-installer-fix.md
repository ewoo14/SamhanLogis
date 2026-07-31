# PR #993 / Issue #910 fix 라운드 2 보고서

작성일: 2026-07-31  
대상: Samhan Public 데스크톱, 아로로지스 데스크톱  
범위: 결함 2 → 결함 1 → 결함 3  
제외: 결함 4(Expo version), 결함 5(Capacitor Android versionName), 백엔드·Flyway·Docker·자동 업데이트 피드 서버·코드서명

## 1. 결론

- 결함 2: \`electron-updater\`가 허용하는 \`v\` 접두사와 앞뒤 공백을 날짜형으로 정규화한다. 해석 불가값은 빈 표시값으로 차단하고 renderer가 일반 문구를 출력한다. \`새 버전 새 버전\` 중복과 raw semver 노출을 함께 막았다.
- 결함 1: 두 NSIS 설정에 \`uninstallDisplayName: ${productName}\`을 추가했다. 설치 앱 목록의 기본 \`${productName} ${version}\` 경로가 내부 semver를 붙이지 않게 했다.
- 결함 3: builder의 \`shortVersion\`/\`shortVersionWindows\`와 NSIS VersionInfo를 날짜 보존형 4-정수 표기로 분리했다. PE 버전 필드의 형식·범위 제약으로 \`YYYY/MM/DD-번호\`를 그대로 넣을 수 없다는 사실과 대안을 기록했다.
- 데스크톱 전체 테스트, typecheck, lint 및 관련 빌드가 통과했다.
- 실제 renderer 캡처는 시도했으나 현재 세션에 연결 가능한 브라우저가 없어 생성하지 못했다. 합성 캡처는 만들지 않았다.

## 2. 결함별 RED-first 기록

### 2.1 결함 2 — updater 허용 변형 및 중복 문구

실패 테스트를 먼저 추가한 뒤 기존 구현을 실행했다.

명령:

~~~text
clients/desktop
npm test -- --run src/main/auto-update.test.ts
~~~

원문:

~~~text
9 tests, 3 failed, 6 passed
v 접두 버전: expected 2026/07/31-1, received 새 버전
앞뒤 공백 버전: expected 2026/07/31-1, received 새 버전
알 수 없는 버전: expected { kind: 'available', version: '' }, received { kind: 'available', version: '새 버전' }
~~~

아로로지스 main/renderer 결합 RED 원문:

~~~text
2 files, 5 failed, 7 passed
main v 접두·공백 버전: expected 날짜형, received 새 버전
main 이상값: expected version '', received version '새 버전'
renderer 빈 표시값: expected 새 버전을 다운로드하는 중입니다., received 업데이트를 확인하는 중입니다...
renderer 직전 fallback: 새 버전 새 버전을 다운로드하는 중입니다.
~~~

변경 요지:

- 두 main \`auto-update.ts\`의 내부 semver 정규식을 \`^\\s*v?1....\\s*$\`로 확장했다. \`electron-updater\`가 승인한 lowercase \`v\`와 ASCII 앞뒤 공백을 허용한다.
- 날짜 변환 실패 시 main이 \`'새 버전'\`이라는 UI 문구를 보내지 않고 \`''\`을 보낸다.
- 두 renderer \`AppVersionGate\`에서 날짜형 표시값만 \`새 버전 날짜\`로 조합한다. 빈 값, 구형 fallback 문자열, 내부 semver 등은 모두 \`새 버전\` 일반 라벨로 대체한다.
- available/downloaded 상태에서 빈 version도 버리지 않고 렌더링하므로 이상값이 이전 상태에 남지 않는다.

정상·허용 변형·이상값 결과:

| 분류 | updater 입력 | main IPC version | renderer 안내 문구 | raw/중복 여부 |
|---|---|---|---|---|
| 정상 | \`1.20260731.1\` | \`2026/07/31-1\` | \`새 버전 2026/07/31-1을 다운로드하는 중입니다.\` | raw 없음, 중복 없음 |
| 허용 변형 | \`v1.20260731.1\`, \` 1.20260731.1 \` | \`2026/07/31-1\` | 정상값과 동일한 날짜형 문구 | raw 없음, 중복 없음 |
| 이상값 | \`1.0.0\` 등 해석 불가값 | \`''\` | \`새 버전을 다운로드하는 중입니다.\` | raw 없음, \`새 버전 새 버전\` 없음 |

Samhan Public의 available/downloaded/설치 중 경로와 아로로지스의 available/downloaded 경로에 같은 라벨 정책을 적용해 직전 결함의 5개 중복 조합 지점을 제거했다.

### 2.2 결함 1 — Windows 설치 앱 이름

실패 테스트를 먼저 추가했다.

명령:

~~~text
node --test scripts/app-build-version.test.cjs
~~~

원문:

~~~text
13 tests; 12 pass, 1 fail
두 Windows NSIS 설치 앱 이름은 제품명만 사용하고 내부 semver를 붙이지 않는다
AssertionError: clients/desktop/electron-builder.yml
expected /uninstallDisplayName:\s*\$\{productName\}/
~~~

변경 요지:

다음 두 설정에 명시했다.

~~~yaml
nsis:
  uninstallDisplayName: ${productName}
~~~

- \`clients/desktop/electron-builder.yml\`
- \`clients/arologis-desktop/electron-builder.yml\`

릴리스 include의 \`VERSION\`은 계속 \`YYYY/MM/DD-번호\`로 주입되므로 설치 앱 목록의 표시 버전은 사용자용 날짜 정책을 유지한다. 앱 이름은 제품명만 사용하고 electron-builder 기본값인 \`${productName} ${version}\`을 사용하지 않는다.

### 2.3 결함 3 — Windows PE VersionInfo

실패 테스트를 먼저 추가했다.

원문:

~~~text
15 tests; 13 pass, 2 fail
Windows PE 표시 버전은 날짜를 보존한 4개 정수 형식으로 산출하고 NSIS resource에도 주입한다
TypeError: resolveWindowsDisplayVersion is not a function

두 릴리스 wrapper는 Windows PE resource용 shortVersion을 내부 semver와 분리해 builder에 전달한다
actual: ['--config.extraMetadata.version=1.20260731.1']
expected: ['--config.extraMetadata.version=1.20260731.1',
 '--config.extraMetadata.shortVersion=2026.7.31.1',
 '--config.extraMetadata.shortVersionWindows=2026.7.31.1']
~~~

변경 요지:

- 릴리스 환경이 \`windowsDisplayVersion\`을 계산한다.
- 두 릴리스 wrapper가 다음 세 값을 builder에 전달한다.

~~~text
--config.extraMetadata.version=1.20260731.1
--config.extraMetadata.shortVersion=2026.7.31.1
--config.extraMetadata.shortVersionWindows=2026.7.31.1
~~~

- electron-builder Windows 경로가 \`shortVersion\`을 \`--set-file-version\`, \`shortVersionWindows\`를 \`--set-product-version\`에 사용하는 것을 확인했다.
- NSIS include에도 다음 VersionInfo를 추가했다.

~~~text
VIProductVersion "2026.7.31.1"
VIAddVersionKey /LANG=1042 ProductVersion "2026.7.31.1"
VIAddVersionKey /LANG=1042 FileVersion "2026.7.31.1"
~~~

#### PE 형식 제약과 대안

\`app-builder-lib\`의 실제 Windows 경로는 \`rcedit --set-file-version\` 및 \`--set-product-version\`을 사용한다. 확인한 \`resedit\` VersionInfo 타입과 NSIS \`VIProductVersion\` 경로는 버전을 \`X.X.X.X\` 형태의 4개 숫자 구성요소로 다루며, PE 고정 버전 필드는 각 16-bit 정수(0~65535) 범위다. 따라서 \`2026/07/31-1\` 같은 슬래시·하이픈 정책 문자열을 PE의 버전 필드에 그대로 넣을 수 없다.

이번 대안은 다음과 같다.

~~~text
정책/업데이트 정본: 2026/07/31-1
PE 표시 대안:       2026.7.31.1
~~~

날짜의 연·월·일은 유지하고 점 표기와 4번째 숫자를 사용했다. 4번째 순번이 65535를 넘으면 PE 필드에 정확히 담을 수 없으므로 \`65535\`로 포화시킨다. 예를 들어 테스트한 \`2026/07/25-91003\`은 \`2026.7.25.65535\`가 된다. 이 경우에도 electron-updater 내부 semver와 renderer 날짜 정책값은 손상되지 않는다.

이는 PE 필드 제약을 무시하고 긴 순번을 억지로 넣은 것이 아니다. 다만 65535 초과 순번의 PE 표시값은 충돌할 수 있으므로 Windows 속성에서 완전한 순번 식별까지 보장해야 한다면 별도 리소스 문자열/빌드 정책 결정이 필요하다. 그 결정은 이번 범위에서 임의로 확장하지 않았다.

## 3. Linux CI 단정 단위 점검

CI runner가 \`ubuntu-latest\`인 점을 기준으로 새 단정을 파일 전체가 아니라 단정별로 분류했다.

| 새 단정 | Linux에서 참인지 | 근거/한계 |
|---|---|---|
| updater 입력 정규화가 exact, \`v\`, 공백 변형을 날짜형으로 만든다 | 참 | 순수 JavaScript 정규식과 Vitest 단위 테스트이며 경로·플랫폼 API를 사용하지 않는다. |
| 이상 updater 값이 raw로 IPC/화면에 새지 않는다 | 참 | TypeScript/Vitest 문자열·객체 단정이다. 두 main과 두 renderer 테스트가 통과했다. |
| NSIS \`uninstallDisplayName\`이 제품명 변수로 고정된다 | 참 | YAML 텍스트 계약 테스트이며 Node 파일 읽기·정규식만 사용한다. |
| builder에 내부 semver와 PE용 shortVersion이 분리 전달된다 | 참 | Node 릴리스 wrapper 캡처 테스트로 CLI 배열을 검사한다. Windows 실행 파일이 필요하지 않다. |
| PE용 값이 네 개의 16-bit 숫자다 | 참 | 변환 함수와 범위 단정은 순수 Node로 검증할 수 있다. |
| 실제 Windows Explorer의 설치 목록/EXE 속성에 최종 값이 보인다 | Linux에서 직접 단정 불가 | 실제 NSIS/rcedit 산출물과 Explorer는 Windows 환경이 필요하다. 이번 환경에서는 해당 빌드와 Explorer QA를 실행하지 않았으며 builder 경로 정적 계약과 PE 제약 확인으로 대체했다. |

## 4. 캡처

요청된 위치:

~~~text
docs/qa/910-app-client-identity/r2-2026-07-31/
~~~

Vite renderer 서버를 \`VITE_APP_VERSION=2026/07/31-1\`, port \`5181\`로 기동해 실제 renderer 캡처를 시도했다. 현재 Codex 세션에는 연결 가능한 브라우저가 없어 실제 화면 캡처를 생성하지 못했다. 합성 PNG는 만들지 않았다.

대신 다음 실제 renderer 테스트가 문구를 DOM으로 검증한다.

- Samhan Public \`AppVersionGate.test.tsx\`: 안전한 빈 표시값 및 직전 fallback 라벨에서 중복 없음
- 아로로지스 \`AppVersionGate.test.tsx\`: 안전한 빈 표시값 및 직전 fallback 라벨에서 중복 없음

## 5. GREEN 및 전체 검증 결과

### 개별·계약 테스트

| 명령 | 결과 |
|---|---|
| \`clients/desktop\` updater/main+renderer targeted | 2 files, 27 tests passed |
| \`clients/arologis-desktop\` updater/main+renderer targeted | 2 files, 12 tests passed |
| \`node --test scripts/app-build-version.test.cjs\` | 15 passed, 0 failed |
| \`clients/desktop\` \`npm run test:round-910-contract\` | 11 passed, 0 failed |

### 전체 데스크톱 스위트

| 앱 | 결과 |
|---|---|
| Samhan Public \`npm test -- --reporter=basic\` | 186 test files passed, 1682 tests passed |
| 아로로지스 \`npm test -- --reporter=basic\` | 12 test files passed, 67 tests passed |

### 정적 품질·빌드

| 앱 | typecheck | lint | build |
|---|---|---|---|
| Samhan Public | 통과, real-QA 보조 테스트 50 passed | 통과, 0 errors / 기존 warning 104건 | 통과 |
| 아로로지스 | 통과 | 통과 | 통과 |

추가 검증:

~~~text
git diff --check
통과
~~~

## 6. 변경 파일 목록

### 신규 파일

- \`docs/dev-reports/2026-07-31-910-r2-updater-installer-fix.md\` — 본 보고서

### 수정 파일

- \`clients/desktop/src/main/auto-update.ts\`
- \`clients/desktop/src/main/auto-update.test.ts\`
- \`clients/desktop/src/renderer/components/common/AppVersionGate.tsx\`
- \`clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx\`
- \`clients/desktop/electron-builder.yml\`
- \`clients/arologis-desktop/src/main/auto-update.ts\`
- \`clients/arologis-desktop/src/main/auto-update.test.ts\`
- \`clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx\`
- \`clients/arologis-desktop/src/renderer/components/common/AppVersionGate.test.tsx\`
- \`clients/arologis-desktop/electron-builder.yml\`
- \`scripts/app-build-version.cjs\`
- \`scripts/app-build-version.test.cjs\`
- \`scripts/build-desktop-release.cjs\`
- \`scripts/build-arologis-desktop-release.cjs\`

### 신규 캡처 파일

- 없음 — 브라우저 연결 불가로 실제 캡처를 생성하지 않음

## 7. \`git status --porcelain\` 원문

보고서 작성 직후 기준:

~~~text
 M clients/arologis-desktop/electron-builder.yml
 M clients/arologis-desktop/src/main/auto-update.test.ts
 M clients/arologis-desktop/src/main/auto-update.ts
 M clients/arologis-desktop/src/renderer/components/common/AppVersionGate.test.tsx
 M clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx
 M clients/desktop/electron-builder.yml
 M clients/desktop/src/main/auto-update.test.ts
 M clients/desktop/src/main/auto-update.ts
 M clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx
 M clients/desktop/src/renderer/components/common/AppVersionGate.tsx
 M scripts/app-build-version.cjs
 M scripts/app-build-version.test.cjs
 M scripts/build-arologis-desktop-release.cjs
 M scripts/build-desktop-release.cjs
?? docs/dev-reports/2026-07-31-910-r2-updater-installer-fix.md
~~~

이 보고서는 커밋·push하지 않았으며 git 쓰기 명령도 실행하지 않았다. 결함 4·5, 백엔드, Flyway, Docker 및 데스크톱 업무 화면 로직은 변경하지 않았다.
