# D-AX-18: arologis-mobile 전표 상세 브리지 UX 가이드

> 화면: `clients/arologis-mobile` 기사 배차 Dashboard 정차 행 + 전표 상세 화면
> 사용자: 아로로지스 기사 (`AROLOGIS_DRIVER`)
> 데이터: `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail`
> 원칙: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 target 을 전달하고, 화면에는 UUID / 내부 id / download URL 을 노출하지 않는다.

---

## 1. 디자인 의도

- Dashboard 정차 행에서 업무 흐름을 `전표` → `서명` → `사진` 순서로 고정한다. 기사는 먼저 납품 내용을 확인하고, 이후 인수 확인 서명과 사진 증빙을 처리한다.
- 전표 상세는 읽기 전용이다. 품목/금액 확인 목적만 제공하고 수정, 코멘트, 감사 이력은 D-AX-18 범위에서 제외한다.
- D-AX-16 서명, D-AX-17 사진과 같은 오늘 정차 target guard 를 재사용한다. target 이 없으면 빈 화면에서 추측 진입하지 않는다.
- 오류는 기사 행동 기준으로 번역한다. 422 는 "전표 연결 없음", 502 는 "전표 상세 조회 실패" 로 분리해 사무실 문의와 재시도를 다르게 유도한다.
- UUID 비노출은 화면, 접근성 라벨, 테스트 문구, QA 캡처 모두에서 검증한다.

---

## 2. Dashboard 정차 행 액션

### 2.1 정상 정차 행

```
┌────────────────────────────────────────┐
│  1번째 정차                             │
│  대구공조                               │
│  SL-2026-0521 · 인천 남동구 만수동       │
│                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ 전표 │ │ 서명 │ │ 사진 │            │
│  └──────┘ └──────┘ └──────┘            │
└────────────────────────────────────────┘
```

| 액션 | 순서 | enabled 조건 | disabled 조건 | tap 결과 |
|---|---:|---|---|---|
| `전표` | 1 | `dispatchType`, `vehicleSequence`, `stopSequence` 가 있고 정차가 `UNPARSED` 가 아님 | empty target, `UNPARSED`, 권한/오늘 배차 미확인 | 전표 상세 화면으로 이동 후 상세 조회 |
| `서명` | 2 | D-AX-16 서명 가능한 target | empty target, `UNPARSED` | 서명 화면으로 이동 |
| `사진` | 3 | D-AX-17 사진 업로드 가능한 target | empty target, `UNPARSED` | 사진 화면으로 이동 |

### 2.2 disabled 행

```
┌────────────────────────────────────────┐
│  미해석 정차                            │
│  카카오 배차 원문 확인 필요              │
│                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ 전표 │ │ 서명 │ │ 사진 │            │
│  └──────┘ └──────┘ └──────┘            │
│   disabled neutral-200 / neutral-500    │
└────────────────────────────────────────┘
```

- 세 버튼은 같은 disabled 스타일을 쓴다: 배경 `neutral-200`, 텍스트 `neutral-500`, opacity 1.0. disabled 를 opacity 만으로 처리하지 않는다.
- disabled reason 은 화면에 길게 표시하지 않는다. 정차 행의 상태 문구가 이유를 대신한다.
- 접근성: `accessibilityState={{ disabled: true }}` 와 `accessibilityHint="카카오 배차 정차가 해석된 뒤 사용할 수 있습니다"` 를 지정한다.

---

## 3. 전표 상세 화면 구조

### 3.1 empty target guard

Dashboard 외부 탭 또는 딥링크로 target 없이 진입하면 상세 API 를 호출하지 않는다.

```
┌────────────────────────────────────────┐
│  ←  전표 상세                           │
├────────────────────────────────────────┤
│                                        │
│          전표를 선택해 주세요           │
│   배차 탭에서 정차를 선택하면 전표      │
│   상세를 확인할 수 있습니다.            │
│                                        │
│        [배차 탭으로 이동]               │
└────────────────────────────────────────┘
```

| 항목 | 명세 |
|---|---|
| 제목 | `전표를 선택해 주세요` |
| 본문 | `배차 탭에서 정차를 선택하면 전표 상세를 확인할 수 있습니다.` |
| CTA | `배차 탭으로 이동` |
| API 호출 | 없음 |
| testID | `slip-detail-empty-target` |

### 3.2 header

```
┌────────────────────────────────────────┐
│  ←  전표 상세            1번째 정차      │
├────────────────────────────────────────┤
│  SL-2026-0521                           │
│  대구공조                               │
│  2026-05-15 · AROLOGIS                  │
│  인천 남동구 만수동 12-3                 │
│  출고창고: 인천1센터                    │
└────────────────────────────────────────┘
```

