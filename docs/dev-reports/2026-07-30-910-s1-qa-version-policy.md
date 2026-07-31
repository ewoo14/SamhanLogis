# Issue #910 / PR #993 슬라이스 1 — QA 하네스 버전 정책 경로

작성일: 2026-07-30

## 결론

`8.98029556650246`은 저장소 코드가 생성한 버전이 아니다. 원인 규명 전의 renderer 개발 설정은 Vite가 노출한 `VITE_APP_VERSION`을 검증하거나 고정하지 않고 통과시켰다. 따라서 해당 값은 QA 실행 시 Vite 프로세스에 들어온 환경변수 값이 renderer로 전달된 것으로 판정한다.

실제 renderer 호출 경로는 다음과 같다.

```text
vite.renderer.dev.config.ts
  → import.meta.env.VITE_APP_VERSION
  → src/renderer/components/common/AppVersionGate.tsx:21-23
  → resolveBuildAppVersion(...)
  → src/renderer/components/common/AppVersionGate.tsx:272
  → getAppVersion({ currentVersion: CURRENT_VERSION })
  → GET /app/version?clientType=DESKTOP&currentVersion=...
```

`resolveBuildAppVersion()`은 값을 생성하지 않고 trim 후 반환한다. 저장소 전체에서 해당 숫자 literal은 발견되지 않았고, 버전 경로의 `Math.random()`도 발견되지 않았다. 즉 이 값은 난수 생성 결과가 아니라 개발 실행 환경의 잘못된 `VITE_APP_VERSION` 주입값이다.

## 재현

수정 전 백엔드 직접 재현:

```text
GET http://localhost:8080/app/version?clientType=DESKTOP&currentVersion=8.98029556650246
STATUS=400
BODY={"success":false,"code":"INVALID_INPUT","message":"현재 버전 semver 형식 불일치: 8.98029556650246",...}
```

수정 전 `vite.renderer.dev.config.ts`를 CLI `--port 5206 --strictPort`로 실행했다. 설정 파일의 기본 포트는 기존 값인 `5175`를 유지한다.

```text
VITE_APP_VERSION=2026/07/30-1
VITE_MOCK_MODE=0
VITE_API_BASE_URL=http://localhost:8080
vite --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5206 --strictPort
```

브라우저에서 실제 전달된 요청은 다음과 같았다.

```text
http://localhost:8080/app/version?clientType=DESKTOP&currentVersion=2026%2F07%2F30-1
```

이때 백엔드에 DESKTOP release가 없어 응답은 404였지만, renderer가 보낸 값은 환경변수의 `2026/07/30-1`이었다. 반대로 수정 후 잘못된 값을 주입해 Vite를 시작하면 서버가 뜨기 전에 공통 검증기가 중단시킨다.

```text
Error: VITE_APP_VERSION는 YYYY/MM/DD-{번호} 형식이어야 합니다: 8.98029556650246
```

## 변경 내용

`clients/desktop/vite.renderer.dev.config.ts`에 공통 `scripts/app-build-version.cjs`의 `resolveBuildAppVersion()`을 연결했다.

- `VITE_APP_VERSION`을 `YYYY/MM/DD-N` 또는 legacy semver 규약으로 공통 검증한다.
- 검증된 값을 `import.meta.env.VITE_APP_VERSION`으로 명시 주입한다.
- QA renderer 기본 포트 `5175`와 `strictPort: true`를 유지한다. 필요한 QA 실행 포트는 CLI `--port 5206 --strictPort`로 덮어쓴다.
- release 설정, 패키징, 코드서명, 피드, 설치본은 변경하지 않았다.

회귀 테스트는 `clients/desktop/src/renderer/version/qaRendererConfig.test.ts`에 추가했다. 테스트는 명시 주입/strictPort와 잘못된 버전의 config-load 실패를 검증한다.

초기 RED는 실행 지시 포트 `5206`을 config 기본 포트로 잘못 기대했으므로, PM 확인 후 테스트 기대값도 정본 포트 `5175`로 복구했다. 실행 지시가 필요한 경우에만 CLI `--port 5206 --strictPort`를 사용한다.

## RED 원문

수정 전 테스트 결과:

```text
RUN v2.1.9 ...
❯ src/renderer/version/qaRendererConfig.test.ts (2 tests | 2 failed)
× 검증된 VITE_APP_VERSION을 renderer에 주입하고 5206 strictPort로 고정한다
  → expected { 'process.env': '{}' } to deeply equal ObjectContaining{…}
× 잘못된 VITE_APP_VERSION은 renderer config 로드 단계에서 거부한다
  → promise resolved "{ …(3) }" instead of rejecting
Test Files 1 failed (1)
Tests 2 failed (2)
```

## 배포본 도달 여부 재판정

원래의 잘못된 환경변수가 release 산출물에 그대로 도달한다는 증거는 없으며, 도달하지 않도록 이미 별도 방어선이 있었다. `clients/desktop/electron.vite.config.ts`는 공통 version resolver를 사용하고, release wrapper와 `clients/desktop/scripts/validate-desktop-release.cjs`가 무주입/비정상 release 산출물을 거부한다.

`npm run test:round-910-contract` 결과도 11개 테스트 전부 통과했다. 따라서 이번 변경은 개발·QA renderer 경계에 검증을 추가하며, 정식 배포본의 동작은 바꾸지 않는다.

## 200 응답 실측

백엔드가 요구하는 DESKTOP release가 없어 실행 중인 백엔드의 `/app/releases` 관리 API에 QA 검증용 임시 release를 만들고 브라우저로 호출한 뒤 즉시 soft-delete했다. 실제 200 응답 요청 URL 원문은 다음과 같다.

```text
http://localhost:8080/app/version?clientType=DESKTOP&currentVersion=2026%2F07%2F30-1
```

```text
status=200
body={"success":true,"code":"OK","message":"성공","data":{"latestVersion":"2026/07/30-1","minSupportedVersion":"2026/07/30-1","forceLevel":"NONE",...}}
```

임시 데이터 상세:

- 대상: 실행 중인 백엔드의 DESKTOP app release 저장소
- 생성 API: `POST /app/releases`
- 공개 API: `POST /app/releases/{id}/publish`
- 값: `clientType=DESKTOP`, `version=2026/07/30-1`, `minSupportedVersion=2026/07/30-1`, `forceLevel=MINOR`, `releaseNotes=QA #910 slice 1 throwaway`, `releasedAt=2026-07-30T01:40:00`
- 정리 API: `DELETE /app/releases/{id}` → `OK`
- 정리 후 읽기 전용 확인: `GET /app/releases?clientType=DESKTOP` → 활성 릴리스 `0건`, throwaway 일치 `0건`

## 검증 결과

```text
npx vitest run
Test Files 186 passed (186)
Tests 1673 passed (1673)
EXIT_CODE=0

npm run test:round-910-contract
ℹ tests 11
ℹ pass 11
ℹ fail 0

npm run typecheck
EXIT_CODE=0
[로컬 파생물 신선도] typecheck 대상 확인 완료
✔ typecheck:real-qa tests 2
ℹ pass 2
ℹ fail 0
```

`typecheck`는 게이트를 우회하지 않았다. worktree의 `clients/web/design-system/dist`가 없어 PM이 준비한 메인 트리 산출물에 junction을 연결한 뒤 정상 통과했다. `clients/web` 소스와 design-system 산출물 자체는 수정하지 않았다.

포트 최종 확인:

```text
RendererConfigPort : 5175
RealQaExpectedPort : 5175
Match              : True
StrictPort         : True
```
