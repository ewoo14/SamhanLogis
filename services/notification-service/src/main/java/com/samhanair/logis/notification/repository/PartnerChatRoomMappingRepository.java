package com.samhanair.logis.notification.repository;

import com.samhanair.logis.notification.domain.PartnerChatRoomMapping;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * 거래처 ↔ 단톡방 매핑 저장소.
 *
 * <p>partial unique index 활성 행 한정 (partner_code, chat_room_name) 가 중복 방지.
 * findByPartnerCode / findByChatRoomName 모두 @SQLRestriction 의해 활성 행만 반환.
 */
@Repository
public interface PartnerChatRoomMappingRepository extends JpaRepository<PartnerChatRoomMapping, UUID> {

    /** 활성 매핑 단건 조회 (partner_code + chat_room_name 유일성 검증용). */
    Optional<PartnerChatRoomMapping> findByPartnerCodeAndChatRoomName(String partnerCode, String chatRoomName);

    /** 거래처별 매핑 N건 (1 거래처 → N 단톡방). */
    List<PartnerChatRoomMapping> findAllByPartnerCode(String partnerCode);

    /** legacy Notion CSV 처럼 거래처코드 없이 상호만 있는 매핑 N건. */
    List<PartnerChatRoomMapping> findAllByPartnerBusinessNameSnapshot(String partnerBusinessNameSnapshot);

    /** 단톡방별 매핑 N건 (1 단톡방 → N 거래처). */
    List<PartnerChatRoomMapping> findAllByChatRoomName(String chatRoomName);

    /** 전체 매핑 (partner_code 정렬). admin 목록 화면 백킹. */
    List<PartnerChatRoomMapping> findAllByOrderByPartnerCodeAscChatRoomNameAsc();
}
