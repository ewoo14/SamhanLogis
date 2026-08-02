package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.OutboundSlipDto;
import com.samhanair.logis.notification.client.OutboundSlipDto.OutboundSlipLineDto;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.domain.PartnerChatRoomMapping;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewRequest;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse;
import com.samhanair.logis.notification.repository.PartnerChatRoomMappingRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link DispatchBatchPreviewService} 단위 테스트 — PR-E1 BE-4 (5 case).
 *
 * <ol>
 *   <li>preview 정상 — 단톡방 매핑 + blocked false → chatRooms 그룹 생성</li>
 *   <li>preview 단톡방 miss — mapping empty → unmapped 누적</li>
 *   <li>preview blocked 가드 — blocked=true 인 partner 는 PartnerEntry.blocked=true</li>
 *   <li>preview slip 응답 빈 리스트 — 빈 chatRooms / unmapped 반환</li>
 *   <li>preview — partner_code 누락 slip → unmapped 누적</li>
 * </ol>
 */
class DispatchBatchPreviewServiceTest {

    private SlipServiceClient slipServiceClient;
    private PartnerChatRoomMappingRepository chatRoomMappingRepository;
    private BlockedPartnerLookupClient blockedPartnerLookupClient;
    private MessageTemplateService messageTemplateService;
    private DispatchBatchPreviewService service;

    @BeforeEach
    void setUp() {
        slipServiceClient = mock(SlipServiceClient.class);
        chatRoomMappingRepository = mock(PartnerChatRoomMappingRepository.class);
        blockedPartnerLookupClient = mock(BlockedPartnerLookupClient.class);
        messageTemplateService = new MessageTemplateService();
        service = new DispatchBatchPreviewService(
                slipServiceClient, chatRoomMappingRepository,
                blockedPartnerLookupClient, messageTemplateService);

        // default — 단톡방 매핑 없음, blocked false
        lenient().when(chatRoomMappingRepository.findAllByPartnerCode(anyString()))
                .thenReturn(List.of());
        lenient().when(chatRoomMappingRepository.findAllByPartnerBusinessNameSnapshot(anyString()))
                .thenReturn(List.of());
        lenient().when(blockedPartnerLookupClient.isBlocked(anyString())).thenReturn(false);
    }

    @Test
    @DisplayName("정상 — 단톡방 매핑 + blocked false → chatRoom 그룹 생성")
    void preview_normal_groupsByChatRoom() {
        LocalDate date = LocalDate.of(2026, 5, 10);
        OutboundSlipDto slip = newSlip("P-001", "에어디자이너", "OUT-001");
        when(slipServiceClient.getOutboundSlips(date, date)).thenReturn(List.of(slip));
        when(chatRoomMappingRepository.findAllByPartnerCode("P-001"))
                .thenReturn(List.of(PartnerChatRoomMapping.manual(
                        "P-001", "에어디자이너", "에어디자이너 발주방")));

        DispatchBatchPreviewResponse resp = service.preview(new DispatchBatchPreviewRequest(date));

        assertThat(resp.totalSlips()).isEqualTo(1);
        assertThat(resp.mappedSlips()).isEqualTo(1);
        assertThat(resp.unmappedSlips()).isEqualTo(0);
        assertThat(resp.chatRooms()).hasSize(1);
        assertThat(resp.chatRooms().get(0).chatRoomName()).isEqualTo("에어디자이너 발주방");
        assertThat(resp.chatRooms().get(0).partners()).hasSize(1);
        assertThat(resp.chatRooms().get(0).partners().get(0).blocked()).isFalse();
        assertThat(resp.chatRooms().get(0).partners().get(0).message()).contains("[배차안내]");
        assertThat(resp.unmapped()).isEmpty();
    }

    @Test
    @DisplayName("단톡방 miss — mapping empty → unmapped 누적")
    void preview_chatRoomMiss_addsUnmapped() {
        LocalDate date = LocalDate.of(2026, 5, 10);
        OutboundSlipDto slip = newSlip("P-002", "거래처B", "OUT-002");
        when(slipServiceClient.getOutboundSlips(date, date)).thenReturn(List.of(slip));
        // chatRoomMappingRepository default = empty

        DispatchBatchPreviewResponse resp = service.preview(new DispatchBatchPreviewRequest(date));

        assertThat(resp.totalSlips()).isEqualTo(1);
        assertThat(resp.mappedSlips()).isEqualTo(0);
        assertThat(resp.unmappedSlips()).isEqualTo(1);
        assertThat(resp.chatRooms()).isEmpty();
        assertThat(resp.unmapped()).hasSize(1);
        assertThat(resp.unmapped().get(0).partnerCode()).isEqualTo("P-002");
        assertThat(resp.unmapped().get(0).slipNo()).isEqualTo("OUT-002");
        verify(blockedPartnerLookupClient).isBlocked("P-002");
    }

