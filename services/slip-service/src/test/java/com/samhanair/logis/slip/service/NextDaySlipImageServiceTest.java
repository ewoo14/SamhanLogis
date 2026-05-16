package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse.RegionGroup;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse.SlipImageEntry;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PR-E1 BE-A5 — NextDaySlipImageService 단위 테스트 4 case.
 *
 * <p>외부 client 2종 (NotificationChatRoomClient / PartnerBlockClient) 는 @Mock 격리.
 *
 * <p>Test case:
 * <ol>
 *   <li>정상 — slip 1건 + chat 매핑 + block 미적중 + region "서울특별시"</li>
 *   <li>단톡방 miss — chat client 가 empty list 반환 (graceful)</li>
 *   <li>block hit — block Set 에 partnerCode 포함 → entry.blocked = true</li>
 *   <li>region miss — slip.classifiedRegionGroup null → "미분류" group 으로 분류</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class NextDaySlipImageServiceTest {

    @Mock private SlipRepository slipRepository;
    @Mock private NotificationChatRoomClient notificationChatRoomClient;
    @Mock private PartnerBlockClient partnerBlockClient;

    @InjectMocks private NextDaySlipImageService service;

    private LocalDate baseDate;
    private LocalDate targetDate;

    @BeforeEach
    void setUp() {
        baseDate = LocalDate.of(2026, 5, 9);
        targetDate = baseDate.plusDays(1); // 2026-05-10
    }

    /**
     * 도메인 reflection 빌드 헬퍼 — protected ctor 우회.
     * V15 신규 컬럼 (partnerCode / classifiedRegionGroup) + 기본 식별자 직접 주입.
     */
    private Slip mockSlip(String slipNo, String partnerCode, String regionGroup,
                          String partnerName, String driverName, String driverPhone) {
        Slip slip = new Slip() { };
        ReflectionTestUtils.setField(slip, "slipNo", slipNo);
        ReflectionTestUtils.setField(slip, "slipDate", targetDate);
        ReflectionTestUtils.setField(slip, "partnerCode", partnerCode);
        ReflectionTestUtils.setField(slip, "partnerName", partnerName);
        ReflectionTestUtils.setField(slip, "classifiedRegionGroup", regionGroup);
        ReflectionTestUtils.setField(slip, "driverName", driverName);
        ReflectionTestUtils.setField(slip, "driverPhone", driverPhone);
        ReflectionTestUtils.setField(slip, "memo", "테스트 메모");
        return slip;
    }

    @Test
    void buildImageData_normal_oneSlipWithChatAndRegion() {
        Slip slip = mockSlip("2026/05/10-001", "P-2026-0001", "서울특별시",
                "삼한공조", "홍기사", "010-1234-5678");
        when(slipRepository.findAllBySlipDateAndIsDeletedFalse(targetDate))
                .thenReturn(List.of(slip));
        when(partnerBlockClient.findAllBlockedPartnerCodes()).thenReturn(Set.of());
        when(notificationChatRoomClient.findChatRoomNames("P-2026-0001", "삼한공조"))
                .thenReturn(List.of("삼한 발주방"));

        NextDaySlipImageResponse res = service.buildImageData(baseDate);

        assertThat(res.targetDate()).isEqualTo(targetDate);
        assertThat(res.totalSlips()).isEqualTo(1);
        assertThat(res.regionGroups()).hasSize(1);
        RegionGroup group = res.regionGroups().get(0);
        assertThat(group.regionGroup()).isEqualTo("서울특별시");
        assertThat(group.slipCount()).isEqualTo(1);
        SlipImageEntry entry = group.slips().get(0);
        assertThat(entry.slipNo()).isEqualTo("2026/05/10-001");
        assertThat(entry.partnerCode()).isEqualTo("P-2026-0001");
        assertThat(entry.partnerName()).isEqualTo("삼한공조");
        assertThat(entry.chatRoomNames()).containsExactly("삼한 발주방");
        assertThat(entry.blocked()).isFalse();
        verify(notificationChatRoomClient, times(1)).findChatRoomNames("P-2026-0001", "삼한공조");
    }

    @Test
    void buildImageData_chatMissing_returnsEmptyChatList() {
        Slip slip = mockSlip("2026/05/10-002", "P-2026-9999", "경기남부",
                "기타거래처", "김기사", "010-2222-3333");
        when(slipRepository.findAllBySlipDateAndIsDeletedFalse(targetDate))
                .thenReturn(List.of(slip));
        when(partnerBlockClient.findAllBlockedPartnerCodes()).thenReturn(Set.of());
        when(notificationChatRoomClient.findChatRoomNames("P-2026-9999", "기타거래처"))
                .thenReturn(List.of()); // graceful empty

        NextDaySlipImageResponse res = service.buildImageData(baseDate);

        assertThat(res.regionGroups()).hasSize(1);
        SlipImageEntry entry = res.regionGroups().get(0).slips().get(0);
        assertThat(entry.chatRoomNames()).isEmpty();
        assertThat(entry.blocked()).isFalse();
    }

    @Test
    void buildImageData_blockHit_setsBlockedTrue() {
        Slip slip = mockSlip("2026/05/10-003", "P-2026-BLK", "인천광역시",
                "차단거래처", "이기사", "010-5555-6666");
        when(slipRepository.findAllBySlipDateAndIsDeletedFalse(targetDate))
                .thenReturn(List.of(slip));
        Set<String> blocked = new HashSet<>();
        blocked.add("P-2026-BLK");
        when(partnerBlockClient.findAllBlockedPartnerCodes()).thenReturn(blocked);
        when(notificationChatRoomClient.findChatRoomNames(eq("P-2026-BLK"), eq("차단거래처")))
                .thenReturn(List.of());

        NextDaySlipImageResponse res = service.buildImageData(baseDate);

        SlipImageEntry entry = res.regionGroups().get(0).slips().get(0);
        assertThat(entry.blocked()).isTrue();
    }

    @Test
    void buildImageData_regionMissing_groupsAsUnclassified() {
        Slip slip = mockSlip("2026/05/10-004", "P-2026-NOREG", null,
                "지역미상", null, null);
        when(slipRepository.findAllBySlipDateAndIsDeletedFalse(targetDate))
                .thenReturn(List.of(slip));
        when(partnerBlockClient.findAllBlockedPartnerCodes()).thenReturn(Set.of());
        when(notificationChatRoomClient.findChatRoomNames(any(), any())).thenReturn(List.of());

        NextDaySlipImageResponse res = service.buildImageData(baseDate);

        assertThat(res.regionGroups()).hasSize(1);
        RegionGroup group = res.regionGroups().get(0);
        assertThat(group.regionGroup()).isEqualTo("미분류");
        assertThat(group.slips().get(0).classifiedRegionGroup()).isNull();
    }
}
