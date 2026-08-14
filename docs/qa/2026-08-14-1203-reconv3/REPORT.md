# PR #1203 재수렴 적대검증 3차 실브라우저 QA

- 일시: 2026-08-14 (Asia/Seoul)
- 대상: PR #1203, `fix/stock-transfer-confirm-noop`, GitHub가 보고한 head `9b7aa0dae45ebd29b35fe6aa6acbd52a22a191c1`
- 판정: **핵심 fix(다섯 계열 수불행의 해당 건 상세 착지, UUID 비노출, 없는 번호 처리)는 통과**. 그러나 전체 실사용 경로에는 **도달 가능한 결함 1건**이 있다. 재고실사 완료가 `accounting-service 4xx: 404 NOT_FOUND`로 실패한다.
- 사전 확인: `gh pr view 1203`의 본문과 코멘트 11개 전부, 직전 `reconv2/REPORT.md`, 정본 결정을 읽은 뒤 실행했다.
- 실행 방식: 인앱 Browser가 아니라 `clients/desktop` 패키지 안에서 로컬 Playwright를 실행했고, Chromium은 아래 고정 바이너리를 직접 launch했다.

## 1. 환경 실측 원문

```text
Chromium=C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
Renderer=http://127.0.0.1:5294 (HashRouter, VITE_APP_VERSION=2026/08/14-120303)
RAM_TOTAL_GB=61.613
RAM_FREE_GB(initial)=12.976
RAM_FREE_GB(after inventory deploy)=12.684
RAM_FREE_GB(final)=10.679
```

여유 RAM은 전 구간 1.0GB를 크게 상회했다.

이 워크트리에는 `scripts/redeploy-service.ps1`가 없었다. 따라서 아래 순서로 **inventory-service만** 다시 만들고 올렸다. 다른 서비스는 재배포하지 않았다.

```text
.\gradlew.bat :services:inventory-service:bootJar --no-daemon
BUILD SUCCESSFUL in 10s
17 actionable tasks: 17 up-to-date

docker compose -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.local-all.yml \
  -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml \
  --env-file infrastructure/.env.local up -d --build --no-deps inventory-service
```

Compose 선언과 실행 컨테이너를 서비스 label로 대조한 원문이다. 실행 중인 것만 세지 않고 누락도 셌다.

```text
DECLARED_COUNT=24
RUNNING_COUNT=23
MISSING=nginx,prometheus
EXTRA=logging-service

healthy=accounting-service,api-gateway,arologis-service,auth-service,
dashboard-service,elasticsearch,eureka-server,grafana,groupware-service,
inventory-service,minio,notification-service,partner-auth-service,
partner-order-service,partner-service,postgres,product-service,rabbitmq,
redis,slip-service,user-service
starting=dc-config-service,logging-service
```

검증 대상과 결함 경계 서비스의 이미지 시각 및 **컨테이너 안 jar** 실측이다.

```text
inventory-service container created=2026-08-14T01:03:55.038659348Z
inventory-service image=sha256:f4a778ec73bb8ce304cbfaf1cac2f02830d644f781e6249065ea4851c874ac84
inventory-service image created=2026-08-13T23:43:23.795877297Z
inventory-service /app/app.jar=114277560 bytes|2026-08-14 08:43:08 +0900
inventory-service jar SHA-256=684007AFDE6545473F8943519FEC6447D2F8AA09C3A8FAA40B790C96B31EE1D1

accounting-service container created=2026-08-14T01:17:47.6846501Z
accounting-service image=sha256:2b27895689333c862a9f33e7e2b74d70ec788955fbe10d24a3ee41da3f244f27
accounting-service image created=2026-08-14T00:43:50.470670812Z
accounting-service /app/app.jar=109642674 bytes|2026-08-14 09:43:43 +0900
```

최종 비변경 재검증 원문:

