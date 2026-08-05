# PR #984 R4 ProductLineage 실서버 검증 보고서

## 판정

R4 소스가 포함된 product-service 이미지를 stale JAR 캐시를 제거한 뒤 재빌드·기동했고, 실 product_db에서 V28 적용을 확인했다. 실제 raw 3종으로 연속 2회 HTTP 임포트를 실행했다. 1회차·2회차 뒤 각각 726건 snapshot을 만들고 FULL OUTER JOIN으로 전수 대조한 결과는 **name diff 0건, category_id diff 0건**이다.

15:09의 최초 호출은 당시 컨테이너 JAR에 R4 심볼이 없었던 stale 이미지 호출로 확인되어 검증 회차에서 제외했다. stale 호출은 422 원문을 보존했고, R4 심볼이 확인된 재기동 이후의 15:15 호출 2회를 유효한 연속 검증으로 집계했다.

## 1. 재빌드·검증 시각과 V28 적용

- JAR 소스 빌드: 2026-07-29 14:56:04 +09:00 ~ 2026-07-29 14:56:31 +09:00, 성공
- 의존 서비스 JAR 보강 빌드: 2026-07-29 14:57:07 +09:00 ~ 2026-07-29 14:57:25 +09:00, 성공
- product-service 이미지 재빌드 및 기동: 2026-07-29 14:57:33 +09:00 ~ 2026-07-29 14:58:52 +09:00, 성공
- V28/health 검증 실행: 2026-07-29 14:59:03 +09:00부터 실행
- product-service healthy 전환 확인: 2026-07-29 14:59:26 +09:00
- raw 원본 존재 확인: 2026-07-29 15:02:11 +09:00
- stale JAR no-cache product-service 재빌드: 2026-07-29 15:13:34 +09:00 ~ 2026-07-29 15:13:49 +09:00, 성공
- stale JAR 제거 후 요구 Compose 재빌드·기동: 2026-07-29 15:13:55 +09:00 ~ 2026-07-29 15:14:48 +09:00, 성공
- R4 심볼 포함 확인: 2026-07-29 15:14:59 +09:00 health starting, 15:15:04 +09:00 healthy
- 유효 1회차 임포트: 2026-07-29 15:15:18 +09:00 ~ 15:15:25 +09:00
- 1회차 snapshot: 2026-07-29 15:15:43 +09:00
- 유효 2회차 임포트: 2026-07-29 15:15:53 +09:00 ~ 15:15:59 +09:00
- 2회차 snapshot·전수 diff: 2026-07-29 15:16:13 +09:00
- 보고서 저장 확인: 2026-07-29 15:23:09 +09:00

V28은 product_db.flyway_schema_history에서 success=t, installed_on=2026-07-29 14:58:59.272083으로 확인했다. products.lineage는 character varying, NOT NULL, 기본값 MANUAL이었다.

현재 product-service 컨테이너는 healthy 상태다.

## 2. 병합 대상 726건 전수 확인

현재 실 DB에서 다음 조건으로 전수 대상 수를 세었다.

- 활성 products
- products.lineage = 'SHEET'
- products.model_name이 활성 ECOUNT 품목의 products.product_code와 일치

쿼리 결과는 **726건**이다. 각 행의 name과 category_id가 존재하는 것도 함께 확인했다.

### 연속 2회 임포트 결과

| 항목 | 결과 |
|---|---:|
| 1회차 임포트 | HTTP 200, totalRows=2836, updated=2655 |
| 1회차 후 snapshot | 726건 |
| 2회차 임포트 | HTTP 200, totalRows=2836, updated=2655 |
| 2회차 후 snapshot | 726건 |
| 726건 name diff | **0건** |
| 726건 category_id diff | **0건** |

## 3. 실행 명령과 출력 원문

### 3.1 최초 Compose 시도 — overlay 단독 실패

명령:

~~~powershell
Set-Location D:\dev\Samhan-Public\.claude\worktrees\t9-984\infrastructure
docker compose -f docker-compose.local-all.yml up -d --build product-service
~~~

