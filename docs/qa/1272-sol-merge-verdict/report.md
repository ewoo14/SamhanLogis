# 검증 SHA: `148cd4c59`

PR #1272 CODEX SOL 적대검증 보고서. 검증 시작 시 `git log --oneline -3`의 선두는 `148cd4c59`였다. 검증 도중 브랜치와 원격 PR head가 `3570ea979355b767e48b63ef189290bf42dc0bbe`로 전진했다. 후속 커밋은 `origin/main` 병합이며 `148cd4c59..3570ea979` 사이 product-service, api-gateway, desktop, estimate-app 런타임 파일 차이는 0개다. 아래 데이터·라이브 실측의 직접 검증 기준은 지시된 구현 SHA `148cd4c59`이며, 최종 로컬 빌드와 CI 조회는 병합 head에서 수행했다.

## ① 검증 SHA

- 구현 검증 SHA: `148cd4c5975693e1835caf7a0102f1c97ac38f86`
- 게시 시 PR head: `3570ea979355b767e48b63ef189290bf42dc0bbe`
- SHA 차이: main의 메모리 문서만 병합됨. 이 PR의 런타임 구현 파일 차이는 없음.

## ② 수량 불변 실측

**실데이터 결과: 변경 `0/343` 세트. 성공 기준 충족.**

공유 `product_db`의 V45 실데이터를 격리 PostgreSQL에 binary custom dump로 복원한 뒤, 이전 전 1,584개 활성 구성행/343개 부모 세트를 별도 snapshot 테이블에 보존하고 V46→V47을 실제 적용했다. 적용 후 새 설정은 1,584행/343세트였고 다음을 SQL 전행 비교했다.

- 이전 구성행 누락: 0행
- 새 설정값과 이전 구성값이 다른 행: 0행
- 설정이 달라진 부모 세트: **0/343**
- 세트 수량을 1, 2, 7로 각각 전개해 비교한 변경 세트: 모두 **0/343**
- V47이 기존 `bundle_component` 행을 변경한 수: 0행

따라서 이는 SQL 구조만 본 “이론상 0”이 아니라 실제 운영 데이터 snapshot의 이전 전·후 전수 비교 결과다.

## ③ 웹 노출 무변화 근거

V47 전·후 `product_estimate_exposure` 전체 행을 양방향 `EXCEPT`로 비교한 결과 **차이 0행**, 활성 행은 전·후 모두 867행이었다. 새 설정의 `(product_id, estimate_category)` 401쌍 중 exposure가 없는 설정 전용 쌍은 354쌍이며, V47은 이 354쌍에 exposure 행을 만들지 않았다.

| 카테고리 | exposure 행 | 실제 노출 조건 충족 | 이전/이후 체크섬 |
|---|---:|---:|---|
| COMMERCIAL_MULTI | 416 | 382 | `c269dee72a3678c8f4d783b3f03e1910` |
| HOME_MULTI | 123 | 107 | `6016df56ebf8a111fb500fdd6107a70f` |
| LEGACY | 40 | 39 | `18c02d9ea4ab0e292ffdd5997cafad97` |
| SINGLE_SET | 288 | 224 | `e90fd9f985bc4e2c5a96759a6dc177e7` |

종합견적서 실서버 화면에는 SINGLE_SET 실제 API 원본 224품목이 주입됐고 빈 stub이 아니었다. 설정 전용 행과 웹 노출 행의 계약은 “설정 테이블 존재 여부로 노출하지 않고, `product_estimate_exposure`의 기존 활성/판매상태/usage_scope 조건만 사용”으로 DB 및 실제 종합견적 경로에서 확인됐다. 주문서웹 실 UI는 공유 bootstrap의 503으로 직접 완료하지 못했으며 ⑨에 분리했다.

## ④ 미매핑 14행 처리

미매핑은 soft-delete 부모 3개에 속한 기존 구성행 14개다.

- `QA797-SET-01`: 2행, FIXED
- `S3-1111-GUARD-20260807-S3`: 11행, FOLLOW_SET
- `S3-1111-GUARD-API-20260807-S3`: 1행, FOLLOW_SET

