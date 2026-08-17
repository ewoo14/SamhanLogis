# PR #1241 CODEX SOL 적대검증 R18

## ① 환경 확인

작업의 맨 처음 아래 명령을 지정 순서대로 실행했다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # cb7625490
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain
gh pr checks 1241
```

원문 출력은 다음과 같다. `git status --porcelain`은 두 번째 줄과 첫 check 사이에 아무것도 출력하지 않았다.

```text
cb762549089c4546e377f801e3fde8d94788c831
feat/gas-parity-order-web
GitGuardian Security Checks	fail	0	https://dashboard.gitguardian.com	
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	fail	1m9s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072530/job/95184356040	
App Build Version Guard (scripts/app-build-version, #910/#928)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356152	
Credential Plaintext Guard (SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356137	
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072525/job/95184355996	
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072525/job/95184355932	
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072525/job/95184355941	
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356181	
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356154	
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356132	
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356192	
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356218	
Local Stack Port Resolver Guard (#1113)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356090	
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072525/job/95184356016	
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356236	
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356157	
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356121	
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356171	
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356175	
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356150	
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356106	
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356151	
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356206	
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356153	
#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	47s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072530/job/95184356015	
Notion Runtime Zero Guard (SP-08-7)	pass	38s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356086	
S1 logging opt-in 계약 (docs/local-stack 관할)	pass	42s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072530/job/95184355936	
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	1m1s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072530/job/95184356077	
적용된 Flyway 마이그레이션 불변 가드	pass	41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072547/job/95184355991	
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356138	
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356085	
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	1m1s	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072527/job/95184356104	
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31955072554/job/95184356112	
```

금지된 `git add`, `git commit`, `git push`는 실행하지 않았다.

## ② CI 카운트와 분류

최종 재조회 원문 카운트:

```text
CI_COUNT total=47 pass=40 fail=7 pending=0 skipping=0
```

| 실패 check | 실 실패/중복 | 판정 |
|---|---|---|
| Desktop Playwright (mock 회귀 hard gate) | 실 실패 3건: permission-groups C5 1건, SP-07 시트 계약 2건 | 폐기된 시트 동기화·옛 권한 계약을 기대한다. 관련 구현 변경이 `origin/main...HEAD`에 있으므로 GitHub PR 관점에서는 이 head 소관 CI blocker다. R18 실제 폐기 화면과 DB 카탈로그 화면은 정상 도달했다. |
| 문서 본문 단언 스펙 | SP-07 옛 시트 range-map/seed 문구 2건 | 위와 같은 head 소관의 옛 계약 단언이다. |
| 빌드 + 테스트 (product-quantity-sync-schema) | 143건 중 5건 실패(R6/R7/R33 시트 sync) | 현재 head가 runtime 시트 연동을 폐기했지만 옛 sync 동작을 기대한다. head 소관 CI blocker다. |
| JUnit 테스트 결과 (product-quantity-sync-schema) | 위 job의 요약 check | 독립 실패가 아니라 중복 표기다. |
| 빌드 + 테스트 (user+product+inventory+logging) | 805건 중 65건 실패, 대부분 ProductSheetSync 계열 | 현재 head의 시트 폐기와 충돌하는 옛 계약이다. head 소관 CI blocker다. |
| JUnit 테스트 결과 (user+product+inventory+logging) | 위 job의 요약 check | 독립 실패가 아니라 중복 표기다. |
| GitGuardian Security Checks | 외부 scanner fail | 상세 incident는 현재 CLI에서 노출되지 않았다. 같은 head의 `Credential Plaintext Guard`와 `자격 평문 비공개 가드`는 pass다. 화면 도달 결함으로 집계하지 않는다. |

직전 8건 중 `빌드 + 테스트 (accounting+partner)`와 그 JUnit 결과는 현재 pass로 수렴했다. 현재 실패 7행은 실 root check 5개와 JUnit 중복 요약 2개다. `GatewayAttestationMockMvcConfig:24` fail-closed 유형은 현재 CI 원문에 없었다.

## ③ 화면 구성품 라벨-금액 표

`/#/order` → `#cardSingle` 도달을 단정한 뒤 `AR06D1150HZS`, `AC060CS6PBH1SY`를 각각 수량 1로 넣었다. 합계만 보지 않고 라벨별로 대조했다.

| 부모 | 화면 라벨 / 모델 | 기대 | 미리보기 화면 | 최종확인 화면 | 저장 상세/DB |
|---|---|---:|---:|---:|---:|
| AC060CS6PBH1SY | 360 CST UV 실내기 / AC060CN6PBH1 | 606,000 | 606,000 | 606,000 | 606,000 |
| AC060CS6PBH1SY | 360 CST UV 실외기 / AC060CXAPBH1 | 910,000 | 910,000 | 910,000 | 910,000 |
| AC060CS6PBH1SY | 판넬 (360CST / 원형 / WIFI) / PC6NUNK1NW | 128,000 | 128,000 | 128,000 | 128,000 |
| AC060CS6PBH1SY | 무선리모컨(냉난방전용) / AR-EH05 | 16,000 | 16,000 | 16,000 | 16,000 |
| AR06D1150HZS | 냉전 일반 벽걸이 실내기 / AR06D1150HZN | 148,000 | 148,000 | 148,000 | 148,000 |
| AR06D1150HZS | 냉전 일반 벽걸이 실외기 / AR06D1150HAX | 222,000 | 222,000 | 222,000 | 222,000 |

AC 네 구성품 합계는 `1,660,000`, AR 두 구성품 합계는 `370,000`, 함께 저장한 주문 합계는 `2,030,000`이었다. 라벨-금액 뒤바뀜은 재발하지 않았다.

## ④ 금액 4단계 표

품목표는 부모 세트 행을, 이후 세 단계는 전개된 구성품 행을 표시한다.

| 품목/모델 | 품목표 | 미리보기 | 최종확인 | 저장값 |
|---|---:|---:|---:|---:|
| AC060CS6PBH1SY 부모 | 1,660,000 | 구성품 합 1,660,000 | 구성품 합 1,660,000 | 구성품 합 1,660,000 |
| └ AC060CN6PBH1 | 부모 행에 포함 | 606,000 | 606,000 | 606,000 |
| └ AC060CXAPBH1 | 부모 행에 포함 | 910,000 | 910,000 | 910,000 |
| └ PC6NUNK1NW | 부모 행에 포함 | 128,000 | 128,000 | 128,000 |
| └ AR-EH05 | 부모 행에 포함 | 16,000 | 16,000 | 16,000 |
| AR06D1150HZS 부모 | 370,000 | 구성품 합 370,000 | 구성품 합 370,000 | 구성품 합 370,000 |
| └ AR06D1150HZN | 부모 행에 포함 | 148,000 | 148,000 | 148,000 |
| └ AR06D1150HAX | 부모 행에 포함 | 222,000 | 222,000 | 222,000 |

저장 DB 원문:

```text
2026/08/16-2|AC060CN6PBH1|606000.00|550909.00|55091.00|606000.00
2026/08/16-2|AC060CXAPBH1|910000.00|827273.00|82727.00|910000.00
2026/08/16-2|PC6NUNK1NW|128000.00|116364.00|11636.00|128000.00
2026/08/16-2|AR-EH05|16000.00|14545.00|1455.00|16000.00
2026/08/16-2|AR06D1150HZN|148000.00|134545.00|13455.00|148000.00
2026/08/16-2|AR06D1150HAX|222000.00|201818.00|20182.00|222000.00
```

## ⑤ 끝전 전수 카운트

격리 복제 DB의 활성 `SINGLE_SET`/`BUNDLE` 부모를 직접 열거하고 PR HEAD product-service의 `/products/internal/expand`를 `setQty=1`로 전수 호출했다. 실내·실외 본체 단가가 1,000원 단위에서 벗어난 부모를 끝전으로 셌다.

```text
ALL_SINGLE_BUNDLES=271 EXPANDED=271 LINES=855 ERRORS=0 ENDING_COUNT=0
```

## ⑥ fallback 양방향

격리 DB의 `AC060CS6PBH1SY → PC6NUNK1NW`를 사용해 관계값 우선 방향과 NULL 전역값 fallback 방향을 모두 직접 호출했다. 테스트 후 원값으로 복원했다.

```text
RELATION_DIRECTION|delivery=128000.00|release=189200.00
FALLBACK_DIRECTION|delivery=104060.00|release=189200.00
RESTORED|delivery=128000.00|release=189200.00
GLOBAL/RELATION|104060.00|189200.00|128000.00|189200.00
```

관계 납품가가 있으면 `128,000`을 쓰고, NULL이면 구성품 전역 납품가 `104,060`으로 돌아갔다. 출고가는 관계값과 전역값이 모두 `189,200`인 데이터라 두 방향의 값이 동일했다. 실제 주문 화면은 관계값 경로로 AC 네 라벨을 정확히 표시했다.

## ⑦ VAT 경계·R03·R05·R08

| VAT 포함가 | 공급가 | VAT | 미리보기/초안/확정 HTTP |
|---:|---:|---:|---|
| 5 | 5 | 0 | 200 / 201 / 200 |
| 6 | 5 | 1 | 200 / 201 / 200 |
| 11 | 10 | 1 | 200 / 201 / 200 |
| 800,000 | 727,273 | 72,727 | 200 / 201 / 200 |

- R03: 저장 상세에서 거래처 코드 `1068689215`의 이름 fallback `주식회사 중앙유통`을 확인했다.
- R05: 배송지·현장 `서울특별시 R17 격리 QA로 16 16층`, 연락처 `010-1616-1616`, 납기 `2026-08-20`, 입금예정일 `2026-08-31`, 요청사항 `R17 헤더 보존 격리 QA`가 저장 상세 화면에 보존됐다.
- R08: 원품 `1` → 자동 펌프 `1` → 수동 `7` → 원품 `2` 변경 후 펌프가 `2`로 재계산됐다.
- 가격 미리보기: 본 주문과 VAT 네 경계 모두 HTTP 200으로, 500은 재발하지 않았다.
- 카탈로그/시트: 주문웹 품목표와 데스크톱 `/#/products/catalog`에서 카탈로그가 양방향 유지됐다. `/#/admin/sheet-sync`는 고유 요소 `admin-sheetsync-retired`에 도달했고 폐기 안내, 실행 버튼 0개, 일반 오류 alert 0개였다.
- runtime 연결: `qa1241r18-product`, `qa1241r18-partner`, `qa1241r18-dc`의 ESTABLISHED remote 443은 각각 0이었다.

## ⑧ 증거 무결성 재확인

커밋된 SQL/CSV를 수정하지 않고 원문 실행했다.

```text
BACKFILL_SQL_COLUMNS=7
CSV_COLUMNS=7
CSV_ROWS=1095
CSV_UNIQUE_PAIRS=1095
CREATE TABLE
COPY 1095
INSERT 0 0
UPDATE 1042
ACTIVE_MODIFIED_BY_CODEX_LUNA_1241=1042
```

따라서 SQL staging 7열과 CSV 7열은 일치한다. 활성 매칭은 보고서 정정값과 같은 `1,042/1,095`이며 53개는 활성 pair와 매칭되지 않는다. 커밋된 `docs/qa/1241-price-relocation/REPORT.md`와 `docs/qa/1241-luna-round-fix-report.md`의 정정 문구도 이 실제 실행 결과와 일치한다.

PR HEAD에서 빌드한 JAR과 실행 컨테이너 내부 JAR SHA-256:

```text
product host=7587f9b581cd86738a09ed9d0ca00381f517ffa165ce9aa913a4c284957a97d2 runtime=7587f9b581cd86738a09ed9d0ca00381f517ffa165ce9aa913a4c284957a97d2 MATCH=True
partner host=d5f08f6f13cefdf09120ca5a07023ce9f4e4c59220d2636ee1053b4bd1802b54 runtime=d5f08f6f13cefdf09120ca5a07023ce9f4e4c59220d2636ee1053b4bd1802b54 MATCH=True
dc host=a1dd39b7f8c37b7dbe886f2b99d966495b736267f55f8babcb1836b2fa3a4d1c runtime=a1dd39b7f8c37b7dbe886f2b99d966495b736267f55f8babcb1836b2fa3a4d1c MATCH=True
```

## ⑨ 캡처

Playwright는 `clients/desktop` 패키지 안에서 설치된 chromium, `headless: true`, 해시 라우터로 실행했다. `#cardSingle`을 먼저 단정했고 최종 실행 원문은 `4 passed (15.0s)`다. 커밋된 `1241-r17-adversarial-real-qa` 스펙을 R18에서 재사용했으며 파일명/디렉터리 모두 `-real-qa` 접미사다. 캡처는 `resolveQaShotsDir()`을 거쳐 아래 `_local` 경로에 새 시각으로 덮어썼다.

경로: `docs/qa/1241-r17-adversarial-real-qa/screenshots/_local/`

- `02-set-preview-label-amount-real-qa.png` — AC 4개 라벨과 606,000/910,000/128,000/16,000이 함께 보임. SHA-256 `8d44df7be5733139d3029aa12767fa3fde57f7439c1222f639dd52922d6c1530`
- `04-final-label-amount-real-qa.png` — AC/AR 6개 최종확인 라벨과 금액. SHA-256 `5a357521338918cef16cf47fe4c546de0778cfa43e311bc8675779c21a03d50e`
- `06-r03-r05-order-detail-real-qa.png` — 저장 재조회 화면의 거래처명, 6개 모델·금액, R05 헤더. SHA-256 `d27ee8af011ef7b4d7e3d7e0bf29ca9fe3e886ca0bb63634393885c6d943019c`
- `08-sheet-sync-retired-real-qa.png` — 시트 폐기 안내. SHA-256 `7e72fa94f531671574871e6266e4808165561f41657392590c9ef8e834965813`
- `09-db-catalog-normal-search-real-qa.png` — DB 카탈로그 정상 검색. SHA-256 `9c8e7cf9ad8b1b0e92570b9986678aa344e54f2a8207afe6ca98d7d23473dcbf`

## ⑩ 도달 결함

없다. 최초 Playwright 시도는 격리 런타임에 service discovery instance URI가 없어 product catalog가 빈 fallback으로 내려간 환경 구성 실패였다. DB에는 대상 모델이 활성 상태였고 로그 원문은 `No instances available for service: product-service`였다. Spring SimpleDiscovery URI를 격리 서비스별로 지정한 뒤 같은 HEAD JAR·같은 격리 DB에서 실제 사용자 경로 전체가 통과했으므로 화면 도달 결함으로 세지 않았다.

## ⑪ 증거 무결성 자기 고지

- R18은 기존 커밋 스펙을 재사용했기 때문에 캡처 경로명과 화면 fixture 문구에 `R17`이 남아 있다. 그러나 파일 수정 시각, SHA-256, 주문번호 `2026/08/16-2`, 실행 로그는 이번 실행에서 새로 생성됐다.
- `_local` 캡처와 본 보고서는 `git add/commit/push` 금지 때문에 GitHub에 이미지로 호스팅되지 않는다. PR 댓글에는 경로와 SHA-256을 게시한다.
- 첫 Playwright 래퍼는 PowerShell `finally` 뒤 종료코드를 보존하지 않아 외부 명령 결과가 0으로 보였지만, 내부 Playwright 원문은 1 failed였다. 원인을 바로잡은 재실행은 종료코드 0과 `4 passed`를 함께 확인했다.
- 백필 SQL은 이번에는 보정 복사 없이 커밋 원문 그대로 성공했고, `COPY 1095 / UPDATE 1042`가 정정 보고와 일치했다.

## ⑫ 프로세스 회수

기동한 Vite 리스너 2개, R18 컨테이너 3개, 전용 network 1개, 격리 DB 3개와 PostgreSQL `/tmp/qa1241r18` 임시 파일을 정확한 이름으로 회수했다. 격리 DB와 임시 파일은 QA 임시 데이터라 영구 복구 없이 제거했다. 기존 공유 서비스 7개는 모두 healthy를 유지했다.

```text
RESIDUAL_LISTENERS=0 RESIDUAL_VITE_PROCESSES=0 RESIDUAL_CONTAINERS=0 RESIDUAL_NETWORKS=0 RESIDUAL_DATABASES=0 TOTAL=0
samhan-slip-service|healthy
samhan-inventory-service|healthy
samhan-partner-service|healthy
samhan-auth-service|healthy
samhan-partner-auth-service|healthy
samhan-postgres|healthy
samhan-rabbitmq|healthy
```

## ⑬ 판정

**도달 결함 0건.** 실제 사용자가 화면으로 도달하는 주문 경로에서 AC/AR 구성품 라벨-금액, 금액 4단계, 저장 재조회, R03/R05/R08, VAT 경계, 가격 미리보기, 시트 폐기 안내와 DB 카탈로그를 확인했고 남은 도달 결함은 발견되지 않았다.
