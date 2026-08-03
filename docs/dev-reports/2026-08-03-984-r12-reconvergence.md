# PR #984 R12 재수렴 적대검증 보고서

- 대상: `fix/ecount-import-model-code-merge`
- 기준 HEAD(사용자 제공): `245c0246e` (R11 fix + main 병합)
- 검증일: 2026-08-03
- 검증 원칙: 읽기·조사·테스트만 수행. 소스, 실 DB, 컨테이너 상태를 변경하지 않는다.
- 유일한 질문: **실 사용자 경로로 재현 가능한 결함이 있는가.**
- 유일한 각도: **R11에서 넓힌 매칭·병합 범위가 과하여, 합쳐지면 안 되는 품목이 합쳐지거나 막아야 할 주문이 통과하는가.**

## 진행 기록

보고서를 조사 전에 생성했다. 이후 각 확인의 실행 명령 원문, 출력 원문, 판정을 확인 즉시 아래에 누적한다.

### 선행 기록 1 — R11 fix 보고서 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-984-r11-fix.md' -Raw -Encoding UTF8
```

확인한 R12 재현 대상 원문:

```text
- R11 후보 + 유일한 활성 Product 정확한 품목명 fallback 적용: 26,055/26,055행,
  474/474라벨, 3,489/3,489주문 해소, 정상 주문 거부 0건
- 현재 active alias: 2,835건, deleted/dangling UUID alias: 0건
- 결과 집계: ① 23그룹, ② 2그룹, ③ 1그룹. 대표행이 비어 있어 연결행으로
  보완된 필드의 값 소실은 0건이며, AP 그룹의 실제 충돌은 결정값 662,000으로 처리했다.
PRODUCT_TESTS=652
PRODUCT_FAILURES=0
ACCOUNTING_TESTS=1737
ACCOUNTING_FAILURES=0
ACCOUNTING_ERRORS=0
ACCOUNTING_SKIPPED=10
```

추가로 확인한 입력 해시 주장:

```text
품목관계리스트.xlsx = 017E5FD2D5099124C5A8DCF10D9B301783A78FD15E31E3AD6FF949D779EB3517
품목등록.xlsx = 3FD1A174D1EE9E3C8AA2F303AF932E331F8EB7BA646392DB2122DDF5B77DAE52
품목-Excel다운로드.csv = 02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C
품목관계-Excel다운로드.csv = 00A1964DF081FEDB1E1AF270ED0110345E1F856531EB630210F6E5BA7867DE85
품목계층그룹-Excel다운로드.csv = 4955F2999017F37511AF3ADE552113FA30C0628B081D6B992F7D171A7CC1EB7E
```

판정: 선행 기록을 읽었다. 위 수치와 해시는 아직 R12 실측으로 재현한 값이 아니며, 이후 독립 실행으로 대조한다.

### 선행 기록 2 — PM 관계 원본 재계수 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-984-relation-source-recount.md' -Raw -Encoding UTF8
```

확인한 원문:

```text
관계 edge        158
형성된 그룹       157
그룹 내 코드      315
품목마스터 미존재    0
업무값 상이 그룹   26
업무값 같고 품목명만 상이   1

① 한쪽만 값 있음 23그룹
② 공백 문자 차이만 2그룹
③ 실제 값 충돌 1그룹

AP110RNPPHH1 싱글 662,000 ↔ PHN-00027 싱글 680,000
```

판정: 개발책임자 결정의 적용 범위는 명시적 관계 26그룹이며, 관계 밖 구조적 fingerprint 우회 1경로(실 발화 27그룹/28행)는 별도 R12 확인 대상임을 확인했다. 위 계수 역시 아직 R12 독립 재현 전이다.

### 선행 기록 3 — R10 진자운동 이력 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-02-984-r10-postfix-reconvergence.md' -Raw -Encoding UTF8
```

확인한 R12 기준점 원문:

```text
구조적 우회 경로: 1개
우회 source: explicit relation alias, relation main, 승인 raw main
현재 raw에서 결과를 실제로 바꾸는 발화: 27그룹/28행
그중 업무값 상이: 26 distinct ProductIdentity / 26 raw row (XLSX 25 + 승인 raw 1)
품목명만 상이: 1 distinct ProductIdentity / 2 raw row
```

또한 R10 기록 해시는 현재 PC의 원본과 불일치했다고 문서 자체가 명시한다:

```text
R10 RAW_SHA256=7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678
R10 REL_SHA256=F7918B9FC9D88B75A5A14A014436D3E99DABEAE4E860493F5DAB9AD7D3D5DE35
```

판정: R12는 현재 재취득 XLSX를 기준으로 구조적 우회가 관계·승인 direct mapping 밖의 동일명/fingerprint 그룹까지 보완하는지를 코드·테스트·실데이터 투영으로 다시 확인해야 한다. R10의 구 해시는 현재 입력의 기대 해시로 사용하지 않는다.

### 저장소 핸드오프 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\handoff\CURRENT-WORK.md' -Raw -Encoding UTF8
```

확인 원문:

```text
#984: 한쪽만 값 있음 23, 공백 문자 차이만 2, 실제 값 충돌 1
개발책임자 결정: AP110RNPPHH1 싱글 662,000
```

판정: 핸드오프의 결정값과 R11/PM 재계수 보고서가 일치한다. 컨테이너·라이브QA는 다른 PR 배포 상태이므로 R12 증거에서 배제한다.

### 저장소 행동 보강 규칙 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath '.codex\AGENTS.md' -Raw -Encoding UTF8
```

판정: PowerShell UTF-8 규칙과 사용자 호칭을 확인했다. 본 보고서는 `apply_patch`로만 누적하며 소스는 수정하지 않는다.

## ① 과다 매칭 — 다른 물건이 같은 alias로 해소되는가

### ①-1 구현 표면 위치 확인

실행 명령 원문:

```powershell
rg -n --hidden --glob '!docs/dev-reports/2026-08-03-984-r12-reconvergence.md' "aliasToken|aliasCandidates|build.*andidate|candidate|resolveAliases|findUnique|unique.*name|exact.*name|MIG8_LOOKUP" services/accounting-service/src/main services/product-service/src/main services/accounting-service/src/test services/product-service/src/test
```

관련 출력 원문:

```text
services/accounting-service/src/main/.../Mig8OrderTransformService.java:498:        for (String candidate : lookupCandidates(itemName)) {
services/accounting-service/src/main/.../Mig8OrderTransformService.java:512:        LinkedHashSet<String> candidates = new LinkedHashSet<>();
services/accounting-service/src/main/.../Mig8OrderTransformService.java:521:            candidates.add(labelBase);
services/accounting-service/src/main/.../Mig8OrderTransformService.java:522:            candidates.add(labelBase.replaceAll("\\s+", ""));
services/accounting-service/src/main/.../Mig8OrderTransformService.java:536:                candidates.add(leading.substring(0, hyphen));
services/product-service/src/main/.../EcountProductImporter.java:517:    private boolean isFingerprintCompatibleCandidate(...)
```

판정: 과다 매칭의 사용자 경로는 accounting의 `lookupCandidates`가 만든 여러 문자열을 product-service resolver가 UUID로 해소한 뒤 첫 일치 후보를 선택하는 경로다. 구조적 fingerprint 우회는 별도로 `EcountProductImporter.isFingerprintCompatibleCandidate`에 있다.

### ①-2 후보 순서와 resolver 중복 거부 구현 확인

실행 명령 원문:

```powershell
$p='services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\Mig8OrderTransformService.java'; $c=Get-Content -LiteralPath $p -Encoding UTF8; $c[90..140]; $c[480..558]; Get-Content -LiteralPath 'services\product-service\src\main\java\com\samhanair\logis\product\service\EcountAliasResolveService.java' -Raw -Encoding UTF8
```

출력 원문(핵심):

```java
for (String candidate : lookupCandidates(itemName)) {
    UUID exact = productAliasCache.get(candidate);
    if (exact != null) {
        return exact;
    }
}

candidates.add(normalized);
candidates.add(token);
...
candidates.add(labelBase);
candidates.add(labelBase.replaceAll("\\s+", ""));
...
if (!looksLikeHyphenatedCode(leading)) {
    ... candidates.add(leading.substring(0, hyphen));
}
```

```sql
SELECT a.alias_code, a.main_product_uuid
  FROM staging.ecount_item_alias a
  JOIN products p ON p.id = a.main_product_uuid AND p.is_deleted = FALSE
 WHERE a.alias_code IN (:codes)
```

```sql
SELECT p.name, p.id
  FROM products p
 WHERE p.name IN (:names)
   AND p.is_deleted = FALSE
   AND NOT EXISTS (
       SELECT 1 FROM products duplicate
        WHERE duplicate.name = p.name
          AND duplicate.is_deleted = FALSE
          AND duplicate.id <> p.id)
```

판정: 한 라벨에 여러 후보가 활성 alias로 해소되면 **후보 순서상 첫 UUID를 조용히 선택**한다. 반면 정확한 활성 Product 이름 fallback은 동일 활성 이름이 2개 이상이면 SQL에서 전부 배제한다. 따라서 실데이터 충돌 계수는 (a) 서로 다른 라벨이 같은 후보를 만드는 경우와 (b) 한 라벨의 후보들이 서로 다른 활성 UUID로 해소되는 경우를 분리해 세어야 한다.

### ①-3 읽기 전용 DB 접근 대상 확인

실행 명령 원문:

```powershell
docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}"
```

관련 출력 원문:

```text
samhan-accounting-service|infrastructure-accounting-service|Up About an hour (healthy)
samhan-product-service|infrastructure-product-service|Up 3 hours (healthy)
samhan-postgres|postgres:16-alpine|Up 3 hours (healthy)
```

판정: DB 컨테이너 `samhan-postgres`가 조회 가능하다. 서비스 컨테이너 응답은 다른 PR 배포 상태이므로 증거로 사용하지 않으며 재기동하지 않는다. 이후 DB 명령은 `BEGIN TRANSACTION READ ONLY` SELECT만 사용한다.

DB 조회 명령 선례 탐색 첫 시도 원문:

```powershell
rg -n "docker exec .*psql|psql -U|accounting_db|product_db" docs/dev-reports/2026-08-0*-984*.md | Select-Object -First 120
```

출력 원문:

```text
rg: docs/dev-reports/2026-08-0*-984*.md: IO error ... (os error 123)
```

판정: Windows 경로 glob 구문 오류로 조회하지 못했다. 데이터·서비스 상태에는 영향이 없으며 `rg --glob`으로 다시 조회한다.

재시도 명령 원문:

```powershell
rg -n --glob '2026-08-0*-984*.md' "docker exec .*psql|psql -U|accounting_db|product_db" docs/dev-reports | Select-Object -First 160
```

관련 출력 원문:

```text
docs/dev-reports\2026-08-02-984-r10-postfix-reconvergence.md:612:- DB: `docker exec ... psql` SELECT만 사용, 모든 SQL은 `BEGIN TRANSACTION READ ONLY`/COMMIT
docs/dev-reports\2026-08-03-984-r11-fix.md:84:- 실 DB read-only 계수(2026-08-03, `accounting_db`의 `staging.ecount_order_raw`,
docs/dev-reports\2026-08-03-984-r11-fix.md:85:  `product_db`의 active alias/product) 결과:
```

판정: 과거 보고서는 실행 가능한 접속 명령을 보존하지 않았다. 저장소 설정에서 DB 사용자명만 확인한 뒤 읽기 전용 SQL을 구성한다.

실행 명령 원문:

```powershell
rg -n --glob '*.yml' --glob '*.yaml' --glob '*.properties' --glob '*.env.example' "POSTGRES_USER|spring.datasource.username|jdbc:postgresql.*product_db|jdbc:postgresql.*accounting_db" infrastructure services | Select-Object -First 120
```

출력 원문:

```text
services\accounting-service\src\main\resources\application.yml:9:    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:accounting_db}
services\product-service\src\main\resources\application.yml:9:    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:product_db}
infrastructure\.env.example:6:POSTGRES_USER=samhan
infrastructure\docker-compose.yml:40:      POSTGRES_USER: samhan
```

판정: 읽기 전용 조회 대상과 접속 사용자는 `accounting_db`, `product_db`, `samhan`이다.

accounting staging 구조 첫 조회 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='staging' AND table_name='ecount_order_raw' ORDER BY ordinal_position; SELECT status, COUNT(*) FROM staging.ecount_order_raw GROUP BY status ORDER BY status; COMMIT;"
```

