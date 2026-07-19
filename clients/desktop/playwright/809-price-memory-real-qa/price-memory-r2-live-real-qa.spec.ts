/**
 * #809 (거래처+품목) 최근단가 자동채움 — R5 CODEX SOL 5.6 QA fix 후 라이브 재검증 (R5-postfix, mock OFF).
 *
 * 대상: R4 적대검증 27건 fix 6개 배치(BE·DevOps·FE·Design·통합·sweep) 적용 워킹트리
 * (base 71a6f0412 — R3 fix 3커밋 위). 실 게이트웨이(:8080) → 재배포 slip-service(V58 적용 실측)
 * → 실 Postgres. 품목은 프로젝트 seeder가 만든 QA 모델을 실 서버·실 DB에서 조회해 사용한다.
 * 판정은 전부 실 GUI, DB 는 뒷받침 실측용이며, "합성 없음"·"운영 카탈로그" 주장은 하지 않는다.
 * (단 08 의 R4-F4 in-flight 관측 1곳만 실서버 응답을 그대로 전달하며 지연을 주입하고,
 *  11 은 정상 coedit 가 거래처 autocomplete 를 잠그는 현재 제약 때문에 초기 coedit GET 만 실패시켜
 *  앱 자체의 의도된 평문 폼 fallback 에 진입한다. 가격 조회/PUT 응답 내용 변조 없음. 각 주석 참조.)
 *
 * ⚠️ R2 의 "라이브 QA 7/7 PASS" 는 superseded — R3 QA(CB-3)가 스펙 자체의 false-green 을 적발했다.
 * (견적 저장 POST 가 500 이어도 통과 · 방금 만든 견적이 아니라 임의 기존 견적 조회 · 단가가 아니라
 *  productId 존재만 단언). 본 스펙은 R3 에서 경화됐고 R4 실행이 #809 의 첫 유효 라이브 증거다.
 *
 * ⚠️ 계정: `dev_master` 는 auth_db 상 "마스터" 권한그룹에 `sales.slip.create` 행이 없어
 * 전표 생성 자체가 403 이다(R1 INFO-1, #809 회귀 아님). 본 QA 는 `sales.slip.create` +
 * `purchases.slip.edit` 전권인 "매니저" 그룹 계정 `dev_manager` 로 수행한다.
 *
 * 픽스처 (R8-postfix 기준 — 프로젝트 seeder 생성 QA 모델, 파일 스코프 beforeAll 이 실 API 로 해석):
 *  - 거래처A 부산냉난방테크 (e8ae9c86-…-1f5a2bf31313) — 실 DB 생존 확인
 *  - 거래처B 전주에어시스템 (1021fcf7-…-6518ab4c27c9) — 실 DB 생존 확인
 *  - 품목X/Y/세트 = **seeder QA 품목의 실 DB 행**. id 만 고정하고 판매가·품목명은 `GET /api/products/{id}`
 *    응답에서 읽는다 → 카탈로그 가격이 바뀌어도 단언이 자동 정합.
 *    R8-postfix 실행 실측: X=PC1NWSK1NRR(인테리어핏 중형)/202,400 · Y=ACM-B102N(전력 분배기)/275,000 ·
 *    세트=AF17B6474GZS/1,813,000 (구성품 2종 AF17B6474GZN=head · AF17B6470DCX)
 *
 * ⚠️ **[R8-QA-7] 왜 바뀌었나 — 이 스펙은 R8 라운드에 통째로 죽어 있었다**:
 *  구 픽스처(AC200CNCDEH-77 / AC300CNCDEH-78 / QA797-SET-01)는 **합성 시드 품목**이었고
 *  스택 재시드로 **전량 소멸**했다(R8·R8-postfix 실측: id·model_code·model_name 어느 축으로도 0건).
 *  결과 = **0 passed / 10 failed / 9 did not run** — 01 이 실패하며 describe.serial 이 연쇄 skip 돼
 *  **19건의 계약이 2개 라운드 동안 라이브 검증되지 않았다**(코드 회귀 아님 · 순수 픽스처 소멸).
 *  처방 = 소멸한 구 seed UUID 의존 제거(현 seeder 모델 API 해석 + legacy 견적 자체 생성).
 *  seeder 계보 자체를 없애진 못했으며, 단언 강도는 일절 손대지 않았다.
 *  R8-postfix 재실행 결과: **19 passed / 0 failed**.
 *
 * 시나리오: A 견적 자동채움 · B BUNDLE_SET · C 거래처 변경 재조회(bulk 1회 + 배너 + 변경행 강조) ·
 *          D 최근가/판매가 마커 · E 수정경로 ×1.1 정규화 · F 전표 회귀 ·
 *          G 견적 거래처 변경(08) · H 견적 품목 교체 R4-F1(09) · I 거래처 미선택 카피 D4(a)(10)
 *
 * R4 강화(적대 검토 — 기존 단언 약화 없음, 추가만):
 *  - 01: miss 라인 '판매가' 마커 표시 + USER 전환 시 마커 소멸 (R3 fix 신규 UI —
 *        라벨은 D-R4-1 로 '정가'→'판매가' 확정 반영)
 *  - 05: 거래처 변경 창구간 POST /slips/price-memory/bulk 정확히 1건 · 단건 GET 0건 ·
 *        bulk body 에 자동채움 2라인(X,Y) 동시 적재 · 배너 표시 · 값 변경행(라인1)만 강조 (D-R3-2/D-R3-4)
 *  - 07: USER 라인 판매가 마커도 부재 확인
 *
 * R4-postfix 강화(R4-Q3 견적 커버리지 갭 해소 — 기존 단언 약화 없음, 추가만):
 *  - 08 [G]: 견적 거래처 변경 → bulk 정확히 1건 + 배너 + 변경행(라인1)만 강조 + USER 라인 보존
 *            + R4-F4(재조회 in-flight 중 저장 disabled + '최근단가 확인 중…' busy 단서)
 *            + R4-D9/S-1(배너·busy live region 상시 마운트)
 *  - 09 [H]: 견적 품목 교체(R4-F1) — X(REMEMBERED hit) → Y 교체 시 Y 기준 재적용
 *            (X 의 단가·저장일 마커 승계 없음) → X 재교체 시 재hit · 저장 후 DB 오염 부재
 *  - 10 [I]: 거래처 미선택 상태 품목 선택(R4-D4(a)) — 카피가 거래처를 단정하지 않음
 *            ('판매가를 적용했습니다') + R4-D2(마커 aria-live 제거) + 사후 거래처 선택 시 hit 전환
 *  - ⚠️ D-R4-4(거래처 해제 → 단가 유지 + 마커만 해제)는 라이브 GUI 로 도달 불가 — 정직 미커버.
 *    PartnerAutocomplete(AsyncAutocomplete)에 해제 어포던스가 없다(빈 입력 blur = onChange 미호출,
 *    free-text = 기존 선택 유지, clear 버튼 없음). 해당 분기는 FE 단위테스트가 커버:
 *    SlipFormPage.test.tsx 'keeps the remembered unit price and only releases the marker …' ·
 *    LineRow.test.tsx 'REMEMBERED without a partner hides the marker …'.
 *
 * R5-postfix 신규 강화(기존 단언 삭제/약화 없음, R4 false-green 커버리지 구멍만 추가):
 *  - 11 [R5-H6]: 실제 legacy QUOTE_DRAFT 견적의 필수 거래처 재선택 → 가격 무수정 저장 →
 *                 PUT 2xx + priceVatInclusive=false + unit_price 불변 / unit_price_with_vat=NULL 유지 +
 *                 원 공급단가×1.1 기준 price-memory 생성(약 9.1% 하락 명시 배제) + 같은 라인
 *                 가격 실제 편집→원복 시 priceVatInclusive=true 역방향 provenance 가드
 *  - 12 [R5-H7]: 전표·견적 각각 신규 BUNDLE 저장 → 상세 재진입 무수정 PUT → 세트 계보 보존,
 *                 구성품 기억행 0, parent BUNDLE_SET 정확히 1행
 *  - 13 [R5-H8]: 모델 lookup 2xx 뒤 단건 price-memory 실응답만 지연 → 중간 저장 disabled /
 *                 0원 POST 없음 → 응답 뒤 정확한 기억단가 적용·저장
 *
 * R6-postfix 강화(2026-07-16, R6 FABLE5 적대 리뷰 fix — 기존 단언 약화 0, 아래 대응쌍 참조):
 *  - [R6-M9] 구성품 기억행 "전역 카운트" 단언(구 bundleComponentMemoryCount)이 공유 dev 스택의
 *    타 에이전트 동시 PUT 에 false-RED(12a 라이브 실측: 03:01:02 외부 PUT vs 03:01:04 자기 단언,
 *    격리 재실행 PASS = 교차 오염 확정). → 판정을 "자기 저장 창구간 delta" 로 좁힌다:
 *    저장 직전 full-content 스냅샷(단가·source·remembered_at·modified_at·is_deleted — 동일값
 *    upsert 재기록도 modified/remembered 변화로 포착) → 자기 저장 2xx + 자기 flush 신호
 *    (parent 기억행 poll) + afterCommit grace 후 스냅샷 equality. 자기 쌍에 대한 단언 강도는
 *    그대로 exact(≥0 류 완화 없음): 각 reset 직후 '' 구성 검증 + delta == 0. 창구간(수 초) 내
 *    외부 쓰기는 여전히 RED 지만 메시지의 스냅샷 diff(타임스탬프 포함)로 즉시 판별 가능 —
 *    이 스펙은 격리 스택을 전제하지 않는다.
 *  - [R6-L6] 11 의 census 고정 단언(toBe '1926')이 legacy 소진/증감에 영구 false-RED → "≥1 +
 *    동적 선택" 으로 교체(리뷰 처방). finally 는 estimates 헤더 row_to_json 전체 스냅샷 원복
 *    (partner_id/partner_business_no/partner_address/valid_until/memo/totals/version/modified_at/
 *    modified_by)과 활성 라인 값·audit 원복으로 확장 — 단 PUT 의 라인 replace 는 물리 DELETE+
 *    재생성(EstimateLine orphanRemoval, soft-delete 미발생 실코드 확인)이라 라인 row UUID churn
 *    은 원복 불가(값·audit 필드만 1:1 원복). estimate_revisions 의 EDIT 행은 감사 이력이라
 *    의도적으로 남긴다(감사 불변 원칙).
 *  - [G10] 02/03 의 responses.some(200) 경로 불특정 → 단건 GET /slips/price-memory +
 *    partnerId/productId 파라미터 + bulk 0건 + 비 2xx 0건까지 특정(기존 generic 단언은 유지).
 *  - [G6/R5-M4] 배너(role=status aria-live=polite 단일 live region)가 단건 lookup 고지
 *    '라인 N 판매가|거래처 최근단가 적용' 을 담는 계약 무단언 → 01/02/03 에 단언 + 문구 페이지
 *    유일성(이중 live region 부재) 단언. [R6-M5] 재조회 시 stale 고지 클리어 — 05/08 말미에
 *    "강조 해제(USER 입력) 후 배너가 빈 텍스트" 프로브 추가(전표=R6-M5 fix 검증, 견적=회귀 가드).
 *  - [G7/R5-M5] '단가 변경' 인디케이터 + aria-describedby 체인 무단언 → 05(전표 LineRow)/08(견적
 *    데스크톱 라인) 에 강조행 1행 한정 표시 + 단가 input aria-describedby → 실존 id → 텍스트 '단가 변경'
 *    + 페이지 내 유일성 단언.
 *  - [G8/R5-H2] 11 의 PUT body 단가 단언이 Number() 강제변환 → 문자열 canonical 형식(typeof
 *    string + /^\d+(\.\d+)?$/ + exact string) 단언 추가. 무수정 PUT = hydrate canonical
 *    String(Number(DB값)), 편집→원복 PUT = 입력 문자열 그대로(CollaborativeSlipInput type=text
 *    무가공 실코드 확인).
 *  - [G1/R6-H1] 신규 14a(전표·BE 실증 변형: 신규 동일 productId 라인 선순서 PUT)·14b(견적·QA P3
 *    변형: 세트 head 삭제 + 같은 품목 단품 가격 수정) — two-pass resolver 계약(1-패스 exact 전역
 *    선매칭 / head exact 전용 / 단품 오귀속 금지 / 사용자 단가 기억 반영) DB·기억행 단언.
 *    GUI 로는 라인 순서 제어·구성품 단품 바인딩(향후 lookup scope 봉쇄 시 소멸)이 불가/불안정해
 *    실 게이트웨이 raw API(PUT 계약 표면 그 자체)로 유발하고 판정은 실 DB + 실 GUI 재진입 캡처.
 *  - [R6-H2] 신규 15 — GUI '전표 복사' 1클릭이 서버측 복사(POST /slips/{id}/duplicate)로 세트
 *    계보 1:1 승계 + 복사 창구간 기억행 delta 0(구성품 각인·BUNDLE_SET 재기록 없음) + 평면
 *    POST /slips 0건 단언.
 *  - [R6-H3] 신규 16a/16b — 버전이력 스냅샷 계보 왕복: 전표/견적 EDIT 후 최초 revision 복원 →
 *    세트 계보 보존 + 복원·후속 무수정 PUT 전 구간 기억행 delta 0.
 *
 * 단계별 캡처 → docs/qa/809-partner-product-price-memory/r9-postfix/
 * (r2/·r4/·r4-postfix/·r5/·r5-postfix/·r6/·r6-postfix/·r8/ 는 전부 불가침 증거 보존 —
 *  R8 이력 디렉터리는 불가침으로 두고 R9 재검증분만 신규 r9-postfix/ 에 기록한다.)
 *
 * ⚠️ R6 커버리지 갭 중 본 라운드 정직 미커버(사유 박제):
 *  - G3(bulk 부분 실패 failedProductIds): 실서버 단일 트랜잭션에서 부분 실패를 자연 유발할 수
 *    없고 응답 변조는 가짜 데이터 금지 원칙 위배 — in-process FE mock suite 관할로 남긴다.
 *  - G4(재조회 in-flight 중 원격 coedit 개입): 2-세션 coedit + ms 단위 타이밍 경합 필요 —
 *    단일 세션 라이브 스펙으로 결정적 재현 불가(수동 2세션 spec: playwright/manual/ 참조).
 *  - G5(전표 폼 lookup→price 중간상태): 13 과 동일 hold 기법으로 재현 자체는 가능하나 R6 fix
 *    검증 필수 범위(H1~H3)에 집중 — 전표 측 저장차단은 lookupLoading→canSubmit FE 단위테스트가
 *    커버(SlipFormPage.test.tsx). 후속 라운드 승격 후보.
 *  - G9(coedit 원격 legacy 라인 provenance): 2-세션 필요 — G4 와 동일 사유. R5-H2 정규화 경계
 *    8종은 FE 단위테스트(EstimateFormPage.coedit.test.tsx) 커버.
 *  - R6-H3 의 collab 문서모드 복원 2경로: SSE/coedit 세션 구동이 필요해 본 스펙에서 미유발.
 *    단 스냅샷 record(toSnapshot/restoreFromSnapshot)는 버전이력 복원(16a/16b)과 동일 코드라
 *    record 차원 계보 왕복은 16 이 커버 — 경로 자체 미유발은 정직 기록.
 */
import { expect, test, type Page, type Request, type Response } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:5211'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ACCOUNT = 'dev_manager'
// R9 캡처는 신규 r9-postfix/ 에만 기록한다. r2/·r4/·r4-postfix/·r5/·r5-postfix/
// r6/·r6-postfix/·r8/·r8-postfix/·r8-postfix2/ 는 전부 불가침(덮어쓰기 금지).
// [R9 08-fix 재검증] r9-postfix/ 직하는 R9 fix 라운드 증거(87장)로 보존 — 08 GREEN 전환
// 재실행분은 r2-suite/ 하위로 분리해 덮어쓰기를 피한다(코디네이터 지시 경로).
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/809-partner-product-price-memory/r9-postfix/r2-suite')
fs.mkdirSync(SHOTS, { recursive: true })

const PARTNER_A = { name: '부산냉난방테크', query: '부산냉난방', id: 'e8ae9c86-afe1-3364-b484-1f5a2bf31313' }
const PARTNER_B = { name: '전주에어시스템', query: '전주에어', id: '1021fcf7-f63d-3fcd-9769-6518ab4c27c9' }
// D-R4-1: miss 자동채움 실체 = product.sellingPrice(제품 등록 화면 '판매가') — 구 상수명 listPrice
// 는 출고가 계열 별칭('정가')을 연상시켜 오도이므로 sellingPrice 로 정정(값 불변, R4-postfix).
//
// 🔴 [R8-QA-7 fix · 픽스처 자급] 이 상수들은 **beforeAll 이 실 카탈로그 API 로 채운다**.
// 종전엔 합성 시드 품목(AC200CNCDEH-77 / AC300CNCDEH-78 / QA797-SET-01)의 UUID·판매가를
// 하드코딩했는데, 스택 재시드로 그 품목이 **전량 소멸**해 R8 라운드에 이 스펙이 통째로 붕괴했다
// (0 passed / 10 failed / 9 did not run — 01 실패 → describe.serial 연쇄 skip).
// R8 실측: `products` 1116행 중 위 3종 **0건**(id·model_code·model_name 어느 축으로도 부재).
//
// 처방 = **소멸한 구 seed UUID 의존 제거**. 현 seeder QA 모델의 id는 핀하되,
// 가격·품목명은 `resolveFixtures()` 가 실 API 로 조회해 채운다:
//  - 존재 확인이 **beforeAll 에서 1회, 명시적 메시지로** 터진다(종전: totalElements=0 → 01 만
//    실패하고 나머지 9건은 조용히 skip → 원인 파악에 라운드 하나를 소모).
//  - 판매가/품목명을 **서버 응답에서 읽으므로** 카탈로그 가격이 바뀌어도 단언이 자동 정합된다
//    (종전: 하드코딩 판매가가 실제와 어긋나면 전 라인 false-RED).
// ⚠️ **단언 강도는 그대로다** — 픽스처 출처만 바뀌고 각 테스트의 검증 내용은 일절 손대지 않았다.
//
// 왜 테스트 내 '생성' 이 아니라 seeder 모델 고정인가: 세트(BUNDLE)는 `bundle_component` 링크가 있어야
// 전개되는데 그 링크는 시트동기화/이카운트 임포트 경로 산물이라 `POST /products` 공개 API 로
// 만들 수 없다(`CreateProductRequest` 에 구성품 배열이 없음). 반면 실 카탈로그에는 전개가
// seeder가 만든 실 DB 세트 행이 있다. 즉 서버·DB는 실제이지만 품목 출처는 seeder이다.
// [R8-postfix2] 스택 재시드로 구 픽스처(PC1NWSK1NRR / ACM-B102N / AF17B6474GZS)가 소멸 →
// 현 실재 카탈로그로 재-핀(2026-07-16 실측: /slips/lookup-product·/api/products 조회 성공).
// resolveFixtures 가 name·sellingPrice 를 API 로 채우므로 id·model 만 갱신한다.
const PRODUCT_X = { model: 'AC100CNCDEH-76', name: '', sellingPrice: '', id: '508ffc15-4ebe-363e-a395-389ba0d6b6a7' }
const PRODUCT_Y = { model: 'AC400CNCDEH-79', name: '', sellingPrice: '', id: 'e47852ff-2ea7-39e4-90d3-1cc0ea6ebfa1' }
/** 실 카탈로그 세트 — bundle_component 2종(기본)이 전개된다. R8 적대 스펙과 동일 세트. */
const BUNDLE = { model: 'QA797-SET-01', sellingPrice: '', id: '1ea24f99-631f-4e19-937f-be1901284769' }
/** 세트 전개 구성품 — [0] = head(PART-01, display_order 1), [1] = 구성품(PART-02). 순서 계약은 2179 가 의존한다. */
const BUNDLE_COMPONENT_IDS = [
  '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9', // QA797-PART-01 (head · display_order 1 · set_head=true)
  'ed278526-0e16-427d-8a92-2ca06164254a', // QA797-PART-02 (display_order 2 · set_head=false)
]

/** 라운드 고유값 — 판매가/직전 라운드 값과 명백히 구분되는 단가. */
const PRICE_P = '888000' // A: 거래처A+품목X 기억단가
const PRICE_B = '555000' // C: 거래처B+품목X 기억단가(재조회 대상)
const PRICE_BUNDLE = '1100000' // B: 세트 저장단가
const PRICE_USER_LINE = '111111' // C: 사용자 직접입력(보존 대상)
const EDIT_Q_EXCL_VAT = '500000' // E: 수정화면 VAT 제외 입력
const EDIT_Q_INCL_VAT = '550000' // E: 기대 정규화값(×1.1)

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

interface NetLog { calls: string[]; responses: string[]; bulkBodies: string[] }

/** price-memory 호출/응답을 실제로 관측한다(경로 렌더 ≠ 기능 동작 구분용). bulk 는 body 도 기록. */
function trackPriceMemory(page: Page): NetLog {
  const log: NetLog = { calls: [], responses: [], bulkBodies: [] }
  page.on('request', (req) => {
    if (req.url().includes('/slips/price-memory')) {
      log.calls.push(`${req.method()} ${req.url()}`)
      if (req.url().includes('/slips/price-memory/bulk')) log.bulkBodies.push(req.postData() ?? '')
    }
  })
  page.on('response', (res) => {
    if (res.url().includes('/slips/price-memory')) {
      log.responses.push(`${res.status()} ${res.request().method()} ${res.url()}`)
    }
  })
  return log
}

