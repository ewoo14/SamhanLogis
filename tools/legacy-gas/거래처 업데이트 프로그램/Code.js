const MASTER_URL = "https://docs.google.com/spreadsheets/d/1-jsEDyyLkYkwYEDYkTymDJ2cUUdLuZbsdNgJEtBSXvE/edit";
const MASTER_TAB = "사용자리스트";

const MAX_WORKERS = 6;
const PROGRESS_TTL_SEC = 600;

const NOTION_API_KEY = PropertiesService.getScriptProperties().getProperty("NOTION_API_KEY");
const NOTION_DB_ID   = PropertiesService.getScriptProperties().getProperty("NOTION_DB_ID");

// 웹앱반환
function doGet() {
  console.log("🧭 진입");
  const html = HtmlService.createHtmlOutputFromFile('UploadModal')
    .setTitle('종합견적서 거래처목록 업데이트 프로그램')
    .setWidth(900)
    .setHeight(700);
  return html;
}

// 배포시작
function startUpdateFromExcel_(payload) {
  const runId = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('RUN_ID', runId);
  CacheService.getScriptCache().put('prog_' + runId, JSON.stringify({}), PROGRESS_TTL_SEC);

  console.log("🚀 시작", runId);

  const valuesMatrix = payload.valuesMatrix || [];
  const rowCount = payload.rowCount || 0;
  const colCount = payload.colCount || 0;
  const addrColIndex = payload.addrColIndex;
  const custColIndex = payload.custColIndex;

  const linksInfo = buildTargetLinks_();
  const orderedLinks = linksInfo.orderedLinks;
  const linkToName = linksInfo.linkToName;

  const pairs = orderedLinks.map(u => [linkToName[u] || u, u]);

  console.log("🎯 대상수", pairs.length);

  const progress = {};
  pairs.forEach(p => progress[p[0]] = 0);
  setProgress_(runId, progress);
  setProgressOrder_(runId, pairs.map(p => p[0]));

  const masterLink = linksInfo.masterLink;
  const otherLinks = orderedLinks.filter(u => u !== masterLink);

  let successCnt = 0;
  let failCnt = 0;
  const resultsSummary = [];

  try {
    const masterDisplay = linkToName[masterLink] || '관리자';

    console.log("🧭 마스터", masterDisplay);

    try {
      const r = processOne_(
        masterDisplay, masterLink, runId,
        valuesMatrix, rowCount, colCount, addrColIndex, custColIndex
      );

      if (r.ok) {
        successCnt++;
        resultsSummary.push([masterDisplay, masterLink, "성공", r.stage, ""]);
      } else {
        failCnt++;
        resultsSummary.push([masterDisplay, masterLink, "실패", r.stage, r.err]);
      }
    } catch (e) {
      failCnt++;
      resultsSummary.push([masterDisplay, masterLink, "실패", "오류", String(e)]);
      console.log("❌ 마스터에러", e);
    }

    if (otherLinks.length) {
      const maxWorkers = Math.min(MAX_WORKERS, otherLinks.length);
      console.log("🧵 병렬", maxWorkers, otherLinks.length);

      const pool = [];
      otherLinks.forEach(link => {
        pool.push({
          name: linkToName[link] || link,
          link: link
        });
      });

      const chunks = chunkArray_(pool, maxWorkers);

      chunks.forEach(group => {
        group.forEach(item => {
          try {
            const r = processOne_(
              item.name, item.link, runId,
              valuesMatrix, rowCount, colCount, addrColIndex, custColIndex
            );
            if (r.ok) {
              successCnt++;
              resultsSummary.push([item.name, item.link, "성공", r.stage, ""]);
            } else {
              failCnt++;
              resultsSummary.push([item.name, item.link, "실패", r.stage, r.err]);
            }
          } catch (e) {
            failCnt++;
            resultsSummary.push([item.name, item.link, "실패", "오류", String(e)]);
            console.log("❌ 에러", item.name, e);
          }
        });
      });
    }

  } finally {
    const finalProg = getProgress_(runId);
    Object.keys(finalProg).forEach(k => finalProg[k] = 100);
    setProgress_(runId, finalProg);
  }

  console.log("✅ 완료", successCnt, failCnt);

  return {
    runId: runId,
    successCnt: successCnt,
    failCnt: failCnt,
    resultsSummary: resultsSummary
  };
}

