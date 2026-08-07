# 2026-08-07 — 견적 화면 세트 옵션 picker 레거시 정찰

## ① 판정

**(가) 레거시 견적서에 세트 옵션 선택이 있다 → main 이 기능을 잃었다.**

근거의 자격: **① 레거시 원문 직독**.

레거시 `종합견적서/index.html`의 `renderSingleOptions()`는 견적 화면의 `#singleOpts`에 다음 입력 UI를 직접 생성한다.

- 유선리모컨 / 컬러유선리모컨
- 리모컨 제외
- 실외기 받침대 포함
- 판넬변경(판넬제외·블랙판넬·승강판넬·공청판넬)
- 360판넬(원형·사각)
- 자재 포함 여부(포함·별도)

따라서 레거시 견적 화면에 세트 구성 선택 UI가 존재한다. 이 보고서는 현재 코드의 주석·필드명·삭제 이력으로 판정하지 않았다.

## ② 인용 원문

### 레거시 견적 화면에 picker가 생성됨

파일: `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/index.html:7399-7420`  
SHA-256: `2321353EE221FB0FAAA345CB8CEAB331D2A747BF1753BB9F7C58EA4A4E15C5E2`

```text
7399:   const box = el('#singleOpts');
7400:   if(!box) return;
7401: 
7402:   if(box.querySelector('#ss_disc_360')) return;
7403: 
7404:   box.style.display = 'flex'; box.style.flexWrap = 'wrap'; box.style.gap = '8px'; box.style.alignItems = 'center';
7405:   box.innerHTML='';
7406:   
7407:   box.appendChild(numInp('360 할인', 'ss_disc_360', (window.DISCOUNT_360_AMT||0), 1000));
7408:   box.appendChild(numInp('4way 할인', 'ss_disc_4way', (window.DISCOUNT_4WAY_AMT||0), 1000));
7409:   box.appendChild(numInp('1way 할인', 'ss_disc_1way', (window.ONEWAY_DISCOUNT_AMT||0), 1000));
7410:   box.appendChild(numInp('스탠드 할인', 'ss_disc_stand', (window.DISCOUNT_STAND_AMT||0), 1000));
7411:   box.appendChild(numInp('디럭스 할인', 'ss_disc_deluxe', (window.DELUXE_DISCOUNT_AMT||0), 1000));
7412:   box.appendChild(numInp('1등급 할인', 'ss_disc_grade1', (window.FIRSTGRADE_DISCOUNT_AMT||0), 1000));
7413:   box.appendChild(sel('유선리모컨',['','유선리모컨','컬러유선리모컨'],SINGLE_DEFAULTS['유선리모컨']||'','ss_remote'));
7414:   box.appendChild(chk('리모컨 제외',!!SINGLE_DEFAULTS['리모컨 제외'],'ss_remote_ex'));
7415:   box.appendChild(chk('실외기 받침대 포함',!!SINGLE_DEFAULTS['실외기 받침대 포함'],'ss_base'));
7416:   box.appendChild(sel('판넬변경',['','판넬제외','블랙판넬','승강판넬','공청판넬'],SINGLE_DEFAULTS['판넬변경']||'','ss_panel'));
7417:   box.appendChild(sel('360판넬',['원형','사각'],'원형','ss_p360'));
7418:   box.appendChild(sel('자재 포함 여부',['포함','별도'],SINGLE_DEFAULTS['자재 포함 여부']||'별도','ss_mat'));
7419:   box.appendChild(chk('인상 전 단가', false, 'chkSingleInc'));
7420:   box.appendChild(chk('품목확장', false, 'ss_expand'));
```

### 선택이 표시 라벨에도 반영됨

파일: `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/index.html:10663-10723`  
SHA-256: `2321353EE221FB0FAAA345CB8CEAB331D2A747BF1753BB9F7C58EA4A4E15C5E2`

