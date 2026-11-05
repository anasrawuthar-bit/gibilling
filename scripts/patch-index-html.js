const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Update sidebar brand header & cloud sync popover
const oldSidebarBrandHeader = `<div class="sidebar-brand-header">
          <div style="display:flex;align-items:center;gap:9px;min-width:0;">
            <div class="sidebar-brand-logo-wrap">
              <img src="assets/zynbill-logo.png" alt="ZynBill" class="sidebar-brand-logo">
            </div>
            <span class="sidebar-brand-name">ZynBill</span>
          </div>
          <button type="button" class="cloud-sync-status-badge online" id="cloudSyncStatusBadge" title="ZynBill Cloud: Online &amp; Synced">
            <span class="sync-dot"></span>
            <span class="sync-label" id="syncStatusLabel">Online</span>
            <span class="sync-pending-badge hidden" id="syncPendingBadge">0</span>
          </button>
        </div>`;

const newSidebarBrandHeader = `<div class="sidebar-brand-header">
          <div style="display:flex;align-items:center;gap:9px;min-width:0;">
            <div class="sidebar-brand-logo-wrap">
              <img src="assets/zynbill-logo.png" alt="ZynBill" class="sidebar-brand-logo">
            </div>
            <span class="sidebar-brand-name">ZynBill</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <button type="button" class="plan-status-pill" id="sidebarPlanPill" title="Subscription Plan & Validity">
              <span class="plan-pill-star">★</span>
              <span id="sidebarPlanName">Pro</span> • <span id="sidebarPlanDays">365d</span>
            </button>
            <button type="button" class="cloud-sync-status-badge online" id="cloudSyncStatusBadge" title="ZynBill Cloud: Online &amp; Synced">
              <span class="sync-dot"></span>
              <span class="sync-label" id="syncStatusLabel">Online</span>
              <span class="sync-pending-badge hidden" id="syncPendingBadge">0</span>
            </button>
          </div>
        </div>`;

// Popover body & footer
const oldPopoverBody = `<div class="sync-metric-row">
              <span>Cloud Status:</span>
              <strong class="sync-status-online" id="syncPopoverStatus">Online</strong>
            </div>
            <div class="sync-metric-row">
              <span>Pending Sync Queue:</span>
              <strong id="syncPopoverPendingCount">0 changes queued</strong>
            </div>`;

const newPopoverBody = `<div class="sync-metric-row">
              <span>Cloud Status:</span>
              <strong class="sync-status-online" id="syncPopoverStatus">Online</strong>
            </div>
            <div class="sync-metric-row">
              <span>Subscription Plan:</span>
              <strong style="color:var(--primary-color);" id="syncPopoverPlanName">Professional Plan</strong>
            </div>
            <div class="sync-metric-row">
              <span>Plan Validity:</span>
              <span id="syncPopoverPlanValidity">365 days remaining</span>
            </div>
            <div class="sync-metric-row">
              <span>Pending Sync Queue:</span>
              <strong id="syncPopoverPendingCount">0 changes queued</strong>
            </div>`;

const oldPopoverFooter = `<div class="sync-popover-footer">
            <button type="button" class="secondary-button compact-button" id="syncBackupNowBtn">Backup Local DB</button>`;

const newPopoverFooter = `<div class="sync-popover-footer">
            <button type="button" class="secondary-button compact-button" id="syncPlanDetailsBtn">Plan Details</button>
            <button type="button" class="secondary-button compact-button" id="syncBackupNowBtn">Backup Local DB</button>`;

// Normalize CRLF to LF for matching
const isCrlf = html.includes('\r\n');
const normalizedHtml = html.replace(/\r\n/g, '\n');

let updated = normalizedHtml;

if (updated.includes(oldSidebarBrandHeader.replace(/\r\n/g, '\n'))) {
  updated = updated.replace(oldSidebarBrandHeader.replace(/\r\n/g, '\n'), newSidebarBrandHeader.replace(/\r\n/g, '\n'));
  console.log('✓ Replaced sidebar brand header with plan status pill');
} else {
  console.warn('Could not find oldSidebarBrandHeader');
}

if (updated.includes(oldPopoverBody.replace(/\r\n/g, '\n'))) {
  updated = updated.replace(oldPopoverBody.replace(/\r\n/g, '\n'), newPopoverBody.replace(/\r\n/g, '\n'));
  console.log('✓ Replaced popover body with subscription metrics');
} else {
  console.warn('Could not find oldPopoverBody');
}

if (updated.includes(oldPopoverFooter.replace(/\r\n/g, '\n'))) {
  updated = updated.replace(oldPopoverFooter.replace(/\r\n/g, '\n'), newPopoverFooter.replace(/\r\n/g, '\n'));
  console.log('✓ Added Plan Details button to popover footer');
} else {
  console.warn('Could not find oldPopoverFooter');
}