출력 원문(오류 포함):

```text
BEGIN
...
 transform_status | character varying
...
(27 rows)

ERROR:  column "status" does not exist
```

판정: 상태 컬럼의 실제 이름은 `transform_status`다. 트랜잭션은 두 번째 SELECT 오류로 중단됐고 읽기 전용이므로 변경은 없다. 컬럼명을 고쳐 재조회한다.

재조회 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT COALESCE(transform_status,'<NULL>') AS transform_status, COUNT(*) AS rows, COUNT(DISTINCT order_no) AS orders, COUNT(DISTINCT item_name) AS labels FROM staging.ecount_order_raw WHERE is_deleted=FALSE GROUP BY transform_status ORDER BY transform_status; COMMIT;"
```

출력 원문:

```text
BEGIN
   transform_status   | rows  | orders | labels
----------------------+-------+--------+--------
 MIG4_AMOUNT_INVALID  |    24 |      0 |      5
 MIG4_SLIP_NO_INVALID |     5 |      0 |      0
 PENDING              | 26055 |   3489 |    474
(3 rows)

COMMIT
```

판정: R11의 입력 모집단 `PENDING 26,055행 / 3,489주문 / 474라벨`이 현재 실 DB에서 그대로 재현된다.

product DB 구조·기초 계수 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='staging' AND table_name='ecount_item_alias' ORDER BY ordinal_position; SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='products' ORDER BY ordinal_position; SELECT COUNT(*) AS alias_rows, COUNT(DISTINCT alias_code) AS distinct_alias_codes FROM staging.ecount_item_alias; SELECT COUNT(*) FILTER (WHERE is_deleted=FALSE) AS active_products, COUNT(*) FILTER (WHERE is_deleted=TRUE) AS deleted_products FROM products; COMMIT;"
```

출력 원문(계수):

```text
alias_rows | distinct_alias_codes
-----------+---------------------
      2835 |                 2835

active_products | deleted_products
----------------+-----------------
           3061 |                2
```

판정: R11의 `active alias 2,835건`이 재현되며 alias_code는 전부 유일하다. 현재 Product는 활성 3,061건, 삭제 2건이다. alias 테이블 자체의 동일 코드 복수 UUID 임의 선택 표면은 없다.

후보 구현 정밀 확인 명령 원문:

```powershell
$p='services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\Mig8OrderTransformService.java'; $c=Get-Content -LiteralPath $p -Encoding UTF8; $c[510..560]; rg -n "static String stripCell|String stripCell" services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountCsvSupport.java; Get-Content -LiteralPath 'services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\EcountCsvSupport.java' -Encoding UTF8 | Select-Object -First 100
```

출력 원문(실패 포함):

```text
String leading = normalized.substring(0, leadingEnd);
if (!looksLikeHyphenatedCode(leading)) {
    for (int hyphen = leading.lastIndexOf('-'); hyphen > 0;
         hyphen = leading.lastIndexOf('-', hyphen - 1)) {
        candidates.add(leading.substring(0, hyphen));
    }
}
...
if (Character.isWhitespace(c) || c == '[' || c == '(') {
    end = i;
    break;
}
rg: .../service/EcountCsvSupport.java: ... 파일을 찾을 수 없습니다.
```

판정: prefix 생성과 token 절단 규칙은 확인했다. `EcountCsvSupport`의 package 경로 추정이 틀려 `stripCell` 구현은 아직 미확인이다. 파일 위치를 검색해 다시 읽는다.

검색 명령 원문:

```powershell
rg -n "class EcountCsvSupport|static String stripCell|String stripCell" services/accounting-service/src/main/java services/accounting-service/src/test/java
```

출력 원문:

```text
(출력 없음, exit 1)
```

판정: accounting-service 내부에 선언이 없다. 저장소 전체에서 심볼 정의를 찾는다.

저장소 전체 검색 명령 원문:

```powershell
rg -n "class EcountCsvSupport|static String stripCell|String stripCell" . --glob '!docs/dev-reports/2026-08-03-984-r12-reconvergence.md' --glob '!build/**' --glob '!.gradle*/**'
```

출력 원문:

```text
command timed out after 14031 milliseconds
```

판정: 넓은 검색이 빌드 산출물 경로 때문에 시간 초과됐다. `rg --files`로 파일명부터 좁힌다.

파일명 검색 명령 원문:

```powershell
rg --files | rg 'EcountCsvSupport\.java$|Ecount.*Csv.*\.java$'
```

출력 원문:

```text
(출력 없음, exit 1)
```

