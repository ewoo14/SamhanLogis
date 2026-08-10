# 레거시 **실외기별 받침 대응** 재조사

> 개발책임자: *"**실외기로만 판별해서는 안 돼.** 각 **카테고리별로 발통(또는 받침대) 옵션이 다르고 실외기마다 받침 종류가 다르잖아.**"*
> *"구글 시트는 데이터고 **레거시 코드에 해당 로직이 있을 거야.** 다시 재조사 부탁해."*

> 워크플로우 12에이전트 · 카테고리·앱별 7조각 병렬 → 대응표 → 적대검증 3각도


개발책임자 지적은 **코드로 확인됩니다 — 단 상업멀티(COMMERCIAL_MULTI) 한 곳에서만**입니다. "어느 실외기가 어느 받침을 쓰는가"를 정하는 로직은 `chooseBaseModel(nm)` 단 하나이며(견적 clients/web/estimate-app/views/index.ejs:4149-4193 / 주문 clients/web/order-app/index.html:2503-2547 / 레거시 tools/legacy-gas/종합견적서/index.html:3734-3777 · tools/legacy-gas/거래처 발송 주문서/index.html:2253-2296), 실외기 **품명 계열 7종(프라임·한랭지·표준형·냉방전용 상부토출·ECO·가스히트펌프·프레스티지|동시냉난방|공장전원) × 정확 HP 토큰(hasExactHP, index.ejs:4137-4140)** 의 2축 격자로 SI-AL600a·SI-AL700a·방진가대S2소/중/대·GHP방진가대(+ACL-KORGHP07)를 가릅니다. 계열마다 경계가 다릅니다 — 14HP 는 표준형·상부토출에서 '소'인데 프라임·한랭지·extra 에서는 '중', 30HP 는 표준형에서 '대'인데 상부토출에서는 '중', **한랭지와 extra 에는 '대' 분기가 아예 없습니다**. 저는 이 함수를 estimate↔order 양쪽에서 같은 함수끼리 `diff` 로 대조했고 **주석 3줄 외 글자까지 동일**함을 확인했습니다(앞 조사류의 가짜 충돌 아님).

반대로 **홈멀티·싱글중대형에는 실외기별 받침 선택 분기가 없습니다(못 찾음이 아니라 부재)**. 홈은 `#home_foot` 체크 × (HOMEMULTI 중 name 에 '실외기' 가 든 행 수량 합) → `발통세트` 하나뿐이고(index.ejs:7957-7968 / index.html:5159-5167), 싱글은 모델코드 리터럴 2건(`AP230DAPDHH1S|AP290DAPDHH1S`)만 일자발로 가르고 나머지는 전부 원형발통입니다(index.ejs:7996-8001 / index.html:5176-5177). 구형(LEGACY)·기타(OTHER)에는 받침 로직도 받침 품목 노출도 0건입니다. 서버(BundleExpander)·데스크톱은 받침을 **고르는** 게 아니라 **제외·분류**만 합니다.

앞 조사의 "[홈] 실외기 → 원형발통 세트, /실외기/ 매치 10건, 합 ×1" 은 홈에 한해 규칙 자체는 맞으나 ①발통포함 체크박스(기본 false, dc_config_db.estimate_configs home_with_foot=f, 2026-08-10 15:58 KST)라는 게이트가 빠졌고 ②분모 10건 중 1건이 **받침 자신(SI-AL600A '실외기 일자발')** 이며 ③이 규칙을 상업·싱글로 확장하면 전부 틀립니다.

DB 실측(전부 `products JOIN product_estimate_exposure` M:N 조인, `p.status NOT IN (DISCONTINUED,NOT_FOR_SALE)`, 2026-08-10 15:56~16:03 KST): 노출 총계 COMMERCIAL_MULTI 416 · HOME_MULTI 119 · LEGACY 40 · SINGLE_SET 288. 받침 계열 노출은 **12행**(상업 7 · 홈 2 · 싱글 3)이고 `quantity_sync_rule` 은 **0행**, `bundle_component` 의 `FOOT` 은 **0행**(전체 1,584행) — 즉 받침 대응은 100% 프런트 JS 리터럴이며 DB 규칙 엔진·세트 구성품 어느 쪽에도 실체가 없습니다.


---

## 대응표 — 실외기 계열 × HP → 받침


