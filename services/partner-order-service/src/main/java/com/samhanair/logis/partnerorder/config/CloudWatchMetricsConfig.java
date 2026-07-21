package com.samhanair.logis.partnerorder.config;

import io.micrometer.cloudwatch2.CloudWatchConfig;
import io.micrometer.cloudwatch2.CloudWatchMeterRegistry;
import io.micrometer.core.instrument.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient;

/**
 * production Micrometer → CloudWatch custom metric 수동 배선.
 *
 * <p><b>#863 R1 BLOCKING-1 근본 원인</b>: Spring Boot 는 CloudWatch metrics export 를 자동설정한 적이
 * 없다 — Boot 3.0 이 "제거"한 것이 아니라 애초에 제공하지 않는다({@code spring-boot-actuator-
 * autoconfigure} 의 {@code metrics/export/*} 자동설정 20종에 cloudwatch 는 없음). 이 서비스가
 * 이미 의존하는 {@code io.micrometer:micrometer-registry-cloudwatch2} 는 {@link CloudWatchMeterRegistry}
 * 구현체만 제공할 뿐 Spring 자동설정 진입점이 없어, 이 클래스가 생기기 전까지 {@code application.yml}
 * 의 {@code management.metrics.export.cloudwatch.*} 는 그 무엇도 소비하지 않는 완전한 무효 설정이었고
 * {@code SamhanLogis/PartnerOrder} custom metric 은 prod 에서 단 한 건도 생성되지 않았다.
 *
 * <h2>왜 spring-cloud-aws 스타터 대신 수동 배선인가</h2>
 * <p>{@code micrometer-registry-cloudwatch2} 는 AWS SDK v2 {@code cloudwatch}/{@code regions}
 * 아티팩트를 이미 전이 의존성으로 가져온다({@code build.gradle} 변경 0건으로 확인됨 — {@code
 * ./gradlew :services:partner-order-service:dependencies} 의 {@code runtimeClasspath} 에
 * {@code software.amazon.awssdk:cloudwatch} 가 이미 포함). SQS/S3/Secrets Manager/Parameter
 * Store 자동설정까지 함께 딸려오는 {@code spring-cloud-aws-starter-metrics} 전체를 새로 끌어오는
 * 대신, 필요한 두 빈만 이 클래스에서 직접 만들어 이 PR 의 blast radius 를 "이 서비스의 metric
 * export" 로 한정한다.
 *
 * <h2>기본값(local/dev/test/CI)에서는 완전히 비활성</h2>
 * <p>{@code management.metrics.export.cloudwatch.enabled=false}(기본값)이면 이
 * {@code @Configuration} 자체가 로드되지 않아 빈이 하나도 생성되지 않고 AWS SDK 호출도 없다.
 * {@code infrastructure/docker-compose.prod.yml} 의 {@code partner-order-service} 서비스 블록만
 * {@code CLOUDWATCH_METRICS_ENABLED=true} 를 주입한다.
 *
 * <h2>자격증명 — EC2 인스턴스 role</h2>
 * <p>{@link CloudWatchAsyncClient} 는 자격증명을 명시하지 않아 SDK 기본 체인({@code
 * DefaultCredentialsProvider})을 사용한다. {@code infrastructure/terraform/iam.tf} 의
 * {@code ec2_cloudwatch_policy} 가 EC2 instance role 에 이미 {@code cloudwatch:PutMetricData} 를
 * 부여하므로(이 PR 이전부터 존재) 별도 자격증명 주입이 필요 없다.
 *
 * <h2>부수 효과 — terminal counter 도 함께 실린다</h2>
 * <p>이 클래스는 {@code MeterRegistry} 를 composite 에 추가할 뿐이므로, {@code
 * OutboxObservabilityMetrics} 의 게이지 3종뿐 아니라 {@code SlipPublishOutboxResultWriter} 의
 * {@code partner_order_slip_publish_terminal} counter 도 추가 코드 없이 CloudWatch 로 함께
 * 전송된다.
 */
@Configuration
@ConditionalOnProperty(prefix = "management.metrics.export.cloudwatch", name = "enabled", havingValue = "true")
public class CloudWatchMetricsConfig {

    @Value("${management.metrics.export.cloudwatch.namespace:SamhanLogis/PartnerOrder}")
    private String namespace;

    /** Micrometer SIMPLE duration 형식("60s") — {@code DurationValidator} 가 자동 인식한다. */
    @Value("${management.metrics.export.cloudwatch.step:60s}")
    private String step;

    @Value("${management.metrics.export.cloudwatch.batch-size:20}")
    private String batchSize;

    /** EC2 instance role 자격증명과 동일 리전이어야 한다. */
    @Value("${management.metrics.export.cloudwatch.region:ap-northeast-2}")
    private String region;

    @Bean
    public CloudWatchAsyncClient cloudWatchAsyncClient() {
        return CloudWatchAsyncClient.builder()
                .region(Region.of(region))
                .build();
    }

    /**
     * {@link CloudWatchConfig} 는 함수형 인터페이스({@code get(String key)}) 이므로 맵 기반으로
     * 직접 구현한다. 키는 {@code prefix() + "." + 필드명}(예: {@code cloudwatch.namespace}) 형식이어야
     * {@code CloudWatchConfig} 의 기본 {@code PropertyValidator} 조회와 일치한다 — Spring 프로퍼티
     * 키({@code management.metrics.export.cloudwatch.*})를 그대로 넘기면 조용히 기본값/검증 실패로
     * 빠진다.
     */
    @Bean
    public CloudWatchConfig cloudWatchExportConfig() {
        Map<String, String> source = new HashMap<>();
        source.put("cloudwatch.namespace", namespace);
        source.put("cloudwatch.step", step);
        source.put("cloudwatch.batchSize", batchSize);
        return source::get;
    }

    @Bean
    public CloudWatchMeterRegistry cloudWatchMeterRegistry(CloudWatchConfig cloudWatchExportConfig,
                                                             CloudWatchAsyncClient cloudWatchAsyncClient) {
        return new CloudWatchMeterRegistry(cloudWatchExportConfig, Clock.SYSTEM, cloudWatchAsyncClient);
    }
}
