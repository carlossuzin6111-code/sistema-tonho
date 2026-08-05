# Proteção obrigatória da branch main

## Bloqueio atual

Em 05/08/2026, a conta `DiogoCrespi` tentou atualizar a proteção por API e recebeu HTTP 404. A consulta autenticada de permissões retornou:

```json
{"admin":false,"maintain":false,"pull":true,"push":false,"triage":false}
```

Somente o proprietário ou um administrador do repositório `carlossuzin6111-code/sistema-tonho` pode aplicar esta política.

## Política requerida

- exigir branch atualizada antes do merge;
- exigir os checks `Backend`, `Frontend and infrastructure`, `Secret scan`, `Migration policy` e `CI policy`;
- exigir uma aprovação;
- descartar aprovação quando novos commits forem enviados;
- exigir aprovação de alguém diferente do autor do último push;
- exigir resolução de todas as conversas;
- aplicar as regras também aos administradores;
- bloquear force-push e exclusão da `main`.

## Comando para um administrador

Autentique o GitHub CLI com uma conta que tenha `admin=true` e execute no PowerShell:

```powershell
$body = @{
  required_status_checks = @{
    strict = $true
    contexts = @('Backend', 'Frontend and infrastructure', 'Secret scan', 'Migration policy', 'CI policy')
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
    require_last_push_approval = $true
  }
  restrictions = $null
  required_conversation_resolution = $true
  required_linear_history = $false
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
} | ConvertTo-Json -Depth 6 -Compress

$body | gh api --method PUT `
  repos/carlossuzin6111-code/sistema-tonho/branches/main/protection `
  --input -
```

## Verificação

```powershell
gh api repos/carlossuzin6111-code/sistema-tonho/branches/main/protection
```

O resultado deve listar os cinco checks, `strict: true`, uma aprovação obrigatória e bloqueios de force-push/exclusão.
