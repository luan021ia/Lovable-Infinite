# Configuração do Melhorador de Prompt (Open Router)

Este guia explica como deixar o botão **"Melhorar prompt"** da extensão funcionando: deploy da API no Vercel, **uma única chave** da Open Router e URL na extensão.

**A partir de agora a única API usada é a Open Router. Não há Grok, Groq nem outras chaves.**

---

## 1. Deploy da API no Vercel

A API fica na pasta **`api/`** na raiz do projeto. O Vercel detecta essa pasta e publica cada arquivo como uma função serverless.

### 1.1. Conectar o repositório ao Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login (ou crie uma conta).
2. Clique em **Add New** → **Project**.
3. Importe o repositório do **Lovable Infinity** (GitHub/GitLab/Bitbucket).
4. Em **Root Directory**, deixe em branco (raiz do repo).
5. O Vercel vai detectar a pasta `api/` automaticamente.
6. Clique em **Deploy**.

Após o deploy, você verá uma URL do tipo:  
`https://nome-do-projeto-xxxx.vercel.app`

A rota do melhorador será:  
`https://nome-do-projeto-xxxx.vercel.app/api/improvePrompt`

---

## 2. Variável de ambiente no Vercel (única)

1. No painel do Vercel, abra o projeto.
2. Vá em **Settings** → **Environment Variables**.
3. Adicione **apenas** esta variável:

| Nome                 | Valor            | Ambiente   |
|----------------------|------------------|------------|
| `OPENROUTER_API_KEY` | sua_chave_openrouter | Production |

- Para obter a chave: [openrouter.ai/keys](https://openrouter.ai/keys) → criar/copiar chave.
- **Não use** outras variáveis (GROK, Groq, OPENROUTER_API_KEY_1, etc.). Só esta.

4. Salve e faça um **Redeploy** (Deployments → ⋮ no último deploy → Redeploy).

---

## 3. URL na extensão

1. Abra **`extension/config.js`**.
2. A linha do endpoint deve apontar para sua API no Vercel:
   ```js
   IMPROVE_PROMPT_ENDPOINT: 'https://nome-do-projeto-xxxx.vercel.app/api/improvePrompt'
   ```
3. Salve e recarregue a extensão no Chrome (`chrome://extensions` → atualizar na Lovable Infinity).

---

## 4. Testar

1. Abra o Lovable.dev em uma aba.
2. Abra o painel lateral da extensão (Lovable Infinity).
3. Digite algo no campo de mensagem (ex.: "faz um botão azul").
4. Clique no botão **Melhorar prompt** (ícone de estrela ao lado do anexo).
5. O texto deve ser substituído pela versão melhorada em tempo real.

- **"Melhorador de prompt não configurado"** → confira `IMPROVE_PROMPT_ENDPOINT` em `extension/config.js` e recarregue a extensão.
- **Erro 500 / "OPENROUTER_API_KEY não configurada"** → no Vercel, confira se a variável se chama exatamente `OPENROUTER_API_KEY` e faça Redeploy.
- **Nada acontece / não responde** → abra o DevTools (F12) na janela do popup, aba Console, e veja se há erro de rede ou CORS; confira também os logs da função no Vercel (Deployments → função → Logs).

- **Aparece erro "Groq API: ..." ou "llama-3.1-8b-instant"** → a API que está no ar no Vercel ainda é a **versão antiga** (Groq). É preciso fazer um **novo deploy** para que a versão atual (só Open Router) entre no ar: no Vercel, vá em **Deployments** → ⋮ no último deploy → **Redeploy**. Se o projeto estiver ligado ao Git, faça um commit das alterações e push; o Vercel fará o deploy automático.

---

## 5. Checklist: Melhorar prompt não funciona

Sempre que o botão "Melhorar prompt" falhar ou não retornar texto, confira nesta ordem:

1. **Chave no Vercel:** `OPENROUTER_API_KEY` (ou `OPENROUTER_API_KEY_1`) está configurada em **Settings** → **Environment Variables** do projeto.
2. **Redeploy:** Após alterar variáveis de ambiente ou código da API, faça **Redeploy** (Deployments → ⋮ no último deploy → Redeploy). Sem redeploy, as mudanças não entram no ar.
3. **Logs da função:** Em caso de erro ou "resposta vazia", abra **Deployments** → último deploy → **Logs** (ou Functions → improvePrompt → Logs) e veja a mensagem exata retornada pela Open Router.
4. **Modelo:** O código usa o modelo `tngtech/deepseek-r1t2-chimera:free`. Confira na conta [Open Router](https://openrouter.ai) se esse modelo está disponível/habilitado para sua chave.
5. **Timeout:** A função está configurada com `maxDuration: 60` em `vercel.json`. No plano **Hobby** (grátis) do Vercel o limite é **10 segundos**; se aparecer `FUNCTION_INVOCATION_TIMEOUT`, reduza `max_tokens` no backend ou use plano Pro para poder usar os 60s.
