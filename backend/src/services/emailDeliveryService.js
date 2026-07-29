const INVITATION_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

async function sendStudentInvitation({ email, token, expiresAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false, reason: 'email_provider_not_configured' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Convite para o FitLife Sync',
      text: `Você recebeu um convite para entrar no FitLife Sync. Acesse ${INVITATION_BASE_URL}/accept-invitation?token=${encodeURIComponent(token)} antes de ${expiresAt}.`
    })
  });
  if (!response.ok) throw new Error(`Email provider rejected invitation (${response.status})`);
  return { sent: true };
}

async function sendEmailVerification({ email, token, expiresAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: 'email_provider_not_configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Confirme seu e-mail no FitLife Sync', text: `Confirme seu e-mail: ${INVITATION_BASE_URL}/verify-email?token=${encodeURIComponent(token)} (válido até ${expiresAt}).` })
  });
  if (!response.ok) throw new Error(`Email provider rejected verification (${response.status})`);
  return { sent: true };
}

module.exports = { sendStudentInvitation, sendEmailVerification };
