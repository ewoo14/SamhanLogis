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
import com.samhanair.logis.notification.dto.DispatchMessageGroupInput;
import com.samhanair.logis.notification.dto.DispatchDriverContactInput;
import com.samhanair.logis.notification.repository.PartnerChatRoomMappingRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차안내 SMS 발송 미리보기 (dryRun) 서비스 — PR-E1 BE-4 (Samhan Public 이식).
 *
 * <p>legacy GAS 8번 (배차안내문자) 의 수동 워크플로우 (이카운트 전표 업로드 → 단톡방/금지 매핑 →
 * 코멘트 편집 → 단톡방별 그룹핑 후 복사) 를 자동화한 1단계.
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
    private final DispatchMessageGroupComposer dispatchMessageGroupComposer;

    /** 기존 4-인자 단위 테스트·호출자 호환용 생성자. */
    @Autowired
    public DispatchBatchPreviewService(
            SlipServiceClient slipServiceClient,
            PartnerChatRoomMappingRepository chatRoomMappingRepository,
            BlockedPartnerLookupClient blockedPartnerLookupClient,
            MessageTemplateService messageTemplateService) {
        this(slipServiceClient, chatRoomMappingRepository, blockedPartnerLookupClient,
                messageTemplateService, new DispatchMessageGroupComposer());
    }

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
        List<PendingPreviewEntry> pending = new ArrayList<>();
        List<DispatchMessageGroupInput> groupInputs = new ArrayList<>();
        int mappedCount = 0;
        int unmappedCount = 0;
        int sequence = 0;

        for (OutboundSlipDto slip : slips) {
            String partnerCode = slip.partnerCode();
            String driverPhone = resolveDriverPhone(slip, req.driverContacts(), req.date());
            OutboundSlipDto displaySlip = withDriverPhone(slip, driverPhone);
            String message = messageTemplateService.renderDispatchMessage(displaySlip);
            String entryKey = entryKey(partnerCode, slip.slipNo(), sequence++);
            if (partnerCode == null || partnerCode.isBlank()) {
                // partner_code 누락 → unmapped 누적 (slip-service 가 partner_code 없는 row 를 반환할 수 있는 회복성)
                pending.add(new PendingPreviewEntry(
                        entryKey, null, slip.partnerName(), slip.slipNo(), message, false,
                        null, slip.recipientPhone()));
                groupInputs.add(toGroupInput(entryKey, displaySlip, null, "이카운트 데이터 없음 최신화요망!", req.date()));
                unmappedCount++;
                continue;
            }
            List<PartnerChatRoomMapping> mappings =
                    chatRoomMappingRepository.findAllByPartnerCode(partnerCode);
            if (mappings.isEmpty() && slip.partnerName() != null && !slip.partnerName().isBlank()) {
                mappings = chatRoomMappingRepository.findAllByPartnerBusinessNameSnapshot(slip.partnerName());
            }
            if (mappings.isEmpty()) {
                lookupBlockedOrDefer(partnerCode);
                pending.add(new PendingPreviewEntry(
                        entryKey, partnerCode, slip.partnerName(), slip.slipNo(), message, false,
                        null, slip.recipientPhone()));
                groupInputs.add(toGroupInput(entryKey, displaySlip, null, null, req.date()));
                unmappedCount++;
                continue;
            }
            boolean blocked = lookupBlockedOrDefer(partnerCode);
            mappedCount++;
            for (PartnerChatRoomMapping mapping : mappings) {
                String chatRoomName = mapping.getChatRoomName();
                String mappedEntryKey = entryKey + "#" + safeText(chatRoomName);
                pending.add(new PendingPreviewEntry(
                        mappedEntryKey, partnerCode, slip.partnerName(), slip.slipNo(), message, blocked,
                        chatRoomName, slip.recipientPhone()));
                groupInputs.add(toGroupInput(
                        mappedEntryKey, displaySlip, chatRoomName,
                        blocked ? "발송금지 업체입니다." : null, req.date()));
            }
        }

        Map<String, String> groupMessages = dispatchMessageGroupComposer.compose(groupInputs);
        for (PendingPreviewEntry entry : pending) {
            String groupMessage = groupMessages.getOrDefault(entry.entryKey(), entry.message());
            if (entry.chatRoomName() == null || entry.chatRoomName().isBlank()) {
                unmapped.add(new UnmappedPartner(
                        entry.partnerCode(), entry.partnerName(), entry.slipNo(), entry.message(),
                        entry.recipientPhone(), groupMessage));
            } else {
                grouped.computeIfAbsent(entry.chatRoomName(), ignored -> new ArrayList<>())
                        .add(new PartnerEntry(
                                entry.partnerCode(), entry.partnerName(), entry.slipNo(), entry.message(),
                                entry.blocked(), groupMessage));
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

    /** blocked 조회 장애는 차단 판정으로 승격하지 않고 조회 불가 상태로 보류한다. */
    private boolean lookupBlockedOrDefer(String partnerCode) {
        try {
            return blockedPartnerLookupClient.isBlocked(partnerCode);
        } catch (Exception ex) {
            log.warn("DispatchBatchPreviewService — blocked lookup 실패 partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return false;
        }
    }

    private DispatchMessageGroupInput toGroupInput(
            String entryKey,
            OutboundSlipDto slip,
            String chatRoomName,
            String fallbackMessage,
            LocalDate requestedDate) {
        String displayLine = legacyDisplayLine(slip);
        String effectiveFallback = fallbackMessage;
        if (effectiveFallback == null && !hasText(slip.driverPhone())) {
            effectiveFallback = "기사번호 없음 확인요망!";
        }
        LocalDate unloadDate = slip.unloadDate() != null
                ? slip.unloadDate()
                : slip.slipDate() != null ? slip.slipDate() : requestedDate;
        return new DispatchMessageGroupInput(
                entryKey,
                chatRoomName,
                slip.recipientPhone(),
                unloadDate == null ? null : unloadDate.getDayOfMonth(),
                displayLine,
                effectiveFallback);
    }

    /** 레거시 라인: 배송기사 연락처 + 주소 앞 세 토큰. */
    private String legacyDisplayLine(OutboundSlipDto slip) {
        String address = safeText(slip.deliveryAddress())
                .replaceFirst("^(지방|야적|야상)\\s*/\\s*", "")
                .trim();
        String shortenedAddress = java.util.Arrays.stream(address.split("\\s+"))
                .filter(part -> !part.isBlank())
                .limit(3)
                .reduce((left, right) -> left + " " + right)
                .orElse("");
        if (!hasText(slip.driverPhone())) {
            return "기사번호 없음 확인요망!";
        }
        return safeText(slip.driverPhone()) + " / " + shortenedAddress;
    }

    private String entryKey(String partnerCode, String slipNo, int sequence) {
        return safeText(partnerCode).isBlank() ? "unmapped#" + safeText(slipNo) + "#" + sequence
                : safeText(partnerCode) + "#" + safeText(slipNo) + "#" + sequence;
    }

    private String resolveDriverPhone(
            OutboundSlipDto slip, List<DispatchDriverContactInput> inputs, LocalDate requestedDate) {
        for (DispatchDriverContactInput input : inputs) {
            if (input == null || !hasText(input.driverPhone())) continue;
            if (input.date() != null && !input.date().equals(requestedDate)) continue;
            boolean slipMatches = hasText(input.slipNo()) && input.slipNo().trim().equals(safeText(slip.slipNo()));
            boolean companyMatches = hasText(input.companyName())
                    && (input.companyName().contains(safeText(slip.slipNo()))
                    || input.companyName().trim().equals(safeText(slip.partnerName())));
            if (slipMatches || companyMatches) return input.driverPhone().trim();
        }
        return slip.driverPhone();
    }

    private OutboundSlipDto withDriverPhone(OutboundSlipDto slip, String driverPhone) {
        return new OutboundSlipDto(
                slip.slipNo(), slip.partnerCode(), slip.partnerName(), slip.slipDate(), slip.scheduledAt(),
                slip.deliveryAddress(), slip.lines(), slip.recipientPhone(), slip.unloadDate(), driverPhone);
    }

    private static String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record PendingPreviewEntry(
            String entryKey,
            String partnerCode,
            String partnerName,
            String slipNo,
            String message,
            boolean blocked,
            String chatRoomName,
            String recipientPhone) {
    }
}
