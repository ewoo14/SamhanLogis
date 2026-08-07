# #1108 S4 재수렴 및 라이브 QA

## 결론

**BLOCK — S4 도달 결함 1건.** S2의 결함 수 1건과 같으므로 새 규칙에 따라 S3를 되돌리고
PM 재분석 → LUNA fix·검증으로 돌아가야 한다.

S3는 저장 시점의 토큰 검증과 쓰기 직렬화는 추가했지만, 화면에 주는 `componentCount`와
`componentSetToken`을 서로 다른 SQL 문장으로 읽는다. 운영 DB의 기본 격리 수준은
`read committed`다. 따라서 두 조회 사이에 구성품 교체가 커밋되면 화면은 이전 N건을 표시하고
토큰은 이후 M건 집합을 결박한다. 사용자가 N건 삭제에 확인해도 서버는 M건 토큰을 정상으로
받아 M건을 삭제할 수 있다. 저장 잠금 뒤가 아니라 **동의 스냅샷 발급 앞**에 남은 셋째 경로다.

## 0. 환경 확인

| 항목 | 결과 |
|---|---|
| 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t1108`만 사용 |
| 브랜치 | `fix/1108-bundle-component-destroy-guard` |
| S3 상태 | 검증 시작 시 11파일 staged·commit 전. 검증 중 17:33 KST에 외부 세션이 S2/S3와 당시 S4 골격을 `cd4e6f4d8`로 commit·push함. 이 검증자는 commit·push·unstage를 실행하지 않음 |
| PR #1109 | 최종 HEAD `cd4e6f4d8`; 확인 시점 41 success, 1 in progress. 완료 전이므로 CI green으로 단언하지 않음 |
| Docker | healthy 컨테이너 18개 확인 |
| 게이트웨이 | `http://localhost:8080/actuator/health` → HTTP 200, `UP` |
| 자격 | `infrastructure/.env.local` 없음. `docs/handoff/CURRENT-WORK.md` 환경 절을 fallback으로 확인했으며 이 보고서에는 `<redacted>`만 기록 |
| `product-service` | healthy. 이미지/컨테이너 생성 2026-08-07 16:54 KST, `product_db.flyway_schema_history` V31 `soft delete test seed products`가 16:54:39 KST 적용됨. 현재 #1097 배포본이라는 지시와 일치 |
| #1097 점유 | PR OPEN, 핸드오프상 게이트 ③ 라이브QA만 남음. 현재 스택에 #1097 V31이 실제 적용돼 있어 점유 해제 증거가 없음 |
| #1108 배포 가능 여부 | **불가.** #1097 스택을 보존하기 위해 `product-service` 재빌드·재기동을 하지 않음 |

배포 불가 판정은 단순 추정이 아니다. 실행 이미지 시각과 DB Flyway V31 적용 시각이 일치하고,
#1097이 아직 라이브QA 미완인 상태다. 이 상태에서 #1108 이미지를 올리면 #1097 관측 좌표를
덮는다.

검증 도중 공유 작업트리 HEAD가 `e98a60983`에서 `cd4e6f4d8`로 이동했다. reflog에는 17:33:34 KST
commit이 기록됐고 branch upstream은 `+0/-0`으로 origin에도 반영돼 있었다. 이 상태 변화는 본 S4의
지시 범위 밖 외부 실행이며, 본 검증은 이미 읽어 둔 S3 diff와 최종 HEAD의 동일 내용을 대조해 계속했다.

## 1. S2 지시서 닫힘 여부

### 1.1 닫힌 부분

- `BundleComponentConsentToken.from(...)`은 활성 `BundleComponent.id`를 정렬한 뒤 SHA-256으로
  해시한다. 건수가 아니라 UUID 집합을 결박하므로 **토큰 발급 이후** 증가·감소·동일 건수
  교체를 구분한다.
- `ProductService.update()`는 graph advisory transaction lock을 먼저 얻고, 기존 품목이 BUNDLE이면
  부모 Product를 `PESSIMISTIC_WRITE`로 잠근 뒤 활성 구성품을 재조회하고 토큰을 비교한다.
- `replaceComponents()`와 시트 sync도 graph lock → 부모 row lock 순서를 사용한다. 조사한 경로에서
  반대 순서의 잠금 획득은 찾지 못했다.
- 활성 구성품이 0건이고 확인 시도도 없는 전환은 기존처럼 통과한다.
- 활성 구성품이 있는데 Boolean·토큰이 없거나 토큰이 다르면 `INVALID_INPUT`으로 거부하고
  `removeBundleChildren`를 호출하지 않는다.

### 1.2 닫히지 않은 부분 — D1

**도달 경로: 표시 건수와 동의 토큰의 분리 스냅샷**

