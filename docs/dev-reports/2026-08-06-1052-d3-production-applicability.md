# #1052 D3 — 운영 적용 여부 측정

- 조사일: 2026-08-06 (Asia/Seoul)
- 작업 브랜치: `fix/1052-warehouse-uuid-existence`
- 조사 HEAD: `88cd4d9492f77b88bf47e1530eaa2ba87b94b607`
- 범위: 저장소와 현재 회사 PC의 읽기 전용 증거만 사용
- 금지 범위 준수: 코드 수정, 배포, Terraform apply, Docker rebuild, commit/push, 전체 테스트를 하지 않음

## 0. 먼저 교정할 전제

`“네 UUID가 inventory_db.warehouses 실재 행이 아니다”`라는 전제는 **현재 회사 PC의 DB에서 행 존재 여부만 놓고 보면 틀리다.** 읽기 전용 SQL 결과상 네 설정 슬롯에 해당하는 행은 모두 `is_deleted = false`인 활성 행이다.

| 설정 슬롯 | 현재 `warehouses` 행의 `code` | 이름 | 유형 | 현재 활성 여부 |
|---|---|---|---|---|
| `WAREHOUSE_UUID_HQ` | `HQ-001` | 본사창고 | HEADQUARTERS | 예 |
| `WAREHOUSE_UUID_HUBAL` | `VH-001` | 1호차 차량재고 | VEHICLE | 예 |
| `WAREHOUSE_UUID_ANSEONG` | `CS-001` | 거래처 위탁창고 | CONSIGNMENT | 예 |
| `WAREHOUSE_UUID_CHANGWON` | `VR-001` | 가상창고 | VIRTUAL | 예 |

네 행은 `services/inventory-service/src/main/resources/db/migration/V2__seed_inventory_warehouses.sql:1-22`에서 시드된 행이기도 하다. 따라서 사실 오류의 정확한 형태는 `“존재하지 않는 UUID”`가 아니라 다음이다.

> **개발/시드용 정체성이 실제 행으로 존재하지만, eCount 코드 `00003`, `2`, `14`, `1`의 운영 창고라는 근거가 없고, 두 식별자 체계 사이의 권위 있는 alias가 없다.**

현재 PC에서 같은 방식으로 확인한 native eCount 코드 행 `00003`, `2`, `14`, `1`도 모두 활성 행이지만 네 행과 별개였다. native 네 행의 balance/lot 행은 0건이었고, `HQ-001`과 `VH-001`에는 각각 balance 행 103건이 있었다. 이것은 D2의 “placeholder 의미”를 지지하지만, **실제 AWS 운영 DB의 현재 상태를 증명하지는 않는다.**

## 1. 최종 판정

| 질문 | 판정 | 근거 범위 |
|---|---|---|
| 저장소의 기본 최초 기동 경로로 운영에 주입될 수 있는가 | **예, 확정** | Terraform이 `user_data.sh`를 EC2 `user_data`로 전달하고, 해당 스크립트가 `.env.production`을 만든다 |
| 그 파일을 어느 서비스가 읽는가 | **slip-service, 확정** | production compose가 네 환경변수를 `slip-service` 컨테이너 환경으로 전달한다 |
| 런타임에서 실제 매핑에 사용되는가 | **예, 확정** | Spring 설정 → `WarehouseCodeMapper` → 전표의 `sourceWarehouseId` → inventory reserve/deduct 경로 |
| Terraform/Secrets Manager/SSM Parameter Store가 자동으로 덮어쓰는가 | **저장소 증거 없음** | Terraform 변수·Secrets 조회·SSM Parameter Store reader에 `WAREHOUSE_UUID_*` 경로가 없다 |
| 현재 AWS 운영 컨테이너가 이 값을 실제로 사용 중인가 | **미판정** | 사용자 지시에 따라 AWS 접근을 하지 않았고, 저장소에는 실 운영 `.env.production`/컨테이너 env가 없다 |
| SSM 수동 수정 가능성 | **가능하지만 실제 실행 여부 미판정** | CUTOVER 문서가 SSM Session Manager를 통한 env 수정 및 재기동을 허용한다 |

따라서 D3의 도달성 결론은 다음과 같다.

> **저장소 기본 배포 경로로는 운영에 적용 가능한 값이며, 자동 덮어쓰기 경로도 확인되지 않았다. 그러나 실제 AWS에 현재 적용되었다고 단정할 수는 없다.**

