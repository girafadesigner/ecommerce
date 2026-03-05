# Girafa Designer E-commerce

Projeto completo de e-commerce com:

- Frontend: HTML, CSS, JavaScript puro
- Backend: Node.js + Express
- Banco: SQLite com persistencia real
- Admin: login, categorias, CRUD de produtos, upload de imagem
- Clientes: cadastro/login com email e telefone
- Recuperacao de senha por codigo (cliente e admin)
- Loja: busca, filtros, categorias, carrinho funcional
- Pagamento: estrutura mock para PIX, Mercado Pago e Stripe
- Checkout via WhatsApp para atendimento humano (PIX ou link de pagamento)

## Como rodar

```bash
npm install
npm start
```

## Producao (checklist minimo)

1. Copie `.env.example` para `.env` e preencha valores fortes.
2. Defina `NODE_ENV=production`.
3. Defina obrigatoriamente: `JWT_SECRET`, `DB_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
4. Defina `CORS_ORIGIN` com o(s) dominio(s) real(is) do frontend (separados por virgula quando houver mais de um).
5. Nao use `ENABLE_MOCK_NOTIFICATIONS=true` em producao.
6. Defina `ADMIN_SEED_USERNAME` e `ADMIN_SEED_PASSWORD` para o primeiro bootstrap seguro.
7. (Opcional) Ajuste limites: `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` e `MAX_UPLOAD_FILE_SIZE`.

## SQLCipher (senha no arquivo .db)

Para proteger o `database/girafa.db` com senha:

```bash
npm i @journeyapps/sqlcipher
```

Depois defina no `.env`:

```bash
DB_KEY=sua_senha_forte_aqui
```

Se `DB_KEY` estiver definida e o SQLCipher nao estiver instalado, o backend agora falha na inicializacao para evitar banco sem criptografia.

Acesse:

- Loja: `http://localhost:3000/`
- Carrinho: `http://localhost:3000/cart`
- Admin login: `http://localhost:3000/admin`
- Admin painel: `http://localhost:3000/admin/panel`
- Conta do cliente: `http://localhost:3000/account`

Credenciais iniciais do admin:

- Usuario: `ADMIN_SEED_USERNAME` (ou `admin@girafa.com` no ambiente local)
- Senha: `ADMIN_SEED_PASSWORD` (ou `123456` apenas no ambiente local)

Atalho oculto para equipe interna abrir login admin:

- `Ctrl + Shift + A`

## Recuperacao de senha

Fluxo no frontend:

- Solicitar codigo de recuperacao (expira em 15 minutos)
- Informar codigo + nova senha
- Canal de envio: email

Rotas disponiveis:

- `POST /api/customers/forgot-password`
- `POST /api/customers/reset-password`
- `POST /api/admin/forgot-password`
- `POST /api/admin/reset-password`

Configuracao de envio:

- Email (SMTP): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Somente para ambiente de teste local:

- `ENABLE_MOCK_NOTIFICATIONS=true` (simula envio sem provedor externo)

## Configurar WhatsApp de atendimento

Defina a variavel de ambiente `WHATSAPP_NUMBER` com DDI e DDD (somente numeros).

Exemplo:

```bash
set WHATSAPP_NUMBER=5511999999999
npm start
```

Padrao atual do projeto: `5521977461002`.

No painel admin, todo pedido entra como `Pendente WhatsApp` e pode ser atualizado para:

- `Pagamento confirmado`
- `Compra desistida`

## Estrutura

```text
girafa-designer/
  frontend/
  backend/
  database/
  assets/
```
