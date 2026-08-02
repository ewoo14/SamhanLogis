# 품목명 unique 제약 사전 조사

## 1. 현재 활성 품목 중복 — 제약을 막는 기존 데이터

판정 기준: `products.is_deleted = FALSE AND products.status = 'ACTIVE'`. 활성 품목은 1,216건이며, 이름 중복 그룹은 186건, 중복으로 추가로 존재하는 행은 510건입니다. 따라서 현재 상태에서는 활성 `name` unique 제약을 걸 수 없습니다.

```sql
SELECT name, COUNT(*) AS product_count,
       STRING_AGG(product_code || ' [' || status || ', deleted=' || is_deleted || ']', ', ' ORDER BY created_at, id) AS products
FROM products
WHERE is_deleted = FALSE AND status = 'ACTIVE'
GROUP BY name HAVING COUNT(*) > 1 ORDER BY name;

SELECT COUNT(*) AS duplicate_name_groups,
       COALESCE(SUM(product_count - 1),0) AS extra_rows
FROM (
  SELECT name, COUNT(*) AS product_count
  FROM products
  WHERE is_deleted = FALSE AND status = 'ACTIVE'
  GROUP BY name HAVING COUNT(*) > 1
) d;

SELECT COUNT(*) AS active_products
FROM products WHERE is_deleted = FALSE AND status = 'ACTIVE';
```

```text
duplicate_name_groups | extra_rows
----------------------+------------
186                   | 510
(1 row)

active_products
---------------
1216
(1 row)
```

아래 목록은 위 중복 그룹의 각 품목을 `name :: product_code/model_code`로 나열한다. `product_code`가 NULL인 레거시 품목은 `model_code`를 표시하고, 둘 다 없으면 UUID를 표시한다.

목록 산출 SQL:

```sql
WITH d AS (
  SELECT name, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM products
  WHERE is_deleted = FALSE AND status = 'ACTIVE'
  GROUP BY name HAVING COUNT(*) > 1
), x AS (
  SELECT p.name,
         STRING_AGG(COALESCE(p.product_code, p.model_code, p.id::text), ', ' ORDER BY p.created_at, p.id) AS ids
  FROM products p JOIN d ON d.name = p.name
  WHERE p.is_deleted = FALSE AND p.status = 'ACTIVE'
    AND d.rn BETWEEN :lo AND :hi
  GROUP BY p.name
)
SELECT x.name || ' :: ' || x.ids FROM x ORDER BY x.name;
-- :lo/:hi = 1/70, 71/140, 141/220
```

### 목록 1–70

