# PR #1181 관측가능성 정찰 — 전제 불일치로 즉시 중단

- 대상: PR #1181 `feat/910-935-client-auto-update`
- 요청 HEAD: `ff972a2da`
- 확인 HEAD: `ff972a2dac37461e9baa80cd29ab4c673a5746f3`
- 조사일: 2026-08-13 (Asia/Seoul)
- 결론: 지정된 정책 문서가 대상 HEAD에 존재하지 않아, “전제가 실측과 어긋나면 진행하지 말고 즉시 중단·보고” 지시에 따라 DB·Docker·브라우저·A~F 실측을 시작하지 않았다.

## 0. 안전 게이트

실행 명령:

```powershell
$os = Get-CimInstance Win32_OperatingSystem
[pscustomobject]@{
  FreePhysicalMemoryKB=$os.FreePhysicalMemory
  FreePhysicalMemoryGB=[math]::Round($os.FreePhysicalMemory/1MB,3)
  TotalVisibleMemoryGB=[math]::Round($os.TotalVisibleMemorySize/1MB,3)
} | Format-List
```

원문 출력:

```text
FreePhysicalMemoryKB : 30350476
FreePhysicalMemoryGB : 28.944
TotalVisibleMemoryGB : 61.613
```

판정: RAM 중단 기준(1.0GB 미만)에는 해당하지 않았다.

## 1. 전제 확인과 중단 사유

### 1.1 HEAD 확인 — 일치

git 명령은 사용하지 않았다. `.git` worktree 메타데이터를 읽기 전용으로 확인했다.

원문 출력:

```text
WORKTREE_GIT_POINTER=gitdir: C:/dev/Samhan-Public/.git/worktrees/w910
GITDIR=C:\dev\Samhan-Public\.git\worktrees\w910
HEAD_FILE=ref: refs/heads/feat/910-935-client-auto-update
COMMONDIR=C:\dev\Samhan-Public\.git
HEAD_OID=ff972a2dac37461e9baa80cd29ab4c673a5746f3
```

### 1.2 정책 문서 확인 — 불일치

요청에서 존재한다고 명시한 경로:

```text
docs/decisions/2026-08-13-client-auto-update-policy.md
```

실패 명령:

```powershell
Get-Content -Raw 'docs/decisions/2026-08-13-client-auto-update-policy.md'
```

원문 출력:

```text
Get-Content : Cannot find path 'C:\dev\Samhan-Public\.claude\worktrees\w910\docs\decisions\2026-08-13-client-auto-update-policy.md' because it does not exist.
At line:2 char:117
+ ... AGENTS.md'; Get-Content -Raw 'docs/decisions/2026-08-13-client-auto-u ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\dev\Samhan-P...pdate-policy.md:String) [Get-Content], ItemNotFoundException
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
```

파일명 유사 검색 명령:

```powershell
$hits = rg --files docs | rg '2026-08-13.*client.*auto.*update.*policy|client-auto-update-policy|auto-update-policy'
if ($LASTEXITCODE -eq 1) { 'NO_MATCH'; exit 0 }
$hits
```

원문 출력:

```text
NO_MATCH
```

판정: 요청된 HEAD는 맞지만, 그 HEAD의 `docs` 아래에 지정 정책 문서 및 유사 파일명이 없다. 이 전제 불일치가 확인된 즉시 후속 실측을 중단했다.

## 2. `app_release` 게시 건수

판정: **미조회(중단)**.

정책 문서 전제 불일치가 `app_release` 조회 전에 발견됐다. 사용자 지시상 즉시 중단해야 하므로 DB 탐색·접속·SQL 실행을 하지 않았다. 따라서 게시 건수, DB 이름, `min(created_at)`, `max(created_at)`, 최근 10건은 아직 판정할 수 없다.

## 3. A~F 관측 상태

아래 항목은 ✅/🟡/🔴 판정을 내린 것이 아니다. 전제 불일치 즉시 중단 지시 때문에 각 경로의 관측 명령 자체를 실행하지 않았다.

