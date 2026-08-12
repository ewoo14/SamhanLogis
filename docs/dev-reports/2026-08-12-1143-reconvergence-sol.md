# PR #1187 (#1143) 재수렴 적대검증

## 결론

**실 사용자 경로로 재현 가능한 결함은 발견하지 못했다.**

원 결함인 기초품목 세트 무변경 저장은 격리 V39 DB와 현재 HEAD 서비스에서 저장 전후 값을 직접 비교했다. `AUTO 4 + AUTO 6`, 두 FIXED 금액 `45,375 / 75,625`, AUTO의 고정금액 `NULL`, FIXED의 비중 `NULL`이 모두 보존됐다. 배분 3필드를 전부 생략한 레거시/부분 요청도 차이 0행이었다.

공유 DB에는 `pg_dump`와 SELECT만 수행했고 데이터 쓰기는 0건이다. 검증용 PostgreSQL과 product-service는 `127.0.0.1:43339 / 43384`에 격리했으며 종료 후 제거했다.

## 1. 원 결함 — 저장 전후 값 직접 비교

대상 세트: `AC110CAMDHH1SY`

```text
FULL_NOCHANGE_HTTP=200
FULL_NOCHANGE_DIFF_ROWS=0
FULL_NOCHANGE_AFTER=
AC110BXADHH1|AUTO|6|
AC110CNMDHH1|AUTO|4|
AWR-WE13N|FIXED||45375.00
AWR-WG00N|FIXED||75625.00
```

저장 전과 저장 후의 `componentProductCode | allocationMode | allocationWeight | fixedAllocationAmount`를 모델코드로 정렬해 비교했다. HTTP 200만 본 것이 아니다.

## 2. fix2 신규행 기본값 판정

`FIXED / null / null`은 개발책임자 결정과 일치한다. #1143 OWNER 결정은 “구성품 등록 시 해당 구성품의 기본 납품가격 자동 반영”이고, 선행 #1093 계약은 금액 입력을 FIXED, `자동` 선택을 AUTO로 구분한다. 따라서 신규 구성품은 기본 납품가가 채워진 FIXED로 시작하는 것이 의도다.

격리 DB의 활성 일반 품목 `ACD-2558G` 기본 납품가는 `45,375.00`원이었다. 실제 ProductForm 신규행과 동일하게 `FIXED / null / null`을 보내 직접 확인했다.

```text
NEW_ROW_HTTP=200
NEW_ROW_MODE=FIXED
NEW_ROW_WEIGHT=
NEW_ROW_FIXED_AMOUNT=45375.00
RESTORE_HTTP=200
RESTORE_DIFF_ROWS=0
RESTORE_ROW_COUNT=4
```

검증용 신규행은 마지막에 제거했고 원래 4행 계약으로 복원했다.

## 3. 부분 저장

현재 화면의 기존 7필드만 보내고 배분 3필드를 전부 생략했다.

```text
PARTIAL_HTTP=200
PARTIAL_ALLOCATION_DIFF_ROWS=0
PARTIAL_AFTER=
AC110BXADHH1|AUTO|6|
AC110CNMDHH1|AUTO|4|
AWR-WE13N|FIXED||45375.00
AWR-WG00N|FIXED||75625.00
```

생략 필드는 동일 구성품의 기존 계약에서 병합됐다.

## 4. 비중 합 계약

```text
BAD_SUM_HTTP=400
BAD_SUM_BODY={"success":false,"code":"INVALID_INPUT","message":"자동 구성품 비중 합은 10이어야 합니다.",...}
BAD_SUM_MUTATION_DIFF_ROWS=0
NORMAL_SUM10_HTTP=200
```

합 9는 400과 정확한 사용자 문구를 반환했고 실패 후 DB 변경도 0행이었다. 합 10은 저장됐다.

## 5. 271세트 현재 HEAD 직접 재전개

V37 공유 DB를 파이프 없이 파일로 복제하고, 격리 DB에서 현재 HEAD product-service를 기동해 V38(Java)→V39(SQL)를 적용했다. 그 뒤 싱글세트 271개 전부를 현재 HEAD `/products/internal/expand`로 다시 호출했다.

```text
SETS=271
LINES=855
ERRORS=0
TOTAL_UNIT_PRICE=518775000
VALUE_DIFF_ROWS=0
SHA256_REFERENCE=2D5FC19872691DED89D197BE0B13B03297ED3C28425CA2238E380042F33D9660
SHA256_CURRENT=2D5FC19872691DED89D197BE0B13B03297ED3C28425CA2238E380042F33D9660
```

현재 HEAD 재전개 파일과 V39 기준 파일의 바이트 SHA-256까지 동일하다.

대표 세트도 무변경 저장 후 직접 전개했다.

```text
AC110CNMDHH1  893,375
AC110BXADHH1  1,341,250
AWR-WE13N        45,375
합계           2,280,000
```

동일 세트의 pre/post 기준값도 각각 `2,280,000`원이다.

## 6. 마이그레이션·#1132·#1117

