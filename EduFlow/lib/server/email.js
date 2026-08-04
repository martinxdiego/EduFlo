import { Resend } from 'resend'

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function isTransactionalEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function sendPasswordResetEmail({ to, name, resetUrl, idempotencyKey }) {
  if (!isTransactionalEmailConfigured()) {
    throw new Error('Transactional email is not configured')
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const safeName = escapeHtml(name || 'Lehrperson')
  const safeUrl = escapeHtml(resetUrl)
  const { error } = await resend.emails.send(
    {
      from: process.env.EMAIL_FROM,
      to,
      subject: 'EduFlow Passwort zurücksetzen',
      text: `Hallo ${name || 'Lehrperson'},\n\nsetzen Sie Ihr EduFlow-Passwort über diesen Link zurück:\n${resetUrl}\n\nDer Link ist 60 Minuten gültig. Falls Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht.`,
      html: `
        <div style="background:#f8fafc;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:560px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:32px">
            <p style="margin:0 0 8px;color:#2563eb;font-weight:700">EduFlow</p>
            <h1 style="font-size:24px;margin:0 0 16px">Passwort zurücksetzen</h1>
            <p style="line-height:1.6">Hallo ${safeName},</p>
            <p style="line-height:1.6">über die folgende Schaltfläche können Sie ein neues Passwort für Ihr EduFlow-Konto festlegen.</p>
            <p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Neues Passwort festlegen</a></p>
            <p style="font-size:13px;line-height:1.6;color:#64748b">Der Link ist 60 Minuten gültig und kann nur einmal verwendet werden. Falls Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht.</p>
          </div>
        </div>`,
    },
    { idempotencyKey },
  )

  if (error) throw new Error(`Password reset email failed: ${error.message}`)
}
