# 부자재별 실외기 칩 목록 — 레거시 정규식·HP 판별 해소 (2026-08-10)

> 개발책임자: *"아니지. **수량동기화 매핑시키면 지금 스키마로도 될텐데?**"* → 맞습니다.
> 레거시 정규식을 실 카탈로그에 풀면 **구체적 모델코드 목록**이 되고 그것이 곧 칩 목록입니다.
> 파싱·HP 정규식을 런타임에 둘 필요가 없습니다.

측정: 회사PC `samhan-postgres` / `product_db` · `SELECT now()` = **2026-08-10 17:01:16.394934+09**
`quantity_sync_rule` / `source` / `target` **전부 0행**(같은 시각) — 이 목록이 곧 초기값입니다.

🚨 **집PC 는 시드가 다릅니다.** 넣기 전에 모든 모델코드를 그 PC 카탈로그와 대조하십시오.
   `evaluateRule` 은 하나라도 null 이면 **전체 null** 이라, 코드 하나가 없으면 10규칙이 다 죽습니다.

---

## 요약

| # | 카테고리 | target | 이름 | source |
|---:|---|---|---|---:|
| 1 | `COMM_MULTI` | `SI-AL600a` | 실외기 일자발 (전면 4~6HP) | 12 |
| 2 | `COMM_MULTI` | `SI-AL700a` | 실외기 일자발 (전면 8~12HP) | 9 |
| 3 | `COMM_MULTI` | `GHP방진가대` | GHP 방진가대 | 9 |
| 4 | `COMM_MULTI` | `ACL-KORGHP07` | GHP 저감장치 | 9 |
| 5 | `COMM_MULTI` | `방진가대S2소` | S2 방진가대 소 | 72 |
| 6 | `COMM_MULTI` | `방진가대S2중` | S2 방진가대 중 | 111 |
| 7 | `COMM_MULTI` | `방진가대S2대` | S2 방진가대 대 | 7 |
| 8 | `HOME_MULTI` | `발통세트` | 원형발통 세트 | 9 |
| 9 | `SINGLE_SET` | `발통세트` | 원형발통 세트 | 269 |
| 10 | `SINGLE_SET` | `SI-AL700a` | 실외기 일자발 (전면 8~12HP) | 2 |
| | | | **합계** | **509** |

`factor` 는 **전부 1** (실외기 1대당 부자재 1개).

---

## 검증 방식 — 손으로 합치지 않았습니다

```text
레거시 원문을 **한 글자도 바꾸지 않고** 복사해 node 로 카탈로그 전건에 재실행하고
여섯 조각이 낸 결과와 대조했습니다.

clients/web/estimate-app/views/index.ejs
  rawNameOf            :4039-4041     isCommOutdoorRow  :4050-4053
  hasExactHP           :4137-4140     parseSetHPs       :4143-4147
  chooseBaseModel      :4149-4193     recomputeFootAll  :7957-7968
  recomputeSingleBaseFoot :7971-8010  상업 받침 집계     :8480-8500
```

수치는 전건 일치했고 산술 정합도 닫힙니다 — 상업 push 총 229 = 실외기 177 + 다중대응 52.

---

## 규칙 상세

### 1. `COMM_MULTI` — `SI-AL600a` (실외기 일자발 (전면 4~6HP)) · source 12건

ECO 계열 ∧ HP∈{4,5,6} 또는 3.5HP. legacy_ref = index.ejs:4152-4154 chooseBaseModel. factor 전부 1(각 실외기 1대당 1개). 세트(괄호) 실외기 0건이라 ①배수 쟁점 없음. ECO 21건은 방진가대S2 계열과 겹치는 것이 0건 · SI-AL700a 와 동시 매치도 0건(HP 집합 {3.5,4,5,6}↔{7.5,8,10,12,14} 서로소). ⚠️같은 코드가 SINGLE_SET 에도 노출돼 있으나 싱글에서는 target 이 아님(싱글 일자발 target 은 SI-AL700a 뿐) — 대소문자 다른 HOME_MULTI 의 SI-AL600A 는 별개 품목(id 3ee1e322…)이므로 혼동 금지.

<details><summary>source 모델코드 12건</summary>

```text
AM040BXMDBH1  AM050TXMDBH1  AM060TXMDBH1  AM040BXMDHH1  AM050BXMDHH1  AM060BXMDHH1
AM040FXMDBC1  AM050FXMDBC1  AM060TXMDBC1  AM035FXMRHC1  AM050MXMRBC1  AM050FXMRHC1
```
</details>

### 2. `COMM_MULTI` — `SI-AL700a` (실외기 일자발 (전면 8~12HP)) · source 9건

ECO 계열 ∧ HP∈{8,10,12,14} 또는 7.5HP. legacy_ref = index.ejs:4155-4157. factor 전부 1. 세트 실외기 0건. 🚨이 품목은 SINGLE_SET 규칙(AP230/AP290→일자발)의 target 과 **같은 품목 행**(id 43019e42…)이다 — 규칙 2개가 한 품목을 target 으로 갖는 것은 스키마상 허용(ux_qst 는 rule_id+target_product_id)이나, 평가기가 카테고리로 범위를 좁히지 않으면 상업 탭과 싱글 탭 수량이 한 품목에 합산된다.

<details><summary>source 모델코드 9건</summary>

```text
AM080KXMDHH1  AM100KXMDHH1  AM120KXMDHH1  AM080MXMDHC1  AM100MXMDHC1  AM120MXMDHC1
AM140MXMDHC1  AM075FXMRHC1  AM120MXVRHC1
```
</details>

### 3. `COMM_MULTI` — `GHP방진가대` (GHP 방진가대) · source 9건

가스히트펌프 계열 전건, HP 무관(index.ejs:4160-4163 은 HP 조건이 없다). factor 전부 1. 🚨아래 ACL-KORGHP07 과 **source 집합이 완전히 동일**하므로 규칙 1개에 target 2개(display_order 1,2)로 묶는 것이 자연스럽다 — 스키마가 targets[] 복수를 지원한다. ①세트 4건(AM360/400/450/500 …S)은 레거시 SET 분기였다면 ×2 지만 현 DB 는 unit 전건 EA 라 실행된 적 없음(판정 대상).

<details><summary>source 모델코드 9건</summary>