출력 원문:

~~~text
REBUILD_STARTED_AT=2026-07-29 14:55:21 +09:00
REBUILD_FINISHED_AT=2026-07-29 14:55:22 +09:00
REBUILD_EXIT_CODE=1
service "product-service" refers to undefined network samhan-net: invalid compose project
~~~

### 3.2 product-service JAR 빌드

명령:

~~~powershell
Set-Location D:\dev\Samhan-Public\.claude\worktrees\t9-984
.\gradlew.bat :services:product-service:bootJar --no-daemon
~~~

출력 원문:

~~~text
JAR_BUILD_STARTED_AT=2026-07-29 14:56:04 +09:00
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:realtime-abstraction:processResources
> Task :shared:security:compileJava FROM-CACHE
> Task :shared:security:processResources
> Task :shared:common:compileJava FROM-CACHE
> Task :shared:security:classes
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :services:product-service:processResources
> Task :shared:common:jar
> Task :shared:security:jar
> Task :shared:realtime-abstraction:compileJava FROM-CACHE
> Task :shared:realtime-abstraction:classes
> Task :shared:realtime-abstraction:jar

> Task :services:product-service:compileJava

> Task :services:product-service:classes
> Task :services:product-service:resolveMainClassName
> Task :services:product-service:bootJar

BUILD SUCCESSFUL in 26s
12 actionable tasks: 9 executed, 3 from cache
JAR_BUILD_FINISHED_AT=2026-07-29 14:56:31 +09:00
JAR_BUILD_EXIT_CODE=0

Note: D:\dev\Samhan-Public\.claude\worktrees\t9-984\services\product-service\src\main\java\com\samhanair\logis\product\web\EstimateCatalogInternalController.java uses or overrides a deprecated API.
Note: Recompile with -Xlint:deprecation for details.
~~~

### 3.3 base+overlay Compose 재빌드

명령:

~~~powershell
Set-Location D:\dev\Samhan-Public\.claude\worktrees\t9-984
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build product-service
~~~

최초 출력 원문 중 실패:

~~~text
REBUILD_STARTED_AT=2026-07-29 14:56:37 +09:00
#10 [api-gateway 4/4] COPY --chown=app:app services/api-gateway/build/libs/api-gateway.jar /app/app.jar
#10 ERROR: failed to calculate checksum of ref om1578kwn6drha365gnangdol::bmxhiyckjz57c9ps7k4f03s1q: "/services/api-gateway/build/libs/api-gateway.jar": not found
#13 [eureka-server 4/4] COPY --chown=app:app services/eureka-server/build/libs/eureka-server.jar /app/app.jar
#13 ERROR: failed to calculate checksum of ref om1578kwn6drha365gnangdol::s2b0mv3je9vhk057ebr9sdqod: "/services/eureka-server/build/libs/eureka-server.jar": not found
REBUILD_FINISHED_AT=2026-07-29 14:56:51 +09:00
REBUILD_EXIT_CODE=1
target api-gateway: failed to solve: failed to compute cache key: failed to calculate checksum of ref om1578kwn6drha365gnangdol::bmxhiyckjz57c9ps7k4f03s1q: "/services/api-gateway/build/libs/api-gateway.jar": not found
~~~

의존 JAR 보강 명령:

~~~powershell
.\gradlew.bat :services:eureka-server:bootJar :services:api-gateway:bootJar :services:product-service:bootJar --no-daemon
~~~

출력 원문:

~~~text
DEPENDENCY_JAR_BUILD_STARTED_AT=2026-07-29 14:57:07 +09:00
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:product-service:processResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :services:api-gateway:processResources
> Task :services:eureka-server:compileJava FROM-CACHE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:eureka-server:processResources
> Task :services:eureka-server:classes
> Task :services:api-gateway:compileJava FROM-CACHE
> Task :services:api-gateway:classes
> Task :services:eureka-server:resolveMainClassName
> Task :services:api-gateway:resolveMainClassName
> Task :services:product-service:compileJava UP-TO-DATE
> Task :services:product-service:classes UP-TO-DATE
> Task :services:product-service:resolveMainClassName UP-TO-DATE
> Task :services:product-service:bootJar UP-TO-DATE
> Task :services:eureka-server:bootJar
> Task :services:api-gateway:bootJar

