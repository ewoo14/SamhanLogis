# 거래처 마스터 2벌 + importer 동명 품목 정찰

> 조사일: 2026-08-17 KST  
> 조사자: CODEX SOL  
> 저장소 기준: 로컬 `main` `607592515dba`, `origin/main` `d0250cd0e013`  
> 라이브 기준: 공유 스택 24개 컨테이너, PostgreSQL 읽기 전용 트랜잭션  
> 제한: 코드 수정·DB write·git add/commit/push·이슈/PR 게시·공유 컨테이너 재기동 없음

`origin/main`이 로컬 `main`보다 3커밋 앞서 있었으나, 대상 백엔드 파일(`ProductService`, `EcountProductImporter`, gateway, partner-service, dc-config-service)은 차이가 없었다. `order-app/samhanApi.ts`의 차이는 세트 배분가·사업자번호 fallback이며 `getCustomerData` 호출성에는 변화가 없었다.

## ① 한 장 요약

| 항목 | 2026-08-17 실측 | 사용자 영향/제약 영향 |
|---|---:|---|
| 유효 JWT로 `GET /api/v1/partners/{code}` | **404 재현** | API 계약은 실패한다. 다만 현행 주문서웹의 실제 호출은 **0곳**이라 화면에서 막힌 동작은 확인되지 않았다. |
| 활성 동명 품목 | **98그룹 / 374행** | 정확히 같은 `name`, 서로 다른 `product_code`, 양쪽 모두 `ACTIVE`, `is_deleted=false` 기준 |
| 그중 importer 생성 계보 | **13그룹 / 26행** | 13그룹 모두 ECOUNT 계보만으로 구성됨. importer가 동명 품목을 실제 DB에 남긴 증거다. |
| 이름 유니크 제약 위반 예상 | **98그룹 / 관련 374행 / 초과 276행** | 즉시 partial unique index를 만들면 실패한다. 삭제·병합 등으로 줄여야 하는 최소 초과행은 276행이다. |
| `dc_config_db.partners` | **211행** | 전부 활성·미삭제 |
| `partner_db.partners` | **8,324행** | 미삭제 7,310행, 그중 `ACTIVE` 7,305행 |
| 두 partners의 UUID 일치 | **0 / 211** | 물리 키 집합은 완전히 다르다. |
| 두 partners의 거래처코드·사업자번호 일치 | **211 / 211 · 211 / 211** | 업무 집합은 갈리지 않았다. dc-config 211행 전부가 partner-service에 같은 거래처코드와 정규화 사업자번호로 존재한다. |
| DC FK | **211 / 211 로컬 UUID** | `dc_configs.partner_id → dc_config_db.partners.id`이며 partner-service UUID를 가리키지 않는다. |

핵심 수치만 다시 적으면 다음과 같다.

```text
404                 실제 API 재현 1/1 · 현행 화면 호출 0곳
활성 동명            98그룹 · 374행
DB 제약 초과행       276행
importer 계보 동명   13그룹 · 26행
partners 중복        업무키 211/211 일치 · UUID 0/211 일치
```

PR #1267 본문의 기존 PM 수치 `0/216`은 현재 DB와 분모가 다르다. 현재 dc-config partners는 211행이며, `0`은 거래처 업무 집합의 교집합이 아니라 **UUID 교집합**으로 해석해야 실측과 맞는다.

## ② 404 상세

### 호출 지점과 현재 도달성

`clients/web/order-app/src/samhanApi.ts:436-437`은 legacy RPC 이름 `getCustomerData(partnerCode)`를 다음과 같이 등록한다.

```text
getCustomerData → GET /api/v1/partners/{partnerCode}
```

그러나 전체 `clients/web/order-app`에서 `getCustomerData` 문자열은 주석과 이 핸들러 정의에만 존재한다. `index.html`의 화면 스크립트는 이 RPC를 호출하지 않는다.

현재 실제 흐름은 다음과 같다.

```text
사업자 로그인
  → POST /api/v1/auth/partner-login
  → 로그인 응답 config.partnerName
  → index.html:8727 CURRENT_CUSTNAME 설정
  → 주문 저장 시 index.html:9427 CURRENT_CUSTNAME 사용
```

