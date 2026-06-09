import { apiFetch, formatNumber, formatDate } from '../api.js';
import { el, clear, buildTable, showLoading, showError, createModal, renderJson, badge } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('Qdrant 監控', '向量資料庫 Collection 統計與時間範圍', '/html/qdrant.html');

const content = document.getElementById('content');
const modalRoot = document.getElementById('modal-root');
document.getElementById('refresh-btn').addEventListener('click', load);

async function load() {
    showLoading(content);
    try {
        const data = await apiFetch('/api/qdrant/collections');
        clear(content);

        if (!data.items?.length) {
            content.appendChild(el('div', { className: 'empty-state', textContent: '沒有找到任何 Collection' }));
            return;
        }

        const totalPoints = data.items.reduce((s, c) => s + (c.points_count || 0), 0);
        const stats = el('div', { className: 'stats-grid' });
        stats.appendChild(el('div', { className: 'stat-card' },
            el('div', { className: 'label', textContent: 'Collections' }),
            el('div', { className: 'value', textContent: formatNumber(data.items.length) }),
        ));
        stats.appendChild(el('div', { className: 'stat-card' },
            el('div', { className: 'label', textContent: '總資料筆數' }),
            el('div', { className: 'value', textContent: formatNumber(totalPoints) }),
        ));
        content.appendChild(stats);

        content.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: 'Collection 列表' }),
            buildTable([
                { label: '名稱', render: r => r.name },
                { label: '資料筆數', render: r => formatNumber(r.points_count) },
                { label: '索引向量', render: r => formatNumber(r.indexed_vectors_count) },
                { label: '狀態', render: r => badge(r.status, r.status === 'green' ? 'success' : 'warning') },
                { label: '最新資料', render: r => formatDate(r.latest) },
                { label: '最早資料', render: r => formatDate(r.earliest) },
                { label: '時間欄位', render: r => r.date_key || '-' },
                { label: '操作', render: r => {
                    const btn = el('button', { className: 'btn btn-sm', textContent: '詳情' });
                    btn.addEventListener('click', () => showDetail(r.name));
                    return btn;
                }},
            ], data.items),
        ));
    } catch (err) {
        showError(content, 'Qdrant 連線失敗：' + err.message);
    }
}

async function showDetail(name) {
    const { overlay, body, setTitle } = createModal(name);
    modalRoot.appendChild(overlay);
    setTitle(`Collection: ${name}`);
    showLoading(body);

    try {
        const data = await apiFetch(`/api/qdrant/collections/${name}`);
        clear(body);

        const grid = el('div', { className: 'detail-grid' });
        [
            ['資料筆數', formatNumber(data.points_count)],
            ['索引向量數', formatNumber(data.indexed_vectors_count)],
            ['狀態', data.status],
            ['時間欄位', data.date_key || '-'],
            ['最新資料', formatDate(data.latest)],
            ['最早資料', formatDate(data.earliest)],
        ].forEach(([label, val]) => {
            grid.appendChild(el('div', { className: 'detail-item' },
                el('div', { className: 'label', textContent: label }),
                el('div', { className: 'value', textContent: String(val) }),
            ));
        });
        body.appendChild(grid);

        if (data.vectors && Object.keys(data.vectors).length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: '向量配置' }),
                renderJson(data.vectors),
            ));
        }

        if (data.sparse_vectors?.length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'Sparse 向量' }),
                el('div', { textContent: data.sparse_vectors.join(', ') }),
            ));
        }

        if (data.payload_schema && Object.keys(data.payload_schema).length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'Payload Schema' }),
                renderJson(data.payload_schema),
            ));
        }
    } catch (err) {
        showError(body, err.message);
    }
}

load();
