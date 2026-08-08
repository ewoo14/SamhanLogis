# #1092 S11 SOL 재수렴 — PR #1121

## 1. 판정

**PASS — 신규·잔존 결함 0건. HEAD `835a2f5566dece245b1b4073433d435fef334987`은 S9의 BLOCK 2건을 닫았다.**

- S9-02: `submittedAt`은 다시 발송일(`confirmedAt`)이고 활성 DRAFT 4/4가 `null`이다. 기존 주문서 목록에는 날짜 대신 무값 자리표시자 `-`만 보이며, 상세 응답 4/4와 일치한다.
- S9-01: 2페이지를 503으로 실패시켜도 성공한 1페이지 견적 53건이 남고, 화면이 불완전 결과임을 명시한다.
- S10 신규 표면인 `createdAt` 직렬화·소비, 부분 결과의 필터/재시도 수명, 정상 상태 오경보에서 결함을 찾지 못했다.
- 지시에서 제외한 상단 기존 견적 표의 `—`는 판정하지 않았다.

검증 시점 배포 상태는 `samhan-partner-order-service` healthy였고 실제 gateway 응답에 새 `createdAt`이 존재했다. Docker 스택과 서비스는 재기동하지 않았다.

## 2. S9-02 — 발송일·작성일·정렬 분리

### 실 API와 화면

| 항목 | 실측 | 판정 |
|---|---:|---|
| 활성 주문 | 4 | 발화 |
| 활성 DRAFT | 4 | 발화 |
| DRAFT `submittedAt=null` | 4/4 | PASS |
| 목록 `createdAt` 존재 | 4/4 | PASS |
| 기존 주문 목록 발송일 | 4/4 날짜 없음, `-` 자리표시자 | PASS |
| 같은 주문 상세 `submittedAt` 일치 | 4/4 | PASS |
| 통합 목록 주문 작성일=`createdAt` | 4/4 | PASS |
| 활성 통합 행 | 견적 53 + 주문 4 = 57 | 발화 |
| 화면 순서와 `estimateDate` / `submittedAt ?? createdAt` 독립 계산 | 57/57 완전 일치 | PASS |

표시와 정렬의 날짜가 다를 수 있는 CONFIRMED 실데이터는 현재 활성 주문에 없었다. 다만 모델 단위 테스트가 `submittedAt=2026-08-08`, `createdAt=2026-08-01`인 주문을 작성일은 8월 1일로 표시하면서 정렬은 발송일 8월 8일로 유지하는 경계를 통과했고, 실 DRAFT 4건은 모두 `createdAt` fallback 정렬과 작성일 표시를 통과했다.

### `submittedAt` 소비처 독립 전수조사

저장소 전체 `rg` 결과를 주문 요약 계약, 동명 타 도메인, fixture/test로 다시 분리했다. 제품 코드의 주문 `submittedAt` 소비는 다음과 같다.

| 소비처 | 실제 역할 | 판정 |
|---|---|---|
| `PartnerOrderSummaryResponse.java:17,57-63` | 목록 계약·`confirmedAt` 생산 | 발송일 의미 복원 |
| `PartnerOrderDetailResponse.java:28,76-82` | 상세 계약·`confirmedAt` 생산 | 목록과 4/4 일치 |
| `sales.ts:432-434` | FE 주문 요약 계약 | `submittedAt`과 선택적 `createdAt` 분리 |
| `sales.ts:647-648` | 상세 normalizer | 상세에는 BE `createdAt`이 없어 `null`; 화면 소비 없음 |
| `sales.ts:688-689` | 목록 normalizer | 두 필드를 독립 전달 |
| `SalesPartnerOrderListPage.tsx:65-66` | 주문번호 누락 시 행 key fallback | 실 4건은 주문번호 보유, 영향 0 |
| `SalesPartnerOrderListPage.tsx:272-277` | 기존 목록 `발송일` 표시 | DRAFT 4/4 날짜 없음 |
| `estimateUnifiedListModel.ts:93-94` | 작성일=`createdAt`, 정렬=`submittedAt ?? createdAt` | 표시/정렬 분리 |

`MergeConvertDialog.tsx`는 `PartnerOrderSummary` 타입을 전달받지만 두 날짜 필드를 직접 읽지 않는다. `taxInvoiceApi.ts`와 accounting-service의 `submittedAt`은 세금계산서 전송 시각인 별도 도메인이다. mock과 테스트 fixture는 제품 소비처 수에서 제외했다.

### `createdAt` 신규 표면

