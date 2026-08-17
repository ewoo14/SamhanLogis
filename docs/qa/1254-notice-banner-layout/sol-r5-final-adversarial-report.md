# PR #1254 CODEX SOL 최종 재수렴 적대검증 보고서

판정 시각: 2026-08-16 20:27 KST  
검증 HEAD: `4212c724baf7a6accb7fa27825270434fcf0b0ef`  
유일한 판정 질문: **실 사용자가 화면을 통해 도달할 수 있는 결함이 남아 있는가? → 예, 5건.**

## 1. 환경 확인

요청한 명령의 최초 실행 원문이다. `git status --porcelain` 출력은 빈 줄이었다.

```text
4212c724baf7a6accb7fa27825270434fcf0b0ef
fix/notice-banner-layout-and-wording

#910 문서 계약 테스트 (docs/dev-reports 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598398/job/95156223418
App Build Version Guard (scripts/app-build-version, #910/#928)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223777
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598388/job/95156223299
Arologis Notion Runtime Zero Guard (SP-08-7)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598388/job/95156223343
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223754
Credential Plaintext Guard (SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223693
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598336/job/95156223208
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598336/job/95156223104
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598336/job/95156223108
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223673
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223761
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223648
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223679
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223690
Local Stack Port Resolver Guard (#1113)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223700
Notion Runtime Zero Guard (SP-08-7)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223753
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598336/job/95156223141
S1 logging opt-in 계약 (docs/local-stack 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598398/job/95156223434
데스크톱 빌드 (arologis-desktop)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598388/job/95156223286
모바일 prebuild (arologis-mobile)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598388/job/95156223390
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598398/job/95156223568
백엔드 빌드 + 테스트 (arologis-service)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598388/job/95156223400
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223789
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223768
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223778
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223805
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223809
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223808
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223758
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223905
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223817
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223845
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223784
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598393/job/95156223764
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598388/job/95156223314
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598398/job/95156223488
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31943598381/job/95156223189
GitGuardian Security Checks	pass	1s	https://dashboard.gitguardian.com
```

## 2. CI 카운트

- 최초: 총 38건 = 통과 1, 대기 37, 실패 0.
- 최종 재확인: 총 53건 = 통과 52, 실패 1, 대기 0.
- 실패 원문: `Desktop Playwright (mock 회귀 hard gate)` — `FAILURE`, https://github.com/ewoo14/Samhan-Public/actions/runs/31943598336/job/95156223208
- CI는 red다.

## 3. 스크롤로 새로 열린 표면 실측

1. **스크롤바 포인터 — 결함.** 600×720, 스택 scrollTop=0에서 오른쪽 트랙 좌표 `(213, 635.2917)` 클릭. 원문:

   ```text
   [SCROLLBAR-CLICK] {"x":213,"y":635.2916931152345,"before":0,"hitTag":"TD","hitTestId":"arologis-unassigned-row-2026/08/08-54","after":0,"underlyingClicks":1}
   ```

   스크롤바는 움직이지 않고 아래 표 셀로 클릭이 통과했다. 사용자에게 보이는 스크롤바를 클릭·드래그해 탐색할 수 없다.

2. **Tab 탈출 — 정상.** 스택 → `보안인증서 설치` → `다시 확인` → `닫기` → 스택 밖 `배차` 링크로 탈출했다.

   ```text
   [TAB] escaped=true sequence=[{"tag":"DIV","inside":true},{"tag":"BUTTON","text":"보안인증서 설치","inside":true},{"tag":"BUTTON","text":"다시 확인","inside":true},{"tag":"BUTTON","text":"닫기","inside":true},{"tag":"A","text":"배차","inside":false},...]
   ```

3. **경계 휠의 본문 스크롤 — 결함.** 스택을 끝까지 보낸 뒤 스택 위에서 아래로 `wheel(0,240)` 했다. 아래 `MAIN`의 scrollTop은 100→100으로 그대로였다.

   ```text
   [WHEEL-BOUNDARY] {"x":116,"y":582.2291793823242,"stackBefore":288.6666564941406,"bodyBefore":100,"scrollerTag":"MAIN","stackAfter":188.6666717529297,"bodyAfter":100}
   ```

4. **버튼 경계 — 결함.** 600×720에서 `scrollIntoView(nearest)` 후에도 세 버튼 하단이 스택 하단 `704.0000`을 각각 0.2396~0.3229px 넘었다. 중심 hit는 버튼 자신이어서 클릭은 됐지만, “경계에서 잘리지 않는다”는 화면 계약은 깨졌다.

