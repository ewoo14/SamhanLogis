# #1092 S3 — 견적 통합 목록 additive 재 fix

## 범위

- 기존 `EstimateListPage`의 단독 종합견적서 목록 기능을 유지한다.
- 통합 목록은 `통합 목록 보기` 토글로 별도 추가한다.
- 통합 보기에서는 기존 `/slips/estimates`와 `/api/v1/partner-orders`를 첫 페이지(`size=10,000`)부터 `totalPages` 끝까지 전량 조회한 뒤 S2 순수 함수 `mergeEstimateAndOrderRows`로 병합한다.
- 두 조회는 `Promise.allSettled`로 독립 처리하여 한 계열 실패 시 다른 계열을 계속 표시하고 오류 배너를 표시한다.

## 보존 확인

기존 `EstimateListPage.test.tsx`의 지정 6건을 삭제·수정하지 않았으며 다음 기능 경로를 유지했다.

- 삭제행 제외/포함 토글, 삭제 포함 서버 페이지 이동, 토글 해제 시 0페이지 복귀
- 기간 시작/종료·거래처명 필터
- 삭제행 취소선·삭제 배지·행 클릭 차단
- 복원 버튼 전파 차단·BE 한국어 danger 배너·복원 불가 행 버튼 미노출
- 신규 견적 이동, 활성행 상세 이동, 서버 페이지네이션, coarse SSE invalidate

통합 목록도 같은 필터 상태를 사용하며 UUID와 `requester_id`를 화면에 표시하지 않는다. 주문서 거래처 식별자는 `partnerCode`(`partner_code`)를 사용한다.

## 테스트 및 검증

- RED-A 추가: 43개 종합견적서 + 4개 주문서 누락 없는 표시
- RED-A 추가: 한 계열 실패 시 다른 계열 표시 + 오류 배너
- `EstimateListPage.test.tsx`: 8/8 통과 (기존 6건 포함)
- `estimateUnifiedListModel.test.ts`: 2/2 통과
- `npm run typecheck`: 통과
- `git diff --check`: 통과
- 기존 endpoint를 사용하므로 신규 mock handler는 필요하지 않으며, 페이지 테스트에서는 두 API mock을 격리했다.

## Diff 안전성

`git diff --stat`:

```text
2 files changed, 223 insertions(+), 9 deletions(-)
```

삭제 9줄은 기존 헤더/버튼 배치를 통합 토글과 함께 배치하기 위한 국소 조정이며, 기능 코드 재작성·기능 삭제는 없다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1092-s3-unified-list-additive.md` (이 보고서)