## 2. 운영 적용 경로 — 파일과 줄

### 2.1 EC2 최초 기동에서 `.env.production` 생성

1. `infrastructure/terraform/ec2.tf:41-48`이 `templatefile(...)` 결과를 EC2 `user_data`로 등록한다.
2. `infrastructure/terraform/templates/user_data.sh:120-123`이 `/opt/samhanlogis/.env.production` 생성을 시작한다.
3. `infrastructure/terraform/templates/user_data.sh:162-188`이 heredoc으로 환경변수를 기록한다. 그중 `:184-188`이 다음 네 슬롯을 고정 UUID 문자열로 쓴다.
   - `WAREHOUSE_UUID_HQ`
   - `WAREHOUSE_UUID_HUBAL`
   - `WAREHOUSE_UUID_ANSEONG`
   - `WAREHOUSE_UUID_CHANGWON`
4. `infrastructure/terraform/templates/user_data.sh:306`에서 env 파일 작성을 끝내고, 같은 파일 `:333-351`에서 compose 파일을 내려받아 `docker compose ... --env-file .env.production up -d --pull always`를 실행한다.

스크립트 자체도 `infrastructure/terraform/templates/user_data.sh:14-15`에서 이 설정이 최초 부팅 중심이며 이후에는 SSM/manual/deploy script로 갱신된다고 설명한다. 즉 최초 기동 파일은 일회성 산출물이지만, 그 산출물이 기본 배포의 입력이다.

### 2.2 compose가 값을 `slip-service`로 전달

`infrastructure/docker-compose.prod.yml:1-10`은 `.env.production`을 사전 조건으로 둔다. `:375-382`에서 `slip-service`의 `environment`에 네 변수를 직접 전달하고, `:390`은 user_data가 만든 env의 값이 컨테이너에 들어온다고 명시한다.

호출관계는 다음과 같다.

```text
Terraform ec2.tf
  -> user_data.sh:162-188
  -> /opt/samhanlogis/.env.production
  -> docker-compose.prod.yml:375-382
  -> slip-service 컨테이너 환경변수
  -> application.yml:189-196
  -> WarehouseCodeMapper
```

### 2.3 Spring 런타임 매핑

`services/slip-service/src/main/resources/application.yml:189-196`은 다음 매핑을 만든다.

| eCount `warehouseCode` | 런타임 환경변수 |
|---|---|
| `00003` | `WAREHOUSE_UUID_HQ` |
| `2` | `WAREHOUSE_UUID_HUBAL` |
| `14` | `WAREHOUSE_UUID_ANSEONG` |
| `1` | `WAREHOUSE_UUID_CHANGWON` |

`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseCodeMapper.java:17-42`는 이 설정을 읽고 UUID 형식과 비어 있지 않은지만 검사한다. 같은 파일 `:66-94`의 `resolve`도 코드에 대응하는 UUID를 반환할 뿐, inventory DB에서 행의 존재·code·name·type을 조회해 확인하지 않는다. 그러므로 이 지점에서 `HQ-001`이 eCount `00003`의 운영 행인지, `VH-001`이 eCount `2`의 운영 행인지 판정하지 않는다.

### 2.4 실제 사용자 요청에서 사용하는 지점

eCount 웹 클라이언트의 전표 발행 경로는 다음과 같다.

1. `clients/web/estimate-app/lib/slip-bridge.js:93-112`가 eCount 응답의 `head.WH_CD`를 `warehouseCode`로 만든다.
2. 같은 파일 `:143-177`이 `/internal/slips/from-estimate`로 전송하며, 2xx를 `ok: true`로 처리한다.
3. `services/slip-service/src/main/java/com/samhanair/logis/slip/web/InternalSlipPublishController.java:50-76`이 `SlipPublishService`를 호출한다.
4. `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:135-150`이 `WarehouseCodeMapper.resolve(...)` 결과를 `Slip.sourceWarehouseId`로 저장한다.
5. 전표가 승인되면 `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:885-923`의 reserve, 완료되면 같은 파일 `:1040-1057`의 deduct가 그 `sourceWarehouseId`를 inventory-service에 전달한다.