따라서 404 때문에 사용자가 현재 못 하는 화면 동작은 확인되지 않았다. 주문서웹의 로그인, 거래처명 표시, 주문 저장은 이 단건 조회가 아니라 로그인 응답의 거래처명으로 진행한다. `getCustomerData`가 미래 또는 외부 코드에서 호출되면 그 Promise가 404로 reject되지만, 현행 화면에는 그 호출자가 없다.

### 라이브 재현

지정된 QA 자격 resolver를 사용해 공유 gateway에서 다음 순서로 읽기 전용 호출했다.

```text
직원 로그인                         200
GET /admin/partners/search          200
검색된 활성 거래처의 코드 존재      true
GET /api/v1/partners/{code}         404 / NOT_FOUND
```

화면에서 발생하는 네트워크 404가 아니므로 화면 캡처는 만들지 않았다. 직접 API 호출로만 재현됐고, 화면 호출 지점은 0곳이었다.

### 컨트롤러와 gateway

비슷한 컨트롤러는 실제로 존재한다.

| 위치 | 경로 | 상태 |
|---|---|---|
| dc-config-service `PartnerPublicController` | `GET /partners/{partnerCode}` | public 응답 DTO를 반환하는 구현 존재 |
| partner-service `PartnerAdminController` | `GET /admin/partners/{partnerCode}` | 직원용 admin 단건 조회 |
| partner-service `PartnerInternalController` | `GET /internal/partners/{partnerCode}` | 서비스 간 단건 조회 |
| partner-service `Partner4TabController` | `GET /api/v1/partners/{partnerCode}/full` | 4탭 전체 조회 |
| partner-service | `GET /api/v1/partners/{partnerCode}` | **정확 매핑 없음** |

gateway `application.yml:292-300`은 `/api/v1/partners/**`를 no-strip으로 **partner-service**에 보낸다. dc-config-service의 `/partners/{code}`로 보내는 gateway route는 없다. 따라서 유효 JWT 이후의 실패 경계는 다음과 같다.

```text
order-app /api/v1/partners/{code}
  → gateway partner-service-v1 매칭
  → partner-service에 정확 컨트롤러 없음
  → 404
```

즉 대응 기능이 완전히 없는 것이 아니라, 다른 서비스에 `/partners/{code}`가 있고 gateway는 같은 외부 경로를 partner-service로 보내는 조합이다.

## ③ 두 저장소 partners 대조

### 생성 순서

| 저장소 | 최초 migration git 추가 | 공유 DB Flyway V1 적용 | 순서 |
|---|---|---|---|
| dc-config-service | 2026-05-05, `V1__init_dc_config.sql` | 2026-05-09 | 먼저 |
| partner-service | 2026-05-06, `V1__init_partner.sql` | 2026-06-23 | 나중 |

dc-config V1 주석은 당시 `partners`를 “옵션 A: M3 owner”로 만들었다. 그다음 partner-service V1이 별도 partners를 만들었다.

### 행 수와 스키마

| 항목 | dc-config-service | partner-service |
|---|---:|---:|
| 전체 행 | 211 | 8,324 |
| 미삭제 행 | 211 | 7,310 |
| `ACTIVE` 미삭제 | status 컬럼 없음 | 7,305 |
| 주요 키 | UUID PK, 활성 `partner_code` unique | UUID PK, 활성 `partner_code` unique, 활성 `biz_no` unique |
| 필드 폭 | 17컬럼 | 49컬럼 |
| 역할 | DC 설정용 로컬 거래처 + public/internal 조회 | 거래처 마스터·4탭·검색·신용·첨부·import |

dc-config partners는 `partner_group`, `manager`, `remark` 등 축소 필드를 갖고, partner-service partners는 이카운트 확장 필드와 상태·신용·주소·담당·그룹 등을 갖는다.

### 집합 비교

미삭제 행을 UUID, 정확 거래처코드, 숫자만 남긴 사업자번호, trim한 거래처명으로 대조했다.

| 대조 키 | dc-config 211행 중 partner-service 일치 |
|---|---:|
| UUID | 0 |
| 거래처코드 | 211 |
| 정규화 사업자번호 | 211 |
| trim한 거래처명 | 183 |

