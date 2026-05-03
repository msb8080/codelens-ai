package com.shuaibo.ai.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;
import java.util.List;

/**
 * CORS 跨域配置
 * 允许 GitHub Pages 等前端域名访问 API
 * 通过环境变量 CORS_ALLOWED_ORIGINS 配置，逗号分隔
 */
@Configuration
public class CorsConfig {

    @Value("${cors.allowed-origins:https://msb8080.github.io,http://localhost:3000,http://localhost:5173,http://localhost:8090}")
    private String allowedOrigins;

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        
        // 从环境变量读取允许的前端域名
        config.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));
        
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        
        return new CorsFilter(source);
    }
}
