package com.samhanair.logis.log.retention;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

/** ES 정책/템플릿을 멱등적으로 준비한다. ES 장애가 업무 서비스 기동을 막지 않도록 실패를 삼킨다. */
@Slf4j
@Component
public class ElasticsearchIlmInitializer {

    private final AuditRetentionProperties properties;
    private final String uri;

    public ElasticsearchIlmInitializer(AuditRetentionProperties properties,
                                       @Value("${spring.elasticsearch.uris:http://localhost:9200}") String uri) {
        this.properties = properties;
        this.uri = uri;
    }

    @PostConstruct
    void initialize() {
        try (RestClient client = RestClient.builder(HttpHost.create(uri)).build()) {
            putPolicy(client, "samhan-audit-ilm-a", properties.getChangeRetention());
            putPolicy(client, "samhan-audit-ilm-b", properties.getFailureRetention());
            putPolicy(client, "samhan-audit-ilm-c", properties.getReadRetention());
            putTemplate(client, "a", "samhan-audit-ilm-a");
            putTemplate(client, "b", "samhan-audit-ilm-b");
            putTemplate(client, "c", "samhan-audit-ilm-c");
        } catch (Exception ex) {
            log.warn("audit ILM bootstrap skipped; audit persistence remains fail-soft: {}",
                    ex.getClass().getSimpleName());
        }
    }

    private static void putPolicy(RestClient client, String name, Duration retention) throws Exception {
        Request request = new Request("PUT", "/_ilm/policy/" + name);
        request.setJsonEntity("{\"policy\":{\"phases\":{\"hot\":{\"actions\":{}},"
                + "\"delete\":{\"min_age\":\"" + Math.max(1, retention.toDays())
                + "d\",\"actions\":{\"delete\":{}}}}}}");
        client.performRequest(request);
    }

    private static void putTemplate(RestClient client, String suffix, String policy) throws Exception {
        Request request = new Request("PUT", "/_index_template/samhan-audit-logs-" + suffix);
        request.setJsonEntity("{\"index_patterns\":[\"samhan-audit-logs-" + suffix
                + "*\"],\"template\":{\"settings\":{\"index.lifecycle.name\":\""
                + policy + "\"}}}");
        client.performRequest(request);
    }
}
