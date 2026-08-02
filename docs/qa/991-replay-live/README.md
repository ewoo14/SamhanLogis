# 991 replay live QA

## 0단계 — 실행본 확인 및 slip-service 재기동

실행 시각: 2026-08-01 (Asia/Seoul)

```text
=== pwd ===

NAMES                          IMAGE                                                  STATUS
samhan-partner-order-service   infrastructure-partner-order-service                   Up 4 hours (healthy)
samhan-slip-service            infrastructure-slip-service                            Up 4 hours (healthy)
samhan-groupware-service       infrastructure-groupware-service                       Up 4 hours (healthy)
samhan-api-gateway             infrastructure-api-gateway                             Up 5 hours (healthy)
samhan-accounting-service      infrastructure-accounting-service                      Up 6 hours (healthy)
samhan-product-service         infrastructure-product-service                         Up 6 hours (healthy)
samhan-auth-service            infrastructure-auth-service                             Up 7 hours (healthy)
samhan-dc-config-service       infrastructure-dc-config-service                       Up 23 hours (healthy)
samhan-partner-auth-service    infrastructure-partner-auth-service                    Up 23 hours (healthy)
samhan-eureka                  infrastructure-eureka-server                           Up 23 hours (healthy)
samhan-postgres                postgres:16-alpine                                     Up 23 hours (healthy)
samhan-dashboard-service       infrastructure-dashboard-service                      Up 23 hours (healthy)
samhan-inventory-service       infrastructure-inventory-service                       Up 23 hours (healthy)
samhan-partner-service         infrastructure-partner-service                         Up 23 hours (healthy)
samhan-arologis-service        infrastructure-arologis-service                        Up 23 hours (healthy)
samhan-user-service            infrastructure-user-service                            Up 23 hours (healthy)
samhan-notification-service    infrastructure-notification-service                    Up 23 hours (healthy)
samhan-prometheus              prom/prometheus:v2.55.1                                Up 23 hours (healthy)
samhan-elasticsearch            docker.elastic.co/elasticsearch/elasticsearch:8.15.3   Up 23 hours (healthy)
samhan-rabbitmq                rabbitmq:3.13-management-alpine                        Up 23 hours (healthy)
samhan-redis                   redis:7-alpine                                         Up 23 hours (healthy)
/samhan-slip-service|2026-07-31T15:51:50.533215807Z|infrastructure-slip-service|running
Path
----
C:\dev\Samhan-Public\.claude\worktrees\t991
=== docker ps ===
=== slip-service inspect candidates ===
--- samhan-slip-service ---
=== compose files ===
infrastructure\docker-compose.yml
infrastructure\docker-compose.slip-port-override.yml
infrastructure\docker-compose.prod.yml
infrastructure\docker-compose.no-host-ports.yml
infrastructure\docker-compose.local-all.yml
infrastructure\docker\docker-compose.arologis.yml
```

위 컨테이너는 워크트리 기준으로 생성된 실행본인지 확인하기 위해 재빌드·재기동한다.

실제 재빌드·재기동 원문:

