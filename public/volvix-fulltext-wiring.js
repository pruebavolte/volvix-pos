/* ============================================================================
 * volvix-fulltext-wiring.js
 * Volvix POS - Fulltext Search Engine (cliente)
 * Agent-35 / Ronda 8 Fibonacci
 *
 * Características:
 *   1. Indexa productos, clientes, ventas
 *   2. Tokenización (unicode, lowercase, deburr)
 *   3. TF-IDF scoring
 *   4. Fuzzy matching (Levenshtein con cutoff)
 *   5. Búsqueda por prefix, sufijo, n-grams
 *   6. Highlight de matches en resultados
 *   7. Stop words ES + EN
 *   8. Stemmer básico (snowball-lite ES/EN)
 *   9. window.FulltextAPI expuesto
 *
 * No requiere dependencias externas. ~600 líneas.
 * ========================================================================== */

(function (global) {
    'use strict';

    // ------------------------------------------------------------------------
    // 1. CONFIG GLOBAL
    // ------------------------------------------------------------------------
    var CONFIG = {
        minTokenLen: 2,
        maxTokenLen: 40,
        ngramMin: 2,
        ngramMax: 4,
        fuzzyMaxDistance: 2,
        fuzzyMinLen: 4,
        topK: 50,
        prefixWeight: 1.5,
        suffixWeight: 1.1,
        ngramWeight: 0.6,
        fuzzyWeight: 0.4,
        exactWeight: 2.0,
        fieldBoosts: {
            name: 3.0,
            sku: 2.5,
            code: 2.5,
            barcode: 2.5,
            email: 2.0,
            phone: 1.5,
            description: 1.0,
            notes: 0.7,
            customer: 1.8,
            id: 1.2
        }
    };

    // ------------------------------------------------------------------------
    // 2. STOP WORDS (ES + EN)
    // ------------------------------------------------------------------------
    var STOP_WORDS = new Set([
        // Español
        'el','la','los','las','un','una','unos','unas','de','del','al','a',
        'y','o','u','e','que','en','con','por','para','sin','sobre','entre',
        'es','son','fue','fueron','ser','estar','este','esta','esto','ese',
        'esa','eso','aquel','aquella','su','sus','mi','mis','tu','tus','lo',
        'le','les','se','si','no','ni','pero','como','mas','muy','ya','yo',
        'tu','el','ella','nosotros','vosotros','ellos','ellas',
        // Inglés
        'the','a','an','and','or','but','if','then','else','for','to','of',
        'in','on','at','by','with','from','as','is','are','was','were','be',
        'been','being','have','has','had','do','does','did','this','that',
        'these','those','it','its','i','you','he','she','we','they','my',
        'your','his','her','our','their','not','no','so','too','very'
    ]);

    // ------------------------------------------------------------------------
    // 3. NORMALIZACIÓN / DEBURR
    // ------------------------------------------------------------------------
    var DIACRITICS = /[̀-ͯ]/g;

    function deburr(s) {
        return String(s).normalize('NFD').replace(DIACRITICS, '');
    }

    function normalize(s) {
        return deburr(String(s || '')).toLowerCase()
            .replace(/[^a-z0-9ñü\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ------------------------------------------------------------------------
    // 4. TOKENIZACIÓN
    // ------------------------------------------------------------------------
    function tokenize(text) {
        if (!text) return [];
        var raw = normalize(text).split(' ');
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var t = raw[i];
            if (!t) continue;
            if (t.length < CONFIG.minTokenLen) continue;
            if (t.length > CONFIG.maxTokenLen) t = t.slice(0, CONFIG.maxTokenLen);
            if (STOP_WORDS.has(t)) continue;
            out.push(t);
        }
        return out;
    }

    // ------------------------------------------------------------------------
    // 5. STEMMER BÁSICO ES/EN
    // ------------------------------------------------------------------------
    var ES_SUFFIXES = [
        'amientos','imientos','amiento','imiento','aciones','iciones',
        'acion','icion','ables','ibles','ando','iendo','adas','idas',
        'ados','idos','ante','ente','ador','edor','idor','mente',
        'ales','eles','iles','oles','ulos','ales','ismo','ista','able',
        'ible','aron','ieron','aban','iban','ado','ido','ada','ida',
        'ar','er','ir','as','es','os','an','en','as','os','es','s'
    ];

    var EN_SUFFIXES = [
        'ational','tional','iveness','fulness','ousness','ization',
        'ation','ement','ness','able','ible','ally','ical','ance',
        'ence','ings','ies','ied','ing','ies','est','ers','ing','ed',
        'ly','es','er','s'
    ];

    function stemEs(w) {
        if (w.length < 5) return w;
        for (var i = 0; i < ES_SUFFIXES.length; i++) {
            var s = ES_SUFFIXES[i];
            if (w.length - s.length >= 3 && w.endsWith(s)) {
                return w.slice(0, w.length - s.length);
            }
        }
        return w;
    }

    function stemEn(w) {
        if (w.length < 4) return w;
        for (var i = 0; i < EN_SUFFIXES.length; i++) {
            var s = EN_SUFFIXES[i];
            if (w.length - s.length >= 3 && w.endsWith(s)) {
                return w.slice(0, w.length - s.length);
            }
        }
        return w;
    }

    function stem(w) {
        var a = stemEs(w);
        if (a !== w) return a;
        return stemEn(w);
    }

    // ------------------------------------------------------------------------
    // 6. N-GRAMS
    // ------------------------------------------------------------------------
    function ngrams(token, nMin, nMax) {
        var out = [];
        nMin = nMin || CONFIG.ngramMin;
        nMax = nMax || CONFIG.ngramMax;
        var padded = '_' + token + '_';
        for (var n = nMin; n <= nMax; n++) {
            for (var i = 0; i + n <= padded.length; i++) {
                out.push(padded.slice(i, i + n));
            }
        }
        return out;
    }

    // ------------------------------------------------------------------------
    // 7. LEVENSHTEIN (fuzzy)
    // ------------------------------------------------------------------------
    function levenshtein(a, b, max) {
        if (a === b) return 0;
        var la = a.length, lb = b.length;
        if (Math.abs(la - lb) > max) return max + 1;
        if (!la) return lb;
        if (!lb) return la;
        var prev = new Array(lb + 1);
        var curr = new Array(lb + 1);
        for (var j = 0; j <= lb; j++) prev[j] = j;
        for (var i = 1; i <= la; i++) {
            curr[0] = i;
            var rowMin = curr[0];
            for (var k = 1; k <= lb; k++) {
                var cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
                curr[k] = Math.min(curr[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
                if (curr[k] < rowMin) rowMin = curr[k];
            }
            if (rowMin > max) return max + 1;
            var tmp = prev; prev = curr; curr = tmp;
        }
        return prev[lb];
    }

    // ------------------------------------------------------------------------
    // 8. ÍNDICE INVERTIDO
    // ------------------------------------------------------------------------
    function FulltextIndex() {
        this.docs = Object.create(null);          // id -> { id, type, fields, tokens, len }
        this.invIndex = Object.create(null);      // term -> { df, postings: { docId: {tf, fields: {f: count}} } }
        this.prefixTrie = Object.create(null);    // primeras 2 letras -> Set(terms)
        this.ngramIndex = Object.create(null);    // ngram -> Set(terms)
        this.stemIndex = Object.create(null);     // stem -> Set(terms)
        this.totalDocs = 0;
        this.avgLen = 0;
        this._lenSum = 0;
    }

    FulltextIndex.prototype.clear = function () {
        this.docs = Object.create(null);
        this.invIndex = Object.create(null);
        this.prefixTrie = Object.create(null);
        this.ngramIndex = Object.create(null);
        this.stemIndex = Object.create(null);
        this.totalDocs = 0;
        this.avgLen = 0;
        this._lenSum = 0;
    };

    FulltextIndex.prototype._addToken = function (term, docId, field) {
        if (!this.invIndex[term]) {
            this.invIndex[term] = { df: 0, postings: Object.create(null) };
        }
        var entry = this.invIndex[term];
        var post = entry.postings[docId];
        if (!post) {
            post = entry.postings[docId] = { tf: 0, fields: Object.create(null) };
            entry.df++;
        }
        post.tf++;
        post.fields[field] = (post.fields[field] || 0) + 1;

        // Prefix bucket
        var bucket = term.slice(0, 2);
        if (!this.prefixTrie[bucket]) this.prefixTrie[bucket] = new Set();
        this.prefixTrie[bucket].add(term);

        // N-grams
        var grams = ngrams(term);
        for (var i = 0; i < grams.length; i++) {
            var g = grams[i];
            if (!this.ngramIndex[g]) this.ngramIndex[g] = new Set();
            this.ngramIndex[g].add(term);
        }

        // Stem
        var st = stem(term);
        if (!this.stemIndex[st]) this.stemIndex[st] = new Set();
        this.stemIndex[st].add(term);
    };

    FulltextIndex.prototype.addDoc = function (doc) {
        if (!doc || doc.id == null) return;
        var id = String(doc.id);
        if (this.docs[id]) this.removeDoc(id);

        var fields = doc.fields || {};
        var allTokens = [];
        var fieldTokens = Object.create(null);

        for (var f in fields) {
            if (!Object.prototype.hasOwnProperty.call(fields, f)) continue;
            var val = fields[f];
            if (val == null) continue;
            var toks = tokenize(val);
            fieldTokens[f] = toks;
            for (var i = 0; i < toks.length; i++) {
                this._addToken(toks[i], id, f);
                allTokens.push(toks[i]);
            }
        }

        this.docs[id] = {
            id: id,
            type: doc.type || 'unknown',
            fields: fields,
            tokens: allTokens,
            fieldTokens: fieldTokens,
            len: allTokens.length || 1,
            meta: doc.meta || {}
        };
        this.totalDocs++;
        this._lenSum += allTokens.length || 1;
        this.avgLen = this._lenSum / this.totalDocs;
    };

    FulltextIndex.prototype.removeDoc = function (docId) {
        var id = String(docId);
        var d = this.docs[id];
        if (!d) return false;
        var toks = d.tokens;
        for (var i = 0; i < toks.length; i++) {
            var t = toks[i];
            var entry = this.invIndex[t];
            if (!entry) continue;
            if (entry.postings[id]) {
                delete entry.postings[id];
                entry.df--;
                if (entry.df <= 0) delete this.invIndex[t];
            }
        }
        this._lenSum -= d.len;
        this.totalDocs--;
        if (this.totalDocs > 0) this.avgLen = this._lenSum / this.totalDocs;
        else this.avgLen = 0;
        delete this.docs[id];
        return true;
    };

    FulltextIndex.prototype.bulk = function (docs) {
        if (!Array.isArray(docs)) return 0;
        for (var i = 0; i < docs.length; i++) this.addDoc(docs[i]);
        return docs.length;
    };

    // ------------------------------------------------------------------------
    // 9. EXPANSIÓN DE TÉRMINOS DE QUERY
    // ------------------------------------------------------------------------
    FulltextIndex.prototype._expandTerm = function (term) {
        // Devuelve { exact:[], prefix:[], suffix:[], ngram:[], fuzzy:[], stem:[] }
        var out = {
            exact: [], prefix: [], suffix: [], ngram: [], fuzzy: [], stem: []
        };
        if (this.invIndex[term]) out.exact.push(term);

        // Prefix
        var bucket = term.slice(0, 2);
        var pset = this.prefixTrie[bucket];
        if (pset) {
            pset.forEach(function (t) {
                if (t !== term && t.startsWith(term)) out.prefix.push(t);
            });
        }

        // Suffix (escaneo lineal sobre todo el vocab — limitado por tamaño)
        var vocab = Object.keys(this.invIndex);
        for (var i = 0; i < vocab.length; i++) {
            var v = vocab[i];
            if (v !== term && v.endsWith(term) && term.length >= 3) {
                out.suffix.push(v);
            }
        }

        // N-gram overlap
        var grams = ngrams(term);
        var candidateScore = Object.create(null);
        for (var g = 0; g < grams.length; g++) {
            var set = this.ngramIndex[grams[g]];
            if (!set) continue;
            set.forEach(function (t) {
                candidateScore[t] = (candidateScore[t] || 0) + 1;
            });
        }
        var ngThresh = Math.max(2, Math.floor(grams.length * 0.4));
        for (var c in candidateScore) {
            if (candidateScore[c] >= ngThresh && c !== term) {
                out.ngram.push(c);
            }
        }

        // Fuzzy (sólo si término largo)
        if (term.length >= CONFIG.fuzzyMinLen) {
            var seen = Object.create(null);
            for (var i2 = 0; i2 < out.ngram.length; i2++) seen[out.ngram[i2]] = 1;
            for (var k in seen) {
                var d = levenshtein(term, k, CONFIG.fuzzyMaxDistance);
                if (d > 0 && d <= CONFIG.fuzzyMaxDistance) out.fuzzy.push(k);
            }
        }

        // Stem
        var st = stem(term);
        var sset = this.stemIndex[st];
        if (sset) {
            sset.forEach(function (t) {
                if (t !== term) out.stem.push(t);
            });
        }
        return out;
    };

    // ------------------------------------------------------------------------
    // 10. SCORING (TF-IDF con field boost)
    // ------------------------------------------------------------------------
    FulltextIndex.prototype._idf = function (df) {
        if (df <= 0) return 0;
        return Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));
    };

    FulltextIndex.prototype._scoreTerm = function (term, kindWeight, accum) {
        var entry = this.invIndex[term];
        if (!entry) return;
        var idf = this._idf(entry.df);
        for (var docId in entry.postings) {
            var post = entry.postings[docId];
            var tf = post.tf;
            var fieldBoost = 1;
            for (var f in post.fields) {
                var fb = CONFIG.fieldBoosts[f] || 1;
                if (fb > fieldBoost) fieldBoost = fb;
            }
            var doc = this.docs[docId];
            var norm = doc ? Math.sqrt(doc.len) : 1;
            var score = (tf * idf * fieldBoost * kindWeight) / norm;
            if (!accum[docId]) {
                accum[docId] = { score: 0, matches: Object.create(null) };
            }
            accum[docId].score += score;
            accum[docId].matches[term] = (accum[docId].matches[term] || 0) + score;
        }
    };

    // ------------------------------------------------------------------------
    // 11. SEARCH
    // ------------------------------------------------------------------------
    FulltextIndex.prototype.search = function (query, opts) {
        opts = opts || {};
        var topK = opts.topK || CONFIG.topK;
        var typeFilter = opts.type || null;

        var qTokens = tokenize(query);
        if (!qTokens.length) return [];

        var accum = Object.create(null);

        for (var i = 0; i < qTokens.length; i++) {
            var qt = qTokens[i];
            var exp = this._expandTerm(qt);

            for (var x = 0; x < exp.exact.length; x++)
                this._scoreTerm(exp.exact[x], CONFIG.exactWeight, accum);
            for (var x = 0; x < exp.prefix.length; x++)
                this._scoreTerm(exp.prefix[x], CONFIG.prefixWeight, accum);
            for (var x = 0; x < exp.suffix.length; x++)
                this._scoreTerm(exp.suffix[x], CONFIG.suffixWeight, accum);
            for (var x = 0; x < exp.ngram.length; x++)
                this._scoreTerm(exp.ngram[x], CONFIG.ngramWeight, accum);
            for (var x = 0; x < exp.fuzzy.length; x++)
                this._scoreTerm(exp.fuzzy[x], CONFIG.fuzzyWeight, accum);
            for (var x = 0; x < exp.stem.length; x++)
                this._scoreTerm(exp.stem[x], CONFIG.fuzzyWeight, accum);
        }

        var results = [];
        for (var docId in accum) {
            var doc = this.docs[docId];
            if (!doc) continue;
            if (typeFilter && doc.type !== typeFilter) continue;
            results.push({
                id: doc.id,
                type: doc.type,
                score: accum[docId].score,
                matches: Object.keys(accum[docId].matches),
                fields: doc.fields,
                meta: doc.meta,
                highlight: highlightFields(doc.fields, Object.keys(accum[docId].matches))
            });
        }

        results.sort(function (a, b) { return b.score - a.score; });
        if (results.length > topK) results.length = topK;
        return results;
    };

    // ------------------------------------------------------------------------
    // 12. HIGHLIGHT
    // ------------------------------------------------------------------------
    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlightFields(fields, terms) {
        if (!fields || !terms || !terms.length) return {};
        var out = {};
        var pattern = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'gi');
        for (var f in fields) {
            var val = fields[f];
            if (val == null) continue;
            var s = String(val);
            // Para cada término, buscar ignorando diacríticos en una capa
            var deburred = deburr(s).toLowerCase();
            var positions = [];
            for (var i = 0; i < terms.length; i++) {
                var t = terms[i];
                var idx = 0;
                while (true) {
                    var p = deburred.indexOf(t, idx);
                    if (p < 0) break;
                    positions.push([p, p + t.length]);
                    idx = p + t.length;
                }
            }
            positions.sort(function (a, b) { return a[0] - b[0]; });
            // Merge solapadas
            var merged = [];
            for (var j = 0; j < positions.length; j++) {
                var pos = positions[j];
                if (merged.length && pos[0] <= merged[merged.length - 1][1]) {
                    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], pos[1]);
                } else merged.push([pos[0], pos[1]]);
            }
            if (!merged.length) { out[f] = s; continue; }
            var built = '';
            var cursor = 0;
            for (var m = 0; m < merged.length; m++) {
                built += s.slice(cursor, merged[m][0]);
                built += '<mark>' + s.slice(merged[m][0], merged[m][1]) + '</mark>';
                cursor = merged[m][1];
            }
            built += s.slice(cursor);
            out[f] = built;
        }
        return out;
    }

    // ------------------------------------------------------------------------
    // 13. ADAPTERS PARA PRODUCTOS / CLIENTES / VENTAS
    // ------------------------------------------------------------------------
    function productToDoc(p) {
        return {
            id: 'p:' + (p.id || p.sku || p.code),
            type: 'product',
            fields: {
                name: p.name || p.nombre || '',
                sku: p.sku || p.code || '',
                barcode: p.barcode || p.codigo_barras || '',
                description: p.description || p.descripcion || '',
                category: p.category || p.categoria || '',
                brand: p.brand || p.marca || ''
            },
            meta: { price: p.price || p.precio, stock: p.stock, raw: p }
        };
    }

    function customerToDoc(c) {
        return {
            id: 'c:' + (c.id || c.email || c.phone),
            type: 'customer',
            fields: {
                name: c.name || c.nombre || ((c.first_name || '') + ' ' + (c.last_name || '')),
                email: c.email || '',
                phone: c.phone || c.telefono || '',
                customer: c.company || c.empresa || '',
                notes: c.notes || c.notas || '',
                rfc: c.rfc || c.tax_id || ''
            },
            meta: { raw: c }
        };
    }

    function saleToDoc(s) {
        var items = (s.items || []).map(function (it) {
            return (it.name || it.sku || '') + ' x' + (it.qty || it.cantidad || 1);
        }).join(' ');
        return {
            id: 's:' + (s.id || s.folio),
            type: 'sale',
            fields: {
                id: String(s.id || s.folio || ''),
                customer: s.customer_name || s.cliente || '',
                notes: s.notes || s.observaciones || '',
                description: items,
                date: s.date || s.fecha || ''
            },
            meta: {
                total: s.total,
                date: s.date || s.fecha,
                items: s.items || [],
                raw: s
            }
        };
    }

    // ------------------------------------------------------------------------
    // 14. API PÚBLICA
    // ------------------------------------------------------------------------
    var globalIndex = new FulltextIndex();

    var FulltextAPI = {
        version: '1.0.0',
        config: CONFIG,

        // Index ops
        clear: function () { globalIndex.clear(); return true; },

        indexProducts: function (products) {
            if (!Array.isArray(products)) return 0;
            var docs = products.map(productToDoc);
            return globalIndex.bulk(docs);
        },
        indexCustomers: function (customers) {
            if (!Array.isArray(customers)) return 0;
            var docs = customers.map(customerToDoc);
            return globalIndex.bulk(docs);
        },
        indexSales: function (sales) {
            if (!Array.isArray(sales)) return 0;
            var docs = sales.map(saleToDoc);
            return globalIndex.bulk(docs);
        },
        indexCustom: function (docs) { return globalIndex.bulk(docs); },
        addDoc: function (d) { globalIndex.addDoc(d); },
        removeDoc: function (id) { return globalIndex.removeDoc(id); },

        // Stats
        stats: function () {
            return {
                totalDocs: globalIndex.totalDocs,
                vocabSize: Object.keys(globalIndex.invIndex).length,
                avgLen: globalIndex.avgLen,
                ngramBuckets: Object.keys(globalIndex.ngramIndex).length,
                stemBuckets: Object.keys(globalIndex.stemIndex).length
            };
        },

        // Search
        search: function (q, opts) { return globalIndex.search(q, opts); },
        searchProducts: function (q, opts) {
            opts = opts || {}; opts.type = 'product';
            return globalIndex.search(q, opts);
        },
        searchCustomers: function (q, opts) {
            opts = opts || {}; opts.type = 'customer';
            return globalIndex.search(q, opts);
        },
        searchSales: function (q, opts) {
            opts = opts || {}; opts.type = 'sale';
            return globalIndex.search(q, opts);
        },

        // Utilidades expuestas (útiles para tests / debug)
        utils: {
            tokenize: tokenize,
            normalize: normalize,
            deburr: deburr,
            stem: stem,
            ngrams: ngrams,
            levenshtein: levenshtein,
            highlight: highlightFields,
            stopWords: STOP_WORDS
        },

        // Auto-wiring opcional desde estructuras globales conocidas de Volvix POS
        autoWire: function () {
            var counts = { products: 0, customers: 0, sales: 0 };
            try {
                if (global.VolvixData) {
                    if (Array.isArray(global.VolvixData.products))
                        counts.products = this.indexProducts(global.VolvixData.products);
                    if (Array.isArray(global.VolvixData.customers))
                        counts.customers = this.indexCustomers(global.VolvixData.customers);
                    if (Array.isArray(global.VolvixData.sales))
                        counts.sales = this.indexSales(global.VolvixData.sales);
                }
                if (global.VolvixPOS && global.VolvixPOS.state) {
                    var st = global.VolvixPOS.state;
                    if (Array.isArray(st.products) && !counts.products)
                        counts.products = this.indexProducts(st.products);
                    if (Array.isArray(st.customers) && !counts.customers)
                        counts.customers = this.indexCustomers(st.customers);
                    if (Array.isArray(st.sales) && !counts.sales)
                        counts.sales = this.indexSales(st.sales);
                }
            } catch (e) {
                console.warn('[FulltextAPI.autoWire] error:', e);
            }
            return counts;
        },

        // Listener helper: refresca al recibir CustomEvent('volvix:data-changed')
        bindAutoRefresh: function () {
            var self = this;
            global.addEventListener('volvix:data-changed', function () {
                self.clear();
                self.autoWire();
            });
            return true;
        }
    };

    // ------------------------------------------------------------------------
    // 15. EXPONER
    // ------------------------------------------------------------------------
    global.FulltextAPI = FulltextAPI;
    global.FulltextIndex = FulltextIndex;

    // Auto-wire diferido (no bloqueante)
    if (typeof global.document !== 'undefined') {
        if (global.document.readyState === 'complete' ||
            global.document.readyState === 'interactive') {
            setTimeout(function () { try { FulltextAPI.autoWire(); } catch (e) {} }, 0);
        } else {
            global.document.addEventListener('DOMContentLoaded', function () {
                try { FulltextAPI.autoWire(); } catch (e) {}
            });
        }
    }

    console.log('[volvix-fulltext-wiring] loaded v' + FulltextAPI.version);

})(typeof window !== 'undefined' ? window : this);

/* ============================================================================
 * EJEMPLO DE USO
 * ----------------------------------------------------------------------------
 * FulltextAPI.indexProducts([
 *   { id:1, name:'Coca Cola 600ml', sku:'CC600', barcode:'7501055', price:18 },
 *   { id:2, name:'Sabritas Original', sku:'SB100', price:15 }
 * ]);
 * FulltextAPI.indexCustomers([
 *   { id:'A1', name:'Juan Pérez', email:'juan@x.com', phone:'5512345678' }
 * ]);
 * FulltextAPI.indexSales([
 *   { id:'V001', customer_name:'Juan Pérez', total:100, items:[{name:'Coca',qty:2}] }
 * ]);
 *
 * var r = FulltextAPI.search('cola');
 * console.table(r.map(x => ({id:x.id, score:x.score.toFixed(2), name:x.fields.name})));
 *
 * // Fuzzy: typo
 * FulltextAPI.search('cocacola');   // matchea "Coca Cola"
 * FulltextAPI.search('peres');      // matchea "Pérez"
 *
 * // Filtrado por tipo
 * FulltextAPI.searchProducts('sabri');
 * ========================================================================== */
