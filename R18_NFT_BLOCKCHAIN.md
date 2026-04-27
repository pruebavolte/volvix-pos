# R18 — NFT Loyalty + Blockchain Receipts (MOCK)

## Resumen
Sistema de fidelidad basado en NFTs y anclaje de recibos en blockchain.
**Implementación MOCK**: ninguna interacción con cadenas reales. Todos los
hashes (token_id, tx_hash, IPFS) se generan con `crypto.randomBytes()` para
fines de demostración y desarrollo.

## SQL — `db/R18_NFT_LOYALTY.sql`
- `nft_collections` — colecciones NFT por tenant.
  - `id, tenant_id, name, contract_address_mock, supply_total, minted_count`
- `customer_nfts` — NFTs minteados a customers.
  - `id, customer_id, collection_id, token_id, ipfs_hash_mock, minted_at`
  - UNIQUE(collection_id, token_id) para garantizar token único por colección.
- `blockchain_receipts` — recibos anclados (mock) para ventas grandes.
  - `id, sale_id, tx_hash_mock UNIQUE, ipfs_url_mock, anchored_at`

## Endpoints — `api/index.js`
| Método | Ruta | Auth | Función |
|---|---|---|---|
| POST | `/api/nft/collections` | admin/superadmin/owner | Crea colección NFT con contract_address mock |
| POST | `/api/nft/mint` | auth | Mintea NFT a customer; genera token_id + ipfs_hash + tx_hash mock; incrementa `minted_count` |
| GET | `/api/customer/nfts` | customer auth | Lista NFTs del customer autenticado |
| POST | `/api/blockchain/anchor-receipt` | auth | Anclaje automático si `amount >= BLOCKCHAIN_ANCHOR_MIN_USD` (default 100); genera IPFS hash mock |
| GET | `/api/blockchain/receipts/:id/verify` | auth | Verificación mock (sha256, mock-testnet) |

## Configuración
- ENV: `BLOCKCHAIN_ANCHOR_MIN_USD` (default `100`) — umbral para auto-anclaje.

## Lógica del anclaje
`POST /api/blockchain/anchor-receipt` se invoca tras crear una venta. Si el
monto supera el umbral, persiste un `blockchain_receipts` con tx_hash e IPFS
url simulados; si no, devuelve `{ ok:false, anchored:false, reason }` sin
escribir.

## NOTA IMPORTANTE
Esta implementación es **mock para demostración**. Una integración real
requiere:
- **Web3.js** o **ethers.js** para firmar y enviar transacciones.
- Un **RPC node** (Infura, Alchemy, QuickNode) o nodo propio.
- **Pinata / web3.storage / IPFS daemon** para pinning real de metadata.
- Un wallet con private key gestionado vía KMS / HSM.
- Smart contracts ERC-721 (NFT) y un contrato anchor-receipt
  (`storeHash(bytes32)`).
- Manejo de gas, nonces, reorgs y reintentos.
- Verificación real con `eth_getTransactionByHash` y comprobación de
  inclusión en bloque + confirmaciones.

## Estado
- SQL: creado.
- API: 5 endpoints registrados antes de `matchRoute()`.
- Pruebas en vivo: pendientes (smoke en próximo slice).
