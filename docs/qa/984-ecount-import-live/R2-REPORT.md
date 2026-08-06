# PR #984 라이브 QA 재실행 R2

## 결론

R4가 실제로 올라간 `product-service`에서 실 이카운트 CSV 3종을 연속 2회 임포트했다. 두 요청 모두 `HTTP 200`이었고, 두 번째 실행에서도 제품·코드·alias 수, 중복 코드 여부, AJ0 계보 품목명이 모두 1회차와 같았다.

이번 라운드의 핵심 불변식 3은 통과했다.

`AJ012BN1PBC2`의 `name`은 임포트 전·1회차 후·2회차 후 모두 `실내기(1-Way) 무풍 소형 WIFI 내장 3평형`으로 보존됐다. 이카운트 raw 품목명 `AJ012BN1PBC2 [홈-WIFI 모델-小]`로 덮이지 않았다.

## 실행 메타데이터와 배포본 증명

- 실행일: 2026-07-30 KST
- 워크트리: `D:\dev\Samhan-Public\.claude\worktrees\w984-ecount`
- 브랜치: `fix/ecount-import-model-code-merge`
- 실행 기준 HEAD: `eeebd20b7a30b4ff7d54f6d59bd4703f2fd75ed6`
- HEAD 직전 두 커밋:
  - `eeebd20b7 docs(qa/#984): 라이브QA — 실 이카운트 파일 3종 임포트, 409 소멸·멱등 확인`
  - `5e363075e fix(product): R4 — 계보 전용 컬럼으로 반복 임포트에도 시트 유래를 보존 (V28)`
- migration tail: `V26__align_price_change_schedule_to_live_gas.sql`, `V27__allow_skipped_main_candidate_status.sql`, `V28__add_product_lineage.sql`
- 빌드: `GRADLE_USER_HOME=D:\dev\Samhan-Public\.gradle-t21 .\gradlew.bat :services:product-service:bootJar -x test --no-daemon`
- 빌드 결과: `BUILD SUCCESSFUL`, `12 actionable tasks: 4 executed, 8 up-to-date`
- 배포: `docker compose -p infrastructure -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps product-service`
- 재배포된 서비스: `samhan-product-service`만 재생성
- 컨테이너: `running`, `healthy`
- 이미지 digest: `sha256:44d94868dc02463cec4d2d021f27a343807eca842ed216e9011c2882705d146c`
- Compose project: `infrastructure`
- Compose working dir: `D:\dev\Samhan-Public\.claude\worktrees\w984-ecount\infrastructure`
- 최종 healthy 컨테이너 수: `22`

### R4 배포 게이트 원문

임포트 전에 같은 연속 실행에서 아래 SQL을 실행했다. 빌드 성공만으로 배포본을 간주하지 않고, product DB의 실제 `flyway_schema_history`를 확인했다.

```sql
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
SELECT version, description, success FROM flyway_schema_history WHERE version = '28';
```

```text
 version |               description               | success
---------+-----------------------------------------+---------
 28      | add product lineage                     | t
 27      | allow skipped main candidate status     | t
 26      | align price change schedule to live gas | t
 25      | product sheet sync generation           | t
 24      | quantity sync rule schema               | t

 version |     description     | success
---------+---------------------+---------
 28      | add product lineage | t
```

따라서 임포트에 사용된 배포본에서 V28이 실제 적용됐음(`version=28`, `success=t`)을 확인했다.

## 입력 파일

현재 QA 워크트리의 `docs/migration/ecount-data/raw/`에는 `.gitkeep`만 있었고 지정된 CSV 3종은 없었다. 같은 PC의 R4 고정 worktree `t9-984`에 있는 실 파일을 직접 사용했으며, 두 worktree 사본의 SHA-256이 모두 일치했다. 현재 워크트리에 CSV를 복사하지 않았으므로 임시 복사본 삭제 대상은 없다.

| 파일 | 크기 | SHA-256 |
|---|---:|---|
| 품목-Excel다운로드.csv | 313,221 bytes | `02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C` |
| 품목관계-Excel다운로드.csv | 15,632 bytes | `00A1964DF081FEDB1E1AF270ED0110345E1F856531EB630210F6E5BA7867DE85` |
| 품목계층그룹-Excel다운로드.csv | 4,710 bytes | `4955F2999017F37511AF3ADE552113FA30C0628B081D6B992F7D171A7CC1EB7E` |

AJ012 raw 원문:

```text
"AJ012BN1PBC2\t","AJ012BN1PBC2 [홈-WIFI 모델-小]\t","495,000","0","","","247,500","257,400","272,250","321,750","[상품]\t","소형 내장형\t","YES\t",""
```

