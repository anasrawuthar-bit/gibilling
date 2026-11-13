const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

test('Party Statement PDF & Draft Mechanism Verification', () => {
  const appJs = fs.readFileSync('app.js', 'utf8');

  // Verify that openWhatsAppStatementPickerModal is defined
  assert.ok(appJs.includes('function openWhatsAppStatementPickerModal('), 'openWhatsAppStatementPickerModal must be defined');

  // Verify that waStmtPillBtn calls openWhatsAppStatementPickerModal
  assert.ok(appJs.includes('openWhatsAppStatementPickerModal(activeParty)'), 'waStmtPillBtn click must open statement picker modal');

  // Verify calculatePartyStatementData works with Party anas
  const startIdx = appJs.indexOf('function calculatePartyStatementData(');
  const endIdx = appJs.indexOf('async function downloadPartyStatementPdf(');
  const fnCode = appJs.substring(startIdx, endIdx);

  const context = {
    console,
    state: {
      parties: [
        { id: 5, name: 'anas', phone: '9048253862', openingBalance: -15000, openingBalanceType: 'payable' }
      ],
      invoices: [
        { id: '1', invoiceNo: 'PB-2627-0001', type: 'purchase', party: 'anas', total: 12390, date: '2026-11-12T13:38:27.348Z', subtotal: 10500, tax: 1890 }
      ],
      payments: [],
      creditNotes: [],
      debitNotes: [],
      businessSettings: { businessName: 'termo' }
    },
    formatCurrency: (n) => '₹' + n,
    formatDate: (d) => String(d),
    titleCase: (s) => s,
    escapeHtml: (s) => String(s),
    partyRole: () => ({ label: 'Party', className: 'neutral' }),
    defaultBusinessSettings: () => ({ businessName: 'termo' }),
    invoiceTotalValue: (inv) => Number(inv.total || 0),
    invoiceTaxableValue: (inv) => Number(inv.subtotal || 0),
    invoiceTaxValue: (inv) => Number(inv.tax || 0),
    creditNoteStatus: () => 'active',
    debitNoteStatus: () => 'active',
    creditNoteTotalValue: () => 0,
    debitNoteTotalValue: () => 0,
    datePresetRange: () => null,
    partyMatchesTarget: (row, party) => (row.party || '').toLowerCase() === (party.name || '').toLowerCase()
  };

  vm.createContext(context);
  vm.runInContext(fnCode + '; result = calculatePartyStatementData(state.parties[0], { preset: "all" });', context);

  const res = context.result;
  assert.ok(res, 'calculatePartyStatementData must return a valid statement object');
  assert.strictEqual(res.party.name, 'anas');
  assert.ok(res.htmlContent.includes('Statement of Account'), 'HTML must have Statement of Account header');
  assert.ok(res.htmlContent.includes('anas'), 'HTML must have party name anas');
  assert.ok(res.filename.startsWith('Statement_anas_'), 'Filename must start with Statement_anas_');
  assert.ok(res.filename.endsWith('.pdf'), 'Filename must end with .pdf');
  assert.ok(res.summaryMessage.includes('Dear *anas*'), 'Summary message must address party');
});

test('CSS .wa-quick-pills-bar allows unclipped popovers', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(/\.wa-quick-pills-bar\s*\{[^}]*overflow:\s*visible/s.test(css), 'wa-quick-pills-bar must have overflow: visible to prevent clipping');
});