BUILD SUCCESSFUL in 16s
20 actionable tasks: 6 executed, 2 from cache
DEPENDENCY_JAR_BUILD_FINISHED_AT=2026-07-29 14:57:25 +09:00
DEPENDENCY_JAR_BUILD_EXIT_CODE=0
~~~

성공 재빌드의 주요 원문:

~~~text
REBUILD_STARTED_AT=2026-07-29 14:57:33 +09:00
#17 [product-service 4/4] COPY --chown=app:app services/product-service/build/libs/product-service.jar /app/app.jar
#17 DONE 1.1s
#20 [product-service] exporting to image
#20 exporting layers 3.8s done
#20 exporting manifest sha256:b31c4f272bfbf154176a022b94de336b4c695c3cafe24aa3d108f4348660d828 0.0s done
#20 exporting config sha256:1b5a837c817f69ac8d47c46efecee7c2432704ad15c2b40174ec4e5750c5dda0 0.0s done
#20 exporting attestation manifest sha256:2f49e32d111d8998f59470f8c0c80311b239919e2644bfd769264de3459711f0 0.0s done
#20 exporting manifest list sha256:8da94f1dd29da15a53384be9bd4d2d52e944ac237a7cbdab979fe84e46a68f47 0.0s done
#20 naming to docker.io/library/infrastructure-product-service:latest done
#20 unpacking to docker.io/library/infrastructure-product-service:latest 0.8s done
#20 DONE 4.8s
REBUILD_FINISHED_AT=2026-07-29 14:58:52 +09:00
REBUILD_EXIT_CODE=0
 Image infrastructure-product-service Building 
 Image infrastructure-api-gateway Building 
 Image infrastructure-eureka-server Building 
 Image infrastructure-api-gateway Built 
 Image infrastructure-product-service Built 
 Image infrastructure-eureka-server Built 
 Container samhan-rabbitmq Running 
 Container samhan-redis Running 
 Container samhan-postgres Recreate 
 Container samhan-postgres Recreated 
 Container samhan-eureka Recreate 
 Container samhan-eureka Recreated 
 Container samhan-api-gateway Recreate 
 Container samhan-api-gateway Recreated 
 Container samhan-product-service Recreate 
 Container samhan-product-service Recreated 
 Container samhan-postgres Starting 
 Container samhan-postgres Started 
 Container samhan-postgres Waiting 
 Container samhan-redis Waiting 
 Container samhan-redis Healthy 
 Container samhan-postgres Healthy 
 Container samhan-eureka Starting 
 Container samhan-eureka Started 
 Container samhan-eureka Waiting 
 Container samhan-eureka Healthy 
 Container samhan-api-gateway Starting 
 Container samhan-api-gateway Started 
 Container samhan-api-gateway Waiting 
 Container samhan-product-service Starting 
 Container samhan-product-service Started 
~~~

### 3.4 V28 적용 확인

명령:

~~~powershell
docker exec samhan-postgres psql -U samhan -d product_db -P pager=off -c "SELECT version, description, installed_on, success FROM flyway_schema_history WHERE version IN ('27','28') ORDER BY installed_rank;"
docker exec samhan-postgres psql -U samhan -d product_db -P pager=off -c "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='products' AND column_name='lineage';"
~~~

출력 원문:

~~~text
 version |             description             |        installed_on        | success 
---------+-------------------------------------+----------------------------+---------
 27      | allow skipped main candidate status | 2026-07-29 11:09:20.142283 | t
 28      | add product lineage                 | 2026-07-29 14:58:59.272083 | t
(2 rows)

 column_name |     data_type     | is_nullable |       column_default       
