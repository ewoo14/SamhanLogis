const {
  calculateQuoteTotals,
  normalizeCustomRows,
} = require('../lib/quoteSnapshotContract');

describe('종합견적 스냅샷 계약', () => {
  test('VAT 별도 화면 합계를 공급가로 저장하고 부가세를 더한다', () => {
    expect(calculateQuoteTotals(100000, 'exc')).toEqual({
      supplyAmount: 100000,
      vatAmount: 10000,
      totalAmount: 110000,
    });
  });

  test('커스텀 행은 입력 시 자동 빈행을 하나 유지하고 빈행은 저장하지 않는다', () => {
    const rows = normalizeCustomRows([
      { name: '품목', qty: '1', price: '1000' },
      { name: '', model: '', qty: '', price: '' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('품목');
    expect(rows[1]).toEqual(expect.objectContaining({ name: '', qty: '', price: '' }));
  });
});
