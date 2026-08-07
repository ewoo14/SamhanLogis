# PR #1082 · 이슈 #1051 — R4 fix: 주문 라인 금액 권위 영속화

## 1. 결론 및 변경

D4-1을 수정했다. 주문 라인 생성 시 `PRICE`/`SUPPLY`/`VAT`/`TOTAL` 권위를
`partner_order_lines.amount_authority`에 저장하고, 상세 GET은 S/V 존재 여부로
권위를 되추측하지 않고 저장된 값을 반환한다.

- `PartnerOrderLine`에 `@Enumerated(EnumType.STRING)` 권위 필드 추가.
- V17 migration 추가: 기존 행은 실측상 PRICE 생성이 확인된 행이 다수이고 VAT 생성이
  확인되지 않아 모두 `PRICE`로 명시. 이 migration만으로 개별 과거 행의 실제 권위를
  확정할 수 없다는 한계는 남으며, 이후 GET→PUT에서 VAT로 오인되지 않게 하는 보수적
  정책이다. 컬럼 기본값도 `PRICE`로 두어 authority 컬럼을 생략하는 legacy/raw fixture를
  수용한다.
- update 경로는 기존 저장 권위를 요청 authority가 없을 때 승계한다.
- 저장 권위와 다른 authority를 PUT하면 422로 거절하고 주문 전체를 교체하지 않는다.
- PRICE가 아닌 라인의 납품가 변경은 조용히 무시하지 않고 422로 거절한다.
- revision snapshot에 authority를 포함하고, 복원 시 snapshot authority를 사용한다.
  authority가 없는 legacy snapshot은 PRICE 정책으로 복원한다.

## 2. RED-first 증거

추가한 첫 RED는 `PartnerOrderLineSupplyVatTest`에서 네 권위 생성 결과의
`getAmountAuthority()`를 단정했다. 생산 코드 추가 전 지정 테스트 원문은 다음이었다.

```text
cannot find symbol
  symbol:   method getAmountAuthority()
  location: variable price of type PartnerOrderLine
... 4 errors
> Task :services:partner-order-service:compileTestJava FAILED
BUILD FAILED
```

수정 후 같은 domain 테스트는 3건 0 실패로 GREEN이 됐다.

## 3. 새로 가능해진 표면과 전수 확인

### 3.1 새 상태·화면 조합

- PRICE 라인: GET authority=PRICE → 수량 2→3 시 기존 단가 유지, T가 수량 기준으로
  재계산되는 왕복을 `PartnerOrderUpdateIT`에서 확인했다.
- PRICE 라인: 납품가 변경은 새 PRICE 계산에 반영되는 경로이며, 통합 테스트에서
  120,000 × 3 = 360,000을 확인했다.
- SUPPLY/VAT/TOTAL 라인: 생성 권위와 S+V=T 항등식을 domain 테스트에서 확인했다.
- VAT 라인 memo-only 왕복: 기존 D3-1 테스트가 authority=VAT와 S/V/T 보존을 확인했다.
- authority 변조 PUT: 저장 권위와 다른 authority는 422로 거절되며, 기존 라인을
  다른 계산 경로로 성공 저장하지 않는다.
- revision 복원: snapshot authority를 사용하고 legacy snapshot은 PRICE 정책을 적용한다.
  전체 revision 테스트가 GREEN이다.

### 3.2 식별자 제거·이동·개명 grep 확인

제거·이동·개명한 외부 식별자는 없다. `authority` JSON 키와 enum 식별자
`PRICE/SUPPLY/VAT/TOTAL`은 유지했다. 생산 코드 grep 결과는 다음으로 수렴한다.

- `PartnerOrderLine.java`: `amount_authority` 컬럼 1건, 생성 경로 4종의 저장 대입 1건.
- `PartnerOrderDetailResponse.java`: `getAmountAuthority().name()` 1건.
- `PartnerOrderSnapshot.java`/`PartnerOrderRevisionService.java`: snapshot 저장·복원 authority.
- 기존의 `S/V 존재 ? "VAT" : null` GET 추측식은 제거됐다.

### 3.3 변경 파일 참조 테스트

최종 권위 테스트:

```text
.\gradlew.bat :services:partner-order-service:test --no-daemon
exit code: 0
501 tests completed, 0 failures, 0 errors, 0 skipped
```

추가·변경된 핵심 테스트 파일도 별도 확인했다.

- `PartnerOrderLineSupplyVatTest`: 3/3 GREEN
- `PartnerOrderUpdateIT`: 22/22 GREEN
- `PartnerOrderRevisionRestoreIT`: 전체 GREEN

제한 준수: git 명령 0회, DB 직접 INSERT/UPDATE/DELETE 0회, 라이브 쓰기 요청 0회,
컨테이너 수동 재빌드·재시작 0회, 다른 서비스 테스트 0회.

## 4. 신규 파일 목록

- `services/partner-order-service/src/main/resources/db/migration/V17__persist_partner_order_line_amount_authority.sql`
- `docs/dev-reports/2026-08-07-1051-r4-luna-authority-persistence.md`
