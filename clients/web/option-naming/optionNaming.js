const REMOTE_VALUES = new Set(['무선', '유선', '컬러', '제외', '기본']);

function normalizeRemoteOption(value) {
  const raw = String(value ?? '').trim();
  if (REMOTE_VALUES.has(raw)) return raw;
  if (raw === '유선리모컨') return '유선';
  if (raw === '컬러유선리모컨' || raw === '컬러유선' || raw === '컬러') return '컬러';
  if (raw === '리모컨 제외' || raw === '제외') return '제외';
  if (raw === '') return '';
  return raw;
}

function normalizePanelOption(value) {
  const raw = String(value ?? '').trim();
  if (raw === '' || raw === '기본판넬') return '기본';
  if (raw === '블랙판넬') return '블랙';
  if (raw === '승강판넬') return '승강';
  if (raw === '공청판넬') return '공청';
  if (raw === '판넬제외') return '판넬제외';
  return raw;
}

function add(target, model, quantity) {
  if (!model || !quantity) return;
  target[model] = (target[model] || 0) + quantity;
}

function expandHomeRemoteOption(option, { counts, models }) {
  const raw = normalizeRemoteOption(option);
  const result = {};
  if (raw === '기본') {
    add(result, models.cassette360, counts.cassette360);
    add(result, models.chIndoor, counts.chIndoor);
    add(result, models.wireless, counts.wallAndOther);
    return result;
  }
  const main = raw === '유선' ? models.wired : models.wiredColor;
  add(result, main, counts.total);
  if (raw === '유선' || raw === '컬러') add(result, models.wiredKit, counts.total);
  return result;
}

function configuredOptionVariants(rows, kind) {
  const wanted = String(kind || '').toUpperCase();
  const values = (Array.isArray(rows) ? rows : [])
    .filter(row => String(row?.componentKind ?? row?.kind ?? '').toUpperCase() === wanted)
    .map(row => row?.componentVariant ?? row?.variant ?? row?.feat)
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function configuredOptionShapes(rows) {
  const values = (Array.isArray(rows) ? rows : [])
    .filter(row => String(row?.componentKind ?? row?.kind ?? '').toUpperCase() === 'PANEL')
    .map(row => row?.componentShape ?? row?.shape)
    .map(value => String(value ?? '').trim())
    .filter(value => value === '원형' || value === '사각');
  return [...new Set(values)];
}

function resolveSingleRemoteOption(value, excluded) {
  return excluded ? '제외' : normalizeRemoteOption(value);
}

module.exports = {
  expandHomeRemoteOption,
  normalizeRemoteOption,
  normalizePanelOption,
  resolveSingleRemoteOption,
  configuredOptionVariants,
  configuredOptionShapes,
};