```text
AM160NXGGBH1  AM200NXGGBH1  AM250NXGGBH1  AM300JXGGBH1  AM320NXGGBH1  AM360NXGGBH1S
AM400NXGGBH1S  AM450NXGGBH1S  AM500NXGGBH1S
```
</details>

### 4. `COMM_MULTI` — `ACL-KORGHP07` (GHP 저감장치) · source 9건

위 GHP방진가대와 같은 source 9건 · 같은 조건(가스히트펌프, HP 무관). legacy_ref = index.ejs:4160-4165. factor 전부 1. 규칙을 합칠 경우 targets=[GHP방진가대, ACL-KORGHP07] 로 두 줄만 넣으면 되고, 나눌 경우 두 규칙의 source 목록이 **반드시 동일**해야 계승이 유지된다.

<details><summary>source 모델코드 9건</summary>

```text
AM160NXGGBH1  AM200NXGGBH1  AM250NXGGBH1  AM300JXGGBH1  AM320NXGGBH1  AM360NXGGBH1S
AM400NXGGBH1S  AM450NXGGBH1S  AM500NXGGBH1S
```
</details>

### 5. `COMM_MULTI` — `방진가대S2소` (S2 방진가대 소) · source 72건

프라임∧{8,10,12} · 한랭지∧{8,10,12} · 표준형∧{8,10,12,14} · 냉방전용상부토출∧{8,10,12,14} · extra(프레스티지|동시냉난방|공장전원)∧{8,10,12}. legacy_ref = index.ejs:4168-4172. factor 전부 1. 🚨이 중 43건이 방진가대S2중 목록에도 **같이** 들어간다(중복 등록이 아니라 정상 — 아래 conflicts 참조). 🚩AM280AXVSHH1SY(고효율한랭지 28HP (08HP+20HP))는 품명이 `08HP` 라 hasExactHP 의 `(^|[^0-9.])8HP` 가 안 걸려 **여기 없다**(중만 받음) — 형제 26/30/32/34HP 는 전부 소를 받으므로 표기 오타 가능성. 레거시 현행 그대로 뒀으니 정정 여부는 판정 대상. ①SET 분기였다면 이 목록 중 14건이 ×2(AM420/440 HHH1SY · AM220/240/420/440 UHH1SY · AM220/240/420/440 HHR1SY · AM220/240/420/440 HJH1SY).

<details><summary>source 모델코드 72건</summary>

```text
AM080AXVHHH1  AM100AXVHHH1  AM120AXVHHH1  AM260AXVHHH1SY  AM280AXVHHH1SY  AM300AXVHHH1SY
AM320AXVHHH1SY  AM420AXVHHH1SY  AM440AXVHHH1SY  AM460AXVHHH1SY  AM480AXVHHH1SY  AM080AXVSHH1
AM100AXVSHH1  AM120AXVSHH1  AM260AXVSHH1SY  AM300AXVSHH1SY  AM320AXVSHH1SY  AM340AXVSHH1SY
AM080AXVGHH1  AM100AXVGHH1  AM120AXVGHH1  AM140AXVGHH1  AM360AXVGHH1SY  AM380AXVGHH1SY
AM080AXVGHC1  AM100AXVGHC1  AM120AXVGHC1  AM140AXVGHC1  AM360AXVGHC1SY  AM380AXVGHC1SY
AM400AXVGHC1SY  AM420AXVGHC1SY  AM440AXVGHC1SY  AM080AXVUHH1  AM100AXVUHH1  AM120AXVUHH1
AM220AXVUHH1SY  AM240AXVUHH1SY  AM260AXVUHH1SY  AM280AXVUHH1SY  AM300AXVUHH1SY  AM320AXVUHH1SY
AM420AXVUHH1SY  AM440AXVUHH1SY  AM460AXVUHH1SY  AM480AXVUHH1SY  AM080AXVHHR1  AM100AXVHHR1
AM120AXVHHR1  AM220AXVHHR1SY  AM240AXVHHR1SY  AM260AXVHHR1SY  AM280AXVHHR1SY  AM300AXVHHR1SY
AM320AXVHHR1SY  AM420AXVHHR1SY  AM440AXVHHR1SY  AM460AXVHHR1SY  AM480AXVHHR1SY  AM080AXVHJH1
AM100AXVHJH1  AM120AXVHJH1  AM220AXVHJH1SY  AM240AXVHJH1SY  AM260AXVHJH1SY  AM280AXVHJH1SY
AM300AXVHJH1SY  AM320AXVHJH1SY  AM420AXVHJH1SY  AM440AXVHJH1SY  AM460AXVHJH1SY  AM480AXVHJH1SY
```
</details>

### 6. `COMM_MULTI` — `방진가대S2중` (S2 방진가대 중) · source 111건

프라임∧{14,16,18,20} · 한랭지∧{14,16,18,20,22,24} · 표준형∧{16,18,20,22,24,26,28} · 냉방전용상부토출∧{16,18,20,22,24,26,28,30} · extra∧{14,16,18,20}. legacy_ref = index.ejs:4175-4179. factor 전부 1. 🚩레거시 자체의 비대칭 — 30HP 는 표준형이면 대(AM300AXVGHH1), 상부토출이면 중(AM300AXVGHC1). 원문 그대로다. ①SET 분기였다면 이 목록 중 38건이 ×2(AM340/360/380/400/460/480 HHH1SY · AM360/380/400/420/440/460 SHH1SY · AM400/420/440/460/480 GHH1SY · AM460/480/500 GHC1SY · AM340/360/380/400/460/480 UHH1SY · 같은 6개 HHR1SY · 같은 6개 HJH1SY).

<details><summary>source 모델코드 111건</summary>

