# PR #984 R10 — R9 postfix 머지 전 재수렴 리뷰

- 작성일: 2026-08-03 KST
- 역할: 머지 전 재수렴 리뷰어
- 대상 브랜치/HEAD: `fix/ecount-import-model-code-merge` / 사용자 제시 `b134db18f`
- 제한 준수: 코드 수정 없음, git 명령·조작 없음, 실 임포트 없음, 공유 DB write/DDL 없음, Docker 이미지 재빌드 없음, 합성 데이터 생성·실행 없음
- 판정 자료: 실 raw 품목 CSV·관계 XLSX의 읽기 전용 정적 투영, `[DEV-SEED]`의 `BEGIN TRANSACTION READ ONLY` SELECT
- 주의: 기존 build XML의 `646 tests / 0 failures`는 파일 존재만 확인했고 이 라운드의 fresh 증거로 인수하지 않았다.

## 1. 결론

**BLOCK — R9의 코드 관계 우선축은 현재 실 관계 원본의 업무값 상이 25그룹/25관계행까지 fingerprint보다 먼저 합친다.**

관계 XLSX는 R8/R9 보고서의 “1셀·유효 관계 0행”과 달리 현재 SHA에서 유효 관계 157행이다. 156개 대표 그룹의 main/alias가 모두 실 품목 raw에 있으며, 현재 코드는 156그룹/313행을 관계로 수렴시킨다. 그중:

- `ProductIdentity(품목명 + 업무값 fingerprint)` 상이: **26그룹 / 27관계행**
- 품목명 차이를 제외하고도 업무값 fingerprint 상이: **25그룹 / 25관계행**
- 업무값은 같고 품목명만 상이: **1그룹 / 2관계행**
- 관계표 밖 승인 raw 규칙 `SAR-00011 → AR-ED00`: **1그룹 / 2행**, 업무값 상이

R9 전후 전체 투영에서는 raw **28행**의 main이 바뀌며, 기존 27개 Product target이 관계 main 27개로 흡수된다. 따라서 “델타 기준 새로 바뀌는 행 0”은 성립하지 않는다.

| 각도 | R10 실측 | 데이터 출처 | 판정 |
|---|---:|---|---|
| 1. 관계로 합쳐지는 그룹 | XLSX **156그룹/313 raw행**, 157 relation edge | 실데이터 raw XLSX+CSV | 전수 확인 |
| 1. 업무값 상이 | **25그룹/25 edge**; 품목명까지 포함한 identity 상이 **26그룹/27 edge** | 실데이터 raw | **위험 발화** |
| 2. R2 소실 방지 | R2의 33품목/59필드 중 **21품목/37필드가 다시 병합** | 실데이터 raw | **실패** |
| 2. 전체 관계축 소실 표면 | distinct ProductIdentity **27개**, 업무값 필드 **44셀**, 품목명 **6값** 흡수 | 실데이터 raw | **실패** |
| 3. 역방향 미병합 | 알려진 관계·승인·동일 fingerprint 기준 **0그룹/0행** | 실데이터 raw + 현재 코드 정적 투영 | 통과 |
| 4. MANUAL | 도달 **0행**, Product 삭제 **0경로** | 실 raw + `[DEV-SEED]` read-only + 정적 코드 | 통과 |
| 4. 병합 폭 | fingerprint 자체 **131그룹/262행** 유지, 전체 실제 수렴은 **157그룹/315행** | 실데이터 raw | 기준 대비 **+26그룹/+53행** |
| 5. R9 delta | main 변경 **28 raw행/27 target**, 결과 Product 수 **-27** | 실 raw + `[DEV-SEED]` read-only | **실패** |
| 6. 구조적 우회 | **1경로**, 결과를 바꾸는 실 발화 **27그룹/28행** | 코드 정적 + 실데이터 raw | **미해소·발화** |

## 2. 데이터 출처와 해석 경계

### 2.1 실데이터 raw

```text
RAW_SHA256=7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678
REL_SHA256=F7918B9FC9D88B75A5A14A014436D3E99DABEAE4E860493F5DAB9AD7D3D5DE35
RAW_ROWS=2854
RAW_UNIQUE_CODES=2854
REL_VALID_ROWS=157
REL_DISTINCT_MAINS=156
REL_DISTINCT_ALIASES=157
REL_DUPLICATE_ALIAS_ROWS=0
REL_MAIN_RAW_MISSING_EDGES=0
REL_ALIAS_RAW_MISSING_EDGES=0
REL_ACTUAL_MERGE_GROUPS_RAW=156
REL_ACTUAL_MERGE_EDGES_RAW=157
REL_IDENTITY_DIFFERENT_GROUPS=26
REL_IDENTITY_DIFFERENT_EDGES=27
REL_VALUE_DIFFERENT_GROUPS=25
REL_VALUE_DIFFERENT_EDGES=25
REL_NAME_ONLY_DIFFERENT_GROUPS=1
```

- `RAW_ROWS=2854`는 footer 1행까지 포함한다. importer 정상행 규칙 적용 결과는 **2,853행**이다.
- 관계 XLSX의 데이터 행은 sheet row 3~159이며, row 2는 header다.
- `00130 → AJ030RXH4BC1`은 XLSX row 33의 실제 명시 관계다.
- R2의 “730 충돌”과 “33품목/59필드 소실”은 기존 실 raw 기반 지표다. 이번 라운드는 현재 `[DEV-SEED]`가 변동했기 때문에 730을 고정 DB 수치로 재인용하지 않고, 현재 스냅샷 수치를 별도로 적는다.

