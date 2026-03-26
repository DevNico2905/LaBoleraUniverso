import { Resend } from 'resend';

// Vercel inyectará esto desde las variables de entorno configuradas en el dashboard Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  // Solo permitimos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { date, totalGames, excelBase64, filename } = req.body;

    if (!excelBase64) {
      return res.status(400).json({ message: 'No Excel file provided' });
    }

    // Definimos el nombre del archivo una sola vez para evitar errores de sintaxis en el HTML
    const finalFilename = filename || `Cierre_Caja_${date}.xlsx`;

    // Separar múltiples correos por coma si existen
    const reportEmailEnv = process.env.REPORT_EMAIL || 'tucorreo@ejemplo.com';
    const toEmails = reportEmailEnv.split(',').map(email => email.trim());

    // BCC Correos ocultos
    const bccEmailEnv = process.env.BCC_EMAIL || '';
    const bccEmails = bccEmailEnv ? bccEmailEnv.split(',').map(e => e.trim()).filter(e => e.length > 0) : undefined;

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';

    const { data, error } = await resend.emails.send({
      from: `La Bolera Universo <${fromEmail}>`,
      to: toEmails,
      bcc: bccEmails,
      subject: `🎳 Cierre de Caja Bolera - ${date}`,
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
              <div style="color:#ffffff;font-size:18px;font-weight:600;line-height:1.2;">La Bolera Universo</div>
              <div style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:3px;letter-spacing:0.07em;text-transform:uppercase;">Reporte de cierre de caja</div>
            </td>
          </tr></table>
        </td>
      </tr>

      <tr>
        <td class="date-td" style="padding:28px 32px 0;">
          <div style="font-size:12px;color:#71717a;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">Turno del día</div>
          <div style="font-size:22px;font-weight:600;color:#18181b;">${date}</div>
        </td>
      </tr>

      <tr>
        <td class="email-wrap" style="padding:20px 32px 24px;">
          <div style="background-color:#f9f9f9;border-radius:8px;padding:16px 20px;border:1px solid #e4e4e7;">
            <div style="font-size:11px;color:#71717a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em;">Juegos finalizados</div>
            <div style="font-size:26px;font-weight:700;color:#18181b;">${totalGames}</div>
            <div style="font-size:11px;color:#71717a;margin-top:4px;">partidas completadas</div>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;"><tr>
            <td style="padding:14px 18px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td width="24" style="padding-right:10px;vertical-align:top;padding-top:1px;font-size:16px;">📎</td>
                <td>
                  <div style="font-size:13px;font-weight:600;color:#1e40af;">${finalFilename}</div>
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