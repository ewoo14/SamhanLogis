# GAS 전수조사 모집단 — 함수 인벤토리 (분모 고정)

> 개발책임자 지시(2026-08-10) — *"GAS의 모든 로직을 전수조사하여 해당 법칙을 우리 스키마와 비교해 정규화하고 스키마로 이식"*, *"견적서와 주문서 모두"*, *"되도록 하나도 놓치지 않도록"*.
>
> 이 파일이 **분모**입니다. 각 조사 라운드는 배정된 범위의 **모든 항목을 분류**했음을 건수로 단정해야 합니다.
> 생성 = PM 직접 (기계 추출).

## `clients/web/estimate-app/views/index.ejs` — 19753줄 · 함수 642개

```text
1262: function makeRunner(){
1264: const target = function(){};
1289: Object.defineProperty(window.google.script, 'run', { get: function(){ return makeRunner(); } });
1290: window.google.script.host = { close: function(){}, setHeight: function(){}, setWidth: function(){} };
1291: window.google.script.url = { getLocation: function(cb){ cb({ hash: location.hash, parameter: {}, parameters: {} }); } };
1311: function isSlipPublishSuccess(res) {
2267:function getBaseListPrice(type, model, defaultVal) {
2282:function J(v,d){if(typeof v==='string'){try{const p=JSON.parse(v);return p==null?d:p;}catch(e){return d;}}return v==null?d:v;}
2291:function catalogSpecialMetadata(product) {
2300:function catalogSpecialSource(product) {
2368:function getModelFlags(model) {
2398:function getRealHomePrice(model) {
2403:function getRealCommPrice(model) {
2408:function getRealSinglePrice(id) {
2414:function getRealOldPrice(model) {
2440:function applyConfigFromServer(cfg) {
2463:function estimateConfigNumber(key, fallback) {
2468:function getOldDiscountPercent() {
2472:function getCardFeeRate() {
2476:function getVatDivisor() {
2480:function escapeEstimateHtml(s) {
2488:function escapeEstimateAttr(s) {
2491:function safeEstimateImageSrc(value) {
2508:function safeEstimateImageSrcAttr(value) {
2512:function escapeEstimateJsString(s) {
2520:function estimateOptionHtml(value) {
2524:function estimateSpecValueHtml(value) {
2527:function sanitizeLegacyTableHtml(html) {
2558:function getFooterNoticeHtml() {
2567:function applyEstimateTotalAdjustments(rows, opts) {
2585:function applyCustomerDiscounts(dc) {
2587: const numOr = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
2600: const useIHose = (dc.showIHose === true);
2613: const setField = (id, val) => {
2619: const setCheck = (id, val) => {
2646:function getRealListPrice(type, model, defaultVal) {
2675:function getRealSpec(type, model, defaultVal) {
2683:function handleSpecInput(e, type, key) {
2723:function makeSpecInput(val, type, key) {
2743:function handleListPriceInput(e, type, key) {
2834:function makeListPriceInput(val, type, key) {
2860:function handlePriceInput(e, type, key) {
2964:function makePriceInput(val, type, key) {
2991:function handleFreightInput(e, isCut, priceMap, qtyMap, model, recomputeFunc) {
3049:function numInp(label, id, def, step, cls) {
3096:function roundSel(prefix) {
3126:function parseFixedDc(dc){
3142:function isWallMountName(name){
3148:function getStockState_(note) {
3174:function modelExists(m){ return !!(m && homeRowByModel.has(m)); }
3176:function isPanelRow(r){
3177: const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
3181:function inferOneWaySize(nameLike){
3189:function isRemoteRow(r){
3190: const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
3193:function clearAllPanels(){
3196:function clearAllRemotes(){
3201:function pickPanelBy(kind, wifi, opt){
3202: const has = (r, rx) => rx.test(((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase());
3204: const text = (((r?.name||'')+' '+(r?.disp||'')).toLowerCase());
3212: const wantAir = (opt==='공청판넬');
3213: const wantAI = (opt==='인피니트 공청+동작감지 AI');
3215: const t=(rr?.name||'');
3242:function cleanDisplayName(rawDisp,rawName){
3250:function stripCommKeywords(s, row){
3272:function displayOverrides(s,scope){
3284:function adjustSingleSetBasePrice(s, base){
3290: const isAcc = (s.catL === 'acc') ||
3317:function roundK(n){
3323:function roundByConfig(n, prefix){
3346:function isIndoorUnitPart(p){
3359:function isOutdoorUnitPart(p){
3370:function splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut){
3384: const mod = ((outdoor % 1000) + 1000) % 1000;
3398:function analyzeSingleSetDiscountFlags(s){
3403: const isAcc = (s.catL === 'acc') ||
3428:function closeSpecModal(){
3432:function getSpecModelName(){
3438:function getSpecModalCanvas(){
3463:function copySpecImage(){
3477:function saveSpecImage(){
3486:function openSpecModalByItem(item, scope){
3495: const isErv = (scope==='comm' && M==='전열교환기');
3532:function formatSpecialPriceForDisplay(currentPrice, formatter) {
3537:function renderHomeSpec_(catL, item, s){
3579:function renderSingleSpec_(catL, item, s){
3675:function renderCommSpec_(catL, item, s){
3684: const isSetOutdoor = (catL==='실외기' && String(item?.unit||'').toUpperCase()==='SET');
3687: const compParts = (catL==='실외기') ? (explodeCommSets_(item, 1) || []) : [];
3782:function renderErvSpec_(s){
3792: const join_ = (...vals) => {
3826:function renderPanelSpecCommon_(catL, p){
3838:function buildTripleSpecRows_(title, raw, labels){
3853:function specTableWithTriple_(rows, pipeTriple, dropTriple, opt){
3865: const val = (r[1] === undefined || r[1] === null || String(r[1]).trim() === '') ? '-' : r[1];
3894: const tVal = (t.value === undefined || t.value === null || String(t.value).trim() === '') ? '-' : t.value;
3904:function renderComponentSpecs_(parts, setSpec, scope){
3906: const s = (setSpec && typeof setSpec === 'object') ? setSpec : {};
4003: const head = (kind ? '[' + kind + '] ' : '') + (model || name) + (model && name ? ' · ' + name : '');
4018:function specTable_(rows, opt){
4027: const val = (r[1] === undefined || r[1] === null || String(r[1]).trim() === '') ? '-' : r[1];
4039:function rawNameOf(r){
4044:function isCommIndoorRow(r){
4050:function isCommOutdoorRow(row){
4056:function commIndoorKind(r){
4066:function isCommPanelRow(r){
4067: const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
4072:function isCommHoseRow(r){
4073: const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
4078:function isCommRemoteRow(r){
4079: const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
4084:function isCommPumpRow(r){
4085: const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
4090:function computeCommRemoteModelForIndoor_(row){
4092: const opt = (document.getElementById('comm_remote')?.value) || '무선';
4122:function pickHoseModel(kind){
4130:function pickCommPanelModel(kind){
4137:function hasExactHP(nm, hp){
4143:function parseSetHPs(nm){
4150:function chooseBaseModel(nm){
4195:function basesForSetPiecesByExistingRule_(row){
4207:function modelByNameLike(keyword){
4212: const row = (COMMULTI||[]).find(r=>{
4213: const s = ((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||''));
4220:function countBranchForSet(nm){
4224: const plus = (s.match(/\+/g)||[]).length;
4237:function rgbForMid(M,L){
4250:function applyHomeMultiPriceVat(it, cfg){
4257:function normalizeHomeCategory(row){
4272:function isExpansionModel(s) {
4285:function classifySingleSetFixed(s){
4286: const hay=((s?.name||'')+' '+(s?.model||'')+' '+(s?.spec||'')).toLowerCase();
4287: const mdl=(s?.model||'').trim();
4326:function priceFrom(obj, { priceKeys = ['price','unitPrice','priceRight'], listKeys = ['list','출고가','listPrice','msrp','wholesale','출고가Left','li
4328: const first = (o, ks) => {
4344:function homeUnitPrice(model){
4379: const finalRate = (parsedFixed !== null) ? parsedFixed : globalRate;
4390:function partUnitPrice(p){
4405:function singleUnitPrice(it){
4421: const isAcc = (it.catL === 'acc') ||
4442: const calc = (val, rateAmt) => Math.max(0, val - rateAmt);
4455:function commUnitPrice(model){
4456: const r = (COMMULTI||[]).find(x=>x.model===model);
4490: const finalRate = (parsedFixed !== null) ? parsedFixed : globalRate;
4501:function singleDispNameTrimmed(s,cls){
4508: const size=(s?.sizeText&&String(s.sizeText).trim())||(s?.size||'');
4520:const _HOSE_I_ANY=(HOMEMULTI.find(r=>/유연호스.*(I형|아이형)(?!.*(1\s*-?\s*WAY|4\s*-?\s*WAY|1WAY|4WAY))/i.test(r?.name||''))||{}).model||(HOMEMULTI
4522:const FOOT_ROUND=(HOMEMULTI.find(r=>/원형발통\s*세트|발통세트/i.test(r?.name||''))||{}).model||'';
4523:const FOOT_FLAT=(HOMEMULTI.find(r=>/SI-AL700a/i.test(r?.model||''))||{}).model||'';
4524:const REMOTE_WIRED=(HOMEMULTI.find(r=>/유선\s*리모컨(?!.*컬러)/i.test(r?.name||''))||{}).model||null;
4525:const REMOTE_WIRED_COLOR=(HOMEMULTI.find(r=>/컬러\s*유선\s*리모컨/i.test(r?.name||''))||{}).model||null;
4526:const REMOTE_WIRED_KIT=(HOMEMULTI.find(r=>/(유선\s*리모컨\s*키트|유선\s*키트|리모컨\s*키트)/i.test(r?.name||''))||{}).model||null;
4527:const REMOTE_WIRELESS=(HOMEMULTI.find(r=>/(AR-EC05|무선\s*리모컨|무선리모콘)/i.test(r?.name||''))||{}).model||null;
4529:const REMOTE_INF_DEFAULT=(HOMEMULTI.find(r=>/(AR-?CH01)/i.test(r?.model||'')||/인피니트.*리모컨/i.test(r?.name||''))||{}).model||null;
4530:const REMOTE_COLOR_AIRCOMBO=(HOMEMULTI.find(r=>{const n=String(r?.name||'');return /리모컨/i.test(n)&&/에어콤보/i.test(n)&&!/무선/i.test(n);})||{}
4538:const SS_WIRED_BOARD_ID=(SINGLE_SETS.find(s=>/유선보드/i.test(s?.name||'')||/AIM-?A01N/i.test(s?.model||''))||{}).id||null;
4539:const SS_CEILING_PUMP_ID=(SINGLE_SETS.find(s=>/(실링용\s*)?드레인펌프/i.test(s?.name||'')&&/실링/i.test(s?.name||''))||{}).id||null;
4540:const SS_FOOT_ROUND_ID=(SINGLE_SETS.find(s=>/발통세트/i.test(s?.model||'')||/발통세트/i.test(s?.name||''))||{}).id||null;
4541:const SS_FOOT_FLAT_ID=(SINGLE_SETS.find(s=>/SI-AL700a/i.test(s?.model||''))||{}).id||null;
4546:function markAutoHome(...m){m.filter(Boolean).forEach(x=>AUTO_HOME_MODELS.add(x));}
4547:function markAutoSingle(...ids){ids.filter(Boolean).forEach(x=>AUTO_SINGLE_IDS.add(x));}
4560:const trackInteraction = (e) => {
4605:function applyAbsoluteLock(mapObj) {
4630: set: function(val) {
4648: set: function(val) {
4666:const sumHome=()=>Array.from(homeQty.entries()).reduce((s,[m,q])=>s+(getRealHomePrice(m)||0)*(q||0),0);
4667:const sumSingles=()=>SINGLE_SETS.reduce((s,x)=>s+((getRealSinglePrice(x.id)||0)*(singleQty.get(x.id)||0)),0);
4668:const sumComm = () =>
4673:function syncCommTotals(){
4689:function setFootSum(){
4710:function bindQty(sel,onChange){
4732:function bindCommQtyEvents() {
4748: const s = ((rec.name || '') + ' ' + (rec.disp || '') + ' ' + (rec.model || '')).toLowerCase();
4758: const s = ((rec.name || '') + ' ' + (rec.disp || '') + ' ' + (rec.model || '')).toLowerCase();
4814: const s = ((rec.name || '') + ' ' + (rec.disp || '') + ' ' + (rec.model || '')).toLowerCase();
4859:function bindCommQtyArrowNav(){
4880:function getCapacity(r){
4887:function updateHomeRatio(){
4961: const ratio = (inCap / outCap) * 100;
4974:function updateCommRatio(){
5016: const missingBranch = (inCount - outCount) - branchCount;
5041: const ratio = (inCap / outCap) * 100;
5064:function setPreviewFoot(sum){
5080:function materialsSumForSet(s){
5081: const includeMat=(el('#ss_mat')?.value||SINGLE_DEFAULTS['자재 포함 여부'])==='포함';
5085:function isDefaultComponent_(p){
5089:function getDefaultRemoteRows(s){return partsForSetStrict_(s).filter(p=>(/리모컨/.test(p?.kind||'')||/리모컨/.test(p?.name||''))&&isDefaultComponent_
5090:function getOptionRemoteRow(s,opt){
5097:function allowRemoteChange_(s){
5101:function is1WaySet_(s){
5102: const t=(s?.name||'')+' '+(s?.model||'');
5106:function getBasePanelRow(s){return partsForSetStrict_(s).filter(p=>/(판넬|패널)/.test((p?.kind||'')+(p?.name||''))).find(isDefaultComponent_)||null;}
5107:function pickPanelRow(s){
5124:function setBasePriceRightFirst(s){
5134:function calcSetUnitPrice(s){
5149: const panelExcluded = (el('#ss_panel')?.value||'')==='판넬제외';
5192:function partsForSetStrict_(s){return SINGLE_PARTS.filter(p=>(p?.setModel||'')===(s?.model||''));}
5199:function explodeSetParts(s, qty, setUnitOverride){
5203: const includeMat = (el('#ss_mat')?.value || SINGLE_DEFAULTS['자재 포함 여부']) === '포함';
5335:function partsForCommSet_(setModel){
5337: const rows = (COMM_PARTS || []).filter(p => {
5346:function inferStandCountForOutdoor_(setModel, qty){
5353:function recalcCommAccessories(){
5355: const outdoorModels = (COMMULTI||[]).filter(r=>isCommOutdoorRow(r)).map(r=>r.model);
5382:function escapeFilterRe_(s){
5386:function applyHomeFilter(rows){
5388: const text = (st.text||'').trim();
5407:function applySingleFilter(rows){
5409: const text = (st.text||'').trim();
5427:function applyCommFilter(rows){
5429: const text = (st.text||'').trim();
5449:function updateHomeFilterOptions(){
5454: const text = (HOME_FILTER.text||'').trim();
5511:function updateSingleFilterOptions(){
5515: const text = (SINGLE_FILTER.text||'').trim();
5522: const size = (s?.sizeText && String(s.sizeText).trim()) || (s?.size||'');
5565:function updateCommFilterOptions(){
5575: const text = (COMM_FILTER && COMM_FILTER.text || '').trim();
5675:function initFilters(){
5689: const syncIcon=()=>{const v=(homeT.value||'').trim();if(icon) icon.style.display=(document.activeElement===homeT||v)?'none':'inline';};
5703: const syncIcon=()=>{const v=(singleT.value||'').trim();if(icon) icon.style.display=(document.activeElement===singleT||v)?'none':'inline';};
5719: const syncIcon=()=>{const v=(commT.value||'').trim();if(icon) icon.style.display=(document.activeElement===commT||v)?'none':'inline';};
5728:function renderHome(){
5812: const groupTop=(key!==prevKey);prevKey=key;
5971: const updateHomeRowPrice = (model, tr) => {
6047:function renderSingleSetParts(s, setQty) {
6087: const pKey = (p.model || p.name || '').trim();
6103: const getRank = (p) => {
6104: const k = (p.kind || p.name || '').toLowerCase();
6135: const pKey = (p.model || p.name || '').trim();
6171: const baseP = (typeof SINGLE_PARTS !== 'undefined') ? SINGLE_PARTS.find(sp => sp.model === p.model) : null;
6234:function renderSingle(){
6244: const size = (s?.sizeText && String(s.sizeText).trim()) || (s?.size||'');
6299: const currentPrice = (typeof singleCustomPrices !== 'undefined' && singleCustomPrices.has(s.id)) 
6304: const groupTop=(key!==prevKey); prevKey=key;
6306: const szVal = (s?.sizeText && String(s.sizeText).trim()) || (s?.size||'');
6312: const idx=(row.M?row.mIndex:row.lIndex)||0;
6377: const isManual = (qty !== 0);
6454: const realId = (sObj && sObj.id !== undefined) ? sObj.id : id;
6522:function buildSingleSetCompositionHtml_(s){
6590:function normalizeCommCategory(r){
6598:function fixCommMidCategory(r){
6607:function onCommOptionChange(controlId) {
6623:function renderCommOptions() {
6678:function getCommFilterRows_(){
6734:function renderComm(){
6783: const isEcoOutdoor = (L === '실외기') && /\bECO\b/i.test(M || '');
6823: const currentPrice = (typeof commCustomPrices !== 'undefined' && commCustomPrices.has(r.model)) 
6828: const groupTop = (key !== prevKey); prevKey = key;
6906: const sText = ((r.name || '') + ' ' + (r.disp || '') + ' ' + (r.model || '')).toLowerCase();
6993: const updateCommRowPrice = (model, tr) => {
7037: const s = ((rec.name||'')+' '+(rec.disp||'')+' '+(rec.model||'')).toLowerCase();
7055: const s = ((rec.name||'')+' '+(rec.disp||'')+' '+(rec.model||'')).toLowerCase();
7123:function buildDisplayNameComm(r, row){
7161:function displayNameForRow(row){
7172:function normKey(s){
7178:function buildCommSetIndex(){
7181: const src = (window.COMM_PARTS) || (window.COMM_MULTI_CONFIG) || (window.COMMSET) || (window.COMMCONFIG) || (window.COMMMULTI_CONFIG) || [];
7190: const qty = (parseInt(String(x['수량'] || x.qty || x.QTY || x.amount || x['구성수량']).replace(/[^\d-]/g,''),10) || 1);
7193: const price = (parseInt(String(x['출고가'] || x.unitPrice || x.price).replace(/[^\d-]/g,''),10) || 0);
7203:function explodeCommPreviewParts(setModel, setQty){
7210: const unitPrice = (typeof commUnitPrice === 'function' ? (commUnitPrice(p.model) || 0) : 0) || p.price || 0;
7216:function isCommSetRow(r){
7221:function explodeCommSets_(setRow, setQty){
7240: const mainSpec = (setHeader && setHeader.spec) ? setHeader.spec : '';
7268:function renderCommSetParts(setModel, setQty){
7293: const effQ = (parseInt(setQty, 10) || 0) * defQ;
7380:function renderOldOptions() {
7423:function renderOld(){
7472: const isManual = (q > 0);
7563:function sumOld(){
7587:function syncOldTotals(){
7604:function isMobileNow(){
7605: const vv = (window.visualViewport && window.visualViewport.width)
7612:function initMobileUI(){
7613: const apply = ()=> onViewportChange(isMobileNow());
7630:function onViewportChange(isMobile){
7656:function enterMobile(which){
7677:function updateTopControls(){
7712:function onHomeQtyInput(model, v) {
7761:function onSingleQtyInput(id,v){
7763: const key = (s && s.id !== undefined) ? s.id : id;
7784:function chk(label,def,id){const w=document.createElement('label');w.className='chip';const c=document.createElement('input');c.type='checkbox';c.id=id;c.c
7785:function sel(label,arr,def,id){const w=document.createElement('label');w.className='chip';w.appendChild(document.createTextNode(label+' '));const s=documen
7788:function renderHomeOptions() {
7831:function renderSingleOptions() {
7958:function recomputeFootAll() {
7971:function recomputeSingleBaseFoot(){
8012:function recomputeSingleExtras(){
8037:function isHomeCalcTriggerModel(model){
8048:function isSingleCalcTriggerId(id){
8073:function findHomePanelModel(kind, wifi){
8074: const has = (r, rx) => rx.test(((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase());
8088:function pickInfinitePanelModel(size, opt){
8103:function inferInfiniteSize(nameLike){
8112:function recomputeHomePanels() {
8159: const setP = (m, q) => {
8174: const useAir = (opt === '공청판넬' || opt === '인피니트 공청+동작감지 AI');
8225:function recomputeHomeRemotes() {
8248: const setR = (m, q) => {
8255: const R_WE = (HOMEMULTI.find(r => /^AWR-WE13N$/i.test(r?.model)) || {}).model;
8256: const R_WG = (HOMEMULTI.find(r => /^AWR-WG00N$/i.test(r?.model)) || {}).model;
8257: const R_CH = (HOMEMULTI.find(r => /^AR-CH01$/i.test(r?.model)) || {}).model;
8265: const main = (opt === '유선') ? R_WE : R_WG;
8272:function recomputeHomeBranches() {
8274: const setB = (m, q) => {
8333:function recomputeHomeDerived(updateUI) {
8354: const setH = (m, q) => {
8390:function recomputeCommDerived() {
8392: const requireCommCatalogRow_ = (model, reason) => {
8393: const row = (COMMULTI||[]).find(x=>x.model===model);
8409: const s = ((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
8536: const s = ((r.name||'')+' '+(r.disp||'')+' '+(r.model||'')).toLowerCase();
8556: const isSpecialRemote = (m === 'AWR-WE13N' || m === 'AWR-VH12N');
8607:function has_(s, re){ return re.test(String(s||'')); }
8608:function computeCommPanelModelForIndoor_(row){
8610: const panelOpt = (document.getElementById('comm_panel')?.value)||'기본판넬';
8630: const swap = (base)=>{
8694:function syncHomeUIFromState() {
8770:function syncSingleUIFromState(){
8834:function syncHomeTotals(){
8849:function syncSingleTotals(){
8865:function refreshSelectedBadge() {
8952:function getSetUnitNowById(id){
8966:function explodeSendSets_(s, q){
8971: const isAccessory = (catL === '부자재' || catL === '실외기 받침');
8998:function openPreview() {
9009:function closePreview() {
9018:function openFinal() {
9031:function closeFinal() {
9040:function ensureKakaoPostcode(){
9049:function mountAddrSheet(){
9096: const fit = ()=>{
9115:function isValidTel(v){
9119:function syncAuditFromShip_(){
9126:function toggleSameAddr_(){
9154:function syncBizAddr(){
9171:function checkOrderReady(){
9188:function aggregateSendRows(rows){
9229:function showSector(sec){
9233: const el = (s) => document.querySelector(s);
9249:function startAuth() {
9278:function showAuthFail() {
9286:function initGate() {
9340:async function showResetProgress(resetFunc) {
9357:function bindResetButtons() {
9378:function buildSendRows(){
9391: const fullAddr = (getVal('addrBase') + ' ' + getVal('addrDetail')).trim();
9396: const addP = (arr, isOld = false) => {
9419: const getActiveFixedDc = (sec, key, staticVal) => {
9439: const getLiveSpec = (sec, key, def, isRem) => {
9684:function extractSpecs(item) {
9687: const add = (label, val) => {
9713: const join_ = (...vals) => vals.map(clean_).filter(Boolean).join(' / ');
9840:function openSelectedSpec() {
9842: const addIfTarget = (model, name, catL, type, catM, raw, sourcePriority, pageIndex) => {
9962:function getSpecCanvas() {
9990:function copySelectedSpec() {
10006:function saveSelectedSpec() {
10017:function forceOrderTitle(){
10026:function clearFilterInput(id) {
10036:function resetHome() {
10050: const el = (s) => document.querySelector(s);
10100:function resetComm() {
10129: const setVal = (id, v) => {
10133: const setChk = (id, v) => {
10152: const el = (s) => document.querySelector(s);
10181:function resetBranch() {
10226:function resetSingle() {
10279:function resetOld() {
10310:function initEvents() {
10311: const el = (sel) => document.querySelector(sel);
10316: const getKstToday = () => {
10361: const bindTap = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', fn); };
10426: const bindOrderHotkeys = () => {
10479:function updateInlineTotals(){
10497:function fixFootersForMobile(isMobile){
10659:function fitTableWrap(wrapSelector){
10667: const vh = (window.visualViewport && window.visualViewport.height)
10691:function fitAllTables(){
10699:function call(fn, ...args){ if(typeof fn === 'function') return fn(...args); }
10701:function setText(q, v){ const t = el(q); if(t) t.textContent = v; }
10703:function fmtOrRaw(x){ return typeof fmt === 'function' ? fmt(x) : x; }
10705:function valuesOf(m){ return m && typeof m.values === 'function' ? Array.from(m.values()) : []; }
10708:function goOrderInfo() {
10722:function goPreview() {
10786:function goFinal() {
10804:function clearAllActiveClasses() {
10813:function getSelectedTotalCount() {
10827:function goHome() {
10839:function goSingle() {
10851:function goComm() {
10870:function goOld() {
10884:async function copyToClipboardImage() {
10923:async function downloadFile(type) {
10989:function getSingleSetOptionLabel(s) {
11053:function getSingleSetOptionLabelLive(s) {
11064: const hasPart = (rx) => activeParts.some(text => rx.test(text));
11081:function getStructuredQuoteData() {
11218: const sSpec = (specData && specData.single) ? specData.single : {};
11226: const hay = ((s.nameRaw || '') + ' ' + (s.spec || '')).toUpperCase();
11431: const getCustoms = (type, title, subLabel, hasList, unit, secId) => {
11478:function getVatLabel() {
11495:function syncVatCardPv() {
11517:function syncVatFromOrderInfo() {
11526:function getQuoteItemBgColor(r, secId) {
11579:function renderPreviewContent() {
11661: const fmt = (n) => (n ? Number(n).toLocaleString() : '0');
11681: function parseRatioText(el) {
11854:async function processPCExport(type) {
11965: const hVal = (typeof HOME_RATIO_VAL !== 'undefined') ? HOME_RATIO_VAL : '';
11966: const hLim = (typeof HOME_RATIO_LIMIT !== 'undefined') ? HOME_RATIO_LIMIT : 0;
11967: const cVal = (typeof COMM_RATIO_VAL !== 'undefined') ? COMM_RATIO_VAL : '';
11968: const cLim = (typeof COMM_RATIO_LIMIT !== 'undefined') ? COMM_RATIO_LIMIT : 0;
12028: const borderR = (idx === colHeaders.length - 1) ? B_SIDE : `1px solid ${B_IN_COLOR}`;
12029: const bg = (showList && text === '출고가') ? '#eff6ff' : BG_HEAD;
12030: const clr = (showList && text === '출고가') ? '#1e40af' : C_TXT;
12158: callback: function(doc) {
12209:function escapeBOCsvField(val) {
12219:async function processBOCSVExport() {
12255: const model = (r.model || '').toString().trim();
12260: const nameStr = ((r.originalName || '') + ' ' + (r.name || '')).replace(/\s+/g, '');
12301:function renderMainScreenDate() {
12323:function openSaveOptions() { document.getElementById('saveOptionsOverlay').classList.remove('hidden'); }
12324:function closeSaveOptions() { document.getElementById('saveOptionsOverlay').classList.add('hidden'); }
12327:function renderFinalContent() {
12375: const currentSub = (it.qty || 0) * (it.price || 0);
12392:function makeFinalSortable() {
12399: const onStart = (e) => {
12434: const onMove = (e) => {
12471: const onEnd = () => {
12495: const moveAt = (e) => {
12522: const bindNav = (id, targetSelector) => {
12548:function bindViewSwitchButtons(){
12607:const _toInt = (typeof toInt==='function') ? toInt : v=>{
12613:function capFromModel(model){
12619:function pickSelectedOutdoors(){
12620: const rows = (COMMULTI||[]).filter(r=>{
12641:function pickSelectedIndoorsExpanded(){
12642: const rows = (COMMULTI||[]).filter(r=>{
12669:function codeByCumulativeSum(csum){
12679:function codeByOutdoorHP(hp, def){
12692:function recomputeBranchCodes(outsArg){
12748: const k=(c.dataset.code||'').trim(); if(k in totals) totals[k]+=1;
12762:function ensureBranchScaffold(){
12810:function syncCommQtyFromDOM(){
12819:function goBranchPage(){
12848:function backToComm(){
12869:function updateBranchTopButton(){
12878:function handleBranchToggleClick(){
12884:function renderBranchTable(outs, inds){
12929:function makeCapsule(model, cap, inGrid){
12941:function fixBranchDOM(){
12950:function wireBranchInput(){
12968:function makeBranchColumnSortable() {
13037: const applyFlip = (el, oldLeft) => {
13089:function packOutColumn(key){
13122:function updateBranchVisuals(){
13174:function repackLeft(){
13190:function pushBackToLeft(model, cap){
13198:function buildBranchView(){
13219:function packAllOutColumns(){
13225:function updateBranchRatios(){
13278:function snapshotBranchState(){
13311:function pushBranchPartsToCommFromBadges(){
13319: const k=(c.dataset.code||'').trim();
13341:function saveBranchState(){
13349:function loadBranchState(){
13354:function applyBranchState(st){
13429:function refreshBranchOpenButton(ctx){
13430: const mActive = (typeof window.mobileActive !== 'undefined') ? window.mobileActive : null;
13436: const isVisible = (sec === 'comm' || sec === 'branch');
13459: const cat = (row.catL || row['대분류'] || '').trim();
13481:function refreshBranchButton() {
13537:function prepareGateImages(images) {
13557:function showGateImageModal() {
13618:function updateImgSlide() {
13633: function isIndoorOnly() {
13661: function getTierBonusRate(sum) {
13670: function isStandard45(rate) {
13675: function runWithAdjustedRates(callback) {
13691: const hSum = (typeof sumHome === 'function') ? sumHome() : 0;
13698: const cSum = (typeof sumComm === 'function') ? sumComm() : 0;
13788: const toYMD = (d) => {
13813:function closeHistory() {
13829:function enforceDateLimit(changedId) {
13861:function loadHistory() {
13884:function renderHistoryTable(data) {
13922:function getSlipInnerContent(d) {
13933: const getMMDD = (isoDate) => isoDate ? isoDate.slice(5).replace('-', '/') : '';
14052:function openSlipModal(idx) {
14109:function closeSlipModal() {
14115:function updateSlipScale() {
14132:async function handleSlipCopy() {
14169:async function handleSlipSave(type) {
14213: const x = (pageWidth - finalWidth) / 2;
14214: const y = (pageHeight - finalHeight) / 2;
14239:function numberToKorean(num) {
14274:function getInvoiceInnerContent(d, priceMap) {
14275: const safeLogoSrc = (typeof samsungLogo !== 'undefined' && samsungLogo) ? safeEstimateImageSrcAttr(samsungLogo) : '';
14276: const safeStampSrc = (typeof stamp !== 'undefined' && stamp) ? safeEstimateImageSrcAttr(stamp) : '';
14455:function openInvoiceModal(idx) {
14500: const updateScale = () => {
14515:async function handleInvoiceCopy() {
14543:async function handleInvoiceSave(type) {
14568: const x = (pw - w) / 2;
14569: const y = (ph - h) / 2;
14590:function logAction(group, msg) {
14611:function relocateUI(isMobile){
14752:function updateTopControls(){
14773:function toggleDrawer(mode) {
14814:function handleResize(){
14823:function getCurrentSlipSnapshot() {
14867:function toggleSlipButton() {
14895: const isAuditOk = (sameAddr && sameAddr.checked) || (auditLater && auditLater.checked) || (addrAuditBase && addrAuditBase.value.trim());
14913: const isPayOk = (chkCardPay && chkCardPay.checked) || (payDueStar && payDueStar.checked) || (payDuePre && payDuePre.checked) || (payDue && payDue.value.t
14961:function initValidationEvents() {
14989:function initOrderCard() {
15070: const syncAudit = () => { if(document.getElementById('sameAddr')?.checked) syncAuditFromShip_(); };
15093:function openAddrSearch(targetType, source) {
15110:function openAddrDock_(src, isMobile) {
15148:function onKakaoAddrComplete(data) {
15157:function applyAddrToTarget(addr) {
15174:function runNaverLocalSearch(showLoading) {
15178: const q = (input.value || '').trim();
15206:function scheduleNaverAutoSearch() {
15210: const v = (input.value || '').trim();
15220:function escapeHtmlAddr(s) {
15227:function onNaverSearchSuccess(res, queryText) {
15267:function makeAddrRow_(label, text, fullAddr) {
15285:function composeAddrWithBuilding_(addr, name) {
15295:function dedupeAddrWords_(text) {
15308:function onNaverSearchFail(err) {
15316:function toggleSameAddr() {
15341:function toggleAuditLater() {
15365:function togglePayDueCb(type) {
15395:function updateOrderTags() {
15435:function enforceTagsOnInput(e) {
15482:function appendMemo(text) {
15498:function checkCardValid() {
15503:function resetCardData() {
15511: const setVal = (id, v) => {
15545: const setChk = (id, v) => {
15607:function decodeSnapshotState(data) {
15620:function loadOrderData(savedBase64String) {
15633:function submitOrderCard() {
15638: const getEl = (id) => document.getElementById(id);
15639: const getVal = (id) => {
15670: const fullAddr = (getVal('addrBase') + ' ' + getVal('addrDetail')).trim();
15673: const getInputVal = (id) => {
15695: const fmtPct = (r) => Math.round(r * 100) + '%';
15696: const fmtMoney = (n) => {
15715: const getCanonicalSection = (s) => {
15968: const errorMsg = (res && typeof res === 'object' && res.error) ? res.error : '전표 생성 실패';
15975: const slipNo = (res && res.slipNo) ? res.slipNo : (typeof res==='object'?'':res);
16013:function initCustomerSearch() {
16059: const targets = (typeof CUSTOMERS !== 'undefined') ? CUSTOMERS : [];
16075: const addrShort = (c.addr || '').split(' ').slice(0, 3).join(' ');
16118: function addActive(x) {
16127: function removeActive(x) {
16131: function closeAllLists(elmnt) {
16144:function getManagerName_(manager) {
16148:function getManagerCode_(manager) {
16152:function initManagerSearch() {
16191: const targets = (typeof MANAGERS !== 'undefined') ? MANAGERS : [];
16240: function addActive(x) {
16249: function removeActive(x) {
16253: function closeAllLists(elmnt) {
16267:function syncCustomers() {
16319:function syncRepTel() {
16339:function fillCustomer(c) {
16353:function initExcelUX() {
16402: const dir = (k === 'ArrowUp') ? -1 : 1;
16408: const dir = (k === 'ArrowLeft') ? -1 : 1;
16416: const dir = (k === 'ArrowUp' || k === 'ArrowLeft') ? -1 : 1;
16422: function moveTableVerticalVisual(el, table, currentTr, currentTd, dir) {
16462: function moveTableHorizontal(el, table, dir) {
16478: function moveSection(el, dir) {
16492:function initInventoryModal() {
16530: const doSearch = () => {
16580: const closeModal = () => modal.classList.remove('active');
16594:const toYMD = (d) => {
16602:function enforceDateLimit(changedType, startId, endId) {
16651:function applyCardFeeLogic(rows) {
16684:function applyCutoffLogic(rows) {
16724:function takeSnapshot() {
16916:function applySnapshot(shot, custName) {
16924: const v = (valObj !== null && typeof valObj === 'object') ? valObj.v : valObj;
16939: const res = (m, d) => { if(m&&d) { m.clear(); d.forEach(([k,v])=>m.set(k,v)); } };
16940: const resSet = (set, arr) => { if(set && arr) { set.clear(); arr.forEach(v => set.add(v)); } };
17052: const res = (m, d) => { if(m&&d) { m.clear(); d.forEach(([k,v])=>m.set(k,v)); } };
17111: const isObj = (valObj !== null && typeof valObj === 'object');
17120: const matched = (typeof CUSTOMERS !== 'undefined') ? CUSTOMERS.find(c => c.name === v) : null;
17132: const matched = (typeof MANAGERS !== 'undefined') ? MANAGERS.find(m => getManagerName_(m) === v) : null;
17400: const s = ((rec.name||'')+' '+(rec.disp||'')+' '+(rec.model||'')).toLowerCase();
17449:function hideAllPages() {
17458:function goSnapshotPage() {
17489:function loadSnapshotHistory() {
17525:function loadSnapshotByCustomer() {
17550:async function handleSaveSnapshot(customTheme) {
17636: const hVal = (typeof HOME_RATIO_VAL !== 'undefined') ? HOME_RATIO_VAL : '';
17637: const hLim = (typeof HOME_RATIO_LIMIT !== 'undefined') ? HOME_RATIO_LIMIT : 0;
17638: const cVal = (typeof COMM_RATIO_VAL !== 'undefined') ? COMM_RATIO_VAL : '';
17639: const cLim = (typeof COMM_RATIO_LIMIT !== 'undefined') ? COMM_RATIO_LIMIT : 0;
17681: const bg = (showList && text === '출고가') ? '#eff6ff' : BG_HEAD;
17682: const clr = (showList && text === '출고가') ? '#1e40af' : C_TXT;
17683: const bRight = (idx === colHeaders.length - 1) ? B_SIDE : '1px solid ' + B_IN_COLOR;
17841:function showCustNameModal() {
17923:function closeSnapshotPage() {
17932:function renderSnapshotTable(list) {
17971:function showSnapshotPreview(index) {
18030:function calcRecommendOdu(cap, array) {
18046:function initKeyboardFix() {
18129: function updateCellSelectionSum() {
18164: function clearSelection() {
18172: function getTrueMatrix(table) {
18203: function getCellPos(td) {
18223: function selectCells(td1, td2) {
18253: function getCellValue(td) {
18263: function setCellValue(td, val) {
18448: const text = (e.clipboardData || window.clipboardData).getData('text');
18518:function setupCustomRows() {
18646:function ensureCustomBlankRow(type) {
18722: const updateSpan = (el, val) => {
18942:function adjustRowSpans(tr, diff) {
18969:function initVisibilityToggles() {
19121: const makeToggle = (label, onChange) => {
19230:function syncSetPriceFromParts(setId, isSingle) {
19299: const isCleared = (raw === '');
19381:function autoShrinkTableColumns(tableSelector, colIndices) {
19418:function toggleTheme() {
19443:function getElPath(el) {
19484:function isMan(el) {
19492:function getElVal(el) {
19500:function setElVal(el, val, man) {
19525:function saveState(el, isInit) {
19549:function applyState(action, isUndo) {
19663:function initAutoLogout() {
19668: function updateTimerDisplay() {
19691: function resetTimer() {
19707:function installCspEventListeners(root = document) {
19720: element.addEventListener(eventName, function cspEventHandler(event) {
```

