package com.shuaibo.ai.config;

import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

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
        String resolvedUrl = isBlank(baseUrl) ? defaultBaseUrl : baseUrl;
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