```text
AM140AXVHHH1  AM160AXVHHH1  AM180AXVHHH1  AM200AXVHHH1  AM260AXVHHH1SY  AM280AXVHHH1SY
AM300AXVHHH1SY  AM320AXVHHH1SY  AM340AXVHHH1SY  AM360AXVHHH1SY  AM380AXVHHH1SY  AM400AXVHHH1SY
AM420AXVHHH1SY  AM440AXVHHH1SY  AM460AXVHHH1SY  AM480AXVHHH1SY  AM140AXVSHH1  AM160AXVSHH1
AM180AXVSHH1  AM200AXVSHH1  AM220AXVSHH1  AM240AXVSHH1  AM260AXVSHH1SY  AM280AXVSHH1SY
AM300AXVSHH1SY  AM320AXVSHH1SY  AM340AXVSHH1SY  AM360AXVSHH1SY  AM380AXVSHH1SY  AM400AXVSHH1SY
AM420AXVSHH1SY  AM440AXVSHH1SY  AM460AXVSHH1SY  AM160AXVGHH1  AM180AXVGHH1  AM200AXVGHH1
AM220AXVGHH1  AM240AXVGHH1  AM260AXVGHH1  AM280AXVGHH1  AM360AXVGHH1SY  AM380AXVGHH1SY
AM400AXVGHH1SY  AM420AXVGHH1SY  AM440AXVGHH1SY  AM460AXVGHH1SY  AM480AXVGHH1SY  AM160AXVGHC1
AM180AXVGHC1  AM200AXVGHC1  AM220AXVGHC1  AM240AXVGHC1  AM260AXVGHC1  AM280AXVGHC1
AM300AXVGHC1  AM360AXVGHC1SY  AM380AXVGHC1SY  AM400AXVGHC1SY  AM420AXVGHC1SY  AM440AXVGHC1SY
AM460AXVGHC1SY  AM480AXVGHC1SY  AM500AXVGHC1SY  AM140AXVUHH1  AM160AXVUHH1  AM180AXVUHH1
AM200AXVUHH1  AM260AXVUHH1SY  AM280AXVUHH1SY  AM300AXVUHH1SY  AM320AXVUHH1SY  AM340AXVUHH1SY
AM360AXVUHH1SY  AM380AXVUHH1SY  AM400AXVUHH1SY  AM420AXVUHH1SY  AM440AXVUHH1SY  AM460AXVUHH1SY
AM480AXVUHH1SY  AM140AXVHHR1  AM160AXVHHR1  AM180AXVHHR1  AM200AXVHHR1  AM260AXVHHR1SY
AM280AXVHHR1SY  AM300AXVHHR1SY  AM320AXVHHR1SY  AM340AXVHHR1SY  AM360AXVHHR1SY  AM380AXVHHR1SY
AM400AXVHHR1SY  AM420AXVHHR1SY  AM440AXVHHR1SY  AM460AXVHHR1SY  AM480AXVHHR1SY  AM140AXVHJH1
AM160AXVHJH1  AM180AXVHJH1  AM200AXVHJH1  AM260AXVHJH1SY  AM280AXVHJH1SY  AM300AXVHJH1SY
AM320AXVHJH1SY  AM340AXVHJH1SY  AM360AXVHJH1SY  AM380AXVHJH1SY  AM400AXVHJH1SY  AM420AXVHJH1SY
AM440AXVHJH1SY  AM460AXVHJH1SY  AM480AXVHJH1SY
```
</details>

### 7. `COMM_MULTI` — `방진가대S2대` (S2 방진가대 대) · source 7건

프라임∧{22,24} · 표준형∧{30,32,34} · 냉방전용상부토출∧{32,34}. legacy_ref = index.ejs:4182-4184. 🚩한랭지·extra 에는 '대' 분기가 없다(레거시 원문 그대로) — 22/24HP 한랭지는 한랭지 중 집합에 22,24 가 있어 중으로 가고, 22/24HP extra 는 전부 세트라 괄호 HP(10·12)로 소만 받는다. 7건 전부 단품(괄호 없음)이라 ①배수 쟁점 없음 · 다른 받침과 겹치는 것도 0건. factor 전부 1.

<details><summary>source 모델코드 7건</summary>

```text
AM220AXVHHH1  AM240AXVHHH1  AM300AXVGHH1  AM320AXVGHH1  AM340AXVGHH1  AM320AXVGHC1
AM340AXVGHC1
```
</details>

### 8. `HOME_MULTI` — `발통세트` (원형발통 세트) · source 9건

🚨홈은 chooseBaseModel 을 **쓰지 않는다** — 조건은 `/실외기/i.test(r.name)` 단 하나이고 계열·HP 를 보지 않는다(index.ejs:7959 `recomputeFootAll`). 홈 119건에 chooseBaseModel 을 돌려 결과가 나오는 행은 0건임을 재실행으로 확인. FOOT_ROUND 해소 결과 = model_code `발통세트`(품명 '원형발통 세트' — 품명만 보고 매칭하면 target 을 못 찾는다). factor 전부 1. ③🚩레거시는 여기에 **SI-AL600A(품명 '실외기 일자발', HOME 전용 품목)** 도 포함해 10건이다 — 일자발을 1개 넣으면 원형발통세트가 1개 늘어나는 명백한 오매치라 제외하고 9건으로 냈다(H-홈 권고와 동일). 레거시 100% 재현을 원하시면 SI-AL600A 를 추가. 🚩FOOT_FLAT(`/SI-AL700a/` on model)은 HOME_MULTI 에 그 코드가 없어 빈 문자열 → 홈의 일자발 강제 0 분기는 실행되지 않는 죽은 가지.

<details><summary>source 모델코드 9건</summary>

```text
AJ060MXHNBC1  AJ050MXHNBC1  AJ040MXHNBC1  AJ030MXHNBC1  AJ025MXHNBC1  AJ025RXH3BC1
AJ030RXH4BC1  AJ040RXH4BC1  AJ050RXH5BC1
```
</details>

### 9. `SINGLE_SET` — `발통세트` (원형발통 세트) · source 269건

🚨②이 목록만은 **순수 레거시 재현이 아니라 보정**이다. 레거시 견적본(index.ejs:7991 `if(unit!=='SET'&&unit!=='식') return;`)은 현 DB 에서 매치 0건이 된다 — SINGLE_SET 288건 전부 unit='EA'(재실행으로 legacyKept=0 확인). unit 게이트의 DB 대응물로 `product_type='BUNDLE'` 을 썼고 그 결과가 269(=288 − 세트 아님 17)다. 독립 교차검증: 이 17건은 '2개 이상 견적 카테고리에 동시 노출된 공용 부자재' 집합과 정확히 일치. 대안은 주문앱 레거시 규칙(catL·unit 게이트 없음 → 282건, 리모컨·유연호스·드레인펌프·SI-AL600a 까지 소스)인데 명백히 과다라 견적본을 정본으로 삼았다 — **정본 확정은 판정 대상**. 싱글은 배타적 if/else 라 한 품목이 두 받침에 걸리는 경우 0건 · 상업 chooseBaseModel 이 걸리는 싱글 품목도 0건 · 괄호 세트 HP 표기 0건. factor 전부 1(대입식 `singleQty.set(ROUND, round)`).

