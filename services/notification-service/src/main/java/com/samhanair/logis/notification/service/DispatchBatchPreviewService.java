package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.OutboundSlipDto;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.domain.PartnerChatRoomMapping;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewRequest;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse.ChatRoomGroup;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse.PartnerEntry;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse.UnmappedPartner;
import com.samhanair.logis.notification.repository.PartnerChatRoomMappingRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차안내 SMS 발송 미리보기 (dryRun) 서비스 — PR-E1 BE-4 (Samhan Public 이식).
 *
 * <p>legacy GAS 8번 (배차안내문자) 의 수동 워크플로우 (이카운트 전표 업로드 → 단톡방/금지 매핑 →
 * 발송멘트 편집 → 단톡방별 그룹핑 후 복사) 를 자동화한 1단계.
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>{@link SlipServiceClient#getOutboundSlips(java.time.LocalDate, java.time.LocalDate)} 로 출고전표
 *       N건 조회 (date=date 단일일).</li>
 *   <li>각 slip 의 partnerCode → 단톡방 N개 추출. 미매핑 시 legacy Notion 이름 alias 로 fallback.</li>
 *   <li>각 partnerCode → {@link BlockedPartnerLookupClient#isBlocked(String)} (가드).</li>
 *   <li>{@link MessageTemplateService#renderDispatchMessage} 로 한국어 안내 본문 조립.</li>
 *   <li>단톡방별 그룹핑 (LinkedHashMap 으로 입력 순서 보존).</li>
 * </ol>
 *
 * <p>UUID 비공개 가드 — 응답 어디에도 UUID 없음 (partnerCode + partnerName + chatRoomName 만).
 *
 * <p>외부 client (SlipServiceClient + BlockedPartnerLookupClient) 는 IT 에서 {@code @MockBean}
 * 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchBatchPreviewService {

    private final SlipServiceClient slipServiceClient;
    private final PartnerChatRoomMappingRepository chatRoomMappingRepository;
    private final BlockedPartnerLookupClient blockedPartnerLookupClient;
    private final MessageTemplateService messageTemplateService;

    /**
     * preview 미리보기 — 출고전표 자동 조회 + 단톡방 매핑 + blocked 가드 + 메시지 템플릿 적용.
     *
     * @param req 입력 (date)
     * @return 단톡방별 그룹 + unmapped 거래처 리스트
     */
    @Transactional(readOnly = true)
    public DispatchBatchPreviewResponse preview(DispatchBatchPreviewRequest req) {
        if (req == null || req.date() == null) {
            throw new IllegalArgumentException("date 필수");
        }
        List<OutboundSlipDto> slips = slipServiceClient.getOutboundSlips(req.date(), req.date());
        log.debug("DispatchBatchPreviewService — date={}, totalSlips={}", req.date(), slips.size());

        // 단톡방 → 거래처 N건 (입력 순서 보존)
        Map<String, List<PartnerEntry>> grouped = new LinkedHashMap<>();
        List<UnmappedPartner> unmapped = new ArrayList<>();
        int mappedCount = 0;
        int unmappedCount = 0;

        for (OutboundSlipDto slip : slips) {
            String partnerCode = slip.partnerCode();
            String message = messageTemplateService.renderDispatchMessage(slip);
            if (partnerCode == null || partnerCode.isBlank()) {
                // partner_code 누락 → unmapped 누적 (slip-service 가 partner_code 없는 row 를 반환할 수 있는 회복성)
                unmapped.add(new UnmappedPartner(
                        null, slip.partnerName(), slip.slipNo(), message, slip.recipientPhone()));
                unmappedCount++;
                continue;
            }
            List<PartnerChatRoomMapping> mappings =
                    chatRoomMappingRepository.findAllByPartnerCode(partnerCode);
            if (mappings.isEmpty() && slip.partnerName() != null && !slip.partnerName().isBlank()) {
                mappings = chatRoomMappingRepository.findAllByPartnerBusinessNameSnapshot(slip.partnerName());
            }
            if (mappings.isEmpty()) {
                unmapped.add(new UnmappedPartner(
                        partnerCode, slip.partnerName(), slip.slipNo(), message, slip.recipientPhone()));
                unmappedCount++;
                continue;
            }
            boolean blocked = blockedPartnerLookupClient.isBlocked(partnerCode);
            mappedCount++;
            for (PartnerChatRoomMapping mapping : mappings) {
                grouped.computeIfAbsent(mapping.getChatRoomName(), k -> new ArrayList<>())
                        .add(new PartnerEntry(
                                partnerCode,
                                slip.partnerName(),
                                slip.slipNo(),
                                message,
                                blocked));
            }
        }

        List<ChatRoomGroup> chatRooms = new ArrayList<>(grouped.size());
        for (Map.Entry<String, List<PartnerEntry>> e : grouped.entrySet()) {
            chatRooms.add(new ChatRoomGroup(e.getKey(), e.getValue()));
        }

        return new DispatchBatchPreviewResponse(
                req.date(),
                slips.size(),
                mappedCount,
                unmappedCount,
                chatRooms,
                unmapped);
    }
}
