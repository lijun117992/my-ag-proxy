/**
 * 通义千问 (Qwen Creative Studio) 导航挂载脚本
 * 极简、纯净、安全：仅在 CPAMC 侧边栏插入一个跳转入口，彻底解耦两套界面，0 干扰 Antigravity 原生系统
 */

(function () {
    console.log('[QwenModule] 正在挂载通义千问独立控制台导航入口...');

    function injectSidebarNav() {
        if (document.getElementById('nav-item-qwen')) return;

        // 挂载在 OAuth 登录 或 认证文件 后面
        const targetAnchor = document.querySelector('a[href*="/oauth"]') 
            || document.querySelector('a[href*="/auth-files"]') 
            || document.querySelector('a.nav-item');

        if (!targetAnchor || !targetAnchor.parentElement) return;

        const navLink = document.createElement('a');
        navLink.id = 'nav-item-qwen';
        navLink.href = '/qwen.html';
        navLink.className = 'nav-item qwen-nav-item';
        navLink.setAttribute('aria-label', '通义千问 (2K/视频)');
        navLink.title = '打开通义千问 2K生图与视频独立控制台';
        navLink.innerHTML = `
            <span class="nav-icon" style="display:flex;align-items:center;justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
                </svg>
            </span>
            <span class="nav-text">
                <span class="nav-label">通义千问 (2K/视频)</span>
            </span>
            <span class="nav-badge" style="background:#10b981;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:auto;">新 ↗</span>
        `;

        targetAnchor.parentElement.insertBefore(navLink, targetAnchor.nextSibling);
        console.log('[QwenModule] ✅ 已成功将通义千问入口注入 CPAMC 侧边栏！');
    }

    // 初始化轮询检测侧边栏
    const checkInterval = setInterval(() => {
        const sidebar = document.querySelector('nav, .app-sidebar, aside');
        if (sidebar) {
            injectSidebarNav();
            clearInterval(checkInterval);
        }
    }, 250);

    // 守护进程：防止 React SPA 重新渲染侧边栏导致链接消失
    const observer = new MutationObserver(() => {
        injectSidebarNav();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
