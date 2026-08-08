# #896/#1143 P1 — 세트 구성품 비중 불일치 결정 시트

| 분류 | 건수 | 출력 영향 | 결정 필요? |
|---|---:|---|---|
| 83-A. 실내기 쪽 상계 이동 | 64그룹 | 시트 원문은 그대로 출력되지 않음. 레거시 재계산값이 출력됨 | **아니요** — 현행 재계산값을 정본으로 고정 |
| 83-B. 실외기 쪽 반대 상계 | 19그룹 | 위 64세트의 반대편 64행. 세트 합계 변화 없음 | **아니요** — 83-A와 같은 한 규칙 |
| 36-A. 출고가 — 배분식 비대상 | 12그룹 | 싱글 세트 내부 **납품가** 출력에는 영향 없음 | **아니요** — P1 대상에서 제외 |
| 36-B. 판넬·리모컨 고정 입력 | 21그룹 | 선택된 고정부품 상세행에는 직접 영향 | **아니요** — 문맥 고정금액으로 보존 |
| 36-C. 싱글 본체 문맥 없음 | 3그룹 | P1 싱글 배분에는 없음. 다른 카탈로그 문맥에는 있을 수 있음 | **아니요** — P5 문맥가격으로 이관 |

> **아침 결론: 결정 질문은 0개다.** 숫자 `22/83/36` 자체는 같은 원본에서 재현됐다. 그러나 “83개 중 어느 값이 맞는지 고른다”는 해석은 틀렸다. 83그룹은 **64개 `…RS` 가정용 세트에서 동일한 계산순서 차이가 양쪽 본체로 전파되어 모델 기준 64+19그룹으로 중복 집계된 것**이다. 현재 레거시는 시트 본체 원문을 최종값으로 쓰지 않고 6:4 재계산값으로 덮어쓴 뒤 그 값을 출력한다. 따라서 합격 기준이 “현재 레거시처럼 출력”이면 재계산측이 자동 승자다.

## 1. 먼저 바로잡을 사실

- 배경의 비인상 `일치 22 / 불일치 83 / 판정불가 36`은 직접 재계산해 동일했다. `_단가인상`도 `22 / 83 / 27`로 재현됐다.
- 하지만 **83은 83개의 업무 충돌이 아니다.** 계산 가능한 문맥은 실내기 1대+실외기 1대인 64세트이고, 차이가 항상 `실내기 -x / 실외기 +x`로 한 쌍이다. 모델로 다시 묶으면서 실내기 모델 64개와 여러 세트가 공유하는 실외기 모델 19개가 되어 83그룹이 됐다.
- 64/64세트의 모델명이 `RS`로 끝나며, 모두 가정용 본체 2대 외에 고정금액 벽걸이를 가진다.
- 128개 차이 문맥 전부에서 `시트 실내기 + 시트 실외기 = 재계산 실내기 + 재계산 실외기`다. 세트 총액 차이는 **0원**이다.
- 따라서 기존 P1 문서의 “원문 83을 0으로 만든다”는 관문은 그대로 쓰면 잘못된 목표다. 관문은 **원시 본체 셀 일치가 아니라 `explodeSetParts()`가 반환하여 실제 인쇄하는 상세행 일치**여야 한다.

## 2. 83그룹의 실제 원인

### 한 원인: 가정용 벽걸이 고정금액의 차감 순서

64세트에는 일반 실내기·실외기 외에 고정가 벽걸이가 있다. 일부에는 리모컨 같은 다른 고정품도 있다.

- 시트 본체 원문이 담은 순서: `세트가 - 일반 고정품`을 6:4로 나눈 뒤, **벽걸이 금액 전부를 실외기 몫에서 차감**한다.
- 현재 레거시 출력 순서: `세트가 - 일반 고정품 - 벽걸이`를 먼저 계산한 뒤, 남은 금액을 **6:4로 배분**한다.
- 그래서 시트 원문은 레거시 출력보다 일반 실내기가 높고 실외기가 같은 금액만큼 낮다. 벽걸이 자체 금액과 세트 총액은 같다.

세트별 이동액 분포는 108,000원 12세트, 120,000원 28세트, 159,000원 2세트, 172,000원 16세트, 239,000원 4세트, 260,000원 2세트다. 모두 10만원을 넘고, 천 원 반올림 오차가 아니다. 이동액은 대체로 `벽걸이 고정금액 × 60%`이며 천 원 정렬의 영향을 받는다.