1. A 사용자의 `GET /api/v1/products`가 `countMapByBundleProductIds()`로 기존 집합 S1의 N건을 읽는다
   (`ProductCatalogController.java:180-182`).
2. 같은 트랜잭션이지만 운영 격리 수준은 `READ COMMITTED`이므로, 다음 SQL 전에 B 사용자의
   구성품 replace-all S2가 커밋될 수 있다.
3. A 요청의 두 번째 조회 `findActiveByBundleProductIdIn()`은 새 집합 S2를 읽고 그 토큰을 만든다
   (`ProductCatalogController.java:183-188`).
4. 응답은 `componentCount=N`과 `componentSetToken=token(S2)`를 한 행에 조합한다
   (`ProductCatalogController.java:205-207`).
5. A 화면은 N건 삭제라고 보여 주지만 확인 요청은 `token(S2)`를 보낸다. 이후 변경이 없다면
   저장 시 검증은 성공하고 실제 S2=M건을 삭제한다.

N≠M 증가·감소뿐 아니라 N=M 동일 건수 교체도 이 창을 통과한다. S3 테스트들은 저장 시점에
미리 만든 stale token을 넣는 단위 테스트라, **count SQL과 token SQL 사이 커밋**은 재현하지 않는다.

### 1.3 토큰 수명과 사용자 표시

- 시간 기반 만료는 없다. 활성 구성품 row UUID 집합이 같으면 창을 오래 열어도 토큰은 계속 유효하다.
- 구성품 row가 추가·soft-delete·replace-all되어 UUID 집합이 바뀌는 순간 사실상 만료된다.
- 만료 토큰 저장 시 서버는 `구성품 집합이 변경되었습니다. 현재 구성품 N건을 확인한 뒤 다시 저장하십시오.`를
  반환한다. 화면은 이를 form error로 표시하고 edit seed를 refetch한다. 다음 저장에서 최신 건수로
  다시 확인한다.
- 이 토큰은 권한 토큰이 아니라 집합 버전이므로 시간 TTL이 없는 것 자체는 결함으로 세지 않았다.
  문제는 같은 응답 안의 표시 건수와 토큰이 동일 스냅샷이 아니라는 점이다.

## 2. S3 신규 표면

### 2.1 잠금 — 교착과 대기

- 모든 조사 대상 mutation은 먼저 동일한 PostgreSQL transaction advisory graph lock을 얻고,
  그 뒤 필요 시 부모 row lock을 얻는다. 역순 경로는 찾지 못해 신규 교착 조합은 정적으로 확인되지 않았다.
- 같은 품목의 다른 사용자는 먼저 얻은 트랜잭션이 끝날 때까지 기다린다. 다른 품목도 기존 graph
  advisory lock 때문에 mutation 전체가 이미 직렬화된다. S3 부모 row lock이 새로 넓힌 범위는
  BUNDLE 동일 부모이며, 정상 읽기에는 영향을 주지 않는다.
- 실제 PostgreSQL 두 세션으로 wait/deadlock 시간을 재는 통합 테스트는 없다. 이번에는 #1097 공유
  스택 점유 때문에 실행하지 않았다. 이는 안 본 범위로 남긴다.

### 2.2 토큰 발급 실패와 기존 호출자

- SHA-256이 JRE에서 제공되지 않으면 `IllegalStateException`, 구성품 조회가 실패하면 일반 서버 오류로
  목록 발급 자체가 실패한다. 별도 token fallback은 없다.
- `componentCount>0`인데 토큰이 누락된 비정상 응답을 받은 화면은 확인 후 토큰 없이 요청하게 되고,
  서버가 `INVALID_INPUT`으로 fail-closed한 뒤 화면이 오류 표시 + refetch한다.
- 토큰 없이 온 기존 호출자는 활성 구성품을 파기하는 전환일 때 400 `INVALID_INPUT`으로 차단된다.
  비파괴 수정 및 구성품 0건 전환은 계속 통과한다. 저장 호출부 grep에서 운영 FE의 해당 mutation은
  `ProductFormPage` 한 곳이었다.

### 2.3 RED-B — 평범한 1회 확인

- 동시 변경이 없으면 화면의 1회 확인 뒤 Boolean과 토큰을 한 요청에 보내며 서버가 통과시킨다.
- FE Vitest의 자재 전환 테스트는 `expectedBundleComponentSetToken`을 포함한 단일 mutation을 검증한다.
- BE의 세트→단일 및 자재 전환 정상 테스트도 올바른 토큰으로 삭제 호출을 각각 검증한다.
- 단, 위 D1의 매우 좁은 발급 창에서는 평범해 보이는 저장도 잘못된 스냅샷을 승인할 수 있다.

### 2.4 componentCount=0