```text
Exit code: 0
Wall time: 0.4 seconds
Output:
24년형 가정용 에어컨 무풍 그레이 실내기 :: AF17B7538GZN, AF19B7534GZN
24년형 가정용 에어컨 무풍 베이지 실내기 :: AF17B7538TZN, AF19B7534TZN
24년형 가정용 에어컨 무풍 화이트 실내기 :: AF17B7538WZN, AF19B7534WZN
24년형 가정용 에어컨 무풍 화이트 실외기 :: AF17B7530DCX, AF19B7530DBX
24년형 가정용 에어컨 무풍(그레이) :: AF17B7538GZS, AF17B7538GZRS, AF19B7534GZS, AF19B7534GZRS
24년형 가정용 에어컨 무풍(베이지) :: AF17B7538TZS, AF17B7538TZRS, AF19B7534TZS, AF19B7534TZRS
24년형 가정용 에어컨 무풍(화이트) :: AF17B7538WZS, AF17B7538WZRS, AF19B7534WZS, AF19B7534WZRS
24년형 가정용 에어컨 무풍갤러리 화이트 실내기 :: AF19DX838WSN, AF17DX738WSN
24년형 가정용 에어컨 무풍갤러리 화이트 실외기 :: AF19DX830DBX, AF17DX730DCX
24년형 가정용 에어컨 무풍갤러리(베이지) :: AF19DX838VSRS, AF19DX838VSS
24년형 가정용 에어컨 무풍갤러리(화이트) :: AF19DX838WSRS, AF19DX838WSS, AF17DX738WSRS, AF17DX738WSS
24년형 가정용 에어컨 유풍 그레이 실내기 :: AF17B6474GZN, AF19B6474GZN
24년형 가정용 에어컨 유풍 베이지 실내기 :: AF17B6474TZN, AF19B6474TZN
24년형 가정용 에어컨 유풍 화이트 실내기 :: AF17B6474WZN, AF19B6474WZN
24년형 가정용 에어컨 유풍 화이트 실외기 :: AF17B6470DCX, AF19B6470DBX
24년형 가정용 에어컨 유풍(그레이) :: AF17B6474GZS, AF17B6474GZRS, AF19B6474GZS, AF19B6474GZRS
24년형 가정용 에어컨 유풍(베이지) :: AF17B6474TZS, AF17B6474TZRS, AF19B6474TZS, AF19B6474TZRS
24년형 가정용 에어컨 유풍(화이트) :: AF17B6474WZS, AF17B6474WZRS, AF19B6474WZS, AF19B6474WZRS
360 CST UV :: AC060CS6PBH1SY, AC072CS6PBH1SY, AC090CS6PBH1SY, AC145CS6PHH1SY
360 CST UV 단상형 :: AC100CS6PBH1SY, AC110CS6PBH1SY, AC130CS6PBH1SY
360 CST UV 삼상형 :: AC100CS6PHH1SY, AC110CS6PHH1SY, AC130CS6PHH1SY
360 CST UV 실내기 :: AC060CN6PBH1, AC072CN6PBH1, AC090CN6PBH1, AC100CN6PBH1, AC110CN6PBH1, AC130CN6PBH1, AC145CN6PHH1
360 CST UV 실외기 :: AC060CXAPBH1, AC072CXAPBH1, AC090CXAPBH1, AC100CXAPBH1, AC100CXAPHH1, AC110CXAPBH1, AC110CXAPHH1, AC130CXAPBH1, AC130CXAPHH1, AC145CXAPHH1
ECO 리뉴얼 필터 :: AF-R09A, AF-R12A
ERV 전열교환기 상업용 :: AN025FSKLBN1, AN035FSKLBN1, AN050FSKLBN1, AN080FSKLBN1, AN100FSKLBN1, AN160FSKLBN1SY, AN200FSKLBN1SY
ERV 전열교환기 주택용(친환경) :: AN010BSKGBN1, AN015BSKGBN1, AN020BSKGBN1, AN025BSKGBN1
T형 분기관 :: AXJ-TA3419M, AXJ-TA4122M, AXJ-TA3100M, AXJ-TA3800M
Y형 HR 분기관 :: AXJ-YA1500M, AXJ-YA2500M, AXJ-YA3100M, AXJ-YA3800M
Y형 분기관 :: AXJ-YA2812M, AXJ-YA2815M, AXJ-YA3419M, AXJ-YA4119M, AXJ-YA4422M
Y형 실내기 분기관 :: AXJ-YA2512N, AXJ-YA1509N
가정용 벽걸이 리모컨 :: ARR-WK8F, ARR-NK3F, ARR-PK8F
가정용 스탠드 리모컨 :: AFR-QC3F, AFR-BC3F, AFR-BC9F, AFR-TC9F
가정용 스탠드 자재 :: FPC-1458YAF2, FPC-1412YAF2
가정용 에어컨 Q9000 그레이 실내기 :: AF60F17D11GN, AF60F19D11GN
가정용 에어컨 Q9000 베이지 실내기 :: AF60F17D11BN, AF60F19D11BN
가정용 에어컨 Q9000 블루 실내기 :: AF60F17D11LN, AF60F19D11LN
가정용 에어컨 Q9000 화이트 실내기 :: AF60F17D11WN, AF60F19D11WN
가정용 에어컨 Q9000 화이트 실외기 :: AF60F17D1QBX, AF60F19D1PBX
가정용 에어컨 Q9000(그레이) :: AF60F17D11GS, AF60F17D11GRS, AF60F19D11GS, AF60F19D11GRS
가정용 에어컨 Q9000(베이지) :: AF60F17D11BS, AF60F17D11BRS, AF60F19D11BS, AF60F19D11BRS
가정용 에어컨 Q9000(블루) :: AF60F17D11LS, AF60F17D11LRS, AF60F19D11LS, AF60F19D11LRS
가정용 에어컨 Q9000(화이트) :: AF60F17D11WS, AF60F17D11WRS, AF60F19D11WS, AF60F19D11WRS
가정용 에어컨 무풍갤러리 e헤파(에센셜 화이트) :: AF80F25D29WS, AF80F25D29WRS
가정용 에어컨 무풍갤러리 공청 에센셜 샴페인 실내기 :: AF80F20D27CN, AF80F18D27CN
가정용 에어컨 무풍갤러리 공청 에센셜 화이트 실내기 :: AF80F20D28WN, AF80F18D28WN
가정용 에어컨 무풍갤러리 공청 에센셜 화이트 실외기 :: AF80F20D2PBX, AF80F18D21BX
가정용 에어컨 무풍갤러리 공청(에센셜 베이지) :: AF80F25D28BS, AF80F25D28BRS
가정용 에어컨 무풍갤러리 공청(에센셜 화이트) :: AF80F20D28WS, AF80F20D28WRS, AF80F18D28WS, AF80F18D28WRS
가정용 에어컨 무풍갤러리 무청(에센셜 샴페인) :: AF80F20D27CRS, AF80F18D27CS, AF80F18D27CRS
가정용 에어컨 무풍콤보 갤러리프로 공청 에센셜 화이트 실내기 :: AF90H25D36WN, AF90H22D36WN
가정용 에어컨 무풍콤보 갤러리프로 공청 에센셜 화이트 실외기 :: AF90H25D01BX, AF90H22D01BX
가정용 에어컨 무풍콤보 갤러리프로 공청(에센셜 화이트) :: AF90H25D36WS, AF90H25D36WRS, AF90H22D36WS, AF90H22D36WRS
가정용 에어컨 무풍콤보 갤러리프로 무청 미스티 그레이 실내기 :: AF90H19D24GN, AF90H17D27GN, AF90H17D24GN
가정용 에어컨 무풍콤보 갤러리프로 무청 사틴 그레이지 실내기 :: AF90H19D27SN, AF90H19D24SN, AF90H17D27SN, AF90H17D24SN
가정용 에어컨 무풍콤보 갤러리프로 무청(미스티 그레이) :: AF90H19D24GS, AF90H19D24GRS, AF90H17D27GS, AF90H17D27GRS, AF90H17D24GS, AF90H17D24GRS
가정용 에어컨 무풍콤보 갤러리프로 무청(사틴 그레이지) :: AF90H19D27SS, AF90H19D27SRS, AF90H19D24SS, AF90H19D24SRS, AF90H17D27SS, AF90H17D27SRS, AF90H17D24SS, AF90H17D24SRS
가정용 에어컨 무풍콤보 갤러리프로 세미 에센셜 플럼 실내기 :: AF90H22D35EN, AF90H19D35EN, AF90H17D38EN, AF90H17D35EN
가정용 에어컨 무풍콤보 갤러리프로 세미 에센셜 화이트 실내기 :: AF90H22D35WN, AF90H19D38WN, AF90H19D35WN, AF90H17D38WN, AF90H17D35WN
가정용 에어컨 무풍콤보 갤러리프로 세미 에센셜 화이트 실외기 :: AF90H19D01BX, AF90H19D0PBX, AF90H17D01BX, AF90H17D0QBX
가정용 에어컨 무풍콤보 갤러리프로 세미(에센셜 플럼) :: AF90H22D35ES, AF90H22D35ERS, AF90H19D35ES, AF90H19D35ERS, AF90H17D38ES, AF90H17D38ERS, AF90H17D35ES, AF90H17D35ERS
가정용 에어컨 무풍콤보 갤러리프로 세미(에센셜 화이트) :: AF90H22D35WS, AF90H22D35WRS, AF90H19D38WS, AF90H19D38WRS, AF90H19D35WS, AF90H19D35WRS, AF90H17D38WS, AF90H17D38WRS, AF90H17D35WS, AF90H17D35WRS
가정용 에어컨 무풍클래식 그레이 실내기 :: AF70F17D11GN, AF70F19D11GN
가정용 에어컨 무풍클래식 무청 메탈릭 블루 실내기 :: AF70F19D24LN, AF70F17D24LN
가정용 에어컨 무풍클래식 무청 메탈릭 화이트 실내기 :: AF70F19D24IN, AF70F17D24IN
가정용 에어컨 무풍클래식 무청 산토리니 베이지 실내기 :: AF70F19D24EN, AF70F17D24EN
가정용 에어컨 무풍클래식 무청(그레이) :: AF70F17D11GS, AF70F17D11GRS, AF70F19D11GS, AF70F19D11GRS
가정용 에어컨 무풍클래식 무청(메탈 화이트) :: AF70F19D24IS, AF70F19D24IRS, AF70F17D24IS, AF70F17D24IRS
가정용 에어컨 무풍클래식 무청(메탈릭 로즈골드) :: AF70F19D24RS, AF70F19D24RRS
가정용 에어컨 무풍클래식 무청(메탈릭 블루) :: AF70F19D24LS, AF70F19D24LRS, AF70F17D24LS, AF70F17D24LRS
가정용 에어컨 무풍클래식 무청(메탈릭 실버) :: AF70F17D24WS, AF70F17D24WRS

```

