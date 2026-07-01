# coedit 하드닝 — applySnapshot corrupt-update 내성 (설계)

> 2026-07-01. #691 견적 라이브 2세션 QA 적발. 개발책임자 "세션 위반 전수 보완" 지시의 QA 발견 결함 fix.

## 문제 (라이브 QA 실측)
`createCoeditProvider.ts` 의 `applySnapshot`(단일텍스트 provider L281·doc provider L573)이 스냅샷 updates 를 per-update 예외처리 없이 `Y.applyUpdate` 적용:
```
for (const update of snapshot.updates) { Y.applyUpdate(doc, decodeBase64Update(update), REMOTE_ORIGIN) }
```
→ **updates 중 1건이라도 유효하지 않은 Yjs 바이트면 throw** → (초기 로드 시) `cleanupFailedInitialization`+rethrow → provider 생성 reject → 소비자 평문 폴백. 즉 **문서 coedit 히스토리에 corrupt update 1건 = 그 문서 coedit 영구 브릭**(히스토리 클리어 전까지). #691 QA 에서 견적 829e012a 가 테스트 문자열 오염으로 coedit 진입 불가였던 근본 원인.

## 수정 (내성 = corrupt update silently skip)
`applySnapshot`(양 provider) + 스트림 이벤트 apply(L297·L344 등 remote update 수신부)의 `Y.applyUpdate` 를 **per-update try/catch** 로 감싸 corrupt update 는 skip + `console.warn`(1회성, 노이즈 최소). 정상 update 는 계속 적용 → corrupt 1건이 전체/문서를 브릭하지 않음. `decodeBase64Update` 실패(비base64)도 동일 방어.
- 공유 infra라 slip·주문·견적·회계·결재·배차 전 coedit 문서 수혜.
- fail-safe 방향: corrupt skip 후에도 provider 는 생성(부분 상태라도 편집 가능) — 현 "전체 브릭"보다 우수.

## 검증
- 단위테스트: applySnapshot 에 corrupt update 섞인 스냅샷 → provider 정상 생성 + 정상 update 반영 + corrupt skip(throw 안 함). 스트림 corrupt 이벤트 skip.
- 라이브 QA: 오염 견적(829e012a) 재진입 시 coedit 브릭 안 되고 정상 update 만 반영(또는 dev cleanup 후 정상).
- 회귀: 기존 collab/realtime 테스트 무영향.

## 범위 외(별도)
EstimateRealtimeClient/createAuditApi 경로 `/api/v1/estimates`→`/slips/estimates` = 별도 경로 fix PR. 세션 소급 sweep = 별도.
