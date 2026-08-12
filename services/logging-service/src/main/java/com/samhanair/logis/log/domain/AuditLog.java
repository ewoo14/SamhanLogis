package com.samhanair.logis.log.domain;

import java.time.Instant;
import java.util.Map;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Audit log document persisted to Elasticsearch.
 *
 * Trade-off note: a SpEL-based monthly index name (e.g.
 * {@code samhan-audit-logs-#{T(java.time.LocalDate).now()...}}) is not
 * cleanly supported by Spring Data Elasticsearch 5.x. We therefore use a
 * fixed index {@code samhan-audit-logs} and rely on Elasticsearch ILM
 * (index lifecycle management) / aliases to handle monthly rolling later.
 *
 * NOT a JPA entity — does not extend {@code BaseEntity}. The audit info
 * itself is the data, so generic created/updated columns add nothing.
 */
@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Document(indexName = "samhan-audit-logs", createIndex = true)
public class AuditLog {

    /** UUID generated client-side (in the consumer) before save. */
    @Id
    private String id;

    @Field(type = FieldType.Keyword)
    private String serviceName;

    @Field(type = FieldType.Keyword)
    private String userId;

    @Field(type = FieldType.Keyword)
    private String userRole;

    @Field(type = FieldType.Keyword)
    private String actorDisplayName;

    /** e.g. "SLIP_CREATE", "ACCOUNT_LOGIN". */
    @Field(type = FieldType.Keyword)
    private String action;

    @Field(type = FieldType.Keyword)
    private String resourceType;

    @Field(type = FieldType.Keyword)
    private String resourceId;

    @Field(type = FieldType.Keyword)
    private String internalResourceId;

    @Field(type = FieldType.Text)
    private String description;

    @Field(type = FieldType.Object)
    private Map<String, Object> beforeData;

    @Field(type = FieldType.Object)
    private Map<String, Object> afterData;

    @Field(type = FieldType.Keyword)
    private String ipAddress;

    @Field(type = FieldType.Keyword)
    private String userAgent;

    @Field(type = FieldType.Integer)
    private Integer httpStatus;

    @Field(type = FieldType.Keyword)
    private String errorCode;

    @Field(type = FieldType.Text)
    private String errorSummary;

    @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
    private Instant occurredAt;

    @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
    private Instant ingestedAt;
}
