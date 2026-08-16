# PR #1252 CODEX SOL 재수렴 적대검증 보고

## ① 환경 확인

요청된 명령을 작업 시작 시 순서대로 실행한 원문이다. `git status --porcelain` 출력은 비어 있었다. `gh pr checks`는 GitGuardian 실패가 있어 종료코드 1이었다.

```text
1d980ebf5dc76aa2bbdb9e387c619ab70157b20a
feat/send-history-deleted-strikethrough

GitGuardian Security Checks	fail	1s	https://dashboard.gitguardian.com	
#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	42s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051295/job/95159651884	
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	49s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051269/job/95159651859	
Arologis Notion Runtime Zero Guard (SP-08-7)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051269/job/95159651925	
Local Stack Port Resolver Guard (#1113)	pass	53s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651941	
Notion Runtime Zero Guard (SP-08-7)	pass	40s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651907	
데스크톱 빌드 (arologis-desktop)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051269/job/95159651837	
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651989	
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051267/job/95159652008	
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651937	
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051267/job/95159652003	
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pass	56s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051269/job/95159651863	
Credential Plaintext Guard (SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652011	
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651966	
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651985	
App Build Version Guard (scripts/app-build-version, #910/#928)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652013	
S1 logging opt-in 계약 (docs/local-stack 관할)	pass	52s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051295/job/95159651876	
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651930	
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	55s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051295/job/95159651883	
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051267/job/95159651962	
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651976	
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051267/job/95159651967	
모바일 prebuild (arologis-mobile)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051269/job/95159651857	
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051295/job/95159651834	
백엔드 빌드 + 테스트 (arologis-service)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051269/job/95159651906	
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652033	
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652019	
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651958	
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651947	
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651938	
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159651924	
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652061	
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652062	
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652043	
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652006	
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652015	
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051266/job/95159652099	
빌드 검증 + 단위 테스트	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051257/job/95159651841	
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945051281/job/95159652088	
```

`git add`, `git commit`, `git push`는 실행하지 않았다.

## ② CI 카운트

게시 직전 새로 실행한 `gh pr checks 1252 --json name,state,bucket` 기준이다.

```text
TOTAL=54
PASS=53
FAIL=1
PENDING=0
FAIL=GitGuardian Security Checks
```

## ③ 전 페이지 순회 — DOM 행 수·고유 주문 수·서버 총건수

PR HEAD 격리 JAR 실제 HTTP와 Playwright 실 앱에서 직접 셌다.

```text
선택: P-2026-0009 / 2176310279 / 2026-06-08
HTTP 페이지: 6
페이지 행: 20,20,20,20,20,17
DOM 행 수: 117
고유 주문번호 수: 117
서버 totalElements: 117
중복: 0
누락: 0
```

같은 6페이지 순회를 10회 반복했다. 매 실행의 117행 순서 SHA-256은 `A546F45B95F4F0C8B310213E8C0297DAE7F3213F253B984D2D3007CB940191E9`로 같았다.

복제 DB의 실제 53개 partnerCode/사업자번호 조합도 각 마지막 페이지까지 순회했다.

```text
조합: 53
HTTP 실패: 0
서버 totalElements 합계: 2025
실제 수집 행 합계: 2025
조합 내부 주문번호 중복 그룹: 0
```

## ④ 정렬 상위 20행

Playwright 화면 표시 순서이며 API 상위 20행과 일치했다.

