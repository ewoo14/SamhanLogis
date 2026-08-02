package com.samhanair.logis.slip.config;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * slip-service DataSource 구성 — 메인 pool + 가격기억 전용 pool 격리 (D-R8-2 / R8-BE-4).
 *
 * <h2>왜 메인 DataSource 까지 여기서 선언하는가</h2>
 * 종전에는 Hikari {@code connection-timeout} 을 <b>4초로 전역 설정</b>해 가격기억 worker 가 pool
 * 고갈 시 빨리 fail-soft 하도록 했다. 그러나 그 4초는 slip-service 의 <b>모든</b> 사용자 요청에도
 * 걸렸고, fleet 26개 모듈 중 slip-service 만 이 값을 쓰는 유일 모듈이었다 (다른 모듈은 Hikari 기본
 * 30초). pool 이 포화되면 사용자 요청이 4초 만에 {@code SQLTransientConnectionException} 으로
 * 끊기고 {@code GlobalExceptionHandler} 의 unknown 분기를 타 <b>HTTP 500</b> 이 된다.
 *
 * <p>개발책임자 확정(D-R8-2) = <b>가격기억 전용 DataSource 격리 후 전역 30s 복원</b>. 이를 위해
 * 두 번째 {@link DataSource} 빈을 등록하는데, 그러면 Boot 의 {@code DataSourceAutoConfiguration}
 * 이 {@code @ConditionalOnMissingBean(DataSource.class)} 로 <b>back-off</b> 하여 메인 DataSource 가
 * 사라진다 (R8-BE-4 함정 ②). 따라서 메인 pool 도 여기서 명시 선언하고 {@link Primary} 를 부여한다
 * — {@code @Primary} 를 떼면 JPA/Flyway/자동구성이 어느 DataSource 를 쓸지 모호해져 기동이 깨진다.
 *
 * <h2>🔴 함정 ② 는 DataSource 에서 끝나지 않는다 — 그래서 TM·JdbcTemplate 은 빈이 아니다</h2>
 * 같은 back-off 가 <b>JdbcTemplate 과 트랜잭션 매니저에도</b> 적용된다. 전용
 * {@code priceMemoryJdbcTemplate} / {@code priceMemoryTransactionManager} 를 <b>빈으로 등록하면</b>:
 * <ul>
 *   <li>{@code JdbcTemplateAutoConfiguration} 은 {@code @ConditionalOnMissingBean(JdbcOperations)}
 *       → 자동구성 {@code jdbcTemplate} 이 사라지고, 무자격 {@code @Autowired JdbcTemplate} 이
 *       전량 <b>가격기억 전용 pool</b>(max 4 · 4초 timeout)로 조용히 재배선된다.</li>
 *   <li>{@code JpaBaseConfiguration#transactionManager} 는 {@code @ConditionalOnMissingBean(
 *       TransactionManager)} → <b>{@code JpaTransactionManager} 자체가 사라지고</b> 서비스 전역
 *       {@code @Transactional} 이 {@link DataSourceTransactionManager} 위에서 돌아 JPA 트랜잭션
 *       의미(EntityManager 바인딩·flush)가 깨진다.</li>
 * </ul>
 * 둘 다 <b>컨텍스트는 정상 로딩되고</b> 조용히 오동작한다 (실측: 빈 목록 probe 로 확인 — 등록 시
 * {@code JdbcOperations} 빈이 {@code priceMemoryJdbcTemplate} 1개, {@code TransactionManager} 빈이
 * {@code priceMemoryTransactionManager} 1개만 남았다). Boot 빈을 다시 shadow 하는 방법도 있으나
 * (이 PR 의 {@code applicationTaskExecutor} 선례) JPA TM 은 EMF 해석·customizer 를 포함해 충실
 * 복제 위험이 크다. 따라서 <b>전용 JDBC 3종은 빈으로 등록하지 않고</b> {@link PriceMemoryJdbcAccess}
 * 라는 전용 타입 하나로 묶어 노출한다 — 자동구성 조건 타입을 건드리지 않는 최소 침습 설계다.
 *
 * <h2>3종을 한 곳에서 묶는 이유</h2>
 * {@code priceMemoryDataSource} 만 분리하고 TM·JdbcTemplate 이 메인 pool 을 쓰면
 * {@code set_config('lock_timeout', ?, true)} 가 <b>조용히 무력화</b>된다 (R8-BE-4 함정 ①) —
 * {@code is_local=true} 는 트랜잭션 로컬이라, JdbcTemplate 이 TM 이 연 트랜잭션에 참여하지 못하고
 * 별도 autocommit 커넥션을 잡으면 timeout 이 upsert 에 적용되지 않는다. 여기서 셋을 <b>같은
 * DataSource 인스턴스</b>로 함께 만들어 그 결속을 구조적으로 보장한다.
 * {@code PartnerProductPriceMemoryTimeoutIT} 가 실 PostgreSQL 에서 upsert 와 같은 커넥션의
 * {@code pg_settings} 를 읽어 이 결속을 가드한다.
 *
 * <h2>XA/2PC 불필요</h2>
 * 가격기억 트랜잭션은 이미 {@code REQUIRES_NEW} + fail-soft 로 원 전표/견적 트랜잭션과 독립이며
 * (원자성을 <b>의도적으로</b> 포기한 설계), 같은 PostgreSQL 데이터베이스를 향하므로 2PC 요구가 없다.
 *
 * <h2>사이징</h2>
 * 전용 pool max 4 = 가격기억 executor 의 {@code async-max-pool-size} 4 와 1:1. 메인 20 + 전용 4 =
 * slip-service 24, fleet 합계 약 154 로 PostgreSQL {@code max_connections=300} 대비 여유가 있다.
 * {@code minimum-idle=0} 이라 유휴 시 커넥션을 점유하지 않는다.
 */