/** 로그인 + 렌더러 auth 스텁 설치. [R6] raw API 시나리오(14~16)용으로 LoginResult 를 반환한다. */
async function login(page: Page): Promise<LoginResult> {
  const l = await realLogin(page, ACCOUNT)
  await installAuthStub(page, l)
  return l
}

/** [R6] 실 게이트웨이 raw API 호출 헤더 — 앱과 동일하게 Bearer 토큰만 싣는다(X-User-* 는 게이트웨이 권위 주입). */
function authHeaders(auth: LoginResult): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
}

/** [R6] raw API GET — 실 게이트웨이 경유, 2xx 강제 + envelope data 반환. */
async function apiGet<T>(page: Page, auth: LoginResult, apiPath: string): Promise<T> {
  const res = await page.request.get(`${API_BASE}${apiPath}`, { headers: authHeaders(auth) })
  expect(res.ok(), `GET ${apiPath} 실패: HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy()
  return ((await res.json()) as { data: T }).data
}

/** [R6] raw API POST — 실 게이트웨이 경유, 2xx 강제 + envelope data 반환. */
async function apiPost<T>(page: Page, auth: LoginResult, apiPath: string, body?: unknown): Promise<T> {
  const res = await page.request.post(`${API_BASE}${apiPath}`, {
    headers: authHeaders(auth),
    ...(body === undefined ? {} : { data: body }),
  })
  expect(res.ok(), `POST ${apiPath} 실패: HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy()
  return ((await res.json()) as { data: T }).data
}

/**
 * [R6] raw API PUT — 실 게이트웨이 경유, 2xx 강제 + envelope data 반환.
 *
 * <p>[D-R8-9] 이 헬퍼의 호출처는 전부 전표/견적 수정이며 <b>정상 최신 클라이언트</b>를 흉내낸다.
 * 따라서 lineId 계약 마커를 여기서 얹는다 — 프로덕션 api 함수(`withLineIdContract`)가 저장
 * 길목에서 스탬프하는 것과 같은 구조다. 마커가 없으면 BE 가 구 클라이언트로 판정해 400 을 낸다.
 *
 * <p>⚠️ 구 클라이언트를 <b>의도적으로</b> 재현하는 적대 케이스(R8-QA-1)는 이 헬퍼를 쓰지 않고
 * `page.request.put` 을 직접 호출한다 — 마커를 얹지 않는 것이 그 케이스의 핵심이기 때문이다.
 */
async function apiPut<T>(page: Page, auth: LoginResult, apiPath: string, body: unknown): Promise<T> {
  const data = body != null && typeof body === 'object' && !Array.isArray(body)
    ? { ...(body as Record<string, unknown>), lineIdContract: true }
    : body
  const res = await page.request.put(`${API_BASE}${apiPath}`, { headers: authHeaders(auth), data })
  expect(res.ok(), `PUT ${apiPath} 실패: HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy()
  return ((await res.json()) as { data: T }).data
}

async function openSlipForm(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/sales/new`)
  await expect(page.getByRole('combobox', { name: '거래처' })).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(400)
}

/**
 * 자동완성 실 후보만 매칭한다.
 *
 * ⚠️ AsyncAutocomplete 의 "검색 중…" 로딩행도 `role="option"` 이라(`statusRow`, id 없음)
 * `getByRole('option').first()` 로 기다리면 로딩행에 걸려 결과 도착 전에 키를 눌러
 * 선택이 무효화된다(드롭다운 열린 채 잔류). 실 후보는 `id="${listId}-opt-${idx}"`
 * (index 기반 opaque id — #825 슬3에서 도메인 키 노출 제거) 를 가지므로
 * id 접두사로 좁혀 "결과 도착" 을 실제로 기다린다.
 */
const realOptions = (page: Page, listboxLabel: string, idPrefix = 'ds-aac-list-') =>
  page.getByRole('listbox', { name: listboxLabel }).first().locator(`li[id^="${idPrefix}"]`)

/**
 * 자동완성 선택(실 키보드 조작 — ArrowDown+Enter).
 * portal floating layer 라 마우스 클릭이 viewport 밖으로 나가는 함정을 키보드 확정으로 회피.
 */
async function pickAutocomplete(page: Page, name: string, listboxLabel: string, query: string): Promise<void> {
  const input = page.getByRole('combobox', { name })
  await input.scrollIntoViewIfNeeded()
  await input.click()
  await input.fill(query)
  const options = realOptions(page, listboxLabel)
  await expect(options.first(), `자동완성 후보 미표시: ${name} / ${query}`).toBeVisible({ timeout: 20000 })
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(options.first(), `자동완성 확정 실패(드롭다운 잔류): ${name} / ${query}`).toBeHidden({ timeout: 10000 })
  await page.waitForTimeout(300)
}

async function pickWarehouse(page: Page): Promise<void> {
  const input = page.getByRole('combobox', { name: '출고 창고' })
  await input.scrollIntoViewIfNeeded()
  await input.click()
  // 창고는 정적 목록(AsyncAutocomplete 아님) — listId 접두사가 `ds-wh-list-` 이고 로딩행이 없다.
  const options = realOptions(page, '창고 목록', 'ds-wh-list-')
  await expect(options.first(), '창고 후보 미표시').toBeVisible({ timeout: 20000 })
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(options.first(), '창고 확정 실패(드롭다운 잔류)').toBeHidden({ timeout: 10000 })
  await page.waitForTimeout(200)
}

const unitPriceInput = (page: Page, line = 1) => page.getByLabel(`라인 ${line} 단가`)

/** 단가 실측값 — 천단위 콤마만 제거한다. 부호와 소수점은 값의 일부로 보존한다. */
async function expectUnitPriceDigits(page: Page, expected: string, line = 1, msg = ''): Promise<void> {
  await expect
    .poll(async () => {
      const normalized = ((await unitPriceInput(page, line).inputValue()) || '').trim().replace(/,/g, '')
      return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN
    }, {
      timeout: 15000,
      message: `${msg || '단가 자동채움'} 기대값 ${expected}`,
    })
    .toBe(Number(expected))
}

/**
 * 실 Postgres 조회(검증 전용).
 *
 * ⚠️ [R6] PG boolean 렌더 이원성 — 기대 리터럴 작성 시 캐스트 유무를 반드시 구분할 것:
 * - `boolean::text` 캐스트(SQL cast 함수 booltext) = **'true' / 'false'** ('t'/'f' 아님!)
 *   → set_head::text 류 파이프 조립 기대값은 'false|…' 형식 (라이브 psql `SELECT false::text` 실측).
 * - 캐스트 없는 raw boolean 출력(psql 클라이언트 boolout) = **'t' / 'f'**
 *   → `SELECT remembered_at > TIMESTAMP …` 처럼 boolean 식을 그대로 SELECT 하면 't' 렌더.
 * R6 14a/14b 가 'f|…' 기대로 false-RED 났던 근본원인. 헷갈리면 CASE WHEN b THEN 'true' ELSE 'false' END 로 명시.
 */
function psql(sql: string, db = 'slip_db'): string {
  return execSync(`docker exec samhan-postgres psql -U samhan -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  }).trim()
}

function memoryRow(partnerId: string, productId: string): string {
  return psql(
    `SELECT unit_price || '|' || source FROM partner_product_price_memory
     WHERE partner_id='${partnerId}' AND product_id='${productId}' AND is_deleted=false`.replace(/\s+/g, ' '),
  )
}

function resetMemoryPair(partnerId: string, productId: string): void {
  psql(
    `DELETE FROM partner_product_price_memory
     WHERE partner_id='${partnerId}' AND product_id='${productId}'`.replace(/\s+/g, ' '),
  )
}

function seedMemoryRow(partnerId: string, productId: string, unitPrice: string, source = 'LINE_SAVE'): void {
  resetMemoryPair(partnerId, productId)
  psql(
    `INSERT INTO partner_product_price_memory
       (id, partner_id, product_id, unit_price, source, remembered_at,
        created_at, created_by, is_deleted)
     VALUES
       (gen_random_uuid(), '${partnerId}', '${productId}', ${unitPrice}, '${source}',
        TIMESTAMP '2000-01-01 00:00:00', CURRENT_TIMESTAMP, 'qa-r4', FALSE)`.replace(/\s+/g, ' '),
  )
}

async function expectMemoryRowEventually(
  partnerId: string,
  productId: string,
  unitPrice: string,
  source = 'LINE_SAVE',
): Promise<void> {
  await expect.poll(
    () => memoryRow(partnerId, productId),
    {
      timeout: 5000,
      intervals: [25, 50, 100, 250, 500],
      message: `bounded async 가격기억 flush 미완료: partner=${partnerId}, product=${productId}, price=${unitPrice}`,
    },
  ).toBe(`${unitPrice}.00|${source}`)
}

async function saveEstimateDraftAndGetId(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && /\/estimates(\?|$)/.test(response.url()),
    { timeout: 30000 },
  )
  await page.getByRole('button', { name: '임시저장' }).click()
  const response = await responsePromise
  expect(response.ok(), `POST /estimates 저장 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const estimateId = body?.data?.id
  expect(estimateId, 'POST /estimates 2xx 응답에 신규 estimateId 누락').toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  return estimateId
}

/** 견적 신규 폼 열기 — 거래처 검색 combobox 가시화까지 대기(03/08/09/10 공용). */
async function openEstimateForm(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/sales/estimates/new`)
  await expect(page.getByRole('combobox', { name: '거래처 검색' })).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(400)
}

/** 견적 모델명 입력 + blur — onBlur lookup(자동채움 트리거) 경로(08/09/10 공용). */
async function fillEstimateModel(page: Page, line: number, model: string): Promise<void> {
  const input = page.getByLabel(`라인 ${line} 모델명`)
  await input.scrollIntoViewIfNeeded()
  await input.fill(model)
  await input.blur()
  await page.waitForTimeout(2000)
}

/**
 * 견적 데스크톱 변경행 강조 — 전표(LineRow priceRefreshed 클래스)와 달리 견적 데스크톱 라인은
 * inline style(background: var(--surface-selected) · border-left var(--action-brand))로 강조한다.
 * background 의 surface-selected 토큰 문자열은 priceRefreshChanged=true 행에만 존재한다(실 구현 대조).
 * data-price-source 는 라인 row div 에만 있어 qty/unit-price input 의 testid prefix 오탐을 배제한다.
 */
const estimateHighlightedRows = (page: Page) =>
  page.locator('[data-testid^="estimate-form-line-"][data-price-source][style*="surface-selected"]')

/** '거래처 최근단가' 마커 개수 — hit 라인에만 떠야 한다. */
const recentMarkers = (page: Page) => page.getByText('거래처 최근단가', { exact: true })

/**
 * '판매가' 마커 — miss 자동채움(CATALOG) 라인에만 떠야 한다(R3 fix 신규 UI).
 * D-R4-1(2026-07-15): 라벨 '정가' → '판매가' 확정(정가=출고가 계열 별칭 오도).
 * role=note + aria-label(설명 문구)로 좁혀 페이지 내 다른 '판매가' 문자열 오탐을 배제한다.
 * (본 스펙 시나리오는 모두 거래처 선택 상태 → 거래처 단정 카피가 정답.)
 */
const catalogMarkers = (page: Page) =>
  page.getByRole('note', { name: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다' })

/**
 * 거래처 미선택 CATALOG 마커 — R4-D4(a): 거래처를 선택하지 않고 품목만 고르면 카피가
 * 거래처를 단정하지 않아야 한다('판매가를 적용했습니다').
 * ⚠️ exact 필수 — 거래처 단정 카피('이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다')가
 * 이 문구를 부분 문자열로 포함하므로 substring 매칭이면 오탐된다.
 */
const catalogMarkersNoPartner = (page: Page) =>
  page.getByRole('note', { name: '판매가를 적용했습니다', exact: true })

async function saveSlipAndWait(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && /\/slips(\?|$)/.test(response.url()),
    { timeout: 30000 },
  )
  await page.getByRole('button', { name: '저장' }).click()
  const response = await responsePromise
  expect(response.ok(), `POST /slips 저장 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const slipId = body?.data?.id
  expect(slipId, 'POST /slips 2xx 응답에 신규 slipId 누락').toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  await page.waitForURL('**/sales', { timeout: 30000 })
  return slipId
}

interface LegacyEstimateTarget {
  id: string
  estimateNo: string
  status: string
  partnerName: string
  productId: string
  productName: string
  modelName: string
  quantity: number
  unitPrice: string
}

/**
 * [R8-QA-7 fix · 픽스처 자급] legacy 견적이 실 DB 에 없으면 **직접 만든다**.
 *
 * legacy 견적 = `partner_id IS NULL` + `unit_price_with_vat IS NULL` 인 견적 — partner_id 컬럼과
 * VAT 포함단가 provenance 가 도입되기 **이전**에 저장된 행의 형태다. R5 당시 1,926건이 있었으나
 * 스택 재시드로 **0건**이 됐고(R8 실측 · 본 라운드 재확인: `partner_id IS NULL` = 0 / 전체 11),
 * 그 결과 11 은 "시나리오 전제 소진" 으로 영구 RED 였다.
 *
 * 이 형태는 **실 API 로 직접 만들 수 없다** — 견적 생성 API 는 partnerId 를 요구하고
 * 저장 경로가 `unit_price_with_vat` 를 채운다. 그래서 **실 GUI 로 정상 견적을 만든 뒤**
 * 그 두 컬럼만 legacy 형태로 되돌린다. 합성 데이터가 아니라 **과거 스키마 상태의 재현**이며,
 * 값·구조는 전부 실 저장 경로가 만든 것이다.
 *
 * ⚠️ 이 함수는 **전제를 구성**할 뿐 단언을 완화하지 않는다 — 11 의 검증(공급단가 불변 ·
 * 9.1% 하락 배제 · provenance)은 그대로다.
 */
async function ensureLegacyEstimateFixture(page: Page): Promise<void> {
  const existing = Number(
    psql(
      `SELECT COUNT(*) FROM estimates e
       JOIN estimate_lines el ON el.estimate_id=e.id
       WHERE e.is_deleted=false AND el.is_deleted=false
         AND e.status IN ('QUOTE_DRAFT','QUOTE_SENT')
         AND e.partner_id IS NULL
         AND e.partner_name='${PARTNER_A.name}'
         AND el.unit_price_with_vat IS NULL
         AND (SELECT COUNT(*) FROM estimate_lines a WHERE a.estimate_id=e.id AND a.is_deleted=false)=1`
        .replace(/\s+/g, ' '),
    ),
  )
  if (existing >= 1) {
    console.log(`[#809 R8-QA-7] legacy 견적 픽스처 — 실 DB 에 ${existing}건 존재, 생성 생략`)
    return
  }

  // 실 GUI 로 거래처A + 품목X 단일라인 견적을 만든다(정상 저장 경로 — 값은 전부 실 산출물).
  // 앞선 테스트가 (A,X) 기억을 남겼으면 자동채움이 기억단가가 되어 픽스처 단가가 비결정적이다 —
  // 먼저 비워 miss(=판매가 채움)로 고정한다.
  resetMemoryPair(PARTNER_A.id, PRODUCT_X.id)
  await openEstimateForm(page)
  await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
  await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })
  await fillEstimateModel(page, 1, PRODUCT_X.model)
  await expectUnitPriceDigits(page, PRODUCT_X.sellingPrice, 1, 'legacy 픽스처 생성 — 판매가 채움')
  const estimateId = await saveEstimateDraftAndGetId(page)

  // legacy 화 — partner_id 와 unit_price_with_vat 를 컬럼 도입 이전 상태로 되돌린다.
  psql(`UPDATE estimates SET partner_id=NULL WHERE id='${estimateId}'`)
  psql(`UPDATE estimate_lines SET unit_price_with_vat=NULL WHERE estimate_id='${estimateId}'`)
  // 이 픽스처가 만든 기억행은 11 의 "사전 기억 부재" 전제를 오염시키므로 제거한다.
  resetMemoryPair(PARTNER_A.id, PRODUCT_X.id)

  const shape = psql(
    `SELECT e.status || '|' || COALESCE(e.partner_id::text,'NULL') || '|' || e.partner_name
            || '|' || COALESCE(el.unit_price_with_vat::text,'NULL')
     FROM estimates e JOIN estimate_lines el ON el.estimate_id=e.id
     WHERE e.id='${estimateId}' AND el.is_deleted=false`.replace(/\s+/g, ' '),
  )
  expect(shape, '[R8-QA-7] legacy 견적 픽스처 형태 구성 실패').toBe(
    `QUOTE_DRAFT|NULL|${PARTNER_A.name}|NULL`,
  )
  console.log(`[#809 R8-QA-7] legacy 견적 픽스처 생성 — ${estimateId} (${shape})`)
}

/** 실 DB 의 편집 가능 legacy 견적 중 단일라인 1건을 동적으로 선택한다(합성/seed 없음). */
function findLegacyEstimateTarget(): LegacyEstimateTarget {
  const raw = psql(
    `SELECT row_to_json(target)::text FROM (
       SELECT e.id, e.estimate_no AS \"estimateNo\", e.status,
              e.partner_name AS \"partnerName\", el.product_id AS \"productId\",
               el.product_name AS \"productName\", el.model_name AS \"modelName\",
               el.quantity,
               el.unit_price::text AS \"unitPrice\"
       FROM estimates e
       JOIN estimate_lines el ON el.estimate_id=e.id
       WHERE e.is_deleted=false AND el.is_deleted=false
         AND e.status IN ('QUOTE_DRAFT','QUOTE_SENT')
         AND e.partner_id IS NULL
         AND e.partner_name='${PARTNER_A.name}'
         AND el.unit_price_with_vat IS NULL
         AND (SELECT COUNT(*) FROM estimate_lines active
              WHERE active.estimate_id=e.id AND active.is_deleted=false)=1
       ORDER BY e.created_at DESC
       LIMIT 1
     ) target`.replace(/\s+/g, ' '),
  )
  expect(raw, '실 DB 에 편집 가능한 단일라인 legacy 견적이 없음').not.toBe('')
  return JSON.parse(raw) as LegacyEstimateTarget
}

function estimatePriceSnapshot(estimateId: string): string {
  return psql(
    `SELECT string_agg(
       product_id::text || '|' || unit_price::text || '|' ||
       COALESCE(unit_price_with_vat::text, 'NULL'), ',' ORDER BY line_no)
     FROM estimate_lines
     WHERE estimate_id='${estimateId}' AND is_deleted=false`.replace(/\s+/g, ' '),
  )
}

/** 대상 품목의 가격기억 값/출처/시각/삭제상태 전체 스냅샷 — 행 추가·갱신·soft-delete 모두 감지. */
function memorySnapshotForProduct(productId: string): string {
  return psql(
    `SELECT COALESCE(string_agg(
       partner_id::text || '|' || unit_price::text || '|' || source || '|' ||
       remembered_at::text || '|' || is_deleted::text, ',' ORDER BY partner_id::text), '')
     FROM partner_product_price_memory
     WHERE product_id='${productId}'`.replace(/\s+/g, ' '),
  )
}

type BundleLineTable = 'slip_lines' | 'estimate_lines'

function bundleLineageSnapshot(table: BundleLineTable, ownerId: string): string {
  const ownerColumn = table === 'slip_lines' ? 'slip_id' : 'estimate_id'
  return psql(
    `SELECT COALESCE(string_agg(
       product_id::text || '|' || set_head::text || '|' || COALESCE(parent_set_model, 'NULL') || '|' ||
       unit_price::text || '|' || COALESCE(unit_price_with_vat::text, 'NULL'),
       ',' ORDER BY product_id::text), '')
     FROM ${table}
     WHERE ${ownerColumn}='${ownerId}' AND is_deleted=false`.replace(/\s+/g, ' '),
  )
}

function bundleLineageSummary(table: BundleLineTable, ownerId: string): string {
  const ownerColumn = table === 'slip_lines' ? 'slip_id' : 'estimate_id'
  return psql(
    `SELECT COUNT(*) || '|' || COUNT(*) FILTER (WHERE set_head) || '|' ||
            COUNT(*) FILTER (WHERE parent_set_model='${BUNDLE.model}') || '|' ||
            string_agg(product_id::text, ',' ORDER BY product_id::text)
     FROM ${table}
     WHERE ${ownerColumn}='${ownerId}' AND is_deleted=false`.replace(/\s+/g, ' '),
  )
}

function memoryRowCount(partnerId: string, productId: string): string {
  return psql(
    `SELECT COUNT(*) FROM partner_product_price_memory
     WHERE partner_id='${partnerId}' AND product_id='${productId}'`.replace(/\s+/g, ' '),
  )
}

/**
 * [R6-M9] afterCommit 기억 flush 상한 grace(ms). 자기 저장의 비동기 기억 배치는 parent 기억행
 * poll(양성 신호)로 완료를 확인하지만, 무수정 PUT 처럼 양성 신호가 없는 경로(M8: 편집 경로는
 * parent 재기록 없음)와 배치 내 후행 쓰기까지 관측 창에 포함하기 위해 2xx 이후 이 시간을 대기한
 * 뒤 delta 스냅샷을 닫는다(R5 poll 예산 5s 의 절반 — 실측 flush 는 수백 ms).
 */
const MEMORY_FLUSH_GRACE_MS = 2500

