# PR #1241 CODEX SOL 적대검증 R17

## ① 환경 확인

요청받은 명령을 작업의 맨 처음, 아래 순서 그대로 실행했다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # b935dc801
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain
gh pr checks 1241
```

원문 출력:

```text
b935dc801c7f9696a4e14581d301086c3e7589f3
feat/gas-parity-order-web
```

초기 `git status --porcelain` 출력은 빈 문자열이었다. 초기 `gh pr checks 1241`은 총 31개로 `pass=2`, `fail=1`, `pending=28`이었다. 원문에서 완료된 세 줄은 다음과 같았다.

```text
GitGuardian Security Checks	fail	1s	https://dashboard.gitguardian.com/
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	56s	https://github.com/ewoo14/Samhan-Public/actions/runs/31952173826/job/95177226227
적용된 Flyway 마이그레이션 불변 가드	pass	43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31952173798/job/95177226183
```

금지된 `git add`, `git commit`, `git push`는 실행하지 않았다.

## ② CI 카운트

최종 재조회 원문 카운트는 다음과 같다.

```text
CI_COUNT total=47 pass=39 fail=8 pending=0 skipping=0
```

실패 8개 이름은 `Desktop Playwright (mock 회귀 hard gate)`, `GitGuardian Security Checks`, `JUnit 테스트 결과 (product-quantity-sync-schema)`, `JUnit 테스트 결과 (user+product+inventory+logging)`, `문서 본문 단언 스펙`, `빌드 + 테스트 (accounting+partner)`, `빌드 + 테스트 (product-quantity-sync-schema)`, `빌드 + 테스트 (user+product+inventory+logging)`이다. 이 절은 요구된 CI 상태 카운트만 기록하며, 화면 도달 결함 판정에는 아래 실사용 경로 재현만 사용했다.

## ③ 끝전 전 세트 카운트 — 직접 실측

격리 복제 `product_db`의 활성 `SINGLE_SET`/`BUNDLE` 부모를 SQL로 직접 열거하고 PR HEAD `BundleExpander`에 각 세트를 `setQty=1`로 호출했다. 끝전은 이 트랙의 대상인 실내기·실외기 본체 단가가 1,000원 단위에서 벗어난 세트로 셌다.

```text
ALL_SINGLE_BUNDLES=271 EXPANDED=271 LINES=855 ERRORS=0 ENDING_COUNT=0
ENDING_SETS=0
```

따라서 LUNA 수치를 전재하지 않은 R17 실측은 **활성 싱글 세트 271개 전수, 끝전 잔존 0건**이다.

## ④ 세트 라벨-금액 짝 전수표

관계 백필을 커밋 산출물의 의도대로 보정 적용한 격리 DB에서 `BundleExpander` 자체는 AC 세트를 `606,000 / 910,000 / 128,000 / 16,000`으로 전개했다. 그러나 실제 주문 화면·미리보기 API·최종확인·저장값은 아래와 같았다. 합계 일치만으로 통과시키지 않고 여섯 라벨을 모두 대조했다.

| 부모 세트 | 구성품 라벨/모델 | 관계 계약값 | 품목표 | 미리보기 | 최종확인 | 저장값 |
|---|---|---:|---:|---:|---:|---:|
| AC060CS6PBH1SY | 360 CST UV 실내기 / AC060CN6PBH1 | 606,000 | 부모 1,660,000 | **616,975** | **616,975** | **616,975** |
| AC060CS6PBH1SY | 360 CST UV 실외기 / AC060CXAPBH1 | 910,000 | 부모 1,660,000 | **925,050** | **925,050** | **925,050** |
| AC060CS6PBH1SY | 판넬 (360CST / 원형 / WIFI) / PC6NUNK1NW | 128,000 | 부모 1,660,000 | **104,060** | **104,060** | **104,060** |
| AC060CS6PBH1SY | 무선리모컨(냉난방전용) / AR-EH05 | 16,000 | 부모 1,660,000 | **13,915** | **13,915** | **13,915** |
| AR06D1150HZS | 냉전 일반 벽걸이 실내기 / AR06D1150HZN | 148,000 | 부모 370,000 | 148,000 | 148,000 | 148,000 |
| AR06D1150HZS | 냉전 일반 벽걸이 실외기 / AR06D1150HAX | 222,000 | 부모 370,000 | 222,000 | 222,000 | 222,000 |

화면 합계와 저장 합계는 2,030,000원으로 맞지만 AC의 네 라벨-금액 짝은 모두 틀렸다.

## ⑤ dual-read 새 표면 5항목

1. **관계값 대 전역값 우선순위:** 상업 세트 표본에서 관계 출고가 `9,120,100`, 전역 납품가 `5,016,055`가 동시에 있을 때 전개값은 `9,120,100`이었다. 상업은 관계 출고가 → 관계 납품가 → 전역 납품가 순으로 의도대로 동작했다.
2. **0 대 NULL:** 격리 트랜잭션에서 관계 납품가를 `0`으로 두면 전개값도 `0`이었다. `NULL`로 두면 전역값 `104,060`으로 fallback했다. 무료 구성품 0을 NULL처럼 취급하지 않는다. 원값 `128,000`으로 복원했다.
3. **soft-delete:** 동일 쌍의 soft-delete 관계 행에 적대값 `9,999,999`를 넣어도 활성 행 `128,000`을 읽었다. 저장소 조건과 `@SQLRestriction` 모두 삭제 행을 제외했다.
4. **동일 pair ×2 / `default_qty=2`:** 활성 중복 INSERT는 `ux_bundle_component_active`에서 `duplicate key value violates unique constraint`로 거부됐다. 관계값이 적재된 `default_qty=2` 활성 pair 19개/부모 19개를 모두 전개했고 `QUANTITY_MISMATCH=0`이었다.
5. **일반 품목:** 주문 화면 R08 일반 부속 재계산, 데스크톱 DB 카탈로그의 `AR06D1150HZN` 검색, 주문 상세의 해당 일반 품목 재고조회 모달이 모두 도달했고 오류 표시는 0개였다.

## ⑥ VAT 경계·R03·R05·R08

격리 저장 DB 원문 대조:

| VAT 포함 금액 | 공급가액 | VAT | 미리보기/초안/확정 HTTP |
|---:|---:|---:|---|
| 5 | 5 | 0 | 200 / 201 / 200 |
| 6 | 5 | 1 | 200 / 201 / 200 |
| 11 | 10 | 1 | 200 / 201 / 200 |
| 800,000 | 727,273 | 72,727 | 200 / 201 / 200 |

- R03: 저장 상세 화면에서 거래처명 fallback `주식회사 중앙유통`이 표시됐다.
- R05: `서울특별시 R17 격리 QA로 16 16층`, 결제예정일 `2026-08-31`, 메모 `R17 헤더 보존 격리 QA`가 화면과 DB에 보존됐다.
- R08: 자동 부속 펌프 `1` → 사용자 수동 `7` → 원품 수량 2로 변경 후 자동 재계산 `2`를 확인했다.
- 가격 미리보기는 본 세트와 VAT 네 경계 모두 HTTP 200으로, 500은 재발하지 않았다.

## ⑦ 금액 4단계

품목표는 `AR06D1150HZS=370,000`, `AC060CS6PBH1SY=1,660,000`을 표시했다. 미리보기 응답/화면, 최종확인 화면, `partner_order_lines.price_vat` 저장값은 ④ 표와 1:1 동일했다. 즉 네 단계 합계는 일치하지만 AC 구성품 배분은 네 단계 중 품목표 다음 단계부터 잘못된 값으로 고정된다. 저장 DB 원문 예시는 다음과 같다.

```text
AC060CN6PBH1|616975.00|560886.00|56089.00|616975.00
AC060CXAPBH1|925050.00|840955.00|84095.00|925050.00
PC6NUNK1NW|104060.00|94600.00|9460.00|104060.00
AR-EH05|13915.00|12650.00|1265.00|13915.00
```

## ⑧ 마이그레이션 번호와 fresh 적용

- `origin/main`: product-service V44 없음, 최신 V43.
- 현재 브랜치: product-service `V44__bundle_component_context_prices.sql` 정확히 1개.
- 열린 PR 9개 전체 tree를 재조회했다. PR #1241을 제외한 다른 열린 head 8개에는 product-service V44가 0개였다. 다른 서비스의 V44는 서비스별 독립 번호 공간이므로 충돌이 아니다.

PR HEAD JAR로 빈 `product_fresh_db`를 기동한 Flyway 원문:

```text
Migrating schema "public" to version "1 - init product service"
Migrating schema "public" to version "31 - soft delete test seed products"
Migrating schema "public" to version "44 - bundle component context prices"
Successfully applied 44 migrations to schema "public", now at version v44 (execution time 00:00.563s)
Started ProductServiceApplication in 18.668 seconds
44|44|44
```

파일마다 별도 세션을 여는 raw psql 보조 실행은 기존 V31에서 다음과 같이 동일 재현됐다.

```text
APPLY=V31__soft_delete_test_seed_products.sql
CREATE TABLE
psql:/tmp/r17-migrations/V31__soft_delete_test_seed_products.sql:112: ERROR:  relation "_issue_1096_test_product_ids" does not exist
LINE 1: INSERT INTO _issue_1096_test_product_ids (id) VALUES
```

V31 blob은 HEAD와 `origin/main`이 모두 `4ceede03a485ad3aa557ba5defdd077b0335b668`이고 diff 0이다. 따라서 raw psql 중단은 V44에 도달하기 전, 파일별 세션이 V31의 임시 테이블을 끊는 기존 보조 실행 방식 결함이다. 실제 배포 경로인 Flyway 단일 마이그레이션 트랜잭션에서는 V1~V44 44개가 모두 성공했다.

## ⑨ 시트 차단·카탈로그 유지 양방향

PR HEAD 격리 런타임 로그와 연결 수 원문:

```text
[ProductSheetSyncScheduler] Google Sheets runtime 연동 폐기 — 부팅 sync skip
[ProductSheetSyncScheduler] Google Sheets runtime 연동 폐기 — DB source-of-truth 유지
[BootstrapService] DB catalog prefetch 완료 — Google Sheets runtime 연동 없음
qa1241r17-product|ESTABLISHED_REMOTE_443=0
qa1241r17-partner|ESTABLISHED_REMOTE_443=0
```

`/#/admin/sheet-sync`의 화면 고유 요소 `admin-sheetsync-retired`에 도달했고, 폐기 안내 문구 유지, 실행 버튼 0개, 일반 오류 alert 0개였다. DB 카탈로그는 주문 웹 품목표에서 두 세트를 조회하는 방향과 데스크톱 `/#/products/catalog`에서 일반 품목 `AR06D1150HZN`을 검색하는 방향 모두 유지됐다.

