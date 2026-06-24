package com.samhanair.logis.slip.domain.external;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 외부기사/배송사 마스터.
 *
 * <p>타배송사 SMS/인쇄 발송 대상의 이름·전화번호를 관리한다. {@code active} 는 운영상
 * 비활성 토글이며, {@link BaseEntity#markDeleted(String)} soft-delete 와 별개 상태다.
 * 사용자 화면 식별자는 name/phone 이며 UUID 는 라우팅 내부용으로만 사용한다.
 */
@Entity
@Getter
@Table(name = "external_carrier")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ExternalCarrier extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "phone", nullable = false, length = 30)
    private String phone;

    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "default_vehicle_type", length = 50)
    private String defaultVehicleType;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    private ExternalCarrier(String name, String phone, String email, String defaultVehicleType, String memo) {
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.defaultVehicleType = defaultVehicleType;
        this.memo = memo;
        this.active = true;
    }

    /**
     * 외부기사/배송사 마스터를 생성한다. 전화번호 중복은 서비스 레이어와 DB 부분 unique index 에서 검증한다.
     *
     * @param name 이름 또는 배송사명
     * @param phone SMS 수신 전화번호
     * @param email 이메일(선택)
     * @param defaultVehicleType 기본 차종(선택)
     * @param memo 운영 메모(선택)
     * @return 영속화 전 ExternalCarrier
     */
    public static ExternalCarrier create(
            String name,
            String phone,
            String email,
            String defaultVehicleType,
            String memo
    ) {
        return new ExternalCarrier(name, phone, email, defaultVehicleType, memo);
    }

    /**
     * 부분 수정한다. 필수 필드(name/phone)는 {@code null} 이면 미변경한다.
     *
     * <p>선택 필드(email/defaultVehicleType/memo)는 PATCH 부분수정 시맨틱을 정확히 구현한다:
     * {@code null}(요청 미전송) → 미변경, 빈 문자열("") → {@code null} 로 클리어, 값 → trim 후 설정.
     * 이로써 화면에서 기존 이메일/기본차종/메모를 지우고 저장하면 실제로 비워진다.
     *
     * @param name 이름 또는 배송사명 (null 이면 미변경)
     * @param phone SMS 수신 전화번호 (null 이면 미변경)
     * @param email 이메일 (null=미변경, ""=클리어, 값=설정)
     * @param defaultVehicleType 기본 차종 (null=미변경, ""=클리어, 값=설정)
     * @param memo 운영 메모 (null=미변경, ""=클리어, 값=설정)
     * @param active 활성 여부 (null 이면 미변경)
     */
    public void update(
            String name,
            String phone,
            String email,
            String defaultVehicleType,
            String memo,
            Boolean active
    ) {
        if (name != null) {
            this.name = name;
        }
        if (phone != null) {
            this.phone = phone;
        }
        if (email != null) {
            this.email = blankToNull(email);
        }
        if (defaultVehicleType != null) {
            this.defaultVehicleType = blankToNull(defaultVehicleType);
        }
        if (memo != null) {
            this.memo = blankToNull(memo);
        }
        if (active != null) {
            this.active = active;
        }
    }

    /** 빈 문자열을 {@code null} 로 정규화한다(클리어 시맨틱). 값이면 trim 후 반환. */
    private static String blankToNull(String value) {
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** 운영상 사용 가능 상태로 전환한다. */
    public void activate() {
        this.active = true;
    }

    /** 운영상 사용 중지 상태로 전환한다. soft-delete 와 별개다. */
    public void deactivate() {
        this.active = false;
    }
}
