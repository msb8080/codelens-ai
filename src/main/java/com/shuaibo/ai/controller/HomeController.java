package com.shuaibo.ai.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 根路径控制器
 */
@RestController
public class HomeController {

    @GetMapping("/")
    public Map<String, Object> home() {
        return Map.of(
            "name", "OmniAgent API",
            "version", "1.0.0",
            "status", "running",
            "docs", "https://msb8080.github.io/codelens-ai/",
            "endpoints", Map.of(
                "chat", "POST /api/chat",
                "chatStream", "POST /api/chat/stream",
                "health", "GET /api/health"
            )
        );
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
