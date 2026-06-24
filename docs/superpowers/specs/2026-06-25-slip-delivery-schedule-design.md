# 출고전표 배송일정(M상N하) 자동 — 구조화 태그 spec

> 작성일: 2026-06-25 · PM(Opus) brainstorming(superpowers) + 개발책임자 대화 · 상태: **개발책임자 설계 승인 → spec 박제 → 자동 착수(spec 리뷰 게이트 위임 생략) → writing-plans**
>
> 관련 메모리: [[feedback_canonical_workflow]] · [[project_order_slip_conversion]] · [[project_quotation_estimate_app_state]] · [[feedback_uuid_no_user_visibility]] · [[project_kst_timezone_standard]] · [[feedback_migration_fresh_postgres_probe]] · [[feedback_print_design_iteration]]
> 직전 슬라이스: 출고 컷오프(#594, 머지). 본 에픽은 그 후속(배송태그 → 상차/하차 일정).

---

## 0. 목표
출고전표 배송태그(지방/야적)별 **상차(M)/하차(N)** 일정을 규칙대로 자동 계산해 **구조화된 "태그"**(인식 데이터)로 전표에 보유하고, 특이사항 앞에 `25상26하` 형식으로 표시한다. **하차일(N) 편집**·**당착(지방 당일하차) 옵션** 제공. 레거시 종합견적서(estimate-app)가 특이사항에 **단순 텍스트**로 넣던 것을 우리 시스템은 **구조화 태그**로 처리한다.

## 1. 확정 결정 (개발책임자 2026-06-25)
| # | 항목 | 확정 |
|---|---|---|
| D1 | 데이터 모델 | **구조화** — `Slip`에 `unload_date`(하차일 N, nullable) 신규. 상차 M = 기존 `slip_date`(출고일, 잠금). 자유텍스트 특이사항과 **별개로 인식되는 "태그"**(레거시 텍스트 방식 ❌). |
| D2 | 일정 규칙 | (estimate-app 레퍼런스 1:1) N 기본 = M+1. **N이 일요일이면 → 월요일**(일요일 skip), 단 **(야적 && M=토요일) → 일요일 유지**. |
| D3 | prefix 형식 | `{M일}상{N일}하 `(예 `25상26하 ` — 일 숫자, 끝 공백 1). **지방 && N==M(당착) → `당착 `**. 특이사항 앞 표시(중복 방지). |
| D4 | 적용 태그 | **지방(REGION)/야적(STACK)만**. **당착 = 지방 한정 옵션**(N=당일). 그 외 태그는 일정 prefix 없음. |
| D5 | 편집 | **N 편집 가능 · M 잠금**. 선택 가능(태그 선택 시 기본값이되 끄기/비우기 가능, 강제 아님). |
| D6 | 범위 | **출고전표(slip) 단일 진실원** + 데스크탑 SlipForm/인쇄(`DispatchDocument`) + **내부 데스크탑 주문서→출고** + **데스크탑 견적→출고 발행 시 이어받기**. 견적 화면 자체는 미변경(태그는 출고에서 확정). **제외**: 웹 estimate-app·order-app. |
| D7 | 비목표(YAGNI) | 공휴일 달력(일요일 skip만) · M(출고일) 편집 · 웹앱 화면 변경 · 기존 전표 memo 마이그레이션. |

## 2. 아키텍처
- **slip-service(BE)**: `Slip.unload_date`(구조화 N) + 일정 계산 유틸 `DeliverySchedule`(M/N 규칙) + 응답 DTO에 **파생 라벨**(`deliveryScheduleLabel`: "25상26하" / "당착" / null) — 메모에 저장하지 않고 (slipDate, unloadDate, deliveryTag)에서 파생(= 구조화 태그, 재계산·이어받기 용이).
- **desktop(FE)**: SlipForm 하차일(N) 입력 + 당착 토글(지방) + 특이사항 표시는 `deliveryScheduleLabel + memo`. 인쇄 `DispatchDocument` 동일.
- **전파**: 견적→출고·주문→출고·editHeader/v20에서 태그 확정 시 unload_date 기본 계산.

```
[SlipForm: 태그=지방 선택]
   → unload_date 기본계산(규칙) 필드 자동 채움(편집가능) + 당착 토글
   → 전표 저장: slip.unload_date(구조화)
[조회/인쇄] 특이사항 = deliveryScheduleLabel(slipDate,unloadDate,tag) + " " + memo
[견적/주문 → 출고 발행] tag 있으면 unload_date 기본계산 이어받기
```

## 3. 일정 규칙 (`DeliverySchedule` — estimate-app index.ejs:15264-15273 레퍼런스 1:1)
```
computeUnloadDate(slipDate M, tag):
  if tag ∉ {REGION, STACK}: return null            // 일정 없음
  N = M + 1일
  if N.dayOfWeek == SUNDAY:
     if !(tag==STACK && M.dayOfWeek==SATURDAY): N = N + 1일   // 일요일 skip → 월요일
  return N

scheduleLabel(slipDate M, unloadDate N, tag):
  if tag ∉ {REGION, STACK} or N == null: return null
  if tag==REGION and N == M: return "당착"        // 지방 당착(당일 하차)
  return "{M.day}상{N.day}하"                      // 예 "25상26하"
```
- **M 잠금**: slipDate 변경 불가(기존 정책). N은 사용자 편집(기본=computeUnloadDate, 당착=N을 M으로).
- KST 표준([[project_kst_timezone_standard]]) — 날짜 계산은 KST `Clock`/`LocalDate` 기준(요일 판정 포함).

## 4. 데이터 모델 (slip-service, Flyway V52)
- `slips`에 `unload_date DATE NULL` 컬럼 추가(M상N하 적용 전표만 값 보유). 기존 행 NULL(YAGNI — memo 텍스트 마이그 안 함). 적용 마이그 불변·fresh probe([[feedback_migration_fresh_postgres_probe]]).
- `Slip` 엔티티 `private LocalDate unloadDate;` + 도메인 메서드 `applyDeliverySchedule(DeliveryTag, LocalDate unloadOverride)`(태그 기본계산 or override, 지방 당착=slipDate). M 잠금.

## 5. BE 적용 지점
- **생성/발행 시 기본 계산**: `SlipService.create` + 견적변환 + 모바일 주문 + `SlipPublishService`(견적/주문/병합) — 태그(또는 확정 시) 있으면 `unload_date = computeUnloadDate(slipDate, tag)`. (컷오프 슬라이스에서 정리한 createOutbound 경로 재사용.)
- **태그 확정/변경 시 재계산**: `editHeader`/`updateSlip(v20)` 에서 deliveryTag 신규/변경 시 unload_date 재계산(사용자 override 없으면). 컷오프 게이트와 같은 지점.
- **요청 DTO**: CreateSlipRequest/EditHeaderRequest/UpdateSlipRequest 에 `unloadDate`(nullable, override) + 당착은 `unloadDate==slipDate`로 표현(별도 flag 불요). null이면 규칙 기본.
- **응답 DTO**: SlipDetailResponse/SlipResponse 에 `unloadDate` + `deliveryScheduleLabel`(파생).
- **기존 `applyDeliveryTagAutoMemo` 폐기/대체**: 더 이상 memo에 "[태그] 상차/하차" 텍스트 prepend 안 함(구조화로 전환). 기존 전표 memo는 그대로(표시 시 deliveryScheduleLabel=null이라 중복 없음).

## 6. FE (clients/desktop)
- **SlipFormPage**: 지방/야적 선택 시 **하차일(N) 필드 노출**(기본=규칙 계산, 편집가능), **출고일(M) 잠금 표시**. **지방: 당착 토글/체크**(N=출고일). 태그 해제 or 비활성 시 일정 없음. 특이사항 표시 영역에 `deliveryScheduleLabel` 프리뷰.
- **SlipDetailPage/인쇄 DispatchDocument**: 특이사항 = `deliveryScheduleLabel`(구조화, 강조 가능) + 자유 memo. (컷오프 슬라이스에서 `[지방]` 텍스트 제거·`memoWithoutTagPrefix` 도입 → 이제 deliveryScheduleLabel로 대체. 중복 표기 정리.)
- design-system 컴포넌트, UUID 비노출, 한국어.

## 7. 테스트 / QA
- BE: `DeliveryScheduleTest`(규칙 단위 — 평일 익일·금요일출고 토요일하차·**지방 토→월**·**야적 토→일 유지**·당착 N=M·비적용태그 null·월말경계 `30상1하`) + 발행/editHeader 재계산 IT + Flyway V52 fresh probe. **ci.yml 필터 등재**(신규 IT 패키지, [[feedback_ci_test_filter_false_green]]) + 로컬 실제 실행([[feedback_changed_module_full_test_before_push]]).
- FE: vitest(하차일 기본계산·당착·라벨 파생·N편집). 🐳 라이브 QA: 지방/야적 전표 생성→하차일 자동·당착 토글·인쇄 특이사항 `25상26하`/`당착` 단계별 스샷. 견적/주문→출고 이어받기 실증.

## 8. 미해결 (착수 시 plan 정찰)
- M상N하 prefix를 memo 저장 대신 **파생 라벨**로 — SlipDetail/Board/Print 응답 DTO 정확 위치 + 컷오프 슬라이스 `memoWithoutTagPrefix`와 정합(중복 제거).
- 당착 UI 표현(체크박스 vs N=출고일 직접 입력) — 데스크탑 폼 패턴.
- 월말/연말 경계 일 표기(예 `30상1하` vs `30상01하`) — 일 숫자 그대로(leading zero 없음) 기본.
- 견적→출고(EstimateToSlipConverter)는 현재 태그 null → unload_date도 null(이후 SlipForm 확정 시 계산). 컷오프 D8과 동일 패턴.
