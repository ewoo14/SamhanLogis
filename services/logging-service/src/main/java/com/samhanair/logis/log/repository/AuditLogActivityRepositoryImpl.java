package com.samhanair.logis.log.repository;

import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.json.JsonData;
import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.web.ActivityLogSearchCondition;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;
import org.springframework.data.elasticsearch.core.query.IndexQuery;
import org.springframework.data.elasticsearch.core.query.IndexQueryBuilder;

/**
 * Elasticsearch NativeQuery 기반 활동 로그 검색 구현.
 *
 * <p>Spring Data 커스텀 fragment Impl — {@code @Repository} 등 stereotype 을 붙이지 않는다.
 * 명명 규약(AuditLogActivityRepository + Impl)으로 repository 인프라가 발견·생성하므로 독립 빈이
 * 되어선 안 된다(독립 빈이면 ES autoconfig 제외 IT 에서 ElasticsearchOperations 미존재로 컨텍스트 로드 실패).
 */
public class AuditLogActivityRepositoryImpl implements AuditLogActivityRepository {

    private final ElasticsearchOperations operations;

    public AuditLogActivityRepositoryImpl(ElasticsearchOperations operations) {
        this.operations = operations;
    }

    @Override
    public Page<AuditLog> searchActivity(ActivityLogSearchCondition condition, Pageable pageable) {
        NativeQuery query = NativeQuery.builder()
                .withQuery(buildQuery(condition))
                .withPageable(pageable)
                .build();
        SearchHits<AuditLog> hits = operations.search(query, AuditLog.class,
                IndexCoordinates.of("samhan-audit-logs", "samhan-audit-logs-*"));
        List<AuditLog> rows = hits.getSearchHits().stream()
                .map(SearchHit::getContent)
                .toList();
        return new PageImpl<>(rows, pageable, hits.getTotalHits());
    }

    @Override
    public AuditLog persistByRetentionClass(AuditLog auditLog) {
        String suffix = auditLog.getRetentionClass() == null
                ? "c" : auditLog.getRetentionClass().name().toLowerCase();
        IndexQuery query = new IndexQueryBuilder()
                .withId(auditLog.getId())
                .withObject(auditLog)
                .build();
        operations.index(query, IndexCoordinates.of("samhan-audit-logs-" + suffix));
        return auditLog;
    }

    private static Query buildQuery(ActivityLogSearchCondition condition) {
        List<Query> filters = new ArrayList<>();
        addTerm(filters, "action", condition.action());
        addTerm(filters, "resourceType", condition.resourceType());
        addTerm(filters, "resourceId", condition.resourceId());
        addTerm(filters, "userId", condition.userId());
        addMatch(filters, "description", condition.q());
        addRange(filters, condition.fromInstant(), condition.toInstant());

        if (filters.isEmpty()) {
            return Query.of(q -> q.matchAll(m -> m));
        }
        return Query.of(q -> q.bool(b -> b.filter(filters)));
    }

    private static void addTerm(List<Query> filters, String field, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        filters.add(Query.of(q -> q.term(t -> t.field(field).value(FieldValue.of(value.trim())))));
    }

    private static void addMatch(List<Query> filters, String field, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        filters.add(Query.of(q -> q.match(m -> m.field(field).query(value.trim()))));
    }

    private static void addRange(List<Query> filters, Instant from, Instant to) {
        if (from == null && to == null) {
            return;
        }
        filters.add(Query.of(q -> q.range(r -> {
            r.field("occurredAt");
            if (from != null) {
                r.gte(JsonData.of(from.toString()));
            }
            if (to != null) {
                r.lte(JsonData.of(to.toString()));
            }
            return r;
        })));
    }
}