// 세션초기화
function initUploadSession_(meta) {
  const runId = Utilities.getUuid();
  console.log("🆔 세션", runId);

  const masterSS = SpreadsheetApp.openByUrl(MASTER_URL);
  const tmpName = "_UPLOAD_TMP_" + runId;

  let tmp;
  try {
    tmp = masterSS.getSheetByName(tmpName);
    tmp.clear();
  } catch (e) {
    tmp = masterSS.insertSheet(tmpName);
  }

  tmp.hideSheet();
  
  // 서식적용
  const rows = (meta && meta.totalRows) ? meta.totalRows + 100 : 3000;
  const cols = (meta && meta.colCount) ? meta.colCount : 20;
  tmp.getRange(1, 1, rows, cols).setNumberFormat("@");

  PropertiesService.getScriptProperties().setProperty("TMP_SHEET_" + runId, tmpName);
  PropertiesService.getScriptProperties().setProperty("TMP_META_" + runId, JSON.stringify(meta || {}));
  PropertiesService.getScriptProperties().setProperty("TMP_LASTROW_" + runId, "0");

  const linksInfo = buildTargetLinks_();
  const orderedLinks = linksInfo.orderedLinks;
  const linkToName = linksInfo.linkToName;
  const pairs = orderedLinks.map(u => [linkToName[u] || u, u]);

  const progress = {};
  pairs.forEach(p => progress[p[0]] = 0);

  setProgress_(runId, progress);
  setProgressOrder_(runId, pairs.map(p => p[0]));

  console.log("✅ 준비", runId);

  return { runId: runId };
}

// 청크저장
function appendUploadChunk_(runId, chunk, startRow) {
  if (!runId) throw new Error("runId가 없습니다.");
  if (!chunk || !chunk.length) {
    const prevLast = Number(PropertiesService.getScriptProperties().getProperty("TMP_LASTROW_" + runId) || "0");
    return { ok:true, lastWritten: prevLast };
  }

  const masterSS = SpreadsheetApp.openByUrl(MASTER_URL);
  const tmpName = PropertiesService.getScriptProperties().getProperty("TMP_SHEET_" + runId);
  if (!tmpName) throw new Error("임시 시트를 찾을 수 없습니다.");

  const tmp = masterSS.getSheetByName(tmpName);
  if (!tmp) throw new Error("임시 시트가 존재하지 않습니다.");

  const row = Number(startRow || 1);
  const colCount = chunk[0].length;

  console.log("📥 저장", runId, row);

  tmp.getRange(row, 1, chunk.length, colCount).setValues(chunk);

  const lastWritten = row + chunk.length - 1;
  const prevLast = Number(PropertiesService.getScriptProperties().getProperty("TMP_LASTROW_" + runId) || "0");
  const nextLast = Math.max(prevLast, lastWritten);

  PropertiesService.getScriptProperties().setProperty("TMP_LASTROW_" + runId, String(nextLast));

  console.log("🧾 누적", nextLast);

  return { ok:true, lastWritten: nextLast };
}

