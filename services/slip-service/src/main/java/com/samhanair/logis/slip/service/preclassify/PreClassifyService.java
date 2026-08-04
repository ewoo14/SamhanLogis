package com.samhanair.logis.slip.service.preclassify;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 삼한에서 수행하는 레거시 8모드 가배차 분류 계산. 판정 순서는 기존 코드와 동일하다. */
@Service
@RequiredArgsConstructor
public class PreClassifyService {
    private static final Pattern LEGACY_CARRIER_MARKER = Pattern.compile("(?:경동|로젠)[^/|:]*[/|:]");
    private final PreClassifySlipQuery slipQuery;
    private final PreClassifySupportClient supportClient;

    @Transactional(readOnly = true)
    public PreClassifyResponse classify(LocalDate from, LocalDate to, DispatchExecutionMode mode) {
        validateRange(from, to);
        List<PreClassifySlip> slips = slipQuery.find(from, to);
        List<String> partnerCodes = slips.stream().map(PreClassifySlip::partnerCode).filter(c -> c != null && !c.isBlank()).distinct().toList();
        PreClassifySupport support = supportClient.getSupport(partnerCodes);
        int unknown = (int) slips.stream().filter(s -> !Set.of("SANGIL", "CHOWOL").contains(s.warehouseBusinessType())).count();
        if (mode != null) slips = slips.stream().filter(s -> matchesMode(s, mode)).toList();
        Set<String> planned = support.plannedPartnerCodes().stream().collect(Collectors.toSet());
        Map<String, List<PreClassifyResponse.Entry>> groups = new LinkedHashMap<>();
        List<PreClassifyResponse.Entry> unclassified = new ArrayList<>();
        for (PreClassifySlip slip : slips) {
            String region = classifyRegion(slip.address(), support.regionRules());
            var entry = new PreClassifyResponse.Entry(slip.slipNo(), slip.partnerCode(), slip.partnerName(),
                    slip.address(), region, slip.partnerCode() != null && planned.contains(slip.partnerCode()));
            if (region == null) unclassified.add(entry);
            else groups.computeIfAbsent(region, ignored -> new ArrayList<>()).add(entry);
        }
        return new PreClassifyResponse(groups, unclassified, unknown);
    }

    private boolean matchesMode(PreClassifySlip slip, DispatchExecutionMode mode) {
        String address = slip.address() == null ? "" : slip.address().trim();
        String prefix = address.substring(0, Math.min(10, address.length()));
        if (containsAny(prefix, "회수", "회차", "차용", "대여", "반납", "자가") || LEGACY_CARRIER_MARKER.matcher(address).find()) return false;
        boolean stack = "STACK".equals(slip.deliveryTag());
        boolean region = "REGION".equals(slip.deliveryTag());
        if (mode == DispatchExecutionMode.STACK_ONLY) return stack && warehouseAllowed(slip, mode);
        if (mode == DispatchExecutionMode.REGION_ONLY) return region && warehouseAllowed(slip, mode);
        if (stack) return true;
        if (mode.number() <= 3 && region) return false;
        return warehouseAllowed(slip, mode);
    }

    private boolean warehouseAllowed(PreClassifySlip slip, DispatchExecutionMode mode) {
        return switch (mode) {
            case CHOWOL_REGION_EXCLUDED, CHOWOL_REGION_INCLUDED -> "CHOWOL".equals(slip.warehouseBusinessType());
            case SANGIL_REGION_EXCLUDED, SANGIL_REGION_INCLUDED -> "SANGIL".equals(slip.warehouseBusinessType());
            default -> "SANGIL".equals(slip.warehouseBusinessType()) || "CHOWOL".equals(slip.warehouseBusinessType());
        };
    }

    private String classifyRegion(String address, List<RegionRule> rules) {
        if (address == null || address.isBlank()) return null;
        String normalized = address.replace(" ", "");
        for (RegionRule rule : rules) {
            String prefix = cityPrefix(rule.groupName());
            if (prefix != null && normalized.contains(prefix)) {
                for (String keyword : rule.keywords().split(",")) if (!keyword.isBlank() && normalized.contains(keyword.replace(" ", ""))) return rule.groupName();
                return rule.groupName();
            }
        }
        for (RegionRule rule : rules) for (String keyword : rule.keywords().split(",")) if (!keyword.isBlank() && normalized.contains(keyword.replace(" ", ""))) return rule.groupName();
        for (RegionRule rule : rules) if (cityPrefix(rule.groupName()) != null && normalized.contains(cityPrefix(rule.groupName()))) return rule.groupName();
        return null;
    }

    private String cityPrefix(String name) {
        if (name == null) return null;
        for (String suffix : List.of("특별자치도", "특별자치시", "특별시", "광역시", "도")) if (name.endsWith(suffix)) return name.substring(0, name.length() - suffix.length());
        return null;
    }
    private boolean containsAny(String value, String... needles) { for (String needle : needles) if (value.contains(needle)) return true; return false; }
    private void validateRange(LocalDate from, LocalDate to) { if (from == null || to == null || to.isBefore(from)) throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 는 유효한 기간이어야 합니다"); }
}
