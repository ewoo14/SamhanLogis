const fs = require('fs');
const path = require('path');

const estimateView = fs.readFileSync(
  path.join(__dirname, '..', 'views', 'index.ejs'),
  'utf8',
);
const orderView = fs.readFileSync(
  path.join(__dirname, '..', '..', 'order-app', 'index.html'),
  'utf8',
);
const orderApi = fs.readFileSync(
  path.join(__dirname, '..', '..', 'order-app', 'src', 'samhanApi.ts'),
  'utf8',
);
const confirmService = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'services', 'partner-order-service', 'src', 'main', 'java', 'com', 'samhanair', 'logis', 'partnerorder', 'service', 'PartnerOrderConfirmService.java'),
  'utf8',
);
const partnerOrderConfig = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'services', 'partner-order-service', 'src', 'main', 'resources', 'application.yml'),
  'utf8',
);

describe('GAS parity gaps', () => {
  test('신규 저장본도 이미지 없이 저장 상태 미리보기 버튼을 렌더링한다', () => {
    expect(estimateView).toMatch(/item\.image.*\|\|.*item\.data|item\.data.*\|\|.*item\.image/);
    expect(estimateView).toMatch(/showSnapshotPreview\(index\)/);
  });

  test('이미지 없는 신규 저장본도 상태를 미리보기로 열고, 이미지가 있는 옛 저장본도 유지한다', () => {
    expect(estimateView).toMatch(/snapshot_state|item\.data/);
    expect(estimateView).toMatch(/저장된 미리보기 이미지가 없습니다/);
    expect(estimateView).toMatch(/safeEstimateImageSrc\(item\.image\)/);
  });

  test('주문 확정 후 GAS 메일의 수신자·내용·시점에 대응하는 알림 계약이 있다', () => {
    expect(orderView).toMatch(/sendOrderFromUi\(items, order\)/);
    expect(orderApi).toMatch(/sendOrderFromUi:[\s\S]*partner-orders\/drafts/);
    expect(orderApi).toMatch(/partner-orders\/\$\{encodeURIComponent\(draftId\)}\/confirm/);
    expect(confirmService).toMatch(/sendExternalEmail/);
    expect(partnerOrderConfig).toMatch(/partner-order:[\s\S]*confirmation-email:/);
  });
});