따라서 두 저장소가 서로 다른 거래처 집합을 읽는 것은 아니다. 동일 업무 거래처를 서로 다른 UUID로 복제했고, 이름은 28행에서 달라졌다. 거래처코드와 사업자번호는 211행 전부 연결 가능하다.

### FK 방향

공유 DB의 실제 FK는 다음 한 방향이다.

```text
dc_config_db.dc_configs.partner_id
  → dc_config_db.partners.id
```

활성 `dc_configs` 211행이 211개 로컬 partner UUID를 각각 가리킨다. 다른 PostgreSQL database인 `partner_db.partners.id`에는 물리 FK를 걸 수 없고, 현재 FK도 그 UUID를 가리키지 않는다.

### 기존 이슈와 결정

검색 결과 “거래처 마스터”와 “partner 정본”을 직접 다룬 전용 완료 이슈는 확인되지 않았다. #1259가 현재 중복 전수조사 소진 이슈로 열려 있고 PR #1267은 파일 변경 0인 트랙만 열린 상태다.

지정된 CLOSED 이슈의 실제 범위는 다음과 같다.

| 이슈 | 실제 범위 | partners 수렴 구현 |
|---|---|---|
| #809 | 거래처+품목 최근 수동단가 기억 | 없음 |
| #1092 | 종합견적서·주문서 웹 저장 견적의 정본 통합 | 없음 |
| #1144 | 매출·매입 회계전표 생성·연결 | 없음 |

세 이슈가 거래처를 소비하거나 언급하지만 dc-config partners 제거, partner-service로의 FK 이관, UUID 매핑은 구현하지 않았다. CLOSED 상태는 거래처 마스터 2벌의 해소 근거가 아니다.

## ④ 동명 품목 실측

### 수동 API와 importer의 차이

`ProductService.java:565-714`의 수동 생성·이름 변경·재활성화는 `assertNameAvailable`을 거친다.

```text
name.trim() 정확 일치
status = ACTIVE
is_deleted = false
수정 시 자기 id 제외
충돌 시 409
```

반면 `EcountProductImporter.java:391-432`는 `ProductService`를 호출하지 않고 native SQL로 쓴다.

```text
INSERT INTO products (... name=:name, product_code=:code ...)
ON CONFLICT (product_code) WHERE is_deleted=false
DO UPDATE SET name=EXCLUDED.name, ...
```

충돌 축은 `product_code`뿐이며 활성 `name`을 검사하지 않는다. DB에도 활성 이름 unique index가 없다.

### 공유 DB 수치

정확히 같은 `name`이고 서로 다른 `product_code`를 가진 `ACTIVE`, 미삭제 행을 집계했다.

| 지표 | 수치 |
|---|---:|
| 활성 품목 전체 | 2,982 |
| 활성 동명 그룹 | 98 |
| 활성 동명 관련 행 | 374 |
| 제약을 만족시키기 위해 줄여야 하는 초과행 `SUM(count-1)` | 276 |
| 2행 그룹 | 54 |
| 3행 이상 그룹 | 44 |
| 한 이름의 최대 행 수 | 14 |

계보별 활성 전체는 ECOUNT 1,963행, SHEET 1,019행, MANUAL 0행이다. 동명 그룹은 다음과 같이 갈린다.

| 동명 그룹 계보 | 그룹 | 행 |
|---|---:|---:|
| ECOUNT만 | 13 | 26 |
| SHEET만 | 85 | 348 |
| ECOUNT+SHEET 혼합 | 0 | 0 |
| MANUAL 포함 | 0 | 0 |

`products.lineage`는 V28에서 생성 경로를 보존한다. ECOUNT importer가 `ECOUNT_MIG2` category로 INSERT하면 DB trigger가 `lineage=ECOUNT`로 기록한다. 따라서 현재 13그룹·26행은 importer 경로로 만들어진 활성 동명의 식별 가능한 하한이다.

### 제약 가능성

현재 `products(name)` unique 제약/인덱스는 0개다. 정확 이름 기준 partial unique index를 지금 만들 경우 98그룹·374행이 충돌하고, 초과 276행 때문에 DDL이 완료되지 않는다.

