# Issue #1001 슬라이스 1 — 판매전표 원장 read 계약 구현 보고서

## 범위와 확정 기준

Issue #1001(PR #1003) 슬라이스 1로 slip-service에 거래처별 원장용 판매전표 read 계약을 추가했다.

- 원장 포함 상태: `CONFIRMED`, `DELIVERED`, `COMPLETED` 전부
- 기준: 회계 반영 완료 목록이 아니라 거래 사실 문서
- 배송주소: `slips.delivery_address`만 읽음. `shipping_address`, 거래처 주소, 적요 파싱으로 대체하지 않음
- 외부 응답: 전표번호·거래처코드·거래처명 등 업무 식별자만 사용하며 UUID 미포함
- 기존 `/internal/slips/outbound-lines` 및 기존 회계 원장 API는 변경하지 않음
- 데스크톱·CSV·인쇄·회계 서비스 통합 API·주소 수집 경로는 변경하지 않음
- Docker 이미지 재빌드·서비스 재기동·공유 DB 쓰기는 하지 않음

## 불변식별 RED 원문

생산 코드를 추가하기 전에 DTO 단위 테스트와 endpoint 통합 테스트를 추가하고 단위 테스트를 실행했다.
신규 DTO가 없어서 기능 부재를 직접 검출하는 컴파일 RED가 발생했다.

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.web.dto.PartnerLedgerSalesResponseTest --console=plain
```

RED 원문:

```text
C:\dev\Samhan-Public\.claude\worktrees\t1001\services\slip-service\src\test\java\com\samhanair\logis\slip\web\dto\PartnerLedgerSalesResponseTest.java:53: error: cannot find symbol
        PartnerLedgerSalesResponse response = PartnerLedgerSalesResponse.from(slip);
        ^
  symbol:   class PartnerLedgerSalesResponse
  location: class PartnerLedgerSalesResponseTest
C:\dev\Samhan-Public\.claude\worktrees\t1001\services\slip-service\src\test\java\com\samhanair\logis\slip\web\dto\PartnerLedgerSalesResponseTest.java:53: error: cannot find symbol
        PartnerLedgerSalesResponse response = PartnerLedgerSalesResponse.from(slip);
                                              ^
  symbol:   variable PartnerLedgerSalesResponse
  location: class PartnerLedgerSalesResponseTest
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.

2 errors

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:slip-service:compileTestJava'.
> Compilation failed; see the compiler error output for details.