```text
37 | mark active bundle components default | SQL  | t
38 | ProductCategoryBackfill                | JDBC | t
39 | bundle component allocation contract   | SQL  | t

single_sets=271
active_component_rows=1447
default_rows=855
```

- V38 Java 다음에 V39 SQL이 적용됐다.
- #1132 V37 기본 구성품은 855행으로 보존됐고 현재 전개도 855라인이다.
- #1117 기초품목 편집 소관의 GET/PUT 실제 경로에서 무변경·부분·추가·복원을 수행했다.
- 복원 후 한글 DB 값도 `기본 / 싱글 덕트 / 유선리모컨 / 컬러유선리모컨`으로 정상임을 SELECT로 재확인했다.

## 7. 라이브 QA

인앱 브라우저 런타임을 직접 조회한 결과:

```text
No browser is available
agent.browsers.list() = []
```

따라서 기초품목 편집→견적/전표 화면 전개는 **skipped**다. 과거 이미지 복사·합성·모사 PNG는 만들지 않았다. 대신 같은 격리 DB에서 실제 편집 API와 견적/전표가 호출하는 실제 `BundleExpander` internal API까지 검증했다.

스크린샷 경로: **없음(0장)**.

## 8. 검증 집계

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| product-service 전량 | 784 | 0 | 0 |
| desktop 단위 전량 | 2,235 | 2 | 0 |
| desktop typecheck real-QA 집계 | 51 | 0 | 0 |
| 격리 API/DB 관문 | 10 | 0 | 0 |
| 라이브 화면 QA | 0 | 1 | 0 |

추가로 desktop build와 typecheck 명령은 각각 exit code 0이었다.

## 9. 실행 원문

```text
.\gradlew.bat :services:product-service:test --rerun-tasks --no-daemon

BUILD SUCCESSFUL in 3m 15s
15 actionable tasks: 15 executed

FILES=73
TESTS=784
FAILURES=0
ERRORS=0
SKIPPED=0
PASSED=784
```

```text
npm run typecheck

ℹ tests 51
ℹ pass 51
ℹ fail 0
ℹ skipped 0
```

```text
npm run build
✓ built in 7.96s
exit code 0
```

```text
npx vitest run --reporter=json

EXIT=0
TESTS=2237
PASSED=2235
FAILED=0
SKIPPED=2
```

```text
.\docs\qa\2026-08-12-1143-reconv\reconv-api-probe.ps1
FULL_NOCHANGE_HTTP=200
FULL_NOCHANGE_DIFF_ROWS=0
PARTIAL_HTTP=200
PARTIAL_ALLOCATION_DIFF_ROWS=0
BAD_SUM_HTTP=400
BAD_SUM_MUTATION_DIFF_ROWS=0
NORMAL_SUM10_HTTP=200
NEW_ROW_HTTP=200
NEW_ROW_MODE=FIXED
NEW_ROW_FIXED_AMOUNT=45375.00
RESTORE_HTTP=200
RESTORE_DIFF_ROWS=0
```

```text
.\docs\qa\2026-08-12-1143-reconv\reconv-expand-all.ps1
SETS=271
LINES=855
ERRORS=0
TOTAL_UNIT_PRICE=518775000
VALUE_DIFF_ROWS=0
SHA256_REFERENCE=2D5FC19872691DED89D197BE0B13B03297ED3C28425CA2238E380042F33D9660
SHA256_CURRENT=2D5FC19872691DED89D197BE0B13B03297ED3C28425CA2238E380042F33D9660
```

## 10. QA 산출물

- `docs/qa/2026-08-12-1143-reconv/current-head-expanded-values.csv`
- `docs/qa/2026-08-12-1143-reconv/reconv-api-probe.ps1`
- `docs/qa/2026-08-12-1143-reconv/reconv-expand-all.ps1`
- 스크린샷: 없음

## 11. 증거 무결성과 라운드 종료

- 첫 격리 시도에서 Windows PowerShell 구형 HTTP 클라이언트가 한글 요청을 잘못 인코딩한 것을 발견했다. 그 결과는 전부 폐기하고 격리 DB 컨테이너를 V37 덤프에서 재생성한 뒤, UTF-8 `StringContent` 기반 스크립트로 전 항목을 다시 검증했다.
- 최종 한글 SELECT가 정상임을 확인했다.
- 검증 전용 서비스·DB 컨테이너·포트·덤프·PID·로그를 종료/제거했다. `43339/43384` listener와 `w1111-1143-reconv-pg` 잔존은 0이다.
- GitHub HEAD tree의 blob 19,382개와 로컬을 대조해 삭제된 추적 파일 `tools/.s24-build-only/build/deep/tracked-writer.mjs` 1개를 발견했다.
- HEAD 원문으로 복구하고 사용자 지시대로 `git add -f -- tools/.s24-build-only/build/deep/tracked-writer.mjs`를 실행했다.
- 복구 파일의 로컬 Git blob SHA-1은 HEAD API blob SHA-1 `6f4bd99bc47f4e068c446aeedd188660cfdcf553`와 일치했다.
- PR #1187 Files API의 `status=removed`는 0건이다.
- 구현 코드 변경: 0.
