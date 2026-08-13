# #1072 회계 계정과목 실제 사용처 정찰

> 조사일: 2026-08-12 (Asia/Seoul)  
> 브랜치: `feat/1072-1144-accounting-canon`  
> 범위: 조사·보고서 작성만. 구현 코드, Git 상태, 공유 DB는 변경하지 않았다.  
> DB 명령: `accounting_db`, `partner_db`, `inventory_db`에 대한 `SELECT`와 psql 메타 조회만 실행했다.

## 0. 먼저 바로잡을 전제

이 보고서의 수치는 **공유 개발 DB의 현재 행**을 센 것이다. 운영 원본이라고 부르지 않는다. 저장소 결정 기록 `.claude/memory/feedback_dev_seed_is_not_real_data.md`는 다음처럼 경고한다.

> “로컬 DB 는 dev 시드다.”  
> “수치를 ‘실 데이터’라고 쓰기 전에 출처를 확인한다.”

이번 10개 코드의 활성 분개를 실제로 대조하니 그 경고가 그대로 발화했다.

- `103`: 10전표 전부 `E3S3 실QA`, 원 입금보고서 5건과 역분개 5건이다.
- `142`: 5전표 전부 `JournalSeeder`가 만든 감가상각 검증 시드다.
- `201`: 3전표 전부 `[DEV-SEED]`다.
- `210`: 1전표 전부 `[DEV-SEED]`이며 전표일도 조사일 이후인 2026-12-31이다.
- `220`: 34전표 중 29건은 `JournalSeeder`, 5건은 `[DEV-SEED]`다.
- `255`: 7전표는 개발 DB에서 실제 세금계산서 발행·취소 경로를 탄 행이지만 운영 원본임을 입증할 자료는 없다.
- `104`, `105`, `900`, `919`: 직접 분개 0건이다.

따라서 이 보고서가 확정할 수 있는 것은 **현재 개발 DB의 사용 행·코드 경로·이관 대상 수**다. 실제 회사 운영 거래의 업무 의미는 원본 이카운트 계정상세/전표가 없는 항목에서 확정하지 않는다.

조사 단위도 분리한다.

- **전표 건수**: 활성 `journals`의 distinct `id` 수
- **라인 건수**: 해당 코드의 활성 `journal_lines` 수
- 대상 전표가 모두 한 코드 라인씩만 가져 이번에는 전표 수와 라인 수가 같다.
- `POSTED`와 `REVERSED`를 함께 센다. 이 시스템은 원분개를 삭제하지 않고 보상분개로 상쇄한다는 기존 결정이 있기 때문이다.
- “최근 90일”은 조사일 2026-08-12 기준이며 미래일자 시드는 별도 표시한다.

## 1. 9건(실제 코드 10개) 사용 실측 요약 — 전표 건수·금액 합계·기간 분포

| 조사 건 | 코드 | 등록 명칭 | 전표/라인 | 차변 합계 | 대변 합계 | 최초~최근 전표일 | 최근성·출처 판정 |
|---|---|---|---:|---:|---:|---|---|
| A-1 | `103` | 당좌예금 | 10 / 10 | 1,250,000 | 1,250,000 | 2026-07-04 하루 | 최근 90일 10건이나 전부 실QA 원분개·역분개; 순액 0 |
| A-2 | `104` | 정기예금 | 0 / 0 | 0 | 0 | 없음 | 분개상 죽은 코드; 자금현황 코드 목록에는 존재 |
| A-3 | `105` | 정기적금 | 0 / 0 | 0 | 0 | 없음 | 분개와 자금현황 목록 모두 사용 0 |
| A-4 | `201` | 외상매입금 | 3 / 3 | 800,000 | 4,070,000 | 2026-04-10~2027-01-15 | 전부 DEV-SEED, 미래일자 1건; 운영 최근 사용으로 볼 수 없음 |
| A-5 | `919` | 재고감모손실 | 0 / 0 | 0 | 0 | 없음 | 분개 0이나 inventory 자동분개 상수로 활성 참조 |
| B-1 | `142` | 건물 | 5 / 5 | 0 | 1,000,000 | 2026-01-07~2026-01-19 | 전부 시더가 만든 감가상각 대변; 운영 사용 아님 |
| B-2 | `210` | 미지급금 | 1 / 1 | 0 | 700,000 | 2026-12-31 | 미래일자 DEV-SEED 1건; 적요는 미지급 법인세 |
| B-3a | `220` | 부가세예수금 | 34 / 34 | 0 | 47,100,000 | 2026-01-01~2026-04-25 | 누적 주계정이나 전부 시더/DEV-SEED, 최근 90일 0 |
| B-3b | `255` | 부가세예수금 | 7 / 7 | 57,272 | 417,272 | 2026-05-05~2026-07-27 | 최근 90일 5건; 현재 `TaxInvoiceService` 쓰기 경로 |
| B-4 | `900` | 영업외손익 | 0 / 0 | 0 | 0 | 없음 | 직접 분개 0; 하위 수익 1전표·비용 0전표 |

### 한 줄 결론

1. **실제 회사 거래로 신뢰할 수 있는 미정 코드 표본은 없다.** `103·201·210·142·220`은 QA/시드이고 `104·105·919·900`은 직접 사용 0이다.
2. `220` 대 `255`: 누적 사용량은 `220`이 34/41전표(82.93%), 대변액 99.12%로 우세하다. 하지만 최근 90일 사용과 현재 세금계산서 코드 경로는 `255`다.
3. `900`: 한 부모 아래 수익·비용 계정이 함께 등록된 **구조적 혼재**는 맞다. 그러나 현재 활성 분개는 수익 1건·120,000원, 비용 0건이라 **실데이터 수익/비용 혼재는 재현되지 않았다.**

## 2. 상대 계정 분포

동일 전표의 반대편 차대 라인만 상대 계정으로 집계했다.

| 대상 | 상대 계정 | 함께 나온 전표 | 상대 차변 | 상대 대변 | 관찰 사실 |
|---|---|---:|---:|---:|---|
| `103` | `110 외상매출금` | 10 | 1,250,000 | 1,250,000 | 입금보고서 5건과 취소 5건이 완전 상쇄 |
| `142` | `818 감가상각비` | 5 | 1,000,000 | 0 | 전부 감가상각비 차변 / 142 대변 |
| `201` | `101 현금` | 3 | 4,070,000 | 800,000 | DEV-SEED 미지급 2건과 결제 1건 |
| `210` | `991 법인세비용` | 1 | 700,000 | 0 | “미지급 법인세” 한 건뿐 |
| `220` | `110 외상매출금` | 34 | 518,100,000 | 0 | 시더 매출의 VAT 대변 |
| `255` | `110 외상매출금` | 7 | 4,589,999 | 629,999 | 세금계산서 발행과 취소 역분개 |
| `901` (`900` 하위 수익) | `102 보통예금` | 1 | 120,000 | 0 | DEV-SEED 이자수익 1건 |
| `104·105·919·900 직접` | 없음 | 0 | 0 | 0 | 상대 계정 표본 없음 |