PR #1024는 이 이유로 DB 제약을 만들지 않고 수동 API의 신규 등록·이름 변경·재활성화만 막았다. 당시에도 importer 등 우회 쓰기 경로와 동시 등록 경합은 범위 밖으로 명시됐다. 현재 수치는 당시 186그룹·696행보다 작지만 0은 아니다.

## ⑤ 이카운트 확정 2건과의 정합

### 확정 내용

1. 2026-05-19: 같은 이름과 품목관계가 확인되면 서로 다른 품목코드라도 같은 품목으로 보고 alias를 대표에 수렴한다.
2. 2026-07-28: 품목코드와 품목명이 일치하는 행이 대표품목이며, 관계 export로 대표를 확정한다.

현재 importer의 우선순위는 다음과 같다.

```text
1. 관계 export의 alias → 대표품목코드
2. 관계 export에 대표로 등재된 코드
3. 관계가 없으면 이름·규격·가격과 무관하게 자기 품목코드
```

`resolveMainCandidate`는 `code=name`을 스스로 판정하지 않는다. 대표 판정은 관계 export가 제공한 대표코드에 의존한다.

### 원본 관계 export 존재 여부

원본은 현재 다음 경로에 존재한다.

```text
docs/migration/ecount-data/raw/품목관계리스트-Excel다운로드.xlsx
```

기존 재취득·변환 보고서가 확인한 내용은 데이터 158행, 대표품목/연결품목 9컬럼이다. 현재 공유 DB도 `staging.ecount_item_relation_raw` 316행, 서로 다른 source file hash 2개, 대표코드 157개, 연결코드 157개를 보유한다. 158행 관계 원본이 두 차례 staging에 들어간 수치와 일치한다. `staging.ecount_item_raw`은 2,854행, `staging.ecount_item_alias`는 2,853행이다.

단, 현재 원본은 XLSX이고 controller의 운영 import 계약은 CSV다. 기존 실행은 XLSX를 임시 CSV로 변환해 관계를 적용했으며, 원본 자체를 XLSX multipart로 넣는 경로는 422로 거부한다.

### P2-02 변경과의 구조적 관계

충돌 여부는 동명 검사를 어느 시점에 적용하느냐에 따라 갈린다.

| 검사 위치/기준 | 확정 2건과의 관계 |
|---|---|
| raw 품목행을 관계 해석 전에 이름만 보고 차단 | 관계로 한 품목이 될 대표·alias 행까지 동명으로 거부할 수 있어 충돌한다. |
| 관계를 먼저 해석해 대표 하나로 수렴한 뒤, 서로 다른 대표 후보 사이의 활성 동명을 차단 | 관계 기반 동일성은 보존하고 관계가 없는 동명 분리만 fail-closed하므로 같은 방향이다. |
| DB에서 `name` 하나만 전역 unique로 강제 | 관계 여부·대표 여부를 표현하지 못하고 현재 98그룹과도 충돌한다. |

즉 P2-02는 “동명 문자열”만의 문제가 아니라 **관계 해석 전/후의 대표품목 단위** 문제다. 현재 13개 ECOUNT 동명 그룹은 관계 staging이 존재하는 환경에서도 서로 다른 대표 product로 남아 있으므로, 각 그룹이 원본 관계에서 별개 대표인지 관계 누락인지의 분류가 선행돼야 한다.

## ⑥ 착수 계획 제안

아래는 선택을 대신하지 않고 의존성만 기준으로 나눈 4개 슬라이스다.

| 순서 | 슬라이스 | 산출 범위 | 선행 조건 |
|---:|---|---|---|
| 1 | 외부 거래처 단건 계약 | 선택된 owner의 public DTO·controller·gateway route·404/200 계약 테스트, 주문서웹 실제 호출/미호출 계약 고정 | §⑦의 owner와 외부 응답 계약 결정 |
| 2 | 거래처 마스터 수렴 | 211개 업무키 매핑표, DC FK/참조축 변환, 두 DB 행 수·업무키·UUID 사후 대조, rollback/forward migration 검증 | §⑦의 DC 참조 방식 결정 |
| 3 | importer 대표 단위 가드 | 관계 export 해석 후 대표 후보 단위의 동명 검사, 관계 있음/없음·code=name 대표·재실행 테스트 | §⑦의 관계 파일 필수성·동명 처리 결정 |
| 4 | 기존 동명 정리와 DB 제약 | 98그룹을 ECOUNT 13/SHEET 85로 분류, 각 그룹 처분표, 초과 276행 0 확인 뒤 선택된 제약 DDL 검증 | §⑦의 기존 데이터 처분·제약 범위 결정 |

