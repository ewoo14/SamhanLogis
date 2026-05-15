# D-AX-20: 아로로지스 Admin 사진 감사 UX

> 화면: `/admin/photo-audit`
> 대상 앱: `clients/desktop`
> 사용자: 아로로지스 창고/관리 운영자 (`WAREHOUSE` / `MANAGER` / `MASTER`)
> 목적: 기사앱에서 업로드된 배송/검수 사진을 전표 기준으로 빠르게 검수하고, 재업로드가 필요한 후보를 운영자가 선별한다.
> 원칙: 기존 desktop admin dense table 패턴을 유지한다. 신규 토큰, 마케팅형 카드 UI, UUID / 내부 URL 노출은 금지한다.

---

## 1. 디자인 의도

- 운영자는 사진을 감상하는 사용자가 아니라 누락, 품질, GPS 여부, 전표 연결 상태를 빠르게 찾는 검수자다.
- 첫 화면은 필터 + 조밀한 테이블이다. 요약 카드, 큰 hero, 이미지 갤러리형 목록은 사용하지 않는다.
- 썸네일은 행 안에서 감사 판단을 돕는 보조 정보다. 전체 화면 갤러리가 아니라 테이블 스캔 흐름을 유지한다.
- 사용자에게 보이는 식별자는 `slipNo`, 거래처명, 기사코드, 차량/정차 순번, 파일명만 사용한다.
- 내부 `attachmentId`, `slipId`, `dispatchId`, `stopId`, `storageKey`, presigned `downloadUrl` 은 화면, 접근성 라벨, tooltip, toast, QA 캡처에 노출하지 않는다. D-AX20 응답은 read-only 전표번호 중심이라 `attachmentId`, `slipId`, `downloadUrl`을 포함하지 않는다.
- GPS는 좌표값을 직접 표시하지 않고 `있음 / 없음` 여부만 표시한다. 분쟁 대응용 정밀 좌표 확인은 별도 권한/상세 로그 범위다.
- D-AX20 첫 PR 은 backend 계약에 맞춰 사진 유형, 기간, 전표번호 필터만 제공한다. 감사 상태/GPS/기사/통합 검색 필터는 후속 mutation 또는 검색 API 확장 PR 에서 추가한다.

---

## 2. 화면 IA

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 사진 감사                                                         [새로고침] │
│ 업로드 사진을 전표 기준으로 검수합니다. 내부 URL과 UUID는 화면에 표시하지 않습니다. │
├──────────────────────────────────────────────────────────────────────────────┤
│ 유형 [전체▼]  시작일 [2026-05-16]  종료일 [2026-05-16]  전표번호 [2026/05/16-1] [조회] │
├──────────────────────────────────────────────────────────────────────────────┤
│ 총 128건 · 재업로드 후보 9건 · GPS 없음 31건 · 30초 자동 갱신                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 썸네일 │ 상태 │ 유형 │ 전표번호        │ 거래처 │ 기사 │ 차량/정차 │ GPS │ 촬영/업로드 │ 액션 │
│ 56x56 │ 후보 │ 배송 │ 2026/05/16-1  │ 대구공조 │ D014 │ 1호/3번  │ 있음 │ 09:12/09:15 │ 상세 │
│ 56x56 │ 정상 │ 검수 │ 2026/05/16-2  │ 한성냉열 │ D021 │ 2호/1번  │ 없음 │ -/09:18    │ 상세 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 페이지 헤더

| 항목 | 명세 |
|---|---|
| 제목 | `사진 감사` |
| 설명 | `업로드 사진을 전표 기준으로 검수합니다. 내부 URL과 UUID는 화면에 표시하지 않습니다.` |
| 우측 액션 | `새로고침` secondary button |
| 자동 갱신 | 30초 polling 또는 기존 realtime helper 사용 가능. 화면에는 `30초 자동 갱신` 으로만 표기 |

