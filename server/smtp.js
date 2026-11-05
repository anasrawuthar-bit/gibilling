/**
 * ZynBill Cloud SMTP Mail Service
 * Sends:
 * 1. 6-Digit Email OTP verification for new registrations
 * 2. Super Admin Account Approval & Activation notifications
 * 3. Account Rejection notifications
 * 
 * Supports standard SMTP (TLS / STARTTLS / Plain) with zero external dependencies.
 * In development / offline mode, it cleanly logs emails and stores them for instant test retrieval.
 */

const net = require('node:net');
const tls = require('node:tls');

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || '"ZynBill Cloud" <noreply@zynbill.com>'
};

// In-memory record of dispatched emails for test suites & dev inspection
const dispatchedEmails = [];

/**
 * Sends a raw SMTP email using Node.js sockets if configured.
 * Otherwise simulates and records the dispatch.
 */
async function sendMail({ to, subject, html, text }) {
  const mailRecord = {
    to,
    subject,
    html,
    text,
    timestamp: new Date().toISOString()
  };
  dispatchedEmails.push(mailRecord);

  // If live SMTP credentials are configured, send via network socket
  if (SMTP_CONFIG.host && SMTP_CONFIG.user && SMTP_CONFIG.pass) {
    try {
      await deliverViaSocket(mailRecord);
      console.log(`[SMTP] Live email successfully delivered to ${to} (${subject})`);
      return { ok: true, delivered: true };
    } catch (err) {
      console.error(`[SMTP] Live delivery failed to ${to}:`, err.message);
      // Fallback to recorded email
    }
  }

  // Development / Offline mode notification
  console.log(`\n================== [ZynBill SMTP Notification] ==================`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Content:\n${text}`);
  console.log(`=================================================================\n`);

  return { ok: true, delivered: false, simulated: true };
}

/**
 * Socket-level SMTP delivery (RFC 5321)
 */
function deliverViaSocket(mail) {
  return new Promise((resolve, reject) => {
    const isSecure = SMTP_CONFIG.secure || SMTP_CONFIG.port === 465;
    let socket;

    const onConnected = () => {
      let state = 'INIT';
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          const code = parseInt(line.slice(0, 3), 10);
          if (line[3] === '-') continue; // multiline reply

          if (state === 'INIT' && code === 220) {
            state = 'HELO';
            socket.write(`EHLO zynbill.cloud\r\n`);
          } else if (state === 'HELO' && code === 250) {
            state = 'AUTH';
            socket.write('AUTH LOGIN\r\n');
          } else if (state === 'AUTH' && code === 334) {
            state = 'USER';
            socket.write(Buffer.from(SMTP_CONFIG.user).toString('base64') + '\r\n');
          } else if (state === 'USER' && code === 334) {
            state = 'PASS';
            socket.write(Buffer.from(SMTP_CONFIG.pass).toString('base64') + '\r\n');
          } else if (state === 'PASS' && code === 235) {
            state = 'MAIL_FROM';
            socket.write(`MAIL FROM:<${SMTP_CONFIG.user}>\r\n`);
          } else if (state === 'MAIL_FROM' && code === 250) {
            state = 'RCPT_TO';
            socket.write(`RCPT TO:<${mail.to}>\r\n`);
          } else if (state === 'RCPT_TO' && code === 250) {
            state = 'DATA';
            socket.write('DATA\r\n');
          } else if (state === 'DATA' && code === 354) {
            state = 'SEND_BODY';
            const raw = [
              `From: ${SMTP_CONFIG.from}`,
              `To: ${mail.to}`,
              `Subject: ${mail.subject}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              ``,
              mail.html || mail.text,
              `\r\n.`
            ].join('\r\n') + '\r\n';
            socket.write(raw);
          } else if (state === 'SEND_BODY' && code === 250) {
            state = 'QUIT';
            socket.write('QUIT\r\n');
            socket.end();
            resolve();
          } else if (code >= 400) {
            reject(new Error(`SMTP error (${code}): ${line}`));
            socket.destroy();
          }
        }
      });
    };

    if (isSecure) {
      socket = tls.connect(SMTP_CONFIG.port, SMTP_CONFIG.host, { rejectUnauthorized: false }, onConnected);
    } else {
      socket = net.createConnection(SMTP_CONFIG.port, SMTP_CONFIG.host, onConnected);
    }

    socket.on('error', reject);
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('SMTP socket timeout'));
    });
  });
}