### 2.2 `[DEV-SEED]` 읽기 전용

공유 DB에는 V28 `lineage` 컬럼이 아직 없어 V28의 확정 backfill CASE를 SELECT 안에서만 투영했다. 모든 DB 명령은 `BEGIN TRANSACTION READ ONLY`로 실행했다.

```text
ACTIVE_ROWS=1216
ALL_NORMAL_RAW_MODEL_HITS=733
ALL_NORMAL_RAW_MODEL_HITS_SHEET=733
ALL_NORMAL_RAW_MODEL_HITS_MANUAL=0
ALL_NORMAL_RAW_MODEL_HITS_ECOUNT=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS_SHEET=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS_MANUAL=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS_ECOUNT=0
```

현재 raw 전체는 현재 후보 main의 상위집합이다. 이 상위집합에서도 MANUAL model/product code hit가 0이므로 현재 main 후보의 MANUAL 도달도 0이다. 현재 main만 좁힌 재계산은 다음과 같다.

```text
CURRENT_MAIN_CODES=2695
CURRENT_MAIN_MODEL_HITS=733
CURRENT_MAIN_MODEL_HITS_SHEET=733
CURRENT_MAIN_MODEL_HITS_MANUAL=0
CURRENT_MAIN_PRODUCT_CODE_HITS=0
CURRENT_MAIN_PRODUCT_CODE_HITS_MANUAL=0
```

R2 당시 730과 현재 733의 차이는 `[DEV-SEED]` 스냅샷 변동이다. 둘을 같은 시점의 고정값처럼 비교하지 않았다.

## 3. 1순위 — 관계 우선 병합 전수

### 3.1 판정 기준

현재 production과 같은 규칙을 사용했다.

- 정상 raw: 품목명 비어 있지 않고 placeholder code가 아님
- 업무값 fingerprint: 단가 8종을 `parseMoney`처럼 정규화 + `normalizeItemType` + `규격명.strip()`
- `ProductIdentity`: 품목명 + 업무값 fingerprint
- 명시 관계: XLSX A열 대표품목코드 → D열 연결품목코드
- 상태:
  - `IDENTITY_SAME`: 품목명과 업무값 fingerprint 모두 같음
  - `NAME_ONLY_DIFF`: 업무값은 같고 품목명만 다름
  - `BUSINESS_VALUE_DIFF`: 업무값 fingerprint가 다름

현재 코드의 `trustedIdentity`는 raw main이 있으면 fingerprint를 비교하지 않는다. 이 원본에서는 모든 main과 alias가 raw에 있으므로 157 edge 전부가 관계 main으로 진행한다.

### 3.2 156개 관계 그룹 전수

형식은 `대표코드|rawMembers|alias:상태`다.

