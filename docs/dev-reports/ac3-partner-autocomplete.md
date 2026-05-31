# 슬라이스 AC-3 — 거래처 자동완성 (dev-report)

- **작성일**: 2026-05-31
- **브랜치**: `feat/ac-3-partner-autocomplete`
- **spec**: `docs/superpowers/specs/2026-05-31-ac3-partner-autocomplete-design.md`
- **이니셔티브**: 마스터데이터 자동완성 ③/3 — **트리오 마무리**(AC-1 창고 #331, AC-2 품목 #332 후속).

## 1. 목표/배경
SlipFormPage 거래처 필드의 partnerCode 정확매칭+자동채움버튼 → **부분입력 서버검색 autocomplete**. 거래처명·코드·사업자번호·전화 부분입력 → 후보 → 선택 → 거래처 정보 자동 채움. 백엔드 `GET /admin/partners/search?q=`(code/name/bizNo/phone LIKE) 기존재 → FE 전용.

## 2. 결정 (DECISIONS D-AC3-01~04)
- D-AC3-01 서버검색형 PartnerAutocomplete(ProductAutocomplete 패턴).
- D-AC3-02 `/admin/partners/search?q=` 재사용, 백엔드 무변경.
- D-AC3-03 **2단계 채움**: 검색 응답(code/name/bizNo/phone)으로 즉시 fill + address/representative 는 기존 detail `GET /admin/partners/{code}` 재사용 보강(자동채움 버튼 → 선택 시 자동).
- D-AC3-04 SlipFormPage 거래처 필드만.

## 3. 변경 (커밋 `01fc6da0`)
- **design-system 신규** `PartnerAutocomplete`(ProductAutocomplete 포팅: debounce/per-instance seq/로딩·빈·에러 dropdown/isCompact aria-label/combobox/blur 게이트) + Storybook + export. `PartnerOption{partnerCode,name,bizNo?,phone?}`.
- **desktop** `partnerApi.searchPartners(q)`(`GET /admin/partners/search?q=&size=20` → items → PartnerOption) + SlipFormPage 거래처 입력 PartnerAutocomplete 교체(onChange→partnerCode/name/tel fill + detail fetch로 address/representative 보강, 수동 버튼 제거) + mock(search + {code} detail).
- **Playwright** `ac-3-partner-autocomplete`(부분입력→후보→선택→fill) **7/7 PASS**.

## 4. 함수 단위 문서
- `PartnerAutocomplete`: 입력 debounce → `searchPartners(q)` async → 후보("name · partnerCode") → `onChange(PartnerOption|null)`. per-instance useRef seq(stale 무시), blur 미확정 더미 onChange 금지.
- `searchPartners(q)`: `/admin/partners/search?q=&size=20` → items → PartnerOption[]. 실패 빈 배열.
- SlipFormPage onChange: 1단계 code/name/tel 즉시 + 2단계 `GET /admin/partners/{code}` → address/representative.

## 5. 테스트
- design-system typecheck 0 / lint 0 / build ✓ / Storybook 5종.
- desktop typecheck 0 / lint 0. **Playwright ac-3 7/7 PASS**(거래처 부분입력→후보→선택→fill).
- Docker 실 QA(머지 전): 실 전표 작성 거래처 부분입력→실 검색 후보→선택→정보 채움 실 캡처. `/admin/partners/search` 권한 실동작 확인([[feedback_no_fake_data_ever]]).

## 6. 배포 / 후속
- design-system + desktop 빌드(백엔드/Flyway 무관).
- **트리오 완료 → 공용 async typeahead 추출**(ProductAutocomplete + PartnerAutocomplete 거의 동일 → `AsyncAutocomplete<T>` 공통 base; WarehouseAutocomplete(sync) 변형 통합) 별도 리팩터 슬라이스.
- 견적/주문 헤더 등 다른 거래처 폼 autocomplete 전환.
