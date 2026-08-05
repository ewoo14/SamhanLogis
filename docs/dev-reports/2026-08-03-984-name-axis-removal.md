# PR #984 이름 축 제거 조사 기록

- 대상 브랜치: `fix/ecount-import-model-code-merge`
- 대상 HEAD: `d22e07935`
- 조사 시작: 2026-08-03
- 범위: 병합 키에서 이름 축 제거 및 회귀 검증

## 조사 로그

### 시작

개발책임자 결정에 따라 품목코드가 다르면 다른 품목으로 취급하고, 관계 원본이 명시한 관계만 병합한다. 규격은 병합 키·판정에 사용하지 않는다. 본 문서는 조사 결과를 확인할 때마다 즉시 누적한다.

### ① R11 라벨 확장은 이름 축인가

**판정: 이름 축이다. 제거한다.**

- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasResolveService.java:50`에서 exact alias 조회 직후 `resolveUniqueActiveNames(distinct, resolvedAliases)`를 호출한다.
- 같은 파일 `:64-66`은 공백이 포함된 요청만 `label 후보`로 취급한다: `code.chars().anyMatch(Character::isWhitespace)`.
- 같은 파일 `:73-76`은 `products p`의 `p.name IN (:names)`와 활성·유일 이름 조건으로 조회한다.
- 같은 파일 `:93-98`은 그 이름 조회 결과를 `resolvedAliases.putAll(nameMatches)`로 alias 해석 결과에 넣는다.

즉 품목코드/관계 원본이 아니라 입력 라벨을 활성 Product의 `name`과 대조해 품목을 해소한다. 이는 “품목코드가 다르면 다른 품목” 및 “관계 원본이 명시한 관계만 병합” 결정과 충돌하므로 제거 대상이다.

### 이름 축 전수 조사 — 1차

- `EcountAliasResolveService.java:50,64-98`: 라벨→활성 Product 이름 fallback.
- `EcountProductImporter.java:98,104,126,135-155`: 이름별 행 집합과 `ProductIdentity` 기반 그룹 병합.
- `EcountProductImporter.java:402-435`: `findActiveProductCodeByName` 및 동일 이름 건수로 main 후보 결정.
- `EcountProductImporter.java:463-475`: `fallbackSameNameCandidate` 및 이름 기반 기존 DB main 재사용.
- `EcountProductImporter.java:478-505`: `rawCandidatesByName`, `sameNameMergeReason`, `ProductIdentity(name, fingerprint)`.
- `EcountProductImporter.java:508-523`: fingerprint 판정이 `ProductIdentity`의 이름 필드와 결합됨.
- `EcountProductImporter.java:780-794`: `findActiveProductCodeByName` SQL (`WHERE name = :name`) 및 이름 기준 재사용.

`mergeExplicitRows`의 규격 처리(`:282-301`)는 관계로 이미 성립한 병합의 필드 보완이지만, 규격을 판정/키로 사용하지 않는 결정에 맞춰 별도 정리한다.

### 변경 및 이유

- `EcountAliasResolveService.java:42-61`: exact `staging.ecount_item_alias` 조회만 남겼다. R11의 공백 포함 라벨→`products.name` fallback을 삭제해 이름만으로 alias를 만들지 않는다.
- `EcountProductImporter.java:101-145,180-200,321-337`: 행의 후보는 관계 원본이 지정한 대표 코드 또는 관계 없는 행 자신의 품목코드만 사용한다. 이름·fingerprint·규격으로 대표코드를 고르거나 행을 재그룹화하지 않는다.
- `EcountProductImporter.java:198-226`: 필드 보완은 관계 원본으로 이미 묶인 행에만 적용하고, 규격 열은 병합 키·판정·보완에서 제외했다.
- 제거한 경로: `ProductIdentity(name, fingerprint)`, `normalRowsByName`, `findActiveProductCodeByName`, `fallbackSameNameCandidate`, `findApprovedRawMainRow`, 이름 기반 fingerprint 재그룹화 전부.
- 유지한 경로: `UPDATE_ACTIVE_MODEL_NAME_SQL`(`EcountProductImporter.java:435-487`)은 품목명 `name`이 아니라 입력 품목코드 `:code`와 `lineage='SHEET'`를 대조하는 코드축 legacy 보존 경로이므로 이름 축 병합이 아니다.

### 회귀 테스트

- `EcountProductImporterSameNameMergeTest`: 동명이코드 `AAAA-00004`/`AAAA-00005`를 관계 없이 각각 2품목으로 유지하는 테스트로 변경했다.
- 같은 테스트에서 관계가 있으면 alias로 1품목에 연결되고, 필드별 비어 있지 않은 값 보완 및 AP110RNPPHH1 싱글 `662000`을 계속 검증한다. 규격 공백 차이는 병합 판정이 아니라 대표행 값을 유지한다.
- `EcountProductImporterTest`: 관계 없는 동명이코드·코드명 유사 행은 코드별 분리, 관계 main이 raw/DB에 없으면 alias 승격 금지, 이름 DB fallback SQL 미호출을 고정했다.
- `EcountAliasResolveServiceIT`: 활성 Product의 정확한 품목명 라벨도 alias 없이 해소하지 않음을 고정했다.

### 실 데이터 기준 차단 건수

- R11 read-only projection의 실 PENDING 데이터: 26,055행 / 3,489주문 / 474라벨.
- projection상 정상 주문 차단: **0건**(기존 R7 오차단 3,489건에서 0건).
- 단, `docs/dev-reports/2026-08-03-984-live-qa.md`에 기록된 것처럼 이번 라운드는 실 임포트를 실행하지 않았고 선행 임포트가 409로 중단되어 live transform 재측정은 **미실시**다. 따라서 위 0건은 projection 수치이며, 다음 PM 직렬 임포트 라운드에서 실 transform으로 재확인해야 한다.

### 새로 만든 파일

- `docs/dev-reports/2026-08-03-984-name-axis-removal.md` — 본 조사·변경·검증 기록.
