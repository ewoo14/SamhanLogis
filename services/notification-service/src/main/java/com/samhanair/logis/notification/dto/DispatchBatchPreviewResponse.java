package com.samhanair.logis.notification.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 배차안내 SMS 발송 미리보기 응답 (PR-E1 BE-4 — Samhan Public 이식).
 *
 * <p>단톡방별로 거래처를 그룹핑한 dryRun 결과. 각 거래처는 (partnerCode, partnerName, message,
 * blocked) 4-tuple. blocked=true 인 거래처는 send 단계에서 자동 제외.
 *
 * <p>UUID 비공개 가드 — 응답 어디에도 UUID 없음 (partnerCode + partnerName + chatRoomName 만).
 *
 * @param date 배차일
 * @param totalSlips slip-service 가 반환한 출고전표 총 건수
 * @param mappedSlips 단톡방 매핑이 발견된 건수 (chatRooms 합)
 * @param unmappedSlips 단톡방 매핑이 없는 건수 (응답 unmapped 에 partnerCode 누적)
 * @param chatRooms 단톡방별 그룹 N개
 * @param unmapped 단톡방 매핑이 없는 거래처 (warn 표시 용)
 */
public record DispatchBatchPreviewResponse(
        LocalDate date,
        int totalSlips,
        int mappedSlips,
        int unmappedSlips,
        List<ChatRoomGroup> chatRooms,
        List<UnmappedPartner> unmapped) {

    /**
     * 단톡방 1개 그룹 — 1 단톡방에 N 거래처가 라우팅.
     *
     * @param chatRoomName 단톡방 이름 (예: "에어디자이너 발주방")
     * @param partners 본 단톡방에 라우팅된 거래처 N건
     */
    public record ChatRoomGroup(String chatRoomName, List<PartnerEntry> partners) {
    }

    /**
     * 거래처 1건 — 메시지 + blocked 가드 결과.
     *
     * @param partnerCode 거래처코드 (사용자 노출, 단톡방/blocked 키)
     * @param partnerName 거래처명 (사용자 노출)
     * @param slipNo 출고전표번호 (사용자 노출)
     * @param message 조립된 한국어 안내 본문 ({@link com.samhanair.logis.notification.service.MessageTemplateService})
     * @param blocked 발송금지 가드 결과 — true 시 send 단계에서 제외
     */
    public record PartnerEntry(
            String partnerCode,
            String partnerName,
            String slipNo,
            String message,
            boolean blocked) {
    }

    /**
     * 단톡방 매핑이 없는 거래처 (운영자 후속 등록 유도 용).
     *
     * @param partnerCode 거래처코드
     * @param partnerName 거래처명
     * @param slipNo 출고전표번호
     * @param message 조립된 안내 본문
     * @param recipientPhone 인수자 전화번호 — 단톡방 매핑이 없을 때 SMS fallback 대상
     */
    public record UnmappedPartner(String partnerCode, String partnerName, String slipNo,
                                   String message, String recipientPhone) {
        /** 기존 호출자 호환용 생성자. */
        public UnmappedPartner(String partnerCode, String partnerName, String slipNo) {
            this(partnerCode, partnerName, slipNo, null, null);
        }
    }
}
