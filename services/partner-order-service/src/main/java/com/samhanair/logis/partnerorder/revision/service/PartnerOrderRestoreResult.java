package com.samhanair.logis.partnerorder.revision.service;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;

/**
 * 거래처 주문 복원(restore) 결과 값객체 (Phase 2.4 복원 가드 정책 변경).
 *
 * <p>복원이 허용된 상태(DRAFT / CONFIRMED / 추후 ON_HOLD)에서 복원이 완료된 후
 * 컨트롤러가 추가 안내를 제공하기 위한 플래그를 동반하여 반환한다.
 *
 * <p>{@code slipResyncRequired}:
 * <ul>
 *   <li>{@code true}  — 복원 직전 주문 상태가 {@link PartnerOrderStatus#CONFIRMED} 였음.
 *       헤더·라인이 원복되었으나 연결된 출고전표(slipNo)는 그대로이므로,
 *       출고전표 재발행 여부를 담당자가 확인해야 한다.</li>
 *   <li>{@code false} — 복원 직전 상태가 DRAFT(또는 추후 ON_HOLD 등).
 *       slip 연동 필드와의 정합성 문제가 없다.</li>
 * </ul>
 *
 * @param order              헤더+라인 복원이 완료된 영속 상태의 거래처 주문
 * @param slipResyncRequired 복원 직전 주문이 CONFIRMED 상태였으면 {@code true}
 */
public record PartnerOrderRestoreResult(
        PartnerOrder order,
        boolean slipResyncRequired
) {
}
