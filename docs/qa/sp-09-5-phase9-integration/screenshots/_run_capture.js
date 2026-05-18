// PNG 캡처 실행 래퍼
// 사용법: node _run_capture.js  (docs/qa/sp-09-5-phase9-integration/screenshots/ 에서 실행)
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  require('path').join(process.env.LOCALAPPDATA || '', 'ms-playwright');
require('./_capture.cjs');