`220`/`255`의 상대 `110` 합계는 VAT 자체 금액이 아니라 같은 전표의 VAT 포함 외상매출금 총액이다. 상대 분포를 보여 주는 값이지 대상 코드의 잔액은 아니다.

## 3. 코드별 실측·표본·후보

후보는 결론이 아니다. 개발책임자가 선택할 때 **몇 라인을 소급 이관하는지와 무엇이 남는지**만 제시한다.

### 3.1 `103 당좌예금`

실측:

- 10전표/10라인, 차변 1,250,000원·대변 1,250,000원, 순액 0원.
- 2026-07-04 한 날에 생성됐다.
- 원천은 `BANK_LINKED` 입금보고서 5건, 각 250,000원이며 5건 모두 `CANCELLED`다.
- 각 원천에 원분개와 역분개가 있어 분개 전표가 10건이다.
- 거래처는 5건 모두 `P-2026-0005 대구HVAC솔루션`이다.
- 기존 PR #710/V51은 기본 차변을 이미 `102 보통예금`으로 정정했다. `103`을 기본값으로 다시 올리는 것은 재결정 대상이 아니다. 사용자가 명시적으로 바꾸는 선택 계정으로서 `103`은 남아 있다.

표본 5건:

| 입금보고서 | 상태 | 금액 | 거래처 | 적요 | 연결 결과 |
|---|---|---:|---|---|---|
| `2026/07/04-1` | CANCELLED | 250,000 | 대구HVAC솔루션 | E3S3 실QA — 통장연계 입금보고서 생성 | 원분개+역분개 |
| `2026/07/04-2` | CANCELLED | 250,000 | 대구HVAC솔루션 | 동일 | 원분개+역분개 |
| `2026/07/04-3` | CANCELLED | 250,000 | 대구HVAC솔루션 | 동일 | 원분개+역분개 |
| `2026/07/04-4` | CANCELLED | 250,000 | 대구HVAC솔루션 | 동일 | 원분개+역분개 |
| `2026/07/04-5` | CANCELLED | 250,000 | 대구HVAC솔루션 | 동일 | 원분개+역분개 |

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. `103`을 당좌예금 선택 계정으로 유지 | 기존 D-E3-02(기본 102)는 유지. QA 보상쌍도 역사 그대로 남음 | 0라인 |
| 2. 10라인을 `102`로 이관 | QA 입금보고서 보상쌍의 코드만 102로 통일; 총 차·대/순액은 불변 | 10라인 |
| 3. 과거 103은 보존하고 신규 선택만 막음 | 과거 10라인은 alias 조회 필요, 신규 `103` 발생은 0으로 수렴 | 0라인, 쓰기/선택 경로 변경 |

원 은행계좌가 당좌인지 보통인지 식별하는 값은 현재 표본에 없다. 따라서 1과 2 중 업무 의미는 판정 불가다.

### 3.2 `104 정기예금`

실측:

- 전표·라인·금액·기간·상대 계정·표본 모두 0.
- `FundsStatusService.CASH_EQUIVALENT_ACCOUNT_CODES`에는 `101,102,103,104`로 포함돼 있다. 따라서 **분개상 미사용**이지 **코드상 완전 미참조**는 아니다.
- 이카운트 raw 테스트 fixture에는 `정기예.적금(1059)` 한 계정명이 존재하지만, 현재 회사 계정상세 원본이 없어 `104`와의 1:1 대응은 확정할 수 없다.

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 이카운트 전 목록에서 별도 정기예금 코드를 찾아 유지 | 자금현황의 현금성 그룹도 새 코드로 교체 | 0라인 |
| 2. `1059 정기예.적금` 하나로 `104·105`를 합침 | 현재 데이터 이관은 없고 chart/자금현황 참조만 통일 | 0라인 |
| 3. 사용중지 처리 | 과거 라인 손실은 없지만 자금현황의 104 참조 제거 필요 | 0라인 |

### 3.3 `105 정기적금`

실측:

- 전표·라인·금액·기간·상대 계정·표본 모두 0.
- `FundsStatusService` 현금성 목록에도 없다. 현재 확인한 production 코드의 직접 참조는 V1 chart 시드뿐이다.
- 이카운트 raw 테스트 fixture의 `1059 정기예.적금`이 유일한 구체 코드 근거다. 이것만으로 실제 회사 chart를 대신하지 않는다.

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 이카운트 전 목록에서 별도 정기적금 코드를 찾아 유지 | chart 코드만 교체, 현재 원장 영향 없음 | 0라인 |
| 2. `1059 정기예.적금`으로 `104`와 병합 | 두 로컬 코드를 하나로 축소, 현재 원장 영향 없음 | 0라인 |
| 3. 사용중지 처리 | 데이터 이관 없이 chart 항목만 비활성 | 0라인 |

### 3.4 `201 외상매입금`

실측:

- 3전표/3라인, 차변 800,000원·대변 4,070,000원.
- 상대 계정은 세 건 모두 `101 현금`이다.
- 2026-04-10, 2026-04-20, 2027-01-15이며 마지막 1건은 미래일자 시드다.
- 세 건 모두 `SYSTEM_SEED`, 설명·메모에도 `[DEV-SEED]`가 있다.
- 2026년 두 미지급 시드의 설명 속 거래처(현대오일뱅크, SK렌터카)와 실제 `partner_id`가 가리키는 partner master(고양냉난방주식회사, 용인HVAC산업)가 불일치한다. 이 표본으로 원거래의 상품/용역 성격을 판정하면 안 된다.

표본 전건:

| 전표 | 차변 | 대변 | 설명·메모 원문 | partner master |
|---|---:|---:|---|---|
| `2026/04/10-1` | 0 | 2,750,000 | `[DEV-SEED] 거래처 미지급 분개 — 현대오일뱅크(주)` / `외상매입금 — 현대오일뱅크(주)` | `P-2026-0011 고양냉난방주식회사` |
| `2026/04/20-1` | 0 | 1,320,000 | `[DEV-SEED] 거래처 미지급 분개 — SK렌터카(주)` / `외상매입금 — SK렌터카(주)` | `P-2026-0012 용인HVAC산업` |
| `2027/01/15-1` | 800,000 | 0 | `[DEV-SEED] CFO — 외상매입금 현금 결제` | 미지정 |

이미 결정된 것: #1072 본문은 이카운트 `2519 외상매입금` 계열을 정본으로 정했고, PR #1061 회사PC 실측도 `2519`의 활성 40라인을 확인했다. 다시 `201`과 `2519` 중 어느 체계를 정본으로 할지는 묻지 않는다.

남은 후보는 이 세 시드 라인의 처리 방식이다.

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 세 라인을 모두 `2519`로 이관 | 로컬 외상매입금 alias 제거; 시드 설명/partner 불일치는 그대로 | 3라인 |
| 2. 신규 쓰기만 `2519`, 과거 `201`은 alias 보존 | 즉시 데이터 이관 없음; 보고서가 `201+2519`를 계속 읽어야 함 | 0라인 |
| 3. DEV-SEED를 운영 이관 대상에서 제외 | 배포/운영 DB에 같은 시드가 존재하는지 별도 분모 확인 필요; 이 개발 DB에는 3라인 잔존 | 이 DB 0라인, 환경별 재계수 |

