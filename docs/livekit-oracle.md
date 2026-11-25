# LiveKit próprio na Oracle Cloud (grátis)

Este guia põe o servidor do LiveKit numa máquina do plano **Always Free** da
Oracle Cloud. O plano inclui **10 TB por mês** de tráfego de saída, contra os
50 GB do plano gratuito do LiveKit Cloud.

**O app não muda.** O servidor é o mesmo programa open source que roda no
LiveKit Cloud, e o app recebe o endereço do LiveKit junto com o token do site
(`/api/token`). Para trocar, basta mudar `LIVEKIT_URL`, `LIVEKIT_API_KEY` e
`LIVEKIT_API_SECRET` na Vercel. Quem já tem o app instalado passa a usar o
servidor novo na próxima vez que entrar numa sala.

O que vai rodar na máquina:

- **LiveKit** (`livekit/livekit-server`), para voz, vídeo, telas, chat e a
  sincronia da música;
- **Caddy**, que cuida do HTTPS: tira o certificado da Let's Encrypt sozinho e
  repassa a conexão `wss://` para o LiveKit.

Tempo estimado: 40 minutos a 1 hora.

---

## 0. Antes de começar: um domínio

O app conecta por `wss://`, que exige HTTPS, e o HTTPS exige um nome de
domínio. Escolha uma destas opções:

- **Você já tem um domínio** (por exemplo, o do site na Vercel): crie um
  subdomínio, como `livekit.seudominio.com`. O registro DNS será criado no
  passo 3.
