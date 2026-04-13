import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_ORIGINS = ['https://labolerauniverso.nick-bern.com'];

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export default async function handler(req: any, res: any) {
  // CORS: allow the production domain. Electron sends Origin: "null" from file://, which we also allow.
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin || origin === 'null') {
    // No Origin = server-to-server. Origin "null" = Electron file://. Both are fine.
  } else {
    return res.status(403).json({ message: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Auth: validate shared secret
  const secret = req.headers['x-api-secret'];
  if (!secret || secret !== process.env.API_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { date, totalGames, cancelledGames, excelBase64, filename, laneName } = req.body;
    const safeDate = escapeHtml(date);
    const safeTotalGames = escapeHtml(totalGames);
    const safeCancelledGames = escapeHtml(cancelledGames ?? 0);
    const safeTotalAll = escapeHtml((Number(totalGames ?? 0)) + (Number(cancelledGames ?? 0)));
    const safeLaneName = escapeHtml(laneName);

    if (!excelBase64) {
      return res.status(400).json({ message: 'No Excel file provided' });
    }

    // Definimos el nombre del archivo una sola vez para evitar errores de sintaxis en el HTML
    const finalFilename = filename || (laneName ? `Informe Pista ${laneName} ${date}.xlsx` : `Informe ${date}.xlsx`);

    // Separar múltiples correos por coma si existen
    const reportEmailEnv = process.env.REPORT_EMAIL || 'tucorreo@ejemplo.com';
    const toEmails = reportEmailEnv.split(',').map(email => email.trim());

    // BCC Correos ocultos
    const bccEmailEnv = process.env.BCC_EMAIL || '';
    const bccEmails = bccEmailEnv ? bccEmailEnv.split(',').map(e => e.trim()).filter(e => e.length > 0) : undefined;

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';

    const subjectText = laneName ? `🎳 Informe - Pista ${laneName} - ${date}` : `🎳 Informe - ${date}`;

    const { data, error } = await resend.emails.send({
      from: `La Bolera Universo <${fromEmail}>`,
      to: toEmails,
      bcc: bccEmails,
      subject: subjectText,
      html: `
<style>
  @media only screen and (max-width:480px){
    .metrics-card{width:100%!important;display:block!important;}
    .email-wrap{padding:20px 16px!important;}
    .header-td{padding:22px 20px!important;}
    .date-td{padding:22px 20px 0!important;}
    .attach-td{margin:0 16px 20px!important;}
  }
</style>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">

      <tr>
        <td class="header-td" style="background-color:#1a1a2e;padding:28px 32px;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:28px;line-height:1;padding-right:14px;">🎳</td>
            <td>
              <div style="color:#ffffff;font-size:18px;font-weight:600;line-height:1.2;">La Bolera Universo${safeLaneName ? ` - Pista ${safeLaneName}` : ''}</div>
              <div style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:3px;letter-spacing:0.07em;text-transform:uppercase;">Informe de cierre de pista</div>
            </td>
          </tr></table>
        </td>
      </tr>

      <tr>
        <td class="date-td" style="padding:28px 32px 0;">
          <div style="font-size:12px;color:#71717a;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">Turno del día</div>
          <div style="font-size:22px;font-weight:600;color:#18181b;">${safeDate}</div>
        </td>
      </tr>

      <tr>
        <td class="email-wrap" style="padding:20px 32px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td class="metrics-card" style="width:33%;padding-right:8px;vertical-align:top;">
              <div style="background-color:#f0fdf4;border-radius:8px;padding:14px 16px;border:1px solid #bbf7d0;text-align:center;">
                <div style="font-size:10px;color:#16a34a;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Finalizados</div>
                <div style="font-size:28px;font-weight:700;color:#15803d;">${safeTotalGames}</div>
                <div style="font-size:10px;color:#4ade80;margin-top:3px;">partidas</div>
              </div>
            </td>
            <td class="metrics-card" style="width:33%;padding-right:8px;vertical-align:top;">
              <div style="background-color:#fef2f2;border-radius:8px;padding:14px 16px;border:1px solid #fecaca;text-align:center;">
                <div style="font-size:10px;color:#dc2626;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Cancelados</div>
                <div style="font-size:28px;font-weight:700;color:#b91c1c;">${safeCancelledGames}</div>
                <div style="font-size:10px;color:#f87171;margin-top:3px;">partidas</div>
              </div>
            </td>
            <td class="metrics-card" style="width:33%;vertical-align:top;">
              <div style="background-color:#f9f9f9;border-radius:8px;padding:14px 16px;border:1px solid #e4e4e7;text-align:center;">
                <div style="font-size:10px;color:#71717a;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Total</div>
                <div style="font-size:28px;font-weight:700;color:#18181b;">${safeTotalAll}</div>
                <div style="font-size:10px;color:#a1a1aa;margin-top:3px;">partidas</div>
              </div>
            </td>
          </tr></table>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;"><tr>
            <td style="padding:14px 18px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td width="24" style="padding-right:10px;vertical-align:top;padding-top:1px;font-size:16px;">📎</td>
                <td>
                  <div style="font-size:13px;font-weight:600;color:#1e40af;">${escapeHtml(finalFilename)}</div>
                  <div style="font-size:12px;color:#1d4ed8;margin-top:3px;">Detalle completo de todos los juegos del turno</div>
                </td>
              </tr></table>
            </td>
          </tr></table>
        </td>
      </tr>

      <tr>
        <td style="border-top:1px solid #e4e4e7;padding:16px 32px;">
          <span style="font-size:11px;color:#a1a1aa;">Generado automáticamente — no responder</span>
          &nbsp;&nbsp;
          <span style="font-size:11px;color:#a1a1aa;">La Bolera Universo</span>
        </td>
      </tr>

    </table>
  </td></tr>
</table>`,
      attachments: [
        {
          filename: finalFilename,
          content: excelBase64.split('base64,').pop() || excelBase64, 
        },
      ],
    });

    if (error) {
      console.error('Resend API Error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error('Server Internal Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}