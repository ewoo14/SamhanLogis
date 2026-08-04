package com.samhanair.logis.slip.domain.dispatchgroup;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Locale;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 운송사 마스터. 거래처와 별도의 운송 실행 주체다. */
@Entity
@Getter
@Table(name = "carriers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Carrier extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "code", nullable = false, length = 50)
    private String code;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "is_arologis", nullable = false)
    private boolean arologis;

    @Column(name = "partner_id")
    private UUID partnerId;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    private Carrier(String code, String name, boolean arologis, UUID partnerId) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("운송사 코드 필수");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("운송사명 필수");
        this.code = code.trim().toUpperCase(Locale.ROOT);
        this.name = name.trim();
        this.arologis = arologis;
        this.partnerId = partnerId;
    }

    public static Carrier create(String code, String name, boolean arologis, UUID partnerId) {
        return new Carrier(code, name, arologis, partnerId);
    }

    public void update(String code, String name, boolean arologis, UUID partnerId) {
        if (code != null && !code.isBlank()) this.code = code.trim().toUpperCase(Locale.ROOT);
        if (name != null && !name.isBlank()) this.name = name.trim();
        this.arologis = arologis;
        this.partnerId = partnerId;
    }

    public void deactivate() { this.active = false; }
    public void activate() { this.active = true; }
}
