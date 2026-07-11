# #787 잔여 — 거래처 주문서 인쇄물 상태라벨 SSOT 통합 (#790)

- **일자**: 2026-07-11
- **PR**: #790 · **연관 Issue**: #787(부분 해결, 전체 close 아님)
- **계열**: #786(PR) "후속 분리" 항목 ③ 인쇄라벨 부분 완료. #786/#788(raw enum→displayName)·#789(Tier2 500)와 동일 #787 잔여 계열.
- **워크플로우**: 표준 Opus(PM)+Codex 듀얼리뷰 — Codex 구현 → Opus 5-agent+실렌더 QA → Codex 5-agent 적대 재검증 → 0수렴 → CI → 머지.

## 배경
`PartnerOrderPrintService`가 별도 로컬 `statusLabel()` switch로 상태를 문자열 매핑(`DRAFT="초안"·CONFIRMING="확인 중"·CONFIRMED="확정"`)했는데, 앱 배지 SSOT(백엔드 `PartnerOrderStatus.getDisplayName()` = `진행중/보류/확인중/완료/취소/전환완료`, FE `sales.ts PARTNER_ORDER_STATUS_LABEL`도 동일)와 **불일치**. 인쇄물만 구 문구가 남아 거래처가 받는 대외문서와 앱 표기가 어긋나 있었음.

#786 리뷰에서 이 항목을 "design intent 확인 필요"로 유보(기계적 raw-enum 치환과 달리 대외 문구 판단 수반)했고, 본 PR이 그 확인 절차를 거쳐 처리.

## 변경
| 파일 | 변경 |
|---|---|
| `PartnerOrderPrintService.java` | 로컬 `statusLabel()` switch 제거 → `order.getStatus().getDisplayName()` 직접 호출. 미사용 `PartnerOrderStatus` import 제거 |
| `PartnerOrderPrintIT.java` | 거래처명 픽스처 `확정테스트상사`→`인쇄테스트상사`(상태라벨 문자열 겹침 제거). 약한 `containsString("확정")`(픽스처명으로도 통과) → 강한 `containsString(">완료<")`(상태셀 태그 렌더 회귀보호). RED→GREEN 확인 |

## 상태라벨 매핑 (인쇄물 ↔ 앱 통일)
| Status | 이전(인쇄) | 이후(SSOT) |
|---|---|---|
| DRAFT | 초안 | **진행중** |
| CONFIRMING | 확인 중 | **확인중** |
| CONFIRMED | 확정 | **완료** |
| ON_HOLD/CANCELED/CONVERTED | 보류/취소/전환완료 | 동일 |

## 개발책임자 결정 (Design P1 disposition)
Design 차원이 "이 인쇄물은 거래처가 받는 대외문서(PARTNER 접근 가능·거래처 날인란)이며 CONFIRMED→'완료'가 배송완료/거래종결로 오인 소지"를 P1로 제기. 대외-오인 리스크를 **명시 표면화하여 개발책임자 재확인** → **SSOT 유지(진행중/완료) 확정**.
- 근거: 도메인 상태모델(`project_partner_order_status_model.md`)이 이미 `완료=CONFIRMED`로 라벨 확정 + FE 앱 배지도 이미 "완료" → 인쇄물을 여기에 정렬(오히려 기존 불일치 정상화). 오디언스별 문구 분리(옵션 B)는 미채택.

## 리뷰·검증
- **Opus 5-agent**: BE PASS(NPE 불가·getDisplayName 6상수 컴파일강제·import 제거 안전·인쇄/라벨 잔존 0)·FE PASS(서버렌더 위임·앱 배지 이미 일치)·DevOps PASS(CI 필터없이 전체실행)·QA GREEN·Design P1→개발책임자 판정.
- **Codex 5-agent 적대**: Findings 0(sweep 잔존 0·SSOT 정확·NPE 불가·assert 견고·diff 청결).
- **실렌더 QA**: `PartnerOrderPrintIT`가 렌더한 실제 print HTML을 Playwright 캡처 3종(`docs/qa/e787-print-label/`) — CONFIRMED "완료"·DRAFT "진행중"·레이아웃(품목표/합계/날인란) 정상·UUID 미노출.
- **테스트**: `:services:partner-order-service:test --rerun-tasks --no-build-cache` genuine GREEN(58 suites/360 tests/0 fail). CI 27/27 pass.

## 잔여 (#787 계속)
DefaultEditLockGuard(shared)·UUID interpolation sweep(70파일)·auth ResponseStatusException 마스킹 등은 별도 후속 PR. **본 PR 머지로 #787 전체 close 금지.**

## FE 참고(범위 밖)
`MergeConvertDialog.tsx`에 상태라벨 로컬 중복 상수 존재(현재 값은 SSOT와 일치·드리프트 리스크만) → 별도 FE 정리 후속(본 PR 대상 아님).
