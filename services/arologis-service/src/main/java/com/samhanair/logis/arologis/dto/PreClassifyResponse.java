package com.samhanair.logis.arologis.dto;

import java.util.List;
import java.util.Map;

/**
 * 가배차 분류 리스트 응답 — Phase 10 PR-E1 BE-A2 (legacy GAS 2번 이식).
 *
 * <p>출고전표 → 거래처 주소 → RegionClassifier 매칭 → 권역 그룹별 그룹핑.
 *
 * <p>UUID 비공개 가드 — entry 의 slipId 는 응답에 포함하지 않음 (slipNo / partnerCode / partnerName /
 * regionGroup 만 사용자 노출).
 *
 * @param regionGroups 권역 그룹명 → 해당 그룹의 슬립 entry 리스트 매핑.
 *                     순서 보존 (LinkedHashMap 권장 — 서비스 측 정렬 정책 반영).
 * @param unclassified RegionClassifier 매칭 실패 (group=null) 출고전표 entry 리스트.
 *                     사용자 화면에서 "지역 미분류" 별도 영역에 노출.
 */
public record PreClassifyResponse(
        Map<String, List<Entry>> regionGroups,
        List<Entry> unclassified,
        int unknownWarehouseCount
) {

    /**
     * 가배차 분류 entry — 슬립 1건 = entry 1건.
     *
     * @param slipNo 전표번호 (사용자 노출 식별자, 필수)
     * @param partnerCode 거래처 코드 (사용자 노출 식별자)
     * @param partnerName 거래처 상호 (사용자 노출)
     * @param address 거래처 주소 (RegionClassifier 입력값)
     * @param regionGroup 매칭된 권역 그룹명 (예: "서울특별시" / "경기동부"). 미매칭 시 null.
     * @param dispatchPlanned 본 슬립이 이미 dispatch 에 할당되어 있는지 여부 — 가배차 화면에서
     *                       이미 배차된 슬립을 시각 구분할 때 사용 (slip_no 매칭).
     */
    public record Entry(
            String slipNo,
            String partnerCode,
            String partnerName,
            String address,
            String regionGroup,
            boolean dispatchPlanned
    ) {}
}