슬라이스 1은 현재 사용자 화면을 막는 호출이 아니라 죽은 외부 계약을 다룬다. 슬라이스 2는 데이터 owner와 FK를 바꾸므로 별도 migration/검증 경계를 둔다. 슬라이스 3은 앞으로 생길 동명을 막는 경로이고, 슬라이스 4는 이미 존재하는 98그룹을 다루므로 분리된다.

## ⑦ 판단이 필요한 지점

아래 항목은 이번 정찰에서 고르지 않았다.

1. 거래처 master owner를 partner-service로 둘지, dc-config-service로 둘지, 복제를 유지할지.
2. 외부 `GET /api/v1/partners/{code}`가 dc-config의 축소 public DTO를 반환할지, partner-service의 별도 public DTO를 가질지, 기존 admin/internal/full 중 하나를 변환해 쓸지.
3. `dc_configs`가 partner-service의 `partner_code`를 논리 참조할지, partner UUID snapshot을 저장할지, 로컬 partners 복제를 유지할지.
4. 이름이 같고 관계가 없는 두 ECOUNT 행을 즉시 거부할지, 보류 staging으로 둘지, 별도 대표판정 입력을 요구할지.
5. SHEET-only 동명 85그룹·348행을 이름 유니크 정책의 정리 대상으로 볼지, 별도 의도된 동명으로 둘지.
6. DB 제약을 정확 `name` 기준으로 둘지, 정규화 이름 기준으로 둘지, 제약 없이 service/import 경로 가드만 둘지.
7. 관계 export를 importer의 필수 입력으로 만들지, optional을 유지하되 동명 발생 시 fail-closed할지.
8. 운영 입력을 CSV로 고정할지, 현재 보관 원본인 XLSX도 직접 받게 할지.

## ⑧ 프로세스 회수

```text
코드 수정                         0건
공유 DB write                     0건
git add/commit/push               0건
이슈/PR 게시                      0건
화면 캡처                         0장 (화면 호출 0곳, 직접 API 404만 재현)
본 정찰이 기동한 지속 프로세스     0개
본 정찰이 기동한 컨테이너           0개
본 정찰이 중지/재시작한 컨테이너    0개
본 정찰 기동분 잔여 프로세스        0개
공유 컨테이너 최종 상태             24/24 healthy, unhealthy 0
```

사용한 Node·PowerShell·psql 호출은 모두 단발 실행으로 종료됐다. 다른 라운드의 프로세스와 지정된 worktree는 회수·변경하지 않았고, 공유 스택은 그대로 유지했다.

## 근거 위치

- `docs/dev-reports/2026-08-17-duplication-audit/A-db-schema.md:35-40,65-72,86-95`
- `docs/dev-reports/2026-08-17-duplication-audit/B-endpoints.md:35-40,45-51,75-87,91-100,107-115`
- `clients/web/order-app/src/samhanApi.ts:436-437`
- `clients/web/order-app/index.html:8721-8731,9423-9433`
- `services/api-gateway/src/main/resources/application.yml:282-300,619-652`
- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/PartnerPublicController.java:26-49`
- `services/dc-config-service/src/main/resources/db/migration/V1__init_dc_config.sql:12-78`
- `services/partner-service/src/main/resources/db/migration/V1__init_partner.sql:13-53`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:565-714`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:321-337,348-432`
- `.claude/memory/project_ecount_product_identity_rule.md`
- `.claude/memory/project_ecount_main_item_rule_2026_07_28.md`
- `docs/dev-reports/2026-08-03-984-relation-source-recount.md:10-24,50-58`
- `docs/dev-reports/2026-08-03-984-relation-import-2.md:44-73,176-180`
- Issue #809, #1092, #1144, #1019, PR #1024, PR #1267 — 읽기 전용 조회