// 업로드완료
function finalizeUploadAndStart_(runId) {
  if (!runId) throw new Error("runId가 없습니다.");

  try {
    console.log("🚀 수신", runId);

    const masterSS = SpreadsheetApp.openByUrl(MASTER_URL);
    const tmpName = PropertiesService.getScriptProperties().getProperty("TMP_SHEET_" + runId);
    const metaRaw = PropertiesService.getScriptProperties().getProperty("TMP_META_" + runId);
    const meta = metaRaw ? JSON.parse(metaRaw) : {};

    if (!tmpName) throw new Error("임시 시트를 찾을 수 없습니다.");

    const tmp = masterSS.getSheetByName(tmpName);
    if (!tmp) throw new Error("임시 시트가 존재하지 않습니다.");

    const expectedRows = Number(meta.totalRows || 0);
    const lastWritten = Number(PropertiesService.getScriptProperties().getProperty("TMP_LASTROW_" + runId) || "0");

    if (expectedRows > 0 && lastWritten < expectedRows) {
      console.log("⚠️ 미완료", expectedRows, lastWritten);
      throw new Error("청크 업로드가 아직 완료되지 않았습니다. expectedRows=" + expectedRows + " lastWritten=" + lastWritten);
    }

    console.log("✅ 확인", lastWritten);

    const lastRow = tmp.getLastRow();
    const lastCol = tmp.getLastColumn();
    if (lastRow < 1 || lastCol < 1) throw new Error("임시 시트에 데이터가 없습니다.");

    // 데이터읽기
    let valuesMatrix = tmp.getRange(1, 1, lastRow, lastCol).getValues();

    const addrColIndex = meta.addrColIndex;
    const custColIndex = meta.custColIndex;

    valuesMatrix = mergeNotionIntoMatrix_(valuesMatrix);

    const result = startUpdateCore_(
      runId,
      valuesMatrix,
      valuesMatrix.length,
      valuesMatrix[0].length,
      addrColIndex,
      custColIndex
    );

    try {
      masterSS.deleteSheet(tmp);
      console.log("🧹 삭제", tmpName);
    } catch (e) {
      console.log("⚠️ 삭제에러", e);
    }

    PropertiesService.getScriptProperties().deleteProperty("TMP_SHEET_" + runId);
    PropertiesService.getScriptProperties().deleteProperty("TMP_META_" + runId);
    PropertiesService.getScriptProperties().deleteProperty("TMP_LASTROW_" + runId);

    return result;

  } catch (e) {
    throw e;
  }
}

// 배포로직
function startUpdateCore_(runId, valuesMatrix, rowCount, colCount, addrColIndex, custColIndex) {
  PropertiesService.getScriptProperties().setProperty('RUN_ID', runId);

  console.log("🚀 시작", runId);

  const linksInfo = buildTargetLinks_();
  const orderedLinks = linksInfo.orderedLinks;
  const linkToName = linksInfo.linkToName;

  const pairs = orderedLinks.map(u => [linkToName[u] || u, u]);

  console.log("🎯 대상수", pairs.length);

  const progress = {};
  pairs.forEach(p => progress[p[0]] = 0);
  setProgress_(runId, progress);
  setProgressOrder_(runId, pairs.map(p => p[0]));

  const masterLink = linksInfo.masterLink;
  const otherLinks = orderedLinks.filter(u => u !== masterLink);

  let successCnt = 0;
  let failCnt = 0;
  const resultsSummary = [];

  try {
    const masterDisplay = linkToName[masterLink] || '관리자';

    console.log("🧭 마스터", masterDisplay);

    try {
      const r = processOne_(
        masterDisplay, masterLink, runId,
        valuesMatrix, rowCount, colCount, addrColIndex, custColIndex
      );

      if (r.ok) {
        successCnt++;
        resultsSummary.push([masterDisplay, masterLink, "성공", r.stage, ""]);
      } else {
        failCnt++;
        resultsSummary.push([masterDisplay, masterLink, "실패", r.stage, r.err]);
      }
    } catch (e) {
      failCnt++;
      resultsSummary.push([masterDisplay, masterLink, "실패", "오류", String(e)]);
      console.log("❌ 마스터에러", e);
    }

    if (otherLinks.length) {
      const maxWorkers = Math.min(MAX_WORKERS, otherLinks.length);
      console.log("🧵 병렬", maxWorkers, otherLinks.length);

      const pool = [];
      otherLinks.forEach(link => {
        pool.push({
          name: linkToName[link] || link,
          link: link
        });
      });

      const chunks = chunkArray_(pool, maxWorkers);

      chunks.forEach(group => {
        group.forEach(item => {
          try {
            const r = processOne_(
              item.name, item.link, runId,
              valuesMatrix, rowCount, colCount, addrColIndex, custColIndex
            );
            if (r.ok) {
              successCnt++;
              resultsSummary.push([item.name, item.link, "성공", r.stage, ""]);
            } else {
              failCnt++;
              resultsSummary.push([item.name, item.link, "실패", r.stage, r.err]);
            }
          } catch (e) {
            failCnt++;
            resultsSummary.push([item.name, item.link, "실패", "오류", String(e)]);
            console.log("❌ 에러", item.name, e);
          }
        });
      });
    }

  } finally {
    const finalProg = getProgress_(runId);
    Object.keys(finalProg).forEach(k => finalProg[k] = 100);
    setProgress_(runId, finalProg);
  }

  console.log("✅ 완료", successCnt, failCnt);

  return {
    runId: runId,
    successCnt: successCnt,
    failCnt: failCnt,
    resultsSummary: resultsSummary
  };
}