/**
 * [R6-M9] (거래처, 품목들) 기억행 full-content 스냅샷 — 값/출처/논리시각/수정시각/삭제 플래그를
 * 전부 담아 "동일 값 upsert 재기록"(modified_at/remembered_at 변동)까지 delta 로 잡는다.
 * 전역 카운트 단언 대체물: 자기 저장 창구간 before/after equality 로만 판정해 공유 dev 스택의
 * 타 트래픽(창구간 밖 기존/이후 행)에 면역이 된다. 자기 쌍 단언 강도는 exact 유지.
 */
function memoryPairsSnapshot(partnerId: string, productIds: string[]): string {
  return psql(
    `SELECT COALESCE(string_agg(
       product_id::text || '|' || unit_price::text || '|' || source || '|' ||
       remembered_at::text || '|' || COALESCE(modified_at::text, 'NULL') || '|' || is_deleted::text,
       ',' ORDER BY product_id::text), '')
     FROM partner_product_price_memory
     WHERE partner_id='${partnerId}'
       AND product_id IN (${productIds.map((id) => `'${id}'`).join(',')})`.replace(/\s+/g, ' '),
  )
}

/** [R6-M9] 세트 구성품 2종 쌍의 full-content 스냅샷 (구 bundleComponentMemoryCount 대체). */
function componentMemorySnapshot(partnerId: string): string {
  return memoryPairsSnapshot(partnerId, BUNDLE_COMPONENT_IDS)
}

/** [R6] SQL 리터럴 이스케이프 — row_to_json 스냅샷 원복용(NULL/불리언/숫자/문자열·따옴표 배증). */
function sqlLit(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

/** [R6-L6] legacy 견적 원상복구용 행 스냅샷 — 헤더 전체 + 활성 라인 전체(row_to_json). */
interface LegacyRowSnapshots {
  header: Record<string, unknown>
  line: Record<string, unknown>
}

function snapshotLegacyEstimateRows(estimateId: string): LegacyRowSnapshots {
  const header = JSON.parse(
    psql(`SELECT row_to_json(e)::text FROM estimates e WHERE e.id='${estimateId}'`),
  ) as Record<string, unknown>
  const line = JSON.parse(
    psql(
      `SELECT row_to_json(el)::text FROM estimate_lines el
       WHERE el.estimate_id='${estimateId}' AND el.is_deleted=false`.replace(/\s+/g, ' '),
    ),
  ) as Record<string, unknown>
  return { header, line }
}

/**
 * [R6-L6] legacy 견적 1:1 원복 — PUT 이 건드리는 헤더 필드 전량(partner_id/partner_name/
 * partner_business_no/partner_address/valid_until/memo/totals 3종/version/modified_at/modified_by)
 * 과 활성 라인의 값·audit 필드를 사전 스냅샷 값으로 되돌린다. 정확히 이 견적 1건 scope —
 * 테이블 전체 UPDATE/DELETE 없음. 라인 row 는 PUT replace(물리 DELETE+재생성, EstimateLine
 * orphanRemoval 실코드 확인)로 UUID 가 바뀌므로 "현재 활성 라인 행"에 원값을 복사하는 방식이며
 * row UUID churn 자체는 계약상 원복 불가(정직 한계). estimate_revisions 의 EDIT 행은 감사
 * 이력이라 의도적으로 보존한다.
 */
function restoreLegacyEstimateRows(snapshot: LegacyRowSnapshots): void {
  const h = snapshot.header
  const l = snapshot.line
  psql(
    `UPDATE estimates SET
       partner_id=${sqlLit(h['partner_id'])},
       partner_name=${sqlLit(h['partner_name'])},
       partner_business_no=${sqlLit(h['partner_business_no'])},
       partner_address=${sqlLit(h['partner_address'])},
       valid_until=${sqlLit(h['valid_until'])},
       memo=${sqlLit(h['memo'])},
       total_supply=${sqlLit(h['total_supply'])},
       total_vat=${sqlLit(h['total_vat'])},
       total_amount=${sqlLit(h['total_amount'])},
       version=${sqlLit(h['version'])},
       modified_at=${sqlLit(h['modified_at'])},
       modified_by=${sqlLit(h['modified_by'])}
     WHERE id=${sqlLit(h['id'])}`.replace(/\s+/g, ' '),
  )
  psql(
    `UPDATE estimate_lines SET
       product_id=${sqlLit(l['product_id'])},
       product_name=${sqlLit(l['product_name'])},
       model_name=${sqlLit(l['model_name'])},
       specification=${sqlLit(l['specification'])},
       quantity=${sqlLit(l['quantity'])},
       unit_price=${sqlLit(l['unit_price'])},
       unit_price_with_vat=${sqlLit(l['unit_price_with_vat'])},
       supply_amount=${sqlLit(l['supply_amount'])},
       vat_amount=${sqlLit(l['vat_amount'])},
       line_total=${sqlLit(l['line_total'])},
       note=${sqlLit(l['note'])},
       created_at=${sqlLit(l['created_at'])},
       created_by=${sqlLit(l['created_by'])},
       modified_at=${sqlLit(l['modified_at'])},
       modified_by=${sqlLit(l['modified_by'])}
     WHERE estimate_id=${sqlLit(h['id'])} AND is_deleted=false`.replace(/\s+/g, ' '),
  )
}

/**
 * [R8-QA-7 fix] 픽스처 자급 — 실 카탈로그 API 로 품목 3종을 해석해 상수를 채운다.
 *
 * 이 훅이 없으면 카탈로그가 바뀔 때마다 스펙이 **조용히** 무너진다(R8: 01 만 RED 로 보이고
 * 02~10 은 serial skip, 11~16b 는 제각각 실패 → 원인 규명에 라운드 하나 소모). 여기서 실패하면
 * **어느 품목이 왜 없는지**가 첫 줄에 찍힌다.
 *
 * 파일 스코프 훅이라 각 describe 의 beforeAll(기억행 초기화) 보다 **먼저** 돈다 —
 * 그 훅들이 `PRODUCT_X.id` 등을 읽으므로 순서가 계약이다.
 */
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    const auth = await realLogin(page, ACCOUNT)
    const resolve = async (fixture: { model: string; id: string; sellingPrice: string }, label: string) => {
      // 게이트웨이 경로는 `/api/products/**` (StripPrefix=1 → product-service `/products/**`).
      // 앱의 productApi.ts 와 동일 경로를 쓴다 — `/products` 직행은 게이트웨이가 404 로 막는다.
      const res = await page.request.get(`${API_BASE}/api/products/${fixture.id}`, { headers: authHeaders(auth) })
      expect(
        res.ok(),
        `[R8-QA-7] 픽스처 품목 소멸 — ${label} ${fixture.model} (${fixture.id}) 조회 실패 HTTP ${res.status()}. `
          + '실 카탈로그가 재시드된 경우 이 상수의 id/model 을 실재 품목으로 갱신하라 '
          + '(docker exec samhan-postgres psql -U samhan -d product_db -tAc "SELECT id, model_code, selling_price FROM products WHERE model_code=\'...\'").',
      ).toBeTruthy()
      const p = (await res.json()).data as { id: string; modelName?: string; name?: string; sellingPrice?: number | string }
      expect(p.id, `[R8-QA-7] ${label} id 불일치`).toBe(fixture.id)
      // 판매가·품목명은 **서버가 권위**다 — 하드코딩하면 카탈로그 가격 변경 시 전 라인 false-RED.
      fixture.sellingPrice = String(Number(p.sellingPrice ?? 0))
      expect(
        Number(fixture.sellingPrice),
        `[R8-QA-7] ${label} ${fixture.model} 판매가가 0 — miss 자동채움 단언이 무의미해진다`,
      ).toBeGreaterThan(0)
      return p
    }

    const x = await resolve(PRODUCT_X, '품목X')
    PRODUCT_X.name = x.name ?? ''
    const y = await resolve(PRODUCT_Y, '품목Y')
    PRODUCT_Y.name = y.name ?? ''
    await resolve(BUNDLE, '세트')

    // 픽스처 전제 — X 와 Y 의 판매가가 같으면 "교체 시 Y 기준 재적용"(09) 류 단언이 무력해진다.
    expect(
      PRODUCT_X.sellingPrice,
      '[R8-QA-7] 픽스처 전제 붕괴 — 품목X 와 품목Y 의 판매가가 동일해 교체 단언이 무의미',
    ).not.toBe(PRODUCT_Y.sellingPrice)
    // 라운드 고유 단가와 겹치면 "자동채움인지 사용자 입력인지" 구분이 사라진다.
    for (const [label, price] of [['X', PRODUCT_X.sellingPrice], ['Y', PRODUCT_Y.sellingPrice], ['세트', BUNDLE.sellingPrice]] as const) {
      expect(
        [PRICE_P, PRICE_B, PRICE_BUNDLE, PRICE_USER_LINE, EDIT_Q_EXCL_VAT, EDIT_Q_INCL_VAT],
        `[R8-QA-7] 픽스처 전제 붕괴 — ${label} 판매가(${price})가 라운드 고유 단가와 충돌해 판정 불가`,
      ).not.toContain(price)
    }

    // 세트 전개 구성품 2종 실재 확인 — 계보 단언(12a/14a/15/16)의 전제.
    for (const componentId of BUNDLE_COMPONENT_IDS) {
      const res = await page.request.get(`${API_BASE}/api/products/${componentId}`, { headers: authHeaders(auth) })
      expect(res.ok(), `[R8-QA-7] 세트 구성품 소멸 — ${componentId} HTTP ${res.status()}`).toBeTruthy()
    }

    console.log(
      `[#809 R8-QA-7] 픽스처 해석 완료 — X=${PRODUCT_X.model}/${PRODUCT_X.sellingPrice}(${PRODUCT_X.name})`
        + ` · Y=${PRODUCT_Y.model}/${PRODUCT_Y.sellingPrice}(${PRODUCT_Y.name})`
        + ` · 세트=${BUNDLE.model}/${BUNDLE.sellingPrice}`,
    )
  } finally {
    await ctx.close()
  }
})