```text
10663: function getSingleSetOptionLabel(s) {
10664:   // 예외확인
10665:   var cls = (typeof classifySingleSetFixed === 'function') ? classifySingleSetFixed(s) : {};
10666:   var cat = String(cls.catL || s.catL || '');
10667:   if(cat === '부자재' || cat === '실외기 받침') return '';
10668:   if(/발통/.test(s.name||'')) return '';
10669: 
10670:   var opts = [];
10671:   
10672:   // 부품분해
10673:   var parts = [];
10674:   if (typeof partsForSetStrict_ === 'function') parts = partsForSetStrict_(s);
10675:   else if (typeof explodeSetParts === 'function') parts = explodeSetParts(s, 1, 0);
10676: 
10677:   // 리모컨
10678:   var hasRem = parts.some(function(p){ return /리모컨|remote/i.test(p.kind||p.name||''); });
10679:   var canRem = (typeof allowRemoteChange_ === 'function') ? allowRemoteChange_(s) : true;
10680:   if(hasRem){
10681:     var rEx = document.getElementById('ss_remote_ex');
10682:     var rSel = document.getElementById('ss_remote');
10683:     if(rEx && rEx.checked) opts.push('리모컨 제외');
10684:     else if(canRem && rSel && rSel.value && rSel.value !== '기본' && rSel.value !== '무선') opts.push(rSel.value);
10685:   }
10686: 
10687:   // 특성
10688:   var is4Way = /4way|4-way/i.test(s.name||'') || parts.some(function(p){ return /4way|4-way/i.test(p.name||''); });
10689:   var is360 = /360/.test(s.name||'') || parts.some(function(p){ return /360/.test(p.name||''); });
10690:   var hasPan = parts.some(function(p){ return /(판넬|패널|panel)/i.test(p.kind||p.name||''); });
10691: 
10692:   // 판넬
10693:   if(hasPan){
10694:     var pSel = document.getElementById('ss_panel');
10695:     if(pSel && pSel.value && pSel.value !== '기본' && pSel.value !== '선택 안함'){
10696:       var val = pSel.value;
10697:       
10698:       // 승강제한
10699:       if(val === '블랙판넬' || val === '승강판넬'){
10700:         if(is4Way || is360) opts.push(val);
10701:       } else {
10702:         opts.push(val);
10703:       }
10704:     }
10705:   }
10706: 
10707:   // 원형
10708:   if(is360){
10709:     var p360 = document.getElementById('ss_p360');
10710:     
10711:     // 원형표기
10712:     if(p360 && p360.value && p360.value !== '기본') opts.push(p360.value);
10713:   }
10714: 
10715:   // 자재
10716:   var isAC = /^AC/i.test(s.model||'');
10717:   if(!isAC){
10718:     var mSel = document.getElementById('ss_mat');
10719:     if(mSel && mSel.value === '포함') opts.push('자재포함');
10720:   }
10721: 
10722:   if(!opts.length) return '';
10723:   return ' (' + opts.join('/') + ')';
```

### 옵션이 견적 금액에 영향을 줌

파일: `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/index.html:4730-4755`  
SHA-256: `2321353EE221FB0FAAA345CB8CEAB331D2A747BF1753BB9F7C58EA4A4E15C5E2`

```text
4730:   const panelExcluded = (el('#ss_panel')?.value||'')==='판넬제외';
4731: 
4732:   let panelDelta=0;
4733:   if(basePanel){
4734:     const baseP=partUnitPrice(basePanel);
4735:     if(panelExcluded) panelDelta-=baseP;
4736:     else if(chosenPanel && chosenPanel.model!==basePanel.model){
4737:       panelDelta += (partUnitPrice(chosenPanel)-baseP);
4738:     }
4739:   }
4740: 
4741:   const baseRemoteRows = getDefaultRemoteRows(s);
4742:   let remoteDelta=0;
4743:   const remoteExcluded = !!el('#ss_remote_ex')?.checked;
4744:   const remoteOpt = el('#ss_remote')?.value||'';
4745:   const baseRemoteSum = baseRemoteRows.reduce((t,p)=>t+partUnitPrice(p),0);
4746: 
4747:   if(remoteExcluded){
4748:     remoteDelta -= baseRemoteSum;
4749:   } else if(remoteOpt && allowRemoteChange_(s)){
4750:     const cand = getOptionRemoteRow(s,remoteOpt);
4751:     if(cand){
4752:       const replace = baseRemoteRows.find(p=>/유선/i.test((p?.feat||'')+' '+(p?.name||''))) || baseRemoteRows[0];
4753:       if(replace) remoteDelta += (partUnitPrice(cand)-partUnitPrice(replace));
4754:       else remoteDelta += partUnitPrice(cand);
4755:     }
```

