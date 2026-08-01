# 1008 일마감 재검증 라이브 QA

## 0단계 — 배포본 확인

실행 명령:

```text
docker inspect -f '{{.Created}}' samhan-accounting-service
```

응답 원문:

```text
2026-07-31T14:34:40.78219617Z
```

위 시각은 재빌드 전 컨테이너 생성 시각이다.

재빌드 시도 원문:

```text
docker compose up -d --build --no-deps accounting-service
no configuration file provided: not found

docker compose -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps accounting-service
service "groupware-service" refers to undefined network samhan-net: invalid compose project
```

Compose overlay 안내에 따라 base + overlay 조합이 필요했다. 이 조합은 `accounting-service`만 대상으로 실행한다.

base + overlay 조합의 단일 서비스 재빌드 결과:

```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps accounting-service
...
failed to solve: failed to compute cache key: failed to calculate checksum ... "/services/accounting-service/build/libs/accounting-service.jar": not found
```

JAR 부재로 이미지 빌드가 중단되어, 해당 서비스 JAR 생성이 필요하다.

`accounting-service` JAR 생성:

```text
& .\gradlew.bat :services:accounting-service:bootJar
...
> Task :services:accounting-service:bootJar

BUILD SUCCESSFUL in 6s
20 actionable tasks: 2 executed, 18 up-to-date
```

단일 서비스 재빌드·기동 결과 원문:

```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps accounting-service
...
Image infrastructure-accounting-service Built
Container samhan-accounting-service Recreated
Container samhan-accounting-service Started
```

재빌드 후 생성 시각 확인 예정.

재빌드 후 생성 시각 및 상태 원문:

```text
2026-08-01T04:06:24.885352273Z
running starting
```

헬스 확인 원문:

```text
healthy
HTTP/1.1 200
{"status":"UP"}
```

## 1단계 — 일마감 상세 실제 호출

호출:

```text
GET http://127.0.0.1:8087/accounting/closings/daily?date=2026-07-27&kind=SALES&sourceKind=TAX_INVOICE
X-User-Role: MASTER
X-User-Id: (개발 시드 계정)
X-Is-System-Master: true
```

HTTP 상태 및 응답 원문:

```text
HTTP/1.1 200
{"success":true,"code":"OK","message":"성공","data":{"date":"2026-07-27","totalTaxInvoiceCount":1,"totalSupply":272727.00,"totalVat":27272.00,"totalAmount":299999.00,"totalDiscount":0,"taxInvoices":[{"taxInvoiceNo":"2026/07/27-1","salesSlipNo":null,"sourceSlipNo":null,"bizNo":"1018100001","partnerName":"(주)한국냉동물류","supplyAmount":272727.00,"vatAmount":27272.00,"totalAmount":299999.00}],"productSummaries":[{"productName":"삼성 윈드프리 9평형","modelName":null,"categoryKey":"UNKNOWN","quantity":3.00,"supplyAmount":272727.00,"actualUnitPrice":99999.6666666667,"releasePrice":null,"deliveryPrice":null,"expectedRate":null,"actualRate":null,"discountAmount":null,"verified":null,"revalidationStatus":"AMBIGUOUS"}]},"timestamp":"2026-08-01T04:09:09.329110565Z"}
```

판정: 상세는 실제 200으로 열렸고 재검증 결과(`revalidationStatus`)가 응답에 포함됐다. 이 행은 가격 참조가 없어 기대율 비교 대상이 아니며, 합성 데이터는 만들지 않았다.

## 2단계 — 실 DB `dc_configs` 조회 및 대상 선정

활성 전역DC 집계 SQL 원문:

```text
SELECT COUNT(*) AS active_configs, COUNT(*) FILTER (WHERE home_discount_rate <> 0.45 OR commercial_discount_rate <> 0.45) AS non_45_configs FROM dc_configs WHERE is_deleted=false;
 active_configs | non_45_configs
----------------+----------------
            210 |            135
```

비45% 실 DB 행 일부 원문(거래처 코드·이름만 기록):

```text
 partner_code |                 name                 | home_discount_rate | commercial_discount_rate
--------------+--------------------------------------+--------------------+--------------------------
 1012555999   | 동영 온라인점-송아름                 |             0.4500 |                   0.4600
 1023108393   | 에어컨J-김경진                       |                    |                   0.4700
 1060818309   | 랜드유통(최경호)                     |             0.4500 |                   0.4600
 1068689215   | 주식회사 중앙유통                    |             0.4800 |                   0.4800
 1081764285   | 중앙공조(이병선)                     |             0.4600 |                   0.4700
```

실제 일마감 원천 행 SQL 원문:

```text
 supply_date | tax_invoice_no | partner_code |     partner_name     | partner_business_no |      item_name      | model_name | category_key | quantity | supply_amount | vat_amount
-------------+----------------+--------------+----------------------+---------------------+---------------------+------------+--------------+----------+---------------+------------
 2026-07-27  | 2026/07/27-1   | P0-6-C001    | (주)한국냉동물류     |                     | 삼성 윈드프리 9평형 |            |              |     3.00 |     272727.00 |   27272.00
 2026-07-04  | 2026/07/04-1   |              | (주)삼한물류         | 123-45-67001        | QA-724 테스트 품목  |            |              |     1.00 |     100000.00 |   10000.00
 2026-05-10  | 2026/05/10-1   |              | 대한통운(주)         | 104-81-12302        | 창고보관료           |            |              |   100.00 |    1000000.00 |  100000.00
```