```text
docker compose -f infrastructure/docker-compose.yml config --services
minio
nginx
postgres
prometheus
rabbitmq
redis
elasticsearch
grafana
no such service: slip-service
no such service: slip-service

docker compose -f infrastructure/docker-compose.local-all.yml build slip-service
docker compose -f infrastructure/docker-compose.local-all.yml up -d --no-deps slip-service
service "dc-config-service" refers to undefined network samhan-net: invalid compose project
service "auth-service" refers to undefined network samhan-net: invalid compose project

docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build slip-service
#1 [internal] load local bake definitions
#1 reading from stdin 1.95kB 0.0s done
#1 DONE 0.0s
#2 [internal] load build definition from spring-service.Dockerfile
#2 transferring dockerfile: 942B done
#2 DONE 0.0s
#3 [internal] load metadata for docker.io/library/eclipse-temurin:17-jre-alpine
#3 DONE 0.0s
#4 [internal] load .dockerignore
#4 transferring context: 2B done
#4 DONE 0.0s
#5 [1/4] FROM docker.io/library/eclipse-temurin:17-jre-alpine@sha256:02320dd4ce20e243dfb915c686089cf9315c763084fafbb12d5c9993aee18b57
#5 resolve docker.io/library/eclipse-temurin:17-jre-alpine@sha256:02320dd4ce20e243dfb915c686089cf9315c763084fafbb12d5c9993aee18b57 0.0s done
#5 DONE 0.0s
#6 [internal] load build context
#6 transferring context: 89.64MB 5.2s
#6 transferring context: 121.96MB 7.3s done
#6 DONE 7.3s
#7 [2/4] RUN apk add --no-cache curl     && addgroup -S app     && adduser -S app -G app     && mkdir -p /app /logs     && chown -R app:app /app /logs
#7 CACHED
#8 [3/4] WORKDIR /app
#8 CACHED
#9 [4/4] COPY --chown=app:app services/slip-service/build/libs/slip-service.jar /app/app.jar
#9 DONE 0.2s
#10 exporting to image
#10 exporting layers
#10 exporting layers 1.8s done
#10 exporting manifest sha256:74fd89aa511aab1e545bb9765a68aca2c2ddae84a849196777a751f80bd9dded 0.0s done
#10 exporting config sha256:2880e90d1d63e3cd333269fdc0b168a87794a3b20c0c59eb47b2100d6c9ca9a5 done
#10 exporting attestation manifest sha256:f216294ec7debdcaa677b84585ef700a52a82841aa66eb8d2121e17eb2a6584c 0.0s done
#10 exporting manifest list sha256:13ba0230a36d578878eddafe0f0f2ce4d4728b468461b973af25047d36ec510f 0.0s done
#10 naming to docker.io/library/infrastructure-slip-service:latest done
#10 unpacking to docker.io/library/infrastructure-slip-service:latest
#10 unpacking to docker.io/library/infrastructure-slip-service:latest 0.4s done
#10 DONE 2.3s
#11 resolving provenance for metadata file
#11 DONE 0.0s
=== post-restart inspect ===
/samhan-slip-service|2026-07-31T20:12:28.016811448Z|infrastructure-slip-service|created|
=== post-restart ps ===
NAMES     IMAGE     STATUS
 Image infrastructure-eureka-server Building
 Image infrastructure-api-gateway Building
 Image infrastructure-slip-service Building
 Image infrastructure-slip-service Built
 Container samhan-slip-service Recreate
 Container samhan-slip-service Recreated
 Container samhan-slip-service Starting
Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:8086 -> 127.0.0.1:0: listen tcp4 127.0.0.1:8086: bind: An attempt was made to access a socket in a way forbidden by its access permissions.

=== port 8086 ===
LocalAddress LocalPort RemoteAddress RemotePort State       AppliedSetting OwningProcess
------------ --------- ------------- ------------- -----    -------------- -------------
::           8086      ::           0             Listen                 9144
127.0.0.1    8086      127.0.0.1    63768         Established Internet   9144
=== port owning process ===
9144 influxd

=== live inspect ===
/samhan-slip-service|2026-07-31T20:12:54.555207691Z|infrastructure-slip-service|running|starting
=== live ps ===
NAMES                 IMAGE                         STATUS                                     PORTS
samhan-slip-service   infrastructure-slip-service   Up Less than a second (health: starting)   127.0.0.1:18086->8086/tcp
Container samhan-slip-service Recreate
Container samhan-slip-service Recreated
Container samhan-slip-service Starting
Container samhan-slip-service Started

2026-08-01T05:13:01.9167788+09:00|running|starting
2026-08-01T05:13:07.0123304+09:00|running|healthy
=== health endpoint ===
HTTP/1.1 200
Content-Type: application/vnd.spring-boot.actuator.v3+json
{"status":"UP"}
```

최종 실행본 생성 시각(UTC): `2026-07-31T20:12:54.555207691Z`; 상태 `running|healthy`; 호스트 포트 `127.0.0.1:18086 -> 컨테이너 8086`.