## `clients/web/estimate-app/lib/code.js` — 2858줄 · 함수 171개

```text
96:async function _msGet(url, params, _unused) {
110:async function _msPost(url, body, _unused) {
182:function cachePutJSON_(key, obj, ttlSec) {
193:function cacheGetJSON_(key) {
206:function cacheRemoveJSON_(key) {
221:function normalizeSize_(v) {
227:function findIdx_(row, keys) {
232:function parseKRNumber_(v) {
239:function parseKRFloat_(v) {
246:function toYmd_(v, tz) {
254:function toMmDd_(v, tz) {
262:function normalizeTel_(s) {
270:function todayYMD_() {
274:function _normSpec_(s) {
278:function sanitizeKoreanParen_(text) {
287:function trimSymbols_(text) {
291:function sanitizeDisp_(text) {
296:function hpFromText_(s) {
306:function isBlockedByNote_(note) {
313:function isSoldOutByNote_(note) {
319:function unifyCatL_(L) {
325:function findHeaderIndex_(headers, key) {
326: const norm = (s) => String(s || '').replace(/\s+/g, '').trim();
336:function extractRowsFromFormula_(formula) {
346:function formatWonDiscountLabel_(amt) {
367:function formatPercentLabel_(rate) {
373:function combineRemarks_(base, extra) {
380:function detectHomeOrder(items, order) {
387: const U = (v) => String(v || '').toUpperCase();
399:function normalizeEstimateConfig_(raw) {
401: const num = (key, fallback, alias) => {
406: const bool = (key, fallback) => {
413: const str = (key, fallback) => (src[key] == null ? fallback : String(src[key]));
414: const amount = (key, fallback) => {
444:function buildDefaultDcConfig_(estimateConfig) {
461:function splitVatAmount_(amountVat, estimateConfig) {
471:function applyEstimateTotalAdjustments_(rows, estimateConfig, options = {}) {
509:function classifyHome_(rawName) {
602:function classifySingleSetLM_(s) {
634:function classifyCommercial_(name, model) {
721:function classifyCommercialDisp_(name, model) {
744:function getHomeMulti() {
760: const row = (vr[i] || []).map((v) => String(v || '').trim());
767: const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
784: const name = (row[idxName] || '').toString().trim();
785: const model = (row[idxModel] || '').toString().trim();
798: const priceFormula = (idxPrice >= 0 && fr[r] && fr[r][idxPrice]) ? String(fr[r][idxPrice]) : '';
827:function getSingleSets() {
866: const model = (row[idxModel] || '').toString().trim();
867: const unit = (row[idxUnit] || '').toString().trim() || 'SET';
880: const fH = (fr[r] && fr[r][idxPR]) || '';
919:function getSingleParts() {
931: const Hraw = (vr[1] || []).map((v) => String(v || '').trim());
948: const setModel = (row[idxSetModel] || '').toString().trim();
951: const nameRaw = (row[idxSetName] || '').toString().trim();
953: const model = (row[idxModel] || '').toString().trim();
954: const kind = (row[idxKind] || '').toString().trim();
955: const unit = (row[idxUnit] || '').toString().trim() || 'EA';
958: const feat = (row[idxFeat] || '').toString().trim();
989:function getSingleMatPrices() {
1007:function getCommercialMulti() {
1023: const row = (vr[i] || []).map((v) => String(v || '').trim());
1030: const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
1049: const name = (row[idxName] || '').toString().trim();
1050: const model = (row[idxModel] || '').toString().trim();
1071: const priceFormula = (idxPrice >= 0 && fr[r] && fr[r][idxPrice]) ? String(fr[r][idxPrice]) : '';
1097:function getCommercialParts() {
1111: const row = (vr[i] || []).map((v) => String(v || '').trim());
1117: const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
1135: const setModel = (row[idxSetModel] || '').toString().trim();
1136: const nameRaw = (row[idxSetName] || '').toString().trim();
1138: const model = (row[idxModel] || '').toString().trim();
1139: const kind = (row[idxKind] || '').toString().trim();
1140: const unit = (row[idxUnit] || '').toString().trim() || 'EA';
1176:function getOldProducts_() {
1215:function getHomeDefaults(estimateConfig) {
1230: const nameRow = (H[0] || []).map((v) => String(v || '').trim());
1231: const valRow = (H[1] || []).map((v) => String(v || '').trim());
1233: const pick = (label, def) => {
1256:function getSingleDefaults(estimateConfig) {
1274: const nameRow = (H[0] || []).map((v) => String(v || '').trim());
1275: const valRow = (H[1] || []).map((v) => String(v || '').trim());
1277: const pick = (label, def) => {
1303:function getRecommendOduData() {
1325:function getSpecMap_() {
1334: function scan(sheetName) {
1342: const Hraw = (vr[i] || []).map((v) => String(v || '').trim());
1345: const iSpec = (sheetName === COMM_PARTS_NAME)
1352: const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
1355: const idxSpec = (sheetName === COMM_PARTS_NAME)
1381:function getSpecDetailMap_() {
1389: const normH = (v) => String(v || '').trim().replace(/\s+/g, '');
1390: const findHeaderRow = (vr) => {
1392: const H = (vr[i] || []).map(normH);
1397: const idx = (H, labels) => {
1404: const findContains = (H, rx) => {
1411: function scanHome() {
1419: const Hraw = (vr[hr] || []);
1493: function scanSingle() {
1501: const H = (vr[hr] || []).map(normH);
1521: const splitBar = (v) => {
1526: const splitSlash = (v) => {
1570: function scanComm() {
1597: const iDuct = (() => {
1630: const joinCols = (row, cols) =>
1664: const iCoolKw = (coolCols.length >= 2) ? coolCols[1] : (iCoolKcal >= 0 ? iCoolKcal + 1 : -1);
1666: const iHeatKw = (heatCols.length >= 2) ? heatCols[1] : (iHeatKcal >= 0 ? iHeatKcal + 1 : -1);
1669: const iPowHeat = (powCols.length >= 2) ? powCols[powCols.length - 1] : (iPowCool >= 0 ? iPowCool + 1 : -1);
1745:function getPriceIncData_() {
1753: const readSheetTab = (sheetName, targetObj, isSingle) => {
1761: const row = (vr[i] || []).map((v) => String(v || '').trim().replace(/\s+/g, ''));
1768: const H = (vr[hdrRow] || []).map((v) => String(v || '').trim().replace(/\s+/g, ''));
1812:function getLogoImage() {
1820:function getGateImages() {
1842:async function bootstrap(userEmail) {
1946:async function preloadDirectoryCache_(forceRefresh) {
1970:function clearSheetCache() {
1987:async function getAllNotionDcConfigs_(forceRefresh) {
2005: const list = (resp.data && resp.data.data) || [];
2006: const num = (v) => (v == null ? null : Number(v));
2037:async function getCustomerDataAsync(forceRefresh) {
2043: const pickDc = (c) => {
2059:function getCustomers_() {
2067:function searchCustomerByBizOrCode(input) {
2085:function searchCustomerByBizno(bizno) {
2092:function getManagers_() {
2096:async function getAllManagers(forceRefresh) {
2101:function searchManagersByName_(query) {
2108:function findManagerByNameExact_(name) {
2116:function getManagersForInput(input) {
2127:async function initDcConfigFromNotion(bizno) {
2148: const payload = (resp.data && resp.data.data) || resp.data || {};
2152: const num = (v) => (v == null ? null : Number(v));
2195:async function fetchNotionDcConfig_(biznoDigits) {
2204:function getScriptCreds_() {
2214:async function callZoneApi(_comCode) {
2219:async function getEcountSession(_authInfo) {
2224:async function getInventoryTableHtml(_baseDate, _itemCodes) {
2229:async function getInventoryTable(dateVal, itemCodes) {
2244:function decideWarehouseCode_(items) {
2248: function getOrigName_(it) {
2254: function getSection_(it) {
2292:async function sendOrderFromUi(data) {
2300: const safeNum = (s) => String(s || '').replace(/[^\d]/g, '');
2302: const toYmd = (v) => v
2345: const whCd = (order && order.whCode) ? order.whCode : decideWarehouseCode_(merged);
2429:async function saveOrderToNotion(_info, _items, _slipNo) {
2442:async function getNotionHistory(startDate, endDate) {
2460:function unwrapList(data) {
2471:async function saveQuoteSnapshot(payload, authenticatedEmail) {
2495:async function getQuoteHistory(startDate, endDate) {
2512:async function getQuoteHistoryByCustomer(custName) {
2530:async function searchNaverAddress(query) {
2547: const pushUnique = function (row) {
2548: const key = (row.roadAddress || row.address || '') + '|' + (row.title || '');
2566:function buildAddressRequests_(q) {
2622:function parseJusoResponse_(res) {
2643:function cleanBdNm_(raw) {
2655:function escapeRegex_(s) {
2660:function stripTrailingName_(addr, name) {
2669:function parseNaverLocalResponse_(res) {
2673: const strip = function (s) { return String(s || '').replace(/<[^>]+>/g, ''); };
2687:function parseNaverGeocodeResponse_(res) {
2692: const pickBuilding = function (els) {
2693: const f = (els || []).find(function (e) { return (e.types || []).indexOf('BUILDING_NAME') >= 0; });
2724:async function checkUserAuth(email) {
2733: const u = (resp.data && resp.data.data) || {};
2752:async function forceAuth() {
2761:async function logFrontEvent(group, msg, isMobile, mgrName) {
2788:function include(filename) {
2796:async function doGet() {
```