### 83-A. 실내기 쪽 상계 이동 — 64그룹

각 affected 세트의 일반 실내기 모델은 시트 원문이 레거시 재계산값보다 높다. 모델 64개가 각 세트에 대응하므로 64그룹이다.

대표 사례 3건(원문 양쪽):

1. `AF17B6474WZN` / 세트 `AF17B6474WZRS`: 시트 원문 `"  792,000 "` ↔ 레거시 재계산 `684,000`원, 차이 `-108,000`원.
2. `AF60F17D11BN` / 세트 `AF60F17D11BRS`: 시트 원문 `"  769,000 "` ↔ 레거시 재계산 `649,000`원, 차이 `-120,000`원.
3. `AF90H25D36WN` / 세트 `AF90H25D36WRS`: 시트 원문 `"  2,910,000 "` ↔ 레거시 재계산 `2,650,000`원, 차이 `-260,000`원.

출력 판정: **원문 차이 자체는 현재 출력에 나타나지 않는다.** `explodeSetParts()`가 원시 `price`를 읽은 뒤 재배분하고, 반환된 `r.price`를 상세행 단가로 인쇄한다(`tools/legacy-gas/종합견적서/index.html:4780-4897`, `:11438`, `:11749`). 다만 이관 후 원문을 최종 단가로 잘못 사용하면 위 행들이 실제로 달라지므로 구현 위험은 높다.

### 83-B. 실외기 쪽 반대 상계 — 19그룹

64세트가 실외기 모델을 공유하므로 문맥은 64행이지만 모델 그룹은 19개다. 각 문맥의 차이는 같은 세트 실내기와 크기가 같고 부호만 반대다.

대표 사례 3건(원문 양쪽):

1. `AF17B6470DCX` / 세트 `AF17B6474WZRS`: 시트 원문 `"  348,000 "` ↔ 레거시 재계산 `456,000`원, 차이 `+108,000`원.
2. `AF60F17D1QBX` / 세트 `AF60F17D11BRS`: 시트 원문 `"  313,000 "` ↔ 레거시 재계산 `433,000`원, 차이 `+120,000`원.
3. `AF90H25D01BX` / 세트 `AF90H25D36WRS`: 시트 원문 `"  1,507,000 "` ↔ 레거시 재계산 `1,767,000`원, 차이 `+260,000`원.

출력 판정과 자동 처리 규칙은 83-A와 같다. 83-A/B를 별도 업무 결정으로 나누면 같은 세트의 양변을 두 번 결정하는 오류가 된다.

## 3. 요청한 충돌 축으로 다시 센 결과

83그룹을 숫자 정규화 후 분류하면 다음과 같다.

- 한쪽이 빈칸/0: **0그룹**.
- 반올림·자릿수 차이: **0그룹**. 절대차 1~1,000원, 1,001~10,000원, 10,001~100,000원은 모두 0문맥이고 128/128문맥이 100,000원 초과다.
- 표기·공백만 다른 것: **0그룹**. 원문 셀에는 공백과 쉼표가 있으나 이를 제거해도 83그룹 모두 숫자가 실제로 다르다.
- 실제 숫자가 다른 것: **83그룹**. 단, 독립 충돌 83개가 아니라 위 한 계산순서가 만든 실내 64+실외 19다.

### 빈칸·0 두 기준

두 기준을 각각 실행했다.

1. 코드 동등 기준 — 빈칸과 `0`을 숫자 0으로 계산: `22 / 83 / 36`.
2. 제외 기준 — 부모 세트가, 고정품 또는 본체 가중치에 빈칸/0이 하나라도 있으면 그 문맥을 제외: `22 / 83 / 36`.

결과가 같은 이유는 83그룹의 차이 128문맥에 시트값 0, 재계산값 0, 필수 부모값 누락이 각각 **0건**이기 때문이다. 따라서 경고에 든 `680,000 ↔ 0` 유형은 이 83에 없다. 양수↔DB 0을 포함한 다른 가격 parity 집계와 이 83을 섞으면 안 된다.

## 4. 판정불가 36그룹의 이유

판정불가는 “원자료가 없어서”가 아니다. 36그룹 모두 서로 다른 양수 원문값이 실제로 있다. 문제는 이 P1 배분식이 그 필드 또는 문맥의 새 값을 만들지 않는다는 점이다.

### 36-A. 출고가 — 배분식 비대상 12그룹

6:4/4:6 식은 납품가만 만든다. 출고가의 어느 문맥값이 맞는지 판정할 계산 기준이 없다.