실제 회사의 `201` 운영 전표 표본은 이번 환경에서 0건이라 상품매입채무/기타미지급 구분은 판정 불가다.

### 3.5 `919 재고감모손실`

실측:

- `accounting_db` 직접 전표·라인·금액·기간·상대 계정·표본은 전부 0.
- 그러나 죽은 코드는 아니다. `inventory-service AccountingClient`가 재고실사 차이의 한쪽 계정으로 `919`를 하드코딩하고, `InventoryAuditService.complete()`가 차이금액 비영이면 동기 호출한다.
- 이 경로는 PR #114 리뷰에서 “150/919 chart 부재로 항상 실패”가 발견돼 같은 머지 PR에서 V4 시드로 보완됐다. `919` 기능 자체를 없앨지 다시 결정하는 사안이 아니다.
- 현재 `inventory_db`에는 완료 시드 3건, 차이금액 합계 2,640,000원이 있으나 모두 `InventoryAuditSeeder`가 `system`으로 넣은 행이다. 시더는 `complete()` 호출 경로를 증명하지 않는다. 대응하는 `919` 분개도 0건이다.
- 이카운트 회사 데이터에서 `9199`는 이미 **잡이익**으로 확인됐다. 숫자가 비슷하다는 이유로 `919 → 9199`로 매핑하면 안 된다.

표본: 직접 분개가 0건이므로 3~5건을 만들 수 없다. 모른다고 남긴다.

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 이카운트 전 목록에서 재고실사 차이용 정본 코드를 찾아 상수 교체 | 미래 완료 실사만 새 코드 사용; 현재 원장 이관 없음 | 0라인 |
| 2. 전환기 `919`과 새 코드를 alias로 함께 허용 | 롤링 배포 안전성은 높지만 이원화 기간이 생김 | 0라인 |
| 3. `919` 호환 확장을 유지 | 구현 변경 최소이나 “레거시 코드 그대로”라는 결정 C와 장기적으로 충돌 | 0라인 |

정상감모/비정상감모 등 업무 분기 기준은 실전표·원인이 없어 후보로 만들지 않았다.

### 3.6 `142 건물`이 감가상각누계액으로 쓰인 5건

실측:

- 5전표/5라인, 전부 대변, 합계 1,000,000원.
- 상대 계정은 5건 모두 `818 감가상각비` 차변.
- 2026-01-07~2026-01-19 전표일이지만 실제 생성시각은 2026-06-23이며 `JournalSeeder`가 만든 검증 시드다.
- 기존 `docs/dev-reports/local-test-seed-stage4.md`에 이미 다음 결정 기록이 있다.

> “V1 시드에 감가상각누계액 코드가 미보유라 … 자산 계정(142 건물) 직접 차감으로 단순화.”  
> “seed 데이터 한정 약식 처리이며 운영 분개는 향후 ChartOfAccount 확장 시 정정.”

따라서 “실제 업무에서 건물로 썼다”가 아니라 **시드가 누계액 부재를 우회했다**가 정확하다.

표본 전건:

| 전표 | 142 대변 | 상대 계정 | 설명 | 메모 | 거래처 |
|---|---:|---|---|---|---|
| `2026/01/07-2` | 300,000 | 818 감가상각비 | 월말 감가상각 조정 분개 | 건물 자산 감액 | 미지정 |
| `2026/01/10-2` | 250,000 | 818 감가상각비 | 동일 | 동일 | 미지정 |
| `2026/01/13-2` | 200,000 | 818 감가상각비 | 동일 | 동일 | 미지정 |
| `2026/01/16-2` | 150,000 | 818 감가상각비 | 동일 | 동일 | 미지정 |
| `2026/01/19-2` | 100,000 | 818 감가상각비 | 동일 | 동일 | 미지정 |

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 이카운트 누계액 정본 코드로 5라인 이관 | `142`는 건물 본계정으로 남고 시드 대변만 누계액으로 이동 | 5라인 |
| 2. 과거 5라인 보존, 신규 시더/운영 쓰기만 누계액 코드 사용 | 과거 보고서가 142를 차감 자산처럼 읽는 호환 필요 | 0라인 |
| 3. 시드 자체를 운영 이관 분모에서 제외 | 운영 DB에 같은 시드가 없다면 운영 소급 0; 개발 DB에는 약식 5라인 잔존 | 환경별 0~5라인 |

정확한 이카운트 누계액 코드는 현재 raw/staging에서 찾지 못했다.

### 3.7 `210 미지급금`이 미지급 법인세로 쓰인 1건

실측:

- 1전표/1라인, 대변 700,000원.
- 상대 계정은 `991 법인세비용` 차변 700,000원.
- 전표일·생성시각 모두 2026-12-31로 조사일 이후다.
- `SYSTEM_SEED`, 설명은 `[DEV-SEED] 법인세비용 분개`, 메모는 `미지급 법인세 (부채 계상)`이다.
- 거래처는 미지정이다.

3~5건을 요구했지만 표본이 한 건뿐이므로 한 건만 남긴다. 다른 거래를 추정해 채우지 않는다.

| 전표 | 차변 | 대변 | 상대 계정 | 설명 | 메모 |
|---|---:|---:|---|---|---|
| `2026/12/31-1` | 0 | 700,000 | 991 법인세비용 | `[DEV-SEED] 법인세비용 분개 — 보고서 검증용` | 미지급 법인세 (부채 계상) |

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 이카운트 미지급법인세 정본 코드로 이관 | 일반 `210`과 세금 부채 분리 | 1라인 |
| 2. 과거 1라인 보존, 신규 세금부채만 새 코드 | 과거 보고서가 210을 payable alias로 계속 읽음 | 0라인 |
| 3. DEV-SEED를 운영 이관 분모에서 제외 | 운영 DB에 동일 시드가 없으면 운영 소급 0; 개발 DB에는 1라인 잔존 | 환경별 0~1라인 |

정확한 이카운트 미지급법인세 코드는 현재 raw/staging에서 찾지 못했다.

### 3.8 `220`과 `255` 부가세예수금 중복

분리 실측:

| 코드 | 전표/라인 | 차변 | 대변 | 전표 점유율 | 대변액 점유율 | 최근 전표일 | 현재 쓰기 경로 |
|---|---:|---:|---:|---:|---:|---|---|
| `220` | 34 / 34 | 0 | 47,100,000 | 82.93% | 99.12% | 2026-04-25 | `JournalSeeder`, 보고서 상수 |
| `255` | 7 / 7 | 57,272 | 417,272 | 17.07% | 0.88% | 2026-07-27 | `TaxInvoiceService.ACCOUNT_VAT_PAYABLE` |

따라서 답은 둘로 갈린다.