```text
AC060BN4DBC1|rawMembers=2|CH4N-00122:IDENTITY_SAME
AC110BXAPHH3|rawMembers=2|CH4X-00074:BUSINESS_VALUE_DIFF
ACD-2558G|rawMembers=2|SZEC-00009:IDENTITY_SAME
ACL-KORGHP05|rawMembers=2|01019:IDENTITY_SAME
ACM-A202DN|rawMembers=2|DZC-00002:IDENTITY_SAME
ACM-B102N|rawMembers=2|DZC-00012:IDENTITY_SAME
ACR-SKE|rawMembers=2|DZA-00016:IDENTITY_SAME
ACR-SMA|rawMembers=2|DZA-00028:IDENTITY_SAME
ADP-E075SEK3D|rawMembers=2|SAD-00001:IDENTITY_SAME
ADP-F075SP|rawMembers=2|ZENG-00022:IDENTITY_SAME
ADP-G075SPK1D|rawMembers=2|SAD-00010:IDENTITY_SAME
ADP-N047SNK1D|rawMembers=2|SAD-00003:IDENTITY_SAME
AF17B6470DCX|rawMembers=2|FCX-00029:IDENTITY_SAME
AF19B6470DBX|rawMembers=2|AFX-00024:IDENTITY_SAME
AF19B7530DBX|rawMembers=2|AFB-00006:IDENTITY_SAME
AF19B7534GZN|rawMembers=2|AFB-00007:IDENTITY_SAME
AF-R09A|rawMembers=2|DZC-00014:IDENTITY_SAME
AF-R12A|rawMembers=2|DZC-00011:IDENTITY_SAME
AFT-00029|rawMembers=2|AFT-00016:BUSINESS_VALUE_DIFF
AG4S0957W|rawMembers=2|P4N-00015:IDENTITY_SAME
AGSS1421W|rawMembers=2|P1N-00013:IDENTITY_SAME
AIM-A01N|rawMembers=2|DZA-00021:IDENTITY_SAME
AIM-B12N|rawMembers=2|DZA-00004:IDENTITY_SAME
AIM-B14|rawMembers=2|DZA-00015:IDENTITY_SAME
AIM-C01A|rawMembers=2|DZA-00009:IDENTITY_SAME
AIM-D01AN|rawMembers=2|DZC-00005:IDENTITY_SAME
AIM-H04N|rawMembers=2|DZC-00013:IDENTITY_SAME
AIM-N01|rawMembers=2|DZA-00010:IDENTITY_SAME
AIM-N10|rawMembers=2|DZA-00011:IDENTITY_SAME
AIM-S10N|rawMembers=2|DZC-00010:IDENTITY_SAME
AJ030RXH4BC1|rawMembers=2|00130:BUSINESS_VALUE_DIFF
AM035FXMRHC1|rawMembers=2|DVX-00057:BUSINESS_VALUE_DIFF
AM050FXMRHC1|rawMembers=2|DVX-00058:BUSINESS_VALUE_DIFF
AM050MXMRBC1|rawMembers=2|DVX-00085:BUSINESS_VALUE_DIFF
AM072HN1DBH1|rawMembers=2|DN1-00009:IDENTITY_SAME
AM072TNCDBH1|rawMembers=2|DN1-00053:IDENTITY_SAME
AM075FXMRHC1|rawMembers=2|DVX-00059:BUSINESS_VALUE_DIFF
AM100RXVVHH1|rawMembers=2|DN4-00051:IDENTITY_SAME
AM110TNCDBH1|rawMembers=2|DN1-00054:IDENTITY_SAME
AM120MXVRHC1|rawMembers=2|DVX-00127:BUSINESS_VALUE_DIFF
AM120NXVUHH1|rawMembers=2|DVX-00090:IDENTITY_SAME
AM120RXVVHH1|rawMembers=2|DN4-00052:IDENTITY_SAME
AM130TNCDBH1|rawMembers=2|DN1-00055:IDENTITY_SAME
AM145TNCDBH1|rawMembers=2|DN1-00052:IDENTITY_SAME
AM160FXVSJH1|rawMembers=2|DVX-00095:IDENTITY_SAME
AM160NXGGBH1|rawMembers=2|DVX-00102:IDENTITY_SAME
AM200NXGGBH1|rawMembers=2|DVX-00100:IDENTITY_SAME
AM250NXGGBH1|rawMembers=2|DVX-00130:IDENTITY_SAME
AM300JXGGBH1|rawMembers=2|DVX-00089:IDENTITY_SAME
AM320NXGGBH1|rawMembers=2|DVX-00136:IDENTITY_SAME
AN025FSKLBN1|rawMembers=2|ERV-00001:IDENTITY_SAME
AN035FSKLBN1|rawMembers=2|ERV-00002:IDENTITY_SAME
AN050FSKLBN1|rawMembers=2|ERV-00003:IDENTITY_SAME
AN080FSKLBN1|rawMembers=2|ERV-00004:IDENTITY_SAME
AN100FSKLBN1|rawMembers=2|ERV-00005:IDENTITY_SAME
AP060RNPPBH1|rawMembers=2|PHN-00023:IDENTITY_SAME
AP110RNPPBH1|rawMembers=2|PHN-00026:IDENTITY_SAME
AP110RNPPBH6|rawMembers=2|PHN-00051:IDENTITY_SAME
AP110RNPPBH7|rawMembers=2|PHN-0071:IDENTITY_SAME
AP110RNPPBH8|rawMembers=2|PHN-00081:IDENTITY_SAME
AP110RNPPHH6|rawMembers=2|PHN-00066:IDENTITY_SAME
AP110RNPPHH7|rawMembers=2|PHN-00077:IDENTITY_SAME
AP110RNPPHH8|rawMembers=2|PHN-00088:IDENTITY_SAME
AP130RNPPBH1|rawMembers=2|PHN-00028:IDENTITY_SAME
AP130RNPPHH1|rawMembers=2|PHN-00029:IDENTITY_SAME
AP145RNPDHH1|rawMembers=2|PHN-00037:IDENTITY_SAME
AR11C9180HDX|rawMembers=2|RCX-00054:IDENTITY_SAME
AR11C9180HZN|rawMembers=2|RCN-0033:IDENTITY_SAME
AR13C9180HEX|rawMembers=2|RCX-00055:IDENTITY_SAME
AR13C9180HZN|rawMembers=2|RCN-0034:IDENTITY_SAME
AR16C9180HEX|rawMembers=2|RCX-00051:IDENTITY_SAME
AR16C9180HZN|rawMembers=2|RCN-0032:IDENTITY_SAME
ASD-CAN3|rawMembers=2|SPI-00003:IDENTITY_SAME
AVXC4H060B1-E|rawMembers=2|DN4-00022:IDENTITY_SAME
AVXC4H100B2|rawMembers=2|DN4-00023:IDENTITY_SAME
AVXDHH100B1|rawMembers=2|DND-00011:IDENTITY_SAME
AVXDUH100B3|rawMembers=2|DND-00012:IDENTITY_SAME
AWR-VH12N|rawMembers=2|SAW-00005:IDENTITY_SAME
AWR-WE13N|rawMembers=2|SAW-00006:IDENTITY_SAME
AWR-WG00N|rawMembers=2|SAW-00008:IDENTITY_SAME
AXJ-HA1509F|rawMembers=2|SAX-00079:IDENTITY_SAME
AXJ-HA2512M|rawMembers=2|SAX-00005:IDENTITY_SAME
AXJ-HA3115M|rawMembers=2|SAX-00030:IDENTITY_SAME
AXJ-TA3100M|rawMembers=2|SAX-00028:BUSINESS_VALUE_DIFF
AXJ-TA3419M|rawMembers=2|SAX-00006:BUSINESS_VALUE_DIFF
AXJ-TA3800M|rawMembers=2|SAX-00050:BUSINESS_VALUE_DIFF
AXJ-TA4122M|rawMembers=2|SAX-00007:BUSINESS_VALUE_DIFF
AXJ-YA1500M|rawMembers=2|SAX-00048:IDENTITY_SAME
AXJ-YA1509N|rawMembers=2|SAX-00080:BUSINESS_VALUE_DIFF
AXJ-YA2500M|rawMembers=2|SAX-00049:IDENTITY_SAME
AXJ-YA2812M|rawMembers=2|SAX-00013:IDENTITY_SAME
AXJ-YA2815M|rawMembers=2|SAX-00014:IDENTITY_SAME
AXJ-YA3100M|rawMembers=2|SAX-00029:IDENTITY_SAME
AXJ-YA3419M|rawMembers=2|SAX-00015:IDENTITY_SAME
AXJ-YA3800M|rawMembers=2|SAX-00016:BUSINESS_VALUE_DIFF
AXJ-YA4119M|rawMembers=2|SAX-00018:IDENTITY_SAME
AXJ-YA4422M|rawMembers=2|SAX-00019:IDENTITY_SAME
EG-J001B|rawMembers=2|단내림(대):BUSINESS_VALUE_DIFF
EG-J001M|rawMembers=2|단내림(중):BUSINESS_VALUE_DIFF
EG-SOU05M|rawMembers=3|00022:NAME_ONLY_DIFF,00027:NAME_ONLY_DIFF
FAX-00005|rawMembers=2|FAX-00036:IDENTITY_SAME
FH-LFHIF|rawMembers=2|SZL-00015:IDENTITY_SAME
FH-LFHLF|rawMembers=2|SZL-00001:BUSINESS_VALUE_DIFF
FH-LFHLN|rawMembers=2|SZL-00002:IDENTITY_SAME
FPC-1412YAF2|rawMembers=2|SPC-00009:IDENTITY_SAME
FPC-1458YAF2|rawMembers=2|SPC-00001:IDENTITY_SAME
FPC-3858XS2|rawMembers=2|SPC-00007:IDENTITY_SAME
FPH-1412XS3|rawMembers=2|SPH-00002:IDENTITY_SAME
FPH-1458XS1|rawMembers=2|SPH-00012:BUSINESS_VALUE_DIFF
FPH-3858XS5|rawMembers=2|SPH-00005:IDENTITY_SAME
FPH-3878XS|rawMembers=2|SPH-00006:IDENTITY_SAME
FRC-1412NA2|rawMembers=2|SRC-00001:IDENTITY_SAME
FRC-1438NA2|rawMembers=2|SRC-00003:IDENTITY_SAME
FRC-1438NB2|rawMembers=2|SRC-00008:IDENTITY_SAME
FRC-1438XAF2|rawMembers=2|SRC-00005:IDENTITY_SAME
FRC-1458XA2|rawMembers=2|SRC-00007:IDENTITY_SAME
FRH-1412NA3|rawMembers=2|FRH-00011:IDENTITY_SAME
FRH-1412XA3|rawMembers=2|SRH-00001:IDENTITY_SAME
FRH-1438NH3|rawMembers=2|SRH-00002:IDENTITY_SAME
MDP-M075SGK1D|rawMembers=2|SAD-00004:IDENTITY_SAME
MDP-M075SGK2D|rawMembers=2|SAD-00006:IDENTITY_SAME
NJ023WCXB3|rawMembers=2|DHN-00031:IDENTITY_SAME
NJ0521CXB2|rawMembers=2|DHN-00025:IDENTITY_SAME
NJ0721CXB2|rawMembers=2|DHN-00027:IDENTITY_SAME
NS0604DXB2|rawMembers=2|CH4N-00003:IDENTITY_SAME
PC1BWAK1N|rawMembers=2|p1n-00021:BUSINESS_VALUE_DIFF
PC2NWSK1N|rawMembers=2|00219:IDENTITY_SAME
PC4NBDK1N|rawMembers=2|P4N-00006:IDENTITY_SAME
PC4NBFK1N|rawMembers=2|P4N-00019:IDENTITY_SAME
PC4NBNK1N|rawMembers=2|P4N-00005:IDENTITY_SAME
PC4NUCK1N|rawMembers=2|P4N-00020:IDENTITY_SAME
PC4NUDK1N|rawMembers=2|P4N-00004:IDENTITY_SAME
PC4NUFK1N|rawMembers=2|P4N-00016:IDENTITY_SAME
PC4NUHK1|rawMembers=2|P4N-00009:IDENTITY_SAME
PC4NUNK1N|rawMembers=2|P4N-00003:IDENTITY_SAME
PC4NUSK1|rawMembers=2|P4N-00010:BUSINESS_VALUE_DIFF
PC4NUSK1N|rawMembers=2|P4N-00001:IDENTITY_SAME
PC4NUXK1N|rawMembers=2|P4N-00022:IDENTITY_SAME
PC4SUFK1N|rawMembers=2|P4N-00021:IDENTITY_SAME
PC6EUCK1N|rawMembers=2|P4N-00024:IDENTITY_SAME
PC6EUXK1N|rawMembers=2|P6N-00026:IDENTITY_SAME
PC6NUCK1N|rawMembers=2|P4N-00023:IDENTITY_SAME
PC6NUNK1NW|rawMembers=2|P4N-00028:IDENTITY_SAME
PC6NUXK1N|rawMembers=2|P4N-00025:IDENTITY_SAME
RT25DARAHS9|rawMembers=2|01017:BUSINESS_VALUE_DIFF
SI-AL600a|rawMembers=2|SZL-00004:IDENTITY_SAME
SI-AL700a|rawMembers=2|SZL-00005:IDENTITY_SAME
발통세트|rawMembers=2|00102:IDENTITY_SAME
방진가대S2대|rawMembers=2|00198:IDENTITY_SAME
방진가대S2소|rawMembers=2|00196:BUSINESS_VALUE_DIFF
방진가대S2중|rawMembers=2|00197:BUSINESS_VALUE_DIFF
방진가대대|rawMembers=2|SZL-00009:BUSINESS_VALUE_DIFF
방진가대소|rawMembers=2|SZL-00010:BUSINESS_VALUE_DIFF
운임|rawMembers=2|ZDEL-00001:IDENTITY_SAME
전면토출방진가대|rawMembers=2|01009:IDENTITY_SAME
절삭|rawMembers=2|00013:IDENTITY_SAME
```