## 실행 데이터 확보 — 실제 런타임 OpenAPI 및 DB 값

```text
=== api docs ===
HTTP/1.1 200
Content-Type: application/json
Content-Length: 227436

=== matching paths ===
/slips|get,post
/api/v1/slips/from-partner-order|post
/api/v1/slips/from-orders-merge|post
/api/v1/slips/from-estimate|post
/api/v1/slips/by-source|get

=== publish request schemas ===
--- PublishFromPartnerOrderRequest ---
{"required":["lines","partnerOrderId","warehouseCode"],"type":"object","properties":{"partnerOrderId":{"maxLength":64,"minLength":0,"type":"string"},"ioDate":{"type":"string"},"partnerCode":{"maxLength":100,"minLength":0,"type":"string"},"partnerName":{"maxLength":100,"minLength":0,"type":"string"},"employeeCode":{"maxLength":50,"minLength":0,"type":"string"},"warehouseCode":{"maxLength":50,"minLength":0,"type":"string"},"warehouseId":{"maxLength":36,"minLength":0,"type":"string"},"shippingAddress":{"maxLength":500,"minLength":0,"type":"string"},"deliveryAddress":{"maxLength":500,"minLength":0,"type":"string"},"receiverPhone":{"maxLength":100,"minLength":0,"type":"string"},"memo":{"maxLength":500,"minLength":0,"type":"string"},"paymentDueLabel":{"maxLength":200,"minLength":0,"type":"string"},"discountInfo":{"maxLength":200,"minLength":0,"type":"string"},"orderApprovedAt":{"type":"string"},"lines":{"type":"array","items":{"$ref":"#/components/schemas/PublishLineRequest"}}}}
--- PublishLineRequest ---
{"required":["productCode","qty"],"type":"object","properties":{"lineNo":{"type":"integer","format":"int32"},"productCode":{"maxLength":100,"minLength":0,"type":"string"},"productName":{"maxLength":200,"minLength":0,"type":"string"},"spec":{"maxLength":100,"minLength":0,"type":"string"},"qty":{"type":"string"},"unitPriceExVat":{"type":"number"},"unitPriceVat":{"type":"number"},"supplyAmount":{"type":"number"},"vatAmount":{"type":"number"},"remarks":{"maxLength":200,"minLength":0,"type":"string"},"sourceOrderLineId":{"type":"string","format":"uuid"},"categoryKey":{"maxLength":40,"minLength":0,"type":"string"}}}

=== real DB source candidate ===
partner_order_db:
id=2163d28a-888a-497f-ab29-5daa12dc1123, order_no=2026/04/15-6, status=CONFIRMED, slip_publish_status=PENDING_RETRY, partner_code=P-2026-0006
line=149eddba-eeae-4710-acd1-c33639810552, product_id=51e16f88-98ce-359c-b4e5-c6641325c5bd, product_name=삼성 DVM-S 3HP, quantity=2, price_vat=900000.00
line=8fdddd79-ffb0-4257-9421-65d8c4375b92, product_id=a9d88f27-98af-3009-8e1f-3d9a390c41f4, product_name=삼성 DVM-S 10HP, quantity=3, price_vat=3000000.00
line=a2e483e5-e891-4825-ba27-93dc4029c050, product_id=01949ab7-e922-35c6-b289-5337d867a0ee, product_name=삼성 윈드프리 5평형, quantity=4, price_vat=750000.00
product_db:
51e16f88-98ce-359c-b4e5-c6641325c5bd -> product_code=010051
a9d88f27-98af-3009-8e1f-3d9a390c41f4 -> product_code=010057
01949ab7-e922-35c6-b289-5337d867a0ee -> product_code=010001
partner_db:
partner_code=P-2026-0006, id=23166e08-5038-3e7c-a9db-a17693f8eb42, name=인천공조산업
inventory_db:
warehouse id=11111111-1111-1111-1111-000000000001, code=HQ-001, name=본사창고
```

권한/입력 검증 시도 원문:

