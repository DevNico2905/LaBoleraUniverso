import { Resend } from 'resend';

// Vercel inyectará esto desde las variables de entorno configuradas en el dashboard Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  // Solo permitimos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { date, totalRevenue, totalGames, excelBase64, filename } = req.body;

    if (!excelBase64) {
      return res.status(400).json({ message: 'No Excel file provided' });
    }

    // Separar múltiples correos por coma si existen
    const reportEmailEnv = process.env.REPORT_EMAIL || 'tucorreo@ejemplo.com';
    const toEmails = reportEmailEnv.split(',').map(email => email.trim());

    // BCC Correos ocultos
    const bccEmailEnv = process.env.BCC_EMAIL || '';
    const bccEmails = bccEmailEnv ? bccEmailEnv.split(',').map(e => e.trim()).filter(e => e.length > 0) : undefined;

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev'; // Resend por defecto para pruebas

    const { data, error } = await resend.emails.send({
      from: `La Bolera Universo | Reporte <${fromEmail}>`,
      to: toEmails,
      bcc: bccEmails,
      subject: `🎳 Cierre de Caja Bolera - ${date}`,
      html: `
        <h2>Reporte de Cierre Diario: ${date}</h2>
        <ul>
          <li><strong>Recaudación Total:</strong> $${totalRevenue}</li>
          <li><strong>Juegos Totales Finalizados:</strong> ${totalGames}</li>
        </ul>
        <p>Adjunto encontrarás el Excel detallado con todos los juegos del turno.</p>
      `,
      attachments: [
        {
          filename: filename || `Cierre_Caja_${date}.xlsx`,
          content: excelBase64.split('base64,').pop() || excelBase64, // Resaltar limpiar el prefijo en caso de que lo envíen como DataURI
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
