# R27 전표 매칭 계승 누락

## 2026-08-04 착수

- `git pull`: `Already up to date.`
- 목표: 레거시가 허용하는 업체명 입력 형태를 전표 매칭에 계승한다.
- 범위: 순수 숫자 순번, 전체 전표번호, 끝 1~3자리, 숫자만 추출, `/` 구분 다중 입력.
- 유지 조건: 날짜 불일치 행 건너뛰기, 공란 전표 fallback, 자동 SMS 비활성.

## RED

테스트 작성 및 실행 결과를 아래에 append한다.

### RED 원문

실행:

```text
& .\gradlew.bat :services:notification-service:test --tests com.samhanair.logis.notification.service.DispatchBatchPreviewServiceTest
```

```text
DispatchBatchPreviewServiceTest > 레거시가 허용하는 전표번호 입력 형태를 모두 기사 연락처 매칭한다 > 레거시 전표 입력 형태: 1 FAILED
DispatchBatchPreviewServiceTest > 레거시가 허용하는 전표번호 입력 형태를 모두 기사 연락처 매칭한다 > 레거시 전표 입력 형태: 업체-1 FAILED
DispatchBatchPreviewServiceTest > 레거시가 허용하는 전표번호 입력 형태를 모두 기사 연락처 매칭한다 > 레거시 전표 입력 형태: 전표 1 FAILED
DispatchBatchPreviewServiceTest > 레거시가 허용하는 전표번호 입력 형태를 모두 기사 연락처 매칭한다 > 레거시 전표 입력 형태: 2 / 1 FAILED

16 tests completed, 4 failed
BUILD FAILED
```

`2026/08/03-1` 전체 전표번호 케이스만 기존 경로로 통과했고, 나머지 레거시 입력 형태가 RED임을 확인했다.

## 수정

`DispatchBatchPreviewService.resolveDriverPhone`에 레거시 입력 판정 helper를 추가했다. 기존 전체 전표번호 포함, 정확한 업체명, 날짜 불일치 `continue`, `slip.driverPhone()` fallback은 유지한다. 새 helper는 업체명 입력을 `/`로 나눈 뒤 레거시 원문과 같은 네 판정(하이픈 뒤 순번, 순수 숫자 순번, 끝 1~3자리, 숫자만 추출)을 적용한다.

## GREEN 원문

```text
& .\gradlew.bat :services:notification-service:test --tests com.samhanair.logis.notification.service.DispatchBatchPreviewServiceTest

BUILD SUCCESSFUL in 10s
18 tests completed, 0 failed
```

커버한 입력값은 `1`, `2026/08/03-1`, `업체-1`, `전표 1`, `2 / 1`이다. 별도 날짜 불일치 테스트도 통과했다.

## 잘못 붙은 건수 실측

기동 중인 `samhan-postgres`에 read-only SQL만 실행했다. 활성 OUTBOUND의 날짜별 `seq_no` 중복이 있으면 순수 순번/끝자리 입력이 서로 다른 전표에 붙을 수 있으므로 그 충돌을 계수했다.

```text
active_outbound | blank_driver_phone | blank_seq | duplicate_date_seq_rows
2309            | 2290               | 0         | 0

날짜별 count(*) <> count(distinct seq_no) 결과: 0행
```

따라서 새 순번 매칭으로 잘못 붙을 수 있는 실데이터 충돌은 **0건**으로 확인했다. Docker build/up/restart와 DB write는 하지 않았다.

## 유지 확인

- 날짜 필터: `input.date() != null && !input.date().equals(requestedDate)` 건너뛰기 유지; 날짜 불일치 테스트 GREEN.
- 공란 전표 fallback: 연락처 미매칭 시 `slip.driverPhone()` 반환 유지; `기사번호 없음 확인요망!` 회귀 테스트 GREEN. 실측 공란 모집단은 2,290건.
- 자동 SMS: 이번 변경에서 발송 경로를 추가하지 않음.

## 새 파일 목록

- `docs/dev-reports/2026-08-04-1013-r27-slipno-match-fix.md`

수정 파일:

- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchPreviewService.java`
- `services/notification-service/src/test/java/com/samhanair/logis/notification/service/DispatchBatchPreviewServiceTest.java`