```text
Running 4 tests using 1 worker
PR1203_NAV_CASE_PASS=sales
PR1203_NAV_CASE_PASS=inbound
PR1203_NAV_CASE_PASS=inspection
PR1203_NAV_CASE_PASS=transfer
PR1203_NAV_CASE_PASS=audit
PR1203_WIDTH_EVIDENCE=[1366:1320,1440:1320,1600:1320]
PR1203_AUDIT_COMPLETE_FAILURE={"auditNo":"2026/08/14-8","status":400,"body":"accounting-service 4xx: 404 NOT_FOUND","userMessage":"상태 변경에 실패했습니다."}
4 passed (18.9s)
```

## 2. 다섯 계열 수불행 상세 착지

각 행은 재고수불부에서 실제 클릭했다. URL뿐 아니라 상세 화면에만 있는 업무번호·품목·수량/상태 표지를 단정했고, URL과 화면 가시문자 양쪽에 UUID 정규식 일치가 0임을 확인했다.

| 계열 | 클릭한 수불행 | 실제 착지 URL | 상세 전용 단정 | 결과·캡처 |
|---|---|---|---|---|
| 판매 | `2026/08/14-9`, 한경희 선풍기 `0000098`, 거래처 능동에어컨(박수천) | `/#/sales/by-number?slipNo=2026%2F08%2F14-9` | `판매전표 상세`, 번호, `0000098`, 한경희 선풍기 | 통과 · [캡처](screenshots/01-sales-ledger-row-detail-real-qa.png) |
| 입고 | `2026/08/14-2`, 한경희 선풍기 `0000098` | `/#/purchases/by-number?slipNo=2026%2F08%2F14-2` | `입고전표 상세`, 번호, `PR1203-SOL-RECONV2` | 통과 · [캡처](screenshots/01-inbound-ledger-row-detail-real-qa.png) |
| 입고검수 | 적요 `검수 완료 입고 — slipNo=2026/08/14-3` | `/#/purchases/by-number?slipNo=2026%2F08%2F14-3` | `입고전표 상세`, 번호, `0000098`, `INSPECTION` | 통과 · [캡처](screenshots/01-inspection-ledger-row-detail-real-qa.png) |
| 이동 | `2026/08/14-15`, 한경희 선풍기 `0000098` | `/#/transfers/by-number?transferNo=2026%2F08%2F14-15` | `이동전표 상세`, 번호, 출발 `00003`, 도착 `HQ-001`, 요청/출고/입고 수량 | 통과 · [캡처](screenshots/01-transfer-ledger-row-detail-real-qa.png) |
| 실사 | 적요 `재고 실사 조정 (2026/08/14-3)` | `/#/warehouse/audit/by-number?auditNo=2026%2F08%2F14-3` | 번호, 한경희 선풍기, `실사 라인`, `완료` | 통과 · [캡처](screenshots/01-audit-ledger-row-detail-real-qa.png) |

**목록 착지 0/5, UUID 노출 0/5, 해당 건 상세 착지 5/5**다. 판매 `-9`와 이동 `-9`, 입고검수/이동/실사 `-3`처럼 서로 다른 계열의 번호가 충돌하므로, 번호만 찾지 않고 적요·거래처 표지로 정확한 수불행을 골라 클릭했다.

## 3. 없는 번호

| 경로 | 사용자가 실제로 본 것 | URL 유지 | 결과·캡처 |
|---|---|---|---|
| `/#/transfers/by-number?transferNo=PR1203-NOT-EXIST-TRANSFER` | `해당 이동전표를 찾을 수 없습니다.` | by-number 유지, UUID 없음, 일반 목록 미이동 | 통과 · [캡처](screenshots/02-missing-transfer-real-qa.png) |
| `/#/warehouse/audit/by-number?auditNo=PR1203-NOT-EXIST-AUDIT` | `해당 재고 실사를 찾을 수 없습니다.` | by-number 유지, UUID 없음, 일반 목록 미이동 | 통과 · [캡처](screenshots/02-missing-audit-real-qa.png) |

## 4. 직전 통과 항목 재확인