- **누적 주사용:** `220`
- **최근·현재 세금계산서 쓰기 경로:** `255`

`220` 표본 5건:

| 전표 | 대변 | 설명·메모 | partner master | 출처 |
|---|---:|---|---|---|
| `2026/04/25-1` | 180,000 | `[DEV-SEED] 거래처 미수 — 동방물류(주)` / 부가세예수금 10% | 부산냉난방테크 | DEV-SEED; 설명과 master 불일치 |
| `2026/04/15-1` | 320,000 | `[DEV-SEED] 거래처 미수 — 한국통운(주)` / 부가세예수금 10% | 한국공조시스템(주) | DEV-SEED; 불일치 |
| `2026/04/05-1` | 200,000 | `[DEV-SEED] 거래처 미수 — (주)삼한물류` / 부가세예수금 10% | (주)서울에어컨 | DEV-SEED; 불일치 |
| `2026/03/29-1` | 100,000 | `전표 2026/05/29-3 자동 분개 (출하 매출)` / 부가세예수금 (10%) | (주)창원HVAC | JournalSeeder |
| `2026/03/26-1` | 1,400,000 | `전표 2026/05/27-2 자동 분개 (출하 매출)` / 부가세예수금 (10%) | 거제공조산업 | JournalSeeder |

`255` 표본 5건:

| 전표 | 차변 | 대변 | 세금계산서/거래처 | 상태·적요 |
|---|---:|---:|---|---|
| `2026/05/05-1` | 0 | 200,000 | `2026/05/05-1` / (주)한진물류 | ISSUED, 세금계산서 발행 |
| `2026/05/10-1` | 0 | 150,000 | `2026/05/10-1` / 대한통운(주) | ISSUED, 세금계산서 발행 |
| `2026/07/04-13` | 0 | 10,000 | `2026/07/04-1` / (주)삼한물류 | ISSUED, 세금계산서 발행 |
| `2026/07/26-1` | 0 | 30,000 | `2026/07/26-2` / 강릉HVAC솔루션 | 원분개 REVERSED |
| `2026/07/26-2` | 30,000 | 0 | 강릉HVAC솔루션 | `[역분개]` POSTED |

추가 두 건은 `(주)한국냉동물류` 원분개 27,272원과 그 역분개 27,272원이다.

기존 결정과 원본 근거:

- V2는 “255 신규 시드, 기존 220은 호환 유지”라고 명시해 중복을 의도적으로 만들었다.
- PR #1061 회사PC 실측은 이카운트 `2559 부가세예수금` 2,063라인·대변 611,837,582원을 확인했다.
- #1072 결정 C는 “레거시 장부와 계정코드가 그대로 맞아야 한다”고 했다.

따라서 `220` 대 `255` 중 하나를 새 정본으로 다시 고르는 선택지는 올리지 않는다. 정본 전환의 최종 후보는 이카운트 원본에서 `2559`를 재확인한 뒤의 이관 방식이다.

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. `220·255 → 2559` 일괄 이관 | 한 번에 중복 해소, 모든 생성·조회 상수 동시 전환 필요 | 41라인 |
| 2. 신규 쓰기만 `2559`, 과거 `220·255` alias 유지 | 데이터 소급 0, 보고서/원장이 세 코드를 읽는 전환기 지속 | 0라인 |
| 3. 단계 이관: `255` 7라인 후 `220` 34라인 | 현재 세금계산서 경로를 먼저 맞춘 뒤 대량 시더 계정을 별도 검증 | 7라인 → 추가 34라인 |

`2559`는 PR #1061과 레거시 전표 대조에서 확인됐지만, 현재 워크트리 raw/staging은 비어 있다. 구현 전 원본 `계정상세내역`으로 재확인하는 기존 #1072 절차는 유지한다.

### 3.9 `900 영업외손익` 수익/비용 분리

현재 chart 구조:

| 부모 | 수익으로 등록된 자식 | 비용으로 등록된 자식 |
|---|---|---|
| `900 영업외손익` | `901 이자수익`, `904 임대료수익`, `906 잡이익` | `919 재고감모손실`, `951 이자비용`, `952 외환차손`, `970 잡손실` |

직접 `900` 라인은 0건이다. 하위 실사용을 기존 등록 명칭에 따라 갈라 세면 다음과 같다.

| 구분 | 전표/라인 | 차변 | 대변 | 최초~최근 | 표본 |
|---|---:|---:|---:|---|---|
| 수익 (`901·904·906`) | 1 / 1 | 0 | 120,000 | 2026-03-31 | `901 이자수익` DEV-SEED |
| 비용 (`919·951·952·970`) | 0 / 0 | 0 | 0 | 없음 | 없음 |

유일한 표본:

| 전표 | 코드 | 차변 | 대변 | 상대 | 설명 | 메모 |
|---|---|---:|---:|---|---|---|
| `2026/03/31-1` | 901 이자수익 | 0 | 120,000 | 102 보통예금 차변 120,000 | `[DEV-SEED] 이자수익 영업외분개 — 보고서 검증용` | 이자수익 인식 (영업외수익) |

즉 현재 개발 DB에는 비용 표본이 한 건도 없어 3~5건을 제시할 수 없다. `900`이 **실제로 수익과 비용 거래에 동시에 쓰였다**고 쓰면 거짓이다. 확인된 것은 chart와 `AccountCategory.NON_OPERATING("영업외손익","900")`가 두 성격을 한 그룹으로 묶는 구조다.

후보:

| 후보 | 선택 시 결과 | 소급 대상 |
|---|---|---:|
| 1. 이카운트의 수익/비용 부모로 자식들을 재배치 | 직접 900 라인이 없어 직접 이관 0; chart parent와 보고서/UI 그룹 변경 | 직접 0라인, 자식 chart 7건 |
| 2. 900을 전환기 호환 부모로 유지하고 자식 코드만 정본화 | 현재 보고서 표면 유지, 구조적 혼재도 유지 | 현재 사용 자식 최소 1라인(901), 최종 코드는 원본 필요 |
| 3. 전체 900 subtree를 한 번에 이카운트 정본으로 전환 | 부모·자식·리포트 동시 정리; 현재 DB 실사용 이관은 901 한 라인뿐 | 1라인 + chart 8건 |

이미 결정돼 재질문하면 안 되는 원장 표시 사양은 별개다. PR #1061에서 `9049 수입임대료=매출`, `9199 잡이익=조정`, `9549 잡손실=조정`으로 결정됐다. 이것은 `900` 부모를 하나로 둘지 둘로 나눌지의 결정이 아니다.

## 4. 3축 대조

### 4.1 축 1 — 코드