<details><summary>source 모델코드 269건</summary>

```text
AC060CS6PBH1SY  AC072CS6PBH1SY  AC090CS6PBH1SY  AC100CS6PBH1SY  AC100CS6PHH1SY  AC110CS6PBH1SY
AC110CS6PHH1SY  AC130CS6PBH1SY  AC130CS6PHH1SY  AC145CS6PHH1SY  AC060CS4PBH2SY  AC072CS4PBH2SY
AC090CS4PBH2SY  AC100CS4PBH2SY  AC100CS4PHH2SY  AC110CS4PBH2SY  AC110CS4PHH2SY  AC130CS4PBH2SY
AC130CS4PHH2SY  AC145CS4PHH2SY  AC060BS4PBH7SY  AC072BS4PBH7SY  AC090BS4PBH7SY  AC100BS4PBH7SY
AC100BS4PHH7SY  AC110BS4PBH7SY  AC110BS4PHH7SY  AC130BS4PBH7SY  AC130BS4PHH7SY  AC145BS4PHH7SY
AC160CS4DHH1SY  AC060CS4FBH2SY  AC072CS4FBH2SY  AC090CS4FBH2SY  AC100CS4FBH2SY  AC100CS4FHH2SY
AC110CS4FBH2SY  AC110CS4FHH2SY  AC130CS4FBH2SY  AC130CS4FHH2SY  AC145CS4FHH2SY  AC060CS4DBC1SY
AC072CS4DBC1SY  AC083CS4DBC1SY  AC100CS4DBC1SY  AC110CS4DBC1SY  AC145CS4DBC1SY  AC023CS1PBH1SY
AC032CS1PBH1SY  AC040CS1PBH1SY  AC052CS1PBH1SY  AC060CS1PBH1SY  AC023CS1DBC1SY  AC032CS1DBC1SY
AC040CS1DBC1SY  AC052CS1DBC1SY  AC060CS1DBC1SY  AC072CS1DBC1SY  AC110CAMDBH1SY  AC110CAMDHH1SY
AC145CAMDHH1SY  AC072BSCPBH2SY  AC090BSCPBH2SY  AC130BSCPHH2SY  AC145BSCPHH2SY  AP052CAPPBH1S
AP060CAPPBH1S  AP072CAPPBH1S  AP083CAPPBH1S  AP110CAPPBH1S  AP110CAPPHH1S  AP130CAPPBH1S
AP130CAPPHH1S  AP145CAPPHH1S  AP052BAPPBH2S  AP060BAPPBH2S  AP072BAPDBH2S  AP072BAPPBH2S
AP083BAPPBH2S  AP110BAPPBH2S  AP110BAPPHH2S  AP130BAPDBH2S  AP130BAPPBH2S  AP130BAPPHH2S
AP145BAPPHH2S  AP145BAPDHH2S  AP083CSPDBC1S  AP110CSPDBC1S  AP145CSPDHC1S  AP083BSPPBH6SY
AP110BSPPBH6SY  AP110BSPPHH6SY  AP145BSPPHH6SY  AP083BSPPBH7SY  AP110BSPPBH7SY  AP110BSPPHH7SY
AP145BSPPHH7SY  AP083BSPPBH8SY  AP110BSPPBH8SY  AP110BSPPHH8SY  AP145BSPPHH8SY  AP052CSPFBH2SPP
AP060CSPFBH2SPP  AP072CSPFBH2SPP  AP083CSPFBH2SPP  AR07C9181HZS  AR07C9180HZS  AR07D9181HZS
AR09C9180HZS  AR11C9180HZS  AR13C9180HZS  AR16C9180HZS  AR10B5150HZS  AR07D9150HZS
AR07D9151HZS  AR09D9150HZS  AR11D9150HZS  AR13D9150HZS  AR15D9150HZS  AR60F07C11WS
AR60F07C12WS  AR60F07C14WS  AR60F09C13WS  AR60F11C13WS  AR60F13C13WS  AR60F16C14WS
AR06D1150HZS  AR50F10D13HS  AR80F07D21WS  AR60F07D11WS  AR60F07D12WS  AR60F09D11WS
AR60F11D11WS  AR60F13D12WS  AR60F15D12WS  AF19DX838WSRS  AF19DX838WSS  AF19DX838VSRS
AF19DX838VSS  AF17DX738WSRS  AF17DX738WSS  AF17B6474WZS  AF17B6474WZRS  AF19B6474WZS
AF19B6474WZRS  AF17B6474TZS  AF17B6474TZRS  AF19B6474TZS  AF19B6474TZRS  AF17B6474GZS
AF17B6474GZRS  AF19B6474GZS  AF19B6474GZRS  AF17B7538WZS  AF17B7538WZRS  AF19B7534WZS
AF19B7534WZRS  AF17B7538TZS  AF17B7538TZRS  AF19B7534TZS  AF19B7534TZRS  AF17B7538GZS
AF17B7538GZRS  AF19B7534GZS  AF19B7534GZRS  AF60F17D11WS  AF60F17D11WRS  AF60F17D11GS
AF60F17D11GRS  AF60F17D11BS  AF60F17D11BRS  AF60F17D11LS  AF60F17D11LRS  AF60F19D11WS
AF60F19D11WRS  AF60F19D11GS  AF60F19D11GRS  AF60F19D11BS  AF60F19D11BRS  AF60F19D11LS
AF60F19D11LRS  AF70F17D11WS  AF70F17D11WRS  AF70F17D11GS  AF70F17D11GRS  AF70F17D11BS
AF70F17D11BRS  AF70F17D11LS  AF70F17D11LRS  AF70F19D11WS  AF70F19D11WRS  AF70F19D11GS
AF70F19D11GRS  AF70F19D11BS  AF70F19D11BRS  AF70F19D11LS  AF70F19D11LRS  AF70F19D25WS
AF70F19D25WRS  AF70F19D25BS  AF70F19D25BRS  AF70F19D24LS  AF70F19D24LRS  AF70F19D24RS
AF70F19D24RRS  AF70F19D24IS  AF70F19D24IRS  AF70F19D24ES  AF70F19D24ERS  AF70F17D25WS
AF70F17D25WRS  AF70F17D25BS  AF70F17D25BRS  AF70F17D24LS  AF70F17D24LRS  AF70F17D24WS
AF70F17D24WRS  AF70F17D24IS  AF70F17D24IRS  AF70F17D24ES  AF70F17D24ERS  AF80F25D29WS
AF80F25D29WRS  AF80F25D28BS  AF80F25D28BRS  AF80F20D28WS  AF80F20D28WRS  AF80F20D27CS
AF80F20D27CRS  AF80F18D28WS  AF80F18D28WRS  AF80F18D27CS  AF80F18D27CRS  AF90H25D36WS
AF90H25D36WRS  AF90H22D36WS  AF90H22D36WRS  AF90H22D35WS  AF90H22D35WRS  AF90H22D35ES
AF90H22D35ERS  AF90H19D38WS  AF90H19D38WRS  AF90H19D27SS  AF90H19D27SRS  AF90H19D35WS
AF90H19D35WRS  AF90H19D35ES  AF90H19D35ERS  AF90H19D24SS  AF90H19D24SRS  AF90H19D24GS
AF90H19D24GRS  AF90H17D38WS  AF90H17D38WRS  AF90H17D38ES  AF90H17D38ERS  AF90H17D27SS
AF90H17D27SRS  AF90H17D27GS  AF90H17D27GRS  AF90H17D35WS  AF90H17D35WRS  AF90H17D35ES
AF90H17D35ERS  AF90H17D24SS  AF90H17D24SRS  AF90H17D24GS  AF90H17D24GRS
```
</details>