// 진행률조회
function getProgress(runId) {
  const data = getProgress_(runId);
  const order = getProgressOrder_(runId);
  return { order: order, data: data };
}

// 대상수집
function buildTargetLinks_() {
  const ws = SpreadsheetApp.openByUrl(MASTER_URL).getSheetByName(MASTER_TAB);
  const records = ws.getDataRange().getValues();
  const headers = records.shift();

  const idx = {};
  headers.forEach((h,i) => idx[String(h).trim()] = i);

  const linkToName = {};
  const linksAll = [];

  let masterLink = '';

  records.forEach(r => {
    const upd = String(r[idx['업데이트']] || '').trim().toUpperCase();
    if (upd !== 'TRUE' && upd !== '마스터' && upd !== 'MASTER') return;

    const url = String(r[idx['공유 시트 링크']] || '').trim();
    if (!url) return;

    const name = String(r[idx['담당자명']] || '').trim();

    linksAll.push(url);
    linkToName[url] = name || url;

    if (upd === '마스터' || upd === 'MASTER') masterLink = url;
  });

  if (!masterLink) throw new Error("사용자리스트에 '마스터' 행을 찾을 수 없습니다.");

  const otherLinks = linksAll.filter(u => u !== masterLink);
  const orderedLinks = [masterLink].concat(otherLinks);

  return { orderedLinks, masterLink, linkToName };
}

// 개별처리
function processOne_(name, link, runId, valuesMatrix, rowCount, colCount, addrColIndex, custColIndex) {
  const display = name || link;

  bump_(runId, display, 3);

  const ss = SpreadsheetApp.openByUrl(link);
  bump_(runId, display, 7);

  let ws;
  let stage;

  try {
    ws = ss.getSheetByName("거래처");
    ws.clear();
    stage = "덮어쓰기";
  } catch (e) {
    ws = ss.insertSheet("거래처");
    stage = "신규생성";
  }

  bump_(runId, display, 20);

  // 포맷설정
  const range = ws.getRange(1, 1, valuesMatrix.length, valuesMatrix[0].length);
  range.setNumberFormat("@");
  SpreadsheetApp.flush(); 

  // 데이터쓰기
  range.setValues(valuesMatrix);
  SpreadsheetApp.flush(); 

  bump_(runId, display, 35);

  // 서식적용
  applyFormats_(ss, ws, rowCount, colCount, addrColIndex, custColIndex);
  SpreadsheetApp.flush();

  bump_(runId, display, 60);
  bump_(runId, display, 100);

  console.log("✅ 담당자", display, stage);

  return { ok:true, stage:stage, err:"" };
}

// 서식적용
function applyFormats_(ss, ws, rowCount, colCount, addrColIndex, custColIndex) {
  const sheetId = ws.getSheetId();

  const reqs = [];

  reqs.push({
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
      cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
      fields: "userEnteredFormat.numberFormat"
    }
  });

  reqs.push({
    updateSheetProperties: {
      properties: { sheetId: sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount"
    }
  });

  reqs.push({
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)"
    }
  });

  reqs.push({
    updateBorders: {
      range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
      top: { style: "SOLID", width: 1 },
      bottom: { style: "SOLID", width: 1 },
      left: { style: "SOLID", width: 1 },
      right: { style: "SOLID", width: 1 },
      innerHorizontal: { style: "SOLID", width: 1 },
      innerVertical: { style: "SOLID", width: 1 }
    }
  });

  for (let i=0;i<colCount;i++){
    if (i === addrColIndex) continue;
    reqs.push({
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: i, endColumnIndex: i+1 },
        cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
        fields: "userEnteredFormat(horizontalAlignment,verticalAlignment)"
      }
    });
  }

  reqs.push({
    updateDimensionProperties: {
      range: { sheetId: sheetId, dimension: "COLUMNS", startIndex: custColIndex, endIndex: custColIndex+1 },
      properties: { pixelSize: 300 },
      fields: "pixelSize"
    }
  });

  reqs.push({
    updateDimensionProperties: {
      range: { sheetId: sheetId, dimension: "COLUMNS", startIndex: addrColIndex, endIndex: addrColIndex+1 },
      properties: { pixelSize: 500 },
      fields: "pixelSize"
    }
  });

  Sheets.Spreadsheets.batchUpdate({ requests: reqs }, ss.getId());
}