격리 DB에서 각 부모를 일시적으로 활성화하고 실제 브랜치 API의 카테고리 설정 조회를 호출한 뒤 원복했다. 응답은 각각 2/11/1행으로 모두 비어 있지 않았고, 새 설정행 0개 상태에서 기존 `bundle_component` 값을 fallback했다. 따라서 14행은 이전 대상에서는 제외됐지만 화면에서 조용히 빈 값이 되지 않는다.

## ⑤ 옵션 충돌 2쌍

마이그레이션은 한쪽을 선택해 버리지 않고 부모 구성행별 설정으로 모두 보존했다.

- COMMERCIAL_MULTI / `AM100AXVHHR1`: `(옵션 NULL, default=true)` 4부모와 `(S6-1111-MANUAL, true)` 1부모가 이전 후 그대로 존재.
- SINGLE_SET / `AWR-WE13N`: `(기본, true)` 3부모와 `(유선, false)` 62부모가 이전 후 그대로 존재.

충돌 단위가 구성품 모델 하나가 아니라 `(부모 세트의 bundle_component, estimate_category)`이므로 선택·유실은 없었다.

## ⑥ 기초품목에서 사라진 것

실제 데스크톱 기초품목 편집 화면에서 구성품 2행을 확인했다. 구성품별 `수량 동기화`, `품목구분`, `옵션` 편집기는 각각 0개로 제거됐고 견적품목 설정 모달에서 각각 2행으로 접근 가능했다. 반면 구성 관계, 기본수량, `고정금액` 2개와 판매가·매입가·출고가·배송가 영역은 남아 있었다. 납품가까지 같이 사라진 결함은 확인되지 않았다.

### 도달 결함 1 — 저장한 카테고리 설정이 실제 견적 소비 경로에서 무시됨

실제 견적품목 모달에서 `AM260AXVHHH1SY`의 구성품 `AM100AXVHHH1`을 `FIXED / ACCESSORY / SOL1272-REACHABILITY-PROBE`로 저장하고 재개방해 저장 성공을 확인했다. 그러나 종합견적서가 실제 호출하는 `/products/internal/estimate-catalog/components?category=COMMERCIAL_MULTI` 응답은 같은 행을 기존 `OUTDOOR / 옵션 NULL`로 반환했다.

원인은 `EstimateCatalogInternalController`와 `BundleExpander`가 새 `BundleComponentEstimateSetting`이 아니라 기존 `BundleComponentRepository`만 읽는 데 있다. 사용자는 화면에서 카테고리별 설정을 저장할 수 있지만 실제 견적 구성·수량 계산에는 반영되지 않는다. 개발책임자의 이전 목적에 직접 반하는 **머지 차단 도달 결함**이다.

### 도달 결함 2 — 실제 게이트웨이 경로에 신규 API 라우트가 없음

화면은 `/api/v1/products/{modelCode}/component-settings`를 호출하고 controller도 이 full path로 등록됐다. 그러나 api-gateway에는 기존 `/api/v1/products/*/components` no-strip 예외만 있고 `component-settings` 예외가 없다. 일반 `/api/v1/products/**` 라우트의 `StripPrefix=2`를 타면 backend에는 `/products/{modelCode}/component-settings`로 전달되어 controller와 불일치한다. 브랜치 JAR을 직접 연결하면 동작하지만 실제 사용자 게이트웨이 경로에서는 404가 되는 **머지 차단 도달 결함**이다.

## ⑦ V47 fresh 적용

- 완전 빈 PostgreSQL 16에서 V1부터 V47까지 **47개 전부 적용 성공**, product-service health `UP`.
- V45 실데이터 복원본에서 V46→V47 적용 성공, 최종 버전 v47, 새 설정 1,584행/343세트.
- 공유 DB에 적용된 V1~V45 파일 체크섬 집계와 현재 브랜치 V1~V45 파일 집계가 모두 `7c662cc65d161012c2876fa3e5ce013f`로 동일.
- PR diff상 기존 적용 migration 수정 없음. V47은 신규 파일이다.

## ⑧ 라이브 QA 스크린샷

