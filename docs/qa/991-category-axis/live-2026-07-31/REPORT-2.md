# PR #991 라이브 QA 2회차

- 일시: 2026-07-31
- 범위: ② 기존 금액 불변, ③ throwaway 견적 발행
- 원칙: 코드 수정·git 쓰기·지정 외 서비스 재기동 없음

## 진행 로그

보고서 선생성 완료. 아래에 실행 명령과 결과를 순서대로 append한다.

## ② 기존 금액 불변

### 실행 환경

명령:

```powershell
docker ps --format "{{.Names}}`t{{.Image}}`t{{.Ports}}`t{{.Status}}"
```

결과: `samhan-accounting-service`는 `127.0.0.1:8087->8087/tcp`, `samhan-slip-service`는 host 8086 publish 없이 컨테이너 내부 8086, 둘 다 `healthy`. 8086 충돌 우회 상태도 유지됨.

### 배포 전 집계

명령: `docker exec samhan-postgres psql -U samhan -d slip_db -f /tmp/qa991-before.sql` (`/tmp/qa991-before.sql`는 아래 금액 집계 SQL)

집계 결과:

| dataset | rows | 공급가 | 부가세 | 합계 | 금액 지문 |
|---|---:|---:|---:|---:|---|
| estimates | 2,006 | 9,093,717,236,632.00 | 909,371,723,667.00 | 10,003,088,960,299.00 | `4f32d529f33446739216c342a77089be` |
| estimate_lines | 2,041 | 9,093,717,411,177.00 | 909,371,741,122.00 | 10,003,089,152,299.00 | `4df052578d69570aa8feb3401d277034` |
| slips | 2,450 (활성 2,341) | - | - | - | `7ab85f4f0ae3b0adbf7d61ec3ee86b47` |
| slip_lines | 3,242 | 10,114,137,983,643.00 | 1,011,413,718,602.00 | 10,114,137,983,643.00 | `9e5b66c8f2f0e49752da0206b03a2960` |

main 기준 대조: `git show main:shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java`에서 기본 `splitVatInclusive(110005)`는 `DOWN`으로 공급가 `100004`, 부가세 `10001`을 산출한다. 배포된 기존 active 저장행을 동일한 `DOWN` 식으로 재계산한 결과는 다음과 같으며, 기존 저장 데이터를 재계산해 쓰지 않는 범위임을 확인했다.

| dataset | active rows | 저장 공급가 | main DOWN 공급가 | 저장 부가세 | main DOWN 부가세 |
|---|---:|---:|---:|---:|---:|
| estimate_lines (unit_price_with_vat 존재) | 106 | 59,483,088 | 59,483,064 | 5,948,312 | 5,948,336 |
| slip_lines (unit_price_with_vat 존재) | 2,791 | 3,943,676,569 | 3,943,183,982 | 394,316,681 | 394,318,450 |

이 차이는 기존 저장 데이터가 이미 확정된 snapshot이며, 이번 PR이 기존 행을 다시 계산·갱신하지 않았음을 구분하기 위해 기록한다. `DOWN` 기본값을 유지하는 main 소스와 발행 경로의 명시적 `HALF_UP` 변경은 신규 발행에만 적용된다.

판정 기준: 기존 데이터 지문·집계는 throwaway 행을 제외하고 사후 동일해야 한다. 변화액은 사전 집계와 사후 집계의 차이로 계산한다.

## ③ throwaway 견적 → 전표 발행

### 실행 명령 및 결과

실행 명령(실제 배포된 slip-service 컨테이너 내부 endpoint):

```powershell
docker exec samhan-slip-service sh -c "echo <base64-json> | base64 -d | curl -sS -i -X POST http://127.0.0.1:8086/internal/slips/from-estimate -H 'X-Internal-Token: dev-internal-token-change-me' -H 'Idempotency-Key: qa991-live-20260731-<uuid>' -H 'Content-Type: application/json' --data-binary @-"
```

입력 핵심값: `estimateNumber=QA-991-THROWAWAY-20260731`, `qty=1`, `unitPriceExVat=100005`, `unitPriceVat=110005`, 실재 거래처 `P-2026-0001`, 실재 제품 모델 `AR05TXEAAWKNEU-01`.

첫 시도에서 `CUST-0001`은 partner-service에 없어 `404 NOT_FOUND`가 반환되었고, 실재 DEV 데이터로 재시도했다. 재시도 결과:

```text
HTTP/1.1 201
slipId=7c695dc0-04e9-4247-ba93-ee72d31dd62b
slipNo=2026/07/31-1
status=DRAFT
sourceType=ESTIMATE
sourceId=QA-991-THROWAWAY-20260731
idempotentReplay=false
```

발행 직후 DB 조회 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT ... FROM slips s JOIN slip_lines l ... WHERE s.id='7c695dc0-04e9-4247-ba93-ee72d31dd62b'::uuid;"
```