추가로 같은 파일의 `getRealSinglePrice()`는 `calcSetUnitPrice(s)`를 호출한다 (`:2240-2244`). 따라서 위 `panelDelta`·`remoteDelta`는 표시 전용이 아니라 세트 단가 계산 경로에 들어간다.

### 견적 → 전표 전환

레거시 견적 화면은 `buildSendRows()`로 품목 배열을 만들고, 그 배열을 `sendOrderFromUi(orderData)`에 넣는다.

파일: `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/index.html:10247-10252,10278-10292,10309-10326,10328-10329`  
SHA-256: `2321353EE221FB0FAAA345CB8CEAB331D2A747BF1753BB9F7C58EA4A4E15C5E2`

```text
10247:     // 전송할 품목 데이터 구성
10248:     var items = buildSendRows();
10249:     if (items.length === 0) {
10250:       alert('전송할 품목이 없습니다.');
10251:       return;
10252:     }
```

```text
10278:     // 서버 전송 객체 생성
10279:     var orderData = {
10280:       bizno: window.CURRENT_BIZNO || '',
10281:       custCode: custCode,
10282:       custName: custName,
10283:       due: document.getElementById('due').value,
10284:       payDue: document.getElementById('chkCardPay')?.checked ? '카드결제' : document.getElementById('payDue').value,
10285:       whCode: whCode,
10286:       addr: fullAddr,
10287:       addrAudit: fullAuditAddr,
10288:       receiver: document.getElementById('tel').value,
10289:       memo: document.getElementById('memo').value,
10290:       isMobile: typeof isMobileNow === 'function' ? isMobileNow() : false,
10291:       items: items
10292:     };
```

```text
10309:     // 서버 함수 호출
10310:     google.script.run
10311:       .withSuccessHandler(function(res) {
10312:         if(icon) icon.textContent = '✅';
10313:         var msg = (typeof res === 'object' && res.slipNo) ? res.slipNo : res;
10314:         if(txt) txt.textContent = '전표 생성 완료!\n(' + msg + ')';
        
10315:         setTimeout(function() {
10316:           if(dlg) {
10317:             if(dlg.close) dlg.close();
10318:             else dlg.style.display = 'none';
10319:           }
10320:         }, 2000);
10321:       })
10322:       .withFailureHandler(function(err) {
10323:         if(icon) icon.textContent = '⚠️';
10324:         if(txt) txt.textContent = '전표 생성 실패:\n' + err;
10325:         if(btns) btns.style.display = 'block'; 
10326:       })
10328:       .sendOrderFromUi(orderData);
10329:   });
```

`buildSendRows()`는 선택 라벨과 계산된 단가를 품목에 담는다.

파일: `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/index.html:10909-10924`  
SHA-256: `2321353EE221FB0FAAA345CB8CEAB331D2A747BF1753BB9F7C58EA4A4E15C5E2`

```text
10909:       // 라벨
10910:       const optLabel = getSingleSetOptionLabel(s);
10911:       const finalName = baseName + sizeTxt + gradeTxt + optLabel;
10912: 
10913:       const realPrice = getRealSinglePrice(s.id);
10914:       
10915:       // 출고가
10916:       const baseListP = getBaseListPrice('single', s.model, s.list || s.listLeft || 0);
10917:       const listP = getRealListPrice('SINGLE', s.id, baseListP);
10918: 
10919:       // 조건
10920:       if ((typeof SEND_AS_SET_IDS!=='undefined' && SEND_AS_SET_IDS.has(s.id)) || isAccessory || isSpecial || isSimple) {
10921:          singleRows.push({ 
10922:            type:'item', name:finalName, originalName:s.name, model:s.model, unit:s.unit||'식', 
10923:            qty:q, price:realPrice, sub:(q*realPrice),
10924:            list: listP
```