| 항목 | 상태 | 실행 여부 |
|---|---|---|
| A 서버 `/app/version` 9개 앱 | 판정 보류 | curl 미실행 |
| B 관리자 화면 `versionCheckSupported` | 판정 보류 | 브라우저 미실행 |
| C 웹 3앱 reload 경로 | 판정 보류 | 브라우저/Playwright 미실행 |
| D Electron 배너·“나중에” | 판정 보류 | Electron 미실행 |
| E `internal-chat-desktop` auto-update | 판정 보류 | 런타임 미실행 |
| F Expo OTA | 판정 보류 | 런타임/설정 확인 미실행 |

Playwright/Chromium 부재를 이유로 포기한 것이 아니다. 정책 문서 전제 불일치로 브라우저 단계까지 진입하지 않았다.

## 4. 게이트 ③을 어디까지 실측할 수 있는가

현재 라운드에서는 판정하지 않았다. 전제 복구 후 가장 먼저 `app_release`가 위치한 DB를 찾고 게시 건수를 조회해야 한다. 표본이 0건이면 그 사실을 우선 결론으로 기록하고, 표본 없이 밟을 수 있는 정적/무업데이트 경로와 표본이 있어야 밟히는 업데이트 경로를 분리해야 한다.

## 5. 어디부터 못 하는가

현재 확인된 최초 차단점은 지정 정책 문서의 부재다. 다음 중 하나가 필요하다.

1. 대상 HEAD에 `docs/decisions/2026-08-13-client-auto-update-policy.md`를 포함한 뒤 같은 정찰을 다시 실행한다.
2. 문서의 실제 경로를 제공한다.
3. 프롬프트에 적힌 정책 4건을 문서 대신 기준으로 삼아도 된다는 명시적 지시를 한다.

이 차단점 뒤의 DB 표본, 백엔드 빌드 시각, 릴리스 서버, 서명 빌드, Electron/Expo 조건은 아직 조사하지 않았으므로 “불가”라고 추정하지 않는다.

## 6. 개발책임자 판단 필요

정찰 재개 기준만 필요하다: 위 1~3 중 어느 기준으로 정책 전제를 복구할지 결정해야 한다.

## 7. 쓰기 및 프로세스 기록

- 서비스/DB 쓰기: 없음
- 생성 파일: 이 문서 1개
- 시작한 앱/브라우저/백엔드 프로세스: 없음
- 정리할 프로세스: 없음
- git 명령: 사용하지 않음

---

# 정찰 재개 본문 — PM 브리핑 정정 반영

PM 정정에 따라 읽기 목적의 아래 명령만 허용받아 정책 원문을 확인했다. 앞의 중단 기록은 당시 판단의 감사 이력으로 보존한다.

```powershell
git show origin/main:docs/decisions/2026-08-13-client-auto-update-policy.md
```

명령은 exit 0이었다. 원문에서 다음 4건을 확인했다.

```text
1 업데이트 설치 시점: 지금처럼 강제 즉시 설치
2 사내 메신저(INTERNAL_CHAT_DESKTOP): 지금 업데이트 경로를 만든다
3 장애 버전 복구: 다운그레이드를 허용한다 (allowDowngrade=true)
4 진행 순서: 정책 결정을 반영해 9건을 한 번에
```

## 8. 최종 요약

| 조사 항목 | 판정 | 실측 결론 |
|---|---|---|
| `app_release` | 핵심 경계 | 전체 144건, **활성 게시 행 0건** |
| A 서버 `/app/version` | ✅ 실측 가능 | 기존 8종은 404, 신설 사내 메신저는 구 백엔드 enum 불일치로 400 |
| B 관리자 화면 | ✅ 실측 가능 | 9종 모두 표시, `(버전 확인 미지원)` 표기 0건 |
| C 웹 3앱 reload | 🟡 조건부 | 유효 게시 행과 세 앱 로컬 의존성 설치가 필요. 현재 각 dev 서버 시작 실패 |
| D Electron | 🟡 조건부 | UI/IPC 계약 18/18 통과. 실제 다운로드·즉시 설치는 서명 packaged 빌드와 feed 필요 |
| E 사내 메신저 | 🟡 조건부 | 신설 계약 8/8 통과. 구 dashboard 백엔드는 client type을 몰라 400 |
| F Expo OTA | ✅ 활성 여부 실측 가능 | 세 앱 모두 `updates.enabled=false`; OTA 비활성 |