// 2. Update cloudActivationModal
const oldActivationCard = `<div class="activation-card">
        <header class="activation-header">
          <div class="activation-logo-wrap">
            <img src="assets/zynbill-logo.png" alt="ZynBill" class="activation-logo">
          </div>
          <h2 id="activationModalTitle">Activate ZynBill Desktop</h2>
          <p>Sign in with your registered company account to activate this installation.</p>
        </header>
        <form id="cloudActivationForm" class="activation-form">
          <label class="activation-field">
            <span>Registered Email Address</span>
            <input type="email" id="activationEmail" required placeholder="name@yourcompany.com" autocomplete="username">
          </label>
          <label class="activation-field">
            <span>Password</span>
            <input type="password" id="activationPassword" required placeholder="Enter your password" autocomplete="current-password">
          </label>
          <div class="activation-advanced-toggle" id="activationAdvToggle" role="button" tabindex="0">
            <span>Server Options ▾</span>
          </div>
          <label class="activation-field hidden" id="activationServerField">
            <span>Cloud API Endpoint</span>
            <input type="url" id="activationServerUrl" value="http://localhost:4000" placeholder="https://api.zynbill.com">
          </label>
          <div class="activation-error-msg hidden" id="activationErrorMsg"></div>
          <div class="activation-actions">
            <button type="submit" class="primary-button" id="activationSubmitBtn">Activate &amp; Unlock</button>
            <button type="button" class="secondary-button" id="activationOfflineDemoBtn">Offline Trial Mode</button>
          </div>
          <div class="activation-footer-text">
            <span>Don't have an account? <a href="#" id="activationRegisterLink">Register on web portal</a></span>
          </div>
        </form>
      </div>`;

const newActivationCard = `<div class="activation-card">
        <header class="activation-header">
          <div class="activation-logo-wrap">
            <img src="assets/zynbill-logo.png" alt="ZynBill" class="activation-logo">
          </div>
          <h2 id="activationModalTitle">Activate ZynBill Desktop</h2>
          <p id="activationModalSubtitle">Sign in with your registered company account to activate this PC.</p>
        </header>

        <!-- Step 1: Account Credentials -->
        <form id="cloudActivationForm" class="activation-form">
          <label class="activation-field">
            <span>Registered Email Address</span>
            <input type="email" id="activationEmail" required placeholder="name@yourcompany.com" autocomplete="username">
          </label>
          <label class="activation-field">
            <span>Password</span>
            <input type="password" id="activationPassword" required placeholder="Enter your password" autocomplete="current-password">
          </label>
          <div class="activation-advanced-toggle" id="activationAdvToggle" role="button" tabindex="0">
            <span>Server Options ▾</span>
          </div>
          <label class="activation-field hidden" id="activationServerField">
            <span>Cloud API Endpoint</span>
            <input type="url" id="activationServerUrl" value="http://localhost:4000" placeholder="https://api.zynbill.com">
          </label>
          <div class="activation-error-msg hidden" id="activationErrorMsg"></div>
          <div class="activation-actions">
            <button type="submit" class="primary-button" id="activationSubmitBtn">Authorize PC &amp; Activate</button>
            <button type="button" class="secondary-button" id="activationOfflineDemoBtn">Offline Trial Mode</button>
          </div>
          <div class="activation-footer-text">
            <span>Don't have an account? <a href="#" id="activationRegisterLink">Register on web portal</a></span>
          </div>
        </form>

        <!-- Step 2: One-Time Verification Code for First PC Login -->
        <div id="activationOtpStep" class="activation-form hidden">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #166534; margin-bottom: 14px;">
            🔒 <strong>Device Authorization Code Required</strong><br>
            A 6-digit One-Time Verification Code has been sent to <strong id="activationTargetEmail">your email</strong>.
          </div>
          <label class="activation-field">
            <span>Enter 6-Digit One-Time Verification Code</span>
            <input type="text" id="activationOtpCode" maxlength="6" placeholder="123456" style="letter-spacing: 6px; font-size: 20px; text-align: center; font-weight: 700;">
          </label>
          <div class="activation-error-msg hidden" id="activationOtpErrorMsg"></div>
          <div class="activation-actions">
            <button type="button" class="primary-button" id="activationVerifyOtpBtn">Verify &amp; Unlock PC</button>
            <button type="button" class="secondary-button" id="activationBackBtn">Back</button>
          </div>
          <div class="activation-footer-text" style="display:flex; justify-content:space-between; margin-top:14px;">
            <a href="#" id="activationResendOtpLink" style="font-size:12.5px; color:var(--primary-color);">Resend Code</a>
            <span style="font-size:12px; color:var(--text-muted);">Valid for 10 minutes</span>
          </div>
        </div>
      </div>`;

