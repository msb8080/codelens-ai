package com.shuaibo.ai.config;

import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 动态模型工厂 — 根据请求参数创建 ChatModel
 * 支持每个请求指定不同的 model / baseUrl / apiKey
 */
@Component
public class ModelFactory {

    @Value("${spring.ai.openai.base-url}")
    private String defaultBaseUrl;

    @Value("${spring.ai.openai.api-key}")
    private String defaultApiKey;

    @Value("${spring.ai.openai.chat.options.model:Qwen/Qwen2.5-7B-Instruct}")
    private String defaultModel;

    private static final int MAX_CACHE_SIZE = 32;
    private static final long CACHE_TTL_MILLIS = Duration.ofMinutes(15).toMillis();

    private final Map<String, CacheEntry> modelCache = java.util.Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });

    /**
     * 获取 ChatModel
     * @param modelName 模型名（null 则用默认）
     * @param baseUrl   API 地址（null 则用默认）
     * @param apiKey    API Key（null 则用默认）
     * @return ChatModel，若所有参数都为 null 则返回 null（调用方使用默认 bean）
     */
    public OpenAiChatModel getModel(String modelName, String baseUrl, String apiKey) {
        // 全部为空，用 Spring 默认 bean
        if (isBlank(modelName) && isBlank(baseUrl) && isBlank(apiKey)) {
            return null;
        }

        String resolvedModel = isBlank(modelName) ? defaultModel : modelName;
        String resolvedUrl = normalizeBaseUrl(isBlank(baseUrl) ? defaultBaseUrl : baseUrl);
        String resolvedKey = isBlank(apiKey) ? defaultApiKey : apiKey;

        // 如果和默认配置完全一致，也用默认 bean
        if (resolvedModel.equals(defaultModel) && resolvedUrl.equals(defaultBaseUrl) && resolvedKey.equals(defaultApiKey)) {
            return null;
        }

        String cacheKey = buildCacheKey(resolvedUrl, resolvedModel, resolvedKey);
        long now = System.currentTimeMillis();

        synchronized (modelCache) {
            CacheEntry entry = modelCache.get(cacheKey);
            if (entry != null && !entry.isExpired(now)) {
                return entry.model();
            }
        }

        OpenAiChatModel model = createModel(resolvedUrl, resolvedKey, resolvedModel);
        synchronized (modelCache) {
            modelCache.put(cacheKey, new CacheEntry(model, now));
        }
        return model;
    }

    private OpenAiChatModel createModel(String resolvedUrl, String resolvedKey, String resolvedModel) {
        OpenAiApi openAiApi = new OpenAiApi(resolvedUrl, resolvedKey);
        OpenAiChatOptions options = OpenAiChatOptions.builder()
                .withModel(resolvedModel)
                .withTemperature(0.7)
                .withMaxTokens(2048)
                .build();
        return new OpenAiChatModel(openAiApi, options);
    }

    private String buildCacheKey(String baseUrl, String model, String apiKey) {
        return String.join("|",
                normalize(baseUrl),
                normalize(model),
                normalize(apiKey));
    }

    private String normalize(String value) {
        return value == null ? "" : value;
    }

    /**
     * Spring AI 的 OpenAiApi 会基于 baseUrl 自行拼接 /v1。
     * 这里统一去掉用户误填的 /v1 后缀，避免出现 /v1/v1/chat/completions。
     */
    private String normalizeBaseUrl(String baseUrl) {
        if (isBlank(baseUrl)) {
            return baseUrl;
        }

        String trimmed = baseUrl.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }

        try {
            URI uri = new URI(trimmed);
            String path = uri.getPath();
            if (path == null || path.isBlank() || "/".equals(path)) {
                return trimmed;
            }

            String normalizedPath = path;
            if (normalizedPath.endsWith("/v1")) {
                normalizedPath = normalizedPath.substring(0, normalizedPath.length() - 3);
            } else if (normalizedPath.contains("/v1/")) {
                normalizedPath = normalizedPath.substring(0, normalizedPath.indexOf("/v1"));
            }

            URI normalized = new URI(
                    uri.getScheme(),
                    uri.getAuthority(),
                    normalizedPath.isEmpty() ? null : normalizedPath,
                    uri.getQuery(),
                    uri.getFragment()
            );
            String result = normalized.toString();
            while (result.endsWith("/")) {
                result = result.substring(0, result.length() - 1);
            }
            return result;
        } catch (URISyntaxException e) {
            String result = trimmed;
            if (result.endsWith("/v1")) {
                result = result.substring(0, result.length() - 3);
            }
            if (result.endsWith("/")) {
                result = result.substring(0, result.length() - 1);
            }
            return result;
        }
    }

    private record CacheEntry(OpenAiChatModel model, long createdAt) {
        boolean isExpired(long now) {
            return now - createdAt > CACHE_TTL_MILLIS;
        }
    }

    public String getDefaultModel() {
        return defaultModel;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
