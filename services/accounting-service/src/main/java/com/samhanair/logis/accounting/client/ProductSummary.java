package com.samhanair.logis.accounting.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * product-service 가 반환하는 제품 요약 (PR-E2 BE-A12 의존).
 *
 * <p>inventory-service 의 동일 record 를 답습한 wire-format 사본 — accounting-service 가
 * product 도메인을 직접 import 하지 않도록 격리. status 는 String 으로 유지.
 *
 * <p>BE-A12 일별 마감 detail 에서 모델/할인/세트 마스터 lookup 시 본 record 사용.
 */
public record ProductSummary(
        UUID id,
        String name,
        String modelName,
        UUID categoryId,
        BigDecimal sellingPrice,
        String status,
        String categoryKey,
        String modelCode) {

    /** 기존 소비자 호환용 생성자 — categoryKey 를 아직 사용하지 않는 호출자를 보존한다. */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status) {
        this(id, name, modelName, categoryId, sellingPrice, status, null, null);
    }

    /** 기존 7-arg 호출자 호환 생성자 — 불변 modelCode 미제공 legacy 응답용. */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String categoryKey) {
        this(id, name, modelName, categoryId, sellingPrice, status, categoryKey, null);
    }
}
