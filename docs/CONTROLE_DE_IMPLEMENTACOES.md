# Controle de implementações

Este documento registra o planejamento, a execução, os testes e a entrega de cada bloco de evolução. Ele deve ser atualizado em toda modificação relevante antes do commit e do pull request.

## Fluxo obrigatório

1. Confirmar o estado da `main` e delimitar um bloco pequeno.
2. Registrar diagnóstico, escopo, riscos e critérios de aceite.
3. Criar uma branch exclusiva.
4. Implementar somente o escopo registrado.
5. Executar testes, auditorias e validações proporcionais ao risco.
6. Registrar evidências, limitações e ações externas pendentes.
7. Fazer commit, push e abrir pull request.

## SEC-09 — Proteção e rotação de segredos

- Estado: implementado; PR aberto e CI em validação
- Branch: `security/sec-09-secret-hardening`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/79
- Início: 20/07/2026
- Prioridade: 10/10

### Diagnóstico

- O `.env` estava simultaneamente ignorado e rastreado pelo Git.
- A API já rejeitava `JWT_SECRET` ausente ou menor que 32 bytes.
- A CI executava testes, mas não possuía scanner de segredos.
- A remoção de segredos do histórico e a rotação dos valores utilizados são ações externas e coordenadas; não fazem parte deste PR.

### Plano aprovado

- [x] Auditar os arquivos de ambiente, inicialização e CI sem publicar valores.
- [x] Criar branch exclusiva.
- [x] Remover `.env` do índice Git, mantendo-o ignorado localmente.
- [x] Criar `.env.example` sem credenciais reais.
- [x] Rejeitar placeholders e segredos previsíveis em produção.
- [x] Adicionar Gitleaks à CI para examinar o conteúdo atual do repositório.
- [x] Adicionar ou atualizar testes automatizados.
- [x] Executar testes e auditorias locais.
- [x] Abrir PR.
- [ ] Acompanhar e registrar o resultado final da CI.

### Critérios de aceite

- `.env` não aparece em `git ls-files`.
- `.env.example` documenta apenas valores seguros ou placeholders explícitos.
- Produção falha antes de iniciar quando o JWT usa placeholder conhecido ou valor previsível.
- A CI falha ao detectar novo segredo no conteúdo versionado.
- Testes do frontend e backend continuam aprovados.

### Evidências

- Frontend: 50/50 testes aprovados.
- Backend: 109/109 testes aprovados após adicionar dois cenários de configuração insegura.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- Gitleaks 8.30.1 no conteúdo preparado para commit: nenhuma ocorrência.
- Imagem da CI fixada por tag e digest SHA-256 imutável.
- O `.env` local foi preservado, mas deixou de fazer parte do índice Git.

### Pendências externas

- Rotacionar `JWT_SECRET` e `TUNNEL_TOKEN` caso algum valor versionado tenha sido utilizado.
- Avaliar, em manutenção separada e coordenada, a limpeza do histórico Git.
