package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/**
 * 수동 배차 요청 DTO — Phase 10 P1-5.
 *
 * <p>카톡 메시지 외 admin UI 직접 입력 경로. 매뉴얼
 * {@code docs/manual/05-arologis/02-수동-배차.md §2-2} 입력 폼과 1:1 매핑.
 *
 * <p>UUID 비공개 가드 — 응답에는 dispatchId 만 노출, 본 요청은 사용자 노출 식별자
 * (partnerName / vehicle sequence / stop sequence) 만 사용.
 *
 * <p>차량 / 정차는 동적 List — Bean Validation {@code @Valid} 로 nested 검증 cascade.
 *
 * @param dispatchDate 배차 도착 일자 (필수, yyyy-MM-dd)
 * @param dispatchType 배차 유형 (DAY / NIGHT / EXPRESS, 필수)
 * @param driverCode 수동 지정 driver-code (옵션 — null 이면 MockDriverMatcher 자동 매칭)
 * @param vehicles 차량 목록 (1대 이상 필수)
 */
public record ManualDispatchRequest(
        @NotNull(message = "dispatchDate 필수") LocalDate dispatchDate,
        @NotNull(message = "dispatchType 필수") DispatchType dispatchType,
        @Size(max = 50) String driverCode,
        @NotEmpty(message = "vehicles 1대 이상 필수")
        @Size(max = 99, message = "vehicles 최대 99대")
        @Valid List<ManualVehicle> vehicles
) {

    /**
     * 차량 1대 입력.
     *
     * @param sequence 차량 번호 (1 이상)
     * @param tonnage 톤수 (필수)
     * @param label 차량 별명 (옵션, 카톡 헤더 옆 텍스트)
     * @param stops 정차 목록 (1건 이상 필수)
     */
    public record ManualVehicle(
            @NotNull @Min(1) Integer sequence,
            @NotNull(message = "tonnage 필수") VehicleTonnage tonnage,
            @Size(max = 200) String label,
            @NotEmpty(message = "stops 1건 이상 필수")
            @Size(max = 99, message = "stops 최대 99건")
            @Valid List<ManualStop> stops
    ) {}

    /**
     * 정차 1건 입력.
     *
     * <p>PR-E 진입 전 선행 R2 — {@code kakaoSeq} (Long, 카톡 슬립번호) 로 rename.
     * partner-service 의 partner_code (String) 는 PR-E1 lookup 결과로 별도 채워지며 본 요청 DTO 에는 미포함.
     *
     * @param sequence 정차 순서 (1 이상)
     * @param partnerName 거래처명 (옵션 — 입력 시 검색 키워드)
     * @param address 주소 (필수, 매뉴얼 §2-2 입력 폼)
     * @param kakaoSeq 카톡 슬립번호 (Long, 옵션 — W10-4 자동 brige 용)
     * @param notes 도착시각 / 특이사항 (옵션)
     */
    public record ManualStop(
            @NotNull @Min(1) Integer sequence,
            @Size(max = 200) String partnerName,
            @NotBlank(message = "address 필수") @Size(max = 500) String address,
            Long kakaoSeq,
            @Size(max = 50) String partnerCode,
            @Size(max = 1000) String notes
    ) {}
}
