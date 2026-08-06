# PR #984 R4 라이브 QA 보고서

## 결론

**판정: DONE_WITH_CONCERNS — 제품 검증 범위는 PASS**

이번 라운드의 단일 각도인 “동명 병합 fix 배포 후, 기존에 404였던 순번코드 24개가 모두 조회되는가?”에 대해 다음을 확인했다.

- 배포 전 기준선: 24/24 HTTP 404
- fix 배포 및 1차 실임포트 후: 24/24 HTTP 200, 404 0건
- 1차 임포트 응답의 skippedGroupCount: **0**
- product_aliases의 대상 24개 코드: **24/24 존재**
- 병합 대상 12개 품목명: **각 1행**
- 2차 동일 임포트: HTTP 200, imported=0, 수치 및 병합 결과 불변

제품 결과에는 결함을 발견하지 못했다. 다만 이 PC의 headed Playwright Chromium 바이너리가 없어 캡처는 실제 launched/headless Chromium 렌더로 남겼다. 캡처는 합성 PNG가 아니며, 실제 Swagger UI가 실제 product-service 응답을 표시한 화면이다.

## 실행 범위와 불변 조건

- 대상 PR: #984
- 대상 브랜치: fix/ecount-import-model-code-merge
- 대상 커밋: b6e7b94484e08d02d8aa4dfc371ad8ce083e6612
- 작업 디렉터리: D:\dev\Samhan-Public\.claude\worktrees\w984-ecount
- 직접 호출 서비스: product-service, http://127.0.0.1:8084
- 조회 경로: POST /products/internal/lookup-by-code
- 임포트 경로: POST /admin/products/imports/ecount
- 기존 Compose 프로젝트: infrastructure
- 재배포 범위: product-service 하나만
- DB 조회: samhan-postgres, product_db
- 내부 토큰: 보고서에는 [REDACTED]로 표기
- 게이트웨이 :8080/admin/products/**는 선재 라우트 부재로 이번 실측 대상에서 제외했다.
- 코드 수정, git add/commit/push/checkout, 핸드오프 파일 수정은 하지 않았다.

## 배포본 증명 — 임포트보다 먼저 수행

소스 커밋 → 호스트 JAR SHA-256 → 실행 컨테이너 /app/app.jar SHA-256을 한 실행에서 대조했다.

~~~text
=== R4 DEPLOYMENT PROOF SINGLE EXECUTION ===
timestamp_start=2026-07-30T13:02:07.0777250+09:00
repo=D:\dev\Samhan-Public\.claude\worktrees\w984-ecount
branch=fix/ecount-import-model-code-merge
source_commit=b6e7b94484e08d02d8aa4dfc371ad8ce083e6612
git_status=clean
gradle_user_home=D:\dev\Samhan-Public\.gradle-t21
build_command=.\gradlew.bat :services:product-service:bootJar --rerun-tasks --no-build-cache --no-daemon
BUILD SUCCESSFUL in 24s
host_jar=...\services\product-service\build\libs\product-service.jar
host_jar_bytes=94487675
host_jar_sha256=303a2fc019375e3c6b5f564a5c91dd2c4e8b03a20fc6ede4009eeb23f4d5551c
compose_project=infrastructure
compose_files=infrastructure/docker-compose.yml + infrastructure/docker-compose.local-all.yml
build_command=docker compose -p infrastructure -f docker-compose.yml -f docker-compose.local-all.yml build --no-cache product-service
image infrastructure-product-service Built
up_command=docker compose -p infrastructure -f docker-compose.yml -f docker-compose.local-all.yml up -d --no-deps product-service
health_poll=starting state=running
health_poll=starting state=running
health_poll=healthy state=running
container_id=88a1a4f0cbd27810c32eb74a5e91d1b39e4c611cf1a4ab8c4258506e274b2395
container_created=2026-07-30T04:02:56.485756851Z
container_started=2026-07-30T04:03:01.167664293Z
container_image=infrastructure-product-service
container_image_id=sha256:f3bbe008946aefaaec3c360c3258d75a292086653281c31258e995cd7cf8bc15
container_jar_sha256=303a2fc019375e3c6b5f564a5c91dd2c4e8b03a20fc6ede4009eeb23f4d5551c
jar_sha256_match=True
compose_project_label=infrastructure
compose_service_label=product-service
health=healthy
timestamp_end=2026-07-30T13:03:21.2390117+09:00
~~~

위 실행으로 기존 컨테이너를 product-service만 재생성했고, 새 실행 컨테이너의 JAR 해시가 해당 커밋에서 생성한 호스트 JAR와 일치함을 확인했다.

## ① 배포 전 기준선 — 현재 배포본에서 24개 404

fix 배포 전에 존재하던 컨테이너에서 수행한 단일 실행이다.

~~~text
=== R4 BASELINE SINGLE EXECUTION ===
timestamp=2026-07-30T13:00:39.9698533+09:00
container_id=9c442e79477973f52c00674a89dd6197529e4827ac5f037ceaae4d9c386a75ef
container_image=infrastructure-product-service
image_id=sha256:44d94868dc02463cec4d2d021f27a343807eca842ed216e9011c2882705d146c
health=healthy
endpoint=http://127.0.0.1:8084/products/internal/lookup-by-code
token_header=X-Internal-Token: [REDACTED]
request_body_template={"productCode":"<code>"}
00131 HTTP 404
SAR-00006 HTTP 404
AAAA-00004 HTTP 404
AAAA-00005 HTTP 404
AAAA-00006 HTTP 404
AAAA-00007 HTTP 404
AAAA-00008 HTTP 404
ZENG-00009 HTTP 404
AAAA-00009 HTTP 404
ZENG-00011 HTTP 404
AAAA-00010 HTTP 404
ZENG-00010 HTTP 404
AAAA-00011 HTTP 404
ZENG-00008 HTTP 404
AAAA-00021 HTTP 404
ZENG-00016 HTTP 404
AAAA-00022 HTTP 404
AAAA-00023 HTTP 404
AAAA-00034 HTTP 404
ZENG-00017 HTTP 404
AAAA-00037 HTTP 404
AAAA-00038 HTTP 404
ZENG-00012 HTTP 404
ZENG-00019 HTTP 404
representative_body={"success":false,"code":"NOT_FOUND","message":"품목코드에 해당하는 제품이 없습니다","data":null,...}
summary=200:0,404:24,total:24
~~~

## ② 재배포 후 실 파일 3종 임포트

워크트리 raw 디렉터리는 .gitkeep만 있어 메인 트리의 원본을 임시 복사했다. 임포트 후 임시 복사본 3개는 삭제했으며 최종 raw 디렉터리에는 .gitkeep만 남겼다.

| 파일 | 원본 크기 | 원본 SHA-256 | 복사본 크기 | 복사본 SHA-256 | 대조 |
|---|---:|---|---:|---|---|
| 품목-Excel다운로드.csv | 313221 | 02785a731fcc502d8828ada534df103dc79bfdbb67d84a7142825aa323ce083c | 313221 | 02785a731fcc502d8828ada534df103dc79bfdbb67d84a7142825aa323ce083c | 일치 |
| 품목관계-Excel다운로드.csv | 15632 | 00a1964df081fedb1e1af270ed0110345e1f856531eb630210f6e5ba7867de85 | 15632 | 00a1964df081fedb1e1af270ed0110345e1f856531eb630210f6e5ba7867de85 | 일치 |
| 품목계층그룹-Excel다운로드.csv | 4710 | 4955f2999017f37511af3ade552113fa30c0628b081d6b992f7d171a7cc1eb7e | 4710 | 4955f2999017f37511af3ade552113fa30c0628b081d6b992f7d171a7cc1eb7e | 일치 |

### 1차 임포트 실행 원문

~~~text
=== R4 IMPORT #1 INPUT + HTTP SINGLE EXECUTION ===
timestamp=2026-07-30T13:04:15.7926726+09:00
source_root=D:\dev\Samhan-Public\docs\migration\ecount-data\raw
destination_root=D:\dev\Samhan-Public\.claude\worktrees\w984-ecount\docs\migration\ecount-data\raw
file=품목-Excel다운로드.csv
source_bytes=313221
source_sha256=02785a731fcc502d8828ada534df103dc79bfdbb67d84a7142825aa323ce083c
copy_bytes=313221
copy_sha256=02785a731fcc502d8828ada534df103dc79bfdbb67d84a7142825aa323ce083c
sha256_match=True
file=품목관계-Excel다운로드.csv
source_bytes=15632
source_sha256=00a1964df081fedb1e1af270ed0110345e1f856531eb630210f6e5ba7867de85
copy_bytes=15632
copy_sha256=00a1964df081fedb1e1af270ed0110345e1f856531eb630210f6e5ba7867de85
sha256_match=True
file=품목계층그룹-Excel다운로드.csv
source_bytes=4710
source_sha256=4955f2999017f37511af3ade552113fa30c0628b081d6b992f7d171a7cc1eb7e
copy_bytes=4710
copy_sha256=4955f2999017f37511af3ade552113fa30c0628b081d6b992f7d171a7cc1eb7e
sha256_match=True
container_mount=/workspace/docs/migration/ecount-data/raw (bind: worktree destination, read-only)
endpoint=http://127.0.0.1:8084/admin/products/imports/ecount
headers=X-Is-System-Master: true; X-User-Id: [REDACTED]; X-User-Role: MASTER
multipart=itemFile,relationFile,groupFile
--- RESPONSE ORIGINAL ---
{"totalRows":2836,"imported":12,"updated":2655,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2835,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":2836,"reason":"REJECT_NAME_NULL","rawCode":"2026/05/19  오후 2:41:09","rawName":""}],"skippedGroupCount":0,"skippedGroups":[]}
HTTP_STATUS=200
timestamp_end=2026-07-30T13:04:23.5475592+09:00
~~~

skippedGroupCount=0이며 skippedGroups=[]이다. 유일한 거부 행은 이름이 빈 마지막 행 1건(REJECT_NAME_NULL)이다.

## ③ 1차 임포트 후 DB 실측

docker exec stdin heredoc을 사용하지 않고 psql -c로 다음 SQL을 실행했다.

~~~sql
SELECT 'products_active' AS metric, count(*) FROM products WHERE deleted_at IS NULL;
SELECT 'products_with_product_code' AS metric, count(*) FROM products WHERE deleted_at IS NULL AND product_code IS NOT NULL AND product_code <> '';
SELECT 'product_aliases_active' AS metric, count(*) FROM product_aliases WHERE deleted_at IS NULL;
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 4;
SELECT alias_code FROM product_aliases WHERE deleted_at IS NULL AND alias_code IN ('00131','SAR-00006','AAAA-00004','AAAA-00005','AAAA-00006','AAAA-00007','AAAA-00008','ZENG-00009','AAAA-00009','ZENG-00011','AAAA-00010','ZENG-00010','AAAA-00011','ZENG-00008','AAAA-00021','ZENG-00016','AAAA-00022','AAAA-00023','AAAA-00034','ZENG-00017','AAAA-00037','AAAA-00038','ZENG-00012','ZENG-00019') ORDER BY alias_code;
SELECT name, count(*) FROM products WHERE deleted_at IS NULL AND name IN ('AR-EH03','삼성추가배관(벽걸이)','삼성추가배관(스탠드)','바람막이','배수펌프','천공','유니온','사다리차','고소작업차(스카이)','실외기받침대','삼성 추가배관','추가배관(벽걸이)') GROUP BY name ORDER BY name;
~~~

~~~text
=== R4 DB POST-IMPORT #1 SINGLE EXECUTION ===
timestamp=2026-07-30T13:05:02.7920159+09:00
command=docker exec samhan-postgres psql -U samhan -d product_db -c <SQL>
--- SQL OUTPUT ORIGINAL ---
products_active | 3061
products_with_product_code | 2667
product_aliases_active | 2835
flyway_schema_history:
28 | add product lineage | t
27 | allow skipped main candidate status | t
26 | align price change schedule to live gas | t
25 | product sheet sync generation | t
alias_code rows (24):
00131
AAAA-00004
AAAA-00005
AAAA-00006
AAAA-00007
AAAA-00008
AAAA-00009
AAAA-00010
AAAA-00011
AAAA-00021
AAAA-00022
AAAA-00023
AAAA-00034
AAAA-00037
AAAA-00038
SAR-00006
ZENG-00008
ZENG-00009
ZENG-00010
ZENG-00011
ZENG-00012
ZENG-00016
ZENG-00017
ZENG-00019
group rows (12, each count=1):
AR-EH03 | 1
고소작업차(스카이) | 1
바람막이 | 1
배수펌프 | 1
사다리차 | 1
삼성 추가배관 | 1
삼성추가배관(벽걸이) | 1
삼성추가배관(스탠드) | 1
실외기받침대 | 1
유니온 | 1
천공 | 1
추가배관(벽걸이) | 1
timestamp_end=2026-07-30T13:05:03.3998159+09:00
~~~

## ④ 임포트 후 lookup-by-code 24개 재요청

다음은 1차 임포트 후 동일 컨테이너에서 수행한 단일 실행 원문이다. UUID는 사용자 비공개 불변식에 따라 보고서에서 제외했으며, 서버가 반환한 성공 여부·품목명·canonical 코드 필드는 그대로 남겼다.

~~~text
=== R4 POST-IMPORT LOOKUP #1 AUTHORITATIVE RAW SINGLE EXECUTION (UUID-MASKED) ===
timestamp=2026-07-30T13:19:04.2413362+09:00
container_id=88a1a4f0cbd2
container_image=infrastructure-product-service
endpoint=http://127.0.0.1:8084/products/internal/lookup-by-code
token_header=X-Internal-Token: [REDACTED]
request_body_template={"productCode":"<code>"}
00131 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"AR-EH03","modelName":"00131","productCode":"00131"}
SAR-00006 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"AR-EH03","modelName":"00131","productCode":"00131"}
AAAA-00004 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"삼성추가배관(벽걸이)","modelName":"AAAA-00004","productCode":"AAAA-00004"}
AAAA-00005 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"삼성추가배관(벽걸이)","modelName":"AAAA-00004","productCode":"AAAA-00004"}
AAAA-00006 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"삼성추가배관(스탠드)","modelName":"AAAA-00006","productCode":"AAAA-00006"}
AAAA-00007 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"삼성추가배관(스탠드)","modelName":"AAAA-00006","productCode":"AAAA-00006"}
AAAA-00008 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"바람막이","modelName":"AAAA-00008","productCode":"AAAA-00008"}
ZENG-00009 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"바람막이","modelName":"AAAA-00008","productCode":"AAAA-00008"}
AAAA-00009 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"배수펌프","modelName":"AAAA-00009","productCode":"AAAA-00009"}
ZENG-00011 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"배수펌프","modelName":"AAAA-00009","productCode":"AAAA-00009"}
AAAA-00010 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"천공","modelName":"AAAA-00010","productCode":"AAAA-00010"}
ZENG-00010 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"천공","modelName":"AAAA-00010","productCode":"AAAA-00010"}
AAAA-00011 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"유니온","modelName":"AAAA-00011","productCode":"AAAA-00011"}
ZENG-00008 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"유니온","modelName":"AAAA-00011","productCode":"AAAA-00011"}
AAAA-00021 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"사다리차","modelName":"AAAA-00021","productCode":"AAAA-00021"}
ZENG-00016 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"사다리차","modelName":"AAAA-00021","productCode":"AAAA-00021"}
AAAA-00022 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"고소작업차(스카이)","modelName":"AAAA-00022","productCode":"AAAA-00022"}
AAAA-00023 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"고소작업차(스카이)","modelName":"AAAA-00022","productCode":"AAAA-00022"}
AAAA-00034 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"실외기받침대","modelName":"AAAA-00034","productCode":"AAAA-00034"}
ZENG-00017 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"실외기받침대","modelName":"AAAA-00034","productCode":"AAAA-00034"}
AAAA-00037 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"삼성 추가배관","modelName":"AAAA-00037","productCode":"AAAA-00037"}
AAAA-00038 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"삼성 추가배관","modelName":"AAAA-00037","productCode":"AAAA-00037"}
ZENG-00012 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"추가배관(벽걸이)","modelName":"ZENG-00012","productCode":"ZENG-00012"}
ZENG-00019 HTTP 200 body={"success":true,"code":"OK","message":"성공","name":"추가배관(벽걸이)","modelName":"ZENG-00012","productCode":"ZENG-00012"}
summary=200:24,404:0,other:0,total:24
timestamp_end=2026-07-30T13:19:05.4694666+09:00
~~~

## ⑤ skippedGroupCount=0 및 임포트 응답 전체 원문

위 1차 임포트 응답 전체 원문은 다음과 같다. HTTP 200만으로 통과 처리하지 않고 이 값을 별도로 확인했다.

~~~json
{"totalRows":2836,"imported":12,"updated":2655,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2835,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":2836,"reason":"REJECT_NAME_NULL","rawCode":"2026/05/19  오후 2:41:09","rawName":""}],"skippedGroupCount":0,"skippedGroups":[]}
~~~

## ⑥ 멱등성 — 동일 파일 2차 임포트

~~~text
=== R4 IMPORT #2 IDEMPOTENCY SINGLE EXECUTION ===
timestamp=2026-07-30T13:07:32.5973475+09:00
container_id=88a1a4f0cbd27810c32eb74a5e91d1b39e4c611cf1a4ab8c4258506e274b2395
image=infrastructure-product-service
file=품목-Excel다운로드.csv bytes=313221 sha256=02785a731fcc502d8828ada534df103dc79bfdbb67d84a7142825aa323ce083c
file=품목관계-Excel다운로드.csv bytes=15632 sha256=00a1964df081fedb1e1af270ed0110345e1f856531eb630210f6e5ba7867de85
file=품목계층그룹-Excel다운로드.csv bytes=4710 sha256=4955f2999017f37511af3ade552113fa30c0628b081d6b992f7d171a7cc1eb7e
endpoint=http://127.0.0.1:8084/admin/products/imports/ecount
headers=X-Is-System-Master: true; X-User-Id: [REDACTED]; X-User-Role: MASTER
--- RESPONSE ORIGINAL ---
{"totalRows":2836,"imported":0,"updated":2667,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2835,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":2836,"reason":"REJECT_NAME_NULL","rawCode":"2026/05/19  오후 2:41:09","rawName":""}],"skippedGroupCount":0,"skippedGroups":[]}
HTTP_STATUS=200
timestamp_end=2026-07-30T13:07:39.5057932+09:00
~~~

~~~text
=== R4 DB POST-IMPORT #2 IDEMPOTENCY SINGLE EXECUTION ===
timestamp=2026-07-30T13:07:52.9589720+09:00
command=docker exec samhan-postgres psql -U samhan -d product_db -c <SQL>
--- SQL OUTPUT ORIGINAL ---
products_active | 3061
products_with_product_code | 2667
product_aliases_active | 2835
flyway_schema_history:
28 | add product lineage | t
27 | allow skipped main candidate status | t
26 | align price change schedule to live gas | t
25 | product sheet sync generation | t
alias_code rows (24): 00131, AAAA-00004, AAAA-00005, AAAA-00006, AAAA-00007, AAAA-00008, AAAA-00009, AAAA-00010, AAAA-00011, AAAA-00021, AAAA-00022, AAAA-00023, AAAA-00034, AAAA-00037, AAAA-00038, SAR-00006, ZENG-00008, ZENG-00009, ZENG-00010, ZENG-00011, ZENG-00012, ZENG-00016, ZENG-00017, ZENG-00019
group rows (12, each count=1): AR-EH03 | 1; 고소작업차(스카이) | 1; 바람막이 | 1; 배수펌프 | 1; 사다리차 | 1; 삼성 추가배관 | 1; 삼성추가배관(벽걸이) | 1; 삼성추가배관(스탠드) | 1; 실외기받침대 | 1; 유니온 | 1; 천공 | 1; 추가배관(벽걸이) | 1
timestamp_end=2026-07-30T13:07:53.4517774+09:00
~~~

| 지표 | 1차 | 2차 | 대조 |
|---|---:|---:|---|
| HTTP 상태 | 200 | 200 | 동일 |
| imported | 12 | 0 | 재생성 없음 |
| updated | 2655 | 2667 | 동일 데이터 재조정 |
| aliasImported | 2835 | 2835 | 동일 |
| skippedGroupCount | 0 | 0 | 동일 |
| 활성 products | 3061 | 3061 | 불변 |
| product code 보유 products | 2667 | 2667 | 불변 |
| 활성 product_aliases | 2835 | 2835 | 불변 |
| 대상 alias 수 | 24 | 24 | 불변 |
| 병합 대상 품목명 행 수 | 12개 모두 1 | 12개 모두 1 | 불변 |

## 24개 코드 전후 대조표

| 순번코드 | fix 전 | fix 후 | 조회된 canonical 코드 | 품목명 |
|---|---:|---:|---|---|
| 00131 | 404 | 200 | 00131 | AR-EH03 |
| SAR-00006 | 404 | 200 | 00131 | AR-EH03 |
| AAAA-00004 | 404 | 200 | AAAA-00004 | 삼성추가배관(벽걸이) |
| AAAA-00005 | 404 | 200 | AAAA-00004 | 삼성추가배관(벽걸이) |
| AAAA-00006 | 404 | 200 | AAAA-00006 | 삼성추가배관(스탠드) |
| AAAA-00007 | 404 | 200 | AAAA-00006 | 삼성추가배관(스탠드) |
| AAAA-00008 | 404 | 200 | AAAA-00008 | 바람막이 |
| ZENG-00009 | 404 | 200 | AAAA-00008 | 바람막이 |
| AAAA-00009 | 404 | 200 | AAAA-00009 | 배수펌프 |
| ZENG-00011 | 404 | 200 | AAAA-00009 | 배수펌프 |
| AAAA-00010 | 404 | 200 | AAAA-00010 | 천공 |
| ZENG-00010 | 404 | 200 | AAAA-00010 | 천공 |
| AAAA-00011 | 404 | 200 | AAAA-00011 | 유니온 |
| ZENG-00008 | 404 | 200 | AAAA-00011 | 유니온 |
| AAAA-00021 | 404 | 200 | AAAA-00021 | 사다리차 |
| ZENG-00016 | 404 | 200 | AAAA-00021 | 사다리차 |
| AAAA-00022 | 404 | 200 | AAAA-00022 | 고소작업차(스카이) |
| AAAA-00023 | 404 | 200 | AAAA-00022 | 고소작업차(스카이) |
| AAAA-00034 | 404 | 200 | AAAA-00034 | 실외기받침대 |
| ZENG-00017 | 404 | 200 | AAAA-00034 | 실외기받침대 |
| AAAA-00037 | 404 | 200 | AAAA-00037 | 삼성 추가배관 |
| AAAA-00038 | 404 | 200 | AAAA-00037 | 삼성 추가배관 |
| ZENG-00012 | 404 | 200 | ZENG-00012 | 추가배관(벽걸이) |
| ZENG-00019 | 404 | 200 | ZENG-00012 | 추가배관(벽걸이) |

결과: **24/24가 404에서 200으로 전환되었고, 누락 코드는 없다.**

## 스크린샷

실제 product-service Swagger UI를 브라우저로 열어 캡처했다.

- screenshots/r4-swagger-lookup-response.png: 실제 lookup-by-code 요청의 HTTP 200 및 AR-EH03 응답 화면
- screenshots/r4-swagger-import-endpoint.png: 실제 Ecount 3-file multipart 임포트 endpoint와 itemFile, relationFile, groupFile 입력 화면

headed 실행 시도는 다음 환경 오류로 열리지 않았다.

~~~text
Executable doesn't exist at C:\Users\ewoo2\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe
~~~

따라서 위 두 파일은 launched/headless Chromium이 실제 서버 화면을 렌더링한 캡처다. mock PNG, 합성 이미지, 이미지 편집은 사용하지 않았다.

## 신규 생성 파일 전체 목록

이번 라운드에서 새로 만든 파일은 다음 3개다. 임시 CSV 3개는 생성 후 임포트에 사용하고 삭제했으므로 신규 산출물 목록에 포함하지 않는다.

1. docs/qa/984-ecount-import-live/R4-REPORT.md
2. docs/qa/984-ecount-import-live/screenshots/r4-swagger-lookup-response.png
3. docs/qa/984-ecount-import-live/screenshots/r4-swagger-import-endpoint.png

최종 raw 디렉터리 상태: .gitkeep만 존재. 대상 브랜치의 코드와 핸드오프 파일은 변경하지 않았다.