## ⑩ 캡처

Playwright는 반드시 `clients/desktop`에서, `headless: true`, 설치된 chromium-1217, 해시 라우터로 실행했다. 각 화면 고유 요소를 먼저 단정했고 마지막 실행은 `4 passed (6.1s)`였다. 캡처는 `resolveQaShotsDir()`를 거쳐 `docs/qa/1241-r17-adversarial-real-qa/screenshots/_local/`에 생성했다.

- `01-r08-manual-recalc-real-qa.png`
- `02-set-preview-label-amount-real-qa.png` — AC/AR 라벨과 숫자 동시 표시
- `03-order-headers-real-qa.png`
- `04-final-label-amount-real-qa.png` — AC/AR 라벨과 숫자 동시 표시
- `05-send-complete-real-qa.png`
- `06-r03-r05-order-detail-real-qa.png`
- `07-normal-item-inventory-real-qa.png`
- `08-sheet-sync-retired-real-qa.png`
- `09-db-catalog-normal-search-real-qa.png`

핵심 캡처 SHA-256은 미리보기 `f08968a8f9c36f9e53f17b294b3a140fe295d7ed929bfbba0724fbf57b6bcffa`, 최종확인 `76cf211a0a9aa4671f339bef1d447e524d311d74881b42943e8a560d0a16dd26`이다.