## `clients/web/estimate-app/lib/db-catalog.js` — 260줄 · 함수 16개

```text
38:async function get(pathAndQuery) {
48:async function getDcConfig(pathAndQuery) {
58:const num = (v) => (v == null ? 0 : Number(v) || 0);
59:const numOrNull = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
60:const statusNote = (status) => ({
71:async function multiCatalog(category, classify) {
98:async function singleSets(classifyLM, normalizeSize, sanitizeDisp) {
126:async function oldProducts() {
141:async function components(category, sanitizeDisp) {
161:async function materialPrices() {
172:async function recommendOduData() {
189:async function priceIncData() {
215:async function priceChangeSchedule() {
226:async function priceDefaultVariant() {
237:async function specDetailMap() {
243:async function estimateConfig() {
```

## `clients/web/estimate-app/lib/slip-bridge.js` — 201줄 · 함수 4개

```text
58:async function postSlackAlert(text) {
93:function buildSlipRequest(legacyOrder, saleList) {
150:async function postSlip(legacyOrder, saleList) {
173: const payload = (resp.data && resp.data.data) || resp.data || {};
```

## `clients/web/order-app/src/quantitySync.ts` — 220줄 · 함수 8개

```text
57:function text(value: unknown): string {
61:function positiveNumber(value: unknown, label: string): number {
69:function rowsForProductCode(catalog: SingleCatalogRow[], productCode: string): SingleCatalogRow[] {
73:function sourceRows(catalog: SingleCatalogRow[], sources: QuantitySyncSource[]): SingleCatalogRow[] {
77:function errorResult(message: string, missingCatalogCodes: string[] = []): SingleQuantitySyncResult {
87:function selectionError(message: string, missingCatalogCodes: string[] = []): SingleQuantitySyncRuleSelection {
97:export function selectSingleS03Rule(
174:export function evaluateSingleS03Rule(
```