### 10. `SINGLE_SET` — `SI-AL700a` (실외기 일자발 (전면 8~12HP)) · source 2건

모델코드 리터럴 `/^(AP230DAPDHH1S|AP290DAPDHH1S)$/i` (index.ejs:7997-7999). 둘 다 품명 '냉난방 프리미엄 스탠드' · product_type=BUNDLE 로 실재 확인. factor 1. 이 2건은 위 원형발통 269 목록에 들어 있지 않다(배타적 if/else). ⚠️target 이 COMM_MULTI 규칙의 SI-AL700a 와 **같은 품목 행**이다 — 평가기 카테고리 스코프 확인 필요.

<details><summary>source 모델코드 2건</summary>

```text
AP230DAPDHH1S  AP290DAPDHH1S
```
</details>

---

## 🚩 조각들이 어긋난 곳 3가지 — 임의로 고르지 않고 그대로 올립니다

① **세트 실외기 배수(레거시 SET 분기)** — C-중은 "38건 ×2 필요, 안 하면 절반", C-ECO 는 "GHP 4건 factor 2", C-대는 "SET 분기는 죽은 경로이니 ×1 이 현행", C-소는 카운트 차이를 아예 보고하지 않았습니다. 제 재실행 결과: 괄호 표기 84건 전부에서 **받침 종류 집합은 direct 경로와 SET 경로가 완전히 동일(차이 0건)** 이고, **횟수만 56건에서 다릅니다**(소 14 · 중 38 · GHP방진가대 4 · ACL-KORGHP07 4 = 중복 없는 56품목). 그리고 현 DB 는 상업 노출 **전건 `unit='EA'`(SET 0건)** 이라 레거시 SET 분기는 **한 번도 실행되지 않습니다** ⟹ 실제로 돌던 동작은 ×1. **칩 목록은 어느 해석에서도 동일**하고 갈리는 것은 factor 뿐이라, 아래 표는 전부 factor=1(레거시 실행 현행)로 내고 56건을 판정 대상으로 표시했습니다.
② **싱글 발통의 소스 게이트** — 레거시 견적본은 `unit ∈ {SET,식}` 인데 현 DB 는 288건 전부 EA 라 **글자 그대로 옮기면 매치 0건**입니다(제 재실행에서 legacyKept=0 확인). S-싱글이 `product_type='BUNDLE'` 로 대체해 269를 냈고, 저도 같은 대체로 269를 재현했습니다. 즉 싱글 칩 목록만은 **순수 재현이 아니라 보정**입니다. 게다가 주문앱 레거시(`order-app/index.html:5169-5182`)에는 catL·unit 게이트가 아예 없어 그 규칙대로면 **282건**(리모컨·유연호스·드레인펌프·SI-AL600a 까지 소스)이 됩니다. 견적본 269 를 정본으로 냈고 판정 대상으로 올립니다.
③ **홈 `SI-AL600A`(실외기 일자발)** — 레거시 `/실외기/i` 에 걸려 **받침이 발통세트 수량을 늘립니다**(일자발 1개 넣으면 원형발통세트 +1). H-홈이 오매치로 판정해 제외를 권고했고 저도 동의해 칩 목록은 **9건**으로 냈습니다. 레거시 100% 재현은 10건입니다 — 다르게 냈다는 사실을 명시합니다.

## 증거 무결성 정정 2건

(ㄱ) 조각 넷이 상업 카탈로그를 **416건**이라 적었는데, 실제 카탈로그 API(`ProductRepository.findExposedCatalog` 279-292)는 `status NOT IN (DISCONTINUED, NOT_FOR_SALE) AND usage_scope IN (…)` 까지 걸어 **408건**입니다. 차액 8건은 전부 `usage_scope='NONE'` 인 판넬(PC6NUNK1NW·PC4NUXK1NW·PC6EUCK1NW·PC6EUXK1NW·PC6NBDK1NW·PC6NUXK1NW·PC4NBFK1NW·PC6NBNK1NW)이라 **실외기 177건과 받침 7종에는 영향이 없습니다**(S-싱글만 이 필터를 제대로 걸었습니다). (ㄴ) C-대의 *"AM250·AM450·AM500 은 HP 토큰이 하나도 매치되지 않는다"* 는 **AM450NXGGBH1S 에서 틀립니다** — 품명 `GHP 가스히트펌프 45HP (20HP+25HP)` 는 `20` 이 매치됩니다(앞 문자가 `(`). GHP 는 HP 무관 분기라 결과는 같습니다.