게이트 ③의 현재 실측 상한은 **서버의 무표본 응답, 관리자 9종 표기, 클라이언트 로컬 UI/IPC 계약, Expo OTA 비활성 상태**까지다. **실제 릴리스 감지 → 바이너리 다운로드 → 즉시 설치/다운그레이드**는 밟을 수 없다.

## 9. Docker 스택 전제 원문

실행 명령:

```powershell
docker inspect --format '{{.Name}}|image={{.Config.Image}}|created={{.Created}}|started={{.State.StartedAt}}|status={{.State.Status}}' $(docker ps -q)
```

관련 원문:

```text
/samhan-slip-service|image=infrastructure-slip-service|created=2026-08-12T17:53:07.461758521Z|started=2026-08-13T10:01:44.02649449Z|status=running
/samhan-api-gateway|image=infrastructure-api-gateway|created=2026-08-12T15:39:17.991855852Z|started=2026-08-13T10:01:44.022240135Z|status=running
/samhan-dashboard-service|image=infrastructure-dashboard-service|created=2026-08-11T17:59:58.903286495Z|started=2026-08-13T10:01:44.0329351Z|status=running
```

중요: 스택 전체가 17:53 빌드라는 전제와 달리 혼합 이미지다. `/app/version` 소유자인 dashboard-service는 2026-08-11 이미지다. 따라서 `INTERNAL_CHAT_DESKTOP` 400은 PR HEAD의 서버 동작으로 판정하지 않는다.

## 10. `app_release` 게시 건수

### 10.1 테이블 위치

전체 접속 가능 DB에서 `information_schema.tables`를 조회했다.

```text
dashboard_db|public|app_release
```

### 10.2 요청된 쿼리와 원문

```sql
select count(*), min(created_at), max(created_at) from app_release;
```

```text
 count |            min             |            max
-------+----------------------------+----------------------------
   144 | 2026-06-27 01:24:22.867545 | 2026-07-30 01:39:22.692121
(1 row)
```

```sql
select * from app_release order by created_at desc limit 10;
```

최근 10건 원문에서 확인된 공통 사실은 모두 `is_deleted=t`였다. 행별 핵심 열 원문은 다음과 같다(식별 UUID는 사용자 화면이 아닌 DB 정찰 원문이므로 감사 근거에만 기록).

```text
client_type       | version          | force_level | created_at                 | is_deleted | is_published
DESKTOP           | 2026/07/30-1     | MINOR       | 2026-07-30 01:39:22.692121 | t          | f
DESKTOP           | 2026/07/30-1     | MINOR       | 2026-07-30 01:39:01.362422 | t          | f
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-28 07:17:12.440974 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-28 00:03:41.640107 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-28 00:01:01.424265 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-27 23:57:46.052214 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-27 23:56:32.979741 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-27 23:55:48.798579 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-27 23:54:53.271649 | t          | t
SAMHAN_ORDER_WEB  | 2026/07/26-92801 | MINOR       | 2026-07-27 23:39:49.605779 | t          | t
```

라이브 유효 표본 확인 쿼리:

```sql
select count(*) as active_published_total
from app_release
where is_published and not is_deleted;
```

```text
 active_published_total
------------------------
                      0
(1 row)
```

앱별 집계도 10개 기존 DB client type 모두 `active_published=0`이었다. 신설 `INTERNAL_CHAT_DESKTOP` 행은 아예 없다. 따라서 **전체 물리 행은 144건이나 현재 `/app/version`이 사용할 게시 표본은 0건**이다.

## 11. A — 서버 `/app/version`: ✅ 실측 가능

실행 명령:

```powershell
curl.exe -sS -i --get 'http://127.0.0.1:8080/app/version' \
  --data-urlencode "clientType=<각 client type>" \
  --data-urlencode 'currentVersion=2026/08/13-1'
```

9종 응답 원문:

```text
DESKTOP                  HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: DESKTOP","data":null,"timestamp":"2026-08-13T10:39:52.988793780Z"}

SAMHAN_MOBILE             HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: SAMHAN_MOBILE","data":null,"timestamp":"2026-08-13T10:39:53.024869878Z"}

SAMHAN_MOBILE_STAFF       HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: SAMHAN_MOBILE_STAFF","data":null,"timestamp":"2026-08-13T10:39:53.056185602Z"}

AROLOGIS_MOBILE           HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: AROLOGIS_MOBILE","data":null,"timestamp":"2026-08-13T10:39:53.087872090Z"}

SAMHAN_ORDER_WEB          HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: SAMHAN_ORDER_WEB","data":null,"timestamp":"2026-08-13T10:39:53.120231112Z"}

SAMHAN_ESTIMATE_WEB       HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: SAMHAN_ESTIMATE_WEB","data":null,"timestamp":"2026-08-13T10:39:53.153088076Z"}

SAMHAN_MOBILE_PUBLIC_WEB  HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: SAMHAN_MOBILE_PUBLIC_WEB","data":null,"timestamp":"2026-08-13T10:39:53.183181697Z"}

AROLOGIS_DESKTOP          HTTP/1.1 404 Not Found
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: AROLOGIS_DESKTOP","data":null,"timestamp":"2026-08-13T10:39:53.216994581Z"}

INTERNAL_CHAT_DESKTOP     HTTP/1.1 400 Bad Request
{"success":false,"code":"INVALID_INPUT","message":"요청 파라미터 형식이 올바르지 않습니다.","data":null,"timestamp":"2026-08-13T10:39:53.255221067Z"}
```

관측 범위: 9종의 현재 HTTP 상태·본문까지는 실측했다. 유효 게시 행이 없으므로 200 응답의 버전 비교/force level 본문은 실측하지 못했다. 사내 메신저 400은 구 dashboard-service enum 경계다.

## 12. B — 관리자 화면: ✅ 실측 가능

Chromium 증명 원문:

```text
Version 1.59.1
CHROMIUM_1217_COUNT=1
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

인앱 Browser 연결은 실패했으나 로컬 Playwright Chromium은 정상 실행했다.

```text
No browser is available
browser list: []
```

관리자 web renderer를 mock 인증 모드로 실행해 `/admin/app-releases`의 릴리스 등록 모달을 실제 렌더했다. 옵션 원문:

```text
삼한 데스크톱
삼한 모바일
삼한 직원 모바일
아로로지스 모바일
삼한 주문 웹
삼한 종합견적 웹
삼한 모바일 퍼블릭 웹
아로로지스 데스크톱
사내 메신저 데스크톱
```

`(버전 확인 미지원)` 접미사는 0건이다. 즉 PR의 `versionCheckSupported=true` 9건 일괄 반영이 실제 렌더에 나타난다.

스크린샷: [admin-app-releases.png](2026-08-13-1181-observability-recon/admin-app-releases.png)

주의: 공유 DB에 로그인 write를 만들지 않기 위해 mock 인증/목록을 사용했다. 옵션과 표기 컴포넌트는 PR HEAD의 실제 렌더 코드다.

## 13. C — 웹 3앱 reload 경로: 🟡 조건부

실서버 유효 게시 표본이 0건이므로 실제 배너 분기는 열리지 않는다. 또한 세 앱 작업트리에 로컬 의존성이 설치돼 있지 않아 dev 서버가 시작되지 않았다.

실패 명령(요약):

```powershell
npm exec vite -- --host 127.0.0.1 --port 49182  # order-app
npm exec vite -- --host 127.0.0.1 --port 49183  # mobile-public
npm run dev                                     # estimate-app
```

원문:

```text
# order-app
failed to load config ...\clients\web\order-app\vite.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite' imported from C:\dev\Samhan-Public\node_modules\.vite-temp\...

