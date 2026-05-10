package com.samhanair.logis.inventory.client;

import java.util.List;
import java.util.UUID;

/**
 * slip-service 가 반환하는 입고 슬립 상세 요약.
 * inventory-service 가 slip 도메인을 직접 import 하지 않도록 wire-format 의 record 사본.
 *
 * @param id          Slip UUID
 * @param slipNo      슬립번호 (사용자 노출 식별자)
 * @param slipType    전표 종류 문자열 (INBOUND / OUTBOUND)
 * @param status      전표 상태 문자열 (SAVED / CONFIRMED 등)
 * @param destinationWarehouseId 입고 창고 UUID (null 이면 창고 미지정)
 * @param lines       슬립 라인 목록
 */
public record SlipDetail(
        UUID id,
        String slipNo,
        String slipType,
        String status,
        UUID destinationWarehouseId,
        List<SlipLineDetail> lines
) {
}