실제 결과: `unit_price_with_vat=110005.00`, `supply_amount=100005.00`, `vat_amount=10000.00`, `line_total=100005.00`. 기대값 `공급가 100,005원 · 부가세 10,000원`과 일치.

### 정리 후 행 수 대조

정리 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -c "UPDATE slip_lines SET is_deleted=true, deleted_at=now(), deleted_by='qa-991-live-20260731' WHERE slip_id='7c695dc0-04e9-4247-ba93-ee72d31dd62b'::uuid AND is_deleted=false; UPDATE slips SET is_deleted=true, deleted_at=now(), deleted_by='qa-991-live-20260731' WHERE id='7c695dc0-04e9-4247-ba93-ee72d31dd62b'::uuid AND is_deleted=false;"
```

사후 대조 결과: throwaway 전표 활성 행 `0`, throwaway 라인 활성 행 `0`, `source_id=QA-991-THROWAWAY-20260731` 활성 전표 `0`.

정리 후 기존 데이터 재집계:

| dataset | rows | 공급가 | 부가세 | 합계 | 금액 지문 |
|---|---:|---:|---:|---:|---|
| estimates | 2,006 | 9,093,717,236,632.00 | 909,371,723,667.00 | 10,003,088,960,299.00 | `4f32d529f33446739216c342a77089be` |
| estimate_lines | 2,041 | 9,093,717,411,177.00 | 909,371,741,122.00 | 10,003,089,152,299.00 | `4df052578d69570aa8feb3401d277034` |
| 기존 slips (throwaway 제외) | 2,450 (활성 2,341) | - | - | - | `7ab85f4f0ae3b0adbf7d61ec3ee86b47` |
| 기존 slip_lines (throwaway 제외) | 3,242 | 10,114,137,983,643.00 | 1,011,413,718,602.00 | 10,114,137,983,643.00 | `9e5b66c8f2f0e49752da0206b03a2960` |

변화액 합계: 공급가 `0원` + 부가세 `0원` + 합계 `0원` = **0원**.

추가로 `accounting_db` 사후 동일 집계도 확인했다: `sales_accounting_slips` 1행 / 공급가 `300,000` / 부가세 `30,000` / 합계 `330,000` / 지문 `877d7c3b66d041f9b8b2d7ad79c51a33`; `sales_accounting_slip_lines` 1행 / 공급가 `300,000` / 부가세 `30,000` / 합계 `330,000` / 지문 `82686ff432121ca4abd329309744185e` (사전과 동일).

판정: **② PASS** — 기존 저장 데이터 금액 지문과 집계가 동일하고, main의 기본 `DOWN` 규칙도 소스에서 확인했다. **③ PASS(서버/DB)** — 실제 throwaway 견적 발행 경로가 `201`로 완료되고 `100,005 / 10,000`이 원천 기대값과 일치했으며, 정리 후 활성 행이 0이다.

## 캡처 파일명

- 1회차 실제 화면 캡처: `docs/qa/991-category-axis/live-2026-07-31/01-daily-closing-detail-live.png`
- 2회차 throwaway 발행 화면 캡처: **미생성** (이 세션에서 연결 가능한 브라우저가 없어 실제 화면 캡처 도구를 초기화하지 못함)

## 확인하지 못한 것

- 2회차 throwaway 전표의 실제 데스크톱 화면 캡처는 확보하지 못했다. 서버 응답·DB 조회는 실제 배포 인스턴스로 완료했으나, 브라우저 런타임이 `No browser is available`로 반환되어 합성/목업 캡처를 만들지 않았다.
- `CUST-0001` DEV-SEED 계정/거래처는 현재 partner DB에 없어 첫 발행 시도는 404 환경 데이터 문제로 종료했다. 실재 거래처 `P-2026-0001`로 재시도해 본 검증을 완료했다.