## 레거시 정규식 함정 (실행으로 재확인)

```text
`112HP × 12` = false · `12HP × 12` = true · `3.5HP × 5` = false · **`08HP × 8` = false**(→ AM280AXVSHH1SY 가 S2소를 못 받는 실측 원인, SET 경로로 돌려도 동일) · `3X5HP × 3.5` = **true**(원문에서 `3.5`·`7.5` 의 점이 이스케이프되지 않음 — 현 카탈로그엔 오탐 0).
```

## 안 본 것

구글 시트 원본은 열지 않았습니다(DB 카탈로그만). 옵션 게이트(`#comm_ex_base`·`#home_foot`·`#ss_base`·`COMM_MANUAL_BASE`·`HOME_MANUAL_FOOT`)는 칩 목록이 아니라 `condition_json`/`inactive_behavior` 사안이라 schemaFit 에만 적었습니다.

---

## 스키마 적합성

【결론 — 그대로 저장 가능합니다. 개발책임자 지적대로 현 스키마로 됩니다.】 규칙 10개(GHP 를 target 2개로 묶으면 9개) · source 총 509행 · target 총 10행 · aggregation SUM · factor 전부 1. `quantity_sync_rule / quantity_sync_source / quantity_sync_target` 3테이블은 이미 존재하고 현재 전부 0행(2026-08-10 17:01 KST 실측)입니다.

【① 각 규칙이 source 목록 하나 + target 하나로 떨어지는가 — 예, 전건】 10개 규칙 전부 "source 복수 → target 1" 로 떨어집니다. 유일하게 target 이 둘인 것은 GHP(GHP방진가대 + ACL-KORGHP07)인데 **source 집합이 완전히 동일**해서 한 규칙에 targets 2행(display_order 1,2)으로 넣으면 되고, 스키마가 targets[] 복수를 지원하므로 문제가 없습니다. 반대로 "한 실외기가 두 받침" 인 52건은 규칙을 쪼갤 이유가 아니라 **두 규칙의 source 목록에 같은 모델코드가 각각 들어가는 것**으로 표현되며, unique 인덱스는 (rule_id, source_product_id) 라 서로 다른 규칙이면 충돌하지 않습니다.

【② factor 는 전부 1 인가 — 예(레거시 실행 현행 기준)】 재실행 결과 direct 경로에서 한 품목이 한 target 을 **2회 이상 push 하는 경우가 0건**(최대 1)이었습니다. 즉 레거시는 '실외기 1대당 받침 1개 ×1 가산' 이고 factor=1·multiplier=1 이 정확한 계승입니다. 🚩단 죽은 SET 분기를 되살린다면 56품목이 factor 2 가 되어야 합니다(소 14 · 중 38 · GHP방진가대 4 · ACL-KORGHP07 4). factor CHECK 는 0<factor≤1000 · 소수 4자리라 2 는 적법하므로 **스키마가 막지는 않습니다** — 판정만 필요합니다.

【③ 검증기(QuantitySyncRuleValidator)를 실제로 통과하는가 — 4개 축 전부 확인】
· **category 멤버십**: source·target 둘 다 그 규칙 카테고리에 노출돼야 합니다. 상업 7개 규칙의 target 7종이 COMMERCIAL_MULTI 에 실재(전부 ACTIVE·usage_scope=BOTH), 홈 발통세트가 HOME_MULTI 에 실재, 싱글 발통세트·SI-AL700a 가 SINGLE_SET 에 실재함을 확인했습니다. 규칙 category 어휘는 `COMM_MULTI` 이고 노출 어휘는 `COMMERCIAL_MULTI` 로 **이름이 다릅니다** — 서비스가 매핑합니다(QuantitySyncRuleService:275, 464). 시드에 `COMMERCIAL_MULTI` 를 그대로 넣으면 CHECK 위반입니다.
· **source ≠ target**: 10개 규칙 전부 겹침 0. 싱글에서 발통세트·SI-AL700a 는 skip 으로, SI-AL600a 는 product_type=SINGLE 로 소스에서 빠져 있습니다.
· **순환 없음**: 받침 7종·발통세트는 어떤 규칙에서도 source 가 아니므로 그래프에 사이클이 없습니다. ⚠️단 싱글을 주문앱 규칙(282건)으로 넓히면 SI-AL600a 가 source 로 들어오는데, 그것은 COMM 규칙의 target 이라 그래프 간선이 하나 늘어납니다(사이클은 아니지만 의미상 잘못).
· **BUNDLE source ↔ component target 금지**: `bundle_component` 전건(1,584행 규모)에서 component_product_code 가 우리 target 9종과 일치하는 행은 **0건**이고 component_kind='FOOT' 행도 0건이라 이 규칙에 걸리지 않습니다. GHP 세트(BUNDLE/EXPAND)도 구성품이 AM160/AM200/AM250 뿐이라 안전합니다.

【④ 표현하지 못하는 것 — 구체적으로 남는 4가지】
· **옵션 게이트**: `#comm_ex_base`(받침·발통·일자발·SI-AL 계열 전체 0) · `#home_foot`(발통포함) · `#ss_base`(실외기 받침대 포함). 세 옵션의 DB 기본값은 estimate_configs 에서 home_with_foot=false · single_with_base=false 입니다. 시맨틱상 `inactive_behavior='ZERO'` + `condition_json`(optionEquals/optionIn) 으로 표현 가능하지만, **조건 평가기가 clients/ 에 아직 없습니다**(2026-08-10 사전 조사에서 `optionEquals|optionIn` 단어경계 grep 0건). ⟹ 규칙을 저장해도 지금은 화면 수량이 바뀌지 않습니다.
· **수동 편집 잠금**: `COMM_MANUAL_BASE`(index.ejs:8493) · `HOME_MANUAL_FOOT`(5896,6010,6018)는 "사용자가 그 받침 수량을 직접 만지면 자동 합산에서 제외" 하는 **런타임 집합**입니다. 스키마에 대응 필드가 없습니다(conflict_policy ADD/REPLACE 는 규칙 간 충돌 정책이지 사용자 수동 편집 우선권이 아닙니다).
· **세트 판정 축**: 레거시가 쓰는 `unit ∈ {SET,식}` 이 현 DB 에서 전건 EA 라 죽어 있습니다. 상업 세트 84건·싱글 세트 271건은 `product_type='BUNDLE'`(+bundle_mode) 로만 구별됩니다. 칩 목록 자체는 이 축과 무관하지만 **factor 2 를 채택하는 순간 세트 판정 축을 무엇으로 할지가 규칙 데이터로는 표현 못 하는 구현 사안**이 됩니다.
· **카테고리 간 target 공유의 런타임 스코프**: 발통세트·SI-AL700a 가 두 규칙의 target 입니다. 규칙 행에는 estimate_category 가 있으니 데이터로는 구분되지만, 소비기가 카테고리로 규칙을 걸러 주지 않으면 합산됩니다.

