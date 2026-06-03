# Slice: supplier-profile(사업자 양식) 재게이트 (⑥ B/C #8)

> branch `feat/supplier-profile-regate` / 2026-06-04 / clients/desktop. **프로덕션 컴포넌트 무변경**(테스트 + mock).
> 사업자 양식 CRUD 7 TC 재게이트.

## 1. 근본원인

기존 격리(7 TC 중 2 실패):

- **TC-SP-1(seed 7 필드)**: 기대 레이블이 페이지 실제 렌더와 불일치. ProfileCard 의 InfoRow 레이블은
  `대표 성명`/`사업장 주소`(공백 포함)인데 테스트는 `대표자`/`사업장주소`. `상호`는 레이블이 아니라
  카드 제목=companyName **값**으로 렌더됨 → 4/7 만 매칭.
- **TC-SP-3(신규 추가 → list size 2)**: ① add 버튼 testid 불일치(`supplier-profile-add` vs 실제 `supplier-profile-add-btn`),
  ② 저장 버튼 locator `button:has-text("추가")` 가 모달 뒤의 "신규 추가" 버튼을 매칭 → 오버레이에 가려 **click timeout**,
  ③ in-process mock POST 가 echo 만 하고 목록에 미반영 → "size 2" 검증 불가(기존 assertion `pageText.length>50` 공허).
  ④ **mock POST/PUT 잠복 버그**: `JSON.parse(config.data)` — config.data 는 이미 객체(`[object Object]`)라 파싱 throw
  → 폼 정상 입력 후에도 저장 실패(`"[object Object]" is not valid JSON`). (기존엔 폼 미입력으로 미도달 → 잠복.)

## 2. 수정

- **mock(`mock.ts`)**: `mockSupplierProfileList` module-level stateful 목록(테스트별 fresh page → 재seed 1건).
  GET 목록/primary 가 등록분 반영, POST 가 실제 append → "size 2" 실검증 가능. **POST/PUT `parseMockBody(config)` 로 교정**(JSON.parse 잠복 버그 제거).
- **TC-SP-1**: 레이블을 실제 InfoRow 텍스트(`사업자등록번호`/`종사업장번호`/`대표 성명`/`사업장 주소`/`업태`/`종목`/`이메일`)로 정합. 상호는 companyName 값으로 별도 검증.
- **TC-SP-3**: `supplier-profile-add-btn` → 모달(role=dialog) → 필수필드 6개 testid(`supplier-field-*`) 입력 →
  `supplier-profile-save-btn` → **모달 닫힘(저장 성공) + 신규 사업자(큐에이테스트물류) & seed(삼한공조) 동시 목록 표시** strict 검증
  (공허 `length>50` 제거).

## 3. 검증

- supplier-profile **7/7 green** → testIgnore 해제 재게이트. desktop `tsc --noEmit` 0. 프로덕션 컴포넌트 무변경(mock+test).
- QA 캡처: `docs/qa/supplier-profile-and-grid-ux/TC-SP-{1..7}-*.png`.

## 4. Dual review 반영 (Claude QA + Codex gpt-5.5) — 7 TC 전부 strict 강화

QA·Codex 가 **동일하게** 기존 lenient 7 TC 의 silent-pass(`swapOccurred=true`/`saveOk||!btnExists`/`exceptionShown=true`)와
mark-primary echo 미반영을 지적 → 전부 실 동작 기반으로 강화(공허 제거):

- **QA P0 #1 (격리) — 무효 판정**: `mockSupplierProfileList` module 상태가 Vite 서버 싱글턴이라 TC 간 오염된다는 지적은 **전제 오류**.
  in-process mock 은 `client.ts` 의 **브라우저측 axios `config.adapter`** (서버 미들웨어 아님) → 테스트별 fresh context=fresh page=모듈 재평가로 재seed. CI workers=2 도 각 브라우저 프로세스 격리. 7/7 green 은 정상 격리.
- **QA P0 #2 / Codex — TC-SP-2 공허**: stateful PUT(목록 in-place 갱신) → **수정 주소 실제 카드 표시 strict** 검증으로 강화(silent-pass 제거).
- **QA P1 / Codex — mark-primary echo 미반영**: mark-primary 를 **목록 전체 isPrimary swap** stateful 로 → TC-SP-4 가 2번째 추가→기본전환→배지/버튼 swap(primary 배지 정확히 1건) strict 검증.
- **QA P1 / Codex — TC-SP-5 공허**: mark-primary/delete 버튼이 **non-primary 행에만** 렌더되는 실제 UI 발견 →
  TC-SP-5 를 "기본 사업자 삭제버튼 부재(UI 보호) + 보조 추가→삭제→목록 제거" 로 재정의(BE 409 SUPPLIER_PRIMARY_DELETE_FORBIDDEN 방어 동시). 제목/docstring 도 실제에 맞게 정정.
- **QA P1 — TC-SP-1 임계값**: ≥5 → **≥6**(항상 렌더되는 6 InfoRow 레이블 전부). 종사업장번호(seed null) 제외.
- (참고) Codex 는 fix 이전 스냅샷 리뷰 — 인용 라인(351-357/241-249/404-415/3104-3108)은 모두 강화 완료분.

## 5. 🔴 잠복 mock 버그 2건 발견·수정 (strict 테스트가 표면화)

- **POST/PUT `JSON.parse(config.data)`**: config.data 는 이미 객체(`[object Object]`) → 파싱 throw. `parseMockBody(config)` 로 교정. (기존엔 폼 미입력으로 미도달 잠복.)
- **DELETE `return null` ↔ 어댑터 미매칭 충돌**: `client.ts:48 if (mock !== null)` 가 null 을 "미매칭"으로 보고 **실 HTTP fallthrough → 네트워크 에러 → 페이지 블랭크**. 204 라도 null 금지 → `envelope({ deleted: true })` 로 교정. (삭제 경로가 실제로 처음 실행되며 표면화.)