집계:

- **156그룹 전부** actual merge
- **157 edge 전부** main/alias raw 존재
- **130그룹**은 identity 동일
- **26그룹/27 edge**는 identity 상이
- identity 상이 중 **25그룹/25 edge**는 업무값 자체가 상이
- `EG-SOU05M` 1그룹은 alias 2개가 같은 별도 identity라서 업무값은 같지만 품목명이 다름

### 3.3 업무값/품목명이 다른 전건

아래 `fields`는 대표행과 alias행 사이에서 정규화 후 다른 업무 필드다. 빈 `fields`는 품목명만 다름을 뜻한다.

```text
XLSX|4|AC110BXAPHH3|CH4X-00074|nameDiff=True|fields=실외기(원형,스탠드)
XLSX|21|AFT-00029|AFT-00016|nameDiff=True|fields=출하가,싱글
XLSX|33|AJ030RXH4BC1|00130|nameDiff=True|fields=출하가,규격명
XLSX|34|AM035FXMRHC1|DVX-00057|nameDiff=False|fields=멀티(50%),멀티(48%),멀티(45%),단품(35%)
XLSX|35|AM050FXMRHC1|DVX-00058|nameDiff=False|fields=멀티(50%),멀티(48%),멀티(45%),단품(35%)
XLSX|36|AM050MXMRBC1|DVX-00085|nameDiff=False|fields=멀티(50%),멀티(48%),멀티(45%),단품(35%)
XLSX|39|AM075FXMRHC1|DVX-00059|nameDiff=False|fields=멀티(50%),멀티(48%),멀티(45%),단품(35%)
XLSX|42|AM120MXVRHC1|DVX-00127|nameDiff=False|fields=멀티(50%),멀티(48%),멀티(45%),단품(35%)
XLSX|86|AXJ-TA3100M|SAX-00028|nameDiff=False|fields=규격명
XLSX|87|AXJ-TA3419M|SAX-00006|nameDiff=False|fields=규격명
XLSX|88|AXJ-TA3800M|SAX-00050|nameDiff=False|fields=규격명
XLSX|89|AXJ-TA4122M|SAX-00007|nameDiff=False|fields=규격명
XLSX|91|AXJ-YA1509N|SAX-00080|nameDiff=False|fields=규격명
XLSX|97|AXJ-YA3800M|SAX-00016|nameDiff=False|fields=규격명
XLSX|100|EG-J001B|단내림(대)|nameDiff=True|fields=규격명
XLSX|101|EG-J001M|단내림(중)|nameDiff=True|fields=규격명
XLSX|102|EG-SOU05M|00022|nameDiff=True|fields=
XLSX|103|EG-SOU05M|00027|nameDiff=True|fields=
XLSX|106|FH-LFHLF|SZL-00001|nameDiff=False|fields=출하가
XLSX|112|FPH-1458XS1|SPH-00012|nameDiff=False|fields=입고단가
XLSX|129|PC1BWAK1N|p1n-00021|nameDiff=False|fields=출하가
XLSX|139|PC4NUSK1|P4N-00010|nameDiff=False|fields=싱글
XLSX|148|RT25DARAHS9|01017|nameDiff=False|fields=출하가,규격명
XLSX|153|방진가대S2소|00196|nameDiff=False|fields=입고단가
XLSX|154|방진가대S2중|00197|nameDiff=False|fields=입고단가
XLSX|155|방진가대대|SZL-00009|nameDiff=False|fields=규격명
XLSX|156|방진가대소|SZL-00010|nameDiff=False|fields=규격명
APPROVED_RAW|-|AR-ED00|SAR-00011|nameDiff=False|fields=출하가
```