격리 배포 JAR의 host/runtime SHA-256은 모두 일치했다.

```text
product       91c7e4312c3297118bf7d704c814acdc8a2a00049ba057e523292c52431da405 MATCH=True
product-fresh 91c7e4312c3297118bf7d704c814acdc8a2a00049ba057e523292c52431da405 MATCH=True
partner       d5f08f6f13cefdf09120ca5a07023ce9f4e4c59220d2636ee1053b4bd1802b54 MATCH=True
dc            a1dd39b7f8c37b7dbe886f2b99d966495b736267f55f8babcb1836b2fa3a4d1c MATCH=True
```

## ⑪ 도달 결함

### 결함 1 — 주문 화면이 관계 구성품 단가를 사용하지 않는다

재현 절차:

1. PR HEAD JAR와 관계값 백필이 적용된 격리 DB를 기동한다.
2. `/#/order`에서 싱글중대형 화면 고유 요소 `#cardSingle`에 도달한다.
3. `AC060CS6PBH1SY`와 `AR06D1150HZS` 수량을 각각 1로 입력한다.
4. 미리보기 → 주문정보 → 최종확인 → 저장을 진행한다.
5. AC 네 구성품의 라벨 옆 금액을 ④ 표와 대조한다.

미리보기 실응답 원문:

```text
AC060CN6PBH1 expected=606000 actual=616975
AC060CXAPBH1 expected=910000 actual=925050
PC6NUNK1NW expected=128000 actual=104060
AR-EH05 expected=16000 actual=13915
```

원인은 화면이 만든 `setAllocation=true` 구성품 `unitPrice`를 `samhanApi.ts`가 그대로 전송하고, `PartnerOrderPriceCalculationService`가 이를 권위 단가로 그대로 보존하는 반면, 이번 fix의 관계 dual-read는 product-service의 `BundleExpander`에만 연결돼 주문 웹 전개 경로가 호출하지 않기 때문이다. 사용자는 미리보기·최종확인에서 틀린 라벨 금액을 보고 같은 값으로 저장하므로 실제 화면 도달 결함이다.

## ⑫ 증거 무결성 자기 고지

커밋된 백필 산출물은 원문 그대로 실행할 수 없다. SQL 임시 테이블은 6열인데 CSV는 `sheet_row`를 포함한 7열이다.

```text
CREATE TABLE
psql:r17-backfill.sql:3: ERROR: extra data after last expected column
CONTEXT: COPY luna_bundle_component_price_stage, line 2: "SINGLE,AC060CS6PBH1SY,PC6NUNK1NW,189200,128000,1,6"
backfill failed
```

CSV는 1,095행/고유 pair 1,095개이나, 현재 활성 관계와 실제 매칭돼 UPDATE된 것은 1,042개다. `default_qty=2` 주장 26개 중 활성 매칭은 19개이고 7개는 현재 활성 pair와 매칭되지 않았다. 의도 검증을 계속하기 위해 R17은 **커밋 파일을 수정하지 않고**, 격리 임시 복사에서 마지막 `sheet_row` 열만 제거해 동일 UPDATE를 적용했다. 그러므로 “1,095 active pair 백필 완료” 주장은 증거와 일치하지 않는다.

Playwright의 `4 passed`는 실행기 단정 통과를 뜻할 뿐 AC 금액의 기능 통과를 뜻하지 않는다. 스펙은 여섯 라벨의 존재와 관측값을 기록했고, 계약값 불일치는 이 보고서에서 별도로 판정했다. 캡처/스펙/보고서는 금지된 add/commit/push를 지키기 위해 로컬 untracked 상태라 PR 댓글에서 이미지로 호스팅되지 않으며, 경로와 SHA-256만 게시한다. 이 백필 산출물 결함은 증거 무결성 예외로 고지하되, ⑪의 동일 화면 증상을 중복 집계하지 않아 도달 결함 수에는 별도 가산하지 않았다.

## ⑬ 프로세스 회수

기동한 Vite 두 개, 격리 컨테이너 5개, 격리 Docker network 1개를 모두 회수했다. 임시로 격리 network에 연결했던 공유 컨테이너 5개는 분리했고 원래 health를 유지했다.

```text
RESIDUAL_LISTENERS=0 RESIDUAL_CONTAINERS=0 RESIDUAL_NETWORKS=0 RESIDUAL_VITE_PIDS=0 TOTAL=0
samhan-inventory-service|healthy
samhan-partner-auth-service|healthy
samhan-partner-service|healthy
samhan-rabbitmq|healthy
samhan-slip-service|healthy
```

## ⑭ 판정

**도달 결함 1건.** 활성 싱글 세트 271개 서버 전개에서 끝전은 0건이지만, 실제 주문 화면 경로가 새 관계 단가를 소비하지 않아 `AC060CS6PBH1SY`의 네 구성품 라벨 금액이 미리보기·최종확인·저장값에서 잘못된다.