| 카테고리 | source (실외기) | target (받침) | 규칙 | 앱 | 좌표 |
|---|---|---|---|---|---|
| COMMERCIAL_MULTI | 실외기 품명에 ECO(/\bECO\b/i) + 정확 HP 4·5·6 또는 3.5 | SI-AL600a (실외기 일자발 (전면 4~6HP), 상업 display_order 337) | if(isECO){ if(['4','5','6'].some(test) // hasExactHP(nm,'3.5')) { want.push('SI-AL600a'); } } — test=hp=>hasExactHP(nm,hp), hasExactHP=new RegExp(`(^/[^0-9.])${hp}HP([^0-9.]/$)`). 수량 = 그 실외기 수량 ×1 가산 | estimate+order 동일(diff 결과 주석만 상이) · legacy 2본 동일 | clients/web/estimate-app/views/index.ejs:4163-4164 · clients/web/order-app/index.html:2517-2519 · hasExactHP index.ejs:4137-4140 |
| COMMERCIAL_MULTI | ECO + 정확 HP 8·10·12·14 또는 7.5 | SI-AL700a (실외기 일자발 (전면 8~12HP), 338) | if(['8','10','12','14'].some(test) // hasExactHP(nm,'7.5')) { want.push('SI-AL700a'); } — 4~6HP 분기와 배타가 아닌 독립 if 라 둘 다 참이면 600a·700a 동시 push(현 카탈로그엔 해당 행 없음) | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4165 · clients/web/order-app/index.html:2519 |
| COMMERCIAL_MULTI | 실외기 품명에 '가스히트펌프' (/가스히트펌프/i) — HP 조건 없음 | GHP방진가대(340) + ACL-KORGHP07(GHP 저감장치, 305) 2품목 동시 | if(isGHP) { want.push('GHP방진가대'); want.push('ACL-KORGHP07'); } — 16HP든 50HP든 동일. 받침 외 품목이 함께 붙는 유일한 계열 | estimate+order 동일(단 도달성은 앱마다 다름 — 드리프트 ①·⑤ 참조) | clients/web/estimate-app/views/index.ejs:4168-4171 · clients/web/order-app/index.html:2522-2525 |
| COMMERCIAL_MULTI | '프라임' + 정확 HP 8·10·12 | 방진가대S2소 (334) | if(isPrime && ['8','10','12'].some(test)) want.push('방진가대S2소'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4174 · clients/web/order-app/index.html:2528 |
| COMMERCIAL_MULTI | '한랭지' + 정확 HP 8·10·12 (실품명 '고효율한랭지' 도 부분매치) | 방진가대S2소 | if(isCold && ['8','10','12'].some(test)) want.push('방진가대S2소'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4175 · clients/web/order-app/index.html:2529 |
| COMMERCIAL_MULTI | '표준형' + 정확 HP 8·10·12·14 (프라임·한랭지와 달리 14 포함) | 방진가대S2소 | if(isStd && ['8','10','12','14'].some(test)) want.push('방진가대S2소'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4176 · clients/web/order-app/index.html:2530 |
| COMMERCIAL_MULTI | '냉방전용 상부토출'(/냉방전용\s*상부토출/i) + 정확 HP 8·10·12·14 | 방진가대S2소 | if(isCoolTop && ['8','10','12','14'].some(test)) want.push('방진가대S2소'); — 'DVM ECO 리뉴얼 12HP 상부토출형'은 '냉방전용'이 없어 isCoolTop=false, ECO 분기로만 간다 | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4177 · clients/web/order-app/index.html:2531 |
| COMMERCIAL_MULTI | '프레스티지/동시냉난방/공장전원'(isExtra 한 축으로 묶임) + 정확 HP 8·10·12 | 방진가대S2소 | if(isExtra && ['8','10','12'].some(test)) want.push('방진가대S2소'); — 세 계열이 한 조건에 묶여 개별 구분 없음 | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4178(isExtra 정의 :4158) · clients/web/order-app/index.html:2532(:2512) |
| COMMERCIAL_MULTI | '프라임' + 정확 HP 14·16·18·20 | 방진가대S2중 (335) | if(isPrime && ['14','16','18','20'].some(test)) want.push('방진가대S2중'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4181 · clients/web/order-app/index.html:2535 |
| COMMERCIAL_MULTI | '한랭지' + 정확 HP 14·16·18·20·22·24 | 방진가대S2중 | if(isCold && ['14','16','18','20','22','24'].some(test)) want.push('방진가대S2중'); — 한랭지는 '대' 분기가 없어 22·24 를 '중'이 받는다 | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4182 · clients/web/order-app/index.html:2536 |
| COMMERCIAL_MULTI | '표준형' + 정확 HP 16·18·20·22·24·26·28 (14 는 '소'가 가져감) | 방진가대S2중 | if(isStd && ['16','18','20','22','24','26','28'].some(test)) want.push('방진가대S2중'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4183 · clients/web/order-app/index.html:2537 |
| COMMERCIAL_MULTI | '냉방전용 상부토출' + 정확 HP 16·18·20·22·24·26·28·30 | 방진가대S2중 | if(isCoolTop && ['16','18','20','22','24','26','28','30'].some(test)) want.push('방진가대S2중'); — 🚩현행 3본(estimate·order·거래처발송)에만 '30' 이 있고 tools/legacy-gas/종합견적서/index.html:3768 에는 없다 | estimate+order 동일 / 종합견적서 legacy 만 구판 | clients/web/estimate-app/views/index.ejs:4184 · clients/web/order-app/index.html:2538 ↔ tools/legacy-gas/종합견적서/index.html:3768 |
| COMMERCIAL_MULTI | isExtra + 정확 HP 14·16·18·20 | 방진가대S2중 | if(isExtra && ['14','16','18','20'].some(test)) want.push('방진가대S2중'); — extra 도 '대' 분기 없음 | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4185 · clients/web/order-app/index.html:2539 |
| COMMERCIAL_MULTI | '프라임' + 정확 HP 22·24 | 방진가대S2대 (336) | if(isPrime && ['22','24'].some(test)) want.push('방진가대S2대'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4188 · clients/web/order-app/index.html:2542 |
| COMMERCIAL_MULTI | '표준형' + 정확 HP 30·32·34 | 방진가대S2대 | if(isStd && ['30','32','34'].some(test)) want.push('방진가대S2대'); | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:4189 · clients/web/order-app/index.html:2543 |
| COMMERCIAL_MULTI | '냉방전용 상부토출' + 정확 HP 32·34 | 방진가대S2대 | if(isCoolTop && ['32','34'].some(test)) want.push('방진가대S2대'); — 종합견적서 legacy 는 ['30','32','34'](index.html:3774) 라 30HP 상부토출 1대의 받침이 구판 '대' ↔ 현행 3본 '중' 으로 갈린다 | estimate+order 동일 / 종합견적서 legacy 만 구판 | clients/web/estimate-app/views/index.ejs:4190 · clients/web/order-app/index.html:2544 ↔ tools/legacy-gas/종합견적서/index.html:3774 |
| COMMERCIAL_MULTI | 세트 실외기 — 괄호 안 '(10HP+16HP)' 를 조각으로 분해해 조각마다 chooseBaseModel 재실행 | 조각별 chooseBaseModel 결과 전부(같은 받침이 두 조각이면 2배) + AXJ-TA3419M(T형 분기관) | order 판별식: const isSet=(String(r?.unit//'').toUpperCase()==='SET') // /\(.*\+.*\)/.test(nm); / estimate 판별식: if (String(r.unit).toUpperCase() === 'SET'). 🚨실측 2026-08-10 15:59 KST: products.unit 은 전 3,061행이 'EA' 단일값이고 CatalogRow 가 p.getUnit() 을 그대로 싣는다 ⟹ estimate 는 SET 경로가 절대 실행되지 않고 통짜 평가, order 는 괄호+플러스 품명 84건을 조각 분해 | 🚩estimate ≠ order (각자 자기 레거시를 정확히 계승) | clients/web/estimate-app/views/index.ejs:8486-8505 · clients/web/order-app/index.html:5786-5825 · 레거시 tools/legacy-gas/종합견적서/index.html:8045 ↔ tools/legacy-gas/거래처 발송 주문서/index.html:5239 · CatalogRow unit services/produc |
| COMMERCIAL_MULTI | 세트 조각 수 - 1 (countBranchForSet) × 실외기 수량 | AXJ-TA3419M (T형 분기관, 상업 display_order 281) | branchCnt += countBranchForSet(nm)*q; … if(branchCnt>0) want.set('AXJ-TA3419M', …). 🚨estimate 는 branchCnt 증가가 unit==='SET' 블록 안에만 있고 실데이터 unit 이 전부 EA 라 **AXJ-TA3419M 을 한 번도 발행하지 않는다**(등장 지점 index.ejs:8505·8537 두 곳뿐) | 🚩order 만 실데이터에서 발화 | clients/web/estimate-app/views/index.ejs:8496·8505 · clients/web/order-app/index.html:5806-5825 |
| COMMERCIAL_MULTI | (대응 없음) 상업멀티 '발통세트'(원형발통 세트, display_order 339, 노출 확인) | 발통세트 | chooseBaseModel 이 '발통세트' 를 push 하는 분기가 한 줄도 없다(함수 전문 확인). 상업에서 발통세트는 ①매 재계산 시작 시 seed 0 ②'받침대 제외' 시 0 ③사용자 수동 입력만 가능 ⟹ **상업 원형발통은 코드가 정하지 않는다** | estimate+order 동일(부재) | clients/web/estimate-app/views/index.ejs:4149-4193(부재)·8409-8410(seed 0) · clients/web/order-app/index.html:2503-2547(부재)·5712 |
| COMMERCIAL_MULTI | 실외기 모델코드가 RENEW_FILTER_MAP 값 목록에 있을 때 (AF-R09A ← AM035FXMRHC1·AM050MXMRBC1·AM050FXMRHC1 / AF-R12A ← AM075FXMRHC1) | AF-R09A · AF-R12A (ECO 리뉴얼 필터) — 받침은 아니나 같은 파생·잠금 축을 공유 | const RENEW_FILTER_MAP={'AF-R09A':[…],'AF-R12A':['AM075FXMRHC1']}; … if(list.includes(r.model) && !COMM_MANUAL_BASE.has(fModel)) want.set(fModel,(want.get(fModel)//0)+q); | estimate+order | clients/web/estimate-app/views/index.ejs:4229-4232·8508-8516 |
| COMMERCIAL_MULTI | 상업 실내기 모델코드 리터럴 22종(PUMP_MAP) — 예: ADP-F075SP ← AM072TNCDBH1·AM110TNCDBH1·AM130TNCDBH1·AM145TNCDBH1 | MDP-Z075SZED · ADP-E075SEK3D · MDP-M075SGK2D · ADP-G075SPK1D · ADP-N047SNK1D · ADP-F075SP | Object.entries(PUMP_MAP).forEach(([pump,list])=>{ let sum=0; list.forEach(m=>sum+=Number(commQty.get(m)//0)); want.set(pump,sum); }) — 받침이 아니라 드레인펌프지만 PM 카탈로그가 받침 계열로 함께 제시한 ADP-F075SP 의 상업측 대응. 싱글은 같은 품목을 이름 /실링/ 매치로 붙인다(대응 규칙이 카테고리마다 다름) | estimate+order | clients/web/estimate-app/views/index.ejs:8460-8478 · clients/web/order-app/index.html:5753-5776 |
| COMMERCIAL_MULTI | 사용자 옵션 '받침대 제외'(#comm_ex_base) 체크 — 실외기 무관 | /방진가대/받침대/발통세트/일자발/SI-AL/i (estimate) · /방진가대/받침대/발통세트/si-al600a/si-al700a/i (order) 매치 전 행 → 0 | 파생 계산을 막는 게 아니라 계산 후 일괄 0 덮어쓰기. 🚩ACL-KORGHP07 은 두 정규식 어디에도 안 걸려 '받침대 제외' 로도 0 이 되지 않는다 | estimate+order(정규식 문자열만 상이) | clients/web/estimate-app/views/index.ejs:8526-8533 · clients/web/order-app/index.html:5858-5866 |
| COMMERCIAL_MULTI | 사용자가 받침 행 수량을 직접 입력(수동 잠금) | 해당 받침 모델 1건 | estimate: COMM_MANUAL_BASE.add(model) 후 집계·반영 단계에서 skip / order: setManualQtyLock('commercial',model) 후 **반영 단계**에서 if(isCommDerivedRow(row) && isManualQtyLocked('commercial',m)) return. 🚩order 의 집계 루프에는 isBase 지역변수가 계산만 되고 쓰이지 않는다(죽은 변수) | 🚩적용 지점이 다름(집계 vs 반영) | clients/web/estimate-app/views/index.ejs:4759·8559-8561 · clients/web/order-app/index.html:5798-5800·5813-5815(미사용)·5869-5872 |
| HOME_MULTI | HOMEMULTI 행 중 name 이 /실외기/i 인 **모든 행의 수량 합** (모델·용량·계열 분기 없음). 실측 2026-08-10 15:57 KST 매치 10행 = AJ060MXHNBC1·AJ050MXHNBC1·AJ040MXHNBC1·AJ030MXHNBC1·AJ025MXHNBC1(단배관 5) + AJ025RXH3BC1·AJ030RXH4BC1·AJ040RXH4BC1·AJ050RXH5BC | 발통세트 (원형발통 세트, HOME_MULTI display_order 111, 단가 0원) | estimate: const outQ=HOMEMULTI.reduce((t,r)=>t+(/실외기/i.test(r?.name)?(homeQty.get(r.model)//0):0),0); const want=!!el('#home_foot')?.checked; if(FOOT_ROUND && !HOME_MANUAL_FOOT.has(FOOT_ROUND)) homeQty.set(FOOT_ROUND, want?outQ:0); / order: 동일 합계 후 setHomeDerivedQty_(FOOT_ROUND,'발통세트',totalRoundHome,'발통 파생'). 계수 ×1, 실외기 종류 무관 | estimate+order 의미 동일 | clients/web/estimate-app/views/index.ejs:7957-7968(FOOT_ROUND 선언 :4522) · clients/web/order-app/index.html:5159-5167(:2891) |
| HOME_MULTI | (대응 없음 — dead branch) HOMEMULTI 에서 model 이 /SI-AL700a/i 인 행 | FOOT_FLAT → 해소 실패(빈 문자열) | const FOOT_FLAT=(HOMEMULTI.find(r=>/SI-AL700a/i.test(r?.model//''))//{}).model//''; 실측 HOME_MULTI 노출 받침은 발통세트·SI-AL600A 둘뿐이고 SI-AL700a 는 0건(2026-08-10 15:56 KST) ⟹ FOOT_FLAT==='' 이라 estimate :7965 `if(FOOT_FLAT && …)` 와 order :5165 `if(FOOT_FLAT) …` 는 영구 미실행. 홈 일자발 SI-AL600A 는 자동 0 리셋도 자동 채움도 없는 **완전 수동 행** | estimate+order 동일(양쪽 다 dead) | clients/web/estimate-app/views/index.ejs:4523·7965-7967 · clients/web/order-app/index.html:2892·5165 |
| HOME_MULTI | 사용자 직접 입력(수동 잠금) | 발통세트 · SI-AL600A | estimate: 홈 표에서 name 이 /발통/일자발/ 인 행에 수량을 넣으면 HOME_MANUAL_FOOT.add(model) 로 이후 자동계산에서 제외, 빈칸으로 지우면 delete / order: MANUAL_QTY_LOCKS + clearManualQtyLocks('home','home_foot') 의 owns() 가 **이름만** 본다 — `/발통/받침대/실외기\s*받침대/i.test(row?.name)` ⟹ '실외기 일자발'(SI-AL600A)은 미매치라 잠금이 풀리지 않는다 | 🚩기전이 다름(전용 Set vs 범용 잠금표) | clients/web/estimate-app/views/index.ejs:7703·7735-7748·6004-6018 · clients/web/order-app/index.html:2302-2333(:2320)·5116-5119 |
| HOME_MULTI | 재계산 트리거 판정(어떤 행의 수량 변경이 발통 재계산을 부르는가) | 발통세트 수량 반영 시점 | estimate: if(/(일자발/발통)/i.test(nm)) return false; … if(/(단배관/다배관)/i.test(nm)) return true; / order: if(/(실외기\s*받침대)/i.test(nm)) return false; … if(/(실외기)/i.test(nm)) return true; ⟹ 🚩order 에서는 홈 '실외기 일자발'(SI-AL600A)이 배제 가드('실외기 받침대' 품명 0건)를 통과해 **실외기 트리거로 참**이 된다. 두 판본 모두 각자 레거시를 그대로 계승 | 🚩estimate ≠ order (레거시 계승) | clients/web/estimate-app/views/index.ejs:8037-8047 · clients/web/order-app/index.html:5214-5222 · 레거시 tools/legacy-gas/종합견적서/index.html:7607 ↔ tools/legacy-gas/거래처 발송 주문서/index.html:4809 |
| SINGLE_SET | 모델코드 리터럴 2건 — /^(AP230DAPDHH1S/AP290DAPDHH1S)$/i (냉난방 프리미엄 스탠드, display_order 99·100) | SI-AL700a (실외기 일자발 (전면 8~12HP), 싱글 display_order 286) | if(/^(AP230DAPDHH1S/AP290DAPDHH1S)$/i.test(mdl)) flat+=q; else round+=q; … flat 을 SS_FOOT_FLAT_ID 수량으로. 게이트는 #ss_base 하나. **싱글에서 유일하게 '모델 → 받침 종류' 대응이 존재하는 지점** | estimate+order 동일 문장 | clients/web/estimate-app/views/index.ejs:7996-8001·8007(:4541) · clients/web/order-app/index.html:5176-5177·5181(:2910) |
| SINGLE_SET | 위 2모델을 제외한 SINGLE_SET 행 — estimate 는 4중 게이트(①발통·일자발 자기 제외 ②/운임/절삭/비용/설치비/ 제외 ③catL 이 '부자재'·'실외기 받침'·'자재' 면 제외 ④unit 이 'SET' 또는 '식' 이어야 함), order 는 2중 게이트(①·②만) | 발통세트 (원형발통 세트, 싱글 display_order 284) | estimate 원문 :7988-7993 `const unit=String(s.unit//'').trim().toUpperCase(); … if(unit!=='SET' && unit!=='식') return;`. 🚨실측: products.unit 은 전 3,061행 'EA'(2026-08-10 15:57 KST)이고 CatalogRow 가 p.getUnit() 을 그대로 실으므로(db-catalog.js:111 `r.unit // 'SET'` 은 값이 있어 fallback 미적용) **견적앱의 '실외기 받침대 포함' 은 현재 데이터에서 발통 0개를 만든다**. order 는 게이트가 없어 정상 동작 | 🚩estimate ≠ order (레거시 계승 + 시트 '단위' 미승계가 겹침) | clients/web/estimate-app/views/index.ejs:7971-8010 · clients/web/order-app/index.html:5168-5183 · clients/web/estimate-app/lib/db-catalog.js:97-111 · services/product-service/src/main/java/com/samhanair/logis/product/web |
| SINGLE_SET | 이름+모델이 /실링/i 인 SINGLE_SET 행(자기 자신·운임·절삭 제외) — 실측 싱글 실링 4모델(AC072BSCPBH2SY·AC090BSCPBH2SY·AC130BSCPHH2SY·AC145BSCPHH2SY) | ADP-F075SP 실링용 드레인펌프 (싱글 display_order 76) | if(/실링/i.test((s?.name//'')+' '+(s?.model//''))) pumpQty+=(singleQty.get(s.id)//0); → SS_CEILING_PUMP_ID 수량. 🚩옵션 축이 없다 — #ss_base 를 꺼도 항상 자동 부착 | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:8024-8032(:4539) · clients/web/order-app/index.html:5196-5202(:2908) |
| SINGLE_SET | is1WaySet_ && allowRemoteChange_ 통과 행 + (#ss_remote 가 '유선리모컨'/'컬러유선리모컨' && #ss_remote_ex 미체크) | AIM-A01N 유선리모컨 키트 (SEND_AS_SET_IDS 4멤버 중 하나라 받침과 같은 취급을 받음) | 받침은 아니나 SEND_AS_SET_IDS = {발통세트, SI-AL700a, AIM-A01N, ADP-F075SP} 로 묶여 ①계산 트리거 제외 ②전송 시 세트 미분해 ③미리보기/인쇄 단일행 ④파생행 판정에 함께 쓰인다 | estimate+order 동일 | clients/web/estimate-app/views/index.ejs:8012-8023·4542·8048-8054 · clients/web/order-app/index.html:5184-5195·2911 |
| LEGACY | (대응 없음) 구형 탭 | 없음 | 구형 탭에는 파생 계산 함수가 없다(recomputeOldDerived 류 0건). 수량은 전부 수기 입력이고 옵션은 할인율·단위처리뿐. 실측 2026-08-10 15:56 KST: estimate_category='LEGACY' 활성 노출 40건(실외기 14·실내기 16·판넬 8·운임/절삭 2)에 받침·방진·발통·일자발 매치 0건 ⟹ **로직도 품목도 없음(부재 확정)** | estimate(구형 탭) · order(구형 탭, 할인 50% 하드코딩) | clients/web/estimate-app/views/index.ejs:7423-7561·7380-7420 · clients/web/order-app/index.html:4810-4887 |
| 기타(OTHER/사용자정의) | 사용자 자유 입력 행 | 사용자가 타이핑한 품명·모델·단가(카탈로그 대조 없음) | customs.push({ …, isCustom:true, catL:'기타' }) — 구형에서 받침을 넣으려면 이 통로가 유일하다. 주문앱에는 이 통로 자체가 없다. 실측: product_estimate_exposure 에 OTHER 행 0건 | estimate only | clients/web/estimate-app/views/index.ejs:11441-11477(:11453)·18544-18653 |
| 기타(레거시 주문서 인식) | 에어디자이너 PDF 메모에 /육각/발통/ + 인식 품목 중 모델코드에 MX 또는 RX 가 든 행(=홈멀티 실외기)의 수량 합 | 발통세트 (단가 0원, 목록 최후미) | const addBolt=/육각/발통/i.test(String(parsed.memo//'')); … finalItems.forEach(item=>{ if(/MX/RX/i.test(item.model)) outdoorQty += Number(item.qty//0); }); if(outdoorQty>0) finalItems.push({model:'발통세트', qty:outdoorQty, …}); — **실외기 수량 기반 받침 산출의 또 다른 실장**(같은 로직이 2번째 경로에도 중복) | legacy-GAS 에어디자이너 | tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:1657-1658·1739-1761 · 중복 :1895-1896·1977-1996 |
| 기타(레거시 주문서 인식) | 에어디자이너 — 싱글 세트로 인식된 행(세트 수량 baseQty), addBoltong=true 일 때 | 발통세트 (norm='볼트세트', 세트수량 ×1) | function expandSingleSetItems_(…, addBoltong){ … if(addBoltong && qBase>0){ items.push({model:'발통세트', norm:'볼트세트', qty:qBase, …}); } } · 발주서 초과분 절삭에서도 발통세트만 면제(capQtyToOrder_ :1496) | legacy-GAS 에어디자이너 | tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:1044·1173-1193·1697·1933 |
| 기타(레거시 주문서 인식) | 제이시스템 주문서 원문 토큰에 '받침' 이 포함 — 실외기 모델이 아니라 **주문서에 적힌 글자**로 판별 | SI-AL700a(토큰에 7 포함) / SI-AL600a(토큰에 5 포함) | if(/받침/.test(t)){ if(/[7]/.test(t)) return 'SI-AL700a'; if(/[5]/.test(t)) return 'SI-AL600a'; } — 7·5 동시 포함이면 7 우선. 수량은 주문서 수량 그대로 | legacy-GAS 제이시스템 | tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:463-470 |
| 기타(레거시 주문서 인식) | 제이시스템 주문서에 '원형발' 이라고 적힌 행 | 발통세트 | const CODE_ALIAS_MAP={ '유연호스':'FH-LFHIF','유연 호스':'FH-LFHIF','원형발':'발통세트' }; … if(CODE_ALIAS_MAP[t]//CODE_ALIAS_MAP[key]) return … | legacy-GAS 제이시스템 | tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:456-461·483-484 |
| 기타(레거시 주문서 인식) | 제이시스템 — 싱글 세트 전개 시 발통세트 자동 추가 (🚨도달 불가) | 발통세트 (dead) | const addBoltFlag=(typeof addBolt!=='undefined')?addBolt:false; 인데 addBolt 가 파일 어디에도 대입되지 않는다(grep 전수 4건 모두 파라미터/가드) ⟹ 항상 false. 에어디자이너에 있는 `const addBolt=/육각/발통/i.test(parsed.memo)` 한 줄이 제이시스템에는 없다. 함께: opts.excludeBase(/받침대\s*제외/가대\s*제외/) 도 파싱만 하고 소비처 0건 | legacy-GAS 제이시스템 | tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:2222·2230·1067·1203-1226 · excludeBase :914-922 |
| 기타(일마감/회계) | 이카운트 품목명에 '방진가대' + '소'/'중'/(그 외) | priceMap['UNKNOWN'] 안의 방진가대 키 (가격 역조회) | accKeywords=['방진가대','소'] / ['방진가대','중'] / ['방진가대'] … for-in 첫 매치에서 break. '대' 는 명시 분기 없이 '소·중 배제'로만 잡히므로 동어근 후보가 여럿이면 순서가 결과를 정한다 | legacy-GAS 일마감 | tools/legacy-gas/일마감 프로그램/Code.js:504-540 |
| 기타(회계 검증) | 품목명이 (유연호스/발통세트/일자발/방진가대) 이거나 모델토큰이 AXJ 로 시작 | (검증 분기) 할인율 대신 **납품가 완전일치** 요구 | private static final Pattern ACCESSORY_LABEL = Pattern.compile("(유연호스/발통세트/일자발/방진가대)"); … if(ACCESSORY_LABEL.matcher(safeItemName).find() // safeModelToken.startsWith("AXJ")) return verified(integerWonEquals(effectiveUnitPrice, effectiveDeliveryPrice), …). 🚩실제 품명은 '원형발통 세트'(공백 포함)라 리터럴 '발통세트' 와 부분매치되지 않는다 | server(accounting) | services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:36·191-198 · LegacyVerificationChain.java:22 |
| 기타(서버) | 세트 구성품이 kind==FOOT 이거나 텍스트에 '발통' 이거나 모델코드 대문자화 후 'SI-AL700A' 포함 — **어느 실외기가 붙어 있는지는 전혀 참조하지 않음** | (선택이 아니라 제외) SINGLE_SET 전개 시 해당 구성품 제거 | isFoot(p) 인 부품은 pickedFilter 에서 continue. 상업멀티는 pickedFilter 자체를 안 타므로 제외되지 않는다. 🚩SI-AL600a/600A·방진가대S2소/중/대·GHP방진가대는 isFoot 에 걸리지 않는다. 실측 bundle_component FOOT 0행(전체 1,584행, 2026-08-10 15:56 KST)이라 현재 미발화 | server(product) | services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:125-129·149-152·404-409 |
| 기타(서버) | 구성품 탭 '구분' 컬럼 또는 자식 품목명+구성품특징 텍스트에 '발통' | BundleComponent.ComponentKind.FOOT | if(s.contains("발통")) return FOOT; — **오직 '발통' 문자열만** FOOT 이 된다('받침'·'방진가대'·'일자발'·'SI-AL' 은 안 됨). 구글 시트 어느 탭에도 '이 실외기의 받침은 무엇' 을 담는 컬럼이 없고, 대응을 표현할 유일한 수단은 구성품 탭의 '세트' 컬럼인데 **홈멀티는 구성품 탭 자체가 없다** | server(product) | services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1089-1097(:1092) · 구성품 탭 목록 :137-139 |
| 기타(서버) | 부모 세트의 모델코드/품명에 '발통세트' 또는 SI-AL700a | BundleMode.KEEP (전개하지 않고 세트 1행 발송) | isKeepSet(modelCode,name) → KEEP. 🚩SI-AL600a 는 KEEP 목록에 없다. 클라이언트의 SEND_AS_SET_IDS 와 같은 계약 | server(product) | services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1098-1111 · BundleExpander.java:92-95 |
| 기타(서버) | 부모 세트 품명+모델+규격에 (발통/일자발/받침) | (금액 축) 세트단가 실내:실외 재배분 비율 | isHousehold 판정에서 `if(hay.matches(".*(발통/일자발/받침).*")) return false;` ⟹ 비가정 확정 → ratioIn/ratioOut 이 6:4 대신 **4:6**. 받침 어휘가 단순 필터가 아니라 금액 분배를 바꾼다 | server(product) | services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:439-456(:447)·326-327 |
| 기타(데스크톱) | 관리자 견적 가격 설정 체크박스 — 실외기와의 대응 없음 | homeWithFoot('발통 포함') · singleWithBase('실외기 받침대 포함') 기본값 | estimate_configs.home_with_foot / single_with_base 로 저장되고 견적앱·주문앱의 #home_foot·#ss_base 초기값이 된다. 실측 2026-08-10 15:58 KST dc_config_db.estimate_configs: home_with_foot=f, single_with_base=f. 🚩데스크톱 자체에는 소비처가 없다(getEstimateConfig 호출은 설정 화면 1곳뿐) · 🚩상업 받침 기본값 UI 는 존재하지 않는다(comm_ex_base 는 코드 리터럴 false) | desktop + server(dc-config) | clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:415-437(:422·:430) · clients/web/estimate-app/lib/code.js:1221·1246·1262·1290 · clients/web/estimate-app/views/index.ejs:6642 |

---

## 카테고리별 받침 옵션 축

- 【HOME_MULTI】 축 1개뿐. `#home_foot` — 라벨 '발통포함' · 체크박스 · 값 {checked, unchecked} 2값 · 기본값 !!HOME_DEFAULTS['발통포함'] ← 서버 estimateConfig.homeWithFoot(실측 false, dc_config_db.estimate_configs home_with_foot='f', 2026-08-10 15:58 KST). 생성 clients/web/estimate-app/views/index.ejs:7810 / clients/web/order-app/index.html:5131 · 소비 index.ejs:7960 / index.html:5161 · 리셋 index.ejs:10068. 🚩받침 '종류'(원형/일자)를 고르는 축은 없다 — 홈 일자발 SI-AL600A 를 쓰려면 수량 칸에 직접 타이핑하는 수밖에 없다.
- 【HOME_MULTI · 대조용 나머지 축(받침 무관)】 estimate: #home_rate(숫자 %) · #home_remote(['기본','유선','컬러','제외']) · #home_panel(['','판넬제외','공청판넬','인피니트 25년형','인피니트 공청+동작감지 AI']) · #home_hose_i · #home_no_hose · #home_no_branch · roundSel('home')(#home_round_unit 0|10|100|1000, #home_round_mode ROUND|FLOOR|CEIL) · #chkHomeInc — index.ejs:7788-7828 / order 는 5축만(#home_remote·#home_panel·#home_no_hose·#home_no_branch·#home_foot, index.html:5124-5134).
- 【SINGLE_SET】 받침 전용 축 1개. `#ss_base` — 라벨 '실외기 받침대 포함' · 체크박스 · 2값 · 기본값 !!SINGLE_DEFAULTS['실외기 받침대 포함'] ← singleWithBase(실측 false). 생성 index.ejs:7848 / index.html:5139 · 소비 index.ejs:7972 / index.html:5169 · 리셋 index.ejs:10247. 🚩받침 종류는 모델코드(AP230DAPDHH1S|AP290DAPDHH1S)가 정하고 사용자는 못 고른다. 🚩실링용 드레인펌프(ADP-F075SP)에는 축이 아예 없어 #ss_base 를 꺼도 항상 붙는다.
- 【SINGLE_SET · 나머지 축】 #ss_remote(['','유선리모컨','컬러유선리모컨']) · #ss_remote_ex(체크) · #ss_panel(['','판넬제외','블랙판넬','승강판넬','공청판넬']) · #ss_p360(['원형','사각'], 기본 '원형') · #ss_mat(['포함','별도'], 기본 '별도') — index.ejs:7846-7851 / index.html:5137-5142. estimate 전용: ss_disc_360·ss_disc_4way·ss_disc_1way·ss_disc_stand·ss_disc_deluxe·ss_disc_grade1(숫자) · chkSingleInc · ss_expand(index.ejs:7840-7853). 🔑이 축 중 아무거나 change 되면 받침·펌프가 통째로 재계산된다(index.ejs:7945-7947 / index.html:5152).
- 【COMMERCIAL_MULTI】 받침 전용 축 1개이고 방향이 반대(opt-out). `#comm_ex_base` — 라벨 '받침대 제외' · 체크박스 · 2값 · **기본값 코드 리터럴 false**(관리자 기본값 UI 없음). 생성 index.ejs:6642 `chk('받침대 제외', false, 'comm_ex_base')` / index.html:4325(order 는 reset 아닐 때 현재 상태 유지 :4318) · 소비 index.ejs:8526-8533 / index.html:5858-5866 · 잠금해제 매핑 index.ejs:6614 / index.html:2326. 홈·싱글은 '포함'(opt-in), 상업은 '제외'(opt-out) 로 축의 방향이 반대다.
- 【COMMERCIAL_MULTI · 받침 도달성에 영향을 주는 인접 축】 `#comm_ext_out` — 라벨 '실외기확장' · 체크박스 · 기본 false — **estimate 계열에만 존재**(index.ejs:6643·6650-6660·6751, 레거시 종합견적서 index.html:6205·6319). 미체크 시 가스히트펌프·프레스티지·동시냉난방·공장전원 실외기 행이 표에서 숨겨지고 수량이 0 이 되어 GHP방진가대·ACL-KORGHP07·isExtra 방진가대 파생이 통째로 끊긴다. order 계열에는 이 축이 없고 같은 계열을 **무조건 숨긴다**(index.html:4414·4358, 레거시 거래처발송 :4146·4090).
- 【COMMERCIAL_MULTI · 나머지 축(받침 무관)】 #comm_panel(estimate: 판넬제외/기본판넬/블랙판넬/승강판넬/공청판넬/동작감지, 기본 '기본판넬') · #comm_p360(['원형','사각']) · #comm_remote(estimate ['제외','무선','유선','컬러유선'], 기본 '무선') · #comm_ex_hose · #comm_rate · roundSel('comm') · #chkCommInc — index.ejs:6635-6645 / index.html:4318-4325.
- 【수동 잠금(옵션 아님, 그러나 받침 수량을 지배)】 estimate: HOME_MANUAL_FOOT(index.ejs:7703) · COMM_MANUAL_BASE(index.ejs:7709, comm_ex_base 변경 시 clear :6614-6616) — 🚩index.ejs:4749 의 delete 직후 :4814-4817 의 add 가 조건 없이 실행돼 수량 칸을 비워도 상업 잠금이 풀리지 않는다. order: MANUAL_QTY_LOCKS 범용표(index.html:2302-2339) — 🚩home_foot 의 owns() 가 이름만 보므로 '실외기 일자발'(SI-AL600A)의 잠금은 해제되지 않고, single 은 controlId 없이 호출돼 **싱글 잠금 전체**를 지운다(index.html:5144·9449).
- 【관리자(데스크톱)】 homeWithFoot('발통 포함') · singleWithBase('실외기 받침대 포함') 체크박스 2개가 전부 — clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:415-437. 그룹은 '홈멀티'·'싱글중대형' 둘뿐이고 **상업멀티·구형 그룹은 없다**. 구성품 종류 선택지에 { value:'FOOT', label:'받침대' }(ProductFormPage.tsx:866-874) — 시트 sync 가 '발통' 문자열에만 FOOT 을 주므로 사실상 FOOT 을 만들 수 있는 유일한 경로.
- 【구형(LEGACY)】 받침 관련 옵션 축 **0개**. estimate 구형 옵션은 old_rate(할인율 %, 기본 50 = estimateConfig.oldDiscount 0.5×100) · old_round_unit(0|10|100|1000) · old_round_mode(ROUND|FLOOR|CEIL) 3개뿐 — index.ejs:7380-7420. order 구형 탭에는 옵션 박스 자체가 없고 할인 50% 하드코딩(index.html:4830).
- 【기타(사용자정의)】 옵션 축 없음. 자유 입력 필드만(.custom-name/.custom-model/.custom-list/.custom-price/.custom-qty), 분류는 catL:'기타' 로 코드가 고정 — index.ejs:18544-18653·11453.

## 어느 로직도 안 쓰는 받침 품목

- 【PM 이 센 15종과 정확히 일치 — 전부 노출 0 · 코드 참조 0】 실측 2026-08-10 15:56 KST: 받침 어휘 품목 23건 중 8건만 노출(발통세트 3카테고리·SI-AL600a 2·SI-AL700a 2·SI-AL600A 1·방진가대S2소/중/대 각 1·GHP방진가대 1)이고, 나머지 **15건은 product_category NULL · usage_scope='NONE' · exposure 0건**: 00016 원터치형 베란다 실외기 받침대 / 00019 설치대 2단 발코니 받침대 / 00020 수냉식 방진프레임 / 01008 방진가대 볼트 / AAAA-00013 받침대 / AAAA-00034 실외기받침대 / AAAA-00035 실외기실내받침대 / AAAA-00036 2단 받침대 / SZL-00014 방진가대(평치형) / ZENG-00021 실내기 받침대 / ZENG-00023 중대형 실내기받침대 / 방진가대대 / 방진가대소 / 수냉식방진가대(수냉식 방진프레임(소)) / 전면토출방진가대.
- 【코드 참조 grep 전수 결과(clients·services·tools)】 15종 중 실제 참조 0건. 히트가 난 것은 전부 무관: `방진가대소`·`방진가대대` 는 **주석**뿐(clients/web/order-app/index.html:2527·2541, tools/legacy-gas/거래처 발송 주문서/index.html:2276·2290) · `AAAA-00034` 는 이카운트 임포트 **테스트 픽스처 한 줄**(services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java:159) · `00016`·`00019`·`01008`·`00020` 은 UUID·다른 코드의 부분문자열 오탐(예: V16 마이그레이션의 '…-000000001008'). ⟹ 견적·주문 어느 경로로도 도달하지 않는다.
- 【실내기용 받침대가 섞여 있다는 지적도 확인】 ZENG-00021 '실내기 받침대' · ZENG-00023 '중대형 실내기받침대' · AAAA-00035 '실외기실내받침대' — 셋 다 노출 0건이라 현재는 무해하지만, 상업 자동 리셋·자동 제외 정규식이 `/방진가대|받침대|발통세트|일자발|SI-AL/i`(estimate, index.ejs:8410·8529 등 10곳)로 **'받침대' 를 부분문자열로 잡으므로**, 이들이 COMMERCIAL_MULTI 에 노출되는 순간 자동 0 리셋 대상으로 끌려 들어간다. order 계열은 같은 자리가 `/방진가대|받침대|발통세트|si-al600a|si-al700a/i`(index.html:5691 등)라 '일자발'·'SI-AL' 광역 매치가 없다.
- 【노출돼 있는데 어떤 선택 로직도 참조하지 않는 것 — '15종' 과 별개의 unmapped 4건】 ①**상업 발통세트**(COMMERCIAL_MULTI display_order 339): chooseBaseModel 에 이 코드를 내는 분기가 한 줄도 없다 → 100% 수동. ②**싱글 SI-AL600a**(SINGLE_SET 285): SS_FOOT_FLAT_ID 가 /SI-AL700a/ 로만 매치하므로 파생 대상이 아니고, order 에서는 여기에 수량을 넣으면 그 수량이 **원형발통 수량으로 다시 합산**된다(받침이 받침을 부름, index.html:5169-5180). ③**홈 SI-AL600A**(HOME_MULTI 115): FOOT_FLAT 이 dead 라 자동 0 리셋도 자동 채움도 없는 완전 수동 행이면서, 동시에 이름이 '실외기 일자발' 이라 홈 발통 분모(/실외기/)에 자기 자신이 들어간다. ④**MDP-M075SGK1D**(DUCT 드레인펌프 중정압, 상업 노출 298): PUMP_MAP 에 없어 자동 대응 없음.
- 【FOOT 은 스키마·UI 에만 있고 데이터가 0】 bundle_component CHECK 와 ComponentKind, 데스크톱 라벨('받침대'), 시트 sync 의 '발통'→FOOT 분기까지 다 있으나 실측 component_kind='FOOT' **0행**(전체 1,584행: OUTDOOR 408·REMOTE 315·MATERIAL 273·INDOOR 271·PANEL 250·ACCESSORY 67, 2026-08-10 15:56 KST). 구성품 코드에 SI-AL·발통·방진·받침이 든 행도 0건 ⟹ BundleExpander 의 받침 제외 분기는 현재 한 번도 발화하지 않는다(표본 0 = 판정 불가, 결함 0 아님).
- 【SI-AL600A ≠ SI-AL600a — 별개 두 품목】 대문자 A = '실외기 일자발', product_category=HOME_MULTI, 노출 HOME_MULTI 1건 / 소문자 a = '실외기 일자발 (전면 4~6HP)', product_category=SINGLE_SET, 노출 COMMERCIAL_MULTI+SINGLE_SET 2건. 코드의 정규식은 대소문자 무시(/i)라 문자열로는 구분하지 못한다. 반면 `발통세트` 는 **한 품목이 3카테고리에 노출**된 같은 행이라 카테고리별로 세면 3개로 보인다.

## 앱 간 드리프트

- 【먼저 — 가짜 충돌이 아님을 확인한 것】 받침 선택의 본체 `chooseBaseModel` 은 estimate(index.ejs:4149-4193)와 order(index.html:2503-2547)를 **같은 함수 구간으로 잘라 diff** 한 결과 차이가 주석 3줄(`// S2 소` ↔ `/* 방진가대소 */` 등)뿐이고 조건·리터럴·순서가 전부 동일합니다. 받침 매핑 자체에는 앱 간 충돌이 없습니다.
- 【드리프트 ① · 🚩현행 앱에서 새로 생긴 것 — isCommOutdoorRow】 estimate(index.ejs:4050-4053)는 `m.startsWith('AM') && m.length>=7 && m.charAt(6)==='X'` 모델코드 판별이고, **레거시 두 본(tools/legacy-gas/종합견적서/index.html:3634-3637 · tools/legacy-gas/거래처 발송 주문서/index.html:2153-2156)도 글자까지 같은 이 판별**입니다. 그런데 order(index.html:2395-2407)만 catL 기반(분기관 제외 → catL==='실외기' → /^AM/+품명'실외기' → /dvm|프라임|표준형|한랭지|상부토출/)으로 **바뀌어 있습니다** — 레거시 계승이 아닌 포팅 단계의 변경입니다. 실측 영향(2026-08-10 15:59 KST, 노출 상업 416행 대상): estimate 판별 177행 ↔ order 판별 189행, 불일치 30행 = **estimate 만 실외기로 보는 9행 = GHP 가스히트펌프 전 계열**(AM160NXGGBH1·AM200NXGGBH1·AM250NXGGBH1·AM300JXGGBH1·AM320NXGGBH1·AM360NXGGBH1S·AM400NXGGBH1S·AM450NXGGBH1S·AM500NXGGBH1S, 전부 cat_l='부자재') + **order 만 실외기로 보는 21행**(AF-R09A·AF-R12A 'ECO 리뉴얼 필터'(cat_l='실외기') + DVM_S 실내기 19행). 받침 실효: GHP 9행이 order 에서는 chooseBaseModel 을 아예 타지 않아 **GHP방진가대·ACL-KORGHP07 이 나오지 않고**, 추가된 21행은 계열 키워드가 없어 받침 0(무해)입니다.
- 【드리프트 ② · 레거시 계승 — 세트 판별식】 estimate/종합견적서는 `String(r.unit).toUpperCase()==='SET'` 만(index.ejs:8486 / 종합견적서 index.html:8045), order/거래처발송은 `|| /\(.*\+.*\)/.test(nm)` 를 더합니다(index.html:5786 / 거래처발송 index.html:5239). 실측: products.unit 은 전 3,061행 'EA'(2026-08-10 15:57 KST)이고 CatalogRow 가 p.getUnit() 을 그대로 실으므로 **estimate 는 세트 전개 경로가 죽어 있고**(품명에 '(10HP+16HP)' 형태가 든 상업 실외기 84건을 통짜로 평가), order 는 조각 분해합니다. 결과 예: 42HP (10HP+12HP+20HP) 1대 → order {S2소 2, S2중 1}+분기관, estimate {S2중 1}+분기관 0. 덧붙여 **estimate 는 상업에서 AXJ-TA3419M 을 절대 발행하지 않습니다**(branchCnt 증가가 SET 블록 내부에만 있음, index.ejs:8496·8505).
- 【드리프트 ③ · 레거시 계승 + 데이터 미승계가 겹침 — 싱글 발통 게이트】 estimate(index.ejs:7980-7993)에는 order 에 없는 게이트가 둘 더 있습니다: catL 이 '부자재'·'실외기 받침'·'자재' 면 제외, unit 이 'SET'/'식' 이 아니면 제외(이름 제외도 /운임|절삭|비용|설치비/ vs /운임|절삭/). 두 판본 모두 자기 레거시(종합견적서 :7547-7560 ↔ 거래처발송 :4770-4771)를 정확히 계승했습니다. 🚨그런데 실 데이터의 unit 이 전부 'EA' 이므로 **견적앱의 '실외기 받침대 포함' 은 현재 한 건도 만들지 못하고(round=flat=0), 주문앱은 정상 동작**합니다 — 같은 조작에 두 앱의 출력이 갈립니다. catL 게이트의 실 도달 범위는 SINGLE_SET 노출 288행 중 부자재·받침 계열 15행에서 skip 2행을 뺀 13행입니다.
- 【드리프트 ④ · 레거시 계승 — 홈 재계산 트리거】 estimate `if(/(일자발|발통)/i.test(nm)) return false;`(index.ejs:8040, 종합견적서 :7607) ↔ order `if(/(실외기\s*받침대)/i.test(nm)) return false; … if(/(실외기)/i.test(nm)) return true;`(index.html:5217-5219, 거래처발송 :4809). 홈 카탈로그에 품명 '실외기 받침대' 인 행이 0건이라 order 의 배제 가드는 죽은 가드이고, '실외기 일자발'(SI-AL600A)이 **실외기 트리거로 참**이 됩니다. 두 앱 다 발통 분모(/실외기/)에는 SI-AL600A 가 들어가므로(양쪽 동일), 발통포함이 켜진 상태에서 홈 일자발 수량 N 을 넣으면 원형발통 세트가 N 만큼 부풀어나는 것은 공통이고, **그것이 즉시 반영되는지(order) 나중 트리거에서 반영되는지(estimate)** 만 다릅니다.
- 【드리프트 ⑤ · 레거시 계승 — GHP·프레스티지 계열 가시성】 estimate 계열에는 `#comm_ext_out`('실외기확장') 토글이 있어 체크하면 GHP·프레스티지·동시냉난방·공장전원 실외기가 표에 나타나고 받침 파생이 발화합니다(index.ejs:6643·6751, 종합견적서 :6205·6319). order 계열에는 이 토글이 없고 같은 계열을 **무조건 렌더에서 제외**합니다(index.html:4414, 거래처발송 :4146). 드리프트 ①과 겹쳐 **order 에서 GHP 받침은 이중으로 도달 불가**입니다.
- 【드리프트 ⑥ · 현행 앱에서 새로 생긴 것 — 카탈로그 누락 시 동작】 레거시 두 본은 `const row = COMMULTI.find(x=>x.model===m); if(!row) return;` 로 조용히 건너뜁니다(거래처발송 :5252). estimate 는 `requireCommCatalogRow_` 가 **['AR-EH05','방진가대S2중'] 두 코드에만 throw**(index.ejs:8391-8399, 왜 이 둘인지 코드·주석에 근거 없음 — 못 찾음)하고 나머지는 skip, order 는 throw 대신 화면 경고를 모읍니다(index.html:5688-5708·renderCommCatalogWarnings). 즉 같은 카탈로그 사고에 견적은 계산 중단, 주문은 경고 표시로 갈립니다. 홈·싱글도 같은 비대칭 — order 만 setHomeDerivedQty_/setSingleDerivedQty_ 로 fallback+경고를 갖습니다(index.html:5568-5574·5584-5590).
- 【드리프트 ⑦ · 수동 잠금 적용 지점】 estimate 는 집계 루프에서 `if(!COMM_MANUAL_BASE.has(m))` 로 잠긴 모델을 아예 더하지 않고(index.ejs:8489·8501), order 는 집계에서 잠금을 보지 않고 **반영 단계**에서 `if(isCommDerivedRow(row) && isManualQtyLocked('commercial',m)) return;` 로 거릅니다(index.html:5869-5872). 그 과정에서 order 집계 루프의 `const isBase = /방진가대|…/…`(index.html:5798-5800·5813-5815)는 계산만 되고 **한 번도 쓰이지 않는 죽은 변수**입니다(레거시 거래처발송 :5253-5255 에서는 실제 조건으로 쓰였습니다).
- 【드리프트 ⑧ · order 전용 함수】 clearManualQtyLocks 의 owns() 는 order 에만 있고(index.html:2302-2333) home_foot 은 **이름만**(`/발통|받침대|실외기\s*받침대/i.test(row?.name)`) 보므로 '실외기 일자발'(SI-AL600A)의 잠금이 풀리지 않으며, single 스코프 분기가 없어 #ss_base 변경 시 `clearManualQtyLocks('single')` 가 **싱글 잠금 전체**를 지웁니다(index.html:5144·9449).
- 【드리프트가 아닌 것 — 참고】 홈 발통 규칙 본문, 싱글 AP230/AP290 분기, 실링 펌프 규칙, 받침 표시 분류(홈 '실외기 받침대'/원형발통·일자발, 상업 '부자재/받침대'), 정렬 순위, BO CSV 제외 키워드(['유연호스','발통','일자발','방진가대'])는 두 앱이 동일합니다. 또 estimate·order 와 **거래처발송 legacy** 셋이 isCoolTop 30HP 경계에서 동일하고 **종합견적서 legacy 만 구판**(중에 30 없음 / 대에 30 있음, tools/legacy-gas/종합견적서/index.html:3768·3774)이라, 이것은 앱 간 드리프트가 아니라 **레거시 판본 간 차이**입니다 — 어느 쪽을 정본으로 볼지는 업무 결정 사항입니다.

## 현 스키마로 표현 가능한가

【결론】 **부분적으로만 표현 가능합니다.** 상업멀티의 계열×HP 격자(16분기)와 GHP 2품목 동시 부착, 세트 조각 배수까지는 현 스키마로 표현할 수 있지만, 홈·싱글의 '여집합(전부 minus 예외)' 의미와 앱별 분기·수동잠금·트리거는 표현할 수 없습니다.

【표현 가능한 것】 스키마 실측(2026-08-10 16:00 KST, product_db): quantity_sync_rule(rule_key, estimate_category, name, enabled, aggregation, condition_json, inactive_behavior, conflict_policy, priority, legacy_ref) + quantity_sync_source(source_product_id, factor) + quantity_sync_target(target_product_id, multiplier, rounding_mode, display_order).
① 상업 16분기 → target 7종별로 rule 을 만들고 source 에 해당 실외기 product_id 를 열거(factor 1). 계열·HP 판별은 **정적 함수**라 사전 계산이 가능합니다.
② 세트 조각 배수(AM420AXVUHH1SY 1대 → S2소 2 + S2중 1)는 factor 가 (rule, source) 쌍마다 붙으므로 `S2소 rule 의 그 source factor=2`, `S2중 rule 의 그 source factor=1` 로 **표현 가능**합니다.
③ GHP → GHP방진가대 + ACL-KORGHP07 동시 부착은 rule 1개 + target 2행(multiplier 각 1)으로 표현 가능합니다.
④ 옵션 게이트는 condition_json 으로 표현 가능합니다 — 허용 연산자는 optionEquals·optionIn·all·any·not 이고 값은 [key, scalar] 쌍입니다(QuantitySyncRuleValidator.java:32-33·506-532). `{"optionEquals":["home_foot",true]}` + inactive_behavior='ZERO' 로 '발통포함 해제 시 0' 이 성립하고, 상업의 '받침대 제외' 는 `{"not":{"optionEquals":["comm_ex_base",true]}}` 로 표현 가능합니다.
⑤ 집계는 전부 단순 합이라 aggregation='SUM'(CHECK 상 SUM 만 허용) 로 충분하고, 반올림도 필요 없어 rounding_mode='NONE' 으로 족합니다. 같은 target 에 여러 계열이 들어가는 것은 rule 을 나누고 conflict_policy='ADD' 로 합산하면 됩니다.

【표현 불가 — 무엇이 부족한가】
1. **카테고리 어휘 자체가 안 맞습니다.** chk_qsr_category = {'HOME_MULTI','SINGLE_SET','COMM_MULTI'} 인데 노출 테이블은 chk_pee_category = {'HOME_MULTI','SINGLE_SET','COMMERCIAL_MULTI','LEGACY','OTHER'} 입니다 — 상업 문자열이 다르고(COMM_MULTI ↔ COMMERCIAL_MULTI), LEGACY·OTHER 는 rule 로 만들 수 없습니다(오늘은 구형·기타에 받침 로직이 없어 손실 0이지만, 스키마가 그 축을 닫아 두고 있다는 사실은 남습니다).
2. **source 가 product_id 화이트리스트뿐이라 '여집합' 의미가 반전됩니다.** 홈 발통의 분모는 `/실외기/i` 이름 매치, 싱글 발통의 분모는 '전 세트 minus 예외' 입니다. 스키마로 옮기면 홈은 10행, 싱글은 최대 ~270행을 일일이 열거해야 하고, **시트에 새 실외기가 추가되면 legacy 는 자동 포함, rule 은 조용히 제외**됩니다(200 OK 로 수량 0 — 오류가 아니라 누락). 이름 정규식을 담을 컬럼(source_match_pattern 류)이 없습니다.
3. **factor·multiplier 가 0 을 가질 수 없습니다.** CHECK 는 `factor > 0 AND factor <= 1000`, `multiplier > 0 AND multiplier <= 1000` 입니다. '항상 0'(FOOT_FLAT 리셋)·'매 재계산 시작 시 받침 계열 seed 0'·음수(절삭) 같은 현 동작은 rule 로 못 씁니다 — inactive_behavior='ZERO' 로 우회되는 경우만 부분 대체됩니다.
4. **앱 축이 없습니다.** rule 에는 usage_scope/app 컬럼이 없는데, 위 드리프트 ①~⑧ 처럼 estimate 와 order 가 **실제로 다른 답을 내고 있습니다**(세트 전개 유무, 싱글 unit·catL 게이트, GHP 도달성). 한 rule 세트로 옮기려면 먼저 "정본이 어느 쪽인가" 를 업무 결정으로 확정해야 하며, 결정 없이 이행하면 한쪽 앱의 현 동작이 소리 없이 바뀝니다.
5. **수동 잠금과 트리거를 담을 자리가 없습니다.** HOME_MANUAL_FOOT / COMM_MANUAL_BASE / MANUAL_QTY_LOCKS(사용자가 직접 입력한 받침 행은 자동계산에서 제외)와 isHomeCalcTriggerModel/isCommDerivedRow(어떤 행 변경이 재계산을 부르는가)는 컬럼이 없습니다. 클라이언트 상호작용 계약이라 rule 밖으로 둘 수도 있으나, 그러면 rule 과 클라이언트 잠금이 **두 개의 진실원**이 됩니다.
6. **런타임 파싱이 사전 계산으로 굳습니다.** 현 로직은 품명 문자열을 실행 시점에 파싱합니다(hasExactHP·parseSetHPs·countBranchForSet). rule 로 옮기면 계수가 고정되므로 시트 품명이 바뀌어도 자동 추종하지 않습니다. 부수 효과로 알려진 결함이 함께 굳습니다 — AM280AXVSHH1SY 'DVM S2 고효율한랭지 28HP (08HP+20HP)' 의 **'08HP' 조각은 `(^|[^0-9.])${hp}HP` 정규식에 걸리지 않아 받침이 붙지 않습니다**(선행 0 사각).
7. **실행 엔진이 없습니다.** 현재 quantity_sync_rule 은 **0행**(2026-08-10 15:56 KST)이고, 클라이언트 브리지는 rule_key 'SINGLE_S03_CEILING_DRAIN_PUMP' 하나만, estimateCategory==='SINGLE_SET'·aggregation==='SUM'·inactive_behavior==='ZERO' 만 받는 shadow 관측 전용입니다(clients/web/order-app/src/quantitySync.ts:110-125). 게다가 validator 에는 S-03 전용 하드코딩 검증(계수 1 강제, QuantitySyncRuleValidator.java:484-503)이 있어, 받침 rule 을 넣으려면 evaluator 와 검증 계약을 함께 확장해야 합니다.
8. **받침 전용 룩업 테이블은 없습니다.** product_db 에 branch_pipe_lookup·odu_recommendation_lookup(32행, 실내기→실외기 HP 추천)은 있으나 실외기→받침 룩업은 없고, 구글 시트에도 그 컬럼이 없습니다(품목 탭은 품명·모델코드·출고가·납품가 4개 고정 인덱스, 구성품 탭은 '싱글 구성품'·'상업멀티 구성' 둘뿐이며 **홈멀티는 구성품 탭 자체가 없습니다** — ProductSheetSyncService.java:109-128·137-139).

【권고 형태】 상업멀티만 먼저 rule 로 옮기는 것이 가장 적합합니다(정적 격자·enumerable·SUM·factor 로 전부 표현 가능). 홈·싱글은 여집합 의미와 앱 드리프트를 먼저 업무 결정으로 닫지 않으면 rule 화가 조용한 누락을 만듭니다.

【조각 간 어긋남 — 임의 선택하지 않고 그대로 보고】 ①상업 실외기 건수 '177(E-상업)' ↔ '170(O-상업)' 은 **둘 다 맞습니다** — 각자 자기 앱의 isCommOutdoorRow 로 셌고, 제가 같은 SQL 에서 estimate 판별 177 · catL='실외기' 170 · order 판별 189 를 동시에 재현했습니다(2026-08-10 15:59~16:03 KST). ②PM 브리핑의 상업 부자재 목록('방진가대S2대·GHP방진가대')은 실측과 다릅니다 — **방진가대S2소·중도 COMMERCIAL_MULTI 에 노출**돼 있습니다(display_order 334·335). ③'SI-AL700a 는 HOME_MULTI 노출 없음' 은 맞지만 SINGLE_SET·COMMERCIAL_MULTI 에는 각 1건 있습니다. ④X-구형기타 조각이 '홈 트리거 차이는 이식 결함이 아니라 레거시 계승' 이라 한 것은 제가 네 파일을 대조해 확인했고, 반대로 **isCommOutdoorRow 는 레거시 계승이 아니라 order-app 에서 바뀐 것**임을 확인했습니다(드리프트 ①).


---

## 적대검증


### 적대검증 — 개발책임자의 "레거시 코드에 실외기별 받침 선택 로직이 있을 것" 명제의 실재 여부를 병합 결과에 의존하지 않고 원문·DB로 직접 재현 검증. (a) 대응이 있다는 주장은 원문을 열어 분기 실재 확인, (b) 대응이 없다는 주장(부재 주장)은 직접 grep 스윕으로 반증 시도, (c) 앞 조사가 놓친 파일 탐색, (d) 모든 DB 수치를 product_estimate_exposure M:N 조인으로 재측정.

**판정** — 병합 결과의 **중심 결론은 CONFIRMED 이며, 개발책임자의 지적이 옳았음이 코드로 확인됩니다.** "어느 실외기가 어느 받침을 쓰는가"를 정하는 로직은 실재하고 그 이름은 `chooseBaseModel(nm)` 입니다(index.ejs:4150-4193 외 3본). 계열 7종 × 정확 HP 토큰의 2축 격자로 계열마다 경계가 실제로 다르며(14HP·30HP 경계 상이, 한랭지·extra 는 '대' 분기 부재), 앞 조사의 "실외기 이름 정규식 합산" 관점은 홈멀티에만 우연히 맞고 상업멀티에는 전면 오답이었습니다. 저는 이를 병합 결과에 의존하지 않고 4개 파일 원문 + 실제 `diff` + 정규식 직접 실행 + DB 재측정으로 독립 재현했습니다. 특히 브리핑이 경계한 "가짜 앱 간 충돌" 오류는 없습니다 — 같은 함수끼리 자른 diff 가 **주석 3줄 차이**임을 실증했습니다.

**다만 병합 결과를 그대로 정본으로 채택하면 안 됩니다. 증거 무결성 오류 3건을 먼저 정정하십시오** (도달성 결함이 아니어도 정정 대상이라는 워크플로 규칙에 해당): ① LEGACY 노출은 **40 이 아니라 42**이고 분류 내역(실외기 14·실내기 16·판넬 8·운임 2)이 실측(부자재 21·실내기 12·판넬 8·실외기 1)과 판넬만 빼고 전부 다릅니다 — `products` 에 07-30 이후 신규 행이 없으므로 **라운드 간 변동이 아니라 집계 오류**입니다. ② `products` 총계는 **3,061 이 아니라 3,063**(단 `distinct unit = {'EA'}` 는 참이라 그 위의 결론은 유지). ③ `cat_l` 을 products 컬럼처럼 인용했으나 실제는 `cat_l_id` → `classification` FK 로, 적힌 SQL 은 그대로 실행하면 에러가 납니다. 또한 모든 쿼리에 붙은 `status NOT IN (...)` 필터는 전 행 ACTIVE 라 **무의미**하므로 "활성 노출"이라는 수식은 아무것도 보장하지 않습니다. 부수적으로 `chooseBaseModel` 좌표가 한 줄씩 앞을 가리킵니다(주석 줄; 함수는 4150·2504).

**앞 조사와 병합 결과가 함께 놓친 파일이 있습니다**: `clients/web/legacy-quantity-golden/`. `legacyQuantityBoundary.js` 는 다섯 번째 복사본이 아니라 앱 원문에서 `chooseBaseModel` 소스를 런타임 추출해 돌리는 골든 하네스이고, `goldens.js` 가 `방진가대S2소`·`GHP방진가대+ACL-KORGHP07`·`발통세트` 결과를 이미 고정하고 있습니다. 이는 schemaFit 판단에 직접 영향을 주는 자산인데(규칙 테이블 이행 시 회귀 울타리가 이미 있음) 병합 결과가 계산에 넣지 않았습니다 — 다만 커버리지는 상업 16분기 중 3케이스로 얇아 그대로는 이행 안전망이 되지 못합니다.

**부재 주장도 확인된 부재입니다**(못 찾음 아님): 홈멀티는 `/실외기/i` 이름 합 하나뿐이고, 싱글은 모델코드 리터럴 2건(AP230/AP290)만, 구형은 노출 42건 중 받침 어휘 **0건**입니다. 데이터 측 표현 수단도 실제로 없습니다 — `matchKind` 는 `'발통'` 문자열만 FOOT 으로 보내고('받침'·'방진가대'·'일자발'·'SI-AL' 은 불가), 홈멀티는 구성품 탭 자체가 없습니다.

**도달 가능한 결함 3건은 실재가 확인되어 별도 트랙으로 올릴 가치가 있습니다**: (1) 견적앱 '실외기 받침대 포함' 이 `unit='EA'` 게이트(index.ejs:7993)에 막혀 **발통 0개** — 주문앱과 같은 조작에 다른 출력, (2) order-app 의 `isCommOutdoorRow` 변경으로 **GHP 9행의 받침·저감장치가 도달 불가**(estimate·legacy 2본은 동일 판별식인데 order 만 포팅 중 변경), (3) `AM280AXVSHH1SY (08HP+20HP)` 의 **선행 0 토큰이 받침을 못 받음**(정규식 직접 실행으로 재현). 스키마 이행 판단은 병합 결과 권고대로 **상업멀티 우선**이 타당하나(제약 전건 실측 확인: `COMM_MULTI`≠`COMMERCIAL_MULTI`, `factor>0` 이라 0 표현 불가, SUM 전용), 홈·싱글은 여집합 의미와 위 앱 드리프트를 **업무 결정으로 먼저 닫지 않으면 조용한 누락**을 만듭니다. 끝으로 mappingTable 약 30행 전부를 개별 재현하지는 않았으니 미검증 지엽(PUMP_MAP 22종·레거시 인식기 세부 등)을 "검증됨"으로 집계하지 마십시오.

- 【핵심 답 — 개발책임자가 옳습니다. 로직은 실재합니다】 `chooseBaseModel(nm)` 이 그 로직이고, 실외기 **품명 계열 7종 × 정확 HP 토큰**의 2축 격자로 받침을 가릅니다. 제가 4개 파일 원문을 직접 열어 확인: clients/web/estimate-app/views/index.ejs:4150-4193 · clients/web/order-app/index.html:2504-2547 · tools/legacy-gas/종합견적서/index.html:3734-3777 · tools/legacy-gas/거래처 발송 주문서/index.html:2253-2296. 계열별로 경계가 실제로 다릅니다 — 14HP 는 표준형·상부토출에서 '소'인데 프라임·한랭지·extra 에서는 '중'이고, **한랭지와 extra 에는 '대' 분기가 아예 없습니다**(index.ejs:4188-4190 에 isPrime·isStd·isCoolTop 세 줄뿐). 앞 조사의 '실외기 이름 정규식 합산' 관점은 홈멀티에만 우연히 맞고 상업멀티에는 전면 오답입니다.
- 【가짜 충돌이 아님을 실제 diff 로 검증】 브리핑이 경계한 '서로 다른 함수를 비교해 앱 간 충돌을 잘못 내는' 오류를 피하려고, 같은 함수 구간을 잘라 `diff` 를 직접 돌렸습니다. estimate(4150-4193) ↔ order(2504-2547) = **차이 3줄, 전부 주석**(`// S2 소` ↔ `/* 방진가대소 */`). order ↔ 거래처발송 legacy = **공백 정렬만**. 병합 결과의 '받침 매핑 자체에는 앱 간 충돌 없음' 은 CONFIRMED.
- 【단 estimate ↔ 종합견적서 legacy 에는 실제 로직 차이 2줄이 있습니다 — 병합 결과 주장 CONFIRMED】 `isCoolTop` 의 30HP 경계: 현행 3본은 '중'에 `'30'` 포함·'대'는 `['32','34']` / 종합견적서 legacy 는 '중'에 30 없음·'대'가 `['30','32','34']`(tools/legacy-gas/종합견적서/index.html:3768·3774). 즉 30HP 냉방전용 상부토출 1대의 받침이 구판 '대' ↔ 현행 '중' 으로 갈립니다. 이는 앱 간 드리프트가 아니라 **레거시 판본 간 차이**이며 어느 쪽이 정본인지는 업무 결정 사항입니다.
- 【부재 주장도 직접 반증 시도 후 확인 — 홈멀티에는 실외기별 분기가 없습니다】 `받침|방진|발통|일자발|베란다|2단|평치형|SI-AL|ADP-` 를 clients·services·tools 전체에 돌려 파일별 히트를 셌고, 상위 파일을 전부 열었습니다. 홈 로직은 `recomputeFootAll()`(index.ejs:7958-7968) 하나뿐이고 `HOMEMULTI.reduce((t,r)=>t+(/실외기/i.test(r?.name)?...))` 로 **모델·용량·계열 분기 없는 단순 이름 합**입니다. 싱글은 모델코드 리터럴 2건(`/^(AP230DAPDHH1S|AP290DAPDHH1S)$/i`, index.ejs:7996-8001)만 일자발로 가르고 나머지 전부 원형발통 — 이것이 싱글에서 유일한 '모델→받침 종류' 대응입니다. 구형(LEGACY)은 로직도 품목도 0(아래 실측). 부재는 '못 찾음'이 아니라 **확인된 부재**입니다.
- 【DB 실측 — 병합 결과 수치 대부분 재현됨 (2026-08-10 16:14~16:18 KST, product_estimate_exposure M:N 조인)】 노출 총계 COMMERCIAL_MULTI **416** ✅ · HOME_MULTI **119** ✅ · SINGLE_SET **288** ✅ / 받침 계열 노출 **12행(상업 7·홈 2·싱글 3)** ✅ 품목까지 일치 / `quantity_sync_rule` **0행** ✅ / `bundle_component` 총 **1,584행 중 FOOT 0행** ✅ / `products.unit` **distinct 1개 = 'EA'** ✅. 즉 받침 대응은 100% 프런트 JS 리터럴이고 DB 규칙 엔진·세트 구성품 어느 쪽에도 실체가 없다는 결론은 CONFIRMED.
- 【🚩증거 무결성 오류 ① — LEGACY 노출은 40 이 아니라 42 입니다】 병합 결과: *"estimate_category='LEGACY' 활성 노출 40건(실외기 14·실내기 16·판넬 8·운임/절삭 2)"*. 제 실측(16:16 KST): **42건**이고 분류 조인 결과는 **부자재 21·실내기 12·판넬 8·실외기 1**. 판넬 8 만 일치하고 나머지 축이 전부 다릅니다. 🔑중요: `products` 는 **2026-07-30 이후 신규 생성 0건**(created_at 시간대 집계 확인)이므로 이것은 라운드 간 데이터 변동이 아니라 **집계 오류**입니다. 다만 실질 결론은 살아남습니다 — LEGACY 노출 42건 중 받침 어휘(받침|방진|발통|일자발|베란다|평치형 또는 model_code SI-AL|ADP-) 매치는 제가 따로 세어 **0건**으로 확인했습니다.
- 【🚩증거 무결성 오류 ② — products 총계는 3,061 이 아니라 3,063】 병합 결과가 드리프트 ②③의 근거로 반복 인용한 *"전 3,061행이 'EA'"* 는 행수가 틀렸습니다. 실측 **3,063행**, 단 `distinct unit = {'EA'}` 이므로 **'전부 EA' 라는 load-bearing 명제 자체는 CONFIRMED** 이고 그 위에 선 결론은 무너지지 않습니다. 덧붙여 병합 결과가 모든 쿼리에 붙인 `p.status NOT IN ('DISCONTINUED','NOT_FOR_SALE')` 는 **무의미한 필터**입니다 — 3,063행이 전부 ACTIVE 라 '활성' 이라는 수식이 아무것도 걸러내지 않습니다.
- 【🚩증거 무결성 오류 ③ — `cat_l` 은 products 의 컬럼이 아닙니다】 병합 결과는 *"전부 cat_l='부자재'"*, *"AF-R09A·AF-R12A(cat_l='실외기')"*, *"catL='실외기' 170"* 을 SQL 실측처럼 제시하지만, `products` 에 `cat_l` 컬럼은 없고(`\d products` 확인) 실제로는 `cat_l_id` → `classification` FK 입니다. 제가 쓴 `p.cat_l` 쿼리는 `ERROR: column p.cat_l does not exist` 로 실패했고, `LEFT JOIN classification c ON c.id=p.cat_l_id` 로 바꿔야 재현됩니다. **라벨 값 자체는 조인 후 재현되므로 날조는 아니나, 적힌 그대로는 실행되지 않습니다.**
- 【드리프트 ① 정밀 CONFIRMED — order-app 만 레거시에서 바뀌었고 GHP 받침이 도달 불가】 estimate(index.ejs:4050-4053)와 **거래처발송 legacy(index.html:2153-2156)가 글자까지 같은** 모델코드 판별(`AM` + len≥7 + 7번째 문자 `X`)인데, order(index.html:2395-2407)만 catL 기반으로 **포팅 중 변경**됐습니다. 실측(16:16 KST): 상업 노출 중 가스히트펌프 **정확히 9행**(AM160/200/250/320/360S/400S/450S/500S NXGGBH1 + AM300JXGGBH1), **전부 cat_l='부자재'**, estimate 판별식 **전부 true**. order 판별식을 손으로 추적하면 catL≠'실외기' · 품명에 '실외기' 없음 · `/dvm|프라임|표준형|한랭지|상부토출/` 무매치 → **전부 false**. ⟹ order 에서 `GHP방진가대`·`ACL-KORGHP07` 이 발행되지 않습니다.
- 【드리프트 ③ CONFIRMED — 견적앱의 '실외기 받침대 포함' 은 현재 데이터에서 발통 0개를 만듭니다(도달 가능 결함)】 코드 경로를 끝까지 추적했습니다: estimate `recomputeSingleBaseFoot` 에 `if (unit !== 'SET' && unit !== '식') return;`(index.ejs:7993) 이 있고 → `SINGLE_SETS` 는 db-catalog.js `singleSets()` 의 `unit: r.unit || 'SET'`(:111) → `r.unit` 은 API `CatalogRow` 의 `p.getUnit()`(EstimateCatalogInternalController.java:262) → DB 는 전 행 'EA'. **'EA' 는 truthy 라 'SET' fallback 이 적용되지 않고** 게이트가 모든 싱글 세트를 걸러 round=flat=0. 반면 order(index.html:5168-5183)에는 이 게이트도 catL 게이트도 없어 정상 동작합니다. 같은 사용자 조작에 두 앱 출력이 갈립니다.
- 【구체 결함 CONFIRMED — 선행 0 HP 토큰이 받침을 못 받습니다】 병합 결과의 주장을 정규식을 **직접 실행해** 재현했습니다. `AM280AXVSHH1SY 'DVM S2 고효율한랭지 28HP (08HP+20HP)'`(상업 노출에 정확히 1건 실재, 16:18 KST) → `parseSetHPs` → `['08','20']` → 조각 '08' 은 `(^|[^0-9.])8HP([^0-9.]|$)` 에 **매치 0**(앞 문자가 '0' 이라 숫자), 조각 '20' 만 방진가대S2중 1개. ⟹ 받침이 1개 덜 붙습니다(세트를 전개하는 order-app 한정).
- 【🚩앞 조사도 병합 결과도 놓친 파일 — `clients/web/legacy-quantity-golden/`】 병합 결과 전체에 이 디렉터리가 한 번도 등장하지 않습니다. `legacyQuantityBoundary.js`(490줄)는 **다섯 번째 복사본이 아니라**, 앱 원문에서 함수 소스를 런타임에 추출해 실행하는 골든 하네스입니다(`extractFunctionSource(source,'chooseBaseModel')`, :337 목록에 `hasExactHP`·`chooseBaseModel` 등재). `goldens.js` 는 받침 결과를 이미 핀으로 고정하고 있습니다 — `C-05 {방진가대S2소:1}` · `C-06 {방진가대S2소:1, AXJ-TA3419M:1}` · `C-08 {GHP방진가대:2, ACL-KORGHP07:2}` · `H-08 {발통세트:2}`(:20·28·29·31). **이것은 schemaFit 판단에 직접 관련됩니다** — 규칙 테이블 이행 시 쓸 회귀 울타리가 이미 존재하는데 병합 결과의 schemaFit 절은 이를 전혀 계산에 넣지 않았습니다. 다만 커버리지는 얇습니다(상업 16분기 중 3케이스).
- 【schemaFit 구조 주장 전건 CONFIRMED — 제약을 직접 조회】 `chk_qsr_category` = **{HOME_MULTI, SINGLE_SET, COMM_MULTI}** ⟹ 노출 테이블의 `COMMERCIAL_MULTI` 와 **문자열이 다르고** LEGACY·OTHER 는 규칙으로 만들 수 없음 ✅ / `chk_qss_factor` = `factor > 0 AND factor <= 1000` ⟹ **0 을 넣을 수 없어** '항상 0'·seed 0 동작 표현 불가 ✅ / `chk_qst_multiplier` 동일 ✅ / `chk_qsr_aggregation` = SUM 만 ✅ / `chk_qst_rounding_mode` = {NONE, FLOOR} ✅ / `conflict_policy` = {ADD, REPLACE} ✅ / `inactive_behavior` = {ZERO, KEEP} ✅. '상업멀티만 먼저 규칙화, 홈·싱글은 여집합 의미와 앱 드리프트를 업무 결정으로 먼저 닫아야 한다' 는 권고는 근거가 성립합니다.
- 【데이터 표현 수단 부재 CONFIRMED】 `matchKind`(ProductSheetSyncService.java:1092)는 **`s.contains("발통")` 단 하나만** FOOT 으로 보냅니다 — '받침'·'방진가대'·'일자발'·'SI-AL' 은 FOOT 이 되지 못합니다. `isKeepSet`(:1103-1111)에는 발통세트·SI-AL700a 만 있고 **SI-AL600a 는 없습니다**. 구성품 탭 매핑은 `COMPONENT_TAB_MAPPINGS`(:137-139)에 **'싱글 구성품'·'상업멀티 구성' 둘뿐이라 홈멀티는 구성품 탭 자체가 없습니다**. ⟹ '어느 실외기가 어느 받침을 쓰는가' 를 시트/DB 로 표현할 자리가 실제로 없습니다.
- 【PM 카탈로그와의 대조 — 15종 전건 CONFIRMED】 받침 어휘 품목 중 **노출 0건이 정확히 15건**이고 목록이 PM 브리핑과 완전 일치합니다(16:17 KST): 00016·00019·00020·01008·AAAA-00013·AAAA-00034·AAAA-00035·AAAA-00036·SZL-00014·ZENG-00021·ZENG-00023·방진가대대·방진가대소·수냉식방진가대·전면토출방진가대 — 전부 `product_category` NULL · `usage_scope='NONE'`. **실내기용이 섞여 있다**는 지적도 확인됩니다(ZENG-00021 '실내기 받침대' · ZENG-00023 '중대형 실내기받침대' · AAAA-00035 '실외기실내받침대'). 'SI-AL700a 는 HOME_MULTI 노출 없음' 도 확인 — 홈 받침은 `발통세트` 와 `SI-AL600A` 둘뿐입니다.
- 【병합 결과가 앞 조사를 바로잡은 지점 재확인 — 홈 분모 10건 중 1건이 받침 자신】 실측(16:16 KST) HOME_MULTI 에서 품명이 `/실외기/` 인 행은 **정확히 10행**인데 그중 하나가 `SI-AL600A '실외기 일자발'` 로 **받침 자기 자신**입니다(나머지 9 = 단배관 5 + 다배관 4). 또 `FOOT_FLAT`(index.ejs:4523)은 `/SI-AL700a/i` 를 **model** 에서 찾는데 홈 노출에 SI-AL700a 가 없어 `''` 가 되고 :7965 의 `if(FOOT_FLAT && ...)` 는 **영구 미실행(dead)** 입니다. 앞 조사의 '10건 합 ×1' 은 숫자만 맞고 의미가 틀렸다는 지적이 옳습니다. 여기에 게이트 하나가 더 빠져 있었습니다 — `#home_foot` 기본값이 **false**(dc_config_db.estimate_configs `home_with_foot='f'`, `single_with_base='f'`, 16:18 KST 실측)라 기본 상태에서는 발통이 아예 붙지 않습니다.
- 【추가 확인된 세부 — 병합 결과 주장대로임】 `requireCommCatalogRow_` 는 **`['AR-EH05','방진가대S2중']` 두 코드에만 throw**(index.ejs:8393) 하고 나머지는 조용히 skip — 왜 이 둘인지 코드·주석에 근거 없음(저도 못 찾았습니다). '받침대 제외' 정규식은 `/방진가대|받침대|발통세트|일자발|SI-AL/i`(index.ejs:8529)이고 **`ACL-KORGHP07` 은 어느 토큰에도 걸리지 않아** 받침대를 제외해도 0 이 되지 않습니다. `comm_ex_base` 기본값은 코드 리터럴 false(index.ejs:6642)로 관리자 UI 가 없습니다. 상업 `발통세트` 는 노출돼 있으나 `chooseBaseModel` 이 push 하는 분기가 한 줄도 없어 100% 수동입니다.
- 【검증하지 않은 범위 — 정직하게 밝힙니다】 저는 병합 결과 mappingTable 약 30행 전부를 개별 재현하지는 않았고, **구조적 척추와 결과를 가르는 고비용 주장**을 우선 검증했습니다. 미검증으로 남긴 것: PUMP_MAP 상업 실내기 22종 리터럴 전수 · 에어디자이너/제이시스템 Code.js 세부(addBolt dead 주장 포함) · order 집계 루프의 `isBase` 죽은 변수 · `clearManualQtyLocks` owns() 세부 · BundleExpander 의 4:6 재배분 분기. 이들은 결론(로직 실재·홈싱글 부재·스키마 부적합)을 바꾸지 않는 지엽이지만 **'검증됨'으로 집계하지 마십시오**.

### 대조 각도 — 대응표의 모델코드 실 카탈로그 대조 (product_estimate_exposure M:N 조인 · 읽기 전용). ①대응표 전 baseTarget 을 실 DB 와 대조 ②PM 이 센 받침 15종 중 어느 로직도 참조하지 않는 것 전건 ③반대로 코드가 참조하는데 카탈로그에 없는 것. 모든 DB 수치는 2026-08-10 16:10~16:25 KST 실측(samhan-postgres / product_db · dc_config_db), 코드 주장은 파일:줄 원문 확인. 추가로 chooseBaseModel·hasExactHP·parseSetHPs·양 앱 isCommOutdoorRow 원문을 실 카탈로그 408행에 그대로 적용해 재현 검증(scratchpad/sim.js·drift.js).

**판정** — 대응표는 **카탈로그 대조 축에서 통과**입니다 — target 21개·source 28개·기계추출 42개 전건이 실 DB(product_estimate_exposure M:N 조인)에 존재하고 고아 모델코드는 0건이며, 보고서가 검증하지 않았던 modelByNameLike 이름해소 단계까지 7개 키워드 전부 match_count=1 로 무충돌 해소됨을 추가 확인했습니다. PM 이 센 받침 15종은 **전건 코드 참조 0** 이 맞고, 다만 브리핑 전제는 정정이 필요합니다 — 15종은 '카탈로그에 있는데 코드가 안 쓰는 것' 이 아니라 usage_scope='NONE'·노출 0 인 **이중 부재**라 수동 선택조차 불가능하며, 실제로 '노출돼 있는데 write 경로가 없어 수동 입력에 의존하는' 받침은 상업 발통세트(339)·싱글 SI-AL600a(285)·홈 SI-AL600A(115) **3건**입니다. 역방향(코드 참조 ↔ 카탈로그 부재)은 전역 기준 0건이나 **카테고리 스코프 1건 확정** — FOOT_FLAT 이 HOME_MULTI 에서 SI-AL700a 를 찾는데 그 카테고리에는 없어 영구 dead 입니다.

증거 무결성 축에서 **정정 3건**을 보고합니다(도달성과 무관하게 그 라운드에 정정하는 것이 규칙): ①상업 카탈로그 총계는 416 이 아니라 **408** — findExposedCatalog 가 함께 거는 usage_scope 필터를 보고서가 빠뜨렸고 8행(전부 판넬)이 제외됩니다. 받침 결론은 불변 ②LEGACY 내역 '실외기 14·실내기 16·판넬 8·운임/절삭 2' 는 품명 기준(18/12/8/2)으로도 cat_l 기준(부자재 19·실내기 12·판넬 8·실외기 1)으로도 **재현 불가** — 단 핵심 결론인 'LEGACY 받침 0건' 은 40행 전건 확인 결과 참 ③드리프트 ② 예시가 틀림 — AM420AXVHHH1SY 에서 estimate 는 {S2중 1} 이 아니라 **{S2소 1, S2중 1}** 입니다.

추가로 보고서가 **미발견한 사항 1건**을 올립니다: order-app 렌더 필터(index.html:4414)의 `/(GHP|…)/i` 가 GHP 실외기 9행뿐 아니라 **GHP방진가대(340)·ACL-KORGHP07(305) 타깃 행 자체에도 매치**해(총 11행 실측) KIT_WHITELIST 미등재로 화면에서 사라집니다. estimate 는 같은 자리가 `/(가스히트펌프|…)/i` 라 두 행이 남습니다 — order 의 GHP 받침 도달 불가는 보고서가 든 두 축이 아니라 **세 축**이며 수동 입력 경로까지 닫혀 있습니다(단 COMMULTI 재대입이 없어 렌더 한정 효과). 그 밖에 드리프트 ② 를 **84행 중 56행이 갈린다**로 정량화했고, 갈리는 것은 커버리지가 아니라 수량임(타깃별 발화 행 수는 양 앱 동일)을 확정했으며, 소↔중 단가가 동일해 14HP 경계 불일치는 금액 영향이 없고 30HP 상부토출(중↔대, AM300AXVGHC1 실재)만 60,000원을 움직인다는 심각도 재료를 덧붙입니다. 소스·DB 무수정, 읽기 전용으로만 수행했습니다.

- 【①-a 대응표 baseTarget 전건 실재 — 고아 0】 대응표가 target 으로 든 모델코드 21개(SI-AL600a·SI-AL700a·GHP방진가대·ACL-KORGHP07·방진가대S2소/중/대·AXJ-TA3419M·발통세트·AF-R09A·AF-R12A·MDP-Z075SZED·ADP-E075SEK3D·MDP-M075SGK2D·ADP-G075SPK1D·ADP-N047SNK1D·ADP-F075SP·AIM-A01N·AR-EH05·FH-LFHIF·MDP-M075SGK1D)를 `products JOIN product_estimate_exposure`(is_deleted=false · status NOT IN(DISCONTINUED,NOT_FOR_SALE) · usage_scope IN(ESTIMATE,PARTNER_ORDER,BOTH))로 대조한 결과 **21개 전부 실재**, 카탈로그 없음 0건. display_order 도 대응표와 일치(방진가대S2소 334·중 335·대 336·SI-AL600a 337·SI-AL700a 338·발통세트 339·GHP방진가대 340·ACL-KORGHP07 305·AXJ-TA3419M 281·ADP-F075SP 상업302/싱글76). 측정 2026-08-10 16:11:43 KST.
- 【①-b source 측 모델코드도 전건 실재】 PUMP_MAP 22개·RENEW_FILTER_MAP 4개·싱글 일자발 리터럴 2개(AP230DAPDHH1S·AP290DAPDHH1S) 총 28개를 같은 조인으로 대조 — **28개 전부 실재**(AP230=SINGLE_SET:99, AP290=SINGLE_SET:100, RENEW 4종=COMMERCIAL_MULTI:101~104, PUMP 22종=COMMERCIAL_MULTI:196~219). 나아가 index.ejs 파생 로직 구간(4000~8600줄)에서 모델코드 형태 문자열 리터럴을 정규식으로 **기계 추출한 42개 전건**을 대조했고 역시 카탈로그 없음 0건. 측정 2026-08-10 16:15:31·16:17:17 KST.
- 【①-c 이름 기반 해소(modelByNameLike)도 무충돌 — 대응표가 검증하지 않은 단계】 chooseBaseModel 이 내는 것은 모델코드가 아니라 문자열이고 `modelByNameLike(bn) || bn`(index.ejs:4207-4217 / index.html:2561-2571)이 name+disp+model 에 대한 **비앵커·대소문자무시 부분매치**로 COMMULTI 순서 첫 행을 집는다. 실 카탈로그에서 7개 키워드 전부 **match_count=1 · 첫 매치=정확히 그 모델코드**로 해소됨을 확인(오해소·순서의존 없음). 측정 2026-08-10 16:15:06 KST.
- 【②-a PM 15종 — 전건 코드 참조 0 확인】 15종(00016 원터치형 베란다 실외기 받침대 · 00019 설치대 2단 발코니 받침대 · 00020 수냉식 방진프레임 · 01008 방진가대 볼트 · AAAA-00013 받침대 · AAAA-00034 실외기받침대 · AAAA-00035 실외기실내받침대 · AAAA-00036 2단 받침대 · SZL-00014 방진가대(평치형) · ZENG-00021 실내기 받침대 · ZENG-00023 중대형 실내기받침대 · 방진가대대 · 방진가대소 · 수냉식방진가대 · 전면토출방침가대[전면토출방진가대])을 clients·services·tools 전역 grep 한 결과 **실제 참조 0건**. 히트는 전부 무관: `방진가대소`·`방진가대대` 는 **주석**뿐(clients/web/order-app/index.html:2527·2541 · tools/legacy-gas/거래처 발송 주문서/index.html:2276·2290 — 이는 `방진가대S2소`/`방진가대S2대` 블록의 라벨이지 이 품목 참조가 아님) · `AAAA-00034` 는 이카운트 임포트 **테스트 픽스처 1줄**(services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java:159) · `00016`·`00019` 는 같은 픽스처의 `ZENG-00016`·`ZENG-00019` **부분문자열 오탐** · `01008`·`00020` 은 마이그레이션 UUID 부분문자열 오탐(V16·V17 등). 병합 보고서의 이 항목은 정확하다.
- 【②-b 🚩브리핑 전제 정정 — 15종은 '카탈로그에 있는데 코드가 안 쓰는 것' 이 아니라 '카탈로그에도 없는 것'】 임무 지시문은 *"카탈로그에 있는데 코드가 안 쓰는 것 = 사용자가 수동으로 넣는 것일 수 있습니다"* 라고 틀을 잡았으나, 실측상 15종은 **product_category NULL · usage_scope='NONE' · product_estimate_exposure 0건**이다(2026-08-10 16:11:59 KST). 즉 견적·주문 어느 카테고리 탭에도 렌더되지 않아 **수동 선택조차 불가능**하다 — 코드 미참조와 카탈로그 미노출이 겹친 이중 부재다. 이 15종을 넣으려면 견적앱의 기타(사용자정의) 자유입력(index.ejs:11441-11477)으로 **품명을 타이핑**하는 길뿐이고 주문앱에는 그 통로도 없다. 받침 어휘 품목은 총 23건이고 8품목·12노출행만 살아 있다(상업 7·홈 2·싱글 3).
- 【②-c 노출돼 있는데 어떤 write 경로도 없는 받침행 = 3건 (이것이 진짜 '수동 입력' 대상)】 노출 12행을 하나씩 write 경로와 대조한 결과 — 상업 방진가대S2소/중/대·SI-AL600a·SI-AL700a·GHP방진가대(6) 및 홈 발통세트·싱글 발통세트·싱글 SI-AL700a(3)는 파생 write 가 있으나, ①**상업 발통세트(COMMERCIAL_MULTI:339)** — chooseBaseModel 원문 전문을 읽어 `발통세트` push 분기가 한 줄도 없음을 확인했고, 양 앱의 `발통세트` 전 등장 위치(estimate 14곳·order 10곳)가 모두 필터·리셋·수동잠금 분류일 뿐 상업 write 는 0. 게다가 index.ejs:8410 리셋 정규식 `/방진가대|받침대|발통세트|일자발|SI-AL/i` 가 상업 받침 7행 **전부에 매치**함을 실 데이터로 확인(2026-08-10 16:17:56 KST)해 매 재계산마다 0 으로 seed 됨 ②**싱글 SI-AL600a(SINGLE_SET:285)** — SS_FOOT_FLAT_ID 가 `/SI-AL700a/i` 로만 매치(index.ejs:4541)하여 대상 아님 ③**홈 SI-AL600A(HOME_MULTI:115)** — FOOT_FLAT dead(아래 ③항). 부속으로 MDP-M075SGK1D(상업 298)가 PUMP_MAP 에 없어 자동 대응 없음. 병합 보고서의 unmapped 4건과 일치.
- 【③ 코드가 참조하는데 카탈로그에 없는 것 — 모델코드 단위로는 0, 그러나 '카테고리 스코프' 로는 1건 확정】 전역 기준으로 미존재 코드는 없다. 단 **FOOT_FLAT** 는 `HOMEMULTI.find(r=>/SI-AL700a/i.test(r?.model||''))`(index.ejs:4523 / index.html:2892)로 **HOME_MULTI 안에서** SI-AL700a 를 찾는데, 실측 SI-AL700a 노출은 COMMERCIAL_MULTI:338·SINGLE_SET:286 **둘뿐이고 HOME_MULTI 에는 없다**(2026-08-10 16:11:59 KST). 따라서 FOOT_FLAT === '' 가 영구 고정이고 index.ejs:7965-7967 의 `if(FOOT_FLAT && …)` · index.html:5165 의 `if(FOOT_FLAT)` 는 **한 번도 실행되지 않는다**. 홈 일자발은 SI-AL600A(대문자 A, 별개 품목)만 노출돼 있어 자동 채움·자동 0리셋 어느 쪽도 받지 못하는 완전 수동 행이다. 병합 보고서의 dead 판정을 카탈로그 데이터로 독립 확인했다.
- 【🚨증거 무결성 정정 1 — 상업 카탈로그는 416 이 아니라 408】 병합 보고서는 *"노출 총계 COMMERCIAL_MULTI 416"* 이라 했고 실제 원시 노출행은 416 이 맞다. 그러나 정본 카탈로그 API 인 `findExposedCatalog`(services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:279-292)는 `p.usageScope IN :scopes` 를 함께 걸고 호출부가 `List.of(scope, BOTH)` 를 넘긴다(EstimateCatalogInternalController.java:247-251). 상업 노출 중 **8행이 usage_scope='NONE'**(PC4NBFK1NW·PC4NUXK1NW·PC6NUNK1NW·PC6NBDK1NW·PC6NBNK1NW·PC6EUCK1NW·PC6NUXK1NW·PC6EUXK1NW — 전부 판넬, display_order 239~252)이라 **API 실제 반환은 408**이다. HOME_MULTI 119·LEGACY 40·SINGLE_SET 288 은 정확. 받침 결론은 바뀌지 않는다(제외 8행이 전부 판넬). 다만 보고서가 *"반드시 product_estimate_exposure 조인으로 세라"* 를 강조하면서 같은 쿼리의 scope 필터를 빠뜨린 것이라 수치를 정정해 둔다. 측정 2026-08-10 16:11:00·16:16:32 KST.
- 【🚨증거 무결성 정정 2 — LEGACY 내역 '실외기 14·실내기 16·판넬 8·운임/절삭 2' 는 어느 방법으로도 재현되지 않음】 LEGACY 40행을 전건 출력해 대조했다. 품명 기준 = 실외기형 18(ord 1~18)·실내기 12(19~30)·판넬 8(31~38)·운임/절삭 2 / cat_l 기준 = 부자재 19·실내기 12·판넬 8·실외기 1. **14/16 은 두 기준 어디에도 없다.** 다만 이 항목의 실제 결론인 *"LEGACY 에 받침 품목 0건"* 은 **참**이다 — 40행 전건에 받침·방진·발통·일자발 매치가 없음을 눈으로 확인했다. 결론은 살리고 내역 수치만 폐기할 것. 측정 2026-08-10 16:15:48·16:16:15 KST.
- 【🚨증거 무결성 정정 3 — 드리프트 ② 의 예시 수치가 틀림】 병합 보고서는 *"42HP (10HP+12HP+20HP) 1대 → order {S2소 2, S2중 1}, estimate {S2중 1}"* 이라 했다. 해당 행 AM420AXVHHH1SY 'DVM S2 프라임 42HP  (10HP+12HP+20HP)' 에 chooseBaseModel 원문을 그대로 돌린 결과 **estimate(통짜) = {S2소 1, S2중 1}**, order(조각) = {S2소 2, S2중 1} 이다. isPrime 이고 품명에 10HP 토큰이 있어 `isPrime && ['8','10','12']` 가 참이므로 estimate 도 S2소를 낸다. 두 앱이 다르다는 **구조적 주장은 옳으나 예시 수치는 틀렸다** — 차이는 'S2소 유무' 가 아니라 'S2소 1 vs 2' 다.
- 【추가 발견 1 — 드리프트 ② 를 정량화: 84 세트행 중 56행이 실제로 갈린다】 보고서는 예시 1건만 들었다. 실 카탈로그 408행에 원문 함수를 적용해 전수 계산한 결과, 괄호+플러스 세트행 84건 중 **56건에서 estimate(통짜)와 order(조각)의 받침 다중집합이 다르다**(나머지 28건은 우연히 일치). 한편 **받침 타깃별 '발화하는 실외기 행 수' 는 두 앱이 완전히 동일**하다 — 방진가대S2중 111 · S2소 72 · SI-AL600a 12 · SI-AL700a 9 · GHP방진가대 9 · ACL-KORGHP07 9 · S2대 7(전체 실외기 177행 기준). ⟹ 드리프트 ② 는 **어떤 받침이 붙느냐(커버리지)가 아니라 몇 개 붙느냐(수량)** 의 문제로 성격이 확정된다. 또한 estimate 판별 실외기 177행 중 **받침이 하나도 안 붙는 행은 0건**이라, 상업에서 '실외기인데 받침 미대응' 공백은 없다.
- 【추가 발견 2 (보고서 미발견) — order-app 은 GHP 받침 '타깃 행 자체' 도 화면에서 지운다】 order 렌더 필터 index.html:4414 는 `/(GHP|프레스티지|동시냉난방|공장전원)/i` 로 거른다. 이 정규식은 GHP 실외기 9행뿐 아니라 **GHP방진가대('GHP 방진가대', 340)와 ACL-KORGHP07('GHP 저감장치', 305)에도 매치**하고(총 11행, 2026-08-10 16:24:16 KST 실측) 둘 다 KIT_WHITELIST(index.html:4402-4407)에 없어 렌더에서 제외된다. 반면 estimate 의 대응 필터 index.ejs:6750 은 `/(가스히트펌프|프레스티지|동시냉난방|공장전원)/i` 라 이 두 행에 **매치하지 않아** 화면에 남는다. ⟹ order 에서 GHP 받침은 보고서가 든 두 축(원천행 숨김·isCommOutdoorRow=false)에 더해 **타깃행 숨김이라는 셋째 축**으로도 막혀 있어 **수동 입력조차 불가능**하다. 단 COMMULTI 는 index.html:1435 에서 한 번만 대입되고 재대입이 없어 이 필터는 **렌더 전용**이다(계산 경로는 별도이나 isCommOutdoorRow 가 이미 막아 결과는 동일하게 0).
- 【추가 발견 3 — 30HP 상부토출 레거시 분기 차이는 실제로 도달 가능】 보고서가 든 종합견적서 legacy(중=[16..28] · 대=[30,32,34], tools/legacy-gas/종합견적서/index.html:3768·3774) ↔ 거래처발송 legacy·현행 2앱(중=[16..28,30] · 대=[32,34]) 의 차이를 원문으로 확인했다. 나아가 **AM300AXVGHC1 'DVM S2 냉방전용 상부토출 30HP' 가 카탈로그에 실재**하고(단품행), AM440AXVGHC1SY 에도 30HP 조각이 있어 **실 데이터로 재현 가능한 분기**다. 주의할 점은 현행 **견적앱**이 자기 조상인 종합견적서가 아니라 **거래처발송 쪽 규칙을 채택**했다는 것 — 완전계승 기준에서 어느 판본이 정본인지는 업무 결정이 필요하다. 측정 2026-08-10 16:21:19 KST.
- 【추가 발견 4 — 소/중 경계 차이는 현재 금액에 영향이 없다(심각도 판단 재료)】 노출 받침 13행의 단가를 실측한 결과 **방진가대S2소와 S2중이 동일 단가**(delivery 160,000 · release 240,000)이고 S2대만 다르다(220,000 · 240,000). 발통세트는 3카테고리 전부 0원, SI-AL600A/600a 20,000 · SI-AL700a 25,000. ⟹ 계열별 14HP·30HP 경계 불일치(표준형·상부토출은 14 를 '소', 프라임·한랭지·extra 는 '중')가 **소↔중 사이에서 갈리는 한 견적 금액은 변하지 않는다**. 반대로 중↔대로 갈리는 30HP 상부토출 건은 60,000원 차이를 만든다. 측정 2026-08-10 16:21:39 KST.
- 【교차확인한 보고서 핵심 주장 — 전부 재현됨(릴레이 아님)】 ①chooseBaseModel 을 양 앱에서 같은 구간으로 잘라 대조 — 주석 외 조건·리터럴·순서 동일 ②`products.unit` 전 3,061행 'EA' 단일값(16:16:32 KST) → CatalogRow 가 `p.getUnit()` 그대로 적재(EstimateCatalogInternalController.java:191·263) → db-catalog.js:111 `r.unit || 'SET'` 는 값이 있어 미적용 → index.ejs:7993 `if(unit!=='SET' && unit!=='식') return;` 가 **항상 참**이므로 견적앱 '실외기 받침대 포함' 은 round=flat=0 을 내고 :8006-8007 이 이를 무조건 반영. 같은 이유로 index.ejs:8486 SET 분기 미실행 → estimate 는 AXJ-TA3419M 을 발행하지 않음 ③괄호+플러스 상업행 **84건** 정확 ④드리프트 ① 완전 재현: estimate 177 / order 189 / cat_l='실외기' 170, 불일치 30행 = estimate 만 9행(**GHP 가스히트펌프 전 계열**, 전부 cat_l='부자재') + order 만 21행(DVM_S 무풍 실내기 19 + AF-R09A·AF-R12A) ⑤`quantity_sync_rule` **0행** · `bundle_component` FOOT **0행**(활성 1,584행: OUTDOOR 408·REMOTE 315·MATERIAL 273·INDOOR 271·PANEL 250·ACCESSORY 67)이며 구성품 코드·규격에 발통/방진/받침/일자발/SI-AL 매치 **0건** ⑥`dc_config_db.estimate_configs` home_with_foot=**f** · single_with_base=**f** ⑦ACL-KORGHP07 은 '받침대 제외' 정규식(index.ejs:8529)에 매치되지 않아 0 이 되지 않음(AXJ-TA3419M·AF-R09A·AF-R12A 도 동일) ⑧홈 /실외기/ 매치 **정확히 10행**이고 그중 1건이 받침 자신 SI-AL600A ⑨싱글 /실링/ 매치 4모델(AC072BSCPBH2SY·AC090BSCPBH2SY·AC130BSCPHH2SY·AC145BSCPHH2SY) ⑩선행 0 사각지대는 **AM280AXVSHH1SY 'DVM S2 고효율한랭지 28HP (08HP+20HP)' 단 1행**이며 '08' 조각이 받침을 못 낸다.

### 적대검증 — driftBetweenApps 8항목이 "같은 함수끼리" 비교인지 재현 검증 (앞 조사의 360CST 가짜 충돌 재발 여부)

**판정** — 가짜 충돌 없음 — driftBetweenApps 8항목 전부 같은 함수끼리 비교했습니다(①isCommOutdoorRow ②③④⑤⑥은 estimate·order 양쪽에 같은 이름·같은 위치로 존재, ⑦은 같은 함수 recomputeCommDerived 내 서로 다른 잠금 기전, ⑧은 order 전용임을 보고서가 명시). 앞 조사의 360CST 류(서로 다른 함수 대조) 오류는 0건이며, 핵심 근거인 chooseBaseModel 동일성은 실제 diff 로, 드리프트 ① 수치는 SQL 재현 + order-app 자체 bootstrap fixture 두 경로로 확증했습니다(416/177/189/170/30/9/21, 2026-08-10 16:15 KST). 다만 정정 3건이 필요합니다 — ⓐ드리프트 ⑤가 order 의 정규식을 estimate 것으로 잘못 옮겼고(`/GHP/` ↔ `/가스히트펌프/`), 그 탓에 order 에서 GHP방진가대·ACL-KORGHP07 받침 품목 자체가 렌더에서 숨겨진다는 더 큰 영향을 놓쳤습니다. ⓑ드리프트 ⑦이 estimate 를 "집계 단계만"으로 서술했으나 실제로는 집계·반영 둘 다이며(보고서 mappingTable 과 자기모순), 사용자에게 보이는 행동 차이가 입증되지 않았습니다. ⓒproducts 행 수 3,061→실측 3,063(테이블 무변경 구간에서 측정), 그리고 미기재 동종 드리프트 isCommIndoorRow 1건 추가.

- 【총평 — 가짜 충돌 없음】 driftBetweenApps ①~⑧ 을 전부 원문 대조했습니다. **8건 모두 같은 이름·같은 위치의 함수끼리 비교했거나, 한쪽에만 있는 경우 그 사실을 명시**했습니다. 앞 조사의 360CST 오류(estimate 의 A 함수 ↔ order 의 B 함수를 비교)에 해당하는 항목은 **0건**입니다. 함수 동일성 확인 방법 = ①`grep -n "function <이름>"` 로 4개 파일 전부에서 정의 위치 확인 ②앞뒤 이웃 함수가 같은지 확인(전부 `rawNameOf` 다음 → `isCommIndoorRow` 앞 등 동일 배치) ③`awk` 로 인용 줄의 **바깥 함수명**을 뽑아 대조.
- 【본체 chooseBaseModel 은 진짜로 동일 — diff 실행 원문】 estimate `clients/web/estimate-app/views/index.ejs:4150` ↔ order `clients/web/order-app/index.html:2504` 를 같은 구간으로 잘라 `diff -u` 를 실제로 돌렸습니다. 차이는 **주석뿐**이고 조건·리터럴·순서·`want.push` 대상이 전부 일치합니다. 다만 보고서가 *"주석 3줄"* 이라 한 것은 **실제 4줄**입니다: `// 받침대 모델 선택`↔`/* 받침대선택 */`, `// S2 소`↔`/* 방진가대소 */`, `// S2 중`↔`/* 방진가대중 */`, `// S2 대`↔`/* 방진가대대 */`. 실질 결론(받침 매핑 자체에는 앱 간 충돌 없음)은 **확증**입니다.
- 【드리프트 ① isCommOutdoorRow — 같은 함수, 진짜 드리프트. 수치까지 재현】 네 파일 모두 `// 상업멀티 실외기 판별` 주석 바로 뒤, `rawNameOf` 와 `isCommIndoorRow` 사이의 같은 자리입니다: estimate `index.ejs:4050` · order `index.html:2395` · 종합견적서 `tools/legacy-gas/종합견적서/index.html:3634` · 거래처발송 `tools/legacy-gas/거래처 발송 주문서/index.html:2153`. 양쪽 원문 나란히 —   · estimate/legacy 2본(글자까지 동일): `const m = String(row?.model || '').trim().toUpperCase(); return m.startsWith('AM') && m.length >= 7 && m.charAt(6) === 'X';`   · order 단독: `const t = rawNameOf(row).toLowerCase(); if (t.includes('분기관')) return false; const catL = String(row?.catL || '').trim(); if (catL === '실외기') return true; if (/^AM/i.test(String(row?.model||'')) && /실외기/i.test(t)) return true; const s = (t + ' ' + (row?.model||'')).toLowerCase(); if (/dvm|프라임|표준형|한랭지|상부토출/.test(s)) return true; return false;`   ⟹ *"레거시 계승이 아니라 order-app 에서 바뀐 것"* 이라는 보고서 판정은 **정확**합니다.
- 【드리프트 ① DB 수치 — 보고서 7개 숫자 전부 그대로 재현(2026-08-10 16:15 KST)】 `products JOIN product_estimate_exposure`(estimate_category='COMMERCIAL_MULTI', `status NOT IN (DISCONTINUED,NOT_FOR_SALE)`) 위에서 두 판별식을 SQL 로 옮겨 실행: 노출 총계 **416** · estimate 판별 **177** · order 판별 **189** · catL='실외기' **170** · 불일치 **30** · estimate 만 **9** · order 만 **21**. 9건은 전부 `AM160NXGGBH1`~`AM500NXGGBH1S` GHP 가스히트펌프이고 **cat_l 이 실제로 '부자재'** 였습니다. 21건은 `AF-R09A`·`AF-R12A`(ECO 리뉴얼 필터, cat_l='실외기') + DVM_S 실내기 19건. **독립 2차 확증**: order-app 자신이 커밋해 둔 실 bootstrap 응답 fixture `clients/web/order-app/src/__tests__/fixtures/commercialMultiBootstrap.fixture.json`(2026-07-29 채취, 408행)에서 `"catL":"실외기"` 를 세어도 **정확히 170**이고 `unit` 은 전부 `EA` 입니다. ⚠️재측정 시 함정: `products.cat_l_id` 의 FK 는 `categories` 가 아니라 **`classification`** 입니다(`products_cat_l_id_fkey FOREIGN KEY (cat_l_id) REFERENCES classification(id)`). `categories` 로 조인하면 416행 전부 NULL 이 나와 "catL 이 비어 있다" 는 정반대 결론에 도달합니다 — 제가 첫 시도에서 그렇게 틀렸습니다.
- 【드리프트 ② 세트 판별식 — 같은 함수 `recomputeCommDerived`, 진짜 드리프트】 `awk` 로 바깥 함수를 뽑으니 네 파일 모두 `recomputeCommDerived` 안이었습니다(estimate `index.ejs:8390` · order `index.html:5687` · 종합견적서 `:7957` · 거래처발송 `:5165`). 원문 — estimate `index.ejs:8487` `if (String(r.unit).toUpperCase() === 'SET') {` / order `index.html:5786` `const isSet = (String(r?.unit||'').toUpperCase()==='SET') || /\(.*\+.*\)/.test(nm);`. 레거시도 같은 갈림(종합견적서 `:8045` = estimate 형 / 거래처발송 `:5239` = order 형)이라 **각자 자기 레거시를 계승**했다는 판정이 맞습니다. 부수 주장 *"estimate 는 AXJ-TA3419M 을 절대 발행하지 않는다"* 도 확인 — `branchCnt += countBranchForSet(nm)*q;` 가 SET 블록 **내부에만** 있고(`index.ejs:8496`), `want.set('AXJ-TA3419M',…)` 는 `if (branchCnt > 0)` 뒤에만 있습니다(`:8505`).
- 【드리프트 ②·③ 의 전제 `unit='EA'` — 확증되나 행 수는 보고서와 2행 다름】 `SELECT unit, count(*) FROM products GROUP BY unit` = **EA 3,063 / 단 1개 그룹**(2026-08-10 16:13 KST). 보고서는 *"전 3,061행"*(15:57 KST)이라 했는데 `max(modified_at)` 이 **15:36** 이라 두 측정 사이에 테이블이 바뀌지 않았습니다 ⟹ 보고서 행 수가 2 틀렸습니다. **핵심 주장(unit 이 단일값 EA)은 무해하게 유지**됩니다. 경로도 확인: `EstimateCatalogInternalController.java:262` 가 `p.getUnit()` 을 CatalogRow 3번째 필드로 그대로 싣고, `clients/web/estimate-app/lib/db-catalog.js:111` 의 `unit: r.unit || 'SET'` 은 값이 있어 fallback 이 걸리지 않습니다.
- 【드리프트 ③ recomputeSingleBaseFoot — 같은 함수명, 진짜 드리프트】 estimate `index.ejs:7971` ↔ order `index.html:5168`, 둘 다 `recomputeFootAll` 바로 다음·`recomputeSingleExtras` 바로 앞. estimate 에만 있는 두 게이트를 원문으로 확인: `index.ejs:7990` `if (cat === '부자재' || cat === '실외기 받침' || cat === '자재') return;` · `index.ejs:7993` `if (unit !== 'SET' && unit !== '식') return;`. order 는 `/운임|절삭/` 하나뿐. unit 이 전부 EA 이므로 **견적앱의 '실외기 받침대 포함' 이 현재 데이터에서 발통 0개를 만든다**는 결론은 코드상 성립합니다(라이브 실행으로는 확인하지 않았습니다 — 코드·데이터 근거).
- 【드리프트 ④ isHomeCalcTriggerModel — 같은 함수명, 진짜 드리프트】 estimate `index.ejs:8037` ↔ order `index.html:5214`, 둘 다 `/* 트리거 판별 */` 주석 아래 `isSingleCalcTriggerId` 바로 앞. 원문 — estimate `:8040` `if(/(일자발|발통)/i.test(nm)) return false;` + `:8044` `if(/(단배관|다배관)/i.test(nm)) return true;` / order `:5217` `if(/(실외기\s*받침대)/i.test(nm)) return false;` + `:5219` `if(/(실외기)/i.test(nm)) return true;`. 인용 줄 번호·내용 모두 정확합니다.
- 【드리프트 ⑤ renderComm — 같은 함수명이나 🚩보고서가 order 의 정규식을 잘못 옮겼고, 그 결과 더 큰 영향을 놓쳤습니다】 함수 자체는 동일(estimate `index.ejs:6734` ↔ order `index.html:4399`, 둘 다 `let rows = (COMMULTI || []).filter(...)`). 그러나 토큰이 다릅니다 — estimate `index.ejs:6750`: `/(가스히트펌프|프레스티지|동시냉난방|공장전원)/i` · order `index.html:4414`: **`/(GHP|프레스티지|동시냉난방|공장전원)/i`**. 보고서는 *"같은 계열을 무조건 숨긴다"* 로만 적어 이 차이를 지웠습니다. 실측 결과 놓친 것 = **order 의 `GHP` 토큰은 받침 품목 자신도 잡습니다**: `ACL-KORGHP07 'GHP 저감장치'` 와 `GHP방진가대 'GHP 방진가대'` 는 이름에 `GHP` 가 들어 있고 order 의 `KIT_WHITELIST`(`index.html:4339-4350`, 10개 항목)에 없으므로 **표에서 함께 숨겨집니다**. estimate 의 한글 토큰은 이 둘을 매치하지 않아 항상 렌더됩니다. 같은 필터가 `getCommFilterRows_`(`index.html:4336`, 문제 줄 `:4358`)에도 중복돼 있습니다. ⟹ 드리프트 ⑤ 의 결론(order 에서 GHP 받침 도달 불가)은 **오히려 강화**되지만 보고서가 든 근거는 부정확합니다.
- 【드리프트 ⑥ requireCommCatalogRow_ — 같은 이름·같은 위치, 진짜 드리프트】 둘 다 `recomputeCommDerived` 최상단 지역 상수(estimate `index.ejs:8392` · order `index.html:5699`). estimate 는 `if(!['AR-EH05','방진가대S2중'].includes(String(model))) return null;` 후 나머지는 `throw`, order 는 `noteCommCatalogMissing_(model, reason); return null;` 로 경고 수집 — 보고서 서술과 일치합니다.
- 【드리프트 ⑦ — 진짜 차이는 있으나 🚩보고서 문장이 estimate 를 과소 서술했고, 행동 차이는 입증되지 않았습니다】 보고서: *"estimate 는 집계 루프에서 … 잠긴 모델을 아예 더하지 않고, order 는 집계에서 잠금을 보지 않고 반영 단계에서 거릅니다."* 실제 estimate 는 **집계와 반영을 둘 다** 합니다 — 집계 `index.ejs:8493`·`8501`·`8512`·`8538`, 반영 `index.ejs:8561` `if (isBase && !isBaseExcluded && COMM_MANUAL_BASE.has(m)) return;`. (보고서 자신의 mappingTable 은 *"집계·반영 단계에서 skip"* 으로 옳게 적었으므로 **두 절이 서로 모순**됩니다.) 게다가 order 는 시작에서 파생행을 전부 0 으로 seed 한 뒤(`index.html:5711`) 반영에서 잠금행을 건너뛰므로 순 효과는 estimate 와 같아 보입니다 — 보고서는 이 구조 차이가 **어떤 사용자 결과를 다르게 만드는지 제시하지 않았습니다**. ⑦ 중 제가 확증한 것은 죽은 변수 한 가지뿐: order `index.html:5798-5800`·`5813-5815` 의 `const isBase = /방진가대|받침대|발통세트|si-al600a|si-al700a/i.test(s);` 는 계산만 되고 쓰이지 않습니다.
- 【드리프트 ⑧ clearManualQtyLocks — order 전용이 맞고, 보고서가 그렇게 명시했습니다】 estimate 에서 `clearManualQtyLocks|MANUAL_QTY_LOCKS|isManualQtyLocked` grep **0건**, order 는 `index.html:2302` 정의 + 호출 6곳(`2924`·`2931`·`4304`·`5117`·`5144`·`9449`). 세부 주장 2건 모두 원문 확인 — `owns()` 의 home_foot 분기는 `index.html:2320` `if(controlId==='home_foot') return /발통|받침대|실외기\s*받침대/i.test(String(row?.name||''));` 라 이름이 `실외기 일자발`(SI-AL600A)이면 매치되지 않고, `:5144`·`:9449` 는 `clearManualQtyLocks('single')` 로 **controlId 없이** 호출돼 `:2305` `if(!controlId){ locks.clear(); return; }` 를 타 싱글 잠금 전체를 지웁니다.
- 【보고서가 안 센 같은 계열 드리프트 1건 — isCommIndoorRow】 ① 과 **똑같은 포팅 변경**이 실내기 판별에도 있는데 목록에 없습니다: estimate `index.ejs:4044-4047` `return m.startsWith('AM') && m.length >= 7 && m.charAt(6) === 'N';` ↔ order `index.html:2388-2391` `const t = rawNameOf(r).toLowerCase(); if (t.includes('분기관')) return false; return /실내기/.test(t);`. 받침을 직접 고르지는 않지만 ① 의 order-only 21행 중 19행(DVM_S 실내기)이 왜 실외기로도 잡히는지를 같은 원인으로 설명하며, 상업 파생 전반(펌프·판넬 seed)의 대상 집합을 바꿉니다.
- 【줄 번호 정밀도 — 전부 해소되나 4곳이 어긋납니다】 `chooseBaseModel` 함수 시작은 `index.ejs:4150`/`index.html:2504`(보고서 4149/2503 — 앞 주석줄 포함으로 보임, 무해) · SET 판별은 `index.ejs:`**8487**(보고서 8486) · `requireCommCatalogRow_` 는 `index.ejs:`**8392**(보고서 8391) · 상업 집계 잠금 skip 첫 줄은 `index.ejs:`**8493**(보고서 8489). 네 건 다 ±1~4 이고 지목한 코드가 그 자리에 실재하므로 오도 위험은 없습니다.
- 【보고서의 다른 검증 가능 주장 2건도 확인했습니다】 ①레거시 판본 차 — 종합견적서 `tools/legacy-gas/종합견적서/index.html:3768` 은 isCoolTop '중' 에 `['16','18','20','22','24','26','28']`(30 없음), `:3774` 은 '대' 에 `['30','32','34']`(30 있음)이고, 거래처발송 `:2288`·`:2294` 와 estimate·order 는 반대(중에 30 있음 / 대에 32·34 만) — *"앱 간 드리프트가 아니라 레거시 판본 간 차이"* 라는 분류가 맞습니다. ②estimate 상업 수동잠금이 안 풀린다는 주장 — `index.ejs:4735` 의 **단일 `change` 핸들러 안에서** 빈칸일 때 `:4749` 가 `COMM_MANUAL_BASE.delete(model)` 를 하고, 같은 핸들러 뒤쪽 `:4802` 의 `if (rec) {…}` 블록이 조건 없이 실행돼 `:4815-4816` 이 다시 `add(model)` 합니다. 확증.

---

# 실외기 → 받침(발통·방진가대) 대응 로직 재조사 — 개발책임자 보고서

> 작성 시각 2026-08-10 16:3x KST · 워크트리 `D:/dev/Samhan-Public/.claude/worktrees/wmain` (origin/main)
> 소스 무수정 · git 무조작 · DB 읽기 전용
>
> **표기** — ✅ = 제가 이 보고서를 쓰며 원문·SQL 로 **직접 재현**한 것 / ☑ = 적대검증 각도가 재현했고 제가 재현하지 않은 것 / ⚠️ = 검증자 간 불일치이거나 미확정 / ❌ = 뒤집힌 것

---

## 1. 한 줄 결론

**개발책임자 지적이 옳습니다. 로직은 레거시 코드에 실재하며 이름은 `chooseBaseModel(nm)` 입니다 — 단 상업멀티(COMMERCIAL_MULTI) 한 곳에서만입니다.** ✅

- 실외기 **품명 계열 7종 × 정확 HP 토큰**의 2축 격자로 받침을 가릅니다. 계열마다 경계가 **실제로 다릅니다**(14HP 는 표준형·상부토출에서 '소', 프라임·한랭지·extra 에서는 '중' / **한랭지와 extra 에는 '대' 분기가 아예 없습니다**).
  `clients/web/estimate-app/views/index.ejs:4150-4193` · `clients/web/order-app/index.html:2504-2547` · `tools/legacy-gas/종합견적서/index.html:3734-3777` · `tools/legacy-gas/거래처 발송 주문서/index.html:2253-2296` ✅ (4파일 원문 직접 확인)
- **홈멀티·싱글중대형에는 실외기별 받침 선택 분기가 없습니다 — "못 찾음"이 아니라 확인된 부재입니다.** ✅
  홈 = `HOMEMULTI` 중 품명 `/실외기/i` 인 **모든 행의 수량 합 → 발통세트 하나**(`index.ejs:7958-7968`) / 싱글 = 모델코드 리터럴 2건(`/^(AP230DAPDHH1S|AP290DAPDHH1S)$/i`)만 일자발, 나머지 전부 원형발통(`index.ejs:7996-8001`).
- **구형(LEGACY)·기타(OTHER)에는 받침 로직도 받침 품목도 0건** ✅ (LEGACY 노출 40행 전건 출력해 눈으로 확인).
- ⟹ **앞 조사의 "[홈] 실외기 → 원형발통 세트 · `/실외기/` 매치 10건 · 합 ×1" 은 홈에 한해 규칙 자체는 맞으나, 상업으로 확장하면 전면 오답입니다.** 게다가 홈에서도 ①체크박스 게이트(`#home_foot`, 기본값 **false** ✅)가 빠졌고 ②분모 10건 중 1건이 **받침 자기 자신**(`SI-AL600A '실외기 일자발'`)입니다.
- 받침 대응은 **100% 프런트 JS 리터럴**입니다. `quantity_sync_rule` **0행** ✅ · `bundle_component` 의 `FOOT` **0행**(전체 1,584행) ✅ — DB 규칙 엔진에도 세트 구성품에도 실체가 없습니다.

### 상업멀티 격자 (본체 · `index.ejs:4150-4193` 원문 그대로) ✅

| 실외기 계열 (판별식) | → 방진가대S2소 | → 방진가대S2중 | → 방진가대S2대 | → 기타 |
|---|---|---|---|---|
| 프라임 `/프라임/i` | 8·10·12 | 14·16·18·20 | 22·24 | — |
| 한랭지 `/한랭지/i` | 8·10·12 | 14·16·18·20·**22·24** | **분기 없음** | — |
| 표준형 `/표준형/i` | 8·10·12·**14** | 16·18·20·22·24·26·28 | 30·32·34 | — |
| 냉방전용 상부토출 `/냉방전용\s*상부토출/i` | 8·10·12·**14** | 16·18·20·22·24·26·28·**30** | 32·34 | — |
| 프레스티지\|동시냉난방\|공장전원 (`isExtra`, 한 조건에 묶임) | 8·10·12 | 14·16·18·20 | **분기 없음** | — |
| ECO `/\bECO\b/i` | — | — | — | 3.5·4·5·6 → **SI-AL600a** / 7.5·8·10·12·14 → **SI-AL700a** |
| 가스히트펌프 `/가스히트펌프/i` | — | — | — | **HP 무관** → **GHP방진가대 + ACL-KORGHP07** 2품목 동시 |

- HP 판정은 `hasExactHP(nm,hp) = new RegExp('(^|[^0-9.])'+hp+'HP([^0-9.]|$)')` (`index.ejs:4137-4140`) ✅ — 부분매치가 아닌 **정확 토큰**입니다.
- 각 분기는 `else if` 가 아닌 **독립 `if`** 라 한 실외기가 여러 받침을 동시에 낼 수 있습니다(ECO 4~6HP + 8~12HP 동시 등). ✅

---

## 2. 🚨 적대검증이 뒤집은 것 — 먼저 읽으십시오

### 2-1. 병합 결과가 틀렸고 제가 재측정으로 확정한 것

| # | 병합 결과의 서술 | 실측 | 판정 |
|---|---|---|---|
| ① | 상업 카탈로그 노출 **416** | 원시 조인 416 / **정본 API 실제 반환 408** — `usage_scope='NONE'` 8행 제외 | ❌ 정정 (각도2 지적 채택) ✅내가 재현 |
| ② | LEGACY 노출 40건 = **실외기 14·실내기 16·판넬 8·운임 2** | 건수 40 은 맞음. 내역은 **어느 기준으로도 재현 불가** | ❌ 내역 폐기 · 결론(받침 0건)은 유지 ✅ |
| ③ | 드리프트 ② 예시 *"42HP → estimate {S2중 1}"* | `AM420AXVHHH1SY 'DVM S2 프라임 42HP  (10HP+12HP+20HP)'` 는 통짜 평가에서도 `10HP` 토큰이 매치돼 **{S2소 1, S2중 1}** | ❌ 예시 수치 오류 (구조적 주장은 유지) ✅원문 추적으로 확인 |
| ④ | 드리프트 ⑦ *"estimate 는 집계 단계에서 잠금 skip"* | estimate 는 **집계(`index.ejs:8493·8501·8512·8538`)와 반영(`:8561`) 둘 다** — 병합 결과 자신의 대응표와 자기모순이고, **사용자에게 보이는 행동 차이가 입증되지 않음** | ❌ 각도3 지적 채택 ☑ |
| ⑤ | 모든 SQL 에 붙인 `status NOT IN ('DISCONTINUED','NOT_FOR_SALE')` | `products` **3,063행 전부 ACTIVE** → 아무것도 거르지 않는 무의미 필터. "활성 노출"이라는 수식은 아무것도 보장하지 않음 | ❌ 각도1 지적 채택 ✅ |
| ⑥ | `cat_l='부자재'` 등을 SQL 실측처럼 인용 | `products` 에 `cat_l` 컬럼 없음. `cat_l_id` → **`classification`** FK 조인이라야 재현됨(제가 그 조인으로 값 재현) | ❌ 인용 형식 오류 (라벨 값 자체는 재현됨) ✅ |
| ⑦ | 좌표 ±1~4 어긋남 | `chooseBaseModel` 은 **4150**/**2504**(병합 4149/2503) · SET 판별 **8487**(8486) · `requireCommCatalogRow_` **8392**(8391) | ❌ 무해하나 정정 ✅ |
| ⑧ | *"diff 차이는 주석 3줄"* | **4줄** (`// 받침대 모델 선택`↔`/* 받침대선택 */` 포함) | ❌ 각도3 지적 ☑ |

### 2-2. 적대검증 각도끼리 충돌한 것 — 제가 중재했습니다

| 쟁점 | 각도1 | 각도2 | 각도3 | **제 실측 (2026-08-10 16:29~16:31 KST)** | 판정 |
|---|---|---|---|---|---|
| LEGACY 노출 건수 | **42** | 40 | — | `is_deleted=false` → **40** · 미필터 → 42 | **40 이 정답.** 각도1 이 `is_deleted` 필터를 빠뜨림 ✅ |
| LEGACY 분류 내역 | 부자재 21·실내기 12·판넬 8·실외기 1 | 부자재 19·실내기 12·판넬 8·실외기 1 | — | **부자재 19·실내기 12·판넬 8·실외기 1** (`classification` 조인) | **각도2 가 정답**(각도1 은 삭제행 2건 포함) ✅ |
| `products` 총계 | 3,063 | 3,061 | 3,063 | **전체 3,063 / `is_deleted=false` 3,061** | **둘 다 맞음 — 필터 차이.** load-bearing 명제(`unit` 단일값 `'EA'`)는 3,063 전건에서 참 ✅ |
| `KIT_WHITELIST` 좌표 | — | order `:4402-4407` | order `:4339-4350` | **둘 다 실재** — order 에 두 개(`4339` 10항목 / `4402` 19항목), estimate 에도 두 개(`6681` 11항목 / `6739` 19항목) | **둘 다 맞음, 다른 인스턴스** ✅ |

### 2-3. 🚩 적대검증 두 각도가 함께 **부정확**했던 것 — 제가 원문으로 바로잡습니다

각도2·각도3 은 *"estimate 는 `/(가스히트펌프|…)/i`, order 만 `/(GHP|…)/i` 라 order 에서만 받침 품목 자체가 숨겨진다"* 고 보고했습니다. **양쪽 앱이 두 정규식을 다 갖고 있습니다.** ✅ (grep 전수)

| 함수 | estimate | order | 종합견적서(legacy) | 거래처발송(legacy) |
|---|---|---|---|---|
| `getCommFilterRows_` | `:6700` **`/(GHP\|…)/i`** + `#comm_ext_out` 게이트 | `:4358` **`/(GHP\|…)/i`** · **게이트 없음** | `:6268` GHP + 게이트 | `:4090` GHP · 게이트 없음 |
| `renderComm` | `:6750` `/(가스히트펌프\|…)/i` + 게이트 | `:4414` **`/(GHP\|…)/i`** · **게이트 없음** | `:6318` 가스히트펌프 + 게이트 | `:4146` GHP · 게이트 없음 |

⟹ **정정 결론**: 이것은 order-app 의 포팅 변경이 아니라 **각자 자기 레거시를 정확히 계승**한 것입니다(estimate=종합견적서 형, order=거래처발송 형). 그러나 **실효는 각도2·3 이 말한 대로입니다** — DB 실측 품명이 `GHP방진가대` = **"GHP 방진가대"**, `ACL-KORGHP07` = **"GHP 저감장치"** 이고 ✅ 둘 다 `KIT_WHITELIST` 에 없으므로, **order 의 `renderComm` 은 이 두 행을 무조건 표에서 지웁니다**(수동 입력 경로까지 닫힘). estimate 의 `renderComm` 은 `가스히트펌프` 토큰이라 두 행이 항상 남습니다.

### 2-4. 앞 조사도 병합 결과도 놓쳤던 자산 — `clients/web/legacy-quantity-golden/` ✅

각도1 이 발견했고 제가 파일을 열어 확인했습니다. 다만 **각도1 의 평가는 양방향으로 수정이 필요합니다.**

- **각도1 이 과소평가한 것**: 받침 축 커버리지가 "상업 16분기 중 3케이스"보다 넓습니다 — `C-05`/`C-05-NO-BASE`/`C-05-BASE-LOCK`/`C-06`/`C-08`/`C-08-NO-BASE`/`H-08`/`H-08-NO-FOOT`/`S-01`/`S-01-NO-BASE`/`S-01-FLAT-BASE`/`S-01-CATEGORY-DRIFT`/`S-03` (`goldens.js:20·28-31·96·145` · `fixtures.js:191-202·261-266·303-308`). `fixtures.js:265-266` 주석은 **싱글 부자재 드리프트를 이미 문장으로 기록**해 두었습니다.
- **각도1 이 과대평가한 것 (중요)**: 이 하네스는 **계산 함수만** VM 에 주입합니다 — 추출 목록(`legacyQuantityBoundary.js:320-343`)에 `chooseBaseModel`·`hasExactHP`·`recomputeCommDerived` 는 있으나 **`renderComm`·`getCommFilterRows_` 는 없습니다**. ⟹ **가시성 축(2-3 항목·드리프트 ⑤)은 골든이 전혀 보호하지 않습니다.** ✅
- **더 중요한 함정**: `fixtures.js:117` 이 `c('AM140AXVGHH1-SET','실외기 세트 (8HP+12HP)',{ model:'AM140AXVGHH1', unit:'SET' })` 로 **`unit:'SET'` 을 합성**합니다. 실 DB 는 전 3,063행이 `'EA'` ✅ 이므로, `goldens.js:29` 가 estimate 쪽에서도 `AXJ-TA3419M:1` 을 고정하고 있는 것은 **실데이터 경로를 보호하지 않습니다**. 즉 **골든이 green 이어도 아래 5-1 의 결함은 안 잡힙니다.**
- ⚠️ **설명되지 않은 것 하나**: `goldens.js:31`(estimate) 은 `{GHP방진가대:2, ACL-KORGHP07:2}` 인데 `:54`(order) 는 `{AM180AXVGHH1:2, GHP방진가대:2, ACL-KORGHP07:2}` 로 **원천 실외기 행이 estimate 쪽에만 빠져 있습니다**. 가시성 필터는 하네스에 없으므로 렌더 때문은 아닙니다. 원인 미상 — **확정하지 않고 그대로 올립니다.**

### 2-5. 뒤집히지 않고 3각도 모두 확증한 것

- `chooseBaseModel` 이 estimate↔order 에서 **주석 외 글자까지 동일** (같은 함수끼리 실제 `diff` 실행) — 브리핑이 경계한 **가짜 앱 간 충돌은 0건**입니다. ☑✅
- `quantity_sync_rule` 0행 ✅ / `bundle_component` FOOT 0행(1,584행 중) ✅ / `estimate_configs`: `home_with_foot='f'`, `single_with_base='f'` ✅

---

## 3. 대응표 전수 — 카테고리 × 실외기 → 받침

### 3-1. COMMERCIAL_MULTI (실외기별 대응이 존재하는 유일한 카테고리)

격자 본체는 **§1 표** 참조. 그 위에 얹히는 규칙들:

| 축 | 규칙 | 좌표 | 검증 |
|---|---|---|---|
| **세트 전개** | 품명 괄호 안 `(10HP+16HP)` 를 조각으로 쪼개 조각마다 `chooseBaseModel` 재실행 → 같은 받침이 두 조각이면 2배 | estimate `index.ejs:8487` / order `index.html:5786` | ✅ 조건문 원문 확인 |
| **세트 판별식** | estimate `unit==='SET'` **만** / order `unit==='SET' \|\| /\(.*\+.*\)/` | 위와 동일 | ✅ **실 DB `unit` 전건 `'EA'`** → estimate 는 세트 경로 사멸 |
| **T형 분기관** | 조각 수 −1 × 수량 → `AXJ-TA3419M` | `index.ejs:8496·8505` / `index.html:5806-5825` | ☑ estimate 는 SET 블록 안에만 있어 실데이터에서 미발행 |
| **받침대 제외** | 계산 후 정규식 매치 행을 **일괄 0 덮어쓰기**. estimate `/방진가대\|받침대\|발통세트\|일자발\|SI-AL/i` / order `/…\|si-al600a\|si-al700a/i` | `index.ejs:8526-8533` / `index.html:5858-5866` | ☑ · 🚩`ACL-KORGHP07` 은 **어느 토큰에도 안 걸려 0 이 안 됨** — `goldens.js:96` 의 `C-08-NO-BASE = {ACL-KORGHP07:2}` 가 이를 **골든으로 이미 고정**하고 있음 ✅ |
| **수동 잠금** | 사용자가 받침 행에 수량을 직접 넣으면 자동계산 제외 | `index.ejs:4759·8493·8561` / `index.html:5869-5872` | ⚠️ 적용 지점 차이의 **행동 영향은 미입증**(§2-1 ④) |
| **드레인펌프(PUMP_MAP)** | 상업 **실내기 모델코드 22종 리터럴** → 펌프 6종 | `index.ejs:8460-8478` | ☑ 받침 아님. 싱글은 같은 품목을 **이름 `/실링/`** 으로 붙임 — 대응 방식이 카테고리마다 다름 |
| **ECO 리뉴얼 필터** | 모델코드 4건 → `AF-R09A`/`AF-R12A` | `index.ejs:4229-4232·8508-8516` | ☑ 받침 아니나 같은 파생·잠금 축 |
| **상업 발통세트** | ❗**`chooseBaseModel` 이 `발통세트` 를 push 하는 분기가 한 줄도 없음** → 100% 수동 | `index.ejs:4150-4193` 부재 · seed 0 은 `:8410` | ✅ 함수 전문 확인 |

### 3-2. HOME_MULTI

| 축 | 규칙 | 좌표 | 검증 |
|---|---|---|---|
| 발통세트 | `#home_foot` 체크 × (`HOMEMULTI` 중 품명 `/실외기/i` 인 **모든 행 수량 합**) → ×1. **모델·용량·계열 분기 없음** | `index.ejs:7958-7968` / `index.html:5159-5167` | ✅ 원문 확인 |
| 분모 실측 | `/실외기/` 매치 **정확히 10행** — 단배관 5 + 다배관 4 + **`SI-AL600A '실외기 일자발'`(받침 자신)** | — | ✅ DB 확인 |
| 일자발(`FOOT_FLAT`) | `HOMEMULTI.find(r=>/SI-AL700a/i.test(r.model))` 인데 **HOME_MULTI 에 SI-AL700a 노출 0건** → `''` → `if(FOOT_FLAT …)` **영구 미실행(dead)**. 게다가 해소되더라도 하는 일은 `set(FOOT_FLAT, 0)` 뿐 | `index.ejs:4523·7965-7967` / `index.html:2892·5165` | ✅ 코드+DB 양쪽 확인 |
| 트리거 | estimate `/(일자발\|발통)/ → false` / order `/(실외기\s*받침대)/ → false` 후 `/(실외기)/ → true` | `index.ejs:8037-8047` / `index.html:5214-5222` | ☑ 양쪽 다 자기 레거시 계승(`종합견적서:7604` ↔ `거래처발송:4806`) |

### 3-3. SINGLE_SET

| 축 | 규칙 | 좌표 | 검증 |
|---|---|---|---|
| **일자발** | `/^(AP230DAPDHH1S\|AP290DAPDHH1S)$/i` → `SI-AL700a`. **싱글에서 유일한 "모델 → 받침 종류" 대응** | `index.ejs:7996-8001` | ✅ |
| 원형발통 | 위 2모델을 제외한 나머지 전부. estimate 는 게이트 4중(자기제외 / `/운임\|절삭\|비용\|설치비/` / `catL∈{부자재,실외기 받침,자재}` / **`unit∈{SET,식}`**), order 는 2중 | `index.ejs:7971-8010` / `index.html:5168-5183` | ✅ 원문 확인 |
| 실링 드레인펌프 | 이름+모델 `/실링/i` → `ADP-F075SP`. **옵션 축이 없어 `#ss_base` 를 꺼도 항상 붙음** | `index.ejs:8024-8032` | ☑ |

### 3-4. LEGACY(구형) · OTHER(기타)

- **구형: 받침 로직 0 · 받침 품목 0** ✅ — LEGACY 노출 **40행 전건**을 출력해 확인했고 받침/방진/발통/일자발/SI-AL 매치가 없습니다(실외기형 18 · 실내기 12 · 판넬 8 · 운임·절삭 2). 구형 탭은 파생 계산 함수 자체가 없고 옵션은 할인율·반올림뿐(`index.ejs:7380-7420`).
- **기타**: 견적앱 자유입력만(`index.ejs:11441-11477`), 주문앱엔 통로 없음. `product_estimate_exposure` 에 OTHER 0건. ☑

### 3-5. 레거시 GAS 주문서 인식기 (별개 실장)

| 출처 | 규칙 | 좌표 |
|---|---|---|
| 에어디자이너 | 메모에 `/육각\|발통/` + 모델코드에 `MX\|RX` 인 행 수량 합 → 발통세트 | `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:1657-1658·1739-1761` (중복 `:1895-1996`) ☑ |
| 제이시스템 | **주문서에 적힌 글자** `받침` + `7`→SI-AL700a / `5`→SI-AL600a, `원형발`→발통세트 | `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:456-470` ☑ |
| 제이시스템 | 싱글 세트 발통 자동추가는 `addBolt` 미대입으로 **항상 false(dead)** | 같은 파일 `:2222·2230` ☑ **미검증 지엽** |

### 3-6. 서버 측 (받침을 **고르지** 않고 **제외·분류**만 함)

- `BundleExpander.isFoot` — `kind==FOOT` 또는 텍스트 `'발통'` 또는 `SI-AL700A` 포함 시 싱글 세트 전개에서 제외. **`SI-AL600a`·방진가대 계열은 안 걸림.** `services/product-service/…/BundleExpander.java:125-129·404-409` ☑ · **현재 `FOOT` 0행이라 미발화** ✅
- `ProductSheetSyncService.matchKind` — **오직 `'발통'` 문자열만** FOOT. `'받침'`·`'방진가대'`·`'일자발'`·`'SI-AL'` 은 FOOT 이 못 됨. `…/ProductSheetSyncService.java:1089-1097` ☑
- 구성품 탭 매핑은 `'싱글 구성품'`·`'상업멀티 구성'` 둘뿐 — **홈멀티는 구성품 탭 자체가 없음**(`:137-139`) ☑
- `isHousehold` 에서 품명에 `(발통|일자발|받침)` 이면 비가정 확정 → 세트단가 실내:실외 배분이 6:4 대신 **4:6**. `BundleExpander.java:439-456` ☑ (받침 어휘가 **금액 분배**를 바꾸는 유일 지점)

---

## 4. 옵션 매트릭스 — 카테고리별 받침 옵션과 값

| 카테고리 | 받침 옵션 | 방향 | 값 | 기본값 | 생성 / 소비 좌표 |
|---|---|---|---|---|---|
| HOME_MULTI | `#home_foot` "발통포함" | **opt-in** | 체크/해제 | **false** ✅ (`estimate_configs.home_with_foot='f'`) | `index.ejs:7810` / `:7960` · `index.html:5131` / `:5161` |
| SINGLE_SET | `#ss_base` "실외기 받침대 포함" | **opt-in** | 체크/해제 | **false** ✅ (`single_with_base='f'`) | `index.ejs:7848` / `:7972` |
| COMMERCIAL_MULTI | `#comm_ex_base` "받침대 제외" | **opt-out (방향 반대)** | 체크/해제 | **false — 코드 리터럴**, 관리자 UI 없음 | `index.ejs:6642` / `:8526-8533` |
| COMMERCIAL_MULTI | `#comm_ext_out` "실외기확장" | 가시성 | 체크/해제 | false | `index.ejs:6643·6700·6751` — **estimate 계열에만 존재** ✅ |
| LEGACY | **없음 (0개)** | — | — | — | `index.ejs:7380-7420` (할인율·반올림뿐) ✅ |
| 기타 | **없음** | — | — | — | — |
| 관리자(데스크톱) | `homeWithFoot` · `singleWithBase` 체크박스 **2개가 전부** | — | — | — | `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:415-437` ☑ — **상업·구형 그룹 없음** |

**🚩 옵션 축에서 사용자가 고를 수 없는 것**
- 받침 **종류**(원형/일자)를 고르는 축은 **어느 카테고리에도 없습니다**. 홈에서 일자발(SI-AL600A)을 쓰려면 수량 칸에 직접 타이핑하는 수밖에 없습니다. ✅
- 싱글 실링 드레인펌프(`ADP-F075SP`)에는 축이 아예 없어 `#ss_base` 를 꺼도 항상 붙습니다. ☑
- 상업 `ACL-KORGHP07` 은 '받침대 제외'로도 0 이 되지 않습니다(§3-1). ☑✅

---

## 5. 현 스키마로 표현 가능한가 — **부분적으로만**

### 5-0. 먼저: 대응 로직 자체가 도달 불가하거나 잘못 계산되는 지점 (스키마 이행 전에 결정해야 할 것)

3각도가 각각 잡아 제가 재현·정밀화한 **도달 가능 결함 3건**입니다.

**5-1. 견적앱 "실외기 받침대 포함" 이 현재 데이터에서 발통 0개를 만듭니다** ✅
`index.ejs:7993` `if (unit !== 'SET' && unit !== '식') return;` → `SINGLE_SETS.unit` 은 `db-catalog.js:111` `r.unit || 'SET'` → API `CatalogRow` 가 `p.getUnit()` 그대로(`EstimateCatalogInternalController.java:262`) → **DB 는 전 3,063행 `'EA'`**. `'EA'` 는 truthy 라 fallback 미적용 ⟹ 모든 싱글 세트가 걸러져 `round=flat=0`. 주문앱은 이 게이트가 없어 정상. **같은 조작에 두 앱 출력이 갈립니다.** 골든은 `unit:'SET'` 합성 fixture 라 이 경로를 보호하지 않습니다(§2-4).

**5-2. 주문앱에서 GHP 받침이 3중으로 도달 불가** ✅
①`isCommOutdoorRow` 가 order 만 catL 기반으로 바뀌어 GHP 실외기 9행이 `chooseBaseModel` 을 안 탐(estimate `index.ejs:4050-4053` 과 **거래처발송 legacy `:2153-2156`** 은 글자까지 같은 모델코드 판별인데 **order `index.html:2395-2407` 만 다름** — 이쪽은 진짜 포팅 변경) ②`renderComm` 이 GHP 원천행을 숨김 ③**`renderComm` 이 `GHP방진가대`·`ACL-KORGHP07` 타깃행 자체도 숨김**(품명이 "GHP 방진가대"·"GHP 저감장치" ✅) ⟹ 수동 입력조차 불가. ⚠️단 ②③ 은 **레거시 계승**이고 ① 만 포팅 변경입니다(§2-3).

**5-3. 선행 0 HP 토큰이 받침을 못 받습니다** ✅
`AM280AXVSHH1SY 'DVM S2 고효율한랭지 28HP (08HP+20HP)'` — 카탈로그에 **정확히 이 1행**. `'08'` 조각은 `(^|[^0-9.])8HP` 에 매치되지 않아(앞 문자가 `'0'`) 받침이 1개 덜 붙습니다(세트를 전개하는 order 한정).

### 5-1. 표현 **가능한** 것 ☑ (각도1 이 제약을 전건 조회해 확인)

`quantity_sync_rule` + `quantity_sync_source(factor)` + `quantity_sync_target(multiplier)` 로:
① 상업 16분기 → 타깃 7종별 rule + source 열거(계열·HP 판별이 **정적 함수**라 사전 계산 가능) ② 세트 조각 배수 → `factor` ③ GHP 2품목 동시 → rule 1개 + target 2행 ④ 옵션 게이트 → `condition_json`(`optionEquals`/`optionIn`/`all`/`any`/`not`, `QuantitySyncRuleValidator.java:32-33·506-532`) + `inactive_behavior='ZERO'` ⑤ 집계는 전부 단순 합이라 `SUM`, 반올림 `NONE` 으로 충분.

### 5-2. 표현 **불가능**한 것 — 무엇이 부족한가

| # | 부족한 것 | 근거 | 검증 |
|---|---|---|---|
| 1 | **카테고리 어휘 불일치** — `chk_qsr_category={HOME_MULTI,SINGLE_SET,**COMM_MULTI**}` ↔ 노출 테이블 `COMMERCIAL_MULTI`. LEGACY·OTHER 는 rule 로 못 만듦 | CHECK 제약 직접 조회 | ☑ |
| 2 | **`source` 가 product_id 화이트리스트뿐 → "여집합" 의미가 반전** — 홈은 `/실외기/` 이름 매치, 싱글은 "전 세트 minus 예외". 시트에 새 실외기가 추가되면 **legacy 는 자동 포함, rule 은 조용히 제외**(200 OK 로 수량 0) | 이름 정규식 컬럼 부재 | ☑ |
| 3 | **`factor`·`multiplier` 가 0 을 못 가짐** (`>0 AND <=1000`) → `FOOT_FLAT` 리셋·seed 0·음수(절삭) 표현 불가 | CHECK 제약 | ☑ |
| 4 | **앱 축(usage_scope/app 컬럼)이 없음** — 그런데 estimate 와 order 가 **실제로 다른 답을 내고 있음**(5-1·5-2). 정본을 먼저 정하지 않으면 한쪽 앱 동작이 소리 없이 바뀜 | §5-0 | ✅ |
| 5 | **수동 잠금·트리거를 담을 자리가 없음** → rule 과 클라이언트 잠금이 **두 개의 진실원**이 됨 | `HOME_MANUAL_FOOT`·`COMM_MANUAL_BASE`·`MANUAL_QTY_LOCKS` | ☑ |
| 6 | **런타임 파싱이 사전 계산으로 굳음** — 시트 품명이 바뀌어도 자동 추종 못 함. **알려진 결함(5-3 선행 0)까지 함께 굳음** | `hasExactHP`·`parseSetHPs` | ✅ |
| 7 | **실행 엔진이 없음** — `quantity_sync_rule` **0행** ✅. 클라이언트 브리지는 `SINGLE_S03_CEILING_DRAIN_PUMP` **하나만** 받는 shadow 관측 전용(`clients/web/order-app/src/quantitySync.ts:110-125`), validator 에는 S-03 전용 하드코딩(`QuantitySyncRuleValidator.java:484-503`) | ☑ |
| 8 | **받침 전용 룩업이 데이터 어디에도 없음** — `branch_pipe_lookup`·`odu_recommendation_lookup` 은 있으나 실외기→받침 룩업 없음. 시트도 표현 수단 없음(`matchKind` 는 `'발통'` 만 FOOT · **홈멀티는 구성품 탭 자체가 없음**) | `ProductSheetSyncService.java:137-139·1089-1097` | ☑ |

### 5-3. 권고 (제 판단 — 확정 아님)

**상업멀티만 먼저 rule 로 옮기는 것**이 가장 적합합니다(정적 격자·enumerable·SUM·factor 로 전부 표현 가능). 홈·싱글은 §5-2 의 2번(여집합)과 4번(앱 드리프트)을 **업무 결정으로 먼저 닫지 않으면 조용한 누락**을 만듭니다. 이행 시 회귀 울타리로 `clients/web/legacy-quantity-golden/` 을 쓸 수 있으나 **가시성 축과 `unit='EA'` 실데이터 경로는 보호하지 않으므로**(§2-4) 그 두 축의 케이스를 먼저 추가해야 합니다.

---

## 6. 어느 로직도 안 쓰는 받침 품목

### 6-1. PM 이 센 15종 — **코드 참조 0 · 카탈로그 노출 0 (이중 부재)** ✅

`products.name ~ '(받침|방진|발통|일자발)'` 이면서 `product_estimate_exposure` 0건인 행을 전건 출력한 결과 **정확히 15건**이고 PM 브리핑과 완전 일치합니다(전부 `product_category` NULL · `usage_scope='NONE'`):

`00016 원터치형 베란다 실외기 받침대` · `00019 설치대 2단 발코니 받침대` · `00020 수냉식 방진프레임` · `01008 방진가대 볼트` · `AAAA-00013 받침대` · `AAAA-00034 실외기받침대` · `AAAA-00035 실외기실내받침대` · `AAAA-00036 2단 받침대` · `SZL-00014 방진가대(평치형)` · `ZENG-00021 실내기 받침대` · `ZENG-00023 중대형 실내기받침대` · `방진가대대` · `방진가대소` · `수냉식방진가대` · `전면토출방진가대`

- **실내기용이 섞여 있다는 지적도 확인**됩니다 — `ZENG-00021`·`ZENG-00023`·`AAAA-00035`. ✅
- 코드 참조 grep 전수 결과 **0건**. 히트는 전부 무관: `방진가대소`·`방진가대대` 는 **주석**뿐(`clients/web/order-app/index.html:2527·2541` · `tools/legacy-gas/거래처 발송 주문서/index.html:2276·2290` — `방진가대S2소`/`S2대` 블록 라벨) · `AAAA-00034` 는 테스트 픽스처 1줄(`services/product-service/src/test/java/…/EcountProductImporterIT.java:159`) · `00016`·`00019`·`01008`·`00020` 은 부분문자열 오탐. ☑
- 🚩 **브리핑 전제 정정**: 이 15종은 *"카탈로그에 있는데 코드가 안 쓰는 것 = 수동 입력 대상"* 이 **아닙니다**. `usage_scope='NONE'` · 노출 0 이라 **어느 탭에도 렌더되지 않아 수동 선택조차 불가능**합니다. 넣으려면 견적앱 기타 자유입력(`index.ejs:11441-11477`)으로 품명을 타이핑하는 길뿐이고, **주문앱에는 그 통로가 없습니다.** ✅

### 6-2. 🆕 제가 추가로 발견한 것 — `ACL-KORGHP` 계열 4종도 사장돼 있습니다 ✅

`ACL-KORGHP01`·`02`·`03`·`05` 가 `usage_scope='NONE'` · 노출 0 입니다. **GHP 저감장치 계열에서 노출된 것은 `07` 하나뿐**이고, `chooseBaseModel` 은 HP 무관하게 `07` 만 push 합니다(`index.ejs:4169-4171`). 실외기 용량이 16HP~50HP 로 넓은데 저감장치가 한 종류로 고정되는 것이 의도인지는 **업무 확인 대상**입니다.

### 6-3. **노출돼 있는데 자동 write 경로가 없는** 진짜 수동 입력 대상 = 3건 ✅

| 품목 | 노출 | 상태 |
|---|---|---|
| **발통세트** (COMMERCIAL_MULTI, order 339) | 상업 | `chooseBaseModel` 에 push 분기 **0줄**. 매 재계산마다 seed 0(`index.ejs:8410` 정규식이 상업 받침 7행 전부에 매치) → **상업 원형발통은 코드가 정하지 않음** |
| **SI-AL600a** (SINGLE_SET, 285) | 싱글 | `SS_FOOT_FLAT_ID` 가 `/SI-AL700a/` 로만 매치(`index.ejs:4541`) → 파생 대상 아님 |
| **SI-AL600A** (HOME_MULTI, 115) | 홈 | `FOOT_FLAT` dead(§3-2) → 자동 채움·자동 0리셋 어느 쪽도 없음. 동시에 품명이 "실외기 일자발" 이라 **발통 분모(`/실외기/`)에 자기 자신이 들어감** |

부속: `MDP-M075SGK1D`(상업 298)가 `PUMP_MAP` 에 없어 자동 대응 없음. ☑

### 6-4. 노출 받침 12행 + 단가 실측 (금액 영향 판단 재료) ✅ 2026-08-10 16:29 KST

| 카테고리 | order | 모델 | 품명 | 납품가 | 출고가 |
|---|---|---|---|---|---|
| COMMERCIAL_MULTI | 334 | 방진가대S2소 | S2 방진가대 소 | 160,000 | 240,000 |
| COMMERCIAL_MULTI | 335 | 방진가대S2중 | S2 방진가대 중 | **160,000** | **240,000** |
| COMMERCIAL_MULTI | 336 | 방진가대S2대 | S2 방진가대 대 | 220,000 | 240,000 |
| COMMERCIAL_MULTI | 337 / 338 | SI-AL600a / SI-AL700a | 실외기 일자발 (4~6HP / 8~12HP) | 20,000 / 25,000 | 동일 |
| COMMERCIAL_MULTI | 339 / 340 | 발통세트 / GHP방진가대 | 원형발통 세트 / **GHP 방진가대** | 0 / 330,000 | 0 / 330,000 |
| HOME_MULTI | 111 / 115 | 발통세트 / **SI-AL600A**(대문자) | 원형발통 세트 / 실외기 일자발 | 0 / 20,000 | 동일 |
| SINGLE_SET | 284 / 285 / 286 | 발통세트 / SI-AL600a / SI-AL700a | — | 0 / 20,000 / 25,000 | 동일 |
| (받침 아님) | 305 | ACL-KORGHP07 | **GHP 저감장치** | 6,710,000 | 6,710,000 |

- **소↔중 단가가 완전히 같습니다** ⟹ 14HP 경계 계열 불일치는 **견적 금액을 바꾸지 않습니다**. **중↔대만** 납품가 60,000원 차이(출고가는 동일) — 해당하는 것은 **30HP 냉방전용 상부토출**이고 실 카탈로그에 `AM300AXVGHC1`(단품)·`AM440AXVGHC1SY (14HP+30HP)` **2행이 실재**합니다. ✅
- **발통세트는 3카테고리 전부 0원** ⟹ 5-1 결함은 **수량·발주 내역에는 보이지만 견적 금액에는 안 보입니다**(더 늦게 발견될 유형).
- `SI-AL600A`(대문자, HOME_MULTI) ≠ `SI-AL600a`(소문자, SINGLE_SET) — **별개 두 품목**인데 코드 정규식은 전부 `/i` 라 문자열로 구분하지 못합니다. ☑✅

---

## 7. 개발책임자 확인 항목 — 선택지와 대가

> 아래 5건은 **PM 자율로 결정하지 않고** 올립니다. ①~③ 은 업무 규칙(어느 레거시가 정본인가)이고 ④⑤ 는 범위 결정입니다.

### ⓐ 30HP 냉방전용 상부토출의 받침 — 어느 레거시가 정본입니까 ✅

| 판본 | 30HP → | 좌표 |
|---|---|---|
| 종합견적서(견적앱의 조상) | **방진가대S2대** | `tools/legacy-gas/종합견적서/index.html:3768·3774` |
| 거래처발송 + **현행 견적앱·주문앱 3본** | **방진가대S2중** | `index.ejs:4184·4190` · `index.html:2538·2544` |

- 대가: 납품가 **60,000원/대** 차이. 대상 실외기 2행(`AM300AXVGHC1` 단품 · `AM440AXVGHC1SY` 세트 조각).
- 🚩주목할 점: **현행 견적앱이 자기 조상(종합견적서)이 아니라 거래처발송 규칙을 채택**했습니다. "완전계승" 기준에서 이것이 의도된 것인지 판단이 필요합니다.

### ⓑ 견적앱 ↔ 주문앱이 실제로 다른 답을 냅니다 — 어느 쪽이 정본입니까

| 축 | 견적앱 | 주문앱 | 성격 |
|---|---|---|---|
| 싱글 발통(§5-1) | **0개**(unit 게이트) | 정상 | 레거시 계승 + 데이터 미승계가 겹침 |
| 세트 전개(§3-1) | 통짜 평가 | 조각 분해 | 레거시 계승 |
| GHP 받침(§5-2) | 발행됨 | **도달 불가(3중)** | ①만 포팅 변경, ②③은 레거시 계승 |

- ☑ 각도2 정량화: 괄호+플러스 세트행 **84행 중 56행**에서 두 앱의 받침 다중집합이 다릅니다. 다만 **타깃별 발화 행 수는 양 앱 동일**(S2중 111·S2소 72·SI-AL600a 12·SI-AL700a 9·GHP 9·S2대 7) ⟹ 갈리는 것은 **커버리지가 아니라 수량**입니다.
- 대가: 정본을 정하지 않고 규칙 테이블로 이행하면 **한쪽 앱의 현 동작이 소리 없이 바뀝니다**(§5-2 #4).

### ⓒ `ACL-KORGHP07` 이 '받침대 제외'로도 빠지지 않는 것이 의도입니까

- 정규식 어디에도 안 걸립니다(`index.ejs:8529` · `index.html:5862`). 단가 **6,710,000원**이라 오차가 큽니다.
- 🔑 이미 골든이 이 동작을 **정답으로 고정**해 두었습니다(`goldens.js:96` `C-08-NO-BASE = {ACL-KORGHP07:2}`) ✅ — 즉 "결함"으로 고치면 **골든이 red 가 됩니다**. 의도 확인이 먼저입니다.

### ⓓ 선행 0 HP 토큰(§5-3)을 지금 고칠지, 규칙 이행 때 함께 흡수할지

- 현재 대상 **1행**(`AM280AXVSHH1SY`)뿐이라 즉시성은 낮으나, **규칙 테이블로 옮기면 이 결함이 사전 계산 값으로 굳습니다**(§5-2 #6).

### ⓔ 사장된 받침 품목 19종(15 + ACL-KORGHP 4종)을 어떻게 할지

- 선택지 A: 그대로 둠 — 대가: 노출 정규식이 `'받침대'` 를 **부분문자열**로 잡으므로(`index.ejs:8410·8529` 등), 이들이 나중에 상업에 노출되는 순간 **실내기 받침대까지 자동 0 리셋 대상으로 끌려 들어갑니다**. ☑
- 선택지 B: 정리(단종/삭제) — 대가: 이카운트 임포트 픽스처 등 참조 지점 확인 필요.
- 선택지 C: 노출 + 규칙 편입 — 대가: 실외기→받침 룩업이 **시트에도 DB 에도 없어**(§5-2 #8) 표현 수단부터 만들어야 합니다.

---

## 부록 A — 제가 이 보고서를 쓰며 직접 측정한 값 (2026-08-10 16:29~16:31 KST, `samhan-postgres`)

| 항목 | 값 |
|---|---|
| `products` | 전체 **3,063** / `is_deleted=false` **3,061** / **전건 `status='ACTIVE'`** / **`unit` 단일값 `'EA'`** |
| 노출(`products JOIN product_estimate_exposure`, `is_deleted=false`) | COMMERCIAL_MULTI **416**(원시) / **408**(`usage_scope` 적용) · HOME_MULTI **119** · LEGACY **40** · SINGLE_SET **288** |
| 상업에서 scope 로 빠지는 8행 | `PC4NBFK1NW`·`PC4NUXK1NW`·`PC6NUNK1NW`·`PC6NBDK1NW`·`PC6NBNK1NW`·`PC6EUCK1NW`·`PC6NUXK1NW`·`PC6EUXK1NW` — **전부 판넬** |
| LEGACY 40행 분류(`classification` 조인) | 부자재 19 · 실내기 12 · 판넬 8 · 실외기 1 — **받침 어휘 0건** |
| `quantity_sync_rule` | **0행** |
| `bundle_component` | OUTDOOR 408 · REMOTE 315 · MATERIAL 273 · INDOOR 271 · PANEL 250 · ACCESSORY 67 = **1,584** · **FOOT 0** |
| 받침 노출 | **12행**(상업 7 · 홈 2 · 싱글 3) + `ACL-KORGHP07`(받침 아님) |
| 미노출 받침 어휘 품목 | **15종**(PM 카탈로그와 완전 일치) + `ACL-KORGHP01/02/03/05` 4종 |
| 상업 괄호+플러스 세트행 | **84행** |
| 선행 0 HP 행 | **1행** (`AM280AXVSHH1SY 'DVM S2 고효율한랭지 28HP (08HP+20HP)'`) |
| 30HP 상부토출 | **2행** (`AM300AXVGHC1` 단품 · `AM440AXVGHC1SY (14HP+30HP)`) |
| `dc_config_db.estimate_configs` | `home_with_foot='f'` · `single_with_base='f'` |

## 부록 B — 검증하지 않은 범위 (**"검증됨"으로 집계하지 마십시오**)

- 대응표 약 30행 중 **PUMP_MAP 상업 실내기 22종 리터럴 전수** · 에어디자이너/제이시스템 `Code.js` 세부(`addBolt` dead 주장 포함) · `clearManualQtyLocks` `owns()` 세부 · `BundleExpander` 4:6 재배분 분기 — 결론(로직 실재·홈싱글 부재·스키마 부적합)을 바꾸지 않는 지엽이나 재현되지 않았습니다.
- **라이브 실행(라이브QA) 은 하지 않았습니다.** §5-0 의 3건은 **코드·데이터 근거**이고 실서버 재현이 아닙니다 — 이슈로 올릴 때 라이브 재현이 별도로 필요합니다.
- `goldens.js:31` ↔ `:54` 의 GHP 원천행 비대칭은 **원인 미상**입니다(§2-4).