-------------+-------------------+-------------+-----------------------------
 lineage     | character varying | NO          | 'MANUAL'::character varying
(1 row)
~~~

### 3.5 health 확인

명령:

~~~powershell
$deadline=(Get-Date).AddMinutes(3); do { $c=(docker inspect -f '{{.State.Health.Status}}' samhan-product-service 2>$null); Write-Output ((Get-Date -Format 'HH:mm:ss') + ' health=' + $c); if ($c -eq 'healthy') { break }; Start-Sleep -Seconds 5 } while ((Get-Date) -lt $deadline)
~~~

출력 원문:

~~~text
14:59:26 health=healthy
~~~

### 3.6 현재 726건 대상 수 확인

명령:

~~~powershell
docker exec samhan-postgres psql -U samhan -d product_db -P pager=off -c "SELECT COUNT(*) AS merge_targets, COUNT(*) FILTER (WHERE p.name IS NOT NULL) AS with_name, COUNT(*) FILTER (WHERE p.category_id IS NOT NULL) AS with_category FROM products p WHERE p.model_name IS NOT NULL AND p.product_code IS NOT NULL AND p.model_name = p.product_code AND p.lineage='SHEET' AND NOT p.is_deleted;"
docker exec samhan-postgres psql -U samhan -d product_db -P pager=off -c "SELECT COUNT(*) AS exact_model_lineage_targets FROM products p WHERE p.lineage='SHEET' AND NOT p.is_deleted AND EXISTS (SELECT 1 FROM products e WHERE e.product_code=p.model_name AND e.is_deleted=FALSE);"
~~~

출력 원문:

~~~text
 merge_targets | with_name | with_category 
---------------+-----------+---------------
           726 |       726 |           726
(1 row)

 exact_model_lineage_targets 
-----------------------------
                         726
(1 row)
~~~

### 3.7 복구 전 실 원본 파일 존재 확인

> **[EVIDENCE-1 정정, 2026-07-30]** 이 절의 원문 출력은 host/container raw 디렉터리에
> `.gitkeep`만 있었음을 보여준다. 따라서 이 출력만으로는 raw 3개 파일의 존재·내용·사용을
> 증명할 수 없다. 아래의 “위 3개 raw 파일을 읽기 전용으로 사용했다” 문장은 이 출력에
> 대한 설명으로는 부정확하며, `6.1`/`6.3`의 multipart 경로 전달 및 동일 hash 응답이
> 별도로 기록되어 있다는 사실과 `3.7`의 파일 존재 확인을 혼동한 것이다. 이 문서는
> `3.7` 출력을 raw 3개 파일의 독립 증거로 사용하지 않는다.

명령:

~~~powershell
Get-ChildItem docs\migration\ecount-data\raw -Force
docker exec samhan-product-service sh -c 'ls -la /workspace/docs/migration/ecount-data/raw; find /workspace/docs/migration/ecount-data/raw -maxdepth 1 -type f -print'
~~~

출력 원문:

~~~text
RAW_CHECK_AT=2026-07-29 15:02:11 +09:00
--- host raw ---

total 4
drwxrwxrwx 1 root root 4096 Jul 29 14:49 .
drwxr-xr-x 3 root root 4096 Jul 29 15:00 ..
-rwxrwxrwx 1 root root  201 Jul 29 14:49 .gitkeep
/workspace/docs/migration/ecount-data/raw/.gitkeep
Name     Length LastWriteTime        
----     ------ -------------        
.gitkeep    201 2026-07-29 오후 2:49:36
--- container raw ---
~~~

**[원문 보존, 위 정정의 대상]** 위 3개 raw 파일을 읽기 전용으로 사용했다. 파일 자체는 수정·삭제하지 않았다. 1회차·2회차 HTTP 응답의 sourceFileHash는 동일한 실 raw 품목 파일 hash인 02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C였다.

## 4. 이 라운드가 보지 않은 것