헤더 높이는 작게 유지한다. 18px semibold 제목, 13px neutral 보조 설명을 사용한다.

---

## 3. 필터 영역

필터는 테이블 위 한 줄 또는 2줄 grid 로 배치한다. 별도 floating card 로 감싸지 않는다. 기존 admin form control 높이 36px 기준을 따른다.

| 필터 | 입력 방식 | 기본값 | 동작 |
|---|---|---|---|
| 기간 | date range | 오늘 | `uploadedAt` 기준. 추후 `capturedAt` 기준 전환은 별도 옵션 |
| 사진 유형 | select | 전체 | `DELIVERY`, `INSPECTION` |
| 감사 상태 | 후속 | - | 후속 PR 에서 서버 필터로 확장 |
| GPS 여부 | 후속 | - | 후속 PR 에서 서버 필터로 확장 |
| 기사 | 후속 | - | driver/employee 표시명 계약 확정 후 추가 |
| 거래처/파일명 검색 | 후속 | - | repository 검색 범위 확장 PR 에서 추가 |
| 조회 | primary button | - | 필터 적용 |
| 초기화 | ghost button | - | 오늘 + 전체 조건으로 복귀 |

### 3.1 필터 동작 원칙

- 조회 결과가 많아도 테이블 밀도는 유지한다. 행 높이를 늘리는 대신 pagination 또는 virtual scroll 을 사용한다.
- 검색어가 UUID 형태여도 결과 텍스트에 UUID를 보여주지 않는다. 운영자가 내부 id를 붙여 넣은 경우에도 매칭 여부만 반영한다.
- URL 검색은 허용하지 않는다. `http`, `https`, `X-Amz-` 등 URL성 문자열 입력 시 원문을 보관/표시하지 않고 `전표번호만 입력해 주세요.` helper text 를 표시한다.
- 필터 조건은 query string 에 저장 가능하지만 내부 id나 URL을 query param 으로 쓰지 않는다.
- 현재 PR 의 실제 query param 은 `type`, `from`, `to`, `slipNo`, `page`, `size` 이다.

---

## 4. 테이블 명세

테이블은 `DataGrid` 또는 기존 admin `<table>` dense 패턴을 사용한다.

| 컬럼 | width | 표시값 | 노출 금지 |
|---|---:|---|---|
| 썸네일 | 72px | 56x56 crop thumbnail | 원본 URL, storage key |
| 상태 | 112px | `정상`, `재업로드 후보`, `삭제됨` badge | 내부 audit rule id |
| 유형 | 88px | `배송사진`, `검수사진` | enum raw 만 단독 표시 금지 |
| 전표번호 | 132px | `slipNo` | `slipId` |
| 거래처 | 180px | `partnerName` | `partnerId` |
| 기사 | 120px | `driverCode` + 이름 | driver UUID |
| 차량/정차 | 96px | `차량 1 / 정차 3` | vehicleId, stopId |
| GPS | 80px | `있음`, `없음` badge | 위도/경도 숫자 |
| 촬영/업로드 | 150px | `capturedAt` / `uploadedAt` | DB createdBy UUID |
| 파일 | 150px | `fileName`, `fileSize` | downloadUrl |
| 액션 | 96px | `상세`, `후보 해제` | URL 복사, id 복사 |

### 4.1 행 높이와 썸네일

- 기본 행 높이: 72px.
- 썸네일: 56x56px, `object-fit: cover`, radius 4px.
- 이미지 로딩 중: neutral-100 skeleton block.
- 이미지 로딩 실패: 같은 크기의 placeholder + `미리보기 실패`.
- 썸네일 alt/accessibility label: `배송사진 미리보기, 전표 {slipNo}` 형식. URL이나 id를 포함하지 않는다.
- 썸네일 클릭은 상세 패널을 연다. 새 탭으로 원본 URL을 열지 않는다.

### 4.2 상태 badge

