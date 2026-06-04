# Solução de Problemas: Acesso Mobile ao Docker (Windows)

Ao analisar o ambiente com a skill `@error-handling-patterns`, identificamos o motivo de o celular não conseguir acessar o sistema pelo IP local, mesmo com o firewall desligado.

## O Problema Encontrado
1. **Conflito de Portas**: Existem múltiplos processos tentando usar a porta `3000` ao mesmo tempo (o `node index.js` que está rodando no seu terminal e o container Docker).
2. **Isolamento de Rede do WSL2/Docker**: No Windows, o Docker geralmente roda sobre o WSL2. O WSL2 cria uma rede virtualizada que, por padrão, **não roteia** tráfego externo (do seu celular na rede Wi-Fi) diretamente para o container sem configurações complexas de *portproxy* no Windows.

## Passos para Resolver (O que a IA vai fazer agora)
Para contornar o isolamento de rede do Windows e o conflito de portas de forma definitiva e rápida:

1. **Passo 1: Eliminar os processos conflitantes**. Vou forçar a parada de qualquer processo extra que esteja segurando a porta 3000 (deixando apenas o Docker que já está no ar).
2. **Passo 2: Usar o padrão de Error-Handling "Tunneling"**. Como o roteamento local do Windows + Docker + Celular é instável, a melhor prática de desenvolvimento é criar um túnel seguro temporário usando a ferramenta `localtunnel` (ou `ngrok`). Isso ignora completamente problemas de firewall e roteador.
3. **Passo 3: Expor a URL**. Executarei o comando `npx localtunnel --port 3000`. Ele me devolverá um link público seguro (ex: `https://xxx.loca.lt`).
4. **Passo 4: Teste final**. Você usará esse link no seu celular, e ele redirecionará magicamente para o seu Docker local.
