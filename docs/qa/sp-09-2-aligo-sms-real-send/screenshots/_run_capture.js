// PNG 재캡처 실행 래퍼 (cycle 1 fix 후 재생성용)
// 사용법: node _run_capture.js  (docs/qa/sp-09-2-aligo-sms-real-send/screenshots/ 에서 실행)
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  require('path').join(process.env.LOCALAPPDATA || '', 'ms-playwright');
require('./_capture.cjs');
