# PR #1063 R19 재수렴 적대검증 보고서 (CODEX SOL 5.6)

- 검증일: 2026-08-05 (Asia/Seoul)
- 작업 루트: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- HEAD: `bc3adf9639a81671b420afa323ea6495ecec20eb`
- 검증 질문: R18 방향 전환 후 신규 표면의 결함 **도달성**
- 제약: 코드 수정, 컨테이너 조작, DB 직접 쓰기, 견적·이동·분개 재측정 없음

## 시작 상태

`git -C . rev-parse --show-toplevel`, 현재 브랜치 및 HEAD를 확인했다. 검증 시작 전부터 아래 QA 로그 2개가 수정 상태였으며 본 라운드에서는 읽거나 변경하지 않는다.

- `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`
- `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`

## 검증 결과

조사 중.

### 도달 결함 1 — 무수정 저장이 VAT 포함 단가를 공급단가로 재해석해 라인 금액을 바꾼다

도달 경로는 `/sales/{id}` → `행 추가` → `/sales/{id}/edit` → 아무 라인도 수정하지 않고 `저장`이다.

1. 상세 응답은 공급단가 `unitPrice`, VAT 포함 단가 `unitPriceWithVat`, 공급가액·부가세를 함께 준다(`api/slip.ts:54-82`).
2. R18 hydrate는 `unitPriceWithVat ?? unitPrice`를 화면 `unitPrice`로 넣고(`SlipFormPage.tsx:165-186`), 모든 기존 라인의 `authority`를 `'PRICE'`로 고정한다.
3. PUT builder는 `authority === 'PRICE'`이면 기존 `supplyAmount`·`vatAmount`·`lineTotal`을 보내지 않는다(`SlipFormPage.tsx:198-225`). `priceVatInclusive: true`를 넣지만 BE `SlipUpdateRequest.LineRequest`에는 그 필드가 없다(`SlipUpdateRequest.java:69-95`).
4. 따라서 `SalesSlipUpdateService.toLine()`은 권위 금액이 없는 분기로 들어가 `SlipLine.create(...)`를 호출한다(`SalesSlipUpdateService.java:221-247`). 이 팩토리는 받은 `unitPrice`를 VAT 제외 공급단가로 정의하고 공급가액·부가세·VAT 포함 단가를 새로 계산한다(`SlipLine.java:153-174`).

예를 들어 기존 1개 라인이 `VAT 포함 단가 1,100 / 공급가액 1,000 / 부가세 100`이면 hydrate 및 PUT 뒤 BE는 `공급단가 1,100 / 공급가액 1,100 / 부가세 110 / VAT 포함 단가 1,210`으로 만든다. 사용자 입력 없이 `저장`만 눌러도 도달한다.

비교 기준인 기존 상세 편집 경로는 같은 응답에서 `resolveUnitPrices(...).inclusiveUnit`을 사용하고, hydrate된 S/V/T를 `vatDirty=true`로 표시하여 헤더만 수정하는 저장에도 세 금액을 모두 PUT한다(`SlipDetailPage.tsx:425-486`, `1060-1077`). R18 경로만 이 보존 계약을 빠뜨렸다.

### 도달 결함 2 — 거래처 교체 시 새 거래처 ID·이름과 이전 거래처 코드가 한 헤더에 섞인다

도달 경로는 편집 화면에서 다른 거래처를 자동완성으로 선택한 뒤 저장하는 것이다.

- 선택 state에는 새 거래처의 `id`, `name`, `partnerCode`가 들어간다(`SlipFormPage.tsx:1072-1115`).
- R18 PUT builder는 `partnerId`와 `partnerName`만 전송하고 `partnerCode` 및 `businessNumber`는 전송하지 않는다(`SlipFormPage.tsx:198-225`, `1185-1194`).
- BE는 null인 헤더 필드를 새 거래처에서 재조회하지 않고 기존 값을 보존한다. 즉 새 `partnerId`·`partnerName`은 적용하지만 null `partnerCode`·`businessNumber`는 이전 값으로 남긴다(`Slip.java:790-833`).

기존 상세 편집은 `partnerId`, `partnerName`, `partnerCode`, `businessNumber`를 함께 보낸다(`SlipDetailPage.tsx:2389-2405`). R18 편집 경로에서는 정상적으로 선택 가능한 UI 동작만으로 거래처 식별자 혼재가 도달한다.

### 도달 결함 3 — 편집 화면의 여러 헤더 입력이 저장 성공처럼 보인 뒤 실제로는 보존되어 되돌아간다