- production 화면에서 주문 요약 `createdAt`을 직접 읽는 곳은 통합 목록 모델 1곳뿐이다. 기존 주문 목록·병합 모달이 새 필드를 발송일로 오사용하지 않는다.
- 상세 FE normalizer는 상속 타입 정합 때문에 선택 필드를 `null`로 만들지만 상세 BE DTO는 `createdAt`을 직렬화하지 않으며 해당 값을 읽는 상세 화면도 없다.
- 활성 4행 목록 응답은 2,077 bytes였다. 같은 JSON에서 `createdAt` 4개를 제거한 비교 대비 증가는 176 bytes, 행당 44 bytes다. 파싱·타입체크·화면 렌더 오류는 없었다.

## 3. S9-01 — 후속 페이지 부분 실패

Playwright route에서 실 견적 첫 응답 53건은 그대로 두고 `totalPages=2`만 설정한 뒤 `page=1&size=10000`을 503으로 반환했다.

| 검증 | 실측 | 판정 |
|---|---:|---|
| 성공한 첫 페이지 보존 | 견적 53건 | PASS |
| 다른 계열 보존 | 주문 4건 | PASS |
| 불완전 배너 | `종합견적서 목록을 불러오지 못했습니다. 가능한 데이터만 표시합니다.` | PASS |
| 정상 57행 조회 배너 | 0건 | PASS |
| 성공 필터 변경 후 | 기대 22행 = 화면 22행, 배너 0 | PASS |
| 새로고침 재시도 성공 후 | 전체 57행, 배너 0 | PASS |

배너는 해당 계열을 지목하고 “불러오지 못했습니다”와 “가능한 데이터만 표시합니다”를 함께 말하므로, 현재 행이 전부가 아니라 일부 가능한 데이터라는 사실이 화면에 드러난다. 필터 변경 중 배너가 잠시 사라지는 순간만 보지 않고 두 API의 200 응답 완료와 최종 행 수까지 기다렸다. 재시도도 앱 remount 후 전체 57행 복귀까지 확인했으므로 오래된 부분 결과를 성공 상태로 붙드는 경로는 관찰되지 않았다.

## 4. 무훼손 회귀

통합 ON 상태에서 확인했다.

| 경로 | 실측 | 차단 |
|---|---|---:|
| 기존 견적 페이징 | 1/2 → 2/2, 통합 행 57 → 57 | 0 |
| 기간 필터 | 기대 22 = 화면 22 | 0 |
| 복원 표면 | 삭제 포함 API 복원 가능 4, 화면 2/41페이지 버튼 4 | 0 |
| 견적 상세 이동 | 1/1 | 0 |
| 주문 상세 이동 | 1/1 | 0 |
| 신규 견적 이동 | 1/1 | 0 |
| UUID 노출 | 0 | 0 |
| `담당` 노출 | 0 | 0 |

복원 POST는 누르지 않았다. DB 직접 접근과 DB 쓰기는 모두 0건이다.

## 5. 자동 검증

- Playwright Chromium headless, 1600×1000, `clients/desktop` cwd, 실 renderer `:5197`, gateway `:8080`: PASS.
- FE 집중 테스트: 3 files, **22/22 PASS**.
- FE `npm run typecheck`: exit 0.
- 백엔드 DTO 집중 테스트 `--rerun-tasks`: **BUILD SUCCESSFUL**, 15 tasks executed.
- 응답 직렬화는 재배포된 서비스의 실제 HTTP JSON으로 확인했다.

테스트 stderr의 `SalesSubNav` 중복 key 경고, `/app/version` 404, `/logs/front` 503은 S10 변경 파일 밖의 선재 표면이며 이번 두 BLOCK과 연결되지 않아 결함으로 세지 않았다.

## 6. 무변경·신규 파일·프로세스 회수

- 커밋·push·제품 코드 수정 없음.
- S11이 만든 잔존 신규 파일은 본 보고서 1개뿐이다.
- 기존 untracked `docs/superpowers/plans/2026-08-08-1092-s10-written-date-and-partial-page.md`는 S11 생성물이 아니며 보존했다.
- 임시 `.tmp-s11-recon.mjs`, Playwright Chromium, QA renderer는 라운드 종료 시 회수했다.
- Docker 컨테이너와 배포 서비스는 중지·재기동하지 않았다.

## 7. 이 라운드가 보지 않은 것

- 현재 활성 주문 4건이 모두 DRAFT라 실 CONFIRMED 주문의 `submittedAt != createdAt` 교차 정렬은 화면에서 발화하지 않았다. 이 경계는 모델 테스트로만 확인했다.
- 실제 DB에 10,001번째 견적을 쓰지 않았다. 실 53건 응답의 페이지 메타와 후속 페이지 실패만 브라우저에서 주입했다.
- 복원 성공 POST는 DB 쓰기 금지 때문에 실행하지 않았다. 삭제 포함 API 계약과 버튼 도달까지만 확인했다.
- 저장소 밖 제3자 소비자의 공용 주문 요약 DTO 사용은 확인하지 못했다.
- Electron 패키징 바이너리, 장시간 세션, 실제 10,000행 초과 성능은 보지 않았다.