| 항목 | 이번 실측 |
|---|---|
| 이동 확정 불변식 | 새 이동 표본을 실제 확정. 출발 `-1`, 도착 `+1`, 두 창고 합계 변화 `0`. 해당 번호 수불부에 `STOCK_TRANSFER` 출고 1행과 입고 1행을 API 재조회로 단정. [캡처](screenshots/04-transfer-confirm-refetched-real-qa.png) |
| 캐시/재조회 — 이동 confirm | mutation 2xx 후 재고현황에서 사용자가 `조회`를 눌러 `/inventory/balances` 실제 GET 200을 관측하고 상세에 재진입. 통과. |
| 캐시/재조회 — 판매 ship | mutation 2xx 후 동일한 실제 GET 200. [캡처](screenshots/05-sales-ship-refetched-real-qa.png) |
| 캐시/재조회 — 판매 confirm | mutation 2xx 후 동일한 실제 GET 200. [캡처](screenshots/06-sales-confirm-refetched-real-qa.png) |
| 캐시/재조회 — 입고 confirm | mutation 2xx 후 동일한 실제 GET 200. [캡처](screenshots/07-inbound-confirm-refetched-real-qa.png) |
| 캐시/재조회 — 실사 complete | **관측 불가**. complete 자체가 400으로 실패하여 성공 이후 재GET 단계가 존재하지 않았다. 결함은 §7에 기록. |
| 실사 입력 — 실제 코드 | `0000098`, 장부수량 3에 실물수량 4를 입력해 POST 200, 차이 `+1`. [캡처](screenshots/08-audit-product-code-0000098-real-qa.png) |
| 실사 입력 — 기존 UUID | 같은 실사의 기존 두 번째 품목 UUID를 API 계약에 넣어 POST 200, 화면 재조회 후 두 라인과 수동 입력 표지를 확인. UUID는 사용자 URL/화면에 노출되지 않음. [캡처](screenshots/09-audit-existing-uuid-path-real-qa.png) |
| 실사 입력 — 없는 품목코드 | `PR1203-NOT-EXIST-...` 입력 POST 400/404, 사용자에게 `존재하지 않는 품목코드: ...` 표시. [캡처](screenshots/10-audit-missing-product-code-rejected-real-qa.png) |

`mutation 후 GET`은 네 성공 경로에서 실제 네트워크 응답을 기다려 200을 단정했다. 실사 완료는 성공으로 세지 않았다.

## 5. 재고수불부 표시·폭 재실측 및 PR 본문 대조

세 viewport마다 DOM geometry를 새로 읽었다.

| viewport | dialog | table scroll/client | scroller scroll/client | 가로 overflow |
|---:|---:|---:|---:|---|
| 1366 | 1320px | 1280/1280 | 1280/1280 | 없음 |
| 1440 | 1320px | 1280/1280 | 1280/1280 | 없음 |
| 1600 | 1320px | 1280/1280 | 1280/1280 | 없음 |

- 10열은 `일자 · 품목명 · 품목코드 · 창고명 · 거래처명 · 적요 · 전표번호 · 입고수량 · 출고수량 · 재고수량` 순서로 정확히 확인했다.
- 첫 행 `전일재고`, 마지막 `합계 / 누계`를 확인했다. 합계는 전일재고를 제외하는 정본 구현이다.
- 기본 기간은 `2026-05-14`~`2026-08-14`, 정확히 3개월이다.
- 적요는 별도 한 열이다.
- 캡처: [1366](screenshots/03-ledger-1366px-measured-real-qa.png) · [1440](screenshots/03-ledger-1440px-measured-real-qa.png) · [1600](screenshots/03-ledger-1600px-measured-real-qa.png)

PR 본문의 현재 값 `1366/1440/1600 모두 1320px`과 **일치**한다. 앞선 “1316.1006px / 1297.6543px” 정정값은 이번 독립 재실측과 불일치한다.

## 6. 캡처 SHA-256