### 목록 71–140

```text
Exit code: 0
Wall time: 0.4 seconds
Output:
가정용 에어컨 무풍클래식 무청(베이지) :: AF70F17D11BS, AF70F17D11BRS, AF70F19D11BS, AF70F19D11BRS
가정용 에어컨 무풍클래식 무청(블루) :: AF70F17D11LS, AF70F17D11LRS, AF70F19D11LS, AF70F19D11LRS
가정용 에어컨 무풍클래식 무청(산토리니 베이지) :: AF70F19D24ES, AF70F19D24ERS, AF70F17D24ES, AF70F17D24ERS
가정용 에어컨 무풍클래식 무청(화이트) :: AF70F17D11WS, AF70F17D11WRS, AF70F19D11WS, AF70F19D11WRS
가정용 에어컨 무풍클래식 베이지 실내기 :: AF70F17D11BN, AF70F19D11BN
가정용 에어컨 무풍클래식 블루 실내기 :: AF70F17D11LN, AF70F19D11LN
가정용 에어컨 무풍클래식 세미 메탈릭 실버 실내기 :: AF70F19D25WN, AF70F17D25WN
가정용 에어컨 무풍클래식 세미 메탈릭 실버 실외기 :: AF70F19D2PBX, AF70F17D2QBX
가정용 에어컨 무풍클래식 세미 산토리니 베이지 실내기 :: AF70F19D25BN, AF70F17D25BN
가정용 에어컨 무풍클래식 세미(메탈릭 실버) :: AF70F19D25WS, AF70F19D25WRS, AF70F17D25WS, AF70F17D25WRS
가정용 에어컨 무풍클래식 세미(산토리니 베이지) :: AF70F19D25BS, AF70F19D25BRS, AF70F17D25BS, AF70F17D25BRS
가정용 에어컨 무풍클래식 화이트 실내기 :: AF70F17D11WN, AF70F19D11WN
가정용 에어컨 무풍클래식 화이트 실외기 :: AF70F17D1QBX, AF70F19D1PBX
냉난방 디럭스 스탠드 :: AP072BAPDBH2S, AP130BAPDBH2S, AP145BAPDHH2S
냉난방 디럭스 스탠드 실내기 :: AP072BNPDBH1, AP130BNPDBH1, AP145RNPDHH1
냉난방 디럭스 스탠드 실외기 :: AP072BXPDBH1, AP130BXPDBH1
냉난방 무풍 벽걸이 :: AR07C9181HZS, AR07C9180HZS, AR07D9181HZS, AR09C9180HZS, AR11C9180HZS, AR13C9180HZS, AR16C9180HZS, AR60F07C11WS, AR60F07C12WS, AR60F07C14WS, AR60F09C13WS, AR60F11C13WS, AR60F13C13WS, AR60F16C14WS
냉난방 무풍 벽걸이 실내기 :: AR07C9181HZN, AR07C9180HZN, AR07D9181HZN, AR09C9180HZN, AR11C9180HZN, AR13C9180HZN, AR16C9180HZN, AR60F07C11WNKO, AR60F07C12WNKO, AR60F07C14WNKO, AR60F09C13WNKO, AR60F11C13WNKO, AR60F13C13WNKO, AR60F16C14WNKO
냉난방 무풍 벽걸이 실외기 :: AR07C9181HEX, AR07C9180HCX, AR07D9181HCX, AR09C9180HCX, AR11C9180HDX, AR13C9180HEX, AR16C9180HEX, AR60F07C11WXKO, AR60F07C12WXKO, AR60F07C14WXKO, AR60F09C13WXKO, AR60F11C13WXKO, AR60F13C13WXKO, AR60F16C14WXKO
냉난방 스탠드 1등급 :: AP052CSPFBH2SPP, AP060CSPFBH2SPP, AP072CSPFBH2SPP, AP083CSPFBH2SPP
냉난방 스탠드 1등급 실내기 :: AP052CNPFBH1PP, AP060CNPFBH1PP, AP072CNPFBH1PP, AP083CNPFBH1PP
냉난방 스탠드 1등급 실외기 :: AP052CXPFBH1PP, AP060CXPFBH1PP, AP072CXPFBH1PP, AP083CXPFBH1PP
냉난방 스탠드 자재 :: FPH-1412XS3, FPH-1458XS1
냉난방 프레스티지 스탠드 :: AP052CAPPBH1S, AP060CAPPBH1S, AP072CAPPBH1S, AP083CAPPBH1S, AP145CAPPHH1S
냉난방 프레스티지 스탠드 단상형 :: AP110CAPPBH1S, AP130CAPPBH1S
냉난방 프레스티지 스탠드 삼상형 :: AP110CAPPHH1S, AP130CAPPHH1S
냉난방 프레스티지 스탠드 실내기 :: AP052CNPPBH1, AP060CNPPBH1, AP072CNPPBH1, AP083CNPPBH1, AP110CNPPBH1, AP110CNPPHH1, AP130CNPPBH1, AP130CNPPHH1, AP145CNPPHH1
냉난방 프레스티지 스탠드 실외기 :: AC052CXAPBH1, AC083CXAPBH1
냉난방 프리미엄 스탠드 :: AP052BAPPBH2S, AP060BAPPBH2S, AP072BAPPBH2S, AP083BAPPBH2S, AP145BAPPHH2S, AP230DAPDHH1S, AP290DAPDHH1S
냉난방 프리미엄 스탠드 단상형 :: AP110BAPPBH2S, AP130BAPPBH2S
냉난방 프리미엄 스탠드 삼상형 :: AP110BAPPHH2S, AP130BAPPHH2S
냉난방 프리미엄 스탠드 실내기 :: AP052BNPPBH1, AP060RNPPBH1, AP072BNPPBH1, AP083BNPPBH1, AP110RNPPBH1, AP130RNPPBH1, AP145BNPPHH1, AP230DNPDHH1, AP290DNPDHH1
냉난방 프리미엄 스탠드 실외기 :: AP052BXPPBH3, AP083BXPPBH3, AP230DXPDHH1, AP290DXPDHH1
냉전 무풍 벽걸이 :: AR07D9150HZS, AR07D9151HZS, AR09D9150HZS, AR11D9150HZS, AR15D9150HZS, AR60F07D11WS, AR60F07D12WS, AR60F09D11WS, AR60F11D11WS, AR60F13D12WS, AR60F15D12WS
냉전 무풍 벽걸이 실내기 :: AR07D9150HZN, AR07D9151HZN, AR09D9150HZN, AR11D9150HZN, AR13D9150HZN, AR15D9150HZN, AR80F07D21WNKO, AR60F07D11WNKO, AR60F07D12WNKO, AR60F09D11WNKO, AR60F11D11WNKO, AR60F13D12WNKO, AR60F15D12WNKO
냉전 무풍 벽걸이 실외기 :: AR07D9150HAX, AR07D9151HCX, AR09D9150HCX, AR11D9150HDX, AR13D9150HDX, AR15D9150HDX, AR80F07D21WXKO, AR60F07D11WXKO, AR60F07D12WXKO, AR60F09D11WXKO, AR60F11D11WXKO, AR60F13D12WXKO, AR60F15D12WXKO
냉전 스탠드 실내기 :: AP083CNPDBC1, AP110CNPDBC1, AP145CNPDHC1
냉전 일반 벽걸이 :: AR10B5150HZS, AR06D1150HZS, AR50F10D13HS
냉전 일반 벽걸이 실내기 :: AR10B5150HZN, AR06D1150HZN, AR50F10D13HNKO
냉전 일반 벽걸이 실외기 :: AR10B5150HAX, AR06D1150HAX, AR50F10D13HXKO
냉전 프리미엄 스탠드 :: AP083CSPDBC1S, AP110CSPDBC1S, AP145CSPDHC1S
무풍 1way 냉난방 :: AC023CS1PBH1SY, AC032CS1PBH1SY, AC040CS1PBH1SY, AC052CS1PBH1SY, AC060CS1PBH1SY
무풍 1way 냉난방 실내기 :: AC023CN1PBH1, AC032CN1PBH1, AC040CN1PBH1, AC052CN1PBH1, AC060CN1PBH1
무풍 1way 냉난방 실외기 :: AC023CX1PBH1, AC032CX1PBH1, AC040CX1PBH1, AC052CX1PBH1, AC060CX1PBH1
무풍 1way 냉방전용 :: AC023CS1DBC1SY, AC032CS1DBC1SY, AC040CS1DBC1SY, AC052CS1DBC1SY, AC060CS1DBC1SY, AC072CS1DBC1SY
무풍 1way 냉방전용 실내기 :: AC023CN1DBC1, AC032CN1DBC1, AC040CN1DBC1, AC052CN1DBC1, AC060CN1DBC1, AC072CN1DBC1
무풍 1way 냉방전용 실외기 :: AC023CX1DBC1, AC032CX1DBC1, AC040CX1DBC1, AC052CX1DBC1, AC060CX1DBC1, AC072CX1DBC1
무풍 4way 냉난방 1등급 :: AC060CS4FBH2SY, AC072CS4FBH2SY, AC090CS4FBH2SY, AC145CS4FHH2SY
무풍 4way 냉난방 1등급 단상형 :: AC100CS4FBH2SY, AC110CS4FBH2SY, AC130CS4FBH2SY
무풍 4way 냉난방 1등급 삼상형 :: AC100CS4FHH2SY, AC110CS4FHH2SY, AC130CS4FHH2SY
무풍 4way 냉난방 1등급 실내기 :: AC060CN4FBH1, AC072CN4FBH1, AC090CN4FBH1, AC100CN4FBH1, AC110CN4FBH1, AC130CN4FBH1, AC145CN4FHH1
무풍 4way 냉난방 1등급 실외기 :: AC060CXAFBH1, AC072CXAFBH1, AC090CXAFBH1, AC100CXAFBH1, AC100CXAFHH1, AC110CXAFBH1, AC110CXAFHH1, AC130CXAFBH1, AC130CXAFHH1, AC145CXAFHH1
무풍 4way 냉난방 프레스티지 :: AC060CS4PBH2SY, AC072CS4PBH2SY, AC090CS4PBH2SY, AC145CS4PHH2SY
무풍 4way 냉난방 프레스티지 단상형 :: AC100CS4PBH2SY, AC110CS4PBH2SY, AC130CS4PBH2SY
무풍 4way 냉난방 프레스티지 삼상형 :: AC100CS4PHH2SY, AC110CS4PHH2SY, AC130CS4PHH2SY
무풍 4way 냉난방 프레스티지 실내기 :: AC060CN4PBH1, AC072CN4PBH1, AC090CN4PBH1, AC100CN4PBH1, AC100CN4PHH1, AC110CN4PBH1, AC130CN4PBH1, AC130CN4PHH1, AC145CN4PHH1
무풍 4way 냉난방 프리미엄 :: AC060BS4PBH7SY, AC072BS4PBH7SY, AC090BS4PBH7SY, AC145BS4PHH7SY, AC160CS4DHH1SY
무풍 4way 냉난방 프리미엄 단상형 :: AC100BS4PBH7SY, AC110BS4PBH7SY, AC130BS4PBH7SY
무풍 4way 냉난방 프리미엄 삼상형 :: AC100BS4PHH7SY, AC110BS4PHH7SY, AC130BS4PHH7SY
무풍 4way 냉난방 프리미엄 실내기 :: AC060BN4PBH1, AC072BN4PBH5, AC090BN4PBH1, AC100BN4PBH1, AC110BN4PBH1, AC130BN4PBH1, AC145BN4PHH1, AC160CN4DHH1
무풍 4way 냉난방 프리미엄 실외기 :: AC060BXAPBH3, AC072BXAPBH5, AC090BXAPBH3, AC100BXAPBH3, AC100BXAPHH3, AC110BXAPBH3, AC110BXAPHH3, AC130BXAPBH3, AC130BXAPHH3, AC145BXAPHH5, AC160CXADHH1
무풍 4way 냉방전용 :: AC060CS4DBC1SY, AC072CS4DBC1SY, AC083CS4DBC1SY, AC100CS4DBC1SY, AC110CS4DBC1SY, AC145CS4DBC1SY
무풍 4way 냉방전용 실내기 :: AC060CN4DBC1, AC072CN4DBC1, AC083CN4DBC1, AC100CN4DBC1, AC110CN4DBC1, AC145CN4DBC1
무풍 4way 냉방전용 실외기 :: AC060CXADBC1, AC072CXADBC1, AC083CXADBC1, AC100CXADBC1, AC110CXADBC1, AC145CXADBC1
벽걸이 냉전 자재 :: FRC-1438NB2, FRC-1438NA2, FRC-1412NA2, FRC-1458XA2
벽걸이 자재 :: FRH-1412NA3, FRH-1438NH3, FRH-1412XA3
분배헤더 :: AXJ-HA2512M, AXJ-HA3115M, AXJ-HA1509F
비스포크 스탠드 세이지 블루 실내기 :: AP083BNPPBH7, AP110RNPPBH7, AP110RNPPHH7, AP145BNPPHH7
비스포크 스탠드 콰이엇 그레이 실내기 :: AP083BNPPBH6, AP110RNPPBH6, AP110RNPPHH6, AP145BNPPHH6
비스포크 스탠드 프라임 핑크 실내기 :: AP083BNPPBH8, AP110RNPPBH8, AP110RNPPHH8, AP145BNPPHH8

```