partner order 경로에는 세 번째 가능성도 있다. `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:438-463`에서 요청에 `warehouseId`가 직접 있으면 YAML 매핑보다 요청 UUID를 우선한다. 따라서 **모든 경로가 네 고정값을 쓰는 것은 아니지만, eCount estimate 경로는 고정값을 직접 사용한다.**

## 3. 덮어쓰기 경로 조사

### 3.1 자동 덮어쓰기: 확인되지 않음

- Terraform `templatefile`에 전달되는 변수는 `ec2.tf:41-48`의 project/environment/region/RDS 관련 값이며 `WAREHOUSE_UUID_*` 변수가 아니다.
- `infrastructure/terraform/variables.tf`에 warehouse UUID 입력 변수가 없다.
- `infrastructure/terraform/templates/user_data.sh:131-156`의 Secrets Manager 조회는 DB 비밀번호, JWT/internal token, Rabbit/S3 credential 등이다. warehouse UUID secret 조회는 없다.
- `infrastructure/terraform/iam.tf:73-92`의 Secrets Manager 정책도 `samhan/*` secret read 범위이며 warehouse 별도 주입 로직은 없다.
- `rg`로 Terraform, compose, scripts, 서비스 소스에서 `aws_ssm_parameter`, `aws ssm get-parameter`, warehouse Parameter Store reader를 확인하지 못했다.
- `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md:80-84`는 placeholder UUID의 목표 source를 Parameter Store라고 적지만, 이것은 설계/guard 문서이지 현재 값을 읽는 실행 코드가 아니다.

따라서 저장소에 보이는 기본 경로에서는 `user_data.sh`의 고정값이 최종 입력이다. S3에서 내려받는 것은 compose와 init-rds 파일(`infrastructure/terraform/s3.tf:95-109`)이지 warehouse 값을 덮는 별도 secret/config 파일이 아니다.

### 3.2 수동 덮어쓰기: 가능, 실제 여부 미판정

`infrastructure/terraform/CUTOVER.md:230-243`은 최초 user_data 이후 SSM Session Manager로 production 값을 보정할 수 있다고 하고, `:249-266`은 SSM 접속 후 `.env.production`을 사용해 compose를 다시 올리는 절차를 둔다. 이 문서는 SES/NTS 등 일부 설정을 예로 들지만 warehouse 변수의 수동 변경 실행 기록은 없다.

그러므로 다음 세 가지를 분리해야 한다.

1. **자동 override 구현:** 발견하지 못함.
2. **운영자가 직접 env를 바꿀 수 있는 경로:** 문서상 있음.
3. **실제 AWS에서 누군가 바꿨는지:** 미판정.

## 4. 적용 시 실 사용자에게 보이는 결과

### 4.1 현재 PC에서 확인한 namespace 충돌

현재 PC의 `inventory_db`를 읽기 전용으로 다시 센 결과, native eCount 창고 코드 행은 모두 활성이나 balance/lot이 0건이었다. 반대로 설정 대상 중 `HQ-001`과 `VH-001`은 각각 balance 행 103건이었다. `slip_db`에는 현재 `00003` 전표 1건, `2` 전표 3건, `1` 전표 111건이 있었고 `14` 전표는 없었다. 이것은 운영 수치가 아니라 **회사 PC의 현재 시드/개발 DB 관찰값**이다.

| 입력 eCount 코드 | 현재 설정이 가리키는 행 | 이 PC에서 관찰한 결과 | 사용자에게 가능한 결과 |
|---|---|---|---|
| `00003` | 본사창고 `HQ-001` | 대상에는 stock이 있고 native `00003`은 0 | 출고 승인 시 native 창고가 아닌 본사창고 stock을 reserve/deduct할 수 있다. 대상 stock이 없으면 이후 409가 된다 |
| `2` | 차량재고 `VH-001` | 대상에는 stock이 있고 native `2`는 0 | 상일물류가 아니라 차량재고에서 처리될 수 있다. 대상 stock이 있으면 오류 없이 잘못된 재고가 움직일 수 있다 |
| `14` | 거래처 위탁창고 `CS-001` | 대상 stock 0, native `14`도 0 | 전표 발행 자체는 2xx일 수 있으나 승인 reserve에서 재고 부족/대상 오류가 될 수 있다 |
| `1` | 가상창고 `VR-001` | 대상 stock 0, native `1`도 0 | 전표 발행과 후속 승인 사이에 지연된 실패가 될 수 있다 |