# mobile-public
failed to load config ...\clients\web\mobile-public\vite.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite' imported from C:\dev\Samhan-Public\node_modules\.vite-temp\...

# estimate-app
Error: Cannot find module 'dotenv'
Require stack:
- C:\dev\Samhan-Public\.claude\worktrees\w910\clients\web\estimate-app\server.js
```

조건:

1. 각 앱의 lockfile 기준 의존성 설치.
2. 각 client type에 `is_published=true AND is_deleted=false`인 `app_release` 행 1건 이상.
3. reload를 실제 확인하려면 현재 버전보다 높은 버전과 MINOR/MAJOR/CRITICAL 정책.

코드상 세 앱 모두 `페이지 새로고침`, dirty 확인, `window.location.reload()` 경로는 존재한다. 그러나 이번 라운드에서는 실행 실패했으므로 라이브QA 통과로 세지 않는다.

## 14. D — Electron 배너·버튼: 🟡 조건부

아로로지스 대상 실행:

```powershell
npm exec vitest -- run src/renderer/components/common/AppVersionGate.test.tsx src/main/auto-update.test.ts
```

원문:

```text
✓ src/main/auto-update.test.ts (10 tests)
✓ src/renderer/components/common/AppVersionGate.test.tsx (8 tests)
Test Files  2 passed (2)
Tests       18 passed (18)
```

PR 정책 반영 관측:

```text
autoUpdater.allowDowngrade = true
```

버튼 동작은 정책 문서대로 바뀌었다. 테스트명과 assertion 원문:

```text
자동 설치가 계속되는 안내의 닫기 버튼은 나중에가 아니라 안내 닫기라고 표시한다
expect(screen.getByRole('button', { name: '안내 닫기' })).toBeTruthy()
expect(screen.queryByRole('button', { name: '나중에' })).toBeNull()
```

즉 현재 PR에는 오해를 주던 “나중에” 버튼이 없고 “안내 닫기”만 있다. 다만 이는 로컬 renderer/IPC 실측이지 실서명 바이너리 업데이트 실측은 아니다.

실제 다운로드·즉시 설치·다운그레이드 조건:

- 서명된 packaged Windows 빌드 (`app.isPackaged=true`)
- generic release 서버의 `latest.yml`, installer, blockmap
- 유효 게시 `app_release` 행
- 현재보다 높거나 다운그레이드 대상인 실제 릴리스

현재 산출물 검색 원문:

```text
latest.yml COUNT=0
*.blockmap COUNT=0
*.appx COUNT=0
*.msi COUNT=0
```

## 15. E — 사내 메신저 신설분: 🟡 조건부

신설 파일은 `clients/internal-chat-desktop/src/main/auto-update.ts`이며 다음을 확인했다.

```text
electron-updater ^6.8.9
clientType: 'INTERNAL_CHAT_DESKTOP'
autoUpdater.allowDowngrade = true
updater:check / updater:install / updater:quit IPC
```

실행:

```powershell
npm exec vitest -- run src/main/auto-update.test.ts src/main/app-shell.contract.test.ts
```

원문:

```text
✓ src/main/app-shell.contract.test.ts (6 tests)
✓ src/main/auto-update.test.ts (2 tests)
Test Files  2 passed (2)
Tests       8 passed (8)
```

현재 라이브 백엔드는 A에서 본 것처럼 `INTERNAL_CHAT_DESKTOP`에 400을 반환한다. 신설 경로의 실제 라이브QA에는 새 enum이 포함된 dashboard-service 재빌드, 유효 게시 행, 사내 메신저 서명 packaged 빌드와 generic feed가 필요하다.

## 16. F — Expo OTA: ✅ 활성 여부 실측 가능

세 `app.config.js`를 현재 환경에서 직접 평가한 원문:

```text
samhan-mobile:
  projectId: PLACEHOLDER_EAS_PROJECT_ID
  updates.enabled: false
  updates.url: https://u.expo.dev/PLACEHOLDER_EAS_PROJECT_ID