// 진행률갱신
function bump_(runId, display, targetPct) {
  const prog = getProgress_(runId);
  const cur = Math.max(0, Number(prog[display] || 0));
  const tgt = Math.min(100, Number(targetPct || 0));
  if (tgt <= cur) {
    return;
  }
  prog[display] = tgt;
  setProgress_(runId, prog);
  console.log("📊 갱신", display, tgt);
}

// 캐시조회
function getProgress_(runId) {
  const raw = CacheService.getScriptCache().get('prog_' + runId);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch(e){ return {}; }
}

// 캐시저장
function setProgress_(runId, progObj) {
  CacheService.getScriptCache().put('prog_' + runId, JSON.stringify(progObj || {}), PROGRESS_TTL_SEC);
}

// 순서저장
function setProgressOrder_(runId, orderArr) {
  CacheService.getScriptCache().put('prog_order_' + runId, JSON.stringify(orderArr || []), PROGRESS_TTL_SEC);
}

// 순서조회
function getProgressOrder_(runId) {
  const raw = CacheService.getScriptCache().get('prog_order_' + runId);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch(e){ return []; }
}

// 배열분할
function chunkArray_(arr, n) {
  const out = [];
  for (let i=0;i<arr.length;i+=n) out.push(arr.slice(i, i+n));
  return out;
}

// 래퍼함수
function initUploadSession(meta) {
  console.log("🧭 초기화");
  return initUploadSession_(meta);
}

// 래퍼함수
function appendUploadChunk(runId, chunk, startRow) {
  console.log("🧭 청크", startRow);
  return appendUploadChunk_(runId, chunk, startRow);
}

// 래퍼함수
function finalizeUploadAndStart(runId) {
  console.log("🧭 최종", runId);
  return finalizeUploadAndStart_(runId);
}

// 노션병합
function mergeNotionIntoMatrix_(valuesMatrix) {
  console.log("📡 병합");

  if (!NOTION_API_KEY || !NOTION_DB_ID || /여기에_/.test(NOTION_API_KEY) || /여기에_/.test(NOTION_DB_ID)) {
    console.log("⚠️ 키없음");
    return valuesMatrix;
  }

  const notionDict = buildNotionDict_();
  if (!notionDict || !Object.keys(notionDict).length) {
    console.log("⚠️ 데이터없음");
    return valuesMatrix;
  }

  const header = valuesMatrix[0] || [];
  const codeIdx = header.indexOf("거래처코드");
  const specialIdx = header.indexOf("특이사항");
  let singleDiscountIdx = header.indexOf("싱글 할인");

  if (singleDiscountIdx < 0) {
    header.push("싱글 할인");
    singleDiscountIdx = header.length - 1;
    valuesMatrix[0] = header;
    for (let r = 1; r < valuesMatrix.length; r++) {
      valuesMatrix[r].push("");
    }
  }

  let matchCnt = 0;

  for (let r = 1; r < valuesMatrix.length; r++) {
    const row = valuesMatrix[r];
    const rawCode = codeIdx >= 0 ? String(row[codeIdx] || "").trim() : "";
    if (!rawCode) continue;

    const normalizedCode = rawCode.replace(/^0+/, "") || "0";
    const notionData = notionDict[rawCode] || notionDict[normalizedCode];
    if (!notionData) continue;

    matchCnt++;

    const notionGeneral = String(notionData.general || "").trim();
    const notionSpecial = String(notionData.special || "").trim();
    const fullNotionText = [notionGeneral, notionSpecial].filter(Boolean).join(" / ");

    if (!fullNotionText) continue;

    row[singleDiscountIdx] = fullNotionText;

    if (specialIdx >= 0) {
      let excelSpecial = String(row[specialIdx] || "").trim();
      if (excelSpecial) excelSpecial = stripNotionSegmentsAll_(excelSpecial, fullNotionText);

      row[specialIdx] = [notionGeneral, excelSpecial, notionSpecial].filter(Boolean).join(" / ");
    }
  }

  console.log("✅ 병합완료 매칭", matchCnt);
  return valuesMatrix;
}

