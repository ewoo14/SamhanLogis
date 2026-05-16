package com.samhanair.logis.inventory.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * DPS 비교 결과 저장내역.
 *
 * <p>legacy GAS DPS 앱의 Notion {@code 저장내역1/2} payload 를 PostgreSQL JSONB 로 대체한다.
 * BaseEntity 7 audit 필드와 {@code is_deleted=false} soft-delete restriction 을 사용하며,
 * 화면에는 {@link #id} 를 노출하지 않고 저장주제, 작성자, 작성시각만 표시한다.
 */
@Entity
@Getter
@Table(name = "dps_save_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DpsSaveHistory extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "program_type", nullable = false, length = 20)
    private DpsProgramType programType;

    @Enumerated(EnumType.STRING)
    @Column(name = "save_mode", nullable = false, length = 20)
    private DpsSaveMode saveMode;

    @Column(name = "topic", nullable = false, length = 200)
    private String topic;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_params", nullable = false, columnDefinition = "jsonb")
    private JsonNode requestParams;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_payload", nullable = false, columnDefinition = "jsonb")
    private JsonNode responsePayload;

    private DpsSaveHistory(DpsProgramType programType,
                           DpsSaveMode saveMode,
                           String topic,
                           JsonNode requestParams,
                           JsonNode responsePayload) {
        this.programType = programType;
        this.saveMode = saveMode;
        this.topic = normalizeTopic(topic, saveMode);
        this.requestParams = requestParams;
        this.responsePayload = responsePayload;
    }

    /**
     * 신규 DPS 저장내역을 생성한다.
     *
     * @param programType 프로그램 구분
     * @param saveMode 저장 방식
     * @param topic 저장주제
     * @param requestParams 조회 조건과 요약 JSON
     * @param responsePayload 복원용 결과 payload JSON
     * @return 영속화 전 저장내역 entity
     */
    public static DpsSaveHistory create(DpsProgramType programType,
                                        DpsSaveMode saveMode,
                                        String topic,
                                        JsonNode requestParams,
                                        JsonNode responsePayload) {
        if (programType == null) {
            throw new IllegalArgumentException("programType 은 필수입니다");
        }
        if (saveMode == null) {
            throw new IllegalArgumentException("saveMode 는 필수입니다");
        }
        if (requestParams == null || requestParams.isNull()) {
            throw new IllegalArgumentException("requestParams 는 필수입니다");
        }
        if (responsePayload == null || responsePayload.isNull()) {
            throw new IllegalArgumentException("responsePayload 는 필수입니다");
        }
        return new DpsSaveHistory(programType, saveMode, topic, requestParams, responsePayload);
    }

    /**
     * 저장주제를 변경한다.
     *
     * @param newTopic 새 저장주제
     * @return method chain 용 현재 entity
     */
    public DpsSaveHistory rename(String newTopic) {
        this.topic = normalizeTopic(newTopic, this.saveMode);
        return this;
    }

    /**
     * 자동 저장을 새 row 로 대체하기 위해 현재 row 를 soft-delete 한다.
     *
     * @param userId 삭제 audit 사용자
     * @return method chain 용 현재 entity
     */
    public DpsSaveHistory supersedeBy(String userId) {
        markDeleted(userId);
        return this;
    }

    private static String normalizeTopic(String topic, DpsSaveMode saveMode) {
        if (topic == null || topic.isBlank()) {
            return saveMode == DpsSaveMode.AUTO_LATEST ? "자동저장" : "";
        }
        return topic.trim();
    }
}