관계 XLSX 밖에서 현재 승인 raw 규칙이 추가로 합치는 `SAR-00011 → AR-ED00`도 출하가가 다르다. 따라서 “코드 관계가 있으면 그것이 먼저”라는 축이 만드는 전체 상이 identity 흡수는 다음과 같다.

```text
RELATION_OR_APPROVED_LOST_IDENTITIES=28
BUSINESS_DIFFERENT_IDENTITIES=26
BUSINESS_DIFFERING_FIELD_CELLS=44
NAME_DIFFERENT_IDENTITIES=7
NAME_PLUS_BUSINESS_DIFFERING_CELLS=51
```

위 `RELATION_OR_APPROVED_LOST_IDENTITIES=28`은 바뀌는 raw row 수다. `EG-SOU05M`의 `00022/00027`은 서로 같은 identity이므로 distinct ProductIdentity 감소는 **27개**다. 업무 필드 차이는 **44셀**, distinct 품목명 손실은 **6값**이다.

관계가 오래됐거나 잘못됐는지는 원본만으로 확정할 수 없다. 그러나 **잘못된 관계가 들어오면 fingerprint가 막지 못하고 합쳐지는가**에는 명확히 **그렇다**. 현재 실 데이터에서도 그 표면이 25개 업무값 상이 그룹으로 발화한다.

## 4. 각도 2 — 소실 품목 0 · 소실 필드 0