| 상태 | badge variant | 표시 기준 |
|---|---|---|
| 정상 | success | 파일 열람 가능, 전표 연결 정상, 운영자가 재업로드 후보로 보지 않음 |
| 재업로드 후보 | warning | 품질/메타/연결 문제로 재촬영 또는 재업로드 검토 필요 |
| 삭제됨 | neutral | soft delete 된 첨부. 기본 필터에서는 숨김 |
| 오류 | danger | 목록 응답은 있지만 썸네일 또는 메타 조회가 실패한 행 |

`재업로드 후보`는 warning token 을 사용한다. 새 색상 토큰을 만들지 않는다.

### 4.3 재업로드 후보 판정 문구

테이블에는 badge 하나만 노출하고, 상세 패널에서 후보 사유를 짧게 보여준다.

| 후보 사유 | 상세 패널 문구 |
|---|---|
| GPS 없음 | `GPS 정보가 없는 사진입니다.` |
| 촬영시각 없음 | `촬영시각이 없어 현장 촬영 여부 확인이 어렵습니다.` |
| 파일 크기 과소 | `파일 크기가 비정상적으로 작습니다.` |
| 썸네일 생성 실패 | `미리보기를 생성하지 못했습니다.` |
| 전표 연결 불명확 | `전표 연결 상태를 다시 확인해야 합니다.` |
| 운영자 수동 표시 | `운영자가 재업로드 후보로 표시했습니다.` |

후보 사유는 운영자 판단을 돕는 경고다. 자동으로 기사에게 알림을 보내거나 재업로드 요청을 확정하지 않는다.

---

## 5. 상세 패널

`상세` 클릭 시 우측 drawer 또는 기존 Modal 을 사용한다. 화면 전체를 이미지 뷰어로 전환하지 않는다.

```
┌──────────────────────────────────────┐
│ 사진 상세                      [닫기] │
├──────────────────────────────────────┤
│ [큰 미리보기 360x240]                │
│                                      │
│ 상태        재업로드 후보             │
│ 후보 사유   GPS 정보가 없는 사진입니다. │
│ 유형        배송사진                  │
│ 전표번호    2026/05/16-521            │
│ 거래처      대구공조                  │
│ 기사        D014 김운송                │
│ 차량/정차   차량 1 / 정차 3            │
│ GPS         없음                      │
│ 촬영시각    -                         │
│ 업로드시각  2026-05-16 09:15          │
│ 파일        IMG_1024.jpg · 486KB       │
│                                      │
│ [후보 해제] [재업로드 요청 기록]       │
└──────────────────────────────────────┘
```

### 5.1 상세 패널 가드

- D-AX20 첫 PR 은 raw URL 없이 파일 metadata placeholder 를 표시한다. 보안 proxy 미리보기 endpoint 는 후속 PR 에서 별도 설계한다.
- 우클릭/복사 방지는 보안 기능으로 간주하지 않는다. 핵심은 URL을 텍스트로 노출하지 않는 것이다.
- `원본 열기`, `URL 복사`, `첨부 ID 복사` 액션은 제공하지 않는다.
- 상세 패널에도 GPS 좌표값은 노출하지 않는다. `있음`일 때도 좌표 대신 `촬영 위치 정보 있음` 으로 표기한다.
- `재업로드 요청 기록`은 운영 로그/후속 workflow 진입점이다. 본 UX 문서 범위에서는 기사 앱 push/SMS 발송까지 정의하지 않는다.

---

## 6. 빈 상태