| 찾은 것 | 좌표 | 의미 |
|---|---|---|
| V1 chart | `V1__init_accounting_service.sql:145-235` | 103/104/105/142/201/210/220/900과 하위 901·904·906·951·952·970 등록 |
| VAT 중복의 기원 | `V2__add_tax_invoice.sql:114-120` | 255 신규, 220 호환 유지라고 명시 |
| 919의 기원 | `V4__seed_inventory_audit_accounts.sql` | inventory 자동분개 호환을 위해 150/919 추가 |
| 103 기본값 정정 | `V51__cash_receipt_debit_account_default_102.sql` | 102=보통예금, 103=당좌예금; 연결 103이 있으면 배포 중단 |
| 현재 VAT 쓰기 | `TaxInvoiceService.ACCOUNT_VAT_PAYABLE="255"` | 세금계산서 발행은 255 사용 |
| 현재 220·142 쓰기 | `JournalSeeder` | 매출 VAT=220, 감가상각 대변=142; 둘 다 시드 경로 |
| 201/210 조회 | `ReceivablesPayablesService` | payable 목록이 `201,210` 하드코딩 |
| 104 조회 | `FundsStatusService` | 현금성 목록 `101,102,103,104`; 105 제외 |
| 900 묶음 | `AccountCategory.NON_OPERATING` | 수익·비용을 한 category/900 prefix로 표시 |
| 919 활성 호출 | `inventory AccountingClient`, `InventoryAuditService.complete()` | 실사 차이 비영이면 150↔919 분개 요청 |

못 찾은 것:

- 이카운트 원본 `docs/migration/ecount-data/raw/**`는 `.gitkeep`뿐이다.
- `staging.ecount_account_raw=0`, `staging.ecount_account_map=0`이다.
- 따라서 `103`, `142` 누계액, `210` 미지급법인세, `919` 재고실사 차이, `900`의 정확한 이카운트 목표 부모 코드는 현재 환경에서 못 찾았다.
- `104·105`에는 test fixture의 `1059 정기예.적금` 근거가 있지만 회사 chart 원본은 아니다.

### 4.2 축 2 — 이슈 본문과 전체 코멘트

실행:

```powershell
gh issue view 1072 --comments
gh issue view 1144 --comments
```

확인 결과:

- `#1072`: 댓글 1개 전부 확인.
  - 원문: “🚫 3코드만으로 전환하지 않는다.”
  - 원문: “✅ 이카운트 정본 계정의 전 목록을 먼저 확정한 뒤 착수한다.”
  - 원문: 현재 8코드 화이트리스트, 실 `journal_lines` 건수·금액, 이카운트 raw, 1:1이 아닌 코드를 읽기 전용으로 조사한다.
- `#1144`: 댓글 6개 전부 확인.
  - 출금보고서, 자기회사 플래그 불요, 계좌·카드·대출 3메뉴, #922 수집 경계, #1145 P0-B 완료에 관한 결정들이다.
  - 이번 10개 코드의 정확한 목표 계정에 대한 직접 결정은 **찾지 못했다**.

이미 결정돼 재결정 대상에서 뺀 것:

1. **정본 체계는 이카운트(C)**다. `201` 대 `2519`, `220` 대 `255` 중 로컬 코드를 새 정본으로 고르는 안은 제외한다.
2. **전 목록 선확정**이다. 일부 코드만 먼저 운영 전환하는 안은 제외한다.
3. #1144의 채권/채무 원장·세금계산서 게이트 결정은 유지한다. 이번 보고서는 그 기능 설계를 다시 올리지 않는다.

### 4.3 축 3 — 결정 문서와 머지 PR 코멘트

확인한 관련 머지 PR 코멘트:

| PR | 전체 댓글 수 | 이번 조사에서 확인한 결정/근거 |
|---|---:|---|
| #28 | 3 | V1 한국 표준 chart 65행과 단일 `NON_OPERATING` 그룹 승인. 이카운트 C 결정 이전 기록 |
| #114 | 8 | 919 호출 시 chart 부재 결함 발견 → 같은 PR에서 V4 150/919 시드 추가·머지 |
| #709 | 11 | 입금보고서 S1 초기 기본 103/110+변경가능 기록 |
| #710 | 14 | 103은 당좌, 의도한 보통예금 기본은 102라고 교정; V51 감사보호와 함께 머지 |
| #1061 | 63 | 이카운트 C 선택, 회사PC `2519·2559·9049·9199·9549` 실측, 잡이익/잡손실 표시 사양 결정 |

관련 문서 원문:

- `docs/dev-reports/2026-08-05-1001-r46-canonical-accounts-and-opening.md`
  - “범위 밖: 앱 생성 경로 전환, 기존 110/401 라인 정규화, chart 정리, 다른 회계 화면 전환 — 이슈 #1072.”
  - 즉 PR #1061은 alias read를 구현했지 #1072를 완료하지 않았다.
- `docs/dev-reports/local-test-seed-stage4.md`
  - 142 직접 차감은 “seed 데이터 한정 약식 처리”, 운영 분개는 누계액 chart 확장 시 정정이라고 이미 기록.
- `docs/dev-reports/integration-phase-10-step-8-ui-9-slice.md`
  - 919는 inventory 호출 호환을 위해 V4에서 추가됐다고 기록.
- `docs/dev-reports/2026-07-03-e3-s2-cash-receipt-journal-posting.md`
  - D-E3-02 기본 차변 102(보통예금) 확정.
- `docs/dev-reports/2026-08-05-1001-r48-legacy-ledger-notation.md`
  - 이카운트 원본에서 `2559 부가세예수금`, `9049 수입임대료`, `9199 잡이익`, `9549 잡손실` 확인.
- `docs/dev-reports/2026-08-05-1001-r51-sales-reversal-axis.md`
  - `9199` 잡이익·`9549` 잡손실은 조정, `9049` 임대료는 매출이라는 표시 결정.

못 찾은 결정:

- `103`을 당좌예금으로 계속 운영할지 비활성할지
- `104·105`를 `1059` 하나로 합칠지
- `142`의 정확한 이카운트 감가상각누계액 코드
- `210`의 정확한 이카운트 미지급법인세 코드
- `919`의 정확한 이카운트 재고실사 차이 코드
- `900`의 이카운트 수익/비용 부모 코드

## 5. 실행 SQL 원문과 결과 원문

아래 금액은 원 단위 numeric이다. UUID는 사용자 표면에 남기지 않기 위해 표본 거래처명은 `accounting_db`와 `partner_db`를 PowerShell 메모리에서 조인해 표시했다. DB에는 어떤 임시 테이블도 만들지 않았다.

### 5.1 대상 코드 전표·금액·기간

```sql
WITH targets(code) AS (
  VALUES ('103'),('104'),('105'),('201'),('919'),
         ('142'),('210'),('220'),('255'),('900')
)
SELECT
  t.code,
  coa.name,
  COUNT(DISTINCT j.id) AS journal_count,
  COUNT(jl.id) AS line_count,
  COALESCE(SUM(jl.debit_amount),0) AS debit_sum,
  COALESCE(SUM(jl.credit_amount),0) AS credit_sum,
  MIN(j.journal_date) AS first_journal_date,
  MAX(j.journal_date) AS last_journal_date,
  MIN(j.created_at) AS first_created_at,
  MAX(j.created_at) AS last_created_at,
  COUNT(DISTINCT j.id) FILTER (
    WHERE j.journal_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE
  ) AS journals_last_90d,
  COUNT(DISTINCT j.id) FILTER (WHERE j.journal_date > CURRENT_DATE) AS future_dated_journals
FROM targets t
LEFT JOIN chart_of_accounts coa
  ON coa.code=t.code AND coa.is_deleted=false
LEFT JOIN journal_lines jl
  ON jl.account_code=t.code AND jl.is_deleted=false
LEFT JOIN journals j
  ON j.id=jl.journal_id AND j.is_deleted=false
GROUP BY t.code,coa.name
ORDER BY t.code;
```

