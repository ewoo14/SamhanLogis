# #1072 LedgerControllerIT fix — CODEX LUNA

실행일: 2026-08-13 (Asia/Seoul)  
브랜치: `feat/1072-1144-accounting-canon`  
제한: git 변경 계열 명령과 공유 DB 쓰기를 하지 않았다.

## 1. 세 테스트 판정

| 테스트 이름 | 실패 원문 (RED) | `main` 결과 | 판정 |
|---|---|---|---|
| Q3-1 `postedJournalLedgerExposesAccountName` | `java.lang.IllegalArgumentException at LedgerControllerIT.java:158` — `data.id`가 `VSow8BSNTBevi-ol3y6Qdw` 같은 opaque token인데 `UUID.fromString(id)` 실행 | `main` 소스 복사본에서 동일 targeted test를 실행했으나 120초 timeout으로 테스트 결과 미생성. 다만 `main`의 `JournalDetailResponse.id`는 UUID 직렬화이고 현재 브랜치에서만 `OpaqueUuidSerializer`가 추가됨 | (a) 브랜치 회귀 |
| Q3-2 `unknownAccountCodeReturnsNullName` | 동일: `java.lang.IllegalArgumentException at LedgerControllerIT.java:158` — 원장 조회 전 `createPostedJournal`의 UUID 파싱에서 중단 | 동일한 120초 timeout / 결과 미확정. `main`은 UUID 응답 계약 | (a) 브랜치 회귀 |
| Q3-3 `ledgerWithoutPartnerCodeRegression` | 동일: `java.lang.IllegalArgumentException at LedgerControllerIT.java:158` — token을 UUID로 파싱 | 동일한 120초 timeout / 결과 미확정. `main`은 UUID 응답 계약 | (a) 브랜치 회귀 |

`main`은 초기 복사본에서 의존성/테스트 준비가 120초 안에 끝나지 않아 실행 결과를 통과/실패로 단정할 수 없다. 판정은 실패 원문과 `main...HEAD` 코드 차이에 근거했다. 현재 브랜치의 변경은 `JournalDetailResponse`, `JournalResponse`, `JournalLineResponse`에 opaque serializer를 추가하고 controller path decoder를 추가한 것이며, `main`에는 해당 변경이 없다.

## 2. 원인

세 테스트 모두 `accountName` 조회, ChartOfAccount lookup, `partnerCode` 미지정 원장 조회까지 도달하지 못했다. `createPostedJournal`가 POST 응답의 식별자를 opaque token으로 받은 뒤 `UUID.fromString(id)`를 호출한 것이 직접 원인이다.

이는 계정과목 매핑(`110 → 1089`, `401 → 4019`)이나 원장 조회 query의 원인이 아니다. 테스트가 확인하는 세 계약은 그대로 유지했다.

CashReceiptControllerIT 수정과 같은 종류의 정당한 수정이다. UUID 내부 식별자의 의미나 assertion을 바꾼 것이 아니라, 응답 표현이 UUID에서 opaque token으로 바뀐 현재 API 계약에 맞춰 mutation path에 token을 그대로 전달했다. 테스트 기대값을 느슨하게 만들거나 accountName assertion을 제거하지 않았다.

## 3. RED → GREEN

RED:

```text
3 tests completed, 3 failed
LedgerControllerIT > Q3-3 ... FAILED
    java.lang.IllegalArgumentException at LedgerControllerIT.java:158
LedgerControllerIT > Q3-1 ... FAILED
    java.lang.IllegalArgumentException at LedgerControllerIT.java:158
LedgerControllerIT > Q3-2 ... FAILED
    java.lang.IllegalArgumentException at LedgerControllerIT.java:158
```

최소 수정:

```java
private String createPostedJournal(String amount) throws Exception {
    // opaque token을 그대로 post path에 전달
    return id;
}
```

GREEN targeted 결과:

```text
BUILD SUCCESSFUL in 51s
3 tests completed, 0 failed, 0 skipped
```

## 4. 원장 금액 전후 대조

이번 수정은 테스트 helper의 반환 타입만 바꾸며 production code, 매핑, DB를 변경하지 않는다. 따라서 라이브QA3의 read-only 대조값은 전후 동일하다.

| 대표 전표 | 변경 전 | 변경 후 | 판정 |
|---|---|---|---|
| `2026/04/05-1` | 110 차변 2,200,000 / 404 대변 2,000,000 / 220 대변 200,000 | 동일 | 일치 |
| `2026/04/10-1` | 101 차변 2,750,000 / 201 대변 2,750,000 | 동일 | 일치 |
| `2026/12/31-1` | 991 차변 700,000 / 210 대변 700,000 | 동일 | 일치 |

합계/라인도 라이브QA3 기록과 동일하다: 대표 전표 3/3, 라인 7/7, 차변·대변 합계 6/6 일치.

## 5. 불변식 2 재확인

라이브QA3 증거를 기준으로 다음을 유지한다.

- collab comments/presence/edits/stream: 4/4 HTTP 200
- 목록·상세·중첩 lines UUID: 0건
- 확정 매핑: 110→1089, 401→4019, 2/2
- 미정 표시: 10/10
- 대표 전표 금액: 3/3
- 대표 라인 금액 DB 일치: 7/7
- 전표 건수: API 133 = DB 133

## 6. 전체 검증 한계

`LedgerControllerIT` targeted 3건은 0 failed로 통과했다. `:services:accounting-service:test` 전량은 120초 제한에서 완료되지 않았다. 따라서 accounting-service 전체가 `0 failed`라고 주장하지 않는다.

## 7. 라운드 종료 점검

- 삭제된 추적 파일: `git ls-files --deleted` 출력 없음.
- 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`: 존재하며 추적 상태.
- 이번 실행에서 생성된 Testcontainers PostgreSQL/Ryuk 임시 컨테이너 6개와 timeout Gradle Java 프로세스를 정리했다.
