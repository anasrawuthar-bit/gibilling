/**
 * ZynBill Cloud SMTP Mail Service
 * Sends:
 * 1. 6-Digit Email OTP verification for new registrations
 * 2. One-Time Verification Code for First PC Login (Device Binding)
 * 3. Password Reset OTP
 * 4. PIN Reset OTP
 * 5. Super Admin Account Approval & Activation notifications
 * 6. Account Rejection notifications
 * 
 * Supports dynamic Super Admin SMTP settings stored in master.sqlite,
 * with standard SMTP (TLS / STARTTLS / Plain) and zero external dependencies.
 */

const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

// In-memory record of dispatched emails for test suites & dev inspection
const dispatchedEmails = [];

/**
 * Returns active SMTP configuration from master database system_settings
 * with environment variables fallback.
 */
function getActiveSmtpConfig() {
  let getSetting = () => '';
  try {
    const db = require('./db');
    getSetting = db.getSetting;
  } catch (_) {}

  return {
    host: getSetting('smtp_host', process.env.SMTP_HOST || ''),
    port: parseInt(getSetting('smtp_port', process.env.SMTP_PORT || '587'), 10),
    secure: getSetting('smtp_secure', process.env.SMTP_SECURE || 'false') === 'true',
    user: getSetting('smtp_user', process.env.SMTP_USER || ''),
    pass: getSetting('smtp_pass', process.env.SMTP_PASS || ''),
    from: getSetting('smtp_from', process.env.SMTP_FROM || '')
  };
}

/**
 * Super Admin API representation (password masked)
 */
function getSmtpConfig() {
  const c = getActiveSmtpConfig();
  return {
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    passMasked: c.pass ? '••••••••' : '',
    hasPass: Boolean(c.pass),
    from: c.from,
    isConfigured: Boolean(c.host && c.user && c.pass)
  };
}

/**
 * Saves SMTP configuration to system_settings
 */
function saveSmtpConfig({ host, port, secure, user, pass, from }) {
  let setSetting = () => {};
  try {
    const db = require('./db');
    setSetting = db.setSetting;
  } catch (_) {}

  if (host !== undefined) setSetting('smtp_host', host.trim());
  if (port !== undefined) setSetting('smtp_port', String(port).trim());
  if (secure !== undefined) setSetting('smtp_secure', String(secure));
  if (user !== undefined) setSetting('smtp_user', user.trim());
  if (pass !== undefined && pass !== '' && pass !== '••••••••') setSetting('smtp_pass', pass);
  if (from !== undefined) setSetting('smtp_from', from.trim());

  return getSmtpConfig();
}

/**
 * Injects a 1x1 transparent open-tracking pixel and wraps outbound links
 * into redirect tracking URLs.
 */