```text
IDEMPOTENCY_KEY=qa-991-live-3d262fb9-6876-4d86-8c32-4fc5e348e197
=== 1st request ===
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=slip.publish.from-partner-order action=CREATE role=UNKNOWN reason=accountId missing or invalid","data":null,"timestamp":"2026-07-31T20:16:17.089703709Z"}
=== 2nd request same key same body ===
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=slip.publish.from-partner-order action=CREATE role=UNKNOWN reason=accountId missing or invalid","data":null,"timestamp":"2026-07-31T20:16:17.116107206Z"}

=== 1st authorized retry ===
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"ioDate 형식 오류 (yyyyMMdd 필요): '2026-08-01'","data":null,"timestamp":"2026-07-31T20:16:54.185296082Z"}
=== 2nd authorized retry ===
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"ioDate 형식 오류 (yyyyMMdd 필요): '2026-08-01'","data":null,"timestamp":"2026-07-31T20:16:54.219603842Z"}
```

## 시나리오 결과

### VAT 포함 단가 — 실제 발행 및 동일 요청 재시도

사용한 실제 주문: `6c1a168e-3687-4cfe-a64b-74ddfc5b9409` / 실제 거래처 `P-2026-0008` / 실제 상품 모델 `AR05TXEAAWKNEU-01`, `AR11TXEAAWKNEU-05`.

```text
IDEMPOTENCY_KEY=qa-991-live-3dbab0ac-8b92-4120-b465-d799e86ee076
=== VAT inclusive request 1 ===
HTTP 201
{"success":true,"code":"OK","message":"성공","data":{"slipId":"25298823-2c5e-4494-9f66-1df522650334","slipNo":"2026/08/01-7","status":"SENT","sourceType":"PARTNER_ORDER","sourceId":"6c1a168e-3687-4cfe-a64b-74ddfc5b9409","idempotencyKey":"qa-991-live-3dbab0ac-8b92-4120-b465-d799e86ee076","idempotentReplay":false},"timestamp":"2026-07-31T20:21:08.229076576Z"}
=== VAT inclusive request 2 ===
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"slipId":"25298823-2c5e-4494-9f66-1df522650334","slipNo":"2026/08/01-7","status":"SENT","sourceType":"PARTNER_ORDER","sourceId":"6c1a168e-3687-4cfe-a64b-74ddfc5b9409","idempotencyKey":"qa-991-live-3dbab0ac-8b92-4120-b465-d799e86ee076","idempotentReplay":true},"timestamp":"2026-07-31T20:21:08.241258067Z"}
```

DB 원문:

```text
id=25298823-2c5e-4494-9f66-1df522650334 | slip_no=2026/08/01-7 | status=SENT | source_type=PARTNER_ORDER | source_id=6c1a168e-3687-4cfe-a64b-74ddfc5b9409 | idempotency_key=qa-991-live-3dbab0ac-8b92-4120-b465-d799e86ee076 | supply_sum=8727273.00 | vat_sum=872727.00 | total_sum=9600000.00
product=삼성 윈드프리 5평형 | quantity=4 | unit_price=681818.25 | unit_price_with_vat=750000.00 | supply_amount=2727273.00 | vat_amount=272727.00 | unit_price_domain=VAT_INCLUSIVE
product=삼성 윈드프리 11평형 | quantity=5 | unit_price=1200000.00 | unit_price_with_vat=1320000.00 | supply_amount=6000000.00 | vat_amount=600000.00 | unit_price_domain=VAT_INCLUSIVE
```

### VAT 제외 단가 — 실제 발행 및 동일 요청 재시도