BUILD FAILED in 48s
```

## 구현 요지

### 신규 계약

`GET /internal/slips/partner-ledger-sales`를 추가했다.

쿼리 파라미터는 다음과 같다.

- `from`: 시작일(포함)
- `to`: 종료일(포함)
- `partnerCode`: 선택적 거래처코드. 생략하면 전체 거래처

응답은 `ApiResponse` wrapper 안의 전표 단위 배열이다.

```json
{
  "slipNo": "2026/07/31-1001",
  "slipDate": "2026-07-31",
  "status": "COMPLETED",
  "partnerCode": "P-1001",
  "partnerName": "원장 거래처",
  "deliveryAddress": "서울시 금천구 원장로 1",
  "lines": [
    {
      "productName": "원장 품목",
      "modelName": "MODEL-1001",
      "quantity": 3,
      "unitPriceWithVat": 36668.67,
      "lineAmount": 110006
    }
  ]
}
```

응답에는 `slipId`, `partnerId`, `lineId`를 두지 않았다. `deliveryAddress`는 entity의 `deliveryAddress`만 직접 전사한다.

### 조회 경계

기존 `findByPeriodWithLines`를 재사용하지 않고 repository에 별도 조회를 추가했다. 한 번의 JPA 조회에서 다음을 모두 적용한다.

- `is_deleted = false`
- `slip_type = OUTBOUND`
- `status IN (CONFIRMED, DELIVERED, COMPLETED)`
- `slip_date BETWEEN from AND to`
- `partner_code = partnerCode`(선택)
- `lines` fetch

상태 목록을 controller의 명시적인 `PARTNER_LEDGER_SALES_STATUSES`로 고정해 매출전표 생성 서비스의 `CONFIRMED` 전용 기준과 섞이지 않게 했다.

### 금액 규칙

`unitPriceWithVat`는 `slip_lines.unit_price_with_vat`를 그대로 내보낸다. 품목 금액은 `supplyAmount + vatAmount`가 모두 있으면 저장된 권위 합계를 우선한다. 소수 단가를 다시 `수량 × 단가`로 계산할 때 발생하는 원 단위 반올림 drift를 피하기 위한 것이다. 두 저장 금액이 없는 legacy 라인에 한해 보유한 VAT 포함 단가 또는 기존 lineTotal/vat 값으로 계산한다.

## 실 데이터 실측

공유 DB `samhan-postgres`의 `slip_db`에서 `docker exec ... psql ... -c "SELECT ..."` 형식으로 읽기 전용 조회했다. INSERT/UPDATE/DELETE와 서비스 재기동은 수행하지 않았다.

### 원장 포함 상태별 실측

| 상태 | 활성 판매전표 문서 수 | 활성 라인 수 | 배송주소 값이 있는 문서 수 | 배송주소 값이 있는 라인 수 | VAT 포함 단가 null 라인 수 |
|---|---:|---:|---:|---:|---:|
| `COMPLETED` | 7 | 17 | 0 | 0 | 0 |
| `DELIVERED` | 10 | 35 | 0 | 0 | 0 |
| `CONFIRMED` | 4 | 10 | 0 | 0 | 0 |
| **합계** | **21** | **62** | **0** | **0** | **0** |

주소 값은 `NULLIF(BTRIM(delivery_address), '') IS NOT NULL`로 계산했다. 따라서 현재 실데이터에서는 배송주소 62라인 모두 공란이며, 이 슬라이스는 그 공란을 다른 주소로 대체하지 않는다.

### 상태 필터가 정상 경로를 막는지 확인

활성 `OUTBOUND` 전체는 2,299건이다.

| 구분 | 문서 수 |
|---|---:|
| 원장 포함(`CONFIRMED`·`DELIVERED`·`COMPLETED`) | 21 |
| 상태 필터로 제외 | 2,278 |
| 합계 | 2,299 |

제외 수는 `DRAFT` 2,160, `CANCELED` 55, `SENT` 21, `SAVED` 12, `ACCEPTED` 6, `PROCESSING` 7, `REJECTED` 7, `INSPECTING` 5, `SHIPPING` 5를 합한 값이다. 새 endpoint는 이 상태들을 정상 원장 거래 사실 범위 밖으로만 제외하며 기존 `/internal/slips/outbound-lines`에는 영향을 주지 않는다.

## 테스트 결과

### RED → GREEN

- RED: `PartnerLedgerSalesResponse` 미존재로 `compileTestJava` 실패(위 원문)
- 단위 GREEN: `PartnerLedgerSalesResponseTest` 통과, `BUILD SUCCESSFUL in 21s`
- 신규 통합 GREEN: `SlipPartnerLedgerInternalControllerIT` 통과, `BUILD SUCCESSFUL in 37s`
  - 세 상태만 반환
  - 전표 헤더·배송주소·품목명·모델명·수량·VAT 포함 단가·품목 금액 반환
  - 배송중(`SHIPPING`) 제외
  - `partnerCode`와 기간 필터 적용
  - 내부 토큰 누락 시 403
  - JSON에 UUID 필드 미포함

### 모듈 전체

새 통합 테스트 추가 후 다음 명령으로 모듈 전체를 강제 재실행했다.

```text
.\gradlew.bat :services:slip-service:test --rerun-tasks --console=plain
```

결과:

- 테스트 결과 파일: 204개
- 테스트: 1,510개
- 실패: 0개
- 오류: 0개
- 스킵: 0개
- `BUILD SUCCESSFUL in 5m 43s`
- `18 actionable tasks: 18 executed`

테스트는 Testcontainers 격리 DB를 사용했다. 공유 백엔드 Docker 스택의 이미지는 재빌드하지 않았고, 라이브 QA는 수행하지 않았다.

## 변경 파일 목록

### 신규 파일

1. `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java`
   - UUID 없는 전표 단위 원장 응답과 품목 응답
2. `services/slip-service/src/test/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponseTest.java`
   - DTO 필드·권위 금액·UUID 비노출 단위 테스트
3. `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipPartnerLedgerInternalControllerIT.java`
   - 상태 3종·기간/거래처 필터·인증·기존 계약 분리 통합 테스트
4. `docs/dev-reports/2026-07-31-1001-s1-slip-ledger-read.md`
   - 본 구현 보고서

### 수정 파일

1. `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java`
   - 원장 전용 상태·기간·거래처코드 조회 추가
2. `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java`
   - 신규 internal endpoint와 `CONFIRMED`·`DELIVERED`·`COMPLETED` 상태 목록 추가

## `git status --porcelain` 원문

아래는 보고서 파일 생성 후 실행한 허용된 최종 상태 조회 원문이다.

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java
?? docs/dev-reports/2026-07-31-1001-s1-slip-ledger-read.md
?? services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java
?? services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipPartnerLedgerInternalControllerIT.java
?? services/slip-service/src/test/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponseTest.java
```

보고서 작성 후 최종 상태에는 본 보고서 파일도 신규 파일로 포함된다. 커밋·add·push는 수행하지 않았다.