### 4.1 R2의 33/59가 돌아왔는가

**부분적으로 돌아왔다.**

R2가 분리한 “동일 품목명 + 상이 업무값” 그룹과 현재 관계/승인 우선 그룹을 교차하면:

- 같은 품목명이지만 업무값이 달라 다시 합쳐지는 그룹: **21개**
- 그 그룹에서 대표행과 다른 업무 필드: **37셀**

즉 R2의 **33품목/59필드** 중 현재 관계축이 **21품목/37필드**를 다시 대표행에 흡수한다. 나머지 12품목/22필드는 fingerprint 분리 상태를 유지한다.

### 4.2 서로 다른 품목명까지 포함한 전체 소실 표면

- 동명 업무값 상이: **21 ProductIdentity / 37 업무 필드**
- 이명 관계: **6 ProductIdentity / 7 업무 필드 / 6 품목명**
- 합계: **27 ProductIdentity / 44 업무 필드 / 6 품목명**

alias code 자체는 `product_aliases`에 남지만 alias row의 단가·규격·품목구분·품목명은 alias 테이블에 보존되지 않는다. 최종 `upsertProduct(mainRow)`는 대표 raw 한 행만 소비하므로 위 차이값은 Product 필드로 보존되지 않는다.

판정: **소실 품목 0·소실 필드 0 유지 실패.**

## 5. 각도 3 — 역방향 미병합 0

현재 코드 정적 투영 결과:

- 동일 fingerprint: **131그룹/262행**, 미병합 **0그룹/0행**
- XLSX relation: **156그룹/157 edge**, 미병합 **0그룹/0행**
- relation 밖 승인 raw 관계: **1그룹/2행**, 미병합 **0그룹/0행**
- `00130 → AJ030RXH4BC1`: relation main으로 수렴

R9는 R8의 1그룹/2행을 해소했고 알려진 코드 관계의 역방향 미병합을 새로 만들지는 않았다. 다만 이 통과는 오병합 안전성과 독립이다.

## 6. 각도 4 — MANUAL 0과 병합 수

### 6.1 MANUAL

현재 main code 2,695개를 `[DEV-SEED]`에 읽기 전용 투영한 결과:

- active `model_name` hit: **733**, 모두 projected `SHEET`
- projected `MANUAL model_name` hit: **0**
- active `product_code` hit: **0**
- projected `MANUAL product_code` hit: **0**
- importer Product delete/soft-delete 호출·SQL: **0경로**
- soft-deleted Product를 복원하는 반대 경로는 존재

판정: **MANUAL 0 유지. Product 삭제 0 유지.**

### 6.2 병합 폭

```text
NORMAL_ROWS=2853
FINGERPRINT_MERGE_GROUPS=131
FINGERPRINT_MERGE_ROWS=262
APPROVED_ONLY_MAPPINGS=1
APPROVED_ONLY_IDENTITY_DIFF=1
APPROVED_ONLY_VALUE_DIFF=1
CURRENT_ALL_MERGE_GROUPS=157
CURRENT_ALL_MERGE_ROWS=315
R7_ALL_MERGE_GROUPS=131
R7_ALL_MERGE_ROWS=262
R9_CHANGED_RAW_ROWS=28
R9_CHANGED_GROUPS=27
CURRENT_DISTINCT_MAIN_CODES=2695
```

- fingerprint partition 지표 **131그룹/262행**은 그대로다.
- 실제 최종 main 기준 전체 수렴은 **157그룹/315행**이다.
- 기존 기준 대비 **+26그룹/+53행**이다.
- distinct main은 R7식 2,722개에서 현재 2,695개로 **27개 감소**한다.

따라서 “병합 131그룹/262행 유지”는 fingerprint-only 부분지표로만 참이고, 실제 importer 결과 폭으로는 거짓이다.

## 7. 각도 5 — 델타 기준 새로 바뀌는 행

R7식 “모든 raw 후보는 fingerprint 일치 필요”와 R9 현재 `trustedIdentity` 우선을 같은 raw에 투영했다.

```text
CH4X-00074|CH4X-00074|AC110BXAPHH3|AC110BXAPHH3 [BX 프리미엄 3상실외기]
AFT-00016|AFT-00016|AFT-00029|AF16T5774DSN
00130|00130|AJ030RXH4BC1|AJ030RXH4BC1
DVX-00057|DVX-00057|AM035FXMRHC1|AM035FXMRHC1
DVX-00058|DVX-00058|AM050FXMRHC1|AM050FXMRHC1
DVX-00085|DVX-00085|AM050MXMRBC1|AM050MXMRBC1
DVX-00059|DVX-00059|AM075FXMRHC1|AM075FXMRHC1
DVX-00127|DVX-00127|AM120MXVRHC1|AM120MXVRHC1
SAR-00011|SAR-00011|AR-ED00|AR-ED00
SAX-00028|SAX-00028|AXJ-TA3100M|AXJ-TA3100M
SAX-00006|SAX-00006|AXJ-TA3419M|AXJ-TA3419M (T형 분기관)
SAX-00050|SAX-00050|AXJ-TA3800M|AXJ-TA3800M
SAX-00007|SAX-00007|AXJ-TA4122M|AXJ-TA4122M
SAX-00080|SAX-00080|AXJ-YA1509N|AXJ-YA1509N [N-분기관]
SAX-00016|SAX-00016|AXJ-YA3800M|AXJ-YA3800M
단내림(대)|단내림(대)|EG-J001B|단내림(대)
단내림(중)|단내림(중)|EG-J001M|단내림(중)
00022|00022|EG-SOU05M|EG-SOU05M(실외기 에어가이드 상부토출)
00027|00022|EG-SOU05M|EG-SOU05M(실외기 에어가이드 상부토출)
SZL-00001|SZL-00001|FH-LFHLF|FH-LFHLF-유연호스1WAY
SPH-00012|SPH-00012|FPH-1458XS1|FPH-1458XS1
p1n-00021|p1n-00021|PC1BWAK1N|PC1BWAK1N
P4N-00010|P4N-00010|PC4NUSK1|PC4NUSK1
01017|01017|RT25DARAHS9|RT25DARAHS9
00196|00196|방진가대S2소|방진가대 S2 소
00197|00197|방진가대S2중|방진가대 S2 중
SZL-00009|SZL-00009|방진가대대|방진가대 대
SZL-00010|SZL-00010|방진가대소|방진가대 소
```