- 임포트에서 `updated=726`인지는 보지 않았다. 실제 응답은 전체 ECOUNT rows 기준 `updated=2655`였다.
- 12개 `SKIPPED_MAIN_CANDIDATE` 그룹의 원인 해결 여부
- 임포트 후 product_code, 가격, alias, 품목구분, 품목계층그룹의 전수 정합성
- 사용자 화면에서 category를 변경한 뒤 재임포트하는 상호작용 검증
- 배포 환경의 실제 AWS/RDS 실행

## 5. 워크트리 상태

커밋·브랜치 조작은 하지 않았다. 보고서 저장 직전 git status --porcelain 원문은 다음과 같다.

~~~text
 M docs/migration/ecount-data/raw/.gitkeep
 M services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java
 M services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java
?? services/product-service/src/main/java/com/samhanair/logis/product/domain/ProductLineage.java
?? services/product-service/src/main/resources/db/migration/V28__add_product_lineage.sql
~~~

V28 신규 파일이 git status --porcelain에 ??로 나타나므로 커밋 대상 후보에 포함되는 것은 확인했다. PM이 커밋할 때 신규 파일 포함 여부를 다시 확인해야 한다.
+
## 6. 실 raw 연속 2회 임포트 및 726건 전수 대조 결과

stale 이미지 재기동 후 R4 심볼을 확인한 다음, 아래 명령을 동일한 실 raw 3종으로 연속 실행했다.

### 6.1 1회차 임포트

실행 명령 원문:

~~~powershell
Write-Output ('IMPORT_1_VALID_STARTED_AT=' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')); $response = & curl.exe -sS -X POST "http://localhost:8084/admin/products/imports/ecount" -H "X-Is-System-Master: true" -H "X-User-Id: 00000000-0000-0000-0000-000000000001" -F "itemFile=@docs/migration/ecount-data/raw/품목-Excel다운로드.csv;type=text/csv" -F "relationFile=@docs/migration/ecount-data/raw/품목관계-Excel다운로드.csv;type=text/csv" -F "groupFile=@docs/migration/ecount-data/raw/품목계층그룹-Excel다운로드.csv;type=text/csv" -w "`nHTTP_STATUS=%{http_code}`n"
~~~

출력 원문:

~~~text
IMPORT_1_VALID_STARTED_AT=2026-07-29 15:15:18 +09:00
{"totalRows":2836,"imported":0,"updated":2655,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2811,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":64,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"00131","rawName":"AR-EH03"},{"rowNumber":123,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00004","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":124,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00005","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":125,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00006","rawName":"삼성추가배관(스탠드)"},{"rowNumber":126,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00007","rawName":"삼성추가배관(스탠드)"},{"rowNumber":127,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00008","rawName":"바람막이"},{"rowNumber":128,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00009","rawName":"배수펌프"},{"rowNumber":129,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00010","rawName":"천공"},{"rowNumber":130,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00011","rawName":"유니온"},{"rowNumber":140,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00021","rawName":"사다리차"},{"rowNumber":141,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00022","rawName":"고소작업차(스카이)"},{"rowNumber":142,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00023","rawName":"고소작업차(스카이)"},{"rowNumber":153,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00034","rawName":"실외기받침대"},{"rowNumber":156,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00037","rawName":"삼성 추가배관"},{"rowNumber":157,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00038","rawName":"삼성 추가배관"},{"rowNumber":2560,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"SAR-00006","rawName":"AR-EH03"},{"rowNumber":2775,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00008","rawName":"유니온"},{"rowNumber":2776,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00009","rawName":"바람막이"},{"rowNumber":2777,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00010","rawName":"천공"},{"rowNumber":2778,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00011","rawName":"배수펌프"}],"skippedGroupCount":12,"skippedGroups":[{"name":"AR-EH03","candidateCodes":["00131","SAR-00006"],"rowNumbers":[64,2560],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(벽걸이)","candidateCodes":["AAAA-00004","AAAA-00005"],"rowNumbers":[123,124],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(스탠드)","candidateCodes":["AAAA-00006","AAAA-00007"],"rowNumbers":[125,126],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"바람막이","candidateCodes":["AAAA-00008","ZENG-00009"],"rowNumbers":[127,2776],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"배수펌프","candidateCodes":["AAAA-00009","ZENG-00011"],"rowNumbers":[128,2778],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"천공","candidateCodes":["AAAA-00010","ZENG-00010"],"rowNumbers":[129,2777],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"유니온","candidateCodes":["AAAA-00011","ZENG-00008"],"rowNumbers":[130,2775],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"사다리차","candidateCodes":["AAAA-00021","ZENG-00016"],"rowNumbers":[140,2783],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"고소작업차(스카이)","candidateCodes":["AAAA-00022","AAAA-00023"],"rowNumbers":[141,142],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"실외기받침대","candidateCodes":["AAAA-00034","ZENG-00017"],"rowNumbers":[153,2784],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성 추가배관","candidateCodes":["AAAA-00037","AAAA-00038"],"rowNumbers":[156,157],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"추가배관(벽걸이)","candidateCodes":["ZENG-00012","ZENG-00019"],"rowNumbers":[2779,2786],"stoppedAt":"⑤_FAIL_CLOSED"}]}
HTTP_STATUS=200
IMPORT_1_VALID_FINISHED_AT=2026-07-29 15:15:25 +09:00
IMPORT_1_VALID_CURL_EXIT_CODE=0
~~~