대표 사례 3건:

1. `AC060CXAPBH1`: `1,254,000` ↔ `1,331,000`원.
2. `AC110CXAPBH1`: `1,342,000` ↔ `2,156,000`원.
3. `AC145BXADHH1`: `1,705,000` ↔ `1,756,700`원.

원인 분류: 데이터 없음 0, **기준 없음 12**, 코드에만 있어 실행 불가 0. 싱글 세트 내부 납품가 출력에는 영향이 없으므로 P1에서 결정하지 않는다.

### 36-B. 판넬·리모컨 고정 입력 — 21그룹

판넬 16그룹과 리모컨 5그룹이다. 레거시는 이 값을 6:4로 생성하지 않고 선택된 탭/세트 문맥의 절대값으로 받아 고정합계에 넣는다. 데이터는 있으나 독립 생성 기준이 없으므로 “재현 가능/불가능”을 물을 대상이 아니다.

대표 사례 3건:

1. `AR-EH05` 납품가: 상업멀티 `13,915` ↔ 싱글 `16,000`원.
2. `PC1NWSK3NW` 납품가: 상업/홈 문맥 `84,700` ↔ 싱글 문맥 `128,000`원.
3. `PC6NUCK1NW` 납품가: 상업/홈 문맥 `556,600` ↔ 싱글 문맥 `678,000`원.

원인 분류: 데이터 없음 0, **독립 생성 기준 없음 21**, 코드에만 있어 실행 불가 0. 선택 시 상세행과 본체 배분 잔액에 실제 영향이 있으므로 `products.delivery_price` 하나로 고르지 말고 `bundle_component.fixed_allocation_amount` 같은 문맥 고정금액으로 보존해야 한다. 이는 “제품 납품가는 하나”와 충돌하지 않는다.

### 36-C. 싱글 본체 계산 문맥 없음 — 3그룹

값은 있지만 6:4를 적용할 싱글 실내기/실외기 세트 문맥이 없다.

1. `AIM-H04` 납품가: `98,615` ↔ `100,000`원.
2. `AIM-N01` 납품가: `18,150` ↔ `20,000`원.
3. `AM120MXVRHC1` 납품가: 구형 `3,905,000` ↔ 상업멀티 `4,686,000`원.

원인 분류: **적용 문맥 없음 3**, 기준 없음 0, 코드에만 있어 실행 불가 0. P1 싱글 배분 출력에는 영향이 없지만 다른 카탈로그 문맥에는 노출될 수 있으므로 P5 문맥가격 parity 대상으로 넘긴다.

따라서 36 전체를 질문의 세 축으로 합치면 `원자료 없음 0 / 배분식의 독립 기준 없음 33(출고가 12+고정 입력 21) / 적용 문맥 없음 3 / 코드에만 있어 재현 불가 0`이다.

## 5. 결정 불요 규칙과 해소 건수

1. **`WEIGHTED_BODY`는 시트 절대 셀을 최종 단가로 이관하지 않는다.** 현재 레거시와 같은 `고정합계 선차감 → 가정용 6:4 → 천 원 정렬 → 그룹 내 가중치 배분` 결과를 출력 정본으로 삼는다. 1+1인 affected 64세트에서는 원문 본체값이 최종값에 쓰이지 않는다. **83/83그룹 해소**.
2. **실내/실외 차이를 서로 다른 결정으로 취급하지 않는다.** 64세트마다 두 차이의 합이 0이므로 한 정책으로 함께 검증한다. 검증 단위는 모델 그룹 83이 아니라 세트 64개와 상세행 128개다.
3. **`FIXED_COMPONENT`는 비어 있지 않은 임의 전역값을 고르는 문제가 아니다.** 선택된 세트/탭 문맥의 원문 고정금액을 보존한다. **판정불가 21그룹을 분류 완료**.
4. **출고가 12그룹은 P1 식에서 제외**하고 별도 출고가 parity에 남긴다. **12그룹 분류 완료**.
5. **싱글 계산 문맥이 없는 3그룹은 P5로 라우팅**한다. **3그룹 분류 완료**.
6. P1 합격 게이트는 `원시 셀 83→0`이 아니라, 저장된 sheet 골든의 **전개 후 상세행 모델·단가·소계·세트합계 diff 0**이다.

## 6. 결정 질문 목록

**없음.** 개발책임자가 이미 확정한 “세트 납품가가 중요하고 내부 납품가는 비율대로”, “이관 뒤 현재 레거시처럼 출력”을 적용하면 위 규칙이 유일하다.

