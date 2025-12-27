# Guia de Autenticação - Frontend

Este documento explica como integrar o frontend com o sistema de autenticação do backend LHG Analytics.

## Visão Geral

O sistema usa **JWT com Refresh Token** armazenados em **cookies httpOnly**. Isso significa que:

- Os tokens são gerenciados automaticamente pelo navegador (cookies)
- O frontend **NÃO** tem acesso direto aos tokens (segurança contra XSS)
- O frontend só precisa fazer as requisições - os cookies são enviados automaticamente

---

## Endpoints Disponíveis

| Método | Endpoint | Autenticação | Descrição |
|--------|----------|--------------|-----------|
| POST | `/api/auth/login` | Não | Fazer login |
| POST | `/api/auth/refresh` | Não | Renovar tokens |
| POST | `/api/auth/logout` | Não | Fazer logout |
| GET | `/api/auth/me` | Sim | Obter usuário logado |

---

## 1. Login

**Endpoint:** `POST /api/auth/login`

**Request:**
```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // IMPORTANTE: envia/recebe cookies
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    password: 'senha123',
  }),
});

const data = await response.json();
```

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "unit": "LUSH_IPIRANGA",
    "role": "GERENTE_GERAL"
  },
  "message": "Login realizado com sucesso"
}
```

**Response (401 Unauthorized):**
```json
{
  "message": "Email ou senha incorretos"
}
```

**O que acontece por trás:**
- O backend define 2 cookies httpOnly:
  - `access_token` (expira em 1 hora)
  - `refresh_token` (expira em 7 dias)

---

## 2. Obter Usuário Logado

**Endpoint:** `GET /api/auth/me`

**Request:**
```typescript
const response = await fetch('/api/auth/me', {
  method: 'GET',
  credentials: 'include', // IMPORTANTE: envia cookies
});

if (response.ok) {
  const user = await response.json();
  console.log('Usuário logado:', user);
} else {
  // Não está autenticado
  console.log('Usuário não autenticado');
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "email": "joao@exemplo.com",
  "name": "João Silva",
  "unit": "LUSH_IPIRANGA",
  "role": "GERENTE_GERAL"
}
```

**Response (401 Unauthorized):**
```json
{
  "message": "Unauthorized"
}
```

---

## 3. Refresh Token (Renovar Sessão)

**Endpoint:** `POST /api/auth/refresh`

Este endpoint é chamado quando o `access_token` expira (após 1 hora).

**Request:**
```typescript
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
});

if (response.ok) {
  const data = await response.json();
  console.log('Tokens renovados:', data.user);
} else {
  // Refresh token expirou - redirecionar para login
  window.location.href = '/login';
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "email": "joao@exemplo.com",
    "name": "João Silva",
    "unit": "LUSH_IPIRANGA",
    "role": "GERENTE_GERAL"
  },
  "message": "Tokens renovados com sucesso"
}
```

**Response (401 Unauthorized):**
```json
{
  "message": "Sessão expirada. Faça login novamente."
}
```

---

## 4. Logout

**Endpoint:** `POST /api/auth/logout`

**Request:**
```typescript
const response = await fetch('/api/auth/logout', {
  method: 'POST',
  credentials: 'include',
});

const data = await response.json();
// Redirecionar para página de login
window.location.href = '/login';
```

**Response (200 OK):**
```json
{
  "message": "Logout realizado com sucesso"
}
```

---

## Implementação Recomendada

### Configuração do Axios (Recomendado)

```typescript
// src/lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // IMPORTANTE: sempre enviar cookies
});

// Interceptor para renovar token automaticamente
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Se recebeu 401 e não é uma tentativa de retry
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Se já está fazendo refresh, adiciona na fila
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Tenta renovar os tokens
        await api.post('/auth/refresh');
        processQueue(null);

        // Refaz a requisição original
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error);

        // Refresh falhou - redireciona para login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### Uso do API Client