## `clients/web/order-app/src/samhanApi.ts` — 492줄 · 함수 16개

```text
67:function toIsoDateParam(value: unknown): string | undefined {
85:function toIsoDateTimeParam(value: unknown, endOfDay: boolean): string | undefined {
91:function draftHistoryParams(args: unknown[]): { from?: string; to?: string } {
97:function unwrapApiResponse(body: unknown): unknown {
121:function nonNegativeInteger(value: unknown): number | null {
125:function decodeCollectionResponse(body: unknown): CollectionResponse {
159:async function fetchAllPages(
189:function fetchQuantitySyncRules(): Promise<unknown[]> {
207:function confirmLines(itemsArg: unknown): Array<{
218: const item = (rawItem || {}) as LegacyOrderItem
237:function apiErrorMessage(error: unknown): string {
239: const code = (error as { code?: unknown }).code
243: const responseData = (error as { response?: { data?: unknown } }).response?.data
245: const message = (responseData as { message?: unknown }).message
248: const message = (error as { message?: unknown }).message
254:function confirmHeaders(order: unknown): { headers: { 'X-Biz-Code': string } } {
```

## `clients/web/order-app/src/legacyShim.ts` — 164줄 · 함수 4개

```text
56:function buildGoogleScriptRun(): GoogleScriptRunChain {
114:function buildUrlFetchAppNoop(): { fetch: (url: string, opts?: unknown) => unknown } {
133:export function installLegacyShim(bootstrap: Record<string, unknown>): void {
149: const setLogo = () => {
```