판정: 해당 심볼은 별도 Java 파일명이 아니다. `Mig8OrderTransformService` import와 모듈 source set을 확인한다.

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\Mig8OrderTransformService.java' -Encoding UTF8 | Select-Object -First 60; rg -n "EcountCsvSupport" services shared common modules libs --glob '*.java' --glob '*.kt' 2>$null
```

관련 출력 원문:

```text
import com.samhanair.logis.common.ecount.EcountCsvSupport;
shared\common\src\main\java\com\samhanair\logis\common\ecount\EcountCsvSupport.java:23:public final class EcountCsvSupport {
```

판정: `stripCell` 정의는 `shared/common`에 있다. 명령은 존재하지 않는 일부 검색 루트 때문에 exit 1이었지만 필요한 위치는 확인됐다.

실행 명령 원문:

```powershell
rg -n -A 12 -B 4 "stripCell\(" shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountCsvSupport.java
```

출력 원문:

```java
public static String stripCell(String raw) {
    if (raw == null) {
        return "";
    }
    return raw.replace("\t", "").strip();
}
```

판정: 실데이터 투영에서 탭 제거 후 양끝 Unicode whitespace 제거를 적용한다. DB 라벨에는 탭 여부도 별도로 계수해 Java와 PowerShell 구현 차이 위험을 없앤다.

### ①-4 전체 R11 후보 집합의 실데이터 충돌 1차 투영

실행 명령 원문:

```powershell
# 한 PowerShell 프로세스에서 다음 세 읽기 전용 SELECT 결과를 메모리로 수집했다.
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -qAt -F "`t" -c "BEGIN TRANSACTION READ ONLY; SELECT item_name, COUNT(*) FROM staging.ecount_order_raw WHERE is_deleted=FALSE AND transform_status='PENDING' GROUP BY item_name ORDER BY item_name; COMMIT;"
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -qAt -F "`t" -c "BEGIN TRANSACTION READ ONLY; SELECT a.alias_code, a.main_product_uuid FROM staging.ecount_item_alias a JOIN products p ON p.id=a.main_product_uuid AND p.is_deleted=FALSE ORDER BY a.alias_code; COMMIT;"
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -qAt -F "`t" -c "BEGIN TRANSACTION READ ONLY; SELECT p.name, p.id FROM products p WHERE p.is_deleted=FALSE ORDER BY p.name,p.id; COMMIT;"

# `stripCell`, `lookupCandidates`, alias JOIN, 공백 포함 유일 활성 name fallback,
# 후보 순서상 첫 UUID 선택을 Java와 동일하게 PowerShell 함수로 투영했다.
# 후보별 공유 라벨 수, 한 라벨에서 해소되는 distinct UUID 수, 최종 미해소를 집계했다.
```

출력 원문(집계):

```text
PENDING_LABELS=474
PENDING_ROWS=26055
TAB_CONTAINING_LABELS=0
ACTIVE_ALIAS_CODES=2835
ACTIVE_PRODUCT_NAMES=3061
SHARED_NORMALIZED_CANDIDATE_GROUPS=161
SHARED_NORMALIZED_CANDIDATE_LABELS=314
SHARED_NORMALIZED_CANDIDATE_ROWS=25066
RESOLVABLE_SHARED_CANDIDATE_GROUPS=121
RESOLVABLE_SHARED_CANDIDATE_LABELS=309
RESOLVABLE_SHARED_CANDIDATE_ROWS=25061
LABELS_WITH_MULTIPLE_RESOLVED_UUIDS=0
ROWS_WITH_MULTIPLE_RESOLVED_UUIDS=
CROSS_TARGET_SHARED_CANDIDATE_LABELS=0
UNRESOLVED_LABELS=0
UNRESOLVED_ROWS=
FINAL_ALIAS_LABELS=468
FINAL_UNIQUE_NAME_LABELS=6
```

공유 후보 출력 예시 원문:

```text
AC110BN4PBH1|uuid=a94da604-7b13-4aa1-a1d4-f3f0f251430f|labels=2|rows=19|AC110BN4PBH1 [BN프리미엄 실내기] [냉난방 4w 단상] <> AC110BN4PBH1 [BN프리미엄 실내기] [냉난방 4w 삼상]
FH-LFHLF|uuid=08594b4f-0a49-49ed-a08b-e68ed4d0e9d2|labels=4|rows=236|FH-LFHLF-유연호스1WAY [1way L형] <> FH-LFHLF-유연호스1WAY [​] <> FH-LFHLF-유연호스1WAY [유연호스1WAY] <> FH-LFHLF-유연호스1WAY [유연호스1w]
AR-EC05|uuid=8f0becf3-82d9-4a6b-9c86-30ce497e0f3d|labels=6|rows=2771|AR-EC05 <> AR-EC05 [​] <> AR-EC05 [무선 냉전] <> AR-EC05 [무선냉전] <> AR-EC05 [수량OK] <> AR-EC05 [수량ok]
--MULTI_UUID_DETAIL--
--CROSS_TARGET_DETAIL--
--UNRESOLVED_DETAIL--
```

판정: 서로 다른 원문 라벨이 같은 후보를 만드는 형식 충돌은 **161후보 / 314라벨 / 25,066행**이며, 그중 활성 alias 또는 유일 활성 name으로 실제 해소되는 공유 후보는 **121후보 / 309라벨 / 25,061행**이다. 그러나 한 라벨의 후보들이 서로 다른 활성 UUID를 가리킨 경우는 **0라벨/0행**, 공유 후보 UUID와 경쟁하는 다른 활성 UUID 증거도 **0라벨/0행**이다. 474라벨은 모두 해소됐다. 아직 이 수치는 R11 신규 후보만 분리한 수치가 아니므로, 다음 확인에서 기존 `full + aliasToken`과 R11 추가 후보를 분리한다.

### ①-5 R11 신규 후보 분리 1차 실행 — projection 오류 발견

실행 명령 원문:

```powershell
# ①-4와 같은 세 읽기 전용 SELECT를 사용하고 후보마다
# OLD_FULL / OLD_TOKEN / R11_BRACKET_BASE / R11_COMPACT / R11_HYPHEN_PREFIX
# provenance를 붙여 R11 신규 후보만 별도 집계했다.
# active Product name은 PowerShell hashtable에 `+=`로 UUID를 누적했다.
```

출력 원문(집계):

```text
R11_NEW_CANDIDATE_ENTRIES=144
R11_NEW_SHARED_CANDIDATE_GROUPS=33
R11_NEW_SHARED_CANDIDATE_LABELS=59
R11_NEW_SHARED_CANDIDATE_ROWS=10959
R11_NEW_RESOLVABLE_SHARED_GROUPS=3
R11_NEW_RESOLVABLE_SHARED_LABELS=9
R11_NEW_RESOLVABLE_SHARED_ROWS=273
FINAL_VIA_R11_NEW_CANDIDATE_LABELS=15
FINAL_VIA_R11_NEW_CANDIDATE_ROWS=279
FINAL_VIA_UNIQUE_NAME_LABELS=6
FINAL_VIA_UNIQUE_NAME_ROWS=6
DUPLICATE_ACTIVE_NAME_CANDIDATE_ENTRIES=0
ALIAS_NAME_CROSS_UUID_CANDIDATE_ENTRIES=0
```

오류를 드러낸 출력 원문:

```text
실내기(1-Way) 무풍 대형 미내장 18평형 [​]|...|UNIQUE_NAME UUID=7
실내기(1-Way) 무풍 중형 미내장 5평형 [미내장형]|...|UNIQUE_NAME UUID=b
```

판정: 이름 그룹이 1개일 때 PowerShell이 단일 문자열을 배열이 아니라 scalar로 풀어, `[0]`이 UUID 첫 글자만 반환했다. 이 실행의 unique-name UUID와 그에 의존하는 교차충돌 판정은 **증거로 폐기**한다. alias 기반 신규 후보 계수는 영향을 받지 않지만 최종 판정에는 재사용하지 않고, 이름 UUID를 강제 배열로 보존해 전체를 재실행한다.

강제 배열 재실행 첫 시도 출력 원문:

```text
Missing 'in' after variable in foreach loop.
Unexpected token ')' in expression or statement.
```

판정: 압축한 PowerShell의 `foreach($l in$labels)`에 필수 공백이 없어 parse 단계에서 종료됐다. SQL은 실행되기 전이며 DB 조회·변경은 없었다. 공백을 복구해 재실행한다.

강제 배열 재실행 두 번째 시도 출력 원문:

```text
Where-Object : An operator is required to compare the two specified values.
At ... Where-Object Kind -like'R11_*'
```

판정: 세 읽기 전용 SELECT는 완료됐지만 집계식의 `-like` 뒤 공백 누락으로 출력 전에 종료됐다. DB 변경은 없다. 집계 연산자 공백을 복구해 재실행한다.

강제 배열 재실행 세 번째 시도 집계 원문:

```text
R11_NEW_SHARED_CANDIDATE_GROUPS=33
R11_NEW_RESOLVABLE_SHARED_GROUPS=3
R11_NEW_RESOLVABLE_SHARED_LABELS=9
R11_NEW_RESOLVABLE_SHARED_ROWS=273
FINAL_VIA_R11_NEW_CANDIDATE_LABELS=15
FINAL_VIA_R11_NEW_CANDIDATE_ROWS=279
MULTI_RESOLVED_UUID_LABELS=0
UNRESOLVED_LABELS=0
DUPLICATE_ACTIVE_NAME_CANDIDATE_ENTRIES=0
ALIAS_NAME_CROSS_UUID_CANDIDATE_ENTRIES=0
```

그러나 출력 원문은 여전히 다음과 같았다:

```text
실외기_4HP 단배관 [4단배관]|...|UNIQUE_NAME UUID=3
```

판정: `if` 식의 출력 열거 과정에서 1원소 UUID 배열이 다시 scalar가 됐다. 집계 수와 alias UUID는 일치하지만 unique-name UUID 원문이 훼손됐으므로 이 실행도 최종 증거로 채택하지 않는다. UUID 선택을 배열 변환 없이 `List<string>[0]`에서 직접 읽도록 바꾸고, product DB의 alias↔name 교차 UUID는 별도 SQL로 재확인한다.

### ①-6 R11 신규 해소 대상의 DB 직접 대조

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT p.name, COUNT(*) AS active_count, string_agg(p.id::text, ',' ORDER BY p.id) AS ids FROM products p WHERE p.is_deleted=FALSE AND p.name IN ('실내기(1-Way) 무풍 대형 미내장 18평형','실내기(1-Way) 무풍 중형 미내장 5평형','실내기(1-Way) 무풍 중형 미내장 6평형','실외기_4HP 단배관','판넬 1way 무풍대형 미내장','판넬 1way 무풍중형 미내장') GROUP BY p.name ORDER BY p.name; SELECT COUNT(*) AS duplicate_active_name_groups FROM (SELECT name FROM products WHERE is_deleted=FALSE GROUP BY name HAVING COUNT(*)>1) d; SELECT COUNT(*) AS whitespace_alias_name_cross_uuid_rows FROM staging.ecount_item_alias a JOIN products alias_product ON alias_product.id=a.main_product_uuid AND alias_product.is_deleted=FALSE JOIN products name_product ON name_product.name=a.alias_code AND name_product.is_deleted=FALSE AND name_product.id<>a.main_product_uuid WHERE a.alias_code ~ '[[:space:]]'; SELECT a.alias_code,a.main_item_code,a.main_product_uuid,p.name FROM staging.ecount_item_alias a JOIN products p ON p.id=a.main_product_uuid AND p.is_deleted=FALSE WHERE a.alias_code IN ('FH-LFHLF','FH-LFHLN','방진가대S2중') ORDER BY a.alias_code; COMMIT;"
```

출력 원문:

```text
실내기(1-Way) 무풍 대형 미내장 18평형 | 1 | 71065cbd-2b4d-456e-a26a-407d9499eb77
실내기(1-Way) 무풍 중형 미내장 5평형  | 1 | bd853df0-b142-420f-8f6c-cf9b6c9d150b
실내기(1-Way) 무풍 중형 미내장 6평형  | 1 | 509be12b-d76b-474d-acd7-678a78971a94
실외기_4HP 단배관                     | 1 | 3612c28e-be0d-4b50-b774-26367a8d3e3c
판넬 1way 무풍대형 미내장             | 1 | 412917fb-2183-4dff-85d2-deafb3a2484d
판넬 1way 무풍중형 미내장             | 1 | 8879102e-440f-4479-81a8-7c36bf598947

duplicate_active_name_groups = 157
whitespace_alias_name_cross_uuid_rows = 0

FH-LFHLF     | FH-LFHLF     | 08594b4f-0a49-49ed-a08b-e68ed4d0e9d2 | 유연호스 L형 1WAY
FH-LFHLN     | FH-LFHLN     | cb3293b7-2e94-42c8-ae64-bca5221e653a | 유연호스 L형 4WAY
방진가대S2중 | 방진가대S2중 | 8d19edb0-740a-42cb-a50e-2fbcbee248a2 | S2 방진가대 중
```

판정: 전체 활성 Product에는 동명이름 그룹이 157개 있으나, R11에서 최종 name fallback으로 해소되는 6개 이름은 각각 활성 Product가 정확히 1개다. 공백 포함 alias와 동일 문자열의 다른 Product name UUID가 경쟁하는 전역 행은 0건이다. 신규 공유 alias 3개도 각각 코드와 main_item_code가 같고 단일 활성 UUID로 연결된다.

최종 provenance 투영 재실행의 집계 원문:

```text
R11_NEW_SHARED_GROUPS=33
R11_NEW_SHARED_LABELS=59
R11_NEW_SHARED_ROWS=10959
R11_NEW_RESOLVABLE_SHARED_GROUPS=3
R11_NEW_RESOLVABLE_SHARED_LABELS=9
R11_NEW_RESOLVABLE_SHARED_ROWS=273
FINAL_VIA_R11_NEW_LABELS=15
FINAL_VIA_R11_NEW_ROWS=279
MULTI_UUID_LABELS=0
UNRESOLVED_LABELS=0
DUPLICATE_NAME_CANDIDATES=0
ALIAS_NAME_CROSS_UUID=0
```

alias 대상은 정상 UUID였으나 unique-name 출력은 다시 첫 글자만 나왔다:

```text
실내기(1-Way) 무풍 대형 미내장 18평형 [​]|...|UUID=7|UNIQUE_NAME
```

판정: name 목록을 `if` 식에 대입하는 순간 PowerShell이 `List<string>`을 다시 열거했다. **집계 및 alias 결과는 세 번 동일했지만 unique-name UUID 문자열은 ①-6의 DB 직접 출력으로만 인수한다.** 마지막으로 UUID 선택을 `List<string>.get_Item(0)` 직접 호출로 고정해 6행만 재투영한다.

실행 명령 원문:

```powershell
$tab=[char]9; $names=@{};
$lines=@(docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -qAt -F "`t" -c "BEGIN TRANSACTION READ ONLY; SELECT p.name,p.id FROM products p WHERE p.is_deleted=FALSE AND p.name IN ('실내기(1-Way) 무풍 대형 미내장 18평형','실내기(1-Way) 무풍 중형 미내장 5평형','실내기(1-Way) 무풍 중형 미내장 6평형','실외기_4HP 단배관','판넬 1way 무풍대형 미내장','판넬 1way 무풍중형 미내장') ORDER BY p.name,p.id; COMMIT;");
# name별 List<string>에 넣은 뒤 `$names[$n].get_Item(0)`을 직접 출력
```

출력 원문:

```text
실내기(1-Way) 무풍 대형 미내장 18평형|count=1|uuid=71065cbd-2b4d-456e-a26a-407d9499eb77
실내기(1-Way) 무풍 중형 미내장 5평형|count=1|uuid=bd853df0-b142-420f-8f6c-cf9b6c9d150b
실내기(1-Way) 무풍 중형 미내장 6평형|count=1|uuid=509be12b-d76b-474d-acd7-678a78971a94
실외기_4HP 단배관|count=1|uuid=3612c28e-be0d-4b50-b774-26367a8d3e3c
판넬 1way 무풍대형 미내장|count=1|uuid=412917fb-2183-4dff-85d2-deafb3a2484d
판넬 1way 무풍중형 미내장|count=1|uuid=8879102e-440f-4479-81a8-7c36bf598947
```

판정: unique-name 6개 UUID 원문이 DB 직접 출력과 동일하게 재현됐다. PowerShell scalar 오류는 최종 증거에서 제거됐다.

### ① 판정

- 전체 형식 충돌: **161후보 / 314라벨 / 25,066행**.
- R11이 새로 추가한 후보끼리의 형식 충돌: **33후보 / 59라벨 / 10,959행**.
- 그중 실제로 해소되는 R11 신규 공유 후보: **3후보 / 9라벨 / 273행** (`FH-LFHLF`, `FH-LFHLN`, `방진가대S2중`).
- R11 신규 후보로 최종 해소: **15라벨 / 279행**. alias 9라벨/273행 + 유일 활성 name 6라벨/6행.
- 한 라벨의 후보가 서로 다른 활성 UUID를 가리키는 경우: **0라벨/0행**.
- 후보가 중복 활성 name에 걸려 거부되는 경우: **0라벨/0행**.
- alias와 동일 문자열의 다른 활성 Product name UUID가 경쟁하는 경우: **0라벨/0행**.
- 미해소: **0라벨/0행**.

따라서 서로 다른 원문 라벨이 같은 정규화 문자열을 만드는 경우 자체는 많지만, 실 DB에서 서로 다른 Product UUID라는 반대 증거가 있는 라벨이 조용히 한 UUID로 선택되는 재현 경로는 **0건**이다. **① 실 사용자 재현 결함 없음.**

## ② 막아야 할 것이 여전히 막히는가

### ②-1 실 alias target 상태 전수 계수

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT COUNT(*) AS alias_total, COUNT(*) FILTER (WHERE p.id IS NOT NULL AND p.is_deleted=FALSE) AS active_target, COUNT(*) FILTER (WHERE p.id IS NOT NULL AND p.is_deleted=TRUE) AS deleted_target, COUNT(*) FILTER (WHERE p.id IS NULL) AS dangling_target, COUNT(*) FILTER (WHERE a.main_product_uuid IS NULL) AS null_target FROM staging.ecount_item_alias a LEFT JOIN products p ON p.id=a.main_product_uuid; SELECT p.id,p.name,p.model_code,p.product_code,p.is_deleted,COUNT(a.alias_code) AS alias_rows FROM products p LEFT JOIN staging.ecount_item_alias a ON a.main_product_uuid=p.id WHERE p.is_deleted=TRUE GROUP BY p.id,p.name,p.model_code,p.product_code,p.is_deleted ORDER BY p.id; SELECT COUNT(*) AS deleted_name_has_active_same_name FROM products deleted JOIN products active ON active.name=deleted.name AND active.is_deleted=FALSE WHERE deleted.is_deleted=TRUE; COMMIT;"
```

출력 원문:

```text
alias_total | active_target | deleted_target | dangling_target | null_target
------------+---------------+----------------+-----------------+------------
       2835 |          2835 |              0 |               0 |           0

32e2baf8-6b51-4d59-9561-23a56dfe3d10 | DVM S 구형 프라임 16HP | AM160NXVHHH1 | | t | alias_rows=0
bcee86c4-d7e3-4585-9c68-e19bb3d91971 | DVM S 구형 프라임 10HP | AM100NXVHHH1 | | t | alias_rows=0

deleted_name_has_active_same_name = 0
```

판정: 실 alias 2,835건은 전부 활성 Product를 가리킨다. 삭제 target **0**, dangling target **0**, null target **0**이다. 삭제 Product 2건에는 alias가 없고 같은 이름의 활성 Product도 없어 unique-name fallback으로 되살아날 경로가 없다. 따라서 현재 실데이터의 삭제/dangling alias 해소 가능 건수는 **0건**이다.

### ②-2 차단 회귀 위치 확인

실행 명령 원문:

```powershell
rg -n -A 28 -B 8 "160|soft_deleted|deleted_alias|삭제_alias|삭제.*UUID" services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/Mig8OrderTransformServiceTest.java services/product-service/src/test/java/com/samhanair/logis/product/it/EcountAliasResolveServiceIT.java
```

출력 원문(핵심):

```text
EcountAliasResolveServiceIT.java:93:void soft_deleted_Product를_가리키는_staging_alias는_해소하지_않는다()
...
assertThat(resolved).doesNotContainKey(aliasCode);

Mig8OrderTransformServiceTest.java:310:void 삭제_alias_코드는_짧은_하이픈_prefix_alias로_우회하지_않는다()
...
assertThat(lineParams().getValue("productId")).isNull();

Mig8OrderTransformServiceTest.java:347:void soft_deleted_alias_UUID가_섞인_160건은_삭제_UUID를_쓰지_않고_전건_reject한다()
...
assertThat(result.totalRows()).isEqualTo(160);
assertThat(result.rejected()).isEqualTo(160);
assertThat(statuses()).hasSize(160).containsOnly("PENDING");
```

판정: 차단 계약은 product-service의 active Product JOIN, accounting의 순수 하이픈 코드 prefix 금지, 160행 미해소 차단으로 구성된다. 새 IT가 다른 IT에 미치는 저장소 특성 때문에 product-service targeted IT만 따로 돌리지 않고 ④의 모듈 전체 테스트에서 함께 실행한다.

### ② 판정(실데이터)

- 삭제 Product target alias: **0건**.
- dangling UUID alias: **0건**.
- null UUID alias: **0건**.
- 삭제 Product 이름의 활성 동명 fallback: **0건**.
- 따라서 R11 후보 확장으로 실제 삭제/dangling UUID가 해소되는 건수: **0건**.

현재 실데이터에서 삭제 UUID가 되살아 주문에 붙는 실 사용자 경로는 재현되지 않았다. 테스트 실행 최종 여부는 ④ 전체 모듈 결과와 함께 확정한다.

## ③ 병합 규칙이 관계 없는 품목까지 합치는가

### ③-1 보완 호출 지점과 candidate gate 확인

실행 명령 원문:

```powershell
$p='services\product-service\src\main\java\com\samhanair\logis\product\service\EcountProductImporter.java';$c=Get-Content -LiteralPath $p -Encoding UTF8;$c[40..230];$c[400..610]
```

출력 원문(핵심):

```java
Map<String, List<ItemRow>> explicitMergeRowsByMainCode = buildExplicitMergeRowsByMainCode(
        itemRows, relationParse, relationMainByAlias, itemsByCode);
...
ItemRow mergedMainRow = mainRow == null
        ? null
        : mergeExplicitRows(mainRow, explicitMergeRowsByMainCode.get(mainCode));
...
private boolean isFingerprintCompatibleCandidate(...) {
    return candidate != null
            && ((candidate.trustedIdentity()
                    && (candidate.rawRow() != null || sameNameRowCount == 1))
            || (candidate.rawRow() != null && sameFingerprint(candidate.rawRow(), expected)));
}
```

판정: R10의 `trustedIdentity` fingerprint 우회 분기는 그대로 존재한다. 그러나 필드 보완 sink는 별도 `explicitMergeRowsByMainCode`만 입력받는다. 이 map의 생성 규칙이 관계·승인 밖 동일명/fingerprint 행을 포함하는지가 실제 판정점이다.

### ③-2 explicit merge map 구성 규칙 확인

실행 명령 원문:

```powershell
rg -n -A 120 -B 5 "buildExplicitMergeRowsByMainCode|mergeExplicitRows\(|approvedRaw|APPROVED|findApprovedRawMainRow" services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java
```

출력 원문:

```java
String mainCode = relationMainByAlias.get(row.code());
if (mainCode == null && relationParse.mainCodes().contains(row.code())) {
    mainCode = row.code();
}
if (mainCode == null) {
    ItemRow approvedMain = findApprovedRawMainRow(row, itemsByCode);
    if (approvedMain != null) {
        mainCode = approvedMain.code();
    }
}
if (mainCode != null) {
    rowsByMainCode.computeIfAbsent(mainCode, ignored -> new ArrayList<>()).add(row);
}
```

```java
private ItemRow findApprovedRawMainRow(...) {
    ItemRow exact = itemsByCode.get(row.name());
    ...
    ItemRow whitespaceNormalised = itemsByCode.get(row.name().replaceAll("\\s+", ""));
    ...
    ItemRow parenthesisPrefix = itemsByCode.get(beforeParenthesis);
    ...
}
```

```java
private ItemRow mergeExplicitRows(ItemRow representative, List<ItemRow> relatedRows) {
    if (relatedRows == null || relatedRows.size() < 2) {
        return representative;
    }
    // 비어 있는 단가/품목구분/규격명만 relatedRows에서 보완
}
```

판정: 보완 map에 들어가는 source는 코드상 **(1) 관계 alias, (2) 관계 main, (3) 기존 승인 raw 규칙**뿐이다. 동일명/fingerprint group 자체는 이 map에 추가되지 않는다. 실 raw에서 이 세 source 밖 보완 발화 수를 독립 계수한다.

### ③-3 기존 행위 회귀 위치 확인

실행 명령 원문:

```powershell
rg -n -A 35 -B 8 "관계.*없|direct|보완|fingerprint|동명|동일명|same.*name|빈.*필드|비어" services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterSameNameMergeTest.java
```

출력 원문(테스트명):

```text
승인된_순번코드와_모델코드는_fingerprint가_달라도_같은_품목으로_병합된다
같은_품목명_순번코드_그룹은_대표후보_실패로_누락되지_않고_한_품목과_alias로_병합된다
같은_품목명이어도_규격과_단가가_다르면_각각의_품목과_값을_보존한다
관계_연결행의_비어_있지_않은_단가는_대표행_공백을_보완한다
AP110RNPPHH1_싱글은_대표품목의_662000을_유지한다
승인된_모델코드_연결도_직접_연결행의_비어_있지_않은_값을_보완한다
```

판정: 회귀 계약은 관계/승인 direct mapping 보완과 관계 없는 동명·상이 fingerprint 분리를 함께 포함한다. 테스트의 강약은 평가하지 않으며 ④ 모듈 전체 실행에서 실제 결과만 인수한다.

실행 명령 원문:

```powershell
Get-ChildItem -LiteralPath 'docs\migration\ecount-data\raw' -File | Where-Object { $_.Name -match '품목' } | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize
```

출력 원문:

```text
품목-Excel다운로드.csv          313221
품목계층그룹-Excel다운로드.csv    4710
품목관계-Excel다운로드.csv       15632
품목관계리스트.xlsx              11451
품목등록.xlsx                   171506
```

판정: R11/PM이 사용한 재취득 XLSX 2건과 구 CSV 3건이 모두 존재한다. ③·④ 실측은 재취득 `품목등록.xlsx`와 `품목관계리스트.xlsx`를 기준으로 한다.

### ③-4 재취득 XLSX 구조 직접 파싱

실행 명령 원문:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
# ZipArchive로 sharedStrings.xml과 xl/worksheets/sheet1.xml을 읽고 셀 reference를 열 번호로 복원했다.
# 두 XLSX의 첫 5행과 실제 XML row 범위를 출력했다.
```

출력 원문:

```text
FILE=docs\migration\ecount-data\raw\품목등록.xlsx ROWS=2857 FIRST=1 LAST=2857
ROW=1|회사명 : (주)삼한공조시스템
ROW=2|품목코드|품목명|출하가|입고단가|싱글|실외기(원형,스탠드)|멀티(50%)|멀티(48%)|멀티(45%)|단품(35%)|품목구분|규격명|사용구분
ROW=3|0000098|한경희 선풍기|0|0|||0|0|||[상품]||YES
...
FILE=docs\migration\ecount-data\raw\품목관계리스트.xlsx ROWS=161 FIRST=1 LAST=161
ROW=1|회사명:(주)삼한공조시스템
ROW=2|대표품목코드|대표품목명|대표품목단위|연결품목코드|연결품목명|연결품목단위|연결품목 환산수량|대표품목 환산수량|수량관리기준
ROW=3|AC060BN4DBC1|AC060BN4DBC1 [BN디럭스 냉전 실내기]||CH4N-00122|AC060BN4DBC1 [BN디럭스 냉전 실내기]||1|1|대표품목
```

판정: 데이터 header는 두 파일 모두 row 2다. 품목 XLSX의 XML 행은 2,855 데이터행 + title/header 2행과 일치한다. 관계 XLSX는 XML상 159개 후속 행이므로 footer/비관계 행을 제외해 유효 edge를 별도 계수한다.

관계 XLSX 말미 확인 명령 원문:

```powershell
# ZipArchive로 `품목관계리스트.xlsx`의 마지막 5개 XML row를 출력
```

출력 원문:

```text
ROW=157|방진가대소|방진가대 소||SZL-00010|방진가대 소||1|1|대표품목
ROW=158|운임|운임||ZDEL-00001|운임||1|1|대표품목
ROW=159|전면토출방진가대|전면토출 방진가대||01009|전면토출 방진가대||1|1|대표품목
ROW=160|절삭|절삭||00013|절삭||1|1|대표품목
ROW=161|2026/08/03  오전 9:51:55
```

판정: 유효 관계 edge는 row 3~160의 **158건**이며 row 161은 export 시각 footer다. PM/R11의 158행과 일치한다.

fingerprint 정규화 확인 명령 원문:

```powershell
rg -n -A 18 -B 5 "normalizeItemType|parseMoney\(" services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java | Select-Object -Last 100
```

출력 원문:

```java
private static BigDecimal parseMoney(String raw) {
    if (raw == null || raw.isBlank() || "-".equals(raw)) return BigDecimal.ZERO;
    try { return new BigDecimal(raw.replace(",", "").replace(" ", "")); }
    catch (NumberFormatException ex) { return BigDecimal.ZERO; }
}
private static String normalizeItemType(String raw) {
    if (raw == null || raw.isBlank()) return "상품";
    return truncate(raw.replace("[", "").replace("]", ""), 20);
}
```

판정: 실 raw의 fingerprint 계수에는 단가 8종 `parseMoney`, 품목구분 괄호 제거/default 상품, 규격명 strip을 동일하게 적용한다.

실 raw 전체 투영 첫 시도 출력 원문:

```text
Missing 'in' after variable in foreach loop.
The Try statement is missing its Catch or Finally block.
```

판정: 압축한 PowerShell에서 `foreach($q in$d...)`처럼 `in` 뒤 공백을 제거해 parse 단계에서 종료됐다. XLSX/DB/소스에는 변경이 없다. 모든 foreach 구문 공백을 복구해 다시 실행한다.

실 raw 전체 투영 두 번째 시도 출력 원문:

```text
ITEM_DATA_ROWS=1
NORMAL_ROWS=0
RELATION_EDGES=0
...
```

판정: XLSX 함수가 `return ,$out`으로 전체 row 배열을 단일 nested 객체로 반환해 pipeline이 한 행으로 인식했다. 이 출력은 **증거로 폐기**한다. 반환부의 unary comma를 제거해 row 객체를 pipeline에 개별 방출하도록 수정한다.

실 raw 전체 투영 세 번째 시도 출력 원문:

```text
AC : An object at the specified path @{N=3; C=System.Object[]} does not exist ...
FullyQualifiedErrorId : ItemNotFound,Microsoft.PowerShell.Commands.AddContentCommand
```

판정: helper 함수명 `AC`가 PowerShell 기본 alias `Add-Content`와 충돌해 행 객체를 경로로 해석했다. XLSX는 읽었으나 집계 전에 종료됐고 변경은 없다. 함수명을 `Get-ApprovedCode`로 바꿔 다시 실행한다.

실 raw 전체 투영 네 번째 시도 출력 원문:

```text
return$n : The term 'return$n' is not recognized as the name of a cmdlet ...
```

판정: helper 내부의 `return $n`을 압축하면서 공백을 잃었다. 데이터는 읽었지만 집계 전에 종료됐다. `return $n`, `return $x`, `return $null`을 정상 구문으로 고쳐 재실행한다.

### ③-5 explicit 보완 map 실 raw 투영 성공

실행 명령 원문:

```powershell
# ZipArchive로 재취득 XLSX 2건을 파싱한다.
# EcountProductImporter의 isNormal, parseMoney, normalizeItemType,
# findApprovedRawMainRow, buildExplicitMergeRowsByMainCode, mergeExplicitRows를
# 같은 우선순서로 PowerShell 메모리에서 투영한다.
```

출력 원문:

```text
ITEM_DATA_ROWS=2855
NORMAL_ROWS=2854
RELATION_EDGES=158
EXPLICIT_ENTRY_ROWS=1111
EXPLICIT_COMPLEMENT_GROUPS=158
EXPLICIT_COMPLEMENT_ROWS=317
RELATION_GROUPS=157
APPROVED_ONLY_GROUPS=1
CHANGED_COMPLEMENT_GROUPS=11
CHANGED_COMPLEMENT_FIELDS=11
NON_DIRECT_ROWS_IN_COMPLEMENT_GROUPS=0
OUTSIDE_DIRECT_CHANGED_GROUPS=0
FINGERPRINT_GROUPS=131
FINGERPRINT_ROWS=262
RELATION_FREE_FINGERPRINT_GROUPS=0
RELATION_FREE_FINGERPRINT_ROWS=1
```

보완 변경 출력 원문:

```text
RT25DARAHS9|fields=11|members=01017[REL_ALIAS],RT25DARAHS9[REL_MAIN]
AFT-00029|fields=4|members=AFT-00016[REL_ALIAS],AFT-00029[REL_MAIN]
AR-ED00|fields=2|members=AR-ED00[APPROVED],SAR-00011[APPROVED]
AXJ-TA3419M|fields=11|members=AXJ-TA3419M[REL_MAIN],SAX-00006[REL_ALIAS]
AXJ-TA4122M|fields=11|members=AXJ-TA4122M[REL_MAIN],SAX-00007[REL_ALIAS]
AXJ-YA3800M|fields=11|members=AXJ-YA3800M[REL_MAIN],SAX-00016[REL_ALIAS]
FH-LFHLF|fields=2|members=FH-LFHLF[REL_MAIN],SZL-00001[REL_ALIAS]
FPH-1458XS1|fields=3|members=FPH-1458XS1[REL_MAIN],SPH-00012[REL_ALIAS]
PC4NUSK1|fields=4|members=P4N-00010[REL_ALIAS],PC4NUSK1[REL_MAIN]
방진가대대|fields=11|members=SZL-00009[REL_ALIAS],방진가대대[REL_MAIN]
방진가대소|fields=11|members=SZL-00010[REL_ALIAS],방진가대소[REL_MAIN]
```

판정: 보완 group은 관계 157 + 승인 1 = **158그룹/317행**이고, 실제 대표 필드를 바꾸는 것은 **11그룹/11필드**다. 보완 group에 `NONE` source 행은 **0**, direct mapping 밖 변경 group도 **0**이다. 단 `RELATION_FREE_FINGERPRINT_ROWS=1`은 빈 배열을 `@($null)`로 센 PowerShell 표시 오류다. group 수가 0이고 sample도 비었으므로 실제 행도 0이지만, 최종 출력에서는 flatten count를 고쳐 재확인한다. 이어서 R10 구조적 bypass 27/28도 같은 raw에서 직접 센다.

구조적 bypass 재계수 첫 시도 출력 원문:

```text
Group-Object : The term 'return[decimal]0' is not recognized ...
```

판정: `parseMoney` 복제 함수의 `return [decimal]0` 공백이 한 곳 더 압축돼 fingerprint 계산 중 종료됐다. XLSX 읽기만 수행했고 변경은 없다. 공백을 복구해 재실행한다.

### ③-6 구조적 fingerprint bypass와 관계 밖 group 재계수

실행 명령 원문:

```powershell
# ③-5와 같은 재취득 XLSX 파서 및 importer 정규화를 사용한다.
# ProductIdentity(name + 업무값 fingerprint)별 2행 이상 group을 센다.
# explicit complement group의 alias/approved 행과 대표행 identity를 비교해
# trustedIdentity가 fingerprint 없이 통과시키는 현재 발화 행을 센다.
# flatten count는 group이 0이면 명시적으로 0을 반환한다.
```

출력 원문:

```text
FINGERPRINT_GROUPS=131
FINGERPRINT_ROWS=262
RELATION_FREE_FINGERPRINT_GROUPS=0
RELATION_FREE_FINGERPRINT_ROWS=0
IDENTITY_BYPASS_GROUPS=28
IDENTITY_BYPASS_ROWS=29
BUSINESS_VALUE_BYPASS_GROUPS=27
BUSINESS_VALUE_BYPASS_ROWS=27
BYPASS_NON_DIRECT_ROWS=0
```

identity bypass 출력 원문:

```text
EG-SOU05M|00022|REL_ALIAS|EG-SOU05M(실외기 에어가이드 상부토출)
EG-SOU05M|00027|REL_ALIAS|EG-SOU05M(실외기 에어가이드 상부토출)
AJ030RXH4BC1|00130|REL_ALIAS|AJ030RXH4BC1
방진가대S2소|00196|REL_ALIAS|방진가대 S2 소
방진가대S2중|00197|REL_ALIAS|방진가대 S2 중
RT25DARAHS9|01017|REL_ALIAS|RT25DARAHS9
AC110BXAPHH3|CH4X-00074|REL_ALIAS|AC110BXAPHH3 [BX 프리미엄 3상실외기]
AFT-00029|AFT-00016|REL_ALIAS|AF16T5774DSN
AM035FXMRHC1|DVX-00057|REL_ALIAS|AM035FXMRHC1
AM050FXMRHC1|DVX-00058|REL_ALIAS|AM050FXMRHC1
AM050MXMRBC1|DVX-00085|REL_ALIAS|AM050MXMRBC1
AM075FXMRHC1|DVX-00059|REL_ALIAS|AM075FXMRHC1
AM120MXVRHC1|DVX-00127|REL_ALIAS|AM120MXVRHC1
AP110RNPPHH1|PHN-00027|REL_ALIAS|AP110RNPPHH1 [프리미엄 3상]
AR-ED00|SAR-00011|APPROVED|AR-ED00
AXJ-TA3100M|SAX-00028|REL_ALIAS|AXJ-TA3100M
AXJ-TA3419M|SAX-00006|REL_ALIAS|AXJ-TA3419M (T형 분기관)
AXJ-TA3800M|SAX-00050|REL_ALIAS|AXJ-TA3800M
AXJ-TA4122M|SAX-00007|REL_ALIAS|AXJ-TA4122M
AXJ-YA1509N|SAX-00080|REL_ALIAS|AXJ-YA1509N [N-분기관]
AXJ-YA3800M|SAX-00016|REL_ALIAS|AXJ-YA3800M
EG-J001B|단내림(대)|REL_ALIAS|단내림(대)
EG-J001M|단내림(중)|REL_ALIAS|단내림(중)
FH-LFHLF|SZL-00001|REL_ALIAS|FH-LFHLF-유연호스1WAY
FPH-1458XS1|SPH-00012|REL_ALIAS|FPH-1458XS1
PC4NUSK1|P4N-00010|REL_ALIAS|PC4NUSK1
PC1BWAK1N|p1n-00021|REL_ALIAS|PC1BWAK1N
방진가대대|SZL-00009|REL_ALIAS|방진가대 대
방진가대소|SZL-00010|REL_ALIAS|방진가대 소
```

판정:

- R10의 구조적 `trustedIdentity` bypass는 코드상 **1경로로 유지**되고, 재취득 현재 원본에서는 **28그룹/29행** 발화한다.
- R10 기록의 **27그룹/28행**보다 1그룹/1행 큰 이유는 재취득 원본에 `AP110RNPPHH1 ↔ PHN-00027`이 추가됐기 때문이다. R10 자체가 사용한 구 품목 raw 해시는 현재 파일과 다르므로, 현재 입력에서 27/28은 재현되지 않는다.
- 29행의 source는 전부 `REL_ALIAS` 또는 `APPROVED`; direct mapping 밖 bypass 행은 **0건**이다.
- 업무값 자체가 다른 bypass는 **27그룹/27행**이며 모두 direct mapping 범위다.
- 동일 name+fingerprint 131그룹/262행은 현재 원본에서 전부 explicit group과 겹친다. 관계·승인 밖 fingerprint group은 **0그룹/0행**이다.

### ③ 판정

보완 map 158그룹/317행과 실제 변경 11그룹/11필드에 관계·승인 밖 행은 **0건**이다. 구조적 fingerprint bypass는 의도된 direct mapping 축에만 남아 있고, 관계 없는 동일명/fingerprint 행으로 필드 보완이 확장되는 실 사용자 경로는 재현되지 않았다. **③ 실 사용자 재현 결함 없음.**

## ④ R11 수치 재현

### ④-1 입력 파일 SHA-256

실행 명령 원문:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'docs\migration\ecount-data\raw\품목관계리스트.xlsx','docs\migration\ecount-data\raw\품목등록.xlsx','docs\migration\ecount-data\raw\품목-Excel다운로드.csv','docs\migration\ecount-data\raw\품목관계-Excel다운로드.csv','docs\migration\ecount-data\raw\품목계층그룹-Excel다운로드.csv' | Select-Object Path,Hash | Format-List
```

출력 원문:

```text
품목관계리스트.xlsx = 017E5FD2D5099124C5A8DCF10D9B301783A78FD15E31E3AD6FF949D779EB3517
품목등록.xlsx = 3FD1A174D1EE9E3C8AA2F303AF932E331F8EB7BA646392DB2122DDF5B77DAE52
품목-Excel다운로드.csv = 02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C
품목관계-Excel다운로드.csv = 00A1964DF081FEDB1E1AF270ED0110345E1F856531EB630210F6E5BA7867DE85
품목계층그룹-Excel다운로드.csv = 4955F2999017F37511AF3ADE552113FA30C0628B081D6B992F7D171A7CC1EB7E
```

판정: R11 보고서의 현재 PC 입력 해시 5건이 모두 실제 파일과 정확히 일치한다. R10의 구 해시는 현재 파일과 다르다는 선행 기록도 그대로다.

### ④-2 관계 26그룹/값 소실/AP 값 재계수 첫 시도

출력 원문:

```text
The term 'return[decimal]0' is not recognized ...
```

판정: 별도 분류 스크립트의 `parseMoney` 복제 함수에서 같은 PowerShell 공백 오류가 재발해 분류 전에 종료됐다. 파일은 읽기만 했고 변경은 없다. `return [decimal]0`과 `return '상품'` 공백을 고쳐 재실행한다.

관계 분류 두 번째 시도 출력 원문:

```text
Type : An object at the specified path [상품] does not exist ... GetContentCommand
```

판정: helper 이름 `Type`이 PowerShell의 `type` alias와 충돌했다. 분류 전에 종료됐고 변경은 없다. 함수명을 `Normalize-ItemType`으로 바꿔 재실행한다.

### ④-2 관계 분류·값 소실·AP 값 재계수 성공

실행 명령 원문:

```powershell
# ZipArchive로 재취득 XLSX를 파싱하고 관계 main별 157그룹을 구성했다.
# 단가 8종 parseMoney + 품목구분 normalize + 규격명 strip으로 차이를 분류했다.
# mergeExplicitRows를 필드별로 투영한 뒤, 한쪽에만 존재하는 유일 nonblank 값이
# 결과에서 사라지는 필드와 AP110RNPPHH1 싱글 결과를 집계했다.
```

출력 원문:

```text
RELATION_GROUPS=157
ONE_SIDED_GROUPS=23
WHITESPACE_ONLY_GROUPS=2
REAL_CONFLICT_GROUPS=1
NAME_ONLY_GROUPS=1
VALUE_LOSS_FIELDS=0
AP110RNPPHH1_SINGLE=662000
```

상이 그룹 출력 원문:

```text
AC110BXAPHH3|ONE_SIDED|fields=5
AFT-00029|ONE_SIDED|fields=2,4
AJ030RXH4BC1|ONE_SIDED|fields=2,11
AM035FXMRHC1|ONE_SIDED|fields=6,7,8,9
AM050FXMRHC1|ONE_SIDED|fields=6,7,8,9
AM050MXMRBC1|ONE_SIDED|fields=6,7,8,9
AM075FXMRHC1|ONE_SIDED|fields=6,7,8,9
AM120MXVRHC1|ONE_SIDED|fields=6,7,8,9
AP110RNPPHH1|CONFLICT|fields=4
AXJ-TA3100M|ONE_SIDED|fields=11
AXJ-TA3419M|WHITESPACE|fields=11
AXJ-TA3800M|ONE_SIDED|fields=11
AXJ-TA4122M|WHITESPACE|fields=11
AXJ-YA1509N|ONE_SIDED|fields=11
AXJ-YA3800M|ONE_SIDED|fields=11
EG-J001B|ONE_SIDED|fields=11
EG-J001M|ONE_SIDED|fields=11
FH-LFHLF|ONE_SIDED|fields=2
FPH-1458XS1|ONE_SIDED|fields=3
PC1BWAK1N|ONE_SIDED|fields=2
PC4NUSK1|ONE_SIDED|fields=4
RT25DARAHS9|ONE_SIDED|fields=2,11
방진가대S2소|ONE_SIDED|fields=3
방진가대S2중|ONE_SIDED|fields=3
방진가대대|ONE_SIDED|fields=11
방진가대소|ONE_SIDED|fields=11
```

판정: PM/R11의 **23 + 2 + 1** 분류, 값 소실 **0필드**, `AP110RNPPHH1` 싱글 **662,000**이 재현됐다. 업무값은 같고 이름만 다른 `EG-SOU05M` 1그룹도 별도로 재현됐다.

### ④-3 PENDING guard 판정식 확인

실행 명령 원문:

```powershell
rg -n -A 85 -B 20 "lookupProductId|productId == null|productId.*null|rejectedGroup|reject.*group|MIG8_LOOKUP_MISS" services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java | Select-Object -First 180
```

출력 원문(핵심):

```java
UUID productId = lookupProductId(itemName, productAliasCache);
if (productId == null) {
    lookupMissMessages.add(message);
    result.reject(... MIG8_LOOKUP_MISS ...);
}
upsertLine(..., productId);
...
boolean hasLookupMiss = lookupMissMessages.stream().anyMatch(Objects::nonNull);
updateStatus(..., hasLookupMiss ? "PENDING" : "TRANSFORMED", reason);
```

판정: 한 주문의 어느 라벨이든 미해소면 주문의 행들이 PENDING으로 남는다. ①에서 474/474 distinct 라벨이 모두 해소됐고 ④-기초 계수에서 그 라벨들이 26,055행/3,489주문 전체를 구성하므로, product lookup 기준 결과는 **해소 26,055행 / 3,489주문, PENDING 잔존 0행, guard 거부 주문 0건**이다. 실 DB transform은 금지되어 실행하지 않았고, read-only 후보 투영으로 산출했다.

### ④-4 product-service 전체 테스트 첫 시도

실행 명령 원문:

```powershell
.\gradlew.bat :services:product-service:test --rerun-tasks --no-daemon --console=plain
```

출력 원문:

```text
command timed out after 5034 milliseconds
```

판정: tool timeout을 1초로 잘못 지정해 5초 외부 제한으로 프로세스가 중단됐다. 테스트 결과로 인수하지 않는다. 잔여 Gradle/Java worker를 조회한 뒤 충분한 실행 제한으로 전체 모듈을 처음부터 재실행한다.

잔여 프로세스 조회 명령 원문:

```powershell
Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'java|gradle') -and ($_.CommandLine -match 'w984-ecount|Gradle') } | Select-Object ProcessId,Name,CommandLine | Format-List
```

관련 출력 원문:

```text
ProcessId: 27296
CommandLine: ... GradleWrapperMain :services:product-service:test --rerun-tasks --no-daemon --console=plain
```

판정: 외부 tool 호출만 timeout됐고, 본 작업의 product-service Gradle wrapper PID 27296은 계속 실행 중이다. 중복 실행하거나 종료하지 않고 완료를 polling한 뒤 JUnit XML을 fresh 증거로 집계한다.

polling 명령 원문:

```powershell
Wait-Process -Id 27296 -Timeout 30
```

출력 원문:

```text
PRODUCT_GRADLE_PROCESS=RUNNING
```

판정: 30초 뒤에도 정상 실행 중이다. 계속 기다린다.

두 번째 30초 polling 출력 원문:

```text
PRODUCT_GRADLE_PROCESS=RUNNING
```

판정: 전체 모듈 테스트가 계속 실행 중이다.

세 번째 polling 출력 원문:

```text
PRODUCT_GRADLE_PROCESS=COMPLETED
```

JUnit XML 집계 명령 원문:

```powershell
$files=@(Get-ChildItem -LiteralPath 'services\product-service\build\test-results\test' -Filter 'TEST-*.xml' -File)
# 각 testsuite의 tests/failures/errors/skipped를 합산하고 report index의 성공률을 확인
```

출력 원문:

```text
PRODUCT_TEST_FILES=65
PRODUCT_TESTS=664
PRODUCT_FAILURES=0
PRODUCT_ERRORS=0
PRODUCT_SKIPPED=0
PRODUCT_XML_OLDEST=2026-08-03T13:21:18.8140710+09:00
PRODUCT_XML_NEWEST=2026-08-03T13:21:18.8461057+09:00
<div class="percent">100%</div>
```

판정: fresh product-service 전체 테스트는 **664건 / 실패 0 / 오류 0 / skip 0**, 성공률 100%다. R11 보고서의 **652건**은 현재 HEAD에서 재현되지 않고 **12건 증가**했다. 사용자 제공 기준이 `R11 fix + main 병합`이므로 main 병합 후 추가된 테스트 수로 해석되지만, 본 라운드는 git 명령 금지라 commit별 테스트 증가 원인은 추적하지 않았다. 통과 여부는 전건 green이다.

R11 관련 suite XML 확인 명령 원문:

```powershell
# product-service JUnit XML 중 EcountAliasResolveServiceIT와
# EcountProductImporterSameNameMergeTest의 suite/testcase를 출력
```

출력 원문:

```text
EcountAliasResolveServiceIT|tests=5|failures=0|errors=0|skipped=0
  같은_품목명이_복수_활성이면_품목명_fallback은_오병합하지_않는다()
  soft_deleted_Product를_가리키는_staging_alias는_해소하지_않는다()
  ...
EcountProductImporterSameNameMergeTest|tests=8|failures=0|errors=0|skipped=0
  AP110RNPPHH1_싱글은_대표품목의_662000을_유지한다()
  관계_연결행의_비어_있지_않은_단가는_대표행_공백을_보완한다()
  승인된_순번코드와_모델코드는_fingerprint가_달라도_같은_품목으로_병합된다()
  같은_품목명이어도_규격과_단가가_다르면_각각의_품목과_값을_보존한다()
  승인된_모델코드_연결도_직접_연결행의_비어_있지_않은_값을_보완한다()
  ...
```

판정: R11 핵심 product suite는 **5건 + 8건 전건 통과**했다. ② 삭제 Product 차단, ① 중복 활성 이름 거부, ③ 관계 밖 상이 fingerprint 분리와 direct 보완, ④ AP 662,000 회귀가 모두 green이다.

### ④-5 accounting-service 전체 테스트 시작

실행 명령 원문:

```powershell
Start-Process -FilePath '.\gradlew.bat' -ArgumentList ':services:accounting-service:test','--rerun-tasks','--no-daemon','--console=plain' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
```

출력 원문:

```text
ACCOUNTING_GRADLE_PID=31388
```

판정: 컨테이너 재기동 없이 fresh accounting 전체 테스트를 시작했다. PID 31388을 30초 단위로 추적한다.

첫 30초 polling 출력 원문:

```text
ACCOUNTING_GRADLE_PROCESS=RUNNING
```

판정: 전체 모듈 테스트가 실행 중이다.

두 번째 30초 polling 출력 원문:

```text
ACCOUNTING_GRADLE_PROCESS=RUNNING
```

판정: 계속 실행 중이다.

여덟 번째 polling 출력 원문:

```text
ACCOUNTING_GRADLE_PROCESS=COMPLETED
```

JUnit XML 집계 명령 원문:

```powershell
$files=@(Get-ChildItem -LiteralPath 'services\accounting-service\build\test-results\test' -Filter 'TEST-*.xml' -File)
# tests/failures/errors/skipped 합산 및 HTML report 성공률 확인
```

출력 원문:

```text
ACCOUNTING_TEST_FILES=206
ACCOUNTING_TESTS=1746
ACCOUNTING_FAILURES=0
ACCOUNTING_ERRORS=0
ACCOUNTING_SKIPPED=10
ACCOUNTING_XML_OLDEST=2026-08-03T13:28:07.7103908+09:00
ACCOUNTING_XML_NEWEST=2026-08-03T13:28:07.8218411+09:00
<div class="percent">100%</div>
```

판정: fresh accounting-service 전체 테스트는 **1,746건 / 실패 0 / 오류 0 / skip 10**, 성공률 100%다. R11 보고서의 **1,737건**은 현재 HEAD에서 재현되지 않고 **9건 증가**했으며 test suite 파일도 204→206으로 2개 늘었다. 현재 기준 전건 green이다.

Mig8 suite XML 확인 명령 원문:

```powershell
# accounting-service JUnit XML에서 Mig8OrderTransformServiceTest suite와
# 160/삭제_alias/하이픈_prefix 관련 testcase를 출력
```

출력 원문:

```text
Mig8OrderTransformServiceTest|tests=25|failures=0|errors=0|skipped=0
삭제_alias_코드는_짧은_하이픈_prefix_alias로_우회하지_않는다()
soft_deleted_alias_UUID가_섞인_160건은_삭제_UUID를_쓰지_않고_전건_reject한다()
품목코드_뒤에_하이픈_품목명이_붙은_라벨도_품목코드_alias로_해소한다()
```

판정: R11의 Mig8 25건이 그대로 전건 통과했다. ②의 160행 삭제 UUID 차단과 짧은 하이픈 prefix 우회 차단, 정상 `품목코드-품목명` alias 해소를 함께 확인했다.

### ④ 판정

| R11 주장 | R12 실측 | 판정 |
|---|---:|---|
| 정상 주문 거부 3,489→0 | 474/474라벨, 26,055/26,055행, 3,489/3,489주문 해소; guard 거부 0 | 재현 |
| PENDING 26,055행 전건 해소 | 미해소 0라벨/0행 | 재현 |
| 값 소실 0 | 23+2+1 분류, 유일 nonblank 손실 0필드 | 재현 |
| AP110RNPPHH1 싱글 662,000 | 662,000 | 재현 |
| product-service 652건 전건 통과 | **664건**, 실패/오류/skip 0 | 전건 통과는 재현, 정확한 수는 불일치(+12) |
| accounting-service 1,737건 전건 통과 | **1,746건**, 실패/오류 0, skip 10 | 전건 통과는 재현, 정확한 수는 불일치(+9) |
| 입력 SHA-256 | 5개 파일 전부 R11 기록과 동일 | 재현 |

정확한 테스트 수 652/1,737은 현재 `245c0246e` 기준에서 재현되지 않았다. 이는 실 사용자 결함이 아니라, R11 fix 이후 main 병합이 포함된 현재 HEAD의 fresh suite 수가 증가한 **보고 수치 불일치**로 기록한다.

## 판정 전 최종 스냅샷 안정성 확인

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT COUNT(*) AS pending_rows,COUNT(DISTINCT order_no) AS pending_orders,COUNT(DISTINCT item_name) AS pending_labels FROM staging.ecount_order_raw WHERE is_deleted=FALSE AND transform_status='PENDING'; COMMIT;"
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT COUNT(*) AS alias_total,COUNT(*) FILTER(WHERE p.id IS NOT NULL AND p.is_deleted=FALSE) AS active_target,COUNT(*) FILTER(WHERE p.id IS NOT NULL AND p.is_deleted=TRUE) AS deleted_target,COUNT(*) FILTER(WHERE p.id IS NULL) AS dangling_target FROM staging.ecount_item_alias a LEFT JOIN products p ON p.id=a.main_product_uuid; COMMIT;"
```

출력 원문:

```text
pending_rows | pending_orders | pending_labels
       26055 |           3489 |            474

alias_total | active_target | deleted_target | dangling_target
       2835 |          2835 |              0 |               0
```

판정: 조사 시작과 종료의 핵심 DB 계수가 동일하다. 장시간 테스트 중 공유 실 DB 모집단이 바뀌지 않았고, 테스트 실행이 실 DB를 오염시키지 않았다.

## 판정 전 자문 — 이 라운드가 안 본 것이 있나?

있다. 아래 표면은 이번 R12의 결함 0 판정에 포함하지 않는다.

1. **실 `product_db` 임포트 전·후 결과**: 2,655행을 쓰는 실제 임포트는 금지되어 실행하지 않았다. 현재 입력 파일과 코드의 read-only 투영, 관련 모듈 전체 테스트로만 병합 결과를 검증했다.
2. **실 주문 transform write 경로**: PENDING 26,055행을 실제 변환하지 않았다. 현재 DB 스냅샷과 동일 후보 선택 로직의 read-only 투영으로 474라벨/3,489주문 해소 여부를 계산했다.
3. **실행 중 컨테이너의 API 응답과 라이브 QA**: `samhan-slip-service`와 `samhan-accounting-service`가 PR #1061 코드로 배포된 상태이므로 이 PR의 증거에서 의도적으로 제외했다. 컨테이너를 빌드·배포·재기동하지 않았다.
4. **현재 입력에 존재하지 않는 관계 밖 fingerprint 모집단**: 현재 재취득 원본에서 관계 없는 동일명/fingerprint 그룹은 0그룹/0행이다. 따라서 그 모집단의 실 데이터 end-to-end 발화는 없으며, 소스 분기와 fresh 모듈 테스트로만 차단을 확인했다.
5. **동시 변경 경쟁 조건**: resolver의 후보 조회 사이에 alias/Product가 생성·삭제되는 동시성 상황은 재현하지 않았다. 조사 시작·종료 스냅샷은 동일했지만 운영 중 동시 mutation은 시험 범위가 아니다.
6. **다른 환경과 미래 입력**: 이 로컬 공유 DB 및 지정된 입력 파일 이외의 운영/스테이징 DB, 이후 추가될 라벨·품목은 보지 않았다.
7. **테스트 수 증가 원인 추적**: 현재 fresh 결과가 R11 기록보다 product +12, accounting +9인 사실은 확인했으나, git 명령 금지에 따라 main 병합 중 어느 변경이 수를 늘렸는지는 추적하지 않았다.
8. **원격 PR/CI 상태**: 로컬 HEAD와 사용자 지정 입력을 검증했으며 GitHub PR 상태나 원격 CI 산출물은 조회하지 않았다.

따라서 아래의 “결함 0”은 위 미검증 표면까지 무결하다는 뜻이 아니라, 사용자가 지정한 네 각도와 현재 실 데이터 스냅샷에서 **실 사용자 경로로 재현 가능한 과다 병합·삭제 alias 부활 결함을 찾지 못했다**는 뜻이다.

## 최종 판정

**R12 판정: CLEAR — 실 사용자 경로로 재현 가능한 결함 0건.**

- ① 정규화 후보 충돌은 161그룹이지만 서로 다른 활성 Product UUID로 경쟁하는 라벨은 **0건**이다. R11 신규 후보로 최종 해소된 것은 15라벨/279행이며 모두 단일 UUID다.
- ② alias 2,835건은 전부 활성 Product를 가리킨다. 삭제 대상 **0건**, dangling **0건**이며, 삭제 Product 2건은 alias가 없다. 160행 삭제 UUID 회귀 테스트도 전건 차단됐다.
- ③ 현재 원본의 structural bypass는 **28그룹/29행**이나 전부 명시적 관계·승인 direct mapping 내부다. direct mapping 밖 필드 보완은 **0그룹/0행**이다. R10의 27그룹/28행은 현재 입력에서 AP110RNPPHH1 연결 1건이 추가되어 그대로 재현되지 않았다.
- ④ 거부 3,489→0, PENDING 26,055행 전건 해소, 값 소실 0필드, AP110RNPPHH1 662,000원, 입력 해시 5개는 재현됐다. 정확한 테스트 수는 R11 기록과 달리 product **664건**(+12), accounting **1,746건**(+9)이었고 실패·오류는 0이다.

사용자 재현 절차와 영향 건수를 적어야 할 결함은 없다. 다만 **R11의 정확한 전체 테스트 건수 652/1,737은 현재 HEAD에서 재현되지 않았다**는 원문/실측 불일치를 예외 규칙에 따라 명시한다.

### 종료 상태

확인 명령 원문:

```powershell
Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
  Where-Object { $_.CommandLine -like '*w984-ecount*' -and
    ($_.CommandLine -like '*GradleWrapperMain*' -or $_.CommandLine -like '*GradleDaemon*') }
```

출력 원문:

```text
W984_JAVA_GRADLE_PROCESSES=0
```

판정: R12가 시작한 Gradle/Java 테스트 프로세스는 남아 있지 않다.