R18은 출고창고·출고구분·기사명/연락처·배송주소·감리주소를 hydrate하고 모두 활성 입력으로 렌더한다(`SlipFormPage.tsx:734-754`, `1365-1413`, `1478-1603`). 그러나 편집 PUT은 `partnerId`, `partnerName`, `memo`, `lines`만 구성한다(`SlipFormPage.tsx:1185-1194`).

- `deliveryAddress`와 `supervisionAddress`는 BE PUT 계약에 있지만 R18 builder가 싣지 않는다.
- 출고창고·출고구분·기사 정보는 해당 PUT 계약 자체에 없다.
- 기존 메모를 빈 문자열로 지우면 builder가 null로 바꾸고, BE의 null=기존값 보존 규칙 때문에 삭제되지 않는다.

사용자는 이 입력들을 바꾸고 저장할 수 있고 mutation도 성공해 상세로 이동하지만, 해당 변경은 저장되지 않는다. 기존 값을 빈 값으로 덮는 경로는 확인되지 않았다. 반대로 누락 필드가 null로 전달되면 BE가 보존하므로, 화면에서 한 변경이 조용히 폐기되는 경로가 성립한다.

### 도달 결함 4 — 저장 직후 상세 왕복은 5분 동안 수정 전 캐시를 보여 줄 수 있다

정상 진입 경로인 상세 → `행 추가` → 편집 → 저장에서 먼저 상세 query `['slip', id]`가 캐시된다(`SlipDetailPage.tsx:1281-1285`). 전역 query의 `staleTime`은 5분이다(`App.tsx:18-28`). 편집 화면은 별도 키 `['slip', id, 'sales-edit']`로 조회하고, PUT 성공 시 상세 query를 갱신하거나 무효화하지 않은 채 곧바로 `navigate('/sales/{id}')`만 한다(`SlipFormPage.tsx:727-754`, `1185-1250`).

따라서 5분 안에 재마운트된 상세는 아직 fresh인 수정 전 캐시를 즉시 사용하고 기본 설정상 재조회하지 않는다. 상세에서 보이는 값이 서버 PUT 결과와 다를 수 있는 경로가 정상 왕복만으로 도달한다.

이 결함은 증거 무결성에도 직접 영향을 준다. 상세에서 편집으로 들어갔다가 저장 후 상세 화면을 확인하는 캡처는 query 무효화 또는 별도 GET 증거가 없으면 서버 저장값을 입증하지 못한다. 특히 도달 결함 1의 서버 금액 변경이 발생해도 화면은 수정 전 금액을 계속 보여 줄 수 있다.

### 확인된 비결함 경로

- **신규 복제 분기:** `/sales/new`에는 path `id`가 없고 `/sales/:id/edit`에는 있으므로, 편집 저장은 `updateSalesSlip(id, ...)` → `PUT /slips/{id}/sales`로 간다. R18 코드에서 편집이 `POST /slips`로 떨어지는 경로는 확인되지 않았다(`SlipFormPage.tsx:644-652`, `1185-1249`; `api/slip.ts:670-679`).
- **권한 3층:** FE 라우트는 `sales.slip.edit/update`, BE endpoint도 같은 page/action, auth catalog의 enum 및 V36 seed도 같은 키다. 권한이 없으면 `PermissionGuard`가 child를 렌더하지 않고 홈으로 전환한다(`routes/index.tsx:553-562`; `PermissionGuard.tsx:42-69`; `SalesSlipUpdateController.java:45-57`; `PageCode.java:181-188`; `V36__seed_sp_d6_6_slip_page_codes.sql`).
- **편집 가능 상태:** GET hydrate 후 DRAFT/SAVED가 아니면 상태값과 허용 상태를 이유로 표시하고 저장 UI를 렌더하지 않는다(`SlipFormPage.tsx:1326-1349`). URL 직접 진입도 이 분기에 도달한다. BE `Slip.requireEditable()`이 PUT 시점에도 다시 가드한다.
- **되돌림:** `CollaborativeSlipInput.tsx`는 `origin/main`과 diff가 0이고, `SlipDetailPage.tsx`는 `origin/main` 대비 `행 추가`의 alert를 `navigate('/sales/{id}/edit')`로 바꾼 1줄만 다르다. 따라서 R16의 상세 협업 빈행 강등·부활 사슬은 현재 diff로 재도달하지 않는다.
- **상세에서 라인 삭제 후 편집:** 삭제 mutation 성공 시 상세 query를 무효화하며, 편집은 별도 query key로 GET한다. 서버 DELETE 성공 뒤 편집으로 이동하면 삭제 전 라인을 로컬 hydrate하는 경로는 확인되지 않았다(`SlipDetailPage.tsx:1598-1604`; `SlipFormPage.tsx:727-754`).

