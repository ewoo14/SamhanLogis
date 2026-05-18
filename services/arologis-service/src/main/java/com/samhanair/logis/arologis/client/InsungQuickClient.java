package com.samhanair.logis.arologis.client;

import com.samhanair.logis.arologis.client.dto.InsungDriverMatchResponse;
import com.samhanair.logis.arologis.client.dto.InsungOrderStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import java.util.List;

/**
 * 인성데이타 퀵프로그램 REST 어댑터 인터페이스 — Phase 10 W10-2.
 *
 * <p>실 API 스펙 미확정 상태에서도 interface + impl 분리로 교체 용이하게 설계.
 * {@code sandboxMode=true} 시 impl 내부에서 mock 응답 반환 (실 API 미호출).
 *
 * <p>UUID 비공개 가드: 응답 DTO 에서 내부 UUID 노출 없음. {@link InsungDriverMatchResponse#vendorDriverId()} 는
 * 인성 vendor 측 식별자 (문자열) — driverCode = {@code INSUNG-<vendorDriverId>} 로 변환.
 *
 * <p>IT 에서 {@code @MockBean} 으로 격리 필수
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
public interface InsungQuickClient {

    /**
     * 배차 등록 — 차량 + 정차 정보를 인성 API 에 전송.
     *
     * @param vehicle  배차할 차량
     * @param stops    정차 목록
     * @return 인성 vendor 주문번호 (vendorOrderId). 실패 시 {@code null} (fail-soft).
     */
    String requestOrder(Vehicle vehicle, List<VehicleStop> stops);

    /**
     * 매칭 요청 — 등록된 주문에 대한 기사 매칭 trigger.
     *
     * @param vendorOrderId 인성 vendor 주문번호 ({@link #requestOrder} 반환값)
     * @return 매칭 시도 결과. 매칭 진행 중이면 {@code matched=false}. 실패 시 {@code null} (fail-soft).
     */
    InsungDriverMatchResponse requestMatch(String vendorOrderId);

    /**
     * 주문 취소 — 인성 API 에 취소 요청.
     *
     * @param vendorOrderId 인성 vendor 주문번호
     */
    void cancelOrder(String vendorOrderId);

    /**
     * 주문 상태 조회 — 현재 인성 API 에서의 주문 상태 조회.
     *
     * @param vendorOrderId 인성 vendor 주문번호
     * @return 주문 상태. 조회 실패 시 {@code null} (fail-soft).
     */
    InsungOrderStatus queryStatus(String vendorOrderId);
}