【⑤ 세팅 시 함정 3가지】 (ㄱ) `rule_key` CHECK 는 `^[A-Za-z0-9_-]+$` 라 한글 불가 — 예: COMM_BASE_S2_SMALL. `legacy_ref` 는 NOT NULL 이니 `clients/web/estimate-app/views/index.ejs:4149-4193 chooseBaseModel` 처럼 좌표를 남길 것. (ㄴ) target 모델코드는 **한글 그대로**(`방진가대S2소`·`발통세트`)가 정답이며 품명('S2 방진가대 소'·'원형발통 세트')으로 찾으면 안 됩니다 — 특히 발통세트는 품명에 공백이 있어 `/발통세트/` 가 품명엔 안 걸립니다. (ㄷ) `SI-AL600a`(상업/싱글)와 `SI-AL600A`(홈)는 **대소문자만 다른 별개 품목**(id cb7e94d9… vs 3ee1e322…)이므로 표기를 그대로 유지해야 합니다. 품목 해소는 model_code 우선·model_name fallback 이라 표기가 흔들리면 다른 품목을 가리킬 수 있습니다.

---

## 충돌·다중 대응 (59건)

- 【유형 A — 한 실외기가 받침 2개를 동시에 받는다(레거시가 독립 if 라 동시 push). 상업 실외기 177건 중 52건. 아래 전수. 두 target 의 칩 목록에 같은 모델코드가 들어가는 것이 정상이며, 중복으로 오인해 한쪽을 지우면 계승이 깨진다.】
- AM260AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 26HP  (10HP+16HP)
- AM280AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 28HP  (10HP+18HP)
- AM300AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 30HP  (10HP+20HP)
- AM320AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 32HP  (12HP+20HP)
- AM420AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 42HP  (10HP+12HP+20HP)
- AM440AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 44HP  (12HP+12HP+20HP)
- AM460AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 46HP  (12HP+16HP+18HP)
- AM480AXVHHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프라임 48HP  (12HP+16HP+20HP)
- AM260AXVSHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 고효율한랭지 26HP (12HP+14HP)
- AM300AXVSHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 고효율한랭지 30HP (10HP+20HP)
- AM320AXVSHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 고효율한랭지 32HP (12HP+20HP)
- AM340AXVSHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 고효율한랭지 34HP (10HP+24HP)
- AM360AXVGHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 표준형 36HP (12HP+24HP)
- AM380AXVGHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 표준형 38HP (14HP+24HP)
- AM360AXVGHC1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 냉방전용 상부토출 36HP (14HP+22HP)
- AM380AXVGHC1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 냉방전용 상부토출 38HP (14HP+24HP)
- AM400AXVGHC1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 냉방전용 상부토출 40HP (12HP+28HP)
- AM420AXVGHC1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 냉방전용 상부토출 42HP (14HP+28HP)
- AM440AXVGHC1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 냉방전용 상부토출 44HP (14HP+30HP)
- AM260AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 26HP  (10HP+16HP)
- AM280AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 28HP  (10HP+18HP)
- AM300AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 30HP  (10HP+20HP)
- AM320AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 32HP  (12HP+20HP)
- AM420AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 42HP  (10HP+12HP+20HP)
- AM440AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 44HP  (12HP+12HP+20HP)
- AM460AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 46HP  (12HP+16HP+18HP)
- AM480AXVUHH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 프레스티지 48HP  (12HP+16HP+20HP)
- AM260AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 26HP  (10HP+16HP)
- AM280AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 28HP  (10HP+18HP)
- AM300AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 30HP  (10HP+20HP)
- AM320AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 32HP  (12HP+20HP)
- AM420AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 42HP  (10HP+12HP+20HP)
- AM440AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 44HP  (12HP+12HP+20HP)
- AM460AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 46HP  (12HP+16HP+18HP)
- AM480AXVHHR1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 동시냉난방 48HP  (12HP+16HP+20HP)
- AM260AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 26HP  (10HP+16HP)
- AM280AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 28HP  (10HP+18HP)
- AM300AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 30HP  (10HP+20HP)
- AM320AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 32HP  (12HP+20HP)
- AM420AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 42HP  (10HP+12HP+20HP)
- AM440AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 44HP  (12HP+12HP+20HP)
- AM460AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 46HP  (12HP+16HP+18HP)
- AM480AXVHJH1SY | 방진가대S2소 + 방진가대S2중 | DVM S2 공장전원 48HP  (12HP+16HP+20HP)
- AM160NXGGBH1 | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 16HP (HP 무관 분기)
- AM200NXGGBH1 | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 20HP (HP 무관 분기)
- AM250NXGGBH1 | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 25HP (HP 무관 분기)
- AM300JXGGBH1 | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 30HP (HP 무관 분기)
- AM320NXGGBH1 | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 32HP (HP 무관 분기)
- AM360NXGGBH1S | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 36HP (16HP+20HP)
- AM400NXGGBH1S | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 40HP (20HP+20HP)
- AM450NXGGBH1S | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 45HP (20HP+25HP)
- AM500NXGGBH1S | GHP방진가대 + ACL-KORGHP07 | GHP 가스히트펌프 50HP (25HP+25HP)
- 【유형 A 요약】 43건 = 방진가대S2소+방진가대S2중(세트 실외기의 괄호 HP 가 소 구간과 중 구간에 각각 걸림) · 9건 = GHP방진가대+ACL-KORGHP07(HP 무관, index.ejs:4160-4165 가 무조건 둘 다 push). 그 밖의 조합(대·SI-AL600a·SI-AL700a 가 다른 받침과 동시)은 **0건**. ECO 21건이 방진가대S2 계열과 겹치는 것도 0건.
- 【유형 B — 한 부자재가 두 규칙의 target 이 된다(같은 품목 행)】 발통세트(id 355abfba…) = HOME_MULTI 규칙 + SINGLE_SET 규칙의 target. SI-AL700a(id 43019e42…) = COMM_MULTI 규칙(ECO 8~14HP) + SINGLE_SET 규칙(AP230/AP290)의 target. 스키마상 허용(ux_qst 는 rule_id+target_product_id 조합)이나, 평가기가 활성 탭 카테고리로 규칙을 좁히지 않으면 **홈 발통 합계와 싱글 발통 합계가 한 품목에 합산**된다. quantity_sync_rule.estimate_category 가 있으니 표현은 되지만 소비기 구현 시 반드시 확인할 것.
- 【유형 C — 같은 품명 축에서 결과가 갈리는 레거시 비대칭 3건(충돌은 아니나 오인 소지)】 ① AM280AXVSHH1SY '고효율한랭지 28HP (08HP+20HP)' → 품명이 08HP 라 8HP 토큰이 안 잡혀 소를 못 받고 중만 받는다(형제 26/30/32/34HP 는 소+중). ② 30HP 는 표준형이면 대(AM300AXVGHH1), 냉방전용 상부토출이면 중(AM300AXVGHC1). ③ 한랭지·extra 에는 '대' 분기가 아예 없다. 셋 다 레거시 원문 그대로이며 재실행으로 재현했다.
- 【유형 D — 조각 간 판단 불일치(임의로 고르지 않음)】 세트 실외기 배수: C-중 '38건 ×2 필요' vs C-대 'SET 은 죽은 경로, ×1 이 현행' vs C-ECO 'GHP 4건 ×2' vs C-소 '차이 없음'. 실측 = 받침 **종류**는 두 경로가 완전 동일(84건 전부, 차이 0), **횟수**만 56품목에서 다름(소14·중38·GHP방진가대4·ACL-KORGHP074), 그리고 현 DB 는 unit 전건 EA 라 SET 분기가 실행된 적 없음 ⟹ 표는 ×1 로 냈고 56건은 개발책임자 판정 대상.
- 【유형 E — 조각 간 판단 불일치】 싱글 소스 게이트: 레거시 견적본(unit SET/식 + catL) 그대로면 0건 · product_type=BUNDLE 대체면 269건 · 주문앱 레거시(게이트 없음)면 282건. 269 를 정본으로 냈으나 확정 필요.
- 【유형 F — 조각 간 판단 불일치】 홈 발통 소스에 SI-AL600A(실외기 일자발)를 넣을 것인가: 레거시는 넣는다(10건) · H-홈과 저는 오매치로 보고 뺐다(9건).

