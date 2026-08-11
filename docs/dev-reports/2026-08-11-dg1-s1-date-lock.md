# D-G7 S1 기준일 잠금 착수 판정

작성일: 2026-08-11  
대상: PR #1165 / HEAD `70aa6d5c0`  
판정: **BLOCKED — CONFIRMED → DRAFT 확정 취소 경로 없음**

## 1. 착수 전 게이트

개발책임자 결정은 “확정 취소 경로가 있으면 구현하고, 없으면 영구 잠금으로 보고한 뒤 구현하지
않는다”이다. 현재 저장소를 정산 aggregate·서비스·웹 계층 및 전체 참조에서 확인한 결과는 다음과
같다.

| 계층 | 현행 확인 | 판정 |
|---|---|---|
| 도메인 상태 | `DRAFT`, `CONFIRMED`만 존재 | `CONFIRMED → DRAFT` 전이 없음 |
| 도메인 변경 API | `createDraft(LocalDate)`, `confirm(String)`만 존재. `settlementDate`는 생성자에서만 대입 | 기준일 수정·확정 취소 없음 |
| 서비스 | `createDraft`, `confirm`, `findByDocumentNo`만 존재 | 취소·기준일 수정 서비스 없음 |
| 컨트롤러 | `SalesCommissionSettlement`를 참조하는 정산 컨트롤러 없음 | HTTP 수정·취소 경로 없음 |
| 저장소/마이그레이션 | `settlement_date NOT NULL`, 정산서 상태/번호 저장만 제공 | 상태 복귀를 제공하는 별도 경로 없음 |

주요 좌표:

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlement.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementStatus.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java`
- `docs/dev-reports/2026-08-11-dg1-s1-sol-review2.md` §5의 기존 판정도 “날짜 편집 API는 이번 S1에 존재하지 않는다”고 기록한다.

**결론:** 이 라운드는 영구 잠금으로 해석되는 상태이며, 지시대로 구현을 중단한다. 확정 취소 후
수정 경로를 새로 만드는 것은 이번 결정의 전제 보강이 아니라 별도 개발책임자 결정이 필요한
범위다.

## 2. 현행 RED 원문 및 재현 판정

### RED-A — CONFIRMED 기준일 변경 거부

현행에는 `settlementDate` 변경을 호출할 수 있는 공개 도메인·서비스·HTTP API가 없다. 따라서
“현재는 바뀐다”는 RED 원문을 재현할 수 없다. 확인된 현행 코드는 다음과 같다.

```text
SalesCommissionSettlement
  private LocalDate settlementDate;
  private SalesCommissionSettlement(LocalDate settlementDate) { ... }
  createDraft(LocalDate settlementDate) -> 생성 시 1회 대입
  confirm(String documentNo) -> documentNo/status만 변경

SalesCommissionSettlementService
  createDraft(LocalDate)
  confirm(UUID)
  findByDocumentNo(String)
```

`CONFIRMED`에서 기준일을 바꾸는 경로가 없으므로, 현행 RED-A는 “변경 성공”으로 재현되지 않으며
거부 응답도 존재하지 않는다. 이를 막는 코드는 추가하지 않았다.

### RED-B — DRAFT 기준일 수정 및 수정일 채번

DRAFT도 기준일 수정 API가 없으므로 다음 원문을 실행할 수 없다.

```text
createDraft(2026-08-11)
→ settlementDate를 2026-08-12로 수정
→ confirm()
→ 2026/08/12-N 채번
```

현재 지원되는 경로는 `createDraft(기준일)`로 새 정산서를 만드는 것뿐이다. 기존 DRAFT의 날짜를
수정하는 정상 경로가 없으므로 RED-B 표적도 아직 존재하지 않는다.

## 3. 조합표

| 조합 | 현행 도달 가능성 | 확인 결과 |
|---|---|---|
| DRAFT 기준일 수정 | 불가 | setter/domain method/service/controller 없음 |
| CONFIRMED 기준일 수정 시도 | 불가 | 수정 진입점 없음; 거부 계층도 아직 없음 |
| 확정 취소 후 수정 | 불가 | `CONFIRMED → DRAFT` 전이 없음 |
| 같은 날 다른 정산서가 이미 채번된 뒤 날짜 변경 | 불가 | 날짜 변경 경로가 없어 일자 시퀀스와 결합 불가 |
| 기준일을 `null`로 변경 | 불가 | 수정 API 없음; 신규 생성 시 null은 `IllegalArgumentException`으로 거부 |
| DRAFT 생성 후 확정 | 가능 | DRAFT 무번호 → `settlementDate` 기준 `yyyy/MM/dd-N` 채번 |

마지막 행은 기존 S1 계약이며 이번 조사에서 변경하지 않는다. 기존 S1 기록상 DRAFT 무번호,
확정 시 채번, 일자별 순번, 동시성 및 40자 제한은 유지 대상이다.

## 4. 거부 계층 판정

이번 라운드에는 거부할 수정 경로가 없으므로 도메인·서비스·컨트롤러 중 거부 계층을 구현하지
않았다. 화면만 막는 방식은 API 우회가 가능해 결정에 맞지 않지만, 현재는 화면과 API 모두 해당
정산 경로가 없다.

향후 기준일 수정 API를 추가하는 별도 결정이 승인되면, `settlementDate`와 `status`가 같은
aggregate 불변식이므로 도메인 메서드에서 `CONFIRMED` 변경을 거부하고, 서비스는 해당 메서드와
트랜잭션을 통해서만 저장하도록 해야 한다. 컨트롤러는 도메인 결과를 HTTP 오류로 변환하는 외부
경계로 둔다. 이 설계는 이번 라운드에 구현하지 않는다.

## 5. 테스트 및 변경 파일

- 이번 라운드는 착수 게이트에서 중단했으므로 기준일 수정 관련 RED/GREEN 테스트를 추가하거나
  실행하지 않았다.
- 기존 코드와 테스트는 수정하지 않았다.
- 공유 DB write, 배포, git 조작, S2~S4 착수는 하지 않았다.

신규 파일:

```text
docs/dev-reports/2026-08-11-dg1-s1-date-lock.md
```

개발책임자께 재상정할 결정은 하나다: `CONFIRMED → DRAFT` 확정 취소 경로를 별도 범위로 먼저
만들 것인지 여부. 그 경로가 승인·구현되기 전에는 D-G7의 “확정 취소 후 기준일 수정” 정책을
검증 가능한 형태로 구현할 수 없다.
