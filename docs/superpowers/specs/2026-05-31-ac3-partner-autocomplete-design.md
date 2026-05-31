# 슬라이스 AC-3 — 거래처 자동완성 (마스터데이터 자동완성 ③/3)

- **작성일**: 2026-05-31
- **상태**: 설계 확정 (개발책임자 승인 2026-05-31)
- **유형**: FE 단독 (design-system 신규 컴포넌트 + desktop SlipFormPage 배선)
- **선행**: AC-1 창고(#331)·AC-2 품목(#332). ProductAutocomplete(서버검색 async) 패턴 재사용.
- **이니셔티브**: 마스터데이터 자동완성(거래처/창고/품목) ③ — **트리오 마무리**.
- **관련 메모리**: [[feedback_uuid_no_user_visibility]], [[feedback_no_fake_data_ever]]

---

## 1. 배경 / 목표
SlipFormPage 거래처 필드는 **partnerCode 텍스트 입력 + "거래처 자동 채움" 버튼 → `GET /admin/partners/{code}` 정확매칭** → name/phone/address/representative fill. 정확 코드를 알아야 함.
→ **부분입력 서버검색 autocomplete**(`PartnerAutocomplete`): 거래처명·코드·사업자번호·전화 부분입력 → 후보 → 선택 → 거래처 정보 자동 채움.

백엔드 `GET /admin/partners/search?q=`(partnerCode/name/bizNo/phone LIKE, 페이지네이션) **기존재** → FE 전용(백엔드 무변경). AC-2 ProductAutocomplete(서버검색)와 동형.

## 2. 결정

| # | 결정 | 근거 |
|---|---|---|
| D-AC3-01 | **서버검색형 `PartnerAutocomplete`**(ProductAutocomplete 패턴: searchPartners 주입, debounce/per-instance seq/로딩·빈·에러/aria-label). | 거래처 다수 → 서버검색. AC-2 와 동형(트리오 일관). |
| D-AC3-02 | **검색 = `/admin/partners/search?q=`**(code/name/bizNo/phone). desktop `searchPartners(q)` 신설. 백엔드 무변경. | 사용자 요청(명·코드·정보) 정확 일치 엔드포인트 기존재. |
| D-AC3-03 | **선택 시 2단계 채움**: 검색 응답(PartnerSummaryResponse: code/name/bizNo/phone)으로 code/name/tel 즉시 fill + **address/representative 는 기존 detail fetch(`GET /admin/partners/{code}`) 재사용**으로 보강. 기존 "자동 채움" 버튼은 선택 시 자동 트리거(버튼 제거). | 검색 summary 에 address/representative 없음 → 기존 autofill 로직 재사용(중복 구현 회피). |
| D-AC3-04 | 적용 = **SlipFormPage 거래처 필드만**. partnerCode/name 표시(UUID 비공개). | AC-1/2 정합(1폼 스코프). 견적·주문 헤더 후속. |

### 제외
- D2 병합 / 견적·주문 등 다른 거래처 폼.
- 백엔드 변경(search·detail 기존재).

## 3. 변경 단위

### 3.1 design-system — 신규 `PartnerAutocomplete`
`clients/web/design-system/src/components/PartnerAutocomplete/`(ProductAutocomplete 포팅):
- **props**: `value: PartnerOption|null`, `onChange:(p:PartnerOption|null)=>void`, **`searchPartners:(q)=>Promise<PartnerOption[]>`**, `label?`/`ariaLabel?`(isCompact: label 빈 시 FormField 스킵+aria-label), `placeholder?`/`required?`/`error?`/`disabled?`/`minChars?`(기본1)/`debounceMs?`(250).
- **`PartnerOption`**: `{ partnerCode: string; name: string; bizNo?: string; phone?: string }`. export.
- **UX**(ProductAutocomplete 동형): 입력 debounce → searchPartners → 후보 listbox("거래처명 · partnerCode"(+bizNo)), 로딩/빈("검색 결과 없음")/에러, 키보드 ↑↓/Enter/클릭/blur, **per-instance seq stale 무시**, 선택 시 입력 name(또는 name·code) 표시. FormField/combobox 접근성. blur 미확정 시 더미 onChange 금지(AC-1/2 교훈).
- Storybook(mock async searchPartners: 검색/로딩/빈/에러/선택).
- `index.ts` export.

### 3.2 desktop — searchPartners + SlipFormPage
- **`searchPartners(q)`** api fn: `GET /admin/partners/search?q={q}&size=20` → `AdminPartnerListResponse.items`(PartnerSummaryResponse) → `PartnerOption[]`(partnerCode/name/bizNo/phone). 실패 시 빈 배열.
- **SlipFormPage**: 거래처 입력(partnerCode 텍스트 + 자동채움 버튼)을 `<PartnerAutocomplete searchPartners={...} value={...} onChange={...}>` 로 교체. onChange(partner):
  1. `setPartnerCode(partner.partnerCode)` + `setPartnerName(partner.name)` + `setCustomerTel(partner.phone ?? '')`.
  2. **기존 detail autofill 재사용**: `GET /admin/partners/{partnerCode}` 호출 → customerAddress/customerRepresentative(+name/phone 정합) fill. (기존 handlePartnerAutoFill 로직을 선택 시 자동 트리거; 수동 버튼 제거.)
  3. partner=null(선택 해제) 시 관련 필드 클리어 정책(기존 유지).
- mock.ts: `GET /admin/partners/search?q=` mock 핸들러(Playwright).
- **권한 확인(plan/QA)**: `/admin/partners/search`(+`/{code}`)가 전표 작성자(영업/회계) 권한으로 호출 가능한지 — 기존 자동채움이 `/admin/partners/{code}`로 동작했다면 동일 namespace 라 OK 추정, 실 QA 로 확정.

## 4. 흐름
```
SlipFormPage 거래처 → PartnerAutocomplete
  "삼한" 입력 → debounce → searchPartners → GET /admin/partners/search?q=삼한
  → 후보["삼한공조 · P-0001 · 123-45-67890", ...] → 선택
  → onChange(partner): partnerCode/partnerName/customerTel fill
     + GET /admin/partners/{code} → customerAddress/customerRepresentative fill
```

## 5. 테스트
- design-system 단위/스토리(ProductAutocomplete 동형: debounce/async/키보드/로딩·빈/stale/required).
- desktop typecheck/lint. Playwright(거래처 부분입력→후보→선택→code/name/tel/주소/대표 fill, mock search+detail).
- **Docker 실 QA**: 실 전표 작성 거래처 부분입력→실 검색 후보→선택→정보 채움 실 캡처([[feedback_no_fake_data_ever]]). `/admin/partners/search` 권한 실동작 확인.

## 6. 마이그레이션 / 배포
백엔드/Flyway 무관. design-system + desktop 빌드.

## 7. 미해결 / 후속
- **자동완성 트리오 완료 → 공용 async typeahead 추출**(ProductAutocomplete + PartnerAutocomplete 거의 동일 → 공통 base `AsyncAutocomplete<T>` 추출 강력 후보; WarehouseAutocomplete(sync)도 변형 통합 검토). 별도 리팩터 슬라이스.
- 견적/주문 헤더 등 다른 거래처 폼 autocomplete 전환.