```text
IDEMPOTENCY_KEY=qa-991-live-b31fb756-d191-49aa-96ff-bb205ca2eed2
=== VAT exclusive request 1 ===
HTTP 201
{"success":true,"code":"OK","message":"성공","data":{"slipId":"0f3d779d-1b97-4a9f-ad2e-30376b649ef3","slipNo":"2026/08/01-6","status":"SENT","sourceType":"PARTNER_ORDER","sourceId":"d178a0c9-1a3e-4945-90c2-0233449d6782","idempotencyKey":"qa-991-live-b31fb756-d191-49aa-96ff-bb205ca2eed2","idempotentReplay":false},"timestamp":"2026-07-31T20:19:49.919437501Z"}
=== VAT exclusive request 2 ===
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"slipId":"0f3d779d-1b97-4a9f-ad2e-30376b649ef3","slipNo":"2026/08/01-6","status":"SENT","sourceType":"PARTNER_ORDER","sourceId":"d178a0c9-1a3e-4945-90c2-0233449d6782","idempotencyKey":"qa-991-live-b31fb756-d191-49aa-96ff-bb205ca2eed2","idempotentReplay":true},"timestamp":"2026-07-31T20:19:49.929930192Z"}
```

DB 원문:

```text
id=0f3d779d-1b97-4a9f-ad2e-30376b649ef3 | slip_no=2026/08/01-6 | status=SENT | source_type=PARTNER_ORDER | source_id=d178a0c9-1a3e-4945-90c2-0233449d6782 | idempotency_key=qa-991-live-b31fb756-d191-49aa-96ff-bb205ca2eed2 | supply_sum=8181818.19 | vat_sum=818181.00 | total_sum=8999999.19
product=삼성 DVM-S 10HP | quantity=3 | unit_price=2727272.73 | unit_price_with_vat=3000000.00 | supply_amount=8181818.19 | vat_amount=818181.00 | unit_price_domain=SUPPLY
```

### 같은 키 + 실제 내용 변경

VAT 제외 요청의 `unitPriceExVat`만 `2727272.73`에서 `2727272.74`로 변경해 재요청했다.

```text
HTTP 409
{"success":false,"code":"CONFLICT","message":"동일 Idempotency-Key 로 다른 본문이 도착했습니다. 키를 새로 발급하세요. (slipNo=2026/08/01-6)","data":null,"timestamp":"2026-07-31T20:20:01.052140929Z"}
```

### 화면/조회 확인

실제 상세 조회 API는 두 전표 모두 `HTTP 200`으로 응답했고, VAT 포함 조회 데이터에 `unitPriceDomain=VAT_INCLUSIVE`, `unitPriceWithVat`, `supplyAmount`, `vatAmount`가 표시되었다. 예: `slipNo=2026/08/01-7`, `supplyAmount=2727273.00`, `vatAmount=272727.00`; 두 번째 라인은 `6000000.00`, `600000.00`.

조회 API 원문 시작:

```text
HTTP/1.1 200
{"success":true,"code":"OK","message":"성공","data":{"id":"25298823-2c5e-4494-9f66-1df522650334","slipNo":"2026/08/01-7","status":"SENT",...,"lines":[{"quantity":4,"unitPrice":681818.25,"lineTotal":2727273.00,"unitPriceWithVat":750000.00,"supplyAmount":2727273.00,"vatAmount":272727.00,"unitPriceDomain":"VAT_INCLUSIVE"},{"quantity":5,"unitPrice":1200000.00,"lineTotal":6000000.00,"unitPriceWithVat":1320000.00,"supplyAmount":6000000.00,"vatAmount":600000.00,"unitPriceDomain":"VAT_INCLUSIVE"}]}}
```

화면 스크린샷은 확인불가. 인앱 브라우저 연결을 시도했으나 사용 가능한 브라우저 목록이 `[]`였고, 따라서 합성 스크린샷을 만들지 않았다. 대신 실행 중 서비스의 상세 조회 HTTP 원문과 DB 원문을 증거로 남긴다.

## 판정

- 정상 재시도: PASS — VAT 포함/제외 모두 `201` 생성 후 같은 키·같은 본문에서 동일 전표의 `200`, `idempotentReplay=true`.
- 중복 전표 방지: PASS — 각 멱등 키당 DB 전표 행 1개.
- 다른 본문 거부: PASS — 같은 키로 금액 변경 시 `409 CONFLICT`.
- 금액 분리: PASS — 실제 DB 및 상세 조회에서 공급가액/VAT가 분리 저장·반환됨.
- 화면 캡처: 확인불가 — 브라우저 세션 자체가 없어 UI를 열지 못함.
