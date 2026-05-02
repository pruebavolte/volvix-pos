/**
 * volvix-subscriptions-wiring.js
 * Volvix POS - Subscription Management System
 * Agent-37 / Ronda 8 Fibonacci
 *
 * Features:
 *  - Plans: Free, Trial, Pro, Enterprise
 *  - Billing cycle: monthly / annual
 *  - Upgrade / downgrade with pro-rating
 *  - Trial periods with auto-conversion
 *  - Automatic renewal
 *  - Cancellation flow with feedback capture
 *  - Metrics: MRR, ARR, Churn, LTV
 *  - Public API: window.SubscriptionsAPI
 */
(function (global) {
    'use strict';

    // ============================================================
    // 1. PLAN CATALOG
    // ============================================================
    const PLANS = {
        free: {
            id: 'free',
            name: 'Free',
            price: { monthly: 0, annual: 0 },
            features: ['1 terminal', '50 productos', 'Reportes básicos'],
            limits: { terminals: 1, products: 50, users: 1, storage_mb: 100 },
            trial_days: 0,
            tier: 0
        },
        trial: {
            id: 'trial',
            name: 'Trial',
            price: { monthly: 0, annual: 0 },
            features: ['Acceso completo Pro', 'Prueba gratis', 'Sin tarjeta'],
            limits: { terminals: 3, products: 1000, users: 5, storage_mb: 1024 },
            trial_days: 14,
            tier: 1
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            price: { monthly: 49.0, annual: 490.0 },
            features: ['5 terminales', 'Productos ilimitados', 'Reportes avanzados', 'Multi-sucursal'],
            limits: { terminals: 5, products: -1, users: 10, storage_mb: 10240 },
            trial_days: 14,
            tier: 2
        },
        enterprise: {
            id: 'enterprise',
            name: 'Enterprise',
            price: { monthly: 199.0, annual: 1990.0 },
            features: ['Todo Pro', 'Terminales ilimitadas', 'API', 'SLA 99.99%', 'Soporte 24/7'],
            limits: { terminals: -1, products: -1, users: -1, storage_mb: -1 },
            trial_days: 30,
            tier: 3
        }
    };

    const BILLING_CYCLES = ['monthly', 'annual'];
    const STORAGE_KEY = 'volvix.subscriptions.v1';

    // ============================================================
    // 2. STATE
    // ============================================================
    const state = {
        currentSubscription: null,
        history: [],
        invoices: [],
        cancellationFeedback: [],
        metrics: { mrr: 0, arr: 0, churnRate: 0, ltv: 0, activeCustomers: 0 },
        listeners: {}
    };

    // ============================================================
    // 3. PERSISTENCE
    // ============================================================
    function saveState() {
        try {
            const snapshot = {
                currentSubscription: state.currentSubscription,
                history: state.history,
                invoices: state.invoices,
                cancellationFeedback: state.cancellationFeedback
            };
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
            }
        } catch (e) {
            console.warn('[Subs] persist failed', e);
        }
    }

    function loadState() {
        try {
            if (typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            state.currentSubscription = data.currentSubscription || null;
            state.history = data.history || [];
            state.invoices = data.invoices || [];
            state.cancellationFeedback = data.cancellationFeedback || [];
        } catch (e) {
            console.warn('[Subs] load failed', e);
        }
    }

    // ============================================================
    // 4. EVENT BUS
    // ============================================================
    function on(event, fn) {
        if (!state.listeners[event]) state.listeners[event] = [];
        state.listeners[event].push(fn);
    }

    function emit(event, payload) {
        (state.listeners[event] || []).forEach(function (fn) {
            try { fn(payload); } catch (e) { console.error('[Subs] listener', e); }
        });
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('volvix:subscription:' + event, { detail: payload }));
        }
    }

    // ============================================================
    // 5. UTILITIES
    // ============================================================
    function uuid() {
        return 'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function nowISO() { return new Date().toISOString(); }

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    function addCycle(date, cycle) {
        const d = new Date(date);
        if (cycle === 'annual') d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
        return d;
    }

    function daysBetween(a, b) {
        return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
    }

    function round2(n) { return Math.round(n * 100) / 100; }

    // ============================================================
    // 6. PRICING / PRO-RATING
    // ============================================================
    function getPrice(planId, cycle) {
        const p = PLANS[planId];
        if (!p) throw new Error('Plan no existe: ' + planId);
        if (!BILLING_CYCLES.includes(cycle)) throw new Error('Cycle inválido: ' + cycle);
        return p.price[cycle];
    }

    function calculateProration(currentSub, newPlanId, newCycle) {
        if (!currentSub) return { credit: 0, charge: 0, net: 0, days_remaining: 0 };
        const periodEnd = new Date(currentSub.currentPeriodEnd);
        const periodStart = new Date(currentSub.currentPeriodStart);
        const totalDays = daysBetween(periodStart, periodEnd) || 30;
        const remaining = Math.max(0, daysBetween(new Date(), periodEnd));
        const oldPrice = getPrice(currentSub.planId, currentSub.cycle);
        const newPrice = getPrice(newPlanId, newCycle);
        const dailyOld = oldPrice / totalDays;
        const newCycleDays = newCycle === 'annual' ? 365 : 30;
        const dailyNew = newPrice / newCycleDays;
        const credit = round2(dailyOld * remaining);
        const charge = round2(dailyNew * remaining);
        return {
            credit: credit,
            charge: charge,
            net: round2(charge - credit),
            days_remaining: remaining
        };
    }

    // ============================================================
    // 7. SUBSCRIPTION CRUD
    // ============================================================
    function createSubscription(opts) {
        const planId = opts.planId || 'free';
        const cycle = opts.cycle || 'monthly';
        const plan = PLANS[planId];
        if (!plan) throw new Error('Plan no existe: ' + planId);

        const start = new Date();
        const isTrial = !!opts.trial && plan.trial_days > 0;
        const trialEnd = isTrial ? addDays(start, plan.trial_days) : null;
        const periodEnd = isTrial ? trialEnd : addCycle(start, cycle);

        const sub = {
            id: uuid(),
            customerId: opts.customerId || 'self',
            planId: planId,
            cycle: cycle,
            status: isTrial ? 'trialing' : (planId === 'free' ? 'active_free' : 'active'),
            createdAt: nowISO(),
            currentPeriodStart: start.toISOString(),
            currentPeriodEnd: periodEnd.toISOString(),
            trialEnd: trialEnd ? trialEnd.toISOString() : null,
            autoRenew: opts.autoRenew !== false,
            paymentMethod: opts.paymentMethod || null,
            cancelAtPeriodEnd: false,
            canceledAt: null
        };

        state.currentSubscription = sub;
        state.history.push({ type: 'created', at: nowISO(), sub: clone(sub) });
        if (planId !== 'free' && !isTrial) issueInvoice(sub, getPrice(planId, cycle));
        saveState();
        recomputeMetrics();
        emit('created', sub);
        return sub;
    }

    function changePlan(newPlanId, newCycle, opts) {
        opts = opts || {};
        const cur = state.currentSubscription;
        if (!cur) throw new Error('No hay suscripción activa');
        if (!PLANS[newPlanId]) throw new Error('Plan no existe');
        newCycle = newCycle || cur.cycle;

        const oldTier = PLANS[cur.planId].tier;
        const newTier = PLANS[newPlanId].tier;
        const direction = newTier > oldTier ? 'upgrade' : (newTier < oldTier ? 'downgrade' : 'sidegrade');

        const proration = calculateProration(cur, newPlanId, newCycle);

        if (direction === 'downgrade' && !opts.immediate) {
            cur.pendingChange = { planId: newPlanId, cycle: newCycle, effectiveAt: cur.currentPeriodEnd };
            state.history.push({ type: 'downgrade_scheduled', at: nowISO(), to: newPlanId });
            saveState();
            emit('plan_change_scheduled', { sub: cur, proration: proration });
            return { sub: cur, proration: proration, effective: 'period_end' };
        }

        const before = clone(cur);
        cur.planId = newPlanId;
        cur.cycle = newCycle;
        cur.status = newPlanId === 'free' ? 'active_free' : 'active';
        cur.currentPeriodStart = nowISO();
        cur.currentPeriodEnd = addCycle(new Date(), newCycle).toISOString();
        cur.pendingChange = null;

        if (proration.net > 0) issueInvoice(cur, proration.net, 'proration');
        else if (proration.net < 0) issueCredit(cur, Math.abs(proration.net));

        state.history.push({ type: direction, at: nowISO(), from: before.planId, to: newPlanId, proration: proration });
        saveState();
        recomputeMetrics();
        emit(direction, { sub: cur, proration: proration });
        return { sub: cur, proration: proration, effective: 'immediate' };
    }

    function upgrade(planId, cycle) { return changePlan(planId, cycle, { immediate: true }); }
    function downgrade(planId, cycle) { return changePlan(planId, cycle, { immediate: false }); }

    // ============================================================
    // 8. TRIAL HANDLING
    // ============================================================
    function startTrial(planId, opts) {
        opts = opts || {};
        return createSubscription({ planId: planId || 'pro', cycle: opts.cycle || 'monthly', trial: true });
    }

    function convertTrial() {
        const cur = state.currentSubscription;
        if (!cur || cur.status !== 'trialing') throw new Error('No hay trial activa');
        cur.status = 'active';
        cur.trialEnd = null;
        cur.currentPeriodStart = nowISO();
        cur.currentPeriodEnd = addCycle(new Date(), cur.cycle).toISOString();
        issueInvoice(cur, getPrice(cur.planId, cur.cycle));
        state.history.push({ type: 'trial_converted', at: nowISO(), planId: cur.planId });
        saveState();
        recomputeMetrics();
        emit('trial_converted', cur);
        return cur;
    }

    function expireTrial() {
        const cur = state.currentSubscription;
        if (!cur || cur.status !== 'trialing') return null;
        cur.status = 'expired';
        cur.planId = 'free';
        state.history.push({ type: 'trial_expired', at: nowISO() });
        saveState();
        emit('trial_expired', cur);
        return cur;
    }

    // ============================================================
    // 9. CANCELLATION FLOW
    // ============================================================
    const CANCEL_REASONS = [
        'too_expensive', 'missing_features', 'switched_competitor',
        'not_using', 'technical_issues', 'business_closed', 'other'
    ];

    function cancelSubscription(opts) {
        opts = opts || {};
        const cur = state.currentSubscription;
        if (!cur) throw new Error('No hay suscripción');
        const immediate = !!opts.immediate;
        const feedback = {
            id: uuid(),
            at: nowISO(),
            subscriptionId: cur.id,
            planId: cur.planId,
            reason: opts.reason || 'other',
            comment: opts.comment || '',
            wouldReturn: !!opts.wouldReturn,
            npsScore: typeof opts.npsScore === 'number' ? opts.npsScore : null
        };
        if (!CANCEL_REASONS.includes(feedback.reason)) feedback.reason = 'other';
        state.cancellationFeedback.push(feedback);

        if (immediate) {
            cur.status = 'canceled';
            cur.canceledAt = nowISO();
            cur.autoRenew = false;
        } else {
            cur.cancelAtPeriodEnd = true;
            cur.autoRenew = false;
            cur.status = 'pending_cancel';
        }
        state.history.push({ type: 'canceled', at: nowISO(), immediate: immediate, feedback: feedback });
        saveState();
        recomputeMetrics();
        emit('canceled', { sub: cur, feedback: feedback });
        return { sub: cur, feedback: feedback };
    }

    function reactivate() {
        const cur = state.currentSubscription;
        if (!cur) throw new Error('No hay suscripción');
        if (!['pending_cancel', 'canceled', 'expired'].includes(cur.status)) {
            throw new Error('No reactivable: ' + cur.status);
        }
        cur.status = 'active';
        cur.cancelAtPeriodEnd = false;
        cur.canceledAt = null;
        cur.autoRenew = true;
        if (new Date(cur.currentPeriodEnd) < new Date()) {
            cur.currentPeriodStart = nowISO();
            cur.currentPeriodEnd = addCycle(new Date(), cur.cycle).toISOString();
            issueInvoice(cur, getPrice(cur.planId, cur.cycle));
        }
        state.history.push({ type: 'reactivated', at: nowISO() });
        saveState();
        recomputeMetrics();
        emit('reactivated', cur);
        return cur;
    }

    // ============================================================
    // 10. RENEWAL ENGINE
    // ============================================================
    function processRenewals() {
        const cur = state.currentSubscription;
        if (!cur) return null;
        const now = new Date();
        const periodEnd = new Date(cur.currentPeriodEnd);
        if (now < periodEnd) return null;

        if (cur.status === 'trialing') {
            return cur.autoRenew ? convertTrial() : expireTrial();
        }
        if (cur.cancelAtPeriodEnd) {
            cur.status = 'canceled';
            cur.canceledAt = nowISO();
            state.history.push({ type: 'canceled_at_period_end', at: nowISO() });
            saveState();
            recomputeMetrics();
            emit('canceled', { sub: cur });
            return cur;
        }
        if (cur.pendingChange) {
            const pc = cur.pendingChange;
            cur.planId = pc.planId;
            cur.cycle = pc.cycle;
            cur.pendingChange = null;
        }
        if (!cur.autoRenew) {
            cur.status = 'expired';
            saveState();
            emit('expired', cur);
            return cur;
        }
        cur.currentPeriodStart = nowISO();
        cur.currentPeriodEnd = addCycle(new Date(), cur.cycle).toISOString();
        issueInvoice(cur, getPrice(cur.planId, cur.cycle), 'renewal');
        state.history.push({ type: 'renewed', at: nowISO() });
        saveState();
        recomputeMetrics();
        emit('renewed', cur);
        return cur;
    }

    // ============================================================
    // 11. INVOICES
    // ============================================================
    function issueInvoice(sub, amount, kind) {
        const inv = {
            id: 'inv_' + Date.now().toString(36),
            subscriptionId: sub.id,
            planId: sub.planId,
            cycle: sub.cycle,
            amount: round2(amount),
            kind: kind || 'subscription',
            status: 'paid',
            issuedAt: nowISO()
        };
        state.invoices.push(inv);
        emit('invoice_issued', inv);
        return inv;
    }

    function issueCredit(sub, amount) {
        const c = {
            id: 'crd_' + Date.now().toString(36),
            subscriptionId: sub.id,
            amount: round2(amount),
            kind: 'credit',
            status: 'applied',
            issuedAt: nowISO()
        };
        state.invoices.push(c);
        emit('credit_issued', c);
        return c;
    }

    // ============================================================
    // 12. METRICS: MRR, ARR, Churn, LTV
    // ============================================================
    function recomputeMetrics() {
        const cur = state.currentSubscription;
        let mrr = 0;
        if (cur && ['active', 'pending_cancel'].includes(cur.status)) {
            const price = getPrice(cur.planId, cur.cycle);
            mrr = cur.cycle === 'annual' ? price / 12 : price;
        }
        const arr = mrr * 12;
        const cancels = state.history.filter(function (h) { return h.type === 'canceled'; }).length;
        const totalCustomers = Math.max(1, new Set(state.history.filter(function (h) {
            return h.type === 'created';
        }).map(function (h) { return h.sub.customerId; })).size);
        const churnRate = round2((cancels / totalCustomers) * 100);
        const avgLifeMonths = churnRate > 0 ? round2(100 / churnRate) : 24;
        const ltv = round2(mrr * avgLifeMonths);
        state.metrics = {
            mrr: round2(mrr),
            arr: round2(arr),
            churnRate: churnRate,
            ltv: ltv,
            avgLifeMonths: avgLifeMonths,
            activeCustomers: cur && cur.status === 'active' ? 1 : 0,
            totalInvoiced: round2(state.invoices.filter(function (i) {
                return i.kind !== 'credit';
            }).reduce(function (s, i) { return s + i.amount; }, 0))
        };
        emit('metrics_updated', state.metrics);
        return state.metrics;
    }

    function getMetrics() { return clone(state.metrics); }

    // ============================================================
    // 13. ENFORCEMENT / LIMITS
    // ============================================================
    function getCurrentPlan() {
        const cur = state.currentSubscription;
        if (!cur) return PLANS.free;
        return PLANS[cur.planId] || PLANS.free;
    }

    function checkLimit(resource, currentValue) {
        const plan = getCurrentPlan();
        const limit = plan.limits[resource];
        if (limit === undefined) return { allowed: true };
        if (limit === -1) return { allowed: true, unlimited: true };
        return {
            allowed: currentValue < limit,
            limit: limit,
            current: currentValue,
            remaining: Math.max(0, limit - currentValue)
        };
    }

    function hasFeature(name) {
        const plan = getCurrentPlan();
        return plan.features.some(function (f) { return f.toLowerCase().includes(name.toLowerCase()); });
    }

    // ============================================================
    // 14. HELPERS
    // ============================================================
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function getStatus() {
        const cur = state.currentSubscription;
        if (!cur) return { hasSubscription: false, plan: 'free' };
        return {
            hasSubscription: true,
            id: cur.id,
            plan: cur.planId,
            cycle: cur.cycle,
            status: cur.status,
            renewsAt: cur.currentPeriodEnd,
            trialEnd: cur.trialEnd,
            autoRenew: cur.autoRenew,
            cancelAtPeriodEnd: cur.cancelAtPeriodEnd,
            pendingChange: cur.pendingChange || null
        };
    }

    function listInvoices() { return clone(state.invoices); }
    function listHistory() { return clone(state.history); }
    function listFeedback() { return clone(state.cancellationFeedback); }
    function listPlans() { return clone(PLANS); }

    function reset() {
        state.currentSubscription = null;
        state.history = [];
        state.invoices = [];
        state.cancellationFeedback = [];
        state.metrics = { mrr: 0, arr: 0, churnRate: 0, ltv: 0, activeCustomers: 0 };
        saveState();
        emit('reset', null);
    }

    // ============================================================
    // 15. RENEWAL TIMER
    // ============================================================
    let renewalTimer = null;
    function startRenewalDaemon(intervalMs) {
        stopRenewalDaemon();
        renewalTimer = setInterval(processRenewals, intervalMs || 60 * 60 * 1000);
    }
    function stopRenewalDaemon() {
        if (renewalTimer) { clearInterval(renewalTimer); renewalTimer = null; }
    }

    // ============================================================
    // 16. INIT
    // ============================================================
    loadState();
    recomputeMetrics();
    if (typeof window !== 'undefined') {
        startRenewalDaemon(60 * 60 * 1000);
    }

    // ============================================================
    // 17. PUBLIC API
    // ============================================================
    const SubscriptionsAPI = {
        // Plans
        plans: listPlans,
        getPrice: getPrice,
        getCurrentPlan: getCurrentPlan,
        // Subscription lifecycle
        subscribe: createSubscription,
        startTrial: startTrial,
        convertTrial: convertTrial,
        expireTrial: expireTrial,
        upgrade: upgrade,
        downgrade: downgrade,
        changePlan: changePlan,
        cancel: cancelSubscription,
        reactivate: reactivate,
        // Pro-rating
        calculateProration: calculateProration,
        // Renewal
        processRenewals: processRenewals,
        startRenewalDaemon: startRenewalDaemon,
        stopRenewalDaemon: stopRenewalDaemon,
        // Status
        getStatus: getStatus,
        // Limits / features
        checkLimit: checkLimit,
        hasFeature: hasFeature,
        // Invoices / history / feedback
        invoices: listInvoices,
        history: listHistory,
        cancellationFeedback: listFeedback,
        cancelReasons: function () { return CANCEL_REASONS.slice(); },
        // Metrics
        metrics: getMetrics,
        recomputeMetrics: recomputeMetrics,
        // Events
        on: on,
        // Admin
        reset: reset,
        version: '1.0.0'
    };

    global.SubscriptionsAPI = SubscriptionsAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = SubscriptionsAPI;

    emit('ready', { version: SubscriptionsAPI.version });
    console.log('[Volvix Subscriptions] wiring ready v' + SubscriptionsAPI.version);
})(typeof window !== 'undefined' ? window : globalThis);