## 임포트 요청 원문

두 회차 모두 동일한 요청을 사용했다. 게이트웨이는 경유하지 않고 product-service 직접 운영 포트 `8084`를 호출했다.

```text
POST http://127.0.0.1:8084/admin/products/imports/ecount
X-Is-System-Master: true
X-User-Id: 00000000-0000-0000-0000-000000000001
Content-Type: multipart/form-data
itemFile=D:\dev\Samhan-Public\.claude\worktrees\t9-984\docs\migration\ecount-data\raw\품목-Excel다운로드.csv
relationFile=D:\dev\Samhan-Public\.claude\worktrees\t9-984\docs\migration\ecount-data\raw\품목관계-Excel다운로드.csv
groupFile=D:\dev\Samhan-Public\.claude\worktrees\t9-984\docs\migration\ecount-data\raw\품목계층그룹-Excel다운로드.csv
```

SQL은 `docker exec samhan-postgres psql -U samhan -d product_db -c "..."` 방식으로 실행했다. stdin heredoc은 사용하지 않았다.

## 임포트 응답 원문

### 1회차

```text
{"totalRows":2836,"imported":0,"updated":2655,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2811,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":64,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"00131","rawName":"AR-EH03"},{"rowNumber":123,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00004","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":124,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00005","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":125,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00006","rawName":"삼성추가배관(스탠드)"},{"rowNumber":126,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00007","rawName":"삼성추가배관(스탠드)"},{"rowNumber":127,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00008","rawName":"바람막이"},{"rowNumber":128,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00009","rawName":"배수펌프"},{"rowNumber":129,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00010","rawName":"천공"},{"rowNumber":130,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00011","rawName":"유니온"},{"rowNumber":140,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00021","rawName":"사다리차"},{"rowNumber":141,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00022","rawName":"고소작업차(스카이)"},{"rowNumber":142,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00023","rawName":"고소작업차(스카이)"},{"rowNumber":153,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00034","rawName":"실외기받침대"},{"rowNumber":156,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00037","rawName":"삼성 추가배관"},{"rowNumber":157,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00038","rawName":"삼성 추가배관"},{"rowNumber":2560,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"SAR-00006","rawName":"AR-EH03"},{"rowNumber":2775,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00008","rawName":"유니온"},{"rowNumber":2776,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00009","rawName":"바람막이"},{"rowNumber":2777,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00010","rawName":"천공"},{"rowNumber":2778,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00011","rawName":"배수펌프"}],"skippedGroupCount":12,"skippedGroups":[{"name":"AR-EH03","candidateCodes":["00131","SAR-00006"],"rowNumbers":[64,2560],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(벽걸이)","candidateCodes":["AAAA-00004","AAAA-00005"],"rowNumbers":[123,124],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(스탠드)","candidateCodes":["AAAA-00006","AAAA-00007"],"rowNumbers":[125,126],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"바람막이","candidateCodes":["AAAA-00008","ZENG-00009"],"rowNumbers":[127,2776],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"배수펌프","candidateCodes":["AAAA-00009","ZENG-00011"],"rowNumbers":[128,2778],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"천공","candidateCodes":["AAAA-00010","ZENG-00010"],"rowNumbers":[129,2777],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"유니온","candidateCodes":["AAAA-00011","ZENG-00008"],"rowNumbers":[130,2775],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"사다리차","candidateCodes":["AAAA-00021","ZENG-00016"],"rowNumbers":[140,2783],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"고소작업차(스카이)","candidateCodes":["AAAA-00022","AAAA-00023"],"rowNumbers":[141,142],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"실외기받침대","candidateCodes":["AAAA-00034","ZENG-00017"],"rowNumbers":[153,2784],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성 추가배관","candidateCodes":["AAAA-00037","AAAA-00038"],"rowNumbers":[156,157],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"추가배관(벽걸이)","candidateCodes":["ZENG-00012","ZENG-00019"],"rowNumbers":[2779,2786],"stoppedAt":"⑤_FAIL_CLOSED"}]}
HTTP_STATUS:200
CURL_EXIT:0
```

### 2회차

