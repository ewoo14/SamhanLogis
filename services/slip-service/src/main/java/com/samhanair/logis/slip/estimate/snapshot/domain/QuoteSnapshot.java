package com.samhanair.logis.slip.estimate.snapshot.domain;

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
 * 종합견적서(웹) 저장 스냅샷 — legacy 종합견적서 Code.js 의 노션 견적 DB(saveQuoteSnapshot /
 * getQuoteHistory) 를 우리 DB 로 1:1 대체한 엔티티.
 *
 * <p>정규화된 {@link com.samhanair.logis.slip.estimate.domain.Estimate} 와 별개 — GAS 는
 * 종합견적서 UI 작업상태 "전체"를 base64 JSON blob({@link #snapshotData}) + 미리보기
 * 이미지({@link #previewImage}) 로 통째 저장/복원했다. 본 엔티티는 그 blob 을 그대로 보존하여
 * "그대로 불러오기"(EXACT 복원)를 보장한다. (구성품/옵션/DC/분기/서브파트 등 헤더+라인보다 풍부)
 *
 * <p>개발책임자 지시(2026-06-09): "GAS 코드가 노션에 저장된 견적 데이터를 그대로 복원하는 것처럼."
 */
@Entity
@Getter
@Table(name = "quote_snapshots")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class QuoteSnapshot extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 저장 담당자 이메일 (legacy 노션 "담당자 계정") — 목록 조회 시 사용자별 필터 기준. */
    @Column(name = "user_email", nullable = false, length = 255)
    private String userEmail;

    /** 거래처명 (legacy payload.summary.custName) — 목록 표시용. */
    @Column(name = "cust_name", length = 200)
    private String custName;

    /** legacy payload.data — 종합견적서 작업상태 전체 JSON.stringify 후 base64 blob (그대로 복원용). */
    @Column(name = "snapshot_data", nullable = false, columnDefinition = "TEXT")
    private String snapshotData;

    /** legacy payload.image — 견적 미리보기 이미지 base64 (선택). */
    @Column(name = "preview_image", columnDefinition = "TEXT")
    private String previewImage;

    /** legacy 노션 "저장일시"(payload.createdAt) — 목록 날짜필터/표시(created) 기준. */
    @Column(name = "saved_at", nullable = false)
    private LocalDateTime savedAt;

    /**
     * 신규 스냅샷 생성 — 서비스 레이어 전용 팩토리.
     *
     * @param userEmail 저장 담당자 이메일 (필수)
     * @param custName 거래처명 (nullable)
     * @param snapshotData base64 작업상태 blob (필수)
     * @param previewImage 미리보기 base64 (nullable)
     * @param savedAt 클라이언트 저장시각 (필수)
     */
    public QuoteSnapshot(String userEmail, String custName, String snapshotData,
            String previewImage, LocalDateTime savedAt) {
        if (userEmail == null || userEmail.isBlank()) {
            throw new IllegalArgumentException("userEmail 은 필수입니다");
        }
        if (snapshotData == null || snapshotData.isBlank()) {
            throw new IllegalArgumentException("snapshotData(견적 blob) 는 필수입니다");
        }
        this.userEmail = userEmail;
        this.custName = custName;
        this.snapshotData = snapshotData;
        this.previewImage = previewImage;
        this.savedAt = savedAt != null ? savedAt : LocalDateTime.now();
    }
}
