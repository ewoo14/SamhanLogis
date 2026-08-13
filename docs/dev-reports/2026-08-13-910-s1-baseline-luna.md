# #910 S1 9앱 계약 기준선 — LUNA (2026-08-13)

## 범위와 머지 결과

이번 슬라이스는 정찰 권고대로 9앱 식별자·버전 계약·내부 채팅 source CI·아로로지스 runtime dependency만 다뤘다. 배포 URL, 실제 feed, channel, 코드서명, installer release CI, `/app/version` 정책(feed와 별개)은 변경하지 않았다. `intranet.example` fixture도 변경하지 않았다.

- 시작 브랜치: `feat/910-935-client-auto-update`
- `git fetch origin` 후 `git merge origin/main` 수행 결과: merge commit `5d3094cd2`
- 반영된 원격 기준: `origin/main` `7f9335d06`
- commit/push/merge trigger는 수행하지 않았다(사용자 지시).

## 9앱 계약 전후 상태

| 앱 | 식별자 전 | 식별자 후 | 버전 계약 전 | 버전 계약 후 | CI/검증 후 |
|---|---|---|---|---|---|
| 삼한 데스크톱 | `DESKTOP` | 동일 | 공통 `YYYY/MM/DD-N` → 내부 semver/PE 변환 | 동일, 공통 3-Electron wrapper 테스트 대상 | 기존 CI 유지 |
| 아로로지스 데스크톱 | `AROLOGIS_DESKTOP` | 동일 | 공통 resolver, wrapper | 동일; `electron-updater`를 `dependencies`로 이동 | 기존 별도 CI 유지 |
| 사내 메신저 데스크톱 | 식별자 없음 | `INTERNAL_CHAT_DESKTOP` | wrapper는 공통 환경만 사용, NSIS 사용자 표시 버전 include 없음 | 공통 `createNsisDisplayVersionInclude` + `YYYY/MM/DD-N`; feed/channel 없음 | 신규 CI: `npm ci`, typecheck, lint, test, electron-vite build |
| 삼한 모바일 | `SAMHAN_MOBILE` | 동일 | `/app/version` + Expo 계약 | 동일 | 기존 검증 |
| 직원 모바일 | `SAMHAN_MOBILE_STAFF` | 동일 | `/app/version` + Expo 계약 | 동일 | 기존 검증 |
| 아로로지스 모바일 | `AROLOGIS_MOBILE` | 동일 | `/app/version` + Expo 계약 | 동일 | 기존 검증 |
| 주문 웹 | `SAMHAN_ORDER_WEB` | 동일 | `/app/version` + 사용자 선택 reload | 동일 | 기존 CI |
| 종합견적 웹 | `SAMHAN_ESTIMATE_WEB` | 동일 | `/app/version` + 사용자 선택 reload | 동일 | 기존 CI |
| 모바일 퍼블릭 웹 | `SAMHAN_MOBILE_PUBLIC_WEB` | 동일 | `/app/version` + 사용자 선택 reload | 동일 | 기존 CI |

서버 enum, Flyway check constraint, desktop 관리 선택지/label/mock type, 계약 테스트가 같은 canonical 9앱 목록을 가리킨다. 구버전 `WEB`·`MOBILE` 호환 식별자는 보존했다.

## RED → GREEN 원문

### RED

구현 전 공통 wrapper 테스트에 내부 채팅을 포함한 뒤 실행한 원문:

```text
✖ 두 릴리스 wrapper가 실제 package semver를 builder CLI transformer 입력으로 전달한다
AssertionError [ERR_ASSERTION]: clients/internal-chat-desktop
+ actual - expected

+ '--config.win.signAndEditExecutable=false'
- '--win'
```

이는 내부 채팅 wrapper가 공통 NSIS include/인자 계약을 아직 충족하지 못한 실제 RED였다. 신규 9앱 목록 계약은 `INTERNAL_CHAT_DESKTOP` enum/관리 목록 부재를 직접 기대값으로 잡아 RED-first 기준선을 세웠다.

### GREEN

수정 후:

```text
✔ 세 Electron 릴리스 wrapper가 실제 package semver를 builder CLI transformer 입력으로 전달한다
ℹ tests 16
ℹ pass 16
ℹ fail 0
```

## 세 Electron 앱 검증 원문

### `clients/desktop`

```text
typecheck: Exit code 0
test 최종: Test Files 263 passed (264), Tests 2260 passed | 2 skipped (2283)
build: Exit code 0 — electron-vite main/preload/renderer build 완료
```

주의: test는 Vitest가 `Worker exited unexpectedly` 1건을 보고해 최종 프로세스 종료 코드가 1이었다. 따라서 테스트를 통과했다고 보고하지 않는다. 원문 핵심:

```text
Test Files 263 passed (264)
Tests 2260 passed | 2 skipped (2283)
Errors 1 error
Error: Worker exited unexpectedly
```

첫 test 시도에서는 `electron` postinstall 바이너리가 없는 `npm ci --ignore-scripts` 상태로 `Electron failed to install correctly`가 발생했고, `npm rebuild electron` 후 위 결과를 얻었다.

### `clients/arologis-desktop`

```text
typecheck: Exit code 0
Test Files 17 passed (17)
Tests 80 passed (80)
build: Exit code 0 — electron-vite main/preload/renderer build 완료
```

### `clients/internal-chat-desktop`

```text
typecheck: Exit code 0
Test Files 1 passed (1)
Tests 5 passed (5)
build: Exit code 0 — electron-vite main/preload/renderer build 완료
```

내부 채팅은 이번 CI에서 Windows NSIS/portable release를 실행하지 않았다. 이는 이번 변경의 source CI 범위이며, 실제 installer/feed 게시를 추가하지 말라는 범위 제한에 따른 것이다.

## CI 변경 근거

`.github/workflows/ci.yml`에 `frontend-internal-chat-desktop` job을 추가했다. `clients/internal-chat-desktop/package-lock.json`을 cache dependency로 사용하고, 다음 순서를 필수 실행한다.

```text
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

이 변경은 기존 내부 채팅이 workflow 참조 0건이던 상태를 source 품질 기준선에 편입하기 위한 것이다. Windows installer, signing, `latest.yml`, publish URL, channel은 CI에 추가하지 않았다.

아로로지스 `electron-updater`는 packaged runtime에서 로드되므로 `devDependencies`에서 `dependencies`로 이동하고 lockfile을 동기화했다. 실제 installer 포함 여부 E2E는 하지 않았다.

## PR #1195 및 fixture 경계

PR #1195의 `200 + NONE` `/app/version` 정책은 바이너리 `latest.yml` feed와 별개이므로 이번 변경에서 섞지 않았다. 사내 채팅에 `/app/version` 호출·updater IPC/UI를 추가하지 않았고, 실제 업데이트 피드에도 연결하지 않았다. `intranet.example`는 기존 테스트 fixture로 유지했다.

## 못 한 것 / 실행 관찰

- 삼한 데스크톱 전체 test는 worker unexpected exit 때문에 exit code 1이다. 숫자는 위에 원문대로 기록했다.
- 세 앱의 실제 Windows installer/NSIS·portable 생성은 실행하지 않았다.
- 실제 feed URL, `latest.yml`, 다운로드·설치 E2E, 코드서명, release publish CI는 범위 밖이라 하지 않았다.
- dashboard Flyway IT와 공유 DB 실행은 공유 DB 쓰기 금지 때문에 하지 않았다. migration은 코드로만 추가했다.
- 로컬 검증 중 design-system `dist`가 없어 먼저 해당 file dependency를 로컬 build했다. 공유 DB/Docker stack은 사용하지 않았다.

## 라운드 종료 점검

삭제된 추적 파일은 0개로 정리했고, 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 원격 기준 내용으로 복원되어 `git ls-files`에서 확인된다. 이번 라운드에는 `docs/qa` 아래 새 드라이버 스크립트를 만들지 않았다. 공유 Docker stack 중지와 공유 DB 쓰기는 없었다.