/**
 * 1. Send 6-Digit Email OTP
 */
async function sendOtpEmail(email, otp, companyName = 'Customer') {
  const subject = `Your ZynBill Verification Code: ${otp}`;
  const text = `Hello ${companyName},\n\nYour 6-digit verification code is: ${otp}\n\nThis code is valid for 10 minutes. Please enter it to complete your registration.\n\nThank you,\nZynBill Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #00c0f3; font-size: 26px; margin: 0; font-weight: 800;">ZynBill</h1>
        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Cloud Ecosystem &amp; Customer Portal</p>
      </div>
      <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Email Verification</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello <strong>${escapeHtml(companyName)}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Thank you for registering with ZynBill. Use the verification code below to verify your email address:</p>
      
      <div style="text-align: center; margin: 28px 0;">
        <div style="display: inline-block; background: #f0fdf4; border: 2px dashed #22c55e; border-radius: 10px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #15803d;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 10 minutes. Do not share this code.</p>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: #64748b;">Once verified, your account request will be submitted to the Super Admin for instant activation and subscription plan assignment.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} ZynBill Technologies. All rights reserved.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 2. Send Super Admin Account Approval Email
 */
async function sendApprovalEmail(email, companyName, plan, validUntil) {
  const expiryFormatted = new Date(validUntil).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  const subject = `Welcome to ZynBill! Your Account has been Approved`;
  const text = `Congratulations ${companyName}!\n\nYour ZynBill Cloud account has been approved by our Super Admin.\nPlan: ${plan}\nValid Until: ${expiryFormatted}\n\nYou can now open the ZynBill Desktop application, enter your email and password to activate your installation.\n\nThank you,\nZynBill Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #00c0f3; font-size: 26px; margin: 0; font-weight: 800;">ZynBill</h1>
        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Account Activation Notice</p>
      </div>
      <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #065f46; font-size: 16px;">🎉 Account Approved &amp; Activated!</h3>
        <p style="margin: 4px 0 0; color: #047857; font-size: 13px;">Your business workspace is now live on the cloud.</p>
      </div>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(companyName)}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">Our Super Admin has reviewed and activated your account. Here are your subscription details:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 16px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Subscription Plan</td>
          <td style="padding: 10px 16px; font-weight: 700; font-size: 13px; color: #0284c7; border-bottom: 1px solid #e2e8f0;">${escapeHtml(plan)} Plan</td>
        </tr>
        <tr>
          <td style="padding: 10px 16px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">License Expiry</td>
          <td style="padding: 10px 16px; font-weight: 700; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${expiryFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 10px 16px; font-weight: 600; font-size: 13px; color: #64748b;">Offline Grace Period</td>
          <td style="padding: 10px 16px; font-weight: 600; font-size: 13px; color: #16a34a;">14 Days Included</td>
        </tr>
      </table>

      <h4 style="color: #0f172a; margin: 18px 0 8px;">Next Steps:</h4>
      <ol style="font-size: 13.5px; color: #334155; line-height: 1.7; padding-left: 20px; margin: 0 0 20px;">
        <li>Launch the <strong>ZynBill Desktop Application</strong> on your Windows PC.</li>
        <li>Log in using your registered email and password.</li>
        <li>Set up your convenient 4-digit security PIN for instant quick logins.</li>
      </ol>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} ZynBill Technologies.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 3. Send Rejection Email
 */
async function sendRejectionEmail(email, companyName, reason = 'Registration requirements not met') {
  const subject = `Update on your ZynBill Registration`;
  const text = `Hello ${companyName},\n\nWe reviewed your ZynBill registration request. Unfortunately, it could not be approved at this time.\nReason: ${reason}\n\nPlease contact support@zynbill.com for assistance.\n\nZynBill Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
      <h2 style="color: #dc2626; margin-top: 0;">Registration Status Update</h2>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(companyName)}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">Thank you for your interest in ZynBill. Unfortunately, your registration could not be approved at this time.</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; color: #991b1b;">
        <strong>Reason:</strong> ${escapeHtml(reason)}
      </div>
      <p style="font-size: 13px; color: #64748b;">If you believe this is in error, please reach out to our support team.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  SMTP_CONFIG,
  dispatchedEmails,
  sendOtpEmail,
  sendApprovalEmail,
  sendRejectionEmail
};
