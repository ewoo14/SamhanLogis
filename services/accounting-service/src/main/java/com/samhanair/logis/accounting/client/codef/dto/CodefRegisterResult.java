package com.samhanair.logis.accounting.client.codef.dto;

/**
 * CODEF 기관 등록 결과.
 *
 * @param connectedId CODEF가 반환한 연결 식별자
 * @param status      ACTIVE/ADDITIONAL_AUTH/ERROR
 * @param message     사용자 안내 메시지
 */
public record CodefRegisterResult(
        String connectedId,
        String status,
        String message
) {
}
