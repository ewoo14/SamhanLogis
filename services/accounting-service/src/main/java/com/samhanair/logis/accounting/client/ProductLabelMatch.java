package com.samhanair.logis.accounting.client;

import java.util.UUID;

/**
 * 회계 라벨 기반 product-service 매칭 결과.
 *
 * <p>#773 S2 재검증 엔진은 productId 와 모델코드만 필요하므로 product-service 응답에서
 * 최소 필드만 분리해 전달한다.
 */
public record ProductLabelMatch(UUID productId, String modelCode) {
}
