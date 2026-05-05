package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 16종 bootstrap 정적 캐시 (legacy index.html 1230~1244 + Code.js doGet 4~23 → 본 entity).
 *
 * <p>각 row 는 하나의 카테고리 ({@link #cacheKey}) — homemulti / singleSets / singleParts /
 * homeDefaults / singleDefaults / singleMatPrices / commercialMulti / commercialParts /
 * oldProducts / homeInc / commInc / singleInc / singlePartsInc / specDetailMap / config /
 * logoData. 16개 row 가 V2 seed 또는 admin endpoint 로 채워진다.
 *
 * <p>{@code config} 행은 DC 9키 ({@code homeDiscount=0.45} 등) 가 제거된 client-safe 사본만
 * 보관 (M3 가드 일관 — 설계서 §6 + feedback_uuid_no_user_visibility 정신).
 *
 * <p>{@link #payloadJson} 은 legacy 의 객체 구조 그대로 (배열 또는 Map) — JSON 문자열로 직렬화.
 * BootstrapService 가 in-memory cache 로 prefetch 후 응답.
 */
@Entity
@Getter
@Table(name = "partner_order_bootstrap_cache")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BootstrapCacheConfig extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 캐시 키 (homemulti / singleSets / ... / config / logoData). UNIQUE. */
    @Column(name = "cache_key", nullable = false, length = 50, unique = true)
    private String cacheKey;

    /** legacy 객체 JSON 직렬화 (배열 또는 Map). */
    @Lob
    @Column(name = "payload_json", nullable = false)
    private String payloadJson;

    /** 캐시 무효화용 버전 — admin 이 갱신 시 1 증가. */
    @Column(name = "version", nullable = false)
    private long version;

    private BootstrapCacheConfig(String cacheKey, String payloadJson, long version) {
        if (cacheKey == null || cacheKey.isBlank()) {
            throw new IllegalArgumentException("cacheKey 필수");
        }
        if (payloadJson == null) {
            throw new IllegalArgumentException("payloadJson 필수");
        }
        this.cacheKey = cacheKey;
        this.payloadJson = payloadJson;
        this.version = version;
    }

    /** 신규 cache row 생성 (V2 seed 또는 admin endpoint). version=1 시작. */
    public static BootstrapCacheConfig of(String cacheKey, String payloadJson) {
        return new BootstrapCacheConfig(cacheKey, payloadJson, 1L);
    }

    /** 페이로드 갱신 — version 자동 증가. */
    public void update(String payloadJson) {
        if (payloadJson == null) {
            throw new IllegalArgumentException("payloadJson 필수");
        }
        this.payloadJson = payloadJson;
        this.version += 1;
    }
}