function prepareTrackedContent(html, trackingId, baseUrl) {
  if (!html || !trackingId || !baseUrl) return html;

  // 1. Wrap external http(s) links in tracking redirect
  let trackedHtml = html.replace(/<a\b([^>]*?)\bhref=(["'])(https?:\/\/[^"'>\s]+)\2([^>]*)>/gi, (match, prefix, quote, originalUrl, suffix) => {
    // Avoid double-wrapping or tracking local/empty links
    if (originalUrl.includes('/api/v1/track/')) {
      return match;
    }
    const trackedUrl = `${baseUrl}/api/v1/track/click?id=${encodeURIComponent(trackingId)}&url=${encodeURIComponent(originalUrl)}`;
    return `<a${prefix}href=${quote}${trackedUrl}${quote}${suffix}>`;
  });

  // 2. Append 1x1 transparent tracking pixel
  const pixelHtml = `<img src="${baseUrl}/api/v1/track/open?id=${encodeURIComponent(trackingId)}" width="1" height="1" style="display:none;width:1px;height:1px;max-height:0;overflow:hidden;opacity:0;border:none;" alt="" />`;

  if (trackedHtml.includes('</body>')) {
    trackedHtml = trackedHtml.replace('</body>', `${pixelHtml}\n</body>`);
  } else {
    trackedHtml += `\n${pixelHtml}`;
  }

  return trackedHtml;
}

/**
 * Sends an email using either live socket SMTP if configured,
 * or records and simulates in development/offline mode.
 * Supports Open Tracking, Link Tracing, and Campaign Logging.
 */
async function sendMail({ to, subject, html, text, campaignId = null, mailType = 'transactional', track = true, baseUrl = '' }) {
  let db;
  try { db = require('./db'); } catch (_) {}

  const trackingId = 'trk_' + crypto.randomBytes(12).toString('hex');
  const effectiveBaseUrl = (baseUrl || (db && db.getSetting('server_public_url')) || process.env.PUBLIC_URL || 'https://dir.anasrawuthar.in').replace(/\/+$/, '');

  let processedHtml = html;
  if (track && html) {
    processedHtml = prepareTrackedContent(html, trackingId, effectiveBaseUrl);
  }

  const mailRecord = {
    to,
    subject,
    html: processedHtml,
    text,
    trackingId,
    timestamp: new Date().toISOString()
  };
  dispatchedEmails.push(mailRecord);

  // Record initial pending/sent log
  if (db && db.recordEmailLog) {
    db.recordEmailLog({
      id: trackingId,
      campaignId,
      recipient: to,
      subject,
      mailType,
      status: 'sent',
      createdAt: mailRecord.timestamp
    });
  }

  const config = getActiveSmtpConfig();

  // In test environment or simulated mode, do not open external network sockets
  if (process.env.NODE_ENV === 'test' || process.env.SIMULATE_SMTP === 'true') {
    return { ok: true, delivered: false, simulated: true, trackingId };
  }

  // If live SMTP credentials are configured, send via network socket
  if (config.host && config.user && config.pass) {
    try {
      await deliverViaSocket(mailRecord, config);
      console.log(`[SMTP] Live email successfully delivered to ${to} (${subject}) [Tracking: ${trackingId}]`);
      return { ok: true, delivered: true, trackingId };
    } catch (err) {
      console.error(`[SMTP] Live delivery failed to ${to}:`, err.message);
      if (db && db.updateEmailLogStatus) {
        db.updateEmailLogStatus(trackingId, 'failed', err.message);
      }
      return { ok: false, error: err.message, fallbackRecorded: true, trackingId };
    }
  }

  // Development / Offline mode notification
  console.log(`\n================== [ZynBill SMTP Notification] ==================`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Tracking ID: ${trackingId}`);
  console.log(`Content:\n${text}`);
  console.log(`=================================================================\n`);

  return { ok: true, delivered: false, simulated: true, trackingId };
}

function extractDomainFromConfig(config) {
  const source = config.from || config.user || config.host || '';
  const atMatch = source.match(/@([a-zA-Z0-9.-]+)/);
  if (atMatch) return atMatch[1];
  return 'anasrawuthar.in';
}

/**
 * Socket-level SMTP delivery (RFC 5321 & RFC 5322)
 */
function deliverViaSocket(mail, config) {
  return new Promise((resolve, reject) => {
    const isDirectTls = config.secure || parseInt(config.port, 10) === 465;
    const clientDomain = extractDomainFromConfig(config);
    let socket;

    function setupSmtpFlow(s, isEncrypted) {
      let state = isEncrypted ? 'INIT' : 'PLAIN_INIT';
      let buffer = '';

      s.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          const code = parseInt(line.slice(0, 3), 10);
          if (line[3] === '-') continue; // multiline reply

          if ((state === 'INIT' || state === 'PLAIN_INIT') && code === 220) {
            if (isDirectTls || isEncrypted) {
              state = 'HELO';
              s.write(`EHLO ${clientDomain}\r\n`);
            } else {
              state = 'STARTTLS_EHLO';
              s.write(`EHLO ${clientDomain}\r\n`);
            }
          } else if (state === 'STARTTLS_EHLO' && code === 250) {
            state = 'STARTTLS_REQ';
            s.write('STARTTLS\r\n');
          } else if (state === 'STARTTLS_REQ' && code === 220) {
            // Upgrade socket to TLS
            s.removeAllListeners('data');
            const tlsSocket = tls.connect({
              socket: s,
              host: config.host,
              rejectUnauthorized: false
            }, () => {
              setupSmtpFlow(tlsSocket, true);
              tlsSocket.write(`EHLO ${clientDomain}\r\n`);
            });
            tlsSocket.on('error', reject);
            return;
          } else if (state === 'HELO' && code === 250) {
            state = 'AUTH';
            s.write('AUTH LOGIN\r\n');
          } else if (state === 'AUTH' && code === 334) {
            state = 'USER';
            s.write(Buffer.from(config.user).toString('base64') + '\r\n');
          } else if (state === 'USER' && code === 334) {
            state = 'PASS';
            s.write(Buffer.from(config.pass).toString('base64') + '\r\n');
          } else if (state === 'PASS' && code === 235) {
            state = 'MAIL_FROM';
            s.write(`MAIL FROM:<${config.user}>\r\n`);
          } else if (state === 'MAIL_FROM' && code === 250) {
            state = 'RCPT_TO';
            s.write(`RCPT TO:<${mail.to}>\r\n`);
          } else if (state === 'RCPT_TO' && code === 250) {
            state = 'DATA';
            s.write('DATA\r\n');
          } else if (state === 'DATA' && code === 354) {
            state = 'SEND_BODY';
            
            const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${clientDomain}>`;
            const dateHeader = new Date().toUTCString();
            let fromHeader = config.from || config.user;
            if (!fromHeader.includes('<') && fromHeader.includes('@')) {
              fromHeader = `ZynBill <${fromHeader}>`;
            }

            const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            let raw = '';

            if (mail.html && mail.text) {
              raw = [
                `Date: ${dateHeader}`,
                `From: ${fromHeader}`,
                `To: ${mail.to}`,
                `Subject: ${mail.subject}`,
                `Message-ID: ${messageId}`,
                `MIME-Version: 1.0`,
                `Content-Type: multipart/alternative; boundary="${boundary}"`,
                ``,
                `--${boundary}`,
                `Content-Type: text/plain; charset=UTF-8`,
                `Content-Transfer-Encoding: 7bit`,
                ``,
                mail.text,
                ``,
                `--${boundary}`,
                `Content-Type: text/html; charset=UTF-8`,
                `Content-Transfer-Encoding: 7bit`,
                ``,
                mail.html,
                ``,
                `--${boundary}--`,
                `\r\n.`
              ].join('\r\n') + '\r\n';
            } else {
              raw = [
                `Date: ${dateHeader}`,
                `From: ${fromHeader}`,
                `To: ${mail.to}`,
                `Subject: ${mail.subject}`,
                `Message-ID: ${messageId}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset=UTF-8`,
                `Content-Transfer-Encoding: 7bit`,
                ``,
                mail.html || mail.text,
                `\r\n.`
              ].join('\r\n') + '\r\n';
            }

            s.write(raw);
          } else if (state === 'SEND_BODY' && code === 250) {
            state = 'QUIT';
            s.write('QUIT\r\n');
            s.end();
            resolve();
          } else if (code >= 400) {
            reject(new Error(`SMTP error (${code}): ${line}`));
            s.destroy();
          }
        }
      });
    }

    if (isDirectTls) {
      socket = tls.connect(config.port, config.host, { rejectUnauthorized: false }, () => {
        setupSmtpFlow(socket, true);
      });
    } else {
      socket = net.createConnection(config.port, config.host, () => {
        setupSmtpFlow(socket, false);
      });
    }

    socket.on('error', reject);
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('SMTP socket timeout'));
    });
  });
}

