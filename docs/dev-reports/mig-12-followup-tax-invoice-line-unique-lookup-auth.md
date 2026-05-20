# MIG-12 follow-up — V32 partial UNIQUE + Lookup auth 격상

작성일: 2026-05-21

## 범위

- `accounting-service` V32에서 `tax_invoice_lines(tax_invoice_id, line_no)` UNIQUE를 active row 전용 partial UNIQUE로 교체했다.
- `ProductLookupClient`와 `PartnerLookupClient`의 내부 인증 실패를 lookup miss가 아니라 `MIG12_INTERNAL_AUTH_MISS`로 fail-fast 처리했다.
- `shared/common`에 `MIG12_INTERNAL_AUTH_MISS(503)` ErrorCode를 추가했다.

## V32 partial UNIQUE

MIG-4 V24의 `ux_tax_invoice_lines_invoice_line`은 `WHERE is_deleted = FALSE`가 없어 soft-delete row까지 UNIQUE 대상에 포함했다. 이 상태에서는 세금계산서 라인 취소/재발행 플로우가 같은 `line_no`를 재사용할 때 DB 충돌이 발생한다.

V32는 기존 full UNIQUE index를 제거하고 다음 partial UNIQUE를 만든다.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoice_lines_invoice_line_active
    ON tax_invoice_lines (tax_invoice_id, line_no)
    WHERE is_deleted = FALSE;
```

회귀 IT는 실제 PostgreSQL에서 3가지 케이스를 검증한다.

- soft-delete 후 같은 `tax_invoice_id + line_no` 재발행 정상
- active line 중복은 UNIQUE 충돌
- 서로 다른 active line 2건 정상 저장

## Lookup auth 격상

기존 lookup client는 401/403과 토큰 미설정을 `Optional.empty()`로 흡수해 운영 설정 오류가 `*_LOOKUP_MISS`로 가려질 수 있었다. MIG-12 follow-up부터 내부 인증 실패는 서비스 설정 문제로 간주하고 즉시 `BusinessException(MIG12_INTERNAL_AUTH_MISS)`를 던진다.

유지되는 동작:

- 404는 정상 미매칭으로 `Optional.empty()`
- Product 409는 기존 `MIG5_LOOKUP_AMBIGUOUS`
- Partner strict name 409는 기존 `MIG3_LOOKUP_AMBIGUOUS`
- 5xx/network는 기존 fail-soft empty

## 테스트

- `TaxInvoiceLineSoftDeleteIT` 3 cases
- `ProductLookupClientTest` token null/blank, 401, 403, 404 회귀
- `PartnerLookupClientTest` token null/blank, 401, 403, 404 회귀
- `ErrorCodeMig12Test`

## 검증 명령

```powershell
./gradlew.bat :shared:common:test :services:accounting-service:test :services:inventory-service:test --no-daemon
```
