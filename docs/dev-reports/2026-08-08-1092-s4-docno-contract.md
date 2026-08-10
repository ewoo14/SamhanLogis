# #1092 S4 — 문서번호 fixture 계약 복구

## 원인

`clients/desktop/src/renderer/api/mock.test.ts`의 계약 테스트는 renderer 전체 소스에서 문서번호 필드 리터럴을 찾아 다음 표준 형식을 요구한다.

```text
^\d{4}/\d{2}/\d{2}-[1-9]\d*$
```

표준 형식이 아닌 값은 `SLIP-DISPATCHED`, `SLIP-UNDISPATCHED`, `소계`, `STATUS-F-SLIP`, `1`, ` 2026/05 `, `2026/05` 등 테스트에 명시된 비문서번호 마커만 허용한다. 계약 테스트는 완화하지 않았다.

S3가 추가한 `clients/desktop/src/renderer/routes/EstimateDetailPage.test.tsx`의 fixture가 `estimateNo: 'Q-2026-001'`을 사용해 위 계약에 걸렸다. 이 값은 표준 형식도 허용 마커도 아니다.

## 수정

담당자 선택 UI 동작과 무관한 테스트 fixture의 문서번호만 `estimateNo: '2026/08/08-1'`로 교체했다. S3의 AsyncAutocomplete, 사원명 표시, UUID 비노출, 담당 변경 API, 계열 교차 변경 거부 사유, 통합 목록 담당 열, `created_by` 보존 구현은 변경하지 않았다.

## 검증

- 실패 재현: `mock.test.ts` 133 tests — 132 passed, 1 failed. 실패 값: `src/renderer/routes/EstimateDetailPage.test.tsx`, `estimateNo`, `Q-2026-001`.
- 격리 재검증: `mock.test.ts` 133 passed, 0 failed.
- 전체 프런트 테스트: `npm test` 종료코드 0 — 1990 passed, 0 failed.
- 전체 테스트 compact 재실행: `npm test -- --reporter=dot` 종료코드 0.
- 전체 테스트 JSON 확인: `testFiles=582`, `passedFiles=582`, `failedFiles=0`, `tests=1990`, `passed=1990`, `failed=0`, `skipped=0`.
- typecheck: `npm run typecheck` 종료코드 0.
- real-QA 격리 계약: `tests 50`, `pass 50`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`.

Docker 스택은 재기동하지 않았고 커밋·push하지 않았다.