### 도달 결함 5 — 기존 라인 비고가 hydrate되지 않아 저장 시 null로 교체된다

상세 응답과 BE 수정 계약은 라인 `note`를 지원한다(`api/slip.ts:54-74`; `SlipUpdateRequest.java:69-95`). 그러나 `LineDraft`에는 note 필드가 없고, R18 hydrate와 PUT builder도 note를 읽거나 보내지 않는다(`LineRow.tsx:59-110`; `SlipFormPage.tsx:165-225`). BE는 요청 라인으로 전체 교체하면서 새 `SlipLine`에 전달된 null note를 저장한다(`SalesSlipUpdateService.java:92-116`, `221-247`).

따라서 note가 있는 DRAFT/SAVED 라인은 R18 화면에서 다른 항목 하나만 수정하거나 무수정 저장해도 note를 잃는다. 현재 실 데이터에서 non-null note 건수는 slip API 503으로 계수하지 못했지만, 응답·수정 도메인이 허용하는 상태에 대한 직접 도달 경로는 성립한다.

### 도달 결함 6 — 편집 빈행에서 세트(BUNDLE)를 고르면 옵션 UI는 보이지만 PUT에는 옵션이 없다

품목 자동완성은 `BUNDLE`을 반환할 수 있고, 선택하면 `BundleOptionRow`가 렌더되어 세트 옵션을 편집하게 한다(`SlipFormPage.tsx:868-897`, `1017-1021`, `1289-1305`; mock catalog에도 `SET-HM2WAY` BUNDLE이 존재). 신규 POST mapper는 `setOptions`를 보내지만(`SlipFormPage.tsx:1223-1245`), R18 PUT mapper는 이를 보내지 않는다(`198-225`). 더구나 BE `SlipUpdateRequest.LineRequest`에도 `setOptions` 필드가 없다.

따라서 개발책임자 확정 사양의 trailing 빈행에서 세트 품목을 추가하는 정상 UI 경로가 열려 있으나, 사용자가 지정한 세트 옵션/구성품 확장 의미는 저장 계약까지 도달하지 않는다. 화면은 옵션을 받으면서 저장은 평면 라인으로 진행하는 불일치다.

## 실환경 접근 결과

- `POST http://localhost:8080/auth/login`의 `dev_manager` 인증은 성공했다.
- 인증 후 `GET /slips?...`는 게이트웨이에서 HTTP 503(Service Unavailable)을 반환했다. `/api/slips`, `/api/v1/slips` 변형도 유효한 slip 응답을 주지 않았다.
- 연결 가능한 in-app/Chrome 브라우저가 런타임에 없어 실 화면 조작은 수행하지 못했다.
- 제약에 따라 컨테이너 상태 변경/재기동이나 DB 직접 조회·쓰기로 우회하지 않았다.

따라서 실 데이터에 쓰기를 발생시키는 PUT 재현은 하지 않았고, 위 판정은 FE state → wire payload → BE DTO → 서비스/도메인 팩토리까지의 코드 경로 분석에 근거한다. 도달 결함 1·2·3·4는 현재 UI의 정상 조작만으로 분기가 완결된다.

## 이 라운드가 보지 않은 것

- 브라우저 부재와 slip API 503 때문에 실 데이터 화면의 클릭·저장 후 별도 GET 비교는 보지 않았다.
- 현재 실 데이터 중 line note 보유 건수와 BUNDLE 추가 대상 품목의 실 catalog 노출 건수는 계수하지 않았다.
- 견적·이동·분개는 재측정하지 않았다.
- 컨테이너 상태, DB row 및 금지된 `renderer-real-qa*.log`는 보거나 변경하지 않았다.
- 코드 수정 및 결함 수정안 구현은 범위 밖으로 두었다.

## 머지 권고

**머지 비권고.**

근거는 (1) 무수정 저장만으로 기존 VAT 포함 금액이 공급단가로 재해석되는 데이터 변경, (2) 거래처 교체 시 새 ID/이름과 이전 코드/사업자번호가 섞이는 헤더 불일치, (3) 활성 입력으로 받은 헤더 변경이 성공 응답 뒤 폐기되는 경로, (4) 저장 직후 상세가 수정 전 캐시를 보여 서버 결과와 증거를 가리는 경로가 모두 정상 사용자 흐름에서 도달하기 때문이다. 기존 판매전표에 품목을 추가할 경로를 복원한다는 방향 자체는 타당하지만, 현재 HEAD는 그 경로의 무수정 왕복 안전성과 저장 후 관찰 가능성을 보장하지 못한다.
