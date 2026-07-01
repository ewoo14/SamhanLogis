# 주문 full-form coedit parity fix — provider deps 안정화 + Design 회귀 (설계)

> 2026-07-01. #689 세션 소급(defect-parity vs #691)이 적발. 주문은 견적 #691 fix 이전 머지라 동일 결함 잔존.

## 문제 (#689 소급 FE)
- **[HIGH] SalesPartnerOrderDetailPage.tsx:450** provider useEffect deps 에 `query.data` 전체 객체 → PUT 저장 후 invalidateQueries → query.data 새 참조 → effect 재실행 → 편집 중 provider destroy/재생성(저장 직후 세션 단절). #691 견적이 `estimateDataRef`(ref)로 해소한 것과 동일.
- **[LOW] :1539·:1551** 수량/단가 CollaborativeSlipInput 이 inputMode/inputStyle 미전달(#691 견적 반영분 누락).

## 수정 (#691 견적 fix 이식)
1. **deps 안정화**: `orderDataRef`(useRef) 도입 → coedit provider useEffect 가 `query.data` 대신 ref 로 최신 order 읽기, deps 에서 `query.data` 제거([canCollabEdit, editOpen, isValidId, orderId]). 리페치/invalidate 재생성 차단(저장 후 세션 유지).
2. **Design props**: 수량 inputMode="numeric"·단가 inputMode="decimal" + inputStyle={{textAlign:'right', fontVariantNumeric:'tabular-nums'}} (견적 패턴 동일).

## 검증
- 단위: 기존 SalesPartnerOrderDetailPage.coedit.test 회귀 + deps 안정화(저장 후 provider 유지) 케이스 보강.
- **라이브 2세션 주문 QA**: 두 창 주문 수정모달 동시편집 → 저장 후에도 세션 유지·양방향 SSE 반영(견적 QA 패턴). = #689 소급의 라이브 QA 겸함.
- 공유 infra(#691/#692) 커버분은 회귀만 확인.