## `clients/web/order-app/src/main.ts` — 128줄 · 함수 0개

```text
```

## `clients/mobile/src/webview/legacyOrderSource.ts` — 116줄 · 함수 6개

```text
59:function resolveBaseUrl(devOverride?: string): string {
62: const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
75:export function getLegacyOrderUri(opts: LegacyOrderUriOptions = {}): string {
84:export function getOrderAppUrl(): string {
99:export function validateOrderAppUrl(): { ok: boolean; url: string; source: 'env' | 'default-dev' | 'default-prod' } {
101: const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
```

## `clients/mobile/src/webview/legacyOrderShim.ts` — 224줄 · 함수 8개

```text
51:export function getInjectedOrderShim(config: LegacyOrderShimConfig): string {
69: function postToRN(type, payload) {
79: setAuth: function(next) {
83: handle: function(_msg) { /* RN → WebView 명령 라우팅 (확장 여지) */ },
84: log: function(label, payload) { postToRN('log', { label: label, payload: payload }); }
167:export function setOrderAuthScript(next: Partial<LegacyOrderShimConfig>): string {
191:export function buildOrderShim(): string {
193: const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
```

## `clients/mobile-staff/src/webview/legacyEstimateSource.ts` — 106줄 · 함수 6개

```text
42:function resolveBaseUrl(devOverride?: string): string {
45: const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
59:export function getLegacyEstimateUri(opts: LegacyEstimateUriOptions = {}): string {
73:export function getEstimateAppUrl(): string {
89:export function validateEstimateAppUrl(): { ok: boolean; url: string; source: 'env' | 'default-dev' | 'default-prod' } {
91: const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
```

## `clients/mobile-staff/src/webview/legacyEstimateShim.ts` — 228줄 · 함수 8개

```text
53:export function getInjectedEstimateShim(config: LegacyEstimateShimConfig): string {
73: function postToRN(type, payload) {
83: setAuth: function(next) {
87: handle: function(_msg) { /* RN → WebView 명령 라우팅 (확장 여지) */ },
88: log: function(label, payload) { postToRN('log', { label: label, payload: payload }); }
170:export function setEstimateAuthScript(next: Partial<LegacyEstimateShimConfig>): string {
195:export function buildShim(): string {
197: const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
```