```text
{"totalRows":2836,"imported":0,"updated":2655,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2811,"sourceFileHash":"02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C","rejectedSample":[{"rowNumber":64,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"00131","rawName":"AR-EH03"},{"rowNumber":123,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00004","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":124,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00005","rawName":"삼성추가배관(벽걸이)"},{"rowNumber":125,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00006","rawName":"삼성추가배관(스탠드)"},{"rowNumber":126,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00007","rawName":"삼성추가배관(스탠드)"},{"rowNumber":127,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00008","rawName":"바람막이"},{"rowNumber":128,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00009","rawName":"배수펌프"},{"rowNumber":129,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00010","rawName":"천공"},{"rowNumber":130,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00011","rawName":"유니온"},{"rowNumber":140,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00021","rawName":"사다리차"},{"rowNumber":141,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00022","rawName":"고소작업차(스카이)"},{"rowNumber":142,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00023","rawName":"고소작업차(스카이)"},{"rowNumber":153,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00034","rawName":"실외기받침대"},{"rowNumber":156,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00037","rawName":"삼성 추가배관"},{"rowNumber":157,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"AAAA-00038","rawName":"삼성 추가배관"},{"rowNumber":2560,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"SAR-00006","rawName":"AR-EH03"},{"rowNumber":2775,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00008","rawName":"유니온"},{"rowNumber":2776,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00009","rawName":"바람막이"},{"rowNumber":2777,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00010","rawName":"천공"},{"rowNumber":2778,"reason":"SKIPPED_MAIN_CANDIDATE","rawCode":"ZENG-00011","rawName":"배수펌프"}],"skippedGroupCount":12,"skippedGroups":[{"name":"AR-EH03","candidateCodes":["00131","SAR-00006"],"rowNumbers":[64,2560],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(벽걸이)","candidateCodes":["AAAA-00004","AAAA-00005"],"rowNumbers":[123,124],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성추가배관(스탠드)","candidateCodes":["AAAA-00006","AAAA-00007"],"rowNumbers":[125,126],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"바람막이","candidateCodes":["AAAA-00008","ZENG-00009"],"rowNumbers":[127,2776],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"배수펌프","candidateCodes":["AAAA-00009","ZENG-00011"],"rowNumbers":[128,2778],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"천공","candidateCodes":["AAAA-00010","ZENG-00010"],"rowNumbers":[129,2777],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"유니온","candidateCodes":["AAAA-00011","ZENG-00008"],"rowNumbers":[130,2775],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"사다리차","candidateCodes":["AAAA-00021","ZENG-00016"],"rowNumbers":[140,2783],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"고소작업차(스카이)","candidateCodes":["AAAA-00022","AAAA-00023"],"rowNumbers":[141,142],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"실외기받침대","candidateCodes":["AAAA-00034","ZENG-00017"],"rowNumbers":[153,2784],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"삼성 추가배관","candidateCodes":["AAAA-00037","AAAA-00038"],"rowNumbers":[156,157],"stoppedAt":"⑤_FAIL_CLOSED"},{"name":"추가배관(벽걸이)","candidateCodes":["ZENG-00012","ZENG-00019"],"rowNumbers":[2779,2786],"stoppedAt":"⑤_FAIL_CLOSED"}]}
HTTP_STATUS:200
CURL_EXIT:0
```

두 응답의 body는 동일했다.

## 전·후 SQL 실측

측정과 두 임포트는 `RUN_STARTED: 2026-07-30T11:29:03.5827610+09:00`부터 `RUN_FINISHED: 2026-07-30T11:29:22.4687045+09:00`까지 한 번의 연속 실행에서 수행했다.

사용한 핵심 SQL은 다음과 같다.

```sql
SELECT count(*) FROM products WHERE deleted_at IS NULL;
SELECT count(*) FROM products WHERE deleted_at IS NULL AND product_code IS NOT NULL AND product_code <> '';
SELECT count(*) FROM product_aliases WHERE deleted_at IS NULL;
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
SELECT product_code, model_name, left(name,44) FROM products
WHERE deleted_at IS NULL AND product_code ~ '^AJ0' ORDER BY product_code LIMIT 10;
```

| 시점 | live products | live products with code | live product_aliases | Flyway tail |
|---|---:|---:|---:|---|
| 임포트 전 | 3049 | 2655 | 2811 | V28, V27, V26, V25, V24 모두 `success=t` |
| 1회차 후 | 3049 | 2655 | 2811 | V28, V27, V26, V25, V24 모두 `success=t` |
| 2회차 후 | 3049 | 2655 | 2811 | V28, V27, V26, V25, V24 모두 `success=t` |

1회차와 2회차 응답 모두 `totalRows=2836`, `imported=0`, `updated=2655`, `rejectedNullName=1`, `aliasImported=2811`, `skippedGroupCount=12`였다.

### AJ0 품목명 전후 원문

세 시점의 쿼리 출력은 동일했다.

