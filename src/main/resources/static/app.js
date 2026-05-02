// =========================================
// CodeLens AI - 前端应用逻辑
// =========================================

// ===== 配置 =====
const API_BASE = window.location.origin;
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');

// ===== Markdown 渲染 (marked.js) =====
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
        // 语言标签着色
        return code;
    }
});

function parseMarkdown(text) {
    // 先用 marked 渲染 markdown
    let html = marked.parse(text);
    return html;
}

// ===== Mermaid 初始化 =====
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        primaryColor: '#7e5adc',
        primaryTextColor: '#fff',
        primaryBorderColor: '#a894df',
        lineColor: '#a894df',
        secondaryColor: '#3d2966',
        tertiaryColor: '#1a1030',
        background: 'transparent',
        mainBkg: '#3d2966',
        nodeBorder: '#a894df',
        clusterBkg: 'rgba(61,41,102,0.5)',
        clusterBorder: '#a894df',
        titleColor: '#fff'
    },
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    flowchart: { curve: 'basis' },
    securityLevel: 'loose'
});

let mermaidCounter = 0;

function renderMermaidInElement(container) {
    const mermaidDivs = container.querySelectorAll('code.language-mermaid');
    mermaidDivs.forEach((codeEl) => {
        const preEl = codeEl.closest('pre');
        if (!preEl) return;

        const graphDef = codeEl.textContent;
        const id = 'mermaid-' + (++mermaidCounter);

        const div = document.createElement('div');
        div.className = 'mermaid';
        div.id = id;
        div.textContent = graphDef;

        preEl.replaceWith(div);

        try {
            mermaid.render(id + '-svg', graphDef).then(({ svg }) => {
                div.innerHTML = svg;
            }).catch(err => {
                div.innerHTML = `<div style="color:#f87171;padding:0.5rem;">Mermaid 渲染失败: ${err.message}</div>`;
                div.textContent = graphDef;
            });
        } catch (err) {
            div.innerHTML = `<div style="color:#f87171;padding:0.5rem;">Mermaid 渲染失败: ${err.message}</div>`;
        }
    });
}

// ===== 发送消息（流式版） =====
async function send() {
    const question = input.value.trim();
    if (!question) return;

    // 添加用户消息
    addMessage('user', question);
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="material-symbols-outlined">pending</span> 思考中...';

    // 创建 AI 消息容器（空的，等待流式填充）
    const aiMsgEl = createStreamingMessage();
    const bubbleEl = aiMsgEl.querySelector('.bubble');
    let fullText = '';

    try {
        const res = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // 解析 SSE 格式
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    const data = line.slice(5);
                    if (currentEvent === 'token') {
                        fullText += data;
                        bubbleEl.innerHTML = parseMarkdown(fullText) + '<span class="streaming-cursor"></span>';
                        messages.scrollTop = messages.scrollHeight;
                    } else if (currentEvent === 'done') {
                        try {
                            const result = JSON.parse(data);
                            finalizeStreamingMessage(aiMsgEl, result.latencyMs, result.ragHits);
                            updateStats(result.latencyMs, result.ragHits);
                        } catch (e) {
                            finalizeStreamingMessage(aiMsgEl);
                        }
                    }
                }
            }
        }

        // 流式结束后渲染 mermaid
        renderMermaidInElement(bubbleEl);

        // 如果没收到 done 事件也完成
        if (bubbleEl.querySelector('.streaming-cursor')) {
            finalizeStreamingMessage(aiMsgEl);
        }

    } catch (e) {
        bubbleEl.innerHTML = parseMarkdown(fullText || '') +
            '<br><br>⚠️ 连接失败：' + e.message;
        const cursor = bubbleEl.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();
        const meta = aiMsgEl.querySelector('.msg-meta');
        if (meta) meta.textContent = '错误 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="material-symbols-outlined">send</span> 发送';
    }
}

// ===== 创建流式消息容器 =====
function createStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'message ai streaming';
    div.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
            <div class="bubble"><span class="streaming-cursor"></span></div>
            <div class="msg-meta">正在生成...</div>
        </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
}

// ===== 完成流式消息 =====
function finalizeStreamingMessage(msgEl, latency, ragHits) {
    msgEl.classList.remove('streaming');
    const cursor = msgEl.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    const meta = msgEl.querySelector('.msg-meta');
    if (meta) {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (ragHits !== undefined) parts.push(`RAG: ${ragHits}条`);
        parts.push(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        meta.textContent = parts.join(' · ');
    }

    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 添加消息 =====
function addMessage(role, text, latency, ragHits) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const avatarIcon = role === 'user' ? '👤' : '🤖';

    let meta = '';
    if (role === 'ai') {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (ragHits !== undefined) parts.push(`RAG: ${ragHits}条`);
        parts.push(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        meta = `<div class="msg-meta">${parts.join(' · ')}</div>`;
    } else {
        meta = `<div class="msg-meta">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>`;
    }

    const content = role === 'ai' ? parseMarkdown(text) : text.replace(/\n/g, '<br>');

    div.innerHTML = `
        <div class="msg-avatar">${avatarIcon}</div>
        <div class="msg-body">
            <div class="bubble">${content}</div>
            ${meta}
        </div>`;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

    // 渲染 mermaid
    if (role === 'ai') {
        renderMermaidInElement(div.querySelector('.bubble'));
    }

    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 打字指示器 =====
function addTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.id = 'typing-' + Date.now();
    div.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
            <div class="bubble">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div.id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ===== 更新统计 =====
function updateStats(latency, ragHits) {
    if (latency) document.getElementById('latencyDisplay').textContent = `延迟: ${latency}ms`;
    if (ragHits !== undefined) document.getElementById('ragDisplay').textContent = `RAG: ${ragHits} 命中`;
}

// ===== 键盘事件 =====
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

// ===== 3D 卡片鼠标追踪 =====
const chatCard = document.getElementById('chatCard');
const wrapper = document.querySelector('.chat-card-wrapper');

wrapper.addEventListener('mousemove', (e) => {
    const rect = wrapper.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    chatCard.style.transform = `
        rotateY(${x * 6}deg)
        rotateX(${-y * 6}deg)
    `;
});

wrapper.addEventListener('mouseleave', () => {
    chatCard.style.transform = '';
});

// ===== GSAP 入场动画 =====
document.addEventListener('DOMContentLoaded', () => {
    gsap.set('.gsap-reveal', { y: 30 });

    gsap.to('.gsap-reveal', {
        duration: 0.8,
        opacity: 1,
        visibility: 'visible',
        y: 0,
        stagger: 0.15,
        ease: 'power3.out',
        delay: 0.1
    });
});