위 표의 “될 수 있다”는 운영 실행을 가장하지 않기 위한 표현이다. 실제 production DB의 잔량은 AWS 미접근으로 측정하지 않았다.

핵심은 **전표 생성과 재고 이동의 시점이 다르다**는 점이다. `publishFromEstimate`는 `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:135-150`에서 잘못된 `sourceWarehouseId`를 전표에 넣어 저장하고, 재고 reserve는 `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:885-923`에서 나중에 수행한다. 그래서 잘못된 매핑이 생성 순간에는 201/200으로 통과할 수 있다. `clients/web/estimate-app/lib/slip-bridge.js:143-177`도 모든 2xx를 성공으로 처리한다.

대상 warehouse에 우연히 재고가 있으면 reserve가 성공해 **200 계열의 정상 흐름처럼 보이면서 실제로 다른 창고 재고를 움직이는** 것이 가장 위험한 경우다. 대상 balance가 없으면 `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java:235-271`의 재고 없음 경로가 409로 드러난다. 즉 “오류만 난다”가 아니라, 데이터가 있는 잘못된 대상에서는 조용히 잘못 처리될 수 있다.

### 4.2 200 OK 빈값/빈 필드 경로

이 문제를 4xx/5xx만으로 측정하면 놓치는 경로가 있다.

- `WarehouseCodeMapper.businessType(...)` (`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseCodeMapper.java:97-108`)는 `00003`과 `2`만 알려진 업무 유형으로 취급하고 `14`, `1`은 `UNKNOWN`으로 둔다. 이는 UUID 존재 여부와 별개의 두 번째 namespace 문제다.
- 아로로지스 사전 분류는 `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/PreClassifyService.java:80-115`에서 전표를 조회한 뒤 unknown 수를 세고도 응답을 만든다. 같은 파일 `:147-156`의 mode 필터는 SANGIL/CHOWOL 외 유형을 분류 그룹에 넣지 않는다. 컨트롤러는 `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:327-347`에서 정상 응답을 반환한다.
- 화면은 `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:352-363`에서 unknown이 있으면 경고를 표시하지만, 그룹/미분류 목록 자체는 비어 있을 수 있다. unknown도 0이면 “해당 기간에 출고전표가 없습니다”로 보인다.
- 재고 조회는 `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:71-89`에서 조회 결과가 없어도 `ApiResponse.ok(page)`를 반환한다. `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java:76-128`은 warehouse UUID로 필터링한 빈 page를 그대로 반환하며, 화면은 `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:327-331`에서 “조회 결과가 없습니다”로 표시한다.
- 배차용 출고 전표 응답은 `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:304-330`, 특히 `:327-328`에서 warehouse 이름을 optional로 조회해 없으면 `null`을 넣고도 응답 조립을 계속한다. 따라서 HTTP 성공과 빈 `sourceWarehouseName`이 동시에 가능하다.

정리하면 사용자 증상은 네 가지가 모두 같은 오류 코드가 아니다.

```text
전표 생성: 201/200 성공
  -> 잘못된 sourceWarehouseId 저장
  -> 대상 재고가 있으면 잘못된 창고 reserve/deduct가 정상 2xx
  -> 대상 재고가 없으면 후속 409
  -> 사전분류/재고조회에서는 200 + 빈 그룹/빈 page/빈 이름 가능
```

## 5. 사실과 다른 주석·단정 grep 전수

다음 검색을 `infrastructure`, `services`, `docs`, `.github` 전체에서 수행했다. `.git`, `node_modules`, `build`, `dist`, `target`은 제외했다.

```text
rg -n --no-ignore --hidden -g '!.git' -g '!node_modules' -g '!build' -g '!dist' -g '!target' \
  'inventory_db\.warehouses.*(실재|실제)|실재.*inventory_db\.warehouses|실재 행|실재 UUID|실재 fallback' \
  infrastructure services docs .github
```

### 5.1 실행/환경 설정에 남은 관련 단정