- **Não tem**: crie um subdomínio grátis no [DuckDNS](https://www.duckdns.org).
  Entre com uma conta Google ou GitHub e crie um nome como
  `share-livekit.duckdns.org`. O IP será preenchido no passo 3.

Neste guia, `livekit.seudominio.com` representa o nome escolhido.

---

## 1. Criar a conta na Oracle Cloud

1. Acesse <https://www.oracle.com/cloud/free/> e clique em **Start for free**.
2. **Home Region:** escolha **Brazil East (São Paulo)** ou **Brazil Southeast
   (Vinhedo)**. ⚠️ Não dá para mudar depois, e os recursos gratuitos só existem
   nessa região.
3. A Oracle pede um cartão só para verificar a identidade. Ela não cobra
   enquanto você usar apenas recursos Always Free.

### Recomendado: passar a conta para "Pay As You Go"

Em **Billing & Cost Management → Upgrade and Manage Payment**, mude a conta
para **Pay As You Go**. Os recursos Always Free continuam de graça, e você
evita dois problemas das contas gratuitas:

- **Máquina recolhida por inatividade.** A Oracle pode desligar instâncias
  gratuitas que passam 7 dias com pouco uso de CPU, rede e memória. Um servidor
  de chamadas fica ocioso boa parte do tempo, então isso pode acontecer.
- **"Out of capacity".** Nas contas gratuitas, muitas vezes falta máquina ARM
  disponível para criar.

Depois do upgrade, crie um alerta de gasto: **Billing → Budgets → Create
Budget**, com valor de US$ 1 e alerta em 100%. Se algo pago for criado por
engano, você recebe um e-mail.

---

## 2. Criar a máquina

No console, abra **Compute → Instances → Create instance** e preencha:

| Campo | Valor |
|---|---|
| Name | `share-livekit` |
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Change shape → Ampere → VM.Standard.A1.Flex**, com **2 OCPUs e 12 GB** de memória. O gratuito vai até 4 OCPUs e 24 GB; 2 sobram para o uso atual. |
| Networking | **Create new virtual cloud network** e **Create new public subnet**, com **Assign a public IPv4 address** marcado |
| Add SSH keys | **Generate a key pair for me** e depois **Save private key**. Guarde o arquivo `.key`. |
| Boot volume | deixe o padrão |

Clique em **Create**. Quando a instância ficar **Running**, copie o **Public
IP address**. Ele continua o mesmo quando a máquina reinicia e só muda se você
apagar a instância.

> Se aparecer **"Out of capacity for shape VM.Standard.A1.Flex"**, acabaram as
> máquinas ARM livres naquele datacenter. São Paulo e Vinhedo têm só um
> *Availability Domain*, então trocar de AD não é uma opção. Tente nesta ordem:
>
> 1. Faça o upgrade para **Pay As You Go** (passo 1). Essas contas têm
>    prioridade, e é o que mais resolve.
> 2. Peça uma máquina menor, com **1 OCPU e 6 GB**. Dá para aumentar depois em
>    **Edit → Shape**, com a máquina parada.
> 3. Não escolha *fault domain*; deixe no automático.
> 4. Tente de novo mais tarde. De madrugada costuma ser mais fácil.

---

## 3. Apontar o domínio para a máquina

- **Domínio próprio:** no painel de DNS do domínio, crie um registro **A**
  com nome `livekit` e valor igual ao IP público da máquina.
- **DuckDNS:** cole o IP no campo *current ip* do subdomínio e clique em
  **update ip**.

Para conferir, rode no PowerShell (pode levar alguns minutos para propagar):

```powershell
Resolve-DnsName livekit.seudominio.com
```

---

## 4. Liberar as portas na Oracle (Security List)

A rede da Oracle bloqueia tudo, exceto SSH, por padrão.

Na página da máquina, abra a aba **Networking** e clique no link da
**subnet**. Na subnet, vá em **Security → Default Security List for vcn-… →
Security rules → Add Ingress Rules**. Se não achar, busque **Security lists**
na barra do topo do console.

Adicione as quatro regras abaixo, todas com **Source CIDR** `0.0.0.0/0`. Dá
para adicionar todas de uma vez com **+ Another Ingress Rule**.

| IP Protocol | Destination Port Range | Para quê |
|---|---|---|
| TCP | `80` | Let's Encrypt (emissão do certificado) |
| TCP | `443` | HTTPS / `wss://` (entrada no app e API de salas) |
| TCP | `7881` | mídia por TCP, para redes que bloqueiam UDP |
| UDP | `50000-60000` | mídia: voz, vídeo e telas |

---

## 5. Entrar na máquina por SSH

No PowerShell do Windows, ajuste a permissão da chave baixada uma única vez.
O SSH recusa chaves que outros usuários conseguem ler.

```powershell
$key = "$HOME\Downloads\ssh-key-AAAA-MM-DD.key"   # o arquivo que você baixou
icacls $key /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i $key ubuntu@IP_PUBLICO
```

Os comandos dos próximos passos rodam **dentro da máquina**, nessa sessão SSH.

---

## 6. Abrir as portas no firewall do Ubuntu

A imagem Ubuntu da Oracle tem um firewall próprio (iptables) que também
bloqueia tudo, exceto SSH. Liberar só a Security List não basta: esse é o
erro mais comum.

```bash
sudo iptables -I INPUT 5 -p tcp -m multiport --dports 80,443,7881 -j ACCEPT
sudo iptables -I INPUT 5 -p udp --dport 50000:60000 -j ACCEPT
sudo netfilter-persistent save
```

---

## 7. Instalar o Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
```

---

## 8. Configurar o LiveKit e o Caddy

Gere a chave e o segredo da API:

```bash
sudo docker run --rm livekit/livekit-server generate-keys
```

O comando mostra algo como `API Key: APIxxxxxxxxxxxx` e
`API Secret: yyyyyyyy…`. Guarde os dois, porque eles vão para a Vercel no
passo 10.

Preencha as três variáveis abaixo e cole o bloco inteiro no terminal. Ele cria
os arquivos em `/opt/livekit`.

```bash
DOMAIN=livekit.seudominio.com
KEY=APIxxxxxxxxxxxx
SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

sudo mkdir -p /opt/livekit && cd /opt/livekit

sudo tee livekit.yaml > /dev/null <<EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  $KEY: $SECRET
logging:
  level: info
EOF

sudo tee Caddyfile > /dev/null <<EOF
$DOMAIN {
  reverse_proxy localhost:7880
}
EOF

sudo tee docker-compose.yaml > /dev/null <<'EOF'
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
  caddy:
    image: caddy:2
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
volumes:
  caddy_data:
EOF

sudo chmod 600 livekit.yaml
```

Por que essa configuração:

- **`use_external_ip: true`** faz o LiveKit descobrir o IP público sozinho. A
  máquina da Oracle só enxerga o IP privado, e sem isso a mídia não conecta.
- A porta **7880** não é aberta para fora. Só o Caddy (porta 443) fala com ela.

---

## 9. Subir e testar

```bash
cd /opt/livekit
sudo docker compose up -d
sudo docker compose logs -f caddy   # espere por "certificate obtained successfully"; Ctrl+C para sair
```

Depois, no seu PC:

```powershell
curl.exe https://livekit.seudominio.com
```

A resposta tem que ser **`OK`**. Os contêineres voltam sozinhos quando a
máquina reinicia (`restart: unless-stopped`).

---

## 10. Trocar o app para o servidor novo

1. **Teste local primeiro.** Em `apps/web/.env.local`, troque:

   ```
   LIVEKIT_URL=wss://livekit.seudominio.com
   LIVEKIT_API_KEY=APIxxxxxxxxxxxx
   LIVEKIT_API_SECRET=yyyy…
   ```

   Reinicie o `npm run dev:web`, abra os dois apps de teste e entre numa sala.
   Guarde as credenciais antigas do LiveKit Cloud, caso precise voltar.
2. **Produção.** Na Vercel, em **Project → Settings → Environment Variables**,
   troque as mesmas três variáveis e faça **Redeploy**.

Para voltar ao LiveKit Cloud, ponha os valores antigos de volta e faça
Redeploy.

---

## Manutenção

**Atualizar o LiveKit e o Caddy:**

```bash
cd /opt/livekit && sudo docker compose pull && sudo docker compose up -d
```

**Ver os logs:**

```bash
cd /opt/livekit && sudo docker compose logs --tail 100 livekit
```

**Acompanhar o tráfego:** no console da Oracle, em **Billing → Cost
Analysis**. Com 10 TB por mês, sobra muito.

## Quando algo não funciona

| Sintoma | Causa provável |
|---|---|
| `curl https://…` não responde ou dá erro de certificado | DNS ainda não aponta para a máquina, ou as portas 80/443 estão fechadas na Security List (passo 4) ou no iptables (passo 6). Veja `docker compose logs caddy`. |
| Entra na sala, mas ninguém se ouve ou se vê | A faixa UDP `50000-60000` ou a porta TCP `7881` está fechada em um dos dois firewalls. |
| "could not establish signal connection" no app | `LIVEKIT_URL` errado (tem que começar com `wss://`), ou a chave e o segredo na Vercel não batem com o `livekit.yaml`. |
| A instância sumiu ou foi parada | Recolhida por inatividade (passo 1: faça o upgrade para Pay As You Go). |

> Opcional, para redes muito restritas (empresas, algumas faculdades): o
> LiveKit pode rodar um servidor TURN em TLS na porta 443, com um segundo
> subdomínio. Com UDP mais TCP 7881, isso raramente é necessário entre amigos.