```text
01|2026/06/08-1968|2026-06-08T02:08:11.140007|삭제
02|2026/06/08-1929|2026-06-08T02:06:18.398828|삭제
03|2026/06/08-1913|2026-06-08T02:05:21.697477|삭제
04|2026/06/08-1900|2026-06-08T02:04:40.262053|삭제
05|2026/06/08-1882|2026-06-08T02:03:58.878763|삭제
06|2026/06/08-1852|2026-06-08T02:01:59.264479|삭제
07|2026/06/08-1823|2026-06-08T02:00:27.918846|삭제
08|2026/06/08-1821|2026-06-08T02:00:16.528413|삭제
09|2026/06/08-1810|2026-06-08T01:59:46.615542|삭제
10|2026/06/08-1804|2026-06-08T01:59:10.530068|삭제
11|2026/06/08-1764|2026-06-08T01:57:27.970976|삭제
12|2026/06/08-1752|2026-06-08T01:56:38.583965|삭제
13|2026/06/08-1748|2026-06-08T01:56:32.420149|삭제
14|2026/06/08-1720|2026-06-08T01:54:34.091636|삭제
15|2026/06/08-1710|2026-06-08T01:53:47.026920|삭제
16|2026/06/08-1704|2026-06-08T01:53:19.921375|삭제
17|2026/06/08-1692|2026-06-08T01:52:55.744609|삭제
18|2026/06/08-1654|2026-06-08T01:50:28.305395|삭제
19|2026/06/08-1630|2026-06-08T01:49:17.493267|삭제
20|2026/06/08-1623|2026-06-08T01:48:48.114831|삭제
```

상위에서 하위로 `outDate`가 감소해 최신 행이 위에 있었다.

## ⑤ 동률·경계 페이지 실측

실데이터 2,025행에는 동일한 유효 발송시각 동률이 0개였다. 따라서 복제 DB에만 같은 `occurred_at`을 가진 유효한 주문/CONFIRMED 이벤트 25개를 넣고 `size=10`으로 경계를 가른 뒤 PR HEAD endpoint를 10회 순회했다. 공유 DB write는 없었고 검증 후 25+25행을 모두 삭제했다.

```text
10회 모두 total=25 / 수집=25 / 고유=25 / 중복=0
10회 순서 동일=True
1페이지 마지막=2099/12/31-23
2페이지 첫행=2099/12/31-22
실제 선두 순서=...-9,...-8,...-7,...-6,...-5,...-4,...-3,...-25,...-24,...-23
fixture_remainder=0
```

실데이터 117행 경계는 다음과 같았다.

```text
20|2026/06/08-1623|01:48:48.114831
21|2026/06/08-1601|01:47:36.008614
40|2026/06/08-1326|01:30:36.734207
41|2026/06/08-1303|01:29:21.892234
60|2026/06/08-1090|01:15:47.918039
61|2026/06/08-1082|01:15:21.547337
80|2026/06/08-724|00:53:53.219766
81|2026/06/08-720|00:53:25.811592
100|2026/06/08-367|00:34:04.388957
101|2026/06/08-361|00:33:43.341881
117|2026/06/08-15|00:13:35.094782
```

## ⑥ 사업자번호 응답 표

모두 PR HEAD 격리 JAR 실제 HTTP다.

| 행 | 요청 | 값 | HTTP |
|---:|---|---|---:|
| 1 | 자기 숫자 | `2176310279` | 200 |
| 2 | 자기 하이픈 | `217-63-10279` | 200 |
| 3 | 실재 타 거래처 | `2437710341` | 403 |
| 4 | 앞자리 0 | `02176310279` | 403 |
| 5 | 유사 번호 | `2176310278` | 403 |
| 6 | 미등록 10자리 | `1111111111` | 403 |
| 7 | 다른 실재 거래처 | `1522810124` | 403 |
| 8 | 하이픈 유사 번호 | `217-63-10278` | 403 |

## ⑦ 삭제행·범위

발송내역 선택 데이터는 삭제 117행이었다. Playwright 실측은 `history-deleted-row=117`, `line-through=117`, 계산 색상 `rgb(156, 163, 175)`였다.

삭제 107행·활성 1행이 섞인 실제 조합 `P-2026-0004 / 1522810124`의 발송내역은 108행을 전부 반환했다. 반면 일반 목록은 다음과 같았다.