| 파일:줄 | 문구 성격 | 판정 |
|---|---|---|
| `infrastructure/terraform/templates/user_data.sh:184` | `inventory_db.warehouses 실재 행` | 현재 PC에서 행 존재는 참이지만, eCount 운영 정체성까지 검증한 것처럼 보이므로 운영 근거로는 오해를 부른다 |
| `infrastructure/.env.example:94` | 같은 `실재 행` 단정 | 예시 파일의 단정. 행 존재와 external code 대응을 구분하지 않는다 |
| `infrastructure/env-templates/slip-service.env:22` | `inventory_db.warehouses 실재 UUID (2026-08-01 조회값)` | 조회 시점/환경이 명시되지 않아 production authority처럼 읽힐 수 있다 |
| `services/slip-service/src/main/resources/application.yml:190` | `inventory_db.warehouses 실재 행이며 환경별 주입` | 행 존재는 참일 수 있으나 code/name/type 대응을 검증하지 않는 문장이다 |

반대로 `infrastructure/env-templates/.env.dev-seed:39-45`는 `실재 fallback`이며 변수명과 창고 정체성이 일치하지 않는다고 명시한다. 이 부분은 사실 오류를 숨기는 주석이 아니라 오히려 현재 문제를 경고하는 caveat다.

### 5.2 문서 기록/역사 자료의 전체 grep 결과

다음은 실행 경로가 아니라 과거 조사·리뷰 문서에 같은 표현이 기록된 위치다.

- `docs/dev-reports/2026-08-01-1035-recon.md:23,29-30`
- `docs/dev-reports/2026-08-01-1018-implementation.md:37`
- `docs/dev-reports/2026-08-02-1035-impl.md:85`
- `docs/dev-reports/2026-08-02-1035-r4-readme-env-fix.md:50`
- `docs/dev-reports/2026-08-02-1035-r3-postfix-reconvergence.md:15`
- `docs/dev-reports/2026-08-04-1055-r3-sol-review.md:108`
- `docs/dev-reports/2026-08-04-1055-zero-stock-warehouse-diagnosis.md:585`
- `docs/dev-reports/2026-08-06-1052-d2-recon.md:122`

따라서 grep상 **실행/설정 파일의 관련 단정은 4곳**(`user_data.sh`, `.env.example`, `slip-service.env`, `application.yml`)이고, 과거 문서의 반복 기록은 별도로 8개 파일에서 확인된다. 현재 PC DB만으로는 “실재 행”이라는 낱말 자체를 거짓이라고 판정할 수 없으며, 문제는 **실재 행이라는 사실을 운영 alias 검증으로 오인하게 만드는 의미 누락**이다.

## 6. 권위 원본 후보 — 이번 보고서에서 결정하지 않음

| 후보 | 저장소 근거 | 맡을 수 있는 권위 | 아직 확정할 수 없는 점 |
|---|---|---|---|
| A. inventory-service `warehouses` | `V2__seed_inventory_warehouses.sql:1-22`; `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/WarehouseRepository.java:20`의 `findByCode`; `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/InternalWarehouseController.java:28-70`의 by-code API | 내부 canonical warehouse의 UUID/code/name/type | 이 `code`가 eCount의 legacy `warehouseCode`와 동일 namespace인지 입증되지 않았다. 현재 값은 서로 별도 행이다 |
| B. eCount staging/importer | `services/inventory-service/src/main/resources/db/migration/V12__add_warehouse_ecount_staging.sql:34`; `EcountWarehouseImporter.java:70-74,90,159-197`의 staging, `warehouse_uuid`, mismatch 처리 | 외부 eCount code와 내부 warehouse의 alias/이관 근거 | 현재 production staging 행과 원천 export의 최신성·승인 상태를 확인하지 못했다 |
| C. legacy GAS/eCount 원천 | `tools/legacy-gas/종합견적서/index.html:1565-1566`; `tools/legacy-gas/종합견적서/Code.js:1830-1831`의 legacy code/name | eCount 코드와 표시명/업무 의미의 원천 | 현재 운영 DB의 최종 master와 동기화되는지 확인하지 못했다 |
| D. AWS Parameter Store/Secrets delivery | `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md:80-84`가 Parameter Store를 목표 source로 언급 | 운영 설정 전달 위치 | 현재 reader/parameter 이름/실제 값 주입이 구현되어 있지 않다 |
| E. 현재 `application.yml` 정적 map | `services/slip-service/src/main/resources/application.yml:189-196`; `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseCodeMapper.java:66-108` | 현재 요청을 처리하는 consumer | consumer일 뿐 권위 원본이 아니다. 이를 그대로 권위로 채택하면 같은 오류를 고정한다 |