| 영역 | 표시값 | 노출 금지 |
|---|---|---|
| Header 오른쪽 | `{stopSequence}번째 정차` | `stopId`, `vehicleId` |
| 대표 번호 | `slipNo` | `slipId` |
| 거래처 | `partnerName` | `partnerId`, `partnerCode` 는 본 화면 기본 미노출 |
| 날짜 | `slipDate` | 내부 생성/수정 audit |
| 배차 유형 | `dispatchType` display label 또는 원문 | `dispatchId` |
| 주소 | `deliveryAddress` | 좌표/정밀 GPS |
| 창고 | `sourceWarehouseName` | `sourceWarehouseId` |

### 3.3 line items

```
┌────────────────────────────────────────┐
│  품목                                   │
├────────────────────────────────────────┤
│  에어컨 실외기                          │
│  12EA · 85,000원                        │
│  규격: SAM-18                           │
│                              1,020,000원│
├────────────────────────────────────────┤
│  배관 세트                              │
│  3EA · 25,000원                         │
│                               75,000원 │
└────────────────────────────────────────┘
```

- 품목명은 2줄까지 허용하고, 초과 시 말줄임 처리한다.
- `specification` 이 비어 있으면 규격 줄은 숨긴다.
- 수량, 단가, 행 합계는 tabular number 스타일을 적용한다.
- 행 합계는 오른쪽 정렬한다. 금액이 긴 경우 다음 줄로 밀리지 않도록 최소 폭을 확보한다.
- 품목이 0건이면 `전표 품목이 없습니다. 사무실에 확인해 주세요.` empty row 를 표시한다.

### 3.4 totals

```
┌────────────────────────────────────────┐
│  공급가액                       1,095,000원│
│  부가세                           109,500원│
├────────────────────────────────────────┤
│  합계                           1,204,500원│
└────────────────────────────────────────┘
```

| 값 | 표시 |
|---|---|
| `totalSupply` | `공급가액` |
| `vat` | `부가세` |
| `total` | `합계`, 16px semibold |

- 합계 영역은 화면 하단 고정이 아니라 상세 내용 끝에 둔다. 작은 화면에서는 자연스럽게 스크롤한다.
- 금액이 null 이면 `-` 로 표시하고, 합계 행만 강조하지 않는다.

---

## 4. 상태와 오류 UX

| 상태 | 트리거 | 화면 문구 | 기사 행동 |
|---|---|---|---|
| loading | 상세 API 호출 중 | `전표 상세를 불러오는 중입니다.` | 대기 |
| success | HTTP 200 | header + 품목 + 합계 | 납품 내용 확인 |
| empty target | 화면 target 없음 | `전표를 선택해 주세요.` | 배차 탭 이동 |
| 401/403 | 인증 만료 또는 기사 권한 없음 | `기사 권한을 확인해 주세요.` | 재로그인 또는 사무실 문의 |
| 422 | `SLIP_MAPPING_NOT_FOUND` | `정차와 연결된 전표를 찾을 수 없습니다.` | 사무실에 전표 연결 요청 |
| 502 | `SLIP_DETAIL_FETCH_FAILED` | `전표 상세를 불러오지 못했습니다.` | `다시 시도` |
| network | timeout/offline | `네트워크 연결 후 다시 시도해 주세요.` | 연결 확인 후 재시도 |

### 4.1 422 mapping failure

```
┌────────────────────────────────────────┐
│  ←  전표 상세            1번째 정차      │
├────────────────────────────────────────┤
│                                        │
│   정차와 연결된 전표를 찾을 수 없습니다. │
│   사무실에서 전표 연결 상태를 확인해야   │
│   합니다.                               │
│                                        │
│        [배차 탭으로 돌아가기]           │
└────────────────────────────────────────┘
```

- 422 는 재시도 CTA 를 primary 로 두지 않는다. 같은 target 으로 반복 호출해도 해결되지 않는 데이터 매핑 상태다.
- CTA 는 `배차 탭으로 돌아가기` 를 제공한다.

### 4.2 502 fetch failure

```
┌────────────────────────────────────────┐
│  ←  전표 상세            1번째 정차      │
├────────────────────────────────────────┤
│                                        │
│   전표 상세를 불러오지 못했습니다.       │
│   잠시 후 다시 시도해 주세요.            │
│                                        │
│              [다시 시도]                │
└────────────────────────────────────────┘
```

- 502 는 slip-service 일시 실패 가능성이 있으므로 `다시 시도` 를 primary 로 둔다.
- retry 는 같은 target 으로 상세 API 를 1회 재호출한다. 버튼 연타 방지를 위해 loading 중 disabled 처리한다.