최종 비변경 재검증이 캡처를 다시 쓴 뒤 직접 `Get-FileHash -Algorithm SHA256`로 측정했다.

```text
001da39ae6589818ea020b6f8271c0c55f8fdf197f5e16b9ab5e932fd9c006fd  01-sales-ledger-row-detail-real-qa.png
5b82aef4b9b279b1e92cdb161d5752df69b576e2bf33cb991b25ecea0685127d  01-inbound-ledger-row-detail-real-qa.png
fe502e11e766ac5e6b0f59fa4886b74abc3eabb63280c9d2f520147f21b06e80  01-inspection-ledger-row-detail-real-qa.png
1f3c57d1b1d314fb88db1fc23fbbea72109643a9ae8d2d2bd34cddcfcba6d70a  01-transfer-ledger-row-detail-real-qa.png
8eb2c5a893ec4281f5e79f46e2d46feb4ef9de37ab755842af0f3e052f927c90  01-audit-ledger-row-detail-real-qa.png
f522034dad8b9efb6c1ccbd92b187a8441b977c862b02f2bfce7fd4e9f059042  02-missing-transfer-real-qa.png
e99b7d501596fe21674384ce473a04b9cca9317b0011636b670a1db1a25d6cf3  02-missing-audit-real-qa.png
33def46a46a64ab57ffae4f1f2eb7d96e7eee332548a3ed0b38aadb4a95dd0de  03-ledger-1366px-measured-real-qa.png
4866d944def9b870b660bdf93071d3d6391740b382c314a07f8c5a11cae4296f  03-ledger-1440px-measured-real-qa.png
1ddba185fcd494ea471d2117594fe8c00cf762d8d3b9de21b77ae05dbd9e73d3  03-ledger-1600px-measured-real-qa.png
1d4f5bd6b322e67c045b2301df082f01366a9bb2d7cbd3bb177c2f935869ddcb  04-transfer-confirm-refetched-real-qa.png
6a0723490d42eb5050a85f9dcce06ef5273535ca09316406f6c301afff1cc270  05-sales-ship-refetched-real-qa.png
e2e649bbf40470deaa4fc50a167f239d25b5137cc6c754f63b60f45745bb0241  06-sales-confirm-refetched-real-qa.png
127ba0ace23e0d22219084886c75ec7c9140a8dc31a89d8125bdb576dfc63ced  07-inbound-confirm-refetched-real-qa.png
4b2b8f5682a4e24b9fd85261bf76b91339053e1b4cd33847b71fc49e0562a443  08-audit-product-code-0000098-real-qa.png
182e0c3a43a7ca5ebd053514350c7aae7de68eb478a84d145f36d3c1c6fb7e68  09-audit-existing-uuid-path-real-qa.png
78130d0a9a22642bdc4ef6aa0dd8f705178199b7f6a3e98ae45ba31095c8b164  10-audit-missing-product-code-rejected-real-qa.png
9595e0e2b5945b939cf47b0a05875bac20b2a025dbdf7b20176f94bc472240cf  11-audit-complete-accounting-404-real-qa.png

COUNT=18
DUPLICATE_GROUPS=0
```

## 7. 도달 가능한 결함 목록

### SOL-1203-R3-01 — 재고실사 완료가 accounting-service 404로 실패

- 사용자 경로: 재고 실사 상세 `2026/08/14-8` → `완료` → 확인.
- 전제: 실사 두 라인의 실물수량이 모두 기록된 진행중 실사다. `실외기_3HP 다배관`은 장부 1/실물 1, `한경희 선풍기`는 장부 3/실물 4다.
- 실제 HTTP: `POST .../inventory/audits/{id}/complete` → 400.
- 응답 본문 핵심: `accounting-service 4xx: 404 NOT_FOUND`.
- 사용자가 보는 것: `상태 변경에 실패했습니다.`이며 실사는 계속 `진행중`이다.
- 증거: [실캡처](screenshots/11-audit-complete-accounting-404-real-qa.png).
- 영향: 실사 완료 및 그 성공 이후 캐시 재GET을 수행할 수 없다.
- 귀속 주의: 같은 공유 스택의 accounting-service가 결함 경계이지만, 타 트랙이 동시에 스택을 사용하므로 이 보고서는 원인 커밋을 PR #1203으로 단정하지 않는다. 사용자 재현 가능한 현재 통합 결함으로 판정한다.