대상 선정 결과: 활성 `dc_configs`에는 비45% 행이 있으나, 실제 일마감 원천의 거래처 코드/이름/사업자번호와 일치하는 행이 없었다. 따라서 전역DC가 비45%인 실제 일마감 대상은 0건이며, 임의의 거래처나 합성 응답으로 검증하지 않았다.

## 3단계 — `dc-config-service` 중지 중 상세 재호출

실행 및 복구 명령 원문:

```text
docker stop samhan-dc-config-service
samhan-dc-config-service

GET /accounting/closings/daily?date=2026-07-27&kind=SALES&sourceKind=TAX_INVOICE
HTTP/1.1 200
{"success":true,"code":"OK","message":"성공","data":{"date":"2026-07-27","totalTaxInvoiceCount":1,"totalSupply":272727.00,"totalVat":27272.00,"totalAmount":299999.00,"totalDiscount":0,"taxInvoices":[{"taxInvoiceNo":"2026/07/27-1","salesSlipNo":null,"sourceSlipNo":null,"bizNo":"1018100001","partnerName":"(주)한국냉동물류","supplyAmount":272727.00,"vatAmount":27272.00,"totalAmount":299999.00}],"productSummaries":[{"productName":"삼성 윈드프리 9평형","modelName":null,"categoryKey":"UNKNOWN","quantity":3.00,"supplyAmount":272727.00,"actualUnitPrice":99999.6666666667,"releasePrice":null,"deliveryPrice":null,"expectedRate":null,"actualRate":null,"discountAmount":null,"verified":null,"revalidationStatus":"AMBIGUOUS"}]},"timestamp":"2026-08-01T04:10:18.418597879Z"}

docker start samhan-dc-config-service
samhan-dc-config-service
starting
starting
starting
starting
healthy
running healthy
```

불변식 A: 충족 — 정지 중에도 HTTP 200으로 열렸다.
불변식 B: 이 실제 행은 품목 매칭이 `AMBIGUOUS`로 끝나 전역DC 미조회 사유까지 도달하지 않았다. 따라서 화면/응답에서 `전역DC 미조회` 표시는 관찰하지 못했다. 대상 데이터 부재 상태에서 이를 합성하지 않았다.

## 4단계 — 데스크톱 렌더러

실행 명령:

```text
cd clients/desktop
VITE_APP_VERSION="2026/08/01-1" node_modules/.bin/vite src/renderer --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5942 --strictPort
```

실행 결과 원문:

```text
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 1481
<title>Samhan Public 데스크톱</title>
```

브라우저 확인: 이 QA 세션에는 사용 가능한 브라우저가 없어(`No browser is available`, 사용 가능 목록 `[]`) 일마감 화면을 실제 렌더링하거나 사유 열 스크린샷을 캡처하지 못했다. 요청대로 목업/합성 캡처는 만들지 않았다.

## 5단계 — 최종 판정

- 일마감 상세 실제 호출: 200, 응답 본문 확인 완료.
- 활성 `dc_configs` 비45%: 135건(활성 전체 210건) SQL 실측.
- 실제 일마감 원천과 일치하는 비45% 거래처: 대상 없음.
- dc-config-service 중지 중 상세: 200 확인, 서비스 `running healthy` 복구 확인.
- `전역DC 미조회`: 현재 실제 행은 `AMBIGUOUS` 선행으로 해당 문구까지 도달하지 않아 확인하지 못함.
- 화면 사유 열 캡처: 브라우저 없음으로 미수행.
- 판정이 실제로 달라진 건: 대상 없음. 비교 가능한 대상이 없으므로 0건을 영향 없음으로 집계하지 않음.

추가 SQL 원문(고정DC 우선 경로에서 확인할 홈멀티 전역DC 분포):

```text
SELECT home_discount_rate, COUNT(*) FROM dc_configs WHERE is_deleted=false GROUP BY home_discount_rate ORDER BY home_discount_rate;
 home_discount_rate | count
--------------------+-------
             0.4500 |   104
             0.4600 |    19
             0.4700 |    28
             0.4800 |     8
                    |    51
```

최종 서비스 상태 원문:

```text
dc-config-service: running healthy
accounting-service: 2026-08-01T04:06:24.885352273Z running healthy
```

## PM 화면 캡처 (2026-08-01)

Codex 샌드박스에 브라우저가 없어 PM 이 직접 수행했습니다. 실 게이트웨이 `:8080` · mock OFF · `dev_master`.

`01-daily-closing-list.png` — 일마감 화면, 대상일 `2020-01-02`(마감 이력이 있는 유일한 날짜).

| 영역 | 화면 |
|---|---|
| 마감 이력 | **2건** — 전체 마감 · 거래처 `P0-6-C002` (매출·세금계산서, 상태 `열림`) |
| 일마감 상세 | *"상세 전표가 없습니다."* |
| 모델별 재검증 | *"모델별 재검증 결과가 없습니다."* — **사유 열은 존재** |

### 🚫 이 캡처가 보여주지 못하는 것

**`전역DC 미조회` 라벨이 실제로 표시되는 화면을 찍지 못했습니다.**

마감 이력은 있으나 **재검증 대상 라인이 0건**입니다. API 라이브QA 에서도 같은 결론이 나왔습니다 — *"실제 일마감과 일치하는 비45% 거래처는 대상 없음"* · *"판정 변경 건: 대상 없음"*.

⟹ **사유 열이 존재한다는 것까지만 확인됐고, 그 자리에 `전역DC 미조회` 가 들어가는 것은 실 데이터로 보지 못했습니다.**

0건을 "영향 없음" 으로 세지 않습니다. **재검증 대상이 있는 데이터가 들어오면 다시 확인해야 합니다.**
