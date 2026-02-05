# Teste de Acesso ao WebContainer do Lovable

## Objetivo
Descobrir como acessar os arquivos do projeto Lovable através da extensão.

## Instruções de Teste

1. Abra um projeto no Lovable (https://lovable.dev)
2. Abra o DevTools (F12) > Console
3. Cole e execute cada script abaixo, um de cada vez
4. Anote os resultados

---

## Teste 1: Verificar objetos globais do WebContainer

```javascript
// Procura por WebContainer no window
console.log('=== TESTE 1: Objetos globais ===');
const possibleNames = ['webcontainer', 'WebContainer', 'wc', 'container', '__WEBCONTAINER__', '__wc__'];
possibleNames.forEach(name => {
  if (window[name]) {
    console.log(`✅ Encontrado: window.${name}`, window[name]);
  }
});

// Procura por qualquer coisa que tenha 'fs' ou 'filesystem'
Object.keys(window).forEach(key => {
  const val = window[key];
  if (val && typeof val === 'object' && (val.fs || val.fileSystem || val.mount)) {
    console.log(`✅ Possível WebContainer em window.${key}:`, val);
  }
});
```

---

## Teste 2: Verificar React DevTools / Store

```javascript
// Tenta acessar o estado do React
console.log('=== TESTE 2: React State ===');

// Busca elementos React
const reactRoot = document.getElementById('root') || document.getElementById('app');
if (reactRoot && reactRoot._reactRootContainer) {
  console.log('✅ React Root encontrado:', reactRoot._reactRootContainer);
}

// Busca por __REACT_DEVTOOLS_GLOBAL_HOOK__
if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  console.log('✅ React DevTools Hook:', window.__REACT_DEVTOOLS_GLOBAL_HOOK__);
}
```

---

## Teste 3: Interceptar requisições de arquivos

```javascript
// Monitora fetch/XHR para ver como o Lovable busca arquivos
console.log('=== TESTE 3: Monitorando requisições ===');

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const url = args[0]?.url || args[0];
  if (url && (url.includes('file') || url.includes('project') || url.includes('code') || url.includes('source'))) {
    console.log('📡 Fetch interceptado:', url, args);
  }
  return originalFetch.apply(window, args);
};
console.log('Monitoramento ativado. Navegue pelo projeto para ver requisições.');
```

---

## Teste 4: Verificar iframes (WebContainer roda em iframe)

```javascript
// WebContainers geralmente rodam em um iframe especial
console.log('=== TESTE 4: Iframes ===');

document.querySelectorAll('iframe').forEach((iframe, i) => {
  console.log(`Iframe ${i}:`, {
    src: iframe.src,
    title: iframe.title,
    className: iframe.className,
    id: iframe.id
  });
  
  // Tenta acessar o contentWindow (pode dar erro de CORS)
  try {
    if (iframe.contentWindow && iframe.contentWindow.webcontainer) {
      console.log(`✅ WebContainer no iframe ${i}!`, iframe.contentWindow.webcontainer);
    }
  } catch (e) {
    console.log(`⚠️ Iframe ${i} bloqueado por CORS`);
  }
});
```

---

## Teste 5: Verificar localStorage/sessionStorage

```javascript
// Lovable pode guardar referências ou cache de arquivos
console.log('=== TESTE 5: Storage ===');

['localStorage', 'sessionStorage'].forEach(storage => {
  const s = window[storage];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (key.includes('file') || key.includes('project') || key.includes('code') || key.includes('lovable')) {
      console.log(`${storage}.${key}:`, s.getItem(key)?.substring(0, 200) + '...');
    }
  }
});
```

---

## Teste 6: Verificar Service Workers

```javascript
// WebContainers usam Service Workers
console.log('=== TESTE 6: Service Workers ===');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach((reg, i) => {
      console.log(`SW ${i}:`, reg.scope, reg.active?.scriptURL);
    });
  });
}
```

---

## Resultados

Anote aqui o que encontrou em cada teste:

- **Teste 1:**
- **Teste 2:**
- **Teste 3:**
- **Teste 4:**
- **Teste 5:**
- **Teste 6:**

Envie esses resultados para continuar a implementação.