### 목록 141–220

```text
Exit code: 0
Wall time: 0.4 seconds
Output:
비스포크 스탠드(세이지 블루) :: AP083BSPPBH7SY, AP145BSPPHH7SY
비스포크 스탠드(콰이엇 그레이) :: AP083BSPPBH6SY, AP145BSPPHH6SY
비스포크 스탠드(프라임 핑크) :: AP083BSPPBH8SY, AP145BSPPHH8SY
삼성 DVM-S 10HP :: 010057, 010070
삼성 DVM-S 12HP :: 010058, 010071
삼성 DVM-S 14HP :: 010059, 010072
삼성 DVM-S 16HP :: 010060, 010073
삼성 DVM-S 18HP :: 010061, 010074
삼성 DVM-S 3HP :: 010051, 010064
삼성 DVM-S 4HP :: 010052, 010065
삼성 DVM-S 5HP :: 010053, 010066
삼성 DVM-S 6HP :: 010054, 010067
삼성 DVM-S 7HP :: 010055, 010068
삼성 DVM-S 8HP :: 010056, 010069
삼성 비스포크 스탠드 15평형 :: 010031, 010039, 010047
삼성 비스포크 스탠드 17평형 :: 010032, 010040, 010048
삼성 비스포크 스탠드 18평형 :: 010033, 010041, 010049
삼성 비스포크 스탠드 20평형 :: 010034, 010042
삼성 비스포크 스탠드 23평형 :: 010035, 010043
삼성 비스포크 스탠드 25평형 :: 010036, 010044
삼성 비스포크 스탠드 26평형 :: 010037, 010045
삼성 비스포크 스탠드 30평형 :: 010038, 010046
삼성 윈드프리 11평형 :: 010005, 010015
삼성 윈드프리 13평형 :: 010006, 010016, 010026
삼성 윈드프리 15평형 :: 010007, 010017, 010027
삼성 윈드프리 16평형 :: 010008, 010018, 010028
삼성 윈드프리 18평형 :: 010009, 010019, 010029
삼성 윈드프리 20평형 :: 010010, 010020, 010030
삼성 윈드프리 5평형 :: 010001, 010011, 010021
삼성 윈드프리 6평형 :: 010002, 010012, 010022
삼성 윈드프리 7평형 :: 010003, 010013, 010023
삼성 윈드프리 9평형 :: 010004, 010014, 010024
스탠드 자재 :: FPH-3858XS5, FPH-3878XS
실내기 멀티 덕트 28평형 :: AVXDHH100B1, AVXDUH100B3
실내기 스탠드형(PAC) 40평형 :: AM145JNPDBH1, AM145HEPGBH1
실내기(1-Way) 인피니트 무풍 대형(UV) 13평형 :: AJ052CN1UBC1, AM052DN1UBH1
실내기(1-Way) 인피니트 무풍 대형(UV) 15평형 :: AJ060CN1UBC1, AM060DN1UBH1
실내기(1-Way) 인피니트 무풍 대형(UV) 18평형 :: AJ072CN1UBC1, AM072DN1UBH1
실내기(1-Way) 인피니트 무풍 중형(UV) 10평형 :: AJ040CN1UBC1, AM040DN1UBH1
실내기(1-Way) 인피니트 무풍 중형(UV) 5평형 :: AJ020CN1UBC1, AM020DN1UBH1
실내기(1-Way) 인피니트 무풍 중형(UV) 6평형 :: AJ023CN1UBC1, AM023DN1UBH1
실내기(1-Way) 인피니트 무풍 중형(UV) 8평형 :: AJ032CN1UBC1, AM032DN1UBH1
싱글 실링 :: AC072BSCPBH2SY, AC090BSCPBH2SY, AC130BSCPHH2SY, AC145BSCPHH2SY
싱글 실링 실내기 :: AC072BNCPBH1, AC090BNCPBH1, AC130BNCPHH1, AC145BNCPHH1
판넬 (360CST / 원형 / 공기청정) :: PC6EUCK1NW, PC6EUCK1N
판넬 4way 구통신 :: AG4S0957W, PC4NUSK1

```
## 2. soft delete 포함 여부

