# PR #1097 / 이슈 #1096 — CODEX SOL 5.6 S6 재수렴

- 검증 HEAD: `e375d0c852a2d595cdbfe86a38a5b9cb155731e1`
- 판정 범위: 실 사용자 도달성만. 검증 품질은 보지 않았고, 예외적으로 증거 무결성을 확인했다.
- 제약 준수: git index/branch/commit 쓰기 없음, DB는 `SELECT`만 수행, 컨테이너 쓰기·재빌드·재시작 없음, 테스트 실행 없음
- 판정: **중단 — S6가 D2를 고쳤다는 전제가 원문·실데이터와 불일치**

## 0. 결론

이번 라운드에서 확인한 범위의 **실 사용자 도달 결함은 0건**이다. 견적 삭제행에서는 목록의 `restoreAvailable`과 일반 복원 endpoint 사이에 현재 실데이터 기준 `보이는데 409` 또는 `안 보이는데 성공`하는 행이 없다. 전표에는 endpoint가 409를 반환할 삭제행이 현재 16건, V117 적용 투영 후 20건 있지만, 실제 데스크톱 경로는 고정된 첫 20행만 요청하고 페이지 이동이 없어 해당 행을 화면에 전달하지 않는다. 따라서 이 라운드의 도달성 기준으로 결함으로 세지 않았다.

그러나 검증 전제가 틀렸다. S6가 D2를 고쳤다는 설명과 달리 `2026/07/27-1`은 V117에서 여전히 한 행도 정리되지 않는다.

```sql
WHERE e.is_deleted=FALSE
```

현재 이 견적은 헤더가 이미 `is_deleted=TRUE`이고 활성 QA797 라인 2개는 101개 시더 product ID 집합 밖이다. 따라서 문서 선택에도, 전역 시더 라인 UPDATE에도 들지 않는다. S6가 이 행에 실제로 추가한 효과는 `restoreAvailable=false`로 복원 버튼을 숨기는 것뿐이다.

지시의 “전제가 틀리면 고치지 말고 중단·보고”에 따라 이 불일치를 발견한 상태에서 코드 수정 없이 중단한다.

## 1. 첫 각도 — 새 식별 조건의 실데이터 투영

V117의 101개 UUID를 CTE로 그대로 옮겨 읽기 전용 집계를 수행했다.

| 항목 | 실측 |
|---|---:|
| 활성 견적 | 2,017 |
| `QUOTE_DRAFT` + 미전환 + 활성 시더 라인 보유 | 1,984 |
| 적용 대상 중 활성 라인이 전부 시더 product ID | 1,980 |
| 적용 대상 중 시더 밖 product ID 라인도 보유 | 4 |
| 활성 시더 라인이 있지만 상태/전환 가드로 제외 | 1 |

PM 수식의 `순수 시더 1,981 + 혼합 4 - DRAFT 아닌 것 1 = 1,984`는 모수 표현으로 맞다. 다만 **실제 적용 대상 안의 순수 시더 문서**는 1,980건이고, 1,981에는 `QUOTE_ACCEPTED`라 제외되는 1건이 포함된다.

대상 1,984건의 생성자 분포는 1,429건 / 542건 / 13건의 세 dev 계정이고, 날짜 분포는 2026-06-08 1,926건, 2026-07-15~17 43건, 2026-08-06 15건이다. 문서 헤더·라인에 `시드` 또는 `QA` 표식이 명시된 것은 6건뿐이고 1,978건에는 그런 문서 표식이 없다.

그렇지만 이것을 정상 업무 오삭제 결함으로 세지 않는다. 이슈 #1096 원문은 테스트 품목 101개뿐 아니라 **그 품목을 참조하는 전표·견적·주문 전부**를 정리 범위로 확정했고, 개발책임자는 1,984건이라는 규모를 보고 승인했다. 즉 현재 정책에서 문서 provenance는 “그 문서가 시더가 만들었는가”가 아니라 “정리 대상 품목을 참조하는가”다.

시더 밖 product ID 라인을 함께 가진 4건은 `2026/07/17-1`, `-2`, `-5`, `-20`이며 각 문서가 시더 라인 1개와 QA797 구성품 라인 2개를 가진다. C안의 혼합 문서 전체 삭제 대상과 정확히 일치한다.

## 2. 증거 무결성 중단 — D2는 V117에서 여전히 빠진다

### 원문

S6의 문서 선택은 번호 하드코딩을 없앴지만 활성 헤더 가드는 그대로다.

