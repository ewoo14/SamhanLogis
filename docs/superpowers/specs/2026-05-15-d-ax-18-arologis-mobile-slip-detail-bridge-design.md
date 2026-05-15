# D-AX-18 아로로지스 모바일 전표 상세 브리지 설계

## 선택지 기록

1. 추천안: 인증된 오늘 정차 target 으로 서버가 내부 slipId 를 해석하고, UUID-free 읽기 전용 전표 상세를 반환한다.
2. 확장안: 전표 상세와 함께 코멘트, 감사 이력, SSE 갱신까지 한 번에 proxy 한다.
3. 보류안: 실제 기기 QA 이후 전표 상세를 진행한다.

사용자 지시에 따라 추천안 1번으로 진행한다. D-AX-18 범위는 읽기 전용 전표 상세에 한정하고, 코멘트/감사/SSE proxy 는 후속 선택지로 둔다.

## 목표

- `clients/arologis-mobile` 의 dashboard 정차 행에서 `전표` 진입을 활성화한다.
- 앱은 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 만 전송한다.
- `arologis-service` 는 로그인 기사와 오늘 배차 target 을 검증한 뒤 내부 `slipId` 를 해석한다.
- 응답과 화면에는 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 을 노출하지 않는다.

## 백엔드 계약

- Endpoint: `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail`
- Query: `parsedKakaoSeq` optional.
- 권한: 기존 D-AX-16/17 과 동일한 driver-app role set.
- 성공 응답: `ApiResponse<DriverSlipDetailResponse>`
- 미등록 driver: 403 `FORBIDDEN`
- target 불일치 또는 카톡 순번 불일치: 400 `INVALID_INPUT`
- slip 매핑 실패: 422 `SLIP_MAPPING_NOT_FOUND`
- slip-service 상세 조회 실패: 502 `SLIP_DETAIL_FETCH_FAILED`

## 공개 응답 필드

- `dispatchType`
- `vehicleSequence`
- `stopSequence`
- `parsedKakaoSeq`
- `partnerName`
- `stopLabel`
- `slipNo`
- `slipDate`
- `deliveryAddress`
- `sourceWarehouseName`
- `totalSupply`
- `vat`
- `total`
- `lines[]`
  - `productName`
  - `specification`
  - `quantity`
  - `unitPrice`
  - `lineTotal`

## 프론트엔드 UX

- Dashboard 정차 행 액션은 `전표`, `서명`, `사진` 순으로 둔다.
- `UNPARSED` 정차는 전표/서명/사진 모두 disabled 로 유지한다.
- 전표 화면은 target 이 없으면 배차 탭에서 정차를 선택하라는 guard 만 보여준다.
- 성공 화면은 전표번호, 거래처, 주소, 창고, 품목, 금액 합계를 읽기 전용으로 보여준다.
- 오류는 한국어로 매핑한다.
  - 422: 정차와 연결된 전표를 찾을 수 없습니다.
  - 502: 전표 상세를 불러오지 못했습니다.
  - 401/403: 기사 권한을 확인해 주세요.

## QA 캡처

PR 본문에는 commit-pinned raw URL 로 다음 PNG 를 인라인 첨부한다.

1. today target 계약
2. dashboard 정차별 `전표` 버튼
3. target 없는 전표 상세 guard
4. 전표 상세 헤더
5. 품목/합계 영역
6. 422 매핑 실패
7. 502 상세 조회 실패와 재시도
8. UUID 비공개 검증 매트릭스