이번 D3는 A~D 중 어느 것을 canonical로 선택하지 않는다. 특히 “조회 가능한 창고 행이 있다”와 “legacy external code가 그 행의 alias다”를 별도 증명해야 한다.

## 7. D2 권장 설계와 #1035 일곱 실패 대조

판정은 D2가 제안한 전체 묶음, 즉 canonical warehouse + external alias + `STRICT/DEV_SUBSTITUTE` 정책 + 기동 후 비동기 검증 + 상태/health/alert 노출을 기준으로 했다.

| #1035 실패 | D2 설계가 막는가 | 조건 및 남는 구멍 |
|---|---|---|
| 1. 라운드 2: 정상 warehouse 4개가 있어도 legacy 4/4 404로 기동 실패 | **예** | legacy code를 native UUID 역조회가 아니라 canonical alias 테이블에서 조회하면 된다. 단, 실제 alias 원본을 정하지 않거나 기존 by-code API를 그대로 쓰면 막지 못한다 |
| 2. 라운드 2: 일시 장애·늦은 기동·미실재를 구분하지 않아 context 영구 종료 | **예** | `UNAVAILABLE`과 `NOT_FOUND`를 분리한 상태, retry/backoff, 주기 재검증이 모두 있어야 한다. 비동기 one-shot만 추가하면 영구 종료를 막지 못한다 |
| 3. 라운드 4: 식별자가 뒤바뀌어도 FOUND 통과 | **예** | alias가 기대하는 canonical UUID와 실제 warehouse의 code/name/type을 pair compare해야 한다. UUID 존재성만 검사하면 실패한다 |
| 4. 라운드 4: `UNAVAILABLE` 매핑이 영구 미검증 | **예** | last-known 상태와 주기 재검증/재시도, 결과 상태 노출이 필요하다. 기동 후 한 번만 검사하면 막지 못한다 |
| 5. 라운드 4: 느린 서비스가 timeout 없이 기동 스레드 블록 | **예** | 검증을 기동 critical path 밖으로 빼고 connect/read/overall timeout 및 격리된 실행기를 둬야 한다. “async”라는 이름만으로는 충분하지 않다 |
| 6. 라운드 6: legacy 역조회 4/4 404 재발 | **예** | 정확한 reverse lookup을 제거하고 `(source_system, external_code)` alias를 단일 조회 장치로 사용해야 한다. canonical source와 alias가 비어 있으면 재발한다 |
| 7. 라운드 6: mismatch를 ERROR 로그만 남기고 health/readiness 불변 | **조건부** | 로그만으로는 **막지 못한다**. D2가 함께 제안한 gauge/CloudWatch-SNS/admin API/요청별 fail-closed 또는 503/health 반영까지 구현해야 사용자와 운영자가 상태를 볼 수 있다 |

추가로, D2의 핵심 네 요소만으로는 이 `user_data.sh`의 고정 dev seed 주입 자체를 예방하지 못한다. `STRICT`가 production에서 `DEV_SUBSTITUTE`를 금지하고, IaC 정적 guard가 placeholder/seed UUID를 차단하는 집행부가 반드시 있어야 한다. 이것이 없으면 비동기 검증이 잘못된 값을 나중에 발견할 뿐, 최초 배포 유입은 그대로 남는다.

## 8. 미판정 항목과 증거 경계

다음은 AWS 접근 없이는 결정하지 않는다.

- 실제 EC2 `/opt/samhanlogis/.env.production`의 현재 내용
- 실제 production `slip-service` 컨테이너의 환경변수와 이미지 버전
- 최초 user_data 이후 SSM/manual로 네 변수를 수정했는지 여부
- production `inventory_db.warehouses`의 네 seed 행과 native eCount 행 존재/재고/alias 상태
- 실제 운영 요청에서 `00003`, `2`, `14`, `1`이 얼마나 사용되는지와 잘못된 재고 이동 건수
- 현재 회사 PC의 `dev` 컨테이너/DB 관찰값이 production과 같은지 여부

따라서 본 보고서는 “운영 적용 **경로와 위험의 도달성**”은 확정하지만, “현재 AWS 운영에 **이미 적용되었다**”는 사실은 판정하지 않는다.

## 9. 신규 파일

- `docs/dev-reports/2026-08-06-1052-d3-production-applicability.md`

이 조사에서 기존 파일은 수정하지 않았다.