## 미매치 (6건)

- 【결론 — 어느 받침도 못 받는 실외기는 0건입니다】 COMMERCIAL_MULTI 노출 실외기 177건(isCommOutdoorRow: model 이 AM 시작 ∧ 길이≥7 ∧ 7번째 글자 'X') 전건이 chooseBaseModel 에서 최소 1개 받침을 받습니다(재실행 확인, 2026-08-10 17:0x KST). HOME_MULTI 실외기 9건 전건이 발통세트를 받습니다. SINGLE_SET 에는 실외기 품목 자체가 없습니다(품명이 '실외기' 인 3건은 전부 받침 품목 자신).
- 【실외기 판정 누락도 0건】 상업 비실외기 231건을 계열 키워드(실외기|가스히트펌프|프라임|한랭지|표준형|상부토출|\bECO\b|프레스티지|동시냉난방|공장전원)로 역검색한 결과 걸린 것은 AF-R09A·AF-R12A(ECO 리뉴얼 '필터') 와 SI-AL600a·SI-AL700a(받침 자신) 4건뿐이며 전부 실외기가 아닙니다. HOME 도 model[6]='X' 인 9건과 /실외기/ 매치 9건이 정확히 일치합니다(SI-AL600A 는 이름만 매치).
- 【부분 미매치 1건 — 판정 요망】 AM280AXVSHH1SY (DVM S2 고효율한랭지 28HP (08HP+20HP)) : 품명이 '08HP' 라 hasExactHP 의 (^|[^0-9.])8HP 에서 앞 문자 '0' 이 숫자라 매치되지 않아 **방진가대S2소를 못 받습니다**(방진가대S2중만 받음). 형제 26/30/32/34HP 는 전부 소+중. SET 경로로 돌려도 동일(치환값이 '(08HP)'). 품명 오타로 보이나 레거시 동작을 그대로 뒀습니다.
- 【HP 토큰이 하나도 안 잡히는 실외기 2건 — GHP 분기가 아니었으면 미매치였을 구조】 AM250NXGGBH1(GHP 가스히트펌프 25HP) · AM500NXGGBH1S(GHP 가스히트펌프 50HP (25HP+25HP)) : 레거시가 test 하는 HP 목록에 25·50 이 없어 매치 0. GHP 분기가 HP 무관이라 받침을 받습니다. ※C-대는 여기에 AM450NXGGBH1S 도 포함했는데 그것은 틀립니다 — 'GHP 가스히트펌프 45HP (20HP+25HP)' 는 '20' 이 매치됩니다(앞 문자가 '('). 결과에는 영향 없습니다.
- 【품명에 HP 표기가 없는 실외기 = 0건】 상업 실외기 177건 전부 품명에 'HP' 문자열이 있습니다. 홈 실외기 9건도 전부 있습니다(다만 홈 규칙은 HP 를 보지 않습니다).
- 【SINGLE_SET 에서 발통 대상이 아닌 17건(실외기 아님 — 참고)】 받침 자신 3: 발통세트·SI-AL700a·SI-AL600a / 운임·절삭 2 / 공용 부자재 12: AIM-H04N·AIM-N01·AR-EC05·AR-EH05·AR-KH05·AWR-WG00N·AWR-WE13N·FH-LFHLF·FH-LFHLN·FH-LFHIF·ADP-F075SP·AIM-A01N. ※운임·절삭 제외는 '발통 합산 소스에서 뺀다' 는 뜻이지 견적서 표시에서 뺀다는 뜻이 아닙니다(feedback_freight_cutting_amount_first_entry 와 충돌하지 않음).