### 6.2 1회차 후 snapshot

실행 명령 원문:

~~~powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "CREATE TABLE qa_984_r4_import_snapshot_1 AS SELECT p.id, p.name, p.category_id FROM products p WHERE p.model_name IS NOT NULL AND p.product_code IS NOT NULL AND p.model_name=p.product_code AND p.lineage='SHEET' AND NOT p.is_deleted; SELECT COUNT(*) AS snapshot_1_rows FROM qa_984_r4_import_snapshot_1; SELECT COUNT(*) FILTER (WHERE name IS NULL) AS snapshot_1_null_names, COUNT(*) FILTER (WHERE category_id IS NULL) AS snapshot_1_null_categories FROM qa_984_r4_import_snapshot_1;"
~~~

출력 원문:

~~~text
SNAPSHOT_1_STARTED_AT=2026-07-29 15:15:43 +09:00
SELECT 726
 snapshot_1_rows 
-----------------
             726
(1 row)

 snapshot_1_null_names | snapshot_1_null_categories 
-----------------------+----------------------------
                     0 |                          0
(1 row)

SNAPSHOT_1_FINISHED_AT=2026-07-29 15:15:43 +09:00
SNAPSHOT_1_PSQL_EXIT_CODE=0
~~~

### 6.3 2회차 임포트

실행 명령은 6.1의 동일한 curl multipart 명령이며, 출력 원문:

~~~text
IMPORT_2_VALID_STARTED_AT=2026-07-29 15:15:53 +09:00
{"totalRows":2836,"imported":0,"updated":2655,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2811,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":64,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"00131","rawName":"AR-EH03"},{"rowNumber":123,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00004","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":124,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00005","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":125,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00006","rawName":"삼성추가배관(스탠드)"},{"rowNumber":126,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00007","rawName":"삼성추가배관(스탠드)"},{"rowNumber":127,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00008","rawName":"바람막이"},{"rowNumber":128,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00009","rawName":"배수펌프"},{"rowNumber":129,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00010","rawName":"천공"},{"rowNumber":130,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00011","rawName":"유니온"},{"rowNumber":140,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00021","rawName":"사다리차"},{"rowNumber":141,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00022","rawName":"고소작업차(스카이)"},{"rowNumber":142,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00023","rawName":"고소작업차(스카이)"},{"rowNumber":153,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00034","rawName":"실외기받침대"},{"rowNumber":156,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00037","rawName":"삼성 추가배관"},{"rowNumber":157,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00038","rawName":"삼성 추가배관"},{"rowNumber":2560,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"SAR-00006","rawName":"AR-EH03"},{"rowNumber":2775,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00008","rawName":"유니온"},{"rowNumber":2776,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00009","rawName":"바람막이"},{"rowNumber":2777,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00010","rawName":"천공"},{"rowNumber":2778,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00011","rawName":"배수펌프"}],"skippedGroupCount":12,"skippedGroups":[{"name":"AR-EH03","candidateCodes":["00131","SAR-00006"],"rowNumbers":[64,2560],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(벽걸이)","candidateCodes":["AAAA-00004","AAAA-00005"],"rowNumbers":[123,124],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(스탠드)","candidateCodes":["AAAA-00006","AAAA-00007"],"rowNumbers":[125,126],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"바람막이","candidateCodes":["AAAA-00008","ZENG-00009"],"rowNumbers":[127,2776],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"배수펌프","candidateCodes":["AAAA-00009","ZENG-00011"],"rowNumbers":[128,2778],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"천공","candidateCodes":["AAAA-00010","ZENG-00010"],"rowNumbers":[129,2777],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"유니온","candidateCodes":["AAAA-00011","ZENG-00008"],"rowNumbers":[130,2775],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"사다리차","candidateCodes":["AAAA-00021","ZENG-00016"],"rowNumbers":[140,2783],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"고소작업차(스카이)","candidateCodes":["AAAA-00022","AAAA-00023"],"rowNumbers":[141,142],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"실외기받침대","candidateCodes":["AAAA-00034","ZENG-00017"],"rowNumbers":[153,2784],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성 추가배관","candidateCodes":["AAAA-00037","AAAA-00038"],"rowNumbers":[156,157],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"추가배관(벽걸이)","candidateCodes":["ZENG-00012","ZENG-00019"],"rowNumbers":[2779,2786],"stoppedAt":"⑤_FAIL_CLOSED"}]}
HTTP_STATUS=200
IMPORT_2_VALID_FINISHED_AT=2026-07-29 15:15:59 +09:00
IMPORT_2_VALID_CURL_EXIT_CODE=0
~~~

### 6.4 2회차 snapshot 및 726건 전수 diff

실행 명령 원문:

~~~powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "CREATE TABLE qa_984_r4_import_snapshot_2 AS SELECT p.id, p.name, p.category_id FROM products p WHERE p.model_name IS NOT NULL AND p.product_code IS NOT NULL AND p.model_name=p.product_code AND p.lineage='SHEET' AND NOT p.is_deleted; SELECT COUNT(*) AS snapshot_2_rows FROM qa_984_r4_import_snapshot_2; SELECT COUNT(*) FILTER (WHERE s1.id IS NULL OR s2.id IS NULL) AS membership_diff_count, COUNT(*) FILTER (WHERE s1.id IS NOT NULL AND s2.id IS NOT NULL AND s1.name IS DISTINCT FROM s2.name) AS name_diff_count, COUNT(*) FILTER (WHERE s1.id IS NOT NULL AND s2.id IS NOT NULL AND s1.category_id IS DISTINCT FROM s2.category_id) AS category_id_diff_count FROM qa_984_r4_import_snapshot_1 s1 FULL OUTER JOIN qa_984_r4_import_snapshot_2 s2 ON s2.id=s1.id; SELECT COUNT(*) AS snapshot_1_rows_recount FROM qa_984_r4_import_snapshot_1;"
~~~

출력 원문:

~~~text
SNAPSHOT_2_DIFF_STARTED_AT=2026-07-29 15:16:13 +09:00
SELECT 726
 snapshot_2_rows 
-----------------
             726
(1 row)

 membership_diff_count | name_diff_count | category_id_diff_count 
-----------------------+-----------------+------------------------
                     0 |               0 |                      0
(1 row)

 snapshot_1_rows_recount 
-------------------------
                     726
(1 row)

SNAPSHOT_2_DIFF_FINISHED_AT=2026-07-29 15:16:13 +09:00
SNAPSHOT_2_DIFF_PSQL_EXIT_CODE=0
~~~
