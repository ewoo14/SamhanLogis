/**
 * #30 — db-catalog 레이어 (product-service 벌크 → legacy getter shape) 단위 테스트.
 */

'use strict';

jest.mock('axios', () => {
  const ok = (data) => Promise.resolve({ status: 200, data: { success: true, data } });
  const get = jest.fn().mockImplementation((url) => {
    if (/\/products\?category=HOME_MULTI/.test(url)) {
      return ok([
        { name: '실외기 단배관 6마력', modelCode: 'AJ060', unit: 'EA', deliveryPrice: 3300000, releasePrice: 4000000, hasVariableDiscount: true, materialKey: null, fixedDiscountRate: null, legacyDiscountFlag: false, remark: '', specText: '규격A', pyongSize: null, capacity: '6.0', maxIndoor: '8', productType: 'SINGLE' },
      ]);
    }
    if (/\/products\?category=SINGLE_SET/.test(url)) {
      return ok([
        { name: '360 CST UV', modelCode: 'AC060', unit: 'SET', deliveryPrice: 1490000, releasePrice: 2000000, materialKey: 'D7', remark: '', pyongSize: 18 },
      ]);
    }
    if (/\/products\?category=COMMERCIAL_MULTI/.test(url)) {
      return ok([
        { name: 'DVM ECO 냉난방 4HP 단상형', modelCode: 'AM040BXMDBH1', unit: 'EA', deliveryPrice: 5000000, releasePrice: 6000000, hasVariableDiscount: true, fixedDiscountRate: 0.45, remark: '비고', specText: '', capacity: '11.2', maxIndoor: null, productType: 'SINGLE' },
      ]);
    }
    if (/\/products\?category=LEGACY/.test(url)) {
      return ok([
        { name: '구형 인버터', modelCode: 'OLD1', unit: 'EA', deliveryPrice: 700000, releasePrice: 1000000, legacyDiscountFlag: true, remark: '구형', specText: '구A' },
      ]);
    }
    if (/\/components\?category=SINGLE_SET/.test(url)) {
      return ok([
        { setModelCode: 'AC060', componentModelCode: 'PART1', name: '실내기', unit: 'EA', deliveryPrice: 500000, releasePrice: 600000, kind: 'INDOOR', variant: '기본', isDefault: true, defaultQty: 1, specText: '규격P' },
      ]);
    }
    if (/\/components\?category=COMMERCIAL_MULTI/.test(url)) {
      return ok([
        { setModelCode: 'AM040', componentModelCode: 'CP1', name: '실외기', unit: 'EA', deliveryPrice: 800000, releasePrice: 900000, kind: 'OUTDOOR', variant: '', isDefault: false, defaultQty: 2, specText: '' },
      ]);
    }
    if (/\/material-prices/.test(url)) {
      return ok([
        { materialKey: 'D4', name: '동관 1/4', price: 12000 },
        { materialKey: 'D7', name: '', price: 99 }, // 빈 이름 제외
      ]);
    }
    if (/\/odu-recommendations/.test(url)) {
      return ok([
        { recommendationType: 'MULTI_HEATING_COOLING', indoorCapacity: 22.4, outdoorHp: '8HP' },
        { recommendationType: 'HOME_MULTI', indoorCapacity: 11.2, outdoorHp: '4HP' },
      ]);
    }
    if (/\/price-baseline/.test(url)) {
      return ok([
        { modelCode: 'AJ060', estimateCategory: 'HOME_MULTI', releasePrice: 3800000, deliveryPrice: 3100000 },
        { modelCode: 'AC060', estimateCategory: 'SINGLE_SET', releasePrice: 1900000, deliveryPrice: 1400000 },
        { modelCode: 'AM040', estimateCategory: 'COMMERCIAL_MULTI', releasePrice: 5800000, deliveryPrice: 4700000 },
      ]);
    }
    return ok([]);
  });
  return { create: jest.fn(() => ({ get })), get };
});

const db = require('../lib/db-catalog');

