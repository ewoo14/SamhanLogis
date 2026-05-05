/**
 * calcDcPrice.ts — 거래처별 DC율 자동 적용 가격 계산.
 *
 * DECISIONS Phase 6 정정 #12 — 사업자번호 입장 시 DC율 자동 적용된 가격 표시.
 * Web v2 의 `calcDcPrice.ts` 와 동일 알고리즘 (mobile 1:1).
 *
 * legacy 출처 (DECISIONS):
 *   - migration/source/scripts/partner-order/index.html `applyConfigFromServer` (line 1322~1342)
 *   - PartnerDcConfig csv 222 row (`거래처별 DC리스트 *.csv`)
 *
 * 알고리즘:
 *   1. 카테고리 (HOMEMULTI / COMMERCIAL_MULTI / etc) 별 DC% 조회
 *   2. base price × (1 - dcRate) → 천원 단위 ROUND/FLOOR/CEIL
 *   3. 라인별 옵션 DC (option360 / option4way / oneWay / deluxe / firstGrade) 추가 차감
 *
 * UUID 미노출 — partnerCode (사업자번호) 를 key 로 사용, partnerId 미사용.
 */

/**
 * PartnerDcConfig — Mobile 클라이언트 표현형.
 * backend `PartnerDcConfig` entity (M1a 보강) 와 1:1, decimal 은 number 로 직렬화.
 */
export interface PartnerDcConfig {
  partnerCode: string;
  /** 홈멀티 DC율 (0~1, 예: 0.07 = 7%) */
  homeMultiDc?: number | null;
  /** 상업멀티 DC율 */
  commercialMultiDc?: number | null;
  /** 유연호스(I) 표시 여부 */
  flexibleHoseI?: boolean | null;
  /** 360 판넬 옵션 DC (정액 차감) */
  option360?: number | null;
  /** 4way 판넬 옵션 DC */
  option4way?: number | null;
  /** 1way 판넬 옵션 DC */
  option1way?: number | null;
  /** 스탠드 옵션 DC */
  optionStand?: number | null;
  /** 디럭스 옵션 DC */
  optionDeluxe?: number | null;
  /** 1등급 옵션 DC */
  option1Grade?: number | null;
  /** 단가 반올림 단위 (예: 1000 = 천원) */
  unitProcessing?: number | null;
  note?: string | null;
}

/** 카테고리 enum */
export type DcCategory = 'HOMEMULTI' | 'COMMERCIAL_MULTI' | 'OTHER';

/** 라인 옵션 (해당 라인이 어떤 옵션 DC 를 받는지) */
export interface DcLineOptions {
  category: DcCategory;
  is360?: boolean;
  is4way?: boolean;
  is1way?: boolean;
  isStand?: boolean;
  isDeluxe?: boolean;
  is1Grade?: boolean;
}

/** 반올림 모드 */
export type RoundMode = 'ROUND' | 'FLOOR' | 'CEIL';

/**
 * base price + DC config + 옵션 → 적용 단가.
 *
 * @param basePrice 정상 단가
 * @param config 거래처 DC 설정 (없으면 basePrice 그대로 반환)
 * @param options 라인 옵션 (category 필수)
 * @param roundMode 반올림 모드 (default: ROUND)
 * @returns 적용 단가 (정수)
 */
export function calcDcPrice(
  basePrice: number,
  config: PartnerDcConfig | null | undefined,
  options: DcLineOptions,
  roundMode: RoundMode = 'ROUND',
): number {
  if (!config) return basePrice;
  if (basePrice <= 0) return 0;

  // 1) 카테고리 DC율 적용
  const rate = pickCategoryRate(config, options.category);
  let price = basePrice * (1 - clampRate(rate));

  // 2) 옵션 정액 DC 차감 (legacy applyConfigFromServer DISCOUNT_*_AMT)
  const opts = sumOptionDc(config, options);
  price = Math.max(0, price - opts);

  // 3) 단가 반올림 (legacy UNIT_ROUND_TO + UNIT_ROUND_MODE)
  const unit = Number(config.unitProcessing || 0);
  if (unit > 0) {
    price = roundToUnit(price, unit, roundMode);
  } else {
    price = Math.round(price);
  }

  return price;
}

/**
 * 카테고리에 해당하는 DC율 1개 픽업.
 * HOMEMULTI → homeMultiDc / COMMERCIAL_MULTI → commercialMultiDc / OTHER → 0.
 */
function pickCategoryRate(config: PartnerDcConfig, category: DcCategory): number {
  switch (category) {
    case 'HOMEMULTI':
      return Number(config.homeMultiDc || 0);
    case 'COMMERCIAL_MULTI':
      return Number(config.commercialMultiDc || 0);
    default:
      return 0;
  }
}

/**
 * 옵션 DC 정액 합산.
 */
function sumOptionDc(config: PartnerDcConfig, options: DcLineOptions): number {
  let sum = 0;
  if (options.is360 && config.option360) sum += Number(config.option360);
  if (options.is4way && config.option4way) sum += Number(config.option4way);
  if (options.is1way && config.option1way) sum += Number(config.option1way);
  if (options.isStand && config.optionStand) sum += Number(config.optionStand);
  if (options.isDeluxe && config.optionDeluxe) sum += Number(config.optionDeluxe);
  if (options.is1Grade && config.option1Grade) sum += Number(config.option1Grade);
  return sum;
}

/**
 * DC율 0~0.99 클램프.
 * legacy `parseFixedDc` (line 1345) 와 동일.
 */
function clampRate(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, 0.99);
}

/**
 * 단가 unit 단위로 반올림.
 *
 * @example
 *   roundToUnit(123456, 1000, 'ROUND')  // 123000
 *   roundToUnit(123456, 1000, 'FLOOR')  // 123000
 *   roundToUnit(123456, 1000, 'CEIL')   // 124000
 */
function roundToUnit(price: number, unit: number, mode: RoundMode): number {
  switch (mode) {
    case 'FLOOR':
      return Math.floor(price / unit) * unit;
    case 'CEIL':
      return Math.ceil(price / unit) * unit;
    case 'ROUND':
    default:
      return Math.round(price / unit) * unit;
  }
}