// 중복제거
function stripNotionSegmentsAll_(excelText, notionText) {
  let ex = normalizeSep_(excelText);
  const notionNorm = normalizeSep_(notionText);

  const segs = notionNorm
    .split(" / ")
    .map(s => s.trim())
    .filter(Boolean);

  segs.forEach(seg => {
    if (!seg) return;

    const esc = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const reg = new RegExp(
      "(?:^|\\s*\\/\\s*)" + esc + "(?=\\s*\\/\\s*|$)",
      "g"
    );

    while (reg.test(ex)) {
      ex = ex.replace(reg, "");
      ex = cleanupSeps_(ex);
    }
  });

  ex = cleanupSeps_(ex);

  if (ex) {
    const exLoose = ex.replace(/\s+/g, "").toLowerCase();
    const notionLoose = notionNorm.replace(/\s+/g, "").toLowerCase();

    if (notionLoose && exLoose.indexOf(notionLoose) >= 0) {
      const escBlock = notionNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regBlock = new RegExp(escBlock, "g");
      ex = ex.replace(regBlock, "");
      ex = cleanupSeps_(ex);
    }
  }

  return ex;
}

// 정규화
function normalizeSep_(s) {
  return String(s || "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

// 구분자정리
function cleanupSeps_(s) {
  return String(s || "")
    .replace(/\s*\/\s*\/\s*/g, " / ")
    .replace(/^\/\s*|\s*\/$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 중복제거
function stripNotionSegments_(excelText, notionText) {
  let ex = normalizeSep_(excelText);
  const segs = normalizeSep_(notionText)
    .split(" / ")
    .map(s => s.trim())
    .filter(Boolean);

  segs.forEach(seg => {
    if (!seg) return;
    ex = removeSegment_(ex, seg);
  });

  ex = cleanupSeps_(ex);
  return ex;
}

// 텍스트 제거
function removeSegment_(text, seg) {
  let t = text;

  t = t.split(" / " + seg + " / ").join(" / ");
  t = t.split(seg + " / ").join("");
  t = t.split(" / " + seg).join("");

  if (t === seg) t = "";

  t = cleanupSeps_(t);
  return t;
}

// 데이터사전화
function buildNotionDict_() {
  console.log("🔎 조회");

  const allPages = fetchNotionDbAll_(NOTION_DB_ID);
  console.log("📦 페이지수", allPages.length);

  const dict = {};
  let skippedCnt = 0;
  let dupCnt = 0;

  allPages.forEach(page => {
    const props = page.properties || {};

    const codeProp = props["거래처코드"];
    const codeNum = codeProp && codeProp.number;
    if (codeNum == null) {
      skippedCnt++;
      return;
    }

    const key = String(Math.trunc(codeNum)).trim();
    if (!key) {
      skippedCnt++;
      return;
    }

    const segments = [];

    const homeDcNum = props["홈멀티DC"] && props["홈멀티DC"].number;
    const commDcNum = props["상업멀티DC"] && props["상업멀티DC"].number;

    const dcParts = [];
    if (homeDcNum != null) dcParts.push("홈" + Math.round(homeDcNum * 100) + "%");
    if (commDcNum != null) dcParts.push("상업" + Math.round(commDcNum * 100) + "%");
    if (dcParts.length) segments.push(dcParts.join("&"));

    const hoseCheckbox = props["유연호스I형"] && props["유연호스I형"].checkbox;
    if (hoseCheckbox) segments.push("유연호스I형");

    const dc360Num = props["360"] && props["360"].number;
    const dc360Txt = parseShortDiscount_(dc360Num);
    if (dc360Txt) segments.push("360 " + dc360Txt);

    const dc4wayNum = props["4way"] && props["4way"].number;
    const dc4wayTxt = parseShortDiscount_(dc4wayNum);
    if (dc4wayTxt) segments.push("4way " + dc4wayTxt);

    const onewayNum = props["1way"] && props["1way"].number;
    const onewayTxt = parseShortDiscount_(onewayNum);
    if (onewayTxt) segments.push("1way " + onewayTxt);

    const standNum = props["스탠드"] && props["스탠드"].number;
    const standTxt = parseShortDiscount_(standNum);
    if (standTxt) segments.push("스탠드 " + standTxt);

    const deluxeNum = props["디럭스"] && props["디럭스"].number;
    const deluxeTxt = parseShortDiscount_(deluxeNum);
    if (deluxeTxt) segments.push("디럭스 " + deluxeTxt);

    const grade1Num = props["1등급"] && props["1등급"].number;
    const grade1Txt = parseShortDiscount_(grade1Num);
    if (grade1Txt) segments.push("1등급 " + grade1Txt);

    const unitProp = props["단위처리"];
    const unitSel = unitProp && unitProp.select;
    if (unitSel && unitSel.name) segments.push(String(unitSel.name).trim());

    const generalText = segments.filter(Boolean).join(" / ");

    let specialText = "";
    const specialProp = props["특이사항"];
    const rt = specialProp && specialProp.rich_text;
    if (rt && rt.length) {
      specialText = rt.map(t => t.plain_text).filter(Boolean).join(" ");
    }

    const newHasData = !!(generalText || specialText);
    const existing = dict[key];

    if (existing) {
      dupCnt++;
      const existingHasData = !!(existing.general || existing.special);
      if (existingHasData && !newHasData) return;
    }

    dict[key] = { general: generalText, special: specialText };
  });

  console.log("✅ 매핑", Object.keys(dict).length, "스킵", skippedCnt, "중복", dupCnt);
  return dict;
}

// 레코드순회
function fetchNotionDbAll_(dbId) {
  let results = [];

  let dsList = [];
  try {
    const metaRes = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId, {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + NOTION_API_KEY,
        'Notion-Version': '2025-09-03'
      },
      muteHttpExceptions: true
    });
    if (metaRes.getResponseCode() === 200) {
      const metaJson = JSON.parse(metaRes.getContentText());
      dsList = metaJson.data_sources || [];
    }
  } catch(e) {
    console.log("⚠️ 메타데이터 조회 에러", e);
  }

  if (dsList.length > 0) {
    console.log("📚 데이터소스", dsList.length);
    for (let i = 0; i < dsList.length; i++) {
      let cursor = null;
      let dsCount = 0;
      while (true) {
        const payload = cursor ? { start_cursor: cursor } : {};
        const resp = notionRequest_("post", "https://api.notion.com/v1/data_sources/" + dsList[i].id + "/query", payload, "2025-09-03");

        const batch = resp.results || [];
        results = results.concat(batch);
        dsCount += batch.length;

        if (resp.has_more) {
          cursor = resp.next_cursor;
        } else {
          break;
        }
      }
      console.log("📥 소스", i, dsCount);
    }
  } else {
    let cursor = null;
    while (true) {
      const payload = cursor ? { start_cursor: cursor } : {};
      const resp = notionRequest_("post", "https://api.notion.com/v1/databases/" + dbId + "/query", payload, "2022-06-28");

      const batch = resp.results || [];
      results = results.concat(batch);

      if (resp.has_more) {
        cursor = resp.next_cursor;
      } else {
        break;
      }
    }
  }

  return results;
}

// 통신요청
function notionRequest_(method, url, payload, ver) {
  const headers = {
    "Authorization": "Bearer " + NOTION_API_KEY,
    "Notion-Version": ver || "2022-06-28",
    "Content-Type": "application/json"
  };

  const options = {
    method: method,
    headers: headers,
    muteHttpExceptions: true
  };

  if (payload) options.payload = JSON.stringify(payload);

  const r = UrlFetchApp.fetch(url, options);
  const code = r.getResponseCode();
  const text = r.getContentText();

  if (code >= 400) {
    throw new Error("Notion API 실패 " + code + " " + text.slice(0, 200));
  }

  return JSON.parse(text);
}

// 금액포맷팅
function parseShortDiscount_(val) {
  if (val == null || val === "") return "";
  let num;
  try {
    num = Math.trunc(Number(val));
  } catch (e) {
    return "";
  }
  if (!num) return "";
  const n = Math.abs(num);
  let txt = "";

  if (n >= 10000) {
    const man = Math.floor(n / 10000);
    const rest = n % 10000;
    txt = man + "만";
    if (rest) {
      if (rest % 1000 === 0) txt += Math.floor(rest / 1000) + "천";
      else txt += rest.toLocaleString();
    }
  } else if (n >= 1000) {
    if (n % 1000 === 0) txt = Math.floor(n / 1000) + "천";
    else txt = n.toLocaleString();
  } else {
    txt = String(n);
  }

  return "-" + txt;
}