```sql
SELECT e.id
FROM estimates e
WHERE e.is_deleted=FALSE
  AND e.status='QUOTE_DRAFT'
  AND e.converted_slip_id IS NULL
  AND EXISTS (... 활성 시더 product ID 라인 ...);
```

라인 UPDATE의 다른 갈래도 101개 시더 product ID 또는 위에서 선택된 문서 ID만 받는다.

```sql
WHERE l.is_deleted=FALSE
  AND (l.product_id IN (SELECT id FROM _issue_1096_test_product_ids)
       OR l.estimate_id IN (SELECT id FROM _issue_1096_cleanup_estimate_ids));
```

### 실데이터

`2026/07/27-1`은 다음 상태다.

```text
헤더 is_deleted                  TRUE
활성 시더 product ID 라인          0
활성 시더 밖 QA797 라인             2
기존 삭제 라인                      0
V117 문서 선택                       제외
V117 라인 UPDATE                     0행
```

따라서 “D2 — 이미 삭제 상태라 대상에서 빠지던 문제를 provenance 판정으로 해소”했다는 S6 설명은 틀렸다. 실제 사용자 표면은 별도 변경으로 안전하다. 전체 라인 그래프가 순수 QA797이므로 목록은 `restoreAvailable=false`, endpoint는 409이고 버튼은 보이지 않는다.

이 차이는 도달 결함이 아니라 **근거와 구현의 불일치**다. 개발책임자의 확정 문구가 “QA797 헤더는 삭제 상태로 두고 일반 복원만 차단”이라는 뜻이라면 현재 사용자 결과는 맞고, S6가 D2를 “V117 정리 대상으로 편입했다”고 설명한 부분만 정정해야 한다. 반대로 활성 QA797 라인까지 cleanup actor로 묶는 뜻이라면 구현이 아직 미완이다. 이 둘은 제시된 두 갈래 밖의 셋째 상태, 즉 **헤더는 기존 삭제 상태·라인은 활성 유지·복원 UI만 차단**이다.

## 3. `restoreAvailable`과 견적 복원 endpoint 양방향 대조

### 원문 대조

두 경로는 다음 두 조건을 같은 코드로 계산한다.

1. `isNonCanonicalQaResidue(estimate, allLines)`
2. 삭제 라인 전체 수와 헤더 `deletedBy`가 같은 삭제 라인 수의 일치

다만 endpoint에는 목록 계산에 없는 세 번째 거절 조건이 있다.

```java
if (estimateRepository.findByEstimateNo(estimate.getEstimateNo()).isPresent()) {
    throw new BusinessException(ErrorCode.CONFLICT, ...);
}
```

따라서 두 구현은 원문상 완전히 동일하지 않다. 현재 삭제 견적 7건에는 동일 번호 활성행이 0건이므로 이 차이가 실 사용자 불일치로 도달하지 않는다.

### 현재 DB 양방향 계수

| 조합 | 건수 |
|---|---:|
| 삭제 견적 전체 | 7 |
| 목록 `true`, endpoint의 두 그래프 조건도 통과 | 4 |
| 목록 `false`, endpoint도 그래프 조건에서 409 | 3 |
| 목록 `true`, 동일 번호 활성행 때문에 endpoint 409 | 0 |
| 목록 `false`, 삭제행 endpoint 성공 | 0 |

활성 견적 2,017건은 목록 버튼이 없지만 restore endpoint를 직접 호출하면 200 no-op을 반환한다. 이는 삭제행 복원 affordance 불일치가 아니라 idempotent endpoint의 활성행 처리이므로 결함으로 세지 않았다.

### V117 적용 투영

- 신규 삭제 대상 1,984건 중 순수 시더 1,980건: cleanup actor 때문에 `restoreAvailable=false`, endpoint 409.
- 혼합 4건: 전체 라인이 같은 cleanup actor로 삭제되어 `restoreAvailable=true`, endpoint 성공.
- 현재 이미 삭제된 `2026/07/26-1`~`-4`: V117이 활성 시더 라인 각 2개만 새 cleanup actor로 삭제하고 기존 헤더 actor는 바꾸지 않는다. 적용 후 4건 모두 `restoreAvailable=false`, endpoint 409.
- `2026/07/27-1`: V117 변화 0행, 순수 QA797 판정으로 계속 `false`/409.

삭제행 기준 양방향 표면은 일치한다. 동일 번호 활성행이라는 누락 gate는 현재와 V117 직후 투영에서 0건이다.

## 4. `EstimateResponse.from(Estimate)` 1-arg fail-open