집계:

- 변경 raw row: **28행**
- 변경되는 최종 main group/target: **27개**
- R7식 distinct main: **2,722**
- R9 current distinct main: **2,695**
- Product 결과 delta: **-27행**(R7이라면 별도 target이던 27개를 더 이상 만들지 않음)

`[DEV-SEED]`에서 위 old/new target을 읽기 전용 조회한 원문:

```text
BEGIN
OLD|00022|0|
OLD|00130|0|
OLD|00196|0|
OLD|00197|0|
OLD|01017|0|
OLD|AFT-00016|0|
OLD|CH4X-00074|0|
OLD|DVX-00057|0|
OLD|DVX-00058|0|
OLD|DVX-00059|0|
OLD|DVX-00085|0|
OLD|DVX-00127|0|
OLD|P4N-00010|0|
OLD|SAR-00011|0|
OLD|SAX-00006|0|
OLD|SAX-00007|0|
OLD|SAX-00016|0|
OLD|SAX-00028|0|
OLD|SAX-00050|0|
OLD|SAX-00080|0|
OLD|SPH-00012|0|
OLD|SZL-00001|0|
OLD|SZL-00009|0|
OLD|SZL-00010|0|
OLD|p1n-00021|0|
OLD|단내림(대)|0|
OLD|단내림(중)|0|
NEW|AC110BXAPHH3|1|SHEET
NEW|AFT-00029|0|
NEW|AJ030RXH4BC1|1|SHEET
NEW|AM035FXMRHC1|1|SHEET
NEW|AM050FXMRHC1|1|SHEET
NEW|AM050MXMRBC1|1|SHEET
NEW|AM075FXMRHC1|1|SHEET
NEW|AM120MXVRHC1|1|SHEET
NEW|AR-ED00|0|
NEW|AXJ-TA3100M|1|SHEET
NEW|AXJ-TA3419M|1|SHEET
NEW|AXJ-TA3800M|1|SHEET
NEW|AXJ-TA4122M|1|SHEET
NEW|AXJ-YA1509N|1|SHEET
NEW|AXJ-YA3800M|1|SHEET
NEW|EG-J001B|1|SHEET
NEW|EG-J001M|1|SHEET
NEW|EG-SOU05M|0|
NEW|FH-LFHLF|1|SHEET
NEW|FPH-1458XS1|1|SHEET
NEW|PC1BWAK1N|0|
NEW|PC4NUSK1|1|SHEET
NEW|RT25DARAHS9|0|
NEW|방진가대S2소|1|SHEET
NEW|방진가대S2중|1|SHEET
NEW|방진가대대|0|
NEW|방진가대소|0|
COMMIT
```

- old target 27개 active hit: **0**
- new relation main 27개 중 active hit: **20**, 모두 projected `SHEET`
- 나머지 new main 7개는 R7/R9 모두 main 자체를 처리하므로 R9만의 신규 insert가 아니다.
- 따라서 R9는 향후 실 임포트에서 R7 대비 별도 Product insert 27개를 없애고, 28개 raw row의 alias target을 바꾼다.

판정: **델타 0 실패.**

## 8. 각도 6 — 구조적 fingerprint 우회

현재 코드:

```text
431: private boolean isFingerprintCompatibleCandidate(...)
433:     return candidate != null
434:             && ((candidate.trustedIdentity()
435:                     && (candidate.rawRow() != null || sameNameRowCount == 1))
436:                     || (candidate.rawRow() != null && sameFingerprint(candidate.rawRow(), expected)));
```

`trustedIdentity` 분기는 fingerprint를 계산·비교하지 않고 통과한다.

- 구조적 우회 경로: **1개**
- 우회 source: explicit relation alias, relation main, 승인 raw main
- R8이 본 DB-only singleton 예외도 `trustedIdentity && sameNameRowCount == 1` 안에 남아 있음
- 현재 raw에서 결과를 실제로 바꾸는 발화: **27그룹/28행**
- 그중 업무값 상이: **26 distinct ProductIdentity / 26 raw row**(XLSX 25 + 승인 raw 1)
- 품목명만 상이: **1 distinct ProductIdentity / 2 raw row**

판정: **해소되지 않았다. R8 당시 “발화 0”과 달리 현재 원본에서는 실제 발화한다.**

## 9. 재현 원문 요약

### 9.1 관계·fingerprint·전체 병합