5. **모달 — 정상.** `stackZ=999`, 실제 저장 모달 backdrop `z=1000`, stack 위치 hit가 backdrop 내부였다. 저장하지 않고 취소했다.
6. **드롭다운 — 정상.** 수동 배차 native select에 `Alt+ArrowDown`, `active=true`, options=3, Escape로 닫았다.
7. **인쇄 — 정상.** `[data-print-exclude]` 4개 모두 computed `display:none`.
8. **Windows sandbox 인수 — 정상.** 실제 Windows launch 원문은 아래와 같고 `--no-sandbox`가 없다.

   ```text
   [WINDOWS-LAUNCH-ARGS] ["--user-data-dir=C:\\Users\\user\\AppData\\Local\\Temp\\1254-sol-r5-final-...","C:\\dev\\Samhan-Public\\.claude\\worktrees\\w1253\\clients\\arologis-desktop"]
   ```

## 4. 폭×높이×장수 매트릭스

모든 칸에서 배너 수 1·2·3을 각각 만들었다. 값은 3장 상태의 `clientHeight/scrollHeight(px)`이다. `0/608`은 사용자가 스택을 볼 수도, wheel·키보드로 진입할 수도 없는 도달 결함이다.

| 높이＼폭 | 320 | 480 | 600 | 768 | 1024 | 1440 |
|---:|---:|---:|---:|---:|---:|---:|
| 480 | **0/608** | **0/608** | 4/532 | 83/467 | 104/409 | 104/409 |
| 600 | **0/608** | 40/608 | 124/532 | 203/467 | 224/409 | 224/409 |
| 720 | 33/608 | 161/608 | 244/532 | 323/467 | 344/409 | 344/409 |
| 900 | 213/608 | 341/608 | 424/532 | 467/467 | 409/409 | 409/409 |

- 결함 재현: 320×480, 480×480, 320×600에서 `top > viewport height`, `clientHeight=0`.
- 24개 폭×높이 각각에서 외부 조작 요소와 stack 교차 면적은 0.
- 1·2·3장 순서와 gap은 각각 `[]`, `[12]`, `[12,12]`.

## 5. 600×720·3장 클릭 원문

```text
[600x720-STACK] {"order":["app-version-policy-error","app-trust-root-disabled","app-auto-update-status"],"gaps":[12,12],"top":460.4583435058594,"bottom":704.0000152587891,"clientHeight":244,"scrollHeight":532}
[600x720-BUTTON-REACH] [{"text":"보안인증서 설치","top":676.3229370117188,"bottom":704.3229370117188,"withinStack":false,"hitSelf":true,"scrollTop":70},{"text":"다시 확인","top":676.2396240234375,"bottom":704.2396240234375,"withinStack":false,"hitSelf":true,"scrollTop":271.3333435058594},{"text":"닫기","top":676.2396240234375,"bottom":704.2396240234375,"withinStack":false,"hitSelf":true,"scrollTop":271.3333435058594}]
[600x720-CLICK] target=닫기 visibleBefore=true remaining=0
[SCROLLED-ROW-CLICK] row=arologis-unassigned-row-2026/08/08-34 target=수동 배차로 이동 hash=#/dispatches/manual?date=2026-08-08&slipNo=2026%2F08%2F08-34
```

## 6. 잃으면 안 되는 것 재현

- 배너 유무 본문 첫 heading y: `withBanner=281`, `withoutBanner=281`, 차이 0.
- 외부 조작 요소 교차 면적: 24/24 화면에서 0.
- 600×720의 배너·버튼은 wheel/키보드로 순차 접근 및 클릭 가능했지만, 위 0.24~0.32px 경계 클리핑이 남았다.
- 진리표 4조합 직접 실행: 개발×env 미설정=true, 개발×env=1=false, 패키지×env 미설정=true, 패키지×env=1=true. 4/4 통과.
- 사용자 문구: 화면 `신뢰 루트` 0회, `보안인증서` 2회.
- stack: `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`, gaps `[12,12]`.
- 스크롤 행 클릭: 45행 중 `...-34`의 `수동 배차로 이동` 클릭 후 해당 전표 query가 든 수동 배차 화면 도달.
- 모달·드롭다운·인쇄·Tab: 3절 원문대로 정상.
- 관련 단위 테스트: 아로로지스 18/18 통과(3.09s), design-system 6/6 통과(1.81s).

## 7. 스펙 실행 시간 원문

PR의 CI 대상 production Electron 스펙을 직접 실행한 결과는 주장된 “14.7초 통과”와 달랐다. 원문:

```text
1 failed
[WALL-CLOCK] elapsedSeconds=7.528 exitCode=1
```

실패 원문은 `1254-arologis-production-electron.spec.ts:180`, `Expected: true / Received: false`였다. 이 보고서는 해당 실행을 통과로 바꾸어 적지 않는다.

추가 실서버 스펙 원문:

```text
[RACE-SUMMARY] [{"attempt":1,"responseEntries":45,"renderedRows":1,"inputDate":"2026-08-08"},{"attempt":2,"responseEntries":45,"renderedRows":1,"inputDate":"2026-08-08"},{"attempt":3,"responseEntries":45,"renderedRows":1,"inputDate":"2026-08-08"}]
1 passed (14.2s)

[CAPTURE-600] ... selectedDate=2026-08-08 response=200 backendEntries=45 renderedRows=45 bannerDomCount=3
[CAPTURE-320] ... stack={"top":654.5,"bottom":654.5,"clientHeight":0,"scrollHeight":608}
1 passed (5.5s)
```

## 8. 캡처

모두 `resolveQaShotsDir()`를 경유한 `_local` 경로다.

- `docs/qa/1254-notice-banner-layout/sol-r5-final/_local/600x720-three-banners-final-real-qa.png` — 36,254 bytes, 선택일 2026-08-08, HTTP 200, 응답 45건, 화면 45행, 배너 DOM 3장.
- `docs/qa/1254-notice-banner-layout/sol-r5-final/_local/320x480-zero-height-stack-final-real-qa.png` — 13,373 bytes, stack `top=bottom=654.5`, `clientHeight=0`, `scrollHeight=608`.

## 9. 도달 결함

### 결함 1 — 작은 화면에서 stack 높이 0px

1. 아로로지스 로그인 → `/#/dispatches/unassigned`.
2. 배너 3장을 만든다.
3. 320×480, 480×480 또는 320×600으로 축소한다.
4. stack이 viewport 아래에서 높이 0이 되어 모든 배너·버튼이 사라진다.

### 결함 2 — 보이는 스크롤바를 클릭하면 아래 표로 통과

1. 600×720, 3장, stack scrollTop=0.
2. 오른쪽 scrollbar track `(213,635.29)` 클릭.
3. stack은 0→0, hit 대상은 아래 `...-54` 행의 `TD`, 실제 click 1회 전달.

### 결함 3 — stack 경계의 wheel이 본문 scroll을 먹음

1. stack을 끝까지 내리고 아래 `MAIN`을 scrollTop 100에 둔다.
2. stack 위에서 아래로 wheel 240.
3. `MAIN`이 100→100으로 움직이지 않는다.

### 결함 4 — 600×720에서 버튼 하단 경계 클리핑

1. 세 버튼을 각각 `scrollIntoView({block:'nearest'})`.
2. stack bottom 704.0000보다 버튼 bottom이 704.2396~704.3229로 커서 하단이 잘린다.

### 결함 5 — 최신 복원 응답이 새 날짜 45건을 1행으로 덮음

1. 최신 자동저장은 2026-08-16 1건인 상태에서 새 프로필로 로그인.
2. 미배차 화면 도달 직후 날짜를 2026-08-08로 변경.
3. 네트워크 응답 45건, input 날짜 2026-08-08인데 화면은 1행.
4. 새 프로필 3회 반복 모두 `45→1`.

## 10. 증거 무결성 자기 고지

- 사용자 지시대로 commit/add/push를 전혀 하지 않았다. 실측 스펙·보고서·캡처는 미추적 로컬 산출물이다.
- 따라서 `_local` PNG는 이 PR 코멘트에서 공개 URL로 렌더링되는 첨부물이 아니다. 커밋된 과거 이미지를 이번 캡처인 것처럼 링크하지 않는다.
- 새 실서버 스펙은 공유 하네스의 `REAL_QA_ALLOW_UNTRACKED=1` 로 명시 경로만 실행했으며, 하네스가 출력한 대로 공식 CI 수치에 섞지 않았다.
- 첫 두 탐색 실행에서 화면 자체의 `AUTO_LATEST`가 실서버에 쓰는 것을 발견했다. 최신 상태가 `2026-08-08/45건`으로 바뀐 것을 확인한 뒤 최초 관측값 `2026-08-16/1건`으로 복구했고, 검증 원문은 `restoreStatus=200, latestDate=2026-08-16, latestEntries=1`이다. 이후 history POST는 전부 Playwright route에서 차단했다.
- CI 대상 production Electron 스펙의 로컬 exit 1과 최종 CI 실패 1건을 숨기지 않았다.

## 11. 프로세스 회수

- 본 라운드 소유: Electron 0, Playwright 0, chrome/headless 0, Vite 0, 임시 user-data-dir 0, 격리 컨테이너 0.
- 전체 관측: Electron 0, Chrome 0, `chrome-headless-shell` 4, Node 14, running container 31.
- 전체 headless 4개는 부모가 `node scripts/1252-send-history-order-app-real-qa.mjs`인 동시 #1252 라운드 소유여서 건드리지 않았다.
- 본 라운드는 컨테이너를 생성하지 않았으며, 소유 컨테이너 잔여 0이다.

## 12. 판정

**머지 불가 — 도달 결함 5건.**

CI가 green이 되더라도 현재 화면에는 작은 viewport 0px stack, scrollbar click-through, wheel 본문 차단, 600×720 버튼 경계 클리핑, 최신 복원 45→1 경쟁 조건이 남아 있다.