---

## 5. 디자인 토큰

RN Expo 환경에서는 기존 arologis-mobile 토큰을 사용한다. 신규 토큰을 만들지 않는다.

| 영역 | 토큰 |
|---|---|
| 화면 배경 | `neutral-50` |
| 상세 카드 배경 | `neutral-0` |
| Header title | 18px semibold |
| 본문 | 14px regular |
| 보조 텍스트 | 13px regular, `neutral-600` |
| 구분선 | `neutral-200`, 1px |
| Primary button | design-system `primary` |
| Error 상태 | `error` red |
| Warning/매핑 상태 | `warning` orange |
| Success/정상 확인 | `success` green 은 본 화면에서 과도하게 쓰지 않음 |

---

## 6. testID + 접근성

| 영역 | testID | 접근성 라벨 |
|---|---|---|
| Dashboard `전표` 버튼 | `stop-action-slip-detail` | `전표 상세 보기` |
| Dashboard `서명` 버튼 | `stop-action-signature` | `서명하기` |
| Dashboard `사진` 버튼 | `stop-action-photo` | `사진 업로드` |
| 화면 root | `driver-slip-detail-screen` | 해당 없음 |
| Empty guard | `slip-detail-empty-target` | `전표를 선택해 주세요` |
| Header | `slip-detail-header` | `전표 {slipNo}, 거래처 {partnerName}, {stopSequence}번째 정차` |
| 품목 목록 | `slip-detail-line-items` | `전표 품목 목록` |
| 품목 행 | `slip-detail-line-item-{index}` | `{productName}, 수량 {quantity}, 금액 {lineTotal}` |
| 합계 | `slip-detail-totals` | `공급가액, 부가세, 합계` |
| 422 오류 | `slip-detail-error-422` | `정차와 연결된 전표를 찾을 수 없습니다` |
| 502 오류 | `slip-detail-error-502` | `전표 상세를 불러오지 못했습니다` |
| 다시 시도 | `slip-detail-retry` | `전표 상세 다시 시도` |

### 접근성 가드

- 모든 버튼 tap target 은 최소 44pt 를 유지한다.
- 금액은 스크린리더에서 `1,204,500원` 그대로 읽히도록 별도 UUID/내부 id 를 aria-label 에 넣지 않는다.
- 오류 영역은 `accessibilityLiveRegion="polite"` 로 상태 변경을 알린다.
- 색상만으로 오류를 구분하지 않고 제목 문구와 icon/token 을 함께 사용한다.

---

## 7. UUID 비노출 검증 포인트

QA 와 FE 테스트는 아래 문자열이 화면, 접근성 라벨, 스냅샷 텍스트에 없는지 확인한다.

| 금지 항목 | 예시 패턴 | 대체 표시 |
|---|---|---|
| `id` / `slipId` | UUID v4, `slipId=` | `slipNo` |
| `dispatchId` | UUID v4 | `dispatchType`, 정차 순번 |
| `vehicleId` | UUID v4 | `vehicleSequence` display |
| `stopId` | UUID v4 | `{stopSequence}번째 정차` |
| `sourceWarehouseId` | UUID v4 | `sourceWarehouseName` |
| `downloadUrl` | `http`, presigned URL | 미표시 |
| 내부 attachment/signature id | UUID v4 | 미표시 |

검증 정규식:

```text
[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}
```

QA 캡처 매트릭스에는 다음을 포함한다.

1. Dashboard 정차 행의 `전표`, `서명`, `사진` 순서.
2. `UNPARSED` 정차에서 세 action 모두 disabled.
3. Empty target guard 에서 API 호출 없음.
4. Header 에 `slipNo`, 거래처, 주소, 창고명만 표시.
5. 품목/합계 영역에서 금액 정렬과 null fallback.
6. 422 매핑 실패 문구와 `배차 탭으로 돌아가기`.
7. 502 상세 조회 실패 문구와 `다시 시도`.
8. UUID 정규식 미검출.

---

## 8. FE 전달 요약

- Dashboard action 순서는 항상 `전표`, `서명`, `사진` 이다.
- 전표 상세는 읽기 전용 bridge 화면이며, target 없이는 API 를 호출하지 않는다.
- 422 와 502 는 다른 사용자 행동을 유도한다: 422 는 사무실 확인, 502 는 재시도.
- 화면과 테스트에는 내부 식별자를 넣지 않는다. `slipNo`, `partnerName`, `stopSequence`, `sourceWarehouseName` 만 업무 식별자로 사용한다.