test.describe.serial('#809 R4-postfix — R4 적대 fix 후 라이브 재검증', () => {
  test.beforeAll(async () => {
    // 재실행 안전성 — "최초 = miss" 를 실제로 만들기 위해 본 스펙이 쓰는 (거래처,품목) 쌍만
    // 좁혀서 정리한다. 무조건부 전체 삭제는 하지 않는다(무관 데이터 보존).
    // [R6-M9] 공유 dev 스택에서 delete↔count 사이 외부 동시 쓰기가 끼면 1회 판정은 false-RED —
    // "삭제 후 0" 수렴을 poll(재삭제 포함)로 확인한다(셋업 위생 검사, 제품 단언 아님).
    const partners = [PARTNER_A.id, PARTNER_B.id].map((i) => `'${i}'`).join(',')
    const products = [PRODUCT_X.id, PRODUCT_Y.id, BUNDLE.id, ...BUNDLE_COMPONENT_IDS]
      .map((i) => `'${i}'`)
      .join(',')
    await expect
      .poll(
        () => {
          psql(
            `DELETE FROM partner_product_price_memory
             WHERE partner_id IN (${partners}) AND product_id IN (${products})`.replace(/\s+/g, ' '),
          )
          return psql(
            `SELECT COUNT(*) FROM partner_product_price_memory
             WHERE partner_id IN (${partners}) AND product_id IN (${products})`.replace(/\s+/g, ' '),
          )
        },
        { timeout: 10000, intervals: [100, 250, 500, 1000], message: '테스트 대상 기억행 초기화 실패(재삭제 poll 미수렴)' },
      )
      .toBe('0')
    console.log('[#809 R4] 테스트 대상 쌍 초기화 — 잔여행: 0')
  })

  test('01 [F/D-miss] 전표 miss → 판매가 채움 · 최근가 마커 없음 → 단가 P 입력 → 저장 → DB 기억행 생성', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const net = trackPriceMemory(page)
    await login(page)
    resetMemoryPair(PARTNER_A.id, PRODUCT_X.id)

    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1000)

    // miss → 판매가 fallback + 마커 없음(D: miss 라인엔 최근가 마커가 뜨면 안 된다)
    await expectUnitPriceDigits(page, PRODUCT_X.sellingPrice, 1, 'miss 판매가 fallback')
    await expect(recentMarkers(page), 'miss 라인에 최근가 마커가 뜨면 안 됨').toHaveCount(0)
    // R3 fix 신규 UI: miss 라인엔 '판매가' 마커가 떠야 한다(자동채움 근거 노출, D-R4-1 라벨)
    const catalogMarker = catalogMarkers(page).first()
    await expect(catalogMarker, 'miss 라인에 판매가 마커 미표시(R3 fix 회귀)').toBeVisible({ timeout: 10000 })
    await expect(catalogMarker, '판매가 마커 라벨 불일치(D-R4-1)').toHaveText('판매가')
    // [G6/R5-M4] 단건 lookup 고지는 단일 배너 live region(role=status aria-live=polite) 1곳으로만.
    const slipBanner = page.getByTestId('slip-price-refresh-banner')
    await expect(slipBanner, '단건 lookup 고지가 배너 region 에 미표시(R5-M4 회귀)').toHaveText('라인 1 판매가 적용')
    await expect(slipBanner, '배너 region role=status 계약 회귀').toHaveAttribute('role', 'status')
    await expect(slipBanner, '배너 region aria-live=polite 계약 회귀').toHaveAttribute('aria-live', 'polite')
    await expect(
      page.getByText('라인 1 판매가 적용', { exact: true }),
      'lookup 고지 문구가 페이지에 1곳(단일 region)이 아님 — 이중 live region 의심(R5-M4 회귀)',
    ).toHaveCount(1)
    await capture(page, '01-slip-miss-sellingprice-filled-catalog-marker-no-recent-marker')

    await unitPriceInput(page).fill(PRICE_P)
    await page.getByLabel('라인 1 수량').fill('2')
    await expectUnitPriceDigits(page, PRICE_P)
    // 수동입력(USER 전환) 순간 판매가 마커는 사라져야 한다 — 근거 아닌 라벨 잔존 방지
    await expect(catalogMarkers(page), 'USER 전환 후에도 판매가 마커 잔존').toHaveCount(0)
    await capture(page, '02-slip-manual-price-888000-entered')

    await saveSlipAndWait(page)
    console.log('[#809 R4] 01 price-memory 호출:', JSON.stringify(net.responses))

    await expectMemoryRowEventually(PARTNER_A.id, PRODUCT_X.id, PRICE_P)
    const row = memoryRow(PARTNER_A.id, PRODUCT_X.id)
    console.log('[#809 R4] 01 DB 기억행 (A,X):', row)
    expect(row, 'DB 기억행 미생성 = WRITE 훅 죽음').toBe(`${PRICE_P}.00|LINE_SAVE`)
    await ctx.close()
  })

  test('02 [F/D-hit] 새 전표 — 거래처A+품목X → P 자동채움 + 최근가 마커 표시', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const net = trackPriceMemory(page)
    await login(page)
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P)

    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1200)

    await expectUnitPriceDigits(page, PRICE_P, 1, '기억단가 자동채움')
    // D: hit 라인에 최근가 마커 + tooltip(저장일)
    const marker = recentMarkers(page).first()
    await expect(marker, 'hit 라인에 최근가 마커 미표시').toBeVisible({ timeout: 10000 })
    const tooltip = await marker.getAttribute('title')
    console.log('[#809 R4] 02 최근가 tooltip:', tooltip)
    expect(tooltip, '거래처 최근단가 tooltip 에 저장일 누락').toMatch(
      /이 거래처에 마지막으로 저장된 단가 · \d{4}-\d{2}-\d{2} 저장/,
    )
    // [G6/R5-M4] hit 고지도 동일 단일 배너 region 으로.
    await expect(
      page.getByTestId('slip-price-refresh-banner'),
      'hit 고지가 배너 region 에 미표시(R5-M4 회귀)',
    ).toHaveText('라인 1 거래처 최근단가 적용')
    await expect(
      page.getByText('라인 1 거래처 최근단가 적용', { exact: true }),
      'hit 고지 문구가 페이지 1곳(단일 region)이 아님(R5-M4 회귀)',
    ).toHaveCount(1)
    await capture(page, '03-KEY-slip-autofill-888000-with-recent-marker')

    expect(net.responses.some((r) => r.startsWith('200')), 'price-memory 200 미관측').toBeTruthy()
    // [G10] "어떤 price-memory 200 이든" 통과하던 구멍 봉쇄 — 정확히 이 (A,X) 단건 GET 200 이어야 한다.
    const singleHitResponses = net.responses.filter(
      (r) =>
        r.startsWith('200 GET ')
        && r.includes('/slips/price-memory?')
        && !r.includes('/slips/price-memory/bulk')
        && r.includes(`partnerId=${PARTNER_A.id}`)
        && r.includes(`productId=${PRODUCT_X.id}`),
    )
    expect(singleHitResponses.length, '(A,X) 단건 price-memory GET 200 이 정확히 1건이 아님(G10)').toBe(1)
    expect(
      net.responses.filter((r) => r.includes('/slips/price-memory/bulk')).length,
      '단건 hit 시나리오에서 bulk 호출 발생(G10 — 경로 오배선 의심)',
    ).toBe(0)
    expect(
      net.responses.filter((r) => !/^2\d\d /.test(r)).length,
      '시나리오 창구간 price-memory 비 2xx 응답 발생(G10)',
    ).toBe(0)
    console.log('[#809 R4] 02 price-memory 응답:', JSON.stringify(net.responses))
    await ctx.close()
  })

  test('03 [A] 🔴 견적 — 모델명 blur → 품목명 채움 + 기억단가 자동채움 + productId 실려 200 → 임시저장', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const net = trackPriceMemory(page)
    await login(page)
    // 이 테스트가 직접 만든 sentinel row만 읽는다. 저장 훅이 죽으면 remembered_at이 2000년에 머문다.
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P)

    await page.goto(`${BASE_URL}/sales/estimates/new`)
    await expect(page.getByRole('combobox', { name: '거래처 검색' })).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(400)
    await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
    await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })

    // 견적은 모델명 onBlur lookup 경로 (R1: productId 누락 → 400 → 판매가 fallback + 품목명 공백)
    const model = page.getByLabel('라인 1 모델명')
    await model.scrollIntoViewIfNeeded()
    await model.fill(PRODUCT_X.model)
    await model.blur()
    await page.waitForTimeout(2500)

    // ⓐ 품목명 칸이 채워지는가 (계약 정합 증거)
    await expect(page.getByLabel('라인 1 품목명'), '품목명 미채움 = lookup 계약 불일치 잔존').toHaveValue(
      PRODUCT_X.name,
      { timeout: 10000 },
    )
    // ⓑ 단가 = 기억단가 P (판매가 아님)
    await expectUnitPriceDigits(page, PRICE_P, 1, '견적 기억단가 자동채움')
    // ⓒ price-memory 요청에 productId 가 실려 200
    console.log('[#809 R4] 03 견적 price-memory 요청:', JSON.stringify(net.calls))
    console.log('[#809 R4] 03 견적 price-memory 응답:', JSON.stringify(net.responses))
    expect(net.calls.some((u) => u.includes(`productId=${PRODUCT_X.id}`)), 'price-memory 요청에 productId 누락(R1 결함 잔존)').toBeTruthy()
    expect(net.responses.some((r) => r.startsWith('200')), 'price-memory 200 미관측').toBeTruthy()
    expect(net.responses.some((r) => r.startsWith('400')), 'price-memory 400 = R1 결함 잔존').toBeFalsy()
    // [G10 대칭] 견적 단건 lookup 도 (A,X) 파라미터 특정 단건 GET 200 정확히 1건 + bulk 0건.
    expect(
      net.responses.filter(
        (r) =>
          r.startsWith('200 GET ')
          && r.includes('/slips/price-memory?')
          && !r.includes('/slips/price-memory/bulk')
          && r.includes(`partnerId=${PARTNER_A.id}`)
          && r.includes(`productId=${PRODUCT_X.id}`),
      ).length,
      '견적 (A,X) 단건 price-memory GET 200 이 정확히 1건이 아님(G10 대칭)',
    ).toBe(1)
    expect(
      net.responses.filter((r) => r.includes('/slips/price-memory/bulk')).length,
      '견적 단건 lookup 시나리오에서 bulk 호출 발생(G10 대칭)',
    ).toBe(0)
    await expect(recentMarkers(page).first(), '견적 hit 라인 최근가 마커 미표시').toBeVisible({ timeout: 10000 })
    // [G6/R5-M4] 견적도 단일 배너 region(role=status) 1곳으로 고지.
    const estAnnounceBanner = page.getByTestId('estimate-price-refresh-banner')
    await expect(estAnnounceBanner, '견적 hit 고지가 배너 region 에 미표시(R5-M4 회귀)').toHaveText(
      '라인 1 거래처 최근단가 적용',
    )
    await expect(estAnnounceBanner, '견적 배너 role=status 계약 회귀').toHaveAttribute('role', 'status')
    await expect(estAnnounceBanner, '견적 배너 aria-live=polite 계약 회귀').toHaveAttribute('aria-live', 'polite')
    await expect(
      page.getByText('라인 1 거래처 최근단가 적용', { exact: true }),
      '견적 hit 고지 문구가 페이지 1곳(단일 region)이 아님(R5-M4 회귀)',
    ).toHaveCount(1)
    await capture(page, '04-KEY-estimate-autofill-888000-productname-filled-recent-marker')

    // ⓓ 임시저장이 실제로 되는가 (R1: POST /estimates 요청조차 안 나감)
    await page.getByLabel('라인 1 수량').fill('2')
    await page.waitForTimeout(300)
    const estimateId = await saveEstimateDraftAndGetId(page)
    console.log('[#809 R4] 03 POST /estimates 신규 ID:', estimateId)
    await capture(page, '05-estimate-saved-after-draft-save')

    // DB: 반드시 방금 2xx 응답에서 회수한 estimateId의 권위 VAT 포함 단가를 확인한다.
    const line = psql(
      `SELECT el.product_id || '|' || el.unit_price_with_vat FROM estimate_lines el
       JOIN estimates e ON e.id = el.estimate_id
       WHERE e.id='${estimateId}' AND el.product_id='${PRODUCT_X.id}'
         AND e.is_deleted=false AND el.is_deleted=false`.replace(/\s+/g, ' '),
    )
    console.log('[#809 R4] 03 DB 신규 견적라인 (product_id|unit_price_with_vat):', line)
    expect(line, '신규 견적 라인의 VAT 포함 단가가 P와 다름').toBe(`${PRODUCT_X.id}|${PRICE_P}.00`)
    await expect.poll(
      () => psql(
        `SELECT remembered_at > TIMESTAMP '2000-01-01 00:00:00'
         FROM partner_product_price_memory
         WHERE partner_id='${PARTNER_A.id}' AND product_id='${PRODUCT_X.id}'
           AND unit_price=${PRICE_P} AND source='LINE_SAVE' AND is_deleted=false`.replace(/\s+/g, ' '),
      ),
      {
        timeout: 5000,
        intervals: [25, 50, 100, 250, 500],
        message: '견적 저장 후 bounded async 가격기억 flush가 sentinel row를 갱신하지 않음',
      },
    ).toBe('t')
    expect(memoryRow(PARTNER_A.id, PRODUCT_X.id), '견적 저장 가격기억이 P와 다름')
      .toBe(`${PRICE_P}.00|LINE_SAVE`)
    await ctx.close()
  })

  test('04 [B] 🔴 BUNDLE 세트 — parent 만 BUNDLE_SET 기억 · 구성품 기억 금지 · 재선택 자동채움', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    resetMemoryPair(PARTNER_A.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_A.id, productId))
    // [R6-M9] 자기 reset 직후 구성 검증(ms 창) — 자기 쌍 단언 강도는 exact 유지.
    expect(componentMemorySnapshot(PARTNER_A.id), '자체 reset 직후 구성품 기억행 잔존').toBe('')

    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', BUNDLE.model)
    await page.waitForTimeout(1200)
    await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '세트 miss 판매가')
    await unitPriceInput(page).fill(PRICE_BUNDLE)
    await expectUnitPriceDigits(page, PRICE_BUNDLE)
    await capture(page, '06-bundle-set-price-1100000-entered')
    // [R6-M9] 구성품 오염 판정 = 전역 상태가 아니라 "자기 저장 창구간 delta". 저장 직전 스냅샷을
    // 닫고, 자기 flush 신호(parent 기억행) + afterCommit grace 후 equality 로 판정한다 —
    // 공유 dev 스택의 창구간 밖 타 트래픽에 면역(격리 가정 없음).
    const componentsBeforeSave = componentMemorySnapshot(PARTNER_A.id)
    await saveSlipAndWait(page)

    // 세트 parent = BUNDLE_SET 기억행 (자기 저장 배치의 flush 양성 신호를 겸한다)
    await expectMemoryRowEventually(PARTNER_A.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
    const parent = memoryRow(PARTNER_A.id, BUNDLE.id)
    console.log('[#809 R4] 04 DB 세트 parent 기억행:', parent)
    expect(parent, '세트 parent 기억행이 BUNDLE_SET 로 생성되지 않음').toBe(`${PRICE_BUNDLE}.00|BUNDLE_SET`)

    // 구성품 productId 로는 기억행 delta 가 없어야 한다(납품가 각인 방지) — 배치 내 후행 쓰기까지 grace.
    await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
    const componentsAfterSave = componentMemorySnapshot(PARTNER_A.id)
    console.log('[#809 R4] 04 구성품 기억 스냅샷 before/after:', componentsBeforeSave, '/', componentsAfterSave)
    expect(
      componentsAfterSave,
      '세트 저장 창구간에 구성품 기억행 생성/갱신 = 납품가 각인 방지 실패(delta 는 diff 참조)',
    ).toBe(componentsBeforeSave)

    // 같은 거래처에 세트 재선택 → 저장단가 자동채움
    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', BUNDLE.model)
    await page.waitForTimeout(1200)
    await expectUnitPriceDigits(page, PRICE_BUNDLE, 1, '세트 재선택 자동채움')
    await expect(recentMarkers(page).first(), '세트 hit 라인 최근가 마커 미표시').toBeVisible({ timeout: 10000 })
    await capture(page, '07-KEY-bundle-set-refill-1100000-bundle-set-source')
    await ctx.close()
  })

  test('05 [C] 🔴 거래처 변경 재조회 — bulk 1회(D-R3-4) · 배너+변경행 강조(D-R3-2) · 사용자 입력 보존', async ({ browser }) => {
    test.slow() // R4 강화: 사전 전표 저장 + 3라인 구성 + 네트워크/배너/강조 단언 — 기본 60s 한도 3배
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const net = trackPriceMemory(page)
    await login(page)
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P)
    resetMemoryPair(PARTNER_B.id, PRODUCT_X.id)
    // 라인3(자동채움 Y)은 (A,Y)/(B,Y) 모두 miss 여야 한다 — bulk 부분 hit 계약의 대조군
    resetMemoryPair(PARTNER_A.id, PRODUCT_Y.id)
    resetMemoryPair(PARTNER_B.id, PRODUCT_Y.id)

    // 사전: (거래처B, 품목X) 기억 = 555000 을 실 GUI 저장으로 만든다(격리 재확인 겸용)
    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_B.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1200)
    // 거래처별 격리 — B 는 A 의 888000 이 아니라 판매가여야 한다
    await expectUnitPriceDigits(page, PRODUCT_X.sellingPrice, 1, '거래처B 격리(판매가)')
    await capture(page, '08-partnerB-isolated-sellingprice-filled')
    await unitPriceInput(page).fill(PRICE_B)
    await saveSlipAndWait(page)
    await expectMemoryRowEventually(PARTNER_B.id, PRODUCT_X.id, PRICE_B)

    // 본 시나리오 — 거래처A 에서 시작
    await openSlipForm(page)
    // R4-D9/S-1(전표 측): 배너·busy live region 은 활성 전에도 DOM 에 상시 마운트(빈 텍스트)여야 한다
    const slipBanner = page.getByTestId('slip-price-refresh-banner')
    const slipBusy = page.getByTestId('slip-form-price-refresh-busy')
    await expect(slipBanner, '전표 배너 live region 이 비활성 시 미마운트(R4-D9 회귀)').toBeAttached()
    await expect(slipBanner, '전표 비활성 배너에 텍스트 잔존').toHaveText('')
    await expect(slipBusy, '전표 busy live region 이 비활성 시 미마운트(R4-D9/S-1 회귀)').toBeAttached()
    await expect(slipBusy, '전표 비활성 busy 단서에 텍스트 잔존').toHaveText('')
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1200)
    await expectUnitPriceDigits(page, PRICE_P, 1, '거래처A 기억단가')

    // 라인2 = 사용자 직접입력(보존 대상)
    await page.getByRole('button', { name: '+ 라인 추가' }).click()
    await page.waitForTimeout(400)
    await pickAutocomplete(page, '라인 2 품목', '품목 목록', PRODUCT_Y.model)
    await page.waitForTimeout(1000)
    await unitPriceInput(page, 2).fill(PRICE_USER_LINE)
    await expectUnitPriceDigits(page, PRICE_USER_LINE, 2, '라인2 사용자 입력')

    // 라인3 = 자동채움 두 번째 라인(Y, (A,Y) miss → 판매가) — bulk 가 자동 라인 N개를 1요청에 실어야 한다
    await page.getByRole('button', { name: '+ 라인 추가' }).click()
    await page.waitForTimeout(400)
    await pickAutocomplete(page, '라인 3 품목', '품목 목록', PRODUCT_Y.model)
    await page.waitForTimeout(1000)
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 3, '라인3 (A,Y) miss 판매가')
    await capture(page, '09-before-partner-change-A-hit-888000-user-111111-autoY-sellingprice')

    // 거래처를 B 로 변경 → 자동 라인(1·3)은 bulk 1회로 재조회, 라인2(USER)는 보존
    const callsBefore = net.calls.length
    const responsesBefore = net.responses.length
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_B.query)
    await page.waitForTimeout(2500)
    await expectUnitPriceDigits(page, PRICE_B, 1, '거래처 변경 후 B 기준 재조회')
    await expectUnitPriceDigits(page, PRICE_USER_LINE, 2, '사용자 입력 라인 보존')
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 3, '라인3 (B,Y) miss — 판매가 유지')

    // D-R3-4: 거래처 변경 창구간 네트워크 = bulk POST 정확히 1건 · 라인별 단건 GET 0건
    const windowCalls = net.calls.slice(callsBefore)
    const windowResponses = net.responses.slice(responsesBefore)
    console.log('[#809 R4] 05 거래처 변경 창구간 price-memory 호출:', JSON.stringify(windowCalls))
    console.log('[#809 R4] 05 거래처 변경 창구간 price-memory 응답:', JSON.stringify(windowResponses))
    const bulkCalls = windowCalls.filter((u) => u.includes('/slips/price-memory/bulk'))
    const singleCalls = windowCalls.filter((u) => !u.includes('/slips/price-memory/bulk'))
    expect(bulkCalls.length, '거래처 변경 시 bulk 호출이 정확히 1건이 아님(D-R3-4 회귀)').toBe(1)
    expect(singleCalls.length, '거래처 변경 시 라인별 단건 GET 발생(D-R3-4 회귀)').toBe(0)
    expect(
      windowResponses.some((r) => r.startsWith('200') && r.includes('/slips/price-memory/bulk')),
      'bulk 200 미관측',
    ).toBeTruthy()
    const bulkBody = JSON.parse(net.bulkBodies[net.bulkBodies.length - 1] ?? '{}') as {
      partnerId?: string
      productIds?: string[]
    }
    expect(bulkBody.partnerId, 'bulk 요청 partnerId 가 변경된 거래처B 가 아님').toBe(PARTNER_B.id)
    expect(
      [...(bulkBody.productIds ?? [])].sort(),
      'bulk productIds 에 자동채움 2라인(X,Y)이 한 요청으로 실리지 않음',
    ).toEqual([PRODUCT_X.id, PRODUCT_Y.id].sort())

    // D-R3-2: 배너 + 변경행 강조 — 값이 실제 바뀐 라인1만 강조돼야 한다
    const banner = page.getByRole('status').filter({ hasText: '거래처 변경으로 최근단가 재적용' })
    await expect(banner, '거래처 변경 배너 미표시(D-R3-2 회귀)').toBeVisible({ timeout: 10000 })
    const highlighted = page.locator('[data-line-number="1"][class*="priceRefreshed"]')
    await expect(highlighted, '변경행 강조가 정확히 1행(값 변경 라인)이 아님').toHaveCount(1)
    await expect(highlighted, '강조 행이 라인1이 아님').toHaveAttribute('data-line-number', '1')
    // [G7/R5-M5] '단가 변경' 인디케이터 + aria-describedby 체인 — 값이 실제 바뀐 라인1에만.
    const priceChangeIndicators = page.getByText('단가 변경', { exact: true })
    await expect(priceChangeIndicators, "'단가 변경' 인디케이터는 변경행 1곳에만 떠야 함(R5-M5 회귀)").toHaveCount(1)
    const slipPriceInput = highlighted.getByLabel('라인 1 단가')
    const slipDescribedBy = await slipPriceInput.getAttribute('aria-describedby')
    const slipDescriptionIds = slipDescribedBy?.split(/\s+/) ?? []
    expect(slipDescriptionIds, '단가 input aria-describedby 복수 IDREF 미배선(R5-M5 회귀)').toHaveLength(2)
    for (const id of slipDescriptionIds) {
      await expect(page.locator(`[id="${id}"]`), `aria-describedby 대상 id 실체 부재: ${id}`).toHaveCount(1)
    }
    await expect(page.locator(`[id="${slipDescriptionIds[1]}"]`), '변경상태 IDREF가 단가 변경을 가리키지 않음').toHaveText('단가 변경')
    // 마커 정합: 라인1=거래처 최근단가 · 라인3=판매가(D-R4-1) · 라인2(USER)=마커 없음
    await expect(recentMarkers(page), '최근가 마커는 라인1 1개여야 함').toHaveCount(1)
    await expect(catalogMarkers(page), '판매가 마커는 라인3 1개여야 함').toHaveCount(1)
    // R4-D2(전표 측): 마커의 라인별 aria-live 제거 — 전역 고지는 배너(role=status) 단독
    expect(await recentMarkers(page).first().getAttribute('aria-live'), '전표 마커에 aria-live 잔존(R4-D2 회귀)').toBeNull()
    await banner.scrollIntoViewIfNeeded()
    await capture(page, '10-KEY-partner-changed-to-B-refresh-banner-visible')
    await highlighted.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await capture(page, '11-KEY-partner-changed-bulk1-highlight-row1-555000-user-preserved-missY-sellingprice')
    // [R6-M5] 재조회 배너 해제 후 stale 단건 고지가 재낭독되면 안 된다 — 마지막 단건 고지는
    // '라인 3 판매가 적용'(라인3 품목 선택 시점). 라인1에 USER 입력을 넣어 강조/배너를 해제하면
    // 전표도 재조회 시점에 announcement 를 클리어했어야 하므로 배너는 빈 텍스트여야 한다.
    await unitPriceInput(page, 1).fill('444444')
    await expect(
      page.getByTestId('slip-price-refresh-banner'),
      '재조회 배너 해제 후 stale 단건 고지 재표출(R6-M5 잔존 — 전표 재조회가 announcement 미클리어)',
    ).toHaveText('', { timeout: 5000 })
    await ctx.close()
  })

  test('06 [E] 🟠 수정 경로 — 상세화면 단가(VAT제외) Q 수정 → ×1.1 정규화 기억 → 새 전표 자동채움', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    resetMemoryPair(PARTNER_A.id, PRODUCT_X.id)

    // 수정 대상 전표 생성(거래처A + 품목X)
    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1200)
    const slipId = await saveSlipAndWait(page)
    console.log('[#809 R4] 06 수정 대상 전표:', slipId)

    await page.goto(`${BASE_URL}/sales/${slipId}`)
    await page.getByTestId('sales-slip-edit-button').click()
    await expect(page.getByTestId('sales-slip-edit-modal')).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(800)

    // 이 화면은 VAT 제외 입력
    const priceCell = page.getByLabel('단가(VAT제외) 1')
    await priceCell.scrollIntoViewIfNeeded()
    await priceCell.fill(EDIT_Q_EXCL_VAT)
    await page.waitForTimeout(300)
    await capture(page, '12-slip-detail-edit-unit-price-500000-vat-excluded')
    const updateResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && response.url().includes(`/slips/${slipId}`),
      { timeout: 30000 },
    )
    await page.getByTestId('sales-slip-edit-save').click()
    const updateResponse = await updateResponsePromise
    expect(updateResponse.ok(), `PUT /slips/${slipId} 수정 실패: HTTP ${updateResponse.status()}`).toBeTruthy()

    // DB: ×1.1 정규화 확인
    await expectMemoryRowEventually(PARTNER_A.id, PRODUCT_X.id, EDIT_Q_INCL_VAT)
    const row = memoryRow(PARTNER_A.id, PRODUCT_X.id)
    console.log('[#809 R4] 06 수정 후 DB 기억행 (A,X):', row, `— 기대 ${EDIT_Q_INCL_VAT}.00`)
    expect(row, '수정경로 기억 미반영 또는 ×1.1 정규화 오류').toBe(`${EDIT_Q_INCL_VAT}.00|LINE_SAVE`)

    // 새 전표에서 VAT 포함 단가로 자동채움
    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1200)
    await expectUnitPriceDigits(page, EDIT_Q_INCL_VAT, 1, '수정경로 반영 자동채움')
    await capture(page, '13-KEY-new-slip-autofill-550000-after-edit-path')
    await ctx.close()
  })

  /**
   * F 회귀 — R1 fix 가 override 판정을 `shouldAutoFill = !unitPrice || unitPrice==='0'` 에서
   * `priceSource !== 'USER'` 기반으로 바꿨으므로(선입력 시 onUnitPriceChange 가 USER 각인)
   * 선입력 보존이 여전히 성립하는지 실 GUI 로 재확인한다.
   */
  test('07 [F] override 보존(선입력 우선) + upsert 단일행 갱신', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    // 사전 조건은 직전 테스트 산출물을 재사용하지 않고 이 테스트가 직접 만든다.
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, EDIT_Q_INCL_VAT)

    await openSlipForm(page)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
    await pickWarehouse(page)
    // 품목 선택 전에 단가를 먼저 입력 → USER 각인
    await unitPriceInput(page).fill('123456')
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT_X.model)
    await page.waitForTimeout(1500)

    // 기억단가(550000)도 판매가(1200000)도 아닌 사용자 선입력값이 보존돼야 한다
    await expectUnitPriceDigits(page, '123456', 1, 'override 보존')
    await expect(recentMarkers(page), 'USER 라인에 최근가 마커가 뜨면 안 됨').toHaveCount(0)
    await expect(catalogMarkers(page), 'USER 라인에 판매가 마커가 뜨면 안 됨').toHaveCount(0)
    await capture(page, '14-override-preserved-123456-no-marker')

    // upsert 단일행 — 저장해도 (A,X) 행은 1건이어야 한다
    await saveSlipAndWait(page)
    await expectMemoryRowEventually(PARTNER_A.id, PRODUCT_X.id, '123456')
    const rows = psql(
      `SELECT COUNT(*) FROM partner_product_price_memory
       WHERE partner_id='${PARTNER_A.id}' AND product_id='${PRODUCT_X.id}'`.replace(/\s+/g, ' '),
    )
    console.log('[#809 R4] 07 (A,X) 행 수(1 이어야 함):', rows, '· 값:', memoryRow(PARTNER_A.id, PRODUCT_X.id))
    expect(rows, 'upsert 인데 중복행 발생').toBe('1')
    expect(memoryRow(PARTNER_A.id, PRODUCT_X.id), '선입력 저장값 미반영').toBe('123456.00|LINE_SAVE')
    await ctx.close()
  })

  /**
   * G — R4-Q3 견적 커버리지 갭 해소. R4 까지 거래처 변경 재조회(bulk·배너·강조)는 전표로만
   * 실증됐다. R4-F1 이 견적 전용 결함이었던 만큼 견적 경로를 독립 실증한다.
   *
   * R4-F4 in-flight 관측: bulk 응답이 로컬에서 수십 ms 라 busy 상태가 실측 불가능하므로,
   * 이 테스트에 한해 bulk 요청을 실서버로 그대로 보내고 받은 실응답을 지연 후 전달한다
   * (route.fetch → 2.5s hold → fulfill(실응답)). 응답 내용 변조/합성 없음 — 가짜 데이터 아님,
   * 네트워크 지연만 재현. 라우트는 bulk 1개 URL 로만 좁힌다(real-qa 프록시 글롭 규칙).
   */
  test('08 [G] 🔴 견적 거래처 변경 — bulk 1건 · 배너 · 변경행 강조 · USER 보존 · R4-F4 busy/저장차단 · R4-D9 상시 마운트', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const net = trackPriceMemory(page)
    await login(page)
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P)
    seedMemoryRow(PARTNER_B.id, PRODUCT_X.id, PRICE_B)
    resetMemoryPair(PARTNER_A.id, PRODUCT_Y.id)
    resetMemoryPair(PARTNER_B.id, PRODUCT_Y.id)

    let delayBulk = false
    await page.route('**/slips/price-memory/bulk', async (route) => {
      const response = await route.fetch() // 실서버 실응답
      if (delayBulk) await new Promise((resolve) => setTimeout(resolve, 2500))
      await route.fulfill({ response })
    })

    await openEstimateForm(page)
    // R4-D9/S-1: 배너·busy live region 은 활성 전에도 DOM 에 상시 마운트(빈 텍스트)여야 한다
    const estBanner = page.getByTestId('estimate-price-refresh-banner')
    const estBusy = page.getByTestId('estimate-form-price-refresh-busy')
    const saveButton = page.getByTestId('estimate-form-save-button')
    await expect(estBanner, '배너 live region 이 비활성 시 미마운트(R4-D9 회귀)').toBeAttached()
    await expect(estBanner, '비활성 배너에 텍스트 잔존').toHaveText('')
    await expect(estBusy, 'busy live region 이 비활성 시 미마운트(R4-D9/S-1 회귀)').toBeAttached()
    await expect(estBusy, '비활성 busy 단서에 텍스트 잔존').toHaveText('')

    await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
    await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })

    // 라인1 = X 자동채움(A,X hit)
    await fillEstimateModel(page, 1, PRODUCT_X.model)
    await expectUnitPriceDigits(page, PRICE_P, 1, '견적 라인1 (A,X) 기억단가')
    // 라인2 = Y 자동채움 후 수동 덮어쓰기(USER 보존 대상)
    await page.getByTestId('estimate-form-add-line').click()
    await page.waitForTimeout(400)
    await fillEstimateModel(page, 2, PRODUCT_Y.model)
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 2, '견적 라인2 (A,Y) miss 판매가')
    await page.getByLabel('라인 2 단가').fill(PRICE_USER_LINE)
    await expectUnitPriceDigits(page, PRICE_USER_LINE, 2, '견적 라인2 사용자 입력')
    // 라인3 = Y 자동채움 유지((A,Y)/(B,Y) 모두 miss) — bulk 부분 hit 계약의 대조군
    await page.getByTestId('estimate-form-add-line').click()
    await page.waitForTimeout(400)
    await fillEstimateModel(page, 3, PRODUCT_Y.model)
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 3, '견적 라인3 (A,Y) miss 판매가')
    await capture(page, '15-estimate-3lines-A-888000-user-111111-autoY-sellingprice')

    // 거래처 B 로 변경 — bulk 지연 창에서 R4-F4(busy + 저장차단) 를 실측한다
    const callsBefore = net.calls.length
    const responsesBefore = net.responses.length
    delayBulk = true
    await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_B.query)
    await expect(estBusy, 'R4-F4 재조회 in-flight busy 단서 미표시').toHaveText('최근단가 확인 중…', { timeout: 4000 })
    await expect(saveButton, 'R4-F4 재조회 in-flight 중 저장 미차단').toBeDisabled()
    await estBusy.scrollIntoViewIfNeeded()
    await capture(page, '16-KEY-estimate-partner-change-inflight-busy-save-disabled')
    // 실응답 도착 후 busy 해제 + 저장 재활성 (busy 고착 = R4-F3 계열 회귀)
    await expect(estBusy, 'bulk 완료 후 busy 단서 잔존(고착)').toHaveText('', { timeout: 15000 })
    await expect(saveButton, 'bulk 완료 후 저장 버튼 미복구').toBeEnabled()
    delayBulk = false

    await expectUnitPriceDigits(page, PRICE_B, 1, '견적 거래처 변경 후 (B,X) 재조회')
    await expectUnitPriceDigits(page, PRICE_USER_LINE, 2, '견적 USER 라인 보존')
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 3, '견적 라인3 (B,Y) miss — 판매가 유지')

    // D-R3-4 대칭: 견적 거래처 변경 창구간에도 bulk 정확히 1건 · 라인별 단건 GET 0건
    const windowCalls = net.calls.slice(callsBefore)
    const windowResponses = net.responses.slice(responsesBefore)
    console.log('[#809 R4-postfix] 08 견적 거래처 변경 창구간 호출:', JSON.stringify(windowCalls))
    console.log('[#809 R4-postfix] 08 견적 거래처 변경 창구간 응답:', JSON.stringify(windowResponses))
    const bulkCalls = windowCalls.filter((u) => u.includes('/slips/price-memory/bulk'))
    const singleCalls = windowCalls.filter((u) => !u.includes('/slips/price-memory/bulk'))
    expect(bulkCalls.length, '견적 거래처 변경 시 bulk 호출이 정확히 1건이 아님').toBe(1)
    expect(singleCalls.length, '견적 거래처 변경 시 라인별 단건 GET 발생').toBe(0)
    expect(
      windowResponses.some((r) => r.startsWith('200') && r.includes('/slips/price-memory/bulk')),
      '견적 bulk 200 미관측',
    ).toBeTruthy()
    const bulkBody = JSON.parse(net.bulkBodies[net.bulkBodies.length - 1] ?? '{}') as {
      partnerId?: string
      productIds?: string[]
    }
    expect(bulkBody.partnerId, '견적 bulk 요청 partnerId 가 변경된 거래처B 가 아님').toBe(PARTNER_B.id)
    expect(
      [...(bulkBody.productIds ?? [])].sort(),
      '견적 bulk productIds 에 자동채움 2라인(X,Y)이 한 요청으로 실리지 않음',
    ).toEqual([PRODUCT_X.id, PRODUCT_Y.id].sort())

    // 배너 + 변경행 강조 — 값이 실제 바뀐 라인1(estimate-form-line-0)만
    // [R9 실측 확정] 견적 배너 카피가 마커별 카운트 요약형으로 업그레이드됨(EstimateFormPage:954-960
    // — remembered/catalog/unavailable 카운트 + 변경 N행 join). 본 시나리오 결정적 기대:
    // hit X 1건(최근단가) · miss Y 1건(판매가) · USER 라인 제외 · 실변경 = 라인1 뿐.
    await expect(estBanner, '견적 거래처 변경 배너 미표시').toHaveText(
      '거래처 변경 단가 확인 완료 · 최근단가 1건 · 판매가 1건 · 변경 1행',
    )
    const highlighted = estimateHighlightedRows(page)
    await expect(highlighted, '견적 변경행 강조가 정확히 1행이 아님').toHaveCount(1)
    await expect(highlighted, '견적 강조 행이 라인1이 아님').toHaveAttribute('data-testid', 'estimate-form-line-0')
    // [G7/R5-M5] 견적 데스크톱도 실제 단가 input의 가격출처 + 변경상태 IDREF 체인 — 변경행 1곳만.
    const estChangeIndicators = page.getByText('단가 변경', { exact: true })
    await expect(estChangeIndicators, "견적 '단가 변경' 인디케이터는 변경행 1곳에만(R5-M5 회귀)").toHaveCount(1)
    const estPriceInput = highlighted.getByLabel('라인 1 단가')
    const estDescribedBy = await estPriceInput.getAttribute('aria-describedby')
    const estDescriptionIds = estDescribedBy?.split(/\s+/).filter(Boolean) ?? []
    expect(estDescriptionIds, '견적 단가 input IDREF 체인 누락(R5-M5 회귀)').toHaveLength(2)
    for (const id of estDescriptionIds) {
      await expect(page.locator(`[id="${id}"]`), `견적 IDREF 대상 실체 부재: ${id}`).toHaveCount(1)
    }
    await expect(
      page.locator(`[id="${estDescriptionIds[1]}"]`),
      '견적 변경상태 IDREF 대상 인디케이터 실체 부재(체인 단절)',
    ).toHaveText('단가 변경')
    // 마커 정합: 라인1=거래처 최근단가 · 라인3=판매가 · 라인2(USER)=마커 없음
    await expect(recentMarkers(page), '견적 최근가 마커는 라인1 1개여야 함').toHaveCount(1)
    await expect(catalogMarkers(page), '견적 판매가 마커는 라인3 1개여야 함').toHaveCount(1)
    await estBanner.scrollIntoViewIfNeeded()
    await capture(page, '17-KEY-estimate-partner-changed-to-B-banner-highlight-row1-555000')
    // [R6-M5 대칭 가드 → R9 08-fix 계약으로 재정의] USER 단가 편집 시 견적도 모달처럼 **라인별**
    // 해제된다(updateLine:USER → 그 행의 outcome 만 제거 · EstimateFormPage:893-905, 파생 배너가
    // 잔여 자동행만 집계). 따라서 변경행 X(라인1) 편집 후 기대 = X 기여 소거(최근단가 항목 소멸·
    // 변경 0행) + 잔여 Y(판매가 1건) 현재상태 유지. 구 '' 기대는 one-shot 문자열 세만틱의 산물이며,
    // 가드의 본래 의도(stale 단건 고지 '라인 3 판매가 적용' 재표출 금지)는 exact 일치가 그대로 막는다.
    await page.getByLabel('라인 1 단가').fill('444444')
    await expect(
      estBanner,
      '견적 재조회 배너 라인별 해제 실패 — 편집행 기여가 남거나(최근단가/변경 1행 잔존) stale 단건 고지 재표출(R6-M5 회귀)',
    ).toHaveText('거래처 변경 단가 확인 완료 · 판매가 1건 · 변경 0행', { timeout: 5000 })
    await page.unroute('**/slips/price-memory/bulk')
    await ctx.close()
  })

  /**
   * H — R4-F1 실증. R4 적대검증이 적발한 견적 전용 데이터오염: X(REMEMBERED hit) 상태에서
   * 모델명을 Y 로 교체하면 X 의 단가·마커가 Y 라인에 승계됐다(마커 거짓 + 저장 시 (A,Y) 오염).
   * fix 후 기대: 교체 시 Y 기준 재채움(전표와 대칭 — 공유 헬퍼 shouldAutoFillPrice).
   */
  test('09 [H] 🔴 견적 품목 교체(R4-F1) — X hit → Y 교체 시 Y 기준 재적용(승계 없음) → X 재hit → 저장 DB 오염 부재', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P) // remembered_at=2000-01-01 sentinel
    resetMemoryPair(PARTNER_A.id, PRODUCT_Y.id)

    await openEstimateForm(page)
    await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
    await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })

    // 1) X hit — 888000 + 최근단가 마커(저장일 = seed sentinel 2000-01-01)
    await fillEstimateModel(page, 1, PRODUCT_X.model)
    await expect(page.getByLabel('라인 1 품목명')).toHaveValue(PRODUCT_X.name, { timeout: 10000 })
    await expectUnitPriceDigits(page, PRICE_P, 1, 'X hit 기억단가')
    const lineRow = page.getByTestId('estimate-form-line-0')
    await expect(lineRow, 'X hit 라인 priceSource 상태 불일치').toHaveAttribute('data-price-source', 'REMEMBERED')
    const hitMarker = recentMarkers(page).first()
    await expect(hitMarker, 'X hit 최근가 마커 미표시').toBeVisible({ timeout: 10000 })
    expect(await hitMarker.getAttribute('title'), 'X hit tooltip 저장일이 seed sentinel 이 아님').toBe(
      '이 거래처에 마지막으로 저장된 단가 · 2000-01-01 저장',
    )
    await capture(page, '18-estimate-line1-x-hit-888000-remembered-2000-01-01')

    // 2) 모델 X → Y 교체 — Y 기준 재적용((A,Y) miss → Y 판매가 + 판매가 마커).
    //    X 의 888000/최근단가 마커/저장일이 하나라도 남으면 R4-F1 잔존이다.
    await fillEstimateModel(page, 1, PRODUCT_Y.model)
    await expect(page.getByLabel('라인 1 품목명'), 'Y 교체 후 품목명 미갱신').toHaveValue(PRODUCT_Y.name, { timeout: 10000 })
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 1, 'R4-F1 교체 후 Y 판매가 재적용')
    await expect(lineRow, 'Y 교체 후 priceSource 가 CATALOG 로 재판정되지 않음(R4-F1 잔존)').toHaveAttribute('data-price-source', 'CATALOG')
    await expect(recentMarkers(page), 'Y(miss) 라인에 X 의 최근가 마커 승계(R4-F1 잔존)').toHaveCount(0)
    const swappedCatalogMarker = catalogMarkers(page).first()
    await expect(swappedCatalogMarker, 'Y(miss) 라인 판매가 마커 미표시').toBeVisible({ timeout: 10000 })
    await expect(swappedCatalogMarker, '판매가 마커 라벨 불일치(D-R4-1)').toHaveText('판매가')
    await capture(page, '19-KEY-estimate-swap-x-to-y-sellingprice-no-inheritance')

    // 3) 역방향 Y → X 재교체 — (A,X) 재hit(재조회 생존, D-R4-4 의 '재조회 자격 보존' 반증 방지)
    await fillEstimateModel(page, 1, PRODUCT_X.model)
    await expect(page.getByLabel('라인 1 품목명')).toHaveValue(PRODUCT_X.name, { timeout: 10000 })
    await expectUnitPriceDigits(page, PRICE_P, 1, 'X 재교체 재hit')
    await expect(recentMarkers(page), 'X 재hit 최근가 마커 미복원').toHaveCount(1)
    expect(await recentMarkers(page).first().getAttribute('title'), 'X 재hit tooltip 저장일 불일치').toBe(
      '이 거래처에 마지막으로 저장된 단가 · 2000-01-01 저장',
    )
    await capture(page, '20-estimate-swap-back-to-x-rehit-888000')

    // 4) 최종 Y 로 교체 후 저장 — DB 에 (A,Y)=Y 판매가(1440000)가 기록돼야 하고,
    //    구결함이면 X 의 888000 이 (A,Y) 로 오염된다. (A,X) 기억행은 불변이어야 한다.
    await fillEstimateModel(page, 1, PRODUCT_Y.model)
    await expectUnitPriceDigits(page, PRODUCT_Y.sellingPrice, 1, '최종 Y 판매가')
    const estimateId = await saveEstimateDraftAndGetId(page)
    console.log('[#809 R4-postfix] 09 POST /estimates 신규 ID:', estimateId)
    await capture(page, '21-estimate-final-y-sellingprice-saved')
    const line = psql(
      `SELECT el.product_id || '|' || el.unit_price_with_vat FROM estimate_lines el
       JOIN estimates e ON e.id = el.estimate_id
       WHERE e.id='${estimateId}' AND e.is_deleted=false AND el.is_deleted=false`.replace(/\s+/g, ' '),
    )
    console.log('[#809 R4-postfix] 09 DB 견적라인:', line)
    expect(line, '저장된 견적 라인이 Y/판매가와 다름').toBe(`${PRODUCT_Y.id}|${PRODUCT_Y.sellingPrice}.00`)
    await expectMemoryRowEventually(PARTNER_A.id, PRODUCT_Y.id, PRODUCT_Y.sellingPrice)
    expect(memoryRow(PARTNER_A.id, PRODUCT_Y.id), '(A,Y) 기억행이 X 단가로 오염(R4-F1 데이터오염 잔존)').toBe(
      `${PRODUCT_Y.sellingPrice}.00|LINE_SAVE`,
    )
    expect(memoryRow(PARTNER_A.id, PRODUCT_X.id), '(A,X) 기억행이 저장에 휘말려 변경됨').toBe(`${PRICE_P}.00|LINE_SAVE`)
    await ctx.close()
  })

  /**
   * I — R4-D4(a) 실증. 거래처 미선택 상태에서 품목만 선택하면 CATALOG 카피가 거래처를
   * 단정하지 않아야 한다('판매가를 적용했습니다'). + R4-D2(마커 aria-live 제거) +
   * 거래처를 나중에 선택하면 CATALOG 라인이 재조회 대상으로 hit 전환(배너·강조 포함).
   *
   * ⚠️ D-R4-4(선택 후 해제)는 라이브 GUI 도달 불가 — 파일 상단 주석 참조(정직 미커버).
   */
  test('10 [I] 🔴 거래처 미선택 카피(R4-D4(a)) — 거래처 단정 없음 · aria-live 제거(R4-D2) · 사후 선택 시 hit 전환', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const net = trackPriceMemory(page)
    await login(page)
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P)

    await openEstimateForm(page)
    // 거래처를 선택하지 않은 채 품목만 — 판매가 채움 + 거래처 비단정 카피
    await fillEstimateModel(page, 1, PRODUCT_X.model)
    await expect(page.getByLabel('라인 1 품목명')).toHaveValue(PRODUCT_X.name, { timeout: 10000 })
    await expectUnitPriceDigits(page, PRODUCT_X.sellingPrice, 1, '거래처 미선택 판매가 채움')
    const noPartnerMarker = catalogMarkersNoPartner(page).first()
    await expect(noPartnerMarker, '거래처 미선택 판매가 마커 미표시(R4-D4(a) 회귀)').toBeVisible({ timeout: 10000 })
    await expect(noPartnerMarker, '판매가 마커 라벨 불일치(D-R4-1)').toHaveText('판매가')
    // 거래처 단정 카피('이 거래처에 저장된 최근단가가 없어…')가 미선택 상태에 뜨면 안 된다
    await expect(catalogMarkers(page), '거래처 미선택인데 거래처 단정 카피 표시(R4-D4(a) 회귀)').toHaveCount(0)
    // R4-D2: 마커의 라인별 aria-live 제거(전역 고지는 배너 단독)
    expect(await noPartnerMarker.getAttribute('aria-live'), '마커에 aria-live 잔존(R4-D2 회귀)').toBeNull()
    // 거래처가 없으므로 price-memory 조회 자체가 없어야 한다
    expect(net.calls.length, '거래처 미선택인데 price-memory 호출 발생').toBe(0)
    await capture(page, '22-KEY-estimate-no-partner-sellingprice-copy-without-partner-claim')

    // 사후 거래처 A 선택 — CATALOG 라인이 재조회 대상(bulk 1건)이 되어 hit 전환 + 배너/강조
    const callsBefore = net.calls.length
    await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
    await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })
    await expectUnitPriceDigits(page, PRICE_P, 1, '사후 거래처 선택 hit 전환')
    await expect(recentMarkers(page), 'hit 전환 후 최근가 마커 미표시').toHaveCount(1)
    await expect(catalogMarkersNoPartner(page), 'hit 전환 후 미선택 카피 잔존').toHaveCount(0)
    const windowCalls = net.calls.slice(callsBefore)
    const bulkCalls = windowCalls.filter((u) => u.includes('/slips/price-memory/bulk'))
    const singleCalls = windowCalls.filter((u) => !u.includes('/slips/price-memory/bulk'))
    console.log('[#809 R4-postfix] 10 사후 거래처 선택 창구간 호출:', JSON.stringify(windowCalls))
    expect(bulkCalls.length, '사후 거래처 선택 시 bulk 호출이 정확히 1건이 아님').toBe(1)
    expect(singleCalls.length, '사후 거래처 선택 시 라인별 단건 GET 발생').toBe(0)
    const bulkBody = JSON.parse(net.bulkBodies[net.bulkBodies.length - 1] ?? '{}') as {
      partnerId?: string
      productIds?: string[]
    }
    expect(bulkBody.partnerId, '사후 선택 bulk partnerId 불일치').toBe(PARTNER_A.id)
    expect(bulkBody.productIds, '사후 선택 bulk productIds 불일치').toEqual([PRODUCT_X.id])
    // 값이 실제 변한 라인(1200000→888000)이므로 배너 + 강조 1행
    // [R9 실측 확정] 요약형 카피(위 08 과 동일 근거) — 단일 라인 hit 전환: 최근단가 1건 · 변경 1행.
    const estBanner = page.getByTestId('estimate-price-refresh-banner')
    await expect(estBanner, '사후 거래처 선택 배너 미표시').toHaveText(
      '거래처 변경 단가 확인 완료 · 최근단가 1건 · 변경 1행',
    )
    await expect(estimateHighlightedRows(page), '사후 선택 강조가 정확히 1행이 아님').toHaveCount(1)
    await capture(page, '23-KEY-estimate-late-partner-select-rehit-888000-banner-highlight')
    await ctx.close()
  })
})