모든 `products` 행을 이름으로 묶으면 중복 그룹 187건, 초과 행 513건이다. 활성 중복 186건/510초과 행보다 각각 1건/3행 많지만, 추가 3행은 soft delete가 아니라 `DISCONTINUED` 3행이다. 현재 soft delete 6행은 활성 행과 이름이 겹치지 않는다. 따라서 이 데이터에서는 soft delete 때문에 새 등록이 막히는 실제 이름 충돌은 확인되지 않았다. 다만 전체 `name` unique라면 아래의 DISCONTINUED 행도 충돌 대상이다.

```sql
SELECT is_deleted, status, COUNT(*)
FROM products GROUP BY is_deleted, status ORDER BY is_deleted, status;

SELECT COUNT(*) AS duplicate_name_groups_including_soft_deleted,
       COALESCE(SUM(product_count - 1),0) AS extra_rows_including_soft_deleted
FROM (SELECT name, COUNT(*) AS product_count FROM products GROUP BY name HAVING COUNT(*) > 1) d;

SELECT name, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_deleted = FALSE AND status = 'ACTIVE') AS active,
       COUNT(*) FILTER (WHERE is_deleted = FALSE AND status <> 'ACTIVE') AS non_active,
       COUNT(*) FILTER (WHERE is_deleted = TRUE) AS soft_deleted,
       STRING_AGG(COALESCE(product_code, model_code, id::text) || ' [status=' || COALESCE(status,'<NULL>') || ', deleted=' || is_deleted || ']', ', ' ORDER BY created_at, id) AS products
FROM products GROUP BY name
HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE is_deleted = TRUE) > 0 ORDER BY name;
```

