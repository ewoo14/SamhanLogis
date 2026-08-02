const fs = require('node:fs');
const path = require('node:path');

const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');

test('CSP 화면은 견적저장과 저장내역을 inline onclick 없이 실제 클릭 리스너로 배선한다', () => {
  expect(view).not.toMatch(/id="btnSaveSnapshot"[^>]*onclick=/);
  expect(view).not.toMatch(/id="btnLoadSnapshot"[^>]*onclick=/);
});