samhan-estimate:
  projectId: PLACEHOLDER_EAS_PROJECT_ID
  updates.enabled: false
  updates.url: https://u.expo.dev/PLACEHOLDER_EAS_PROJECT_ID

arologis-driver:
  projectId: PLACEHOLDER_EAS_PROJECT_ID
  updates.enabled: false
  updates.url: https://u.expo.dev/PLACEHOLDER_EAS_PROJECT_ID
```

결론: Expo OTA는 세 앱 모두 현재 **비활성**이다. 코드에는 `checkForUpdateAsync → fetchUpdateAsync → reloadAsync`가 있으나, 실제 OTA 라이브QA에는 실제 EAS projectId, preview/production 빌드, 해당 channel의 OTA publish가 필요하다.

## 17. 게이트 ③ — 지금 실행 가능한 라이브QA 시나리오

1. `dashboard_db.public.app_release` 전체/유효 표본 집계.
2. 9 client type의 `/app/version` 상태·본문 직접 curl.
3. 관리자 릴리스 등록 모달에서 9종 표기와 미지원 접미사 부재 확인.
4. Chromium-1217로 관리자 UI 렌더와 스크린샷.
5. 아로로지스 Electron renderer/IPC에서 배너 문구, “안내 닫기”, 설치 실패 재시도 계약 실행.
6. 사내 메신저 updater IPC/앱 셸 계약 실행.
7. 세 Expo 앱의 현재 OTA 활성 여부 설정 평가.

이 중 1~4와 7은 현재 환경 관측이고, 5~6은 로컬 런타임 테스트다. 실제 릴리스 E2E로 과장하지 않는다.

## 18. 어디부터 못 하는가

최초 경계는 **활성 게시 행 0건**이다. 이 때문에 9개 앱 어느 것도 서버의 200 버전 정책을 받지 못한다.

그 다음 경계:

- 백엔드: dashboard-service가 2026-08-11 이미지라 사내 메신저 enum 미지원.
- 웹: 세 앱 로컬 node_modules 미설치.
- Electron: 서명 packaged 빌드와 generic feed 산출물 부재.
- Expo: EAS projectId placeholder, `updates.enabled=false`.

따라서 현재 못 하는 시나리오:

1. 웹 3앱의 실제 서버 정책 기반 배너 → dirty 확인 → reload.
2. 삼한/아로로지스/사내 메신저의 실제 바이너리 다운로드.
3. 다운로드 완료 직후 강제 즉시 설치와 프로세스 재기동.
4. `allowDowngrade=true`를 이용한 실제 다운그레이드.
5. Expo OTA fetch → reload.

## 19. 개발책임자 판단 필요

게이트 ③을 실제 릴리스 E2E까지 올리려면 별도 QA 릴리스 창이 필요하다. 최소 준비물은 다음과 같다.

1. PR HEAD의 dashboard-service를 다른 트랙과 충돌하지 않는 격리 스택에 배포.
2. 9종 또는 대상별 유효 `app_release` QA 행 생성 및 종료 후 soft-delete 승인.
3. Windows 서명 인증서가 적용된 packaged 빌드와 격리 generic feed.
4. 실제 EAS project/channel과 QA OTA publish.

공유 스택에서 이 쓰기를 수행하지 않았다.

## 20. 추가 쓰기 및 프로세스 기록

추가 생성물:

- `docs/qa/2026-08-13-1181-observability-recon/admin-app-releases.png`
- `docs/qa/2026-08-13-1181-observability-recon/capture-admin.mjs`
- 같은 디렉터리의 dev 서버 stdout/stderr 로그

서비스/DB write: 없음. 관리자 렌더는 mock 인증을 사용했다. git은 허용된 `git show` 한 번만 사용했고 add/commit/push/checkout/reset/fetch는 사용하지 않았다.

프로세스 정리 원문:

```text
LISTENER_BEFORE port=49181 pid=12628
STOP pid=12628 name=node
LISTENER_AFTER port=49181 NONE
LISTENER_AFTER port=49182 NONE
LISTENER_AFTER port=49183 NONE
LISTENER_AFTER port=49184 NONE
```