- UI는 `bundleComponentCount > 0`일 때만 확인창을 띄운다.
- 서버는 현재 활성 집합 0건이며 확인 시도가 없으면 토큰 검증 게이트 밖으로 통과한다.
- `update_setToGeneral_removesOwnChildBundleComponents`가 0건 전환 경로를 통과시킨다.

## 3. 라이브 QA ①~⑤

**관측 불가.** #1097 코드가 `product-service`와 `product_db` V31에 현재 배포되어 있고 #1097의
라이브QA 게이트가 남아 있다. 지시대로 재빌드하지 않았다. 따라서 #1108 S3 동작을 실 GUI에서
판정하면 실제로는 #1097 배포본을 판정하는 거짓 증거가 된다.

| 항목 | 결과 |
|---|---|
| ① 구성품 있는 세트 → 단일 → 취소 → SQL 불변 | 관측 불가 — #1108 미배포 |
| ② 같은 세트 → 확인 → 정상 삭제·건수 일치 | 관측 불가 — #1108 미배포 |
| ③ 분류=자재, 취소/확인 두 갈래 | 관측 불가 — #1108 미배포 |
| ④ 구성품 없는 품목 → 확인 없이 통과 | 관측 불가 — #1108 미배포 |
| ⑤ 화면 표시 건수 == 실제 삭제 행 수 | 관측 불가 — #1108 미배포. 정적 검증에서는 오히려 D1 반례 확인 |

- GUI/DB 변경 품목코드: **없음**
- 생성 스크린샷: **없음**
- `docs/qa-shots/1108-s4-live-qa/`: 만들지 않음
- DB 직접 쓰기: 없음
- Docker 재빌드·재기동: 없음

## 4. 결함 수 — S2 대비

```text
S2 결함 수: 1
S4 결함 수: 1
```

S4의 1건은 토큰 비교 자체의 실패가 아니라, 그 토큰을 화면 표시 건수와 다른 시점에서 발급하는
동일 근본 결함의 잔존 경로다. 결함 수가 줄지 않았으므로 개발책임자의 새 규칙에 따라 PM은 S3를
되돌리고 발급 스냅샷부터 다시 분석한 뒤 LUNA fix·검증으로 진행해야 한다.

## 5. 검증 명령과 결과

| 검증 | 결과 |
|---|---|
| `:services:product-service:test` 전체 | **679 tests, failures 0, errors 0, skipped 0**, `BUILD SUCCESSFUL` |
| 관련 Gradle 필터 (`*Bundle*`, `*ProductService*`, component-count controller) | `BUILD SUCCESSFUL` |
| `vitest run ProductFormPage.test.tsx` | 1파일 **6/6 PASS** |
| `npm run typecheck` | exit 0; TypeScript 2종 + real-QA 단위 **2/2, 50/50 PASS** |
| `git diff --cached --check`, `git diff --check` | exit 0 |

위 통과 수치는 검증 시작 당시 staged였고 도중 `cd4e6f4d8`에 포함된 동일 S3 소스로 이 PC에서
새로 실행한 결과다. PR #1109의 새 HEAD CI는 최종 확인 시 41 success, 1 in progress라 완료 근거로
쓰지 않았다.

## 6. 본 범위와 안 본 범위

### 본 범위

- 검증 시작 시 staged였던 S3 11파일 전체 diff와 최종 `cd4e6f4d8` 포함 내용
- 토큰 정규화·비교, DTO/API/화면 배선
- 구성품 mutation 및 sheet sync의 advisory/row lock 획득 순서
- 동일 건수 교체·증가·감소·동시 삭제 단위 테스트
- 기존 호출자, 토큰 누락, 0건, 평범한 1회 확인 경로
- product-service 전체 자동 테스트와 desktop 해당 Vitest/TypeScript
- Docker/게이트웨이/#1097 배포 점유의 read-only 확인

### 안 본 범위

- #1108 배포본 실 GUI ①~⑤와 SQL 행 수 대조
- 실제 두 PostgreSQL 세션의 lock wait/deadlock 시간 측정
- #1108 스크린샷
- 다른 워크트리의 파일·변경 내용
- #1097 라이브QA 자체

## 7. 새 파일 목록

### S3 신규 (`cd4e6f4d8`에 포함)

- `services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponentConsentToken.java`
- `docs/dev-reports/2026-08-07-1108-s3-consent-set-fix.md`

### S4 산출물

- `docs/dev-reports/2026-08-07-1108-s4-reconvergence-and-live-qa.md`

검증 시작 때 이미 존재하던 untracked S2 지시서·S2 재수렴 보고서는 이번 S4가 만들거나 수정하지
않았다. 다만 외부 17:33 commit이 두 파일도 함께 포함했다.