if (updated.includes(oldActivationCard.replace(/\r\n/g, '\n'))) {
  updated = updated.replace(oldActivationCard.replace(/\r\n/g, '\n'), newActivationCard.replace(/\r\n/g, '\n'));
  console.log('✓ Updated cloudActivationModal with Step 2 Device Verification OTP');
} else {
  console.warn('Could not find oldActivationCard');
}

// 3. Add In-App PIN Reset Modal and Subscription Modal right before </body>
const modalsToAppend = `
    <!-- In-App PIN Reset via Email OTP Modal -->
    <div id="pinResetInAppModal" class="pin-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="pinResetInAppTitle">
      <div class="pin-card" style="max-width: 440px;">
        <h3 id="pinResetInAppTitle">Reset Security PIN</h3>
        <p id="pinResetInAppSubtitle">Send a verification code to your registered email to reset your 4-digit PIN.</p>
        
        <div id="pinResetStep1">
          <p style="font-size: 13px; color: var(--text-secondary); margin: 16px 0;">
            A reset code will be sent to: <br><strong id="pinResetEmailDisplay">-</strong>
          </p>
          <div class="pin-footer-actions" style="margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="secondary-button" id="pinResetCancelBtn">Cancel</button>
            <button type="button" class="primary-button" id="pinResetSendOtpBtn">Send Reset Code</button>
          </div>
        </div>

        <div id="pinResetStep2" class="hidden">
          <label class="activation-field" style="margin-top: 14px;">
            <span>6-Digit Verification Code</span>
            <input type="text" id="pinResetCodeInput" maxlength="6" placeholder="123456" style="letter-spacing: 4px; text-align: center; font-size: 18px; font-weight: 700;">
          </label>
          <div class="pin-error-text hidden" id="pinResetErrorText" style="margin: 8px 0;"></div>
          <div class="pin-footer-actions" style="margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="secondary-button" id="pinResetStep2CancelBtn">Cancel</button>
            <button type="button" class="primary-button" id="pinResetVerifyCodeBtn">Verify Code</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Subscription & License Plan Details Modal -->
    <div id="subscriptionModal" class="activation-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="subscriptionModalTitle">
      <div class="activation-card" style="max-width: 540px;">
        <header class="activation-header" style="text-align: left; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 id="subscriptionModalTitle" style="font-size: 20px; font-weight: 800; color: #0f172a;">Subscription &amp; License</h2>
            <p style="font-size: 13px; color: #64748b; margin-top: 2px;">Plan status, license validity, and offline grace policy</p>
          </div>
          <button type="button" class="modal-close-icon" id="subscriptionModalCloseBtn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b; line-height: 1;">&times;</button>
        </header>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 18px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 16px; font-weight: 800; color: #0284c7;" id="subModalPlanName">Professional Business</span>
            <span class="plan-badge" id="subModalPlanBadge" style="background:#ecfdf5; color:#047857; font-size:11.5px; font-weight:700; padding:3px 8px; border-radius:6px;">ACTIVE</span>
          </div>

          <div style="font-size: 28px; font-weight: 800; color: #0f172a;" id="subModalDaysLeft">365</div>
          <div style="font-size: 12.5px; color: #64748b; margin-top: 2px;">Days remaining on current subscription</div>

          <div class="progress-bar-bg" style="background: #e2e8f0; border-radius: 999px; height: 8px; overflow: hidden; margin: 14px 0 8px;">
            <div id="subModalProgressBar" style="background: #10b981; height: 100%; width: 100%; transition: width 0.3s;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12.5px; color: #64748b;">
            <span>License Valid Until:</span>
            <strong id="subModalValidUntil" style="color: #0f172a;">-</strong>
          </div>
        </div>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-bottom: 18px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Company Name:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;" id="subModalCompanyName">-</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Registered Account:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;" id="subModalEmail">-</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Offline Grace Period:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #16a34a; text-align: right;">14 Days Protected</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Device Token:</td>
            <td style="padding: 6px 0; font-family: monospace; font-size: 11.5px; color: #64748b; text-align: right;" id="subModalToken">zyndev_••••••••</td>
          </tr>
        </table>

        <div class="activation-actions" style="margin-top: 20px;">
          <button type="button" class="primary-button" id="subModalRefreshBtn">Refresh License Online</button>
          <button type="button" class="secondary-button" id="subModalPortalBtn">Open Customer Portal</button>
        </div>
      </div>
    </div>
`;

if (!updated.includes('id="subscriptionModal"')) {
  updated = updated.replace('</body>', modalsToAppend + '\n  </body>');
  console.log('✓ Added subscriptionModal and pinResetInAppModal before </body>');
}

// Write back with original line endings
const finalOutput = isCrlf ? updated.replace(/\n/g, '\r\n') : updated;
fs.writeFileSync(indexPath, finalOutput, 'utf8');
console.log('Successfully patched index.html!');