```text
 code |     name     | journal_count | line_count | debit_sum  | credit_sum  | first_journal_date | last_journal_date |      first_created_at      |      last_created_at       | journals_last_90d | future_dated_journals
------+--------------+---------------+------------+------------+-------------+--------------------+-------------------+----------------------------+----------------------------+-------------------+-----------------------
 103  | 당좌예금     |            10 |         10 | 1250000.00 |  1250000.00 | 2026-07-04         | 2026-07-04        | 2026-07-04 08:06:04.59041  | 2026-07-04 08:11:33.870387 |                10 |                     0
 104  | 정기예금     |             0 |          0 |          0 |           0 |                    |                   |                            |                            |                 0 |                     0
 105  | 정기적금     |             0 |          0 |          0 |           0 |                    |                   |                            |                            |                 0 |                     0
 142  | 건물         |             5 |          5 |       0.00 |  1000000.00 | 2026-01-07         | 2026-01-19        | 2026-06-23 12:48:21.3351   | 2026-06-23 12:48:21.37663  |                 0 |                     0
 201  | 외상매입금   |             3 |          3 |  800000.00 |  4070000.00 | 2026-04-10         | 2027-01-15        | 2026-04-10 09:00:00        | 2027-01-15 14:00:00        |                 0 |                     1
 210  | 미지급금     |             1 |          1 |       0.00 |   700000.00 | 2026-12-31         | 2026-12-31        | 2026-12-31 23:00:00        | 2026-12-31 23:00:00        |                 0 |                     1
 220  | 부가세예수금 |            34 |         34 |       0.00 | 47100000.00 | 2026-01-01         | 2026-04-25        | 2026-01-15 09:00:00        | 2026-06-23 12:48:21.242421 |                 0 |                     0
 255  | 부가세예수금 |             7 |          7 |   57272.00 |   417272.00 | 2026-05-05         | 2026-07-27        | 2026-07-04 07:19:01.754433 | 2026-07-27 03:37:00.546544 |                 5 |                     0
 900  | 영업외손익   |             0 |          0 |          0 |           0 |                    |                   |                            |                            |                 0 |                     0
 919  | 재고감모손실 |             0 |          0 |          0 |           0 |                    |                   |                            |                            |                 0 |                     0
(10 rows)
```

### 5.2 상태·원천 분포

```sql
SELECT jl.account_code,j.status,j.source_type,
       COUNT(DISTINCT j.id) AS journal_count,
       COUNT(*) AS line_count,
       SUM(jl.debit_amount) AS debit_sum,
       SUM(jl.credit_amount) AS credit_sum
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
WHERE jl.is_deleted=false AND j.is_deleted=false
  AND jl.account_code IN ('103','104','105','142','201','210','220','255','900','919')
GROUP BY jl.account_code,j.status,j.source_type
ORDER BY jl.account_code,j.status,j.source_type;
```

```text
 account_code |  status  | source_type  | journal_count | line_count | debit_sum  | credit_sum
--------------+----------+--------------+---------------+------------+------------+-------------
 103          | POSTED   | CASH_RECEIPT |             5 |          5 |       0.00 |  1250000.00
 103          | REVERSED | CASH_RECEIPT |             5 |          5 | 1250000.00 |        0.00
 142          | POSTED   | CLOSING      |             5 |          5 |       0.00 |  1000000.00
 201          | POSTED   | MANUAL       |             3 |          3 |  800000.00 |  4070000.00
 210          | POSTED   | MANUAL       |             1 |          1 |       0.00 |   700000.00
 220          | POSTED   | MANUAL       |             5 |          5 |       0.00 |  1400000.00
 220          | POSTED   | SLIP         |            26 |         26 |       0.00 | 40900000.00
 220          | REVERSED | SLIP         |             3 |          3 |       0.00 |  4800000.00
 255          | POSTED   | MANUAL       |             1 |          1 |   27272.00 |        0.00
 255          | POSTED   | SLIP         |             4 |          4 |   30000.00 |   360000.00
 255          | REVERSED | SLIP         |             2 |          2 |       0.00 |    57272.00
(11 rows)
```

### 5.3 반대편 상대 계정

```sql
WITH target_lines AS (
  SELECT jl.id AS target_line_id,jl.journal_id,jl.account_code,
         jl.debit_amount,jl.credit_amount
  FROM journal_lines jl
  JOIN journals j ON j.id=jl.journal_id
  WHERE jl.is_deleted=false AND j.is_deleted=false
    AND jl.account_code IN ('103','142','201','210','220','255')
)
SELECT
  t.account_code AS target_code,
  o.account_code AS counterpart_code,
  coa.name AS counterpart_name,
  COUNT(DISTINCT t.journal_id) AS journal_count,
  COUNT(*) AS paired_line_count,
  SUM(o.debit_amount) AS counterpart_debit,
  SUM(o.credit_amount) AS counterpart_credit
FROM target_lines t
JOIN journal_lines o
  ON o.journal_id=t.journal_id
 AND o.id<>t.target_line_id
 AND o.is_deleted=false
 AND ((t.debit_amount>0 AND o.credit_amount>0)
      OR (t.credit_amount>0 AND o.debit_amount>0))
LEFT JOIN chart_of_accounts coa
  ON coa.code=o.account_code AND coa.is_deleted=false
GROUP BY t.account_code,o.account_code,coa.name
ORDER BY t.account_code,journal_count DESC,paired_line_count DESC,o.account_code;
```

```text
 target_code | counterpart_code | counterpart_name | journal_count | paired_line_count | counterpart_debit | counterpart_credit
-------------+------------------+------------------+---------------+-------------------+-------------------+--------------------
 103         | 110              | 외상매출금       |            10 |                10 |        1250000.00 |         1250000.00
 142         | 818              | 감가상각비       |             5 |                 5 |        1000000.00 |               0.00
 201         | 101              | 현금             |             3 |                 3 |        4070000.00 |          800000.00
 210         | 991              | 법인세비용       |             1 |                 1 |         700000.00 |               0.00
 220         | 110              | 외상매출금       |            34 |                34 |      518100000.00 |               0.00
 255         | 110              | 외상매출금       |             7 |                 7 |        4589999.00 |          629999.00
(6 rows)
```

### 5.4 `220` 대 `255` 점유율