```text
is_deleted | status       | count
-----------+--------------+------
f          | ACTIVE       | 1216
f          | DISCONTINUED | 4
t          | ACTIVE       | 6
(3 rows)

duplicate_name_groups_including_soft_deleted | extra_rows_including_soft_deleted
----------------------------------------------+-----------------------------------
187                                          | 513
(1 row)

name | total | active | non_active | soft_deleted | products
-----+-------+--------+------------+--------------+---------
(0 rows)
```

전체 이름 중복에서 활성 외 행이 섞이는 원문:

```sql
SELECT name, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_deleted = FALSE AND status = 'ACTIVE') AS active,
       COUNT(*) FILTER (WHERE is_deleted = FALSE AND status <> 'ACTIVE') AS non_active,
       COUNT(*) FILTER (WHERE is_deleted = TRUE) AS soft_deleted,
       STRING_AGG(COALESCE(product_code, model_code, id::text) || ' [status=' || COALESCE(status,'<NULL>') || ', deleted=' || is_deleted || ']', ', ' ORDER BY created_at, id) AS products
FROM products GROUP BY name
HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE is_deleted = FALSE AND status <> 'ACTIVE') > 0 ORDER BY name;
```

```text
삼성 DVM-S 20HP | 2 | 1 | 1 | 0 | 010062 [status=ACTIVE, deleted=false], 010075 [status=DISCONTINUED, deleted=false]
삼성 비스포크 스탠드 20평형 | 3 | 2 | 1 | 0 | 010034 [status=ACTIVE, deleted=false], 010042 [status=ACTIVE, deleted=false], 010050 [status=DISCONTINUED, deleted=false]
삼성 윈드프리 11평형 | 3 | 2 | 1 | 0 | 010005 [status=ACTIVE, deleted=false], 010015 [status=ACTIVE, deleted=false], 010025 [status=DISCONTINUED, deleted=false]
(3 rows)
```