```text
일반 목록 includeDeleted=false: total=1 / 삭제=0 / 활성=1
일반 목록 includeDeleted=true : total=1 / 삭제=0 / 활성=1
```

PARTNER 일반 목록에서는 `includeDeleted=true`를 보내도 삭제행이 새지 않았다.

## ⑧ 1,995건 유지

새 read-only dump를 새 격리 DB에 복원한 뒤 직접 센 원천이다.

```text
partner_orders=2026
CONFIRMED 이벤트(is_deleted=false)=1995
confirmed_at 전용=30
CONFIRMED 이벤트 전용=1995
두 축 중첩=0
발송 원천 합집합=2025
API 53조합 total 합계=2025
API 53조합 실제 순회 합계=2025
```

직전 fix가 복원한 1,995개 CONFIRMED 이벤트 원천은 API 합집합에서 빠지지 않았다.

`partner-order-service` 전체 테스트도 120초에서 끊지 않고 완주했다.

```text
BUILD SUCCESSFUL in 2m 23s
JUnit suite=91 / tests=572 / failures=0 / errors=0 / skipped=0
```

## ⑨ 캡처

Playwright Chromium `headless: true`, 실행 위치 `clients/desktop`, 실 order-app Vite → QA proxy → PR HEAD 격리 JAR 경로였다. 해시 라우터 URL은 `http://127.0.0.1:29390/#/`였다.

화면 전용 도달 단정:

```text
#btnHistory text=과거 발송내역 확인
#pageHistory=visible
```

캡처 계수:

```text
DOM 행 수=117
고유 주문번호 수=117
서버 총건수=117
```

`resolveQaShotsDir()`가 정한 새 로컬 캡처 경로는 `docs/qa/1252-send-history-adversarial-real-qa/_local/02-sol-real-data-history.png`다. 새 캡처 SHA-256은 `59323376242207779ADD21B11DC5FFF1B8044BF906DBF830E13072DFBAA55C9B`이며, HEAD에 이미 커밋된 아래 파일과 바이트 단위로 일치했다.

