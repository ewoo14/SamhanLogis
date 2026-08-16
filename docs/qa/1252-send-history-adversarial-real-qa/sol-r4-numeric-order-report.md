# PR #1252 CODEX LUNA 마감 fix 보고

## ① 환경 확인

요청 원문 명령의 출력:

```text
f4363549c87e5d3e19e89f28e350302b9b490aed
feat/send-history-deleted-strikethrough
?? docs/qa/1252-send-history-adversarial-real-qa/sol-r3-reconvergence-report.md
```

기존 미추적 `sol-r3-reconvergence-report.md`는 보존했다. 커밋·push·add는 수행하지 않았다.

## ② RED 원문

숫자 suffix 정렬 회귀 테스트를 먼저 추가하고 실행했다. 기존 문자열 정렬의 실제 실패 원문:

```text
Expecting actual:
  ["2099/12/31-999999999999999999",
    "2099/12/31-9",
    "2099/12/31-7",
    "2099/12/31-25"]
to contain exactly (and in same order):
  ["2099/12/31-999999999999999999",
    "2099/12/31-1000",
    "2099/12/31-100",
    "2099/12/31-25"]
```

## ③ 근원

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderRepository.java:87-188`의 5개 history native query가 같은 유효시각 tie-breaker로 `o.order_no DESC` 문자열 비교를 사용했다.

## ④ 고친 것과 안정성 근거

5개 query 모두 `order_no` 마지막 `-` 뒤 suffix가 숫자인지 검사한 뒤 `CAST(... AS NUMERIC) DESC`로 정렬하도록 바꿨다. 숫자가 아닌 legacy suffix는 숫자 키 NULL 후 `o.order_no DESC, o.id ASC`를 적용한다. 따라서 큰 번호도 bigint 범위에 묶이지 않고, 숫자 동률과 legacy 값도 결정적인 순서를 유지한다.

회귀 테스트는 실제 저장소 query에 8개 주문을 넣고 두 페이지로 나눠 검증한다. `...-9`는 `...-25`보다 뒤에 오며, 페이지 총건수와 페이지 간 교집합 0도 동시에 단언한다.

## ⑤ 같은 시각 묶음 정렬 원문

```text
PAGE_0=2099/12/31-999999999999999999,2099/12/31-1000,2099/12/31-100,2099/12/31-25
PAGE_1=2099/12/31-9,2099/12/31-7,2099/12/31-0007,2099/12/31-0
```

## ⑥ 번호 자릿수 경계표

| 경계 | fixture | 결과 |
|---|---|---|
| 0 | `-0` | 최후 순서 |
| 0 선행 | `-0007` | `-7`과 동일 숫자 키, 문자열 tie-break로 안정 |
| 한 자리 | `-7`, `-9` | 숫자 내림차순 |
| 두 자리 | `-25` | `-9`보다 앞 |
| 세 자리 | `-100` | `-25`보다 앞 |
| 네 자리 | `-1000` | `-100`보다 앞 |
| 아주 큰 번호 | `-999999999999999999` | NUMERIC으로 정상 선두 |

## ⑦ 전수 순회 세 수치 유지

직전 실측 기준 유지 수치: `DOM 117 / 고유 주문 117 / 서버 총건수 117`, 누락 0, 중복 0. 이번 로컬 저장소 회귀에서도 페이지 총건수 8/8 및 페이지 간 중복 0을 확인했다.

## ⑧ 사업자번호·삭제행 유지

직전 실측 기준 자기 사업자번호 숫자·하이픈 200은 200, 나머지 6종은 전부 403. 삭제행 117건 모두 취소선·회색, 일반 목록 유출 0. 이번 변경은 `ORDER BY`만 수정했으며 권한/삭제 필터는 변경하지 않았다.

## ⑨ 캡처

Chromium은 `clients/desktop` 안에서 headless로 기동했다. 해시 경로 `/#/sales/partner-orders/history`로 접근하고 화면 고유 요소 `과거 발송이력 확인`을 단정하려 했으나, 이 워크트리에 라이브 앱 포트가 없어 연결 단계에서 중단됐다.

```text
page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:29390/#/sales/partner-orders/history
```

따라서 이번 라운드의 신규 캡처 파일은 생성하지 않았다. 공유 실데이터 write는 0건이다. 기존 캡처/실측은 `sol-r3-reconvergence-report.md`에 보존되어 있다.

## ⑩ 회귀

```text
partner-order-service 전체: 91 suites / 573 tests / failures 0 / errors 0 / skipped 0
desktop typecheck: PASS
desktop build: PASS
변경 저장소 테스트: PASS
```

## ⑪ 증거 무결성 자기 고지

실패 RED는 XML 원문에서 복사했다. 전수·사업자번호·삭제행 수치는 직전 실측 보존값이며 이번 라이브 재측정값으로 가장하지 않았다. 이번 변경에 대한 신규 수치는 저장소 테스트와 정적 diff에서만 주장한다.

## ⑫ 프로세스 회수

이번 라운드가 기동한 Gradle/Playwright 프로세스는 모두 종료됐다. 종료 확인 시 다른 워크트리 소유 가능 프로세스와 컨테이너는 건드리지 않았다.

```text
이번 라운드 잔여 Gradle=0
이번 라운드 Playwright Chromium=0
기존/공유 프로세스(java=3,node=13)=보존
기존/공유 컨테이너(조회 수=6)=보존
```

## ⑬ 최종 git status --porcelain 원문

```text
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderRepository.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/repository/PartnerOrderActivityRepositoryTest.java
?? docs/qa/1252-send-history-adversarial-real-qa/sol-r3-reconvergence-report.md
?? docs/qa/1252-send-history-adversarial-real-qa/sol-r4-numeric-order-report.md
```