## 3. 생성 경로

| 경로 | 판정 |
|---|---|
| 수동 등록 `POST /products` → `ProductService.create` | `modelName`/`modelCode`만 중복 검사하고 `name`은 검사하지 않으므로 같은 이름 재등록 가능. `update()`의 `rename(name)`도 name 중복 검사 없음. |
| 시트 동기화 `ProductSheetSyncService` | `modelCode`로 찾고 없으면 `Product.seedFromSheet(name, modelCode, ...)` 후 insert. 다른 모델코드의 같은 이름은 정상 insert. 같은 모델코드는 update, 시트에서 빠지면 soft delete. |
| 이카운트 `EcountProductImporter` | `product_code` 기준 `ON CONFLICT DO UPDATE`; 다른 code면 같은 name 신규 가능. 이름 기반 main 탐색에서 활성 동명 2건 이상이면 `MIG2_NO_MAIN_CANDIDATE` 예외. 같은 파일 재실행은 같은 code update/멱등, 새 code는 신규 또는 ambiguity 중단. |
| seed `HvacProductSeeder` | `existsByModelNameAndIsDeletedFalse`만 skip 키. 다른 modelName의 같은 name은 insert 가능. |

```text
ProductController.java:126-133  POST /products -> productService.create(request)
ProductService.java:469-490     existsByModelNameAndIsDeletedFalse / existsByModelCodeAndIsDeletedFalse; Product.create(req.name(), req.modelName(), ...)
ProductService.java:516-522     req.name()이면 product.rename(req.name()); name 중복 검사 없음
ProductSheetSyncService.java:1261-1277  findByModelCodeAndIsDeletedFalse; 없으면 Product.seedFromSheet(name, modelCode, ...)
EcountProductImporter.java:290-326  INSERT ... ON CONFLICT (product_code) WHERE is_deleted = FALSE DO UPDATE SET name = EXCLUDED.name
EcountProductImporter.java:429-443  동명 ACTIVE 2건 이상이면 MIG2_NO_MAIN_CANDIDATE
HvacProductSeeder.java:140-161  existsByModelNameAndIsDeletedFalse이면 skip, 아니면 native insert
```

## 4. 이름 표기 분포와 정규화

활성 1,216개 이름: 길이 2–35자, 평균 18.85자, 중앙값 18자. 길이 구간은 1–5자 10건, 6–10자 117건, 11–20자 654건, 21–40자 435건이다. 선행/후행 공백 0건, ASCII 공백 2칸 이상 55건, 구두점 포함 454건이다. 대소문자만 다른 그룹은 0건이며, `btrim`과 연속 whitespace를 단일 공백으로 바꿔도 새로 합쳐지는 그룹은 0건이다. 현재 `삼성 윈드프리`/`삼성  윈드프리` 반례는 없지만 55건의 다중 공백은 정규화 없는 unique의 우회 가능성을 보여준다.