```typescript
// Exemplo de uso em qualquer componente/página
import api from '@/lib/api';

// Login
async function handleLogin(email: string, password: string) {
  try {
    const { data } = await api.post('/auth/login', { email, password });
    console.log('Usuário logado:', data.user);
    // Redirecionar para dashboard
  } catch (error) {
    console.error('Erro no login:', error);
  }
}

// Buscar dados protegidos
async function fetchDashboardData() {
  try {
    const { data } = await api.get('/ipiranga/api/Company/kpis/date-range', {
      params: { startDate: '2024-01-01', endDate: '2024-12-31' }
    });
    return data;
  } catch (error) {
    // Se for 401 e refresh falhar, o interceptor redireciona para login
    console.error('Erro ao buscar dados:', error);
  }
}

// Logout
async function handleLogout() {
  try {
    await api.post('/auth/logout');
    window.location.href = '/login';
  } catch (error) {
    // Mesmo com erro, redireciona
    window.location.href = '/login';
  }
}
```

### Context de Autenticação (React)

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '@/lib/api';

interface User {
  id: number;
  name: string;
  email: string;
  unit: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### Uso do Context

```typescript
// src/app/layout.tsx (Next.js)
import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

// src/app/dashboard/page.tsx
'use client';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) return <div>Carregando...</div>;
  if (!user) return <div>Não autenticado</div>;

  return (
    <div>
      <h1>Bem-vindo, {user.name}!</h1>
      <p>Unidade: {user.unit}</p>
      <p>Cargo: {user.role}</p>
      <button onClick={logout}>Sair</button>
    </div>
  );
}
```

---

## Fluxo de Autenticação

```
┌─────────────────────────────────────────────────────────────────┐
│                         FLUXO NORMAL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuário acessa /login                                       │
│           ↓                                                     │
│  2. Envia email/senha para POST /api/auth/login                 │
│           ↓                                                     │
│  3. Backend retorna user + define cookies (httpOnly)            │
│           ↓                                                     │
│  4. Frontend armazena user no state/context                     │
│           ↓                                                     │
│  5. Usuário navega pelo sistema                                 │
│           ↓                                                     │
│  6. Cada requisição envia cookies automaticamente               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    RENOVAÇÃO AUTOMÁTICA                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Access token expira (após 1h)                               │
│           ↓                                                     │
│  2. Próxima requisição retorna 401                              │
│           ↓                                                     │
│  3. Interceptor detecta 401                                     │
│           ↓                                                     │
│  4. Interceptor chama POST /api/auth/refresh                    │
│           ↓                                                     │
│  ┌───────────────────┬───────────────────────────┐              │
│  │  Refresh OK       │  Refresh Falhou           │              │
│  │       ↓           │         ↓                 │              │
│  │  Novos cookies    │  Redireciona para /login  │              │
│  │  definidos        │                           │              │
│  │       ↓           │                           │              │
│  │  Refaz requisição │                           │              │
│  │  original         │                           │              │
│  └───────────────────┴───────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Roles e Unidades

### Roles Disponíveis
- `ADMIN` - Acesso total
- `GERENTE_GERAL` - Gerente geral da unidade
- `GERENTE_FINANCEIRO` - Acesso a dados financeiros
- `GERENTE_RESERVAS` - Acesso a reservas
- `GERENTE_RESTAURANTE` - Acesso a dados do restaurante
- `GERENTE_OPERACIONAL` - Acesso operacional

### Unidades Disponíveis
- `LUSH_LAPA`
- `LUSH_IPIRANGA`
- `TOUT`
- `ANDAR_DE_CIMA`
- `LHG` - Acesso a todas as unidades

---

## Dicas Importantes

1. **Sempre use `credentials: 'include'`** (fetch) ou **`withCredentials: true`** (axios)
   - Sem isso, os cookies não são enviados/recebidos

2. **Não tente acessar os tokens diretamente**
   - Eles estão em cookies httpOnly (inacessíveis via JavaScript)
   - Isso é uma feature de segurança, não um bug

3. **Implemente o interceptor de refresh**
   - Evita que o usuário seja deslogado inesperadamente após 1h
   - O refresh token dura 7 dias

4. **Verifique autenticação no carregamento**
   - Use `GET /api/auth/me` para verificar se há sessão válida

5. **Trate erros de rede**
   - Se o servidor estiver offline, não tente fazer refresh infinitamente

---

## Exemplo Completo: Página de Login

```typescript
// src/app/login/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Login</h1>

      {error && <div className="error">{error}</div>}

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Senha"
        required
      />

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
```

---

## Suporte

Se tiver dúvidas sobre a implementação, verifique:
1. Se `credentials: 'include'` está configurado
2. Se o interceptor de refresh está funcionando
3. Os logs do console para erros de rede
