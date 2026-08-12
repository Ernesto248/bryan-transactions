# Guía de Integración para n8n

Para guardar las transacciones desde n8n en tu base de datos Neon, lo recomendado es usar un nodo **HTTP Request** que llame a tu app (Next.js) y que el backend inserte en la base de datos.

## Opción Recomendada: Endpoint HTTP

### Endpoint

- Método: `POST`
- URL: `https://TU-DOMINIO/api/transactions`
- Auth: Header `Authorization: Bearer <N8N_INGEST_API_KEY>`

### Body (JSON)

Campos requeridos:

- `bankName`
- `accountName`
- `amount`
- `confirmationCode`

Campos opcionales:

- `senderName`
- `currency`
- `occurredAt`
- `postedAt`

Ejemplo:

```json
{
  "bankName": "Wells Fargo",
  "accountName": "Martinez Global Company",
  "senderName": "John Doe",
  "amount": 150,
  "currency": "USD",
  "confirmationCode": "WF-123456",
  "occurredAt": "2026-02-05T12:00:00Z"
}
```

### Respuesta esperada

- `200` si se guardó correctamente
- `409` si ya existe una transacción con el mismo `bankName` + `confirmationCode`

Ejemplo (200):

```json
{ "ok": true, "inserted": true, "id": "..." }
```

Ejemplo (409):

```json
{ "ok": false, "error": "duplicate_transaction" }
```

### Workflow listo para importar

En este repo tienes un workflow de ejemplo para n8n (Manual Trigger → Set → HTTP Request) listo para importar:

- Archivo: `n8n/workflows/dashboard-transactions-ingest-demo.json`

Para que funcione sin tocar el JSON, define estas variables de entorno en tu instancia de n8n:

- `DASHBOARD_BASE_URL` (ej: `https://TU-DOMINIO` o `http://localhost:3000`)
- `N8N_INGEST_API_KEY` (el mismo valor que configuras en tu app)

## Opción Alternativa: SQL Directo

Si prefieres que n8n escriba directamente en Postgres, usa el nodo de **Postgres**.

## SQL Query

Esta query asume que recibes los siguientes campos del email:

- `$json.bankName` (ej: "Wells Fargo")
- `$json.accountName` (ej: "Martinez Global Company")
- `$json.senderName` (ej: "John Doe")
- `$json.amount` (ej: 150.00)
- `$json.confirmationCode` (ej: "WF-123456")
- `$json.timestamp` (ej: "2026-02-05T12:00:00Z")

```sql
WITH
  -- 1. Buscar ID del Banco
  bank_lookup AS (
    SELECT id FROM banks WHERE name = $1 -- $json.bankName
  ),
  -- 2. Buscar ID de la Cuenta Gmail
  email_lookup AS (
    SELECT id FROM gmail_accounts WHERE account_name = $2 -- $json.accountName
  )
INSERT INTO transactions (
  bank_id,
  gmail_account_id,
  actor_name,
  amount,
  confirmation_code,
  occurred_at
)
VALUES (
  (SELECT id FROM bank_lookup),
  (SELECT id FROM email_lookup),
  $3, -- $json.senderName
  $4, -- $json.amount
  $5, -- $json.confirmationCode
  $6  -- $json.timestamp
)
ON CONFLICT (bank_id, confirmation_code) DO NOTHING;
```

## Notas

- Asegúrate de que los nombres de los bancos en n8n coincidan exactamente con los de la base de datos ("Wells Fargo", "Bank of America").
- Si llega un email de una cuenta nueva, deberás insertarla primero en `gmail_accounts` o manejarlo en el flujo.