// 분류기 스텁 (estimate-app code.js 의 실 분류기 시그니처 동등 최소본)
const classifyHome = (name) => ({ catL: '실외기', catM: '단배관', catS: '', disp: '6HP' });
const classifyCommDisp = (name) => ({ catL: '실외기', catM: 'ECO 냉난방', catS: '단상형', disp: name });
const classifyLM = () => ({ L: '360', M: '' });
const normalizeSize = (v) => String(v || '').replace(/[^\d.]/g, '');
const sanitizeDisp = (s) => String(s || '').trim();

describe('#30 db-catalog → legacy getter shape', () => {
  test('multiCatalog HOME_MULTI — useK2/capacity/maxIndoor/고정DC', async () => {
    const rows = await db.multiCatalog('HOME_MULTI', classifyHome);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.model).toBe('AJ060');
    expect(r.price).toBe(3300000); // 납품가
    expect(r.list).toBe(4000000); // 출고가
    expect(r.useK2).toBe(true);
    expect(r.capacity).toBe(6);
    expect(r.maxIndoor).toBe(8);
    expect(r['고정DC']).toBe('');
    expect(r.catL).toBe('실외기');
    expect(r.disp).toBe('6HP');
  });

  test('multiCatalog COMMERCIAL_MULTI — 고정DC 직렬화 + disp', async () => {
    const rows = await db.multiCatalog('COMMERCIAL_MULTI', classifyCommDisp);
    expect(rows[0]['고정DC']).toBe('0.45');
    expect(rows[0].disp).toBe('DVM ECO 냉난방 4HP 단상형');
    expect(rows[0].catS).toBe('단상형');
  });

  test('singleSets — matKey/size/price 매핑', async () => {
    const rows = await db.singleSets(classifyLM, normalizeSize, sanitizeDisp);
    const r = rows[0];
    expect(r.model).toBe('AC060');
    expect(r.matKey).toBe('D7');
    expect(r.size).toBe('18');
    expect(r.price).toBe(1490000);
    expect(r.catL).toBe('360');
    expect(r.id).toMatch(/^360 CST UV\|18\|0$/);
  });

  test('oldProducts — isDisc/price(출고가)/sheetPrice(납품가)', async () => {
    const rows = await db.oldProducts();
    const r = rows[0];
    expect(r.isDisc).toBe(true);
    expect(r.price).toBe(1000000); // 출고가
    expect(r.sheetPrice).toBe(700000); // 납품가
  });

  test('components SINGLE/COMMERCIAL — kind/qty/isDefault', async () => {
    const sp = await db.components('SINGLE_SET', sanitizeDisp);
    expect(sp[0].setModel).toBe('AC060');
    expect(sp[0].kind).toBe('INDOOR');
    expect(sp[0].qty).toBe('1');
    expect(sp[0].isDefault).toBe(true);
    const cp = await db.components('COMMERCIAL_MULTI', sanitizeDisp);
    expect(cp[0].qty).toBe('2');
    expect(cp[0].refModel).toBe('AM040');
  });

  test('materialPrices — {자재명: 가격}, 빈 이름 제외', async () => {
    const map = await db.materialPrices();
    expect(map['동관 1/4']).toBe(12000);
    expect(Object.keys(map)).toHaveLength(1);
  });

  test('recommendOduData — comm/home 분리', async () => {
    const r = await db.recommendOduData();
    expect(r.comm).toEqual([{ cap: 22.4, hp: '8HP' }]);
    expect(r.home).toEqual([{ cap: 11.2, hp: '4HP' }]);
    expect(r.homeEx).toHaveLength(1); // graceful (엔티티 미분리)
  });

  test('priceIncData — home/comm/single 카테고리 분배', async () => {
    const p = await db.priceIncData();
    expect(p.home.AJ060).toBe(3800000);
    expect(p.comm.AM040).toBe(5800000);
    expect(p.single.AC060).toEqual({ list: 1900000, price: 1400000 });
  });
});
