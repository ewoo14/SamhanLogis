package com.samhanair.logis.notification.dto;

/**
 * 레거시 배차안내문자 하차일별 그룹 문구를 만드는 전표 단위 입력.
 *
 * <p>사용자 노출 식별자와 표시 데이터만 담으며 내부 UUID는 포함하지 않는다.
 * {@code fallbackMessage}가 있으면 레거시 오류 행처럼 다른 전표와 합치지 않는다.
 */
public record DispatchMessageGroupInput(
        String entryKey,
        String chatRoomName,
        String recipientPhone,
        Integer unloadDay,
        String displayLine,
        String fallbackMessage) {
}