다만 방향을 뒤집어 **시트의 원시 본체 셀을 현재 레거시 재계산 출력보다 우선**하려는 경우에만 새 결정이 필요하다. 그 선택의 대가는 64세트 128개 상세행 단가가 현재 레거시 출력과 달라지고, P1의 합격 기준 자체를 바꿔야 한다는 것이다. 본 문서는 그 선택을 권고하지 않는다.

## 7. 직접 재측정 근거와 명령

### 입력 고정

읽은 원본은 보고서 숫자를 옮긴 것이 아니라 아래 로컬 CSV다.

```text
C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\
  cdbb83c4-61fe-4c24-ba6f-7688e70e25fa\scratchpad\live_sheet\
  cdbb83c4-61fe-4c24-ba6f-7688e70e25fa\scratchpad\live_sheet_inc\
```

핵심 SHA-256:

```text
싱글 세트.csv                 1E6DA2865BF98B389D37F478A0B973D5AB72D4A0666D944567F01D592EBB0D26
싱글 구성품.csv               36308E565F53D8F8256548AED43CE4F47DA4334550215812D5507342E86D0507
싱글 세트_단가인상.csv        2B8EEF95D05AB576F5FB8F185E9A2F3A2CD986153C4D638D2B920DB98531EFDC
싱글 구성품_단가인상.csv      1C47A740E6BD8D92DFA7E336FCFD5C9D762B0EC3724577680BDCA3A9BB9543C8
홈멀티.csv                    C7FDE894D8C4B8EB85BB1BCDF63F5D830B0203CDDF96B841A9245ED29BDF0D3B
상업멀티.csv                  C1D66E951228AB4C02A58444C87E2AFB2CF3D4F59948597EEA126D06B8E57A44
상업멀티 구성.csv             2399C9AE8BDB522100E5FA7A83A153C0588F8D6E3D820D790104F66A14C97A69
구형.csv                      191863A384173692CB9A6E76973F09F270A00CF348D1BB3392946BBECCA75E9A
```

해시 명령:

```powershell
$base = 'C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\cdbb83c4-61fe-4c24-ba6f-7688e70e25fa\scratchpad'
Get-FileHash -Algorithm SHA256 -LiteralPath `
  (Join-Path $base 'live_sheet\싱글 세트.csv'), `
  (Join-Path $base 'live_sheet\싱글 구성품.csv'), `
  (Join-Path $base 'live_sheet_inc\싱글 세트_단가인상.csv'), `
  (Join-Path $base 'live_sheet_inc\싱글 구성품_단가인상.csv'), `
  (Join-Path $base 'live_sheet\홈멀티.csv'), `
  (Join-Path $base 'live_sheet\상업멀티.csv'), `
  (Join-Path $base 'live_sheet\상업멀티 구성.csv'), `
  (Join-Path $base 'live_sheet\구형.csv')
```

### 전건 집계 명령

화면 출력을 파일로 잘라 세지 않았다. PowerShell here-string으로 Python CSV 파서를 표준입력 실행하고 전건을 메모리에서 집계했으며, 프로세스 종료코드는 파이프 뒤의 별도 명령으로 읽지 않았다.

