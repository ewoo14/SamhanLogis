package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse.RegionGroup;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse.SlipImageEntry;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * PR-E1 BE-A5 — 다음날자 전표 이미지 데이터 조회 service.
 *
 * <p>legacy GAS 6번 "내일자 전표 이미지 생성" 의 자동 조회 이식. legacy 입력 = 이카운트 출고전표 엑셀.
 * 본 service = 자체 slip-service 출고전표 자동 조회 (이카운트 의존 0).
 *
 * <p>5 way join (서비스 호출):
 * <ol>
 *   <li>slip — slipRepository.findAllBySlipDateAndIsDeletedFalse(date+1)</li>
 *   <li>partner_code (slip.partnerCode 직접 — V15 snapshot)</li>
     *   <li>chat_room — notification-service partnerCode 조회, 미매핑 시 legacy 사업자명 alias fallback</li>
 *   <li>block — partner-service GET /api/v1/partners/admin/blocks (Feign, Set bulk)</li>
 *   <li>region — slip.classifiedRegionGroup 직접 (V15 snapshot, "미분류" fallback)</li>
 * </ol>
 *
 * <p>UUID 비공개 가드 — 응답에 partner_id 미노출 (partner_code / partner_name / slipNo / driverPhone 만).
 *
 * <p>외부 client 실패 시 graceful fallback:
 * <ul>
 *   <li>NotificationChatRoomClient 실패 → 슬립별 chatRoomNames = empty list</li>
 *   <li>PartnerBlockClient 실패 → 모든 슬립 blocked = false</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NextDaySlipImageService {

    /** 지역 미분류 슬립의 fallback group key. */
    private static final String UNCLASSIFIED_GROUP = "미분류";

    private final SlipRepository slipRepository;
    private final NotificationChatRoomClient notificationChatRoomClient;
    private final PartnerBlockClient partnerBlockClient;

    /**
     * 다음날자 (입력 date + 1) 활성 슬립 + 단톡방 + 발송금지 + 지역 5 way 조합.
     *
     * @param date 기준 날짜 (호출자가 today 지정 → 본 메서드가 +1 적용)
     * @return 지역 그룹별 묶음 응답 (legacy "내일자 전표 이미지" 페이지 구조)
     */
    public NextDaySlipImageResponse buildImageData(LocalDate date) {
        if (date == null) {
            date = LocalDate.now();
        }
        LocalDate targetDate = date.plusDays(1);
        List<Slip> slips = slipRepository.findAllBySlipDateAndIsDeletedFalse(targetDate);

        // 1. 발송금지 거래처 Set bulk lookup (1회 호출, slips 0건이어도 로직 단순화 위해 호출)
        Set<String> blockedPartnerCodes = partnerBlockClient.findAllBlockedPartnerCodes();

        // 2. partner_code → chatRoomNames cache (같은 partner_code 슬립 N건이어도 1회만 호출)
        Map<String, List<String>> chatRoomCache = new HashMap<>();

        // 3. 지역 그룹별 묶음 (LinkedHashMap 으로 입력 순서 보존 — 지역 미분류는 마지막)
        Map<String, List<SlipImageEntry>> grouped = new LinkedHashMap<>();

        for (Slip slip : slips) {
            String partnerCode = slip.getPartnerCode();
            // chat_room lookup (cache 적용, partner_code null 이면 빈 리스트)
            List<String> chatRoomNames;
            if (partnerCode == null || partnerCode.isBlank()) {
                chatRoomNames = Collections.emptyList();
            } else {
                chatRoomNames = chatRoomCache.computeIfAbsent(partnerCode,
                        code -> notificationChatRoomClient.findChatRoomNames(code, slip.getPartnerName()));
            }
            boolean blocked = (partnerCode != null && blockedPartnerCodes.contains(partnerCode))
                    || blockedPartnerCodes.contains(PartnerBlockClient.legacyNameKey(slip.getPartnerName()));

            String regionGroup = slip.getClassifiedRegionGroup();
            if (regionGroup == null || regionGroup.isBlank()) {
                regionGroup = UNCLASSIFIED_GROUP;
            }

            SlipImageEntry entry = new SlipImageEntry(
                    slip.getSlipNo(),
                    slip.getSlipDate(),
                    partnerCode,
                    slip.getPartnerName(),
                    slip.getDriverName(),
                    slip.getDriverPhone(),
                    slip.getClassifiedRegionGroup(),
                    slip.getMemo(),
                    chatRoomNames,
                    blocked);

            grouped.computeIfAbsent(regionGroup, k -> new ArrayList<>()).add(entry);
        }

        List<RegionGroup> regionGroups = new ArrayList<>();
        for (Map.Entry<String, List<SlipImageEntry>> e : grouped.entrySet()) {
            regionGroups.add(new RegionGroup(e.getKey(), e.getValue().size(), e.getValue()));
        }

        return new NextDaySlipImageResponse(targetDate, slips.size(), regionGroups);
    }
}
