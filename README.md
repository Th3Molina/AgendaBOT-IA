# 📅 Agenda IA — Agenda Inteligente com WhatsApp

Sistema completo de agenda inteligente com:
- **App Web** (Next.js → Vercel)
- **Bot WhatsApp** (Baileys — Node.js)
- **Banco de dados** (Supabase — PostgreSQL)
- **IA** (Google Gemini 1.5 Flash — 100% gratuito)

---

## 🏗️ Arquitetura

```
┌─────────────────┐     API Routes      ┌─────────────────┐
│   App Web        │◄───────────────────►│   Supabase DB   │
│   (Next.js)      │                     │   (PostgreSQL)  │
│   Vercel         │◄───────────────────►│                 │
└─────────────────┘     Gemini API       └────────▲────────┘
                                                  │
┌─────────────────┐                              │
│  WhatsApp Bot   │◄─────────────────────────────┘
│  (Baileys)      │     Lê/escreve appointments
│  Railway/Render │
└─────────────────┘
```

---

## 🚀 Setup Passo a Passo

### 1. Clonar e instalar

```bash
git clone https://github.com/seu-usuario/agenda-ia.git
cd agenda-ia
npm install
```

---

### 2. Configurar o Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**
2. No painel, vá em **SQL Editor** → Cole o conteúdo de `supabase/schema.sql` → **Run**
3. Vá em **Settings → API** e copie:
   - `Project URL`
   - `anon public` key
   - `service_role` key

---

### 3. Configurar a API do Gemini (gratuita)

1. Acesse [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Clique em **Create API Key**
3. Copie a chave gerada

> **Limite gratuito:** 15 RPM, 1M tokens/mês — mais que suficiente!

---

### 4. Configurar variáveis de ambiente

Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

Preencha `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
GEMINI_API_KEY=AIza...
NEXT_PUBLIC_DEFAULT_USER=web-user
```

---

### 5. Rodar localmente (desenvolvimento)

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

### 6. Deploy no Vercel

#### Via GitHub (recomendado):

1. Crie um repositório no GitHub e faça push do projeto:
   ```bash
   git init
   git add .
   git commit -m "feat: agenda ia inicial"
   git remote add origin https://github.com/seu-usuario/agenda-ia.git
   git push -u origin main
   ```

2. Acesse [vercel.com](https://vercel.com) → **Add New Project**
3. Importe o repositório do GitHub
4. Em **Environment Variables**, adicione todas as variáveis do `.env.local`
5. Clique em **Deploy**

> ✅ O Vercel detecta automaticamente o Next.js e faz o build.

---

### 7. Configurar o Bot WhatsApp

O bot precisa de um servidor Node.js com **processo contínuo** (não funciona no Vercel).

#### Opções gratuitas:
- **Railway** (recomendado) — [railway.app](https://railway.app)
- **Render** — [render.com](https://render.com)
- **VPS própria** (qualquer Linux com Node 18+)

#### Deploy no Railway:

```bash
cd whatsapp-bot
cp .env.example .env
# Preencha o .env com suas chaves
```

1. Acesse [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Selecione a pasta `whatsapp-bot` (ou crie um repositório separado para o bot)
3. Adicione as variáveis de ambiente no painel do Railway:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   GEMINI_API_KEY=...
   TZ=America/Sao_Paulo
   ```
4. Deploy → veja os logs para escanear o QR Code

#### Escanear QR Code:

Nos logs do servidor, aparecerá um QR Code ASCII. Abra seu WhatsApp:
- **Android:** Menu → Aparelhos Conectados → Conectar aparelho
- **iPhone:** Ajustes → Aparelhos Conectados → Conectar aparelho

Após escanear, o bot estará online! 🟢

#### Rodar localmente (para testar):

```bash
cd whatsapp-bot
npm install
cp .env.example .env
# Preencha o .env
node index.js
```

---

## 💬 Como usar o Bot WhatsApp

Mande mensagens naturais para o número conectado:

| O que você quer | Exemplo de mensagem |
|---|---|
| Agendar compromisso | `consulta médica amanhã às 14h` |
| Ver agenda hoje | `hoje` ou `o que tenho hoje?` |
| Ver próximos | `próximos compromissos` |
| Verificar disponibilidade | `estou livre quinta à tarde?` |
| Cancelar | `cancelar consulta de amanhã` |
| Ajuda | `ajuda` |

---

## 🗂️ Estrutura do Projeto

```
agenda-ia/
├── src/
│   ├── app/
│   │   ├── layout.jsx          # Root layout
│   │   ├── page.jsx            # Página principal
│   │   ├── globals.css         # Estilos globais
│   │   └── api/
│   │       ├── appointments/
│   │       │   └── route.js    # CRUD compromissos
│   │       └── ai/
│   │           └── route.js    # Chat IA (Gemini)
│   ├── components/
│   │   └── AgendaApp.jsx       # Componente principal UI
│   └── lib/
│       ├── supabase.js         # Cliente Supabase
│       └── gemini.js           # Wrapper Gemini API
├── supabase/
│   └── schema.sql              # Schema do banco
├── whatsapp-bot/
│   ├── index.js                # Bot principal (Baileys)
│   ├── lib/
│   │   ├── supabase.js         # Cliente Supabase do bot
│   │   ├── gemini.js           # Gemini para o bot
│   │   └── agenda.js           # Operações no banco
│   ├── package.json
│   ├── .env.example
│   └── Procfile               # Para Railway/Render
├── package.json
├── next.config.mjs
├── tailwind.config.js
├── vercel.json
└── .env.example
```

---

## 🔒 Segurança

### Restringir o bot a números específicos

No `.env` do bot:
```env
ALLOWED_NUMBERS=5511999990000,5521988880000
```

### Autenticação no app web

Para múltiplos usuários, considere adicionar:
- **Supabase Auth** (email/senha ou magic link)
- **NextAuth.js** com Google OAuth

---

## 🐛 Solução de Problemas

### Bot desconecta frequentemente
- Use um servidor com IP fixo
- A sessão fica na pasta `auth_info/` — não delete!

### Gemini retorna erro 429 (rate limit)
- Você atingiu o limite gratuito (15 req/min)
- Aguarde 1 minuto ou faça upgrade para pago

### Erro de CORS nas API routes
- Configure o domínio correto no Supabase em **Auth → URL Configuration**

### QR Code aparece repetidamente
- Delete a pasta `auth_info/` e reconecte

---

## 📊 Custos

| Serviço | Plano | Custo |
|---|---|---|
| Vercel | Hobby | **Gratuito** |
| Supabase | Free tier | **Gratuito** |
| Google Gemini | Free tier | **Gratuito** |
| Railway | Starter | **~$5/mês** (bot) |
| Render | Free tier | **Gratuito** (bot dorme) |

> 💡 **Dica:** Use o Render free tier para o bot — ele dorme após inatividade mas acorda ao receber mensagem (latência de ~30s na primeira mensagem).

---

## 🤝 Contribuições

Pull requests são bem-vindos! Abra uma issue para discutir mudanças maiores.

---

**Feito com ❤️ — Agenda IA**