@Configuration(proxyBeanMethods = false)
public class SlipDataSourceConfig {

    /**
     * 메인 DataSource 설정 — {@code spring.datasource.*} 바인딩.
     *
     * <p>{@code DataSourceAutoConfiguration} 이 {@code @EnableConfigurationProperties} 로 등록하는
     * 동명 타입 빈과 공존하므로 {@link Primary} 로 우선순위를 고정한다. 가격기억 전용 pool 도 같은
     * 데이터베이스를 향하므로 url/username/password/driver 를 이 빈에서 공유한다.
     */
    @Primary
    @Bean
    @ConfigurationProperties("spring.datasource")
    public DataSourceProperties dataSourceProperties() {
        return new DataSourceProperties();
    }

    /**
     * 메인 pool — JPA / Flyway / 자동구성 {@code JdbcTemplate} 이 사용한다.
     *
     * <p>{@code spring.datasource.hikari.connection-timeout} = fleet 표준 30초 (D-R8-2 로 복원).
     */
    @Primary
    @Bean(destroyMethod = "close")
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource dataSource(DataSourceProperties properties) {
        return properties.initializeDataSourceBuilder().type(HikariDataSource.class).build();
    }

    /**
     * 주 DB(slip_db)에 결속된 기본 JdbcTemplate.
     *
     * <p>inventory 검증용 JdbcTemplate도 별도 빈으로 존재하므로, 무자격 주입은 항상
     * slip_db를 가리키도록 기본 빈을 명시한다.
     *
     * @param dataSource 주 DB DataSource
     * @return slip_db 전용 JdbcTemplate
     */
    @Bean
    @Primary
    public JdbcTemplate jdbcTemplate(@Qualifier("dataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    /**
     * 가격기억 전용 pool — {@code app.slip.price-memory.datasource.hikari.*} 바인딩.
     *
     * <p>{@code connection-timeout} 4초는 <b>이 pool 에만</b> 적용된다. 가격기억은 fail-soft 이므로
     * pool 고갈 시 사용자 요청을 기다리게 하지 않고 빠르게 포기하는 편이 낫지만, 그 정책이 전역으로
     * 새면 사용자 요청이 500 으로 끊긴다.
     *
     * <p>이 빈만 {@link DataSource} 타입으로 노출한다 — {@code @DependsOn("priceMemoryDataSource")}
     * (R8-BE-7 종료 순서)와 actuator pool 지표/health 가 빈 이름을 필요로 하기 때문이다.
     */
    @Bean(name = "priceMemoryDataSource", destroyMethod = "close")
    @ConfigurationProperties("app.slip.price-memory.datasource.hikari")
    public HikariDataSource priceMemoryDataSource(DataSourceProperties properties) {
        return properties.initializeDataSourceBuilder().type(HikariDataSource.class).build();
    }

    /**
     * 가격기억 전용 JDBC 접근 3종 — 전용 DataSource 하나에 TM·JdbcTemplate 을 결속해 노출한다.
     *
     * <p>{@link PriceMemoryJdbcAccess} 라는 전용 타입으로 감싸는 이유는 위 클래스 Javadoc 의
     * "함정 ② 는 DataSource 에서 끝나지 않는다" 절 참고 — {@code JdbcOperations} /
     * {@code TransactionManager} 타입 빈을 추가하는 순간 Boot 의 자동구성
     * {@code jdbcTemplate} 과 {@code JpaTransactionManager} 가 조용히 back-off 한다.
     */
    @Bean
    public PriceMemoryJdbcAccess priceMemoryJdbcAccess(
            @Qualifier("priceMemoryDataSource") DataSource priceMemoryDataSource) {
        DataSourceTransactionManager transactionManager =
                new DataSourceTransactionManager(priceMemoryDataSource);
        transactionManager.afterPropertiesSet();
        return new PriceMemoryJdbcAccess(
                priceMemoryDataSource,
                new JdbcTemplate(priceMemoryDataSource),
                transactionManager);
    }

    /**
     * 가격기억 전용 DataSource + 그에 결속된 JdbcTemplate/트랜잭션 매니저 묶음.
     *
     * <p>세 값은 <b>반드시 같은 {@link DataSource} 인스턴스</b>를 공유해야 한다 — 그래야
     * {@code priceMemoryTransactionManager} 가 연 트랜잭션의 커넥션을 {@code priceMemoryJdbcTemplate}
     * 이 {@code DataSourceUtils} 로 되찾아 {@code set_config(..., is_local=true)} 로 건 timeout 이
     * upsert 에 실제 적용된다 (R8-BE-4 함정 ①).
     *
     * @param dataSource 전용 Hikari pool
     * @param jdbcTemplate {@code dataSource} 결속 JdbcTemplate — 가격기억 upsert 전용
     * @param transactionManager {@code dataSource} 결속 TM — REQUIRES_NEW 가격기억 트랜잭션 전용
     */
    public record PriceMemoryJdbcAccess(
            DataSource dataSource,
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager) {
    }
}