전환 수신부도 별도 `remoteOption`·`panelOption` 필드를 읽지 않고 `items`의 품목/가격을 전표 행으로 만든다.

파일: `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/Code.js:1762-1770,1853-1865`  
SHA-256: `2835750AAD33E2FEE1C89EBA72C9958BE057C2E187D14C580B4D578C30B3A200`

```text
1762: function sendOrderFromUi(data) {
1763:   try {
1764:     let items = [];
1765:     if (data && data.items) {
1766:       items = (typeof data.items === 'string') ? JSON.parse(data.items) : data.items;
1767:     }
1768:     const order = data;
1769:     const authInfo = order.auth || {}
1770:     const safeNum = s => String(s || '').replace(/[^\d]/g, '');
```

```text
1853:       SaleList.push({
1854:         BulkDatas: {
1855:           IO_DATE: ioDate,
1856:           UPLOAD_SER_NO: "1",
1857:           CUST: custFinal,
1858:           CUST_DES: custRec.name || '',
1859:           EMP_CD: empCdFinal || '',
1860:           WH_CD: whCd || '100',
1861:           IO_TYPE: "10",
1862:           PROD_CD: String(it.model),
1863:           PROD_DES: "",
1864:           SIZE_DES: sizeDes,
1865:           QTY: String(qty),
```

즉 레거시의 전이 방식은 별도 옵션 필드 이월이 아니라, 견적에서 선택된 구성품/표시 라벨/계산 단가가 `items`에 반영된 뒤 전표 행으로 전달되는 방식이다.

## ③ 찾아본 경로와 못 찾은 것

### 찾은 정본

- `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/index.html`
- `.claude/worktrees/gas-refresh/tools/legacy-gas/종합견적서/Code.js`
- `.claude/worktrees/t827/tools/legacy-gas/종합견적서/index.html`
- `.claude/worktrees/t827/tools/legacy-gas/종합견적서/Code.js`
- `.claude/worktrees/tgas2/tools/legacy-gas/종합견적서/index.html`
- `.claude/worktrees/tgas2/tools/legacy-gas/종합견적서/Code.js`

세 worktree의 두 정본 파일은 각각 바이트 동일했다.

| 파일 | SHA-256 |
|---|---|
| `종합견적서/index.html` | `2321353EE221FB0FAAA345CB8CEAB331D2A747BF1753BB9F7C58EA4A4E15C5E2` |
| `종합견적서/Code.js` | `2835750AAD33E2FEE1C89EBA72C9958BE057C2E187D14C580B4D578C30B3A200` |

### 함께 찾아본 보조 경로

- `docs/audit/gas-port-fidelity/종합견적서-audit-2026-06-09.md`
- `docs/dev-reports/`의 legacy-gas / gas-parity 계열 문서(특히 `2026-08-01-gas-parity-estimate.md`, `legacy-gas-reverify-2026-06-09.md`, `2026-07-28-legacy-gas-drive-refresh.md`)

보조 문서에는 최신 live export 미확보 기록이 있었지만, 이번 정찰에서는 지정 worktree의 `tools/legacy-gas/종합견적서` 원문을 확보하여 직접 대조했다. 별도로 확인하지 못한 레거시 견적 옵션 항목은 없다. `실외기 제외`라는 정확한 단일 라벨은 이 정본의 싱글 세트 picker에서 확인하지 못했으며, 확인된 관련 항목은 `실외기 받침대 포함`이다.

## ④ 새로 만든 파일 목록 (`git status --porcelain` 기준)

```text
?? docs/dev-reports/2026-08-07-1075-estimate-set-options-legacy-recon.md
```