저장소 전체에서 다음을 전수 검색했다.

```text
EstimateResponse.from(
EstimateResponse::from
new EstimateResponse(
restoreAvailable
```

1-arg factory 호출부는 main·test·다른 모듈 모두 0건이다. 유일한 목록 직렬화 경로는 다음 2-arg 호출이다.

```java
.map(estimate -> EstimateResponse.from(estimate, isRestoreAvailable(estimate)))
```

Jackson이 record를 역직렬화할 때도 이 static factory를 자동 호출하지 않는다. 따라서 현재 직렬화·테스트·다른 모듈에서 기본값 `true`가 사용자 fail-open을 만드는 경로는 찾지 못했다. PM의 grep 전제는 맞다. 다만 공개 1-arg factory의 `true` 기본값은 향후 호출부가 생기면 fail-open이므로 불변식 지시서에는 제거 또는 fail-closed를 남긴다.

## 5. 전표 목록 — DB 후보와 실제 화면 도달성은 다르다

전표에는 `restoreAvailable`이 없고 `SlipListPage`는 전달받은 모든 삭제 판매전표에 복원 버튼을 렌더한다. endpoint는 삭제 라인이 있는데 헤더 `deletedAt`과 같은 삭제 라인이 0건이면 409다.

읽기 전용 실측:

| 항목 | 현재 | V117 투영 후 |
|---|---:|---:|
| 삭제 판매전표 | 102 | 기존 102 + 신규 삭제분 |
| endpoint 409 조건을 가진 기존 삭제행 | 16 | 20 |
| V117 때문에 새로 409 조건이 되는 기존 삭제행 | 0 | 4 |

새 4건은 `2026/07/16-54`, `2026/07/25-1`, `-2`, `-3`이다. 이미 삭제된 헤더 아래 활성 시더 라인을 V117이 새 시각으로 삭제하지만 헤더 시각은 바꾸지 않아 match가 0이 된다.

그러나 실제 데스크톱 경로는 다음과 같다.

```tsx
listSlips({ slipType: mode, includeDeleted: true, page: 0, size: 20 })
```

화면에는 페이지 이동 UI가 없고 저장소 주석상 이 route는 사이드바에서도 미노출이다. 현재 첫 20행은 삭제행 0건이고, V117 투영 후 첫 20행은 삭제행 2건이지만 둘 다 endpoint 성공 조건이다. 409 후보 16건은 모두 `delivery_tag IS NULL`이고 같은 태그 내 정렬 순위도 191~2,353위라 8개 태그 필터로 첫 페이지에 끌어올 수 없다.

따라서 “DB/API의 임의 페이지가 이 행을 전달하면 버튼은 보이고 409”인 잠복 조합은 현재 16건, 투영 후 20건이지만, **실제 사용자 화면에서 보이는 409 버튼은 현재 0건, 투영 후도 0건**이다. 이번 라운드의 유일 기준에 따라 결함으로 세지 않는다.

## 6. S3~S5 계약과 한 묶음 되돌리기

V117 신규 대상 1,984건에는 기존 삭제 라인이 0건이다. 선택된 활성 헤더와 모든 활성 라인은 같은 migration transaction의 cleanup actor와 `CURRENT_TIMESTAMP`로 표시되므로, 이 집합에서는 배치 완전성이 유지된다. 혼합 4건도 헤더와 3라인이 같은 묶음이다.

다만 V117의 전역 라인 UPDATE는 활성 헤더로 만든 `_issue_1096_cleanup_estimate_ids`와 범위가 다르다. 이미 삭제된 `2026/07/26-1`~`-4`의 활성 시더 라인 8개를 새 cleanup batch로 삭제하면서 헤더는 기존 사용자 삭제 batch에 둔다. 이 4문서는 “헤더+라인이 같은 한 묶음”은 아니며 일반 복원은 의도적으로 차단된다.

actor 기반 DB 되돌리기는 이 8개 라인을 활성으로 되돌려 V117 직전 상태(삭제 헤더+활성 라인)를 복원하므로 migration rollback 자체는 가능하다. 반면 S6가 D2까지 하나의 cleanup 묶음으로 편입했다고 주장하는 근거는 성립하지 않는다.

## 7. 양방향 RED

### RED-A — S6 D2 근거 무결성

```text
Given  2026/07/27-1은 삭제 헤더 + 활성 QA797 라인 2개
When   V117 S6 선택과 두 UPDATE를 읽기 전용으로 투영
Then   S6 설명: provenance 판정으로 D2가 정리 대상에 편입
Actual: e.is_deleted=FALSE에서 문서 제외 + 두 라인은 시더 UUID 밖 → 변경 0행
```