### 6.1 조회 결과 없음

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│            조건에 맞는 사진이 없습니다.                      │
│      기간이나 감사 상태 필터를 변경해 다시 조회해 주세요.     │
│                                                              │
│                    [필터 초기화]                             │
└──────────────────────────────────────────────────────────────┘
```

| 항목 | 명세 |
|---|---|
| testID | `photo-audit-empty` |
| API 호출 | 완료됨 |
| CTA | `필터 초기화` |
| 금지 | 큰 일러스트, 신규 아이콘, 카드형 홍보 문구 |

### 6.2 업로드 데이터 자체 없음

초기 운영일처럼 전체 결과가 0건이면 같은 테이블 영역 안에 `아직 업로드된 사진이 없습니다.` 를 표시한다. 별도 onboarding UI를 추가하지 않는다.

---

## 7. 오류 상태

| 상태 | 트리거 | 화면 문구 | 운영자 행동 |
|---|---|---|---|
| 목록 조회 실패 | 5xx, network | `사진 감사 목록을 불러오지 못했습니다.` | 다시 시도 |
| 권한 없음 | 401/403 | `사진 감사 화면 권한이 없습니다.` | 권한 확인 또는 재로그인 |
| 썸네일 실패 | 이미지 fetch 실패 | 행 썸네일에 `미리보기 실패` | 상세 확인 또는 재조회 |
| 일부 메타 누락 | row 일부 필드 null | 해당 셀 `-`, 상태는 후보 가능 | 후보 사유 확인 |
| 필터 오류 | 잘못된 기간 | `시작일은 종료일보다 늦을 수 없습니다.` | 기간 수정 |

오류 banner 는 테이블 위에 한 줄로 표시한다. 전면 modal 로 막지 않는다.

---

## 8. 디자인 토큰과 밀도

신규 토큰은 만들지 않는다.

| 영역 | 기준 |
|---|---|
| 본문 | Pretendard 14px regular |
| 페이지 제목 | 18px semibold |
| 테이블 헤더 | 12px semibold, neutral-700 |
| 테이블 셀 | 13px regular, neutral-800 |
| 배경 | neutral-50 / surface app |
| 테이블 표면 | neutral-0 / surface card |
| 구분선 | neutral-100/200 |
| Primary | design-system primary |
| Warning | 재업로드 후보 |
| Error | 조회 실패, 썸네일 오류 |
| Success | 정상 |

시각 밀도 기준:

- 페이지 padding 24px.
- 필터 control height 36px.
- 테이블 행 height 72px.
- 썸네일은 행 높이 안에 들어가야 하며, 행을 80px 이상으로 키우지 않는다.
- 테이블 셀은 한 줄 말줄임을 기본으로 한다. 거래처명과 파일명만 tooltip 허용.

---

## 9. testID + 접근성

| 영역 | testID | 접근성 기준 |
|---|---|---|
| 화면 root | `photo-audit-page` | 제목 `사진 감사` |
| 필터 영역 | `photo-audit-filters` | 각 input label 연결 |
| 조회 버튼 | `photo-audit-search-button` | `사진 감사 목록 조회` |
| 초기화 버튼 | `photo-audit-reset-button` | `사진 감사 필터 초기화` |
| 테이블 | `photo-audit-table` | `role="table"` 또는 DataGrid 기본 role |
| 행 | `photo-audit-row-{slipNo}-{index}` | UUID 대신 slipNo + index |
| 썸네일 | `photo-audit-thumbnail-{slipNo}-{index}` | `{photoTypeLabel} 미리보기, 전표 {slipNo}` |
| 상태 badge | `photo-audit-status-{slipNo}-{index}` | `사진 감사 상태: {statusLabel}` |
| GPS badge | `photo-audit-gps-{slipNo}-{index}` | `GPS 정보 있음/없음` |
| 상세 버튼 | `photo-audit-detail-{slipNo}-{index}` | `{slipNo} 사진 상세 보기` |
| 빈 상태 | `photo-audit-empty` | `조건에 맞는 사진이 없습니다` |
| 오류 banner | `photo-audit-error` | `role="alert"` |
| 상세 패널 | `photo-audit-detail-panel` | focus trap, 닫기 후 상세 버튼으로 focus 복귀 |

행 testID 에 `attachmentId` 를 넣지 않는다. 같은 전표에 여러 사진이 있을 수 있으므로 `index` 를 붙인다.

---

## 10. UUID / URL 비노출 검증

아래 항목은 화면 텍스트, 접근성 라벨, tooltip, toast, data-testid, QA 캡처에 없어야 한다.

| 금지 항목 | 예시 패턴 | 대체 표시 |
|---|---|---|
| `attachmentId` | UUID v4 | 응답 미포함, 행 index/파일명 |
| `slipId` | UUID v4 | `slipNo` |
| `dispatchId` | UUID v4 | 배차일, 차량/정차 순번 |
| `vehicleId`, `stopId` | UUID v4 | `차량 1 / 정차 3` |
| `storageKey` | `slip-attachments/...` | 미표시 |
| `downloadUrl` | `https://`, `X-Amz-`, presigned URL | D-AX20 응답/화면 미포함. 보안 proxy preview 는 후속 PR |
| GPS 좌표 | `37.5665000`, `126.9780000` | `GPS 있음` |