    @Test
    @DisplayName("partnerCode miss + legacy 이름 alias 매핑 → 단톡방 그룹 생성")
    void preview_partnerCodeMiss_usesLegacyNameAlias() {
        LocalDate date = LocalDate.of(2026, 5, 10);
        OutboundSlipDto slip = newSlip("P-MISS", "에어디자이너 주식회사", "OUT-LEGACY");
        when(slipServiceClient.getOutboundSlips(date, date)).thenReturn(List.of(slip));
        when(chatRoomMappingRepository.findAllByPartnerBusinessNameSnapshot("에어디자이너 주식회사"))
                .thenReturn(List.of(PartnerChatRoomMapping.fromNotionImport(
                        "LEGACY-NAME-abc123", "에어디자이너 주식회사", "에어디자이너 발주방", null)));

        DispatchBatchPreviewResponse resp = service.preview(new DispatchBatchPreviewRequest(date));

        assertThat(resp.mappedSlips()).isEqualTo(1);
        assertThat(resp.unmappedSlips()).isZero();
        assertThat(resp.chatRooms()).hasSize(1);
        assertThat(resp.chatRooms().get(0).chatRoomName()).isEqualTo("에어디자이너 발주방");
        assertThat(resp.chatRooms().get(0).partners().get(0).partnerCode()).isEqualTo("P-MISS");
    }

    @Test
    @DisplayName("blocked 가드 — blocked=true 인 partner 는 PartnerEntry.blocked=true")
    void preview_blockedPartner_marksBlocked() {
        LocalDate date = LocalDate.of(2026, 5, 10);
        OutboundSlipDto slip = newSlip("P-BLK", "차단거래처", "OUT-BLK");
        when(slipServiceClient.getOutboundSlips(date, date)).thenReturn(List.of(slip));
        when(chatRoomMappingRepository.findAllByPartnerCode("P-BLK"))
                .thenReturn(List.of(PartnerChatRoomMapping.manual(
                        "P-BLK", "차단거래처", "차단방")));
        when(blockedPartnerLookupClient.isBlocked("P-BLK")).thenReturn(true);

        DispatchBatchPreviewResponse resp = service.preview(new DispatchBatchPreviewRequest(date));

        assertThat(resp.chatRooms()).hasSize(1);
        assertThat(resp.chatRooms().get(0).partners().get(0).blocked()).isTrue();
        // mappedSlips 는 단톡방 매핑 발견 시 +1 (blocked 와 무관 — 카운트는 매핑 기준)
        assertThat(resp.mappedSlips()).isEqualTo(1);
    }

    @Test
    @DisplayName("slip 빈 리스트 — 빈 응답 반환 (오류 아님)")
    void preview_emptySlips_returnsEmpty() {
        LocalDate date = LocalDate.of(2026, 5, 10);
        when(slipServiceClient.getOutboundSlips(date, date)).thenReturn(List.of());

        DispatchBatchPreviewResponse resp = service.preview(new DispatchBatchPreviewRequest(date));

        assertThat(resp.totalSlips()).isZero();
        assertThat(resp.chatRooms()).isEmpty();
        assertThat(resp.unmapped()).isEmpty();
    }

    @Test
    @DisplayName("partner_code 누락 slip → unmapped 누적 (회복성)")
    void preview_missingPartnerCode_addsUnmapped() {
        LocalDate date = LocalDate.of(2026, 5, 10);
        OutboundSlipDto slip = new OutboundSlipDto(
                "OUT-NOCODE", null, "코드없음거래처", date,
                LocalDateTime.of(2026, 5, 10, 10, 0),
                "주소", List.of(new OutboundSlipLineDto("품목", 1)));
        when(slipServiceClient.getOutboundSlips(date, date)).thenReturn(List.of(slip));

        DispatchBatchPreviewResponse resp = service.preview(new DispatchBatchPreviewRequest(date));

        assertThat(resp.unmapped()).hasSize(1);
        assertThat(resp.unmapped().get(0).partnerCode()).isNull();

        // null 입력 가드
        assertThatThrownBy(() -> service.preview(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.preview(new DispatchBatchPreviewRequest(null)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private OutboundSlipDto newSlip(String partnerCode, String partnerName, String slipNo) {
        return new OutboundSlipDto(
                slipNo,
                partnerCode,
                partnerName,
                LocalDate.of(2026, 5, 10),
                LocalDateTime.of(2026, 5, 10, 10, 0),
                "서울시 강남구",
                List.of(new OutboundSlipLineDto("산소호흡기", 3)));
    }
}