```text
RAW_SHA256=7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678
REL_SHA256=F7918B9FC9D88B75A5A14A014436D3E99DABEAE4E860493F5DAB9AD7D3D5DE35
RAW_ROWS=2854
RAW_UNIQUE_CODES=2854
REL_VALID_ROWS=157
REL_DISTINCT_MAINS=156
REL_DISTINCT_ALIASES=157
REL_DUPLICATE_ALIAS_ROWS=0
REL_MAIN_RAW_MISSING_EDGES=0
REL_ALIAS_RAW_MISSING_EDGES=0
REL_ACTUAL_MERGE_GROUPS_RAW=156
REL_ACTUAL_MERGE_EDGES_RAW=157
REL_IDENTITY_DIFFERENT_GROUPS=26
REL_IDENTITY_DIFFERENT_EDGES=27
REL_VALUE_DIFFERENT_GROUPS=25
REL_VALUE_DIFFERENT_EDGES=25
REL_NAME_ONLY_DIFFERENT_GROUPS=1

NORMAL_ROWS=2853
FINGERPRINT_MERGE_GROUPS=131
FINGERPRINT_MERGE_ROWS=262
APPROVED_ONLY_MAPPINGS=1
APPROVED_ONLY_IDENTITY_DIFF=1
APPROVED_ONLY_VALUE_DIFF=1
CURRENT_ALL_MERGE_GROUPS=157
CURRENT_ALL_MERGE_ROWS=315
R7_ALL_MERGE_GROUPS=131
R7_ALL_MERGE_ROWS=262
R9_CHANGED_RAW_ROWS=28
R9_CHANGED_GROUPS=27
CURRENT_DISTINCT_MAIN_CODES=2695
```

### 9.2 소실 필드

```text
RELATION_OR_APPROVED_LOST_IDENTITIES=28
BUSINESS_DIFFERENT_IDENTITIES=26
BUSINESS_DIFFERING_FIELD_CELLS=44
NAME_DIFFERENT_IDENTITIES=7
NAME_PLUS_BUSINESS_DIFFERING_CELLS=51
```

### 9.3 `[DEV-SEED]` MANUAL 상위집합과 current main

```text
ACTIVE_ROWS=1216
ALL_NORMAL_RAW_MODEL_HITS=733
ALL_NORMAL_RAW_MODEL_HITS_SHEET=733
ALL_NORMAL_RAW_MODEL_HITS_MANUAL=0
ALL_NORMAL_RAW_MODEL_HITS_ECOUNT=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS_SHEET=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS_MANUAL=0
ALL_NORMAL_RAW_PRODUCT_CODE_HITS_ECOUNT=0

CURRENT_MAIN_CODES=2695
CURRENT_MAIN_MODEL_HITS=733
CURRENT_MAIN_MODEL_HITS_SHEET=733
CURRENT_MAIN_MODEL_HITS_MANUAL=0
CURRENT_MAIN_PRODUCT_CODE_HITS=0
CURRENT_MAIN_PRODUCT_CODE_HITS_MANUAL=0
```

### 9.4 실행 방식

- CSV: title 1행을 제외하고 PowerShell `ConvertFrom-Csv`; Java의 `stripCell`, placeholder regex, `parseMoney`, `normalizeItemType`를 같은 값으로 투영
- XLSX: 파일을 ZIP으로 읽고 `xl/worksheets/sheet1.xml`의 inline string/numeric cell을 직접 파싱
- DB: `docker exec ... psql` SELECT만 사용, 모든 SQL은 `BEGIN TRANSACTION READ ONLY`/COMMIT
- production code: 후보 source, identity group 재수렴, `trustedIdentity` 분기, 최종 `productByMainCode` sink를 정적으로 대조
- 실 importer endpoint/service는 호출하지 않음

## 10. 최종 판정

**BLOCK.**

R9는 역방향 미병합을 없앴지만, 현재 실 관계 원본의 상이 업무값까지 무조건 우선한다. 25개 XLSX 관계 그룹과 1개 승인 raw 그룹에서 업무값 차이가 실제로 fingerprint를 이기며, R2가 막았던 소실 중 21품목/37필드가 되살아난다. 관계표의 업무 의미를 별도 검증하지 않고 머지하면 잘못되거나 오래된 관계 한 줄이 Product 분리를 무력화한다.

본 라운드는 리뷰 전용이므로 수정 제안 구현은 하지 않았다.

## 11. 이 라운드가 보지 않은 것

- 실 임포트 전후 DB 행·필드: 실 임포트 금지로 조사하지 않음.
- 관계 25개가 실제 업무상 “오래됨/오류”인지: 원본에는 승인일·유효기간·관계 사유가 없어 미판정.
- 운영 DB/운영 원본: `[DEV-SEED]`만 조회했으므로 조사하지 않음.
- V28이 실제 적용된 공유 DB의 물리 `lineage`: 컬럼 부재로 미판정. 확정 migration CASE를 SELECT로만 투영.
- 품목계층그룹 원본: 워크트리 원본 부재로 미판정.
- 전체 product-service 테스트 재실행: 합성 데이터 실행 금지로 조사하지 않음. 기존 646 GREEN artifact는 fresh 증거로 인수하지 않음.
- 원격 PR/CI/GitHub 상태: git/GitHub 조작 금지 범위로 조사하지 않음.
- 관계 외 product-service 기능 회귀와 동시성/예약창: 조사하지 않음.
- alias table이 과거 별도 Product의 업무값을 외부 저장소에서 복원할 수 있는지: 실 임포트·DB write 금지로 조사하지 않음.

## 12. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-984-r10-postfix-reconvergence.md`

이 라운드가 새로 만든 파일은 위 1개뿐이다. 기존 보고서는 덮어쓰거나 축약하지 않았다.