![PR #1252 실데이터 발송내역](https://raw.githubusercontent.com/ewoo14/Samhan-Public/1d980ebf5dc76aa2bbdb9e387c619ab70157b20a/docs/qa/1252-send-history-adversarial-real-qa/02-sol-real-data-history.png)

PR HEAD JAR 대조 원문:

```text
HOST_JAR_SHA256=3afbf2d435d019a73ad00375aa0593e715d74b2a53abbf4f6a1a3a18024fa656
CONTAINER_JAR_SHA256=3afbf2d435d019a73ad00375aa0593e715d74b2a53abbf4f6a1a3a18024fa656
SHA_MATCH=True
HEALTH_HTTP=200
```

## ⑩ 도달 결함

### 결함 1 — 같은 발송시각에서 주문번호 숫자 순서가 문자열 순서로 뒤집힌다

현재 보조 정렬은 `o.order_no DESC`이고 `order_no`는 `varchar(30)`이다. 날짜 접두가 같은 가변 자릿수 주문번호를 사람이 읽는 숫자 순서가 아니라 문자열 순서로 정렬한다.

재현 절차:

1. 공유 실데이터의 read-only dump를 격리 복제한다.
2. 같은 `occurred_at`을 가진 주문 25개(`2099/12/31-1`~`-25`)와 CONFIRMED 이벤트를 복제 DB에만 넣는다. 이 상태는 스키마가 허용하며 `PartnerOrderHistory`도 시각 유일성을 강제하지 않는다.
3. PR HEAD JAR에서 해당 사업자번호를 `size=10`으로 끝까지 순회한다.
4. 화면은 API 순서를 재정렬하지 않으므로 같은 순서가 표시된다. 실 앱 Playwright에서도 API 상위 20행과 화면 상위 20행이 일치함을 별도로 확인했다.

실측 원문:

```text
TIE_RUN 1..10: TOTAL=25 / ROWS=25 / UNIQUE=25 / SAME=True
SEQ=2099/12/31-9,2099/12/31-8,2099/12/31-7,2099/12/31-6,
    2099/12/31-5,2099/12/31-4,2099/12/31-3,2099/12/31-25,
    2099/12/31-24,2099/12/31-23,...
```

요청마다 흔들리거나 누락되지는 않지만, 사용자는 동일 발송시각에서 `-25`보다 `-9`를 먼저 본다. 주문번호를 보조 발송 순서로 채택한 계약에서 숫자 채번 순서가 역전되는 화면 도달 결함이다. 현재 공유 스냅샷에는 정확히 같은 유효 발송시각 동률이 0개였다는 점도 함께 고지한다.

## ⑪ 증거 무결성 자기 고지

- LUNA 보고서의 숫자를 복사하지 않고 새 dump·새 PR HEAD JAR·새 HTTP·새 Playwright 실행으로 다시 셌다.
- 최초 `pg_restore`는 원본 owner 역할 `samhan`이 격리 컨테이너에 없어 owner 변경 15건만 실패했다. 격리 DB를 삭제·재생성하고 `--no-owner`로 성공한 복원만 채택했다.
- 최초 `bootJar` 호출은 PowerShell 경로 이스케이프 누락으로 `.gradlew.bat`를 찾지 못해 Java가 실행되지 않았다. `& .\gradlew.bat ...` 재실행의 성공 결과만 채택했다.
- 전수 순회 첫 래퍼는 JavaScript 파싱 단계에서 실행되지 않았다. 두 번째 실행의 HTTP 결과만 채택했다.
- 첫 순서 해시는 현재 PowerShell에 없는 `Convert.ToHexString` 때문에 비었다. `BitConverter`로 10회 다시 실행한 동일 해시만 채택했다.
- 첫 사업자번호 표는 403 본문 보조 파싱 오류가 섞였다. 본문을 읽지 않고 상태코드만 다시 실행한 8행을 채택했다.
- JUnit XML 집계 2회는 한글 XML/해시테이블 순회 방식 오류로 각각 불완전값과 0을 냈다. 고정 정규식으로 91개 suite 헤더를 모두 읽은 `572/0/0/0`만 채택했다.
- 최초 잔여 프로세스 집계는 검사 PowerShell 자신을 각 1개로 셌다. 실행 파일 이름을 node/cmd/chrome으로 제한한 재측정 0만 채택했다.
- 동률 25행은 복제 DB에만 썼고 직후 history 25행·order 25행을 삭제했다. 삭제 후 `orders=2026 / confirmed_events=1995 / source_union=2025 / fixture_remainder=0`을 확인했다.
- 공유 DB에는 `pg_dump` read만 수행했다. 공유 실데이터 write는 0건이다.
- 새 캡처와 HEAD 커밋 캡처의 SHA-256이 같음을 확인했다. 다른 실행의 캡처를 새 실행인 것처럼 바꾸지 않았다.

## ⑫ 프로세스 회수

이번 라운드가 기동한 Vite/Node 프록시와 `sol1252r3-28180-partner`, `sol1252r3-28180-postgres`만 회수했다. 공유 `samhan-*` 컨테이너는 건드리지 않았다.

```text
LISTENER_29280_29288_29390_55453_REMAINDER=0
SOL1252R3_CONTAINER_REMAINDER=0
QA_PROCESS_REMAINDER=0
PLAYWRIGHT_CHROMIUM_REMAINDER=0
```

## ⑬ 판정

**도달 결함 1건.**

직전 두 fix의 핵심 회귀(117/117/117, 1,995 이벤트 유지, 자기 번호 2표기 200·그 외 403, 삭제행 취소선·회색, 일반 목록 삭제행 비노출)는 유지됐다. 그러나 동일 발송시각의 가변 자릿수 주문번호를 문자열로 정렬해 사용자가 보는 보조 발송 순서가 역전된다.