```sql
SELECT MIN(char_length(name)), MAX(char_length(name)), ROUND(AVG(char_length(name)),2), percentile_cont(0.5) WITHIN GROUP (ORDER BY char_length(name)), COUNT(*) FROM products WHERE is_deleted=FALSE AND status='ACTIVE';
SELECT CASE WHEN char_length(name) BETWEEN 1 AND 5 THEN '1-5' WHEN char_length(name) BETWEEN 6 AND 10 THEN '6-10' WHEN char_length(name) BETWEEN 11 AND 20 THEN '11-20' WHEN char_length(name) BETWEEN 21 AND 40 THEN '21-40' ELSE '41+' END, COUNT(*) FROM products WHERE is_deleted=FALSE AND status='ACTIVE' GROUP BY 1 ORDER BY MIN(char_length(name));
SELECT COUNT(*) FILTER (WHERE name ~ E'^\\s|\\s$'), COUNT(*) FILTER (WHERE name ~ E'  +'), COUNT(*) FILTER (WHERE name ~ '[[:punct:]]'), COUNT(*) FROM products WHERE is_deleted=FALSE AND status='ACTIVE';
SELECT COUNT(*) FROM (SELECT lower(name) FROM products WHERE is_deleted=FALSE AND status='ACTIVE' GROUP BY lower(name) HAVING COUNT(DISTINCT name)>1) x;
SELECT COUNT(*) FROM (SELECT regexp_replace(btrim(name), E'\\s+', ' ', 'g') FROM products WHERE is_deleted=FALSE AND status='ACTIVE' GROUP BY 1 HAVING COUNT(DISTINCT name)>1) x;
```

```text
2 | 35 | 18.85 | 18 | 1216
1-5=10, 6-10=117, 11-20=654, 21-40=435
leading_or_trailing_whitespace=0 | repeated_ascii_spaces=55 | punctuation_names=454 | active_products=1216
case_variant_groups=0
whitespace_variant_groups=0
```

## 5. 모델코드 없는 전표 라인 재검증

현재 읽기 전용 DB에서 직접 센 결과는 **4,196건 = partner-order 2,048 + slip 2,148**이다. 따라서 배경의 4,189건과 7건 차이가 나며, 현재 DB 기준으로 4,189건이라고 확인할 수 없다. 기존 조사 문서에는 slip 2,141로 기록되어 있으나 이번 조회의 현재 결과는 2,148이다.

과거 2,141과 현재 2,148의 차이를 발생시킨 정확한 모집단 조건은 저장소 문서만으로는 **확인불가**이며, 이번 라운드에서는 현재 DB의 `is_deleted=FALSE` 라인과 현재 product master의 `is_deleted=FALSE AND model_code IS NULL`을 기준으로 재현했다.

```sql
-- product_db에서 아래 조건의 id::text 100개를 조회한 뒤, 두 DB의 ARRAY[...]에 대입
SELECT id::text FROM products WHERE is_deleted = FALSE AND model_code IS NULL;
-- partner_order_db
SELECT COUNT(*) AS model_code_missing_lines FROM partner_order_lines WHERE is_deleted=FALSE AND product_id=ANY(ARRAY[<100개 UUID>]::uuid[]);
-- slip_db
SELECT COUNT(*) AS model_code_missing_lines FROM slip_lines WHERE is_deleted=FALSE AND product_id=ANY(ARRAY[<100개 UUID>]::uuid[]);
```

```text
product_db model_code IS NULL, is_deleted=false: 100개 UUID
partner_order_db model_code_missing_lines: 2048
slip_db model_code_missing_lines: 2148
합계: 4196
```

보조 SQL 출력: `partner_order_lines` 비삭제 2,052건/모두 product_id 있음, `slip_lines` 비삭제 2,798건/모두 product_id 있음.

## 6. 생산 종료 품목명 재사용 흔적

활성 중복 186개 그룹 중 **157개**는 서로 다른 model_code 2개 이상이며, **8개**는 서로 다른 product_category까지 섞인다. 예: `냉난방 무풍 벽걸이` 14개 모델코드, `360 CST UV 실외기` 10개 모델코드. DISCONTINUED와 ACTIVE가 같은 이름인 실제 그룹도 3개다: `삼성 DVM-S 20HP`(010062 ACTIVE/010075 DISCONTINUED), `삼성 비스포크 스탠드 20평형`(010034·010042 ACTIVE/010050 DISCONTINUED), `삼성 윈드프리 11평형`(010005·010015 ACTIVE/010025 DISCONTINUED).

```sql
SELECT COUNT(*) FROM (SELECT name FROM products WHERE is_deleted=FALSE AND status='ACTIVE' GROUP BY name HAVING COUNT(*)>1 AND COUNT(DISTINCT model_code) FILTER (WHERE model_code IS NOT NULL)>1) x;
SELECT COUNT(*) FROM (SELECT name FROM products WHERE is_deleted=FALSE AND status='ACTIVE' GROUP BY name HAVING COUNT(*)>1 AND COUNT(DISTINCT product_category)>1) x;
```

```text
duplicate_names_with_multiple_model_codes=157
duplicate_name_groups_with_different_categories=8
```

## 결론

활성 name unique는 기존 186개 중복 그룹·510개 초과 행 때문에 지금 걸 수 없다. soft delete와 활성 이름 충돌은 0개지만 전체 이름 중복은 187개 그룹·513개 초과 행이고, DISCONTINUED 충돌 3행이 있다. 네 생성 경로 모두 name을 공통 자연키로 쓰지 않아 같은 이름 재등록은 정상 경로다. 현재 modelCode 없는 전표 라인은 4,196건이며, 생산 종료/현행 모델의 동일 이름 재사용 흔적도 확인되었다.