**도달 가능한 결함: 1건.** 핵심 by-number fix 자체의 회귀 결함은 0건이다.

## 8. 관측 불가와 실패 원문

### 관측 불가

- `재고실사 complete 성공 후 inventory balances 재GET`: complete가 400으로 실패하여 후속 상태가 생성되지 않았다. “결함 0” 또는 통과로 세지 않았다.

### 준비/하네스 실패 원문 — 제품 결함으로 세지 않음

```text
scripts/redeploy-service.ps1: 이 워크트리에 파일 없음
최초 Vite 기동: VITE_APP_VERSION must match YYYY/MM/DD-number
최초 잘못 고른 vite.web: BrowserRouter여서 종료하고 HashRouter renderer config로 재기동
Playwright strict mode: getByRole('heading', {name:'재고 현황'})가 2개 요소와 일치
동일 업무번호 충돌: 판매 -9를 번호만 골랐을 때 이동 -9 행을 선택
SSE route.fetch: 120000ms timeout
판매 deliver 뒤 같은 URL goto: stale 상세가 남아 confirm 버튼 대기 300000ms timeout
dev_master 입고검수: 403; 실제 검수 권한 QA 계정(kimeunji)으로 해당 동작 수행
초기 이동 표본: 409 `이동 재고 부족: 요청 1, 가용 0`; 공유 DB의 선행 예약을 피하도록 보충 입고 후 새 표본 생성
```

위 실패들은 각각 HashRouter renderer, 고유 행 표지, SSE continue, reload, 권한 계정, 새 재고 표본으로 교정해 실제 제품 경로를 끝까지 밟았다. 합성 PNG는 만들지 않았다.

## 9. 공유 DB에 만든 것

다른 라운드의 기존 행과 섞어 세지 않도록 `PR1203-RECONV3` 표지 및 생성시각으로 DB를 직접 조회했다. 정리 목적으로 삭제하지 않았다.

- 재고이동 7건: `2026/08/14-16`~`-22`. `-16`~`-18`은 `RECEIVED`, `-19`~`-22`는 `CONFIRMED`.
- 판매 7건: `2026/08/14-10`~`-16`. 최종 성공 표본 `-14`, `-15`, `-16`은 `CONFIRMED`; 앞선 재시도 표본은 `INSPECTING`/`COMPLETED`/`DELIVERED` 상태로 남았다.
- 입고 10건: `2026/08/14-4`~`-13`. 보충 입고는 `-6`, `-8`, `-10`, `-12`; 최종 성공 표본 `-13` 포함 최근 표본은 `CONFIRMED`다.
- 재고실사 5건: `2026/08/14-4`~`-8`, 모두 `IN_PROGRESS`. 완료 404 때문에 `-8`도 진행중으로 남았다.
- 최종 증거 표본 tag: `PR1203-RECONV3-1786671207966`; 이동 `-22`, 판매 `-16`, 입고 `-13`, 실사 `-8`.

## 최종 결론

PR #1203의 이번 fix가 주장한 **판매·입고·입고검수·이동·실사 다섯 계열의 해당 건 상세 착지**, **opaque by-number URL**, **UUID 비노출**, **없는 이동/실사 번호의 명시 오류**는 실제 Chromium 재검증에서 전부 성립했다. 표시·폭·이동 불변식·네 성공 mutation의 재GET·실사 입력 세 경로도 재확인했다. 다만 현재 공유 통합 스택에서 재고실사 완료는 accounting-service 404로 실패하므로, 전체 판정은 결함 1건이며 실사 완료 후 캐시 재GET은 관측 불가다.