test.describe('#809 R5-postfix — R4 false-green 커버리지 구멍 실서버 재검증', () => {
  test('11 [R5-H6] 🔴 실제 legacy 견적 거래처 재선택·가격 무수정 저장 — PUT 2xx + 공급단가 불변·9.1% 하락 없음·기억값 정상 생성', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    let rowsToRestore: LegacyRowSnapshots | null = null
    let memoryPairToReset: string | null = null

    try {
      // [R8-QA-7] 픽스처 자급 — 스택 재시드로 legacy 견적이 0건이 되면 이 시나리오는 전제 소진으로
      // 영구 RED 였다(R8·본 라운드 실측: partner_id IS NULL = 0건). 없으면 직접 만든다.
      await ensureLegacyEstimateFixture(page)

      // [R6-L6] census 는 시점 가변값 — 고정 단언(구 toBe '1926')은 legacy 가 1건이라도 정식
      // 저장되면 스위트 영구 false-RED 를 만든다. "동적 선택이 가능한가(≥1)" 만 단언하고 실측치는
      // drift 추적용으로 기록한다(선택된 target 자체가 아래 exact 단언들의 대상).
      const legacyEditableCount = Number(
        psql(
          `SELECT COUNT(*) FROM estimates e
           JOIN estimate_lines el ON el.estimate_id=e.id
           WHERE e.is_deleted=false AND el.is_deleted=false
             AND e.status IN ('QUOTE_DRAFT','QUOTE_SENT')
             AND el.unit_price_with_vat IS NULL`.replace(/\s+/g, ' '),
        ),
      )
      console.log('[#809 R5-postfix] 11 편집 가능 legacy 라인 실측(R5 기준점 1926, drift 추적):', legacyEditableCount)
      expect(
        legacyEditableCount,
        '편집 가능 legacy 견적 라인이 실 DB 에 1건도 없음 — 동적 선택 불가(시나리오 전제 소진)',
      ).toBeGreaterThanOrEqual(1)

      const target = findLegacyEstimateTarget()
      expect(target.status, 'legacy 대상이 편집 가능 상태가 아님').toMatch(/^QUOTE_(DRAFT|SENT)$/)
      expect(target.id, 'legacy estimateId 형식 불일치').toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      // [R6-L6] finally 1:1 원복용 — 헤더/활성 라인 전체 스냅샷을 어떤 변경보다 먼저 박제.
      rowsToRestore = snapshotLegacyEstimateRows(target.id)
      memoryPairToReset = target.productId
      const priceBefore = estimatePriceSnapshot(target.id)
      expect(priceBefore, 'legacy DB 사전값이 unit_price_with_vat=NULL 계약과 다름').toBe(
        `${target.productId}|${target.unitPrice}|NULL`,
      )
      // [R6-M9 계열] "사전 기억 부재" 를 전역 상태 단언으로 요구하면 공유 스택 잔재(예: 타 라운드
      // 오염행)에 영구 false-RED — 사전 조건은 자기 reset 으로 직접 구성하고 exact 로 검증한다.
      resetMemoryPair(PARTNER_A.id, target.productId)
      const partnerMemoryBefore = memoryRow(PARTNER_A.id, target.productId)
      expect(partnerMemoryBefore, '자체 reset 직후에도 legacy 대상 (A,품목) 기억행 잔존').toBe('')
      const memoryBefore = memorySnapshotForProduct(target.productId)

      // 정상 coedit provider 연결 중에는 거래처 autocomplete 가 disabled라 legacy partner_id=NULL을
      // 사용자가 복구할 UI가 없다. 앱이 명시적으로 제공·단위검증하는 "provider 생성 실패 → 평문 폼"
      // fallback만 활성화한다. coedit 초기 GET 외 가격/거래처 검색/PUT/DB는 전부 실서버다.
      let coeditFallbackGetCount = 0
      const coeditInitialGet = new RegExp(
        `/slips/estimates/${target.id}/collab/coedit(?:\\?.*)?$`,
      )
      await page.route(coeditInitialGet, async (route) => {
        coeditFallbackGetCount += 1
        await route.abort('failed')
      })
      await page.goto(`${BASE_URL}/sales/estimates/${target.id}/edit`)
      await expect(page.getByLabel('라인 1 모델명'), 'legacy 견적 편집 폼 미표시').toHaveValue(target.modelName, {
        timeout: 30000,
      })
      await expect(page.getByLabel('라인 1 품목명')).toHaveValue(target.productName)
      await expectUnitPriceDigits(page, target.unitPrice, 1, 'legacy 공급단가 hydrate')
      const saveButton = page.getByTestId('estimate-form-save-button')
      await expect(saveButton, 'legacy 견적 저장 버튼 미활성').toBeEnabled({ timeout: 20000 })
      await expect(page.getByRole('combobox', { name: '거래처 검색' }), 'coedit 실패 뒤 평문 폼 fallback 미진입').toBeEnabled()
      expect(coeditFallbackGetCount, 'coedit 초기 GET 실패 주입이 정확히 1건이 아님').toBe(1)
      await page.unroute(coeditInitialGet)

      // legacy 레코드는 partner_id=NULL 이므로 main 에서도 저장 전 거래처 재선택이 필수다.
      // 이 단계는 가격 편집을 우회하지 않는다. 검증 대상은 단가 입력을 한 번도 건드리지 않은 채
      // legacyPriceUntouched provenance 가 유지되어 priceVatInclusive=false 로 전송되는 가격 basis 다.
      await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
      await expect(page.getByLabel('거래처명'), 'legacy 거래처 재선택 후 명칭 불일치').toHaveValue(PARTNER_A.name)
      await expectUnitPriceDigits(page, target.unitPrice, 1, '거래처 재선택은 가격 무수정이어야 함')
      await expect(saveButton, '거래처 재선택 후 legacy 견적 저장 버튼 미활성').toBeEnabled({ timeout: 20000 })
      await capture(page, '33-KEY-legacy-estimate-partner-reselected-price-untouched-1920000')

      let resolveUpdate!: (response: Response) => void
      const updateObserved = new Promise<Response>((resolve) => { resolveUpdate = resolve })
      const onResponse = (response: Response) => {
        if (
          response.request().method() === 'PUT'
          && response.url().includes(`/slips/estimates/${target.id}`)
        ) {
          resolveUpdate(response)
        }
      }
      page.on('response', onResponse)
      await saveButton.click()
      const updateResponse = await Promise.race([
        updateObserved,
        page.waitForTimeout(10000).then(() => null),
      ])
      page.off('response', onResponse)

      const validationMessage = await page.getByRole('alert').textContent().catch(() => null)
      expect(
        updateResponse?.status() ?? 0,
        `PUT /estimates/{id} 미관측(폼 오류: ${validationMessage ?? '없음'})`,
      ).toBeGreaterThanOrEqual(200)
      expect(updateResponse?.status() ?? 999, 'PUT /estimates/{id} 가 2xx 아님').toBeLessThan(300)

      const updateBody = updateResponse?.request().postDataJSON() as {
        partnerId?: string
        lines?: Array<{ unitPrice?: string | number; priceVatInclusive?: boolean }>
      } | undefined
      expect(updateBody?.partnerId, 'legacy PUT body partnerId 가 재선택 거래처와 다름').toBe(PARTNER_A.id)
      expect(updateBody?.lines, 'legacy PUT body 라인이 정확히 1개가 아님').toHaveLength(1)
      expect(Number(updateBody?.lines?.[0]?.unitPrice), 'legacy PUT body 가 원 공급단가를 보내지 않음').toBe(
        Number(target.unitPrice),
      )
      // [G8/R5-H2] Number() 강제변환은 문자열 canonical 형식 훼손(지수표기/로케일 콤마/number 타입
      // 전송)을 못 잡는다 — wire 는 BigDecimal-string 계약: hydrate canonical = String(Number(DB값)).
      const untouchedWireUnitPrice = updateBody?.lines?.[0]?.unitPrice
      expect(typeof untouchedWireUnitPrice, 'legacy PUT 단가가 string 타입이 아님(G8 — DTO string 계약)').toBe('string')
      expect(String(untouchedWireUnitPrice), 'legacy PUT 단가 문자열이 canonical 숫자 형식이 아님(G8)').toMatch(
        /^\d+(\.\d+)?$/,
      )
      expect(untouchedWireUnitPrice, 'legacy 무수정 PUT 단가가 hydrate canonical 문자열과 다름(G8)').toBe(
        String(Number(target.unitPrice)),
      )
      expect(updateBody?.lines?.[0]?.priceVatInclusive, '가격 무수정 legacy 라인을 VAT 포함 입력으로 오판').toBe(false)

      // PUT 2xx 뒤 DB 두 단가 필드를 실측한다. priceVatInclusive=false 이므로 원 공급단가는 불변이고
      // unit_price_with_vat 은 NULL 을 유지해야 한다. 이 exact 단언이 /1.1 재분리(약 9.1% 하락)를 막는다.
      const priceAfter = estimatePriceSnapshot(target.id)
      const incorrectlyDividedSupplyUnit = (
        Math.round((Number(target.unitPrice) * target.quantity) / 1.1) / target.quantity
      ).toFixed(2)
      console.log('[#809 R5-postfix] 11 legacy DB before/after:', priceBefore, '/', priceAfter)
      console.log('[#809 R5-postfix] 11 legacy 9.1% 하락 오판값:', incorrectlyDividedSupplyUnit)
      expect(priceAfter, 'legacy 무수정 저장으로 unit_price 또는 unit_price_with_vat 변형').toBe(priceBefore)
      expect(
        priceAfter,
        `legacy 공급단가가 VAT 포함으로 오판되어 약 9.1% 하락(${target.unitPrice}→${incorrectlyDividedSupplyUnit})`,
      ).not.toContain(`|${incorrectlyDividedSupplyUnit}|`)

      // price-memory 저장 basis 는 VAT 포함 입력단가다. legacy 공급단가 경로(false)는 원 공급단가×1.1로
      // 정규화되어야 하며, 잘못 하락한 공급단가나 원 공급단가 자체를 그대로 기억하면 FAIL 한다.
      const expectedMemoryPrice = (Number(target.unitPrice) * 1.1).toFixed(2)
      await expect.poll(
        () => memoryRow(PARTNER_A.id, target.productId),
        {
          timeout: 5000,
          intervals: [25, 50, 100, 250, 500],
          message: `legacy 원 공급단가 기준 price-memory 생성 미완료: ${target.unitPrice}×1.1=${expectedMemoryPrice}`,
        },
      ).toBe(`${expectedMemoryPrice}|LINE_SAVE`)
      const memoryAfter = memorySnapshotForProduct(target.productId)
      console.log('[#809 R5-postfix] 11 legacy price-memory before/after:', memoryBefore, '/', memoryAfter)
      expect(memoryAfter, '거래처가 채워진 legacy 저장인데 대상 품목 price-memory 가 생성되지 않음').not.toBe(memoryBefore)
      expect(memoryRow(PARTNER_A.id, target.productId), 'legacy price-memory 가 원 공급단가 기준이 아님').toBe(
        `${expectedMemoryPrice}|LINE_SAVE`,
      )
      await page.goto(`${BASE_URL}/sales/estimates/${target.id}/edit`)
      await expectUnitPriceDigits(page, target.unitPrice, 1, 'legacy 저장 후 재진입 공급단가 불변')
      await capture(page, '34-KEY-legacy-estimate-after-put-supply-price-unchanged-memory-created')

      // 역방향 provenance 가드: 값의 최종 동일성으로 "무수정"을 판정하면 안 된다.
      // 1920000→999000→1920000처럼 실제 입력을 거치면 legacyPriceUntouched=false,
      // 따라서 같은 숫자로 원복했어도 priceVatInclusive=true 로 전송되어야 한다.
      await expect(saveButton, '역방향 provenance 검증 전 저장 버튼 미활성').toBeEnabled({ timeout: 20000 })
      await unitPriceInput(page).fill('999000')
      await unitPriceInput(page).fill(target.unitPrice)
      await expectUnitPriceDigits(page, target.unitPrice, 1, 'legacy 가격 편집→원복 최종값')
      await capture(page, '35-KEY-legacy-price-edited-999000-restored-1920000-before-save')

      const editedRestoreResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'PUT'
          && response.url().includes(`/slips/estimates/${target.id}`),
        { timeout: 30000 },
      )
      await saveButton.click()
      const editedRestoreResponse = await editedRestoreResponsePromise
      expect(editedRestoreResponse.ok(), `편집→원복 PUT 실패: HTTP ${editedRestoreResponse.status()}`).toBeTruthy()
      const editedRestoreBody = editedRestoreResponse.request().postDataJSON() as {
        lines?: Array<{ unitPrice?: string | number; priceVatInclusive?: boolean }>
      }
      expect(Number(editedRestoreBody.lines?.[0]?.unitPrice), '편집→원복 PUT 최종 단가 불일치').toBe(
        Number(target.unitPrice),
      )
      // [G8/R5-H2] 편집→원복 PUT 도 문자열 canonical — 이 값은 본 테스트가 fill 한 입력 문자열
      // 그대로여야 한다(CollaborativeSlipInput type=text 무가공 통과 실코드 확인).
      const editedWireUnitPrice = editedRestoreBody.lines?.[0]?.unitPrice
      expect(typeof editedWireUnitPrice, '편집→원복 PUT 단가가 string 타입이 아님(G8)').toBe('string')
      expect(String(editedWireUnitPrice), '편집→원복 PUT 단가 문자열이 canonical 숫자 형식이 아님(G8)').toMatch(
        /^\d+(\.\d+)?$/,
      )
      expect(editedWireUnitPrice, '편집→원복 PUT 단가가 입력 문자열 그대로가 아님(G8 — 중간 가공 발생)').toBe(
        target.unitPrice,
      )
      expect(
        editedRestoreBody.lines?.[0]?.priceVatInclusive,
        '실제 가격 편집→원복을 legacy 가격 무수정으로 오판',
      ).toBe(true)

      const editedRestoreSnapshot = estimatePriceSnapshot(target.id)
      console.log('[#809 R5-postfix] 11 legacy 편집→원복 DB:', editedRestoreSnapshot)
      expect(editedRestoreSnapshot, 'priceVatInclusive=true 역방향 저장 DB 계약 불일치').toBe(
        `${target.productId}|${incorrectlyDividedSupplyUnit}|${Number(target.unitPrice).toFixed(2)}`,
      )
      await expect.poll(
        () => memoryRow(PARTNER_A.id, target.productId),
        {
          timeout: 5000,
          intervals: [25, 50, 100, 250, 500],
          message: '편집→원복 priceVatInclusive=true 기억값 반영 미완료',
        },
      ).toBe(`${Number(target.unitPrice).toFixed(2)}|LINE_SAVE`)
      await capture(page, '36-KEY-legacy-price-edited-restored-saved-as-vat-inclusive')
    } finally {
      // [R6-L6] 실 legacy 문서 1:1 원복 — 종전 finally 는 라인 가격만 되돌리고 헤더의
      // partner_business_no/partner_address/modified_at/modified_by/version/totals 를 남겨
      // 실 legacy 문서에 QA 잔재를 누적시켰다. 사전 row_to_json 전체 스냅샷으로 헤더 전량 +
      // 활성 라인 값·audit 필드를 원복한다. 정확히 이 견적 1건 scope — 광역 정리 없음.
      if (rowsToRestore) {
        restoreLegacyEstimateRows(rowsToRestore)
      }
      if (memoryPairToReset) {
        resetMemoryPair(PARTNER_A.id, memoryPairToReset)
      }
      await ctx.close()
    }
  })

  test('12a [R5-H7] 🔴 전표 BUNDLE — 신규 POST → 상세 무수정 PUT → 계보 보존·구성품 0·parent 1', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    resetMemoryPair(PARTNER_A.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_A.id, productId))
    // [R6-M9] 자기 reset 직후 구성 검증(ms 창) — 자기 쌍 단언 강도 exact 유지.
    expect(componentMemorySnapshot(PARTNER_A.id), '12a 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      await openSlipForm(page)
      await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
      await pickWarehouse(page)
      await pickAutocomplete(page, '라인 1 품목', '품목 목록', BUNDLE.model)
      await page.waitForTimeout(1200)
      await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '전표 BUNDLE 판매가')
      await unitPriceInput(page).fill(PRICE_BUNDLE)
      // [R6-M9] 구성품 오염 판정 = 자기 저장 창구간 delta (공유 dev 스택 전제 — 12a 가 R6 라운드에서
      // 타 차원 에이전트의 동시 PUT 에 정확히 이 지점의 전역 카운트로 false-RED 났던 시나리오다).
      const componentsBeforePost = componentMemorySnapshot(PARTNER_A.id)
      const slipId = await saveSlipAndWait(page)
      await expectMemoryRowEventually(PARTNER_A.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)

      const componentIds = [...BUNDLE_COMPONENT_IDS].sort().join(',')
      const expectedSummary = `2|1|2|${componentIds}`
      const lineageBefore = bundleLineageSnapshot('slip_lines', slipId)
      console.log('[#809 R5-postfix] 12a 전표 POST 계보:', lineageBefore)
      expect(bundleLineageSummary('slip_lines', slipId), '전표 POST 세트 메타 불일치').toBe(expectedSummary)
      expect(
        componentMemorySnapshot(PARTNER_A.id),
        '전표 POST 창구간 구성품 기억행 delta 발생 = 각인 오염(diff 참조)',
      ).toBe(componentsBeforePost)
      expect(memoryRowCount(PARTNER_A.id, BUNDLE.id), '전표 POST parent 기억행이 정확히 1건이 아님').toBe('1')
      expect(memoryRow(PARTNER_A.id, BUNDLE.id), '전표 POST parent source/단가 불일치').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )

      await page.goto(`${BASE_URL}/sales/${slipId}`)
      await page.getByTestId('sales-slip-edit-button').click()
      const editModal = page.getByTestId('sales-slip-edit-modal')
      await expect(editModal, '전표 BUNDLE 상세 편집 모달 미표시').toBeVisible({ timeout: 20000 })
      await expect(editModal.getByLabel('단가(VAT제외) 1')).toBeVisible()
      await capture(page, '26-slip-bundle-detail-before-nochange-put')
      // [R6-M9] PUT 창구간 delta — 무수정 PUT 은 parent 재기록조차 없어(R6-M8 현행) flush 양성
      // 신호가 없으므로 2xx + grace 로 관측 창을 닫는다.
      const componentsBeforePut = componentMemorySnapshot(PARTNER_A.id)
      const updateResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'PUT' && response.url().includes(`/slips/${slipId}`),
        { timeout: 30000 },
      )
      await page.getByTestId('sales-slip-edit-save').click()
      const updateResponse = await updateResponsePromise
      expect(updateResponse.ok(), `전표 BUNDLE PUT 실패: HTTP ${updateResponse.status()}`).toBeTruthy()

      await expect.poll(() => bundleLineageSnapshot('slip_lines', slipId), {
        timeout: 5000,
        message: '전표 BUNDLE PUT 후 세트 계보/가격이 POST 직후와 다름',
      }).toBe(lineageBefore)
      expect(bundleLineageSummary('slip_lines', slipId), '전표 PUT 세트 메타 불일치').toBe(expectedSummary)
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_A.id),
        '전표 무수정 PUT 창구간 구성품 기억행 delta 발생(R5-H1 잔존, diff 참조)',
      ).toBe(componentsBeforePut)
      expect(memoryRowCount(PARTNER_A.id, BUNDLE.id), '전표 PUT parent 기억행이 정확히 1건이 아님').toBe('1')
      expect(memoryRow(PARTNER_A.id, BUNDLE.id), '전표 PUT parent BUNDLE_SET 유실').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )
      await capture(page, '27-slip-bundle-after-nochange-put')
    } finally {
      await ctx.close()
    }
  })

  test('12b [R5-H7] 🔴 견적 BUNDLE — 신규 POST → 상세 무수정 PUT → 계보 보존·구성품 0·parent 1', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    resetMemoryPair(PARTNER_B.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_B.id, productId))
    // [R6-M9] 자기 reset 직후 구성 검증(ms 창).
    expect(componentMemorySnapshot(PARTNER_B.id), '12b 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      await openEstimateForm(page)
      await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_B.query)
      await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_B.name, { timeout: 15000 })
      await fillEstimateModel(page, 1, BUNDLE.model)
      await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '견적 BUNDLE 판매가')
      await unitPriceInput(page).fill(PRICE_BUNDLE)
      // [R6-M9] POST 창구간 delta 기준점.
      const componentsBeforePost = componentMemorySnapshot(PARTNER_B.id)
      const estimateId = await saveEstimateDraftAndGetId(page)
      await expectMemoryRowEventually(PARTNER_B.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)

      const componentIds = [...BUNDLE_COMPONENT_IDS].sort().join(',')
      const expectedSummary = `2|1|2|${componentIds}`
      const lineageBefore = bundleLineageSnapshot('estimate_lines', estimateId)
      console.log('[#809 R5-postfix] 12b 견적 POST 계보:', lineageBefore)
      expect(bundleLineageSummary('estimate_lines', estimateId), '견적 POST 세트 메타 불일치').toBe(expectedSummary)
      expect(
        componentMemorySnapshot(PARTNER_B.id),
        '견적 POST 창구간 구성품 기억행 delta 발생 = 각인 오염(diff 참조)',
      ).toBe(componentsBeforePost)
      expect(memoryRowCount(PARTNER_B.id, BUNDLE.id), '견적 POST parent 기억행이 정확히 1건이 아님').toBe('1')
      expect(memoryRow(PARTNER_B.id, BUNDLE.id), '견적 POST parent source/단가 불일치').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )

      await page.goto(`${BASE_URL}/sales/estimates/${estimateId}/edit`)
      const saveButton = page.getByTestId('estimate-form-save-button')
      await expect(page.getByLabel('라인 1 모델명'), '견적 BUNDLE 편집 폼 미표시').toBeVisible({ timeout: 30000 })
      await expect(page.getByLabel('라인 2 모델명'), '견적 BUNDLE 구성품 2행 미표시').toBeVisible()
      await expect(saveButton, '견적 BUNDLE 저장 버튼 미활성').toBeEnabled({ timeout: 20000 })
      await capture(page, '28-estimate-bundle-detail-before-nochange-put')
      // [R6-M9] PUT 창구간 delta — flush 양성 신호 부재 경로라 2xx + grace 로 관측 창을 닫는다.
      const componentsBeforePut = componentMemorySnapshot(PARTNER_B.id)
      const updateResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'PUT'
          && response.url().includes(`/slips/estimates/${estimateId}`),
        { timeout: 30000 },
      )
      await saveButton.click()
      const updateResponse = await updateResponsePromise
      expect(updateResponse.ok(), `견적 BUNDLE PUT 실패: HTTP ${updateResponse.status()}`).toBeTruthy()

      await expect.poll(() => bundleLineageSnapshot('estimate_lines', estimateId), {
        timeout: 5000,
        message: '견적 BUNDLE PUT 후 세트 계보/가격이 POST 직후와 다름',
      }).toBe(lineageBefore)
      expect(bundleLineageSummary('estimate_lines', estimateId), '견적 PUT 세트 메타 불일치').toBe(expectedSummary)
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_B.id),
        '견적 무수정 PUT 창구간 구성품 기억행 delta 발생(R5-H1 잔존, diff 참조)',
      ).toBe(componentsBeforePut)
      expect(memoryRowCount(PARTNER_B.id, BUNDLE.id), '견적 PUT parent 기억행이 정확히 1건이 아님').toBe('1')
      expect(memoryRow(PARTNER_B.id, BUNDLE.id), '견적 PUT parent BUNDLE_SET 유실').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )
      await capture(page, '29-estimate-bundle-after-nochange-put')
    } finally {
      await ctx.close()
    }
  })

  /**
   * R5-H8 지연 주입: 모델 lookup 은 실 2xx 응답을 먼저 관측한다. 이어지는 단건 price-memory
   * 요청은 route.fetch() 로 실서버 응답을 그대로 받은 뒤 gate 동안만 hold 하고,
   * route.fulfill({ response }) 로 원본 status/header/body 를 무변조 전달한다. 합성/내용 변조 없음.
   */
  test('13 [R5-H8] 🔴 lookup→price 중간상태 — 저장 disabled·0원 POST 없음 → 실응답 후 기억단가 정확 적용', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    seedMemoryRow(PARTNER_A.id, PRODUCT_X.id, PRICE_P)

    let releasePriceResponse!: () => void
    let released = false
    const priceGate = new Promise<void>((resolve) => {
      releasePriceResponse = () => {
        if (released) return
        released = true
        resolve()
      }
    })
    let resolveUpstreamReady!: () => void
    const upstreamReady = new Promise<void>((resolve) => { resolveUpstreamReady = resolve })
    let upstreamStatus = 0
    let estimatePostCount = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/estimates(\?|$)/.test(request.url())) estimatePostCount += 1
    })

    await page.route('**/slips/price-memory?*', async (route) => {
      const response = await route.fetch() // 실서버 실응답 — 내용 변조/합성 금지
      upstreamStatus = response.status()
      resolveUpstreamReady()
      await priceGate
      await route.fulfill({ response })
    })

    try {
      await openEstimateForm(page)
      await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
      await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })

      const lookupResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'GET'
          && response.url().includes('/slips/lookup-product')
          && response.url().includes(`modelName=${encodeURIComponent(PRODUCT_X.model)}`),
        { timeout: 30000 },
      )
      const priceResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'GET'
          && response.url().includes('/slips/price-memory?'),
        { timeout: 30000 },
      )
      const model = page.getByLabel('라인 1 모델명')
      await model.fill(PRODUCT_X.model)
      await model.blur()

      const lookupResponse = await lookupResponsePromise
      expect(lookupResponse.ok(), `실 모델 lookup 실패: HTTP ${lookupResponse.status()}`).toBeTruthy()
      await upstreamReady
      expect(upstreamStatus, 'hold 대상 price-memory 실 upstream 이 2xx 아님').toBeGreaterThanOrEqual(200)
      expect(upstreamStatus, 'hold 대상 price-memory 실 upstream 이 2xx 아님').toBeLessThan(300)

      // lookup 2xx 완료 + price-memory upstream 완료, 브라우저 전달 전의 정확한 중간 창.
      const busy = page.getByTestId('estimate-form-price-refresh-busy')
      const saveButton = page.getByTestId('estimate-form-save-button')
      await expect(busy, 'lookup→price 중간 창 busy 단서 미표시').toHaveText('최근단가 확인 중…')
      await expect(saveButton, 'lookup→price 중간 창 저장 미차단').toBeDisabled()
      await expectUnitPriceDigits(page, '0', 1, 'price-memory 응답 전 중간 단가')
      await saveButton.click({ force: true })
      await page.waitForTimeout(400)
      expect(estimatePostCount, 'disabled 상태에서 0원 견적 POST 발생').toBe(0)
      await capture(page, '30-KEY-estimate-model-lookup-done-price-memory-held-save-disabled-zero')

      releasePriceResponse()
      const priceResponse = await priceResponsePromise
      expect(priceResponse.ok(), `전달된 실 price-memory 응답 실패: HTTP ${priceResponse.status()}`).toBeTruthy()
      await expect(busy, 'price-memory 응답 후 busy 고착').toHaveText('', { timeout: 15000 })
      await expect(saveButton, 'price-memory 응답 후 저장 버튼 미복구').toBeEnabled()
      await expect(page.getByLabel('라인 1 품목명')).toHaveValue(PRODUCT_X.name, { timeout: 10000 })
      await expectUnitPriceDigits(page, PRICE_P, 1, 'price-memory 응답 후 기억단가')
      await expect(recentMarkers(page), 'price-memory 응답 후 최근단가 마커 미표시').toHaveCount(1)
      await capture(page, '31-KEY-estimate-price-memory-resolved-888000-save-enabled')

      const estimateId = await saveEstimateDraftAndGetId(page)
      expect(estimatePostCount, '응답 완료 뒤 견적 POST 가 정확히 1건이 아님').toBe(1)
      const savedLine = estimatePriceSnapshot(estimateId)
      console.log('[#809 R5-postfix] 13 저장 DB:', savedLine)
      expect(savedLine, '응답 후 저장된 견적 단가가 888000(VAT포함)이 아님').toBe(
        // 수량1: round(888000 / 1.1)=807273 (HALF_UP). 기존 807272.50 행은 수량2의
        // round(1776000 / 1.1)=1614545 를 2로 나눈 값 — R5 실코드/실DB 대조 완료.
        `${PRODUCT_X.id}|807273.00|${PRICE_P}.00`,
      )
      expect(memoryRow(PARTNER_A.id, PRODUCT_X.id), 'H8 저장 후 price-memory 값 변형').toBe(
        `${PRICE_P}.00|LINE_SAVE`,
      )
      await capture(page, '32-estimate-price-memory-resolved-888000-saved')
    } finally {
      releasePriceResponse()
      await page.unroute('**/slips/price-memory?*')
      await ctx.close()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [R6-postfix] R6 적대 fix(H1 two-pass resolver · H2 서버측 전표 복사 · H3 스냅샷 계보)를
// 잡는 선행 커버 시나리오. GUI 로 유발 불가능/불안정한 계약 표면(라인 순서 제어·구성품 단품
// 바인딩·버전 복원)은 실 게이트웨이 raw API(앱과 동일 wire 계약·실 Bearer 토큰)로 유발하고,
// 판정은 실 DB + 실 GUI 재진입 캡처로 한다. 합성 응답/변조 없음.
// ─────────────────────────────────────────────────────────────────────────────

/** [R6] raw wire 형태 — 필요한 필드만 좁게 타입. BigDecimal 은 JSON number 로 온다. */
interface SlipLineWire {
  /** 서버 라인 id — [D-R8-9] lineId 계약의 왕복 대상. 상세 응답의 `lines[].id`. */
  id?: string
  productId: string
  productName: string | null
  modelName: string | null
  specification: string | null
  quantity: number
  unitPrice: number | string
  note: string | null
  unitPriceWithVat?: number | string | null
  setHead?: boolean
  parentSetModel?: string | null
}

interface SlipDetailWire {
  id: string
  updatedAt: string
  partnerName?: string | null
  partnerCode?: string | null
  memo?: string | null
  businessNumber?: string | null
  deliveryAddress?: string | null
  supervisionAddress?: string | null
  projectName?: string | null
  recipientPhone?: string | null
  paymentDueDate?: string | null
  lines: SlipLineWire[]
}

interface EstimateLineWire {
  /** 서버 라인 id — [D-R8-9] lineId 계약의 왕복 대상. `EstimateLineResponse.id`. */
  id?: string
  lineNo: number
  productId: string
  productName: string | null
  modelName: string | null
  specification: string | null
  quantity: number
  unitPrice: number | string
  unitPriceWithVat: number | string | null
  note: string | null
}

interface EstimateDetailWire {
  id: string
  partnerId: string | null
  partnerName: string | null
  partnerBusinessNo: string | null
  partnerAddress: string | null
  validUntil: string | null
  memo: string | null
  lines: EstimateLineWire[]
}

interface RevisionWire {
  revisionNo: number
  revisionType: string
}

/** 전표 라인 mirror — GET 값 verbatim(1-패스 exact fingerprint 성립 조건). */
function mirrorSlipLine(line: SlipLineWire): Record<string, unknown> {
  return {
    // [D-R8-9] lineId 왕복 — 이 헬퍼는 **정상 최신 클라이언트의 무수정 PUT** 을 흉내낸다.
    // `apiPut` 이 요청 레벨 마커(lineIdContract:true)를 싣는 이상 라인도 lineId 를 실어야
    // 계약이 성립한다. 마커만 싣고 lineId 를 빼면 서버는 전 라인을 **신규 평면 라인**으로 읽어
    // 세트 계보를 조용히 파괴한다(200) — R8-QA-1 이 적발한 파괴 신호와 동일하다.
    // 실 앱은 Y.Doc lineId 직독(`resolveServerLineId`)으로 항상 실어 보낸다.
    lineId: line.id ?? null,
    productId: line.productId,
    productName: line.productName,
    modelName: line.modelName,
    specification: line.specification,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    note: line.note,
  }
}

/** 전표 헤더 mirror — updateSalesHeader 가 null 로 필드를 지우므로 GET 값 전량 왕복. */
function mirrorSlipHeader(detail: SlipDetailWire): Record<string, unknown> {
  return {
    updatedAt: detail.updatedAt,
    partnerName: detail.partnerName ?? null,
    partnerCode: detail.partnerCode ?? null,
    memo: detail.memo ?? null,
    businessNumber: detail.businessNumber ?? null,
    deliveryAddress: detail.deliveryAddress ?? null,
    supervisionAddress: detail.supervisionAddress ?? null,
    projectName: detail.projectName ?? null,
    recipientPhone: detail.recipientPhone ?? null,
    paymentDueDate: detail.paymentDueDate ?? null,
  }
}

/** 견적 헤더 mirror — editHeader 가 null 로 필드를 지우므로 GET 값 전량 왕복. */
function mirrorEstimateHeader(detail: EstimateDetailWire): Record<string, unknown> {
  return {
    partnerId: detail.partnerId,
    partnerName: detail.partnerName,
    partnerBusinessNo: detail.partnerBusinessNo,
    partnerAddress: detail.partnerAddress,
    validUntil: detail.validUntil,
    memo: detail.memo,
  }
}

/** 견적 라인 mirror — 앱과 동일하게 VAT 포함 단가 + priceVatInclusive=true 로 재전송. */
function mirrorEstimateLine(line: EstimateLineWire): Record<string, unknown> {
  return {
    // [D-R8-9] lineId 왕복 — mirrorSlipLine 과 동일 사유(견적/전표 대칭).
    lineId: line.id ?? null,
    productId: line.productId,
    productName: line.productName,
    modelName: line.modelName,
    specification: line.specification,
    quantity: line.quantity,
    unitPrice: line.unitPriceWithVat ?? line.unitPrice,
    note: line.note,
    priceVatInclusive: line.unitPriceWithVat != null,
  }
}

/** 활성 라인 수 / head 수 스칼라 프로브. */
function activeLineCount(table: BundleLineTable, ownerId: string): string {
  const ownerColumn = table === 'slip_lines' ? 'slip_id' : 'estimate_id'
  return psql(
    `SELECT COUNT(*) || '|' || COUNT(*) FILTER (WHERE set_head)
     FROM ${table} WHERE ${ownerColumn}='${ownerId}' AND is_deleted=false`.replace(/\s+/g, ' '),
  )
}

/** 최초 revision(스냅샷 계보 왕복 대상)으로 복원 — 목록 실조회 후 최솟값 선택(채번 가정 없음). */
async function restoreToEarliestRevision(
  page: Page,
  auth: LoginResult,
  revisionsPath: string,
  restorePathOf: (revisionNo: number) => string,
): Promise<number> {
  const revisions = await apiGet<RevisionWire[]>(page, auth, revisionsPath)
  expect(revisions.length, `버전이력이 2건 이상이어야 복원 검증 가능: ${revisionsPath}`).toBeGreaterThanOrEqual(2)
  const earliest = revisions.reduce((min, r) => (r.revisionNo < min ? r.revisionNo : min), revisions[0]!.revisionNo)
  await apiPost(page, auth, restorePathOf(earliest))
  return earliest
}

test.describe('#809 R6-postfix — R6-H1/H2/H3 fix 선행 커버(공유 스택 전제 delta 판정)', () => {
  /**
   * [G1/R6-H1 — BE 라이브 실증 변형] 전표 PUT 에서 "신규 동일 productId 라인이 요청 앞 순서" 일 때
   * 종전 per-line greedy 는 신규 라인이 head 계보를 탈취하고 진짜 head 를 평면화해 배분가를
   * LINE_SAVE 로 각인했다(R6 라이브 CONFIRMED: 신규 qty3 → head 탈취 · memory 88,000 오염 ·
   * 사용자 123,000 미기억). two-pass 계약 기대: 무수정 mirror 라인이 위치와 무관하게 exact 매칭으로
   * 자기 계보를 보존하고, 신규 라인은 평문(계보 없음)으로 남아 사용자 단가가 정상 기억된다.
   *
   * GUI 는 라인 순서 삽입을 제공하지 않으므로(추가 = append) 실 게이트웨이 raw PUT 계약으로
   * 유발한다 — 전표 PUT 은 라인 배열 자체가 계약이라 임의 클라이언트가 보낼 수 있는 합법 입력이다.
   */
  test('14a [R6-H1·전표] 신규 동일 productId 라인 선순서 PUT — head 탈취 없음 · 사용자 단가 기억 · 구성품 delta 0', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPair(PARTNER_B.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_B.id, productId))
    expect(componentMemorySnapshot(PARTNER_B.id), '14a 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      // 1) 실 GUI 로 세트 전표 생성 (B, 1,100,000) — 12a 와 동일 진입.
      await openSlipForm(page)
      await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_B.query)
      await pickWarehouse(page)
      await pickAutocomplete(page, '라인 1 품목', '품목 목록', BUNDLE.model)
      await page.waitForTimeout(1200)
      await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '14a 세트 miss 판매가(lookup settle)')
      await unitPriceInput(page).fill(PRICE_BUNDLE)
      const slipId = await saveSlipAndWait(page)
      await expectMemoryRowEventually(PARTNER_B.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      const componentIds = [...BUNDLE_COMPONENT_IDS].sort().join(',')
      expect(bundleLineageSummary('slip_lines', slipId), '14a 사전 세트 전개 상태 불일치').toBe(
        `2|1|2|${componentIds}`,
      )

      // 2) GET 상세를 verbatim mirror + 신규 동일 productId(head 와 같은 PART-01) 라인을 "맨 앞"에.
      //    단가 123000(VAT 제외 계약) — R6 BE 라이브 실증과 동일 형태.
      const detail = await apiGet<SlipDetailWire>(page, auth, `/slips/${slipId}`)
      const headLine = detail.lines.find((l) => l.setHead === true)
      expect(headLine, '14a GET 상세에 set head 라인 부재').toBeTruthy()
      // 신규 라인 수량(3)은 기존 어느 라인과도 달라야 exact 매칭 오염 없이 "신규" 로 판별된다.
      expect(
        detail.lines.some((l) => l.quantity === 3),
        '14a 전제 붕괴 — 기존 라인에 수량 3 존재(신규 라인 수량 충돌)',
      ).toBeFalsy()
      const newLinePrice = '123000'
      const craftedBody = {
        ...mirrorSlipHeader(detail),
        lines: [
          {
            productId: headLine!.productId,
            productName: headLine!.productName,
            modelName: headLine!.modelName,
            specification: null,
            quantity: 3,
            unitPrice: newLinePrice,
            note: null,
          },
          ...detail.lines.map(mirrorSlipLine),
        ],
      }
      // (B, PART-02) 쌍은 이 PUT 으로 절대 변해선 안 된다 — 창구간 delta 기준점(R6-M9 방식).
      expect(BUNDLE_COMPONENT_IDS, '14a head 품목이 알려진 구성품 집합 밖 — 시드 전제 붕괴').toContain(
        headLine!.productId,
      )
      const otherComponentId = BUNDLE_COMPONENT_IDS.find((id) => id !== headLine!.productId)!
      const orphanPairBeforePut = memoryPairsSnapshot(PARTNER_B.id, [otherComponentId])
      await apiPut(page, auth, `/slips/${slipId}/sales`, craftedBody)

      // 3) 계보 판정 — head 는 여전히 "원 head(qty2)" 에만, 신규 qty3 라인은 평문이어야 한다.
      expect(activeLineCount('slip_lines', slipId), '14a PUT 후 라인 수/head 수 불일치').toBe('3|1')
      expect(
        psql(
          `SELECT quantity FROM slip_lines
           WHERE slip_id='${slipId}' AND is_deleted=false AND set_head`.replace(/\s+/g, ' '),
        ),
        '14a head 계보가 신규 라인에 탈취됨(R6-H1 잔존 — head 는 원 head 라인 수량이어야 함)',
      ).toBe(String(headLine!.quantity))
      expect(
        psql(
          `SELECT set_head::text || '|' || COALESCE(parent_set_model,'NULL') FROM slip_lines
           WHERE slip_id='${slipId}' AND is_deleted=false AND quantity=3`.replace(/\s+/g, ' '),
        ),
        '14a 신규 동일 productId 라인이 세트 계보를 승계함(R6-H1 잔존)',
      ).toBe('false|NULL')
      expect(
        psql(
          `SELECT COUNT(*) FROM slip_lines
           WHERE slip_id='${slipId}' AND is_deleted=false
             AND parent_set_model='${BUNDLE.model}'`.replace(/\s+/g, ' '),
        ),
        '14a 원 구성품 2라인의 세트 계보 소실(평면화)',
      ).toBe('2')

      // 4) 기억 판정 — 신규 평문 라인의 사용자 단가(123000, VAT 제외 계약 → ×1.1 = 135300)는
      //    기억되고(침묵 억제 금지 — R6 실증의 "123,000 미기억" 반증), head/PART-02 구성품
      //    라인은 각인 금지(R6 실증 88,000류 오염값이면 아래 exact 가 즉시 FAIL).
      await expectMemoryRowEventually(PARTNER_B.id, headLine!.productId, '135300')
      expect(memoryRow(PARTNER_B.id, headLine!.productId), '14a 신규 평문 라인 기억값 불일치').toBe(
        '135300.00|LINE_SAVE',
      )
      expect(memoryRowCount(PARTNER_B.id, headLine!.productId), '14a (B,PART-01) 기억행 중복').toBe('1')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        memoryPairsSnapshot(PARTNER_B.id, [otherComponentId]),
        '14a PUT 창구간 비대상 구성품(PART-02) 기억 delta 발생 = 배분가 각인(R6-H1 잔존, diff 참조)',
      ).toBe(orphanPairBeforePut)
      expect(memoryRow(PARTNER_B.id, BUNDLE.id), '14a parent BUNDLE_SET 기억 변형').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )
      expect(memoryRowCount(PARTNER_B.id, BUNDLE.id), '14a parent 기억행 수 변형').toBe('1')

      // 5) 실 GUI 재진입 캡처 — 세트 표시(원 head) + 신규 평문 라인 공존 화면.
      await page.goto(`${BASE_URL}/sales/${slipId}`)
      await page.waitForTimeout(1500)
      await capture(page, '37-KEY-slip-put-new-same-product-line-first-lineage-preserved')
    } finally {
      await ctx.close()
    }
  })

  /**
   * [G1/R6-H1 — QA 라이브 실증 변형(P3)] 견적에 세트(head PART-01 + PART-02)와 "같은 품목 단품
   * 라인(PART-01)" 이 공존할 때, 세트 head 를 삭제하고 단품 가격만 수정해 저장하면 종전에는 단품이
   * head 로 오귀속되고 사용자 최신 단가(88,000)가 구성품 판정으로 침묵 억제됐다(기억 77,000 고착).
   * two-pass 계약 기대: head 는 exact 전용이라 어떤 라인에도 승계되지 않고(head 0), PART-02 는
   * 고아 구성품으로 계보 보존, 단품은 평문 유지 + 88,000 이 정상 기억된다.
   *
   * 구성품 단품 라인 바인딩은 GUI lookup 의 scope 미필터(도달성 구멍 — 후속 fix 로 닫힐 수 있음)에
   * 의존하므로, 구성은 raw POST(by-id 검증 경로)로 안정 유발한다.
   */
  test('14b [R6-H1·견적] 세트 head 삭제 + 동일 품목 단품 가격 수정 — head 오귀속 없음 · 88000 기억 · 고아 구성품 보존', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    const SINGLE_COMPONENT_ID = BUNDLE_COMPONENT_IDS[0]! // QA797-PART-01 (세트 head 와 동일 품목)
    const ORPHAN_COMPONENT_ID = BUNDLE_COMPONENT_IDS[1]! // QA797-PART-02
    resetMemoryPair(PARTNER_A.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_A.id, productId))
    expect(componentMemorySnapshot(PARTNER_A.id), '14b 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      // 1) 구성 POST — [세트 1,100,000(VAT포함) + PART-01 단품 77,000(VAT포함)] → 서버 전개로
      //    R6 QA 실증과 동일한 3라인 상태(head PART-01 · PART-02 · 단품 PART-01)를 만든다.
      const created = await apiPost<EstimateDetailWire>(page, auth, '/slips/estimates', {
        partnerId: PARTNER_A.id,
        partnerName: PARTNER_A.name,
        lines: [
          { productId: BUNDLE.id, quantity: 1, unitPrice: PRICE_BUNDLE, priceVatInclusive: true },
          { productId: SINGLE_COMPONENT_ID, quantity: 1, unitPrice: '77000', priceVatInclusive: true },
        ],
      })
      const estimateId = created.id
      expect(activeLineCount('estimate_lines', estimateId), '14b 구성 POST 라인 수/head 수 불일치').toBe('3|1')
      expect(
        psql(
          `SELECT product_id::text FROM estimate_lines
           WHERE estimate_id='${estimateId}' AND is_deleted=false AND set_head`.replace(/\s+/g, ' '),
        ),
        '14b head 가 PART-01 전개 라인이 아님',
      ).toBe(SINGLE_COMPONENT_ID)
      expect(
        psql(
          `SELECT set_head::text || '|' || COALESCE(parent_set_model,'NULL') || '|' || unit_price_with_vat::text
           FROM estimate_lines
           WHERE estimate_id='${estimateId}' AND is_deleted=false
             AND product_id='${SINGLE_COMPONENT_ID}' AND parent_set_model IS NULL`.replace(/\s+/g, ' '),
        ),
        '14b 단품 PART-01 라인 사전 상태 불일치(평문·77000)',
      ).toBe('false|NULL|77000.00')
      await expectMemoryRowEventually(PARTNER_A.id, SINGLE_COMPONENT_ID, '77000')
      await expectMemoryRowEventually(PARTNER_A.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      // 실 GUI 사전 상태 캡처(편집 폼 — 3라인 공존).
      await page.goto(`${BASE_URL}/sales/estimates/${estimateId}/edit`)
      await expect(page.getByLabel('라인 3 모델명'), '14b 편집 폼 3라인 미표시').toBeVisible({ timeout: 30000 })
      await capture(page, '38-estimate-mixed-set-single-before-put')

      // 2) head 삭제 + 단품 77,000→88,000 PUT — R6 QA 실증과 동일 형태(라인 배열 계약).
      const detail = await apiGet<EstimateDetailWire>(page, auth, `/slips/estimates/${estimateId}`)
      // 구성 순서 결정성: 전개(lineNo 1=head PART-01, 2=PART-02) 뒤 단품 PART-01 = lineNo 3.
      // lineNo + productId + 77,000 삼중 술어로 head 전개 라인과의 오식별을 배제한다.
      const orphanLine = detail.lines.find((l) => l.lineNo === 2 && l.productId === ORPHAN_COMPONENT_ID)
      const singleLine = detail.lines.find(
        (l) => l.lineNo === 3 && l.productId === SINGLE_COMPONENT_ID && Number(l.unitPriceWithVat) === 77000,
      )
      expect(orphanLine, '14b GET 상세 lineNo 2 가 PART-02 가 아님(전개 순서 전제 붕괴)').toBeTruthy()
      expect(singleLine, '14b GET 상세 lineNo 3 이 77,000 단품 PART-01 이 아님(구성 전제 붕괴)').toBeTruthy()
      const orphanBeforePut = memoryPairsSnapshot(PARTNER_A.id, [ORPHAN_COMPONENT_ID])
      await apiPut(page, auth, `/slips/estimates/${estimateId}`, {
        ...mirrorEstimateHeader(detail),
        lines: [
          mirrorEstimateLine(orphanLine!),
          { ...mirrorEstimateLine(singleLine!), unitPrice: '88000', priceVatInclusive: true },
        ],
      })

      // 3) 계보 판정 — head 0(오귀속 금지) · PART-02 고아 계보 보존 · 단품 평문 + 88,000.
      expect(activeLineCount('estimate_lines', estimateId), '14b PUT 후 라인 수/head 수 불일치').toBe('2|0')
      expect(
        psql(
          `SELECT set_head::text || '|' || COALESCE(parent_set_model,'NULL') FROM estimate_lines
           WHERE estimate_id='${estimateId}' AND is_deleted=false
             AND product_id='${ORPHAN_COMPONENT_ID}'`.replace(/\s+/g, ' '),
        ),
        '14b PART-02 고아 구성품 계보 소실/오귀속(R6-H1 잔존)',
      ).toBe(`false|${BUNDLE.model}`)
      expect(
        psql(
          `SELECT set_head::text || '|' || COALESCE(parent_set_model,'NULL') || '|' || unit_price_with_vat::text
           FROM estimate_lines
           WHERE estimate_id='${estimateId}' AND is_deleted=false
             AND product_id='${SINGLE_COMPONENT_ID}'`.replace(/\s+/g, ' '),
        ),
        '14b 단품 PART-01 이 head 로 오귀속되거나 값이 어긋남(R6-H1 잔존)',
      ).toBe('false|NULL|88000.00')

      // 4) 기억 판정 — 사용자 최신 88,000 반영(77,000 고착 = 침묵 억제 잔존이면 FAIL),
      //    PART-02 는 여전히 기억 없음 + 창구간 delta 0, parent 불변.
      await expect.poll(
        () => memoryRow(PARTNER_A.id, SINGLE_COMPONENT_ID),
        {
          timeout: 5000,
          intervals: [25, 50, 100, 250, 500],
          message: '14b 단품 최신 단가(88,000) 기억 미반영 — 구성품 판정 침묵 억제(R6-H1 잔존)',
        },
      ).toBe('88000.00|LINE_SAVE')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        memoryPairsSnapshot(PARTNER_A.id, [ORPHAN_COMPONENT_ID]),
        '14b PUT 창구간 PART-02 기억 delta 발생(diff 참조)',
      ).toBe(orphanBeforePut)
      expect(memoryRow(PARTNER_A.id, BUNDLE.id), '14b parent BUNDLE_SET 기억 변형').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )

      // 5) 실 GUI 재진입 캡처 — head 없는 2라인 상태.
      await page.goto(`${BASE_URL}/sales/estimates/${estimateId}/edit`)
      await expect(page.getByLabel('라인 2 모델명'), '14b PUT 후 편집 폼 2라인 미표시').toBeVisible({ timeout: 30000 })
      await capture(page, '39-KEY-estimate-head-deleted-single-88000-no-lineage-theft')
    } finally {
      await ctx.close()
    }
  })

  /**
   * [R6-H2] 전표 복사 1클릭 오염 봉쇄 — 종전 FE duplicateSlip 은 전개된 구성품을 평면 POST /slips
   * 로 재전송해 계보 소실 + 배분가 LINE_SAVE 각인을 복사할 때마다 재생산했다. fix 계약 기대:
   * GUI '전표 복사' = 서버측 복사(POST /slips/{id}/duplicate) 정확히 1건 + 평면 POST /slips 0건,
   * 복사본 계보·가격 verbatim 승계, 복사 창구간 (parent+구성품) 기억 delta 0
   * (구성품 각인 금지 + BUNDLE_SET 재기록 없음 — SlipDuplicateService 계약).
   */
  test('15 [R6-H2·GUI] 전표 복사 — 서버측 duplicate 1건·평면 POST 0건 · 계보 1:1 · 기억 delta 0', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    resetMemoryPair(PARTNER_A.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_A.id, productId))
    expect(componentMemorySnapshot(PARTNER_A.id), '15 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      // 1) 원본 세트 전표 생성 (A, 1,100,000).
      await openSlipForm(page)
      await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.query)
      await pickWarehouse(page)
      await pickAutocomplete(page, '라인 1 품목', '품목 목록', BUNDLE.model)
      await page.waitForTimeout(1200)
      await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '15 세트 miss 판매가(lookup settle)')
      await unitPriceInput(page).fill(PRICE_BUNDLE)
      const sourceSlipId = await saveSlipAndWait(page)
      await expectMemoryRowEventually(PARTNER_A.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      const componentIds = [...BUNDLE_COMPONENT_IDS].sort().join(',')
      const sourceLineage = bundleLineageSnapshot('slip_lines', sourceSlipId)
      expect(bundleLineageSummary('slip_lines', sourceSlipId), '15 원본 세트 전개 상태 불일치').toBe(
        `2|1|2|${componentIds}`,
      )

      await page.goto(`${BASE_URL}/sales/${sourceSlipId}`)
      await expect(
        page.getByRole('button', { name: '전표 복사' }),
        '15 전표 복사 버튼 미표시',
      ).toBeVisible({ timeout: 30000 })
      await capture(page, '40-slip-bundle-copy-source-detail')

      // 2) 복사 창구간 네트워크·기억 delta 관측 준비 — window.confirm 은 실 다이얼로그 수락.
      const memoryBeforeCopy = memoryPairsSnapshot(PARTNER_A.id, [BUNDLE.id, ...BUNDLE_COMPONENT_IDS])
      const slipPosts: string[] = []
      const onRequest = (req: Request): void => {
        if (req.method() === 'POST' && req.url().includes('/slips')) slipPosts.push(req.url())
      }
      page.on('request', onRequest)
      page.once('dialog', (dialog) => {
        void dialog.accept()
      })
      const duplicateResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'POST'
          && response.url().includes(`/slips/${sourceSlipId}/duplicate`),
        { timeout: 30000 },
      )
      await page.getByRole('button', { name: '전표 복사' }).click()
      const duplicateResponse = await duplicateResponsePromise
      expect(duplicateResponse.ok(), `15 서버측 복사 실패: HTTP ${duplicateResponse.status()}`).toBeTruthy()
      const copySlipId = ((await duplicateResponse.json()) as { data?: { id?: string } }).data?.id ?? ''
      expect(copySlipId, '15 duplicate 응답에 신규 slipId 누락').toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      await page.waitForURL(`**/sales/${copySlipId}`, { timeout: 30000 })
      page.off('request', onRequest)

      // 3) wire 계약 — duplicate 정확히 1건, 평면 재전송(POST /slips) 0건(구 결함 경로 봉쇄).
      const duplicatePosts = slipPosts.filter((u) => u.includes(`/slips/${sourceSlipId}/duplicate`))
      const flatCreatePosts = slipPosts.filter((u) => /\/slips(\?|$)/.test(u))
      console.log('[#809 R6-postfix] 15 복사 창구간 POST:', JSON.stringify(slipPosts))
      expect(duplicatePosts.length, '15 서버측 duplicate 호출이 정확히 1건이 아님').toBe(1)
      expect(flatCreatePosts.length, '15 평면 POST /slips 재전송 발생 = R6-H2 결함 경로 잔존').toBe(0)

      // 4) 복사본 계보·가격 verbatim + 복사 창구간 기억 delta 0 (BUNDLE_SET 재기록도 금지).
      expect(bundleLineageSummary('slip_lines', copySlipId), '15 복사본 세트 메타 불일치').toBe(
        `2|1|2|${componentIds}`,
      )
      expect(bundleLineageSnapshot('slip_lines', copySlipId), '15 복사본 계보/가격 verbatim 승계 실패').toBe(
        sourceLineage,
      )
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        memoryPairsSnapshot(PARTNER_A.id, [BUNDLE.id, ...BUNDLE_COMPONENT_IDS]),
        '15 복사 창구간 기억 delta 발생(구성품 각인 또는 BUNDLE_SET 재기록 — diff 참조)',
      ).toBe(memoryBeforeCopy)

      await page.waitForTimeout(800)
      await capture(page, '41-KEY-slip-duplicate-lineage-preserved-memory-zero-delta')
    } finally {
      await ctx.close()
    }
  })

  /**
   * [R6-H3·전표] 버전이력 스냅샷 계보 왕복 — 종전 스냅샷 Line record 에 setHead/parentSetModel 이
   * 없어 복원 시 평면 재생성 → 이후 무수정 저장 1회에 배분가 오염이 재유입됐다. fix 계약 기대:
   * fix 이후 만들어진 스냅샷은 계보를 담고, 최초 revision 복원 후에도 세트 계보·가격이 생성 직후와
   * 동일하며, 복원 전·후 전 구간에서 기억 delta 0 + 복원 후 무수정 mirror PUT 도 무오염.
   * (collab 문서모드 복원 2경로는 동일 record 를 쓰므로 record 차원 왕복은 본 시나리오가 커버 —
   *  경로 자체는 SSE 세션 필요로 미유발, 파일 상단 정직 기록 참조.)
   */
  test('16a [R6-H3·전표] EDIT 후 최초 revision 복원 — 계보 보존 · 복원/후속 PUT 기억 delta 0', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPair(PARTNER_B.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_B.id, productId))
    expect(componentMemorySnapshot(PARTNER_B.id), '16a 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      // 1) 세트 전표 생성 (B) → 생성 직후 계보 기준선.
      await openSlipForm(page)
      await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_B.query)
      await pickWarehouse(page)
      await pickAutocomplete(page, '라인 1 품목', '품목 목록', BUNDLE.model)
      await page.waitForTimeout(1200)
      await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '16a 세트 miss 판매가(lookup settle)')
      await unitPriceInput(page).fill(PRICE_BUNDLE)
      const slipId = await saveSlipAndWait(page)
      await expectMemoryRowEventually(PARTNER_B.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      const componentIds = [...BUNDLE_COMPONENT_IDS].sort().join(',')
      const expectedSummary = `2|1|2|${componentIds}`
      const lineageAtCreate = bundleLineageSnapshot('slip_lines', slipId)
      expect(bundleLineageSummary('slip_lines', slipId), '16a 생성 직후 세트 메타 불일치').toBe(expectedSummary)

      // 2) EDIT revision 생성 — 헤더 memo 만 바꾼 mirror PUT(라인 무수정, 계보 보존 전제).
      const detailV1 = await apiGet<SlipDetailWire>(page, auth, `/slips/${slipId}`)
      const componentsBeforeEdit = componentMemorySnapshot(PARTNER_B.id)
      await apiPut(page, auth, `/slips/${slipId}/sales`, {
        ...mirrorSlipHeader(detailV1),
        memo: '[R6-H3] rev2 편집 프로브',
        lines: detailV1.lines.map(mirrorSlipLine),
      })
      expect(bundleLineageSnapshot('slip_lines', slipId), '16a mirror PUT 이 계보/가격을 훼손').toBe(lineageAtCreate)
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_B.id),
        '16a mirror PUT 창구간 구성품 기억 delta 발생(diff 참조)',
      ).toBe(componentsBeforeEdit)

      // 3) 최초 revision 복원 — 스냅샷 계보 왕복의 본 판정.
      const componentsBeforeRestore = componentMemorySnapshot(PARTNER_B.id)
      const restoredFrom = await restoreToEarliestRevision(
        page,
        auth,
        `/api/v1/slips/${slipId}/revisions`,
        (revisionNo) => `/api/v1/slips/${slipId}/revisions/${revisionNo}/restore`,
      )
      console.log('[#809 R6-postfix] 16a 복원 대상 revision:', restoredFrom)
      expect(bundleLineageSummary('slip_lines', slipId), '16a 복원 후 세트 메타 소실(R6-H3 잔존)').toBe(
        expectedSummary,
      )
      expect(bundleLineageSnapshot('slip_lines', slipId), '16a 복원 후 계보/가격이 생성 직후와 다름(R6-H3 잔존)').toBe(
        lineageAtCreate,
      )
      const restoredMemo = await apiGet<SlipDetailWire>(page, auth, `/slips/${slipId}`)
      expect(restoredMemo.memo ?? null, '16a 복원이 헤더(memo)를 되돌리지 않음 — 복원 미적용 의심').toBe(
        detailV1.memo ?? null,
      )
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_B.id),
        '16a 복원 창구간 구성품 기억 delta 발생(diff 참조)',
      ).toBe(componentsBeforeRestore)

      // 4) 복원 후 무수정 mirror PUT — "복원된 문서의 후속 저장 1회 오염"(H3 2차 피해) 재현 금지.
      const detailV3 = await apiGet<SlipDetailWire>(page, auth, `/slips/${slipId}`)
      const componentsBeforeFinalPut = componentMemorySnapshot(PARTNER_B.id)
      await apiPut(page, auth, `/slips/${slipId}/sales`, {
        ...mirrorSlipHeader(detailV3),
        lines: detailV3.lines.map(mirrorSlipLine),
      })
      expect(
        bundleLineageSnapshot('slip_lines', slipId),
        '16a 복원 후 무수정 PUT 에서 계보/가격 훼손(R6-H1×H3 복합 잔존)',
      ).toBe(lineageAtCreate)
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_B.id),
        '16a 복원 후 무수정 PUT 창구간 구성품 기억 delta 발생(diff 참조)',
      ).toBe(componentsBeforeFinalPut)
      expect(memoryRow(PARTNER_B.id, BUNDLE.id), '16a parent BUNDLE_SET 기억 변형').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )

      await page.goto(`${BASE_URL}/sales/${slipId}`)
      await page.waitForTimeout(1500)
      await capture(page, '42-KEY-slip-revision-restore-lineage-preserved')
    } finally {
      await ctx.close()
    }
  })

  /** [R6-H3·견적] 16a 와 동일 왕복을 견적 스냅샷(EstimateSnapshot.Line)에 대해 검증. */
  test('16b [R6-H3·견적] EDIT 후 최초 revision 복원 — 계보 보존 · 복원/후속 PUT 기억 delta 0', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPair(PARTNER_A.id, BUNDLE.id)
    BUNDLE_COMPONENT_IDS.forEach((productId) => resetMemoryPair(PARTNER_A.id, productId))
    expect(componentMemorySnapshot(PARTNER_A.id), '16b 자체 reset 직후 구성품 기억행 잔존').toBe('')

    try {
      // 1) 세트 견적 생성 (A) — GUI 경로(12b 와 동일 진입).
      await openEstimateForm(page)
      await pickAutocomplete(page, '거래처 검색', '거래처 목록', PARTNER_A.query)
      await expect(page.getByLabel('거래처명')).toHaveValue(PARTNER_A.name, { timeout: 15000 })
      await fillEstimateModel(page, 1, BUNDLE.model)
      await expectUnitPriceDigits(page, BUNDLE.sellingPrice, 1, '16b 세트 판매가')
      await unitPriceInput(page).fill(PRICE_BUNDLE)
      const estimateId = await saveEstimateDraftAndGetId(page)
      await expectMemoryRowEventually(PARTNER_A.id, BUNDLE.id, PRICE_BUNDLE, 'BUNDLE_SET')
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      const componentIds = [...BUNDLE_COMPONENT_IDS].sort().join(',')
      const expectedSummary = `2|1|2|${componentIds}`
      const lineageAtCreate = bundleLineageSnapshot('estimate_lines', estimateId)
      expect(bundleLineageSummary('estimate_lines', estimateId), '16b 생성 직후 세트 메타 불일치').toBe(
        expectedSummary,
      )

      // 2) EDIT revision — memo 만 바꾼 mirror PUT (VAT 포함 단가 왕복, 앱 계약과 동일).
      const detailV1 = await apiGet<EstimateDetailWire>(page, auth, `/slips/estimates/${estimateId}`)
      const componentsBeforeEdit = componentMemorySnapshot(PARTNER_A.id)
      await apiPut(page, auth, `/slips/estimates/${estimateId}`, {
        ...mirrorEstimateHeader(detailV1),
        memo: '[R6-H3] rev2 편집 프로브',
        lines: detailV1.lines.map(mirrorEstimateLine),
      })
      expect(bundleLineageSnapshot('estimate_lines', estimateId), '16b mirror PUT 이 계보/가격을 훼손').toBe(
        lineageAtCreate,
      )
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_A.id),
        '16b mirror PUT 창구간 구성품 기억 delta 발생(diff 참조)',
      ).toBe(componentsBeforeEdit)

      // 3) 최초 revision 복원.
      const componentsBeforeRestore = componentMemorySnapshot(PARTNER_A.id)
      const restoredFrom = await restoreToEarliestRevision(
        page,
        auth,
        `/api/v1/slips/estimates/${estimateId}/revisions`,
        (revisionNo) => `/api/v1/slips/estimates/${estimateId}/revisions/${revisionNo}/restore`,
      )
      console.log('[#809 R6-postfix] 16b 복원 대상 revision:', restoredFrom)
      expect(bundleLineageSummary('estimate_lines', estimateId), '16b 복원 후 세트 메타 소실(R6-H3 잔존)').toBe(
        expectedSummary,
      )
      expect(
        bundleLineageSnapshot('estimate_lines', estimateId),
        '16b 복원 후 계보/가격이 생성 직후와 다름(R6-H3 잔존)',
      ).toBe(lineageAtCreate)
      const restoredDetail = await apiGet<EstimateDetailWire>(page, auth, `/slips/estimates/${estimateId}`)
      expect(restoredDetail.memo ?? null, '16b 복원이 헤더(memo)를 되돌리지 않음 — 복원 미적용 의심').toBe(
        detailV1.memo ?? null,
      )
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_A.id),
        '16b 복원 창구간 구성품 기억 delta 발생(diff 참조)',
      ).toBe(componentsBeforeRestore)

      // 4) 복원 후 무수정 mirror PUT — 후속 저장 1회 오염 금지(H3 2차 피해).
      const detailV3 = await apiGet<EstimateDetailWire>(page, auth, `/slips/estimates/${estimateId}`)
      const componentsBeforeFinalPut = componentMemorySnapshot(PARTNER_A.id)
      await apiPut(page, auth, `/slips/estimates/${estimateId}`, {
        ...mirrorEstimateHeader(detailV3),
        lines: detailV3.lines.map(mirrorEstimateLine),
      })
      expect(
        bundleLineageSnapshot('estimate_lines', estimateId),
        '16b 복원 후 무수정 PUT 에서 계보/가격 훼손(R6-H1×H3 복합 잔존)',
      ).toBe(lineageAtCreate)
      await page.waitForTimeout(MEMORY_FLUSH_GRACE_MS)
      expect(
        componentMemorySnapshot(PARTNER_A.id),
        '16b 복원 후 무수정 PUT 창구간 구성품 기억 delta 발생(diff 참조)',
      ).toBe(componentsBeforeFinalPut)
      expect(memoryRow(PARTNER_A.id, BUNDLE.id), '16b parent BUNDLE_SET 기억 변형').toBe(
        `${PRICE_BUNDLE}.00|BUNDLE_SET`,
      )

      await page.goto(`${BASE_URL}/sales/estimates/${estimateId}/edit`)
      await expect(page.getByLabel('라인 2 모델명'), '16b 복원 후 편집 폼 2라인 미표시').toBeVisible({ timeout: 30000 })
      await capture(page, '43-KEY-estimate-revision-restore-lineage-preserved')
    } finally {
      await ctx.close()
    }
  })
})
