export function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'className') node.className = v;
            else if (k === 'textContent') node.textContent = v;
            else if (k.startsWith('on') && typeof v === 'function') {
                node.addEventListener(k.slice(2).toLowerCase(), v);
            } else if (v !== null && v !== undefined) {
                node.setAttribute(k, v);
            }
        });
    }
    children.flat().forEach(child => {
        if (child === null || child === undefined) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

export function buildTable(headers, rows) {
    const wrap = el('div', { className: 'data-table-wrap' });
    const table = el('table', { className: 'data-table' });
    const thead = el('thead');
    const headerRow = el('tr');
    headers.forEach(h => headerRow.appendChild(el('th', { textContent: h.label })));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    if (!rows.length) {
        const tr = el('tr');
        const td = el('td', { colSpan: String(headers.length), className: 'empty-state', textContent: '沒有資料' });
        tr.appendChild(td);
        tbody.appendChild(tr);
    } else {
        rows.forEach(row => {
            const tr = el('tr');
            headers.forEach(h => {
                const val = h.render ? h.render(row) : (row[h.key] ?? '-');
                const td = el('td');
                if (val instanceof Node) td.appendChild(val);
                else td.textContent = val ?? '-';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

export function buildPagination(page, total, limit, onPageChange) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const container = el('div', { className: 'pagination' });

    const prevBtn = el('button', {
        className: 'btn btn-sm',
        textContent: '上一頁',
        disabled: page <= 1 ? 'disabled' : null,
        onclick: () => { if (page > 1) onPageChange(page - 1); },
    });
    const info = el('span', {
        className: 'page-info',
        textContent: `第 ${page} / ${totalPages} 頁（共 ${total} 筆）`,
    });
    const nextBtn = el('button', {
        className: 'btn btn-sm',
        textContent: '下一頁',
        disabled: page >= totalPages ? 'disabled' : null,
        onclick: () => { if (page < totalPages) onPageChange(page + 1); },
    });

    container.appendChild(prevBtn);
    container.appendChild(info);
    container.appendChild(nextBtn);
    return container;
}

export function showLoading(container) {
    clear(container);
    container.appendChild(el('div', { className: 'loading', textContent: '載入中…' }));
}

export function showError(container, msg) {
    clear(container);
    container.appendChild(el('div', { className: 'error-msg', textContent: msg }));
}

export function createModal(title, onClose) {
    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });
    const header = el('div', { className: 'modal-header' });
    const h2 = el('h2', { textContent: title });
    const closeBtn = el('button', { className: 'modal-close', 'aria-label': '關閉' });
    const closeIcon = document.createElement('i');
    closeIcon.setAttribute('data-lucide', 'x');
    closeBtn.appendChild(closeIcon);
    const body = el('div', { className: 'modal-body' });

    function close() {
        overlay.classList.add('hidden');
        if (onClose) onClose();
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    header.appendChild(h2);
    header.appendChild(closeBtn);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    return { overlay, body, close, setTitle: (t) => { h2.textContent = t; } };
}

export function badge(text, type = 'neutral') {
    return el('span', { className: `badge badge-${type}`, textContent: text });
}

export function linkBtn(text, onclick) {
    return el('button', { className: 'link-btn', textContent: text, onclick });
}

export function renderJson(obj) {
    const pre = el('pre');
    pre.textContent = JSON.stringify(obj, null, 2);
    return pre;
}