```powershell
$env:ANALYSIS_BASE = 'C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\cdbb83c4-61fe-4c24-ba6f-7688e70e25fa\scratchpad'
@'
import csv, pathlib, os, re, math
from collections import defaultdict, Counter

B = pathlib.Path(os.environ['ANALYSIS_BASE'])
KIND='\uad6c\ubd84'; MODEL='\ubaa8\ub378\uba85'; SET='\uc138\ud2b8'
IND='\uc2e4\ub0b4\uae30'; OUT='\uc2e4\uc678\uae30'; WALL='\ubcbd\uac78\uc774'
PANEL='\ud310\ub12c'; REMOTE='\ub9ac\ubaa8\ucee8'; MATERIAL='\uc790\uc7ac'; BASIC='\uae30\ubcf8'

def number(v):
    s=re.sub(r'[^0-9.-]','',v or '')
    try: return int(float(s)) if s not in ('','-','.') else 0
    except ValueError: return 0
def round_k(v): return math.floor(v/1000+0.5)*1000
def load(p): return list(csv.reader(p.open(encoding='utf-8-sig',newline='')))
def single_files(dirname):
    ss=sp=None
    for p in (B/dirname).glob('*.csv'):
        r=load(p)
        if r and len(r[0])>=14 and r[0][3].strip()==KIND: sp=(p,r)
        if len(r)>=3 and len(r[2])>=27 and r[2][2].strip()==MODEL: ss=(p,r)
    return ss,sp
def panel(x): return x['kind']==PANEL or bool(re.search('\ud310\ub12c|\ud310\ub110|\ud328\ub110',x['name']))
def remote(x): return x['kind']==REMOTE or bool(re.search('\ub9ac\ubaa8[\ucee8\ucf58]',x['name']))
def foot(x): return '\ubc1c\ud1b5' in x['name'] or 'SI-AL700A' in x['model'].upper()
def material(x): return x['kind']==MATERIAL or MATERIAL in x['feat']
def hidden(x): return bool(re.search('\uc720\uc5f0\ud638\uc2a4\\s*I\ud615|\uc6b4\uc784|\uc808\uc0ad',x['name']))
def outdoor(x): return (OUT in x['kind'] or OUT in x['name']) and not(panel(x) or remote(x) or material(x) or foot(x))
def indoor(x): return not outdoor(x) and (IND in x['kind'] or IND in x['name'] or x['kind']==WALL) and not(panel(x) or remote(x) or material(x) or foot(x))
def household(name,model):
    compact=re.sub(r'\s+','',name or '')
    if re.search('\uac00\uc815\uc6a9\uc5d0\uc5b4\ucee8',compact): return True
    hay=((name or '')+' '+model).lower()
    for pat in ['\ubc1c\ud1b5|\uc77c\uc790\ubc1c|\ubc1b\uce68','360|cst','4\\s*way','1\\s*way','\ub355\ud2b8|duct','\uc2e4\ub9c1','\uc2a4\ud0e0\ub4dc','\ubcbd\uac78\uc774']:
        if re.search(pat,hay): return False
    return '\uac00\uc815\uc6a9' in hay

def reproduce(dirname):
    (_,ss),(_,sp)=single_files(dirname)
    parents={}
    for r in ss[3:]:
        if len(r)>7 and r[2].strip():
            parents[r[2].strip()]={'name':r[0].strip(),'price':number(r[7]) or number(r[6])}
    parts=[]
    for rowno,r in enumerate(sp[1:],2):
        if len(r)<14: continue
        x={'row':rowno,'name':r[0].strip(),'model':r[2].strip(),'kind':r[3].strip(),
           'price':number(r[8]),'set':r[12].strip(),'feat':r[13].strip()}
        if x['kind']==SET and x['model']:
            parents.setdefault(x['model'],{'name':x['name'],'price':x['price']})
        if x['set'] and x['model']: parts.append(x)
    byset=defaultdict(list)
    for x in parts: byset[x['set']].append(x)
    contexts=[]
    for sm,rows in byset.items():
        if sm not in parents: continue
        base_panel=next((x for x in rows if panel(x) and BASIC in x['feat']),None)
        picked=[]
        for x in rows:
            if foot(x) or hidden(x) or material(x): continue
            if panel(x):
                if x is base_panel: picked.append(x)
            elif remote(x):
                if BASIC in x['feat']: picked.append(x)
            else: picked.append(x)
        hh=household(parents[sm]['name'],sm); ins=[]; outs=[]; fixed=[]
        for x in picked:
            if outdoor(x): outs.append(x)
            elif indoor(x): (fixed if hh and WALL in x['name'] else ins).append(x)
            else: fixed.append(x)
        if len(ins)!=1 or len(outs)!=1: continue
        fixed_sum=sum(x['price'] for x in fixed)
        remain=max(0,parents[sm]['price']-fixed_sum)
        calc_in=round_k(remain*(6 if hh else 4)/10); calc_out=remain-calc_in
        mod=calc_out%1000
        if mod: calc_in-=mod; calc_out+=mod
        for typ,x,calc in [('indoor',ins[0],calc_in),('outdoor',outs[0],calc_out)]:
            contexts.append({'set':sm,'model':x['model'],'type':typ,'sheet':x['price'],
                             'calc':calc,'delta':calc-x['price'],'remain':remain})
    bymodel=defaultdict(list)
    for x in contexts: bymodel[x['model']].append(x)
    multi={m:v for m,v in bymodel.items() if len({x['sheet'] for x in v if x['sheet']>0})>=2}
    mismatch={m:v for m,v in multi.items() if any(x['delta'] for x in v)}
    bad=[x for v in mismatch.values() for x in v if x['delta']]
    affected=defaultdict(list)
    for x in bad: affected[x['set']].append(x)
    return parents,contexts,multi,mismatch,bad,affected

for d in ['live_sheet','live_sheet_inc']:
    parents,contexts,multi,mismatch,bad,affected=reproduce(d)
    print(d,'parents',len(parents),'contexts',len(contexts),'multi',len(multi),
          'match',len(multi)-len(mismatch),'mismatch',len(mismatch),'mismatch_contexts',len(bad))
    print(' kinds',Counter(next(x['type'] for x in v if x['delta']) for v in mismatch.values()),
          'affected_sets',len(affected),'zero',sum(x['sheet']==0 or x['calc']==0 for x in bad),
          'small_le_100000',sum(abs(x['delta'])<=100000 for x in bad),
          'pair_sum_fail',sum(sum(x['delta'] for x in v)!=0 for v in affected.values()))

# 비인상 여섯 탭 전체 141그룹과 판정불가 36 재계수
values=defaultdict(list); kinds=defaultdict(set); body=set()
for p in (B/'live_sheet').glob('*.csv'):
    r=load(p); typ=None
    if r and len(r[0])>=14 and r[0][3].strip()==KIND: typ='sp'; start=1; mi,ri,di=2,5,[7,8]
    elif r and len(r[0])==10 and r[0][1].strip()==MODEL: typ='cc'; start=1; mi,ri,di=1,3,[5]
    elif len(r)>=3 and len(r[2])>=27 and r[2][2].strip()==MODEL: typ='ss'; start=3; mi,ri,di=2,4,[6,7]
    elif len(r)>=3 and len(r[2])>=30 and r[2][1].strip()==MODEL:
        typ='catalog'; start=3; mi,ri,di=1,3 if '\uac00\uc815\uc6a9' in r[0][0] else 4,[5] if '\uac00\uc815\uc6a9' in r[0][0] else [6]
    elif r and len(r[0])==9: typ='old'; start=2; mi,ri,di=1,3,[5]
    else: continue
    for row in r[start:]:
        if len(row)<=max([mi,ri]+di) or not row[mi].strip(): continue
        m=row[mi].strip()
        if number(row[ri])>0: values[(m,'release')].append(number(row[ri]))
        for i in di:
            if number(row[i])>0: values[(m,'delivery')].append(number(row[i]))
        if typ=='sp':
            kinds[m].add(row[3].strip())
            if row[3].strip() in (IND,OUT): body.add(m)
all_multi={k:v for k,v in values.items() if len(set(v))>=2}
unjudge=[k for k in all_multi if not(k[1]=='delivery' and k[0] in body)]
release=sum(k[1]=='release' for k in unjudge)
fixed=sum(k[1]=='delivery' and bool(kinds[k[0]] & {PANEL,REMOTE}) for k in unjudge)
no_context=len(unjudge)-release-fixed
print('all-six multi',len(all_multi),'body_delivery',len(all_multi)-len(unjudge),
      'unjudge',len(unjudge),'release',release,'fixed_panel_remote',fixed,'no_single_body_context',no_context)
'@ | python -
```