```sql
WITH vat AS (
  SELECT jl.account_code,
         COUNT(DISTINCT j.id) AS journal_count,
         SUM(jl.debit_amount) AS debit_sum,
         SUM(jl.credit_amount) AS credit_sum
  FROM journal_lines jl
  JOIN journals j ON j.id=jl.journal_id
  WHERE jl.is_deleted=false AND j.is_deleted=false
    AND jl.account_code IN ('220','255')
  GROUP BY jl.account_code
)
SELECT account_code,journal_count,debit_sum,credit_sum,
       ROUND(100.0*journal_count/SUM(journal_count) OVER (),2) AS journal_share_pct,
       ROUND(100.0*credit_sum/SUM(credit_sum) OVER (),2) AS credit_share_pct
FROM vat
ORDER BY journal_count DESC;
```

```text
 account_code | journal_count | debit_sum | credit_sum  | journal_share_pct | credit_share_pct
--------------+---------------+-----------+-------------+-------------------+------------------
 220          |            34 |      0.00 | 47100000.00 |             82.93 |            99.12
 255          |             7 |  57272.00 |   417272.00 |             17.07 |             0.88
(2 rows)
```

### 5.5 `103` 원천 입금보고서

```sql
SELECT slip_no,transaction_date,status,amount,debit_account_code,
       credit_account_code,kind,memo,
       journal_id IS NOT NULL AS has_journal,
       reverse_journal_id IS NOT NULL AS has_reverse_journal,
       created_at
FROM cash_receipts
WHERE is_deleted=false AND debit_account_code='103'
ORDER BY transaction_date,slip_no;
```

```text
   slip_no    | transaction_date |  status   |  amount   | debit_account_code | credit_account_code |    kind     |                 memo                 | has_journal | has_reverse_journal |         created_at
--------------+------------------+-----------+-----------+--------------------+---------------------+-------------+--------------------------------------+-------------+---------------------+----------------------------
 2026/07/04-1 | 2026-07-04       | CANCELLED | 250000.00 | 103                | 110                 | BANK_LINKED | E3S3 실QA — 통장연계 입금보고서 생성 | t           | t                   | 2026-07-04 08:06:04.554199
 2026/07/04-2 | 2026-07-04       | CANCELLED | 250000.00 | 103                | 110                 | BANK_LINKED | E3S3 실QA — 통장연계 입금보고서 생성 | t           | t                   | 2026-07-04 08:06:57.152006
 2026/07/04-3 | 2026-07-04       | CANCELLED | 250000.00 | 103                | 110                 | BANK_LINKED | E3S3 실QA — 통장연계 입금보고서 생성 | t           | t                   | 2026-07-04 08:08:11.133871
 2026/07/04-4 | 2026-07-04       | CANCELLED | 250000.00 | 103                | 110                 | BANK_LINKED | E3S3 실QA — 통장연계 입금보고서 생성 | t           | t                   | 2026-07-04 08:09:43.500552
 2026/07/04-5 | 2026-07-04       | CANCELLED | 250000.00 | 103                | 110                 | BANK_LINKED | E3S3 실QA — 통장연계 입금보고서 생성 | t           | t                   | 2026-07-04 08:11:28.528806
(5 rows)
```

### 5.6 `255`와 세금계산서 연결

```sql
SELECT j.journal_no,j.journal_date,j.status,j.source_type,
       jl.debit_amount,jl.credit_amount,j.description,jl.memo,
       ti.tax_invoice_no,ti.partner_name,ti.status AS invoice_status
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
LEFT JOIN tax_invoices ti
  ON ti.id=j.source_ref_id AND ti.is_deleted=false
WHERE jl.is_deleted=false AND j.is_deleted=false
  AND jl.account_code='255'
ORDER BY j.journal_date,j.journal_no;
```

```text
  journal_no   | journal_date |  status  | source_type | debit_amount | credit_amount |                              description                              |                     memo                      | tax_invoice_no |   partner_name   | invoice_status
---------------+--------------+----------+-------------+--------------+---------------+-----------------------------------------------------------------------+-----------------------------------------------+----------------+------------------+---------------
 2026/05/05-1  | 2026-05-05   | POSTED   | SLIP        |         0.00 |     200000.00 | 세금계산서 발행 2026/05/05-1 ((주)한진물류)                           | 세금계산서 2026/05/05-1 부가세예수금          | 2026/05/05-1   | (주)한진물류     | ISSUED
 2026/05/10-1  | 2026-05-10   | POSTED   | SLIP        |         0.00 |     150000.00 | 세금계산서 발행 2026/05/10-1 (대한통운(주))                           | 세금계산서 2026/05/10-1 부가세예수금          | 2026/05/10-1   | 대한통운(주)     | ISSUED
 2026/07/04-13 | 2026-07-04   | POSTED   | SLIP        |         0.00 |      10000.00 | 세금계산서 발행 2026/07/04-1 ((주)삼한물류)                           | 세금계산서 2026/07/04-1 부가세예수금          | 2026/07/04-1   | (주)삼한물류     | ISSUED
 2026/07/26-1  | 2026-07-26   | REVERSED | SLIP        |         0.00 |      30000.00 | 세금계산서 발행 2026/07/26-2 (강릉HVAC솔루션)                         | 세금계산서 2026/07/26-2 부가세예수금          | 2026/07/26-2   | 강릉HVAC솔루션   | CANCELLED
 2026/07/26-2  | 2026-07-26   | POSTED   | SLIP        |     30000.00 |          0.00 | [역분개] 2026/07/26-1 세금계산서 발행 2026/07/26-2 (강릉HVAC솔루션)   | [역분개] 세금계산서 2026/07/26-2 부가세예수금 |                |                  |
 2026/07/27-3  | 2026-07-27   | REVERSED | SLIP        |         0.00 |      27272.00 | 세금계산서 발행 2026/07/27-1 ((주)한국냉동물류)                       | 세금계산서 2026/07/27-1 부가세예수금          | 2026/07/27-1   | (주)한국냉동물류 | ISSUED
 2026/07/27-4  | 2026-07-27   | POSTED   | MANUAL      |     27272.00 |          0.00 | [역분개] 2026/07/27-3 세금계산서 발행 2026/07/27-1 ((주)한국냉동물류) | [역분개] 세금계산서 2026/07/27-1 부가세예수금 |                |                  |
(7 rows)
```

### 5.7 `900` 하위 수익/비용 분리

```sql
SELECT code,name,category,parent_code,is_leaf
FROM chart_of_accounts
WHERE is_deleted=false
  AND (code='900' OR parent_code='900')
ORDER BY code;
```

```text
 code |     name     |   category    | parent_code | is_leaf
------+--------------+---------------+-------------+---------
 900  | 영업외손익   | NON_OPERATING |             | f
 901  | 이자수익     | NON_OPERATING | 900         | t
 904  | 임대료수익   | NON_OPERATING | 900         | t
 906  | 잡이익       | NON_OPERATING | 900         | t
 919  | 재고감모손실 | NON_OPERATING | 900         | t
 951  | 이자비용     | NON_OPERATING | 900         | t
 952  | 외환차손     | NON_OPERATING | 900         | t
 970  | 잡손실       | NON_OPERATING | 900         | t
(8 rows)
```