검증 정규식:

```text
[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}
```

URL성 문자열 검증:

```text
https?://|X-Amz-|storageKey|downloadUrl
```

---

## 11. PR 캡처 체크포인트

PR 본문에는 `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/*.png` 7장을 인라인 첨부한다. 권장 캡처는 아래 7장이다.

| No | 캡처명 제안 | 검증 포인트 |
|---:|---|---|
| 1 | `01-scope-contract.png` | 표시 허용/비노출 계약, 내부 식별자/원본 경로 숨김 |
| 2 | `02-filter-table.png` | 필터 + dense table 첫 화면, 신규 카드 UI 없음 |
| 3 | `03-thumbnail-no-url.png` | 썸네일/상세 미리보기는 보이지만 URL 텍스트가 없음 |
| 4 | `04-reupload-candidate-badge.png` | 재업로드 후보 warning badge 와 후보 사유가 UUID 없이 표시 |
| 5 | `05-gps-audit-metadata.png` | GPS 있음/없음 badge, 좌표 숫자 미노출 |
| 6 | `06-verification-matrix.png` | BE/FE/QA/DevOps 검증 matrix |
| 7 | `07-pr-inline-capture-checklist.png` | PR 본문 raw URL + HEAD 200 체크리스트 |

QA 판정 기준:

- 캡처 텍스트에 UUID 정규식이 없어야 한다.
- 캡처 텍스트에 `http`, `downloadUrl`, `storageKey`, `X-Amz-` 가 없어야 한다.
- GPS 좌표값은 캡처에 없어야 한다.
- 첫 화면은 필터/테이블 중심이어야 하며 카드형 요약 영역이 테이블보다 시각 우선순위를 갖지 않아야 한다.
- 재업로드 후보는 warning badge 로 명확히 보이며, 정상/오류 상태와 색상만으로 구분되지 않고 텍스트를 포함해야 한다.

---

## 12. Frontend 전달 Spec

Frontend agent 는 아래 범위로 구현한다.

- `/admin/photo-audit` route 를 기존 desktop admin layout 아래에 추가한다.
- 필터는 D-AX20 backend 계약에 맞춰 기간, 사진 유형, 전표번호를 제공한다.
- 목록은 dense table 로 구현하고, 행 안에 56x56 썸네일을 표시한다.
- 썸네일은 raw URL 없는 안전 placeholder 로 표시한다. 보안 proxy 미리보기 endpoint 는 후속 PR 에서 추가한다.
- 재업로드 후보 badge, GPS 있음/없음 badge, 빈 상태, 오류 banner 를 구현한다.
- row key 나 mutation payload 내부에서는 id 사용 가능하지만 사용자 노출 텍스트/testID/accessibility label 에는 UUID를 넣지 않는다.
- 신규 design-system token 을 추가하지 않는다.

Frontend agent 가 변경하지 않을 범위:

- 기사앱 사진 업로드 UX
- 사진 재업로드 요청의 SMS/push 발송 workflow
- 원본 파일 다운로드/공유 기능
- GPS 좌표 상세 노출
- design-system typography/colors token
