package com.samhanair.logis.notification.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.domain.PartnerChatRoomMapping;
import com.samhanair.logis.notification.dto.ChatRoomMappingCreateRequest;
import com.samhanair.logis.notification.repository.PartnerChatRoomMappingRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 ↔ 단톡방 매핑 CRUD 서비스 (PR-D Part 2-3).
 *
 * <p>책임:
 * <ul>
 *   <li>전체 목록 / partner_code 별 조회</li>
 *   <li>단건 등록 (MANUAL — admin 직접 partner_code 입력)</li>
 *   <li>단건 soft-delete</li>
 * </ul>
 *
 * <p>CSV 일괄 import 는 {@link ChatRoomImportService} 에 위임 (관심사 분리).
 *
 * <p>UUID 비공개 가드 — 본 서비스 응답 DTO 는 partner_business_name + chat_room_name 노출 위주,
 * id (UUID) 는 admin DELETE path variable 한정.
 */
@Service
@RequiredArgsConstructor
public class ChatRoomMappingService {

    private final PartnerChatRoomMappingRepository repository;

    /** 전체 매핑 목록 (partner_code 정렬). admin 화면 백킹. */
    @Transactional(readOnly = true)
    public List<PartnerChatRoomMapping> findAll() {
        return repository.findAllByOrderByPartnerCodeAscChatRoomNameAsc();
    }

    /** 거래처별 매핑 N건. */
    @Transactional(readOnly = true)
    public List<PartnerChatRoomMapping> findByPartnerCode(String partnerCode) {
        return repository.findAllByPartnerCode(partnerCode);
    }

    /** legacy Notion 이름 매핑 조회. 거래처코드 보강 전 운영 데이터 손실 방지용 fallback. */
    @Transactional(readOnly = true)
    public List<PartnerChatRoomMapping> findByPartnerBusinessName(String partnerBusinessName) {
        return repository.findAllByPartnerBusinessNameSnapshot(partnerBusinessName);
    }

    /** 단톡방별 매핑 N건. 발송 라우팅 (단톡방 → 거래처 fan-out) 시점 활용. */
    @Transactional(readOnly = true)
    public List<PartnerChatRoomMapping> findByChatRoomName(String chatRoomName) {
        return repository.findAllByChatRoomName(chatRoomName);
    }

    /**
     * 신규 매핑 등록 (MANUAL — admin 직접 partner_code 입력).
     *
     * @throws BusinessException CONFLICT — 활성 (partner_code, chat_room_name) 중복 시
     */
    @Transactional
    public PartnerChatRoomMapping create(ChatRoomMappingCreateRequest req) {
        repository.findByPartnerCodeAndChatRoomName(req.partnerCode(), req.chatRoomName())
                .ifPresent(existing -> {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "이미 등록된 매핑입니다: " + req.partnerCode() + " / " + req.chatRoomName());
                });
        PartnerChatRoomMapping entity = PartnerChatRoomMapping.manual(
                req.partnerCode(), req.partnerBusinessName(), req.chatRoomName());
        return repository.save(entity);
    }

    /**
     * 매핑 단건 soft-delete. 본 entity 의 BaseEntity#markDeleted() 호출.
     *
     * @throws BusinessException NOT_FOUND — id 미존재 시
     */
    @Transactional
    public void delete(UUID id, String actor) {
        PartnerChatRoomMapping entity = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "매핑을 찾을 수 없습니다: " + id));
        entity.markDeleted(actor);
        repository.save(entity);
    }
}
