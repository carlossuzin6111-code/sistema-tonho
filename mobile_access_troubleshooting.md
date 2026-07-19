# Diagnóstico de acesso mobile ao Docker no Windows

Este guia trata do acesso ao FitLife Sync por outro dispositivo na mesma rede.
Não interrompa processos ou abra portas públicas antes de identificar onde a
conexão está falhando.

## 1. Confirmar que os contêineres estão ativos

```powershell
docker compose ps
docker compose logs --tail 100 web app
```

O serviço `web` deve publicar `0.0.0.0:3000->3000/tcp`. Se ele estiver reiniciando,
corrija primeiro o erro mostrado nos logs.

## 2. Testar no próprio computador

```powershell
Test-NetConnection localhost -Port 3000
```

Abra também `http://localhost:3000`. Se o teste local falhar, o problema está no
Compose, no Nginx ou em um conflito de porta, não na rede Wi-Fi.

Para identificar quem usa a porta:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, State, OwningProcess
```

Não finalize o processo sem confirmar sua origem com `Get-Process -Id <PID>`.

## 3. Descobrir o endereço da rede local

```powershell
ipconfig
```

Use o IPv4 do adaptador conectado à mesma rede do celular, por exemplo
`http://192.168.1.20:3000`. Endereços de adaptadores WSL, Docker, VPN ou
`169.254.x.x` normalmente não são o endereço correto para outro dispositivo.

## 4. Verificar rede e firewall

- Computador e celular devem estar na mesma rede e sem isolamento de clientes.
- Desative temporariamente VPNs apenas para diagnóstico.
- Autorize uma regra de entrada TCP para a porta 3000 em redes privadas.
- Prefira criar uma regra específica a desativar todo o firewall.
- Algumas redes de convidados bloqueiam comunicação entre dispositivos.

Teste novamente pelo endereço IPv4. Se possível, use outro computador na mesma
rede para separar um problema do celular de um problema do host.

## 5. Acesso externo opcional

O projeto já inclui Cloudflare Tunnel. Para usá-lo, grave um token válido somente
no arquivo local `.env` e execute:

```powershell
docker compose up -d cloudflared
docker compose logs --tail 100 cloudflared
```

`TUNNEL_TOKEN` é uma credencial: não o inclua em commits, mensagens de erro ou
capturas de tela. Um túnel publica a aplicação na internet e não corrige problemas
de autorização, sessão ou validação existentes. Não exponha o MVP com dados reais
antes de concluir o hardening necessário.

## Checklist rápido

- [ ] `web` e `app` estão ativos.
- [ ] `localhost:3000` responde no host.
- [ ] A porta 3000 não está em conflito.
- [ ] Foi usado o IPv4 correto do adaptador local.
- [ ] Os dispositivos estão na mesma rede.
- [ ] O firewall permite TCP 3000 apenas no perfil necessário.
- [ ] Tokens permanecem somente no ambiente local.