```text
 product_code |  model_name  |                name_prefix
--------------+--------------+--------------------------------------------
 AJ012BN1PBC2 | AJ012BN1PBC2 | 실내기(1-Way) 무풍 소형 WIFI 내장 3평형
 AJ012MB1PBC2 | AJ012MB1PBC2 | 실내기(1-Way) 무풍 소형 미내장 3평형
 AJ016BN1PBC2 | AJ016BN1PBC2 | 실내기(1-Way) 무풍 소형 WIFI 내장 4평형
 AJ016MB1PBC2 | AJ016MB1PBC2 | 실내기(1-Way) 무풍 소형 미내장 4평형
 AJ020BN1PBC1 | AJ020BN1PBC1 | 실내기(1-Way) 무풍 중형 WIFI 내장 5평형
 AJ020BN1PBC2 | AJ020BN1PBC2 | 실내기(1-Way) 무풍 소형 WIFI 내장 5평형
 AJ020CN1FBC1 | AJ020CN1FBC1 | 실내기(1-Way) 인피니트 무풍 중형 5평형
 AJ020CN1UBC1 | AJ020CN1UBC1 | 실내기(1-Way) 인피니트 무풍 중형(UV) 5평형
 AJ020FERPBC1 | AJ020FERPBC1 | 비스포크 AI 에어콤보 토출 우측
 AJ020FERPBC2 | AJ020FERPBC2 | 비스포크 AI 에어콤보 토출 좌측
```

### 불변식 3 전후 대조

| 확인 대상 | 임포트 전 | 1회차 후 | 2회차 후 | 판정 |
|---|---|---|---|---|
| `AJ012BN1PBC2.model_name` | `AJ012BN1PBC2` | `AJ012BN1PBC2` | `AJ012BN1PBC2` | 동일 |
| `AJ012BN1PBC2.name` | `실내기(1-Way) 무풍 소형 WIFI 내장 3평형` | 동일 | 동일 | 보존 |
| 이카운트 raw 품목명 | `AJ012BN1PBC2 [홈-WIFI 모델-小]` | 해당 값으로 덮이지 않음 | 해당 값으로 덮이지 않음 | 통과 |
| live `product_code` 중복 query | 결과 없음 | 결과 없음 | 결과 없음 | 통과 |

R4의 계보 전용 컬럼이 이카운트 이름을 alias/source 데이터로 처리하고 기존 시트 계보 `products.name`을 유지한 결과와 일치한다.

## 불변식 판정

| # | 불변식 | 판정 | 근거 |
|---:|---|---|---|
| 1 | 같은 파일 임포트에서 409가 발생하지 않는다 | 통과 | 1회차·2회차 모두 HTTP 200, `CURL_EXIT:0` |
| 2 | 같은 물건이 두 행이 되지 않는다 | 통과 | products 3049/코드 2655가 유지되고 중복 `product_code` query가 세 시점 모두 빈 결과 |
| 3 | 반복 임포트에도 사용자가 보던 품목명이 바뀌지 않는다 | 통과 | AJ012BN1PBC2의 시트 계보 이름이 세 시점 모두 동일 |
| 4 | 같은 파일 두 번의 결과가 같다 | 통과 | 두 응답 body와 모든 핵심 count 및 AJ0 출력이 동일 |
| 5 | 실패하면 부분 반영이 남지 않는다 | 이번 라운드 미검증 | 두 요청 모두 성공했으므로 실패 입력을 유도하는 별도 시나리오는 실행하지 않음. 이번 성공 실행에서 부분 반영 차이는 관찰되지 않음 |
| 6 | 인용 출력이 재현 가능하다 | 통과 | 동일 연속 실행의 시작·종료 시각, 명령·입력 경로·파일 hash·응답·SQL 결과를 함께 기록 |

## GUI 증거

- [r2-swagger-import-endpoint.png](screenshots/r2-swagger-import-endpoint.png): 실제 product-service Swagger UI의 MIG-2 임포트 endpoint, `multipart/form-data`, `X-User-Id`, `itemFile` 확인
- [r2-swagger-import-form.png](screenshots/r2-swagger-import-form.png): 실제 업로드 폼의 `itemFile`, `relationFile`, `groupFile`과 HTTP 200 응답 스키마 확인
- 브라우저 콘솔 error/warn: `0`

게이트웨이 `:8080/admin/products/...`는 확인하지 않았다. 요청 범위의 운영 경로인 product-service 직접 포트 `:8084`만 사용했다.

## 신규 파일 전체 목록

현재 worktree에서 이번 QA 산출물로 새로 생성된 파일은 다음 3개다.

1. `docs/qa/984-ecount-import-live/R2-REPORT.md`
2. `docs/qa/984-ecount-import-live/screenshots/r2-swagger-import-endpoint.png`
3. `docs/qa/984-ecount-import-live/screenshots/r2-swagger-import-form.png`

입력 CSV 임시 복사본은 만들지 않았다. Git `add`, `commit`, `push`, `checkout`은 실행하지 않았다.
