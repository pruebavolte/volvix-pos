/**
 * volvix-workflow-reconciliation.js
 * Workflow de Conciliacion Bancaria
 *
 * Funcionalidades:
 *  - Importar estado de cuenta (CSV/OFX/manual)
 *  - Match automatico (fecha + monto + referencia con tolerancia)
 *  - Matching manual (asignacion 1-a-1, 1-a-N, N-a-1)
 *  - Identificar diferencias (no conciliados, duplicados, montos divergentes)
 *  - Reporte de conciliacion exportable
 *
 * Expone: window.ReconciliationWorkflow
 */
(function (global) {
    'use strict';

    // -------------------- CONFIG --------------------
    const CONFIG = {
        AMOUNT_TOLERANCE: 0.01,         // diferencia maxima en monto para auto-match
        DATE_TOLERANCE_DAYS: 3,         // dias de diferencia tolerados
        MIN_REFERENCE_SCORE: 0.65,      // score minimo similitud referencia
        AUTO_MATCH_MIN_SCORE: 0.80,     // score total minimo para match automatico
        STORAGE_KEY: 'volvix_reconciliation_state_v1'
    };

    // -------------------- STATE --------------------
    const state = {
        bankStatement: [],   // movimientos del banco
        bookEntries: [],     // movimientos del libro/sistema
        matches: [],         // [{bankId, bookIds:[], type, score, manual}]
        unmatchedBank: [],
        unmatchedBook: [],
        differences: [],
        sessionId: null,
        importedAt: null
    };

    // -------------------- UTILS --------------------
    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
            Math.random().toString(36).substr(2, 6);
    }

    function parseAmount(v) {
        if (typeof v === 'number') return v;
        if (!v) return 0;
        const n = parseFloat(String(v).replace(/[^\d\-.,]/g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
    }

    function parseDate(v) {
        if (!v) return null;
        if (v instanceof Date) return v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }

    function daysBetween(a, b) {
        if (!a || !b) return Infinity;
        return Math.abs((a.getTime() - b.getTime()) / 86400000);
    }

    function normalizeText(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function similarity(a, b) {
        a = normalizeText(a); b = normalizeText(b);
        if (!a || !b) return 0;
        if (a === b) return 1;
        const tokensA = new Set(a.split(' '));
        const tokensB = new Set(b.split(' '));
        let inter = 0;
        tokensA.forEach(t => { if (tokensB.has(t)) inter++; });
        return inter / Math.max(tokensA.size, tokensB.size);
    }

    function persist() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
                state: {
                    bankStatement: state.bankStatement,
                    bookEntries: state.bookEntries,
                    matches: state.matches,
                    sessionId: state.sessionId,
                    importedAt: state.importedAt
                }
            }));
        } catch (e) { console.warn('persist fail', e); }
    }

    function restore() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            Object.assign(state, obj.state || {});
            return true;
        } catch (e) { return false; }
    }

    // -------------------- IMPORT --------------------
    function importBankStatement(rows, opts) {
        opts = opts || {};
        if (!Array.isArray(rows)) throw new Error('rows debe ser array');
        state.bankStatement = rows.map(r => ({
            id: r.id || uid('bk'),
            date: parseDate(r.date || r.fecha),
            amount: parseAmount(r.amount || r.monto),
            reference: r.reference || r.referencia || r.concepto || '',
            type: r.type || (parseAmount(r.amount || r.monto) >= 0 ? 'credit' : 'debit'),
            raw: r,
            matched: false
        }));
        state.sessionId = state.sessionId || uid('rec');
        state.importedAt = new Date().toISOString();
        persist();
        return { count: state.bankStatement.length };
    }

    function importBookEntries(rows) {
        if (!Array.isArray(rows)) throw new Error('rows debe ser array');
        state.bookEntries = rows.map(r => ({
            id: r.id || uid('bo'),
            date: parseDate(r.date || r.fecha),
            amount: parseAmount(r.amount || r.monto),
            reference: r.reference || r.referencia || r.concepto || '',
            docNumber: r.docNumber || r.folio || '',
            raw: r,
            matched: false
        }));
        persist();
        return { count: state.bookEntries.length };
    }

    function importCSV(csvText, target) {
        const lines = csvText.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return { count: 0 };
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const rows = lines.slice(1).map(line => {
            const cols = line.split(',');
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
            return obj;
        });
        return target === 'book' ? importBookEntries(rows) : importBankStatement(rows);
    }

    // -------------------- MATCH SCORING --------------------
    function scoreMatch(bank, book) {
        // amount
        const amtDiff = Math.abs(Math.abs(bank.amount) - Math.abs(book.amount));
        if (amtDiff > Math.max(CONFIG.AMOUNT_TOLERANCE, Math.abs(bank.amount) * 0.001)) {
            return { score: 0, parts: { amount: 0 } };
        }
        const amountScore = 1 - (amtDiff / Math.max(1, Math.abs(bank.amount)));
        // date
        const dDiff = daysBetween(bank.date, book.date);
        if (dDiff > CONFIG.DATE_TOLERANCE_DAYS) return { score: 0, parts: { date: 0 } };
        const dateScore = 1 - (dDiff / (CONFIG.DATE_TOLERANCE_DAYS + 1));
        // reference
        const refScore = similarity(bank.reference, book.reference + ' ' + book.docNumber);
        // sign coherence
        const signOk = (bank.amount >= 0) === (book.amount >= 0) ? 1 : 0.5;
        const total = (amountScore * 0.45) + (dateScore * 0.25) + (refScore * 0.25) + (signOk * 0.05);
        return { score: total, parts: { amountScore, dateScore, refScore, signOk } };
    }

    // -------------------- AUTO MATCH --------------------
    function autoMatch() {
        state.matches = state.matches.filter(m => m.manual);
        state.bankStatement.forEach(b => { b.matched = state.matches.some(m => m.bankId === b.id); });
        state.bookEntries.forEach(b => { b.matched = state.matches.some(m => m.bookIds.includes(b.id)); });

        const candidates = [];
        state.bankStatement.forEach(bk => {
            if (bk.matched) return;
            state.bookEntries.forEach(bo => {
                if (bo.matched) return;
                const s = scoreMatch(bk, bo);
                if (s.score >= CONFIG.AUTO_MATCH_MIN_SCORE) {
                    candidates.push({ bankId: bk.id, bookId: bo.id, score: s.score, parts: s.parts });
                }
            });
        });
        candidates.sort((a, b) => b.score - a.score);

        const usedBank = new Set();
        const usedBook = new Set();
        let made = 0;
        candidates.forEach(c => {
            if (usedBank.has(c.bankId) || usedBook.has(c.bookId)) return;
            state.matches.push({
                id: uid('m'),
                bankId: c.bankId,
                bookIds: [c.bookId],
                type: '1-1',
                score: c.score,
                manual: false,
                createdAt: new Date().toISOString()
            });
            usedBank.add(c.bankId);
            usedBook.add(c.bookId);
            made++;
        });

        // try 1-to-N (one bank entry = sum of book entries) as fallback
        state.bankStatement.forEach(bk => {
            if (usedBank.has(bk.id) || bk.matched) return;
            const remaining = state.bookEntries.filter(bo => !usedBook.has(bo.id) && !bo.matched
                && daysBetween(bk.date, bo.date) <= CONFIG.DATE_TOLERANCE_DAYS);
            const combo = findSumCombo(remaining, Math.abs(bk.amount), 4);
            if (combo && combo.length >= 2) {
                state.matches.push({
                    id: uid('m'),
                    bankId: bk.id,
                    bookIds: combo.map(c => c.id),
                    type: '1-N',
                    score: 0.85,
                    manual: false,
                    createdAt: new Date().toISOString()
                });
                usedBank.add(bk.id);
                combo.forEach(c => usedBook.add(c.id));
                made++;
            }
        });

        recomputeUnmatched();
        persist();
        return { matched: made, totalMatches: state.matches.length };
    }

    function findSumCombo(items, target, maxDepth) {
        // small subset-sum search with tolerance
        const tol = CONFIG.AMOUNT_TOLERANCE;
        const result = { found: null };
        function recurse(idx, picked, sum) {
            if (result.found) return;
            if (Math.abs(sum - target) <= tol && picked.length >= 2) {
                result.found = picked.slice(); return;
            }
            if (idx >= items.length || picked.length >= maxDepth) return;
            const v = Math.abs(items[idx].amount);
            if (sum + v <= target + tol) {
                picked.push(items[idx]);
                recurse(idx + 1, picked, sum + v);
                picked.pop();
            }
            recurse(idx + 1, picked, sum);
        }
        recurse(0, [], 0);
        return result.found;
    }

    // -------------------- MANUAL MATCH --------------------
    function manualMatch(bankId, bookIds, note) {
        if (!Array.isArray(bookIds)) bookIds = [bookIds];
        const bk = state.bankStatement.find(b => b.id === bankId);
        if (!bk) throw new Error('bank entry no encontrado: ' + bankId);
        const books = bookIds.map(id => state.bookEntries.find(b => b.id === id)).filter(Boolean);
        if (!books.length) throw new Error('book entries no encontrados');
        // remove previous matches affecting these
        state.matches = state.matches.filter(m =>
            m.bankId !== bankId && !m.bookIds.some(id => bookIds.includes(id)));
        const sumBook = books.reduce((s, b) => s + Math.abs(b.amount), 0);
        const diff = Math.abs(sumBook - Math.abs(bk.amount));
        state.matches.push({
            id: uid('m'),
            bankId: bankId,
            bookIds: bookIds,
            type: bookIds.length === 1 ? '1-1' : '1-N',
            score: diff <= CONFIG.AMOUNT_TOLERANCE ? 1 : 0.5,
            manual: true,
            note: note || '',
            amountDiff: diff,
            createdAt: new Date().toISOString()
        });
        recomputeUnmatched();
        persist();
        return state.matches[state.matches.length - 1];
    }

    function unmatch(matchId) {
        const before = state.matches.length;
        state.matches = state.matches.filter(m => m.id !== matchId);
        recomputeUnmatched();
        persist();
        return { removed: before - state.matches.length };
    }

    // -------------------- DIFFERENCES --------------------
    function recomputeUnmatched() {
        const matchedBank = new Set(state.matches.map(m => m.bankId));
        const matchedBook = new Set();
        state.matches.forEach(m => m.bookIds.forEach(id => matchedBook.add(id)));

        state.bankStatement.forEach(b => { b.matched = matchedBank.has(b.id); });
        state.bookEntries.forEach(b => { b.matched = matchedBook.has(b.id); });

        state.unmatchedBank = state.bankStatement.filter(b => !b.matched);
        state.unmatchedBook = state.bookEntries.filter(b => !b.matched);

        state.differences = [];
        // duplicates in bank
        const seenBank = new Map();
        state.bankStatement.forEach(b => {
            const key = (b.date && b.date.toISOString().slice(0, 10)) + '|' + b.amount.toFixed(2);
            if (seenBank.has(key)) {
                state.differences.push({ type: 'duplicate_bank', ids: [seenBank.get(key), b.id] });
            } else { seenBank.set(key, b.id); }
        });
        // amount divergence in matches
        state.matches.forEach(m => {
            const bk = state.bankStatement.find(b => b.id === m.bankId);
            const sum = m.bookIds.reduce((s, id) => {
                const bo = state.bookEntries.find(x => x.id === id);
                return s + (bo ? Math.abs(bo.amount) : 0);
            }, 0);
            const diff = Math.abs(sum - Math.abs(bk.amount));
            if (diff > CONFIG.AMOUNT_TOLERANCE) {
                state.differences.push({
                    type: 'amount_divergence',
                    matchId: m.id,
                    bankAmount: bk.amount,
                    bookSum: sum,
                    diff: diff
                });
            }
        });
    }

    // -------------------- REPORT --------------------
    function getReport() {
        recomputeUnmatched();
        const totalBank = state.bankStatement.length;
        const totalBook = state.bookEntries.length;
        const matchedBank = totalBank - state.unmatchedBank.length;
        const matchedBook = totalBook - state.unmatchedBook.length;
        const sumBank = state.bankStatement.reduce((s, b) => s + b.amount, 0);
        const sumBook = state.bookEntries.reduce((s, b) => s + b.amount, 0);
        return {
            sessionId: state.sessionId,
            importedAt: state.importedAt,
            generatedAt: new Date().toISOString(),
            totals: {
                bankCount: totalBank,
                bookCount: totalBook,
                bankAmount: sumBank,
                bookAmount: sumBook,
                amountDelta: sumBank - sumBook
            },
            matching: {
                totalMatches: state.matches.length,
                automatic: state.matches.filter(m => !m.manual).length,
                manual: state.matches.filter(m => m.manual).length,
                bankCoverage: totalBank ? (matchedBank / totalBank) : 0,
                bookCoverage: totalBook ? (matchedBook / totalBook) : 0
            },
            unmatched: {
                bank: state.unmatchedBank.length,
                book: state.unmatchedBook.length
            },
            differences: state.differences,
            unmatchedBankDetails: state.unmatchedBank,
            unmatchedBookDetails: state.unmatchedBook,
            matches: state.matches
        };
    }

    function exportCSV() {
        const rep = getReport();
        const rows = [['Tipo', 'Fecha', 'Monto', 'Referencia', 'Estado', 'MatchId']];
        state.bankStatement.forEach(b => {
            const m = state.matches.find(x => x.bankId === b.id);
            rows.push(['BANCO',
                b.date ? b.date.toISOString().slice(0, 10) : '',
                b.amount.toFixed(2), b.reference,
                m ? 'CONCILIADO' : 'PENDIENTE', m ? m.id : '']);
        });
        state.bookEntries.forEach(b => {
            const m = state.matches.find(x => x.bookIds.includes(b.id));
            rows.push(['LIBRO',
                b.date ? b.date.toISOString().slice(0, 10) : '',
                b.amount.toFixed(2), b.reference,
                m ? 'CONCILIADO' : 'PENDIENTE', m ? m.id : '']);
        });
        return rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    }

    // -------------------- LIFECYCLE --------------------
    function reset() {
        state.bankStatement = [];
        state.bookEntries = [];
        state.matches = [];
        state.unmatchedBank = [];
        state.unmatchedBook = [];
        state.differences = [];
        state.sessionId = null;
        state.importedAt = null;
        try { localStorage.removeItem(CONFIG.STORAGE_KEY); } catch (e) {}
    }

    function suggestMatches(bankId, limit) {
        limit = limit || 5;
        const bk = state.bankStatement.find(b => b.id === bankId);
        if (!bk) return [];
        const matchedBook = new Set();
        state.matches.forEach(m => m.bookIds.forEach(id => matchedBook.add(id)));
        return state.bookEntries
            .filter(bo => !matchedBook.has(bo.id))
            .map(bo => ({ entry: bo, score: scoreMatch(bk, bo).score }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    // -------------------- PUBLIC API --------------------
    const ReconciliationWorkflow = {
        config: CONFIG,
        state: state,
        importBankStatement: importBankStatement,
        importBookEntries: importBookEntries,
        importCSV: importCSV,
        autoMatch: autoMatch,
        manualMatch: manualMatch,
        unmatch: unmatch,
        suggestMatches: suggestMatches,
        getReport: getReport,
        exportCSV: exportCSV,
        reset: reset,
        restore: restore,
        persist: persist,
        version: '1.0.0'
    };

    global.ReconciliationWorkflow = ReconciliationWorkflow;
    if (typeof module !== 'undefined' && module.exports) module.exports = ReconciliationWorkflow;
})(typeof window !== 'undefined' ? window : this);
