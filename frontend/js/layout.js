const NAV_ITEMS = [
    { href: '/', icon: 'layout-dashboard', label: '總覽' },
    { href: '/html/users.html', icon: 'users', label: '使用者' },
    { href: '/html/conversations.html', icon: 'message-square', label: '問答紀錄' },
    { href: '/html/tokens.html', icon: 'coins', label: 'Token 用量' },
    { href: '/html/quota-reset.html', icon: 'refresh-cw', label: '配額重置' },
    { href: '/html/errors.html', icon: 'alert-triangle', label: '系統報錯' },
    { href: '/html/logs.html', icon: 'scroll-text', label: '聊天 Log' },
    { href: '/html/qdrant.html', icon: 'database', label: 'Qdrant' },
];

export function initLayout(activePath) {
    const navList = document.getElementById('nav-list');
    if (!navList) return;

    NAV_ITEMS.forEach(item => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        const a = document.createElement('a');
        a.href = item.href;
        const isActive = activePath === item.href ||
            (activePath.endsWith(item.href.replace('/html/', '')) && item.href !== '/');
        if (isActive || window.location.pathname === item.href) {
            a.classList.add('active');
        }
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', item.icon);
        a.appendChild(icon);
        a.appendChild(document.createTextNode(item.label));
        li.appendChild(a);
        navList.appendChild(li);
    });

    if (window.lucide) lucide.createIcons();
}

export function pageShell(title, subtitle, activePath) {
    document.title = `${title} | Insight Monitor`;
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    initLayout(activePath);
}
