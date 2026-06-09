package com.samhanair.logis.product.web.dto;

import java.util.List;

/**
 * 세트(BUNDLE) 구성품 정합 점검 결과 — 운영 전/시트 sync 후 재실행용.
 *
 * <p>{@code healthy=true} (issues 비어있음) 이면 모든 BUNDLE 구성품이 활성 품목으로 해소되어
 * 세트 전개(견적/전표)가 NOT_FOUND 없이 동작함을 의미. {@code issues} 가 있으면 해당 세트는
 * 전개 시 "세트 구성품 일부를 찾을 수 없습니다(미등록/단종)" 로 거부된다.
 *
 * @param healthy                  미해소 구성품 0 여부
 * @param totalBundles             전체 BUNDLE 부모 수
 * @param issueBundleCount         미해소 구성품을 가진 BUNDLE 수
 * @param unresolvedComponentCount 미해소 구성품 총수
 * @param issues                   세트별 미해소 구성품 목록 (healthy=true 면 빈 리스트)
 */
public record BundleIntegrityResponse(
        boolean healthy,
        long totalBundles,
        int issueBundleCount,
        int unresolvedComponentCount,
        List<BundleIssue> issues) {

    /**
     * 미해소 구성품을 가진 세트 1건.
     *
     * @param bundleModelCode      세트 부모 modelCode
     * @param bundleName           세트 부모 품목명
     * @param unresolvedComponents 해소 실패 구성품 목록
     */
    public record BundleIssue(
            String bundleModelCode,
            String bundleName,
            List<UnresolvedComponent> unresolvedComponents) {
    }

    /**
     * 활성 품목으로 해소되지 않은 구성품 1건.
     *
     * @param componentProductCode bundle_component.componentProductCode (= 기대 products.modelCode)
     * @param componentKind        구성품 종류 (INDOOR/OUTDOOR/PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT)
     */
    public record UnresolvedComponent(
            String componentProductCode,
            String componentKind) {
    }
}