실행 출력:

```text
live_sheet parents 288 contexts 542 multi 105 match 22 mismatch 83 mismatch_contexts 128
 kinds Counter({'indoor': 64, 'outdoor': 19}) affected_sets 64 zero 0 small_le_100000 0 pair_sum_fail 0
live_sheet_inc parents 288 contexts 542 multi 105 match 22 mismatch 83 mismatch_contexts 128
 kinds Counter({'indoor': 64, 'outdoor': 19}) affected_sets 64 zero 0 small_le_100000 0 pair_sum_fail 0
all-six multi 141 body_delivery 105 unjudge 36 release 12 fixed_panel_remote 21 no_single_body_context 3
```

집계 로직 대조 위치:

```powershell
$p = 'services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java'
$a = Get-Content -LiteralPath $p -Encoding UTF8
$a[297..393]

$p = 'tools/legacy-gas/종합견적서/index.html'
$a = Get-Content -LiteralPath $p -Encoding UTF8
$a[4780..4897]
$a[11430..11445]
```

실 DB는 이 분류에 사용하지 않았다. 83은 `시트 문맥 절대값 ↔ 레거시 계산 결과` 비교이며 DB 대표값을 끼우면 다른 질문이 된다. DB 쓰기·Docker 재배포·Google 접근은 하지 않았다.
