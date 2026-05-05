-- R17_REVIEWS.sql — Reseñas y calificaciones de clientes
-- Idempotente

CREATE TABLE IF NOT EXISTS reviews (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    customer_id     BIGINT NOT NULL,
    sale_id         BIGINT,
    product_id      BIGINT,
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title           TEXT,
    body            TEXT,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','published','rejected')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant       ON reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product      ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer     ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_sale         ON reviews(sale_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status       ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating       ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_pub_product
    ON reviews(product_id, status) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS review_responses (
    id          BIGSERIAL PRIMARY KEY,
    review_id   BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL,
    response    TEXT NOT NULL,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_responses_review ON review_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_user   ON review_responses(user_id);

-- RLS
ALTER TABLE reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_responses   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_tenant_isolation ON reviews;
CREATE POLICY reviews_tenant_isolation ON reviews
    USING (tenant_id = current_setting('app.tenant_id', true)::BIGINT);

DROP POLICY IF EXISTS review_responses_tenant_isolation ON review_responses;
CREATE POLICY review_responses_tenant_isolation ON review_responses
    USING (review_id IN (
        SELECT id FROM reviews
        WHERE tenant_id = current_setting('app.tenant_id', true)::BIGINT
    ));
