/** 종합견적 스냅샷의 금액·커스텀 행 공통 계약. */
function calculateQuoteTotals(screenTotal, vatDisplay) {
  const amount = Math.max(0, Math.round(Number(screenTotal) || 0));
  if (vatDisplay === 'exc') {
    const vatAmount = Math.floor(amount * 0.1);
    return { supplyAmount: amount, vatAmount, totalAmount: amount + vatAmount };
  }
  const vatAmount = Math.floor(amount / 11);
  return { supplyAmount: amount - vatAmount, vatAmount, totalAmount: amount };
}

function isMeaningfulCustomRow(row) {
  return ['name', 'model', 'list', 'spec', 'qty', 'price', 'fixDc']
    .some((key) => String(row?.[key] ?? '').trim() !== '') || row?.varDc === true;
}

function normalizeCustomRows(rows) {
  const valued = (Array.isArray(rows) ? rows : []).filter(isMeaningfulCustomRow);
  return [...valued, { name: '', model: '', list: '', spec: '', qty: '', price: '', fixDc: '', varDc: false }];
}

module.exports = { calculateQuoteTotals, isMeaningfulCustomRow, normalizeCustomRows };