/**
 * Super Admin Test SMTP Connection
 */
async function testSmtpConnection(targetEmail) {
  const config = getActiveSmtpConfig();
  if (!config.host || !config.user || !config.pass) {
    return { ok: false, error: 'SMTP settings incomplete. Please provide Host, Port, Username and Password.' };
  }
  try {
    const subject = `ZynBill SMTP Configuration Test - ${new Date().toLocaleTimeString()}`;
    const text = `This is a test email from ZynBill Cloud Server.\n\nHost: ${config.host}\nPort: ${config.port}\nSecure: ${config.secure}\nFrom: ${config.from}\nTimestamp: ${new Date().toISOString()}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
        <h2 style="color: #0284c7; margin-top: 0;">✓ SMTP Test Successful</h2>
        <p style="color: #334155; font-size: 14px;">Your SMTP email configuration is connected and working correctly on the ZynBill Cloud Server.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; background: #f8fafc; border-radius: 6px; padding: 10px;">
          <tr><td style="padding: 6px 10px; color: #64748b;">Host:</td><td style="padding: 6px 10px;"><strong>${escapeHtml(config.host)}:${config.port}</strong></td></tr>
          <tr><td style="padding: 6px 10px; color: #64748b;">SSL/TLS:</td><td style="padding: 6px 10px;"><strong>${config.secure ? 'Enabled' : 'Disabled (STARTTLS)'}</strong></td></tr>
          <tr><td style="padding: 6px 10px; color: #64748b;">Sender:</td><td style="padding: 6px 10px;"><strong>${escapeHtml(config.from)}</strong></td></tr>
          <tr><td style="padding: 6px 10px; color: #64748b;">Recipient:</td><td style="padding: 6px 10px;"><strong>${escapeHtml(targetEmail)}</strong></td></tr>
        </table>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 14px;">ZynBill Cloud Multi-Tenant System</p>
      </div>
    `;
    const res = await sendMail({ to: targetEmail, subject, text, html });
    if (!res.ok || res.delivered === false) {
      return { ok: false, error: res.error || 'Failed to deliver email to SMTP server' };
    }
    return { ok: true, message: `Test email sent successfully to ${targetEmail}`, result: res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 1. Send 6-Digit Email OTP for Registration
 */
async function sendOtpEmail(email, otp, companyName = 'Customer') {
  const subject = `Your ZynBill Verification Code: ${otp}`;
  const text = `Hello ${companyName},\n\nYour 6-digit registration verification code is: ${otp}\n\nThis code is valid for 10 minutes. Please enter it to complete your registration.\n\nThank you,\nZynBill Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
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

      <p style="font-size: 13px; line-height: 1.5; color: #64748b;">Once verified, your account request will be submitted to the Super Admin for activation and plan assignment.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} ZynBill Technologies. All rights reserved.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 2. Send One-Time Verification Code for First PC Login (Device Binding)
 */
async function sendDeviceVerificationOtp(email, otp, companyName = 'Customer', machineName = 'Windows PC') {
  const subject = `[ZynBill] Authorization Code for PC Login: ${otp}`;
  const text = `Hello ${companyName},\n\nA login request was initiated for your ZynBill desktop application on "${machineName}".\n\nYour One-Time Device Authorization Code is: ${otp}\n\nEnter this code on your computer to activate this PC.\n\nIf you did not initiate this, please contact support.\n\nThank you,\nZynBill Security Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #00c0f3; font-size: 26px; margin: 0; font-weight: 800;">ZynBill</h1>
        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Device Authorization &amp; Security</p>
      </div>
      <div style="background: #eff6ff; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #0369a1; font-size: 15px;">💻 New PC Login Verification</h3>
        <p style="margin: 4px 0 0; color: #0284c7; font-size: 13px;">Authorizing terminal: <strong>${escapeHtml(machineName)}</strong></p>
      </div>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(companyName)}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">Please enter the following one-time verification code on your Windows application to complete PC activation:</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <div style="display: inline-block; background: #f0fdf4; border: 2px dashed #0284c7; border-radius: 10px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0369a1;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 10 minutes. For your security, do not share this code.</p>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: #64748b;">Once verified, your PC is activated for fast offline &amp; online billing, and you can configure your 4-digit PIN.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} ZynBill Technologies.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 3. Send Password Reset OTP
 */
async function sendPasswordResetOtp(email, otp, companyName = 'Customer') {
  const subject = `[ZynBill] Password Reset Verification Code: ${otp}`;
  const text = `Hello ${companyName},\n\nA password reset was requested for your ZynBill account.\n\nYour 6-digit password reset code is: ${otp}\n\nValid for 15 minutes.\n\nThank you,\nZynBill Support`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
      <h2 style="color: #0f172a; margin-top: 0;">Reset Your Password</h2>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(companyName)}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">We received a request to reset your ZynBill customer portal password. Use the verification code below:</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <div style="display: inline-block; background: #fef2f2; border: 2px dashed #ef4444; border-radius: 10px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #dc2626;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 15 minutes.</p>
      </div>
      <p style="font-size: 13px; color: #64748b;">If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 4. Send Security PIN Reset OTP
 */
async function sendPinResetOtp(email, otp, companyName = 'Customer') {
  const subject = `[ZynBill] Security PIN Reset Code: ${otp}`;
  const text = `Hello ${companyName},\n\nYou requested to reset your 4-digit Security PIN on ZynBill.\n\nYour PIN Reset Code is: ${otp}\n\nValid for 15 minutes.\n\nThank you,\nZynBill Support`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
      <h2 style="color: #0f172a; margin-top: 0;">Reset Security PIN</h2>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(companyName)}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">Use the authorization code below to reset your desktop 4-digit security PIN:</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <div style="display: inline-block; background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 10px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #16a34a;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 15 minutes.</p>
      </div>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 5. Send Super Admin Account Approval Email
 */
async function sendApprovalEmail(email, companyName, plan, validUntil) {
  const expiryFormatted = new Date(validUntil).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  const subject = `Welcome to ZynBill! Your Account has been Approved`;
  const text = `Congratulations ${companyName}!\n\nYour ZynBill Cloud account has been approved by our Super Admin.\nPlan: ${plan}\nValid Until: ${expiryFormatted}\n\nYou can now open the ZynBill Desktop application, enter your email and password to activate your installation.\n\nThank you,\nZynBill Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
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
        <li>Enter the One-Time Device Verification Code sent to your email.</li>
        <li>Set up your convenient 4-digit security PIN for instant quick logins.</li>
      </ol>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} ZynBill Technologies.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * 6. Send Rejection Email
 */
async function sendRejectionEmail(email, companyName, reason = 'Registration requirements not met') {
  const subject = `Update on your ZynBill Registration`;
  const text = `Hello ${companyName},\n\nWe reviewed your ZynBill registration request. Unfortunately, it could not be approved at this time.\nReason: ${reason}\n\nPlease contact support@zynbill.com for assistance.\n\nZynBill Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
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

/**
 * 7. Asynchronous Batch Campaign Sending Engine with rate limiting / delays
 */
async function sendBatchCampaign({ subject, html, text, targetGroup = 'all', customEmails = [], delayMs = 1000, baseUrl = '' }) {
  let db;
  try { db = require('./db'); } catch (_) {}
  if (!db) throw new Error('Database module unavailable');

  let recipients = [];
  if (targetGroup === 'all') {
    const rows = db.masterDb.prepare("SELECT email, company_name, owner_name FROM customers WHERE email IS NOT NULL AND trim(email) != ''").all();
    recipients = rows.map(r => ({ email: r.email.trim(), companyName: r.company_name || r.owner_name || 'Valued Customer' }));
  } else if (targetGroup === 'active') {
    const rows = db.masterDb.prepare("SELECT email, company_name, owner_name FROM customers WHERE status = 'active' AND email IS NOT NULL AND trim(email) != ''").all();
    recipients = rows.map(r => ({ email: r.email.trim(), companyName: r.company_name || r.owner_name || 'Valued Customer' }));
  } else if (targetGroup === 'custom') {
    recipients = (customEmails || []).filter(e => typeof e === 'string' && e.includes('@')).map(e => ({ email: e.trim(), companyName: 'Valued Customer' }));
  }

  // Deduplicate by lowercase email
  const seen = new Set();
  recipients = recipients.filter(r => {
    const lower = r.email.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  if (recipients.length === 0) {
    return { ok: false, error: 'No valid recipient email addresses found for target group.' };
  }

  const campaignId = 'camp_' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  db.createEmailCampaign({
    id: campaignId,
    subject,
    targetGroup,
    totalRecipients: recipients.length,
    createdAt: now
  });

  // Run in background without blocking caller
  (async () => {
    db.updateEmailCampaignProgress(campaignId, { status: 'processing' });
    let sentCount = 0;
    let failedCount = 0;

    for (const r of recipients) {
      try {
        const pSubject = subject.replace(/\{\{\s*companyName\s*\}\}/gi, r.companyName);
        const pHtml = html ? html.replace(/\{\{\s*companyName\s*\}\}/gi, escapeHtml(r.companyName)) : '';
        const pText = text ? text.replace(/\{\{\s*companyName\s*\}\}/gi, r.companyName) : '';

        const res = await sendMail({
          to: r.email,
          subject: pSubject,
          html: pHtml,
          text: pText,
          campaignId,
          mailType: 'broadcast',
          track: true,
          baseUrl
        });

        if (res.ok && res.delivered !== false && !res.error) {
          sentCount++;
        } else if (res.simulated) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
      }

      db.updateEmailCampaignProgress(campaignId, { sentCount, failedCount });

      if (delayMs > 0 && (sentCount + failedCount) < recipients.length) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }

    db.updateEmailCampaignProgress(campaignId, {
      sentCount,
      failedCount,
      status: failedCount === recipients.length ? 'failed' : 'completed',
      completedAt: new Date().toISOString()
    });
  })().catch(err => {
    console.error(`[SMTP] Batch campaign ${campaignId} background failure:`, err);
  });

  return {
    ok: true,
    campaignId,
    totalRecipients: recipients.length,
    message: `Batch campaign started for ${recipients.length} recipients (${delayMs}ms delay between emails).`
  };
}

module.exports = {
  dispatchedEmails,
  getActiveSmtpConfig,
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConnection,
  sendMail,
  sendOtpEmail,
  sendDeviceVerificationOtp,
  sendPasswordResetOtp,
  sendPinResetOtp,
  sendApprovalEmail,
  sendRejectionEmail,
  sendBatchCampaign,
  prepareTrackedContent
};