판정: **RED — 증거 무결성**. 사용자 복원 버튼은 별도 `restoreAvailable=false`로 숨겨져 있어 도달 결함은 아니다.

### RED-B — 삭제행 affordance 양방향

```text
Given  현재 삭제 견적 7건
When   목록 계산과 endpoint의 모든 삭제행 gate를 각각 평가
Then-A 버튼 표시 → endpoint 성공
Then-B 버튼 숨김 → endpoint 409
Actual A: 4/4, Actual B: 3/3, 동일 번호 활성행 0
```

판정: **GREEN — 현재 삭제 견적에서 양방향 불일치 0건**.

전표의 반대 방향 probe는 DB 후보 16건(투영 후 20건)이 RED지만 실제 화면 전달 건수는 0이라 도달성 gate에서 제외했다.

## 8. fix 지시서 — 불변식만

전제 불일치 때문에 구현 방식은 지시하지 않고 다음 불변식만 남긴다.

1. **D2 의미 단일성**: `2026/07/27-1`의 확정 상태가 (a) 헤더 삭제+활성 QA 라인 유지+일반 복원 차단인지, (b) 헤더와 QA 라인을 cleanup actor 한 묶음으로 정리하는지 하나여야 한다. 보고서·SQL·서비스가 같은 의미를 말해야 한다.
2. **선택/변경 집합 일치**: 문서 전체 cleanup 대상으로 선택하지 않은 삭제 헤더 아래의 활성 라인을 별도 batch로 바꿀 경우, 그 결과가 일반 복원 불가로 전환됨을 명시적으로 의도해야 한다. 의도하지 않았다면 그 라인은 변경하면 안 된다.
3. **삭제행 affordance 완전성**: `restoreAvailable=true`가 되려면 endpoint의 QA 분류, 배치 완전성, 동일 번호 활성행 충돌을 모두 통과해야 한다. endpoint에 새 409 gate가 추가되면 목록 계산도 같은 정책 함수를 사용해야 한다.
4. **fail-closed DTO**: 계산되지 않은 `restoreAvailable`은 `true`가 되어서는 안 된다. 1-arg factory를 유지해야 한다면 기본값은 비노출이어야 한다.
5. **전표 도달 시 정합**: 페이지 이동·검색 등으로 현재 409 후보 전표가 실제 목록에 도달하게 되는 순간, endpoint가 거부할 행에는 복원 버튼을 노출하지 않아야 한다.
6. **정확 원복**: cleanup actor 되돌리기는 V117이 실제 변경한 행만 V117 직전 상태로 돌려야 하며, 기존 사용자 삭제 헤더나 다른 삭제 batch를 활성화하면 안 된다.

## 9. PM 실측 정정

- 활성 견적 2,017: 맞음.
- S6 전체삭제 대상 1,984: 맞음.
- `순수 시더 1,981 + 혼합 4 - DRAFT 아닌 것 1`: 모수 수식으로 맞음. 실제 적용 대상 내 순수 시더는 1,980.
- 시더 밖 product ID 라인 보유 문서 4: 맞음.
- DRAFT 아니라 제외 1: 맞음.
- V117 견적번호 하드코딩 0건: 맞음.
- FE Vitest 4/4: 이번 라운드는 검증 품질 금지에 따라 재검사·판정하지 않음.
- 세 DB 마이그레이션 미적용: 맞음. `product_db=30`, `slip_db=115`, `partner_order_db=14`.
- “S6가 이미 삭제된 `2026/07/27-1`을 provenance로 정리 대상에 편입”: **틀림**.

## 10. 이번 라운드가 보지 않은 것

- 테스트 품질, 테스트 충분성, 테스트 설계, CI 상태
- 전체 테스트 스위트와 개별 테스트 재실행
- 실제 Flyway 적용, DB 쓰기, 실제 DELETE/RESTORE API 호출
- 컨테이너 재빌드·재시작
- 집PC·운영 DB와 다른 환경의 실제 행 수
- 승인된 98%대 삭제 규모의 정책 타당성
- 사이드바 미노출 direct route 자체가 제품 결함인지 여부
- 전표 409 후보가 향후 pagination/search 추가로 도달하게 되는 경우의 구현

## 신규 파일

- `docs/dev-reports/2026-08-07-1096-sol-s6-reconvergence.md`
