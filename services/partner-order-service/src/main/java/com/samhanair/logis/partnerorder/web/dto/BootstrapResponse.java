package com.samhanair.logis.partnerorder.web.dto;

import java.util.Map;

/**
 * 18종 bootstrap 응답 (legacy doGet 4~23 의 16개 템플릿 변수 + 단가변동 schedule + 상업 구성품 INC).
 *
 * <p>키 매트릭스 (legacy 와 동일):
 * <ul>
 *   <li>homemulti / singleSets / singleParts / homeDefaults / singleDefaults / singleMatPrices</li>
 *   <li>commercialMulti / commercialParts / oldProducts</li>
 *   <li>homeInc / commInc / singleInc / singlePartsInc</li>
 *   <li>specDetailMap / config (DC 9키 제거) / logoData / priceChangeSchedule</li>
 * </ul>
 *
 * <p>각 value 는 JSON 직렬화된 Object (배열 또는 Map) — FE 가 그대로 사용.
 *
 * @param payloads cacheKey → 객체 Map
 */
public record BootstrapResponse(Map<String, Object> payloads) {
}
