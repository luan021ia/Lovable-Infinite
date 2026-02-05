# Ciclo de teste de licença – Lovable Infinity

## Resposta direta

**Não.** Colocar "qualquer serial" **não** funciona. A chave precisa **existir no Firebase** antes.

O fluxo é:

1. **Criar a licença no painel admin** (ou inserir manualmente no Realtime Database).
2. **Usar exatamente essa chave** na extensão ou ao testar a API.

Se a chave não existir em `/licenses/{chave}` no Firebase, o resultado é sempre "Licença não encontrada" (ou 503/500 se o backend não estiver configurado).

---

## Como a validação funciona hoje

| Quem valida | Onde lê a licença | O que precisa |
|-------------|-------------------|----------------|
| **Extensão** (auth / popup) | Firebase direto (REST) | Chave criada no admin e salva no Firebase |
| **API** `POST /api/validateLicense` (Vercel) | Firebase via Admin SDK | Mesma chave no Firebase + `FIREBASE_SERVICE_ACCOUNT_JSON` no Vercel |

A extensão hoje usa **Firebase direto** (`getLicenseFromCloud` em `config.js`). A API na Vercel é um backend alternativo (Firebase Admin); para funcionar, precisa das variáveis de ambiente no Vercel.

---

## Ciclo de teste passo a passo

### 1. Garantir que existe pelo menos uma licença no Firebase

**Opção A – Painel admin (recomendado)**

1. Abra o **admin** (Firebase Hosting ou local).
2. Faça login (Firebase Auth com e-mail master).
3. Vá em **Licenças** e **crie uma nova licença** (ex.: chave `TESTE-001`, ativa, com data de expiração futura ou vitalícia).
4. Salve. Isso grava em `/licenses/TESTE-001` (ou o `key` que você definiu) no Realtime Database.

**Opção B – Console Firebase**

1. Acesse [Firebase Console](https://console.firebase.google.com) → seu projeto → **Realtime Database**.
2. Em **Dados**, crie o path: `licenses/TESTE-001` (ou outro `key`).
3. Preencha pelo menos: `key`, `active: true`, `expiryDate` (ISO futura) ou `lifetime: true`.

Exemplo mínimo de nó em `/licenses/TESTE-001`:

```json
{
  "key": "TESTE-001",
  "active": true,
  "lifetime": true,
  "expiryDate": "2030-12-31T23:59:59.000Z",
  "uses": 0,
  "userName": "",
  "created": "2025-02-05T12:00:00.000Z"
}
```

### 2. Testar na extensão

1. Abra a extensão → tela de login (auth).
2. Cole a chave que você criou (ex.: `TESTE-001`).
3. Clique em ativar. Deve validar e liberar (desde que o Firebase esteja configurado no `firebase-config.js` da extensão).

### 3. Testar a API (opcional)

Se quiser testar o endpoint da Vercel:

- **URL:** `POST https://lovable-infinity-api.vercel.app/api/validateLicense`
- **Headers:** `Content-Type: application/json`
- **Body:**

```json
{
  "licenseKey": "TESTE-001",
  "deviceFingerprint": "qualquer-string-32-chars"
}
```

Substitua `TESTE-001` por uma chave que **realmente exista** no Firebase. Se a API retornar 500, verifique no Vercel:

- **Settings → Environment Variables:** `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON da conta de serviço, em uma linha).
- **Logs:** Deployments → último deploy → Functions → `validateLicense` para ver o erro exato.

---

## Resumo

| Pergunta | Resposta |
|----------|----------|
| Qualquer serial funciona? | **Não.** A chave tem que existir no Firebase (`/licenses/{key}`). |
| Onde criar a licença? | No **painel admin** (Licenças → criar/salvar) ou manualmente no Realtime Database. |
| Como testar na extensão? | Usar a **mesma chave** criada no admin na tela de login da extensão. |
| Como testar a API? | POST com `licenseKey` (existente no Firebase) e `deviceFingerprint`. |
| 500 na API? | Conferir `FIREBASE_SERVICE_ACCOUNT_JSON` no Vercel e logs da função. |

Depois de criar uma licença no admin e usar essa chave, o ciclo de teste fica: **admin cria → extensão (ou API) valida com essa chave**.
