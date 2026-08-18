package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 임시저장 (legacy saveOrderSnapshot/saveDraft → 본 entity). 레거시 snapshot은 자동 만료하지 않는다.
 * {@link #draftSeq} 는 거래처별 1, 2, 3, ... 순번 — UNIQUE per partnerCode (DB
 * partial unique index 로 강제). confirm 시 {@code PO-CONF-{draftSeq}} 가 slip-service Idempotency-Key
 * 로 사용됨 (설계서 §3.6).
 *
 * <p>{@link #payloadJson} 은 legacy snapshot 페이로드 그대로 (image base64 포함). 사이즈가 큰 경우
 * 별도 BinaryStorage 분리는 향후 슬라이스에서 처리 (M4 skeleton 은 Lob 보관).
 */
@Entity
@Getter
@Table(name = "partner_order_drafts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerOrderDraft extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 거래처 코드 — 본인 거래처만 조회 가능 (legacy 동작). */
    @Column(name = "partner_code", nullable = false, length = 50)
    private String partnerCode;

    /** 거래처별 순번 (1부터). UNIQUE per partnerCode (active rows only). Idempotency-Key 시드. */
    @Column(name = "draft_seq", nullable = false)
    private long draftSeq;

    /** 사용자 표시용 라벨 (legacy 의 saveLabel — '2025/05/05 - 임시저장 1' 등). */
    @Column(name = "label", nullable = false, length = 100)
    private String label;

    /** legacy snapshot payload JSON (image base64 포함 가능). PostgreSQL TEXT — Hibernate 6 OID 회피. */
    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson;

    /** 레거시 보존 정책상 null. 기존 row 호환을 위해 nullable로 유지한다. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    private PartnerOrderDraft(String partnerCode, long draftSeq, String label,
                              String payloadJson, LocalDateTime expiresAt) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        if (draftSeq < 1) {
            throw new IllegalArgumentException("draftSeq 는 1 이상");
        }
        if (label == null || label.isBlank()) {
            throw new IllegalArgumentException("label 필수");
        }
        if (payloadJson == null) {
            throw new IllegalArgumentException("payloadJson 필수");
        }
        this.partnerCode = partnerCode;
        this.draftSeq = draftSeq;
        this.label = label;
        this.payloadJson = payloadJson;
        this.expiresAt = expiresAt;
    }

    /**
     * 임시저장 row 생성 — 레거시 동등성을 위해 {@code expiresAt}은 null을 허용한다.
     *
     * @param partnerCode 거래처 코드
     * @param draftSeq 거래처별 순번 (서비스에서 MAX+1 로 계산)
     * @param label 사용자 표시 라벨
     * @param payloadJson legacy snapshot 페이로드
     * @param expiresAt 만료 시각
     * @return 신규 PartnerOrderDraft (영속화 전)
     */
    public static PartnerOrderDraft create(String partnerCode, long draftSeq, String label,
                                           String payloadJson, LocalDateTime expiresAt) {
        return new PartnerOrderDraft(partnerCode, draftSeq, label, payloadJson, expiresAt);
    }

    /**
     * 본 draft 가 만료되었는지 확인.
     *
     * @param at 비교 시점 (보통 LocalDateTime.now())
     * @return expiresAt &lt; at 이면 true
     */
    public boolean isExpired(LocalDateTime at) {
        return this.expiresAt != null && this.expiresAt.isBefore(at);
    }

    /** 페이로드 갱신 (사용자 재저장). expiresAt 도 함께 연장. */
    public void update(String payloadJson, LocalDateTime newExpiresAt) {
        if (payloadJson == null) {
            throw new IllegalArgumentException("payloadJson 필수");
        }
        if (newExpiresAt == null) {
            throw new IllegalArgumentException("newExpiresAt 필수");
        }
        this.payloadJson = payloadJson;
        this.expiresAt = newExpiresAt;
    }
}
