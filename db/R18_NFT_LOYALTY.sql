-- R18_NFT_LOYALTY.sql — NFT Loyalty + Blockchain Receipts (MOCK)
CREATE TABLE IF NOT EXISTS nft_collections (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  contract_address_mock TEXT NOT NULL,
  supply_total INT NOT NULL DEFAULT 0,
  minted_count INT NOT NULL DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nftcol_tenant ON nft_collections(tenant_id);

CREATE TABLE IF NOT EXISTS customer_nfts (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  collection_id BIGINT NOT NULL REFERENCES nft_collections(id),
  token_id TEXT NOT NULL,
  ipfs_hash_mock TEXT NOT NULL,
  minted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, token_id)
);
CREATE INDEX IF NOT EXISTS idx_cnft_customer ON customer_nfts(customer_id);
CREATE INDEX IF NOT EXISTS idx_cnft_collection ON customer_nfts(collection_id);

CREATE TABLE IF NOT EXISTS blockchain_receipts (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL,
  tx_hash_mock TEXT NOT NULL UNIQUE,
  ipfs_url_mock TEXT NOT NULL,
  anchored_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bcrcpt_sale ON blockchain_receipts(sale_id);