모든 캡처는 `resolveQaShotsDir()` 경유 `_local` 경로이며 직접 열어 주장 화면과 일치함을 확인했다.

| 파일 | 화면 | 행 수 |
|---|---|---:|
| `docs/qa/1272-sol-merge-verdict/category-settings-real-qa/_local/01-estimate-items-filtered-row-real-qa.png` | 견적품목 COMMERCIAL_MULTI 검색 | 데이터 1행 |
| `docs/qa/1272-sol-merge-verdict/category-settings-real-qa/_local/02-estimate-items-category-settings-modal-real-qa.png` | 견적품목 카테고리 설정 모달 | 구성 설정 2행 |
| `docs/qa/1272-sol-merge-verdict/category-settings-real-qa/_local/03-basic-product-components-editor-real-qa.png` | 기초품목 편집, 3종 설정 제거 자리 | 구성품 2행, 고정금액 2개 |
| `docs/qa/1272-sol-merge-verdict/category-settings-real-qa/_local/04-comprehensive-estimate-single-catalog-real-qa.png` | 종합견적서 SINGLE_SET 목록 | 실제 API 원본 224품목, DOM 품목행 851개, viewport 식별 13행 |
| `docs/qa/1272-sol-merge-verdict/category-settings-real-qa/_local/05-saved-setting-reopened-real-qa.png` | 저장 후 다시 연 설정 모달 | 구성 설정 2행 |

라이브 Playwright 최종 실행은 2/2 통과했고 출력 행 수는 견적품목 1, 설정 2, 기초품목 구성 2, 종합견적 원본 224/DOM 851이었다.

## ⑨ 미검증 축

- 주문서웹 실 UI 품목 행 수: 공유 `/api/v1/partner-orders/bootstrap`이 검증 시점에 503을 반환해 실제 화면까지 도달하지 못했다. 따라서 이 축을 결함 0으로 세지 않는다. 단, 그 원천 노출 테이블은 V47 전·후 전행 diff 0이고 카테고리별 수와 체크섬도 동일하다.
- 게시 시 PR head `3570ea979`의 main 병합 문서 자체는 런타임 변경이 아니어서 구현 재검증 대상에 영향이 없지만, 직접 데이터 실측의 공식 anchor는 지시된 `148cd4c59`다.

## ⑩ CI 판정

- 로컬 Vitest: `categorySettingsMigration.test.ts` **2/2 통과**.
- 로컬 backend: `:services:product-service:compileJava` 및 `bootJar`를 `--rerun-tasks`로 실행, **14 tasks 실행 / BUILD SUCCESSFUL**.
- `git diff --check`: 통과.
- GitHub CI: 게시 직전 현재 head `3570ea979` 기준 **32개 QUEUED, GitGuardian 1개 SUCCESS**. 아직 green이 아니므로 CI 판정은 **대기 중**이다.
- CI가 green이 되더라도 위 도달 결함 2건은 해소되지 않는다.

## ⑪ 최종 판정

**머지 불가 — 사용자 도달 결함 2건.**

1. 견적품목 모달에서 저장한 카테고리별 수량동기화·품목구분·옵션이 실제 종합견적 소비/전개 경로에서 무시된다.
2. 신규 component-settings API의 api-gateway no-strip 라우트가 없어 실제 화면의 게이트웨이 호출 경로가 controller에 도달하지 못한다.

수량 이전 `0/343`, exposure 전행 무변화, 미매핑 fallback, 충돌 보존, V47 fresh 적용 자체는 실측상 정상이다.

## ⑫ 프로세스 회수

- 본 검증에서 기동한 browser/node/java 잔여: **0개**
- 본 검증 포트 5175/5183/18084/18085 listener 잔여: **0개**
- 본 검증 격리 컨테이너 `sol-1272-pg` 잔여: **0개**
- 공유 컨테이너: **24개 그대로 유지**
- 최종 확인 시 전체 실행 컨테이너는 26개로 관측됨: 공유 24개 + 다른 작업의 `sol1264r2-postgres`, `sol1266-pg` 2개. 다른 작업 컨테이너는 건드리지 않았다.
- git add/commit/push 및 제품 코드 수정: 수행하지 않음.
