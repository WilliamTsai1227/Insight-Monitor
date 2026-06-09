const API_BASE = window.location.origin;

async function apiFetch(path, params = {}, options = {}) {
    const url = new URL(API_BASE + path);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
            url.searchParams.set(k, v);
        }
    });

    const fetchOptions = {
        method: options.method || 'GET',
        headers: { ...(options.headers || {}) },
    };

    if (options.body !== undefined) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
    }

    const res = await fetch(url.toString(), fetchOptions);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const detail = err.detail;
        const msg = typeof detail === 'string'
            ? detail
            : (detail?.message || JSON.stringify(detail) || `HTTP ${res.status}`);
        throw new Error(msg);
    }
    return res.json();
}

function formatNumber(n) {
    if (n === null || n === undefined) return '-';
    return Number(n).toLocaleString('zh-TW');
}

function formatCost(usd) {
    if (usd === null || usd === undefined) return '-';
    return '$' + Number(usd).toFixed(4);
}

function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('zh-TW');
}

function truncate(str, len = 80) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
}

function truncateUuid(uuid) {
    if (!uuid) return '-';
    return uuid.length > 12 ? uuid.slice(0, 8) + '…' : uuid;
}

function statusBadge(status) {
    const map = {
        active: 'badge-success',
        disabled: 'badge-danger',
        pending: 'badge-warning',
    };
    return map[status] || 'badge-neutral';
}

export { apiFetch, formatNumber, formatCost, formatDate, truncate, truncateUuid, statusBadge };