```sql
WITH bucketed AS (
  SELECT
    CASE
      WHEN jl.account_code IN ('901','904','906') THEN 'REVENUE'
      WHEN jl.account_code IN ('919','951','952','970') THEN 'EXPENSE'
    END AS kind,
    jl.account_code,j.id,j.journal_date,
    jl.debit_amount,jl.credit_amount
  FROM journal_lines jl
  JOIN journals j ON j.id=jl.journal_id
  WHERE jl.is_deleted=false AND j.is_deleted=false
    AND jl.account_code IN ('901','904','906','919','951','952','970')
), expected(kind) AS (VALUES ('REVENUE'),('EXPENSE'))
SELECT e.kind,
       COUNT(DISTINCT b.id) AS journal_count,
       COUNT(b.account_code) AS line_count,
       COALESCE(SUM(b.debit_amount),0) AS debit_sum,
       COALESCE(SUM(b.credit_amount),0) AS credit_sum,
       MIN(b.journal_date) AS first_date,
       MAX(b.journal_date) AS last_date
FROM expected e
LEFT JOIN bucketed b ON b.kind=e.kind
GROUP BY e.kind
ORDER BY e.kind;
```

```text
  kind   | journal_count | line_count | debit_sum | credit_sum | first_date | last_date
---------+---------------+------------+-----------+------------+------------+------------
 EXPENSE |             0 |          0 |         0 |          0 |            |
 REVENUE |             1 |          1 |      0.00 |  120000.00 | 2026-03-31 | 2026-03-31
(2 rows)
```

```sql
SELECT jl.account_code,j.journal_no,j.journal_date,j.source_type,j.status,
       jl.debit_amount,jl.credit_amount,j.description,jl.memo
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
WHERE jl.is_deleted=false AND j.is_deleted=false
  AND jl.account_code IN ('901','904','906','919','951','952','970')
ORDER BY jl.account_code,j.journal_date,j.journal_no;
```

```text
 account_code |  journal_no  | journal_date | source_type | status | debit_amount | credit_amount |                                 description                                 |            memo
--------------+--------------+--------------+-------------+--------+--------------+---------------+-----------------------------------------------------------------------------+----------------------------
 901          | 2026/03/31-1 | 2026-03-31   | MANUAL      | POSTED |         0.00 |     120000.00 | [DEV-SEED] 이자수익 영업외분개 — 보고서 검증용 (손익계산서 영업외수익 확인) | 이자수익 인식 (영업외수익)
(1 row)
```

### 5.8 `919`의 inventory 쪽 발화 가능 표본

```sql
SELECT ia.audit_no,ia.audit_date,ia.status,ia.total_diff_amount,
       COUNT(ial.id) AS line_count,
       COUNT(*) FILTER (WHERE ial.diff_qty<>0) AS diff_line_count,
       COALESCE(SUM(ial.diff_amount),0) AS line_diff_amount_sum
FROM inventory_audits ia
LEFT JOIN inventory_audit_lines ial
  ON ial.audit_id=ia.id AND ial.is_deleted=false
WHERE ia.is_deleted=false
GROUP BY ia.id,ia.audit_no,ia.audit_date,ia.status,ia.total_diff_amount
ORDER BY ia.audit_date,ia.audit_no;
```

```text
   audit_no   | audit_date |   status    | total_diff_amount | line_count | diff_line_count | line_diff_amount_sum
--------------+------------+-------------+-------------------+------------+-----------------+----------------------
 2026/01/31-1 | 2026-01-31 | COMPLETED   |        1690000.00 |          5 |               4 |           1690000.00
 2026/02/01-1 | 2026-02-01 | COMPLETED   |         350000.00 |          5 |               4 |            350000.00
 2026/02/15-1 | 2026-02-15 | IN_PROGRESS |              0.00 |          5 |               2 |            -80000.00
 2026/02/28-1 | 2026-02-28 | IN_PROGRESS |              0.00 |          5 |               2 |            -90000.00
 2026/02/28-2 | 2026-02-28 | COMPLETED   |         600000.00 |          5 |               4 |            600000.00
 2026/03/01-1 | 2026-03-01 | PLANNED     |              0.00 |          5 |               0 |                 0.00
 2026/03/15-1 | 2026-03-15 | CANCELLED   |              0.00 |          5 |               0 |                 0.00
 2026/04/01-1 | 2026-04-01 | PLANNED     |              0.00 |          5 |               0 |                 0.00
 2026/05/01-1 | 2026-05-01 | PLANNED     |              0.00 |          5 |               0 |                 0.00
(9 rows)
```

이 9건은 `InventoryAuditSeeder`가 만든 시드다. 위 표가 `919` 분개 3건을 뜻하지 않는다. `accounting_db`의 919 라인은 0건이다.

### 5.9 이카운트 원본·staging 존재 여부

```sql
SELECT COUNT(*) AS raw_rows FROM staging.ecount_account_raw;
SELECT COUNT(*) AS map_rows FROM staging.ecount_account_map;
```

```text
 raw_rows
----------
        0
(1 row)

 map_rows
----------
        0
(1 row)
```

파일 확인 결과 `docs/migration/ecount-data/raw/`에는 `.gitkeep` 한 개뿐이다.

## 6. 개발책임자 판단용 최소 목록

업무 의미를 제가 정하지 않고, 다음 확인값만 올린다.

| 판단 항목 | 현재 근거 | 선택에 따라 바뀌는 현재 라인 |
|---|---|---:|
| 103 QA 보상쌍을 102로 옮길지 역사 보존할지 | 원 계좌 종류 없음, D-E3-02 기본 102는 이미 확정 | 0 또는 10 |
| 104·105를 `1059 정기예.적금`으로 합칠지 | test fixture만 있고 회사 chart 원본 없음 | 0 |
| 201 DEV-SEED도 2519로 소급할지 | 정본 2519는 결정됨, 세 행은 전부 시드 | 0 또는 3 |
| 919의 이카운트 목표 코드 | 분개 0, 호출 코드는 활성, 9199는 잡이익이라 오매핑 금지 | 0 |
| 142 시드 대변을 누계액으로 이관할지 | 기존 문서가 seed 한정 약식임을 이미 명시 | 0 또는 5 |
| 210 법인세 시드를 별도 세금부채로 옮길지 | 미래일자 시드 1건뿐 | 0 또는 1 |
| VAT 전환 방식 | 최종 정본 후보 2559 근거 있음 | 0, 7, 34 또는 41 |
| 900 subtree 전환 방식 | 직접 0, 하위 실제 사용은 901 한 건 | 0 또는 1 + chart 변경 |

정확한 목표 코드가 비어 있는 항목은 이카운트 `계정상세내역` 원본 확보 전에는 결정할 수 없다.

## 7. 라운드 종료 — 삭제된 추적 파일 점검

읽기 전용 확인 결과: 작업 트리·인덱스·`origin/main...HEAD` 비교에서 삭제(`D`)된 추적 파일은 0개이며, `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 현재 존재하고 Git 추적 상태다.
