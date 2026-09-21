const storeKey = "giBillingState";

let state = loadState();
let currentEntryType = "sale";
let currentView = "home";
let partySearchQuery = "";
let itemSearchQuery = "";
let saleInvoiceSearchQuery = "";
let purchaseInvoiceSearchQuery = "";
let estimateSearchQuery = "";
let creditNoteSearchQuery = "";
let debitNoteSearchQuery = "";
let expenseSearchQuery = "";
let posSearchQuery = "";
let barcodeSearchQuery = "";
let reportSearchQuery = "";
let reportDateFilter = { preset: "all", from: "", to: "" };
let reportPartyFilter = "";
let reportCategoryFilter = "";
let dashboardChartFrame = 0;
let saleInvoiceQuickFilter = "all";
let purchaseInvoiceQuickFilter = "all";
let estimateQuickFilter = "all";
let creditNoteQuickFilter = "all";
let debitNoteQuickFilter = "all";
let expenseQuickFilter = "all";
let posCategoryFilter = "all";

// ── Vyapar-Style Filter State ────────────────────────────────────────────────
let saleTopFilter = { preset: "thisMonth", dateFrom: "", dateTo: "", party: "" };
let purchaseTopFilter = { preset: "thisMonth", dateFrom: "", dateTo: "", party: "" };
let saleColumnFilters = {};    // { colKey: { category, value, value2 } }
let purchaseColumnFilters = {}; // same
let partyAdvancedFilter = { balanceType: "all", state: "" };
let itemAdvancedFilter = { category: "", itemType: "all", stockLevel: "all" };

let posCart = [];
let posCustomerQuery = "";
let posSelectedPartyId = "";
let posPaymentMethod = "Cash";
let posReceivedAmount = null;
let openAnythingResults = [];
let openAnythingActiveIndex = 0;
let currentEntryRecordId = null;
let activeTransactionEditorType = "sale";
let activeTransactionEditInvoiceId = null;
let entryReturnContext = null;
let purchasePdfImportDraft = null;
let transactionEditorInitialSnapshot = "";
let transactionEditorDirty = false;
let transactionLeaveBypass = false;
let pendingTransactionLeaveDialog = null;
let activeTransactionEditorTabNo = 1;
let transactionEditorTabCounters = { sale: 1, purchase: 1, estimate: 1, saleReturn: 1, purchaseReturn: 1 };
let transactionEditorTabs = { sale: [], purchase: [], estimate: [], saleReturn: [], purchaseReturn: [] };
let activeTransactionEditorTabId = null;
let lastCalculatorTarget = null;
let collapsedSidebarGroups = new Set();

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const SIDEBAR_GROUPS = {
  sales: {
    defaultView: "sales",
    views: new Set(["sales", "estimate", "proforma", "paymentIn", "saleOrder", "deliveryChallan", "saleReturn", "pos"]),
  },
  purchases: {
    defaultView: "purchases",
    views: new Set(["purchases", "paymentOut", "expenses", "purchaseOrder", "purchaseReturn"]),
  },
  settings: {
    defaultView: "importItems",
    views: new Set(["settings", "importItems", "setupBusiness", "accountantAccess", "barcodeGenerator", "importParties", "exportItems", "verifyData"]),
  },
};

const DEFAULT_ITEM_UNITS = [
  "Pcs",
  "Nos",
  "Box",
  "Pack",
  "Set",
  "Pair",
  "Kg",
  "Gram",
  "Litre",
  "ML",
  "Meter",
  "Sq Ft",
  "Bundle",
  "Roll",
  "Hr",
  "Day",
  "Month",
  "Service",
];

const DEFAULT_ITEM_CATEGORIES = [
  "Electronics",
  "Computer Accessories",
  "Mobile Accessories",
  "Stationery",
  "Grocery",
  "Food & Beverage",
  "Apparel",
  "Hardware",
  "Electrical",
  "Plumbing",
  "Furniture",
  "Packaging",
  "Service",
  "Labour",
  "Repairs & Maintenance",
  "Rent",
  "Transport",
];

const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Wages",
  "Fuel",
  "Travel",
  "Repairs & Maintenance",
  "Electricity",
  "Telephone & Internet",
  "Office Supplies",
  "Printing & Stationery",
  "Freight & Courier",
  "Bank Charges",
  "Professional Fees",
  "Marketing",
  "Meals",
  "Software Subscription",
  "Miscellaneous",
];

const elements = {
  companyScreen: document.getElementById("companyScreen"),
  appShell: document.getElementById("appShell"),
  activeCompanyName: document.getElementById("activeCompanyName"),
  countryModal: document.getElementById("countryModal"),
  selectCountryButton: document.getElementById("selectCountryButton"),
  countrySelect: document.getElementById("countrySelect"),
  entryModal: document.getElementById("entryModal"),
  entryForm: document.getElementById("entryForm"),
  entryTitle: document.getElementById("entryTitle"),
  addSaleButton: document.getElementById("addSaleButton"),
  addPurchaseButton: document.getElementById("addPurchaseButton"),
  addPartyButton: document.getElementById("addPartyButton"),
  closeEntryButton: document.getElementById("closeEntryButton"),
  cancelEntryButton: document.getElementById("cancelEntryButton"),
  searchInput: document.getElementById("searchInput"),
  openAnythingPanel: document.getElementById("openAnythingPanel"),
  homeView: document.getElementById("homeView"),
  listView: document.getElementById("listView"),
  saleInvoicesView: document.getElementById("saleInvoicesView"),
  purchaseBillsView: document.getElementById("purchaseBillsView"),
  featureView: document.getElementById("featureView"),
  saleSubmenu: document.getElementById("saleSubmenu"),
  purchaseSubmenu: document.getElementById("purchaseSubmenu"),
  utilitiesSubmenu: document.getElementById("utilitiesSubmenu"),
  invoiceAddSaleButton: document.getElementById("invoiceAddSaleButton"),
  invoiceSaleTotal: document.getElementById("invoiceSaleTotal"),
  invoiceReceivedTotal: document.getElementById("invoiceReceivedTotal"),
  invoiceBalanceTotal: document.getElementById("invoiceBalanceTotal"),
  invoiceEmptyPanel: document.getElementById("invoiceEmptyPanel"),
  invoiceTablePanel: document.getElementById("invoiceTablePanel"),
  invoiceTableBody: document.getElementById("invoiceTableBody"),
  saleInvoiceSearchInput: document.getElementById("saleInvoiceSearchInput"),
  invoiceCountTotal: document.getElementById("invoiceCountTotal"),
  invoiceOpenCount: document.getElementById("invoiceOpenCount"),
  firstPurchaseButton: document.getElementById("firstPurchaseButton"),
  purchaseEmptyPanel: document.getElementById("purchaseEmptyPanel"),
  purchaseTablePanel: document.getElementById("purchaseTablePanel"),
  purchaseTableBody: document.getElementById("purchaseTableBody"),
  listTitle: document.getElementById("listTitle"),
  listEyebrow: document.getElementById("listEyebrow"),
  listActionButton: document.getElementById("listActionButton"),
  tableHead: document.getElementById("tableHead"),
  tableBody: document.getElementById("tableBody"),
  emptyTable: document.getElementById("emptyTable"),
  receivableTotal: document.getElementById("receivableTotal"),
  payableTotal: document.getElementById("payableTotal"),
  receivableCaption: document.getElementById("receivableCaption"),
  payableCaption: document.getElementById("payableCaption"),
  saleTotal: document.getElementById("saleTotal"),
  salesChart: document.getElementById("salesChart"),
  refreshButton: document.getElementById("refreshButton"),
  companySearchInput: document.getElementById("companySearchInput"),
  companyRefreshButton: document.getElementById("companyRefreshButton"),
  newCompanyButton: document.getElementById("newCompanyButton"),
  companyModal: document.getElementById("companyModal"),
  companyForm: document.getElementById("companyForm"),
  companyModalTitle: document.getElementById("companyModalTitle"),
  closeCompanyModalButton: document.getElementById("closeCompanyModalButton"),
  cancelCompanyModalButton: document.getElementById("cancelCompanyModalButton"),
};

bindEvents();
initApp();

async function initApp() {
  elements.countryModal.classList.add("hidden");
  elements.companyScreen.classList.add("hidden");
  elements.appShell.classList.add("hidden");

  if (window.giDB) {
    try {
      state = normalizeState(await window.giDB.getState());
    } catch (error) {
      console.error("Unable to load database state", error);
    }
  }

  renderCompanyList();
  const activeCompany = (state.companies || []).find((company) =>
    company.name === state.activeCompany || Boolean(company.isCurrent),
  );
  if (activeCompany?.name) {
    enterAppShell();
  } else {
    showCompanyScreen();
  }
}

function loadState() {
  const fallback = {
    activeCompany: "testt",
    country: "",
    companies: [
      { name: "testt", isCurrent: 1 },
    ],
    transactions: [],
    invoices: [],
    invoiceItems: [],
    estimates: [],
    estimateItems: [],
    payments: [],
    stockMovements: [],
    stockBalances: [],
    bankAccounts: [],
    parties: [],
    items: [],
    units: [],
    itemCategories: [],
    ledgerEntries: [],
    creditNotes: [],
    creditNoteItems: [],
    debitNotes: [],
    debitNoteItems: [],
    businessSettings: defaultBusinessSettings(),
  };

  if (typeof window !== "undefined" && window.giDB) {
    return fallback;
  }

  try {
    const raw = localStorage.getItem(storeKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return normalizeState({ ...fallback, ...parsed });
  } catch {
    return fallback;
  }
}

function saveState() {
  if (typeof window !== "undefined" && window.giDB) {
    try {
      localStorage.removeItem(storeKey);
    } catch {}
    return;
  }
  // Standalone browser preview fallback only (non-production)
}

function normalizeState(nextState) {
  const defaultSettings = defaultBusinessSettings();
  const nextSettings = nextState?.businessSettings || {};
  const normalized = {
    activeCompany: "testt",
    country: "",
    companies: [],
    transactions: [],
    invoices: [],
    invoiceItems: [],
    estimates: [],
    estimateItems: [],
    payments: [],
    stockMovements: [],
    stockBalances: [],
    bankAccounts: [],
    parties: [],
    items: [],
    units: [],
    itemCategories: [],
    ledgerEntries: [],
    creditNotes: [],
    creditNoteItems: [],
    debitNotes: [],
    debitNoteItems: [],
    ...nextState,
    businessSettings: {
      ...defaultSettings,
      ...nextSettings,
      bankDetails: {
        ...defaultSettings.bankDetails,
        ...(nextSettings.bankDetails || {}),
      },
    },
  };
  normalized.transactions = (normalized.transactions || []).map(normalizeTransactionRecord);
  normalized.invoices = (normalized.invoices || []).map(normalizeTransactionRecord);
  normalized.estimates = (normalized.estimates || []).map(normalizeTransactionRecord);
  normalized.creditNotes = (normalized.creditNotes || []).map(normalizeTransactionRecord);
  normalized.debitNotes = (normalized.debitNotes || []).map(normalizeTransactionRecord);
  normalized.businessSettings.customFields = normalizeCustomFieldDefinitions(normalized.businessSettings.customFields);
  return normalized;
}

function normalizeTransactionRecord(record) {
  const meta = parseJsonObject(record?.meta ?? record?.metaJson);
  return {
    ...record,
    meta,
    metaJson: record?.metaJson || (Object.keys(meta).length ? JSON.stringify(meta) : ""),
  };
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function defaultBusinessSettings() {
  return {
    businessName: "testt",
    gstin: "",
    pan: "",
    state: "Karnataka",
    address: "",
    bankDetails: {
      bankName: "",
      accountNo: "",
      ifsc: "",
      upiId: "",
    },
    invoicePrefix: "INV",
    startingNo: 1,
    terms: "",
    customFields: defaultCustomFieldDefinitions(),
  };
}

function defaultCustomFieldDefinitions() {
  return [
    { id: "sale-po-number", module: "sale", label: "PO Number", fieldKey: "poNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 10 },
    { id: "sale-vehicle-number", module: "sale", label: "Vehicle Number", fieldKey: "vehicleNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 20 },
    { id: "sale-delivery-date", module: "sale", label: "Delivery Date", fieldKey: "deliveryDate", fieldType: "date", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 30 },
    { id: "sale-reference-number", module: "sale", label: "Reference Number", fieldKey: "referenceNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 40 },
    { id: "purchase-supplier-bill-ref", module: "purchase", label: "Supplier Bill Ref", fieldKey: "supplierBillRef", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 10 },
    { id: "purchase-po-number", module: "purchase", label: "PO Number", fieldKey: "poNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 20 },
    { id: "estimate-project-name", module: "estimate", label: "Project Name", fieldKey: "projectName", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 10 },
    { id: "estimate-followup-date", module: "estimate", label: "Follow-up Date", fieldKey: "followupDate", fieldType: "date", required: false, showOnPrint: false, showInList: false, active: true, sortOrder: 20 },
  ];
}

function normalizeCustomFieldDefinitions(fields = []) {
  const modules = new Set(["sale", "purchase", "estimate", "saleReturn", "purchaseReturn", "party", "item", "expense"]);
  return (Array.isArray(fields) ? fields : defaultCustomFieldDefinitions())
    .map((field, index) => {
      const label = String(field.label || "").trim();
      const fieldKey = String(field.fieldKey || field.key || customFieldKeyFromLabel(label)).trim();
      if (!label || !fieldKey) return null;
      const module = modules.has(field.module) ? field.module : "sale";
      const fieldType = ["text", "number", "date", "dropdown", "checkbox", "textarea"].includes(field.fieldType) ? field.fieldType : "text";
      return {
        id: String(field.id || `${module}-${fieldKey}`),
        module,
        label,
        fieldKey,
        fieldType,
        options: Array.isArray(field.options) ? field.options.map((option) => String(option).trim()).filter(Boolean) : [],
        required: Boolean(field.required),
        showOnPrint: field.showOnPrint !== false,
        showInList: Boolean(field.showInList),
        active: field.active !== false,
        sortOrder: Number(field.sortOrder ?? index * 10),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.module.localeCompare(b.module) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function customFieldKeyFromLabel(label) {
  const clean = String(label || "").trim();
  return clean
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase())
    || `field${Date.now()}`;
}

function customFieldsForModule(module) {
  return normalizeCustomFieldDefinitions(state.businessSettings?.customFields)
    .filter((field) => field.active && field.module === module)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function collectCustomFieldValues(scope = getTransactionEditorType()) {
  const values = {};
  customFieldsForModule(scope).forEach((field) => {
    const input = elements.featureView.querySelector(`[name="customField:${field.fieldKey}"]`);
    if (!input) return;
    values[field.fieldKey] = field.fieldType === "checkbox" ? input.checked : String(input.value || "").trim();
  });
  return values;
}

function customFieldValue(field, values = {}) {
  return values?.[field.fieldKey] ?? values?.[field.id] ?? "";
}

function transactionEditorMeta(type = getTransactionEditorType()) {
  const meta = {
    sale: {
      noun: "Sale",
      document: "Sale Invoice",
      editTitle: "Edit Sale",
      partyLabel: "Customer",
      partyRole: "customer",
      partyPlaceholder: "Name or phone (optional)",
      partyRequiredHint: "",
      balanceLabel: "Customer Balance",
      numberLabel: "Invoice Number",
      dateLabel: "Invoice Date",
      dueDateLabel: "Due Date",
      saveLabel: "Save Sale",
      updateLabel: "Update Sale",
      paymentAmountLabel: "Received",
      returnView: "sales",
      previewTitle: "Invoice Preview",
      documentTitle: "Tax Invoice",
      stockDirection: "Stock goes OUT",
      accountingContext: "Sales / Revenue / Receivable",
      draftMessage: "Sale Invoice draft restored.",
    },
    purchase: {
      noun: "Purchase",
      document: "Purchase Bill",
      editTitle: "Edit Purchase",
      partyLabel: "Supplier",
      partyRole: "supplier",
      partyPlaceholder: "Supplier name or phone *",
      partyRequiredHint: "",
      balanceLabel: "Supplier Balance",
      numberLabel: "Bill Number",
      dateLabel: "Bill Date",
      dueDateLabel: "Due Date",
      saveLabel: "Save Purchase",
      updateLabel: "Update Purchase",
      paymentAmountLabel: "Paid",
      returnView: "purchases",
      previewTitle: "Bill Preview",
      documentTitle: "Purchase Bill",
      stockDirection: "Stock comes IN",
      accountingContext: "Purchase / Payable / Inventory Cost",
      draftMessage: "Purchase Bill draft restored.",
    },
    estimate: {
      noun: "Quotation",
      document: "Quotation",
      editTitle: "Edit Quotation",
      partyLabel: "Customer",
      partyRole: "customer",
      partyPlaceholder: "Customer name or phone",
      partyRequiredHint: "Required for quote preview and conversion.",
      balanceLabel: "Customer Balance",
      numberLabel: "Quote Number",
      dateLabel: "Quote Date",
      dueDateLabel: "Valid Until",
      saveLabel: "Save Quotation",
      updateLabel: "Update Quotation",
      paymentAmountLabel: "Advance",
      returnView: "estimate",
      previewTitle: "Quotation Preview",
      documentTitle: "Quotation",
      stockDirection: "Stock goes OUT (on conversion)",
      accountingContext: "Quotation / Prospective Sale",
      draftMessage: "Quotation draft restored.",
    },
    saleReturn: {
      noun: "Credit Note",
      document: "Sales Return / Credit Note",
      editTitle: "Edit Credit Note",
      partyLabel: "Customer",
      partyRole: "customer",
      partyPlaceholder: "Customer name or phone",
      partyRequiredHint: "Required to reduce receivable and print customer statement correctly.",
      balanceLabel: "Customer Balance",
      numberLabel: "Credit Note No.",
      dateLabel: "Credit Note Date",
      dueDateLabel: "Refund / Adjust Date",
      saveLabel: "Save Credit Note",
      updateLabel: "Update Credit Note",
      paymentAmountLabel: "Adjusted / Refunded",
      returnView: "saleReturn",
      previewTitle: "Credit Note Preview",
      documentTitle: "Credit Note",
      stockDirection: "Stock comes IN (return)",
      accountingContext: "Sales Return / Receivable Reduction",
      draftMessage: "Credit Note draft restored.",
    },
    purchaseReturn: {
      noun: "Debit Note",
      document: "Purchase Return / Debit Note",
      editTitle: "Edit Debit Note",
      partyLabel: "Supplier",
      partyRole: "supplier",
      partyPlaceholder: "Supplier name or phone",
      partyRequiredHint: "Required to reduce payable and print supplier statement correctly.",
      balanceLabel: "Supplier Balance",
      numberLabel: "Debit Note No.",
      dateLabel: "Debit Note Date",
      dueDateLabel: "Adjustment Date",
      saveLabel: "Save Debit Note",
      updateLabel: "Update Debit Note",
      paymentAmountLabel: "Adjusted / Refunded",
      returnView: "purchaseReturn",
      previewTitle: "Debit Note Preview",
      documentTitle: "Debit Note",
      stockDirection: "Stock goes OUT (return)",
      accountingContext: "Purchase Return / Payable Reduction",
      draftMessage: "Debit Note draft restored.",
    },
    proforma: {
      noun: "Proforma Invoice",
      document: "Proforma Invoice",
      editTitle: "Edit Proforma Invoice",
      partyLabel: "Customer",
      partyRole: "customer",
      partyPlaceholder: "Customer name or phone",
      partyRequiredHint: "Required for proforma preview.",
      balanceLabel: "Customer Balance",
      numberLabel: "Proforma No.",
      dateLabel: "Proforma Date",
      dueDateLabel: "Valid Until",
      saveLabel: "Save Proforma",
      updateLabel: "Update Proforma",
      paymentAmountLabel: "Advance",
      returnView: "proforma",
      previewTitle: "Proforma Invoice Preview",
      documentTitle: "Proforma Invoice",
      stockDirection: "Stock goes OUT (on conversion)",
      accountingContext: "Proforma / Preliminary Invoice",
      draftMessage: "Proforma Invoice draft restored.",
    },
    saleOrder: {
      noun: "Sale Order",
      document: "Sale Order",
      editTitle: "Edit Sale Order",
      partyLabel: "Customer",
      partyRole: "customer",
      partyPlaceholder: "Customer name or phone",
      partyRequiredHint: "Required for order processing.",
      balanceLabel: "Customer Balance",
      numberLabel: "Order No.",
      dateLabel: "Order Date",
      dueDateLabel: "Delivery Due Date",
      saveLabel: "Save Sale Order",
      updateLabel: "Update Sale Order",
      paymentAmountLabel: "Advance",
      returnView: "saleOrder",
      previewTitle: "Sale Order Preview",
      documentTitle: "Sale Order",
      stockDirection: "Stock reserved for delivery",
      accountingContext: "Sales Order / Receivable",
      draftMessage: "Sale Order draft restored.",
    },
    deliveryChallan: {
      noun: "Delivery Challan",
      document: "Delivery Challan",
      editTitle: "Edit Delivery Challan",
      partyLabel: "Customer",
      partyRole: "customer",
      partyPlaceholder: "Customer name or phone",
      partyRequiredHint: "Required for delivery documentation.",
      balanceLabel: "Customer Balance",
      numberLabel: "Challan No.",
      dateLabel: "Challan Date",
      dueDateLabel: "Delivery Date",
      saveLabel: "Save Delivery Challan",
      updateLabel: "Update Delivery Challan",
      paymentAmountLabel: "Advance",
      returnView: "deliveryChallan",
      previewTitle: "Delivery Challan Preview",
      documentTitle: "Delivery Challan",
      stockDirection: "Stock goes OUT (delivery)",
      accountingContext: "Delivery Challan / Goods Dispatch",
      draftMessage: "Delivery Challan draft restored.",
    },
    purchaseOrder: {
      noun: "Purchase Order",
      document: "Purchase Order",
      editTitle: "Edit Purchase Order",
      partyLabel: "Supplier",
      partyRole: "supplier",
      partyPlaceholder: "Supplier name or phone",
      partyRequiredHint: "Required for order processing.",
      balanceLabel: "Supplier Balance",
      numberLabel: "PO Number",
      dateLabel: "PO Date",
      dueDateLabel: "Expected Delivery Date",
      saveLabel: "Save Purchase Order",
      updateLabel: "Update Purchase Order",
      paymentAmountLabel: "Advance",
      returnView: "purchaseOrder",
      previewTitle: "Purchase Order Preview",
      documentTitle: "Purchase Order",
      stockDirection: "Stock expected IN",
      accountingContext: "Purchase Order / Payable",
      draftMessage: "Purchase Order draft restored.",
    },
  };
  return meta[type] || meta.sale;
}

function isOperationalDoc(type) {
  return ["estimate", "proforma", "saleOrder", "sale_order", "deliveryChallan", "delivery_challan", "purchaseOrder", "purchase_order"].includes(type);
}

function sidebarGroupForView(view) {
  return Object.entries(SIDEBAR_GROUPS).find(([, group]) => group.views.has(view))?.[0] || "";
}

function submenuForSidebarGroup(groupName) {
  if (groupName === "sales") return elements.saleSubmenu;
  if (groupName === "purchases") return elements.purchaseSubmenu;
  if (groupName === "settings") return elements.utilitiesSubmenu;
  return null;
}

function syncSidebarNavigation(view) {
  const activeGroup = sidebarGroupForView(view);

  document.querySelectorAll(".nav-item").forEach((button) => {
    const navView = button.dataset.view;
    const isSidebarGroup = Boolean(SIDEBAR_GROUPS[navView]);
    const isActiveGroup = navView === activeGroup;
    button.classList.toggle("active", navView === view || isActiveGroup);
    button.classList.toggle("has-submenu", isSidebarGroup);
    button.classList.toggle("collapsed", isSidebarGroup && collapsedSidebarGroups.has(navView));
    button.classList.toggle("submenu-open", isSidebarGroup && isActiveGroup && !collapsedSidebarGroups.has(navView));
  });

  Object.keys(SIDEBAR_GROUPS).forEach((groupName) => {
    const submenu = submenuForSidebarGroup(groupName);
    if (!submenu) return;
    const shouldShow = activeGroup === groupName && !collapsedSidebarGroups.has(groupName);
    submenu.classList.toggle("hidden", !shouldShow);
  });

  document.querySelectorAll(".submenu-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function handleSidebarNavigation(button) {
  if (!button.closest(".side-nav")) return false;

  const view = button.dataset.view;
  const parentGroup = SIDEBAR_GROUPS[view];
  if (parentGroup && button.classList.contains("nav-item")) {
    const isCurrentGroup = sidebarGroupForView(currentView) === view;
    const submenu = submenuForSidebarGroup(view);
    const isOpen = isCurrentGroup && submenu && !submenu.classList.contains("hidden");

    if (isOpen) {
      collapsedSidebarGroups.add(view);
      syncSidebarNavigation(currentView);
      return true;
    }

    collapsedSidebarGroups.delete(view);
    showView(parentGroup.defaultView);
    return true;
  }

  const childGroup = sidebarGroupForView(view);
  if (childGroup) collapsedSidebarGroups.delete(childGroup);
  showView(view);
  return true;
}

function bindEvents() {
  document.querySelector('.company-switch')?.addEventListener('click', () => window.dispatchEvent(new Event('gi-change-company')));
  document.querySelectorAll(".open-company-button").forEach((button) => {
    button.addEventListener("click", () => openCompany(button.dataset.company));
  });

  elements.newCompanyButton?.addEventListener("click", () => {
    openCompanyModal("create");
  });

  elements.closeCompanyModalButton?.addEventListener("click", closeCompanyModal);
  elements.cancelCompanyModalButton?.addEventListener("click", closeCompanyModal);
  elements.companyForm?.addEventListener("submit", handleCompanyFormSubmit);

  elements.companySearchInput?.addEventListener("input", renderCompanyList);
  elements.companyRefreshButton?.addEventListener("click", refreshCompanyList);

  document.addEventListener("click", () => {
    document.querySelectorAll(".company-action-dropdown").forEach((menu) => menu.classList.add("hidden"));
  });

  elements.selectCountryButton.addEventListener("click", async () => {
    if (window.giDB) {
      try {
        state = normalizeState(await window.giDB.setCountry(elements.countrySelect.value));
      } catch (error) {
        console.error("Unable to save country through database bridge", error);
        state.country = elements.countrySelect.value;
        saveState();
      }
    } else {
      state.country = elements.countrySelect.value;
      saveState();
    }
    elements.countryModal.classList.add("hidden");
  });

  elements.addSaleButton.addEventListener("click", () => openEntryModal("sale"));
  elements.invoiceAddSaleButton?.addEventListener("click", () => openEntryModal("sale"));
  elements.addPurchaseButton.addEventListener("click", () => openEntryModal("purchase"));
  elements.firstPurchaseButton?.addEventListener("click", () => openEntryModal("purchase"));
  elements.addPartyButton.addEventListener("click", () => openEntryModal("party"));
  document.querySelectorAll("[data-home-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.homeAction === "sale") openEntryModal("sale");
      if (button.dataset.homeAction === "purchase") openEntryModal("purchase");
    });
  });
  elements.closeEntryButton.addEventListener("click", closeEntryModal);
  elements.cancelEntryButton.addEventListener("click", closeEntryModal);
  elements.refreshButton?.addEventListener("click", () => {
    renderDashboard();
    renderCurrentList();
    scheduleDashboardChartDraw();
  });

  document.getElementById("periodSelect")?.addEventListener("change", scheduleDashboardChartDraw);
  window.addEventListener("resize", () => {
    if (currentView === "home") scheduleDashboardChartDraw();
  });

  elements.entryForm.addEventListener("submit", handleEntrySubmit);
  elements.searchInput.addEventListener("input", handleGlobalSearchInput);
  elements.searchInput.addEventListener("focus", () => renderOpenAnythingResults());
  elements.searchInput.addEventListener("keydown", handleOpenAnythingKeydown);
  elements.openAnythingPanel.addEventListener("mousedown", (event) => {
    const resultButton = event.target.closest("[data-open-result-index]");
    if (!resultButton) return;
    event.preventDefault();
    executeOpenAnythingResult(Number(resultButton.dataset.openResultIndex));
  });
  document.addEventListener("mousedown", (event) => {
    if (!event.target.closest(".quick-search-wrap")) hideOpenAnythingResults();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "/") {
      event.preventDefault();
      openKeyboardShortcutsDialog();
    }
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (handleSidebarNavigation(button)) return;
      showView(button.dataset.view);
    });
  });

  document.querySelectorAll("[data-report]").forEach((button) => {
    button.addEventListener("click", () => showView("reports", button.dataset.report));
  });

  window.addEventListener("gi-change-company", () => {
    requestTransactionEditorLeave(() => {
      renderCompanyList();
      showCompanyScreen();
    });
  });

  window.addEventListener("gi-refresh", refreshCurrentView);
  window.addEventListener("beforeunload", (event) => {
    if (!shouldBlockTransactionEditorLeave()) return;
    event.preventDefault();
    event.returnValue = "You have unsaved invoice changes.";
  });
}

async function refreshCurrentView() {
  if (window.giDB) {
    try {
      state = normalizeState(await window.giDB.getState());
    } catch (error) {
      console.error("Unable to refresh from database bridge", error);
    }
  }

  renderCompanyList();
  renderDashboard();
  renderCurrentList();
  if (currentView === "sales") renderSaleInvoices();
  if (currentView === "purchases") renderPurchaseBills();
  scheduleDashboardChartDraw();
}

function handleGlobalSearchInput() {
  const query = globalSearchQuery();
  openAnythingActiveIndex = 0;
  renderOpenAnythingResults();
  applySearchToCurrentView(query);
}

function applySearchToCurrentView(query = globalSearchQuery()) {
  if (currentView === "home") {
    return;
  }

  if (currentView === "parties") {
    partySearchQuery = query;
    renderFeatureView("parties");
    return;
  }

  if (currentView === "items") {
    itemSearchQuery = query;
    renderFeatureView("items");
    return;
  }

  if (currentView === "sales") {
    renderSaleInvoices();
    return;
  }

  if (currentView === "purchases") {
    renderPurchaseBills();
    return;
  }

  if (currentView === "expenses") {
    expenseSearchQuery = query;
    renderFeatureView("expenses");
    return;
  }

  renderCurrentList();
}

function renderOpenAnythingResults() {
  const query = globalSearchQuery();
  if (!query) {
    hideOpenAnythingResults();
    return;
  }

  openAnythingResults = buildOpenAnythingResults(query);
  openAnythingActiveIndex = Math.min(openAnythingActiveIndex, Math.max(openAnythingResults.length - 1, 0));

  if (!openAnythingResults.length) {
    elements.openAnythingPanel.innerHTML = `<div class="open-anything-empty">No matches found</div>`;
    elements.openAnythingPanel.classList.remove("hidden");
    return;
  }

  let lastGroup = "";
  elements.openAnythingPanel.innerHTML = openAnythingResults.map((result, index) => {
    const groupHeader = result.group !== lastGroup ? `<div class="open-result-group">${escapeHtml(result.group)}</div>` : "";
    lastGroup = result.group;
    return `
      ${groupHeader}
      <button class="open-result ${index === openAnythingActiveIndex ? "active" : ""}" data-open-result-index="${index}" type="button">
        <span>${escapeHtml(result.title)}</span>
        <small>${escapeHtml(result.meta)}</small>
      </button>
    `;
  }).join("");
  elements.openAnythingPanel.classList.remove("hidden");
  requestAnimationFrame(() => {
    elements.openAnythingPanel.querySelector(".open-result.active")?.scrollIntoView({ block: "nearest" });
  });
}

function buildOpenAnythingResults(query) {
  const pages = [
    { group: "Pages", title: "Home", meta: "Dashboard", kind: "view", view: "home", keywords: "home dashboard" },
    { group: "Pages", title: "Parties", meta: "Customers, suppliers, ledger", kind: "view", view: "parties", keywords: "party parties customer supplier ledger" },
    { group: "Pages", title: "Items", meta: "Inventory and stock ledger", kind: "view", view: "items", keywords: "item items inventory stock product service" },
    { group: "Pages", title: "Sale Invoices", meta: "Sales and receivables", kind: "view", view: "sales", keywords: "sale sales invoice customer receivable" },
    { group: "Pages", title: "Purchase Bills", meta: "Purchases and payables", kind: "view", view: "purchases", keywords: "purchase purchases bill supplier payable" },
    { group: "Pages", title: "Expenses", meta: "Operating costs and input GST", kind: "view", view: "expenses", keywords: "expense expenses rent salary fuel gst payable" },
    { group: "Pages", title: "Reports", meta: "Business reports", kind: "view", view: "reports", keywords: "reports gst stock ledger statement" },
    { group: "Pages", title: "Cash & Bank", meta: "Bank accounts and cash", kind: "view", view: "cash", keywords: "cash bank account" },
    { group: "Pages", title: "Settings", meta: "App settings", kind: "view", view: "appSettings", keywords: "settings preferences tax print" },
  ];

  const actions = [
    { group: "Actions", title: "Add Party", meta: "Create customer, supplier or GST party", kind: "modal", modal: "party", keywords: "add party customer supplier gst" },
    { group: "Actions", title: "Add Item", meta: "Create product or service", kind: "modal", modal: "item", keywords: "add item product service stock" },
    { group: "Actions", title: "Add Sale", meta: "Create sale invoice", kind: "modal", modal: "sale", keywords: "add sale invoice customer" },
    { group: "Actions", title: "Add Purchase", meta: "Create purchase bill", kind: "modal", modal: "purchase", keywords: "add purchase bill supplier" },
    { group: "Actions", title: "Add Expense", meta: "Record operating cost", kind: "expense", keywords: "add expense rent salary fuel gst" },
  ];

  const parties = (state.parties || []).map((party) => ({
    group: "Parties",
    title: party.name,
    meta: `${partyRole(party).label} - ${party.phone || "No phone"}`,
    kind: "party",
    partyId: party.id,
    keywords: [party.name, party.phone, partyRole(party).label].filter(Boolean).join(" "),
  }));

  const items = (state.items || []).map((item) => ({
    group: "Items",
    title: item.name,
    meta: `${itemKind(item).label} - Stock ${formatQuantity(item.currentStock || 0)}`,
    kind: "item",
    itemId: item.id,
    keywords: [item.name, item.sku, item.hsnSac, item.category, item.unit, item.description, itemKind(item).label].filter(Boolean).join(" "),
  }));

  const invoices = (state.invoices || []).map((invoice) => ({
    group: "Invoices",
    title: invoice.invoiceNo,
    meta: `${titleCase(invoice.type)} - ${invoice.party} - ${formatCurrency(invoice.total || 0)}`,
    kind: "invoice",
    invoiceType: invoice.type,
    keywords: [invoice.invoiceNo, invoice.party, invoice.type, invoice.status, invoice.total].filter(Boolean).join(" "),
  }));

  return [...pages, ...actions, ...parties, ...items, ...invoices]
    .map((result) => ({ ...result, score: openAnythingScore(result, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => openAnythingGroupOrder(a.group) - openAnythingGroupOrder(b.group) || b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 24);
}

function openAnythingGroupOrder(group) {
  return {
    Pages: 1,
    Actions: 2,
    Parties: 3,
    Items: 4,
    Invoices: 5,
  }[group] || 99;
}

function openAnythingScore(result, query) {
  const title = String(result.title || "").toLowerCase();
  const haystack = `${title} ${String(result.keywords || "")} ${String(result.meta || "")}`.toLowerCase();
  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (haystack.includes(query)) return 50;
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length && words.every((word) => haystack.includes(word))) return 35;
  return 0;
}

function handleOpenAnythingKeydown(event) {
  if (elements.openAnythingPanel.classList.contains("hidden")) return;
  if (!openAnythingResults.length && event.key !== "Escape") return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    openAnythingActiveIndex = Math.min(openAnythingActiveIndex + 1, openAnythingResults.length - 1);
    renderOpenAnythingResults();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    openAnythingActiveIndex = Math.max(openAnythingActiveIndex - 1, 0);
    renderOpenAnythingResults();
  } else if (event.key === "Enter") {
    event.preventDefault();
    executeOpenAnythingResult(openAnythingActiveIndex);
  } else if (event.key === "Escape") {
    event.preventDefault();
    elements.searchInput.value = "";
    hideOpenAnythingResults();
    applySearchToCurrentView("");
  }
}

function executeOpenAnythingResult(index) {
  const result = openAnythingResults[index];
  if (!result) return;
  if (!transactionLeaveBypass && shouldBlockTransactionEditorLeave() && openAnythingResultLeavesEditor(result)) {
    requestTransactionEditorLeave(() => executeOpenAnythingResult(index));
    return;
  }

  hideOpenAnythingResults();
  elements.searchInput.blur();

  if (result.kind === "view") {
    elements.searchInput.value = "";
    partySearchQuery = "";
    itemSearchQuery = "";
    showView(result.view);
    return;
  }

  if (result.kind === "modal") {
    elements.searchInput.value = "";
    partySearchQuery = "";
    itemSearchQuery = "";
    applySearchToCurrentView("");
    openEntryModal(result.modal);
    return;
  }

  if (result.kind === "expense") {
    elements.searchInput.value = "";
    showView("expenses");
    requestAnimationFrame(() => openExpenseModal());
    return;
  }

  if (result.kind === "party") {
    elements.searchInput.value = result.title;
    partySearchQuery = result.title;
    showView("parties");
    elements.featureView.innerHTML = partiesTemplate(result.partyId, "overview", partySearchQuery);
    bindFeatureActions();
    return;
  }

  if (result.kind === "item") {
    elements.searchInput.value = result.title;
    itemSearchQuery = result.title;
    showView("items");
    elements.featureView.innerHTML = itemsTemplate(result.itemId, "overview", itemSearchQuery);
    bindFeatureActions();
    return;
  }

  if (result.kind === "invoice") {
    elements.searchInput.value = result.title;
    showView(result.invoiceType === "purchase" ? "purchases" : "sales");
  }
}

function openAnythingResultLeavesEditor(result) {
  if (!result) return false;
  if (result.kind === "modal") return result.modal === "sale" || result.modal === "purchase";
  return ["view", "party", "item", "invoice", "expense"].includes(result.kind);
}

function hideOpenAnythingResults() {
  openAnythingResults = [];
  openAnythingActiveIndex = 0;
  elements.openAnythingPanel.classList.add("hidden");
}

function openCompanyModal(mode = "create", companyId = null) {
  if (!elements.companyModal || !elements.companyForm) return;
  elements.companyForm.reset();
  const form = elements.companyForm;
  form.companyId.value = "";

  if (mode === "edit" && companyId) {
    if (elements.companyModalTitle) elements.companyModalTitle.textContent = "Edit Business Profile";
    const company = (state.companies || []).find((c) => String(c.id) === String(companyId) || c.name === companyId);
    const settings = (company && (company.name === state.activeCompany || company.isCurrent))
      ? (state.businessSettings || {})
      : (company || {});

    form.companyId.value = company?.id || companyId || "";
    form.businessName.value = company?.businessName || settings.businessName || company?.name || "";
    form.legalName.value = settings.legalName || "";
    form.gstin.value = settings.gstin || "";
    form.pan.value = settings.pan || "";
    if (settings.state && form.state) form.state.value = settings.state;
    form.phone.value = settings.phone || "";
    form.email.value = settings.email || "";
    form.address.value = settings.address || "";
    form.city.value = settings.city || "";
    form.pincode.value = settings.pincode || "";
    form.bankName.value = settings.bankDetails?.bankName || "";
    form.accountNo.value = settings.bankDetails?.accountNo || "";
    form.ifsc.value = settings.bankDetails?.ifsc || "";
    form.upiId.value = settings.bankDetails?.upiId || "";
  } else {
    if (elements.companyModalTitle) elements.companyModalTitle.textContent = "Create Business Profile";
    if (form.state) form.state.value = "Karnataka";
  }

  elements.companyModal.classList.remove("hidden");
  setTimeout(() => form.businessName?.focus(), 50);
}

function closeCompanyModal() {
  elements.companyModal?.classList.add("hidden");
  elements.companyForm?.reset();
}

async function handleCompanyFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.companyForm);
  const companyId = formData.get("companyId");
  const businessName = String(formData.get("businessName") || "").trim();
  if (!businessName) {
    showToast("Business name is required.");
    return;
  }

  const profile = {
    businessName,
    legalName: String(formData.get("legalName") || "").trim(),
    gstin: String(formData.get("gstin") || "").trim().toUpperCase(),
    pan: String(formData.get("pan") || "").trim().toUpperCase(),
    state: String(formData.get("state") || "Karnataka").trim(),
    phone: String(formData.get("phone") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    pincode: String(formData.get("pincode") || "").trim(),
    bankDetails: {
      bankName: String(formData.get("bankName") || "").trim(),
      accountNo: String(formData.get("accountNo") || "").trim(),
      ifsc: String(formData.get("ifsc") || "").trim().toUpperCase(),
      upiId: String(formData.get("upiId") || "").trim(),
    },
  };

  try {
    if (companyId) {
      if (window.giDB?.updateCompanyProfile) {
        state = normalizeState(await window.giDB.updateCompanyProfile(companyId, profile));
      } else if (window.giDB?.updateBusinessSettings) {
        state = normalizeState(await window.giDB.updateBusinessSettings(profile));
      }
      showToast("Company profile updated.");
    } else {
      if (window.giDB?.createCompany) {
        state = normalizeState(await window.giDB.createCompany(profile));
      } else {
        await openCompany(businessName);
      }
      showToast(`Company "${businessName}" created.`);
    }
    closeCompanyModal();
    renderCompanyList();
    if (state.businessSettings?.businessName && elements.activeCompanyName) {
      elements.activeCompanyName.textContent = state.businessSettings.businessName;
    }
  } catch (error) {
    console.error("Unable to save company profile", error);
    showToast(error.message || "Failed to save company profile.");
  }
}

function renderCompanyList() {
  const companyList = document.querySelector(".company-list");
  if (!companyList) return;

  const query = String(elements.companySearchInput?.value || "").trim().toLowerCase();
  const companies = (state.companies || []).filter((company) => (
    String(company.businessName || company.name || "").toLowerCase().includes(query) ||
    String(company.gstin || "").toLowerCase().includes(query)
  ));

  if (!companies.length) {
    companyList.innerHTML = `
      <div class="company-list-empty">
        <strong>${query ? "No matching companies" : "No companies found"}</strong>
        <span>${query ? "Try a different search term." : "Create a company to start billing."}</span>
      </div>
    `;
    return;
  }

  companyList.innerHTML = companies
    .map((company) => {
      const isCurrent = company.name === state.activeCompany || company.isCurrent;
      const displayName = company.businessName || company.name;
      const subInfo = [
        company.gstin ? `GSTIN: ${company.gstin}` : null,
        company.state || null,
      ].filter(Boolean).join(" • ");
      const cid = company.id || company.name;

      return `
        <article class="company-row" data-company-id="${company.id || ''}" data-company-name="${escapeHtml(company.name)}">
          <div class="company-info-col">
            <div style="display:flex;align-items:center;gap:8px;">
              <strong>${escapeHtml(displayName)}</strong>
              ${isCurrent ? '<span class="company-badge current">Active</span>' : ""}
            </div>
            ${subInfo ? `<div class="company-subinfo">${escapeHtml(subInfo)}</div>` : ""}
          </div>
          <span class="sync-status">LOCAL DATA</span>
          <button class="open-company-button" data-company="${escapeHtml(company.name)}" type="button">Open</button>
          <div class="company-action-wrap">
            <button class="row-menu" type="button" aria-label="Company actions" data-action-toggle="${cid}">
              <svg class="gi-icon"><use href="#gi-more"></use></svg>
            </button>
            <div class="company-action-dropdown hidden" id="actionMenu-${cid}">
              <button type="button" data-company-action="edit" data-company-id="${company.id || ''}" data-company-name="${escapeHtml(company.name)}">
                <svg class="gi-icon" style="width:14px;height:14px;margin-right:6px;"><use href="#gi-edit"></use></svg>Edit Profile
              </button>
              <button type="button" data-company-action="backup" data-company-id="${company.id || ''}" data-company-name="${escapeHtml(company.name)}">
                <svg class="gi-icon" style="width:14px;height:14px;margin-right:6px;"><use href="#gi-database"></use></svg>Backup Data
              </button>
              <button type="button" class="danger-item" data-company-action="delete" data-company-id="${company.id || ''}" data-company-name="${escapeHtml(company.name)}">
                <svg class="gi-icon" style="width:14px;height:14px;margin-right:6px;"><use href="#gi-trash"></use></svg>Delete Company
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  companyList.querySelectorAll(".open-company-button").forEach((button) => {
    button.addEventListener("click", () => openCompany(button.dataset.company));
  });

  companyList.querySelectorAll("[data-action-toggle]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const menuId = button.dataset.actionToggle;
      const targetMenu = document.getElementById(`actionMenu-${menuId}`);
      companyList.querySelectorAll(".company-action-dropdown").forEach((m) => {
        if (m !== targetMenu) m.classList.add("hidden");
      });
      targetMenu?.classList.toggle("hidden");
    });
  });

  companyList.querySelectorAll("[data-company-action]").forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = button.dataset.companyAction;
      const cid = button.dataset.companyId;
      const cname = button.dataset.companyName;
      button.closest(".company-action-dropdown")?.classList.add("hidden");

      if (action === "edit") {
        openCompanyModal("edit", cid || cname);
      } else if (action === "backup") {
        try {
          if (window.giDB?.createBackup) {
            const res = await window.giDB.createBackup();
            showToast(`Backup saved: ${res?.path || "Success"}`);
          } else {
            showToast("Backup saved successfully.");
          }
        } catch (err) {
          showToast("Failed to create backup.");
        }
      } else if (action === "delete") {
        if ((state.companies || []).length <= 1) {
          showToast("Cannot delete the only remaining company.");
          return;
        }
        if (!confirm(`Are you sure you want to permanently delete company "${cname}"? All data for this company will be removed.`)) {
          return;
        }
        try {
          if (window.giDB?.deleteCompany) {
            state = normalizeState(await window.giDB.deleteCompany(cid || cname));
            showToast(`Company "${cname}" deleted.`);
            renderCompanyList();
          }
        } catch (err) {
          showToast(err.message || "Unable to delete company.");
        }
      }
    });
  });
}

async function refreshCompanyList() {
  elements.companyRefreshButton?.classList.add("is-refreshing");
  try {
    if (window.giDB) state = normalizeState(await window.giDB.getState());
    renderCompanyList();
  } catch (error) {
    console.error("Unable to refresh company list", error);
    showToast("Unable to refresh companies.");
  } finally {
    elements.companyRefreshButton?.classList.remove("is-refreshing");
  }
}

function showCompanyScreen() {
  elements.companyScreen.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  elements.countryModal.classList.add("hidden");
}

function enterAppShell() {
  const activeCompany = state.activeCompany || state.companies?.[0]?.name || "testt";
  currentView = "home";
  document.body.dataset.view = "home";
  elements.activeCompanyName.textContent = state.businessSettings?.businessName || activeCompany;
  elements.companyScreen.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.countryModal.classList.add("hidden");
  showView("home");
  renderDashboard();
  scheduleDashboardChartDraw();
}

async function openCompany(name) {
  if (window.giDB) {
    try {
      state = normalizeState(await window.giDB.setCurrentCompany(name));
      renderCompanyList();
    } catch (error) {
      console.error("Unable to switch company through database bridge", error);
      state.activeCompany = name;
      saveState();
    }
  } else {
    state.activeCompany = name;
    saveState();
  }
  elements.activeCompanyName.textContent = state.businessSettings?.businessName || name;
  enterAppShell();
}

function openEntryModal(type, record = null, options = {}) {
  if (type === "sale" || type === "purchase" || type === "estimate") {
    openTransactionEditor(type);
    return;
  }

  hideEditorLookupPanels();
  elements.openAnythingPanel?.classList.add("hidden");
  currentEntryType = type;
  currentEntryRecordId = record?.id || null;
  entryReturnContext = options.returnContext || null;
  const labels = {
    sale: "Add Sale",
    purchase: "Add Purchase",
    party: "Add Party",
    item: "Add Item",
  };
  const editLabels = {
    party: "Edit Party",
    item: "Edit Item",
  };

  elements.entryTitle.textContent = currentEntryRecordId ? (editLabels[type] || labels[type] || "Edit Entry") : (labels[type] || "Add Entry");
  document.body.dataset.entryType = type;
  document.body.dataset.entryMode = currentEntryRecordId ? "edit" : "add";
  elements.entryForm.reset();
  clearInlineErrors(elements.entryForm);
  elements.entryModal.classList.remove("hidden");

  const amount = elements.entryForm.querySelector('[name="amount"]');
  const party = elements.entryForm.querySelector('[name="party"]');
  const item = elements.entryForm.querySelector('[name="item"]');
  const status = elements.entryForm.querySelector('[name="status"]');
  party.closest("label").style.display = type === "item" ? "none" : "";
  amount.closest("label").style.display = type === "party" || type === "item" ? "none" : "";
  item.closest("label").style.display = type === "party" ? "none" : "";
  status.closest("label").style.display = type === "party" || type === "item" ? "none" : "";
  elements.entryForm.querySelectorAll(".party-only").forEach((field) => {
    field.style.display = type === "party" ? "grid" : "none";
  });
  elements.entryForm.querySelectorAll(".item-only").forEach((field) => {
    field.style.display = type === "item" ? "grid" : "none";
  });
  party.required = type !== "item";
  item.required = type !== "party";
  amount.required = type !== "party" && type !== "item";
  bindPartyEntryFields();
  updatePartyTaxFields();
  bindItemEntryFields();
  updateItemEntryFields();
  if (currentEntryRecordId) populateEntryForm(type, record);
  if (options.draft) populateEntryDraft(type, options.draft);
  const submitButton = elements.entryForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = currentEntryRecordId ? "Update" : "Save";
}

function openTransactionEditor(type, options = {}) {
  if (!options.skipDirtyCheck && !transactionLeaveBypass && shouldBlockTransactionEditorLeave()) {
    requestTransactionEditorLeave(() => openTransactionEditor(type, options));
    return;
  }
  currentEntryType = type;
  activeTransactionEditorType = type;
  const activeTab = activateTransactionEditorTab(type, options);
  activeTransactionEditInvoiceId = activeTab.editInvoiceId || null;
  activeTransactionEditorTabNo = activeTab.no || 1;
  currentView = `${type}Editor`;
  document.body.dataset.view = currentView;
  document.querySelector(".topbar")?.classList.add("hidden");
  elements.homeView.classList.add("hidden");
  document.querySelector(".right-panel").classList.add("hidden");
  elements.listView.classList.add("hidden");
  elements.saleInvoicesView.classList.add("hidden");
  elements.purchaseBillsView.classList.add("hidden");
  elements.featureView.classList.remove("hidden");
  elements.featureView.innerHTML = transactionEditorTemplate(type);
  bindTransactionEditor();
  const savedDraft = options.draft || activeTab.draft || options.editInvoiceId || options.newTab ? null : loadTransactionDraft(type);
  const draft = options.draft || activeTab.draft || savedDraft;
  if (draft) populateTransactionEditorDraft(draft);
  recalcTransactionEditor();
  resetTransactionEditorDirtyState();
  if (savedDraft) showToast(transactionEditorMeta(type).draftMessage);
  if (options.newTab) showToast(`${transactionEditorMeta(type).noun} #${activeTransactionEditorTabNo} opened.`);
}

function activateTransactionEditorTab(type, options = {}) {
  transactionEditorTabs[type] ||= [];
  const tabs = transactionEditorTabs[type];
  if (options.tabId) {
    const existing = tabs.find((tab) => tab.id === options.tabId);
    if (existing) {
      activeTransactionEditorTabId = existing.id;
      return existing;
    }
  }

  if (options.editInvoiceId) {
    const existingEditTab = tabs.find((tab) => String(tab.editInvoiceId || "") === String(options.editInvoiceId));
    if (existingEditTab) {
      if (options.draft) existingEditTab.draft = options.draft;
      activeTransactionEditorTabId = existingEditTab.id;
      return existingEditTab;
    }
    const tab = createTransactionEditorTab(type, {
      draft: options.draft || null,
      editInvoiceId: options.editInvoiceId,
      label: `${transactionEditorMeta(type).noun} Edit`,
    });
    tabs.push(tab);
    activeTransactionEditorTabId = tab.id;
    return tab;
  }

  if (options.newTab || options.draft) {
    const tab = createTransactionEditorTab(type, { draft: options.draft || null });
    tabs.push(tab);
    activeTransactionEditorTabId = tab.id;
    return tab;
  }

  let activeTab = tabs.find((tab) => tab.id === activeTransactionEditorTabId);
  if (!activeTab) {
    activeTab = tabs[0] || createTransactionEditorTab(type, { no: 1 });
    if (!tabs.includes(activeTab)) tabs.push(activeTab);
    activeTransactionEditorTabId = activeTab.id;
  }
  return activeTab;
}

function createTransactionEditorTab(type, options = {}) {
  const currentCounter = Math.max(Number(transactionEditorTabCounters[type] || 1), 1);
  const no = options.no || (transactionEditorTabs[type]?.length ? currentCounter + 1 : currentCounter);
  transactionEditorTabCounters[type] = Math.max(currentCounter, no);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    no,
    label: options.label || "",
    draft: options.draft || null,
    editInvoiceId: options.editInvoiceId || null,
  };
}

function saveActiveTransactionTabSnapshot() {
  if (!isTransactionEditorView() || !activeTransactionEditorTabId) return;
  const type = getTransactionEditorType();
  const tab = (transactionEditorTabs[type] || []).find((item) => item.id === activeTransactionEditorTabId);
  if (!tab) return;
  tab.draft = collectCurrentTransactionDraft();
  tab.editInvoiceId = activeTransactionEditInvoiceId || tab.editInvoiceId || null;
}

function transactionEditorTabLabel(type, tab) {
  if (tab.label) return tab.label;
  return `${transactionEditorMeta(type).noun} #${tab.no || 1}`;
}

function switchTransactionEditorTab(tabId) {
  const type = getTransactionEditorType();
  if (tabId === activeTransactionEditorTabId) return;
  const tab = (transactionEditorTabs[type] || []).find((item) => item.id === tabId);
  if (!tab) return;
  saveActiveTransactionTabSnapshot();
  openTransactionEditor(type, { tabId, skipDirtyCheck: true });
}

function closeTransactionEditorTab(tabId) {
  const type = getTransactionEditorType();
  const tabs = transactionEditorTabs[type] || [];
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex < 0) return;

  if (tabs.length === 1) {
    const editorType = getTransactionEditorType();
    requestTransactionEditorClose(transactionEditorMeta(editorType).returnView);
    return;
  }

  if (tabId === activeTransactionEditorTabId && shouldBlockTransactionEditorLeave()) {
    const shouldClose = confirm("Close this invoice tab? Unsaved changes in this tab will be discarded.");
    if (!shouldClose) return;
  } else {
    saveActiveTransactionTabSnapshot();
  }

  tabs.splice(tabIndex, 1);
  const nextTab = tabs[Math.max(0, Math.min(tabIndex, tabs.length - 1))];
  activeTransactionEditorTabId = nextTab.id;
  openTransactionEditor(type, { tabId: nextTab.id, skipDirtyCheck: true });
}

function transactionEditorTemplate(type) {
  const isSale = type === "sale";
  const isEstimate = type === "estimate";
  const isReturn = type === "saleReturn" || type === "purchaseReturn";
  const isSaleLike = isSale || type === "saleReturn";
  const isEditing = Boolean(activeTransactionEditInvoiceId);
  const meta = transactionEditorMeta(type);
  const title = isEditing ? meta.editTitle : meta.noun;
  const partyLabel = meta.partyLabel;
  const saveLabel = isEditing ? meta.updateLabel : meta.saveLabel;
  const invoiceLabel = meta.numberLabel;
  const dateLabel = meta.dateLabel;
  const paymentLabel = meta.paymentAmountLabel;
  const today = new Date().toLocaleDateString("en-GB");
  const editorTabs = transactionEditorTabs[type] || [];

  return `
    <section class="transaction-editor ${escapeHtml(type)}-editor">
      <header class="transaction-editor-head">
        <div class="editor-tab-strip">
          <div class="editor-tabs-scroll">
            ${editorTabs.map((tab) => `
              <div class="editor-doc-tab ${tab.id === activeTransactionEditorTabId ? "active" : ""}" data-editor-tab-id="${escapeHtml(tab.id)}" role="button" tabindex="0">
                <span>${escapeHtml(transactionEditorTabLabel(type, tab))}</span>
                <button type="button" data-editor-tab-close="${escapeHtml(tab.id)}" aria-label="Close ${escapeHtml(transactionEditorTabLabel(type, tab))}">${icon("x")}</button>
              </div>
            `).join("")}
          </div>
          <button class="editor-tab-add" data-editor-action="new-tab" type="button" aria-label="New ${escapeHtml(meta.noun.toLowerCase())}">${icon("plus")}</button>
          <div class="editor-header-tools">
            <button class="editor-tool-button calculator" data-editor-action="calculator" type="button" aria-label="Calculator">${icon("calculator")}</button>
            <button class="editor-tool-button settings" data-editor-action="settings" type="button" aria-label="Invoice settings">${icon("settings")}</button>
            <button class="editor-tool-button close" id="closeTransactionEditor" type="button" aria-label="Close editor">${icon("x")}</button>
          </div>
        </div>
        <div class="editor-mode-strip">
          <div class="editor-mode-left">
            <strong>${title}</strong>
            ${isEstimate ? '<span class="editor-document-chip">Estimate / Quotation</span>' : isReturn ? '<span class="editor-document-chip return-chip">Sales Return / Credit Note</span>' : `<div class="editor-payment-toggle" role="group" aria-label="Payment type">
              <input id="editorPaymentQuickToggle" type="checkbox" class="hidden" checked aria-hidden="true" tabindex="-1">
              <button type="button" data-payment-mode="credit" aria-pressed="false">Credit</button>
              <button type="button" data-payment-mode="cash" aria-pressed="true">Paid</button>
            </div>`}
          </div>
        </div>
      </header>

      <form id="transactionEditorForm" class="transaction-editor-form">
        <section class="editor-top-grid">
          <article class="editor-card editor-party-card">
            <div class="editor-card-title">
              <strong>${partyLabel}</strong>
              <span>${meta.balanceLabel}: <b>-</b></span>
            </div>
            <label class="editor-party-name-label"><span>${meta.partyLabel} Name <span data-party-required-marker></span></span>
              <div class="editor-lookup">
                <input class="form-input" name="party" placeholder="${meta.partyPlaceholder}" autocomplete="off">
                <div class="editor-lookup-panel hidden" id="editorPartyLookup"></div>
              </div>
              <small class="editor-field-hint" data-party-required-hint></small>
            </label>
            <label>Phone
              <div class="editor-lookup">
                <input class="form-input" name="phone" placeholder="Search phone to select">
                <div class="editor-lookup-panel hidden" id="editorPhoneLookup"></div>
              </div>
            </label>
          </article>

          <article class="editor-card editor-meta-card">
            <div class="editor-card-title">
              <strong>Document</strong>
              <span>Auto numbered</span>
            </div>
            <div class="editor-meta-grid">
              <label>${invoiceLabel}<input class="form-input" name="invoiceNo" value="Auto"></label>
              <label>${dateLabel}<input class="form-input" name="invoiceDate" value="${today}"></label>
              <label>GST Supply<select class="form-input" name="supplyType"><option value="b2c">B2C / Unregistered</option><option value="b2b">B2B / Registered</option><option value="export">Export</option><option value="sez">SEZ</option></select></label>
              <label>Place of Supply<select class="form-input" name="state"><option value="">Select</option>${indianStateOptions(state.businessSettings?.state || "Karnataka")}</select></label>
              ${isReturn ? '<label>Against Invoice<input class="form-input" name="originalInvoiceNo" placeholder="Original invoice no"></label><input type="hidden" name="originalInvoiceId">' : ""}
            </div>
          </article>

          <details class="editor-more-details">
            <summary><span>${icon("file-plus")} More details</span><small></small>${icon("chevron-down")}</summary>
            <div class="editor-more-details-grid">
              <label>Billing Address<textarea name="address" rows="3" placeholder="Auto-filled from selected ${escapeHtml(meta.partyRole)}"></textarea></label>
              <label>Payment Terms<select class="form-input" name="paymentTerms"><option>Due on receipt</option><option>Net 7</option><option>Net 15</option><option selected>Net 30</option><option>Net 45</option><option>Net 60</option></select></label>
              <label>${meta.dueDateLabel}<input class="form-input" name="dueDate" value="${today}"></label>
              <label>Party GSTIN<input class="form-input" name="partyGstin" readonly placeholder="Auto from party master"></label>
              <label class="editor-more-notes">${isEstimate ? "Quote Notes" : "Invoice Notes"}<textarea name="invoiceDescription" rows="3" placeholder="Optional notes printed on the document"></textarea></label>
            </div>
            ${transactionCustomFieldsSection(type)}
          </details>
        </section>



        <section class="editor-items-panel">
          <div class="editor-table-toolbar">
            <strong>Items</strong>
            <button class="outline-mini-button" id="addEditorRow" type="button">${icon("plus")} Add Row</button>
          </div>
          <div class="editor-table-wrap">
            <table class="editor-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Price</th>
                  ${isSaleLike ? '<th>Purchase</th>' : ''}
                  <th>Discount</th>
                  <th>Tax</th>
                  <th>Line Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="transactionRows">
                ${editorRowTemplate(1)}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3">Total Qty</td>
                  <td id="editorQtyTotal">0</td>
                  <td colspan="${isSaleLike ? 5 : 4}">Total</td>
                  <td id="editorTableTotal">0</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section class="editor-bottom-grid">
          <aside class="editor-side-actions">
            ${type === "purchase" ? '<label class="purchase-default-option"><input type="checkbox" name="updatePurchaseDefaults"> Update default purchase prices</label>' : ''}
            <button type="button" class="disabled-action" data-editor-extra="description">${icon("file-plus")} ${isEstimate ? "Quote Notes" : "Notes"}</button>
            <button type="button" class="disabled-action" data-editor-extra="image">${icon("image")} Image</button>
            <button type="button" class="disabled-action" data-editor-extra="document">${icon("paperclip")} Document</button>
            <input class="hidden" id="editorImageInput" type="file" accept="image/*" multiple>
            <input class="hidden" id="editorDocumentInput" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*" multiple>
            <div class="editor-attachment-list hidden" id="editorAttachmentList"></div>
          </aside>
          <aside class="editor-smart-panel">
            <div><strong>Compliance Check</strong><span>Statutory</span></div>
            <ul id="editorSmartChecks"></ul>
          </aside>
          <aside class="editor-totals">
            <input type="hidden" name="paymentType" id="editorPaymentType" value="${isEstimate ? "quote" : isReturn ? "return" : "cash"}">
            ${isEstimate ? "" : `<label class="editor-payment-method-line">${isReturn ? "Adjustment Method" : "Payment Method"}<select class="form-input" name="paymentMethod" id="editorPaymentMethod"><option>${isReturn ? "Adjustment" : "Cash"}</option><option>Cash</option><option>Bank</option><option>UPI</option></select></label>`}
            <div class="editor-total-line"><span>Subtotal</span><strong id="editorSubtotal">0.00</strong></div>
            <div class="editor-total-line"><span>Discount</span><strong id="editorDiscountTotal">0.00</strong></div>
            <div class="editor-total-line"><span>Tax</span><strong id="editorTaxTotal">0.00</strong></div>
            <div class="editor-gst-split">
              <span>CGST <b id="editorCgstTotal">0.00</b></span>
              <span>SGST <b id="editorSgstTotal">0.00</b></span>
              <span>IGST <b id="editorIgstTotal">0.00</b></span>
            </div>
            <label class="editor-roundoff-line"><span><input id="roundOffToggle" type="checkbox" checked> Round Off</span><input id="editorRoundOffValue" class="tiny-input" value="0.00" readonly></label>
            <label class="editor-grand-total-line">Grand Total <input id="editorGrandTotal" class="form-input" readonly></label>
            ${isEstimate ? '<div class="editor-quote-note">No stock or ledger posting until converted.</div><input id="editorReceived" class="hidden" type="number" value="0">' : `<label class="editor-paid-line">${paymentLabel} <input id="editorReceived" class="form-input" type="number" min="0" step="0.01" value="0"></label>
            <strong>${type === "purchase" ? "Amount Payable" : "Balance Due"} <span id="editorBalance">0</span></strong>`}
          </aside>
        </section>
          <footer class="transaction-editor-actions compact-editor-actions">
            <div class="actions-spacer"></div>
            <button class="secondary-button editor-footer-btn" data-editor-action="preview" type="button" title="Preview">${icon("eye")} Preview</button>
            <button class="secondary-button editor-footer-btn print-footer-btn" data-save-mode="print" type="submit" title="Save &amp; Print (Ctrl+P)">${icon("printer")} Save &amp; Print</button>
            <div class="editor-split-action save-split-action">
              <button class="editor-split-main" data-save-mode="close" type="submit" title="${escapeHtml(saveLabel)} (Ctrl+S)">${icon("check")} <span class="save-main-text">${escapeHtml(saveLabel)}</span></button>
              <details class="editor-split-menu" id="editorSaveSplitMenu">
                <summary aria-label="Save options" title="More save options"></summary>
                <div>
                  ${isEditing ? "" : `<button data-save-mode="new" type="submit">${icon("plus")} Save &amp; New</button>`}
                  <button data-editor-action="draft" type="button">${icon("file-plus")} Save Draft</button>
                </div>
              </details>
            </div>
          </footer>
      </form>
    </section>
  `;
}

function transactionCustomFieldsSection(type) {
  const fields = customFieldsForModule(type);
  if (!fields.length) return "";
  return `
    <section class="editor-custom-fields-panel">
      <div class="editor-table-toolbar">
        <strong>Additional Fields</strong>
      </div>
      <div class="editor-custom-fields-grid">
        ${fields.map((field) => transactionCustomFieldControl(field)).join("")}
      </div>
    </section>
  `;
}

function transactionCustomFieldControl(field, value = "") {
  const name = `customField:${field.fieldKey}`;
  const required = field.required ? "required" : "";
  const label = `${escapeHtml(field.label)}${field.required ? " *" : ""}`;
  if (field.fieldType === "textarea") {
    return `<label>${label}<textarea class="form-input" name="${escapeHtml(name)}" rows="2" ${required}>${escapeHtml(value)}</textarea></label>`;
  }
  if (field.fieldType === "dropdown") {
    return `<label>${label}<select class="form-input" name="${escapeHtml(name)}" ${required}><option value="">Select</option>${(field.options || []).map((option) => `<option ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  if (field.fieldType === "checkbox") {
    return `<label class="custom-field-checkbox"><input name="${escapeHtml(name)}" type="checkbox" ${value ? "checked" : ""}> ${label}</label>`;
  }
  const inputType = field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text";
  return `<label>${label}<input class="form-input" name="${escapeHtml(name)}" type="${inputType}" value="${escapeHtml(value)}" ${required}></label>`;
}

function editorRowTemplate(index, item = "", description = "", qty = "", price = "") {
  const isSaleLike = currentView === "saleEditor" || currentView === "estimateEditor" || currentView === "saleReturnEditor";
  return `
    <tr>
      <td>${index}</td>
      <td class="editor-item-field"><div class="editor-item-cell"><input name="item" value="${escapeHtml(item)}" placeholder="Search item or SKU" autocomplete="off"><div class="editor-lookup-panel editor-item-lookup hidden"></div><small class="row-smart-hint"></small><div class="purchase-price-history"></div></div></td>
      <td><details class="editor-row-description" ${description ? "open" : ""}><summary>Description</summary><input name="description" aria-label="Item description" value="${escapeHtml(description)}" placeholder="Optional description"></details></td>
      <td><input name="qty" aria-label="Quantity" placeholder="0" type="number" min="0" step="0.01" value="${qty}"></td>
      <td><select name="unit">${editorUnitOptionsMarkup()}</select></td>
      <td><input name="price" aria-label="Unit price" placeholder="0.00" type="number" min="0" step="0.01" value="${price}"></td>
      ${isSaleLike ? '<td class="row-purchase-price">-</td>' : ''}
      <td><input name="discount" type="number" min="0" step="0.01" value="0"></td>
      <td><select name="tax">${editorTaxOptionsMarkup()}</select></td>
      <td class="row-amount">0</td>
      <td><button class="row-delete-button" type="button" aria-label="Remove item row">${icon("trash")}</button></td>
    </tr>
  `;
}

function populateTransactionEditorDraft(draft) {
  if (!draft) return;
  elements.featureView.querySelector('#transactionEditorForm').dataset.sourceEstimateId = draft.sourceEstimateId || '';
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const phoneInput = elements.featureView.querySelector('[name="phone"]');
  const addressInput = elements.featureView.querySelector('[name="address"]');
  const invoiceNoInput = elements.featureView.querySelector('[name="invoiceNo"]');
  const invoiceDateInput = elements.featureView.querySelector('[name="invoiceDate"]');
  const paymentTermsInput = elements.featureView.querySelector('[name="paymentTerms"]');
  const dueDateInput = elements.featureView.querySelector('[name="dueDate"]');
  const stateInput = elements.featureView.querySelector('[name="state"]');
  const supplyTypeInput = elements.featureView.querySelector('[name="supplyType"]');
  const partyGstinInput = elements.featureView.querySelector('[name="partyGstin"]');
  const originalInvoiceIdInput = elements.featureView.querySelector('[name="originalInvoiceId"]');
  const originalInvoiceNoInput = elements.featureView.querySelector('[name="originalInvoiceNo"]');
  const descriptionInput = elements.featureView.querySelector('[name="invoiceDescription"]');
  const paymentTypeInput = elements.featureView.querySelector("#editorPaymentType");
  const paymentMethodInput = elements.featureView.querySelector("#editorPaymentMethod");
  const paymentAmountInput = elements.featureView.querySelector("#editorReceived");
  const matchedParty = findPartyByName(draft.party);
  const roundOffToggle = elements.featureView.querySelector('#roundOffToggle');
  if (roundOffToggle && typeof draft.roundOff === 'boolean') roundOffToggle.checked = draft.roundOff;

  if (matchedParty) {
    selectTransactionParty(matchedParty, { keepLookupOpen: true });
  } else if (partyInput) {
    partyInput.value = draft.party || "";
    delete partyInput.dataset.selectedPartyId;
  }

  if (phoneInput && draft.phone) phoneInput.value = draft.phone;
  if (addressInput && draft.billingAddress) addressInput.value = draft.billingAddress;
  if (invoiceNoInput && draft.invoiceNo) invoiceNoInput.value = draft.invoiceNo;
  if (invoiceDateInput && draft.invoiceDate) invoiceDateInput.value = toEditorDateString(draft.invoiceDate);
  if (paymentTermsInput && draft.paymentTerms) ensureSelectValue(paymentTermsInput, draft.paymentTerms);
  if (dueDateInput && draft.dueDate) dueDateInput.value = toEditorDateString(draft.dueDate);
  if (stateInput && draft.state) ensureSelectValue(stateInput, draft.state);
  if (supplyTypeInput && draft.supplyType) supplyTypeInput.value = draft.supplyType;
  if (partyGstinInput && draft.partyGstin) partyGstinInput.value = draft.partyGstin;
  if (originalInvoiceIdInput && draft.originalInvoiceId) originalInvoiceIdInput.value = draft.originalInvoiceId;
  if (originalInvoiceNoInput && draft.originalInvoiceNo) originalInvoiceNoInput.value = draft.originalInvoiceNo;
  if (descriptionInput && draft.invoiceDescription) {
    descriptionInput.value = draft.invoiceDescription;
    const panel = elements.featureView.querySelector(".editor-more-details");
    if (panel) panel.open = true;
    elements.featureView.querySelector('[data-editor-extra="description"]')?.classList.add("active");
  }
  if (paymentTypeInput && draft.paymentType) paymentTypeInput.value = draft.paymentType;
  if (paymentMethodInput && draft.paymentMethod) ensureSelectValue(paymentMethodInput, draft.paymentMethod);

  const body = elements.featureView.querySelector("#transactionRows");
  const rows = Array.isArray(draft.items) && draft.items.length ? draft.items : [{}];
  if (body) {
    body.innerHTML = rows.map((row, index) => editorRowTemplate(
      index + 1,
      row.item || "",
      row.description || "",
      row.qty || "",
      row.price ?? "",
    )).join("");
    bindTransactionEditorRows();
    [...body.querySelectorAll("tr")].forEach((rowElement, index) => {
      const row = rows[index] || {};
      const itemInput = rowElement.querySelector('[name="item"]');
      const matchedItem = findItemByName(row.item) || (row.itemId ? (state.items || []).find((item) => Number(item.id) === Number(row.itemId)) : null);
      if (itemInput && matchedItem && matchedItem.name === itemInput.value) {
        itemInput.dataset.selectedItemId = matchedItem.id;
        rowElement.dataset.smartItem = matchedItem.name;
        renderPurchasePriceHistory(rowElement, matchedItem);
      }
      if (row.unit) ensureSelectValue(rowElement.querySelector('[name="unit"]'), row.unit);
      const discount = rowElement.querySelector('[name="discount"]');
      if (discount && row.discount !== undefined) discount.value = Number(row.discount || 0);
      const tax = rowElement.querySelector('[name="tax"]');
      if (tax) ensureSelectValue(tax, taxOptionLabel(row.taxRate));
    });
  }

  if (paymentAmountInput && draft.received !== undefined) {
    paymentAmountInput.value = Number(draft.received || 0).toFixed(2);
    paymentAmountInput.dataset.manualPayment = "true";
  }
  populateCustomFieldValues(draft.customFields || draft.meta?.customFields || {});

  applyEditorPartyIntelligence();
  syncEditorPartyRequirement();
  renderTransactionSmartChecks();
}

function populateCustomFieldValues(values = {}) {
  customFieldsForModule(getTransactionEditorType()).forEach((field) => {
    const input = elements.featureView.querySelector(`[name="customField:${field.fieldKey}"]`);
    if (!input) return;
    const value = customFieldValue(field, values);
    if (field.fieldType === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value || "";
    }
  });
}

function bindEditorColumnResize() {
  const table = elements.featureView.querySelector('.editor-table');
  if (!table || table.querySelector('colgroup')) return;
  const headers = [...table.querySelectorAll('thead th')];
  const key = 'gi-editor-column-widths-v1';
  const minimums = [36, 180, 110, 70, 76, 90, 90, 90, 110, 36];
  const group = document.createElement('colgroup');
  headers.forEach(() => group.append(document.createElement('col')));
  table.prepend(group);
  let widths;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved) && saved.length === headers.length && saved.every((value, i) => Number.isFinite(value) && value >= minimums[i] && value <= 1200)) widths = saved;
  } catch { /* Column preferences are optional. */ }
  const apply = () => {
    table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
    table.style.minWidth = '0';
    headers.forEach((header, i) => {
      header.style.width = `${widths[i]}px`;
      group.children[i].style.width = `${widths[i]}px`;
    });
  };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(widths)); } catch { /* Keep session widths when storage is unavailable. */ } };
  if (widths) apply();
  headers.forEach((header, index) => {
    const handle = document.createElement('span');
    handle.className = 'editor-column-resizer';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `Resize ${header.textContent.trim() || 'actions'} column`);
    handle.title = 'Drag to resize; double-click to reset columns';
    const measure = () => { if (!widths) widths = headers.map((cell, i) => Math.max(minimums[i], cell.getBoundingClientRect().width)); };
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      hideEditorLookupPanels();
      measure();
      const start = event.clientX;
      const original = widths[index];
      handle.setPointerCapture(event.pointerId);
      handle.onpointermove = (move) => {
        widths[index] = Math.max(minimums[index], Math.min(1200, original + move.clientX - start));
        apply();
      };
      handle.onpointerup = handle.onpointercancel = () => {
        handle.onpointermove = null;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        save();
      };
    };
    handle.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      measure();
      widths[index] = Math.max(minimums[index], Math.min(1200, widths[index] + (event.key === 'ArrowRight' ? 10 : -10)));
      hideEditorLookupPanels();
      apply();
      save();
    };
    handle.ondblclick = () => {
      try { localStorage.removeItem(key); } catch { /* Optional preference. */ }
      widths = undefined;
      table.style.width = '';
      table.style.minWidth = '';
      headers.forEach((cell, i) => { cell.style.width = ''; group.children[i].style.width = ''; });
      hideEditorLookupPanels();
    };
    header.append(handle);
  });
}

function bindTransactionEditor() {
  bindEditorColumnResize();
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const phoneInput = elements.featureView.querySelector('[name="phone"]');
  partyInput?.addEventListener("input", () => handleEditorPartyLookupInput("party"));
  partyInput?.addEventListener("focus", () => renderPartyLookupPanel("party"));
  phoneInput?.addEventListener("input", () => handleEditorPartyLookupInput("phone"));
  phoneInput?.addEventListener("focus", () => renderPartyLookupPanel("phone"));
  elements.featureView.querySelector('[name="paymentTerms"]')?.addEventListener("change", syncDueDateFromPaymentTerms);
  elements.featureView.querySelector('[name="invoiceDate"]')?.addEventListener("change", syncDueDateFromPaymentTerms);
  elements.featureView.querySelector('[name="state"]')?.addEventListener("change", recalcTransactionEditor);
  elements.featureView.querySelector('[name="supplyType"]')?.addEventListener("change", renderTransactionSmartChecks);
  elements.featureView.querySelector("#editorPaymentType")?.addEventListener("change", () => {
    const paymentAmount = elements.featureView.querySelector("#editorReceived");
    if (paymentAmount) paymentAmount.dataset.manualPayment = "";
    syncEditorPartyRequirement();
    syncEditorPaymentQuickToggle();
    recalcTransactionEditor();
  });
  elements.featureView.querySelector("#editorPaymentQuickToggle")?.addEventListener("change", (event) => {
    const paymentType = elements.featureView.querySelector("#editorPaymentType");
    const paymentAmount = elements.featureView.querySelector("#editorReceived");
    if (paymentType) paymentType.value = event.currentTarget.checked ? "cash" : "credit";
    if (paymentAmount) paymentAmount.dataset.manualPayment = "";
    syncEditorPartyRequirement();
    syncEditorPaymentQuickToggle();
    recalcTransactionEditor();
  });
  elements.featureView.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const toggle = elements.featureView.querySelector("#editorPaymentQuickToggle");
      toggle.checked = button.dataset.paymentMode === "cash";
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  elements.featureView.querySelector("#editorReceived")?.addEventListener("input", () => {
    const paymentAmount = elements.featureView.querySelector("#editorReceived");
    if (paymentAmount) paymentAmount.dataset.manualPayment = "true";
  });
  elements.featureView.querySelectorAll("[data-editor-action]").forEach((button) => {
    button.addEventListener("click", () => handleEditorAction(button.dataset.editorAction));
  });
  elements.featureView.querySelectorAll("[data-editor-tab-id]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      if (event.target.closest("[data-editor-tab-close]")) return;
      switchTransactionEditorTab(tab.dataset.editorTabId);
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      switchTransactionEditorTab(tab.dataset.editorTabId);
    });
  });
  elements.featureView.querySelectorAll("[data-editor-tab-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTransactionEditorTab(button.dataset.editorTabClose);
    });
  });
  elements.featureView.querySelectorAll(".editor-split-menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      elements.featureView.querySelectorAll(".editor-split-menu").forEach((otherMenu) => {
        if (otherMenu !== menu) otherMenu.open = false;
      });
    });
  });
  const handleMenuDismissalClick = (event) => {
    if (!elements.featureView.querySelector(".editor-split-menu[open]")) return;
    if (event.target.closest(".editor-split-action")) return;
    closeEditorActionMenus();
  };
  const handleMenuDismissalKey = (event) => {
    if (event.key === "Escape") {
      closeEditorActionMenus();
    }
  };
  document.addEventListener("click", handleMenuDismissalClick);
  document.addEventListener("keydown", handleMenuDismissalKey);
  elements.featureView.querySelectorAll("[data-editor-extra]").forEach((button) => {
    button.addEventListener("click", () => handleEditorExtraAction(button.dataset.editorExtra));
  });
  elements.featureView.querySelector("#editorImageInput")?.addEventListener("change", () => {
    renderEditorAttachmentList();
    updateTransactionEditorDirtyState();
    if (editorAttachmentNames("image").length) showToast("Image attached.");
  });
  elements.featureView.querySelector("#editorDocumentInput")?.addEventListener("change", () => {
    renderEditorAttachmentList();
    updateTransactionEditorDirtyState();
    if (editorAttachmentNames("document").length) showToast("Document attached.");
  });

  elements.featureView.querySelectorAll("#closeTransactionEditor, [data-editor-close]").forEach((button) => button.addEventListener("click", () => {
    const editorType = getTransactionEditorType();
    requestTransactionEditorClose(transactionEditorMeta(editorType).returnView);
  }));

  elements.featureView.querySelector("#addEditorRow")?.addEventListener("click", () => {
    addTransactionEditorRow();
  });

  const form = elements.featureView.querySelector("#transactionEditorForm");
  form?.addEventListener("submit", saveTransactionEditor);
  form?.addEventListener("input", updateTransactionEditorDirtyState);
  form?.addEventListener("change", updateTransactionEditorDirtyState);
  form?.addEventListener("keydown", handleTransactionEditorKeys);
  form?.addEventListener("mousedown", handleEditorLookupAction);
  elements.featureView.querySelector(".editor-table-wrap")?.addEventListener("scroll", hideEditorLookupPanels);
  form?.addEventListener("focusin", (event) => {
    if (event.target.matches('input[type="number"]:not([readonly])')) {
      lastCalculatorTarget = event.target;
    }
    if (!event.target.closest(".editor-lookup") && !event.target.closest(".editor-item-cell")) {
      hideEditorLookupPanels();
    }
  });
  bindTransactionEditorRows();
  syncEditorPartyRequirement();
  syncEditorPaymentQuickToggle();
  applyEditorPartyIntelligence();
  applyEditorRowsIntelligence();
}

function isTransactionEditorView() {
  return currentView === "saleEditor" || currentView === "purchaseEditor" || currentView === "estimateEditor" || currentView === "saleReturnEditor" || currentView === "purchaseReturnEditor";
}

function captureTransactionEditorSnapshot() {
  const form = elements.featureView.querySelector("#transactionEditorForm");
  if (!form || !isTransactionEditorView()) return "";
  const fields = {};
  new FormData(form).forEach((value, key) => {
    if (!fields[key]) fields[key] = [];
    fields[key].push(String(value));
  });
  const rows = [...elements.featureView.querySelectorAll("#transactionRows tr")].map((row) => ({
    item: row.querySelector('[name="item"]')?.value || "",
    selectedItemId: row.querySelector('[name="item"]')?.dataset.selectedItemId || "",
    description: row.querySelector('[name="description"]')?.value || "",
    qty: row.querySelector('[name="qty"]')?.value || "",
    unit: row.querySelector('[name="unit"]')?.value || "",
    price: row.querySelector('[name="price"]')?.value || "",
    discount: row.querySelector('[name="discount"]')?.value || "",
    tax: row.querySelector('[name="tax"]')?.value || "",
  }));
  const partyInput = elements.featureView.querySelector('[name="party"]');
  return JSON.stringify({
    editorType: getTransactionEditorType(),
    selectedPartyId: partyInput?.dataset.selectedPartyId || "",
    fields,
    rows,
    attachments: editorAttachmentNames().map((file) => `${file.kind}:${file.name}:${file.size}`),
  });
}

function resetTransactionEditorDirtyState() {
  transactionEditorInitialSnapshot = captureTransactionEditorSnapshot();
  transactionEditorDirty = false;
  updateTransactionEditorDirtyIndicator();
}

function updateTransactionEditorDirtyState() {
  if (!isTransactionEditorView() || !transactionEditorInitialSnapshot) return;
  transactionEditorDirty = captureTransactionEditorSnapshot() !== transactionEditorInitialSnapshot;
  updateTransactionEditorDirtyIndicator();
}

function updateTransactionEditorDirtyIndicator() {
  const editor = elements.featureView.querySelector(".transaction-editor");
  editor?.classList.toggle("has-unsaved-changes", transactionEditorDirty);
}

function shouldBlockTransactionEditorLeave() {
  return isTransactionEditorView() && transactionEditorDirty;
}

function requestTransactionEditorClose(targetView) {
  requestTransactionEditorLeave(() => showView(targetView));
}

function requestTransactionEditorLeave(continueAction) {
  if (!shouldBlockTransactionEditorLeave()) {
    continueAction?.();
    return Promise.resolve(true);
  }

  return openTransactionLeaveDialog().then((choice) => {
    if (choice === "cancel") return false;
    if (choice === "draft") {
      saveCurrentTransactionDraft();
    }
    if (choice === "discard") {
      clearTransactionDraft(getTransactionEditorType());
      transactionEditorDirty = false;
      updateTransactionEditorDirtyIndicator();
    }
    transactionLeaveBypass = true;
    try {
      continueAction?.();
    } finally {
      transactionLeaveBypass = false;
    }
    return true;
  });
}

function openTransactionLeaveDialog() {
  if (pendingTransactionLeaveDialog) return pendingTransactionLeaveDialog;
  const editorType = getTransactionEditorType();
  const label = transactionEditorMeta(editorType).document;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop unsaved-editor-backdrop";
  backdrop.innerHTML = `
    <section class="unsaved-editor-dialog" role="dialog" aria-modal="true" aria-label="Unsaved invoice">
      <header>
        <div>
          <span>Unsaved ${escapeHtml(label)}</span>
          <strong>Save this work before leaving?</strong>
        </div>
      </header>
      <p>You have unsaved changes in this ${escapeHtml(label.toLowerCase())}. Save it as a draft, discard it, or continue editing.</p>
      <footer>
        <button class="secondary-button" type="button" data-unsaved-choice="cancel">Cancel</button>
        <button class="danger-outline-button" type="button" data-unsaved-choice="discard">Discard</button>
        <button class="primary-button square" type="button" data-unsaved-choice="draft">Save Draft</button>
      </footer>
    </section>
  `;
  document.body.append(backdrop);
  pendingTransactionLeaveDialog = new Promise((resolve) => {
    let handleEscape = () => {};
    const close = (choice) => {
      document.removeEventListener("keydown", handleEscape);
      backdrop.remove();
      pendingTransactionLeaveDialog = null;
      resolve(choice);
    };
    backdrop.querySelectorAll("[data-unsaved-choice]").forEach((button) => {
      button.addEventListener("click", () => close(button.dataset.unsavedChoice));
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close("cancel");
    });
    handleEscape = (event) => {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", handleEscape);
      close("cancel");
    };
    document.addEventListener("keydown", handleEscape);
  });
  return pendingTransactionLeaveDialog;
}

function transactionDraftKey(type = getTransactionEditorType()) {
  return `${storeKey}:transactionDraft:${state.activeCompany || "default"}:${type}`;
}

function collectCurrentTransactionDraft() {
  const formElement = elements.featureView.querySelector("#transactionEditorForm");
  if (!formElement) return null;
  const form = new FormData(formElement);
  return {
    savedAt: new Date().toISOString(),
    editorType: getTransactionEditorType(),
    party: String(form.get("party") || "").trim(),
    phone: String(form.get("phone") || "").trim(),
    billingAddress: String(form.get("address") || "").trim(),
    invoiceNo: String(form.get("invoiceNo") || "").trim(),
    invoiceDate: String(form.get("invoiceDate") || "").trim(),
    paymentTerms: String(form.get("paymentTerms") || "").trim(),
    dueDate: String(form.get("dueDate") || "").trim(),
    state: String(form.get("state") || "").trim(),
    supplyType: String(form.get("supplyType") || "").trim(),
    partyGstin: String(form.get("partyGstin") || "").trim(),
    paymentType: String(form.get("paymentType") || "cash"),
    paymentMethod: String(form.get("paymentMethod") || "Cash"),
    received: Number(elements.featureView.querySelector("#editorReceived")?.value || 0),
    invoiceDescription: String(form.get("invoiceDescription") || "").trim(),
    customFields: collectCustomFieldValues(getTransactionEditorType()),
    attachmentNames: editorAttachmentNames().map((file) => ({ kind: file.kind, label: file.label, name: file.name, size: file.size })),
    items: [...elements.featureView.querySelectorAll("#transactionRows tr")].map((row) => ({
      item: row.querySelector('[name="item"]')?.value.trim() || "",
      itemId: row.querySelector('[name="item"]')?.dataset.selectedItemId || "",
      description: row.querySelector('[name="description"]')?.value.trim() || "",
      qty: row.querySelector('[name="qty"]')?.value || "",
      unit: row.querySelector('[name="unit"]')?.value || "",
      price: row.querySelector('[name="price"]')?.value || "",
      discount: row.querySelector('[name="discount"]')?.value || "",
      taxRate: parseTaxRate(row.querySelector('[name="tax"]')?.value || ""),
    })),
  };
}

function saveCurrentTransactionDraft() {
  const draft = collectCurrentTransactionDraft();
  if (!draft) return;
  localStorage.setItem(transactionDraftKey(draft.editorType), JSON.stringify(draft));
  resetTransactionEditorDirtyState();
  showToast("Draft saved.");
}

function loadTransactionDraft(type) {
  try {
    const raw = localStorage.getItem(transactionDraftKey(type));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Unable to load invoice draft", error);
    return null;
  }
}

function clearTransactionDraft(type = getTransactionEditorType()) {
  localStorage.removeItem(transactionDraftKey(type));
}

function handleEditorExtraAction(action) {
  if (action === "description") {
    const panel = elements.featureView.querySelector(".editor-more-details");
    const button = elements.featureView.querySelector('[data-editor-extra="description"]');
    if (!panel) return;
    panel.open = true;
    button?.classList.add("active");
    panel.querySelector('[name="invoiceDescription"]')?.focus();
    return;
  }
  if (action === "image") {
    elements.featureView.querySelector("#editorImageInput")?.click();
    return;
  }
  if (action === "document") {
    elements.featureView.querySelector("#editorDocumentInput")?.click();
  }
}

function editorAttachmentNames(kind) {
  const imageInput = elements.featureView.querySelector("#editorImageInput");
  const documentInput = elements.featureView.querySelector("#editorDocumentInput");
  const images = Array.from(imageInput?.files || []).map((file) => ({ kind: "image", label: "Image", name: file.name, size: file.size }));
  const documents = Array.from(documentInput?.files || []).map((file) => ({ kind: "document", label: "Document", name: file.name, size: file.size }));
  const files = [...images, ...documents];
  return kind ? files.filter((file) => file.kind === kind) : files;
}

function formatAttachmentSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderEditorAttachmentList() {
  const list = elements.featureView.querySelector("#editorAttachmentList");
  if (!list) return;
  const files = editorAttachmentNames();
  list.classList.toggle("hidden", !files.length);
  list.innerHTML = files.map((file) => `
    <div class="editor-attachment-chip">
      <span>${escapeHtml(file.label)}</span>
      <strong>${escapeHtml(file.name)}</strong>
      <small>${escapeHtml(formatAttachmentSize(file.size))}</small>
    </div>
  `).join("");
  elements.featureView.querySelector('[data-editor-extra="image"]')?.classList.toggle("active", editorAttachmentNames("image").length > 0);
  elements.featureView.querySelector('[data-editor-extra="document"]')?.classList.toggle("active", editorAttachmentNames("document").length > 0);
}

function editorAttachmentSummary() {
  const files = editorAttachmentNames();
  if (!files.length) return "";
  return `Attachments: ${files.map((file) => `${file.label} - ${file.name}`).join(", ")}`;
}

function closeEditorActionMenus() {
  elements.featureView.querySelectorAll(".editor-split-menu[open]").forEach((menu) => {
    menu.open = false;
  });
}

function handleEditorAction(action) {
  closeEditorActionMenus();
  if (action === "new-tab") {
    saveActiveTransactionTabSnapshot();
    openTransactionEditor(getTransactionEditorType(), { newTab: true, skipDirtyCheck: true });
    return;
  }
  if (action === "calculator") {
    openInvoiceCalculator();
    return;
  }
  if (action === "settings") {
    openInvoiceSettingsDrawer();
    return;
  }
  if (action === "draft") {
    saveCurrentTransactionDraft();
    return;
  }
  if (action === "preview") {
    openInvoicePreviewModal();
    return;
  }
  const labels = {
    print: "Save & Print will save first, then open print preview.",
    share: "WhatsApp/Email share placeholder. Message templates will connect here.",
  };
  showToast(labels[action] || "Action coming soon.");
}

function openInvoiceCalculator() {
  document.getElementById("invoiceSettingsDrawer")?.remove();
  const existing = document.getElementById("invoiceCalculatorPopover");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("section");
  panel.className = "invoice-calculator-popover";
  panel.id = "invoiceCalculatorPopover";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Calculator");
  panel.innerHTML = `
    <header>
      <div class="calc-header-left">
        <strong>Calculator</strong>
        <span class="calc-drag-hint">drag</span>
      </div>
      <button type="button" data-calc-close aria-label="Close calculator">${icon("x")}</button>
    </header>
    <div class="calculator-display-container">
      <div class="calculator-history" data-calc-history></div>
      <div class="calculator-display" data-calc-display>0</div>
    </div>
    <div class="calculator-grid">
      <button type="button" class="calc-btn-action" data-calc-action="clear" title="Clear (C)">C</button>
      <button type="button" class="calc-btn-action" data-calc-action="back" title="Backspace (⌫)">⌫</button>
      <button type="button" class="calc-btn-op" data-calc-value="%" title="Percentage (%)">%</button>
      <button type="button" class="calc-btn-op" data-calc-value="/" title="Divide (÷)">÷</button>
      <button type="button" class="calc-btn-num" data-calc-value="7">7</button>
      <button type="button" class="calc-btn-num" data-calc-value="8">8</button>
      <button type="button" class="calc-btn-num" data-calc-value="9">9</button>
      <button type="button" class="calc-btn-op" data-calc-value="*" title="Multiply (×)">×</button>
      <button type="button" class="calc-btn-num" data-calc-value="4">4</button>
      <button type="button" class="calc-btn-num" data-calc-value="5">5</button>
      <button type="button" class="calc-btn-num" data-calc-value="6">6</button>
      <button type="button" class="calc-btn-op" data-calc-value="-" title="Subtract (−)">−</button>
      <button type="button" class="calc-btn-num" data-calc-value="1">1</button>
      <button type="button" class="calc-btn-num" data-calc-value="2">2</button>
      <button type="button" class="calc-btn-num" data-calc-value="3">3</button>
      <button type="button" class="calc-btn-op" data-calc-value="+" title="Add (+)">+</button>
      <button type="button" class="calc-btn-num" data-calc-value="0">0</button>
      <button type="button" class="calc-btn-num" data-calc-value="00">00</button>
      <button type="button" class="calc-btn-num" data-calc-value=".">.</button>
      <button type="button" class="calc-btn-equals" data-calc-action="equals" title="Calculate (=)">=</button>
    </div>
    <footer>
      <button class="secondary-button" type="button" data-calc-copy>${icon("copy")} Copy</button>
      <button class="primary-button square" type="button" data-calc-apply>${icon("check")} Use Result</button>
    </footer>
  `;
  document.body.append(panel);
  bindInvoiceCalculator(panel);
}

function bindInvoiceCalculator(panel) {
  let expression = "";
  let lastResult = null;
  const historyEl = panel.querySelector("[data-calc-history]");
  const displayEl = panel.querySelector("[data-calc-display]");

  const formatDisplay = (expr) => {
    if (!expr) return "0";
    return expr
      .replace(/\*/g, " × ")
      .replace(/\//g, " ÷ ")
      .replace(/\+/g, " + ")
      .replace(/-/g, " − ");
  };

  const updateUI = () => {
    if (displayEl) displayEl.textContent = formatDisplay(expression) || "0";
  };

  const showError = (msg = "Error") => {
    if (displayEl) displayEl.textContent = msg;
    expression = "";
    lastResult = null;
  };

  const closeCalculator = () => {
    document.removeEventListener("keydown", handleKeyDown);
    panel.remove();
  };

  panel.querySelector("[data-calc-close]")?.addEventListener("click", closeCalculator);

  // Dragging support
  const header = panel.querySelector("header");
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  header?.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    panel.style.left = `${initialLeft}px`;
    panel.style.top = `${initialTop}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.classList.add("is-dragging");

    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      panel.style.left = `${Math.max(8, Math.min(maxLeft, initialLeft + dx))}px`;
      panel.style.top = `${Math.max(8, Math.min(maxTop, initialTop + dy))}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      panel.classList.remove("is-dragging");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  const handleInput = (val) => {
    const isOp = ["+", "-", "*", "/", "%"].includes(val);
    if (!isOp) {
      if (lastResult !== null) {
        expression = "";
        lastResult = null;
        if (historyEl) historyEl.textContent = "";
      }
      if (val === ".") {
        const parts = expression.split(/[+\-*/%]/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.includes(".")) return;
        if (!lastPart) expression += "0";
      } else if (val === "0" || val === "00") {
        const parts = expression.split(/[+\-*/%]/);
        const lastPart = parts[parts.length - 1];
        if (lastPart === "0") return;
      }
      expression += val;
      updateUI();
      return;
    }

    if (lastResult !== null) {
      expression = String(lastResult);
      lastResult = null;
    }
    if (!expression) {
      if (val === "-") {
        expression = "-";
        updateUI();
      }
      return;
    }
    if (/[+\-*/%]$/.test(expression)) {
      expression = expression.slice(0, -1) + val;
    } else {
      expression += val;
    }
    updateUI();
  };

  const handleEquals = () => {
    if (!expression) return;
    try {
      const cleanExpr = expression.replace(/[+\-*/.]+$/, "");
      if (!cleanExpr) return;
      const res = calculateExpression(cleanExpr);
      if (historyEl) historyEl.textContent = `${formatDisplay(cleanExpr)} =`;
      lastResult = res;
      expression = res;
      if (displayEl) displayEl.textContent = res;
    } catch (err) {
      showError();
    }
  };

  panel.addEventListener("click", (event) => {
    const valBtn = event.target.closest("[data-calc-value]");
    const actionBtn = event.target.closest("[data-calc-action]");
    if (valBtn) {
      handleInput(valBtn.dataset.calcValue);
      return;
    }
    if (!actionBtn) return;
    const action = actionBtn.dataset.calcAction;
    if (action === "clear") {
      expression = "";
      lastResult = null;
      if (historyEl) historyEl.textContent = "";
      updateUI();
      return;
    }
    if (action === "back") {
      if (lastResult !== null) {
        expression = "";
        lastResult = null;
        if (historyEl) historyEl.textContent = "";
      } else {
        expression = expression.slice(0, -1);
      }
      updateUI();
      return;
    }
    if (action === "equals") {
      handleEquals();
    }
  });

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeCalculator();
      return;
    }
    if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      handleEquals();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (lastResult !== null) {
        expression = "";
        lastResult = null;
        if (historyEl) historyEl.textContent = "";
      } else {
        expression = expression.slice(0, -1);
      }
      updateUI();
      return;
    }
    if (e.key.toLowerCase() === "c" || e.key === "Delete") {
      e.preventDefault();
      expression = "";
      lastResult = null;
      if (historyEl) historyEl.textContent = "";
      updateUI();
      return;
    }
    if (/^[0-9]$/.test(e.key) || e.key === "." || ["+", "-", "*", "/", "%"].includes(e.key)) {
      e.preventDefault();
      handleInput(e.key);
      return;
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  panel.querySelector("[data-calc-copy]")?.addEventListener("click", async () => {
    const val = displayEl ? displayEl.textContent.trim() : "0";
    try {
      await navigator.clipboard?.writeText(val);
      showToast("Calculator result copied.");
    } catch {
      showToast("Unable to copy result.");
    }
  });

  panel.querySelector("[data-calc-apply]")?.addEventListener("click", () => {
    if (expression && /[+\-*/%]/.test(expression)) {
      handleEquals();
    }
    let val = displayEl ? displayEl.textContent.trim() : "0";
    if (val === "Error" || !val) return;
    const target = lastCalculatorTarget?.isConnected
      ? lastCalculatorTarget
      : elements.featureView.querySelector("#editorReceived");
    if (!target) {
      showToast("Focus an amount field before using the result.");
      return;
    }
    target.value = val;
    target.dataset.manualPayment = "true";
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    showToast("Calculator result applied.");
  });
}

function calculateExpression(expression) {
  let expr = String(expression || "").trim();
  if (!expr) throw new Error("Empty expression");

  expr = expr.replace(/[+\-*/.]+$/, "").trim();
  if (!expr) throw new Error("Empty expression");

  expr = expr.replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)%/g, "($1 $2 ($1 * $3 / 100))");
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*([*/])\s*(\d+(?:\.\d+)?)%/g, "($1 $2 ($3 / 100))");
  expr = expr.replace(/(\d+(?:\.\d+)?)%/g, "($1 / 100)");

  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    throw new Error("Invalid expression");
  }

  const result = Function(`"use strict"; return (${expr});`)();
  if (!Number.isFinite(result)) throw new Error("Invalid result");

  const rounded = Number(Math.round(result + "e+8") + "e-8");
  return String(rounded);
}

function openInvoiceSettingsDrawer() {
  requestTransactionEditorLeave(() => showView("appSettings"));
}

async function handleBusinessSettingsSubmit(event) {
  event.preventDefault();
  clearInlineErrors(event.currentTarget);
  const form = new FormData(event.currentTarget);
  const businessNameField = event.currentTarget.querySelector('[name="businessName"]');
  const stateField = event.currentTarget.querySelector('[name="state"]');
  const invoicePrefixField = event.currentTarget.querySelector('[name="invoicePrefix"]');
  const startingNoField = event.currentTarget.querySelector('[name="startingNo"]');
  const gstinField = event.currentTarget.querySelector('[name="gstin"]');
  const gstinValue = String(form.get("gstin") || "").trim();
  if (!String(form.get("businessName") || "").trim()) {
    setInlineError(businessNameField, "Business name is required.");
    businessNameField?.focus();
    return;
  }
  if (!String(form.get("state") || "").trim()) {
    setInlineError(stateField, "State is required for GST split.");
    stateField?.focus();
    return;
  }
  if (gstinValue && !isValidGstin(gstinValue)) {
    setInlineError(gstinField, "Enter a valid 15-character GSTIN, e.g. 22AAAAA0000A1Z5.");
    gstinField?.focus();
    return;
  }
  if (!String(form.get("invoicePrefix") || "").trim()) {
    setInlineError(invoicePrefixField, "Invoice prefix is required.");
    invoicePrefixField?.focus();
    return;
  }
  if (Number(form.get("startingNo") || 0) < 1) {
    setInlineError(startingNoField, "Starting invoice number must be at least 1.");
    startingNoField?.focus();
    return;
  }

  // Handle logo upload
  let logoBase64 = state.businessSettings?.logoBase64 || "";
  const logoFile = event.currentTarget.querySelector("#logoFileInput")?.files?.[0];
  if (logoFile) {
    try {
      logoBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(logoFile);
      });
    } catch (err) {
      showToast("Unable to read logo file.");
    }
  }
  // Handle remove logo
  const removeLogo = event.currentTarget.querySelector("#removeLogoBtn");
  if (removeLogo && removeLogo.dataset.removed === "true") logoBase64 = "";

  const settings = {
    businessName: String(form.get("businessName") || "").trim(),
    gstin: String(form.get("gstin") || "").trim(),
    pan: String(form.get("pan") || "").trim(),
    state: String(form.get("state") || "").trim(),
    address: String(form.get("address") || "").trim(),
    logoBase64,
    bankDetails: {
      bankName: String(form.get("bankName") || "").trim(),
      accountNo: String(form.get("accountNo") || "").trim(),
      ifsc: String(form.get("ifsc") || "").trim(),
      upiId: String(form.get("upiId") || "").trim(),
    },
    invoicePrefix: String(form.get("invoicePrefix") || "").trim(),
    startingNo: Number(form.get("startingNo") || 1),
    terms: String(form.get("terms") || "").trim(),
    customFields: normalizeCustomFieldDefinitions(state.businessSettings?.customFields),
  };
  const status = elements.featureView.querySelector("#businessSettingsStatus");
  try {
    if (window.giDB?.updateBusinessSettings) {
      state = normalizeState(await window.giDB.updateBusinessSettings(settings));
    } else {
      state.businessSettings = settings;
      saveState();
    }
    if (status) status.textContent = "Settings saved.";
    showToast("Settings saved successfully.");
    elements.activeCompanyName.textContent = state.businessSettings.businessName || state.activeCompany || "testt";
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to save settings.";
  }
}

async function handleCustomFieldCreate(event) {
  event.preventDefault();
  clearInlineErrors(event.currentTarget);
  const form = new FormData(event.currentTarget);
  const labelField = event.currentTarget.querySelector('[name="label"]');
  const label = String(form.get("label") || "").trim();
  if (!label) {
    setInlineError(labelField, "Field label is required.");
    labelField?.focus();
    return;
  }
  const module = String(form.get("module") || "sale");
  const fieldKey = customFieldKeyFromLabel(label);
  const fields = normalizeCustomFieldDefinitions(state.businessSettings?.customFields);
  if (fields.some((field) => field.module === module && field.fieldKey.toLowerCase() === fieldKey.toLowerCase())) {
    setInlineError(labelField, "A field with this label already exists in this module.");
    labelField?.focus();
    return;
  }
  fields.push({
    id: `${module}-${fieldKey}-${Date.now()}`,
    module,
    label,
    fieldKey,
    fieldType: String(form.get("fieldType") || "text"),
    options: String(form.get("options") || "").split(",").map((option) => option.trim()).filter(Boolean),
    required: false,
    showOnPrint: true,
    showInList: false,
    active: true,
    sortOrder: fields.filter((field) => field.module === module).length * 10 + 100,
  });
  await saveCustomFieldDefinitions(fields, "Custom field added.");
}

async function handleCustomFieldToggle(id, prop, checked) {
  const allowed = new Set(["required", "showOnPrint", "active"]);
  if (!allowed.has(prop)) return;
  const fields = normalizeCustomFieldDefinitions(state.businessSettings?.customFields).map((field) => (
    field.id === id ? { ...field, [prop]: checked } : field
  ));
  await saveCustomFieldDefinitions(fields, "Custom field updated.");
}

async function handleCustomFieldDelete(id) {
  if (!confirm("Delete this custom field? Existing saved values will remain hidden in old records.")) return;
  const fields = normalizeCustomFieldDefinitions(state.businessSettings?.customFields).filter((field) => field.id !== id);
  await saveCustomFieldDefinitions(fields, "Custom field deleted.");
}

async function saveCustomFieldDefinitions(fields, message) {
  const settings = {
    ...(state.businessSettings || defaultBusinessSettings()),
    customFields: normalizeCustomFieldDefinitions(fields),
  };
  try {
    if (window.giDB?.updateBusinessSettings) {
      state = normalizeState(await window.giDB.updateBusinessSettings(settings));
    } else {
      state.businessSettings = settings;
      saveState();
    }
    elements.featureView.innerHTML = settingsTemplate("CUSTOM FIELDS");
    bindFeatureActions();
    showToast(message);
  } catch (error) {
    showToast(error.message || "Unable to save custom fields.");
  }
}

function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.append(host);
  }
  return host;
}

function showToast(message) {
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  host.append(toast);
  setTimeout(() => toast.classList.add("show"), 20);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function appPrompt(title, message, defaultValue = "") {
  return new Promise((resolve) => {
    const existing = document.querySelector(".app-prompt-backdrop");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop app-prompt-backdrop";
    backdrop.innerHTML = `
      <section class="entry-modal" role="dialog" aria-modal="true" style="max-width: 440px; width: 90%;">
        <header>
          <h2>${escapeHtml(title || "Prompt")}</h2>
          <button class="close-button prompt-close-btn" type="button" aria-label="Close">&times;</button>
        </header>
        <form class="entry-form prompt-form" style="padding: 1.25rem;">
          <p style="margin: 0 0 0.85rem; font-size: 0.95rem; color: var(--text-color, #1e293b);">${escapeHtml(message || "")}</p>
          <input class="form-input prompt-input" type="text" value="${escapeHtml(defaultValue)}" style="width: 100%; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button type="button" class="btn btn-secondary prompt-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary prompt-ok-btn">OK</button>
          </div>
        </form>
      </section>
    `;

    const cleanUp = (result) => {
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector(".prompt-close-btn").onclick = () => cleanUp(null);
    backdrop.querySelector(".prompt-cancel-btn").onclick = () => cleanUp(null);
    backdrop.querySelector(".prompt-form").onsubmit = (e) => {
      e.preventDefault();
      const val = backdrop.querySelector(".prompt-input").value;
      cleanUp(val);
    };

    backdrop.onkeydown = (e) => {
      if (e.key === "Escape") cleanUp(null);
    };

    document.body.appendChild(backdrop);
    const input = backdrop.querySelector(".prompt-input");
    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 50);
  });
}

function clearInlineErrors(scope) {
  scope.querySelectorAll(".field-error").forEach((node) => node.remove());
  scope.querySelectorAll(".invalid-field").forEach((node) => node.classList.remove("invalid-field"));
}

function setInlineError(field, message) {
  if (!field) return;
  field.classList.add("invalid-field");
  const target = field.closest("label") || field.parentElement;
  const error = document.createElement("small");
  error.className = "field-error";
  error.textContent = message;
  target?.append(error);
}

function isValidGstin(value) {
  const gstin = String(value || "").trim().toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin);
}

function openInvoicePreviewModal(previewData = null) {
  const preview = previewData || buildInvoicePreviewData();
  if (!preview) return;
  document.getElementById("invoicePreviewModal")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop invoice-preview-backdrop";
  backdrop.id = "invoicePreviewModal";
  backdrop.innerHTML = `
    <section class="invoice-preview-modal" role="dialog" aria-modal="true" aria-label="Invoice preview">
      <header>
        <h2>${escapeHtml(preview.previewTitle || "Invoice Preview")}</h2>
        <div>
          <button class="secondary-button" type="button" data-preview-pdf>Export PDF</button>
          <button class="secondary-button" type="button" data-preview-print>Print</button>
          <button class="close-button" type="button" data-preview-close>&times;</button>
        </div>
      </header>
      <div class="invoice-preview-paper">
        ${invoicePreviewMarkup(preview)}
      </div>
    </section>
  `;
  document.body.append(backdrop);
  backdrop.querySelector("[data-preview-close]")?.addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("[data-preview-print]")?.addEventListener("click", () => window.print());
  backdrop.querySelector("[data-preview-pdf]")?.addEventListener("click", async () => {
    const paperEl = backdrop.querySelector(".invoice-preview-paper");
    if (!paperEl) return;
    const styles = `<style>${Array.from(document.styleSheets).map((sheet) => {
      try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n'); }
      catch { return ''; }
    }).join('\n')}</style>`;
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}<style>body{background:#fff;padding:20px;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${paperEl.innerHTML}</body></html>`;
    const defaultFilename = `${(preview.documentTitle || "document").toLowerCase().replace(/\s+/g, "_")}_${preview.invoiceNo || "doc"}.pdf`;
    try {
      if (window.giApp?.exportPdf) {
        const res = await window.giApp.exportPdf({ htmlContent, defaultFilename });
        if (res?.success) {
          showToast(`PDF exported: ${res.filePath.split(/[\\/]/).pop()}`);
        } else if (!res?.canceled) {
          showToast("PDF export was cancelled or failed.");
        }
      } else {
        window.print();
      }
    } catch (e) {
      showToast(`PDF export failed: ${e.message}`);
    }
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
}

function buildInvoicePreviewData() {
  const form = elements.featureView.querySelector("#transactionEditorForm");
  if (!form) return null;
  const business = state.businessSettings || defaultBusinessSettings();
  const editorType = getTransactionEditorType();
  const party = getSelectedTransactionParty();
  const rows = [...elements.featureView.querySelectorAll("#transactionRows tr")]
    .map((row, index) => {
      const item = getSelectedTransactionItem(row);
      const qty = Number(row.querySelector('[name="qty"]')?.value || 0);
      const price = Number(row.querySelector('[name="price"]')?.value || 0);
      const discount = Number(row.querySelector('[name="discount"]')?.value || 0);
      const taxRate = parseTaxRate(row.querySelector('[name="tax"]')?.value || "");
      const taxable = Math.max(0, qty * price - discount);
      const tax = taxable * taxRate / 100;
      return {
        index: index + 1,
        item: row.querySelector('[name="item"]')?.value || "",
        description: row.querySelector('[name="description"]')?.value || "",
        hsnSac: item?.hsnSac || "",
        qty,
        unit: row.querySelector('[name="unit"]')?.value || "",
        price,
        discount,
        taxRate,
        tax,
        total: taxable + tax,
      };
    })
    .filter((row) => row.item || row.qty || row.price);
  return {
    editorType,
    previewTitle: transactionEditorMeta(editorType).previewTitle,
    documentTitle: transactionEditorMeta(editorType).documentTitle,
    business,
    party,
    rows,
    invoiceNo: elements.featureView.querySelector('[name="invoiceNo"]')?.value || "Auto",
    date: elements.featureView.querySelector('[name="invoiceDate"]')?.value || "",
    validUntil: editorType === "estimate" ? elements.featureView.querySelector('[name="dueDate"]')?.value || "" : "",
    address: elements.featureView.querySelector('[name="address"]')?.value || "",
    placeOfSupply: elements.featureView.querySelector('[name="state"]')?.value || "",
    customFields: customFieldsForModule(editorType).map((field) => ({
      ...field,
      value: customFieldValue(field, collectCustomFieldValues(editorType)),
    })).filter((field) => field.showOnPrint && (field.fieldType === "checkbox" ? field.value : String(field.value || "").trim())),
    description: elements.featureView.querySelector('[name="invoiceDescription"]')?.value || "",
    attachments: editorAttachmentNames(),
    subtotal: Number(elements.featureView.querySelector("#editorSubtotal")?.textContent || 0),
    discount: Number(elements.featureView.querySelector("#editorDiscountTotal")?.textContent || 0),
    cgst: Number(elements.featureView.querySelector("#editorCgstTotal")?.textContent || 0),
    sgst: Number(elements.featureView.querySelector("#editorSgstTotal")?.textContent || 0),
    igst: Number(elements.featureView.querySelector("#editorIgstTotal")?.textContent || 0),
    total: Number(elements.featureView.querySelector("#editorGrandTotal")?.value || 0),
  };
}

function amountInIndianWords(num) {
  num = Number(num || 0);
  if (isNaN(num) || num <= 0) return "Zero Rupees Only";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n) {
    if (n === 0) return "";
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + inWords(n % 100) : "");
    return "";
  }

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let result = "";
  const crore = Math.floor(integerPart / 10000000);
  let rem = integerPart % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundreds = rem;

  if (crore > 0) result += (inWords(crore) + " Crore ");
  if (lakh > 0) result += (inWords(lakh) + " Lakh ");
  if (thousand > 0) result += (inWords(thousand) + " Thousand ");
  if (hundreds > 0) result += (inWords(hundreds) + " ");

  result = (result.trim() ? result.trim() + " Rupees" : "");
  if (decimalPart > 0) {
    const paiseStr = inWords(decimalPart) + " Paise";
    result = result ? (result + " and " + paiseStr) : (paiseStr);
  }
  return result ? (result + " Only") : "Zero Rupees Only";
}

function generateUpiQrSvg(text, displaySize = 76) {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    exp[i + 255] = x;
    log[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : exp[log[a] + log[b]];
  }

  function rsPoly(numEc) {
    let poly = [1];
    for (let i = 0; i < numEc; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], exp[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, numEc) {
    const gen = rsPoly(numEc);
    const res = new Uint8Array(numEc);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < numEc - 1; j++) {
        res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor);
      }
      res[numEc - 1] = gfMul(gen[numEc], factor);
    }
    return res;
  }

  const bytes = new TextEncoder().encode(text);
  let version = 3;
  let totalData = 55;
  let numEc = 15;
  if (bytes.length > 53) {
    version = 4;
    totalData = 80;
    numEc = 20;
  }

  const dataBits = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) dataBits.push((val >> i) & 1);
  }

  pushBits(4, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  const bitCapacity = totalData * 8;
  const termLen = Math.min(4, bitCapacity - dataBits.length);
  for (let i = 0; i < termLen; i++) dataBits.push(0);
  while (dataBits.length % 8 !== 0) dataBits.push(0);

  const dataBytes = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | dataBits[i + b];
    dataBytes.push(byte);
  }
  let padToggle = false;
  while (dataBytes.length < totalData) {
    dataBytes.push(padToggle ? 0x11 : 0xec);
    padToggle = !padToggle;
  }

  const ecBytes = rsEncode(dataBytes, numEc);
  const finalCodewords = [...dataBytes, ...ecBytes];
  const size = 17 + version * 4;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));

  function setFinder(row, col) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isDark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        matrix[row + r][col + c] = isDark ? 1 : 0;
      }
    }
  }

  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  for (let i = 0; i < 8; i++) {
    if (size - 8 + i < size) {
      matrix[7][size - 8 + i] = 0;
      matrix[size - 8 + i][7] = 0;
    }
    if (i < 8) {
      matrix[7][i] = 0;
      matrix[i][7] = 0;
    }
  }
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  const alignPos = version === 3 ? 22 : 26;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isDark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      matrix[alignPos + r][alignPos + c] = isDark ? 1 : 0;
    }
  }

  matrix[size - 8][8] = 1;

  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i];
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i];

  let bitIdx = 0;
  const allBits = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) allBits.push((cw >> b) & 1);
  }

  let right = size - 1;
  let upward = true;
  while (right > 0) {
    if (right === 6) right--;
    for (let step = 0; step < size; step++) {
      const r = upward ? (size - 1 - step) : step;
      for (let c = right; c > right - 2; c--) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit ^ (mask ? 1 : 0));
        }
      }
    }
    upward = !upward;
    right -= 2;
  }

  const cellSize = (displaySize / size).toFixed(2);
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects += `<rect x="${(c * cellSize).toFixed(1)}" y="${(r * cellSize).toFixed(1)}" width="${cellSize}" height="${cellSize}" fill="#0f172a"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${displaySize} ${displaySize}" width="${displaySize}" height="${displaySize}" xmlns="http://www.w3.org/2000/svg"><rect width="${displaySize}" height="${displaySize}" fill="#ffffff"/>${rects}</svg>`;
}

function invoicePreviewMarkup(data) {
  const bank = data.business.bankDetails || {};
  const documentTitle = data.documentTitle || transactionEditorMeta(data.editorType).documentTitle;
  const detailTitle = data.editorType === "estimate" ? "Quote Details" : data.editorType === "saleReturn" ? "Credit Note Details" : data.editorType === "purchaseReturn" ? "Debit Note Details" : "Invoice Details";
  const logoSrc = data.business.logoBase64 || "";
  const upiUri = bank.upiId ? `upi://pay?pa=${encodeURIComponent(bank.upiId)}&pn=${encodeURIComponent(data.business.businessName || "Merchant")}&am=${encodeURIComponent(Number(data.total || 0).toFixed(2))}&cu=INR` : "";

  return `
    <div class="preview-business">
      <div class="preview-business-info">
        ${logoSrc ? `<img class="preview-logo" src="${logoSrc}" alt="${escapeHtml(data.business.businessName || "Logo")}">` : ""}
        <div>
          <h1>${escapeHtml(data.business.businessName || state.activeCompany || "GI Billing")}</h1>
          <p>${escapeHtml(data.business.address || "-")}</p>
          <p>GSTIN: ${escapeHtml(data.business.gstin || "-")} | PAN: ${escapeHtml(data.business.pan || "-")}</p>
        </div>
      </div>
      <strong>${escapeHtml(documentTitle)}</strong>
    </div>
    <div class="preview-meta-grid">
      <section><h3>Bill To</h3><p>${escapeHtml(data.party?.name || "-")}</p><p>${escapeHtml(data.address || data.party?.billingAddress || "-")}</p><p>GSTIN: ${escapeHtml(data.party?.gstin || "-")}</p></section>
      <section><h3>${escapeHtml(detailTitle)}</h3><p>No: ${escapeHtml(data.invoiceNo)}</p><p>Date: ${escapeHtml(data.date)}</p>${data.validUntil ? `<p>Valid Until: ${escapeHtml(data.validUntil)}</p>` : ""}<p>Place of Supply: ${escapeHtml(data.placeOfSupply || "-")}</p></section>
    </div>
    ${data.customFields?.length ? `
      <div class="preview-custom-fields">
        ${data.customFields.map((field) => `<p><span>${escapeHtml(field.label)}</span><b>${escapeHtml(field.fieldType === "checkbox" ? "Yes" : field.value)}</b></p>`).join("")}
      </div>
    ` : ""}
    <table class="preview-table">
      <thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th></tr></thead>
      <tbody>${data.rows.map((row) => `<tr><td>${row.index}</td><td>${escapeHtml(row.item)}<small>${escapeHtml(row.description)}</small></td><td>${escapeHtml(row.hsnSac || "-")}</td><td>${formatQuantity(row.qty)} ${escapeHtml(row.unit)}</td><td>${formatCurrency(row.price)}</td><td>${formatPercent(row.taxRate)}</td><td>${formatCurrency(row.total)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="preview-amount-words">
      <strong>Amount in Words:</strong> <span>${escapeHtml(amountInIndianWords(data.total))}</span>
    </div>
    <div class="preview-summary">
      <section>
        <h3>Bank &amp; Payment Details</h3>
        <p>${escapeHtml(bank.bankName || "-")}</p>
        <p>A/C: ${escapeHtml(bank.accountNo || "-")}</p>
        <p>IFSC: ${escapeHtml(bank.ifsc || "-")}</p>
        <p>UPI ID: ${escapeHtml(bank.upiId || "-")}</p>
        ${bank.upiId ? `
          <div class="preview-upi-wrap">
            <div class="preview-upi-qr">
              ${generateUpiQrSvg(upiUri, 68)}
            </div>
            <div class="preview-upi-meta">
              <strong>Scan to Pay via UPI</strong>
              <span>GPay • PhonePe • Paytm</span>
              <span>${escapeHtml(bank.upiId)}</span>
            </div>
          </div>
        ` : ""}
      </section>
      <section class="preview-tax-box">
        <p><span>Subtotal</span><b>${formatCurrency(data.subtotal)}</b></p>
        <p><span>Discount</span><b>${formatCurrency(data.discount)}</b></p>
        <p><span>CGST</span><b>${formatCurrency(data.cgst)}</b></p>
        <p><span>SGST</span><b>${formatCurrency(data.sgst)}</b></p>
        <p><span>IGST</span><b>${formatCurrency(data.igst)}</b></p>
        <p class="grand"><span>Total</span><b>${formatCurrency(data.total)}</b></p>
      </section>
    </div>
    ${data.description || data.attachments?.length ? `
      <div class="preview-extra-notes">
        ${data.description ? `<section><h3>Description</h3><p>${escapeHtml(data.description)}</p></section>` : ""}
        ${data.attachments?.length ? `<section><h3>Attachments</h3><p>${data.attachments.map((file) => `${escapeHtml(file.label)}: ${escapeHtml(file.name)}`).join("<br>")}</p></section>` : ""}
      </div>
    ` : ""}
    <div class="preview-terms"><h3>Terms &amp; Conditions</h3><p>${escapeHtml(data.business.terms || "-")}</p></div>
    <div class="preview-signature"><span>Authorized Signature</span></div>
  `;
}

function bindTransactionEditorRows() {
  elements.featureView.querySelectorAll(".editor-table input, .editor-table select, #editorReceived, #roundOffToggle").forEach((field) => {
    if (field.dataset.editorBound) return;
    field.dataset.editorBound = "true";
    field.addEventListener("input", recalcTransactionEditor);
    field.addEventListener("change", recalcTransactionEditor);
  });
  elements.featureView.querySelectorAll('#transactionRows [name="item"]').forEach((field) => {
    if (field.dataset.itemSmartBound) return;
    field.dataset.itemSmartBound = "true";
    field.addEventListener("input", () => handleEditorItemLookupInput(field));
    field.addEventListener("focus", () => renderItemLookupPanel(field));
    field.addEventListener("change", () => applyEditorItemIntelligence(field.closest("tr")));
  });
  elements.featureView.querySelectorAll(".row-delete-button").forEach((button) => {
    if (button.dataset.deleteBound) return;
    button.dataset.deleteBound = "true";
    button.onclick = () => {
      if (!confirm("Delete this row?")) return;
      button.closest("tr").remove();
      renumberEditorRows();
      recalcTransactionEditor();
    };
  });
}

function getTransactionEditorType() {
  if (isTransactionEditorView()) return activeTransactionEditorType || currentView.replace("Editor", "");
  return activeTransactionEditorType || currentEntryType;
}

function handleEditorLookupAction(event) {
  const partyButton = event.target.closest("[data-editor-party-id]");
  if (partyButton) {
    event.preventDefault();
    const party = (state.parties || []).find((item) => Number(item.id) === Number(partyButton.dataset.editorPartyId));
    if (party) selectTransactionParty(party);
    return;
  }

  const addPartyButton = event.target.closest("[data-editor-add-party]");
  if (addPartyButton) {
    event.preventDefault();
    openTransactionPartyCreate(addPartyButton.dataset.source || "party");
    return;
  }

  const itemButton = event.target.closest("[data-editor-item-id]");
  if (itemButton) {
    event.preventDefault();
    const row = itemButton.closest("tr");
    const item = (state.items || []).find((record) => Number(record.id) === Number(itemButton.dataset.editorItemId));
    if (row && item) selectTransactionItem(row, item);
    return;
  }

  const addItemButton = event.target.closest("[data-editor-add-item]");
  if (addItemButton) {
    event.preventDefault();
    const row = addItemButton.closest("tr");
    if (row) openTransactionItemCreate(row);
  }
}

function handleEditorPartyLookupInput(source) {
  const input = elements.featureView.querySelector(source === "phone" ? '[name="phone"]' : '[name="party"]');
  const value = input?.value || "";
  const exactParty = source === "phone" ? findPartyByPhone(value) : findPartyByName(value);
  if (exactParty) {
    selectTransactionParty(exactParty, { keepLookupOpen: true });
  } else {
    clearSelectedTransactionParty();
    applyEditorPartyIntelligence();
  }
  renderPartyLookupPanel(source);
}

function renderPartyLookupPanel(source = "party") {
  const input = elements.featureView.querySelector(source === "phone" ? '[name="phone"]' : '[name="party"]');
  const panel = elements.featureView.querySelector(source === "phone" ? "#editorPhoneLookup" : "#editorPartyLookup");
  const otherPanel = elements.featureView.querySelector(source === "phone" ? "#editorPartyLookup" : "#editorPhoneLookup");
  if (otherPanel) {
    otherPanel.classList.add("hidden");
    resetFloatingLookupPanel(otherPanel);
    otherPanel.innerHTML = "";
  }
  if (!input || !panel) return;

  const query = input.value.trim();
  const matches = searchPartiesByNameOrPhone(query).slice(0, 6);
  const exact = source === "phone" ? findPartyByPhone(query) : findPartyByName(query);
  const type = getTransactionEditorType();
  const partyLabel = type === "sale" || type === "saleReturn" || type === "estimate" ? "customer" : "supplier";
  const addText = source === "phone"
    ? `Add ${partyLabel} with phone ${query}`
    : `Add "${query}" as new ${partyLabel}`;

  if (!query && !matches.length) {
    panel.classList.add("hidden");
    resetFloatingLookupPanel(panel);
    panel.innerHTML = "";
    return;
  }

  panel.innerHTML = `
    ${matches.map((party) => partyLookupButton(party)).join("")}
    ${query && !exact ? `<button class="lookup-add-button" type="button" data-editor-add-party data-source="${source}">+ ${escapeHtml(addText)}</button>` : ""}
  `;
  panel.classList.toggle("hidden", !panel.innerHTML.trim());
  if (panel.innerHTML.trim()) positionFloatingItemLookup(input, panel);
}

function positionFloatingItemLookup(field, panel) {
  const isItem = panel.classList.contains("editor-item-lookup");
  panel.classList.add("floating-editor-lookup");
  const fieldRect = field.getBoundingClientRect();
  const columnRect = isItem ? field.closest('td').getBoundingClientRect() : fieldRect;
  const editorRect = elements.featureView.querySelector(".transaction-editor")?.getBoundingClientRect();
  const footerRect = elements.featureView.querySelector(".transaction-editor-actions")?.getBoundingClientRect();
  const viewportRight = Math.min(window.innerWidth, editorRect?.right || window.innerWidth) - 12;
  const viewportLeft = Math.max(12, editorRect?.left || 0);
  const preferredWidth = isItem ? columnRect.width : Math.max(fieldRect.width, 320);
  const width = Math.min(preferredWidth, viewportRight - viewportLeft);
  const left = Math.min(Math.max(columnRect.left, viewportLeft), viewportRight - width);
  const footerTop = footerRect?.top || window.innerHeight;
  const spaceBelow = footerTop - fieldRect.bottom - 10;
  const spaceAbove = fieldRect.top - (editorRect?.top || 0) - 10;
  const maxHeight = Math.min(260, Math.max(150, Math.max(spaceBelow, spaceAbove)));
  const shouldOpenAbove = spaceBelow < 150 && spaceAbove > spaceBelow;
  const top = shouldOpenAbove
    ? Math.max((editorRect?.top || 0) + 8, fieldRect.top - maxHeight - 6)
    : fieldRect.bottom + 5;

  panel.classList.add("floating-editor-lookup");
  panel.style.setProperty("--lookup-left", `${left}px`);
  panel.style.setProperty("--lookup-top", `${top}px`);
  panel.style.setProperty("--lookup-width", `${width}px`);
  panel.style.setProperty("--lookup-max-height", `${maxHeight}px`);
}

function partyLookupButton(party) {
  const balance = Number(party.balance ?? party.openingBalance ?? 0);
  const type = getTransactionEditorType();
  const isPurchaseLike = ["purchase", "purchaseReturn"].includes(type) || party.type === "supplier";
  let balanceLabel = "Receivable";
  if (balance === 0) {
    balanceLabel = isPurchaseLike ? "Payable" : "Receivable";
  } else if (isPurchaseLike) {
    balanceLabel = balance > 0 ? "Payable" : "Receivable";
  } else {
    balanceLabel = balance > 0 ? "Receivable" : "Payable";
  }
  return `
    <button class="lookup-result-button" type="button" data-editor-party-id="${party.id}">
      <span><strong>${escapeHtml(party.name)}</strong><small>${escapeHtml(party.phone || "No phone")}</small></span>
      <em>${balanceLabel} ${formatCurrency(Math.abs(balance))}</em>
    </button>
  `;
}

function searchPartiesByNameOrPhone(query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  const phoneQuery = normalizePhone(query);
  const editorType = getTransactionEditorType();
  const expectedRole = editorType === "purchase" ? "supplier" : "customer";
  const parties = (state.parties || []).filter((party) => {
    const role = String(party.type || "both").toLowerCase();
    return role === "both" || !["customer", "supplier"].includes(role) || role === expectedRole;
  });
  if (!cleanQuery && !phoneQuery) return parties;
  return parties.filter((party) => {
    const name = String(party.name || "").toLowerCase();
    const phone = normalizePhone(party.phone);
    return name.includes(cleanQuery) || (phoneQuery && phone.includes(phoneQuery));
  });
}

function findPartyByPhone(value) {
  const phone = normalizePhone(value);
  if (!phone) return null;
  return (state.parties || []).find((party) => normalizePhone(party.phone) === phone) || null;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function clearSelectedTransactionParty() {
  const partyInput = elements.featureView.querySelector('[name="party"]');
  if (partyInput) delete partyInput.dataset.selectedPartyId;
}

function syncEditorPartyRequirement() {
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const marker = elements.featureView.querySelector("[data-party-required-marker]");
  const hint = elements.featureView.querySelector("[data-party-required-hint]");
  const editorType = getTransactionEditorType();
  const meta = transactionEditorMeta(editorType);
  const partyLabel = meta.partyRole;
  const isEstimate = editorType === "estimate";
  const isSaleReturn = editorType === "saleReturn";
  const isPurchaseReturn = editorType === "purchaseReturn";
  const isReturn = isSaleReturn || isPurchaseReturn;
  const optional = editorType === 'sale' && elements.featureView.querySelector('#editorPaymentType')?.value === 'cash' && elements.featureView.querySelector('[name="supplyType"]')?.value === 'b2c';
  if (partyInput) {
    partyInput.required = false;
    partyInput.setAttribute("aria-required", String(!optional));
    partyInput.placeholder = meta.partyPlaceholder;
  }
  if (marker) marker.textContent = optional ? '(optional)' : '*';
  if (hint) {
    hint.textContent = meta.partyRequiredHint;
  }
}

function syncEditorPaymentQuickToggle() {
  const paymentType = elements.featureView.querySelector("#editorPaymentType")?.value || "cash";
  const quickToggle = elements.featureView.querySelector("#editorPaymentQuickToggle");
  const toggleWrap = elements.featureView.querySelector(".editor-payment-toggle");
  const isCash = paymentType !== "credit";
  if (quickToggle) quickToggle.checked = isCash;
  toggleWrap?.classList.toggle("credit-active", !isCash);
  toggleWrap?.classList.toggle("cash-active", isCash);
  toggleWrap?.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.paymentMode === (isCash ? "cash" : "credit")));
  });
}

function getSelectedTransactionParty() {
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const selectedId = partyInput?.dataset.selectedPartyId;
  const selectedParty = selectedId ? (state.parties || []).find((party) => Number(party.id) === Number(selectedId)) : null;
  if (selectedParty && selectedParty.name === partyInput.value) return selectedParty;
  return findPartyByName(partyInput?.value);
}

function selectTransactionParty(party, options = {}) {
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const phoneInput = elements.featureView.querySelector('[name="phone"]');
  const addressInput = elements.featureView.querySelector('[name="address"]');
  const stateInput = elements.featureView.querySelector('[name="state"]');
  const paymentTerms = elements.featureView.querySelector('[name="paymentTerms"]');
  const dueDate = elements.featureView.querySelector('[name="dueDate"]');

  if (partyInput) {
    partyInput.value = party.name || "";
    partyInput.dataset.selectedPartyId = party.id;
  }
  if (phoneInput) phoneInput.value = party.phone || "";
  if (addressInput) addressInput.value = party.billingAddress || party.shippingAddress || "";
  if (stateInput && party.state) ensureSelectValue(stateInput, party.state);
  const terms = party.paymentTerms || (Number(party.dueDays || 0) ? `Net ${Number(party.dueDays || 0)}` : "");
  if (paymentTerms && terms) {
    ensureSelectValue(paymentTerms, terms);
    if (dueDate && !dueDate.dataset.manualDueDate) dueDate.value = dueDateFromTerms(terms, party.dueDays);
  }
  if (!options.keepLookupOpen) hideEditorLookupPanels();
  applyEditorPartyIntelligence();
  updateTransactionEditorDirtyState();
}

function openTransactionPartyCreate(source) {
  const transactionType = getTransactionEditorType();
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const phoneInput = elements.featureView.querySelector('[name="phone"]');
  const query = source === "phone" ? phoneInput?.value.trim() : partyInput?.value.trim();
  openEntryModal("party", null, {
    returnContext: {
      type: "transactionParty",
      transactionType,
    },
    draft: {
      party: source === "phone" ? "" : query,
      phone: source === "phone" ? query : phoneInput?.value.trim(),
    },
  });
}

function handleEditorItemLookupInput(field) {
  const row = field.closest("tr");
  const item = findItemByName(field.value);
  if (item) {
    selectTransactionItem(row, item, { keepLookupOpen: true });
  } else {
    delete field.dataset.selectedItemId;
    applyEditorItemIntelligence(row);
  }
  renderItemLookupPanel(field);
}

function renderItemLookupPanel(field) {
  const row = field?.closest("tr");
  const panel = row?.querySelector(".editor-item-lookup");
  if (!field || !panel) return;
  const query = field.value.trim();
  const results = searchItemsForLookup(query);
  const matches = results.slice(0, 50);
  const exact = findItemByName(query);

  if (!query && !matches.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.innerHTML = `
    <div class="item-picker-heading"><span>${results.length} items${results.length > 50 ? " (first 50)" : ""}</span><span>${getTransactionEditorType() === "purchase" ? "Purchase price" : "Sale price"}</span></div>
    ${!matches.length ? '<div class="item-picker-empty">No matching items</div>' : ''}
    ${matches.map((item) => itemLookupButton(item)).join("")}
    ${query && !exact ? `<button class="lookup-add-button" type="button" data-editor-add-item>+ Add "${escapeHtml(query)}" as new item</button>` : ""}
  `;
  panel.classList.toggle("hidden", !panel.innerHTML.trim());
  positionFloatingItemLookup(field, panel);
  field.setAttribute("aria-expanded", "true");
  field.onkeydown = panel.onkeydown = (event) => {
    if (panel.classList.contains("hidden")) return;
    if (event.key === "Escape" || event.key === "Tab") {
      hideEditorLookupPanels();
      if (event.key === "Escape") { event.preventDefault(); field.focus(); hideEditorLookupPanels(); }
      return;
    }
    const buttons = [...panel.querySelectorAll("button")];
    if (!buttons.length) return;
    const active = panel.querySelector(".keyboard-active");
    let index = buttons.indexOf(active);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      index = (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons.forEach((button, i) => button.classList.toggle("keyboard-active", i === index));
      buttons[index].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && event.target === field) {
      event.preventDefault();
      event.stopPropagation();
      handleEditorLookupAction({ target: active || buttons[0], preventDefault() {} });
    }
  };
  panel.querySelectorAll("button").forEach((button) => {
    button.onclick = (event) => {
      if (event.detail === 0) handleEditorLookupAction(event);
    };
  });
}

function itemLookupButton(item) {
  const details = [item.sku ? `SKU ${item.sku}` : "", item.category, item.unit ? `Unit ${item.unit}` : ""].filter(Boolean).join(" - ") || "No item details";
  const service = item.itemType === "service";
  const stock = Number(item.currentStock || 0);
  const price = getTransactionEditorType() === "purchase" ? item.purchasePrice : item.salePrice;
  return `
    <button class="lookup-result-button item-picker-result" type="button" data-editor-item-id="${item.id}">
      <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(details)}</small></span>
      <span class="item-picker-numbers"><strong>${formatCurrency(price || 0)}</strong><small class="${service ? "service" : stock <= 0 ? "out-of-stock" : "in-stock"}">${service ? "Service" : stock <= 0 ? "Out of stock" : `${formatQuantity(stock)} ${escapeHtml(item.unit || "")} available`}</small></span>
    </button>
  `;
}

function searchItemsForLookup(query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  const items = state.items || [];
  if (!cleanQuery) return items;
  return items.filter((item) => [
    item.name,
    item.sku,
    item.category,
    item.unit,
  ].filter(Boolean).join(" ").toLowerCase().includes(cleanQuery));
}

function selectTransactionItem(row, item, options = {}) {
  const itemInput = row?.querySelector('[name="item"]');
  if (!row || !itemInput) return;
  itemInput.value = item.name || "";
  itemInput.dataset.selectedItemId = item.id;
  if (!options.keepLookupOpen) hideEditorLookupPanels();
  applyEditorItemIntelligence(row);
}

function getSelectedTransactionItem(row) {
  const itemInput = row?.querySelector('[name="item"]');
  const selectedId = itemInput?.dataset.selectedItemId;
  const selectedItem = selectedId ? (state.items || []).find((item) => Number(item.id) === Number(selectedId)) : null;
  if (selectedItem && selectedItem.name === itemInput.value) return selectedItem;
  return findItemByName(itemInput?.value);
}

function openTransactionItemCreate(row) {
  const transactionType = getTransactionEditorType();
  const rows = [...elements.featureView.querySelectorAll("#transactionRows tr")];
  const itemInput = row.querySelector('[name="item"]');
  openEntryModal("item", null, {
    returnContext: {
      type: "transactionItem",
      transactionType,
      rowIndex: rows.indexOf(row),
    },
    draft: {
      item: itemInput?.value.trim(),
    },
  });
}

function hideEditorLookupPanels() {
  elements.featureView.querySelectorAll('[name="item"]').forEach((field) => field.setAttribute("aria-expanded", "false"));
  elements.featureView.querySelectorAll(".editor-lookup-panel").forEach((panel) => {
    panel.classList.add("hidden");
    resetFloatingLookupPanel(panel);
  });
}

function resetFloatingLookupPanel(panel) {
  panel.classList.remove("floating-editor-lookup");
  panel.style.removeProperty("--lookup-left");
  panel.style.removeProperty("--lookup-top");
  panel.style.removeProperty("--lookup-width");
  panel.style.removeProperty("--lookup-max-height");
}

function addTransactionEditorRow() {
  const body = elements.featureView.querySelector("#transactionRows");
  body.insertAdjacentHTML("beforeend", editorRowTemplate(body.children.length + 1));
  bindTransactionEditorRows();
  recalcTransactionEditor();
  return body.lastElementChild;
}

function handleTransactionEditorKeys(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    const saveBtn = elements.featureView.querySelector('[data-save-mode="close"]');
    if (saveBtn) {
      elements.featureView.querySelector("#transactionEditorForm")?.requestSubmit(saveBtn);
    } else {
      elements.featureView.querySelector("#transactionEditorForm")?.requestSubmit();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
    event.preventDefault();
    const printBtn = elements.featureView.querySelector('[data-save-mode="print"]');
    if (printBtn) {
      elements.featureView.querySelector("#transactionEditorForm")?.requestSubmit(printBtn);
    }
    return;
  }

  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    elements.featureView.querySelector("#transactionEditorForm")?.requestSubmit();
    return;
  }

  if (event.altKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    const row = addTransactionEditorRow();
    row?.querySelector('[name="item"]')?.focus();
    return;
  }

  const target = event.target;
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!target.matches(".editor-table input, .editor-table select, #editorReceived")) return;
  event.preventDefault();
  focusNextTransactionField(target);
}

function focusNextTransactionField(currentField) {
  const fields = [...elements.featureView.querySelectorAll("#transactionRows input, #transactionRows select, #editorReceived")];
  const index = fields.indexOf(currentField);
  const nextField = fields[index + 1];
  if (nextField) {
    nextField.focus();
    if (nextField.select) nextField.select();
    return;
  }
  const row = addTransactionEditorRow();
  row?.querySelector('[name="item"]')?.focus();
}

function syncDueDateFromPaymentTerms() {
  const paymentTerms = elements.featureView.querySelector('[name="paymentTerms"]');
  const dueDate = elements.featureView.querySelector('[name="dueDate"]');
  const invoiceDate = elements.featureView.querySelector('[name="invoiceDate"]');
  if (!paymentTerms || !dueDate) return;
  dueDate.dataset.manualDueDate = "";
  dueDate.value = dueDateFromTerms(paymentTerms.value, 0, invoiceDate?.value);
}

function applyEditorPartyIntelligence() {
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const phoneInput = elements.featureView.querySelector('[name="phone"]');
  const addressInput = elements.featureView.querySelector('[name="address"]');
  const paymentTerms = elements.featureView.querySelector('[name="paymentTerms"]');
  const dueDate = elements.featureView.querySelector('[name="dueDate"]');
  const stateInput = elements.featureView.querySelector('[name="state"]');
  const supplyType = elements.featureView.querySelector('[name="supplyType"]');
  const partyGstin = elements.featureView.querySelector('[name="partyGstin"]');
  const balanceLabel = elements.featureView.querySelector(".editor-party-card .editor-card-title span");
  const party = getSelectedTransactionParty();

  if (!party) {
    if (balanceLabel) balanceLabel.innerHTML = "Balance: <b>-</b>";
    const partyGstin = elements.featureView.querySelector('[name="partyGstin"]');
    if (partyGstin) partyGstin.value = "";
    renderTransactionSmartChecks();
    return;
  }

  if (phoneInput && !phoneInput.value.trim()) phoneInput.value = party.phone || "";
  if (addressInput && !addressInput.value.trim()) addressInput.value = party.billingAddress || party.shippingAddress || "";
  if (stateInput && party.state) ensureSelectValue(stateInput, party.state);
  if (partyGstin) partyGstin.value = party.gstin || "";
  if (supplyType) supplyType.value = party.gstin ? "b2b" : "b2c";

  const terms = party.paymentTerms || (Number(party.dueDays || 0) ? `Net ${Number(party.dueDays || 0)}` : "");
  if (paymentTerms && terms) {
    ensureSelectValue(paymentTerms, terms);
    if (dueDate && !dueDate.dataset.manualDueDate) dueDate.value = dueDateFromTerms(terms, party.dueDays);
  }

  if (dueDate && !dueDate.dataset.boundManualDueDate) {
    dueDate.dataset.boundManualDueDate = "true";
    dueDate.addEventListener("input", () => { dueDate.dataset.manualDueDate = "true"; });
  }

  if (balanceLabel) {
    const isPurchaseLike = ["purchase", "purchaseReturn"].includes(getTransactionEditorType()) || party.type === "supplier";
    const balance = Number(party.balance ?? party.openingBalance ?? 0);
    let label = "Balance";
    if (balance === 0) {
      label = isPurchaseLike ? "Payable" : "Receivable";
    } else if (isPurchaseLike) {
      label = balance > 0 ? "Payable" : "Advance / Receivable";
    } else {
      label = balance > 0 ? "Receivable" : "Advance / Payable";
    }
    balanceLabel.innerHTML = `${label}: <b>${formatCurrency(Math.abs(balance))}</b>`;
  }
  renderTransactionSmartChecks();
}

function applyEditorRowsIntelligence() {
  elements.featureView.querySelectorAll("#transactionRows tr").forEach((row) => applyEditorItemIntelligence(row, true));
}

function purchasePriceHistory(item) {
  const invoices = new Map((state.invoices || []).filter((invoice) => invoice.type === "purchase" && invoice.status !== "cancelled" && invoice.id !== activeTransactionEditInvoiceId).map((invoice) => [invoice.id, invoice]));
  return (state.invoiceItems || []).filter((line) => Number(line.itemId) === Number(item.id) && invoices.has(line.invoiceId))
    .map((line) => ({ ...line, invoice: invoices.get(line.invoiceId) }))
    .sort((a, b) => new Date(b.invoice.date) - new Date(a.invoice.date) || new Date(b.invoice.createdAt) - new Date(a.invoice.createdAt) || Number(b.id) - Number(a.id));
}

function renderPurchasePriceHistory(row, item) {
  const target = row.querySelector('.purchase-price-history');
  if (!target) return;
  const history = item && getTransactionEditorType() === 'purchase' ? purchasePriceHistory(item) : [];
  target.innerHTML = history.length ? `<details><summary>Last purchase: ${formatCurrency(history[0].price)} / ${escapeHtml(history[0].unit || item.unit || '')} (before tax)</summary><ul>${history.slice(0, 10).map((line) => `<li><span>${escapeHtml(new Date(line.invoice.date).toLocaleDateString('en-GB'))} · ${escapeHtml(line.invoice.party)} · ${escapeHtml(line.invoice.invoiceNo)}</span><strong>${formatCurrency(line.price)} / ${escapeHtml(line.unit || '')}</strong></li>`).join('')}</ul></details>` : '';
}

function applyEditorItemIntelligence(row, initial = false) {
  if (!row) return;
  const itemInput = row.querySelector('[name="item"]');
  const qty = row.querySelector('[name="qty"]');
  const item = getSelectedTransactionItem(row);
  if (!item) {
    renderPurchasePriceHistory(row, null);
    if (itemInput?.value.trim() && qty && !qty.value.trim()) qty.value = "1";
    delete row.dataset.smartItem;
    delete row.dataset.currentStock;
    delete row.dataset.purchasePrice;
    const purchasePriceCell = row.querySelector(".row-purchase-price");
    if (purchasePriceCell) purchasePriceCell.textContent = "-";
    updateRowSmartHint(row);
    recalcTransactionEditor();
    renderTransactionSmartChecks();
    return;
  }

  const previousSmartItem = row.dataset.smartItem || "";
  const isNewSmartItem = previousSmartItem.toLowerCase() !== String(item.name || "").toLowerCase();
  row.dataset.smartItem = item.name || "";
  row.dataset.currentStock = String(item.currentStock ?? "");
  row.dataset.purchasePrice = String(item.purchasePrice ?? "");
  row.dataset.itemType = item.itemType || "";

  const purchasePriceCell = row.querySelector(".row-purchase-price");
  if (purchasePriceCell) {
    const purchasePrice = Number(item.purchasePrice || 0);
    purchasePriceCell.textContent = purchasePrice ? formatCurrency(purchasePrice) : "-";
  }

  const description = row.querySelector('[name="description"]');
  const unit = row.querySelector('[name="unit"]');
  const price = row.querySelector('[name="price"]');
  const discount = row.querySelector('[name="discount"]');
  const tax = row.querySelector('[name="tax"]');

  if (qty && !qty.value.trim()) qty.value = "1";
  if (description && (!description.value.trim() || isNewSmartItem)) {
    description.value = item.description || item.notes || description.value;
  }
  if (unit && item.unit) ensureSelectValue(unit, item.unit);

  const editorType = getTransactionEditorType();
  const lastPurchase = editorType === 'purchase' ? purchasePriceHistory(item).find((line) => line.unit === item.unit) : null;
  const smartPrice = editorType === "purchase"
    ? Number(lastPurchase ? lastPurchase.price : item.purchasePrice || 0)
    : Number(item.salePrice || 0);
  if (price && ((!initial && isNewSmartItem) || !price.value.trim())) {
    const inclusive = !lastPurchase && (editorType === 'purchase' ? item.purchaseTaxType : item.saleTaxType) === 'with_tax';
    price.value = inclusive ? Number((smartPrice / (1 + Number(item.taxRate || 0) / 100)).toFixed(6)) : smartPrice;
  }
  if (discount && Number(item.discount || 0) && (isNewSmartItem || Number(discount.value || 0) === 0)) {
    discount.value = Number(item.discount || 0);
  }
  if (tax) ensureSelectValue(tax, taxOptionLabel(item.taxRate));

  renderPurchasePriceHistory(row, item);
  updateRowSmartHint(row);
  recalcTransactionEditor();
}

function findPartyByName(name) {
  const cleanName = String(name || "").trim().toLowerCase();
  if (!cleanName) return null;
  return (state.parties || []).find((party) => String(party.name || "").trim().toLowerCase() === cleanName) || null;
}

function findItemByName(name) {
  const cleanName = String(name || "").trim().toLowerCase();
  if (!cleanName) return null;
  return (state.items || []).find((item) => String(item.name || "").trim().toLowerCase() === cleanName) || null;
}

function ensureSelectValue(select, value) {
  const label = String(value || "").trim();
  if (!select || !label) return;
  const matchingOption = [...select.options].find((option) => option.value.toLowerCase() === label.toLowerCase());
  if (matchingOption) {
    select.value = matchingOption.value;
    return;
  }
  const option = document.createElement("option");
  option.value = label;
  option.textContent = label;
  select.append(option);
  select.value = label;
}

function dueDateFromTerms(terms, dueDays = 0, baseDateValue = "") {
  const text = String(terms || "");
  const termDays = Number(text.match(/\d+/)?.[0] || dueDays || 0);
  const date = parseEditorDateAsDate(baseDateValue) || new Date();
  date.setDate(date.getDate() + termDays);
  return date.toLocaleDateString("en-GB");
}

function editorUnitOptionsMarkup(selected = "Pcs") {
  const units = mergeChoiceList(["Pcs", "NONE"], [...masterUnitNames(), ...(state.items || []).map((item) => item.unit)]);
  return units.map((unit) => `<option value="${escapeHtml(unit)}" ${unit === selected ? "selected" : ""}>${escapeHtml(unit)}</option>`).join("");
}

function editorTaxOptionsMarkup(selected = "NONE") {
  const options = ["NONE", "GST 0%", "GST 5%", "GST 12%", "GST 18%", "GST 28%"];
  return options.map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function taxOptionLabel(rate) {
  const numericRate = Number(rate || 0);
  return numericRate ? `GST ${numericRate}%` : "NONE";
}

function updateRowSmartHint(row) {
  const hint = row?.querySelector(".row-smart-hint");
  if (!hint) return;
  const itemName = row.querySelector('[name="item"]')?.value.trim() || "";
  const qty = Number(row.querySelector('[name="qty"]')?.value || 0);
  const price = Number(row.querySelector('[name="price"]')?.value || 0);
  const selectedTaxRate = parseTaxRate(row.querySelector('[name="tax"]')?.value || "");

  hint.className = "row-smart-hint";
  if (!itemName) {
    hint.textContent = "";
    return;
  }

  const item = getSelectedTransactionItem(row);
  if (!item) {
    hint.textContent = "Item not found. Select an existing item or add it first.";
    hint.classList.add("info");
    return;
  }

  const purchasePrice = Number(item.purchasePrice || 0);
  const salePrice = Number(item.salePrice || 0);
  const stock = Number(item.currentStock || 0);
  const isService = String(item.itemType || "").toLowerCase() === "service";
  const parts = [];

  const editorType = getTransactionEditorType();
  const isSaleLike = editorType === "sale" || editorType === "estimate" || editorType === "saleReturn";
  if ((editorType === "sale" || editorType === "estimate") && !isService) {
    parts.push(`Stock ${formatQuantity(stock)}`);
    if (qty > stock) hint.classList.add("danger");
  }
  if (isSaleLike && salePrice) parts.push(`Sale ${formatCurrency(salePrice)}`);
  if (purchasePrice) parts.push(`Cost ${formatCurrency(purchasePrice)}`);
  if (Number(item.taxRate || 0)) parts.push(`GST ${formatPercent(item.taxRate)}`);
  if (!selectedTaxRate && !Number(item.taxRate || 0)) {
    parts.push("GST not set");
    hint.classList.add("info");
  }

  if (isSaleLike && purchasePrice && price) {
    if (price < purchasePrice) {
      hint.classList.add("danger");
      parts.push("below cost");
    } else {
      const margin = ((price - purchasePrice) / price) * 100;
      if (margin < 10) {
        hint.classList.add("warn");
        parts.push(`margin ${margin.toFixed(1)}%`);
      }
    }
  }

  if (editorType === "purchase" && purchasePrice && price > purchasePrice * 1.1) {
    hint.classList.add("warn");
    parts.push("higher than last purchase");
  }

  hint.textContent = parts.join(" | ") || "Known item";
}

function renumberEditorRows() {
  elements.featureView.querySelectorAll("#transactionRows tr").forEach((row, index) => {
    row.cells[0].textContent = index + 1;
  });
}

function recalcTransactionEditor() {
  let qtyTotal = 0;
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  let grandTotal = 0;
  const taxSplitMode = editorTaxSplitMode();
  elements.featureView.querySelectorAll("#transactionRows tr").forEach((row) => {
    const qty = Number(row.querySelector('[name="qty"]').value || 0);
    const price = Number(row.querySelector('[name="price"]').value || 0);
    const discount = Number(row.querySelector('[name="discount"]').value || 0);
    const taxRate = parseTaxRate(row.querySelector('[name="tax"]').value);
    const gross = Math.max(0, qty * price);
    const taxable = Math.max(0, gross - discount);
    const taxAmount = taxable * taxRate / 100;
    const amount = taxable + taxAmount;
    qtyTotal += qty;
    subtotal += gross;
    discountTotal += discount;
    taxTotal += taxAmount;
    if (taxSplitMode === "igst") {
      igstTotal += taxAmount;
    } else {
      cgstTotal += taxAmount / 2;
      sgstTotal += taxAmount / 2;
    }
    grandTotal += amount;
    row.dataset.lineTax = taxAmount.toFixed(2);
    row.querySelector(".row-amount").textContent = amount.toFixed(2);
    updateRowSmartHint(row);
  });
  const roundOffToggle = elements.featureView.querySelector("#roundOffToggle");
  const roundOffValue = elements.featureView.querySelector("#editorRoundOffValue");
  const roundOff = roundOffToggle?.checked ? Math.round(grandTotal) - grandTotal : 0;
  grandTotal += roundOff;
  elements.featureView.querySelector("#editorSubtotal").textContent = subtotal.toFixed(2);
  elements.featureView.querySelector("#editorDiscountTotal").textContent = discountTotal.toFixed(2);
  elements.featureView.querySelector("#editorTaxTotal").textContent = taxTotal.toFixed(2);
  elements.featureView.querySelector("#editorCgstTotal").textContent = cgstTotal.toFixed(2);
  elements.featureView.querySelector("#editorSgstTotal").textContent = sgstTotal.toFixed(2);
  elements.featureView.querySelector("#editorIgstTotal").textContent = igstTotal.toFixed(2);
  if (roundOffValue) roundOffValue.value = roundOff.toFixed(2);
  elements.featureView.querySelector("#editorQtyTotal").textContent = qtyTotal.toString();
  elements.featureView.querySelector("#editorTableTotal").textContent = grandTotal.toFixed(2);
  elements.featureView.querySelector("#editorGrandTotal").value = grandTotal.toFixed(2);
  updateEditorPaymentBehavior(grandTotal);
  const received = Number(elements.featureView.querySelector("#editorReceived")?.value || 0);
  const balanceElement = elements.featureView.querySelector("#editorBalance");
  if (balanceElement) balanceElement.textContent = Math.max(0, grandTotal - received).toFixed(2);
  renderTransactionSmartChecks(grandTotal, received);
  updateTransactionEditorDirtyState();
}

function editorTaxSplitMode() {
  const firmState = state.businessSettings?.state || "Karnataka";
  const placeOfSupply = elements.featureView.querySelector('[name="state"]')?.value || "";
  return placeOfSupply && placeOfSupply.toLowerCase() !== firmState.toLowerCase() ? "igst" : "local";
}

function updateEditorPaymentBehavior(grandTotal = null) {
  const paymentType = elements.featureView.querySelector("#editorPaymentType");
  const paymentAmount = elements.featureView.querySelector("#editorReceived");
  const total = grandTotal ?? Number(elements.featureView.querySelector("#editorGrandTotal")?.value || 0);
  if (getTransactionEditorType() === "estimate") {
    if (paymentAmount) paymentAmount.value = "0";
    return;
  }
  const isCredit = paymentType?.value === "credit";

  if (paymentAmount && !paymentAmount.dataset.manualPayment) {
    paymentAmount.value = isCredit ? "0" : total.toFixed(2);
  }
}

function renderTransactionSmartChecks(grandTotal = null, received = null) {
  const list = elements.featureView.querySelector("#editorSmartChecks");
  if (!list) return;

  const checks = [];
  const partyName = elements.featureView.querySelector('[name="party"]')?.value || "";
  const party = getSelectedTransactionParty();
  const total = grandTotal ?? Number(elements.featureView.querySelector("#editorGrandTotal")?.value || 0);
  const paid = received ?? Number(elements.featureView.querySelector("#editorReceived")?.value || 0);
  const paymentType = elements.featureView.querySelector("#editorPaymentType")?.value || "cash";
  const supplyType = elements.featureView.querySelector('[name="supplyType"]')?.value || "b2c";
  const placeOfSupply = elements.featureView.querySelector('[name="state"]')?.value || "";
  const editorType = getTransactionEditorType();
  const isEstimate = editorType === "estimate";
  const isSaleReturn = editorType === "saleReturn";
  const isPurchaseReturn = editorType === "purchaseReturn";
  const isReturn = isSaleReturn || isPurchaseReturn;

  if (isSaleReturn && !party) {
    checks.push({ type: "danger", text: "Credit note needs an existing customer for receivable and statement adjustment." });
  } else if (isPurchaseReturn && !party) {
    checks.push({ type: "danger", text: "Debit note needs an existing supplier for payable and statement adjustment." });
  } else if (isEstimate && !partyName.trim()) {
    checks.push({ type: "danger", text: "Quotation needs a customer name." });
  } else if (isEstimate && partyName.trim() && !party) {
    checks.push({ type: "info", text: "Prospect name will stay on the quote; convert later after customer confirmation." });
  } else if (!isEstimate && !party && !(editorType === 'sale' && paymentType === 'cash' && supplyType === 'b2c' && !partyName.trim())) {
    checks.push({ type: "danger", text: `${editorType === "sale" ? "Sale" : "Purchase"} billing needs an existing ${editorType === "sale" ? "customer" : "supplier"}. Select one or add it first.` });
  }
  if (party) {
    const balance = Number(party.balance ?? party.openingBalance ?? 0);
    if (isSaleReturn) {
      checks.push({ type: "info", text: `${party.name} receivable will reduce by this credit note total.` });
    } else if (isPurchaseReturn) {
      checks.push({ type: "info", text: `${party.name} payable will reduce by this debit note total.` });
    } else if ((editorType === "sale" || isEstimate) && balance > 0) {
      checks.push({ type: "warn", text: `${party.name} already has ${formatCurrency(balance)} receivable.` });
    }
    if (editorType === "purchase" && balance < 0) {
      checks.push({ type: "warn", text: `${party.name} already has ${formatCurrency(Math.abs(balance))} payable.` });
    }
    if (party.creditLimit && editorType === "sale" && balance + total > Number(party.creditLimit)) {
      checks.push({ type: "danger", text: `Credit limit may exceed by ${formatCurrency(balance + total - Number(party.creditLimit))}.` });
    }
    if (supplyType === "b2b" && !party.gstin) {
      checks.push({ type: "danger", text: `${party.name}: GSTIN is required for B2B GST reporting.` });
    }
    if (party.gstin && supplyType === "b2c") {
      checks.push({ type: "warn", text: `${party.name} has GSTIN. Use B2B supply for GSTR reporting.` });
    }
  }
  if (!placeOfSupply) {
    checks.push({ type: "warn", text: "Select state/place of supply for CGST-SGST or IGST split." });
  }

  elements.featureView.querySelectorAll("#transactionRows tr").forEach((row) => {
    const itemName = row.querySelector('[name="item"]')?.value || "";
    const item = getSelectedTransactionItem(row);
    if (!itemName.trim()) return;
    if (!item) {
      checks.push({ type: "warn", text: `${itemName}: select an existing item or add it before saving.` });
      return;
    }

    const qty = Number(row.querySelector('[name="qty"]')?.value || 0);
    const price = Number(row.querySelector('[name="price"]')?.value || 0);
    const purchasePrice = Number(item.purchasePrice || 0);
    const stock = Number(item.currentStock || 0);
    const isService = String(item.itemType || "").toLowerCase() === "service";

    if ((editorType === "sale" || isEstimate) && !isService && qty > stock) {
      checks.push({ type: "danger", text: `${item.name}: stock ${formatQuantity(stock)}, invoice qty ${formatQuantity(qty)}.` });
    }
    if ((editorType === "sale" || isEstimate || isReturn) && purchasePrice && price && price < purchasePrice) {
      checks.push({ type: "danger", text: `${item.name}: sale price is below purchase price.` });
    }
    if ((editorType === "sale" || isEstimate || isReturn) && purchasePrice && price && price >= purchasePrice) {
      const margin = ((price - purchasePrice) / price) * 100;
      if (margin < 10) checks.push({ type: "warn", text: `${item.name}: low margin ${margin.toFixed(1)}%.` });
    }
    if (editorType === "purchase" && purchasePrice && price > purchasePrice * 1.1) {
      checks.push({ type: "warn", text: `${item.name}: price is higher than last purchase rate.` });
    }
    if (!Number(item.taxRate || 0)) {
      checks.push({ type: "info", text: `${item.name}: no GST rate set.` });
    }
    if (Number(item.taxRate || 0) && !item.hsnSac) {
      checks.push({ type: "warn", text: `${item.name}: HSN/SAC missing for GST report.` });
    }
  });

  if (!isEstimate && paid > total && total > 0) {
    const amountLabel = isReturn ? "Adjusted / refunded" : editorType === "sale" ? "Received" : "Paid";
    checks.push({ type: "warn", text: `${amountLabel} amount is more than ${isReturn ? "credit note" : "invoice"} total.` });
  }
  if (!isEstimate && !isReturn && paymentType === "cash" && total > paid) {
    checks.push({ type: "warn", text: `Paid ${editorType === "sale" ? "sale" : "purchase"} still has a balance. Switch to Credit or enter full ${editorType === "sale" ? "received" : "paid"} amount.` });
  }
  if (!checks.length) {
    checks.push({ type: "ok", text: "All compliance checks passed. Valid invoice structure." });
  }

  list.closest('.editor-smart-panel')?.classList.toggle('checks-clear', checks.every((check) => check.type === 'ok'));
  list.innerHTML = checks.slice(0, 4)
    .map((check) => `<li class="${check.type}">${escapeHtml(check.text)}</li>`)
    .join("");
}

let isTransactionEditorSaving = false;

async function saveTransactionEditor(event) {
  event.preventDefault();
  if (isTransactionEditorSaving) return;
  const saveMode = event.submitter?.dataset.saveMode || "close";
  clearInlineErrors(event.currentTarget);
  const form = new FormData(event.currentTarget);
  const validation = validateTransactionEditorSelections();
  if (!validation.valid) {
    setInlineError(validation.field, validation.message);
    validation.field?.focus();
    renderTransactionSmartChecks();
    return;
  }
  const editorType = getTransactionEditorType();
  let printPreview = saveMode === "print" ? buildInvoicePreviewData() : null;
  const missingCustomField = customFieldsForModule(editorType).find((field) => {
    if (!field.required) return false;
    const input = event.currentTarget.querySelector(`[name="customField:${field.fieldKey}"]`);
    return !input || (field.fieldType === "checkbox" ? !input.checked : !String(input.value || "").trim());
  });
  if (missingCustomField) {
    const field = event.currentTarget.querySelector(`[name="customField:${missingCustomField.fieldKey}"]`);
    setInlineError(field, `${missingCustomField.label} is required.`);
    field?.focus();
    return;
  }

  isTransactionEditorSaving = true;
  const formElement = event.currentTarget;
  const submitBtn = formElement.querySelector('.save-split-action .editor-split-main');
  const textSpan = submitBtn?.querySelector('.save-main-text') || submitBtn;
  const originalSaveText = textSpan?.textContent || "Save";
  if (textSpan) textSpan.textContent = "Saving…";
  const actionButtons = formElement.querySelectorAll('.transaction-editor-actions button');
  actionButtons.forEach((btn) => { btn.disabled = true; });
  const rows = validation.rows.map(({ row, item }) => ({
    item: row.querySelector('[name="item"]').value.trim(),
    description: row.querySelector('[name="description"]').value.trim(),
    qty: Number(row.querySelector('[name="qty"]').value || 0),
    unit: row.querySelector('[name="unit"]').value,
    price: Number(row.querySelector('[name="price"]').value || 0),
    discount: Number(row.querySelector('[name="discount"]').value || 0),
    hsnSac: item.hsnSac || "",
    taxRate: parseTaxRate(row.querySelector('[name="tax"]').value),
    itemId: item.id,
  }));
  const amount = Number(elements.featureView.querySelector("#editorGrandTotal").value || 0);
  const received = Number(elements.featureView.querySelector("#editorReceived").value || 0);
  const invoiceDescription = String(form.get("invoiceDescription") || "").trim();
  const customFields = collectCustomFieldValues(editorType);
  const itemSummary = rows.map((row) => `${row.item} x ${row.qty}`).join(", ");
  const attachmentSummary = editorAttachmentSummary();
  const isOpDoc = isOperationalDoc(editorType);
  const transaction = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    invoiceId: activeTransactionEditInvoiceId || undefined,
    estimateId: isOpDoc ? activeTransactionEditInvoiceId || undefined : undefined,
    type: editorType,
    documentType: editorType === "saleOrder" ? "sale_order" : editorType === "deliveryChallan" ? "delivery_challan" : editorType === "purchaseOrder" ? "purchase_order" : editorType,
    invoiceNo: invoiceNumberFromForm(form),
    quoteNo: invoiceNumberFromForm(form),
    party: validation.walkIn ? '' : validation.party.name,
    partyId: validation.party.id,
    item: rows.length === 1 ? rows[0].item : `${rows.length} items`,
    amount,
    received: isOpDoc ? 0 : received,
    phone: String(form.get("phone") || "").trim(),
    billingAddress: String(form.get("address") || "").trim(),
    originalInvoiceId: String(form.get("originalInvoiceId") || "").trim(),
    originalInvoiceNo: String(form.get("originalInvoiceNo") || "").trim(),
    paymentType: String(form.get("paymentType") || "cash"),
    paymentTerms: String(form.get("paymentTerms") || "Net 30"),
    paymentMethod: String(form.get("paymentMethod") || "Cash"),
    supplyType: String(form.get("supplyType") || "b2c"),
    placeOfSupply: String(form.get("state") || "").trim(),
    partyGstin: String(form.get("partyGstin") || validation.party.gstin || "").trim(),
    partyTaxType: String(validation.party.taxType || "unregistered"),
    firmState: state.businessSettings?.state || "Karnataka",
    dueDate: parseEditorDate(String(form.get("dueDate") || "")) || new Date().toISOString(),
    validUntil: parseEditorDate(String(form.get("dueDate") || "")) || new Date().toISOString(),
    items: rows,
    updatePurchaseDefaults: editorType === 'purchase' && form.get('updatePurchaseDefaults') === 'on',
    meta: {
      customFields,
      sourceEstimateId: event.currentTarget.dataset.sourceEstimateId || undefined,
      roundOff: Boolean(elements.featureView.querySelector('#roundOffToggle')?.checked),
    },
    status: isOpDoc ? "draft" : received >= amount ? "paid" : "due",
    notes: [invoiceDescription, itemSummary, attachmentSummary].filter(Boolean).join(" | "),
    date: parseEditorDate(String(form.get("invoiceDate") || "")) || new Date().toISOString(),
  };

  try {
    if (isOpDoc && activeTransactionEditInvoiceId && window.giDB?.updateEstimate) {
      state = normalizeState(await window.giDB.updateEstimate(transaction));
    } else if (isOpDoc && window.giDB?.createEstimate) {
      state = normalizeState(await window.giDB.createEstimate(transaction));
    } else if (isOpDoc && activeTransactionEditInvoiceId) {
      updateLocalEstimate(transaction);
    } else if (isOpDoc) {
      createLocalEstimate(transaction);
    } else if (editorType === "saleReturn" && activeTransactionEditInvoiceId && window.giDB?.updateCreditNote) {
      state = normalizeState(await window.giDB.updateCreditNote({ ...transaction, creditNoteId: activeTransactionEditInvoiceId }));
    } else if (editorType === "saleReturn" && window.giDB?.createCreditNote) {
      state = normalizeState(await window.giDB.createCreditNote(transaction));
    } else if (editorType === "saleReturn" && activeTransactionEditInvoiceId) {
      updateLocalCreditNote({ ...transaction, creditNoteId: activeTransactionEditInvoiceId });
    } else if (editorType === "saleReturn") {
      createLocalCreditNote(transaction);
    } else if (editorType === "purchaseReturn" && activeTransactionEditInvoiceId && window.giDB?.updateDebitNote) {
      state = normalizeState(await window.giDB.updateDebitNote({ ...transaction, debitNoteId: activeTransactionEditInvoiceId }));
    } else if (editorType === "purchaseReturn" && window.giDB?.createDebitNote) {
      state = normalizeState(await window.giDB.createDebitNote(transaction));
    } else if (editorType === "purchaseReturn" && activeTransactionEditInvoiceId) {
      updateLocalDebitNote({ ...transaction, debitNoteId: activeTransactionEditInvoiceId });
    } else if (editorType === "purchaseReturn") {
      createLocalDebitNote(transaction);
    } else if (activeTransactionEditInvoiceId && window.giDB?.updateInvoice) {
      state = normalizeState(await window.giDB.updateInvoice(transaction));
    } else if (window.giDB) {
      state = normalizeState(await window.giDB.createTransaction(transaction));
    } else if (activeTransactionEditInvoiceId) {
      updateLocalInvoice(transaction);
    } else {
      state.transactions.unshift(transaction);
      saveState();
    }
  } catch (error) {
    isTransactionEditorSaving = false;
    if (textSpan) textSpan.textContent = originalSaveText;
    actionButtons.forEach((btn) => { btn.disabled = false; });
    showToast(error.message || "Unable to save invoice. Please select existing party and item records.");
    return;
  }
  isTransactionEditorSaving = false;
  if (textSpan) textSpan.textContent = originalSaveText;
  actionButtons.forEach((btn) => { btn.disabled = false; });

  if (saveMode === 'print' && ['sale', 'purchase'].includes(editorType)) {
    const saved = (state.invoices || []).find((invoice) => activeTransactionEditInvoiceId
      ? String(invoice.id) === String(activeTransactionEditInvoiceId)
      : String(invoice.transactionId) === String(transaction.id));
    if (saved) printPreview = invoicePreviewDataFromRecord(saved);
  } else if (saveMode === 'print' && editorType === 'purchaseReturn') {
    const savedNote = (state.debitNotes || []).find((note) => activeTransactionEditInvoiceId
      ? String(note.id) === String(activeTransactionEditInvoiceId)
      : String(note.debitNo) === String(transaction.invoiceNo));
    if (savedNote) printPreview = debitNotePreviewDataFromRecord(savedNote);
  }
  renderDashboard();
  clearTransactionDraft(editorType);
  resetTransactionEditorDirtyState();
  if (isOpDoc) {
    const meta = transactionEditorMeta(editorType);
    showToast(activeTransactionEditInvoiceId ? `${meta.noun} updated.` : `${meta.noun} saved.`);
    if (saveMode === "print") {
      openInvoicePreviewModal(printPreview);
      return;
    }
    if (saveMode === "new") {
      openTransactionEditor(editorType);
    } else {
      showView(meta.returnView);
    }
    return;
  }
  if (editorType === "saleReturn") {
    showToast(activeTransactionEditInvoiceId ? "Credit note updated." : "Credit note saved.");
    if (saveMode === "print") {
      openInvoicePreviewModal(printPreview);
      return;
    }
    if (saveMode === "new") {
      openTransactionEditor(editorType);
    } else {
      showView("saleReturn");
    }
    return;
  }
  if (editorType === "purchaseReturn") {
    showToast(activeTransactionEditInvoiceId ? "Debit note updated." : "Debit note saved.");
    if (saveMode === "print") {
      openInvoicePreviewModal(printPreview);
      return;
    }
    if (saveMode === "new") {
      openTransactionEditor(editorType);
    } else {
      showView("purchaseReturn");
    }
    return;
  }
  showToast(activeTransactionEditInvoiceId ? "Invoice updated." : "Invoice saved.");
  if (received > 0) showToast("Payment recorded.");
  if (saveMode === "print") {
    openInvoicePreviewModal(printPreview);
    return;
  }
  if (saveMode === "new") {
    openTransactionEditor(editorType);
  } else {
    showView(editorType === "sale" ? "sales" : "purchases");
  }
}

function updateLocalInvoice(transaction) {
  const invoiceIndex = (state.invoices || []).findIndex((invoice) => String(invoice.id) === String(transaction.invoiceId));
  if (invoiceIndex >= 0) {
    const total = Number(transaction.amount || 0);
    const received = Number(transaction.received || 0);
    state.invoices[invoiceIndex] = {
      ...state.invoices[invoiceIndex],
      ...transaction,
      id: transaction.invoiceId,
      total,
      received,
      balance: Math.max(0, total - received),
      status: received >= total ? "paid" : received > 0 ? "partially_paid" : "unpaid",
    };
  }
  state.invoiceItems = (state.invoiceItems || []).filter((line) => String(line.invoiceId) !== String(transaction.invoiceId));
  transaction.items.forEach((item, index) => {
    const taxable = Math.max(0, Number(item.qty || 0) * Number(item.price || 0) - Number(item.discount || 0));
    const taxAmount = taxable * Number(item.taxRate || 0) / 100;
    state.invoiceItems.push({
      id: `${transaction.invoiceId}-${index + 1}`,
      invoiceId: transaction.invoiceId,
      lineNo: index + 1,
      item: item.item,
      itemId: item.itemId,
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      price: item.price,
      discount: item.discount,
      hsnSac: item.hsnSac,
      taxRate: item.taxRate,
      taxAmount,
      lineTotal: taxable + taxAmount,
    });
  });
  saveState();
}

function createLocalCreditNote(transaction) {
  const creditNoteId = transaction.creditNoteId || transaction.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const items = creditNoteItemsFromTransaction(creditNoteId, transaction.items || []);
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const discountTotal = items.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  const taxTotal = items.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
  const total = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const adjusted = Math.min(Math.max(0, Number(transaction.received || 0)), total);
  const note = {
    id: creditNoteId,
    creditNo: transaction.invoiceNo || `CN-${String((state.creditNotes || []).length + 1).padStart(4, "0")}`,
    originalInvoiceId: transaction.originalInvoiceId || "",
    originalInvoiceNo: transaction.originalInvoiceNo || "",
    party: transaction.party,
    phone: transaction.phone || "",
    billingAddress: transaction.billingAddress || "",
    date: transaction.date || new Date().toISOString(),
    refundDate: transaction.dueDate || "",
    paymentTerms: transaction.paymentTerms || "",
    paymentMethod: transaction.paymentMethod || "Adjustment",
    supplyType: transaction.supplyType || "b2c",
    placeOfSupply: transaction.placeOfSupply || "",
    partyGstin: transaction.partyGstin || "",
    partyTaxType: transaction.partyTaxType || "unregistered",
    subtotal,
    discountTotal,
    taxTotal,
    cgstTotal: items.reduce((sum, item) => sum + Number(item.cgstAmount || 0), 0),
    sgstTotal: items.reduce((sum, item) => sum + Number(item.sgstAmount || 0), 0),
    igstTotal: items.reduce((sum, item) => sum + Number(item.igstAmount || 0), 0),
    total,
    adjusted,
    balance: Math.max(0, total - adjusted),
    status: total - adjusted <= 0 ? "adjusted" : adjusted > 0 ? "partial" : "open",
    reason: "",
    notes: transaction.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.creditNotes = [note, ...(state.creditNotes || [])];
  state.creditNoteItems = [...items, ...(state.creditNoteItems || [])];
  state.stockMovements = [
    ...items.map((item) => ({
      id: `${creditNoteId}-stock-${item.lineNo}`,
      creditNoteId,
      itemId: item.itemId,
      item: item.item,
      movementType: "in",
      quantity: item.qty,
      unit: item.unit,
      rate: item.price,
      movementDate: note.date,
      notes: `${note.creditNo} sale return stock in`,
      createdAt: note.createdAt,
    })),
    ...(state.stockMovements || []),
  ];
  saveState();
}

function updateLocalCreditNote(transaction) {
  const creditNoteId = transaction.creditNoteId || transaction.invoiceId;
  if (!creditNoteId) return createLocalCreditNote(transaction);
  state.creditNotes = (state.creditNotes || []).filter((note) => String(note.id) !== String(creditNoteId));
  state.creditNoteItems = (state.creditNoteItems || []).filter((item) => String(item.creditNoteId) !== String(creditNoteId));
  state.stockMovements = (state.stockMovements || []).filter((movement) => String(movement.creditNoteId) !== String(creditNoteId));
  createLocalCreditNote({ ...transaction, creditNoteId, id: creditNoteId });
}

function creditNoteItemsFromTransaction(creditNoteId, rows) {
  const taxSplitMode = editorTaxSplitMode();
  return rows.map((item, index) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const discount = Number(item.discount || 0);
    const taxRate = Number(item.taxRate || 0);
    const taxableValue = Math.max(0, qty * price - discount);
    const taxAmount = taxableValue * taxRate / 100;
    const split = taxSplitMode === "igst"
      ? { cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount }
      : { cgstAmount: taxAmount / 2, sgstAmount: taxAmount / 2, igstAmount: 0 };
    return {
      id: `${creditNoteId}-${index + 1}`,
      creditNoteId,
      lineNo: index + 1,
      item: item.item,
      itemId: item.itemId,
      description: item.description,
      qty,
      unit: item.unit,
      price,
      discount,
      hsnSac: item.hsnSac,
      taxableValue,
      taxRate,
      taxAmount,
      ...split,
      cessAmount: 0,
      lineTotal: taxableValue + taxAmount,
    };
  });
}

function createLocalEstimate(transaction) {
  const estimateId = transaction.estimateId || transaction.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const estimate = {
    id: estimateId,
    quoteNo: transaction.quoteNo || transaction.invoiceNo || `QT-${String((state.estimates || []).length + 1).padStart(4, "0")}`,
    party: transaction.party,
    phone: transaction.phone || "",
    billingAddress: transaction.billingAddress || "",
    date: transaction.date || new Date().toISOString(),
    validUntil: transaction.validUntil || transaction.dueDate || "",
    paymentTerms: transaction.paymentTerms || "",
    supplyType: transaction.supplyType || "b2c",
    placeOfSupply: transaction.placeOfSupply || "",
    partyGstin: transaction.partyGstin || "",
    partyTaxType: transaction.partyTaxType || "unregistered",
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 0,
    total: Number(transaction.amount || 0),
    status: transaction.status || "draft",
    notes: transaction.notes || "",
    createdAt: new Date().toISOString(),
  };
  const items = estimateItemsFromTransaction(estimateId, transaction.items || []);
  estimate.subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  estimate.discountTotal = items.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  estimate.taxTotal = items.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
  estimate.cgstTotal = items.reduce((sum, item) => sum + Number(item.cgstAmount || 0), 0);
  estimate.sgstTotal = items.reduce((sum, item) => sum + Number(item.sgstAmount || 0), 0);
  estimate.igstTotal = items.reduce((sum, item) => sum + Number(item.igstAmount || 0), 0);
  estimate.total = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  state.estimates = [estimate, ...(state.estimates || [])];
  state.estimateItems = [...items, ...(state.estimateItems || [])];
  saveState();
}

function updateLocalEstimate(transaction) {
  const estimateId = transaction.estimateId || transaction.invoiceId;
  if (!estimateId) return createLocalEstimate(transaction);
  state.estimates = (state.estimates || []).filter((estimate) => String(estimate.id) !== String(estimateId));
  state.estimateItems = (state.estimateItems || []).filter((item) => String(item.estimateId) !== String(estimateId));
  createLocalEstimate({ ...transaction, estimateId, id: estimateId });
}

function estimateItemsFromTransaction(estimateId, rows) {
  const taxSplitMode = editorTaxSplitMode();
  return rows.map((item, index) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const discount = Number(item.discount || 0);
    const taxRate = Number(item.taxRate || 0);
    const taxableValue = Math.max(0, qty * price - discount);
    const taxAmount = taxableValue * taxRate / 100;
    const split = taxSplitMode === "igst"
      ? { cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount }
      : { cgstAmount: taxAmount / 2, sgstAmount: taxAmount / 2, igstAmount: 0 };
    return {
      id: `${estimateId}-${index + 1}`,
      estimateId,
      lineNo: index + 1,
      item: item.item,
      itemId: item.itemId,
      description: item.description,
      qty,
      unit: item.unit,
      price,
      discount,
      hsnSac: item.hsnSac,
      taxableValue,
      taxRate,
      taxAmount,
      ...split,
      lineTotal: taxableValue + taxAmount,
    };
  });
}

function validateTransactionEditorSelections() {
  const partyInput = elements.featureView.querySelector('[name="party"]');
  const stateInput = elements.featureView.querySelector('[name="state"]');
  const gstinInput = elements.featureView.querySelector('[name="partyGstin"]');
  const supplyType = elements.featureView.querySelector('[name="supplyType"]')?.value || "b2c";
  const editorType = getTransactionEditorType();
  const party = getSelectedTransactionParty();
  const partyName = String(partyInput?.value || "").trim();
  const partyLabel = transactionEditorMeta(editorType).partyRole;
  const isEstimate = editorType === "estimate";
  const isSaleReturn = editorType === "saleReturn";
  const isPurchaseReturn = editorType === "purchaseReturn";
  const isReturn = isSaleReturn || isPurchaseReturn;
  const walkIn = editorType === 'sale' && !partyName && !party && supplyType === 'b2c' && elements.featureView.querySelector('[name="paymentType"]')?.value === 'cash';
  const requiresExistingParty = (isReturn || !isEstimate) && !walkIn;

  if (isEstimate && !partyName) {
    return {
      valid: false,
      message: "Customer name is required for a quotation.",
      field: partyInput,
    };
  }

  if (requiresExistingParty && !party) {
    return {
      valid: false,
      message: isSaleReturn
        ? "Credit note needs an existing customer. Select one or add the customer first."
        : isPurchaseReturn
        ? "Debit note needs an existing supplier. Select one or add the supplier first."
        : `Billing needs an existing ${partyLabel}. Select one or add a new ${partyLabel}.`,
      field: partyInput,
    };
  }
  if (!stateInput?.value) {
    return {
      valid: false,
      message: "State/place of supply is required for GST split.",
      field: stateInput,
    };
  }
  const invoiceParty = party || {
    id: "",
    name: partyName || (editorType === "purchase" ? "Paid Supplier" : "Paid Customer"),
    phone: elements.featureView.querySelector('[name="phone"]')?.value || "",
    billingAddress: elements.featureView.querySelector('[name="address"]')?.value || "",
    gstin: "",
    taxType: "unregistered",
    state: stateInput?.value || "",
    balance: 0,
  };

  if (supplyType === "b2b" && !isValidGstin(gstinInput?.value || invoiceParty.gstin || "")) {
    return {
      valid: false,
      message: "B2B invoices need a valid 15-character GSTIN.",
      field: gstinInput,
    };
  }

  const rowEntries = [...elements.featureView.querySelectorAll("#transactionRows tr")]
    .map((row) => ({ row, itemName: row.querySelector('[name="item"]')?.value.trim() || "" }))
    .filter(({ row, itemName }) => itemName || Number(row.querySelector('[name="qty"]')?.value || 0) || Number(row.querySelector('[name="price"]')?.value || 0));

  if (!rowEntries.length) {
    const firstItem = elements.featureView.querySelector('#transactionRows [name="item"]');
    return {
      valid: false,
      message: "Please select at least one existing item, or add a new item from the item box.",
      field: firstItem,
    };
  }

  const rows = [];
  for (const entry of rowEntries) {
    const item = getSelectedTransactionItem(entry.row);
    const qtyField = entry.row.querySelector('[name="qty"]');
    const priceField = entry.row.querySelector('[name="price"]');
    if (!item) {
      return {
        valid: false,
        message: `Please select an existing item for "${entry.itemName}", or add it first from the item box.`,
        field: entry.row.querySelector('[name="item"]'),
      };
    }
    if (Number(qtyField?.value || 0) <= 0) {
      return {
        valid: false,
        message: "Quantity must be greater than zero.",
        field: qtyField,
      };
    }
    if (Number(priceField?.value || 0) < 0) {
      return {
        valid: false,
        message: "Price cannot be negative.",
        field: priceField,
      };
    }
    rows.push({ row: entry.row, item });
  }

  return { valid: true, party: invoiceParty, rows, walkIn };
}

function invoiceNumberFromForm(form) {
  const value = String(form.get("invoiceNo") || "").trim();
  return value && value.toLowerCase() !== "auto" ? value : "";
}

function parseTaxRate(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function parseEditorDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function parseEditorDateAsDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toEditorDateString(value) {
  const date = value instanceof Date ? value : (parseEditorDateAsDate(value) || new Date(value || Date.now()));
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("en-GB");
  return date.toLocaleDateString("en-GB");
}

function closeEntryModal() {
  const returnContext = entryReturnContext;
  elements.entryModal.classList.add("hidden");
  delete document.body.dataset.entryType;
  delete document.body.dataset.entryMode;
  currentEntryRecordId = null;
  entryReturnContext = null;
  if (returnContext?.transactionType) {
    currentEntryType = returnContext.transactionType;
    activeTransactionEditorType = returnContext.transactionType;
  }
  const submitButton = elements.entryForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = "Save";
}

function populateEntryForm(type, record) {
  if (!record) return;
  if (type === "party") {
    setEntryValue("party", record.name);
    setEntryValue("phone", record.phone);
    setEntryValue("email", record.email);
    setEntryValue("contactPerson", record.contactPerson);
    setEntryValue("taxType", record.taxType || "unregistered");
    setEntryValue("state", record.state);
    setEntryValue("gstin", record.gstin);
    setEntryValue("legalName", record.legalName);
    setEntryValue("pan", record.pan);
    setEntryValue("billingAddress", record.billingAddress);
    setEntryValue("shippingAddress", record.shippingAddress);
    const openingBalance = Number(record.openingBalance || 0);
    setEntryValue("openingBalance", Math.abs(openingBalance) || "");
    setEntryValue("openingBalanceType", openingBalance < 0 ? "payable" : (record.openingBalanceType || "receivable"));
    setEntryValue("creditLimit", Number(record.creditLimit || 0) || "");
    setEntryValue("paymentTerms", record.paymentTerms);
    setEntryValue("dueDays", Number(record.dueDays || 0) || "");
    setEntryValue("notes", record.notes);
    const sameAsBilling = elements.entryForm.querySelector('[name="sameAsBilling"]');
    const shippingAddress = elements.entryForm.querySelector('[name="shippingAddress"]');
    if (sameAsBilling && shippingAddress) {
      sameAsBilling.checked = Boolean(record.billingAddress && record.billingAddress === record.shippingAddress);
      shippingAddress.disabled = sameAsBilling.checked;
    }
    updatePartyTaxFields();
    return;
  }

  if (type === "item") {
    setEntryValue("item", record.name);
    setEntryValue("itemType", record.itemType || "product");
    setEntryValue("unit", record.unit);
    setEntryValue("category", record.category);
    setEntryValue("sku", record.sku);
    setEntryValue("hsnSac", record.hsnSac);
    setEntryValue("storageLocation", record.storageLocation);
    setEntryValue("salePrice", Number(record.salePrice || 0) || "");
    setEntryValue("saleTaxType", record.saleTaxType || "without_tax");
    setEntryValue("purchasePrice", Number(record.purchasePrice || 0) || "");
    setEntryValue("purchaseTaxType", record.purchaseTaxType || "without_tax");
    setEntryValue("taxRate", Number(record.taxRate || 0));
    setEntryValue("discount", Number(record.discount || 0) || "");
    setEntryValue("openingStock", Number(record.openingStock || 0) || "");
    setEntryValue("openingStockDate", formatDateInput(record.openingStockDate));
    setEntryValue("openingStockValue", Number(record.openingStockValue || 0) || "");
    setEntryValue("itemDescription", record.description);
    setEntryValue("notes", record.notes);
    updateItemEntryFields();
  }
}

function populateEntryDraft(type, draft) {
  if (!draft) return;
  if (type === "party") {
    setEntryValue("party", draft.party || "");
    setEntryValue("phone", draft.phone || "");
    return;
  }
  if (type === "item") {
    setEntryValue("item", draft.item || "");
    updateItemEntryFields();
  }
}

function setEntryValue(name, value) {
  const field = elements.entryForm.querySelector(`[name="${name}"]`);
  if (!field) return;
  field.value = value ?? "";
}

function formatDateInput(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function bindPartyEntryFields() {
  const taxType = elements.entryForm.querySelector('[name="taxType"]');
  taxType.onchange = updatePartyTaxFields;

  const sameAsBilling = elements.entryForm.querySelector('[name="sameAsBilling"]');
  const billingAddress = elements.entryForm.querySelector('[name="billingAddress"]');
  const shippingAddress = elements.entryForm.querySelector('[name="shippingAddress"]');
  sameAsBilling.onchange = () => {
    if (sameAsBilling.checked) {
      shippingAddress.value = billingAddress.value;
      shippingAddress.disabled = true;
    } else {
      shippingAddress.disabled = false;
    }
  };
  billingAddress.oninput = () => {
    if (sameAsBilling.checked) shippingAddress.value = billingAddress.value;
  };
}

function updatePartyTaxFields() {
  const taxType = elements.entryForm.querySelector('[name="taxType"]')?.value || "unregistered";
  const showGstFields = taxType === "gst_registered" || taxType === "composition";
  elements.entryForm.querySelectorAll(".gst-detail-field").forEach((field) => {
    field.classList.toggle("hidden-tax-field", !showGstFields || currentEntryType !== "party");
  });
  const gstin = elements.entryForm.querySelector('[name="gstin"]');
  gstin.required = currentEntryType === "party" && showGstFields;
}

function bindItemEntryFields() {
  const itemType = elements.entryForm.querySelector('[name="itemType"]');
  const openingStockDate = elements.entryForm.querySelector('[name="openingStockDate"]');
  if (!itemType) return;
  renderItemChoiceLists();
  itemType.onchange = updateItemEntryFields;
  const quickAddUnit = elements.entryForm.querySelector("[data-action='quick-add-unit']");
  const quickAddCategory = elements.entryForm.querySelector("[data-action='quick-add-category']");
  if (quickAddUnit) quickAddUnit.onclick = () => quickAddItemMaster("unit");
  if (quickAddCategory) quickAddCategory.onclick = () => quickAddItemMaster("category");
  if (currentEntryType === "item" && openingStockDate && !openingStockDate.value) {
    openingStockDate.value = new Date().toISOString().slice(0, 10);
  }
}

async function quickAddItemMaster(kind) {
  const label = kind === "unit" ? "unit" : "category";
  const name = await appPrompt(`Add ${kind === "unit" ? "Unit" : "Category"}`, `Enter ${label} name:`);
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  try {
    if (window.giDB) {
      state = normalizeState(kind === "unit"
        ? await window.giDB.createUnit({ name: cleanName })
        : await window.giDB.createItemCategory({ name: cleanName }));
    } else {
      addLocalMaster(kind, { name: cleanName });
      saveState();
    }
    renderItemChoiceLists();
    setEntryValue(kind === "unit" ? "unit" : "category", cleanName);
    showToast(`Added ${cleanName} to ${label}s.`);
  } catch (error) {
    showToast(error.message || `Unable to save ${label}.`);
  }
}

function renderItemChoiceLists() {
  const unitOptions = elements.entryForm.querySelector("#itemUnitOptions");
  const categoryOptions = elements.entryForm.querySelector("#itemCategoryOptions");
  if (!unitOptions || !categoryOptions) return;

  const savedUnits = (state.units || []).filter((u) => u.is_active !== false).map((u) => u.name);
  const savedCategories = (state.itemCategories || []).filter((c) => c.is_active !== false).map((c) => c.name);
  unitOptions.innerHTML = optionListMarkup(mergeChoiceList(DEFAULT_ITEM_UNITS, savedUnits));
  categoryOptions.innerHTML = optionListMarkup(mergeChoiceList(DEFAULT_ITEM_CATEGORIES, savedCategories));
}

function masterUnitNames() {
  return mergeChoiceList(DEFAULT_ITEM_UNITS, (state.units || []).map((unit) => unit.name));
}

function masterCategoryNames() {
  return mergeChoiceList(DEFAULT_ITEM_CATEGORIES, (state.itemCategories || []).map((category) => category.name));
}

function mergeChoiceList(defaults, savedValues) {
  const normalized = new Map();
  [...defaults, ...savedValues].forEach((value) => {
    const label = String(value || "").trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (!normalized.has(key)) normalized.set(key, label);
  });
  return [...normalized.values()];
}

function optionListMarkup(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function updateItemEntryFields() {
  const itemType = elements.entryForm.querySelector('[name="itemType"]')?.value || "product";
  const isService = currentEntryType === "item" && itemType === "service";
  const unit = elements.entryForm.querySelector('[name="unit"]');
  const currentUnit = unit?.value.trim();
  const shouldUseDefaultUnit = !currentUnit || (isService && currentUnit === "Pcs") || (!isService && currentUnit === "Hr");
  if (currentEntryType === "item" && unit && shouldUseDefaultUnit) {
    unit.value = isService ? "Hr" : "Pcs";
  }
  elements.entryForm.querySelectorAll(".product-stock-field").forEach((field) => {
    field.classList.toggle("hidden-stock-field", currentEntryType !== "item" || isService);
  });
  const stockSection = elements.entryForm.querySelector(".item-stock-section");
  if (stockSection) {
    stockSection.classList.toggle("hidden-stock-field", currentEntryType !== "item" || isService);
  }
  const hsnSacLabel = document.getElementById("hsnSacLabel");
  if (hsnSacLabel) hsnSacLabel.textContent = isService ? "SAC Code" : "HSN Code";
}

function validateEntryForm(form) {
  if (currentEntryType === "party") {
    const partyField = elements.entryForm.querySelector('[name="party"]');
    const gstinField = elements.entryForm.querySelector('[name="gstin"]');
    const taxType = String(form.get("taxType") || "unregistered");
    const gstin = String(form.get("gstin") || "").trim();
    if (!String(form.get("party") || "").trim()) {
      return { valid: false, field: partyField, message: "Party name is required." };
    }
    if ((taxType === "gst_registered" || taxType === "composition") && !gstin) {
      return { valid: false, field: gstinField, message: "GSTIN is required for registered parties." };
    }
    if (gstin && !isValidGstin(gstin)) {
      return { valid: false, field: gstinField, message: "Enter a valid 15-character GSTIN, e.g. 22AAAAA0000A1Z5." };
    }
  }

  if (currentEntryType === "item") {
    const itemField = elements.entryForm.querySelector('[name="item"]');
    if (!String(form.get("item") || "").trim()) {
      return { valid: false, field: itemField, message: "Item name is required." };
    }
  }

  if (currentEntryType === "sale" || currentEntryType === "purchase") {
    const partyField = elements.entryForm.querySelector('[name="party"]');
    const itemField = elements.entryForm.querySelector('[name="item"]');
    const amountField = elements.entryForm.querySelector('[name="amount"]');
    if (!String(form.get("party") || "").trim()) return { valid: false, field: partyField, message: "Party name is required." };
    if (!String(form.get("item") || "").trim()) return { valid: false, field: itemField, message: "Item name is required." };
    if (Number(form.get("amount") || 0) <= 0) return { valid: false, field: amountField, message: "Amount must be greater than zero." };
  }

  return { valid: true };
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  clearInlineErrors(elements.entryForm);
  const form = new FormData(elements.entryForm);
  const party = String(form.get("party") || "").trim();
  const item = String(form.get("item") || "").trim();
  const amount = Number(form.get("amount") || 0);
  const notes = String(form.get("notes") || "").trim();
  const editingRecordId = currentEntryRecordId;
  const returnContext = entryReturnContext;
  const savedEntryType = currentEntryType;
  const validation = validateEntryForm(form);
  if (!validation.valid) {
    setInlineError(validation.field, validation.message);
    validation.field?.focus();
    return;
  }

  try {
    if (currentEntryType === "party") {
    const billingAddress = String(form.get("billingAddress") || "").trim();
    const shippingAddress = form.get("sameAsBilling")
      ? billingAddress
      : String(form.get("shippingAddress") || "").trim();
    const openingBalance = Number(form.get("openingBalance") || 0);
    const openingBalanceType = String(form.get("openingBalanceType") || "receivable");
    const normalizedOpeningBalance = openingBalanceType === "payable" ? -Math.abs(openingBalance) : Math.abs(openingBalance);
    const partyDetails = {
      name: party,
      notes,
      type: "party",
      phone: String(form.get("phone") || "").trim(),
      email: String(form.get("email") || "").trim(),
      contactPerson: String(form.get("contactPerson") || "").trim(),
      taxType: String(form.get("taxType") || "unregistered"),
      gstin: String(form.get("gstin") || "").trim(),
      legalName: String(form.get("legalName") || "").trim(),
      state: String(form.get("state") || "").trim(),
      pan: String(form.get("pan") || "").trim(),
      billingAddress,
      shippingAddress,
      openingBalance: normalizedOpeningBalance,
      openingBalanceType,
      creditLimit: Number(form.get("creditLimit") || 0),
      paymentTerms: String(form.get("paymentTerms") || "").trim(),
      dueDays: Number(form.get("dueDays") || 0),
    };
    if (window.giDB) {
      state = normalizeState(editingRecordId
        ? await window.giDB.updateParty({ id: editingRecordId, ...partyDetails })
        : await window.giDB.createParty(partyDetails));
    } else {
      if (editingRecordId) {
        updateLocalById(state.parties, editingRecordId, partyDetails);
      } else {
        upsertByName(state.parties, { ...partyDetails, id: Date.now(), createdAt: new Date().toISOString() });
      }
    }
  } else if (currentEntryType === "item") {
    const itemType = String(form.get("itemType") || "product");
    const isService = itemType === "service";
    const itemDetails = {
      name: item,
      notes,
      itemType,
      sku: String(form.get("sku") || "").trim(),
      category: String(form.get("category") || "").trim(),
      unit: String(form.get("unit") || "").trim(),
      hsnSac: String(form.get("hsnSac") || "").trim(),
      salePrice: Number(form.get("salePrice") || 0),
      saleTaxType: String(form.get("saleTaxType") || "without_tax"),
      purchasePrice: Number(form.get("purchasePrice") || 0),
      purchaseTaxType: String(form.get("purchaseTaxType") || "without_tax"),
      taxRate: Number(form.get("taxRate") || 0),
      discount: Number(form.get("discount") || 0),
      openingStock: isService ? 0 : Number(form.get("openingStock") || 0),
      openingStockDate: isService ? "" : String(form.get("openingStockDate") || ""),
      openingStockValue: isService ? 0 : Number(form.get("openingStockValue") || 0),
      storageLocation: isService ? "" : String(form.get("storageLocation") || "").trim(),
      description: String(form.get("itemDescription") || "").trim(),
    };
    if (window.giDB) {
      state = normalizeState(editingRecordId
        ? await window.giDB.updateItem({ id: editingRecordId, ...itemDetails })
        : await window.giDB.createItem(itemDetails));
    } else {
      addLocalMaster("unit", { name: itemDetails.unit });
      addLocalMaster("category", { name: itemDetails.category });
      if (editingRecordId) {
        updateLocalById(state.items, editingRecordId, { ...itemDetails, currentStock: itemDetails.openingStock });
      } else {
        upsertByName(state.items, { ...itemDetails, id: Date.now(), currentStock: itemDetails.openingStock, createdAt: new Date().toISOString() });
      }
    }
  } else {
    const transaction = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: currentEntryType,
      party,
      item,
      amount,
      status: form.get("status"),
      notes,
      date: new Date().toISOString(),
    };
    if (window.giDB) {
      state = normalizeState(await window.giDB.createTransaction(transaction));
    } else {
      state.transactions.unshift(transaction);
      upsertByName(state.parties, { name: party, notes: "", createdAt: transaction.date });
      upsertByName(state.items, { name: item, notes: "", createdAt: transaction.date });
    }
  }
  } catch (error) {
    showToast(error.message || "Unable to save. Please check the details and try again.");
    return;
  }

  if (!window.giDB) saveState();
  closeEntryModal();
  if (savedEntryType === "party") showToast(editingRecordId ? "Customer updated." : "Customer added.");
  if (savedEntryType === "item") showToast(editingRecordId ? "Item updated." : "Item added.");
  if (savedEntryType === "sale" || savedEntryType === "purchase") showToast("Invoice saved.");
  if (returnContext?.type === "transactionParty") {
    const savedParty = findPartyByName(party) || findPartyByPhone(String(form.get("phone") || ""));
    if (savedParty) selectTransactionParty(savedParty);
    renderDashboard();
    return;
  }
  if (returnContext?.type === "transactionItem") {
    const savedItem = findItemByName(item);
    const rows = [...elements.featureView.querySelectorAll("#transactionRows tr")];
    const row = rows[Number(returnContext.rowIndex)] || rows[0];
    if (savedItem && row) selectTransactionItem(row, savedItem);
    renderDashboard();
    return;
  }
  if (returnContext?.type === "posParty") {
    const savedParty = findPartyByName(party) || findPartyByPhone(String(form.get("phone") || ""));
    if (savedParty) {
      posSelectedPartyId = savedParty.id;
      posCustomerQuery = savedParty.name || "";
    }
    renderDashboard();
    refreshPosView();
    return;
  }
  if (returnContext?.type === "posItem") {
    const savedItem = findItemByName(item);
    renderDashboard();
    if (savedItem) {
      addItemToPosCart(savedItem.id);
    } else {
      refreshPosView();
    }
    return;
  }
  renderDashboard();
  if (currentView === "parties") {
    elements.featureView.innerHTML = partiesTemplate(editingRecordId || null, "overview", partySearchQuery);
    bindFeatureActions();
  }
  if (currentView === "items") {
    elements.featureView.innerHTML = itemsTemplate(editingRecordId || null, "overview", itemSearchQuery);
    bindFeatureActions();
  }
  renderCurrentList();
  if (currentView === "sales") renderSaleInvoices();
  if (currentView === "purchases") renderPurchaseBills();
  scheduleDashboardChartDraw();
}

function upsertByName(collection, entry) {
  if (!entry.name) return;
  const exists = collection.some((item) => item.name.toLowerCase() === entry.name.toLowerCase());
  if (!exists) collection.unshift(entry);
}

function updateLocalById(collection, id, entry) {
  const index = collection.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return;
  collection[index] = { ...collection[index], ...entry };
}

function addLocalMaster(kind, entry) {
  const name = String(entry?.name || "").trim();
  if (!name) return;
  const key = kind === "unit" ? "units" : "itemCategories";
  state[key] = state[key] || [];
  if (state[key].some((item) => String(item.name || "").toLowerCase() === name.toLowerCase())) return;
  state[key].push({ id: Date.now() + Math.random(), name, createdAt: new Date().toISOString() });
}

function updateLocalMaster(kind, id, name) {
  const key = kind === "unit" ? "units" : "itemCategories";
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  const collection = state[key] || [];
  const duplicate = collection.some((item) => String(item.name || "").toLowerCase() === cleanName.toLowerCase() && Number(item.id) !== Number(id));
  if (duplicate) throw new Error(`${kind === "unit" ? "Unit" : "Category"} already exists.`);
  const existing = collection.find((item) => Number(item.id) === Number(id));
  if (!existing) return;
  const oldName = existing.name;
  existing.name = cleanName;
  if (kind === "unit") {
    (state.items || []).forEach((item) => {
      if (item.unit === oldName) item.unit = cleanName;
    });
  } else {
    (state.items || []).forEach((item) => {
      if (item.category === oldName) item.category = cleanName;
    });
  }
}

function renderDashboard() {
  const sales = activeInvoiceRowsForType("sale");
  const purchases = activeInvoiceRowsForType("purchase");
  const partyReceivable = (state.parties || []).filter((p) => p.type === "customer").reduce((sum, p) => sum + Math.max(0, Number(p.receivable || 0)), 0);
  const partyPayable = (state.parties || []).filter((p) => p.type === "supplier").reduce((sum, p) => sum + Math.max(0, Number(p.payable || 0)), 0);
  const receivable = (state.parties || []).length ? partyReceivable : sales.reduce((total, entry) => total + invoiceBalanceValue(entry), 0);
  const payable = (state.parties || []).length ? partyPayable : purchases.reduce((total, entry) => total + invoiceBalanceValue(entry), 0);
  const saleTotal = sales.reduce((total, entry) => total + invoiceTotalValue(entry), 0);

  elements.receivableTotal.textContent = formatCurrency(receivable);
  elements.payableTotal.textContent = formatCurrency(payable);
  elements.saleTotal.textContent = formatCurrency(saleTotal);
  elements.receivableCaption.textContent = receivable
    ? "Pending sale payments from customers."
    : "You don't have any receivables as of now.";
  elements.payableCaption.textContent = payable
    ? "Pending purchase payments to suppliers."
    : "You don't have any payables as of now.";
}

function renderSaleInvoices() {
  renderInvoiceWorkspace("sale");
}

function invoiceTotalValue(entry) {
  return Number(entry.total ?? entry.amount ?? 0);
}

function invoiceReceivedValue(entry) {
  if (entry.received !== undefined && entry.received !== null) return Number(entry.received || 0);
  return entry.status === "paid" ? invoiceTotalValue(entry) : 0;
}

function invoiceBalanceValue(entry) {
  if (String(entry.status || "").toLowerCase() === "cancelled") return 0;
  if (entry.balance !== undefined && entry.balance !== null) return Number(entry.balance || 0);
  return entry.status === "due" || entry.status === "unpaid" ? invoiceTotalValue(entry) : 0;
}

function invoiceStatusBadge(entry) {
  const normalized = invoiceStatusKey(entry);
  const label = {
    paid: "Paid",
    partial: "Part Paid",
    unpaid: "Unpaid",
    cancelled: "Cancelled",
  }[normalized];
  return `<span class="invoice-status ${normalized}">${label}</span>`;
}

function renderPurchaseBills() {
  renderInvoiceWorkspace("purchase");
}

function renderInvoiceWorkspace(type) {
  elements.saleInvoicesView.classList.add("hidden");
  elements.purchaseBillsView.classList.add("hidden");
  elements.listView.classList.add("hidden");
  elements.featureView.classList.remove("hidden");
  elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
  bindFeatureActions();
}

function invoiceWorkspaceTemplate(type) {
  const isSale = type === "sale";
  const query = isSale ? saleInvoiceSearchQuery : purchaseInvoiceSearchQuery;
  const topFilter = isSale ? saleTopFilter : purchaseTopFilter;
  const colFilters = isSale ? saleColumnFilters : purchaseColumnFilters;
  const allRows = invoiceRowsForType(type);
  const searchedRows = query ? allRows.filter((entry) => entryMatchesSearch(entry, query)) : allRows;
  const topFiltered = applyTopFilter(searchedRows, topFilter);
  const rows = applyColumnFilters(topFiltered, colFilters);
  const activeColFilterCount = Object.keys(colFilters).filter((k) => colFilters[k] && colFilters[k].value).length;

  const total = rows.reduce((sum, e) => sum + invoiceTotalValue(e), 0);
  const paid = rows.reduce((sum, e) => sum + invoiceReceivedValue(e), 0);
  const balance = rows.reduce((sum, e) => sum + invoiceBalanceValue(e), 0);
  const taxTotal = rows.reduce((sum, e) => sum + invoiceTaxValue(e), 0);
  const openCount = rows.filter((e) => invoiceBalanceValue(e) > 0).length;
  const cancelledCount = rows.filter((e) => invoiceStatusKey(e) === "cancelled").length;

  const title = isSale ? "Sale Invoices" : "Purchase Bills";
  const eyebrow = isSale ? "Sales" : "Purchases";
  const partyLabel = isSale ? "Customer" : "Supplier";
  const numberLabel = isSale ? "Invoice" : "Bill";
  const action = isSale ? "sale" : "purchase";
  const actionLabel = isSale ? "+ Add Sale" : "+ Add Purchase";
  const paidLabel = isSale ? "Received" : "Paid";
  const balanceLabel = isSale ? "Receivable" : "Payable";
  const hasFilters = query || topFilter.preset !== "all" || activeColFilterCount > 0;
  const emptyTitle = hasFilters ? `No matching ${isSale ? "sale invoices" : "purchase bills"}` : `No ${isSale ? "sale invoices" : "purchase bills"} yet`;
  const emptyCopy = hasFilters
    ? "Try adjusting the date range, party, or column filters."
    : `Create your first ${isSale ? "sale invoice" : "purchase bill"} to start tracking totals, balances, and ledger impact.`;

  return `
    <section class="invoice-workspace ${isSale ? "sale-workspace" : "purchase-workspace"}">
      <header class="app-page-header invoice-page-header">
        <div>
          <p class="muted-label">${eyebrow}</p>
          <h1>${title}</h1>
          <small>${rows.length} of ${allRows.length} records shown</small>
        </div>
        <div class="invoice-header-actions">
          <button class="${isSale ? "sale-button" : "purchase-button"}" data-action="${action}" type="button">${actionLabel}</button>
        </div>
      </header>

      ${topFilterBarHTML(type, topFilter)}

      <section class="kpi-grid invoice-kpis">
        ${kpiCard(`Total ${isSale ? "Sales" : "Purchases"}`, formatCurrency(total), "Invoice value for selected view", "neutral")}
        ${kpiCard(paidLabel, formatCurrency(paid), isSale ? "Cash collected from customers" : "Cash paid to suppliers", "success")}
        ${kpiCard(balanceLabel, formatCurrency(balance), isSale ? "Customer balances due" : "Supplier balances due", balance > 0 ? "danger" : "success")}
        ${kpiCard("GST / Tax", formatCurrency(taxTotal), `${openCount} open, ${cancelledCount} cancelled`, "info")}
      </section>

      <section class="data-table-card invoice-data-card">
        ${rows.length ? invoiceRowsTable(rows, { isSale, partyLabel, numberLabel, paidLabel, colFilters, type }) : emptyWorkspace(emptyTitle, emptyCopy)}
      </section>
    </section>
  `;
}

// ── Date preset helpers ───────────────────────────────────────────────────────

function datePresetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = formatLocalIsoDate;

  if (preset === "thisMonth") {
    return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
  }
  if (preset === "lastMonth") {
    return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  }
  if (preset === "thisQuarter") {
    const qStart = Math.floor(m / 3) * 3;
    return { from: fmt(new Date(y, qStart, 1)), to: fmt(new Date(y, qStart + 3, 0)) };
  }
  if (preset === "thisYear") {
    // Indian financial year: Apr–Mar
    const fyStart = m >= 3 ? y : y - 1;
    return { from: fmt(new Date(fyStart, 3, 1)), to: fmt(new Date(fyStart + 1, 2, 31)) };
  }
  if (preset === "custom") {
    return { from: "", to: "" };
  }
  return { from: "", to: "" };
}

function formatLocalIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalIsoDate(value, endOfDay = false) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function topFilterBarHTML(type, topFilter) {
  const { preset, dateFrom, dateTo, party } = topFilter;
  const range = preset === "custom" ? { from: dateFrom, to: dateTo } : (preset !== "all" ? datePresetRange(preset) : { from: "", to: "" });
  const fmtDisplay = (iso) => {
    if (!iso) return "";
    const [y, mo, d] = iso.split("-");
    return `${d}/${mo}/${y}`;
  };

  const parties = [...new Set((state.parties || []).map((p) => p.name).filter(Boolean))].sort();

  const presetLabels = {
    all: type === "purchase" ? "All Purchase Bills" : "All Sale Invoices",
    thisMonth: "This Month",
    lastMonth: "Last Month",
    thisQuarter: "This Quarter",
    thisYear: "This Year",
    custom: "Custom",
  };
  const presetLabel = presetLabels[preset] || "This Month";
  const showRange = preset === "custom" || Boolean(range.from || range.to);

  return `
    <div class="top-filter-bar" data-top-filter-type="${type}">
      <span class="top-filter-label">Filter by :</span>

      <div class="top-filter-preset-wrap">
        <button class="top-filter-pill" data-top-filter-preset-btn="${type}" type="button">
          ${escapeHtml(presetLabel)} <span class="pill-caret">▾</span>
        </button>
        <div class="top-filter-preset-dropdown" id="presetDropdown_${type}" style="display:none">
          ${Object.entries(presetLabels).map(([val, lbl]) => `
            <button class="preset-option ${preset === val ? "active" : ""}" data-top-filter-preset="${type}" data-preset-value="${val}" type="button">${lbl}</button>
          `).join("")}
        </div>
      </div>

      ${showRange ? `
        <div class="top-filter-daterange">
          <svg class="gi-icon" style="width:14px;height:14px;"><use href="#gi-calendar"></use></svg>
          ${preset === "custom" ? `
            <input type="date" class="top-filter-date-input" data-top-filter-date="${type}" data-date-key="dateFrom" value="${escapeHtml(dateFrom)}">
            <span>To</span>
            <input type="date" class="top-filter-date-input" data-top-filter-date="${type}" data-date-key="dateTo" value="${escapeHtml(dateTo)}">
          ` : `
            <span>${fmtDisplay(range.from)}</span>
            <span>To</span>
            <span>${fmtDisplay(range.to)}</span>
          `}
        </div>
      ` : ""}

      <div class="top-filter-preset-wrap">
        <select class="top-filter-pill top-filter-party-select" data-top-filter-party="${type}">
          <option value="">All Parties</option>
          ${parties.map((p) => `<option value="${escapeHtml(p)}" ${party === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
      </div>

      ${(preset !== "all" && preset !== "thisMonth") || party ? `
        <button class="top-filter-clear-btn" data-top-filter-clear="${type}" type="button">Clear</button>
      ` : ""}
    </div>
  `;
}

// ── Top filter application ────────────────────────────────────────────────────

function applyTopFilter(rows, topFilter) {
  const { preset, dateFrom, dateTo, party } = topFilter;
  let from = "", to = "";
  if (preset === "custom") { from = dateFrom; to = dateTo; }
  else if (preset !== "all") { const r = datePresetRange(preset); from = r.from; to = r.to; }

  const fromDate = parseLocalIsoDate(from);
  const toDate = parseLocalIsoDate(to, true);

  return rows.filter((entry) => {
    if (fromDate || toDate) {
      const entryDate = parseLocalIsoDate(
        entry.date || entry.invoiceDate || entry.transactionDate || entry.createdAt || ""
      );
      if (!entryDate) return false;
      if (fromDate && entryDate < fromDate) return false;
      if (toDate && entryDate > toDate) return false;
    }
    if (party) {
      if (String(entry.party || "").trim().toLowerCase() !== party.trim().toLowerCase()) return false;
    }
    return true;
  });
}

// ── Per-column filter application ─────────────────────────────────────────────

function applyColumnFilters(rows, colFilters) {
  return rows.filter((entry) => {
    for (const [col, f] of Object.entries(colFilters)) {
      if (!f || !f.value) continue;
      const { category, value } = f;
      let fieldVal = "";
      if (col === "date") fieldVal = String(entry.date || "");
      else if (col === "invoiceNo") fieldVal = String(entry.invoiceNo || "");
      else if (col === "party") fieldVal = String(entry.party || "");
      else if (col === "paymentType") fieldVal = String(entry.paymentType || entry.paymentMethod || entry.method || "");
      else if (col === "total") fieldVal = invoiceTotalValue(entry);
      else if (col === "received") fieldVal = invoiceReceivedValue(entry);
      else if (col === "balance") fieldVal = invoiceBalanceValue(entry);

      const isNumeric = ["total", "received", "balance"].includes(col);
      const isDate = col === "date";

      if (isNumeric) {
        const num = Number(fieldVal);
        const val = Number(value);
        if (category === "eq" && num !== val) return false;
        if (category === "lt" && num >= val) return false;
        if (category === "gt" && num <= val) return false;
        if (category === "range") {
          const val2 = Number(f.value2 || 0);
          if (num < val || num > val2) return false;
        }
      } else if (isDate) {
        const entryDate = new Date(fieldVal || 0);
        const filterDate = new Date(value);
        if (category === "eq" && entryDate.toDateString() !== filterDate.toDateString()) return false;
        if (category === "lt" && entryDate >= filterDate) return false;
        if (category === "gt" && entryDate <= filterDate) return false;
        if (category === "range") {
          const toDate = new Date(f.value2 || value);
          toDate.setHours(23, 59, 59, 999);
          if (entryDate < filterDate || entryDate > toDate) return false;
        }
      } else {
        const haystack = String(fieldVal).toLowerCase();
        const needle = String(value).toLowerCase();
        if (category === "contains" && !haystack.includes(needle)) return false;
        if (category === "exact" && haystack !== needle) return false;
      }
    }
    return true;
  });
}

function countActiveFilters(f) {
  return Object.entries(f).filter(([, v]) => v !== "" && v !== "all" && v !== null).length;
}



function invoiceRowsForType(type) {
  const invoices = state.invoices || [];
  const invoiceTransactionIds = new Set(invoices.map((invoice) => String(invoice.transactionId || "")).filter(Boolean));
  const invoiceKeys = new Set(invoices.map((invoice) => `${invoice.type || ""}:${invoice.invoiceNo || ""}`.toLowerCase()));
  const legacyTransactions = (state.transactions || []).filter((transaction) => {
    const transactionId = String(transaction.id || "");
    const transactionKey = `${transaction.type || ""}:${transaction.invoiceNo || ""}`.toLowerCase();
    return !invoiceTransactionIds.has(transactionId) && !invoiceKeys.has(transactionKey);
  });
  const source = [...invoices, ...legacyTransactions];
  return source
    .filter((entry) => entry.type === type)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function activeInvoiceRowsForType(type) {
  return invoiceRowsForType(type).filter((entry) => String(entry.status || "").toLowerCase() !== "cancelled");
}

function invoiceQuickFilterButtons(type, activeFilter) {
  const filters = [
    ["all", "All"],
    ["unpaid", "Unpaid"],
    ["partial", "Part Paid"],
    ["paid", "Paid"],
    ["cancelled", "Cancelled"],
    ["b2b", "B2B"],
    ["b2c", "B2C"],
  ];
  return filters.map(([value, label]) => `
    <button class="${activeFilter === value ? "active" : ""}" data-invoice-filter="${type}" data-invoice-filter-value="${value}" type="button">${label}</button>
  `).join("");
}

function invoiceQuickFilterMatches(entry, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "b2b" || filter === "b2c") return invoiceSupplyType(entry) === filter;
  return invoiceStatusKey(entry) === filter;
}

function invoiceStatusKey(entry) {
  const balance = invoiceBalanceValue(entry);
  const rawStatus = String(entry.status || "").toLowerCase();
  if (rawStatus === "cancelled") return "cancelled";
  if (balance <= 0 || rawStatus === "paid") return "paid";
  if (rawStatus === "partially_paid") return "partial";
  return "unpaid";
}

function invoiceSupplyType(entry) {
  const supply = String(entry.supplyType || "").toLowerCase();
  if (supply === "b2b" || supply === "b2c") return supply;
  return entry.partyGstin ? "b2b" : "b2c";
}

function invoiceTaxTypeLabel(entry) {
  return invoiceSupplyType(entry).toUpperCase();
}

function invoiceTaxableValue(entry) {
  if (entry.subtotal !== undefined && entry.subtotal !== null) return Number(entry.subtotal || 0);
  const tax = invoiceTaxValue(entry);
  return Math.max(0, invoiceTotalValue(entry) - tax);
}

function invoiceTaxValue(entry) {
  if (entry.taxTotal !== undefined && entry.taxTotal !== null) return Number(entry.taxTotal || 0);
  return Number(entry.cgstTotal || 0) + Number(entry.sgstTotal || 0) + Number(entry.igstTotal || 0);
}

function kpiCard(label, value, note, tone = "") {
  return `<article class="kpi-card ${escapeHtml(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function emptyWorkspace(title, copy) {
  return `
    <div class="empty-workspace">
      <div class="invoice-empty-art"><span></span><span></span><span></span></div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(copy)}</p>
    </div>
  `;
}

function saleReturnTemplate() {
  const allRows = (state.creditNotes || []).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  const searchedRows = creditNoteSearchQuery ? allRows.filter((note) => creditNoteMatchesSearch(note, creditNoteSearchQuery)) : allRows;
  const rows = searchedRows.filter((note) => creditNoteQuickFilterMatches(note, creditNoteQuickFilter));
  const total = rows.reduce((sum, note) => sum + creditNoteTotalValue(note), 0);
  const adjusted = rows.reduce((sum, note) => sum + Number(note.adjusted || 0), 0);
  const openBalance = rows.reduce((sum, note) => sum + Number(note.balance || 0), 0);
  const taxTotal = rows.reduce((sum, note) => sum + creditNoteTaxValue(note), 0);
  const emptyTitle = creditNoteSearchQuery || creditNoteQuickFilter !== "all" ? "No matching credit notes" : "No sales returns yet";
  const emptyCopy = creditNoteSearchQuery || creditNoteQuickFilter !== "all"
    ? "Try a different credit note number, customer, original invoice, GST type, or status."
    : "Create a credit note when goods come back, invoice value is reduced, or a customer refund must be recorded.";

  return `
    <section class="credit-note-workspace">
      <header class="app-page-header invoice-page-header credit-note-header">
        <div>
          <p class="muted-label">Sales</p>
          <h1>Sales Return / Credit Note</h1>
          <small>${rows.length} of ${allRows.length} records shown</small>
        </div>
        <div class="invoice-header-actions">
          <button class="secondary-button compact-button" data-view="sales" type="button">Sale Invoices</button>
          <button class="sale-button" data-action="create-credit-note" type="button">+ Add Credit Note</button>
        </div>
      </header>

      <section class="app-toolbar">
        <label class="toolbar-search">
          <span>Search</span>
          <input data-credit-note-search type="search" value="${escapeHtml(creditNoteSearchQuery)}" placeholder="Credit note, customer, invoice, item, status">
        </label>
        <div class="invoice-quick-filters" role="group" aria-label="Credit note filters">
          ${creditNoteQuickFilterButtons()}
        </div>
      </section>

      <section class="kpi-grid invoice-kpis">
        ${kpiCard("Return Value", formatCurrency(total), "Credit note total for selected view", "neutral")}
        ${kpiCard("Adjusted / Refunded", formatCurrency(adjusted), "Value already adjusted or refunded", "success")}
        ${kpiCard("Open Credit", formatCurrency(openBalance), "Still available to adjust", openBalance > 0 ? "danger" : "success")}
        ${kpiCard("GST Reversal", formatCurrency(taxTotal), "Output tax reduction", "info")}
      </section>

      <section class="data-table-card invoice-data-card credit-note-data-card">
        ${rows.length ? creditNoteRowsTable(rows) : emptyWorkspace(emptyTitle, emptyCopy)}
      </section>
    </section>
  `;
}

function creditNoteQuickFilterButtons() {
  const filters = [
    ["all", "All"],
    ["open", "Open"],
    ["partial", "Part Adjusted"],
    ["adjusted", "Adjusted"],
    ["cancelled", "Cancelled"],
    ["b2b", "B2B"],
    ["b2c", "B2C"],
  ];
  return filters.map(([value, label]) => `
    <button class="${creditNoteQuickFilter === value ? "active" : ""}" data-credit-note-filter="${value}" type="button">${label}</button>
  `).join("");
}

function creditNoteRowsTable(rows) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Credit Note</th>
          <th>Original Invoice</th>
          <th>Customer</th>
          <th>GST Type</th>
          <th>Taxable</th>
          <th>Tax</th>
          <th>Total</th>
          <th>Open Credit</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((note) => `
          <tr>
            <td>${formatDate(note.date)}</td>
            <td><strong class="invoice-no-cell">${escapeHtml(note.creditNo || "-")}</strong><small>${escapeHtml(creditNoteItemSummary(note.id))}</small></td>
            <td><strong>${escapeHtml(note.originalInvoiceNo || "-")}</strong><small>${escapeHtml(note.reason || "Sales return")}</small></td>
            <td><strong>${escapeHtml(note.party || "-")}</strong><small>${escapeHtml(note.phone || "")}</small></td>
            <td><span class="gst-type-badge ${creditNoteSupplyType(note)}">${creditNoteTaxTypeLabel(note)}</span></td>
            <td class="amount-cell">${formatCurrency(creditNoteTaxableValue(note))}</td>
            <td class="amount-cell">${formatCurrency(creditNoteTaxValue(note))}</td>
            <td class="amount-cell strong">${formatCurrency(creditNoteTotalValue(note))}</td>
            <td class="amount-cell ${Number(note.balance || 0) > 0 ? "danger" : ""}">${formatCurrency(note.balance || 0)}</td>
            <td>${creditNoteStatusBadge(note)}</td>
            <td>${creditNoteRowActions(note)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function creditNoteRowActions(note) {
  const id = escapeHtml(note.id || "");
  const actions = [
    ["viewEdit", "View/Edit"],
    ["preview", "Preview"],
    ["print", "Print"],
    ["duplicate", "Duplicate"],
    ["openInvoice", "Open Original Invoice"],
    ["cancel", "Cancel Credit Note"],
    ["delete", "Delete"],
  ];
  return `
    <div class="invoice-row-actions credit-note-row-actions">
      <details>
        <summary aria-label="Credit note actions">More</summary>
        <div>
          ${actions.map(([action, label]) => `<button data-credit-note-action="${action}" data-credit-note-id="${id}" type="button">${label}</button>`).join("")}
        </div>
      </details>
    </div>
  `;
}

function creditNoteItemsFor(note) {
  const noteId = note?.id || note?.creditNoteId;
  if (!noteId) return [];
  return (state.creditNoteItems || [])
    .filter((line) => String(line.creditNoteId) === String(noteId))
    .sort((a, b) => Number(a.lineNo || 0) - Number(b.lineNo || 0));
}

function creditNoteItemSummary(noteId) {
  const items = creditNoteItemsFor({ id: noteId });
  if (!items.length) return "";
  return items.length === 1 ? items[0].item || "" : `${items.length} returned items`;
}

function creditNoteMatchesSearch(note, query) {
  const text = [
    note.creditNo,
    note.originalInvoiceNo,
    note.party,
    note.phone,
    note.status,
    creditNoteTaxTypeLabel(note),
    creditNoteTotalValue(note),
    creditNoteTaxValue(note),
    ...creditNoteItemsFor(note).map((item) => [item.item, item.description, item.hsnSac].join(" ")),
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes(String(query || "").toLowerCase());
}

function creditNoteQuickFilterMatches(note, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "b2b" || filter === "b2c") return creditNoteSupplyType(note) === filter;
  return creditNoteStatus(note) === filter;
}

function creditNoteStatus(note) {
  const raw = String(note.status || "").toLowerCase();
  if (["open", "partial", "adjusted", "cancelled"].includes(raw)) return raw;
  if (String(raw) === "paid") return "adjusted";
  if (Number(note.balance || 0) <= 0) return "adjusted";
  if (Number(note.adjusted || 0) > 0) return "partial";
  return "open";
}

function creditNoteStatusBadge(note) {
  const status = creditNoteStatus(note);
  const label = {
    open: "Open",
    partial: "Part Adjusted",
    adjusted: "Adjusted",
    cancelled: "Cancelled",
  }[status] || "Open";
  return `<span class="invoice-status credit-note-status ${status}">${label}</span>`;
}

function creditNoteSupplyType(note) {
  const supply = String(note.supplyType || "").toLowerCase();
  if (supply === "b2b" || supply === "b2c") return supply;
  return note.partyGstin ? "b2b" : "b2c";
}

function creditNoteTaxTypeLabel(note) {
  return creditNoteSupplyType(note).toUpperCase();
}

function creditNoteTotalValue(note) {
  return Number(note.total || note.amount || 0);
}

function creditNoteTaxableValue(note) {
  if (note.subtotal !== undefined && note.subtotal !== null) return Number(note.subtotal || 0);
  return Math.max(0, creditNoteTotalValue(note) - creditNoteTaxValue(note));
}

function creditNoteTaxValue(note) {
  if (note.taxTotal !== undefined && note.taxTotal !== null) return Number(note.taxTotal || 0);
  return Number(note.cgstTotal || 0) + Number(note.sgstTotal || 0) + Number(note.igstTotal || 0);
}

function findCreditNoteRecord(id) {
  const cleanId = String(id || "");
  return (state.creditNotes || []).find((note) => String(note.id) === cleanId) || null;
}

function creditNoteDraftFromRecord(note, options = {}) {
  const lines = creditNoteItemsFor(note);
  return {
    party: note.party || "",
    phone: note.phone || "",
    billingAddress: note.billingAddress || "",
    invoiceNo: options.clearNumber ? "" : (note.creditNo || ""),
    originalInvoiceId: options.clearOriginal ? "" : (note.originalInvoiceId || ""),
    originalInvoiceNo: options.clearOriginal ? "" : (note.originalInvoiceNo || ""),
    invoiceDate: note.date || new Date().toISOString(),
    dueDate: note.refundDate || note.date || new Date().toISOString(),
    paymentTerms: note.paymentTerms || "Due on receipt",
    paymentType: "return",
    paymentMethod: note.paymentMethod || "Adjustment",
    received: Number(note.adjusted || 0),
    state: note.placeOfSupply || "",
    supplyType: note.supplyType || (note.partyGstin ? "b2b" : "b2c"),
    partyGstin: note.partyGstin || "",
    invoiceDescription: note.notes || "",
    customFields: note.meta?.customFields || {},
    items: lines.map((line) => ({
      item: line.item || "",
      itemId: line.itemId || "",
      description: line.description || "",
      qty: line.qty || "",
      unit: line.unit || "",
      price: line.price || "",
      discount: line.discount || 0,
      taxRate: line.taxRate || 0,
      hsnSac: line.hsnSac || "",
    })),
  };
}

function creditNotePreviewDataFromRecord(note, overrides = {}) {
  const business = state.businessSettings || defaultBusinessSettings();
  const party = findPartyByName(note.party) || {
    name: note.party,
    phone: note.phone,
    gstin: note.partyGstin,
    billingAddress: note.billingAddress,
  };
  const rows = creditNoteItemsFor(note).map((line, index) => ({
    index: index + 1,
    item: line.item || "",
    description: line.description || "",
    hsnSac: line.hsnSac || "",
    qty: Number(line.qty || 0),
    unit: line.unit || "",
    price: Number(line.price || 0),
    discount: Number(line.discount || 0),
    taxRate: Number(line.taxRate || 0),
    tax: Number(line.taxAmount || 0),
    total: Number(line.lineTotal || 0),
  }));
  return {
    editorType: "saleReturn",
    previewTitle: "Credit Note Preview",
    documentTitle: "Credit Note",
    business,
    party,
    rows,
    invoiceNo: note.creditNo || "-",
    date: note.date || "",
    address: note.billingAddress || party?.billingAddress || "",
    placeOfSupply: note.placeOfSupply || "",
    customFields: customFieldsForModule("saleReturn").map((field) => ({
      ...field,
      value: customFieldValue(field, note.meta?.customFields || {}),
    })).filter((field) => field.showOnPrint && (field.fieldType === "checkbox" ? field.value : String(field.value || "").trim())),
    description: [note.originalInvoiceNo ? `Against invoice ${note.originalInvoiceNo}` : "", note.notes || ""].filter(Boolean).join("\n"),
    attachments: [],
    subtotal: Number(note.subtotal ?? creditNoteTaxableValue(note)),
    discount: Number(note.discountTotal || 0),
    cgst: Number(note.cgstTotal || 0),
    sgst: Number(note.sgstTotal || 0),
    igst: Number(note.igstTotal || 0),
    total: creditNoteTotalValue(note),
    ...overrides,
  };
}

function openCreditNoteEditorFromInvoice(invoice) {
  if (!invoice || invoice.type !== "sale") {
    showToast("Credit notes can be created only from sale invoices.");
    return;
  }
  openTransactionEditor("saleReturn", {
    draft: {
      ...invoiceDraftFromRecord(invoice, { clearNumber: true }),
      originalInvoiceId: invoice.id || invoice.invoiceId || "",
      originalInvoiceNo: invoice.invoiceNo || "",
      invoiceDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      paymentType: "return",
      paymentMethod: "Adjustment",
      received: invoiceBalanceValue(invoice) > 0 ? Math.min(invoiceBalanceValue(invoice), invoiceTotalValue(invoice)) : invoiceTotalValue(invoice),
      invoiceDescription: `Sales return against invoice ${invoice.invoiceNo || ""}`,
    },
  });
}

async function handleCreditNoteAction(action, creditNoteId) {
  const note = findCreditNoteRecord(creditNoteId);
  if (!note) {
    showToast("Credit note not found.");
    return;
  }

  if (action === "viewEdit" || action === "edit") {
    openTransactionEditor("saleReturn", {
      editInvoiceId: note.id,
      draft: creditNoteDraftFromRecord(note),
    });
    return;
  }
  if (action === "preview" || action === "view") {
    openInvoicePreviewModal(creditNotePreviewDataFromRecord(note));
    return;
  }
  if (action === "print") {
    openInvoicePreviewModal(creditNotePreviewDataFromRecord(note));
    setTimeout(() => window.print(), 120);
    return;
  }
  if (action === "duplicate") {
    openTransactionEditor("saleReturn", {
      draft: creditNoteDraftFromRecord(note, { clearNumber: true }),
    });
    return;
  }
  if (action === "openInvoice") {
    const invoice = findInvoiceRecord(note.originalInvoiceId) || findInvoiceByNumber(note.originalInvoiceNo);
    if (invoice) {
      openTransactionEditor("sale", {
        editInvoiceId: invoice.id || invoice.invoiceId,
        draft: invoiceDraftFromRecord(invoice),
      });
    } else {
      showToast("Original invoice not found.");
    }
    return;
  }
  if (action === "cancel") {
    await cancelCreditNoteRecord(note);
    return;
  }
  if (action === "delete") {
    await deleteCreditNoteRecord(note);
  }
}

function findInvoiceByNumber(invoiceNo) {
  const cleanNo = String(invoiceNo || "").trim().toLowerCase();
  if (!cleanNo) return null;
  return (state.invoices || []).find((invoice) => String(invoice.invoiceNo || "").trim().toLowerCase() === cleanNo) || null;
}

async function cancelCreditNoteRecord(note) {
  if (creditNoteStatus(note) === "cancelled") {
    showToast("Credit note is already cancelled.");
    return;
  }
  if (!confirm(`Cancel ${note.creditNo || "this credit note"}? Returned stock movement will be removed.`)) return;
  try {
    const notes = `Cancelled on ${new Date().toLocaleString()}`;
    if (window.giDB?.setCreditNoteStatus) {
      state = normalizeState(await window.giDB.setCreditNoteStatus({ creditNoteId: note.id, status: "cancelled", notes }));
    } else {
      const target = findCreditNoteRecord(note.id);
      if (target) {
        target.status = "cancelled";
        target.notes = [target.notes, notes].filter(Boolean).join("\n");
      }
      state.stockMovements = (state.stockMovements || []).filter((movement) => String(movement.creditNoteId) !== String(note.id));
      saveState();
    }
    renderDashboard();
    renderFeatureView("saleReturn");
    showToast("Credit Note Cancelled");
  } catch (error) {
    showToast(error.message || "Unable to cancel credit note.");
  }
}

async function deleteCreditNoteRecord(note) {
  if (!confirm(`Delete ${note.creditNo || "this credit note"} permanently? This removes returned stock movement.`)) return;
  try {
    if (window.giDB?.deleteCreditNote) {
      state = normalizeState(await window.giDB.deleteCreditNote({ creditNoteId: note.id }));
    } else {
      state.creditNotes = (state.creditNotes || []).filter((row) => String(row.id) !== String(note.id));
      state.creditNoteItems = (state.creditNoteItems || []).filter((row) => String(row.creditNoteId) !== String(note.id));
      state.stockMovements = (state.stockMovements || []).filter((movement) => String(movement.creditNoteId) !== String(note.id));
      saveState();
    }
    renderDashboard();
    renderFeatureView("saleReturn");
    showToast("Credit Note Deleted");
  } catch (error) {
    showToast(error.message || "Unable to delete credit note.");
  }
}

function estimateTemplate() {
  const view = ['proforma', 'saleOrder', 'deliveryChallan', 'purchaseOrder'].includes(currentView) ? currentView : 'estimate';
  const documentType = { saleOrder: 'sale_order', deliveryChallan: 'delivery_challan', purchaseOrder: 'purchase_order' }[view] || view;
  const meta = transactionEditorMeta(view);
  const allRows = (state.estimates || []).filter((row) => (row.documentType || 'estimate') === documentType).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  const searchedRows = estimateSearchQuery ? allRows.filter((quote) => estimateMatchesSearch(quote, estimateSearchQuery)) : allRows;
  const rows = searchedRows.filter((quote) => estimateQuickFilterMatches(quote, estimateQuickFilter));
  const totalValue = rows.reduce((sum, quote) => sum + estimateTotalValue(quote), 0);
  const acceptedValue = rows.filter((quote) => estimateStatus(quote) === "accepted").reduce((sum, quote) => sum + estimateTotalValue(quote), 0);
  const pendingCount = rows.filter((quote) => ["draft", "sent"].includes(estimateStatus(quote))).length;
  const convertedCount = rows.filter((quote) => estimateStatus(quote) === "converted").length;
  const taxValue = rows.reduce((sum, quote) => sum + estimateTaxValue(quote), 0);
  const emptyTitle = estimateSearchQuery || estimateQuickFilter !== "all" ? "No matching quotations" : "No quotations yet";
  const emptyCopy = estimateSearchQuery || estimateQuickFilter !== "all"
    ? "Try a different quote number, customer, item, status, GST type, or amount."
    : "Create a quotation when the customer needs price approval before you raise a tax invoice.";

  return `
    <section class="estimate-workspace invoice-workspace">
      <header class="app-page-header estimate-page-header">
        <div>
          <p class="muted-label">Sales proposal</p>
          <h1>${escapeHtml(meta.noun)}</h1>
          <small>${rows.length} of ${allRows.length} quotes shown</small>
        </div>
        <div class="invoice-header-actions">
          <button class="sale-button" data-action="create-estimate" data-document-type="${view}" type="button">+ New ${escapeHtml(meta.noun)}</button>
        </div>
      </header>

      <section class="app-toolbar">
        <label class="toolbar-search">
          <span>Search</span>
          <input data-estimate-search type="search" value="${escapeHtml(estimateSearchQuery)}" placeholder="Quote no, customer, item, status, amount">
        </label>
        <div class="invoice-quick-filters" role="group" aria-label="Quotation filters">
          ${estimateQuickFilterButtons()}
        </div>
      </section>

      <section class="kpi-grid estimate-kpis">
        ${kpiCard("Quote Value", formatCurrency(totalValue), "Selected quotation value", "neutral")}
        ${kpiCard("Accepted Value", formatCurrency(acceptedValue), "Ready to convert into sale", "success")}
        ${kpiCard("Pending Quotes", String(pendingCount), "Draft or sent", pendingCount ? "info" : "success")}
        ${kpiCard("GST / Tax", formatCurrency(taxValue), `${convertedCount} converted`, "info")}
      </section>

      <section class="data-table-card estimate-data-card">
        ${rows.length ? estimateRowsTable(rows) : emptyWorkspace(emptyTitle, emptyCopy)}
      </section>
    </section>
  `;
}

function estimateRowsTable(rows) {
  return `
    <table class="data-table estimate-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Quote No</th>
          <th>Customer</th>
          <th>Valid Until</th>
          <th>GST Type</th>
          <th>Taxable</th>
          <th>Tax</th>
          <th>Total</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((quote, index) => `
          <tr data-estimate-row="${escapeHtml(quote.id || quote.quoteId || "")}">
            <td>${formatDate(quote.date || quote.createdAt)}</td>
            <td><strong class="invoice-no-cell">${escapeHtml(quote.quoteNo || `QT-${String(index + 1).padStart(4, "0")}`)}</strong><small>${escapeHtml(estimateItemSummary(quote.id))}</small></td>
            <td><strong>${escapeHtml(quote.party || quote.customer || "-")}</strong><small>${escapeHtml(quote.phone || "")}</small></td>
            <td>${formatDate(quote.validUntil)}</td>
            <td><span class="gst-type-badge ${estimateSupplyType(quote)}">${estimateTaxTypeLabel(quote)}</span></td>
            <td class="amount-cell">${formatCurrency(estimateTaxableValue(quote))}</td>
            <td class="amount-cell">${formatCurrency(estimateTaxValue(quote))}</td>
            <td class="amount-cell strong">${formatCurrency(estimateTotalValue(quote))}</td>
            <td>${estimateStatusBadge(quote)}</td>
            <td>${estimateActionMenu(quote)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function estimateActionMenu(quote) {
  const id = escapeHtml(quote.id || quote.quoteId || "");
  const status = estimateStatus(quote);
  const groups = [
    ["Primary", [["viewEdit", "View/Edit"], ["preview", "Preview"], ["print", "Print"]]],
    ["Status", [["markSent", "Mark Sent"], ["markAccepted", "Mark Accepted"], ["convert", "Convert to Sale"]]],
    ["More", [["duplicate", "Duplicate"], ["cancel", "Cancel Quote"], ["delete", "Delete"]]],
  ];
  return `
    <div class="invoice-row-actions" style="display:inline-flex;align-items:center;gap:6px;">
      ${status !== "converted" && status !== "cancelled" ? `<button type="button" class="action-btn-convert" data-estimate-action="convert" data-estimate-id="${id}" title="Convert to Tax Invoice">Convert</button>` : ""}
      <details>
        <summary aria-label="Quotation actions">⋮</summary>
        <div class="invoice-action-menu">
          ${groups.map(([group, actions]) => `
            <section>
              <span>${escapeHtml(group)}</span>
              ${actions.map(([action, label]) => `<button type="button" data-estimate-action="${action}" data-estimate-id="${id}">${label}</button>`).join("")}
            </section>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

function estimateStatus(quote) {
  const status = String(quote.status || "draft").toLowerCase().replace(/\s+/g, "_");
  if (["sent", "accepted", "converted", "expired", "cancelled"].includes(status)) return status;
  return "draft";
}

function estimateStatusBadge(quote) {
  const status = estimateStatus(quote);
  const label = {
    draft: "Draft",
    sent: "Sent",
    accepted: "Accepted",
    converted: "Converted",
    expired: "Expired",
    cancelled: "Cancelled",
  }[status];
  return `<span class="estimate-status ${status}">${label}</span>`;
}

function estimateTotalValue(quote) {
  return Number(quote.total || quote.amount || quote.grandTotal || 0);
}

function estimateTaxableValue(quote) {
  if (quote.subtotal !== undefined && quote.subtotal !== null) return Number(quote.subtotal || 0);
  return Math.max(0, estimateTotalValue(quote) - estimateTaxValue(quote));
}

function estimateTaxValue(quote) {
  if (quote.taxTotal !== undefined && quote.taxTotal !== null) return Number(quote.taxTotal || 0);
  return Number(quote.cgstTotal || 0) + Number(quote.sgstTotal || 0) + Number(quote.igstTotal || 0);
}

function estimateSupplyType(quote) {
  const supply = String(quote.supplyType || "").toLowerCase();
  if (supply === "b2b" || supply === "b2c") return supply;
  return quote.partyGstin ? "b2b" : "b2c";
}

function estimateTaxTypeLabel(quote) {
  return estimateSupplyType(quote).toUpperCase();
}

function estimateItemsFor(quote) {
  const estimateId = quote?.id || quote?.estimateId || quote?.quoteId;
  if (!estimateId) return [];
  return (state.estimateItems || [])
    .filter((line) => String(line.estimateId) === String(estimateId))
    .sort((a, b) => Number(a.lineNo || 0) - Number(b.lineNo || 0));
}

function estimateItemSummary(estimateId) {
  const items = (state.estimateItems || []).filter((line) => String(line.estimateId) === String(estimateId));
  if (!items.length) return "";
  return items.length === 1 ? items[0].item || "" : `${items.length} items`;
}

function estimateQuickFilterButtons() {
  const filters = [
    ["all", "All"],
    ["draft", "Draft"],
    ["sent", "Sent"],
    ["accepted", "Accepted"],
    ["converted", "Converted"],
    ["cancelled", "Cancelled"],
    ["b2b", "B2B"],
    ["b2c", "B2C"],
  ];
  return filters.map(([value, label]) => `
    <button class="${estimateQuickFilter === value ? "active" : ""}" data-estimate-filter="${value}" type="button">${label}</button>
  `).join("");
}

function estimateQuickFilterMatches(quote, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "b2b" || filter === "b2c") return estimateSupplyType(quote) === filter;
  return estimateStatus(quote) === filter;
}

function estimateMatchesSearch(quote, query) {
  const text = [
    quote.quoteNo,
    quote.party,
    quote.phone,
    quote.status,
    estimateTaxTypeLabel(quote),
    estimateTotalValue(quote),
    estimateTaxValue(quote),
    ...estimateItemsFor(quote).map((item) => [item.item, item.description, item.hsnSac].join(" ")),
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes(String(query || "").toLowerCase());
}

function posTemplate() {
  const filteredItems = posFilteredItems();
  const categories = posCategoryOptions();
  const totals = posCartTotals();
  const selectedParty = posSelectedParty();
  const heldSale = loadHeldPosSale();
  const receivedValue = posReceivedAmount === null ? totals.total : Number(posReceivedAmount || 0);
  const balanceValue = Math.max(0, totals.total - receivedValue);
  const changeValue = Math.max(0, receivedValue - totals.total);
  const exactParty = findPartyByName(posCustomerQuery) || findPartyByPhone(posCustomerQuery);
  const partyMatches = posPartyMatches();
  return `
    <section class="pos-workspace">
      <header class="app-page-header pos-page-header">
        <div>
          <p class="muted-label">Counter billing</p>
          <h1>GI POS</h1>
          <small>${posCart.length} cart lines - ${formatQuantity(totals.qty)} qty - ${filteredItems.length} products shown</small>
        </div>
        <div class="pos-header-actions">
          <button class="secondary-button compact-button" data-pos-action="hold" type="button" ${posCart.length ? "" : "disabled"}>Hold</button>
          <button class="secondary-button compact-button" data-pos-action="resume-hold" type="button" ${heldSale ? "" : "disabled"}>Resume</button>
          <button class="sale-button" data-pos-action="save-print" type="button" ${posCart.length ? "" : "disabled"}>Save & Print</button>
        </div>
      </header>

      <section class="pos-layout">
        <aside class="pos-products-panel">
          <div class="pos-panel-head">
            <strong>Products</strong>
            <button class="secondary-button compact-button" data-pos-action="open-item" type="button">+ Item</button>
          </div>
          <div class="pos-search-row">
            <label>
              <span>Search / scan item</span>
              <input class="form-input" data-pos-search value="${escapeHtml(posSearchQuery)}" placeholder="Item name, SKU, category">
            </label>
          </div>
          <div class="pos-category-strip" role="group" aria-label="POS categories">
            <button class="${posCategoryFilter === "all" ? "active" : ""}" data-pos-category="all" type="button">All</button>
            ${categories.map((category) => `<button class="${posCategoryFilter === category ? "active" : ""}" data-pos-category="${escapeHtml(category)}" type="button">${escapeHtml(category)}</button>`).join("")}
          </div>
          <div class="pos-product-grid">
            ${filteredItems.length ? filteredItems.map(posProductCard).join("") : `
              <div class="pos-empty-products">
                <strong>No matching items</strong>
                <span>Add items or change the search.</span>
              </div>
            `}
          </div>
        </aside>

        <section class="pos-cart-panel">
          <div class="pos-cart-head">
            <div>
              <span>Cart</span>
              <strong>${formatCurrency(totals.total)}</strong>
            </div>
            <div>
              <button class="secondary-button compact-button" data-pos-action="preview" type="button" ${posCart.length ? "" : "disabled"}>Preview</button>
              <button class="outline-mini-button" data-pos-action="clear-cart" type="button" ${posCart.length ? "" : "disabled"}>Clear</button>
            </div>
          </div>
          <div class="pos-cart-table-wrap">
            <table class="pos-cart-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Disc.</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${posCart.length ? posCart.map((line, index) => posCartRowTemplate(line, index)).join("") : `
                  <tr class="pos-empty-cart-row"><td colspan="7">Scan or select an item to start billing.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </section>

        <aside class="pos-checkout-panel">
          <section class="pos-customer-box">
            <div class="pos-panel-title">
              <strong>Customer</strong>
              <span>${selectedParty ? "Selected" : "Optional for paid sale"}</span>
            </div>
            <label>
              <span>Name / phone</span>
              <input class="form-input" data-pos-customer value="${escapeHtml(posCustomerQuery || selectedParty?.name || "")}" placeholder="Walk-in customer">
            </label>
            <div class="pos-party-results">
              ${partyMatches.map((party) => `
                <button class="${String(party.id) === String(posSelectedPartyId) ? "active" : ""}" data-pos-party="${party.id}" type="button">
                  <strong>${escapeHtml(party.name)}</strong>
                  <span>${escapeHtml(party.phone || "No phone")} - ${formatCurrency(Math.abs(Number(party.balance || 0)))}</span>
                </button>
              `).join("")}
              ${posCustomerQuery && !exactParty ? `
                <button class="pos-add-party-result" data-pos-action="open-party" type="button">+ Add "${escapeHtml(posCustomerQuery)}"</button>
              ` : ""}
            </div>
          </section>

          <section class="pos-total-box">
            <div class="pos-total-line"><span>Subtotal</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
            <div class="pos-total-line"><span>Discount</span><strong>${formatCurrency(totals.discount)}</strong></div>
            <div class="pos-total-line"><span>CGST</span><strong>${formatCurrency(totals.cgst)}</strong></div>
            <div class="pos-total-line"><span>SGST</span><strong>${formatCurrency(totals.sgst)}</strong></div>
            <div class="pos-total-line"><span>IGST</span><strong>${formatCurrency(totals.igst)}</strong></div>
            <div class="pos-total-line grand"><span>Total</span><strong>${formatCurrency(totals.total)}</strong></div>
          </section>

          <section class="pos-payment-box">
            <label>
              <span>Payment Method</span>
              <select class="form-input" data-pos-payment-method>
                ${["Cash", "UPI", "Card", "Bank"].map((method) => `<option value="${method}" ${posPaymentMethod === method ? "selected" : ""}>${method}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Received</span>
              <input class="form-input" data-pos-received type="number" min="0" step="0.01" value="${receivedValue.toFixed(2)}">
            </label>
            <div class="pos-balance-line">
              <span data-pos-balance-label>${changeValue > 0 ? "Change" : "Balance"}</span>
              <strong data-pos-balance>${formatCurrency(changeValue > 0 ? changeValue : balanceValue)}</strong>
            </div>
          </section>

          <section class="pos-actions">
            <button class="secondary-button" data-pos-action="save" type="button" ${posCart.length ? "" : "disabled"}>Save</button>
            <button class="primary-button square" data-pos-action="save-print" type="button" ${posCart.length ? "" : "disabled"}>Save & Print</button>
          </section>
        </aside>
      </section>
    </section>
  `;
}

function posCategoryOptions() {
  const categories = (state.items || [])
    .map((item) => String(item.category || "").trim())
    .filter(Boolean);
  return [...new Set(categories)].sort((a, b) => a.localeCompare(b)).slice(0, 12);
}

function posFilteredItems() {
  const query = String(posSearchQuery || "").trim().toLowerCase();
  return (state.items || [])
    .filter((item) => {
      const category = String(item.category || "").trim();
      if (posCategoryFilter !== "all" && category !== posCategoryFilter) return false;
      if (!query) return true;
      return [item.name, item.sku, item.category, item.unit, item.hsnSac]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, 60);
}

function posProductCard(item) {
  const stock = Number(item.currentStock ?? item.openingStock ?? 0);
  const isService = String(item.itemType || "").toLowerCase() === "service";
  const details = [item.sku ? `SKU ${item.sku}` : "", item.category, item.unit].filter(Boolean).join(" - ") || "No details";
  return `
    <button class="pos-product-card" data-pos-add-item="${item.id}" type="button">
      <strong>${escapeHtml(item.name || "Item")}</strong>
      <span>${escapeHtml(details)}</span>
      <em>${formatCurrency(Number(item.salePrice || 0))}</em>
      <small>${isService ? "Service" : `${formatQuantity(stock)} stock`} - GST ${formatPercent(item.taxRate || 0)}</small>
    </button>
  `;
}

function posCartRowTemplate(line, index) {
  const totals = posLineTotals(line);
  return `
    <tr data-pos-line="${index}">
      <td><strong>${escapeHtml(line.item || "")}</strong><small>${escapeHtml(line.sku || line.hsnSac || "")}</small></td>
      <td>
        <div class="pos-qty-stepper">
          <button data-pos-line-action="minus" type="button">-</button>
          <input data-pos-line-field="qty" type="number" min="0" step="0.01" value="${Number(line.qty || 0)}">
          <button data-pos-line-action="plus" type="button">+</button>
        </div>
      </td>
      <td><input data-pos-line-field="price" type="number" min="0" step="0.01" value="${Number(line.price || 0)}"></td>
      <td><input data-pos-line-field="discount" type="number" min="0" step="0.01" value="${Number(line.discount || 0)}"></td>
      <td>${formatPercent(line.taxRate || 0)}</td>
      <td><strong>${formatCurrency(totals.total)}</strong></td>
      <td><button class="row-delete-button" data-pos-line-action="remove" type="button">x</button></td>
    </tr>
  `;
}

function posLineTotals(line) {
  const qty = Number(line.qty || 0);
  const price = Number(line.price || 0);
  const taxRate = Number(line.taxRate || 0);
  const gross = Math.max(0, qty * price);
  const discount = Math.min(Math.max(0, Number(line.discount || 0)), gross);
  const taxable = Math.max(0, gross - discount);
  const tax = taxable * taxRate / 100;
  const split = posTaxSplitMode() === "igst"
    ? { cgst: 0, sgst: 0, igst: tax }
    : { cgst: tax / 2, sgst: tax / 2, igst: 0 };
  return {
    gross,
    taxable,
    discount,
    tax,
    ...split,
    total: taxable + tax,
  };
}

function posCartTotals() {
  return posCart.reduce((totals, line) => {
    const lineTotals = posLineTotals(line);
    totals.subtotal += lineTotals.gross;
    totals.discount += lineTotals.discount;
    totals.tax += lineTotals.tax;
    totals.cgst += lineTotals.cgst;
    totals.sgst += lineTotals.sgst;
    totals.igst += lineTotals.igst;
    totals.total += lineTotals.total;
    totals.qty += Number(line.qty || 0);
    return totals;
  }, { subtotal: 0, discount: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, total: 0, qty: 0 });
}

function posTaxSplitMode() {
  const businessState = posStateKey(state.businessSettings?.state || "Karnataka");
  const partyState = posStateKey(posSelectedParty()?.state || state.businessSettings?.state || "Karnataka");
  return businessState && partyState && businessState !== partyState ? "igst" : "local";
}

function posStateKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function posSelectedParty() {
  return posSelectedPartyId
    ? (state.parties || []).find((party) => String(party.id) === String(posSelectedPartyId)) || null
    : null;
}

function posPartyMatches() {
  const query = String(posCustomerQuery || "").trim().toLowerCase();
  if (!query) return posSelectedParty() ? [posSelectedParty()] : [];
  return searchPartiesByNameOrPhone(query).slice(0, 5);
}

function posHoldKey() {
  return `${storeKey}:posHold:${state.activeCompany || "default"}`;
}

function loadHeldPosSale() {
  try {
    const raw = localStorage.getItem(posHoldKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveHeldPosSale() {
  localStorage.setItem(posHoldKey(), JSON.stringify({
    cart: posCart,
    customerQuery: posCustomerQuery,
    selectedPartyId: posSelectedPartyId,
    paymentMethod: posPaymentMethod,
    receivedAmount: posReceivedAmount,
    savedAt: new Date().toISOString(),
  }));
}

function clearHeldPosSale() {
  localStorage.removeItem(posHoldKey());
}

function refreshPosView(focusSelector = "") {
  elements.featureView.innerHTML = posTemplate();
  bindFeatureActions();
  updatePosReceivedBalance();
  if (focusSelector) {
    const field = elements.featureView.querySelector(focusSelector);
    field?.focus();
    if (field && typeof field.setSelectionRange === "function") {
      const end = String(field.value || "").length;
      field.setSelectionRange(end, end);
    }
  }
}

function updatePosReceivedBalance() {
  const totals = posCartTotals();
  const receivedInput = elements.featureView.querySelector("[data-pos-received]");
  const balanceLabel = elements.featureView.querySelector("[data-pos-balance-label]");
  const balanceValue = elements.featureView.querySelector("[data-pos-balance]");
  const received = Number(receivedInput?.value || 0);
  const balance = Math.max(0, totals.total - received);
  const change = Math.max(0, received - totals.total);
  if (balanceLabel) balanceLabel.textContent = change > 0 ? "Change" : "Balance";
  if (balanceValue) balanceValue.textContent = formatCurrency(change > 0 ? change : balance);
}

function bindPosActions() {
  const root = elements.featureView.querySelector(".pos-workspace");
  if (!root) return;

  const searchInput = root.querySelector("[data-pos-search]");
  searchInput?.addEventListener("input", () => {
    posSearchQuery = searchInput.value;
    refreshPosView("[data-pos-search]");
  });
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const firstItem = posFilteredItems()[0];
    if (firstItem) addItemToPosCart(firstItem.id);
  });

  root.querySelectorAll("[data-pos-category]").forEach((button) => {
    button.addEventListener("click", () => {
      posCategoryFilter = button.dataset.posCategory || "all";
      refreshPosView();
    });
  });

  root.querySelectorAll("[data-pos-add-item]").forEach((button) => {
    button.addEventListener("click", () => addItemToPosCart(button.dataset.posAddItem));
  });

  const customerInput = root.querySelector("[data-pos-customer]");
  customerInput?.addEventListener("input", () => {
    posCustomerQuery = customerInput.value;
    const selectedParty = posSelectedParty();
    if (selectedParty && selectedParty.name !== posCustomerQuery && selectedParty.phone !== posCustomerQuery) {
      posSelectedPartyId = "";
    }
    refreshPosView("[data-pos-customer]");
  });
  customerInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const party = posPartyMatches()[0];
    if (!party) return;
    event.preventDefault();
    selectPosParty(party.id);
  });

  root.querySelectorAll("[data-pos-party]").forEach((button) => {
    button.addEventListener("click", () => selectPosParty(button.dataset.posParty));
  });

  root.querySelector("[data-pos-payment-method]")?.addEventListener("change", (event) => {
    posPaymentMethod = event.currentTarget.value || "Cash";
  });

  root.querySelector("[data-pos-received]")?.addEventListener("input", (event) => {
    posReceivedAmount = Number(event.currentTarget.value || 0);
    updatePosReceivedBalance();
  });

  root.querySelectorAll("[data-pos-line-field]").forEach((field) => {
    field.addEventListener("change", () => {
      const row = field.closest("[data-pos-line]");
      updatePosCartLine(Number(row?.dataset.posLine), field.dataset.posLineField, field.value);
    });
  });

  root.querySelectorAll("[data-pos-line-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("[data-pos-line]");
      changePosCartLine(Number(row?.dataset.posLine), button.dataset.posLineAction);
    });
  });

  root.querySelectorAll("[data-pos-action]").forEach((button) => {
    button.addEventListener("click", () => handlePosAction(button.dataset.posAction));
  });
}

function selectPosParty(partyId) {
  const party = (state.parties || []).find((record) => String(record.id) === String(partyId));
  if (!party) return;
  posSelectedPartyId = party.id;
  posCustomerQuery = party.name || "";
  refreshPosView();
}

function handlePosAction(action) {
  if (action === "open-item") {
    openEntryModal("item", null, { returnContext: { type: "posItem" } });
    return;
  }
  if (action === "open-party") {
    openEntryModal("party", null, { draft: { party: posCustomerQuery }, returnContext: { type: "posParty" } });
    return;
  }
  if (action === "clear-cart") {
    clearPosCart({ ask: true });
    return;
  }
  if (action === "hold") {
    holdPosSale();
    return;
  }
  if (action === "resume-hold") {
    resumeHeldPosSale();
    return;
  }
  if (action === "preview") {
    if (!posCart.length) {
      showToast("Add items before previewing POS receipt.");
      return;
    }
    openInvoicePreviewModal(posPreviewData());
    return;
  }
  if (action === "save") {
    savePosSale();
    return;
  }
  if (action === "save-print") {
    savePosSale({ print: true });
  }
}

function holdPosSale() {
  if (!posCart.length) {
    showToast("Add items before holding POS sale.");
    return;
  }
  saveHeldPosSale();
  clearPosCart();
  showToast("POS sale held.");
}

function resumeHeldPosSale() {
  const heldSale = loadHeldPosSale();
  if (!heldSale) {
    showToast("No held POS sale found.");
    return;
  }
  posCart = Array.isArray(heldSale.cart) ? heldSale.cart : [];
  posCustomerQuery = heldSale.customerQuery || "";
  posSelectedPartyId = heldSale.selectedPartyId || "";
  posPaymentMethod = heldSale.paymentMethod || "Cash";
  posReceivedAmount = heldSale.receivedAmount === undefined ? null : Number(heldSale.receivedAmount || 0);
  clearHeldPosSale();
  refreshPosView();
  showToast("Held POS sale resumed.");
}

function addItemToPosCart(itemId) {
  const item = (state.items || []).find((record) => Number(record.id) === Number(itemId));
  if (!item) return;
  const existing = posCart.find((line) => Number(line.itemId) === Number(item.id));
  if (existing) {
    existing.qty = Number(existing.qty || 0) + 1;
  } else {
    posCart.push({
      itemId: item.id,
      item: item.name || "Item",
      sku: item.sku || "",
      hsnSac: item.hsnSac || "",
      unit: item.unit || "Pcs",
      qty: 1,
      price: Number(item.salePrice || 0),
      discount: Number(item.discount || 0),
      taxRate: Number(item.taxRate || 0),
      itemType: item.itemType || "product",
    });
  }
  refreshPosView();
}

function updatePosCartLine(index, field, value) {
  const line = posCart[index];
  if (!line) return;
  line[field] = Math.max(0, Number(value || 0));
  if (field === "qty" && line[field] <= 0) posCart.splice(index, 1);
  refreshPosView();
}

function changePosCartLine(index, action) {
  const line = posCart[index];
  if (!line) return;
  if (action === "plus") line.qty = Number(line.qty || 0) + 1;
  if (action === "minus") line.qty = Math.max(0, Number(line.qty || 0) - 1);
  if (action === "remove" || Number(line.qty || 0) <= 0) posCart.splice(index, 1);
  refreshPosView();
}

function clearPosCart({ ask = false } = {}) {
  if (ask && posCart.length && !confirm("Clear the current POS cart?")) return false;
  posCart = [];
  posCustomerQuery = "";
  posSelectedPartyId = "";
  posPaymentMethod = "Cash";
  posReceivedAmount = null;
  refreshPosView();
  return true;
}

function posPreviewData() {
  const business = state.businessSettings || defaultBusinessSettings();
  const party = posSelectedParty() || {
    name: posCustomerQuery || "Walk-in Customer",
    billingAddress: "",
    gstin: "",
  };
  const rows = posCart.map((line, index) => {
    const totals = posLineTotals(line);
    return {
      index: index + 1,
      item: line.item,
      description: "",
      hsnSac: line.hsnSac || "",
      qty: Number(line.qty || 0),
      unit: line.unit || "",
      price: Number(line.price || 0),
      discount: Number(line.discount || 0),
      taxRate: Number(line.taxRate || 0),
      tax: totals.tax,
      total: totals.total,
    };
  });
  const totals = posCartTotals();
  return {
    editorType: "sale",
    previewTitle: "POS Receipt Preview",
    documentTitle: "POS Sale Receipt",
    business,
    party,
    rows,
    invoiceNo: "Auto",
    date: new Date().toLocaleDateString("en-GB"),
    address: party.billingAddress || "",
    placeOfSupply: state.businessSettings?.state || "Karnataka",
    description: "POS counter sale",
    attachments: [],
    subtotal: totals.subtotal,
    discount: totals.discount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    total: totals.total,
  };
}

async function savePosSale({ print = false } = {}) {
  if (!posCart.length) {
    showToast("Add items before saving POS sale.");
    return;
  }
  const totals = posCartTotals();
  const receivedInput = elements.featureView.querySelector("[data-pos-received]");
  const paymentMethod = elements.featureView.querySelector("[data-pos-payment-method]")?.value || "Cash";
  const received = Math.min(Math.max(0, Number(receivedInput?.value || totals.total)), totals.total);
  const party = posSelectedParty();
  const partyName = party?.name || posCustomerQuery.trim() || "Walk-in Customer";
  if (received < totals.total && !party) {
    showToast("Credit POS sale needs an existing customer.");
    return;
  }
  const transaction = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: "sale",
    invoiceNo: "",
    party: partyName,
    item: posCart.length === 1 ? posCart[0].item : `${posCart.length} POS items`,
    amount: totals.total,
    received,
    phone: party?.phone || "",
    billingAddress: party?.billingAddress || "",
    paymentType: received >= totals.total ? "cash" : "credit",
    paymentTerms: received >= totals.total ? "Due on receipt" : party?.paymentTerms || "Net 7",
    paymentMethod,
    supplyType: party?.gstin ? "b2b" : "b2c",
    placeOfSupply: party?.state || state.businessSettings?.state || "Karnataka",
    partyGstin: party?.gstin || "",
    partyTaxType: party?.taxType || "unregistered",
    firmState: state.businessSettings?.state || "Karnataka",
    dueDate: new Date().toISOString(),
    items: posCart.map((line) => ({
      item: line.item,
      itemId: line.itemId,
      description: "POS sale",
      qty: Number(line.qty || 0),
      unit: line.unit || "",
      price: Number(line.price || 0),
      discount: Number(line.discount || 0),
      hsnSac: line.hsnSac || "",
      taxRate: Number(line.taxRate || 0),
    })),
    status: received >= totals.total ? "paid" : "due",
    notes: "POS counter sale",
    date: new Date().toISOString(),
  };
  const preview = posPreviewData();
  try {
    if (window.giDB?.createTransaction) {
      state = normalizeState(await window.giDB.createTransaction(transaction));
    } else {
      state.transactions.unshift(transaction);
      saveState();
    }
    clearHeldPosSale();
    clearPosCart();
    renderDashboard();
    showToast("POS sale saved.");
    if (print) {
      const createdInvoice = (state.invoices || []).find((inv) => inv.id === transaction.id || inv.transactionId === transaction.id) || (state.invoices || [])[0];
      if (createdInvoice) {
        preview.invoiceNo = createdInvoice.invoiceNo || preview.invoiceNo;
        preview.date = formatDate(createdInvoice.invoiceDate) || preview.date;
      }
      openInvoicePreviewModal(preview);
      setTimeout(() => window.print(), 120);
    }
  } catch (error) {
    showToast(error.message || "Unable to save POS sale.");
  }
}

function findEstimateRecord(id) {
  const cleanId = String(id || "");
  return (state.estimates || []).find((quote) => String(quote.id || quote.quoteId) === cleanId) || null;
}

function estimateDraftFromRecord(quote, options = {}) {
  const isPurchase = options.forPurchase || quote.documentType === "purchase_order" || quote.documentType === "purchaseOrder";
  return {
    sourceEstimateId: options.forSale || options.forPurchase ? quote.id : undefined,
    party: quote.party || "",
    phone: quote.phone || "",
    billingAddress: quote.billingAddress || "",
    invoiceNo: options.clearNumber ? "" : (quote.quoteNo || ""),
    invoiceDate: quote.date || new Date().toISOString(),
    dueDate: quote.validUntil || quote.date || new Date().toISOString(),
    paymentTerms: quote.paymentTerms || "Net 30",
    paymentType: (options.forSale || options.forPurchase) ? "credit" : "quote",
    paymentMethod: "Cash",
    received: 0,
    state: quote.placeOfSupply || "",
    supplyType: quote.supplyType || (quote.partyGstin ? "b2b" : "b2c"),
    partyGstin: quote.partyGstin || "",
    invoiceDescription: quote.notes || "",
    customFields: quote.meta?.customFields || {},
    items: estimateItemsFor(quote).map((line) => ({
      item: line.item || "",
      itemId: line.itemId || "",
      description: line.description || "",
      qty: line.qty || "",
      unit: line.unit || "",
      price: line.price || "",
      discount: line.discount || 0,
      taxRate: line.taxRate || 0,
      hsnSac: line.hsnSac || "",
    })),
  };
}

function estimatePreviewDataFromRecord(quote, overrides = {}) {
  const business = state.businessSettings || defaultBusinessSettings();
  const party = findPartyByName(quote.party) || {
    name: quote.party,
    phone: quote.phone,
    gstin: quote.partyGstin,
    billingAddress: quote.billingAddress,
  };
  const docType = quote.documentType || "estimate";
  const meta = transactionEditorMeta(docType === "sale_order" ? "saleOrder" : docType === "delivery_challan" ? "deliveryChallan" : docType === "purchase_order" ? "purchaseOrder" : docType);
  const rows = estimateItemsFor(quote).map((line, index) => ({
    index: index + 1,
    item: line.item || "",
    description: line.description || "",
    hsnSac: line.hsnSac || "",
    qty: Number(line.qty || 0),
    unit: line.unit || "",
    price: Number(line.price || 0),
    discount: Number(line.discount || 0),
    taxRate: Number(line.taxRate || 0),
    tax: Number(line.taxAmount || 0),
    total: Number(line.lineTotal || 0),
  }));
  return {
    editorType: docType,
    previewTitle: meta.previewTitle || "Quotation Preview",
    documentTitle: meta.documentTitle || "Quotation",
    business,
    party,
    rows,
    invoiceNo: quote.quoteNo || "-",
    date: quote.date || "",
    validUntil: quote.validUntil || "",
    address: quote.billingAddress || party?.billingAddress || "",
    placeOfSupply: quote.placeOfSupply || "",
    customFields: customFieldsForModule(docType).map((field) => ({
      ...field,
      value: customFieldValue(field, quote.meta?.customFields || {}),
    })).filter((field) => field.showOnPrint && (field.fieldType === "checkbox" ? field.value : String(field.value || "").trim())),
    description: quote.notes || "",
    attachments: [],
    subtotal: Number(quote.subtotal ?? estimateTaxableValue(quote)),
    discount: Number(quote.discountTotal || 0),
    cgst: Number(quote.cgstTotal || 0),
    sgst: Number(quote.sgstTotal || 0),
    igst: Number(quote.igstTotal || 0),
    total: estimateTotalValue(quote),
    ...overrides,
  };
}

async function handleEstimateAction(action, estimateId) {
  const quote = findEstimateRecord(estimateId);
  if (!quote) {
    showToast("Document not found.");
    return;
  }

  const docType = quote.documentType || "estimate";
  const isPO = docType === "purchase_order" || docType === "purchaseOrder";
  const editorType = docType === "sale_order" ? "saleOrder" : docType === "delivery_challan" ? "deliveryChallan" : docType === "purchase_order" ? "purchaseOrder" : docType;

  if (action === "viewEdit" || action === "view") {
    openTransactionEditor(editorType, {
      editInvoiceId: quote.id || quote.quoteId,
      draft: estimateDraftFromRecord(quote),
    });
    return;
  }
  if (action === "preview") {
    openInvoicePreviewModal(estimatePreviewDataFromRecord(quote));
    return;
  }
  if (action === "print") {
    openInvoicePreviewModal(estimatePreviewDataFromRecord(quote));
    setTimeout(() => window.print(), 120);
    return;
  }
  if (action === "duplicate") {
    openTransactionEditor(editorType, {
      draft: estimateDraftFromRecord(quote, { clearNumber: true }),
    });
    return;
  }
  if (action === "markSent") {
    await updateEstimateStatus(quote, "sent", "Marked as sent.");
    return;
  }
  if (action === "markAccepted") {
    await updateEstimateStatus(quote, "accepted", "Marked as accepted.");
    return;
  }
  if (action === "cancel") {
    if (!confirm(`Cancel ${quote.quoteNo || ""}?`)) return;
    await updateEstimateStatus(quote, "cancelled", "Cancelled.");
    return;
  }
  if (action === "convert") {
    if (['converted', 'cancelled'].includes(estimateStatus(quote))) {
      showToast('This document cannot be converted.');
      return;
    }
    if (isPO) {
      openTransactionEditor("purchase", {
        draft: estimateDraftFromRecord(quote, { clearNumber: true, forPurchase: true }),
      });
    } else {
      openTransactionEditor("sale", {
        draft: estimateDraftFromRecord(quote, { clearNumber: true, forSale: true }),
      });
    }
    return;
  }
  if (action === "delete") {
    await deleteEstimateRecord(quote);
  }
}

async function updateEstimateStatus(quote, status, notes = "") {
  try {
    if (window.giDB?.setEstimateStatus) {
      state = normalizeState(await window.giDB.setEstimateStatus({ estimateId: quote.id || quote.quoteId, status, notes }));
    } else {
      const target = (state.estimates || []).find((item) => String(item.id || item.quoteId) === String(quote.id || quote.quoteId));
      if (target) {
        target.status = status;
        target.notes = [target.notes, notes].filter(Boolean).join("\n");
      }
      saveState();
    }
    elements.featureView.innerHTML = estimateTemplate();
    bindFeatureActions();
    showToast(`Quotation ${titleCase(status)}.`);
  } catch (error) {
    showToast(error.message || "Unable to update quotation.");
  }
}

async function deleteEstimateRecord(quote) {
  if (!confirm(`Delete quotation ${quote.quoteNo || ""}? This cannot be undone.`)) return;
  try {
    if (window.giDB?.deleteEstimate) {
      state = normalizeState(await window.giDB.deleteEstimate({ estimateId: quote.id || quote.quoteId }));
    } else {
      state.estimates = (state.estimates || []).filter((item) => String(item.id || item.quoteId) !== String(quote.id || quote.quoteId));
      state.estimateItems = (state.estimateItems || []).filter((item) => String(item.estimateId) !== String(quote.id || quote.quoteId));
      saveState();
    }
    elements.featureView.innerHTML = estimateTemplate();
    bindFeatureActions();
    showToast("Quotation deleted.");
  } catch (error) {
    showToast(error.message || "Unable to delete quotation.");
  }
}

function invoiceRowsTable(rows, { isSale, partyLabel, numberLabel, paidLabel, colFilters = {}, type = "sale" }) {
  const cf = (col) => `<button class="col-filter-icon ${colFilters[col]?.value ? "active" : ""}" type="button" data-col-filter-btn="${col}" data-col-filter-type="${type}" title="Filter by ${col}">▽</button>`;
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date ${cf("date")}</th>
          <th>${numberLabel} ${cf("invoiceNo")}</th>
          <th>${partyLabel} ${cf("party")}</th>
          <th>Total ${cf("total")}</th>
          <th>${paidLabel} ${cf("received")}</th>
          <th>Balance ${cf("balance")}</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((entry, index) => `
          <tr data-invoice-row="${escapeHtml(entry.id || entry.invoiceId || entry.transactionId || "")}">
            <td>${formatDate(entry.date)}</td>
            <td><strong class="invoice-no-cell">${escapeHtml(entry.invoiceNo || `${isSale ? "INV" : "PB"}-${String(index + 1).padStart(4, "0")}`)}</strong><small>${escapeHtml(entry.item || invoiceItemSummary(entry.id))}</small></td>
            <td><strong>${escapeHtml(entry.party || "-")}</strong><small>${escapeHtml(entry.phone || "")}</small></td>
            <td class="amount-cell strong">${formatCurrency(invoiceTotalValue(entry))}</td>
            <td class="amount-cell">${formatCurrency(invoiceReceivedValue(entry))}</td>
            <td class="amount-cell ${invoiceBalanceValue(entry) > 0 ? "danger" : ""}">${formatCurrency(invoiceBalanceValue(entry))}</td>
            <td>${invoiceStatusBadge(entry)}</td>
            <td>${invoiceRowActions(entry, { isSale })}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function invoiceRowActions(entry, { isSale = true } = {}) {
  const id = escapeHtml(entry.id || entry.invoiceId || entry.transactionId || "");
  const groups = isSale
    ? [
        ["Primary", [["viewEdit", "View/Edit"], ["preview", "Preview"], ["print", "Print"]]],
        ["Payment", [["receivePayment", "Receive Payment"]]],
        ["Documents", [["openPdf", "Open PDF"]]],
        ["More", [["duplicate", "Duplicate"], ["return", "Convert To Return"], ["history", "View History"], ["cancel", "Cancel Invoice"], ["delete", "Delete"]]],
      ]
    : [
        ["Primary", [["viewEdit", "View/Edit"], ["preview", "Preview"], ["print", "Print"]]],
        ["Payment", [["receivePayment", "Record Payment"]]],
        ["Documents", [["openPdf", "Open PDF"]]],
        ["More", [["duplicate", "Duplicate"], ["return", "Convert To Return / Dr. Note"], ["history", "View History"], ["cancel", "Cancel Bill"], ["delete", "Delete"]]],
      ];
  return `
    <div class="invoice-row-actions">
      <details>
        <summary aria-label="Invoice actions">⋮</summary>
        <div class="invoice-action-menu">
          ${groups.map(([group, actions]) => `
            <section>
              <span>${escapeHtml(group)}</span>
              ${actions.map(([action, label]) => `<button type="button" data-invoice-action="${action}" data-invoice-id="${id}">${label}</button>`).join("")}
            </section>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

function findInvoiceRecord(id) {
  const cleanId = String(id || "");
  return (state.invoices || []).find((invoice) => String(invoice.id) === cleanId || String(invoice.transactionId) === cleanId)
    || (state.transactions || []).find((transaction) => String(transaction.invoiceId || transaction.id) === cleanId)
    || null;
}

function invoiceItemsFor(invoice) {
  const invoiceId = invoice?.id || invoice?.invoiceId;
  if (!invoiceId) return [];
  return (state.invoiceItems || [])
    .filter((line) => String(line.invoiceId) === String(invoiceId))
    .sort((a, b) => Number(a.lineNo || 0) - Number(b.lineNo || 0));
}

function invoiceDraftFromRecord(invoice, options = {}) {
  const lines = invoiceItemsFor(invoice);
  const firstTransactionItem = invoice?.item ? [{ item: invoice.item, qty: 1, price: invoiceTotalValue(invoice) }] : [];
  return {
    party: !invoice.partyId && invoice.party === 'Cash' ? '' : invoice.party || "",
    roundOff: invoice.meta?.roundOff === true,
    phone: invoice.phone || "",
    billingAddress: invoice.billingAddress || "",
    invoiceNo: options.clearNumber ? "" : (invoice.invoiceNo || ""),
    invoiceDate: invoice.date || new Date().toISOString(),
    dueDate: invoice.dueDate || invoice.date || new Date().toISOString(),
    paymentTerms: invoice.paymentTerms || "Due on receipt",
    paymentType: invoice.paymentType || (invoiceBalanceValue(invoice) > 0 ? "credit" : "cash"),
    paymentMethod: "Cash",
    received: Number(invoice.received || 0),
    state: invoice.placeOfSupply || "",
    supplyType: invoice.supplyType || (invoice.partyGstin ? "b2b" : "b2c"),
    partyGstin: invoice.partyGstin || "",
    invoiceDescription: invoice.notes || "",
    customFields: invoice.meta?.customFields || {},
    items: lines.length ? lines.map((line) => ({
      item: line.item || "",
      itemId: line.itemId || "",
      description: line.description || "",
      qty: line.qty || "",
      unit: line.unit || "",
      price: line.price || "",
      discount: line.discount || 0,
      taxRate: line.taxRate || 0,
      hsnSac: line.hsnSac || "",
    })) : firstTransactionItem,
  };
}

function invoicePreviewDataFromRecord(invoice, overrides = {}) {
  const business = state.businessSettings || defaultBusinessSettings();
  const party = { name: invoice.party, gstin: invoice.partyGstin, billingAddress: invoice.billingAddress };
  const rows = invoiceItemsFor(invoice).map((line, index) => ({
    index: index + 1,
    item: line.item || "",
    description: line.description || "",
    hsnSac: line.hsnSac || "",
    qty: Number(line.qty || 0),
    unit: line.unit || "",
    price: Number(line.price || 0),
    discount: Number(line.discount || 0),
    taxRate: Number(line.taxRate || 0),
    tax: Number(line.taxAmount || 0),
    total: Number(line.lineTotal || 0),
  }));
  if (!rows.length && invoice.item) {
    rows.push({
      index: 1,
      item: invoice.item,
      description: invoice.notes || "",
      hsnSac: "",
      qty: 1,
      unit: "",
      price: invoiceTotalValue(invoice),
      discount: 0,
      taxRate: 0,
      tax: 0,
      total: invoiceTotalValue(invoice),
    });
  }
  return {
    editorType: invoice.type || "sale",
    business,
    party,
    rows,
    invoiceNo: invoice.invoiceNo || "-",
    date: invoice.date || "",
    address: invoice.billingAddress || party?.billingAddress || "",
    placeOfSupply: invoice.placeOfSupply || "",
    customFields: customFieldsForModule(invoice.type || "sale").map((field) => ({
      ...field,
      value: customFieldValue(field, invoice.meta?.customFields || {}),
    })).filter((field) => field.showOnPrint && (field.fieldType === "checkbox" ? field.value : String(field.value || "").trim())),
    description: invoice.notes || "",
    attachments: [],
    subtotal: Number(invoice.subtotal ?? invoiceTotalValue(invoice)),
    discount: Number(invoice.discountTotal || 0),
    cgst: Number(invoice.cgstTotal || 0),
    sgst: Number(invoice.sgstTotal || 0),
    igst: Number(invoice.igstTotal || 0),
    total: invoiceTotalValue(invoice),
    ...overrides,
  };
}

function handleInvoiceListAction(action, invoiceId) {
  const invoice = findInvoiceRecord(invoiceId);
  if (!invoice) {
    showToast("Invoice not found.");
    return;
  }
  const invoiceType = invoice.type === "purchase" ? "purchase" : "sale";

  if (action === "viewEdit" || action === "edit") {
    openTransactionEditor(invoiceType, {
      editInvoiceId: invoice.id || invoice.invoiceId,
      draft: invoiceDraftFromRecord(invoice),
    });
    return;
  }
  if (action === "view" || action === "preview") {
    openInvoicePreviewModal(invoicePreviewDataFromRecord(invoice));
    return;
  }
  if (action === "openPdf") {
    openInvoicePreviewModal(invoicePreviewDataFromRecord(invoice, {
      previewTitle: "PDF Preview",
      documentTitle: invoiceType === "sale" ? "Tax Invoice" : "Purchase Bill",
    }));
    return;
  }
  if (action === "print") {
    openInvoicePreviewModal(invoicePreviewDataFromRecord(invoice));
    setTimeout(() => window.print(), 120);
    return;
  }
  if (action === "duplicate") {
    openTransactionEditor(invoiceType, {
      draft: invoiceDraftFromRecord(invoice, { clearNumber: true }),
    });
    return;
  }
  if (action === "payment" || action === "receivePayment") {
    openInvoicePaymentModal(invoice);
    return;
  }
  if (action === "einvoice") {
    openEInvoicePayloadModal(invoice);
    return;
  }
  if (action === "return") {
    if (invoice.type === "purchase") {
      openDebitNoteEditorFromInvoice(invoice);
    } else {
      openCreditNoteEditorFromInvoice(invoice);
    }
    return;
  }
  if (action === "deliveryChallan") {
    openInvoicePreviewModal(invoicePreviewDataFromRecord(invoice, {
      previewTitle: "Delivery Challan Preview",
      documentTitle: "Delivery Challan",
      description: `Delivery challan generated from invoice ${invoice.invoiceNo || "-"}`,
    }));
    return;
  }
  if (action === "history") {
    openInvoiceHistoryModal(invoice);
    return;
  }
  if (action === "share") {
    showToast("WhatsApp/Email share placeholder. Message templates will connect here.");
    return;
  }
  if (action === "void" || action === "cancel") {
    cancelInvoiceRecord(invoice);
    return;
  }
  if (action === "delete") {
    deleteInvoiceRecord(invoice);
  }
}

function openInvoicePaymentModal(invoice) {
  const balance = invoiceBalanceValue(invoice);
  if (String(invoice.status || "").toLowerCase() === "cancelled") {
    showToast("Cannot record payment for a cancelled invoice.");
    return;
  }
  if (balance <= 0) {
    showToast("This invoice has no balance due.");
    return;
  }

  document.getElementById("invoiceActionModal")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop invoice-action-backdrop";
  backdrop.id = "invoiceActionModal";
  const paymentLabel = invoice.type === "purchase" ? "Pay Supplier" : "Receive Payment";
  backdrop.innerHTML = `
    <section class="invoice-action-modal" role="dialog" aria-modal="true" aria-label="${paymentLabel}">
      <header>
        <div>
          <span>${escapeHtml(invoice.invoiceNo || "-")}</span>
          <strong>${paymentLabel}</strong>
        </div>
        <button class="close-button" type="button" data-action-modal-close>&times;</button>
      </header>
      <form class="invoice-action-form" id="invoicePaymentForm">
        <div class="action-summary-line">
          <span>Party</span><b>${escapeHtml(invoice.party || "-")}</b>
          <span>Balance</span><b>${formatCurrency(balance)}</b>
        </div>
        <label>Amount
          <input class="form-input" name="amount" type="number" min="0.01" max="${balance}" step="0.01" value="${balance.toFixed(2)}" required>
        </label>
        <label>Payment Method
          <select class="form-input" name="method">
            <option>Cash</option>
            <option>Bank</option>
            <option>UPI</option>
            <option>Card</option>
            <option>Cheque</option>
          </select>
        </label>
        <label>Payment Date
          <input class="form-input" name="paymentDate" type="date" value="${formatDateInput(new Date().toISOString())}" required>
        </label>
        <label class="wide">Notes
          <textarea class="form-input" name="notes" rows="3" placeholder="Reference number or payment note">${escapeHtml(paymentLabel)} for ${escapeHtml(invoice.invoiceNo || "")}</textarea>
        </label>
        <footer>
          <button class="secondary-button" type="button" data-action-modal-close>Cancel</button>
          <button class="primary-button square" type="submit">Save Payment</button>
        </footer>
      </form>
    </section>
  `;
  document.body.append(backdrop);
  bindInvoiceActionModalClose(backdrop);
  backdrop.querySelector("#invoicePaymentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await recordPaymentForInvoice(invoice, {
      amount: Number(form.get("amount") || 0),
      method: String(form.get("method") || "Cash"),
      paymentDate: String(form.get("paymentDate") || new Date().toISOString()),
      notes: String(form.get("notes") || "").trim(),
    }, backdrop);
  });
}

function bindInvoiceActionModalClose(backdrop) {
  backdrop.querySelectorAll("[data-action-modal-close]").forEach((button) => {
    button.addEventListener("click", () => backdrop.remove());
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
}

async function recordPaymentForInvoice(invoice, payment, backdrop) {
  try {
    if (window.giDB?.recordInvoicePayment) {
      state = normalizeState(await window.giDB.recordInvoicePayment({ invoiceId: invoice.id || invoice.invoiceId, ...payment }));
    } else {
      recordInvoicePaymentLocal(invoice, payment);
      saveState();
    }
    backdrop?.remove();
    refreshAfterInvoiceMutation(invoice.type);
    showToast("Payment recorded.");
  } catch (error) {
    showToast(error.message || "Unable to record payment.");
  }
}

function recordInvoicePaymentLocal(invoice, payment) {
  const amount = Math.min(Math.max(0, Number(payment.amount || 0)), Math.max(0, invoiceBalanceValue(invoice)));
  if (amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const invoiceId = invoice.id || invoice.invoiceId;
  const transactionId = invoice.transactionId || invoice.id;
  const paymentDate = payment.paymentDate || new Date().toISOString();
  state.payments = state.payments || [];
  state.payments.unshift({
    id: Date.now() + Math.random(),
    invoiceId,
    transactionId,
    type: invoice.type === "purchase" ? "payment_out" : "payment_in",
    party: invoice.party,
    amount,
    method: payment.method || "Cash",
    paymentDate,
    notes: payment.notes || "",
    createdAt: new Date().toISOString(),
  });
  updateLocalInvoicePaymentTotals(invoiceId, amount);
}

function updateLocalInvoicePaymentTotals(invoiceId, amount) {
  const invoice = (state.invoices || []).find((row) => String(row.id) === String(invoiceId));
  if (!invoice) return;
  invoice.received = Number(invoice.received || 0) + amount;
  invoice.balance = Math.max(0, Number(invoice.total || 0) - Number(invoice.received || 0));
  invoice.status = invoice.balance <= 0 ? "paid" : "partially_paid";
  const tx = (state.transactions || []).find((row) => String(row.invoiceId || row.id) === String(invoiceId));
  if (tx) tx.status = invoice.balance <= 0 ? "paid" : "due";
}

async function cancelInvoiceRecord(invoice) {
  if (String(invoice.status || "").toLowerCase() === "cancelled") {
    showToast("Invoice is already cancelled.");
    return;
  }
  if (!confirm(`Cancel ${invoice.invoiceNo || "this invoice"}? The invoice will remain in history with zero balance.`)) return;
  try {
    const notes = `Cancelled on ${new Date().toLocaleString()}`;
    if (window.giDB?.setInvoiceStatus) {
      state = normalizeState(await window.giDB.setInvoiceStatus({ invoiceId: invoice.id || invoice.invoiceId, status: "cancelled", notes }));
    } else {
      setInvoiceStatusLocal(invoice, "cancelled", notes);
      saveState();
    }
    refreshAfterInvoiceMutation(invoice.type);
    showToast("Invoice cancelled.");
  } catch (error) {
    showToast(error.message || "Unable to cancel invoice.");
  }
}

function setInvoiceStatusLocal(invoice, status, notes = "") {
  const invoiceId = invoice.id || invoice.invoiceId;
  const target = (state.invoices || []).find((row) => String(row.id) === String(invoiceId));
  if (target) {
    target.status = status;
    if (status === "cancelled") target.balance = 0;
    target.notes = [target.notes, notes].filter(Boolean).join("\n");
  }
  const tx = (state.transactions || []).find((row) => String(row.invoiceId || row.id) === String(invoiceId));
  if (tx) {
    tx.status = status;
    tx.notes = [tx.notes, notes].filter(Boolean).join("\n");
  }
}

async function deleteInvoiceRecord(invoice) {
  if (!confirm(`Delete ${invoice.invoiceNo || "this invoice"} permanently? This removes linked payments, stock movement, and ledger rows.`)) return;
  try {
    if (window.giDB?.deleteInvoice) {
      state = normalizeState(await window.giDB.deleteInvoice({ invoiceId: invoice.id || invoice.invoiceId }));
    } else {
      deleteInvoiceLocal(invoice);
      saveState();
    }
    refreshAfterInvoiceMutation(invoice.type);
    showToast("Invoice deleted.");
  } catch (error) {
    showToast(error.message || "Unable to delete invoice.");
  }
}

function deleteInvoiceLocal(invoice) {
  const invoiceId = String(invoice.id || invoice.invoiceId || "");
  const transactionId = String(invoice.transactionId || "");
  state.invoices = (state.invoices || []).filter((row) => String(row.id) !== invoiceId);
  state.invoiceItems = (state.invoiceItems || []).filter((row) => String(row.invoiceId) !== invoiceId);
  state.payments = (state.payments || []).filter((row) => String(row.invoiceId) !== invoiceId);
  state.stockMovements = (state.stockMovements || []).filter((row) => String(row.invoiceId) !== invoiceId);
  state.ledgerEntries = (state.ledgerEntries || []).filter((row) => String(row.transactionId) !== transactionId);
  state.transactions = (state.transactions || []).filter((row) => String(row.id) !== transactionId && String(row.invoiceId) !== invoiceId);
}

function refreshAfterInvoiceMutation(type) {
  renderDashboard();
  renderFeatureView(type === "purchase" ? "purchases" : "sales");
}

function openReturnPreviewModal(invoice) {
  openInvoicePreviewModal(invoicePreviewDataFromRecord(invoice, {
    previewTitle: "Return / Credit Note Preview",
    documentTitle: "Credit Note / Sale Return",
    description: `Return against invoice ${invoice.invoiceNo || "-"}`,
  }));
}

function buildEInvoicePayload(invoice) {
  const business = state.businessSettings || defaultBusinessSettings();
  const party = findPartyByName(invoice.party) || {};
  const lines = invoiceItemsFor(invoice);
  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: invoice.supplyType === "b2b" ? "B2B" : "B2C",
      RegRev: "N",
    },
    DocDtls: {
      Typ: invoice.type === "sale" ? "INV" : "BIL",
      No: invoice.invoiceNo || "",
      Dt: toEditorDateString(invoice.date),
    },
    SellerDtls: {
      Gstin: business.gstin || "",
      LglNm: business.businessName || state.activeCompany || "",
      Addr1: business.address || "",
      Stcd: String(business.gstin || "").slice(0, 2),
    },
    BuyerDtls: {
      Gstin: invoice.partyGstin || party.gstin || "",
      LglNm: party.legalName || invoice.party || "",
      Pos: String(invoice.partyGstin || party.gstin || "").slice(0, 2),
      Addr1: invoice.billingAddress || party.billingAddress || "",
    },
    ItemList: lines.map((line, index) => ({
      SlNo: String(index + 1),
      PrdDesc: line.item || "",
      IsServc: itemKind(findItemByName(line.item) || {}).label === "Service" ? "Y" : "N",
      HsnCd: line.hsnSac || "",
      Qty: Number(line.qty || 0),
      Unit: line.unit || "NOS",
      UnitPrice: Number(line.price || 0),
      Discount: Number(line.discount || 0),
      GstRt: Number(line.taxRate || 0),
      TotAmt: Number(line.lineTotal || 0),
    })),
    ValDtls: {
      AssVal: Number(invoice.subtotal || 0),
      CgstVal: Number(invoice.cgstTotal || 0),
      SgstVal: Number(invoice.sgstTotal || 0),
      IgstVal: Number(invoice.igstTotal || 0),
      TotInvVal: Number(invoice.total || 0),
    },
  };
}

function openEInvoicePayloadModal(invoice) {
  const payload = buildEInvoicePayload(invoice);
  const missing = [];
  if (!payload.SellerDtls.Gstin || !isValidGstin(payload.SellerDtls.Gstin)) missing.push("Business GSTIN");
  if (invoice.supplyType === "b2b" && (!payload.BuyerDtls.Gstin || !isValidGstin(payload.BuyerDtls.Gstin))) missing.push("Customer GSTIN");
  const json = JSON.stringify(payload, null, 2);
  document.getElementById("invoiceActionModal")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop invoice-action-backdrop";
  backdrop.id = "invoiceActionModal";
  backdrop.innerHTML = `
    <section class="invoice-action-modal wide-action-modal" role="dialog" aria-modal="true" aria-label="Generate e-Invoice">
      <header>
        <div>
          <span>${escapeHtml(invoice.invoiceNo || "-")}</span>
          <strong>Generate e-Invoice Payload</strong>
        </div>
        <button class="close-button" type="button" data-action-modal-close>&times;</button>
      </header>
      ${missing.length ? `<div class="action-warning">Missing or invalid: ${escapeHtml(missing.join(", "))}. Payload can be prepared, but IRN generation needs valid GST details.</div>` : ""}
      <textarea class="payload-preview" readonly>${escapeHtml(json)}</textarea>
      <footer>
        <button class="secondary-button" type="button" data-action-modal-close>Close</button>
        <button class="primary-button square" type="button" data-copy-payload>Copy Payload</button>
      </footer>
    </section>
  `;
  document.body.append(backdrop);
  bindInvoiceActionModalClose(backdrop);
  backdrop.querySelector("[data-copy-payload]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(json);
      showToast("e-Invoice Payload Copied");
    } catch {
      showToast("Unable to copy payload.");
    }
  });
}

function openInvoiceHistoryModal(invoice) {
  const payments = (state.payments || []).filter((row) => String(row.invoiceId) === String(invoice.id || invoice.invoiceId));
  const stockRows = (state.stockMovements || []).filter((row) => String(row.invoiceId) === String(invoice.id || invoice.invoiceId));
  const ledgerRows = (state.ledgerEntries || []).filter((row) => String(row.transactionId) === String(invoice.transactionId));
  const events = [
    { date: invoice.createdAt || invoice.date, title: "Invoice Created", detail: `${invoice.invoiceNo || "-"} for ${formatCurrency(invoiceTotalValue(invoice))}` },
    ...payments.map((payment) => ({ date: payment.paymentDate || payment.createdAt, title: payment.type === "payment_out" ? "Payment Made" : "Payment Received", detail: `${formatCurrency(payment.amount)} via ${payment.method || "Cash"}` })),
    ...stockRows.map((row) => ({ date: row.movementDate || row.createdAt, title: `Stock ${row.movementType === "in" ? "In" : "Out"}`, detail: `${row.item}: ${formatQuantity(row.quantity)} ${row.unit || ""}` })),
    ...ledgerRows.map((row) => ({ date: row.entryDate, title: "Ledger Entry", detail: `${row.account}: Dr ${formatCurrency(row.debit)} / Cr ${formatCurrency(row.credit)}` })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  document.getElementById("invoiceActionModal")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop invoice-action-backdrop";
  backdrop.id = "invoiceActionModal";
  backdrop.innerHTML = `
    <section class="invoice-action-modal" role="dialog" aria-modal="true" aria-label="Invoice history">
      <header>
        <div>
          <span>${escapeHtml(invoice.invoiceNo || "-")}</span>
          <strong>View History</strong>
        </div>
        <button class="close-button" type="button" data-action-modal-close>&times;</button>
      </header>
      <div class="invoice-history-list">
        ${events.map((event) => `
          <article>
            <time>${formatDate(event.date)}</time>
            <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p></div>
          </article>
        `).join("")}
      </div>
      <footer><button class="primary-button square" type="button" data-action-modal-close>Done</button></footer>
    </section>
  `;
  document.body.append(backdrop);
  bindInvoiceActionModalClose(backdrop);
}

function openPurchasePdfPicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf,.txt";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) await importPurchasePdfFile(file);
  };
  input.click();
}

async function importPurchasePdfFile(file) {
  renderPurchasePdfImportLoading(file.name);
  try {
    const extractedText = await extractPurchaseImportText(file);
    purchasePdfImportDraft = parsePurchasePdfText(extractedText, file);
    renderPurchasePdfImportReview(purchasePdfImportDraft);
  } catch (error) {
    purchasePdfImportDraft = {
      sourceName: file.name,
      extractedText: "",
      party: "",
      invoiceNo: "",
      invoiceDate: new Date().toISOString(),
      confidence: "Need Review",
      notes: error.message || "Unable to read this file.",
      items: [importReviewEmptyRow()],
    };
    renderPurchasePdfImportReview(purchasePdfImportDraft);
  }
}

function renderPurchasePdfImportLoading(fileName) {
  currentView = "purchaseImport";
  document.body.dataset.view = currentView;
  document.querySelector(".topbar")?.classList.add("hidden");
  elements.homeView.classList.add("hidden");
  document.querySelector(".right-panel")?.classList.add("hidden");
  elements.listView.classList.add("hidden");
  elements.saleInvoicesView.classList.add("hidden");
  elements.purchaseBillsView.classList.add("hidden");
  elements.featureView.classList.remove("hidden");
  elements.featureView.innerHTML = `
    <section class="purchase-import-page">
      <header class="app-page-header">
        <div><p class="muted-label">Purchases</p><h1>Reading Purchase PDF</h1></div>
        <button class="secondary-button compact-button" data-action="back-to-purchases" type="button">Back</button>
      </header>
      <div class="purchase-import-loading">
        <strong>${escapeHtml(fileName)}</strong>
        <p>Extracting supplier, bill number, date, and item rows...</p>
      </div>
    </section>
  `;
  bindFeatureActions();
}

async function extractPurchaseImportText(file) {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf")) return file.text();
  const buffer = await file.arrayBuffer();
  return extractPdfTextFromArrayBuffer(buffer);
}

function extractPdfTextFromArrayBuffer(buffer) {
  const binary = decodeArrayBufferAsText(buffer);
  const pieces = [];

  binary.replace(/\[(.*?)\]\s*TJ/gs, (_match, body) => {
    extractPdfLiteralStrings(body).forEach((text) => pieces.push(text));
    return "";
  });
  binary.replace(/\((?:\\.|[^\\)])*\)\s*(?:Tj|'|")/g, (match) => {
    extractPdfLiteralStrings(match).forEach((text) => pieces.push(text));
    return "";
  });

  const extracted = normalizeImportText(pieces.join("\n"));
  if (extracted.length > 40) return extracted;

  const fallback = binary
    .replace(/[^\x20-\x7E\r\n]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 3 && /[A-Za-z]/.test(line))
    .slice(0, 300)
    .join("\n");
  return normalizeImportText(fallback);
}

function decodeArrayBufferAsText(buffer) {
  try {
    return new TextDecoder("latin1").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function extractPdfLiteralStrings(text) {
  return [...String(text || "").matchAll(/\((?:\\.|[^\\)])*\)/g)]
    .map((match) => decodePdfLiteral(match[0].slice(1, -1)))
    .filter((value) => value && /[A-Za-z0-9]/.test(value));
}

function decodePdfLiteral(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)))
    .trim();
}

function normalizeImportText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function parsePurchasePdfText(extractedText, file) {
  const text = normalizeImportText(extractedText);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const gstin = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i)?.[0]?.toUpperCase() || "";
  const invoiceNo = extractImportInvoiceNo(text);
  const invoiceDate = extractImportDate(text) || new Date().toISOString();
  const party = extractImportSupplier(lines, gstin);
  const items = extractImportItems(lines);
  const matchedItems = items.map(matchPurchaseImportItem);
  const confidence = importConfidenceLabel({
    party,
    invoiceNo,
    itemCount: matchedItems.length,
    matchedCount: matchedItems.filter((item) => item.matchedItemId).length,
    textLength: text.length,
  });

  return {
    sourceName: file?.name || "Purchase PDF",
    extractedText: text,
    party,
    gstin,
    invoiceNo,
    invoiceDate,
    paymentType: "credit",
    paymentMethod: "Bank",
    received: 0,
    confidence,
    notes: text ? "" : "No text was extracted. This may be a scanned PDF; OCR can be added next.",
    items: matchedItems.length ? matchedItems : [importReviewEmptyRow()],
  };
}

function extractImportInvoiceNo(text) {
  const match = String(text || "").match(/\b(?:invoice|inv|bill)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9/\\\-]{3,})/i);
  return match?.[1] || "";
}

function extractImportDate(text) {
  const dateMatch = String(text || "").match(/\b(?:invoice|bill)?\s*(?:date)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/i);
  if (!dateMatch) return "";
  return parseImportDate(dateMatch[1]);
}

function parseImportDate(value) {
  const text = String(value || "").trim();
  const parts = text.split(/[\/\-.]/).map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !part)) return "";
  if (String(parts[0]).length === 4 || parts[0] > 31) {
    return new Date(parts[0], parts[1] - 1, parts[2]).toISOString();
  }
  const year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  return new Date(year, parts[1] - 1, parts[0]).toISOString();
}

function extractImportSupplier(lines, gstin) {
  const joined = lines.join("\n");
  if (gstin) {
    const gstLineIndex = lines.findIndex((line) => line.toUpperCase().includes(gstin));
    for (let index = Math.max(0, gstLineIndex - 3); index < gstLineIndex; index += 1) {
      const candidate = cleanImportPartyLine(lines[index]);
      if (candidate) return candidate;
    }
  }

  const supplierMatch = joined.match(/\b(?:supplier|vendor|from|bill from)\s*[:\-]\s*(.+)/i);
  if (supplierMatch) {
    const candidate = cleanImportPartyLine(supplierMatch[1]);
    if (candidate) return candidate;
  }

  return cleanImportPartyLine(lines.find((line) => {
    const lower = line.toLowerCase();
    return /[a-z]/i.test(line)
      && !/(invoice|bill|tax|gstin|gst|date|phone|mobile|email|total|amount|qty|quantity|rate)/i.test(lower)
      && line.length > 3;
  })) || "";
}

function cleanImportPartyLine(line = "") {
  return String(line)
    .replace(/\b(?:supplier|vendor|bill from|from)\b\s*[:\-]?/ig, "")
    .replace(/\bGSTIN\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extractImportItems(lines) {
  const rows = [];
  lines.forEach((line) => {
    const row = parsePurchaseImportItemLine(line);
    if (row) rows.push(row);
  });
  return rows.slice(0, 40);
}

function parsePurchaseImportItemLine(line) {
  const clean = String(line || "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 8 || isImportSummaryLine(clean)) return null;

  const working = clean.replace(/^\d+\s+/, "");
  const numericMatches = [...working.matchAll(/(?<![A-Z])(?:₹|rs\.?)?\s*(-?\d[\d,]*(?:\.\d+)?)(?![A-Z])/gi)]
    .map((match) => ({
      value: parseImportNumber(match[1]),
      index: match.index,
      raw: match[0].trim(),
    }))
    .filter((match) => Number.isFinite(match.value));

  if (numericMatches.length < 2) return null;
  const firstNumber = numericMatches[0];
  const itemText = working.slice(0, firstNumber.index).trim();
  if (!itemText || itemText.length < 3 || !/[A-Za-z]/.test(itemText)) return null;

  const amount = numericMatches[numericMatches.length - 1].value;
  const hasExplicitTaxPercent = /\b(?:gst|igst|cgst|sgst)?\s*\d{1,2}(?:\.\d+)?\s*%/i.test(clean);
  const price = hasExplicitTaxPercent && numericMatches.length >= 4
    ? numericMatches[numericMatches.length - 3].value
    : numericMatches.length >= 3
      ? numericMatches[numericMatches.length - 2].value
      : amount;
  const qty = firstNumber.value > 0 && firstNumber.value < 100000 ? firstNumber.value : 1;
  const taxRate = extractImportTaxRate(clean, numericMatches);

  return {
    item: itemText.replace(/[-:]+$/g, "").trim(),
    description: "",
    qty,
    unit: detectImportUnit(clean) || "Pcs",
    price,
    discount: 0,
    taxRate,
    amount,
    confidence: "Need Review",
  };
}

function isImportSummaryLine(line) {
  return /(supplier|vendor|gstin|invoice\s*(no|number|date)|bill\s*(no|number|date)|item\s+qty|description\s+qty|hsn|subtotal|sub total|grand total|round off|balance|received|paid|cgst|sgst|igst|tax total|amount in words|terms|bank|upi|discount total)/i.test(line);
}

function parseImportNumber(value) {
  const cleaned = String(value || "").replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function extractImportTaxRate(line, numericMatches) {
  const percent = String(line || "").match(/\b(?:gst|igst|cgst|sgst)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
  if (percent) return Number(percent[1]);
  const possibleRate = numericMatches[numericMatches.length - 2]?.value;
  return possibleRate > 0 && possibleRate <= 28 ? possibleRate : 0;
}

function detectImportUnit(line) {
  const units = masterUnitNames().map((unit) => unit.toLowerCase());
  const token = String(line || "").split(/\s+/).find((part) => units.includes(part.toLowerCase()));
  return token || "";
}

function matchPurchaseImportItem(row) {
  const item = findImportItemMatch(row.item);
  if (!item) return { ...row, confidence: row.item ? "New Item" : "Need Review", matchedItemId: "" };
  return {
    ...row,
    item: item.name,
    unit: row.unit || item.unit || "Pcs",
    taxRate: Number(row.taxRate || item.taxRate || 0),
    matchedItemId: item.id,
    confidence: "Matched",
  };
}

function findImportItemMatch(name) {
  const clean = normalizeLookupText(name);
  if (!clean) return null;
  const exact = (state.items || []).find((item) => normalizeLookupText(item.name) === clean || normalizeLookupText(item.sku) === clean);
  if (exact) return exact;
  const words = clean.split(" ").filter((word) => word.length > 2);
  if (!words.length) return null;
  return (state.items || []).find((item) => {
    const haystack = normalizeLookupText([item.name, item.sku, item.category].filter(Boolean).join(" "));
    return words.every((word) => haystack.includes(word));
  }) || null;
}

function normalizeLookupText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function importConfidenceLabel({ party, invoiceNo, itemCount, matchedCount, textLength }) {
  if (!textLength) return "Needs OCR";
  if (party && invoiceNo && itemCount && matchedCount === itemCount) return "High";
  if (party && itemCount) return "Medium";
  return "Need Review";
}

function importReviewEmptyRow() {
  return {
    item: "",
    description: "",
    qty: 1,
    unit: "Pcs",
    price: 0,
    discount: 0,
    taxRate: 0,
    amount: 0,
    matchedItemId: "",
    confidence: "Need Review",
  };
}

function renderPurchasePdfImportReview(draft = purchasePdfImportDraft) {
  purchasePdfImportDraft = draft || { items: [importReviewEmptyRow()] };
  currentView = "purchaseImport";
  document.body.dataset.view = currentView;
  elements.homeView.classList.add("hidden");
  document.querySelector(".right-panel")?.classList.add("hidden");
  elements.listView.classList.add("hidden");
  elements.saleInvoicesView.classList.add("hidden");
  elements.purchaseBillsView.classList.add("hidden");
  elements.featureView.classList.remove("hidden");
  elements.featureView.innerHTML = purchasePdfImportTemplate(purchasePdfImportDraft);
  bindFeatureActions();
}

function purchasePdfImportTemplate(draft) {
  const rows = Array.isArray(draft.items) && draft.items.length ? draft.items : [importReviewEmptyRow()];
  const total = rows.reduce((sum, row) => sum + purchaseImportRowAmount(row), 0);
  const matchedCount = rows.filter((row) => row.matchedItemId).length;
  return `
    <section class="purchase-import-page">
      <header class="app-page-header">
        <div>
          <p class="muted-label">Purchase Import</p>
          <h1>Review Purchase PDF</h1>
        </div>
        <div class="invoice-header-actions">
          <button class="secondary-button compact-button" data-action="choose-purchase-pdf" type="button">Upload Another</button>
          <button class="secondary-button compact-button" data-action="back-to-purchases" type="button">Back</button>
          <button class="purchase-button" data-action="create-purchase-draft" type="button">Create Editable Purchase Draft</button>
        </div>
      </header>

      <section class="purchase-import-summary">
        ${kpiCard("Source", draft.sourceName || "Purchase PDF", "Uploaded file")}
        ${kpiCard("Confidence", draft.confidence || "Need Review", draft.notes || "Review before creating draft")}
        ${kpiCard("Items", `${matchedCount}/${rows.length}`, "Matched to item master")}
        ${kpiCard("Detected Total", formatCurrency(total), "From editable rows below")}
      </section>

      <section class="purchase-import-document">
        <label>Supplier
          <input class="form-input" id="importSupplier" value="${escapeHtml(draft.party || "")}" placeholder="Existing supplier name">
        </label>
        <label>Supplier GSTIN
          <input class="form-input" id="importGstin" value="${escapeHtml(draft.gstin || "")}" placeholder="Optional">
        </label>
        <label>Bill Number
          <input class="form-input" id="importInvoiceNo" value="${escapeHtml(draft.invoiceNo || "")}" placeholder="Supplier bill no">
        </label>
        <label>Bill Date
          <input class="form-input" id="importInvoiceDate" value="${escapeHtml(toEditorDateString(draft.invoiceDate || new Date().toISOString()))}" placeholder="dd/mm/yyyy">
        </label>
      </section>

      <section class="purchase-import-table-card">
        <div class="editor-table-toolbar">
          <strong>Detected Items</strong>
          <button class="outline-mini-button" data-action="add-import-row" type="button">+ Add Row</button>
        </div>
        <div class="purchase-import-table-wrap">
          <table class="purchase-import-table">
            <thead>
              <tr>
                <th>Match</th>
                <th>Item</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Rate</th>
                <th>Discount</th>
                <th>GST</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => purchaseImportRowTemplate(row, index)).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <details class="purchase-import-raw">
        <summary>Extracted text</summary>
        <textarea readonly>${escapeHtml(draft.extractedText || "No extractable text found.")}</textarea>
      </details>
    </section>
  `;
}

function purchaseImportRowTemplate(row, index) {
  const amount = purchaseImportRowAmount(row);
  const status = row.matchedItemId ? "Matched" : (row.item ? "Need item" : "Need review");
  return `
    <tr data-import-row="${index}">
      <td>
        <select class="form-input" data-import-item-match>
          <option value="">Need Review</option>
          ${(state.items || []).map((item) => `<option value="${item.id}" ${Number(row.matchedItemId || 0) === Number(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </td>
      <td><input class="form-input" data-import-field="item" value="${escapeHtml(row.item || "")}" placeholder="Item name"></td>
      <td><input class="form-input" data-import-field="description" value="${escapeHtml(row.description || "")}" placeholder="Description"></td>
      <td><input class="form-input" data-import-field="qty" type="number" min="0" step="0.01" value="${Number(row.qty || 0)}"></td>
      <td><input class="form-input" data-import-field="unit" value="${escapeHtml(row.unit || "Pcs")}"></td>
      <td><input class="form-input" data-import-field="price" type="number" min="0" step="0.01" value="${Number(row.price || 0)}"></td>
      <td><input class="form-input" data-import-field="discount" type="number" min="0" step="0.01" value="${Number(row.discount || 0)}"></td>
      <td><input class="form-input" data-import-field="taxRate" type="number" min="0" step="0.01" value="${Number(row.taxRate || 0)}"></td>
      <td><strong>${amount.toFixed(2)}</strong></td>
      <td><span class="import-status ${row.matchedItemId ? "matched" : "review"}">${escapeHtml(status)}</span></td>
    </tr>
  `;
}

function purchaseImportRowAmount(row) {
  const qty = Number(row.qty || 0);
  const price = Number(row.price || 0);
  const discount = Number(row.discount || 0);
  const taxRate = Number(row.taxRate || 0);
  const taxable = Math.max(0, qty * price - discount);
  return taxable + taxable * taxRate / 100;
}

function syncImportMatchedItem(select) {
  const row = select.closest("tr");
  const item = (state.items || []).find((record) => Number(record.id) === Number(select.value));
  if (!row || !item) return;
  row.querySelector('[data-import-field="item"]').value = item.name || "";
  const unit = row.querySelector('[data-import-field="unit"]');
  if (unit && !unit.value.trim()) unit.value = item.unit || "Pcs";
  const taxRate = row.querySelector('[data-import-field="taxRate"]');
  if (taxRate && !Number(taxRate.value || 0)) taxRate.value = Number(item.taxRate || 0);
  const status = row.querySelector(".import-status");
  if (status) {
    status.textContent = "Matched";
    status.className = "import-status matched";
  }
}

function collectPurchaseImportDraftFromReview() {
  const draft = {
    ...purchasePdfImportDraft,
    party: elements.featureView.querySelector("#importSupplier")?.value.trim() || "",
    gstin: elements.featureView.querySelector("#importGstin")?.value.trim() || "",
    invoiceNo: elements.featureView.querySelector("#importInvoiceNo")?.value.trim() || "",
    invoiceDate: parseEditorDate(elements.featureView.querySelector("#importInvoiceDate")?.value || "") || new Date().toISOString(),
    paymentType: "credit",
    paymentMethod: "Bank",
    received: 0,
    items: [],
  };

  elements.featureView.querySelectorAll("[data-import-row]").forEach((row) => {
    const matchedId = row.querySelector("[data-import-item-match]")?.value || "";
    const matchedItem = matchedId ? (state.items || []).find((item) => Number(item.id) === Number(matchedId)) : null;
    const itemName = row.querySelector('[data-import-field="item"]')?.value.trim() || "";
    const item = matchedItem?.name || itemName;
    const qty = Number(row.querySelector('[data-import-field="qty"]')?.value || 0);
    const price = Number(row.querySelector('[data-import-field="price"]')?.value || 0);
    if (!item && !qty && !price) return;
    draft.items.push({
      item,
      itemId: matchedItem?.id || "",
      description: row.querySelector('[data-import-field="description"]')?.value.trim() || "",
      qty: qty || 1,
      unit: row.querySelector('[data-import-field="unit"]')?.value.trim() || matchedItem?.unit || "Pcs",
      price,
      discount: Number(row.querySelector('[data-import-field="discount"]')?.value || 0),
      taxRate: Number(row.querySelector('[data-import-field="taxRate"]')?.value || matchedItem?.taxRate || 0),
      matchedItemId: matchedItem?.id || "",
      confidence: matchedItem ? "Matched" : "Need Review",
    });
  });

  return draft;
}

function createPurchaseDraftFromImport() {
  const draft = collectPurchaseImportDraftFromReview();
  purchasePdfImportDraft = draft;
  openTransactionEditor("purchase", {
    draft: {
      party: draft.party,
      invoiceNo: draft.invoiceNo,
      invoiceDate: draft.invoiceDate,
      paymentType: "credit",
      paymentMethod: "Bank",
      received: 0,
      items: draft.items,
    },
  });
}

function invoiceItemSummary(invoiceId) {
  const items = (state.invoiceItems || []).filter((item) => item.invoiceId === invoiceId);
  if (!items.length) return "";
  if (items.length === 1) return items[0].item;
  return `${items.length} items`;
}

function entryMatchesSearch(entry, query) {
  return [
    formatDate(entry.date),
    entry.invoiceNo,
    entry.type,
    entry.party,
    entry.item || invoiceItemSummary(entry.id),
    entry.status,
    invoiceStatusKey(entry),
    invoiceTaxTypeLabel(entry),
    entry.notes,
    entry.amount,
    entry.total,
    invoiceTaxableValue(entry),
    invoiceTaxValue(entry),
    invoiceReceivedValue(entry),
    invoiceBalanceValue(entry),
  ].filter((value) => value !== undefined && value !== null).join(" ").toLowerCase().includes(query);
}

function showView(view, title) {
  if (!transactionLeaveBypass && shouldBlockTransactionEditorLeave() && view !== currentView) {
    requestTransactionEditorLeave(() => showView(view, title));
    return;
  }
  activeTransactionEditInvoiceId = null;
  hideOpenAnythingResults();
  currentView = view;
  document.body.dataset.view = view;
  document.querySelector(".topbar")?.classList.toggle("hidden", view !== "home");
  syncSidebarNavigation(view);

  if (view === "home") {
    elements.homeView.classList.remove("hidden");
    elements.homeView.scrollTop = 0;
    document.querySelector(".right-panel").classList.remove("hidden");
    document.querySelector(".right-panel").scrollTop = 0;
    elements.listView.classList.add("hidden");
    elements.saleInvoicesView.classList.add("hidden");
    elements.purchaseBillsView.classList.add("hidden");
    elements.featureView.classList.add("hidden");
    renderDashboard();
    scheduleDashboardChartDraw();
    return;
  }

  elements.homeView.classList.add("hidden");
  document.querySelector(".right-panel").classList.add("hidden");
  elements.saleInvoicesView.classList.add("hidden");
  elements.purchaseBillsView.classList.add("hidden");
  const featureViews = new Set([
    "sales",
    "estimate",
    "purchases",
    "paymentIn",
    "paymentOut",
    "expenses",
    "purchaseOrder",
    "purchaseReturn",
    "cash",
    "sync",
    "reports",
    "pos",
    "saleReturn",
    "parties",
    "settings",
    "importItems",
    "appSettings",
    "items",
    "grow",
    "setupBusiness",
    "accountantAccess",
    "barcodeGenerator",
    "importParties",
    "exportItems",
    "verifyData",
    "saleOrder",
    "deliveryChallan",
    "proforma",
  ]);
  elements.featureView.classList.toggle("hidden", !featureViews.has(view));
  elements.listView.classList.toggle("hidden", featureViews.has(view));
  if (featureViews.has(view)) {
    if (view === "parties") partySearchQuery = globalSearchQuery();
    if (view === "items") itemSearchQuery = globalSearchQuery();
    renderFeatureView(view, title);
    return;
  }
  elements.listView.classList.remove("hidden");
  elements.listTitle.textContent = title || viewTitle(view);
  elements.listEyebrow.textContent = view === "reports" ? "Business reports" : "Manage";
  elements.listActionButton.textContent = actionTitle(view);
  elements.listActionButton.onclick = () => openEntryModal(actionType(view));
  renderCurrentList();
}

function renderFeatureView(view, context) {
  const templates = {
    sales: () => invoiceWorkspaceTemplate("sale"),
    estimate: () => estimateTemplate(),
    proforma: () => estimateTemplate(),
    purchases: () => invoiceWorkspaceTemplate("purchase"),
    expenses: () => expenseTemplate(),
    paymentIn: () => paymentInTemplate(),
    paymentOut: () => paymentOutTemplate(),
    cash: () => banksTemplate(),
    sync: () => syncTemplate(),
    reports: () => reportsTemplate(),
    pos: () => posTemplate(),
    saleReturn: () => saleReturnTemplate(),
    parties: () => partiesTemplate(),
    settings: () => csvImportTemplate("items"),
    importItems: () => csvImportTemplate("items"),
    appSettings: () => settingsTemplate(context || "GENERAL"),
    items: () => itemsTemplate(),
    grow: () => growTemplate(),
    setupBusiness: () => setupBusinessTemplate(),
    accountantAccess: () => reportsTemplate(),
    barcodeGenerator: () => barcodeGeneratorTemplate(),
    importParties: () => csvImportTemplate("parties"),
    exportItems: () => exportItemsTemplate(),
    verifyData: () => verifyDataTemplate(),
    purchaseOrder: () => estimateTemplate(),
    purchaseReturn: () => purchaseReturnTemplate(),
    saleOrder: () => estimateTemplate(),
    deliveryChallan: () => estimateTemplate(),
  };

  elements.featureView.innerHTML = templates[view]?.() || simplePage(viewTitle(view), "No records to show yet.");
  bindFeatureActions();
}

function exportCurrentReportToCsv() {
  const cards = Array.from(elements.featureView.querySelectorAll(".report-data-card, .report-card, .data-table-card"));
  const tables = cards.length
    ? cards.map((card) => ({
        title: card.querySelector(".report-card-head h2, h2")?.textContent?.trim() || "",
        table: card.querySelector(".report-table, .data-table, table"),
      })).filter((item) => Boolean(item.table))
    : Array.from(elements.featureView.querySelectorAll(".report-table, .data-table, table")).map((table) => ({ title: "", table }));

  if (!tables.length) {
    showToast("No report table available to export.");
    return;
  }

  const sections = [];
  let totalDataRows = 0;

  for (const { title, table } of tables) {
    const sectionRows = [];
    if (tables.length > 1 && title) {
      sectionRows.push(`"--- ${title.replace(/"/g, '""')} ---"`);
    }
    const headerCells = Array.from(table.querySelectorAll("thead th"));
    if (headerCells.length) {
      sectionRows.push(headerCells.map((th) => `"${(th.textContent || "").trim().replace(/"/g, '""')}"`).join(","));
    }
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length && !tr.closest(".hidden")) {
        totalDataRows++;
        sectionRows.push(cells.map((td) => `"${(td.textContent || "").trim().replace(/"/g, '""')}"`).join(","));
      }
    });
    if (sectionRows.length) {
      sections.push(sectionRows.join("\r\n"));
    }
  }

  if (totalDataRows === 0) {
    showToast("No data rows found to export.");
    return;
  }

  const csvContent = "\uFEFF" + sections.join("\r\n\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const heading = (elements.featureView.querySelector(".report-hero h1, .app-page-header h1, .feature-titlebar h1")?.textContent || "report")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const stamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `${heading || "gi-billing-report"}-${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("Report exported as CSV successfully.");
}

async function exportCurrentReportToPdf() {
  const heading = (elements.featureView.querySelector(".report-hero h1, .app-page-header h1, .feature-titlebar h1")?.textContent || "Report").trim();
  const dateScopeText = formatReportDateScope(reportDateScope());
  const companyName = state.businessSettings?.businessName || state.activeCompany || "GI Billing";
  const gstin = state.businessSettings?.gstin ? `GSTIN: ${escapeHtml(state.businessSettings.gstin)}` : "";
  const phone = state.businessSettings?.phone ? `Phone: ${escapeHtml(state.businessSettings.phone)}` : "";
  const address = state.businessSettings?.address ? escapeHtml(state.businessSettings.address) : "";

  const kpiCards = Array.from(elements.featureView.querySelectorAll(".report-kpis .kpi-card")).map((el) => ({
    label: el.querySelector("span")?.textContent?.trim() || "",
    value: el.querySelector("strong")?.textContent?.trim() || "",
    note: el.querySelector("small")?.textContent?.trim() || "",
    tone: el.className.replace("kpi-card", "").trim() || "neutral",
  }));

  const cards = Array.from(elements.featureView.querySelectorAll(".report-data-card, .report-card, .data-table-card"));
  const tablesData = cards.length
    ? cards.map((card) => ({
        title: card.querySelector(".report-card-head h2, h2")?.textContent?.trim() || "",
        table: card.querySelector(".report-table, .data-table, table"),
      })).filter((item) => Boolean(item.table))
    : Array.from(elements.featureView.querySelectorAll(".report-table, .data-table, table")).map((table) => ({ title: "", table }));

  if (!tablesData.length) {
    showToast("No report data available to export to PDF.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const printTimestamp = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(heading)} - ${escapeHtml(companyName)}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm 14mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #fff; margin: 0; font-size: 11px; line-height: 1.4; }
    .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0c65c2; padding-bottom: 12px; margin-bottom: 16px; }
    .company-info h1 { margin: 0 0 4px; font-size: 20px; color: #0f172a; font-weight: 800; }
    .company-info p { margin: 2px 0; color: #475569; font-size: 11px; }
    .report-meta { text-align: right; }
    .report-meta h2 { margin: 0 0 4px; font-size: 18px; color: #0c65c2; font-weight: 800; }
    .report-meta .period-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; margin-top: 4px; }
    .report-meta .print-date { font-size: 10px; color: #94a3b8; margin-top: 4px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
    .kpi-box { border: 1px solid #e2e8f0; border-top: 3px solid #0c65c2; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .kpi-box.success { border-top-color: #10b981; }
    .kpi-box.danger { border-top-color: #ef4444; }
    .kpi-box.info { border-top-color: #0284c7; }
    .kpi-box.neutral { border-top-color: #64748b; }
    .kpi-box span { display: block; font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 2px; }
    .kpi-box strong { display: block; font-size: 15px; font-weight: 800; color: #0f172a; }
    .kpi-box small { display: block; font-size: 10px; color: #94a3b8; margin-top: 2px; }
    .table-section { margin-bottom: 20px; page-break-inside: auto; }
    .table-section h3 { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; white-space: nowrap; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; color: #1e293b; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pdf-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 9.5px; color: #94a3b8; }
  </style>
</head>
<body>
  <header class="pdf-header">
    <div class="company-info">
      <h1>${escapeHtml(companyName)}</h1>
      ${address ? `<p>${address}</p>` : ""}
      ${gstin || phone ? `<p>${[gstin, phone].filter(Boolean).join(" | ")}</p>` : ""}
    </div>
    <div class="report-meta">
      <h2>${escapeHtml(heading)}</h2>
      <div class="period-badge">Period: ${escapeHtml(dateScopeText)}</div>
      <div class="print-date">Generated: ${escapeHtml(printTimestamp)}</div>
    </div>
  </header>

  ${kpiCards.length ? `
    <div class="kpi-grid">
      ${kpiCards.map((k) => `
        <div class="kpi-box ${escapeHtml(k.tone)}">
          <span>${escapeHtml(k.label)}</span>
          <strong>${escapeHtml(k.value)}</strong>
          ${k.note ? `<small>${escapeHtml(k.note)}</small>` : ""}
        </div>
      `).join("")}
    </div>
  ` : ""}

  ${tablesData.map(({ title, table }) => `
    <div class="table-section">
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ""}
      <table>
        <thead>
          <tr>
            ${Array.from(table.querySelectorAll("thead th")).map((th) => {
              const text = (th.textContent || "").trim();
              const isNum = /₹|%|tax|amount|total|balance|qty|rate|cost|price|debit|credit|gross|net|margin/i.test(text);
              return `<th class="${isNum ? "num" : ""}">${escapeHtml(text)}</th>`;
            }).join("")}
          </tr>
        </thead>
        <tbody>
          ${Array.from(table.querySelectorAll("tbody tr")).filter((tr) => !tr.closest(".hidden")).map((tr) => `
            <tr>
              ${Array.from(tr.querySelectorAll("td")).map((td, idx) => {
                const text = (td.textContent || "").trim();
                const th = table.querySelectorAll("thead th")[idx];
                const thText = th ? th.textContent : "";
                const isNum = /₹|%|tax|amount|total|balance|qty|rate|cost|price|debit|credit|gross|net|margin/i.test(thText);
                return `<td class="${isNum ? "num" : ""}">${escapeHtml(text)}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("")}

  <footer class="pdf-footer">
    <span>GI Billing Software | ${escapeHtml(companyName)}</span>
  </footer>
</body>
</html>`;

  const fileSafeHeading = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const defaultFilename = `${fileSafeHeading || "report"}-${stamp}.pdf`;

  if (window.giApp?.exportPdf) {
    try {
      const res = await window.giApp.exportPdf({ htmlContent, defaultFilename });
      if (res?.success) {
        showToast(`PDF exported: ${res.filePath.split(/[\\/]/).pop()}`);
      } else if (!res?.canceled) {
        showToast("PDF export was cancelled or failed.");
      }
    } catch (e) {
      showToast(`PDF export failed: ${e.message}`);
    }
  } else {
    window.print();
  }
}

function bindFeatureActions() {
  elements.featureView.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "appSettings" && button.dataset.settingsTarget) {
        showView("appSettings", button.dataset.settingsTarget);
        return;
      }
      showView(button.dataset.view);
    });
  });
  elements.featureView.querySelectorAll("[data-action='purchase']").forEach((button) => {
    button.addEventListener("click", () => openEntryModal("purchase"));
  });
  elements.featureView.querySelector("[data-action='create-expense']")?.addEventListener("click", () => {
    openExpenseModal();
  });
  const expenseSearchInput = elements.featureView.querySelector("[data-expense-search]");
  expenseSearchInput?.addEventListener("input", () => {
    expenseSearchQuery = expenseSearchInput.value.trim().toLowerCase();
    elements.featureView.innerHTML = expenseTemplate();
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("[data-expense-search]");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(expenseSearchQuery.length, expenseSearchQuery.length);
  });
  elements.featureView.querySelectorAll("[data-expense-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      expenseQuickFilter = button.dataset.expenseFilter || "all";
      elements.featureView.innerHTML = expenseTemplate();
      bindFeatureActions();
    });
  });
  elements.featureView.querySelectorAll("[data-expense-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      handleExpenseAction(button.dataset.expenseAction, button.dataset.expenseId);
    });
  });
  elements.featureView.querySelector("[data-action='import-purchase-pdf']")?.addEventListener("click", openPurchasePdfPicker);
  elements.featureView.querySelector("[data-action='choose-purchase-pdf']")?.addEventListener("click", openPurchasePdfPicker);
  elements.featureView.querySelector("[data-action='back-to-purchases']")?.addEventListener("click", () => showView("purchases"));
  elements.featureView.querySelector("[data-action='create-purchase-draft']")?.addEventListener("click", createPurchaseDraftFromImport);
  elements.featureView.querySelector("[data-action='add-import-row']")?.addEventListener("click", () => {
    const draft = collectPurchaseImportDraftFromReview();
    draft.items.push(importReviewEmptyRow());
    renderPurchasePdfImportReview(draft);
  });
  elements.featureView.querySelectorAll("[data-import-item-match]").forEach((select) => {
    select.addEventListener("change", () => syncImportMatchedItem(select));
  });
  elements.featureView.querySelectorAll("[data-action='sale']").forEach((button) => {
    button.addEventListener("click", () => openEntryModal("sale"));
  });
  elements.featureView.querySelectorAll("[data-action='create-estimate']").forEach((button) => {
    button.addEventListener("click", () => {
      openTransactionEditor(button.dataset.documentType || "estimate");
    });
  });
  elements.featureView.querySelectorAll("[data-action='estimate-placeholder']").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(button.dataset.estimateMessage || "Quotation action will be connected next.");
    });
  });
  elements.featureView.querySelectorAll("[data-estimate-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      handleEstimateAction(button.dataset.estimateAction, button.dataset.estimateId);
    });
  });
  const estimateSearchInput = elements.featureView.querySelector("[data-estimate-search]");
  estimateSearchInput?.addEventListener("input", () => {
    estimateSearchQuery = estimateSearchInput.value.trim().toLowerCase();
    elements.featureView.innerHTML = estimateTemplate();
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("[data-estimate-search]");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(estimateSearchQuery.length, estimateSearchQuery.length);
  });
  elements.featureView.querySelectorAll("[data-estimate-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      estimateQuickFilter = button.dataset.estimateFilter || "all";
      elements.featureView.innerHTML = estimateTemplate();
      bindFeatureActions();
    });
  });
  elements.featureView.querySelectorAll("[data-invoice-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      handleInvoiceListAction(button.dataset.invoiceAction, button.dataset.invoiceId);
    });
  });
  const invoiceSearchInput = elements.featureView.querySelector("[data-invoice-search]");
  invoiceSearchInput?.addEventListener("input", () => {
    const invoiceType = invoiceSearchInput.dataset.invoiceSearch;
    if (invoiceType === "purchase") {
      purchaseInvoiceSearchQuery = invoiceSearchInput.value.trim().toLowerCase();
    } else {
      saleInvoiceSearchQuery = invoiceSearchInput.value.trim().toLowerCase();
    }
    elements.featureView.innerHTML = invoiceWorkspaceTemplate(invoiceType);
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("[data-invoice-search]");
    const query = invoiceType === "purchase" ? purchaseInvoiceSearchQuery : saleInvoiceSearchQuery;
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(query.length, query.length);
  });
  elements.featureView.querySelectorAll("[data-invoice-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const invoiceType = button.dataset.invoiceFilter;
      const value = button.dataset.invoiceFilterValue || "all";
      if (invoiceType === "purchase") {
        purchaseInvoiceQuickFilter = value;
      } else {
        saleInvoiceQuickFilter = value;
      }
      elements.featureView.innerHTML = invoiceWorkspaceTemplate(invoiceType);
      bindFeatureActions();
    });
  });

  // ── Top Filter Bar (Vyapar-style) ─────────────────────────────────────────

  // Preset dropdown toggle
  elements.featureView.querySelectorAll("[data-top-filter-preset-btn]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const type = btn.dataset.topFilterPresetBtn;
      const dropdown = elements.featureView.querySelector(`#presetDropdown_${type}`);
      if (!dropdown) return;
      const isOpen = dropdown.style.display !== "none";
      // close all dropdowns first
      elements.featureView.querySelectorAll(".top-filter-preset-dropdown").forEach((d) => (d.style.display = "none"));
      dropdown.style.display = isOpen ? "none" : "block";
    });
  });

  // Preset option selected
  elements.featureView.querySelectorAll("[data-top-filter-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.topFilterPreset;
      const val = btn.dataset.presetValue;
      const targetFilter = type === "purchase" ? purchaseTopFilter : saleTopFilter;
      targetFilter.preset = val;
      if (val === "custom" && (!targetFilter.dateFrom || !targetFilter.dateTo)) {
        const currentRange = datePresetRange("thisMonth");
        targetFilter.dateFrom = targetFilter.dateFrom || currentRange.from;
        targetFilter.dateTo = targetFilter.dateTo || currentRange.to;
      }
      elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
      bindFeatureActions();
    });
  });

  // Custom date range inputs
  elements.featureView.querySelectorAll("[data-top-filter-date]").forEach((input) => {
    input.addEventListener("change", () => {
      const type = input.dataset.topFilterDate;
      const key = input.dataset.dateKey;
      if (type === "purchase") { purchaseTopFilter[key] = input.value; }
      else { saleTopFilter[key] = input.value; }
      elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
      bindFeatureActions();
    });
  });

  // Party select
  elements.featureView.querySelectorAll("[data-top-filter-party]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const type = sel.dataset.topFilterParty;
      if (type === "purchase") { purchaseTopFilter.party = sel.value; }
      else { saleTopFilter.party = sel.value; }
      elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
      bindFeatureActions();
    });
  });

  // Clear top filter
  elements.featureView.querySelectorAll("[data-top-filter-clear]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.topFilterClear;
      if (type === "purchase") { purchaseTopFilter = { preset: "thisMonth", dateFrom: "", dateTo: "", party: "" }; }
      else { saleTopFilter = { preset: "thisMonth", dateFrom: "", dateTo: "", party: "" }; }
      elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
      bindFeatureActions();
    });
  });

  // ── Column Filter Popovers ─────────────────────────────────────────────────

  elements.featureView.querySelectorAll("[data-col-filter-btn]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const col = btn.dataset.colFilterBtn;
      const type = btn.dataset.colFilterType;
      const colFilters = type === "purchase" ? purchaseColumnFilters : saleColumnFilters;
      const existing = colFilters[col] || {};

      // Remove any existing popover
      document.querySelectorAll(".col-filter-popover").forEach((p) => p.remove());

      const isNumeric = ["total", "received", "balance"].includes(col);
      const isDate = col === "date";

      const numericOptions = `
        <option value="eq" ${existing.category === "eq" ? "selected" : ""}>Equal To</option>
        <option value="lt" ${existing.category === "lt" ? "selected" : ""}>Less Than</option>
        <option value="gt" ${existing.category === "gt" ? "selected" : ""}>Greater Than</option>
        <option value="range" ${existing.category === "range" ? "selected" : ""}>Range</option>
      `;
      const textOptions = `
        <option value="contains" ${(!existing.category || existing.category === "contains") ? "selected" : ""}>Contains</option>
        <option value="exact" ${existing.category === "exact" ? "selected" : ""}>Exact Match</option>
      `;
      const dateOptions = `
        <option value="eq" ${existing.category === "eq" ? "selected" : ""}>Equal To</option>
        <option value="lt" ${existing.category === "lt" ? "selected" : ""}>Less Than</option>
        <option value="gt" ${existing.category === "gt" ? "selected" : ""}>Greater Than</option>
        <option value="range" ${existing.category === "range" ? "selected" : ""}>Range</option>
      `;

      const valueInput = isDate
        ? `<input type="date" class="col-filter-value" id="colFilterValue" value="${escapeHtml(existing.value || "")}">`
        : `<input type="${isNumeric ? "number" : "text"}" class="col-filter-value" id="colFilterValue" value="${escapeHtml(existing.value || "")}" placeholder="${isNumeric ? "Amount" : "Search text"}">`;
      const value2Input = `<div class="col-filter-value2-wrap" id="colFilterValue2Wrap" style="display:none"><span>To</span><input type="${isDate ? "date" : "number"}" class="col-filter-value" id="colFilterValue2" value="${escapeHtml(existing.value2 || "")}"></div>`;

      const colLabel = { date: "Date", invoiceNo: "Invoice No", party: "Party Name", paymentType: "Payment Type", total: "Total", received: "Received", balance: "Balance" }[col] || col;

      const popover = document.createElement("div");
      popover.className = "col-filter-popover";
      popover.innerHTML = `
        <div class="col-filter-popover-title">Filter: ${colLabel}</div>
        <label class="col-filter-label">Select Category
          <select class="col-filter-select" id="colFilterCategory">
            ${isNumeric ? numericOptions : isDate ? dateOptions : textOptions}
          </select>
        </label>
        <label class="col-filter-label">${isDate ? "Select Date" : isNumeric ? "Value (₹)" : colLabel}
          ${valueInput}
        </label>
        ${value2Input}
        <div class="col-filter-actions">
          <button class="col-filter-clear-btn" id="colFilterClear" type="button">Clear</button>
          <button class="col-filter-apply-btn" id="colFilterApply" type="button">Apply</button>
        </div>
      `;

      // Position under the clicked button
      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 6}px`;
      popover.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
      document.body.appendChild(popover);

      // Show/hide range second value
      const catSel = popover.querySelector("#colFilterCategory");
      const val2Wrap = popover.querySelector("#colFilterValue2Wrap");
      const toggleVal2 = () => { val2Wrap.style.display = catSel.value === "range" ? "flex" : "none"; };
      catSel.addEventListener("change", toggleVal2);
      toggleVal2();

      // Apply button
      popover.querySelector("#colFilterApply").addEventListener("click", () => {
        const cat = catSel.value;
        const val = popover.querySelector("#colFilterValue").value;
        const val2 = popover.querySelector("#colFilterValue2")?.value || "";
        if (type === "purchase") { purchaseColumnFilters[col] = { category: cat, value: val, value2: val2 }; }
        else { saleColumnFilters[col] = { category: cat, value: val, value2: val2 }; }
        popover.remove();
        elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
        bindFeatureActions();
      });

      // Clear button
      popover.querySelector("#colFilterClear").addEventListener("click", () => {
        if (type === "purchase") { delete purchaseColumnFilters[col]; }
        else { delete saleColumnFilters[col]; }
        popover.remove();
        elements.featureView.innerHTML = invoiceWorkspaceTemplate(type);
        bindFeatureActions();
      });
    });
  });

  // Close column filter popover when clicking outside
  document.addEventListener("click", () => {
    document.querySelectorAll(".col-filter-popover").forEach((p) => p.remove());
    elements.featureView.querySelectorAll(".top-filter-preset-dropdown").forEach((d) => (d.style.display = "none"));
  }, { once: true });



  // ── Party Filters ─────────────────────────────────────────────────────────
  elements.featureView.querySelectorAll("[data-party-balance-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      partyAdvancedFilter.balanceType = btn.dataset.partyBalanceFilter;
      const selectedId = elements.featureView.querySelector(".party-list-item.active")?.dataset.partyId;
      const activeTab = elements.featureView.querySelector(".party-tabs button.active")?.dataset.partyTab || "overview";
      elements.featureView.innerHTML = partiesTemplate(selectedId ? Number(selectedId) : null, activeTab, partySearchQuery);
      bindFeatureActions();
    });
  });

  const partyStateFilter = elements.featureView.querySelector("#partyStateFilter");
  partyStateFilter?.addEventListener("change", () => {
    partyAdvancedFilter.state = partyStateFilter.value;
    const selectedId = elements.featureView.querySelector(".party-list-item.active")?.dataset.partyId;
    const activeTab = elements.featureView.querySelector(".party-tabs button.active")?.dataset.partyTab || "overview";
    elements.featureView.innerHTML = partiesTemplate(selectedId ? Number(selectedId) : null, activeTab, partySearchQuery);
    bindFeatureActions();
  });

  elements.featureView.querySelector("#clearPartyFilters")?.addEventListener("click", () => {
    partyAdvancedFilter = { balanceType: "all", state: "" };
    elements.featureView.innerHTML = partiesTemplate(null, "overview", partySearchQuery);
    bindFeatureActions();
  });

  // ── Item Filters ──────────────────────────────────────────────────────────
  elements.featureView.querySelectorAll("[data-item-type-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      itemAdvancedFilter.itemType = btn.dataset.itemTypeFilter;
      const selectedId = elements.featureView.querySelector(".item-list-item.active")?.dataset.itemId;
      elements.featureView.innerHTML = itemsTemplate(selectedId ? Number(selectedId) : null, "overview", itemSearchQuery);
      bindFeatureActions();
    });
  });

  elements.featureView.querySelectorAll("[data-item-stock-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      itemAdvancedFilter.stockLevel = btn.dataset.itemStockFilter;
      const selectedId = elements.featureView.querySelector(".item-list-item.active")?.dataset.itemId;
      elements.featureView.innerHTML = itemsTemplate(selectedId ? Number(selectedId) : null, "overview", itemSearchQuery);
      bindFeatureActions();
    });
  });

  const itemCategoryFilter = elements.featureView.querySelector("#itemCategoryFilter");
  itemCategoryFilter?.addEventListener("change", () => {
    itemAdvancedFilter.category = itemCategoryFilter.value;
    const selectedId = elements.featureView.querySelector(".item-list-item.active")?.dataset.itemId;
    elements.featureView.innerHTML = itemsTemplate(selectedId ? Number(selectedId) : null, "overview", itemSearchQuery);
    bindFeatureActions();
  });

  elements.featureView.querySelector("#clearItemFilters")?.addEventListener("click", () => {
    itemAdvancedFilter = { category: "", itemType: "all", stockLevel: "all" };
    elements.featureView.innerHTML = itemsTemplate(null, "overview", itemSearchQuery);
    bindFeatureActions();
  });

  elements.featureView.querySelector("[data-action='create-credit-note']")?.addEventListener("click", () => {
    openTransactionEditor("saleReturn");
  });
  const creditNoteSearchInput = elements.featureView.querySelector("[data-credit-note-search]");
  creditNoteSearchInput?.addEventListener("input", () => {
    creditNoteSearchQuery = creditNoteSearchInput.value.trim().toLowerCase();
    elements.featureView.innerHTML = saleReturnTemplate();
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("[data-credit-note-search]");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(creditNoteSearchQuery.length, creditNoteSearchQuery.length);
  });
  elements.featureView.querySelectorAll("[data-credit-note-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      creditNoteQuickFilter = button.dataset.creditNoteFilter || "all";
      elements.featureView.innerHTML = saleReturnTemplate();
      bindFeatureActions();
    });
  });
  elements.featureView.querySelectorAll("[data-credit-note-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      handleCreditNoteAction(button.dataset.creditNoteAction, button.dataset.creditNoteId);
    });
  });

  elements.featureView.querySelector("[data-action='create-debit-note']")?.addEventListener("click", () => {
    openTransactionEditor("purchaseReturn");
  });
  const debitNoteSearchInput = elements.featureView.querySelector("[data-debit-note-search]");
  debitNoteSearchInput?.addEventListener("input", () => {
    debitNoteSearchQuery = debitNoteSearchInput.value.trim().toLowerCase();
    elements.featureView.innerHTML = purchaseReturnTemplate();
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("[data-debit-note-search]");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(debitNoteSearchQuery.length, debitNoteSearchQuery.length);
  });
  elements.featureView.querySelectorAll("[data-debit-note-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      debitNoteQuickFilter = button.dataset.debitNoteFilter || "all";
      elements.featureView.innerHTML = purchaseReturnTemplate();
      bindFeatureActions();
    });
  });
  elements.featureView.querySelectorAll("[data-debit-note-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      handleDebitNoteAction(button.dataset.debitNoteAction, button.dataset.debitNoteId);
    });
  });
  elements.featureView.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.featureView.innerHTML = settingsTemplate(button.dataset.settingsTab);
      bindFeatureActions();
    });
  });
  elements.featureView.querySelector("#businessSettingsForm")?.addEventListener("submit", handleBusinessSettingsSubmit);
  elements.featureView.querySelector("#customFieldCreateForm")?.addEventListener("submit", handleCustomFieldCreate);
  elements.featureView.querySelectorAll("[data-custom-field-toggle]").forEach((input) => {
    input.addEventListener("change", () => handleCustomFieldToggle(input.dataset.customFieldToggle, input.dataset.customFieldProp, input.checked));
  });
  elements.featureView.querySelectorAll("[data-custom-field-delete]").forEach((button) => {
    button.addEventListener("click", () => handleCustomFieldDelete(button.dataset.customFieldDelete));
  });
  elements.featureView.querySelectorAll("[data-action='add-bank']").forEach((button) => button.addEventListener("click", () => openBankAccountForm()));
  elements.featureView.querySelector("#bankAccountForm")?.addEventListener("submit", handleBankAccountSubmit);
  elements.featureView.querySelector("[data-action='cancel-bank']")?.addEventListener("click", () => {
    renderFeatureView("cash");
  });
  elements.featureView.querySelectorAll("[data-bank-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      handleBankAccountAction(button.dataset.bankAction, button.dataset.bankId);
    });
  });
  elements.featureView.querySelector("[data-action='backup-db']")?.addEventListener("click", async () => {
    const status = elements.featureView.querySelector("#backupStatus");
    if (!window.giDB?.createBackup) {
      if (status) status.textContent = "Backup is available only in the Electron app.";
      return;
    }
    if (status) status.textContent = "Choose where to save the SQLite backup...";
    try {
      const result = await window.giDB.createBackup();
      if (status) {
        status.textContent = result?.path
          ? `Backup saved: ${result.path}`
          : "Backup cancelled.";
      }
    } catch (err) {
      if (status) status.textContent = `Backup failed: ${err.message || "Unknown error"}`;
      showToast("Backup failed.");
    }
  });
  elements.featureView.querySelector("[data-action='restore-db']")?.addEventListener("click", async () => {
    const status = elements.featureView.querySelector("#backupStatus");
    if (!window.giDB?.restoreBackup) {
      if (status) status.textContent = "Restore is available only in the Electron app.";
      return;
    }
    if (status) status.textContent = "Select a backup file to restore...";
    try {
      const result = await window.giDB.restoreBackup();
      if (!result) {
        if (status) status.textContent = "Restore cancelled.";
        return;
      }
      if (result.state) {
        state = normalizeState(result.state);
        render();
        showToast("Database restored successfully.");
      }
      if (status) {
        status.textContent = `Restored successfully! Safety backup: ${result.safetyBackupPath || "created"}`;
      }
    } catch (err) {
      if (status) status.textContent = `Restore failed: ${err.message || "Unknown error"}`;
      showToast(`Restore failed: ${err.message || "Unknown error"}`);
    }
  });
  elements.featureView.querySelectorAll("[data-report-view]").forEach((button) => {
    button.addEventListener("click", () => {
      reportSearchQuery = "";
      elements.featureView.innerHTML = reportsTemplate(button.dataset.reportView);
      bindFeatureActions();
    });
  });
  const reportDatePreset = elements.featureView.querySelector("[data-report-date-preset]");
  const reportDateFrom = elements.featureView.querySelector("[data-report-date-from]");
  const reportDateTo = elements.featureView.querySelector("[data-report-date-to]");
  const rerenderReportForDate = () => {
    const activeReport = reportDatePreset?.dataset.reportDatePreset || "overview";
    reportDateFilter = {
      preset: reportDatePreset?.value || "all",
      from: reportDateFrom?.value || "",
      to: reportDateTo?.value || "",
    };
    elements.featureView.innerHTML = reportsTemplate(activeReport);
    bindFeatureActions();
  };
  reportDatePreset?.addEventListener("change", rerenderReportForDate);
  reportDateFrom?.addEventListener("change", rerenderReportForDate);
  reportDateTo?.addEventListener("change", rerenderReportForDate);
  const reportSearchInput = elements.featureView.querySelector("[data-report-search]");
  reportSearchInput?.addEventListener("input", () => {
    const activeReport = reportSearchInput.dataset.reportSearch || "overview";
    reportSearchQuery = reportSearchInput.value.trim().toLowerCase();
    elements.featureView.innerHTML = reportsTemplate(activeReport);
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("[data-report-search]");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(reportSearchQuery.length, reportSearchQuery.length);
  });
  elements.featureView.querySelectorAll("[data-report-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.reportTool === "print") {
        window.print();
        return;
      }
      if (button.dataset.reportTool === "export") {
        exportCurrentReportToCsv();
        return;
      }
      if (button.dataset.reportTool === "export-pdf") {
        exportCurrentReportToPdf();
        return;
      }
      showToast(button.dataset.reportMessage || "Export placeholder ready.");
    });
  });
  const reportPartyFilterSelect = elements.featureView.querySelector("[data-report-party-filter]");
  reportPartyFilterSelect?.addEventListener("change", () => {
    reportPartyFilter = reportPartyFilterSelect.value;
    const activeReport = reportPartyFilterSelect.dataset.reportPartyFilter || "overview";
    elements.featureView.innerHTML = reportsTemplate(activeReport);
    bindFeatureActions();
  });
  const reportCategoryFilterSelect = elements.featureView.querySelector("[data-report-category-filter]");
  reportCategoryFilterSelect?.addEventListener("change", () => {
    reportCategoryFilter = reportCategoryFilterSelect.value;
    const activeReport = reportCategoryFilterSelect.dataset.reportCategoryFilter || "overview";
    elements.featureView.innerHTML = reportsTemplate(activeReport);
    bindFeatureActions();
  });
  const reportResetFilterButton = elements.featureView.querySelector("[data-report-reset-filters]");
  reportResetFilterButton?.addEventListener("click", () => {
    const activeReport = reportResetFilterButton.dataset.reportResetFilters || "overview";
    reportSearchQuery = "";
    reportDateFilter = { preset: "all", from: "", to: "" };
    reportPartyFilter = "";
    reportCategoryFilter = "";
    elements.featureView.innerHTML = reportsTemplate(activeReport);
    bindFeatureActions();
  });
  elements.featureView.querySelectorAll("[data-party-id]:not([data-action='edit-party'])").forEach((button) => {
    button.addEventListener("click", () => {
      elements.featureView.innerHTML = partiesTemplate(Number(button.dataset.partyId), button.dataset.partyTab || "overview", partySearchQuery);
      bindFeatureActions();
    });
  });
  const partySearchInput = elements.featureView.querySelector("#partySearchInput");
  partySearchInput?.addEventListener("input", () => {
    const selectedId = elements.featureView.querySelector(".party-list-item.active")?.dataset.partyId;
    const activeTab = elements.featureView.querySelector(".party-tabs button.active")?.dataset.partyTab || "overview";
    partySearchQuery = partySearchInput.value;
    elements.searchInput.value = partySearchQuery;
    elements.featureView.innerHTML = partiesTemplate(selectedId ? Number(selectedId) : null, activeTab, partySearchQuery);
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("#partySearchInput");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(partySearchQuery.length, partySearchQuery.length);
  });
  elements.featureView.querySelector("[data-action='add-party']")?.addEventListener("click", () => openEntryModal("party"));
  elements.featureView.querySelector("[data-action='edit-party']")?.addEventListener("click", (event) => {
    const id = Number(event.currentTarget.dataset.partyId);
    const party = (state.parties || []).find((item) => Number(item.id) === id);
    if (party) openEntryModal("party", party);
  });
  elements.featureView.querySelectorAll("[data-item-id]:not([data-action='edit-item'])").forEach((button) => {
    button.addEventListener("click", () => {
      elements.featureView.innerHTML = itemsTemplate(Number(button.dataset.itemId), button.dataset.itemTab || "overview", itemSearchQuery);
      bindFeatureActions();
    });
  });
  const itemSearchInput = elements.featureView.querySelector("#itemSearchInput");
  itemSearchInput?.addEventListener("input", () => {
    const selectedId = elements.featureView.querySelector(".item-list-item.active")?.dataset.itemId;
    const activeTab = elements.featureView.querySelector(".item-tabs button.active")?.dataset.itemTab || "overview";
    itemSearchQuery = itemSearchInput.value;
    elements.searchInput.value = itemSearchQuery;
    elements.featureView.innerHTML = itemsTemplate(selectedId ? Number(selectedId) : null, activeTab, itemSearchQuery);
    bindFeatureActions();
    const nextSearchInput = elements.featureView.querySelector("#itemSearchInput");
    nextSearchInput?.focus();
    nextSearchInput?.setSelectionRange(itemSearchQuery.length, itemSearchQuery.length);
  });
  elements.featureView.querySelector("[data-action='add-item']")?.addEventListener("click", () => openEntryModal("item"));
  elements.featureView.querySelector("[data-action='edit-item']")?.addEventListener("click", (event) => {
    const id = Number(event.currentTarget.dataset.itemId);
    const item = (state.items || []).find((record) => Number(record.id) === id);
    if (item) openEntryModal("item", item);
  });
  elements.featureView.querySelector("[data-action='import-items']")?.addEventListener("click", () => showView("importItems"));
  elements.featureView.querySelector("[data-action='manage-item-masters']")?.addEventListener("click", () => {
    elements.featureView.innerHTML = itemMastersTemplate();
    bindMastersActions();
  });
  bindBarcodeGeneratorActions();
  elements.featureView.querySelector("[data-action='back-to-items']")?.addEventListener("click", () => {
    renderFeatureView("items");
  });
  bindPosActions();

  // Logo upload preview
  const logoInput = elements.featureView.querySelector("#logoFileInput");
  logoInput?.addEventListener("change", () => {
    const file = logoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let preview = elements.featureView.querySelector(".logo-preview-img");
      let placeholder = elements.featureView.querySelector(".logo-placeholder");
      if (!preview) {
        preview = document.createElement("img");
        preview.className = "logo-preview-img";
        preview.alt = "Business logo";
        placeholder?.replaceWith(preview);
      }
      preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  elements.featureView.querySelector("#removeLogoBtn")?.addEventListener("click", (e) => {
    e.currentTarget.dataset.removed = "true";
    const preview = elements.featureView.querySelector(".logo-preview-img");
    if (preview) {
      const placeholder = document.createElement("div");
      placeholder.className = "logo-placeholder";
      placeholder.textContent = "No logo uploaded";
      preview.replaceWith(placeholder);
    }
    const logoFileInput = elements.featureView.querySelector("#logoFileInput");
    if (logoFileInput) logoFileInput.value = "";
  });

  // CSV import wiring
  const csvFileInput = elements.featureView.querySelector("#csvFileInput");
  csvFileInput?.addEventListener("change", () => handleCsvFileSelected(csvFileInput));
  elements.featureView.querySelector("[data-action='csv-import-run']")?.addEventListener("click", runCsvImport);
  elements.featureView.querySelector("[data-action='csv-import-export-template']")?.addEventListener("click", () => exportCsvTemplate(elements.featureView.dataset.importType || "items"));

  // Payment-In create
  elements.featureView.querySelectorAll("[data-action='create-payment-in']").forEach((button) => button.addEventListener("click", () => openPaymentInModal()));
  elements.featureView.querySelectorAll("[data-action='create-payment-out']").forEach((button) => button.addEventListener("click", () => openPaymentOutModal()));
}

function modulePageTemplate(config) {
  const actions = config.actions || [];
  const metrics = config.metrics || [];
  const sections = config.sections || [];
  return `
    <section class="module-page">
      <header class="module-header">
        <div>
          <p class="muted-label">${escapeHtml(config.eyebrow || "Workspace")}</p>
          <h1>${escapeHtml(config.title)}</h1>
          <p>${escapeHtml(config.summary || "")}</p>
        </div>
        <div class="module-actions">
          ${actions.map((action) => moduleAction(action)).join("")}
        </div>
      </header>
      <section class="module-metrics">
        ${metrics.map((metric) => `
          <article>
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
            <p>${escapeHtml(metric.caption || "")}</p>
          </article>
        `).join("")}
      </section>
      <section class="module-section-grid">
        ${sections.map((section) => `
          <article class="module-section ${section.wide ? "wide" : ""}">
            <div class="module-section-head">
              <h2>${escapeHtml(section.title)}</h2>
              ${section.tag ? `<span>${escapeHtml(section.tag)}</span>` : ""}
            </div>
            <p>${escapeHtml(section.description || "")}</p>
            <ul>
              ${(section.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </article>
        `).join("")}
      </section>
    </section>
  `;
}

function moduleAction(action) {
  const classes = action.kind === "primary" ? "primary-button square" : "secondary-button";
  const attrs = [
    action.view ? `data-view="${escapeHtml(action.view)}"` : "",
    action.action ? `data-action="${escapeHtml(action.action)}"` : "",
  ].filter(Boolean).join(" ");
  return `<button class="${classes}" ${attrs} type="button">${escapeHtml(action.label)}</button>`;
}

function growTemplate() {
  return modulePageTemplate({
    eyebrow: "Growth",
    title: "Grow Your Business",
    summary: "Track what is selling, who owes money, and where follow-up can improve cash flow.",
    actions: [
      { label: "Open Reports", view: "reports", kind: "primary" },
      { label: "Review Parties", view: "parties" },
    ],
    metrics: [
      { label: "Receivable", value: formatCurrency(totalReceivable()), caption: "Amount to collect" },
      { label: "Payable", value: formatCurrency(totalPayable()), caption: "Amount to pay" },
      { label: "Parties", value: String((state.parties || []).length), caption: "Customer and supplier records" },
    ],
    sections: [
      { title: "Follow-up Queue", tag: "Daily", description: "Use receivable and overdue views to decide who needs a call or statement.", items: ["Check unpaid sale invoices", "Review payment terms before new credit sales", "Print party statement before follow-up"] },
      { title: "Sales Health", tag: "Reports", description: "Compare item sales, party balances, and profit movement before purchasing more stock.", items: ["Sale report", "Party ledger", "Stock summary"] },
    ],
  });
}

function setupBusinessTemplate() {
  return modulePageTemplate({
    eyebrow: "Utilities",
    title: "Set Up My Business",
    summary: "Keep firm details, tax defaults, numbering, and print settings in one setup checklist.",
    actions: [
      { label: "Open Settings", view: "appSettings", kind: "primary" },
      { label: "Backup First", view: "sync" },
    ],
    metrics: [
      { label: "Company", value: state.company?.name || "testt", caption: "Current firm" },
      { label: "Tax Type", value: "One-time", caption: "Country and tax setup" },
      { label: "Data", value: "SQLite", caption: "Local database" },
    ],
    sections: [
      { title: "Before Billing", description: "Complete these once before daily work starts.", items: ["Business name and phone", "Invoice numbering", "GST and place of supply defaults"] },
      { title: "Print Ready", description: "Make invoices consistent for customers and accountants.", items: ["Company header", "Regular printer template", "Thermal printer template"] },
    ],
  });
}

function accountantAccessTemplate() {
  return modulePageTemplate({
    eyebrow: "Utilities",
    title: "Accountant Access",
    summary: "Prepare clean reports and backups for accountant review without exposing unfinished screens.",
    actions: [
      { label: "Create Backup", view: "sync", kind: "primary" },
      { label: "Open Reports", view: "reports" },
    ],
    metrics: [
      { label: "Login", value: "Demo", caption: "OTP planned later" },
      { label: "Backup", value: "Manual", caption: "SQLite copy" },
      { label: "Audit Trail", value: "Planned", caption: "Review history" },
    ],
    sections: [
      { title: "Share Pack", description: "What the accountant usually needs first.", items: ["Profit and loss", "GST reports", "Party ledger", "SQLite backup"] },
      { title: "Review Notes", description: "Keep unresolved accounting questions visible before closing the period.", items: ["Unmatched purchase bills", "Missing GST rates", "Parties without phone numbers"] },
    ],
  });
}

function barcodeGeneratorTemplate() {
  const items = state.items || [];
  const labelItems = barcodeLabelItems(items);
  const visibleItems = barcodeFilteredItems(items);
  const selectedItem = visibleItems[0] || labelItems[0] || items[0] || null;
  const initialCode = barcodeValueForItem(selectedItem);
  const readyItems = items.filter((item) => barcodeValueForItem(item)).length;
  const noSkuItems = items.filter((item) => itemKind(item).label !== "Service" && !String(item.sku || "").trim()).length;
  const defaultConfig = barcodeDefaultConfig(selectedItem, initialCode);
  const visibleCaption = barcodeSearchQuery ? `${visibleItems.length} matching items` : `${labelItems.length || items.length} label items`;

  return `
    <section class="barcode-page">
      <header class="app-page-header barcode-titlebar">
        <div>
          <p class="muted-label">Inventory labels</p>
          <h1>Barcode Generator</h1>
          <small>${escapeHtml(visibleCaption)}</small>
        </div>
        <div class="title-actions">
          <button class="secondary-button" type="button" data-action="manage-item-masters">Units & Categories</button>
          <button class="secondary-button" type="button" data-view="items">Manage Items</button>
          <button class="primary-button square" type="button" data-action="print-barcodes">Print Labels</button>
        </div>
      </header>

      <section class="barcode-summary-row">
        <article><span>Total Items</span><strong>${items.length}</strong><p>Products and services</p></article>
        <article><span>Ready Codes</span><strong>${readyItems}</strong><p>SKU or generated code</p></article>
        <article><span>Missing SKU</span><strong>${noSkuItems}</strong><p>Products to clean up</p></article>
        <article><span>Label Copies</span><strong id="barcodeCopyMetric">${defaultConfig.copies}</strong><p>Current print sheet</p></article>
      </section>

      <div class="barcode-layout">
        <aside class="barcode-control-panel">
          <section class="barcode-panel-card">
            <div class="barcode-section-head">
              <h2>Item & Code</h2>
              <button class="link-button" type="button" data-action="edit-barcode-item" ${selectedItem ? "" : "disabled"}>Edit Item</button>
            </div>
            <label class="form-row">
              <span>Search item</span>
              <input id="barcodeItemSearch" class="form-input" value="${escapeHtml(barcodeSearchQuery)}" placeholder="Name, SKU, category">
            </label>
            <label class="form-row">
              <span>Item</span>
              <select id="barcodeItemSelect" class="form-input">
                ${barcodeItemOptions(visibleItems.length ? visibleItems : labelItems, selectedItem?.id)}
              </select>
            </label>
            <label class="form-row">
              <span>Barcode value</span>
              <input id="barcodeValueInput" class="form-input" value="${escapeHtml(initialCode)}" placeholder="SKU, serial, or item code">
              <small class="field-hint">Code 128 supports letters, numbers, and common symbols.</small>
            </label>
            <div class="barcode-inline-actions">
              <button class="secondary-button" type="button" data-action="use-selected-item-code">Use item SKU</button>
              <button class="secondary-button" type="button" data-action="copy-barcode-code">Copy Code</button>
            </div>
          </section>

          <section class="barcode-panel-card">
            <div class="barcode-section-head">
              <h2>Label Setup</h2>
              <span>Code 128</span>
            </div>
            <div class="barcode-form-grid">
              <label class="form-row">
                <span>Label size</span>
                <select id="barcodeSizeSelect" class="form-input">
                  <option value="small">38 x 25 mm</option>
                  <option value="medium" selected>50 x 25 mm</option>
                  <option value="large">70 x 35 mm</option>
                </select>
              </label>
              <label class="form-row">
                <span>Copies</span>
                <input id="barcodeCopiesInput" class="form-input" type="number" min="1" max="120" value="${defaultConfig.copies}">
              </label>
            </div>
            <div class="barcode-content-options">
              <label><input id="barcodeShowName" type="checkbox" checked> Item name</label>
              <label><input id="barcodeShowPrice" type="checkbox" checked> Sale price</label>
              <label><input id="barcodeShowSku" type="checkbox" checked> SKU/code text</label>
              <label><input id="barcodeShowHsn" type="checkbox"> HSN/SAC</label>
            </div>
          </section>
        </aside>

        <main class="barcode-preview-panel">
          <section class="barcode-panel-card barcode-live-preview">
            <div class="barcode-section-head">
              <div>
                <h2>Live Preview</h2>
                <p id="barcodePreviewMeta">${escapeHtml(barcodeMetaText(selectedItem, initialCode))}</p>
              </div>
              <button class="secondary-button" type="button" data-action="refresh-barcode-preview">Refresh</button>
            </div>
            <div id="barcodePreviewTarget" class="barcode-preview-target">
              ${barcodeLabelMarkup(selectedItem, defaultConfig)}
            </div>
          </section>

          <section class="barcode-panel-card barcode-sheet-card">
            <div class="barcode-section-head">
              <div>
                <h2>Print Sheet</h2>
                <p>Labels will print exactly from this grid.</p>
              </div>
              <span id="barcodeSheetMeta">${defaultConfig.copies} labels</span>
            </div>
            <div class="barcode-sheet-scroll">
              <div id="barcodeSheet" class="barcode-sheet">
                ${barcodeSheetMarkup(selectedItem, defaultConfig)}
              </div>
            </div>
          </section>
        </main>
      </div>
    </section>
  `;
}

function barcodeLabelItems(items = state.items || []) {
  const products = items.filter((item) => itemKind(item).label !== "Service");
  return products.length ? products : items;
}

function barcodeFilteredItems(items = state.items || []) {
  const query = String(barcodeSearchQuery || "").trim().toLowerCase();
  const labelItems = barcodeLabelItems(items);
  if (!query) return labelItems;
  return labelItems.filter((item) => [
    item.name,
    item.sku,
    item.hsnSac,
    item.category,
    item.unit,
    item.description,
  ].filter(Boolean).join(" ").toLowerCase().includes(query));
}

function barcodeDefaultConfig(item, code = "") {
  return {
    code: sanitizeBarcodeValue(code || barcodeValueForItem(item)),
    size: "medium",
    copies: 12,
    showName: true,
    showPrice: true,
    showSku: true,
    showHsn: false,
  };
}

function barcodeItemOptions(items, selectedId) {
  if (!items.length) return '<option value="">No matching items</option>';
  return items.map((item) => {
    const meta = [item.sku || "", item.unit || "", item.category || ""].filter(Boolean).join(" - ");
    const label = `${item.name}${meta ? ` (${meta})` : ""}`;
    return `<option value="${escapeHtml(String(item.id))}" ${Number(item.id) === Number(selectedId) ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function barcodeValueForItem(item) {
  if (!item) return "GI-0001";
  const existing = String(item.sku || item.itemCode || "").trim();
  if (existing) return sanitizeBarcodeValue(existing);
  const namePart = String(item.name || "ITEM").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "ITEM";
  const idPart = String(item.id || "").replace(/\D/g, "").slice(-4).padStart(4, "0");
  return sanitizeBarcodeValue(`GI-${namePart}-${idPart}`);
}

function sanitizeBarcodeValue(value) {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 48) || "GI-0001";
}

function findBarcodeItem(itemId) {
  return (state.items || []).find((item) => Number(item.id) === Number(itemId)) || null;
}

function barcodeMetaText(item, code) {
  if (!item) return `Custom code ${code || "GI-0001"}`;
  return [item.name, item.sku ? `SKU ${item.sku}` : "", item.unit ? `Unit ${item.unit}` : "", item.category].filter(Boolean).join(" - ");
}

function barcodeLabelMarkup(item, config) {
  const code = sanitizeBarcodeValue(config.code);
  const itemName = item?.name || "Custom Item";
  const size = ["small", "medium", "large"].includes(config.size) ? config.size : "medium";
  const salePrice = Number(item?.salePrice || 0);
  const hsn = item?.hsnSac || "";
  return `
    <article class="barcode-label barcode-label-${size}">
      ${config.showName ? `<strong>${escapeHtml(itemName)}</strong>` : ""}
      <div class="barcode-svg-wrap">${barcodeSvg(code)}</div>
      <div class="barcode-label-row">
        ${config.showSku ? `<span>${escapeHtml(code)}</span>` : "<span></span>"}
        ${config.showPrice ? `<b>${formatCurrency(salePrice)}</b>` : ""}
      </div>
      ${config.showHsn && hsn ? `<small>HSN/SAC ${escapeHtml(hsn)}</small>` : ""}
    </article>
  `;
}

function barcodeSheetMarkup(item, config) {
  const copies = Math.max(1, Math.min(120, Number(config.copies || 1)));
  return Array.from({ length: copies }, () => barcodeLabelMarkup(item, config)).join("");
}

function barcodeSvg(value) {
  const cleanValue = sanitizeBarcodeValue(value);
  const values = [104, ...cleanValue.split("").map((char) => char.charCodeAt(0) - 32)];
  const checksum = values.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  const encodedValues = [...values, checksum, 106];
  const quietZone = 10;
  const height = 46;
  let x = quietZone;
  let bars = "";

  encodedValues.forEach((code) => {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    pattern.split("").forEach((widthText, index) => {
      const width = Number(widthText);
      if (index % 2 === 0) {
        bars += `<rect x="${x}" y="0" width="${width}" height="${height}" rx="0"></rect>`;
      }
      x += width;
    });
  });

  const totalWidth = x + quietZone;
  return `<svg viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeHtml(cleanValue)}">${bars}</svg>`;
}

function bindBarcodeGeneratorActions() {
  const page = elements.featureView.querySelector(".barcode-page");
  if (!page) return;

  const itemSelect = page.querySelector("#barcodeItemSelect");
  const itemSearch = page.querySelector("#barcodeItemSearch");
  const codeInput = page.querySelector("#barcodeValueInput");
  const controls = [
    "#barcodeValueInput",
    "#barcodeSizeSelect",
    "#barcodeCopiesInput",
    "#barcodeShowName",
    "#barcodeShowPrice",
    "#barcodeShowSku",
    "#barcodeShowHsn",
  ];

  itemSearch?.addEventListener("input", () => {
    barcodeSearchQuery = itemSearch.value.trim().toLowerCase();
    updateBarcodeItemOptions(page);
  });

  itemSelect?.addEventListener("change", () => {
    const item = findBarcodeItem(itemSelect.value);
    if (codeInput) codeInput.value = barcodeValueForItem(item);
    page.querySelector("[data-action='edit-barcode-item']")?.toggleAttribute("disabled", !item);
    updateBarcodePreview(page);
  });

  controls.forEach((selector) => {
    page.querySelector(selector)?.addEventListener("input", () => updateBarcodePreview(page));
    page.querySelector(selector)?.addEventListener("change", () => updateBarcodePreview(page));
  });

  page.querySelector("[data-action='use-selected-item-code']")?.addEventListener("click", () => {
    const item = findBarcodeItem(itemSelect?.value);
    if (codeInput) codeInput.value = barcodeValueForItem(item);
    updateBarcodePreview(page);
  });

  page.querySelector("[data-action='copy-barcode-code']")?.addEventListener("click", async () => {
    const code = sanitizeBarcodeValue(codeInput?.value || "");
    try {
      await navigator.clipboard.writeText(code);
      showToast("Barcode Code Copied");
    } catch {
      showToast("Copy is not available here");
    }
  });

  page.querySelector("[data-action='refresh-barcode-preview']")?.addEventListener("click", () => {
    updateBarcodePreview(page);
    showToast("Barcode Preview Refreshed");
  });

  page.querySelector("[data-action='edit-barcode-item']")?.addEventListener("click", () => {
    const item = findBarcodeItem(itemSelect?.value);
    if (item) openEntryModal("item", item);
  });

  page.querySelector("[data-action='print-barcodes']")?.addEventListener("click", () => {
    updateBarcodePreview(page);
    document.body.classList.add("barcode-print-mode");
    window.addEventListener("afterprint", () => document.body.classList.remove("barcode-print-mode"), { once: true });
    window.print();
  });
}

function updateBarcodeItemOptions(page = elements.featureView.querySelector(".barcode-page")) {
  if (!page) return;
  const itemSelect = page.querySelector("#barcodeItemSelect");
  const codeInput = page.querySelector("#barcodeValueInput");
  if (!itemSelect) return;
  const previousValue = itemSelect.value;
  const items = barcodeFilteredItems();
  itemSelect.innerHTML = barcodeItemOptions(items, previousValue);
  if (items.some((item) => String(item.id) === String(previousValue))) {
    itemSelect.value = previousValue;
  } else if (items[0]) {
    itemSelect.value = String(items[0].id);
    if (codeInput) codeInput.value = barcodeValueForItem(items[0]);
  } else {
    itemSelect.value = "";
    if (codeInput) codeInput.value = barcodeValueForItem(null);
  }
  page.querySelector("[data-action='edit-barcode-item']")?.toggleAttribute("disabled", !findBarcodeItem(itemSelect.value));
  const titlebarCount = page.querySelector(".barcode-titlebar small");
  if (titlebarCount) {
    titlebarCount.textContent = barcodeSearchQuery
      ? `${items.length} matching items`
      : `${barcodeLabelItems().length} label items`;
  }
  updateBarcodePreview(page);
}

function readBarcodeConfig(page) {
  return {
    code: sanitizeBarcodeValue(page.querySelector("#barcodeValueInput")?.value || ""),
    size: page.querySelector("#barcodeSizeSelect")?.value || "medium",
    copies: Math.max(1, Math.min(120, Number(page.querySelector("#barcodeCopiesInput")?.value || 1))),
    showName: page.querySelector("#barcodeShowName")?.checked ?? true,
    showPrice: page.querySelector("#barcodeShowPrice")?.checked ?? true,
    showSku: page.querySelector("#barcodeShowSku")?.checked ?? true,
    showHsn: page.querySelector("#barcodeShowHsn")?.checked ?? false,
  };
}

function updateBarcodePreview(page = elements.featureView.querySelector(".barcode-page")) {
  if (!page) return;
  const item = findBarcodeItem(page.querySelector("#barcodeItemSelect")?.value);
  const config = readBarcodeConfig(page);
  const codeInput = page.querySelector("#barcodeValueInput");
  const copiesInput = page.querySelector("#barcodeCopiesInput");
  if (codeInput && codeInput.value !== config.code) codeInput.value = config.code;
  if (copiesInput && Number(copiesInput.value || 0) !== config.copies) copiesInput.value = config.copies;

  const preview = page.querySelector("#barcodePreviewTarget");
  const sheet = page.querySelector("#barcodeSheet");
  if (preview) preview.innerHTML = barcodeLabelMarkup(item, config);
  if (sheet) sheet.innerHTML = barcodeSheetMarkup(item, config);
  const copyMetric = page.querySelector("#barcodeCopyMetric");
  const sheetMeta = page.querySelector("#barcodeSheetMeta");
  const previewMeta = page.querySelector("#barcodePreviewMeta");
  if (copyMetric) copyMetric.textContent = String(config.copies);
  if (sheetMeta) sheetMeta.textContent = `${config.copies} label${config.copies === 1 ? "" : "s"}`;
  if (previewMeta) previewMeta.textContent = barcodeMetaText(item, config.code);
}

function exportItemsTemplate() {
  const stockQty = (state.items || []).reduce((sum, item) => sum + Number(item.currentStock || 0), 0);
  const stockValue = (state.items || []).reduce((sum, item) => sum + Number(item.currentStock || 0) * Number(item.purchasePrice || 0), 0);
  return modulePageTemplate({
    eyebrow: "Utilities",
    title: "Export Items",
    summary: "Prepare item data for Excel, accountant review, or migration.",
    actions: [
      { label: "Manage Items", view: "items", kind: "primary" },
      { label: "Backup First", view: "sync" },
    ],
    metrics: [
      { label: "Items", value: String((state.items || []).length), caption: "Total records" },
      { label: "Stock Qty", value: String(stockQty), caption: "Current quantity" },
      { label: "Stock Value", value: formatCurrency(stockValue), caption: "Purchase value" },
    ],
    sections: [
      { title: "Export Columns", description: "Keep the export useful for both inventory and accounting.", items: ["Item name, SKU, category", "Unit and stock quantity", "Purchase and sale price", "Tax and HSN/SAC"] },
      { title: "Data Hygiene", description: "Review masters before exporting.", items: ["Merge duplicate categories", "Fix missing units", "Check stock balances"] },
    ],
  });
}

function verifyDataTemplate() {
  const missingPartyPhone = (state.parties || []).filter((party) => !party.phone).length;
  const missingItemUnit = (state.items || []).filter((item) => !item.unit).length;
  return modulePageTemplate({
    eyebrow: "Utilities",
    title: "Verify My Data",
    summary: "Run a practical checklist before billing, importing purchase PDFs, or taking a backup.",
    actions: [
      { label: "Open Items", view: "items", kind: "primary" },
      { label: "Open Parties", view: "parties" },
    ],
    metrics: [
      { label: "Parties Missing Phone", value: String(missingPartyPhone), caption: "Affects billing lookup" },
      { label: "Items Missing Unit", value: String(missingItemUnit), caption: "Affects invoices" },
      { label: "Invoices", value: String((state.invoices || []).length), caption: "Saved transactions" },
    ],
    sections: [
      { title: "Billing Readiness", description: "These checks prevent wrong invoice entries.", items: ["Every billed party exists in Parties", "Every billed item exists in Items", "Units and tax rates are available"] },
      { title: "Backup Readiness", description: "Run this before imports or major edits.", items: ["Create SQLite backup", "Review unmatched purchase PDF rows", "Check duplicate names"] },
    ],
  });
}

function purchaseOrderTemplate() {
  return modulePageTemplate({
    eyebrow: "Purchase",
    title: "Purchase Order",
    summary: "Plan orders before creating purchase bills, especially when stock has to be approved first.",
    actions: [
      { label: "Add Purchase Bill", action: "purchase", kind: "primary" },
    ],
    metrics: [
      { label: "Open Orders", value: "0", caption: "Awaiting supplier" },
      { label: "Converted", value: "0", caption: "Billed orders" },
      { label: "Parties", value: String((state.parties || []).length), caption: "Supplier records" },
    ],
    sections: [
      { title: "Order Flow", description: "A good purchase flow separates request, order, bill, and payment.", items: ["Prepare order items", "Confirm supplier and price", "Convert to purchase bill"] },
      { title: "Controls", description: "Useful controls for the next implementation step.", items: ["Approval status", "Expected delivery date", "Supplier reference number"] },
    ],
  });
}

function purchaseReturnTemplate() {
  const allRows = (state.debitNotes || []).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  const searchedRows = debitNoteSearchQuery ? allRows.filter((note) => debitNoteMatchesSearch(note, debitNoteSearchQuery)) : allRows;
  const rows = searchedRows.filter((note) => debitNoteQuickFilterMatches(note, debitNoteQuickFilter));
  const total = rows.reduce((sum, note) => sum + debitNoteTotalValue(note), 0);
  const adjusted = rows.reduce((sum, note) => sum + Number(note.adjusted || 0), 0);
  const openBalance = rows.reduce((sum, note) => sum + Number(note.balance || 0), 0);
  const taxTotal = rows.reduce((sum, note) => sum + debitNoteTaxValue(note), 0);
  const emptyTitle = debitNoteSearchQuery || debitNoteQuickFilter !== "all" ? "No matching debit notes" : "No purchase returns yet";
  const emptyCopy = debitNoteSearchQuery || debitNoteQuickFilter !== "all"
    ? "Try a different debit note number, supplier, original bill, GST type, or status."
    : "Create a debit note when goods are returned to a supplier, purchase bill value is reduced, or a refund is due.";

  return `
    <section class="credit-note-workspace debit-note-workspace">
      <header class="app-page-header invoice-page-header credit-note-header">
        <div>
          <p class="muted-label">Purchases</p>
          <h1>Purchase Return / Debit Note</h1>
          <small>${rows.length} of ${allRows.length} records shown</small>
        </div>
        <div class="invoice-header-actions">
          <button class="secondary-button compact-button" data-view="purchases" type="button">Purchase Bills</button>
          <button class="purchase-button" data-action="create-debit-note" type="button">+ Add Debit Note</button>
        </div>
      </header>

      <section class="app-toolbar">
        <label class="toolbar-search">
          <span>Search</span>
          <input data-debit-note-search type="search" value="${escapeHtml(debitNoteSearchQuery)}" placeholder="Debit note, supplier, bill, item, status">
        </label>
        <div class="invoice-quick-filters" role="group" aria-label="Debit note filters">
          ${debitNoteQuickFilterButtons()}
        </div>
      </section>

      <section class="kpi-grid invoice-kpis">
        ${kpiCard("Return Value", formatCurrency(total), "Debit note total for selected view", "neutral")}
        ${kpiCard("Adjusted / Refunded", formatCurrency(adjusted), "Value already adjusted or refunded", "success")}
        ${kpiCard("Open Debit", formatCurrency(openBalance), "Still available to adjust against supplier", openBalance > 0 ? "danger" : "success")}
        ${kpiCard("GST Reversal", formatCurrency(taxTotal), "Input tax reduction", "info")}
      </section>

      <section class="data-table-card invoice-data-card credit-note-data-card">
        ${rows.length ? debitNoteRowsTable(rows) : emptyWorkspace(emptyTitle, emptyCopy)}
      </section>
    </section>
  `;
}

function debitNoteQuickFilterButtons() {
  const filters = [
    ["all", "All"],
    ["open", "Open"],
    ["partial", "Part Adjusted"],
    ["adjusted", "Adjusted"],
    ["cancelled", "Cancelled"],
    ["b2b", "B2B"],
    ["b2c", "B2C"],
  ];
  return filters.map(([value, label]) => `
    <button class="${debitNoteQuickFilter === value ? "active" : ""}" data-debit-note-filter="${value}" type="button">${label}</button>
  `).join("");
}

function debitNoteRowsTable(rows) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Debit Note</th>
          <th>Original Bill</th>
          <th>Supplier</th>
          <th>GST Type</th>
          <th>Taxable</th>
          <th>Tax</th>
          <th>Total</th>
          <th>Open Debit</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((note) => `
          <tr>
            <td>${formatDate(note.date)}</td>
            <td><strong class="invoice-no-cell">${escapeHtml(note.debitNo || "-")}</strong><small>${escapeHtml(debitNoteItemSummary(note.id))}</small></td>
            <td><strong>${escapeHtml(note.originalInvoiceNo || "-")}</strong><small>${escapeHtml(note.reason || "Purchase return")}</small></td>
            <td><strong>${escapeHtml(note.party || "-")}</strong><small>${escapeHtml(note.phone || "")}</small></td>
            <td><span class="gst-type-badge ${debitNoteSupplyType(note)}">${debitNoteTaxTypeLabel(note)}</span></td>
            <td class="amount-cell">${formatCurrency(debitNoteTaxableValue(note))}</td>
            <td class="amount-cell">${formatCurrency(debitNoteTaxValue(note))}</td>
            <td class="amount-cell strong">${formatCurrency(debitNoteTotalValue(note))}</td>
            <td class="amount-cell ${Number(note.balance || 0) > 0 ? "danger" : ""}">${formatCurrency(note.balance || 0)}</td>
            <td>${debitNoteStatusBadge(note)}</td>
            <td>${debitNoteRowActions(note)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function debitNoteRowActions(note) {
  const id = escapeHtml(note.id || "");
  const actions = [
    ["viewEdit", "View/Edit"],
    ["preview", "Preview"],
    ["print", "Print"],
    ["duplicate", "Duplicate"],
    ["openInvoice", "Open Original Bill"],
    ["cancel", "Cancel Debit Note"],
    ["delete", "Delete"],
  ];
  return `
    <div class="invoice-row-actions credit-note-row-actions">
      <details>
        <summary aria-label="Debit note actions">More</summary>
        <div>
          ${actions.map(([action, label]) => `<button data-debit-note-action="${action}" data-debit-note-id="${id}" type="button">${label}</button>`).join("")}
        </div>
      </details>
    </div>
  `;
}

function debitNoteItemsFor(note) {
  const noteId = note?.id || note?.debitNoteId;
  if (!noteId) return [];
  return (state.debitNoteItems || [])
    .filter((line) => String(line.debitNoteId) === String(noteId))
    .sort((a, b) => Number(a.lineNo || 0) - Number(b.lineNo || 0));
}

function debitNoteItemSummary(noteId) {
  const items = debitNoteItemsFor({ id: noteId });
  if (!items.length) return "";
  return items.length === 1 ? items[0].item || "" : `${items.length} returned items`;
}

function debitNoteMatchesSearch(note, query) {
  const text = [
    note.debitNo,
    note.originalInvoiceNo,
    note.party,
    note.phone,
    note.status,
    debitNoteTaxTypeLabel(note),
    debitNoteTotalValue(note),
    debitNoteTaxValue(note),
    ...debitNoteItemsFor(note).map((item) => [item.item, item.description, item.hsnSac].join(" ")),
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes(String(query || "").toLowerCase());
}

function debitNoteQuickFilterMatches(note, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "b2b" || filter === "b2c") return debitNoteSupplyType(note) === filter;
  return debitNoteStatus(note) === filter;
}

function debitNoteStatus(note) {
  const raw = String(note.status || "").toLowerCase();
  if (["open", "partial", "adjusted", "cancelled"].includes(raw)) return raw;
  if (String(raw) === "paid") return "adjusted";
  if (Number(note.balance || 0) <= 0) return "adjusted";
  if (Number(note.adjusted || 0) > 0) return "partial";
  return "open";
}

function debitNoteStatusBadge(note) {
  const status = debitNoteStatus(note);
  const label = {
    open: "Open",
    partial: "Part Adjusted",
    adjusted: "Adjusted",
    cancelled: "Cancelled",
  }[status] || "Open";
  return `<span class="invoice-status debit-note-status ${status}">${label}</span>`;
}

function debitNoteSupplyType(note) {
  const supply = String(note.supplyType || "").toLowerCase();
  if (supply === "b2b" || supply === "b2c") return supply;
  return note.partyGstin ? "b2b" : "b2c";
}

function debitNoteTaxTypeLabel(note) {
  return debitNoteSupplyType(note).toUpperCase();
}

function debitNoteTotalValue(note) {
  return Number(note.total || note.amount || 0);
}

function debitNoteTaxableValue(note) {
  if (note.subtotal !== undefined && note.subtotal !== null) return Number(note.subtotal || 0);
  return Math.max(0, debitNoteTotalValue(note) - debitNoteTaxValue(note));
}

function debitNoteTaxValue(note) {
  if (note.taxTotal !== undefined && note.taxTotal !== null) return Number(note.taxTotal || 0);
  return Number(note.cgstTotal || 0) + Number(note.sgstTotal || 0) + Number(note.igstTotal || 0);
}

function findDebitNoteRecord(id) {
  const cleanId = String(id || "");
  return (state.debitNotes || []).find((note) => String(note.id) === cleanId) || null;
}

function debitNoteDraftFromRecord(note, options = {}) {
  const lines = debitNoteItemsFor(note);
  return {
    party: note.party || "",
    phone: note.phone || "",
    billingAddress: note.billingAddress || "",
    invoiceNo: options.clearNumber ? "" : (note.debitNo || ""),
    originalInvoiceId: options.clearOriginal ? "" : (note.originalInvoiceId || ""),
    originalInvoiceNo: options.clearOriginal ? "" : (note.originalInvoiceNo || ""),
    invoiceDate: note.date || new Date().toISOString(),
    dueDate: note.refundDate || note.date || new Date().toISOString(),
    paymentTerms: note.paymentTerms || "Due on receipt",
    paymentType: "return",
    paymentMethod: note.paymentMethod || "Adjustment",
    received: Number(note.adjusted || 0),
    state: note.placeOfSupply || "",
    supplyType: note.supplyType || (note.partyGstin ? "b2b" : "b2c"),
    partyGstin: note.partyGstin || "",
    invoiceDescription: note.notes || "",
    customFields: note.meta?.customFields || {},
    items: lines.map((line) => ({
      item: line.item || "",
      itemId: line.itemId || "",
      description: line.description || "",
      qty: line.qty || "",
      unit: line.unit || "",
      price: line.price || "",
      discount: line.discount || 0,
      taxRate: line.taxRate || 0,
      hsnSac: line.hsnSac || "",
    })),
  };
}

function debitNotePreviewDataFromRecord(note, overrides = {}) {
  const business = state.businessSettings || defaultBusinessSettings();
  const party = findPartyByName(note.party) || {
    name: note.party,
    phone: note.phone,
    gstin: note.partyGstin,
    billingAddress: note.billingAddress,
  };
  const rows = debitNoteItemsFor(note).map((line, index) => ({
    index: index + 1,
    item: line.item || "",
    description: line.description || "",
    hsnSac: line.hsnSac || "",
    qty: Number(line.qty || 0),
    unit: line.unit || "",
    price: Number(line.price || 0),
    discount: Number(line.discount || 0),
    taxRate: Number(line.taxRate || 0),
    tax: Number(line.taxAmount || 0),
    total: Number(line.lineTotal || 0),
  }));
  return {
    editorType: "purchaseReturn",
    previewTitle: "Debit Note Preview",
    documentTitle: "Debit Note",
    business,
    party,
    rows,
    invoiceNo: note.debitNo || "-",
    date: note.date || "",
    address: note.billingAddress || party?.billingAddress || "",
    placeOfSupply: note.placeOfSupply || "",
    customFields: customFieldsForModule("purchaseReturn").map((field) => ({
      ...field,
      value: customFieldValue(field, note.meta?.customFields || {}),
    })).filter((field) => field.showOnPrint && (field.fieldType === "checkbox" ? field.value : String(field.value || "").trim())),
    description: [note.originalInvoiceNo ? `Against purchase bill ${note.originalInvoiceNo}` : "", note.notes || ""].filter(Boolean).join("\n"),
    attachments: [],
    subtotal: Number(note.subtotal ?? debitNoteTaxableValue(note)),
    discount: Number(note.discountTotal || 0),
    cgst: Number(note.cgstTotal || 0),
    sgst: Number(note.sgstTotal || 0),
    igst: Number(note.igstTotal || 0),
    total: debitNoteTotalValue(note),
    ...overrides,
  };
}

function openDebitNoteEditorFromInvoice(invoice) {
  if (!invoice || invoice.type !== "purchase") {
    showToast("Debit notes can be created only from purchase bills.");
    return;
  }
  openTransactionEditor("purchaseReturn", {
    draft: {
      ...invoiceDraftFromRecord(invoice, { clearNumber: true }),
      originalInvoiceId: invoice.id || invoice.invoiceId || "",
      originalInvoiceNo: invoice.invoiceNo || "",
      invoiceDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      paymentType: "return",
      paymentMethod: "Adjustment",
      received: invoiceBalanceValue(invoice) > 0 ? Math.min(invoiceBalanceValue(invoice), invoiceTotalValue(invoice)) : invoiceTotalValue(invoice),
      invoiceDescription: `Purchase return against bill ${invoice.invoiceNo || ""}`,
    },
  });
}

async function handleDebitNoteAction(action, debitNoteId) {
  const note = findDebitNoteRecord(debitNoteId);
  if (!note) {
    showToast("Debit note not found.");
    return;
  }

  if (action === "viewEdit" || action === "edit") {
    openTransactionEditor("purchaseReturn", {
      editInvoiceId: note.id,
      draft: debitNoteDraftFromRecord(note),
    });
    return;
  }
  if (action === "preview" || action === "view") {
    openInvoicePreviewModal(debitNotePreviewDataFromRecord(note));
    return;
  }
  if (action === "print") {
    openInvoicePreviewModal(debitNotePreviewDataFromRecord(note));
    setTimeout(() => window.print(), 120);
    return;
  }
  if (action === "duplicate") {
    openTransactionEditor("purchaseReturn", {
      draft: debitNoteDraftFromRecord(note, { clearNumber: true }),
    });
    return;
  }
  if (action === "openInvoice") {
    const invoice = findInvoiceRecord(note.originalInvoiceId) || findInvoiceByNumber(note.originalInvoiceNo);
    if (invoice) {
      openTransactionEditor("purchase", {
        editInvoiceId: invoice.id || invoice.invoiceId,
        draft: invoiceDraftFromRecord(invoice),
      });
    } else {
      showToast("Original purchase bill not found.");
    }
    return;
  }
  if (action === "cancel") {
    await cancelDebitNoteRecord(note);
    return;
  }
  if (action === "delete") {
    await deleteDebitNoteRecord(note);
  }
}

async function cancelDebitNoteRecord(note) {
  if (debitNoteStatus(note) === "cancelled") {
    showToast("Debit note is already cancelled.");
    return;
  }
  if (!confirm(`Cancel ${note.debitNo || "this debit note"}? Stock and ledger adjustments will be reversed.`)) return;
  try {
    const notes = `Cancelled on ${new Date().toLocaleString()}`;
    if (window.giDB?.setDebitNoteStatus) {
      state = normalizeState(await window.giDB.setDebitNoteStatus({ debitNoteId: note.id, status: "cancelled", notes }));
    } else {
      const target = findDebitNoteRecord(note.id);
      if (target) {
        target.status = "cancelled";
        target.notes = [target.notes, notes].filter(Boolean).join("\n");
      }
      state.stockMovements = (state.stockMovements || []).filter((movement) => String(movement.debitNoteId) !== String(note.id));
      saveState();
    }
    renderDashboard();
    renderFeatureView("purchaseReturn");
    showToast("Debit Note Cancelled");
  } catch (error) {
    showToast(error.message || "Unable to cancel debit note.");
  }
}

async function deleteDebitNoteRecord(note) {
  if (!confirm(`Delete ${note.debitNo || "this debit note"} permanently? This removes stock and accounting movements.`)) return;
  try {
    if (window.giDB?.deleteDebitNote) {
      state = normalizeState(await window.giDB.deleteDebitNote({ debitNoteId: note.id }));
    } else {
      state.debitNotes = (state.debitNotes || []).filter((row) => String(row.id) !== String(note.id));
      state.debitNoteItems = (state.debitNoteItems || []).filter((row) => String(row.debitNoteId) !== String(note.id));
      state.stockMovements = (state.stockMovements || []).filter((movement) => String(movement.debitNoteId) !== String(note.id));
      saveState();
    }
    renderDashboard();
    renderFeatureView("purchaseReturn");
    showToast("Debit Note Deleted");
  } catch (error) {
    showToast(error.message || "Unable to delete debit note.");
  }
}

function createLocalDebitNote(transaction) {
  const debitNoteId = transaction.debitNoteId || transaction.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const items = debitNoteItemsFromTransaction(debitNoteId, transaction.items || []);
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const discountTotal = items.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  const taxTotal = items.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
  const total = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const adjusted = Math.min(Math.max(0, Number(transaction.received || 0)), total);
  const note = {
    id: debitNoteId,
    debitNo: transaction.invoiceNo || `DN-${String((state.debitNotes || []).length + 1).padStart(4, "0")}`,
    originalInvoiceId: transaction.originalInvoiceId || "",
    originalInvoiceNo: transaction.originalInvoiceNo || "",
    party: transaction.party,
    phone: transaction.phone || "",
    billingAddress: transaction.billingAddress || "",
    date: transaction.date || new Date().toISOString(),
    refundDate: transaction.dueDate || "",
    paymentTerms: transaction.paymentTerms || "",
    paymentMethod: transaction.paymentMethod || "Adjustment",
    supplyType: transaction.supplyType || "b2b",
    placeOfSupply: transaction.placeOfSupply || "",
    partyGstin: transaction.partyGstin || "",
    partyTaxType: transaction.partyTaxType || "registered",
    subtotal,
    discountTotal,
    taxTotal,
    cgstTotal: items.reduce((sum, item) => sum + Number(item.cgstAmount || 0), 0),
    sgstTotal: items.reduce((sum, item) => sum + Number(item.sgstAmount || 0), 0),
    igstTotal: items.reduce((sum, item) => sum + Number(item.igstAmount || 0), 0),
    total,
    adjusted,
    balance: Math.max(0, total - adjusted),
    status: total - adjusted <= 0 ? "adjusted" : adjusted > 0 ? "partial" : "open",
    reason: "",
    notes: transaction.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.debitNotes = [note, ...(state.debitNotes || [])];
  state.debitNoteItems = [...items, ...(state.debitNoteItems || [])];
  const physicalItems = items.filter((item) => {
    const isService = String(item.itemType || "").toLowerCase() === "service" ||
      (state.items || []).find((p) => String(p.id) === String(item.itemId) && String(p.itemType).toLowerCase() === "service");
    return !isService;
  });
  state.stockMovements = [
    ...physicalItems.map((item) => ({
      id: `${debitNoteId}-stock-${item.lineNo}`,
      debitNoteId,
      itemId: item.itemId,
      item: item.item,
      movementType: "out",
      quantity: item.qty,
      unit: item.unit,
      rate: item.price,
      movementDate: note.date,
      notes: `${note.debitNo} purchase return stock out`,
      createdAt: note.createdAt,
    })),
    ...(state.stockMovements || []),
  ];
  saveState();
}

function updateLocalDebitNote(transaction) {
  const debitNoteId = transaction.debitNoteId || transaction.invoiceId;
  if (!debitNoteId) return createLocalDebitNote(transaction);
  state.debitNotes = (state.debitNotes || []).filter((note) => String(note.id) !== String(debitNoteId));
  state.debitNoteItems = (state.debitNoteItems || []).filter((item) => String(item.debitNoteId) !== String(debitNoteId));
  state.stockMovements = (state.stockMovements || []).filter((movement) => String(movement.debitNoteId) !== String(debitNoteId));
  createLocalDebitNote({ ...transaction, debitNoteId, id: debitNoteId });
}

function debitNoteItemsFromTransaction(debitNoteId, rows) {
  const taxSplitMode = editorTaxSplitMode();
  return rows.map((item, index) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const discount = Number(item.discount || 0);
    const taxRate = Number(item.taxRate || 0);
    const taxableValue = Math.max(0, qty * price - discount);
    const taxAmount = taxableValue * taxRate / 100;
    const split = taxSplitMode === "igst"
      ? { cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount }
      : { cgstAmount: taxAmount / 2, sgstAmount: taxAmount / 2, igstAmount: 0 };
    return {
      id: `${debitNoteId}-${index + 1}`,
      debitNoteId,
      lineNo: index + 1,
      item: item.item,
      itemId: item.itemId,
      description: item.description,
      qty,
      unit: item.unit,
      price,
      discount,
      hsnSac: item.hsnSac,
      taxableValue,
      taxRate,
      taxAmount,
      ...split,
      lineTotal: taxableValue + taxAmount,
    };
  });
}

function legacyExpenseTemplate() {
  return modulePageTemplate({
    eyebrow: "Purchase & Expense",
    title: "Expenses",
    summary: "Record operating costs separately from purchase bills so profit reports stay clean.",
    actions: [
      { label: "Add Expense", kind: "primary" },
      { label: "Open Reports", view: "reports" },
    ],
    metrics: [
      { label: "This Month", value: formatCurrency(0), caption: "Expense total" },
      { label: "Unpaid", value: formatCurrency(0), caption: "Expense payable" },
      { label: "Categories", value: "0", caption: "Expense groups" },
    ],
    sections: [
      { title: "Expense Capture", description: "Use this for rent, fuel, salary, repairs, and other non-stock costs.", items: ["Choose expense category", "Add payment method", "Attach receipt image or PDF"] },
      { title: "Accounting Impact", description: "Expenses feed profit reports without changing item stock.", items: ["Profit and loss", "Cash and bank", "GST input where applicable"] },
    ],
  });
  return `
    <section class="feature-page">
      <div class="feature-empty-card">
        <div class="wallet-art"></div>
        <strong>Add your 1st Expense</strong>
        <p>Record your business expenses & know your real profits.</p>
        <button class="red-wide-button" type="button">⊕ Add Expenses</button>
      </div>
    </section>
  `;
}

function expenseTemplate() {
  const allRows = expenseRows();
  const filteredRows = allRows
    .filter((row) => expenseMatchesSearch(row, expenseSearchQuery))
    .filter((row) => expenseQuickFilterMatches(row, expenseQuickFilter));
  const thisMonthRows = filteredRows.filter(isCurrentMonthRecord);
  const total = filteredRows.reduce((sum, row) => sum + expenseTotal(row), 0);
  const paid = filteredRows.reduce((sum, row) => sum + expensePaid(row), 0);
  const payable = filteredRows.reduce((sum, row) => sum + expenseBalance(row), 0);
  const inputTax = filteredRows.reduce((sum, row) => sum + expenseTax(row), 0);
  const categories = new Set(allRows.map(expenseCategory).filter(Boolean)).size;
  const emptyTitle = expenseSearchQuery || expenseQuickFilter !== "all" ? "No matching expenses" : "No expenses yet";
  const emptyCopy = expenseSearchQuery || expenseQuickFilter !== "all"
    ? "Try another vendor, category, reference, payment status, or GST filter."
    : "Record rent, salary, fuel, repairs, subscriptions, bank charges, and other operating costs here.";

  return `
    <section class="expense-workspace">
      <header class="app-page-header expense-header">
        <div>
          <p class="muted-label">Purchase & Expense</p>
          <h1>Expenses</h1>
          <small>${filteredRows.length} of ${allRows.length} records shown</small>
        </div>
        <div class="invoice-header-actions">
          <button class="secondary-button compact-button" data-view="reports" type="button">Reports</button>
          <button class="purchase-button" data-action="create-expense" type="button">+ Add Expense</button>
        </div>
      </header>

      <section class="app-toolbar expense-toolbar">
        <label class="toolbar-search">
          <span>Search</span>
          <input data-expense-search type="search" value="${escapeHtml(expenseSearchQuery)}" placeholder="Vendor, category, ref, notes">
        </label>
        <div class="invoice-quick-filters" role="group" aria-label="Expense filters">
          ${expenseQuickFilterButtons()}
        </div>
      </section>

      <section class="kpi-grid expense-kpis">
        ${kpiCard("This Month", formatCurrency(thisMonthRows.reduce((sum, row) => sum + expenseTotal(row), 0)), `${thisMonthRows.length} expense records`, "neutral")}
        ${kpiCard("Paid", formatCurrency(paid), "Cash or bank already paid", "success")}
        ${kpiCard("Payable", formatCurrency(payable), "Unpaid expense balance", payable > 0 ? "danger" : "success")}
        ${kpiCard("Input GST", formatCurrency(inputTax), `${categories} categories used`, "info")}
      </section>

      <section class="data-table-card expense-data-card">
        ${filteredRows.length ? expenseRowsTable(filteredRows) : emptyWorkspace(emptyTitle, emptyCopy)}
      </section>
    </section>
  `;
}

function expenseRows() {
  return (state.transactions || [])
    .filter((entry) => entry.type === "expense")
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
}

function expenseQuickFilterButtons() {
  const filters = [
    ["all", "All"],
    ["paid", "Paid"],
    ["due", "Payable"],
    ["partial", "Part Paid"],
    ["gst", "GST"],
    ["nogst", "No GST"],
  ];
  return filters.map(([value, label]) => `
    <button class="${expenseQuickFilter === value ? "active" : ""}" data-expense-filter="${value}" type="button">${label}</button>
  `).join("");
}

function expenseRowsTable(rows) {
  return `
    <table class="data-table expense-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Expense No.</th>
          <th>Category</th>
          <th>Paid To</th>
          <th>Payment</th>
          <th>Taxable</th>
          <th>GST</th>
          <th>Total</th>
          <th>Balance</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${formatDate(row.date)}</td>
            <td><strong class="invoice-no-cell">${escapeHtml(row.invoiceNo || "-")}</strong><small>${escapeHtml(expenseReference(row))}</small></td>
            <td><strong>${escapeHtml(expenseCategory(row))}</strong><small>${escapeHtml(expenseMeta(row).receiptName || "No receipt attached")}</small></td>
            <td><strong>${escapeHtml(expenseVendor(row))}</strong><small>${escapeHtml(expenseMeta(row).placeOfSupply || "")}</small></td>
            <td>${escapeHtml(expensePaymentMethod(row))}</td>
            <td class="amount-cell">${formatCurrency(expenseTaxable(row))}</td>
            <td class="amount-cell">${formatCurrency(expenseTax(row))}</td>
            <td class="amount-cell strong">${formatCurrency(expenseTotal(row))}</td>
            <td class="amount-cell ${expenseBalance(row) > 0 ? "danger" : ""}">${formatCurrency(expenseBalance(row))}</td>
            <td>${expenseStatusBadge(row)}</td>
            <td>${expenseRowActions(row)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function expenseRowActions(row) {
  const id = escapeHtml(row.id || "");
  const actions = [
    ["edit", "View/Edit"],
    ["preview", "Preview Voucher"],
    ["duplicate", "Duplicate"],
    ["markPaid", "Mark Paid"],
    ["delete", "Delete"],
  ];
  return `
    <div class="invoice-row-actions expense-row-actions">
      <details>
        <summary aria-label="Expense actions">More</summary>
        <div>
          ${actions.map(([action, label]) => `<button data-expense-action="${action}" data-expense-id="${id}" type="button">${label}</button>`).join("")}
        </div>
      </details>
    </div>
  `;
}

function expenseMeta(row) {
  return row?.meta || parseJsonObject(row?.metaJson);
}

function expenseCategory(row) {
  return String(expenseMeta(row).category || row?.item || "General").trim();
}

function expenseVendor(row) {
  return String(expenseMeta(row).vendor || row?.party || "Cash").trim();
}

function expensePaymentMethod(row) {
  return String(expenseMeta(row).paymentMethod || row?.paymentType || "Cash").trim();
}

function expenseReference(row) {
  return String(expenseMeta(row).referenceNo || row?.notes || "").trim();
}

function expenseTotal(row) {
  return Number(row?.amount || expenseMeta(row).total || 0);
}

function expenseTax(row) {
  return Number(expenseMeta(row).taxTotal || 0);
}

function expenseTaxable(row) {
  const meta = expenseMeta(row);
  if (meta.taxableValue !== undefined && meta.taxableValue !== null && meta.taxableValue !== "") return Number(meta.taxableValue || 0);
  return Math.max(0, expenseTotal(row) - expenseTax(row));
}

function expensePaid(row) {
  const meta = expenseMeta(row);
  if (meta.paid !== undefined && meta.paid !== null && meta.paid !== "") return Number(meta.paid || 0);
  const cleanStatus = String(row?.status || "").toLowerCase();
  return cleanStatus === "paid" ? expenseTotal(row) : 0;
}

function expenseBalance(row) {
  const meta = expenseMeta(row);
  if (meta.balance !== undefined && meta.balance !== null && meta.balance !== "") return Number(meta.balance || 0);
  return Math.max(0, expenseTotal(row) - expensePaid(row));
}

function expenseStatus(row) {
  const cleanStatus = String(row?.status || "").toLowerCase();
  if (cleanStatus === "cancelled") return "cancelled";
  const balance = expenseBalance(row);
  const paid = expensePaid(row);
  if (balance <= 0) return "paid";
  if (paid > 0) return "partial";
  return cleanStatus === "partial" || cleanStatus === "partially_paid" ? "partial" : "due";
}

function expenseStatusBadge(row) {
  const status = expenseStatus(row);
  const label = {
    paid: "Paid",
    due: "Payable",
    partial: "Part Paid",
    cancelled: "Cancelled",
  }[status] || "Payable";
  return `<span class="invoice-status expense-status ${status}">${label}</span>`;
}

function expenseMatchesSearch(row, query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return true;
  const meta = expenseMeta(row);
  return [
    row.invoiceNo,
    expenseCategory(row),
    expenseVendor(row),
    expensePaymentMethod(row),
    expenseReference(row),
    row.notes,
    meta.receiptName,
    meta.partyGstin,
    meta.placeOfSupply,
    expenseStatus(row),
  ].filter(Boolean).join(" ").toLowerCase().includes(cleanQuery);
}

function expenseQuickFilterMatches(row, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "gst") return expenseTax(row) > 0;
  if (filter === "nogst") return expenseTax(row) <= 0;
  return expenseStatus(row) === filter;
}

function isCurrentMonthRecord(row) {
  const date = new Date(row.date || row.createdAt || Date.now());
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function findExpenseRecord(id) {
  const cleanId = String(id || "");
  return expenseRows().find((row) => String(row.id) === cleanId) || null;
}

function openExpenseModal(record = null) {
  elements.featureView.querySelector(".expense-modal-backdrop")?.remove();
  elements.featureView.insertAdjacentHTML("beforeend", expenseModalTemplate(record));
  bindExpenseModal();
  recalculateExpenseForm();
}

function expenseModalTemplate(record = null) {
  const meta = expenseMeta(record);
  const isEdit = Boolean(record?.id);
  const status = record ? expenseStatus(record) : "paid";
  const taxableValue = record ? expenseTaxable(record) : 0;
  const taxRate = Number(meta.taxRate || 0);
  const paidAmount = record ? expensePaid(record) : 0;
  const placeOfSupply = meta.placeOfSupply || state.businessSettings?.state || "Karnataka";
  const paymentMethod = expensePaymentMethod(record || { paymentType: "Cash", meta: { paymentMethod: "Cash" } });
  return `
    <div class="expense-modal-backdrop modal-backdrop">
      <form id="expenseForm" class="expense-modal" data-expense-id="${escapeHtml(record?.id || "")}">
        <header>
          <div>
            <p class="muted-label">${isEdit ? "Edit expense" : "Record expense"}</p>
            <h2>${isEdit ? "Edit Expense" : "Add Expense"}</h2>
          </div>
          <button class="close-button" data-action="close-expense-modal" type="button" aria-label="Close">x</button>
        </header>
        <main>
          <section class="expense-form-grid">
            <label>Expense date
              <input class="form-input" name="date" type="date" value="${escapeHtml(formatDateInput(record?.date || new Date().toISOString()))}" required>
            </label>
            <label>Expense no. / ref
              <input class="form-input" name="referenceNo" value="${escapeHtml(record?.invoiceNo || meta.referenceNo || "")}" placeholder="Auto">
            </label>
            <label>Category
              <input class="form-input" name="category" list="expenseCategoryOptions" value="${escapeHtml(record ? expenseCategory(record) : "")}" placeholder="Rent, fuel, salary" required>
              <datalist id="expenseCategoryOptions">${expenseCategoryOptions()}</datalist>
            </label>
            <label>Paid to
              <input class="form-input" name="vendor" value="${escapeHtml(record ? expenseVendor(record) : "")}" placeholder="Vendor or employee">
            </label>
            <label>Place of supply
              <select class="form-input" name="placeOfSupply">${indianStateOptions(placeOfSupply)}</select>
            </label>
            <label>Vendor GSTIN
              <input class="form-input" name="partyGstin" value="${escapeHtml(meta.partyGstin || "")}" maxlength="15" placeholder="22AAAAA0000A1Z5">
            </label>
          </section>

          <section class="expense-form-card">
            <h3>Amount & GST</h3>
            <div class="expense-form-grid">
              <label>Taxable amount
                <input class="form-input" name="taxableValue" type="number" min="0" step="0.01" value="${taxableValue || ""}" placeholder="0.00" required>
              </label>
              <label>GST rate
                <select class="form-input" name="taxRate">
                  ${[0, 5, 12, 18, 28].map((rate) => `<option value="${rate}" ${Number(rate) === taxRate ? "selected" : ""}>${rate}%</option>`).join("")}
                </select>
              </label>
              <label>Payment status
                <select class="form-input" name="status">
                  <option value="paid" ${status === "paid" ? "selected" : ""}>Paid</option>
                  <option value="due" ${status === "due" ? "selected" : ""}>Payable</option>
                  <option value="partial" ${status === "partial" ? "selected" : ""}>Part Paid</option>
                </select>
              </label>
              <label>Paid amount
                <input class="form-input" name="paid" type="number" min="0" step="0.01" value="${paidAmount || ""}" placeholder="0.00">
              </label>
              <label>Payment method
                <select class="form-input" name="paymentMethod">
                  ${["Cash", "Bank", "UPI", "Card", "Cheque", "Adjustment"].map((method) => `<option ${paymentMethod === method ? "selected" : ""}>${method}</option>`).join("")}
                </select>
              </label>
              <label>Receipt
                <input class="form-input" name="receipt" type="file" accept="image/*,.pdf">
              </label>
            </div>
            <div class="expense-tax-summary" id="expenseTaxSummary"></div>
          </section>

          <label class="expense-notes">Notes
            <textarea class="form-input" name="notes" rows="3" placeholder="Purpose, approval note, receipt details">${escapeHtml(record?.notes || "")}</textarea>
          </label>
        </main>
        <footer>
          <button class="secondary-button" data-action="close-expense-modal" type="button">Cancel</button>
          <button class="purchase-button" type="submit">${isEdit ? "Update Expense" : "Save Expense"}</button>
        </footer>
      </form>
    </div>
  `;
}

function expenseCategoryOptions() {
  const saved = expenseRows().map(expenseCategory);
  return mergeChoiceList(DEFAULT_EXPENSE_CATEGORIES, saved)
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
}

function bindExpenseModal() {
  const modal = elements.featureView.querySelector(".expense-modal-backdrop");
  const form = elements.featureView.querySelector("#expenseForm");
  if (!modal || !form) return;
  modal.querySelectorAll("[data-action='close-expense-modal']").forEach((button) => {
    button.addEventListener("click", closeExpenseModal);
  });
  modal.addEventListener("mousedown", (event) => {
    if (event.target === modal) closeExpenseModal();
  });
  ["input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, recalculateExpenseForm);
  });
  form.addEventListener("submit", handleExpenseSubmit);
}

function closeExpenseModal() {
  elements.featureView.querySelector(".expense-modal-backdrop")?.remove();
}

function calculateExpenseTotals(taxableValue, taxRate, placeOfSupply) {
  const taxable = Math.max(0, Number(taxableValue || 0));
  const rate = Math.max(0, Number(taxRate || 0));
  const taxTotal = taxable * rate / 100;
  const firmState = String(state.businessSettings?.state || "Karnataka").trim().toLowerCase();
  const supplyState = String(placeOfSupply || state.businessSettings?.state || "Karnataka").trim().toLowerCase();
  const isInterstate = Boolean(supplyState && firmState && supplyState !== firmState);
  return {
    taxableValue: taxable,
    taxRate: rate,
    taxTotal,
    cgstTotal: isInterstate ? 0 : taxTotal / 2,
    sgstTotal: isInterstate ? 0 : taxTotal / 2,
    igstTotal: isInterstate ? taxTotal : 0,
    total: taxable + taxTotal,
  };
}

function recalculateExpenseForm() {
  const form = elements.featureView.querySelector("#expenseForm");
  if (!form) return;
  const status = form.elements.status?.value || "paid";
  const totals = calculateExpenseTotals(form.elements.taxableValue?.value, form.elements.taxRate?.value, form.elements.placeOfSupply?.value);
  const paidInput = form.elements.paid;
  if (paidInput && status === "paid") paidInput.value = totals.total ? totals.total.toFixed(2) : "";
  if (paidInput && status === "due") paidInput.value = "";
  const paid = Math.min(totals.total, Math.max(0, Number(paidInput?.value || 0)));
  const balance = Math.max(0, totals.total - paid);
  const summary = form.querySelector("#expenseTaxSummary");
  if (summary) {
    summary.innerHTML = `
      <article><span>Taxable</span><strong>${formatCurrency(totals.taxableValue)}</strong></article>
      <article><span>CGST</span><strong>${formatCurrency(totals.cgstTotal)}</strong></article>
      <article><span>SGST</span><strong>${formatCurrency(totals.sgstTotal)}</strong></article>
      <article><span>IGST</span><strong>${formatCurrency(totals.igstTotal)}</strong></article>
      <article><span>Total</span><strong>${formatCurrency(totals.total)}</strong></article>
      <article><span>Balance</span><strong>${formatCurrency(balance)}</strong></article>
    `;
  }
}

function collectExpenseForm(form) {
  const data = new FormData(form);
  const category = String(data.get("category") || "").trim();
  const vendor = String(data.get("vendor") || "").trim();
  const referenceNo = String(data.get("referenceNo") || "").trim();
  const placeOfSupply = String(data.get("placeOfSupply") || "").trim();
  const paymentMethod = String(data.get("paymentMethod") || "Cash").trim();
  const totals = calculateExpenseTotals(data.get("taxableValue"), data.get("taxRate"), placeOfSupply);
  const statusChoice = String(data.get("status") || "paid");
  const paid = statusChoice === "paid" ? totals.total : statusChoice === "due" ? 0 : Math.min(totals.total, Math.max(0, Number(data.get("paid") || 0)));
  const balance = Math.max(0, totals.total - paid);
  const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "due";
  const existing = findExpenseRecord(form.dataset.expenseId);
  const receipt = form.querySelector('[name="receipt"]')?.files?.[0];
  const receiptName = receipt?.name || expenseMeta(existing).receiptName || "";
  const notes = String(data.get("notes") || "").trim();
  return {
    id: form.dataset.expenseId || undefined,
    transactionId: form.dataset.expenseId || undefined,
    type: "expense",
    invoiceNo: referenceNo,
    party: vendor || "Expense",
    item: category || "General",
    amount: totals.total,
    paymentType: paymentMethod,
    status,
    notes,
    date: parseEditorDate(data.get("date")) || new Date().toISOString(),
    paid,
    meta: {
      category: category || "General",
      vendor: vendor || "Expense",
      referenceNo,
      placeOfSupply,
      partyGstin: String(data.get("partyGstin") || "").trim().toUpperCase(),
      paymentMethod,
      paid,
      balance,
      receiptName,
      ...totals,
    },
  };
}

async function handleExpenseSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearInlineErrors(form);
  const payload = collectExpenseForm(form);
  const categoryField = form.elements.category;
  const amountField = form.elements.taxableValue;
  const gstinField = form.elements.partyGstin;
  if (!String(payload.item || "").trim()) {
    setInlineError(categoryField, "Expense category is required.");
    categoryField?.focus();
    return;
  }
  if (Number(payload.meta.taxableValue || 0) <= 0) {
    setInlineError(amountField, "Taxable amount must be greater than zero.");
    amountField?.focus();
    return;
  }
  if (payload.meta.partyGstin && !isValidGstin(payload.meta.partyGstin)) {
    setInlineError(gstinField, "Enter a valid 15-character GSTIN, e.g. 22AAAAA0000A1Z5.");
    gstinField?.focus();
    return;
  }

  try {
    if (window.giDB) {
      state = normalizeState(payload.transactionId
        ? await window.giDB.updateTransaction(payload)
        : await window.giDB.createTransaction(payload));
    } else {
      saveLocalExpense(payload);
      saveState();
    }
    closeExpenseModal();
    renderDashboard();
    renderFeatureView("expenses");
    showToast(payload.transactionId ? "Expense Updated" : "Expense Saved");
  } catch (error) {
    showToast(error.message || "Unable to save expense.");
  }
}

function saveLocalExpense(payload) {
  const now = new Date().toISOString();
  const id = payload.transactionId || payload.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const record = normalizeTransactionRecord({
    ...payload,
    id,
    invoiceNo: payload.invoiceNo || `EXP-${String((expenseRows().length || 0) + 1).padStart(4, "0")}`,
    metaJson: JSON.stringify(payload.meta || {}),
    createdAt: payload.createdAt || now,
    updatedAt: now,
  });
  state.transactions = (state.transactions || []).filter((row) => String(row.id) !== String(id));
  state.transactions.unshift(record);
}

async function handleExpenseAction(action, expenseId) {
  const row = findExpenseRecord(expenseId);
  if (!row) {
    showToast("Expense not found.");
    return;
  }
  if (action === "edit") {
    openExpenseModal(row);
    return;
  }
  if (action === "preview") {
    openExpenseVoucher(row);
    return;
  }
  if (action === "duplicate") {
    openExpenseModal({ ...row, id: "", invoiceNo: "", meta: { ...expenseMeta(row), referenceNo: "" } });
    return;
  }
  if (action === "markPaid") {
    await markExpensePaid(row);
    return;
  }
  if (action === "delete") {
    await deleteExpenseRecord(row);
  }
}

async function markExpensePaid(row) {
  if (expenseStatus(row) === "paid") {
    showToast("Expense is already paid.");
    return;
  }
  const meta = { ...expenseMeta(row), paid: expenseTotal(row), balance: 0 };
  const payload = {
    ...row,
    transactionId: row.id,
    paymentType: expensePaymentMethod(row),
    status: "paid",
    paid: expenseTotal(row),
    meta,
  };
  try {
    if (window.giDB?.updateTransaction) {
      state = normalizeState(await window.giDB.updateTransaction(payload));
    } else {
      saveLocalExpense(payload);
      saveState();
    }
    renderDashboard();
    renderFeatureView("expenses");
    showToast("Expense Marked Paid");
  } catch (error) {
    showToast(error.message || "Unable to update expense.");
  }
}

async function deleteExpenseRecord(row) {
  if (!confirm(`Delete ${row.invoiceNo || expenseCategory(row)}? This cannot be undone.`)) return;
  try {
    if (window.giDB?.deleteTransaction) {
      state = normalizeState(await window.giDB.deleteTransaction({ transactionId: row.id }));
    } else {
      state.transactions = (state.transactions || []).filter((entry) => String(entry.id) !== String(row.id));
      saveState();
    }
    renderDashboard();
    renderFeatureView("expenses");
    showToast("Expense Deleted");
  } catch (error) {
    showToast(error.message || "Unable to delete expense.");
  }
}

function openExpenseVoucher(row) {
  elements.featureView.querySelector(".expense-voucher-backdrop")?.remove();
  const meta = expenseMeta(row);
  elements.featureView.insertAdjacentHTML("beforeend", `
    <div class="expense-voucher-backdrop modal-backdrop">
      <section class="expense-voucher">
        <header>
          <div>
            <p class="muted-label">Expense voucher</p>
            <h2>${escapeHtml(row.invoiceNo || "Expense")}</h2>
          </div>
          <button class="close-button" data-action="close-expense-voucher" type="button">x</button>
        </header>
        <main>
          <div class="voucher-business">
            <strong>${escapeHtml(state.businessSettings?.businessName || state.activeCompany || "GI Billing")}</strong>
            <span>${escapeHtml(state.businessSettings?.address || "")}</span>
          </div>
          <dl>
            <div><dt>Date</dt><dd>${formatDate(row.date)}</dd></div>
            <div><dt>Paid to</dt><dd>${escapeHtml(expenseVendor(row))}</dd></div>
            <div><dt>Category</dt><dd>${escapeHtml(expenseCategory(row))}</dd></div>
            <div><dt>Payment</dt><dd>${escapeHtml(expensePaymentMethod(row))}</dd></div>
            <div><dt>Taxable</dt><dd>${formatCurrency(expenseTaxable(row))}</dd></div>
            <div><dt>GST</dt><dd>${formatCurrency(expenseTax(row))}</dd></div>
            <div><dt>Total</dt><dd>${formatCurrency(expenseTotal(row))}</dd></div>
            <div><dt>Balance</dt><dd>${formatCurrency(expenseBalance(row))}</dd></div>
          </dl>
          <p>${escapeHtml(row.notes || meta.receiptName || "No notes")}</p>
          <div class="voucher-signature">Authorized Signature</div>
        </main>
        <footer>
          <button class="secondary-button" data-action="close-expense-voucher" type="button">Close</button>
          <button class="purchase-button" data-action="print-expense-voucher" type="button">Print</button>
        </footer>
      </section>
    </div>
  `);
  elements.featureView.querySelectorAll("[data-action='close-expense-voucher']").forEach((button) => {
    button.addEventListener("click", () => elements.featureView.querySelector(".expense-voucher-backdrop")?.remove());
  });
  elements.featureView.querySelector("[data-action='print-expense-voucher']")?.addEventListener("click", () => window.print());
}

function paymentOutTemplate() {
  const payments = (state.payments || []).filter((p) => p.type === "payment_out");
  const payable = totalPayable();
  const thisMonthPayments = payments.filter((p) => {
    const d = new Date(p.paymentDate || p.createdAt || "");
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const thisMonthTotal = thisMonthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return `
    <section class="invoice-workspace sale-workspace">
      <header class="app-page-header invoice-page-header">
        <div>
          <p class="muted-label">Purchases & Expenses</p>
          <h1>Payment-Out</h1>
          <small>${payments.length} payment${payments.length === 1 ? "" : "s"} recorded</small>
        </div>
        <div class="invoice-header-actions">
          <button class="sale-button" data-action="create-payment-out" type="button">+ Record Payment-Out</button>
        </div>
      </header>
      <section class="kpi-grid invoice-kpis">
        ${kpiCard("This Month", formatCurrency(thisMonthTotal), `${thisMonthPayments.length} supplier payments`, "danger")}
        ${kpiCard("Total Paid", formatCurrency(payments.reduce((s, p) => s + Number(p.amount || 0), 0)), "All recorded payments", "neutral")}
        ${kpiCard("Supplier Payable", formatCurrency(payable), "Outstanding balances", payable > 0 ? "danger" : "success")}
        ${kpiCard("Payments", String(payments.length), "Recorded transactions", "info")}
      </section>
      <section class="data-table-card invoice-data-card">
        ${payments.length ? `
          <table class="data-table">
            <thead><tr><th>Date</th><th>Supplier</th><th>Bill Ref</th><th>Method</th><th>Amount</th><th>Notes</th></tr></thead>
            <tbody>
              ${payments.map((p) => `
                <tr>
                  <td>${formatDate(p.paymentDate || p.createdAt)}</td>
                  <td><strong>${escapeHtml(p.party || "-")}</strong></td>
                  <td>${escapeHtml(p.invoiceNo || p.referenceNo || "-")}</td>
                  <td>${escapeHtml(p.method || "Cash")}</td>
                  <td class="amount-cell strong">${formatCurrency(p.amount || 0)}</td>
                  <td>${escapeHtml(p.notes || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `
          <div class="feature-empty-card">
            <strong>No payments recorded yet</strong>
            <p>Record money paid to suppliers for purchase bills or advances.</p>
            <button class="sale-button" data-action="create-payment-out" type="button">+ Record Payment-Out</button>
          </div>
        `}
      </section>
    </section>
  `;
}

function openPaymentOutModal() {
  const purchaseInvoices = activeInvoiceRowsForType("purchase").filter((inv) => invoiceBalanceValue(inv) > 0);
  const suppliers = (state.parties || []).filter((p) => p.type === "supplier" || p.type === "both");
  const existingModal = document.getElementById("paymentOutModal");
  if (existingModal) existingModal.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "paymentOutModal";
  modal.innerHTML = `
    <section class="entry-modal" role="dialog" aria-modal="true" aria-label="Record Payment-Out">
      <header>
        <h2>Record Payment-Out</h2>
        <button class="close-button" type="button" data-close-payment-out-modal>&times;</button>
      </header>
      <form id="paymentOutForm" class="entry-form" novalidate>
        <div class="entry-form-body">
          <label>Supplier *
            <input class="form-input" name="party" list="paymentOutPartyList" placeholder="Supplier name" autocomplete="off" required>
            <datalist id="paymentOutPartyList">
              ${(suppliers.length ? suppliers : state.parties || []).map((p) => `<option value="${escapeHtml(p.name)}">`).join("")}
            </datalist>
          </label>
          <label>Purchase Bill Reference
            <select class="form-input" name="invoiceRef">
              <option value="">— On-Account Advance (no specific bill) —</option>
              ${purchaseInvoices.map((inv) => `<option value="${escapeHtml(inv.invoiceNo || inv.id)}" data-party="${escapeHtml(inv.party)}" data-balance="${invoiceBalanceValue(inv)}">${escapeHtml(inv.invoiceNo || inv.id)} — ${escapeHtml(inv.party)} — Due: ${formatCurrency(invoiceBalanceValue(inv))}</option>`).join("")}
            </select>
          </label>
          <label>Amount *
            <input class="form-input" name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required>
          </label>
          <label>Payment Date
            <input class="form-input" name="paymentDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
          </label>
          <label>Payment Method
            <select class="form-input" name="method">
              <option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Card</option>
            </select>
          </label>
          <label>Notes
            <input class="form-input" name="notes" placeholder="Reference number, cheque no, transaction details">
          </label>
        </div>
        <footer>
          <span id="paymentOutStatus"></span>
          <div>
            <button class="secondary-button" type="button" data-close-payment-out-modal>Cancel</button>
            <button class="sale-button" type="submit">Save Payment-Out</button>
          </div>
        </footer>
      </form>
    </section>
  `;
  document.body.append(modal);

  const selectEl = modal.querySelector('[name="invoiceRef"]');
  const partyInput = modal.querySelector('[name="party"]');
  const amountInput = modal.querySelector('[name="amount"]');
  selectEl?.addEventListener("change", () => {
    const opt = selectEl.selectedOptions[0];
    if (opt?.dataset.party) {
      partyInput.value = opt.dataset.party;
    }
    if (opt?.dataset.balance && !amountInput.value) {
      amountInput.value = opt.dataset.balance;
    }
  });

  modal.querySelectorAll("[data-close-payment-out-modal]").forEach((btn) => {
    btn.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector("#paymentOutForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const amount = Number(form.get("amount") || 0);
    let party = String(form.get("party") || "").trim();
    if (!amount || amount <= 0) {
      showToast("Please enter a valid amount.");
      return;
    }
    const invoiceRef = String(form.get("invoiceRef") || "");
    let invoiceId = null;
    if (invoiceRef) {
      const bill = (state.invoices || []).find((inv) => inv.type === "purchase" && (inv.invoiceNo === invoiceRef || inv.id === invoiceRef));
      if (bill) {
        invoiceId = bill.id || bill.invoiceId;
        if (!party) party = bill.party;
      }
    }
    if (!party) {
      showToast("Please enter or select a supplier name.");
      return;
    }

    try {
      if (window.giDB?.recordPaymentOut) {
        state = normalizeState(await window.giDB.recordPaymentOut({
          invoiceId,
          party,
          amount,
          method: String(form.get("method") || "Cash"),
          notes: String(form.get("notes") || "").trim(),
          paymentDate: String(form.get("paymentDate") || new Date().toISOString().slice(0, 10)),
        }));
      }
      modal.remove();
      renderDashboard();
      showView("paymentOut");
      showToast("Payment-Out recorded successfully.");
    } catch (err) {
      showToast(err.message || "Failed to record Payment-Out.");
    }
  });
}

function openStockAdjustmentModal(selectedItemId = null) {
  const items = (state.items || []).filter((i) => i.itemType !== "service");
  const existingModal = document.getElementById("stockAdjustmentModal");
  if (existingModal) existingModal.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "stockAdjustmentModal";
  modal.innerHTML = `
    <section class="entry-modal" role="dialog" aria-modal="true" aria-label="Stock Adjustment">
      <header>
        <h2>Record Stock Adjustment</h2>
        <button class="close-button" type="button" data-close-stock-modal>&times;</button>
      </header>
      <form id="stockAdjustmentForm" class="entry-form" novalidate>
        <div class="entry-form-body">
          <label>Item *
            <select class="form-input" name="itemId" required>
              <option value="">— Select item —</option>
              ${items.map((it) => `<option value="${it.id}" ${Number(it.id) === Number(selectedItemId) ? "selected" : ""} data-stock="${it.currentStock || 0}" data-unit="${escapeHtml(it.unit || "")}" data-price="${it.purchasePrice || 0}">${escapeHtml(it.name)} (Current: ${it.currentStock || 0} ${escapeHtml(it.unit || "")})</option>`).join("")}
            </select>
          </label>
          <label>Adjustment Direction *
            <select class="form-input" name="direction" required>
              <option value="reduce">Reduce Stock (-)</option>
              <option value="add">Add Stock (+)</option>
            </select>
          </label>
          <label>Reason *
            <select class="form-input" name="reason" required>
              <option value="Physical Count Discrepancy / Stock Take">Physical Count Discrepancy / Stock Take</option>
              <option value="Damaged Stock">Damaged Stock</option>
              <option value="Expired Stock">Expired Stock</option>
              <option value="Theft / Loss">Theft / Loss</option>
              <option value="Internal Consumption">Internal Consumption</option>
              <option value="Opening Stock Correction">Opening Stock Correction</option>
            </select>
          </label>
          <label>Quantity *
            <input class="form-input" name="quantity" type="number" step="0.01" min="0.01" placeholder="Quantity" required>
          </label>
          <label>Unit Cost / Value (Optional)
            <input class="form-input" name="unitPrice" type="number" step="0.01" placeholder="0.00">
          </label>
          <label>Adjustment Date
            <input class="form-input" name="adjustmentDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
          </label>
          <label>Notes
            <input class="form-input" name="notes" placeholder="Batch / serial no., verification details, auditor reference">
          </label>
        </div>
        <footer>
          <span id="stockAdjustmentStatus"></span>
          <div>
            <button class="secondary-button" type="button" data-close-stock-modal>Cancel</button>
            <button class="sale-button" type="submit">Save Adjustment</button>
          </div>
        </footer>
      </form>
    </section>
  `;
  document.body.append(modal);

  const itemSelect = modal.querySelector('[name="itemId"]');
  const unitPriceInput = modal.querySelector('[name="unitPrice"]');
  itemSelect?.addEventListener("change", () => {
    const opt = itemSelect.selectedOptions[0];
    if (opt?.dataset.price && !unitPriceInput.value) {
      unitPriceInput.value = opt.dataset.price;
    }
  });
  if (selectedItemId && itemSelect) {
    const opt = itemSelect.selectedOptions[0];
    if (opt?.dataset.price) unitPriceInput.value = opt.dataset.price;
  }

  modal.querySelectorAll("[data-close-stock-modal]").forEach((btn) => {
    btn.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector("#stockAdjustmentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const itemId = Number(form.get("itemId") || 0);
    const quantity = Number(form.get("quantity") || 0);
    if (!itemId) {
      showToast("Please select an item.");
      return;
    }
    if (!quantity || quantity <= 0) {
      showToast("Please enter a valid quantity greater than zero.");
      return;
    }

    try {
      if (window.giDB?.recordStockAdjustment) {
        state = normalizeState(await window.giDB.recordStockAdjustment({
          itemId,
          quantity,
          direction: String(form.get("direction") || "reduce"),
          reason: String(form.get("reason") || "Stock Adjustment"),
          unitPrice: Number(form.get("unitPrice") || 0),
          adjustmentDate: String(form.get("adjustmentDate") || new Date().toISOString().slice(0, 10)),
          notes: String(form.get("notes") || "").trim(),
        }));
      }
      modal.remove();
      renderDashboard();
      showView("items");
      showToast("Stock adjustment recorded successfully.");
    } catch (err) {
      showToast(err.message || "Failed to record stock adjustment.");
    }
  });
}

function legacyBanksTemplate() {
  return `
    <section class="feature-page">
      <header class="feature-titlebar"><h1>Banks</h1><button class="icon-button">⋮</button></header>
      <div class="banks-hero">
        <h2>Manage Multiple Bank Accounts</h2>
        <p>With GI Billing you can manage multiple banks and payment types like UPI, Net Banking and Credit Card</p>
        <div class="bank-illustration"></div>
        <div class="bank-feature-grid">
          <article><strong>Print Bank Details on Invoices</strong><p>Print account details on invoices and get payments via NEFT/RTGS/IMPS.</p></article>
          <article><strong>Unlimited Payment Types</strong><p>Record transactions by methods like Banks, UPI, Net Banking and Cards.</p></article>
          <article><strong>Print UPI QR Code on Invoices</strong><p>Print QR code on invoices or send payment links.</p></article>
        </div>
        <button class="sale-button" data-action="add-bank" type="button">+ Add Bank Account</button>
      </div>
    </section>
  `;
}

function legacyAddBankTemplate() {
  return `
    <section class="feature-page">
      <header class="feature-titlebar"><h1>Add Bank Account</h1></header>
      <form class="bank-form">
        <div class="bank-form-grid">
          <label>Account Display Name *<input class="form-input" placeholder="Enter Account Display Name"></label>
          <label>Opening Balance<input class="form-input" placeholder="Enter Opening Balance"></label>
          <label>As of Date<input class="form-input" value="26/05/2026"></label>
        </div>
        <p class="link-button">+ Add more fields</p>
        <p><label><input type="checkbox"> Print offline UPI QR on Invoices</label></p>
        <p><label><input type="checkbox"> Print Bank Details on Invoices</label></p>
      </form>
      <div class="bottom-actions"><button class="secondary-button">Cancel</button><button class="sale-button" data-action="save-bank">Save Details</button></div>
    </section>
  `;
}

function banksTemplate() {
  const accounts = bankAccountRows();
  const defaultAccount = defaultBankAccount();
  const currentTotal = accounts.reduce((sum, account) => sum + Number(account.currentBalance || 0), 0);
  const openingTotal = accounts.reduce((sum, account) => sum + Number(account.openingBalance || 0), 0);
  const upiReady = accounts.filter((account) => String(account.upiId || "").trim()).length;
  const invoiceReady = accounts.filter((account) => Boolean(Number(account.printBankDetails))).length;
  return `
    <section class="bank-workspace">
      <header class="app-page-header bank-page-header">
        <div>
          <p class="muted-label">Cash & Bank</p>
          <h1>Bank Accounts</h1>
          <small>${accounts.length} account${accounts.length === 1 ? "" : "s"} tracked</small>
        </div>
        <button class="sale-button" data-action="add-bank" type="button">+ Add Bank Account</button>
      </header>

      <section class="kpi-grid bank-kpis">
        ${kpiCard("Current Balance", formatCurrency(currentTotal), "Across tracked bank accounts", "success")}
        ${kpiCard("Opening Balance", formatCurrency(openingTotal), "Opening balance total", "neutral")}
        ${kpiCard("Default Bank", defaultAccount?.displayName || "-", "Used on invoice print", "info")}
        ${kpiCard("UPI Ready", String(upiReady), `${invoiceReady} print-ready account${invoiceReady === 1 ? "" : "s"}`, "neutral")}
      </section>

      <section class="bank-content-grid">
        <div class="data-table-card bank-list-card">
          ${accounts.length ? bankAccountsTable(accounts) : bankEmptyState()}
        </div>
        <aside class="bank-side-panel">
          <h2>Invoice Bank Details</h2>
          ${defaultAccount ? bankDefaultDetails(defaultAccount) : '<p class="bank-muted">Set a default bank to print account details on invoices.</p>'}
        </aside>
      </section>
    </section>
  `;
}

function addBankTemplate(account = null) {
  return bankAccountFormTemplate(account);
}

function bankAccountRows() {
  return [...(state.bankAccounts || [])].sort((a, b) => {
    const defaultSort = Number(b.isDefault || 0) - Number(a.isDefault || 0);
    if (defaultSort) return defaultSort;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""));
  });
}

function findBankAccount(id) {
  return (state.bankAccounts || []).find((account) => String(account.id) === String(id));
}

function defaultBankAccount() {
  return bankAccountRows().find((account) => Number(account.isDefault || 0)) || bankAccountRows()[0] || null;
}

function bankAccountsTable(accounts) {
  return `
    <table class="data-table bank-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Bank / UPI</th>
          <th>Opening</th>
          <th>Current</th>
          <th>Invoice Print</th>
          <th>Updated</th>
          <th class="right">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${accounts.map(bankAccountRow).join("")}
      </tbody>
    </table>
  `;
}

function bankAccountRow(account) {
  const details = [
    account.bankName,
    account.accountNo ? `A/C ${account.accountNo}` : "",
    account.ifsc ? `IFSC ${account.ifsc}` : "",
  ].filter(Boolean).join(" - ");
  const printDetails = Number(account.printBankDetails || 0) ? "Bank details" : "Hidden";
  const qrDetails = Number(account.printUpiQr || 0) ? "UPI QR" : "";
  return `
    <tr>
      <td>
        <strong>${escapeHtml(account.displayName || "-")}</strong>
        ${Number(account.isDefault || 0) ? '<span class="bank-default-badge">Default</span>' : ""}
        ${account.notes ? `<small>${escapeHtml(account.notes)}</small>` : ""}
      </td>
      <td>
        <span>${escapeHtml(details || "No bank details")}</span>
        <small>${escapeHtml(account.upiId ? `UPI ${account.upiId}` : "No UPI ID")}</small>
      </td>
      <td>${formatCurrency(account.openingBalance || 0)}</td>
      <td><strong>${formatCurrency(account.currentBalance || 0)}</strong></td>
      <td>
        <span>${escapeHtml([printDetails, qrDetails].filter(Boolean).join(" + "))}</span>
      </td>
      <td>${escapeHtml(formatDate(account.updatedAt || account.createdAt || account.asOfDate))}</td>
      <td>${bankAccountActions(account)}</td>
    </tr>
  `;
}

function bankAccountActions(account) {
  const id = escapeHtml(account.id || "");
  const defaultButton = Number(account.isDefault || 0)
    ? ""
    : `<button type="button" data-bank-action="set-default" data-bank-id="${id}">Set Default</button>`;
  return `
    <div class="invoice-row-actions bank-row-actions">
      <details>
        <summary aria-label="Bank account actions">...</summary>
        <div class="invoice-action-menu">
          <section>
            <span>Manage</span>
            <button type="button" data-bank-action="edit" data-bank-id="${id}">View/Edit</button>
            ${defaultButton}
          </section>
          <section>
            <span>Remove</span>
            <button type="button" data-bank-action="delete" data-bank-id="${id}">Delete</button>
          </section>
        </div>
      </details>
    </div>
  `;
}

function bankDefaultDetails(account) {
  const lines = [
    ["Account", account.displayName],
    ["Bank", account.bankName],
    ["Account No.", account.accountNo],
    ["IFSC", account.ifsc],
    ["UPI ID", account.upiId],
  ];
  return `
    <dl class="bank-detail-list">
      ${lines.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value || "-")}</dd>
        </div>
      `).join("")}
    </dl>
    <button class="secondary-button compact-button" type="button" data-bank-action="edit" data-bank-id="${escapeHtml(account.id || "")}">Edit Default Bank</button>
  `;
}

function bankEmptyState() {
  return `
    <div class="empty-workspace bank-empty">
      <strong>No bank accounts yet</strong>
      <p>Add the bank account that should appear on invoices and payment receipts.</p>
      <button class="sale-button" data-action="add-bank" type="button">+ Add Bank Account</button>
    </div>
  `;
}

function bankAccountFormTemplate(account = null) {
  const isEdit = Boolean(account?.id);
  const accounts = bankAccountRows();
  const isOnlyAccount = isEdit && accounts.length === 1;
  const shouldBeDefault = !accounts.length || Number(account?.isDefault || 0);
  const openingBalanceValue = isEdit ? String(Number(account?.openingBalance || 0)) : "";
  const currentBalanceValue = isEdit ? String(Number(account?.currentBalance ?? account?.openingBalance ?? 0)) : "";
  return `
    <section class="bank-form-page">
      <header class="app-page-header bank-page-header">
        <div>
          <p class="muted-label">Cash & Bank</p>
          <h1>${isEdit ? "Edit Bank Account" : "Add Bank Account"}</h1>
          <small>Keep the default bank clean because invoices use it for print details.</small>
        </div>
      </header>
      <form id="bankAccountForm" class="bank-account-form" data-bank-id="${escapeHtml(account?.id || "")}" novalidate>
        <div class="bank-form-body">
          <section class="bank-form-card">
            <h2>Account</h2>
            <div class="bank-form-grid">
              <label>Account Display Name *
                <input class="form-input" name="displayName" value="${escapeHtml(account?.displayName || "")}" placeholder="Current account, HDFC, Main UPI" required>
              </label>
              <label>Bank Name
                <input class="form-input" name="bankName" value="${escapeHtml(account?.bankName || "")}" placeholder="Bank name">
              </label>
              <label>Account Number
                <input class="form-input" name="accountNo" value="${escapeHtml(account?.accountNo || "")}" placeholder="Account number">
              </label>
              <label>IFSC
                <input class="form-input" name="ifsc" value="${escapeHtml(account?.ifsc || "")}" placeholder="HDFC0001234" maxlength="11">
              </label>
              <label>UPI ID
                <input class="form-input" name="upiId" value="${escapeHtml(account?.upiId || "")}" placeholder="business@upi">
              </label>
              <label>As of Date
                <input class="form-input" name="asOfDate" type="date" value="${escapeHtml(formatDateInput(account?.asOfDate || new Date().toISOString()))}">
              </label>
            </div>
          </section>

          <section class="bank-form-card">
            <h2>Balance</h2>
            <div class="bank-form-grid two-col">
              <label>Opening Balance
                <input class="form-input" name="openingBalance" type="number" step="0.01" value="${escapeHtml(openingBalanceValue)}" placeholder="0.00">
              </label>
              <label>Current Balance
                <input class="form-input" name="currentBalance" type="number" step="0.01" value="${escapeHtml(currentBalanceValue)}" placeholder="Same as opening">
              </label>
            </div>
          </section>

          <section class="bank-form-card">
            <h2>Invoice Print</h2>
            <div class="bank-form-options">
              <label><input name="printBankDetails" type="checkbox" ${Number(account?.printBankDetails ?? 1) ? "checked" : ""}> Print bank details on invoices</label>
              <label><input name="printUpiQr" type="checkbox" ${Number(account?.printUpiQr || 0) ? "checked" : ""}> Print offline UPI QR on invoices</label>
              <label><input name="isDefault" type="checkbox" ${shouldBeDefault ? "checked" : ""} ${isOnlyAccount || !accounts.length ? "disabled" : ""}> Use as default bank</label>
            </div>
          </section>

          <section class="bank-form-card">
            <h2>Notes</h2>
            <label class="bank-notes-field">Internal Notes
              <textarea class="form-input" name="notes" rows="3" placeholder="Cheque book, branch, reconciliation notes">${escapeHtml(account?.notes || "")}</textarea>
            </label>
          </section>
        </div>
        <footer class="bank-form-footer">
          <span data-bank-form-status></span>
          <div>
            <button class="secondary-button" data-action="cancel-bank" type="button">Cancel</button>
            <button class="sale-button" type="submit">Save Details</button>
          </div>
        </footer>
      </form>
    </section>
  `;
}

function openBankAccountForm(account = null) {
  elements.featureView.innerHTML = addBankTemplate(account);
  bindFeatureActions();
  elements.featureView.querySelector("[name='displayName']")?.focus();
}

async function handleBankAccountSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearInlineErrors(form);
  const status = form.querySelector("[data-bank-form-status]");
  const payload = bankAccountPayloadFromForm(form);
  const displayNameField = form.querySelector("[name='displayName']");
  const ifscField = form.querySelector("[name='ifsc']");
  if (!payload.displayName) {
    setInlineError(displayNameField, "Account display name is required.");
    displayNameField?.focus();
    return;
  }
  if (payload.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payload.ifsc)) {
    setInlineError(ifscField, "Enter a valid 11-character IFSC, e.g. HDFC0001234.");
    ifscField?.focus();
    return;
  }
  try {
    if (status) status.textContent = "Saving bank account...";
    if (window.giDB?.createBankAccount) {
      state = normalizeState(payload.bankAccountId
        ? await window.giDB.updateBankAccount(payload)
        : await window.giDB.createBankAccount(payload));
    } else {
      saveBankAccountLocally(payload);
      saveState();
    }
    showToast("Bank Account Saved");
    renderFeatureView("cash");
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to save bank account.";
  }
}

function bankAccountPayloadFromForm(form) {
  const formData = new FormData(form);
  const openingBalance = Number(formData.get("openingBalance") || 0) || 0;
  const rawCurrentBalance = String(formData.get("currentBalance") || "").trim();
  const defaultField = form.querySelector("[name='isDefault']");
  return {
    bankAccountId: form.dataset.bankId || undefined,
    displayName: String(formData.get("displayName") || "").trim(),
    bankName: String(formData.get("bankName") || "").trim(),
    accountNo: String(formData.get("accountNo") || "").trim(),
    ifsc: String(formData.get("ifsc") || "").trim().toUpperCase(),
    upiId: String(formData.get("upiId") || "").trim(),
    openingBalance,
    currentBalance: rawCurrentBalance ? Number(rawCurrentBalance) || 0 : openingBalance,
    asOfDate: String(formData.get("asOfDate") || "").trim() || new Date().toISOString().slice(0, 10),
    printBankDetails: formData.get("printBankDetails") ? 1 : 0,
    printUpiQr: formData.get("printUpiQr") ? 1 : 0,
    isDefault: defaultField?.checked ? 1 : 0,
    notes: String(formData.get("notes") || "").trim(),
  };
}

async function handleBankAccountAction(action, id) {
  const account = findBankAccount(id);
  if (!account) {
    showToast("Bank account not found.");
    return;
  }
  if (action === "edit") {
    openBankAccountForm(account);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete bank account "${account.displayName}"?`)) return;
    try {
      if (window.giDB?.deleteBankAccount) {
        state = normalizeState(await window.giDB.deleteBankAccount({ bankAccountId: id }));
      } else {
        state.bankAccounts = (state.bankAccounts || []).filter((item) => String(item.id) !== String(id));
        ensureLocalDefaultBankAccount();
        syncDefaultBankSettingsFromState();
        saveState();
      }
      showToast("Bank Account Deleted");
      renderFeatureView("cash");
    } catch (error) {
      showToast(error.message || "Unable to delete bank account.");
    }
    return;
  }
  if (action === "set-default") {
    try {
      if (window.giDB?.setDefaultBankAccount) {
        state = normalizeState(await window.giDB.setDefaultBankAccount({ bankAccountId: id }));
      } else {
        state.bankAccounts = (state.bankAccounts || []).map((item) => ({
          ...item,
          isDefault: String(item.id) === String(id) ? 1 : 0,
          updatedAt: new Date().toISOString(),
        }));
        syncDefaultBankSettingsFromState();
        saveState();
      }
      showToast("Default Bank Updated");
      renderFeatureView("cash");
    } catch (error) {
      showToast(error.message || "Unable to set default bank.");
    }
  }
}

function saveBankAccountLocally(payload) {
  const now = new Date().toISOString();
  const id = payload.bankAccountId || (crypto.randomUUID ? crypto.randomUUID() : `bank-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const existing = findBankAccount(id);
  const shouldBeDefault = Boolean(payload.isDefault) || !(state.bankAccounts || []).length;
  const nextAccount = {
    ...existing,
    ...payload,
    id,
    bankAccountId: undefined,
    isDefault: shouldBeDefault ? 1 : 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  state.bankAccounts = (state.bankAccounts || [])
    .filter((account) => String(account.id) !== String(id))
    .map((account) => shouldBeDefault ? { ...account, isDefault: 0 } : account);
  state.bankAccounts.push(nextAccount);
  ensureLocalDefaultBankAccount();
  syncDefaultBankSettingsFromState();
}

function ensureLocalDefaultBankAccount() {
  const accounts = state.bankAccounts || [];
  if (!accounts.length || accounts.some((account) => Number(account.isDefault || 0))) return;
  accounts[0].isDefault = 1;
}

function syncDefaultBankSettingsFromState() {
  const bank = defaultBankAccount();
  state.businessSettings = {
    ...defaultBusinessSettings(),
    ...(state.businessSettings || {}),
    bankDetails: bank
      ? {
        bankName: bank.bankName || bank.displayName || "",
        accountNo: bank.accountNo || "",
        ifsc: String(bank.ifsc || "").toUpperCase(),
        upiId: bank.upiId || "",
      }
      : {
        ...(state.businessSettings?.bankDetails || {}),
        bankName: "",
        accountNo: "",
        ifsc: "",
        upiId: "",
      },
  };
}

function syncTemplate() {
  return `
    <section class="report-page">
      <header class="app-page-header"><div><p class="muted-label">Data</p><h1>Sync, Share & Backup</h1></div></header>
      <section class="kpi-grid">
        ${kpiCard("Database", "SQLite", "Local data file")}
        ${kpiCard("Backup", "Manual", "Save a copy when needed")}
        ${kpiCard("Login", "Demo", "Email OTP planned")}
        ${kpiCard("Sync", "Offline", "Cloud sync not enabled")}
      </section>
      <section class="data-table-card report-card backup-panel">
        <article>
          <h3>Local SQLite Backup</h3>
          <p>Create a copy of the current GI Billing SQLite database. Use this before major imports, updates, or sending data to an accountant.</p>
          <div class="backup-actions" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <button class="primary-button square" data-action="backup-db" type="button">Backup SQLite Database</button>
            <button class="secondary-button square" data-action="restore-db" type="button">Restore SQLite Database</button>
            <span id="backupStatus">Ready to create or restore a backup.</span>
          </div>
        </article>
      </section>
    </section>
  `;
}

function partiesTemplate(selectedPartyId = null, activeTab = "overview", query = partySearchQuery) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const allParties = state.parties || [];
  const f = partyAdvancedFilter;
  const searchedParties = normalizedQuery
    ? allParties.filter((party) => partyMatchesQuery(party, normalizedQuery))
    : allParties;
  const parties = applyPartyAdvancedFilter(searchedParties, f);
  const activeFilterCount = countActiveFilters(f);
  const selectedParty = parties.find((party) => Number(party.id) === Number(selectedPartyId)) || parties[0];
  const selectedId = selectedParty?.id || "";
  const listMeta = normalizedQuery || activeFilterCount > 0
    ? `${parties.length} of ${allParties.length} parties`
    : `${allParties.length} part${allParties.length === 1 ? "y" : "ies"}`;

  // Build state options from existing party states
  const partyStates = [...new Set((allParties).map((p) => p.state || "").filter(Boolean))].sort();

  return `
    <section class="parties-page">
      <header class="feature-titlebar">
        <div><p class="muted-label">Manage</p><h1>Parties</h1></div>
        <button class="primary-button square" type="button" data-action="add-party">+ Add Party</button>
      </header>

      <div class="party-filter-bar">
        <label class="party-search"><span>Search</span><input id="partySearchInput" value="${escapeHtml(String(query || ""))}" placeholder="Name, phone"></label>
        <div class="party-filter-pills">
          <button class="party-filter-pill ${f.balanceType === "all" ? "active" : ""}" data-party-balance-filter="all" type="button">All</button>
          <button class="party-filter-pill ${f.balanceType === "receivable" ? "active" : ""}" data-party-balance-filter="receivable" type="button"><span class="pill-dot green"></span>Receivable</button>
          <button class="party-filter-pill ${f.balanceType === "payable" ? "active" : ""}" data-party-balance-filter="payable" type="button"><span class="pill-dot red"></span>Payable</button>
          <button class="party-filter-pill ${f.balanceType === "zero" ? "active" : ""}" data-party-balance-filter="zero" type="button">Zero Balance</button>
        </div>
        ${partyStates.length ? `
          <label class="adv-filter-field" style="min-width:160px">
            <span>State</span>
            <select class="form-input compact-input" id="partyStateFilter">
              <option value="">All States</option>
              ${partyStates.map((s) => `<option value="${escapeHtml(s)}" ${f.state === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
            </select>
          </label>
        ` : ""}
        ${activeFilterCount > 0 ? `<button class="filter-clear-btn" type="button" id="clearPartyFilters">Clear</button>` : ""}
      </div>

      <div class="parties-layout">
        <aside class="party-list-panel">
          <div class="party-list-meta">${escapeHtml(listMeta)}</div>
          <div class="party-list">
            ${parties.map((party) => partyListButton(party, selectedId)).join("") || '<div class="empty-table">No parties match the current filters.</div>'}
          </div>
        </aside>
        <main class="party-detail-panel">
          ${selectedParty ? partyDetail(selectedParty, activeTab) : emptyPartyDetail()}
        </main>
      </div>
    </section>
  `;
}

function applyPartyAdvancedFilter(parties, f) {
  return parties.filter((party) => {
    const balance = Number(party.balance || 0);
    if (f.balanceType === "receivable" && balance <= 0) return false;
    if (f.balanceType === "payable" && balance >= 0) return false;
    if (f.balanceType === "zero" && balance !== 0) return false;
    if (f.state && String(party.state || "").toLowerCase() !== f.state.toLowerCase()) return false;
    return true;
  });
}

function partyListButton(party, selectedId) {
  const balance = Number(party.balance || 0);
  const balanceClass = balance >= 0 ? "receivable-text" : "payable-text";
  const role = partyRole(party);
  const contact = party.phone || party.email || party.gstin || "No contact details";
  return `
    <button class="party-list-item ${Number(party.id) === Number(selectedId) ? "active" : ""}" data-party-id="${party.id}" type="button">
      <span class="party-list-main"><strong>${escapeHtml(party.name)}</strong><small>${escapeHtml(contact)}</small></span>
      <span class="party-list-side"><em class="party-role-badge ${role.className}">${role.label}</em><b class="${balanceClass}">${formatCurrency(Math.abs(balance))}</b></span>
    </button>
  `;
}

function partyDetail(party, activeTab) {
  const tabs = ["overview", "ledger", "transactions", "payments", "notes"];
  const role = partyRole(party);
  const safeActiveTab = activeTab === "statement" ? "ledger" : activeTab;
  const partyMeta = [party.phone, party.gstin ? `GSTIN ${party.gstin}` : ""]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" - ");
  return `
    <section class="party-detail">
      <header class="party-detail-head">
        <div>
          <h2>${escapeHtml(party.name)} <span class="party-role-badge ${role.className}">${role.label}</span></h2>
          <p>${partyMeta || "No contact details"}</p>
        </div>
        <button class="secondary-button" type="button" data-action="edit-party" data-party-id="${party.id}">Edit Party</button>
      </header>
      <div class="party-balance-grid">
        <article><span>Receivable</span><strong>${formatCurrency(party.receivable || 0)}</strong></article>
        <article><span>Payable</span><strong>${formatCurrency(party.payable || 0)}</strong></article>
        <article><span>Net Balance</span><strong>${formatCurrency(Math.abs(Number(party.balance || 0)))}</strong></article>
        <article><span>Last Activity</span><strong>${formatDate(party.lastActivity)}</strong></article>
      </div>
      <nav class="party-tabs">
        ${tabs.map((tab) => `<button class="${tab === safeActiveTab ? "active" : ""}" data-party-id="${party.id}" data-party-tab="${tab}" type="button">${titleCase(tab)}</button>`).join("")}
      </nav>
      <div class="party-tab-body">${partyTabContent(party, safeActiveTab)}</div>
    </section>
  `;
}

function partyTabContent(party, activeTab) {
  if (activeTab === "transactions") return partyTransactionsTable(party);
  if (activeTab === "ledger") return partyLedgerTable(party);
  if (activeTab === "payments") return partyPaymentsTable(party);
  if (activeTab === "notes") return `<section class="party-notes"><h3>Notes</h3><p>${escapeHtml(party.notes || "No notes added.")}</p></section>`;

  return `
    <section class="party-overview-grid">
      <article class="party-overview-wide">
        <h3>Account Summary</h3>
        <div class="party-summary-list">
          <span>Opening Balance <strong>${formatCurrency(party.openingBalance || 0)}</strong></span>
          <span>Receivable <strong>${formatCurrency(party.receivable || 0)}</strong></span>
          <span>Payable <strong>${formatCurrency(party.payable || 0)}</strong></span>
        </div>
      </article>
      <article><h3>Contact</h3><p>Phone: ${escapeHtml(party.phone || "-")}</p><p>Email: ${escapeHtml(party.email || "-")}</p><p>Contact Person: ${escapeHtml(party.contactPerson || "-")}</p></article>
      <article><h3>Tax Details</h3><p>Type: ${escapeHtml(partyTaxLabel(party.taxType))}</p><p>GSTIN: ${escapeHtml(party.gstin || "-")}</p><p>Legal Name: ${escapeHtml(party.legalName || "-")}</p><p>State: ${escapeHtml(party.state || "-")}</p><p>PAN: ${escapeHtml(party.pan || "-")}</p></article>
      <article><h3>Billing Address</h3><p>${escapeHtml(party.billingAddress || "-")}</p></article>
      <article><h3>Shipping Address</h3><p>${escapeHtml(party.shippingAddress || "-")}</p></article>
      <article><h3>Terms</h3><p>Payment Terms: ${escapeHtml(party.paymentTerms || "-")}</p><p>Due Days: ${Number(party.dueDays || 0) || "-"}</p><p>Credit Limit: ${formatCurrency(party.creditLimit || 0)}</p></article>
    </section>
  `;
}

function partyTransactionsTable(party) {
  const rows = (state.invoices || []).filter((invoice) => invoice.party === party.name);
  return basicPartyTable(["Date", "No", "Type", "Status", "Total", "Balance"], rows.map((row) => [
    formatDate(row.date), row.invoiceNo, row.type, row.status, formatCurrency(row.total), formatCurrency(row.balance),
  ]), "No transactions found.");
}

function partyLedgerTable(party) {
  const invoices = (state.invoices || []).filter((invoice) => invoice.party === party.name);
  const payments = (state.payments || []).filter((payment) => payment.party === party.name);
  const rows = [
    ...invoices.map((invoice) => ({ date: invoice.date, type: invoice.type, ref: invoice.invoiceNo, debit: invoice.type === "sale" ? invoice.total : 0, credit: invoice.type === "purchase" ? invoice.total : 0 })),
    ...payments.map((payment) => ({ date: payment.paymentDate, type: payment.type, ref: payment.method, debit: payment.type === "payment_out" ? payment.amount : 0, credit: payment.type === "payment_in" ? payment.amount : 0 })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = Number(party.openingBalance || 0);
  return basicPartyTable(["Date", "Type", "Ref", "Debit", "Credit", "Balance"], rows.map((row) => {
    running += Number(row.debit || 0) - Number(row.credit || 0);
    return [formatDate(row.date), row.type, row.ref, formatCurrency(row.debit), formatCurrency(row.credit), formatCurrency(Math.abs(running))];
  }), "No ledger entries found.");
}

function partyMatchesQuery(party, query) {
  return [
    party.name,
    party.phone,
    party.contactPerson,
    party.legalName,
    party.state,
    party.pan,
    partyTaxLabel(party.taxType),
    partyRole(party).label,
  ].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function partyTaxLabel(value) {
  return {
    gst_registered: "GST Registered",
    unregistered: "Unregistered / Consumer",
    composition: "Composition Dealer",
    overseas: "Overseas / Export",
  }[value] || "Unregistered / Consumer";
}

function partyRole(party) {
  const invoices = state.invoices || [];
  const hasSale = invoices.some((invoice) => invoice.party === party.name && invoice.type === "sale");
  const hasPurchase = invoices.some((invoice) => invoice.party === party.name && invoice.type === "purchase");
  if (hasSale && hasPurchase) return { label: "Both", className: "both" };
  if (hasSale) return { label: "Customer", className: "customer" };
  if (hasPurchase) return { label: "Supplier", className: "supplier" };
  return { label: "Party", className: "neutral" };
}

function partyPaymentsTable(party) {
  const rows = (state.payments || []).filter((payment) => payment.party === party.name);
  return basicPartyTable(["Date", "Type", "Method", "Amount", "Notes"], rows.map((row) => [
    formatDate(row.paymentDate), row.type, row.method, formatCurrency(row.amount), row.notes || "-",
  ]), "No payments found.");
}

function basicPartyTable(headers, rows, emptyText) {
  return `
    <div class="table-card">
      <table>
        <thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      <div class="empty-table ${rows.length ? "hidden" : ""}">${emptyText}</div>
    </div>
  `;
}

function emptyPartyDetail() {
  return `<div class="feature-empty-card"><strong>No parties yet</strong><p>Add customers and suppliers to track balances.</p></div>`;
}

function titleCase(value) {
  return String(value).replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

function itemsTemplate(selectedItemId = null, activeTab = "overview", query = itemSearchQuery) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const allItems = state.items || [];
  const f = itemAdvancedFilter;
  const searchedItems = normalizedQuery
    ? allItems.filter((item) => itemMatchesQuery(item, normalizedQuery))
    : allItems;
  const items = applyItemAdvancedFilter(searchedItems, f);
  const activeFilterCount = countActiveFilters(f);
  const selectedItem = items.find((item) => Number(item.id) === Number(selectedItemId)) || items[0];
  const selectedId = selectedItem?.id || "";
  const stats = itemSummaryStats(allItems);
  const listMeta = normalizedQuery || activeFilterCount > 0
    ? `${items.length} of ${allItems.length} items`
    : `${allItems.length} item${allItems.length === 1 ? "" : "s"}`;

  // Build category list from items
  const categories = [...new Set(allItems.map((item) => item.category || "").filter(Boolean))].sort();

  return `
    <section class="items-page">
      <header class="feature-titlebar">
        <div><p class="muted-label">Inventory</p><h1>Items</h1></div>
        <div class="title-actions">
          <button class="secondary-button" type="button" data-action="manage-item-masters">Units &amp; Categories</button>
          <button class="secondary-button" type="button" data-action="import-items">Import Items</button>
          <button class="primary-button square" type="button" data-action="add-item">+ Add Item</button>
        </div>
      </header>
      <section class="item-summary-row">
        <article><span>Total Items</span><strong>${stats.totalItems}</strong></article>
        <article><span>Total Stock Qty</span><strong>${formatQuantity(stats.totalQty)}</strong></article>
        <article><span>Stock Value</span><strong>${formatCurrency(stats.stockValue)}</strong></article>
        <article><span>Services</span><strong>${stats.services}</strong></article>
      </section>

      <div class="item-filter-bar">
        <label class="item-search"><span>Search</span><input id="itemSearchInput" value="${escapeHtml(String(query || ""))}" placeholder="Name, SKU, HSN/SAC, category"></label>
        <div class="party-filter-pills">
          <button class="party-filter-pill ${f.itemType === "all" ? "active" : ""}" data-item-type-filter="all" type="button">All</button>
          <button class="party-filter-pill ${f.itemType === "product" ? "active" : ""}" data-item-type-filter="product" type="button">Products</button>
          <button class="party-filter-pill ${f.itemType === "service" ? "active" : ""}" data-item-type-filter="service" type="button">Services</button>
        </div>
        <div class="party-filter-pills">
          <button class="party-filter-pill ${f.stockLevel === "all" ? "active" : ""}" data-item-stock-filter="all" type="button">All Stock</button>
          <button class="party-filter-pill ${f.stockLevel === "instock" ? "active" : ""}" data-item-stock-filter="instock" type="button"><span class="pill-dot green"></span>In Stock</button>
          <button class="party-filter-pill ${f.stockLevel === "low" ? "active" : ""}" data-item-stock-filter="low" type="button"><span class="pill-dot amber"></span>Low Stock</button>
          <button class="party-filter-pill ${f.stockLevel === "out" ? "active" : ""}" data-item-stock-filter="out" type="button"><span class="pill-dot red"></span>Out of Stock</button>
        </div>
        ${categories.length ? `
          <label class="adv-filter-field" style="min-width:160px">
            <span>Category</span>
            <select class="form-input compact-input" id="itemCategoryFilter">
              <option value="">All Categories</option>
              ${categories.map((c) => `<option value="${escapeHtml(c)}" ${f.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
            </select>
          </label>
        ` : ""}
        ${activeFilterCount > 0 ? `<button class="filter-clear-btn" type="button" id="clearItemFilters">Clear</button>` : ""}
      </div>

      <div class="items-layout">
        <aside class="item-list-panel">
          <div class="item-list-meta">${escapeHtml(listMeta)}</div>
          <div class="item-list">
            ${items.map((item) => itemListButton(item, selectedId)).join("") || '<div class="empty-table">No items match the current filters.</div>'}
          </div>
        </aside>
        <main class="item-detail-panel">
          ${selectedItem ? itemDetail(selectedItem, activeTab) : emptyItemDetail()}
        </main>
      </div>
    </section>
  `;
}

function applyItemAdvancedFilter(items, f) {
  return items.filter((item) => {
    if (f.itemType && f.itemType !== "all") {
      if (String(item.itemType || "product") !== f.itemType) return false;
    }
    if (f.category) {
      if (String(item.category || "") !== f.category) return false;
    }
    if (f.stockLevel && f.stockLevel !== "all") {
      const stock = Number(item.currentStock != null ? item.currentStock : item.openingStock != null ? item.openingStock : 0);
      if (f.stockLevel === "instock" && stock <= 0) return false;
      if (f.stockLevel === "low" && (stock <= 0 || stock > 10)) return false;
      if (f.stockLevel === "out" && stock > 0) return false;
    }
    return true;
  });
}

function itemMastersTemplate() {
  const units = state.units || [];
  const categories = state.itemCategories || [];
  return `
    <section class="masters-page">
      <header class="feature-titlebar">
        <div><p class="muted-label">Inventory setup</p><h1>Units & Categories</h1></div>
        <button class="secondary-button" type="button" data-action="back-to-items">Back to Items</button>
      </header>
      <div class="masters-tabs">
        <button class="masters-tab active" data-masters-tab="units">Units <span class="masters-tab-count">${units.length}</span></button>
        <button class="masters-tab" data-masters-tab="categories">Categories <span class="masters-tab-count">${categories.length}</span></button>
      </div>
      <div class="masters-tab-content" id="mastersTabContent">
        ${mastersUnitsTab(units)}
      </div>
    </section>
  `;
}

function mastersUnitsTab(units) {
  return `
    <div class="masters-toolbar">
      <input class="form-input masters-search" id="unitSearchInput" placeholder="Search units...">
      <button class="primary-button square" type="button" id="addUnitBtn">+ Add Unit</button>
    </div>
    <div class="masters-table-wrap">
      <table class="masters-table">
        <thead><tr><th>Name</th><th>Short Name</th><th>Code</th><th>Decimal</th><th>Items</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="unitsTableBody">
          ${units.map((u) => `<tr data-unit-id="${u.id}" class="${u.is_active ? '' : 'inactive-row'}">
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td>${escapeHtml(u.short_name || '-')}</td>
            <td>${escapeHtml(u.code || '-')}</td>
            <td>${u.allows_decimal_quantity ? 'Yes' : 'No'}</td>
            <td>${u.item_count || 0}</td>
            <td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
            <td class="masters-actions">
              <button class="icon-btn" data-edit-unit="${u.id}" title="Edit">${icon('edit')}</button>
              <button class="icon-btn" data-toggle-unit="${u.id}" data-active="${u.is_active}" title="${u.is_active ? 'Deactivate' : 'Activate'}">${u.is_active ? icon('ban') : icon('check')}</button>
              <button class="icon-btn danger" data-delete-unit="${u.id}" title="Delete">${icon('trash')}</button>
            </td>
          </tr>`).join('')}
          ${units.length === 0 ? '<tr><td colspan="7" class="masters-empty">No units yet. Click "+ Add Unit" to create one.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

function mastersCategoriesTab(categories) {
  const rootCategories = categories.filter((c) => !c.parent_category_id);
  const childMap = {};
  categories.forEach((c) => {
    if (c.parent_category_id) {
      if (!childMap[c.parent_category_id]) childMap[c.parent_category_id] = [];
      childMap[c.parent_category_id].push(c);
    }
  });
  function renderCatRow(cat, depth, visited) {
    if (!visited) visited = new Set();
    if (visited.has(cat.id) || depth > 10) return '';
    visited.add(cat.id);
    const children = childMap[cat.id] || [];
    const indent = depth * 20;
    let html = `<tr data-cat-id="${cat.id}" class="${cat.is_active ? '' : 'inactive-row'}">
      <td><span style="padding-left:${indent}px">${depth > 0 ? '<span class="tree-indent">└</span> ' : ''}<strong>${escapeHtml(cat.name)}</strong></span></td>
      <td>${escapeHtml(cat.code || '-')}</td>
      <td>${escapeHtml(cat.description || '-')}</td>
      <td>${cat.item_count || 0}</td>
      <td><span class="status-badge ${cat.is_active ? 'active' : 'inactive'}">${cat.is_active ? 'Active' : 'Inactive'}</span></td>
      <td class="masters-actions">
        <button class="icon-btn" data-edit-cat="${cat.id}" title="Edit">${icon('edit')}</button>
        <button class="icon-btn" data-add-subcat="${cat.id}" title="Add Subcategory">${icon('plus')}</button>
        <button class="icon-btn" data-toggle-cat="${cat.id}" data-active="${cat.is_active}" title="${cat.is_active ? 'Deactivate' : 'Activate'}">${cat.is_active ? icon('ban') : icon('check')}</button>
        <button class="icon-btn danger" data-delete-cat="${cat.id}" title="Delete">${icon('trash')}</button>
      </td>
    </tr>`;
    children.forEach((child) => { html += renderCatRow(child, depth + 1, visited); });
    return html;
  }
  const rows = rootCategories.map((c) => renderCatRow(c, 0)).join('');
  return `
    <div class="masters-toolbar">
      <input class="form-input masters-search" id="categorySearchInput" placeholder="Search categories...">
      <button class="primary-button square" type="button" id="addCategoryBtn">+ Add Category</button>
    </div>
    <div class="masters-table-wrap">
      <table class="masters-table">
        <thead><tr><th>Name</th><th>Code</th><th>Description</th><th>Items</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="categoriesTableBody">
          ${rows || '<tr><td colspan="6" class="masters-empty">No categories yet. Click "+ Add Category" to create one.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function openMasterFormModal(kind, record = null, parentId = null) {
  const existing = document.querySelector(".masters-form-backdrop");
  if (existing) existing.remove();
  const isEdit = Boolean(record);
  const title = kind === "unit" ? (isEdit ? "Edit Unit" : "Add Unit") : (isEdit ? "Edit Category" : (parentId ? "Add Subcategory" : "Add Category"));
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop masters-form-backdrop";
  if (kind === "unit") {
    backdrop.innerHTML = `
      <section class="masters-form-dialog" role="dialog" aria-modal="true" aria-label="${title}">
        <header><strong>${title}</strong><button class="close-button" type="button" data-close-masters-form>&times;</button></header>
        <form id="mastersUnitForm" class="masters-form-body">
          <label>Unit Name *<input class="form-input" name="name" value="${escapeHtml(record?.name || '')}" required maxlength="50"></label>
          <label>Short Name<input class="form-input" name="short_name" value="${escapeHtml(record?.short_name || '')}" placeholder="e.g. pcs, kg, m" maxlength="20"></label>
          <label>Code<input class="form-input" name="code" value="${escapeHtml(record?.code || '')}" placeholder="e.g. PCS, KG" maxlength="20"></label>
          <label>Description<input class="form-input" name="description" value="${escapeHtml(record?.description || '')}" placeholder="Optional description" maxlength="200"></label>
          <label class="masters-checkbox-label"><input type="checkbox" name="allows_decimal_quantity" ${record?.allows_decimal_quantity ? 'checked' : ''}> Allow decimal quantities (e.g. 2.5 kg)</label>
          <footer class="masters-form-actions">
            <button class="secondary-button" type="button" data-close-masters-form>Cancel</button>
            <button class="primary-button square" type="submit">${isEdit ? 'Update' : 'Create'}</button>
          </footer>
        </form>
      </section>`;
  } else {
    const allCats = state.itemCategories || [];
    const parentOptions = allCats.filter((c) => c.is_active && c.id !== record?.id).map((c) => `<option value="${c.id}" ${c.id === (record?.parent_category_id || parentId) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    backdrop.innerHTML = `
      <section class="masters-form-dialog" role="dialog" aria-modal="true" aria-label="${title}">
        <header><strong>${title}</strong><button class="close-button" type="button" data-close-masters-form>&times;</button></header>
        <form id="mastersCategoryForm" class="masters-form-body">
          <label>Category Name *<input class="form-input" name="name" value="${escapeHtml(record?.name || '')}" required maxlength="100"></label>
          <label>Code<input class="form-input" name="code" value="${escapeHtml(record?.code || '')}" placeholder="e.g. FOOD, ELEC" maxlength="20"></label>
          <label>Parent Category<select class="form-input" name="parent_category_id"><option value="">None (Root)</option>${parentOptions}</select></label>
          <label>Description<textarea class="form-input" name="description" rows="2" maxlength="500">${escapeHtml(record?.description || '')}</textarea></label>
          <footer class="masters-form-actions">
            <button class="secondary-button" type="button" data-close-masters-form>Cancel</button>
            <button class="primary-button square" type="submit">${isEdit ? 'Update' : 'Create'}</button>
          </footer>
        </form>
      </section>`;
  }
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelectorAll("[data-close-masters-form]").forEach((btn) => btn.addEventListener("click", close));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  const form = backdrop.querySelector(`#masters${kind === 'unit' ? 'Unit' : 'Category'}Form`);
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true';
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      if (kind === "unit") {
        const payload = {
          name: fd.get("name"),
          short_name: fd.get("short_name"),
          code: fd.get("code"),
          description: fd.get("description"),
          allows_decimal_quantity: fd.has("allows_decimal_quantity"),
          is_active: record?.is_active ?? true,
        };
        if (isEdit) { payload.id = record.id; state = normalizeState(await window.giDB.updateUnit(payload)); }
        else { state = normalizeState(await window.giDB.createUnit(payload)); }
      } else {
        const payload = {
          name: fd.get("name"),
          code: fd.get("code"),
          description: fd.get("description"),
          parent_category_id: fd.get("parent_category_id") || null,
          is_active: record?.is_active ?? true,
          sort_order: record?.sort_order,
        };
        if (isEdit) { payload.id = record.id; state = normalizeState(await window.giDB.updateItemCategory(payload)); }
        else { state = normalizeState(await window.giDB.createItemCategory(payload)); }
      }
      close();
      renderMastersTabContent();
      showToast(`${kind === 'unit' ? 'Unit' : 'Category'} ${isEdit ? 'updated' : 'created'} successfully.`);
    } catch (err) {
      showToast(err.message || "Failed to save.");
    } finally {
      form.dataset.saving = 'false';
      submitButton.disabled = false;
    }
  });
  form?.querySelector("input[name='name']")?.focus();
}

function renderMastersTabContent() {
  const activeTab = document.querySelector(".masters-tab.active")?.dataset.mastersTab || "units";
  const content = document.getElementById("mastersTabContent");
  if (!content) return;
  if (activeTab === "units") {
    content.innerHTML = mastersUnitsTab(state.units || []);
  } else {
    content.innerHTML = mastersCategoriesTab(state.itemCategories || []);
  }
  bindMastersActions();
}

function bindMastersActions(rowsOnly = false) {
  if (!rowsOnly) {
  document.querySelectorAll('.masters-tab, #addUnitBtn, #addCategoryBtn').forEach((node) => node.replaceWith(node.cloneNode(true)));
  document.querySelector("[data-masters-tab='units']")?.addEventListener("click", () => {
    document.querySelectorAll(".masters-tab").forEach((t) => t.classList.remove("active"));
    document.querySelector("[data-masters-tab='units']")?.classList.add("active");
    renderMastersTabContent();
  });
  document.querySelector("[data-masters-tab='categories']")?.addEventListener("click", () => {
    document.querySelectorAll(".masters-tab").forEach((t) => t.classList.remove("active"));
    document.querySelector("[data-masters-tab='categories']")?.classList.add("active");
    renderMastersTabContent();
  });
  document.getElementById("addUnitBtn")?.addEventListener("click", () => openMasterFormModal("unit"));
  document.getElementById("addCategoryBtn")?.addEventListener("click", () => openMasterFormModal("category"));
  }
  document.querySelectorAll("[data-edit-unit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.editUnit);
      const record = (state.units || []).find((u) => u.id === id);
      if (record) openMasterFormModal("unit", record);
    });
  });
  document.querySelectorAll("[data-edit-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.editCat);
      const record = (state.itemCategories || []).find((c) => c.id === id);
      if (record) openMasterFormModal("category", record);
    });
  });
  document.querySelectorAll("[data-add-subcat]").forEach((btn) => {
    btn.addEventListener("click", () => openMasterFormModal("category", null, Number(btn.dataset.addSubcat)));
  });
  document.querySelectorAll("[data-toggle-unit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.toggleUnit);
      const isActive = btn.dataset.active === "1" || btn.dataset.active === "true";
      try {
        state = normalizeState(await window.giDB.toggleUnitActive({ id, is_active: !isActive }));
        renderMastersTabContent();
      } catch (err) { showToast(err.message || "Failed to update."); }
    });
  });
  document.querySelectorAll("[data-toggle-cat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.toggleCat);
      const isActive = btn.dataset.active === "1" || btn.dataset.active === "true";
      try {
        state = normalizeState(await window.giDB.toggleItemCategoryActive({ id, is_active: !isActive }));
        renderMastersTabContent();
      } catch (err) { showToast(err.message || "Failed to update."); }
    });
  });
  document.querySelectorAll("[data-delete-unit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.deleteUnit);
      if (!confirm("Delete this unit? This cannot be undone.")) return;
      try {
        state = normalizeState(await window.giDB.deleteUnit({ id }));
        renderMastersTabContent();
        showToast("Unit deleted.");
      } catch (err) { showToast(err.message || "Cannot delete."); }
    });
  });
  document.querySelectorAll("[data-delete-cat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.deleteCat);
      if (!confirm("Delete this category? This cannot be undone.")) return;
      try {
        state = normalizeState(await window.giDB.deleteItemCategory({ id }));
        renderMastersTabContent();
        showToast("Category deleted.");
      } catch (err) { showToast(err.message || "Cannot delete."); }
    });
  });
  if (rowsOnly) return;
  const unitSearch = document.getElementById("unitSearchInput");
  unitSearch?.addEventListener("input", () => {
    const q = unitSearch.value.toLowerCase();
    const filtered = (state.units || []).filter((u) => u.name.toLowerCase().includes(q) || (u.code || "").toLowerCase().includes(q) || (u.short_name || "").toLowerCase().includes(q));
    document.getElementById("unitsTableBody").innerHTML = filtered.map((u) => `<tr data-unit-id="${u.id}" class="${u.is_active ? '' : 'inactive-row'}">
      <td><strong>${escapeHtml(u.name)}</strong></td><td>${escapeHtml(u.short_name || '-')}</td><td>${escapeHtml(u.code || '-')}</td><td>${u.allows_decimal_quantity ? 'Yes' : 'No'}</td><td>${u.item_count || 0}</td>
      <td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td class="masters-actions"><button class="icon-btn" data-edit-unit="${u.id}" title="Edit">${icon('edit')}</button><button class="icon-btn" data-toggle-unit="${u.id}" data-active="${u.is_active}" title="${u.is_active ? 'Deactivate' : 'Activate'}">${u.is_active ? icon('ban') : icon('check')}</button><button class="icon-btn danger" data-delete-unit="${u.id}" title="Delete">${icon('trash')}</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="masters-empty">No matching units.</td></tr>';
    bindMastersActions(true);
  });
  const catSearch = document.getElementById("categorySearchInput");
  catSearch?.addEventListener("input", () => {
    const q = catSearch.value.toLowerCase();
    const allCats = state.itemCategories || [];
    const filtered = allCats.filter((c) => c.name.toLowerCase().includes(q) || (c.code || "").toLowerCase().includes(q));
    const ancestorIds = new Set();
    filtered.forEach((c) => {
      let pid = c.parent_category_id;
      while (pid && !ancestorIds.has(pid)) { ancestorIds.add(pid); const parent = allCats.find((p) => p.id === pid); pid = parent ? parent.parent_category_id : null; }
    });
    const ensureAncestors = [...filtered];
    ancestorIds.forEach((id) => { if (!ensureAncestors.find((c) => c.id === id)) { const cat = allCats.find((c) => c.id === id); if (cat) ensureAncestors.push(cat); } });
    const rootCats = ensureAncestors.filter((c) => !c.parent_category_id);
    const childMap = {};
    ensureAncestors.forEach((c) => { if (c.parent_category_id) { if (!childMap[c.parent_category_id]) childMap[c.parent_category_id] = []; childMap[c.parent_category_id].push(c); } });
    function renderRow(cat, depth, visited) {
      if (!visited) visited = new Set();
      if (visited.has(cat.id) || depth > 10) return '';
      visited.add(cat.id);
      const children = childMap[cat.id] || [];
      let html = `<tr data-cat-id="${cat.id}" class="${cat.is_active ? '' : 'inactive-row'}"><td><span style="padding-left:${depth*20}px">${depth>0?'<span class="tree-indent">└</span> ':''}<strong>${escapeHtml(cat.name)}</strong></span></td><td>${escapeHtml(cat.code||'-')}</td><td>${escapeHtml(cat.description||'-')}</td><td>${cat.item_count||0}</td><td><span class="status-badge ${cat.is_active?'active':'inactive'}">${cat.is_active?'Active':'Inactive'}</span></td><td class="masters-actions"><button class="icon-btn" data-edit-cat="${cat.id}" title="Edit">${icon('edit')}</button><button class="icon-btn" data-add-subcat="${cat.id}" title="Add Subcategory">${icon('plus')}</button><button class="icon-btn" data-toggle-cat="${cat.id}" data-active="${cat.is_active}" title="${cat.is_active?'Deactivate':'Activate'}">${cat.is_active?icon('ban'):icon('check')}</button><button class="icon-btn danger" data-delete-cat="${cat.id}" title="Delete">${icon('trash')}</button></td></tr>`;
      children.forEach((child) => { html += renderRow(child, depth + 1, visited); });
      return html;
    }
    document.getElementById("categoriesTableBody").innerHTML = rootCats.map((c) => renderRow(c, 0)).join('') || '<tr><td colspan="6" class="masters-empty">No matching categories.</td></tr>';
    bindMastersActions(true);
  });
}

function itemListButton(item, selectedId) {
  const kind = itemKind(item);
  const meta = [item.sku ? `SKU ${item.sku}` : "", item.hsnSac ? `HSN/SAC ${item.hsnSac}` : "", item.category, item.unit ? `Unit ${item.unit}` : ""].filter(Boolean).join(" - ") || "No item details";
  const qty = Number(item.currentStock || 0);
  return `
    <button class="item-list-item ${Number(item.id) === Number(selectedId) ? "active" : ""}" data-item-id="${item.id}" type="button">
      <span class="item-list-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(meta)}</small></span>
      <span class="item-list-side"><em class="item-kind-badge ${kind.className}">${kind.label}</em><b>${formatQuantity(qty)}</b></span>
    </button>
  `;
}

function itemDetail(item, activeTab) {
  const tabs = ["overview", "stockLedger", "pricing", "sales", "purchases", "notes"];
  const safeActiveTab = tabs.includes(activeTab) ? activeTab : "overview";
  const kind = itemKind(item);
  const stockValue = Number(item.currentStock || 0) * Number(item.purchasePrice || 0);
  const meta = [item.sku ? `SKU ${item.sku}` : "", item.hsnSac ? `HSN/SAC ${item.hsnSac}` : "", item.category, item.unit ? `Unit ${item.unit}` : ""].filter(Boolean).join(" - ");

  return `
    <section class="item-detail">
      <header class="item-detail-head">
        <div>
          <h2>${escapeHtml(item.name)} <span class="item-kind-badge ${kind.className}">${kind.label}</span></h2>
          <p>${escapeHtml(meta || "No item details")}</p>
        </div>
        <button class="secondary-button" type="button" data-action="edit-item" data-item-id="${item.id}">Edit Item</button>
      </header>
      <div class="item-metric-grid">
        <article><span>Current Stock</span><strong>${formatQuantity(item.currentStock || 0)}</strong></article>
        <article><span>Sale Price</span><strong>${formatCurrency(item.salePrice || 0)}</strong></article>
        <article><span>Purchase Price</span><strong>${formatCurrency(item.purchasePrice || 0)}</strong></article>
        <article><span>Stock Value</span><strong>${formatCurrency(stockValue)}</strong></article>
      </div>
      <nav class="item-tabs">
        ${tabs.map((tab) => `<button class="${tab === safeActiveTab ? "active" : ""}" data-item-id="${item.id}" data-item-tab="${tab}" type="button">${itemTabLabel(tab)}</button>`).join("")}
      </nav>
      <div class="item-tab-body">${itemTabContent(item, safeActiveTab)}</div>
    </section>
  `;
}

function itemTabContent(item, activeTab) {
  if (activeTab === "stockLedger") return itemStockLedgerTable(item);
  if (activeTab === "pricing") return itemPricingPanel(item);
  if (activeTab === "sales") return itemInvoiceTable(item, "sale");
  if (activeTab === "purchases") return itemInvoiceTable(item, "purchase");
  if (activeTab === "notes") return `<section class="item-notes"><h3>Notes</h3><p>${escapeHtml(item.notes || "No notes added.")}</p></section>`;

  return `
    <section class="item-overview-grid">
      <article><h3>Basic Details</h3><p>Type: ${escapeHtml(itemKind(item).label)}</p><p>SKU: ${escapeHtml(item.sku || "-")}</p><p>HSN/SAC: ${escapeHtml(item.hsnSac || "-")}</p><p>Category: ${escapeHtml(item.category || "-")}</p><p>Unit: ${escapeHtml(item.unit || "-")}</p></article>
      <article><h3>Stock Position</h3><p>Opening Stock: ${formatQuantity(item.openingStock || 0)}</p><p>Current Stock: ${formatQuantity(item.currentStock || 0)}</p><p>Opening Date: ${formatDate(item.openingStockDate)}</p><p>Opening Value: ${formatCurrency(item.openingStockValue || 0)}</p><p>Storage: ${escapeHtml(item.storageLocation || "-")}</p></article>
      <article><h3>Rates</h3><p>Sale Price: ${formatCurrency(item.salePrice || 0)}</p><p>Sale Type: ${escapeHtml(priceTaxTypeLabel(item.saleTaxType))}</p><p>Purchase Price: ${formatCurrency(item.purchasePrice || 0)}</p><p>Purchase Type: ${escapeHtml(priceTaxTypeLabel(item.purchaseTaxType))}</p><p>GST: ${formatPercent(item.taxRate || 0)}</p></article>
      <article><h3>Invoice Description</h3><p>${escapeHtml(item.description || "-")}</p></article>
      <article><h3>Usage</h3><p>Sales: ${itemInvoiceRows(item, "sale").length}</p><p>Purchases: ${itemInvoiceRows(item, "purchase").length}</p></article>
    </section>
  `;
}

function itemStockLedgerTable(item) {
  const invoiceMap = new Map((state.invoices || []).map((invoice) => [invoice.id, invoice]));
  let running = Number(item.openingStock || 0);
  const rows = (state.stockMovements || [])
    .filter((movement) => itemMovementMatchesItem(movement, item))
    .sort((a, b) => new Date(a.movementDate) - new Date(b.movementDate))
    .map((movement) => {
      const qty = Number(movement.quantity || 0);
      const qtyIn = movement.movementType === "in" || movement.movementType === "adjustment" ? qty : 0;
      const qtyOut = movement.movementType === "out" ? qty : 0;
      running += qtyIn - qtyOut;
      const invoice = invoiceMap.get(movement.invoiceId);
      return [
        formatDate(movement.movementDate),
        movementTypeLabel(movement.movementType),
        invoice?.invoiceNo || movement.transactionId || "-",
        formatQuantity(qtyIn),
        formatQuantity(qtyOut),
        formatQuantity(running),
        formatCurrency(movement.rate || 0),
      ];
    });
  return basicPartyTable(["Date", "Type", "Reference", "Qty In", "Qty Out", "Balance", "Rate"], rows, "No stock movements found.");
}

function itemPricingPanel(item) {
  const purchasePrice = Number(item.purchasePrice || 0);
  const salePrice = Number(item.salePrice || 0);
  const margin = salePrice > 0 && purchasePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : 0;
  return `
    <section class="item-overview-grid">
      <article><h3>Sale Pricing</h3><p>Sale Price: ${formatCurrency(salePrice)}</p><p>Price Type: ${escapeHtml(priceTaxTypeLabel(item.saleTaxType))}</p><p>Default Discount: ${formatCurrency(item.discount || 0)}</p></article>
      <article><h3>Purchase Pricing</h3><p>Purchase Price: ${formatCurrency(purchasePrice)}</p><p>Price Type: ${escapeHtml(priceTaxTypeLabel(item.purchaseTaxType))}</p><p>Margin: ${margin ? `${margin.toFixed(1)}%` : "-"}</p></article>
      <article><h3>Tax</h3><p>HSN/SAC: ${escapeHtml(item.hsnSac || "-")}</p><p>GST Rate: ${formatPercent(item.taxRate || 0)}</p></article>
    </section>
  `;
}

function itemInvoiceTable(item, type) {
  const partyLabel = type === "sale" ? "Customer" : "Supplier";
  const rows = itemInvoiceRows(item, type).map(({ invoice, line }) => [
    formatDate(invoice.date),
    invoice.invoiceNo,
    invoice.party,
    formatQuantity(line.qty),
    formatCurrency(line.price),
    formatCurrency(line.lineTotal),
  ]);
  return basicPartyTable(["Date", "No", partyLabel, "Qty", "Rate", "Amount"], rows, `No ${type === "sale" ? "sales" : "purchases"} found for this item.`);
}

function itemInvoiceRows(item, type) {
  const invoiceMap = new Map((state.invoices || []).map((invoice) => [invoice.id, invoice]));
  return (state.invoiceItems || [])
    .filter((line) => itemLineMatchesItem(line, item))
    .map((line) => ({ line, invoice: invoiceMap.get(line.invoiceId) }))
    .filter(({ invoice }) => invoice && invoice.type === type)
    .sort((a, b) => new Date(b.invoice.date) - new Date(a.invoice.date));
}

function itemMatchesQuery(item, query) {
  return [
    item.name,
    item.sku,
    item.hsnSac,
    item.category,
    item.unit,
    item.description,
    item.storageLocation,
    priceTaxTypeLabel(item.saleTaxType),
    priceTaxTypeLabel(item.purchaseTaxType),
    itemKind(item).label,
  ].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function itemLineMatchesItem(line, item) {
  return Number(line.itemId) === Number(item.id) || String(line.item || "").toLowerCase() === String(item.name || "").toLowerCase();
}

function itemMovementMatchesItem(movement, item) {
  return Number(movement.itemId) === Number(item.id) || String(movement.item || "").toLowerCase() === String(item.name || "").toLowerCase();
}

function itemSummaryStats(items) {
  return items.reduce((stats, item) => {
    const currentStock = Number(item.currentStock || 0);
    const purchasePrice = Number(item.purchasePrice || 0);
    stats.totalItems += 1;
    stats.totalQty += currentStock;
    stats.stockValue += currentStock * purchasePrice;
    if (itemKind(item).label === "Service") stats.services += 1;
    return stats;
  }, { totalItems: 0, totalQty: 0, stockValue: 0, services: 0 });
}

function itemKind(item) {
  const type = String(item.itemType || "").toLowerCase();
  if (type === "service") return { label: "Service", className: "service" };
  if (type === "product") return { label: "Product", className: "product" };
  const category = String(item.category || "").toLowerCase();
  if (category.includes("service")) return { label: "Service", className: "service" };
  return { label: "Product", className: "product" };
}

function priceTaxTypeLabel(value) {
  return {
    with_tax: "With Tax",
    without_tax: "Without Tax",
  }[value] || "Without Tax";
}

function formatPercent(value) {
  const number = Number(value || 0);
  return number ? `${number}%` : "0%";
}

function itemTabLabel(tab) {
  return {
    overview: "Overview",
    stockLedger: "Stock Ledger",
    pricing: "Pricing",
    sales: "Sales",
    purchases: "Purchases",
    notes: "Notes",
  }[tab] || titleCase(tab);
}

function movementTypeLabel(type) {
  return {
    in: "Purchase",
    out: "Sale",
    adjustment: "Adjustment",
  }[type] || titleCase(type);
}

function emptyItemDetail() {
  return `<div class="feature-empty-card"><strong>No items yet</strong><p>Add products or services to start tracking inventory.</p></div>`;
}



function gstSlabRows(lines) {
  const slabs = new Map();
  lines.forEach((line) => {
    const rate = Number(line.taxRate || 0);
    const group = slabs.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    group.taxable += Number(line.taxableValue || 0);
    group.cgst += Number(line.cgstAmount || 0);
    group.sgst += Number(line.sgstAmount || 0);
    group.igst += Number(line.igstAmount || 0);
    group.tax += Number(line.taxAmount || 0);
    slabs.set(rate, group);
  });
  return [0, 5, 12, 18, 28]
    .filter((rate) => slabs.has(rate))
    .map((rate) => {
      const group = slabs.get(rate);
      return [`${rate}%`, formatCurrency(group.taxable), formatCurrency(group.cgst), formatCurrency(group.sgst), formatCurrency(group.igst), formatCurrency(group.tax)];
    });
}

function gstMonthlyBars(invoices) {
  const months = new Map();
  invoices.forEach((invoice) => {
    const key = new Date(invoice.date).toLocaleDateString("en-IN", { month: "short" });
    const group = months.get(key) || { cgst: 0, sgst: 0, igst: 0 };
    group.cgst += Number(invoice.cgstTotal || 0);
    group.sgst += Number(invoice.sgstTotal || 0);
    group.igst += Number(invoice.igstTotal || 0);
    months.set(key, group);
  });
  const max = Math.max(1, ...[...months.values()].map((row) => row.cgst + row.sgst + row.igst));
  return [...months.entries()].map(([month, row]) => {
    const cgstHeight = Math.max(4, (row.cgst / max) * 100);
    const sgstHeight = Math.max(4, (row.sgst / max) * 100);
    const igstHeight = Math.max(4, (row.igst / max) * 100);
    return `<span class="gst-bar"><i style="height:${cgstHeight}%"></i><i style="height:${sgstHeight}%"></i><i style="height:${igstHeight}%"></i><b>${escapeHtml(month)}</b></span>`;
  }).join("") || '<p class="empty-table">No chart data yet.</p>';
}

function gstPieSlices(lines) {
  const rows = gstSlabRows(lines);
  return rows.length
    ? rows.map((row) => `<span><b>${escapeHtml(row[0])}</b>${escapeHtml(row[5])}</span>`).join("")
    : '<p class="empty-table">No slab data yet.</p>';
}

function gstInvoiceRows(invoices) {
  return invoices.map((invoice) => [
    formatDate(invoice.date),
    invoice.invoiceNo,
    invoice.party,
    String(invoice.supplyType || "").toUpperCase() || "-",
    invoice.partyGstin || "-",
    formatCurrency(invoice.subtotal - invoice.discountTotal || 0),
    formatCurrency(invoice.cgstTotal || 0),
    formatCurrency(invoice.sgstTotal || 0),
    formatCurrency(invoice.igstTotal || 0),
    formatCurrency(invoice.total || 0),
  ]);
}

function gstHsnRows(lines) {
  const groups = new Map();
  lines.forEach((line) => {
    const key = line.hsnSac || "Not set";
    const group = groups.get(key) || { qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    group.qty += Number(line.qty || 0);
    group.taxable += Number(line.taxableValue || 0);
    group.cgst += Number(line.cgstAmount || 0);
    group.sgst += Number(line.sgstAmount || 0);
    group.igst += Number(line.igstAmount || 0);
    group.tax += Number(line.taxAmount || 0);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([hsnSac, group]) => [
    hsnSac,
    formatQuantity(group.qty),
    formatCurrency(group.taxable),
    formatCurrency(group.cgst),
    formatCurrency(group.sgst),
    formatCurrency(group.igst),
    formatCurrency(group.tax),
  ]);
}


function reportGroups() {
  return [
    {
      title: "GST",
      note: "Output, input, liability, slabs, GSTR-3B and HSN/SAC.",
      reports: [
        { id: "gstr1", title: "GSTR-1 / Output Tax", note: "Sale invoice GST, B2B/B2C, slabs, HSN." },
        { id: "gstr2", title: "GSTR-2 / Input Tax", note: "Purchase input GST with bill summary." },
        { id: "gstr3b", title: "GSTR-3B Summary", note: "Table 3.1, Table 4 ITC, and Table 6.1 filing summary." },
        { id: "gstLiability", title: "GST Liability", note: "Output minus input and expense GST." },
      ],
    },
    {
      title: "Sales",
      note: "Invoices, collection status and margins.",
      reports: [
        { id: "sale", title: "Sales Register", note: "Invoice, customer, taxable, tax and balance." },
        { id: "profitability", title: "Profitability Report", note: "Bill-wise and item-wise profit margins." },
        { id: "daybook", title: "Day Book", note: "All dated business entries in one view." },
      ],
    },
    {
      title: "Purchase & Accounting",
      note: "Supplier bills, expenses, profit & loss, and trial balance.",
      reports: [
        { id: "purchase", title: "Purchase Register", note: "Bill, supplier, paid and payable." },
        { id: "expenseBreakdown", title: "Expense Breakdown", note: "Category-wise expense analysis and ITC." },
        { id: "profitLoss", title: "Profit & Loss", note: "Sales, purchases, expenses and net profit." },
        { id: "trialBalance", title: "Trial Balance", note: "Double-entry balance check (Debits = Credits)." },
      ],
    },
    {
      title: "Party",
      note: "Statements, receivables, payables and aging.",
      reports: [
        { id: "partyStatement", title: "Party Statement / Ledger", note: "Customer/supplier running balance statement." },
        { id: "partyBalances", title: "Party Balances", note: "Receivable/payable by party." },
        { id: "receivableAging", title: "Receivable Aging", note: "Customer invoices grouped by age." },
        { id: "payableAging", title: "Payable Aging", note: "Supplier bills grouped by age." },
      ],
    },
    {
      title: "Inventory",
      note: "Stock value, item ledger and movement audit.",
      reports: [
        { id: "stock", title: "Stock Summary", note: "Qty, value, HSN/SAC, unit and GST." },
        { id: "itemLedger", title: "Item Ledger", note: "Stock movement history." },
      ],
    },
    {
      title: "Cash & Bank",
      note: "Bank accounts and payment readiness.",
      reports: [
        { id: "cashBank", title: "Bank Accounts", note: "Default bank, balances and invoice print setup." },
      ],
    },
  ];
}

function reportsTemplate(activeReport = "overview") {
  return `
    <section class="reports-layout report-center-shell">
      <aside class="reports-menu report-sidebar">
        <div class="report-sidebar-title">
          <strong>Reports</strong>
          <span>Accountant workspace</span>
        </div>
        <button data-report-view="overview" class="report-nav-button ${activeReport === "overview" ? "active" : ""}" type="button">
          <span>Dashboard</span><small>Report center</small>
        </button>
        ${reportGroups().map((group) => `
          <div class="report-nav-group">
            <p>${escapeHtml(group.title)}</p>
            ${group.reports.map((report) => reportMenuButton(report, activeReport)).join("")}
          </div>
        `).join("")}
      </aside>
      <main class="report-main">${reportContent(activeReport)}</main>
    </section>
  `;
}

function reportMenuButton(report, activeReport) {
  return `
    <button data-report-view="${escapeHtml(report.id)}" class="report-nav-button ${activeReport === report.id ? "active" : ""}" type="button">
      <span>${escapeHtml(report.title)}</span>
      <small>${escapeHtml(report.note)}</small>
    </button>
  `;
}

function reportContent(activeReport) {
  if (activeReport === "overview") return reportOverview();
  if (activeReport === "gstr1") return gstReport("sale");
  if (activeReport === "gstr2") return gstReport("purchase");
  if (activeReport === "gstr3b") return gstr3bReport();
  if (activeReport === "gstLiability") return gstLiabilityReport();
  if (activeReport === "profitability") return profitabilityReport();
  if (activeReport === "purchase") return purchaseReportInner();
  if (activeReport === "expenseBreakdown") return expenseBreakdownReport();
  if (activeReport === "daybook") return dayBookReport();
  if (activeReport === "partyStatement") return partyStatementReport();
  if (activeReport === "partyBalances") return partyBalancesReport();
  if (activeReport === "receivableAging") return agingReport("sale");
  if (activeReport === "payableAging") return agingReport("purchase");
  if (activeReport === "stock") return stockSummaryReport();
  if (activeReport === "itemLedger") return itemLedgerReport();
  if (activeReport === "profitLoss") return profitLossReport();
  if (activeReport === "trialBalance") return trialBalanceReport();
  if (activeReport === "cashBank") return cashBankReport();
  return saleReportDataInner();
}

function reportPageShell({
  activeReport,
  eyebrow = "Reports",
  title,
  summary = "",
  kpis = [],
  body = "",
  exportLabel = "Export CSV",
  exportMessage = "Export placeholder ready.",
  showToolbar = true,
}) {
  return `
    <section class="report-page report-modern-page">
      <header class="app-page-header report-page-header">
        <div>
          <p class="muted-label">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(title)}</h1>
          ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
        </div>
        <div class="report-header-actions">
          <button class="secondary-button compact-button" data-report-tool="export" data-report-message="${escapeHtml(exportMessage)}" type="button">${escapeHtml(exportLabel)}</button>
          <button class="secondary-button compact-button" data-report-tool="export-pdf" type="button">Export PDF</button>
          <button class="secondary-button compact-button" data-report-tool="print" type="button">Print</button>
        </div>
      </header>
      ${showToolbar ? reportFilterToolbar(activeReport) : ""}
      ${kpis.length ? `<section class="kpi-grid report-kpis">${kpis.map((item) => kpiCard(item.label, item.value, item.note, item.tone)).join("")}</section>` : ""}
      <div class="report-content-stack">${body}</div>
    </section>
  `;
}

function reportFilterToolbar(activeReport) {
  const dateScope = reportDateScope();
  const showPartyFilter = ["sale", "purchase", "partyStatement", "receivableAging", "payableAging"].includes(activeReport);
  const showCategoryFilter = ["stock", "itemLedger", "profitability", "expenseBreakdown"].includes(activeReport);

  const parties = (state.parties || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const categories = Array.from(new Set([
    ...(state.itemCategories || []).map((c) => (typeof c === "object" ? c.name : c)),
    ...(state.items || []).map((i) => i.category),
    ...(state.transactions || []).filter((t) => t.type === "expense").map((t) => t.category),
  ])).filter(Boolean).sort();

  const isFiltered = Boolean(reportSearchQuery || reportDateFilter.preset !== "all" || reportPartyFilter || reportCategoryFilter);

  return `
    <section class="app-toolbar report-toolbar">
      <label class="toolbar-search">
        <span>Search report</span>
        <input data-report-search="${escapeHtml(activeReport)}" type="search" value="${escapeHtml(reportSearchQuery)}" placeholder="Search invoice, party, item, GSTIN, status">
      </label>
      <div class="report-date-controls" aria-label="Report date range">
        <label><span>Period</span><select class="form-input" data-report-date-preset="${escapeHtml(activeReport)}">
          <option value="all" ${reportDateFilter.preset === "all" ? "selected" : ""}>All dates</option>
          <option value="thisMonth" ${reportDateFilter.preset === "thisMonth" ? "selected" : ""}>This month</option>
          <option value="lastMonth" ${reportDateFilter.preset === "lastMonth" ? "selected" : ""}>Last month</option>
          <option value="thisQuarter" ${reportDateFilter.preset === "thisQuarter" ? "selected" : ""}>This quarter</option>
          <option value="thisYear" ${reportDateFilter.preset === "thisYear" ? "selected" : ""}>This financial year</option>
          <option value="custom" ${reportDateFilter.preset === "custom" ? "selected" : ""}>Custom range</option>
        </select></label>
        <label class="report-date-input ${reportDateFilter.preset === "custom" ? "" : "hidden"}"><span>From</span><input class="form-input" data-report-date-from type="date" value="${escapeHtml(dateScope.from || "")}"></label>
        <label class="report-date-input ${reportDateFilter.preset === "custom" ? "" : "hidden"}"><span>To</span><input class="form-input" data-report-date-to type="date" value="${escapeHtml(dateScope.to || "")}"></label>
        <span class="report-date-summary">${escapeHtml(formatReportDateScope(dateScope))}</span>
      </div>
      ${showPartyFilter ? `
        <label class="report-filter-select">
          <span>Party</span>
          <select class="form-input" data-report-party-filter="${escapeHtml(activeReport)}">
            <option value="" ${!reportPartyFilter ? "selected" : ""}>All Parties</option>
            ${parties.map((p) => `<option value="${escapeHtml(String(p.id || p.name))}" ${reportPartyFilter === String(p.id || p.name) || (activeReport === "partyStatement" && !reportPartyFilter && p === parties[0]) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </label>
      ` : ""}
      ${showCategoryFilter ? `
        <label class="report-filter-select">
          <span>Category</span>
          <select class="form-input" data-report-category-filter="${escapeHtml(activeReport)}">
            <option value="" ${!reportCategoryFilter ? "selected" : ""}>All Categories</option>
            ${categories.map((c) => `<option value="${escapeHtml(c)}" ${reportCategoryFilter === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </label>
      ` : ""}
      ${isFiltered ? `
        <button class="secondary-button compact-button report-reset-btn" data-report-reset-filters="${escapeHtml(activeReport)}" type="button" title="Clear all filters">Reset</button>
      ` : ""}
    </section>
  `;
}

function reportDateScope() {
  if (reportDateFilter.preset === "custom") return { from: reportDateFilter.from || "", to: reportDateFilter.to || "" };
  if (reportDateFilter.preset === "all") return { from: "", to: "" };
  return datePresetRange(reportDateFilter.preset);
}

function formatReportDateScope({ from, to }) {
  if (!from && !to) return "All dates";
  const display = (value) => {
    const [year, month, day] = String(value).split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  };
  return from && to ? `${display(from)} to ${display(to)}` : from ? `From ${display(from)}` : `Until ${display(to)}`;
}

function reportDateFor(row) {
  return String(row?.date || row?.invoiceDate || row?.paymentDate || row?.transactionDate || row?.movementDate || row?.createdAt || "").slice(0, 10);
}

function isInReportDateScope(row) {
  const { from, to } = reportDateScope();
  const date = reportDateFor(row);
  return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}

function reportInvoicesForType(type) {
  let invoices = activeInvoiceRowsForType(type).filter(isInReportDateScope);
  if (reportPartyFilter) {
    invoices = invoices.filter((inv) => String(inv.partyId || "") === reportPartyFilter || String(inv.party || "") === reportPartyFilter);
  }
  return invoices;
}

function reportOverview() {
  const salesTotals = reportInvoiceTotals("sale");
  const purchaseTotals = reportInvoiceTotals("purchase");
  const outputTax = reportTaxTotals("sale");
  const inputTax = reportTaxTotals("purchase");
  const expenseInput = reportExpenseInputTax();
  const netGst = outputTax.tax - inputTax.tax - expenseInput;
  const stockValue = (state.items || []).reduce((total, item) => total + Number(item.currentStock || 0) * Number(item.purchasePrice || 0), 0);
  const attentionRows = reportAttentionRows();
  return reportPageShell({
    activeReport: "overview",
    title: "Report Center",
    summary: "Grouped reports for GST filing, accountant review, collections, payables and inventory control.",
    showToolbar: false,
    kpis: [
      { label: "Sales", value: formatCurrency(salesTotals.total), note: `${salesTotals.count} sale records`, tone: "success" },
      { label: "Purchases", value: formatCurrency(purchaseTotals.total), note: `${purchaseTotals.count} purchase records`, tone: "neutral" },
      { label: "Net GST", value: formatCurrency(netGst), note: "Output minus input", tone: netGst >= 0 ? "danger" : "success" },
      { label: "Stock Value", value: formatCurrency(stockValue), note: `${(state.items || []).length} items`, tone: "info" },
    ],
    body: `
      <section class="report-center-grid">
        ${reportGroups().map(reportGroupCard).join("")}
      </section>
      <section class="data-table-card report-card report-data-card">
        <div class="report-card-head"><h2>Needs Review</h2><span>${attentionRows.length} checks</span></div>
        ${dataReportTable(["Area", "Issue", "Action"], attentionRows, "No report checks need attention right now.")}
      </section>
    `,
  });
}

function reportGroupCard(group) {
  return `
    <article class="report-group-card">
      <header>
        <span>${escapeHtml(group.title.slice(0, 3).toUpperCase())}</span>
        <div>
          <h2>${escapeHtml(group.title)}</h2>
          <p>${escapeHtml(group.note)}</p>
        </div>
      </header>
      <div>
        ${group.reports.map((report) => `
          <button data-report-view="${escapeHtml(report.id)}" type="button">
            <strong>${escapeHtml(report.title)}</strong>
            <small>${escapeHtml(report.note)}</small>
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

function reportAttentionRows() {
  const b2bMissingGstin = invoiceRowsForType("sale").filter((invoice) => invoiceSupplyType(invoice) === "b2b" && !isValidGstin(invoice.partyGstin || "")).length;
  const missingHsn = (state.items || []).filter((item) => !String(item.hsnSac || "").trim()).length;
  const openReceivables = invoiceRowsForType("sale").filter((invoice) => invoiceBalanceValue(invoice) > 0).length;
  const openPayables = invoiceRowsForType("purchase").filter((invoice) => invoiceBalanceValue(invoice) > 0).length;
  return [
    b2bMissingGstin ? ["GST", `${b2bMissingGstin} B2B invoice(s) missing valid GSTIN`, "Open GSTR-1 and update party GSTIN"] : null,
    missingHsn ? ["Inventory", `${missingHsn} item(s) missing HSN/SAC`, "Open Items and complete tax fields"] : null,
    openReceivables ? ["Collections", `${openReceivables} sale invoice(s) still receivable`, "Open Receivable Aging"] : null,
    openPayables ? ["Payables", `${openPayables} purchase bill(s) still payable`, "Open Payable Aging"] : null,
  ].filter(Boolean);
}

function isReportNumericHeader(head) {
  return /₹|%|tax|amount|total|balance|qty|rate|cost|price|debit|credit|gross|net|margin|receivable|payable|opening|current|closing|turnover|itc|paid|received/i.test(String(head || ""));
}

function dataReportTable(headers, rows, emptyText) {
  const query = String(reportSearchQuery || "").trim().toLowerCase();
  const filteredRows = query
    ? rows.filter((row) =>
        row
          .map((cell) => (typeof cell === "object" && cell !== null && "text" in cell ? cell.text : String(cell ?? "")))
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : rows;
  return `
    <table class="data-table report-table">
      <thead>
        <tr>
          ${headers.map((head) => `<th class="${isReportNumericHeader(head) ? "num" : ""}">${escapeHtml(head)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${filteredRows.map((row) => `
          <tr>
            ${row.map((cell, idx) => {
              const isNum = isReportNumericHeader(headers[idx]);
              const isObj = typeof cell === "object" && cell !== null && "html" in cell;
              const content = isObj ? cell.html : escapeHtml(String(cell ?? ""));
              return `<td class="${isNum ? "num" : ""}">${content}</td>`;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="empty-table ${filteredRows.length ? "hidden" : ""}">${escapeHtml(query ? "No rows match your search." : emptyText)}</div>
  `;
}


function reportTableCard(title, headers, rows, emptyText, meta = "") {
  return `
    <section class="data-table-card report-card report-data-card">
      <div class="report-card-head"><h2>${escapeHtml(title)}</h2>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</div>
      ${dataReportTable(headers, rows, emptyText)}
    </section>
  `;
}

function gstReport(type) {
  const isSale = type === "sale";
  const totals = reportTaxTotals(type);
  const expenseInput = isSale ? 0 : reportExpenseInputTax();
  const title = isSale ? "GSTR-1 / Output Tax" : "GSTR-2 / Input Tax";

  const returnNotes = (isSale ? state.creditNotes || [] : state.debitNotes || [])
    .filter((note) => (isSale ? creditNoteStatus(note) : debitNoteStatus(note)) !== "cancelled")
    .filter(isInReportDateScope);
  const returnTaxable = returnNotes.reduce((sum, n) => sum + Math.max(0, Number(n.subtotal || 0) - Number(n.discountTotal || 0)), 0);
  const returnCgst = returnNotes.reduce((sum, n) => sum + Number(n.cgstTotal || 0), 0);
  const returnSgst = returnNotes.reduce((sum, n) => sum + Number(n.sgstTotal || 0), 0);
  const returnIgst = returnNotes.reduce((sum, n) => sum + Number(n.igstTotal || 0), 0);
  const returnTax = returnCgst + returnSgst + returnIgst;

  const netTaxable = Math.max(0, totals.taxable - returnTaxable);
  const netCgst = Math.max(0, totals.cgst - returnCgst);
  const netSgst = Math.max(0, totals.sgst - returnSgst);
  const netIgst = Math.max(0, totals.igst - returnIgst);
  const netTax = isSale ? (netCgst + netSgst + netIgst) : (netCgst + netSgst + netIgst + expenseInput);

  const b2bTotal = totals.invoices.filter((invoice) => invoiceSupplyType(invoice) === "b2b").reduce((sum, invoice) => sum + invoiceTaxableValue(invoice), 0);
  const b2cTotal = totals.invoices.filter((invoice) => invoiceSupplyType(invoice) === "b2c").reduce((sum, invoice) => sum + invoiceTaxableValue(invoice), 0);

  return reportPageShell({
    activeReport: isSale ? "gstr1" : "gstr2",
    eyebrow: "GST Reports",
    title,
    summary: isSale
      ? "Output tax summary for sale invoices reflecting sales return credit notes."
      : "Input tax summary for purchase bills, debit note returns, and expense input GST.",
    exportLabel: `Export for ${isSale ? "GSTR-1" : "GSTR-2"} (CSV)`,
    exportMessage: `${isSale ? "GSTR-1" : "GSTR-2"} CSV export placeholder ready.`,
    kpis: [
      { label: "Net Taxable Turnover", value: formatCurrency(netTaxable), note: returnTaxable > 0 ? `Gross: ${formatCurrency(totals.taxable)} | Ret: ${formatCurrency(returnTaxable)}` : `${totals.lines.length} taxable lines`, tone: "neutral" },
      { label: isSale ? "Net CGST Collected" : "Net CGST Input", value: formatCurrency(netCgst), note: returnCgst > 0 ? `Gross: ${formatCurrency(totals.cgst)}` : "Central GST", tone: "info" },
      { label: isSale ? "Net SGST Collected" : "Net SGST Input", value: formatCurrency(netSgst), note: returnSgst > 0 ? `Gross: ${formatCurrency(totals.sgst)}` : "State GST", tone: "info" },
      { label: isSale ? "Net IGST Collected" : "Net IGST Input", value: formatCurrency(netIgst), note: returnIgst > 0 ? `Gross: ${formatCurrency(totals.igst)}` : "Interstate GST", tone: "info" },
      { label: isSale ? "Net Output GST" : "Total Net Input GST", value: formatCurrency(netTax), note: isSale ? (returnTax > 0 ? `Gross: ${formatCurrency(totals.tax)}` : "Tax liability") : `Purchases + ${formatCurrency(expenseInput)} expense GST`, tone: isSale ? "danger" : "success" },
      { label: "B2B / B2C Split", value: `${formatCurrency(b2bTotal)} / ${formatCurrency(b2cTotal)}`, note: "Taxable value", tone: "neutral" },
    ],
    body: `
      <section class="gst-chart-grid report-chart-grid">
        <article class="gst-chart-card">
          <h2>Monthly GST</h2>
          <div class="gst-bar-chart">${gstMonthlyBars(totals.invoices)}</div>
        </article>
        <article class="gst-chart-card">
          <h2>GST Slab Breakdown</h2>
          <div class="gst-pie-placeholder">${gstPieSlices(totals.lines)}</div>
        </article>
      </section>
      ${reportTableCard(
        isSale ? "Sale Invoice Summary" : "Purchase Bill Summary",
        ["Date", "No", isSale ? "Customer" : "Supplier", "Supply", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total"],
        gstInvoiceRows(totals.invoices),
        `No ${isSale ? "sale" : "purchase"} GST records found.`,
        `${totals.invoices.length} records`,
      )}
      ${returnNotes.length ? reportTableCard(
        isSale ? "Sales Returns / Credit Notes Impact" : "Purchase Returns / Debit Notes Impact",
        ["Date", "Note No", isSale ? "Customer" : "Supplier", "Reason", "Taxable", "CGST", "SGST", "IGST", "Total"],
        returnNotes.map((n) => [
          formatDate(n.date || n.creditDate || n.debitDate),
          n.creditNo || n.debitNo || "-",
          n.party || "-",
          n.reason || "-",
          formatCurrency(Math.max(0, Number(n.subtotal || 0) - Number(n.discountTotal || 0))),
          formatCurrency(n.cgstTotal || 0),
          formatCurrency(n.sgstTotal || 0),
          formatCurrency(n.igstTotal || 0),
          formatCurrency(n.total || 0),
        ]),
        "No returns found.",
        `${returnNotes.length} returns`,
      ) : ""}
      ${reportTableCard("GST Slab Summary", ["GST Slab", "Taxable", "CGST", "SGST", "IGST", "Total Tax"], gstSlabRows(totals.lines), "No GST slab rows found.")}
      ${reportTableCard("HSN/SAC Summary", ["HSN/SAC", "Qty", "Taxable", "CGST", "SGST", "IGST", "Tax"], gstHsnRows(totals.lines), "No HSN/SAC rows found.")}
    `,
  });
}

function gstLiabilityReport() {
  const output = reportTaxTotals("sale");
  const input = reportTaxTotals("purchase");
  const expenseInput = reportExpenseInputTax();

  const creditNotes = (state.creditNotes || []).filter((note) => creditNoteStatus(note) !== "cancelled" && isInReportDateScope(note));
  const creditNoteTax = creditNotes.reduce((sum, n) => sum + Number(n.cgstTotal || 0) + Number(n.sgstTotal || 0) + Number(n.igstTotal || 0), 0);
  const netOutput = Math.max(0, output.tax - creditNoteTax);

  const debitNotes = (state.debitNotes || []).filter((note) => debitNoteStatus(note) !== "cancelled" && isInReportDateScope(note));
  const debitNoteTax = debitNotes.reduce((sum, n) => sum + Number(n.cgstTotal || 0) + Number(n.sgstTotal || 0) + Number(n.igstTotal || 0), 0);
  const netPurchaseInput = Math.max(0, input.tax - debitNoteTax);
  const totalInput = netPurchaseInput + expenseInput;

  const net = netOutput - totalInput;
  return reportPageShell({
    activeReport: "gstLiability",
    eyebrow: "GST Reports",
    title: "GST Liability",
    summary: "Periodic accountant view of net GST payable or input tax credit reflecting returns and expense GST.",
    exportLabel: "Export GST Summary",
    exportMessage: "GST liability export placeholder ready.",
    kpis: [
      { label: "Net Output GST", value: formatCurrency(netOutput), note: creditNoteTax > 0 ? `Gross: ${formatCurrency(output.tax)} less Ret: ${formatCurrency(creditNoteTax)}` : "From sale invoices", tone: "danger" },
      { label: "Total Input GST", value: formatCurrency(totalInput), note: `Purchases (${formatCurrency(netPurchaseInput)}) + Expenses (${formatCurrency(expenseInput)})`, tone: "success" },
      { label: "Net GST", value: formatCurrency(net), note: net >= 0 ? "Payable" : "Input credit", tone: net >= 0 ? "danger" : "success" },
      { label: "Taxable Sales", value: formatCurrency(output.taxable), note: "GSTR-1 base turnover", tone: "neutral" },
    ],
    body: reportTableCard("GST Liability Summary", ["Particulars", "Taxable", "CGST", "SGST", "IGST", "Total"], [
      ["Gross Output Tax / GSTR-1", formatCurrency(output.taxable), formatCurrency(output.cgst), formatCurrency(output.sgst), formatCurrency(output.igst), formatCurrency(output.tax)],
      ["Less: Sales Returns (Credit Notes)", "-", formatCurrency(creditNotes.reduce((s, n) => s + Number(n.cgstTotal || 0), 0)), formatCurrency(creditNotes.reduce((s, n) => s + Number(n.sgstTotal || 0), 0)), formatCurrency(creditNotes.reduce((s, n) => s + Number(n.igstTotal || 0), 0)), formatCurrency(creditNoteTax)],
      ["Net Output GST Liability", "-", "-", "-", "-", formatCurrency(netOutput)],
      ["Gross Input Tax / GSTR-2", formatCurrency(input.taxable), formatCurrency(input.cgst), formatCurrency(input.sgst), formatCurrency(input.igst), formatCurrency(input.tax)],
      ["Less: Purchase Returns (Debit Notes)", "-", formatCurrency(debitNotes.reduce((s, n) => s + Number(n.cgstTotal || 0), 0)), formatCurrency(debitNotes.reduce((s, n) => s + Number(n.sgstTotal || 0), 0)), formatCurrency(debitNotes.reduce((s, n) => s + Number(n.igstTotal || 0), 0)), formatCurrency(debitNoteTax)],
      ["Add: Expense Input GST", "-", "-", "-", "-", formatCurrency(expenseInput)],
      ["Total Net Input Tax Credit", "-", "-", "-", "-", formatCurrency(totalInput)],
      [net >= 0 ? "Net GST Payable" : "Net Input Tax Credit", "-", "-", "-", "-", formatCurrency(Math.abs(net))],
    ], "No GST liability rows found."),
  });
}

function gstr3bReport() {
  const saleTotals = reportTaxTotals("sale");
  const purchaseTotals = reportTaxTotals("purchase");
  const expenseInput = reportExpenseInputTax();

  const creditNotes = (state.creditNotes || []).filter((note) => creditNoteStatus(note) !== "cancelled" && isInReportDateScope(note));
  const cnTaxable = creditNotes.reduce((sum, n) => sum + Math.max(0, Number(n.subtotal || 0) - Number(n.discountTotal || 0)), 0);
  const cnCgst = creditNotes.reduce((sum, n) => sum + Number(n.cgstTotal || 0), 0);
  const cnSgst = creditNotes.reduce((sum, n) => sum + Number(n.sgstTotal || 0), 0);
  const cnIgst = creditNotes.reduce((sum, n) => sum + Number(n.igstTotal || 0), 0);
  const cnTax = cnCgst + cnSgst + cnIgst;

  const debitNotes = (state.debitNotes || []).filter((note) => debitNoteStatus(note) !== "cancelled" && isInReportDateScope(note));
  const dnCgst = debitNotes.reduce((sum, n) => sum + Number(n.cgstTotal || 0), 0);
  const dnSgst = debitNotes.reduce((sum, n) => sum + Number(n.sgstTotal || 0), 0);
  const dnIgst = debitNotes.reduce((sum, n) => sum + Number(n.igstTotal || 0), 0);

  const saleInvoices = reportInvoicesForType("sale");
  let zeroRatedTaxable = 0, zeroRatedIgst = 0;
  let nilExemptTaxable = 0;
  let regularTaxable = 0, regularCgst = 0, regularSgst = 0, regularIgst = 0;

  for (const inv of saleInvoices) {
    const isZero = inv.gstType === "zero_rated" || inv.gstType === "export";
    const isNil = inv.gstType === "nil_rated" || inv.gstType === "exempt";
    const taxable = invoiceTaxableValue(inv);
    const cgst = Number(inv.cgstTotal || 0);
    const sgst = Number(inv.sgstTotal || 0);
    const igst = Number(inv.igstTotal || 0);

    if (isZero) {
      zeroRatedTaxable += taxable;
      zeroRatedIgst += igst;
    } else if (isNil) {
      nilExemptTaxable += taxable;
    } else {
      regularTaxable += taxable;
      regularCgst += cgst;
      regularSgst += sgst;
      regularIgst += igst;
    }
  }

  const netOutwardTaxable = Math.max(0, regularTaxable - cnTaxable);
  const netOutwardCgst = Math.max(0, regularCgst - cnCgst);
  const netOutwardSgst = Math.max(0, regularSgst - cnSgst);
  const netOutwardIgst = Math.max(0, regularIgst - cnIgst);
  const netTotalOutputTax = netOutwardCgst + netOutwardSgst + netOutwardIgst + zeroRatedIgst;

  const expCgst = Math.round((expenseInput / 2) * 100) / 100;
  const expSgst = Math.round((expenseInput - expCgst) * 100) / 100;

  const grossItcIgst = purchaseTotals.igst;
  const grossItcCgst = purchaseTotals.cgst + expCgst;
  const grossItcSgst = purchaseTotals.sgst + expSgst;

  const netItcIgst = Math.max(0, grossItcIgst - dnIgst);
  const netItcCgst = Math.max(0, grossItcCgst - dnCgst);
  const netItcSgst = Math.max(0, grossItcSgst - dnSgst);
  const netTotalItc = netItcIgst + netItcCgst + netItcSgst;

  const igstPayable = netOutwardIgst + zeroRatedIgst;
  const cgstPayable = netOutwardCgst;
  const sgstPayable = netOutwardSgst;

  const igstPaidItc = Math.min(igstPayable, netItcIgst);
  const cgstPaidItc = Math.min(cgstPayable, netItcCgst);
  const sgstPaidItc = Math.min(sgstPayable, netItcSgst);

  const igstCash = Math.max(0, igstPayable - igstPaidItc);
  const cgstCash = Math.max(0, cgstPayable - cgstPaidItc);
  const sgstCash = Math.max(0, sgstPayable - sgstPaidItc);
  const totalCashPayable = igstCash + cgstCash + sgstCash;
  const excessItcCarryForward = Math.max(0, netTotalItc - (igstPaidItc + cgstPaidItc + sgstPaidItc));

  return reportPageShell({
    activeReport: "gstr3b",
    eyebrow: "GST Reports",
    title: "GSTR-3B Monthly Return Summary",
    summary: "Form GSTR-3B statutory breakdown: Table 3.1 Outward supplies, Table 4 Eligible ITC, and Table 6.1 Tax payment.",
    exportLabel: "Export GSTR-3B (CSV)",
    exportMessage: "GSTR-3B export ready.",
    kpis: [
      { label: "Taxable Turnover", value: formatCurrency(netOutwardTaxable + zeroRatedTaxable + nilExemptTaxable), note: `${saleInvoices.length} sale invoices`, tone: "neutral" },
      { label: "Output Tax Liability", value: formatCurrency(netTotalOutputTax), note: cnTax > 0 ? `Gross: ${formatCurrency(saleTotals.tax)} | Ret: ${formatCurrency(cnTax)}` : "Gross output liability", tone: "danger" },
      { label: "Net Eligible ITC", value: formatCurrency(netTotalItc), note: `Purchases + ${formatCurrency(expenseInput)} expense tax`, tone: "success" },
      { label: "Cash Tax Payable", value: formatCurrency(totalCashPayable), note: totalCashPayable > 0 ? "Payable in cash after ITC" : (excessItcCarryForward > 0 ? `ITC Carryforward: ${formatCurrency(excessItcCarryForward)}` : "Nil tax liability"), tone: totalCashPayable > 0 ? "danger" : "success" },
    ],
    body: `
      ${reportTableCard("Table 3.1: Outward Supplies & Inward Supplies Liable to Reverse Charge", ["Nature of Supplies", "Taxable Value", "Integrated Tax (IGST)", "Central Tax (CGST)", "State/UT Tax (SGST)", "Cess"], [
        ["(a) Outward taxable supplies (other than zero, nil, exempt)", formatCurrency(netOutwardTaxable), formatCurrency(netOutwardIgst), formatCurrency(netOutwardCgst), formatCurrency(netOutwardSgst), formatCurrency(0)],
        ["(b) Outward taxable supplies (zero rated)", formatCurrency(zeroRatedTaxable), formatCurrency(zeroRatedIgst), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(c) Other outward supplies (Nil rated, exempted)", formatCurrency(nilExemptTaxable), formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(d) Inward supplies (liable to reverse charge)", formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(e) Non-GST outward supplies", formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["Total Outward Supplies", formatCurrency(netOutwardTaxable + zeroRatedTaxable + nilExemptTaxable), formatCurrency(netOutwardIgst + zeroRatedIgst), formatCurrency(netOutwardCgst), formatCurrency(netOutwardSgst), formatCurrency(0)],
      ], "No outward supply records found.")}

      ${reportTableCard("Table 4: Eligible Input Tax Credit (ITC)", ["Details", "Integrated Tax (IGST)", "Central Tax (CGST)", "State/UT Tax (SGST)", "Cess"], [
        ["(A) (1) Import of Goods", formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(A) (2) Import of Services", formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(A) (3) Inward supplies liable to reverse charge", formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(A) (4) Inward supplies from ISD", formatCurrency(0), formatCurrency(0), formatCurrency(0), formatCurrency(0)],
        ["(A) (5) All other ITC (Purchases & Expenses)", formatCurrency(grossItcIgst), formatCurrency(grossItcCgst), formatCurrency(grossItcSgst), formatCurrency(0)],
        ["(B) ITC Reversed (Debit Notes / Returns)", formatCurrency(dnIgst), formatCurrency(dnCgst), formatCurrency(dnSgst), formatCurrency(0)],
        ["(C) Net ITC Available (A - B)", formatCurrency(netItcIgst), formatCurrency(netItcCgst), formatCurrency(netItcSgst), formatCurrency(0)],
      ], "No ITC records found.")}

      ${reportTableCard("Table 6.1: Payment of Tax (Output Liability vs ITC Offset)", ["Description", "Total Tax Payable", "Paid via ITC", "Tax Paid in Cash"], [
        ["Integrated Tax (IGST)", formatCurrency(igstPayable), formatCurrency(igstPaidItc), formatCurrency(igstCash)],
        ["Central Tax (CGST)", formatCurrency(cgstPayable), formatCurrency(cgstPaidItc), formatCurrency(cgstCash)],
        ["State/UT Tax (SGST)", formatCurrency(sgstPayable), formatCurrency(sgstPaidItc), formatCurrency(sgstCash)],
        ["Total Tax Payment", formatCurrency(igstPayable + cgstPayable + sgstPayable), formatCurrency(igstPaidItc + cgstPaidItc + sgstPaidItc), formatCurrency(totalCashPayable)],
      ], "No tax payment records found.")}
    `,
  });
}

function partyMatchesTarget(row, party) {
  if (!row || !party) return false;
  const partyId = String(party.id || "");
  const partyName = String(party.name || "").trim().toLowerCase();
  if (row.partyId && String(row.partyId) === partyId) return true;
  if (row.party && row.party.trim().toLowerCase() === partyName) return true;
  if (row.partyName && row.partyName.trim().toLowerCase() === partyName) return true;
  if (row.vendor && row.vendor.trim().toLowerCase() === partyName) return true;
  if (row.customer && row.customer.trim().toLowerCase() === partyName) return true;
  if (row.paidTo && row.paidTo.trim().toLowerCase() === partyName) return true;
  return false;
}

function partyStatementReport() {
  const parties = (state.parties || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const selectedParty = parties.find((p) => String(p.id) === reportPartyFilter || p.name === reportPartyFilter) || parties[0];

  if (!selectedParty) {
    return reportPageShell({
      activeReport: "partyStatement",
      eyebrow: "Party Reports",
      title: "Party Statement / Ledger Account",
      summary: "Customer and supplier running ledger balance statement.",
      kpis: [],
      body: emptyWorkspace("No Parties Found", "Add customers or suppliers to generate running ledger statements."),
    });
  }

  const { from, to } = reportDateScope();

  let openingBalance = Number(selectedParty.openingBalance || 0);
  if (selectedParty.openingBalanceType === "payable") {
    openingBalance = -Math.abs(openingBalance);
  } else if (selectedParty.openingBalanceType === "receivable") {
    openingBalance = Math.abs(openingBalance);
  }

  const allInvoices = (state.invoices || []).filter((inv) => partyMatchesTarget(inv, selectedParty));
  const allPayments = (state.payments || []).filter((pmt) => partyMatchesTarget(pmt, selectedParty));
  const allCreditNotes = (state.creditNotes || []).filter((cn) => partyMatchesTarget(cn, selectedParty) && creditNoteStatus(cn) !== "cancelled");
  const allDebitNotes = (state.debitNotes || []).filter((dn) => partyMatchesTarget(dn, selectedParty) && debitNoteStatus(dn) !== "cancelled");

  if (from) {
    for (const inv of allInvoices) {
      const d = (inv.date || "").slice(0, 10);
      if (d && d < from) {
        if (inv.type === "sale") openingBalance += invoiceTotalValue(inv);
        else if (inv.type === "purchase") openingBalance -= invoiceTotalValue(inv);
      }
    }
    for (const p of allPayments) {
      const d = (p.paymentDate || p.date || "").slice(0, 10);
      if (d && d < from) {
        if (p.type === "payment_in") openingBalance -= Number(p.amount || 0);
        else if (p.type === "payment_out") openingBalance += Number(p.amount || 0);
      }
    }
    for (const cn of allCreditNotes) {
      const d = (cn.date || cn.creditDate || "").slice(0, 10);
      if (d && d < from) openingBalance -= creditNoteTotalValue(cn);
    }
    for (const dn of allDebitNotes) {
      const d = (dn.date || dn.debitDate || "").slice(0, 10);
      if (d && d < from) openingBalance += debitNoteTotalValue(dn);
    }
  }

  const transactions = [];

  for (const inv of allInvoices) {
    if (isInReportDateScope(inv)) {
      const isSale = inv.type === "sale";
      transactions.push({
        date: inv.date,
        voucherType: isSale ? "Sale Invoice" : "Purchase Bill",
        voucherNo: inv.invoiceNo || "-",
        particulars: `Subtotal: ${formatCurrency(invoiceTaxableValue(inv))} | GST: ${formatCurrency(invoiceTaxValue(inv))}`,
        debit: isSale ? invoiceTotalValue(inv) : 0,
        credit: !isSale ? invoiceTotalValue(inv) : 0,
      });
    }
  }

  for (const p of allPayments) {
    if (isInReportDateScope(p)) {
      const isIn = p.type === "payment_in";
      transactions.push({
        date: p.paymentDate || p.date,
        voucherType: isIn ? "Payment Received" : "Payment Made",
        voucherNo: p.referenceNo || p.receiptNo || p.method || "-",
        particulars: `Mode: ${titleCase(p.paymentMode || p.method || "Cash")}${p.notes ? ` - ${p.notes}` : ""}`,
        debit: !isIn ? Number(p.amount || 0) : 0,
        credit: isIn ? Number(p.amount || 0) : 0,
      });
    }
  }

  for (const cn of allCreditNotes) {
    if (isInReportDateScope(cn)) {
      transactions.push({
        date: cn.date || cn.creditDate,
        voucherType: "Credit Note",
        voucherNo: cn.creditNo || "-",
        particulars: cn.reason || "Sales Return",
        debit: 0,
        credit: creditNoteTotalValue(cn),
      });
    }
  }

  for (const dn of allDebitNotes) {
    if (isInReportDateScope(dn)) {
      transactions.push({
        date: dn.date || dn.debitDate,
        voucherType: "Debit Note",
        voucherNo: dn.debitNo || "-",
        particulars: dn.reason || "Purchase Return",
        debit: debitNoteTotalValue(dn),
        credit: 0,
      });
    }
  }

  transactions.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  let runningBalance = openingBalance;
  let totalDebits = 0;
  let totalCredits = 0;

  const formatBal = (val) => {
    const formatted = formatCurrency(Math.abs(val));
    if (Math.abs(val) < 0.01) return formatCurrency(0);
    return val > 0 ? `${formatted} Dr` : `${formatted} Cr`;
  };

  const tableRows = [];
  tableRows.push([
    from ? formatDate(from) : "-",
    "Opening Balance",
    "-",
    "Opening balance brought forward",
    "-",
    "-",
    formatBal(openingBalance),
  ]);

  for (const t of transactions) {
    runningBalance += t.debit - t.credit;
    totalDebits += t.debit;
    totalCredits += t.credit;
    tableRows.push([
      formatDate(t.date),
      t.voucherType,
      t.voucherNo,
      t.particulars,
      t.debit ? formatCurrency(t.debit) : "-",
      t.credit ? formatCurrency(t.credit) : "-",
      formatBal(runningBalance),
    ]);
  }

  const closingBalance = runningBalance;
  tableRows.push([
    to ? formatDate(to) : "Current",
    "Closing Balance",
    "-",
    "Closing balance carried down",
    formatCurrency(totalDebits),
    formatCurrency(totalCredits),
    formatBal(closingBalance),
  ]);

  const partyDetailsSubtitle = [
    selectedParty.gstin ? `GSTIN: ${selectedParty.gstin}` : "",
    selectedParty.phone ? `Phone: ${selectedParty.phone}` : "",
    partyRole(selectedParty).label,
  ].filter(Boolean).join(" | ");

  return reportPageShell({
    activeReport: "partyStatement",
    eyebrow: "Party Reports",
    title: `Party Statement - ${selectedParty.name}`,
    summary: partyDetailsSubtitle || "Customer and supplier running ledger account statement.",
    exportLabel: "Export Statement (CSV)",
    exportMessage: "Statement export ready.",
    kpis: [
      { label: "Opening Balance", value: formatBal(openingBalance), note: openingBalance > 0 ? "Receivable" : (openingBalance < 0 ? "Payable" : "Settled"), tone: "neutral" },
      { label: "Total Debits (Dr)", value: formatCurrency(totalDebits), note: "Invoices / Outward payments", tone: "info" },
      { label: "Total Credits (Cr)", value: formatCurrency(totalCredits), note: "Bills / Receipts", tone: "info" },
      { label: "Closing Balance", value: formatBal(closingBalance), note: closingBalance > 0 ? "Net Receivable from Party" : (closingBalance < 0 ? "Net Payable to Party" : "Account Cleared"), tone: closingBalance > 0 ? "danger" : (closingBalance < 0 ? "neutral" : "success") },
    ],
    body: reportTableCard(`Ledger Transactions - ${selectedParty.name}`, ["Date", "Voucher Type", "Voucher No", "Particulars", "Debit (Dr)", "Credit (Cr)", "Balance"], tableRows, "No transactions found for this party in selected period.", `${transactions.length} transactions`),
  });
}

function expenseBreakdownReport() {
  let expenses = (state.transactions || []).filter((t) => t.type === "expense" && isInReportDateScope(t));
  if (reportCategoryFilter) {
    expenses = expenses.filter((t) => (t.category || "Uncategorized").toLowerCase() === reportCategoryFilter.toLowerCase());
  }

  const categoryMap = {};
  let totalExpenses = 0;
  let totalTax = 0;
  let totalTaxable = 0;

  for (const exp of expenses) {
    const cat = (exp.category || "Uncategorized").trim() || "Uncategorized";
    const amount = Number(exp.amount || exp.total || 0);
    const tax = expenseTax(exp);
    const taxable = Math.max(0, amount - tax);

    totalExpenses += amount;
    totalTax += tax;
    totalTaxable += taxable;

    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, count: 0, taxable: 0, tax: 0, total: 0 };
    }
    categoryMap[cat].count += 1;
    categoryMap[cat].taxable += taxable;
    categoryMap[cat].tax += tax;
    categoryMap[cat].total += amount;
  }

  const categoryList = Object.values(categoryMap).sort((a, b) => b.total - a.total);
  const topCategory = categoryList[0];

  const summaryRows = categoryList.map((c) => {
    const share = totalExpenses > 0 ? ((c.total / totalExpenses) * 100).toFixed(1) + "%" : "0%";
    return [
      c.category,
      String(c.count),
      formatCurrency(c.taxable),
      formatCurrency(c.tax),
      formatCurrency(c.total),
      share,
    ];
  });

  const detailRows = expenses
    .slice()
    .sort((a, b) => new Date(b.date || b.transactionDate || b.createdAt || 0) - new Date(a.date || a.transactionDate || a.createdAt || 0))
    .map((exp) => {
      const amt = Number(exp.amount || exp.total || 0);
      const tax = expenseTax(exp);
      const taxable = Math.max(0, amt - tax);
      return [
        formatDate(exp.date || exp.transactionDate || exp.createdAt),
        exp.referenceNo || exp.voucherNo || exp.id || "-",
        exp.category || "Uncategorized",
        titleCase(exp.paymentMode || exp.method || "Cash"),
        exp.party || exp.paidTo || exp.vendor || "-",
        formatCurrency(taxable),
        formatCurrency(tax),
        formatCurrency(amt),
      ];
    });

  return reportPageShell({
    activeReport: "expenseBreakdown",
    eyebrow: "Accounting Reports",
    title: "Expense Category Breakdown",
    summary: "Operating expense categorization, tax deductions, and input tax credit analysis.",
    exportLabel: "Export Expenses (CSV)",
    exportMessage: "Expense breakdown export ready.",
    kpis: [
      { label: "Total Expenses", value: formatCurrency(totalExpenses), note: `${expenses.length} recorded vouchers`, tone: "danger" },
      { label: "Expense GST / ITC", value: formatCurrency(totalTax), note: "Eligible input tax credit", tone: "success" },
      { label: "Top Category", value: topCategory ? topCategory.category : "-", note: topCategory ? `${formatCurrency(topCategory.total)} (${((topCategory.total / (totalExpenses || 1)) * 100).toFixed(0)}%)` : "No expenses", tone: "neutral" },
      { label: "Categories", value: String(categoryList.length), note: "Active expense heads", tone: "info" },
    ],
    body: `
      ${reportTableCard("Expense Category Summary", ["Category", "Vouchers", "Taxable Value", "GST / Tax", "Total Expense", "% Share"], summaryRows, "No expense categories found in selected period.", `${categoryList.length} categories`)}
      ${reportTableCard("Expense Transaction Details", ["Date", "Voucher No", "Category", "Payment Method", "Paid To", "Taxable", "GST", "Total"], detailRows, "No expense transactions found in selected period.", `${detailRows.length} transactions`)}
    `,
  });
}

function invoiceLinesFor(inv) {
  if (Array.isArray(inv.items) && inv.items.length) return inv.items;
  const invId = String(inv.id || inv.invoiceId || "");
  return (state.invoiceItems || []).filter((line) => String(line.invoiceId) === invId);
}

function lineItemCategory(line) {
  if (line.category) return line.category;
  const matchedItem = (state.items || []).find((i) => String(i.id) === String(line.itemId) || i.name === (line.item || line.name) || (i.sku && i.sku === line.sku));
  return matchedItem?.category || "Uncategorized";
}

function lineItemPurchasePrice(line) {
  const matchedItem = (state.items || []).find((i) => String(i.id) === String(line.itemId) || i.name === (line.item || line.name) || (i.sku && i.sku === line.sku));
  return Number(matchedItem?.purchasePrice || line.purchasePrice || line.costPrice || 0);
}

function renderMarginBadge(margin) {
  const rounded = Number(margin || 0).toFixed(1);
  const tone = margin >= 20 ? "positive" : margin >= 10 ? "warning" : "negative";
  return {
    text: `${rounded}%`,
    html: `<span class="margin-badge ${tone}">${rounded}%</span>`,
  };
}

function profitabilityReport() {
  let invoices = reportInvoicesForType("sale");

  if (reportCategoryFilter) {
    invoices = invoices.filter((inv) =>
      invoiceLinesFor(inv).some((line) => lineItemCategory(line).toLowerCase() === reportCategoryFilter.toLowerCase())
    );
  }

  let totalRevenue = 0;
  let totalCost = 0;
  const itemMap = {};

  const billRows = invoices
    .slice()
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map((inv) => {
      const lines = invoiceLinesFor(inv);
      const filteredLines = reportCategoryFilter
        ? lines.filter((line) => lineItemCategory(line).toLowerCase() === reportCategoryFilter.toLowerCase())
        : lines;

      let billCost = 0;
      let billRevenue = 0;

      for (const line of filteredLines) {
        const qty = Number(line.qty || line.quantity || 1);
        const costPrice = lineItemPurchasePrice(line);
        const lineCost = qty * costPrice;
        const lineRevenue = Number(line.taxableValue !== undefined ? line.taxableValue : ((qty * Number(line.price || line.rate || 0)) - Number(line.discount || 0)));

        billCost += lineCost;
        billRevenue += lineRevenue;

        const key = line.itemId || line.item || line.name || line.description || "Unknown";
        if (!itemMap[key]) {
          itemMap[key] = {
            name: line.item || line.name || line.description || "Unknown",
            category: lineItemCategory(line),
            qtySold: 0,
            revenue: 0,
            cost: 0,
          };
        }
        itemMap[key].qtySold += qty;
        itemMap[key].revenue += lineRevenue;
        itemMap[key].cost += lineCost;
      }

      if (!lines.length) {
        billRevenue = invoiceTaxableValue(inv);
        billCost = 0;
      }

      const billProfit = billRevenue - billCost;
      const billMargin = billRevenue > 0 ? (billProfit / billRevenue) * 100 : 0;

      totalRevenue += billRevenue;
      totalCost += billCost;

      const itemCountLabel = `${filteredLines.length} item${filteredLines.length === 1 ? "" : "s"}`;

      return [
        formatDate(inv.date),
        inv.invoiceNo || "-",
        inv.party || "-",
        itemCountLabel,
        formatCurrency(billRevenue),
        formatCurrency(billCost),
        formatCurrency(billProfit),
        renderMarginBadge(billMargin),
      ];
    });

  const totalGrossProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  const itemRows = Object.values(itemMap)
    .map((item) => {
      const profit = item.revenue - item.cost;
      const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
      const avgSalePrice = item.qtySold > 0 ? item.revenue / item.qtySold : 0;
      const avgCostPrice = item.qtySold > 0 ? item.cost / item.qtySold : 0;
      return {
        ...item,
        profit,
        margin,
        avgSalePrice,
        avgCostPrice,
      };
    })
    .sort((a, b) => b.profit - a.profit)
    .map((item) => [
      item.name,
      item.category,
      formatQuantity(item.qtySold),
      formatCurrency(item.avgSalePrice),
      formatCurrency(item.avgCostPrice),
      formatCurrency(item.revenue),
      formatCurrency(item.cost),
      formatCurrency(item.profit),
      renderMarginBadge(item.margin),
    ]);

  return reportPageShell({
    activeReport: "profitability",
    eyebrow: "Sales & Profitability",
    title: "Bill-wise & Item-wise Profitability",
    summary: "Gross margin analysis comparing taxable sale revenue against purchase costs (COGS).",
    exportLabel: "Export Profitability (CSV)",
    exportMessage: "Profitability report export ready.",
    kpis: [
      { label: "Sales Revenue", value: formatCurrency(totalRevenue), note: "Taxable turnover", tone: "neutral" },
      { label: "Cost of Goods (COGS)", value: formatCurrency(totalCost), note: "Based on purchase cost", tone: "neutral" },
      { label: "Gross Profit", value: formatCurrency(totalGrossProfit), note: "Revenue minus COGS", tone: totalGrossProfit >= 0 ? "success" : "danger" },
      { label: "Gross Margin", value: `${overallMargin.toFixed(1)}%`, note: `${invoices.length} invoices analyzed`, tone: overallMargin >= 20 ? "success" : (overallMargin >= 10 ? "info" : "danger") },
    ],
    body: `
      ${reportTableCard("Bill-wise Profitability", ["Date", "Invoice No", "Customer", "Items", "Revenue", "Cost (COGS)", "Gross Profit", "Margin %"], billRows, "No sale invoices found in selected period.", `${billRows.length} bills`)}
      ${reportTableCard("Item-wise Profitability", ["Item Name", "Category", "Qty Sold", "Avg Selling Price", "Avg Cost Price", "Revenue", "Cost", "Gross Profit", "Margin %"], itemRows, "No item sales found in selected period.", `${itemRows.length} items`)}
    `,
  });
}

function saleReportDataInner() {
  return transactionRegisterReport("sale");
}

function purchaseReportInner() {
  return transactionRegisterReport("purchase");
}

function transactionRegisterReport(type) {
  const isSale = type === "sale";
  const rows = reportInvoicesForType(type);
  const totals = reportInvoiceTotals(type);
  const title = isSale ? "Sales Register" : "Purchase Register";
  const partyLabel = isSale ? "Customer" : "Supplier";
  return reportPageShell({
    activeReport: type,
    eyebrow: isSale ? "Sales" : "Purchase",
    title,
    summary: isSale ? "Invoice-wise sales, receipts, tax and receivable." : "Bill-wise purchases, paid amount, tax and payable.",
    exportLabel: `Export ${isSale ? "Sales" : "Purchases"} CSV`,
    exportMessage: `${title} export placeholder ready.`,
    kpis: [
      { label: isSale ? "Total Sales" : "Total Purchases", value: formatCurrency(totals.total), note: `${totals.count} records`, tone: "neutral" },
      { label: isSale ? "Received" : "Paid", value: formatCurrency(totals.received), note: isSale ? "Customer receipts" : "Supplier payments", tone: "success" },
      { label: isSale ? "Receivable" : "Payable", value: formatCurrency(totals.balance), note: "Open balance", tone: totals.balance > 0 ? "danger" : "success" },
      { label: "GST / Tax", value: formatCurrency(totals.tax), note: "Tax total", tone: "info" },
    ],
    body: reportTableCard(title, ["Date", isSale ? "Invoice No" : "Bill No", partyLabel, "GST Type", "Status", "Taxable", "Tax", "Total", "Balance"], rows.map((row) => [
      formatDate(row.date),
      row.invoiceNo || "-",
      row.party || "-",
      invoiceTaxTypeLabel(row),
      row.status || "-",
      formatCurrency(invoiceTaxableValue(row)),
      formatCurrency(invoiceTaxValue(row)),
      formatCurrency(invoiceTotalValue(row)),
      formatCurrency(invoiceBalanceValue(row)),
    ]), `No ${isSale ? "sale" : "purchase"} records found.`, `${rows.length} rows`),
  });
}

function dayBookReport() {
  const rows = [...(state.invoices || []), ...(state.payments || []), ...(state.transactions || []).filter((row) => row.type === "expense")]
    .filter(isInReportDateScope)
    .sort((a, b) => new Date(b.date || b.paymentDate || b.createdAt || 0) - new Date(a.date || a.paymentDate || a.createdAt || 0))
    .map((row) => [
      formatDate(row.date || row.paymentDate || row.createdAt),
      row.invoiceNo || row.referenceNo || row.method || "-",
      titleCase(row.type || "payment"),
      row.party || row.vendor || "-",
      formatCurrency(row.total || row.amount || 0),
      row.status || row.notes || "-",
    ]);
  return reportPageShell({
    activeReport: "daybook",
    title: "Day Book",
    summary: "Daily transaction movement for accountant review.",
    kpis: [
      { label: "Entries", value: String(rows.length), note: "All visible entries", tone: "neutral" },
      { label: "Sales", value: formatCurrency(reportInvoiceTotals("sale").total), note: "Sale invoices", tone: "success" },
      { label: "Purchases", value: formatCurrency(reportInvoiceTotals("purchase").total), note: "Purchase bills", tone: "neutral" },
      { label: "Expenses", value: formatCurrency(reportExpenseTotal()), note: "Operating expenses", tone: "danger" },
    ],
    body: reportTableCard("Day Book Entries", ["Date", "Reference", "Type", "Party", "Amount", "Status"], rows, "No day book entries found."),
  });
}

function partyBalancesReport() {
  const rows = (state.parties || []).map((party) => [
    party.name,
    partyRole(party).label,
    party.phone || party.email || "-",
    formatCurrency(party.receivable || 0),
    formatCurrency(party.payable || 0),
    formatCurrency(Math.abs(Number(party.balance || 0))),
  ]);
  const totalReceivableValue = (state.parties || []).reduce((sum, party) => sum + Number(party.receivable || 0), 0);
  const totalPayableValue = (state.parties || []).reduce((sum, party) => sum + Number(party.payable || 0), 0);
  return reportPageShell({
    activeReport: "partyBalances",
    eyebrow: "Party Reports",
    title: "Party Balances",
    summary: "Current receivable and payable by customer or supplier.",
    kpis: [
      { label: "Receivable", value: formatCurrency(totalReceivableValue), note: "Customer balances", tone: "danger" },
      { label: "Payable", value: formatCurrency(totalPayableValue), note: "Supplier balances", tone: "neutral" },
      { label: "Net Position", value: formatCurrency(totalReceivableValue - totalPayableValue), note: "Receivable minus payable", tone: "info" },
      { label: "Parties", value: String((state.parties || []).length), note: "Total parties", tone: "neutral" },
    ],
    body: reportTableCard("Party Balance List", ["Party", "Role", "Contact", "Receivable", "Payable", "Net Balance"], rows, "No party balances found."),
  });
}

function agingReport(type) {
  const isSale = type === "sale";
  const rows = reportInvoicesForType(type).filter((invoice) => invoiceBalanceValue(invoice) > 0);
  const bucketTotals = agingBucketTotals(rows);
  return reportPageShell({
    activeReport: isSale ? "receivableAging" : "payableAging",
    eyebrow: "Party Reports",
    title: isSale ? "Receivable Aging" : "Payable Aging",
    summary: isSale ? "Customer invoices grouped by how long balance is pending." : "Supplier bills grouped by how long balance is pending.",
    kpis: [
      { label: "0-30 Days", value: formatCurrency(bucketTotals.current), note: "Recent", tone: "success" },
      { label: "31-60 Days", value: formatCurrency(bucketTotals.mid), note: "Needs follow-up", tone: "info" },
      { label: "61-90 Days", value: formatCurrency(bucketTotals.old), note: "High attention", tone: "danger" },
      { label: "90+ Days", value: formatCurrency(bucketTotals.older), note: "Critical", tone: "danger" },
    ],
    body: reportTableCard(isSale ? "Open Customer Invoices" : "Open Supplier Bills", ["Date", "Due Date", "No", isSale ? "Customer" : "Supplier", "Age", "Bucket", "Balance"], rows.map((invoice) => {
      const age = invoiceAgeDays(invoice);
      return [
        formatDate(invoice.date),
        formatDate(invoice.dueDate || invoice.date),
        invoice.invoiceNo || "-",
        invoice.party || "-",
        `${age} days`,
        agingBucketLabel(age),
        formatCurrency(invoiceBalanceValue(invoice)),
      ];
    }), `No open ${isSale ? "receivables" : "payables"} found.`),
  });
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateInventoryValuation() {
  const items = (state.items || []).filter((i) => i.itemType !== "service");
  const movements = state.stockMovements || [];
  let totalOpeningValue = 0;
  let totalClosingValue = 0;

  for (const item of items) {
    const openingQty = Number(item.openingStock || 0);
    const purchasePrice = Number(item.purchasePrice || 0);
    const openingVal = Number(item.openingStockValue || 0) > 0
      ? Number(item.openingStockValue)
      : (openingQty * purchasePrice);
    totalOpeningValue += openingVal;

    const itemMoves = movements.filter((m) => String(m.itemId) === String(item.id) || (!m.itemId && m.item === item.name));
    let inwardQty = openingQty;
    let inwardCost = openingVal;
    for (const m of itemMoves) {
      if (m.movementType === "in") {
        const qty = Number(m.quantity || 0);
        const rate = Number(m.rate ?? purchasePrice);
        inwardQty += qty;
        inwardCost += qty * rate;
      }
    }
    const unitCost = inwardQty > 0 ? (inwardCost / inwardQty) : purchasePrice;
    const currentQty = Math.max(0, Number(item.currentStock ?? openingQty));
    totalClosingValue += currentQty * unitCost;
  }

  return {
    openingStockValue: roundMoney(totalOpeningValue),
    closingStockValue: roundMoney(totalClosingValue),
  };
}

function profitLossReport() {
  const grossSales = reportTaxTotals("sale").taxable;
  const salesReturns = (state.creditNotes || [])
    .filter((note) => creditNoteStatus(note) !== "cancelled")
    .reduce((sum, note) => sum + creditNoteTotalValue(note) - Number(note.taxTotal || 0), 0);
  const netSales = Math.max(0, grossSales - salesReturns);

  const grossPurchases = reportTaxTotals("purchase").taxable;
  const purchaseReturns = (state.debitNotes || [])
    .filter((note) => debitNoteStatus(note) !== "cancelled")
    .reduce((sum, note) => sum + debitNoteTotalValue(note) - Number(note.taxTotal || 0), 0);
  const netPurchases = Math.max(0, grossPurchases - purchaseReturns);

  const inventory = calculateInventoryValuation();
  const openingStock = inventory.openingStockValue;
  const closingStock = inventory.closingStockValue;
  const cogs = Math.max(0, openingStock + netPurchases - closingStock);

  const expenses = reportExpenseTotal() - reportExpenseInputTax();
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - expenses;

  return reportPageShell({
    activeReport: "profitLoss",
    title: "Profit & Loss",
    summary: "Periodic trading result with weighted-average inventory valuation, returns, and COGS.",
    kpis: [
      { label: "Net Sales", value: formatCurrency(netSales), note: salesReturns > 0 ? `Gross: ${formatCurrency(grossSales)}` : "Revenue", tone: "success" },
      { label: "COGS", value: formatCurrency(cogs), note: `Opening: ${formatCurrency(openingStock)} | Closing: ${formatCurrency(closingStock)}`, tone: "neutral" },
      { label: "Gross Profit", value: formatCurrency(grossProfit), note: "Net Sales - COGS", tone: grossProfit >= 0 ? "success" : "danger" },
      { label: "Net Profit", value: formatCurrency(netProfit), note: "Gross Profit - Expenses", tone: netProfit >= 0 ? "success" : "danger" },
    ],
    body: reportTableCard("Profit & Loss Statement (Weighted Average Inventory Valuation)", ["Particulars", "Amount"], [
      ["Gross Sales", formatCurrency(grossSales)],
      ["Less: Sales Returns (Credit Notes)", formatCurrency(salesReturns)],
      ["Net Sales", formatCurrency(netSales)],
      ["Opening Stock", formatCurrency(openingStock)],
      ["Add: Net Purchases (Gross: " + formatCurrency(grossPurchases) + " less Returns: " + formatCurrency(purchaseReturns) + ")", formatCurrency(netPurchases)],
      ["Less: Closing Stock (Weighted Average Cost)", formatCurrency(closingStock)],
      ["Cost of Goods Sold (COGS)", formatCurrency(cogs)],
      ["Gross Profit", formatCurrency(grossProfit)],
      ["Less: Operating Expenses", formatCurrency(expenses)],
      ["Net Profit", formatCurrency(netProfit)],
    ], "No profit and loss records found."),
  });
}

function trialBalanceReport() {
  const entries = state.ledgerEntries || [];
  const accountTotals = {};
  for (const entry of entries) {
    const acc = entry.account || "Other";
    if (!accountTotals[acc]) accountTotals[acc] = { debit: 0, credit: 0 };
    accountTotals[acc].debit += Number(entry.debit || 0);
    accountTotals[acc].credit += Number(entry.credit || 0);
  }
  const accounts = Object.keys(accountTotals).sort();
  let totalDebit = 0;
  let totalCredit = 0;
  let totalNetDebit = 0;
  let totalNetCredit = 0;
  const rows = accounts.map((acc) => {
    const d = accountTotals[acc].debit;
    const c = accountTotals[acc].credit;
    totalDebit += d;
    totalCredit += c;
    const net = d - c;
    const netDebit = net > 0 ? net : 0;
    const netCredit = net < 0 ? Math.abs(net) : 0;
    totalNetDebit += netDebit;
    totalNetCredit += netCredit;
    return [
      acc,
      formatCurrency(d),
      formatCurrency(c),
      formatCurrency(netDebit),
      formatCurrency(netCredit),
    ];
  });
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.01;

  return reportPageShell({
    activeReport: "trialBalance",
    eyebrow: "Accountant Reports",
    title: "Trial Balance",
    summary: "Verification of double-entry ledger equilibrium across all accounts.",
    kpis: [
      { label: "Total Debits", value: formatCurrency(totalDebit), note: "Gross debits", tone: "neutral" },
      { label: "Total Credits", value: formatCurrency(totalCredit), note: "Gross credits", tone: "neutral" },
      { label: "Difference", value: formatCurrency(diff), note: isBalanced ? "Balanced (Debits = Credits)" : "Variance detected", tone: isBalanced ? "success" : "danger" },
      { label: "Accounts", value: String(accounts.length), note: "Active ledger accounts", tone: "info" },
    ],
    body: reportTableCard(
      "Account Balances",
      ["Account", "Gross Debit", "Gross Credit", "Net Debit", "Net Credit"],
      rows,
      "No ledger entries recorded yet."
    ),
  });
}

function stockSummaryReport() {
  const rows = state.items.length
    ? state.items.map((item) => ({
        item: item.name,
        kind: itemKind(item).label,
        category: item.category || "-",
        sku: item.sku || "-",
        hsnSac: item.hsnSac || "-",
        unit: item.unit || "-",
        salePrice: item.salePrice,
        purchasePrice: item.purchasePrice,
        taxRate: item.taxRate,
        quantity: item.currentStock,
      }))
    : (state.stockBalances || []);
  const stockValue = rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.purchasePrice || 0), 0);
  const tableRows = rows.map((row) => [
    row.item,
    row.kind || "-",
    row.category || "-",
    row.sku || "-",
    row.hsnSac || "-",
    row.unit || "-",
    formatCurrency(row.purchasePrice || 0),
    formatCurrency(row.salePrice || 0),
    formatPercent(row.taxRate || 0),
    formatQuantity(row.quantity || 0),
  ]);
  return reportPageShell({
    activeReport: "stock",
    eyebrow: "Inventory Reports",
    title: "Stock Summary",
    summary: "Item quantity, value, category, HSN/SAC and GST rate.",
    kpis: [
      { label: "Items", value: String(rows.length), note: "Tracked records", tone: "neutral" },
      { label: "Stock Qty", value: formatQuantity(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)), note: "Total quantity", tone: "info" },
      { label: "Stock Value", value: formatCurrency(stockValue), note: "At purchase price", tone: "success" },
      { label: "Missing HSN", value: String((state.items || []).filter((item) => !item.hsnSac).length), note: "For GST report", tone: "danger" },
    ],
    body: reportTableCard("Stock List", ["Item", "Type", "Category", "SKU", "HSN/SAC", "Unit", "Purchase Price", "Sale Price", "GST", "Current Stock"], tableRows, "No stock records found."),
  });
}

function itemLedgerReport() {
  const rows = state.stockMovements || [];
  const tableRows = rows.map((row) => [
    formatDate(row.movementDate),
    row.item,
    movementTypeLabel(row.movementType),
    formatQuantity(row.quantity || 0),
    row.unit || "-",
    formatCurrency(row.rate || 0),
    row.notes || "-",
  ]);
  return reportPageShell({
    activeReport: "itemLedger",
    eyebrow: "Inventory Reports",
    title: "Item Ledger",
    summary: "Stock movement audit across sales, purchases, returns and adjustments.",
    kpis: [
      { label: "Movements", value: String(rows.length), note: "Stock rows", tone: "neutral" },
      { label: "Stock In", value: formatQuantity(rows.filter((row) => row.movementType === "in").reduce((sum, row) => sum + Number(row.quantity || 0), 0)), note: "Incoming qty", tone: "success" },
      { label: "Stock Out", value: formatQuantity(rows.filter((row) => row.movementType === "out").reduce((sum, row) => sum + Number(row.quantity || 0), 0)), note: "Outgoing qty", tone: "danger" },
      { label: "Adjustments", value: String(rows.filter((row) => row.movementType === "adjustment").length), note: "Manual movement", tone: "info" },
    ],
    body: reportTableCard("Movement List", ["Date", "Item", "Type", "Qty", "Unit", "Rate", "Notes"], tableRows, "No item movements found."),
  });
}

function cashBankReport() {
  const rows = bankAccountRows();
  const balance = rows.reduce((sum, row) => sum + Number(row.currentBalance || 0), 0);
  return reportPageShell({
    activeReport: "cashBank",
    eyebrow: "Cash & Bank Reports",
    title: "Bank Accounts",
    summary: "Bank balances and invoice print readiness.",
    kpis: [
      { label: "Bank Balance", value: formatCurrency(balance), note: "Current tracked balance", tone: "success" },
      { label: "Accounts", value: String(rows.length), note: "Bank records", tone: "neutral" },
      { label: "Default Bank", value: defaultBankAccount()?.displayName || "-", note: "Used on invoice print", tone: "info" },
      { label: "UPI Ready", value: String(rows.filter((row) => row.upiId).length), note: "Accounts with UPI", tone: "neutral" },
    ],
    body: reportTableCard("Bank Account List", ["Account", "Bank", "Account No", "IFSC", "UPI", "Opening", "Current", "Default"], rows.map((row) => [
      row.displayName || "-",
      row.bankName || "-",
      row.accountNo || "-",
      row.ifsc || "-",
      row.upiId || "-",
      formatCurrency(row.openingBalance || 0),
      formatCurrency(row.currentBalance || 0),
      Number(row.isDefault || 0) ? "Yes" : "No",
    ]), "No bank accounts found."),
  });
}

function reportInvoiceTotals(type) {
  const rows = reportInvoicesForType(type);
  return {
    count: rows.length,
    total: rows.reduce((sum, row) => sum + invoiceTotalValue(row), 0),
    received: rows.reduce((sum, row) => sum + invoiceReceivedValue(row), 0),
    balance: rows.reduce((sum, row) => sum + invoiceBalanceValue(row), 0),
    tax: rows.reduce((sum, row) => sum + invoiceTaxValue(row), 0),
  };
}

function reportTaxTotals(type) {
  const invoices = reportInvoicesForType(type);
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const lines = (state.invoiceItems || []).filter((line) => invoiceIds.has(line.invoiceId));
  const fallbackTaxable = invoices.reduce((sum, invoice) => sum + invoiceTaxableValue(invoice), 0);
  const fallbackCgst = invoices.reduce((sum, invoice) => sum + Number(invoice.cgstTotal || 0), 0);
  const fallbackSgst = invoices.reduce((sum, invoice) => sum + Number(invoice.sgstTotal || 0), 0);
  const fallbackIgst = invoices.reduce((sum, invoice) => sum + Number(invoice.igstTotal || 0), 0);
  const taxable = lines.length ? lines.reduce((total, line) => total + Number(line.taxableValue || 0), 0) : fallbackTaxable;
  const cgst = lines.length ? lines.reduce((total, line) => total + Number(line.cgstAmount || 0), 0) : fallbackCgst;
  const sgst = lines.length ? lines.reduce((total, line) => total + Number(line.sgstAmount || 0), 0) : fallbackSgst;
  const igst = lines.length ? lines.reduce((total, line) => total + Number(line.igstAmount || 0), 0) : fallbackIgst;
  return { invoices, lines, taxable, cgst, sgst, igst, tax: cgst + sgst + igst };
}

function reportExpenseInputTax() {
  return (state.transactions || [])
    .filter((row) => row.type === "expense" && isInReportDateScope(row))
    .reduce((sum, row) => sum + expenseTax(row), 0);
}

function reportExpenseTotal() {
  return (state.transactions || [])
    .filter((row) => row.type === "expense" && isInReportDateScope(row))
    .reduce((sum, row) => sum + Number(row.amount || row.total || 0), 0);
}

function invoiceAgeDays(invoice) {
  const due = new Date(invoice.dueDate || invoice.date || invoice.createdAt || Date.now());
  if (Number.isNaN(due.getTime())) return 0;
  const diff = Date.now() - due.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function agingBucketLabel(days) {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function agingBucketTotals(rows) {
  return rows.reduce((totals, invoice) => {
    const age = invoiceAgeDays(invoice);
    const balance = invoiceBalanceValue(invoice);
    if (age <= 30) totals.current += balance;
    else if (age <= 60) totals.mid += balance;
    else if (age <= 90) totals.old += balance;
    else totals.older += balance;
    return totals;
  }, { current: 0, mid: 0, old: 0, older: 0 });
}

function importTemplate(title = "Import Items") {
  return `
    <section class="feature-page">
      <header class="feature-titlebar"><h1>${escapeHtml(title)}</h1></header>
      <div class="import-layout">
        <h2>Select Import Method</h2>
        <div class="import-options">
          <article class="import-option selected"><h3>Import From Barcode</h3><p>Import item details by scanning barcodes.</p></article>
          <article class="import-option"><h3>Import From Excel</h3><p>Import item data from excel files in your system.</p></article>
          <article class="import-option import-wide"><h3>Import From GI Library</h3><p>Import items from GI Billing database.</p></article>
        </div>
      </div>
      <div class="bottom-actions"><button class="sale-button">Continue</button></div>
    </section>
  `;
}

function settingsTemplate(active) {
  const tabs = ["GENERAL", "CUSTOM FIELDS"];
  if (!tabs.includes(active)) active = "GENERAL";
  return `<section class="settings-layout">
    <aside class="settings-menu"><h2>Settings</h2>${tabs.map((tab) => `<button data-settings-tab="${tab}" class="${tab === active ? "active" : ""}">${tab}</button>`).join("")}</aside>
    <main class="settings-content">${active === "CUSTOM FIELDS" ? customFieldsSettingsTemplate() : businessSettingsForm()}</main>
  </section>`;
}

function customFieldsSettingsTemplate() {
  const fields = normalizeCustomFieldDefinitions(state.businessSettings?.customFields);
  return `
    <section class="custom-fields-settings">
      <header class="settings-section-header">
        <div>
          <h3>Custom Fields</h3>
          <p>Add fields to Sale, Purchase, Quotation, Credit Note, Party, Item, or Expense screens.</p>
        </div>
      </header>
      <form id="customFieldCreateForm" class="custom-field-create-form">
        <label>Module
          <select class="form-input" name="module">
            <option value="sale">Sale Invoice</option>
            <option value="purchase">Purchase Bill</option>
            <option value="estimate">Quotation</option>
            <option value="saleReturn">Credit Note</option>
            <option value="purchaseReturn">Debit Note</option>
            <option value="party">Party</option>
            <option value="item">Item</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label>Field Label<input class="form-input" name="label" placeholder="Vehicle No, Project Name"></label>
        <label>Type
          <select class="form-input" name="fieldType">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="dropdown">Dropdown</option>
            <option value="checkbox">Checkbox</option>
            <option value="textarea">Textarea</option>
          </select>
        </label>
        <label>Dropdown Options<input class="form-input" name="options" placeholder="Option 1, Option 2"></label>
        <button class="primary-button square" type="submit">Add Field</button>
      </form>
      <div class="custom-field-list">
        ${fields.map((field) => customFieldRowTemplate(field)).join("") || '<p class="empty-table">No custom fields yet.</p>'}
      </div>
    </section>
  `;
}

function customFieldRowTemplate(field) {
  const moduleLabel = {
    sale: "Sale",
    purchase: "Purchase",
    estimate: "Quotation",
    saleReturn: "Credit Note",
    purchaseReturn: "Debit Note",
    party: "Party",
    item: "Item",
    expense: "Expense",
  }[field.module] || field.module;
  return `
    <article class="custom-field-row ${field.active ? "" : "inactive"}">
      <div>
        <strong>${escapeHtml(field.label)}</strong>
        <small>${escapeHtml(moduleLabel)} · ${escapeHtml(field.fieldType)} · key: ${escapeHtml(field.fieldKey)}</small>
      </div>
      <label><input data-custom-field-toggle="${escapeHtml(field.id)}" data-custom-field-prop="required" type="checkbox" ${field.required ? "checked" : ""}> Required</label>
      <label><input data-custom-field-toggle="${escapeHtml(field.id)}" data-custom-field-prop="showOnPrint" type="checkbox" ${field.showOnPrint ? "checked" : ""}> Print</label>
      <label><input data-custom-field-toggle="${escapeHtml(field.id)}" data-custom-field-prop="active" type="checkbox" ${field.active ? "checked" : ""}> Active</label>
      <button class="outline-mini-button" data-custom-field-delete="${escapeHtml(field.id)}" type="button">Delete</button>
    </article>
  `;
}

function businessSettingsForm() {
  const settings = state.businessSettings || defaultBusinessSettings();
  const bank = settings.bankDetails || {};
  const logoSrc = settings.logoBase64 || "";
  return `
    <form class="business-settings-form" id="businessSettingsForm">
      <section>
        <h3>Business Profile</h3>
        <label>Business Name<input class="form-input" name="businessName" value="${escapeHtml(settings.businessName || state.activeCompany || "testt")}"></label>
        <label>Address<textarea class="form-input" name="address" rows="3" placeholder="Business address">${escapeHtml(settings.address || "")}</textarea></label>
        <label>State<select class="form-input" name="state">${indianStateOptions(settings.state || "Karnataka")}</select></label>
      </section>
      <section>
        <h3>Tax Identity</h3>
        <label>GSTIN<input class="form-input" name="gstin" value="${escapeHtml(settings.gstin || "")}" placeholder="GSTIN"><small class="field-hint">Format: 22AAAAA0000A1Z5</small></label>
        <label>PAN<input class="form-input" name="pan" value="${escapeHtml(settings.pan || "")}" placeholder="PAN"></label>
      </section>
      <section>
        <h3>Business Logo</h3>
        <div class="logo-upload-section">
          ${logoSrc ? `<img class="logo-preview-img" src="${logoSrc}" alt="Business logo">` : `<div class="logo-placeholder">No logo uploaded</div>`}
          <div class="logo-upload-actions">
            <label class="secondary-button logo-upload-label" for="logoFileInput">Choose Logo</label>
            <input type="file" id="logoFileInput" name="logoFile" accept="image/*" style="display:none">
            ${logoSrc ? `<button class="link-button danger-link" type="button" id="removeLogoBtn">Remove Logo</button>` : ""}
          </div>
          <small>PNG or JPG, shown on invoice print</small>
        </div>
      </section>
      <section>
        <h3>Invoice Numbering</h3>
        <label>Invoice Prefix<input class="form-input" name="invoicePrefix" value="${escapeHtml(settings.invoicePrefix || "INV")}"></label>
        <label>Starting Invoice Number<input class="form-input" name="startingNo" type="number" min="1" value="${Number(settings.startingNo || 1)}"></label>
        <label>Default Terms &amp; Conditions<textarea class="form-input" name="terms" rows="4" placeholder="Terms shown on invoices">${escapeHtml(settings.terms || "")}</textarea></label>
      </section>
      <section>
        <h3>Bank Details</h3>
        <label>Bank Name<input class="form-input" name="bankName" value="${escapeHtml(bank.bankName || "")}" placeholder="Bank name"></label>
        <label>Account No<input class="form-input" name="accountNo" value="${escapeHtml(bank.accountNo || "")}" placeholder="Account number"></label>
        <label>IFSC<input class="form-input" name="ifsc" value="${escapeHtml(bank.ifsc || "")}" placeholder="IFSC"></label>
        <label>UPI ID<input class="form-input" name="upiId" value="${escapeHtml(bank.upiId || "")}" placeholder="name@upi"></label>
      </section>
      <footer><span id="businessSettingsStatus"></span><button class="primary-button square" type="submit">Save Settings</button></footer>
    </form>
  `;
}

function indianStateOptions(selected = "") {
  const states = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
    "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  ];
  return states.map((stateName) => `<option ${stateName === selected ? "selected" : ""}>${escapeHtml(stateName)}</option>`).join("");
}

function addItemTemplate() {
  return `
    <section class="feature-page">
      <div class="add-item-page">
        <header class="add-item-head"><h1>Add Item</h1><strong>Product</strong><span>Service</span></header>
        <div class="item-fields"><input class="form-input" placeholder="Item Name *"><input class="form-input" placeholder="Item HSN"><button class="primary-button square">Select Unit</button><button class="link-button">Add Item Image</button><input class="form-input" placeholder="Category"><input class="form-input" placeholder="Item Code"></div>
        <div class="item-panel"><h3>Pricing</h3><p>Sale Price</p><input class="form-input" placeholder="Sale Price"> <select class="form-input"><option>Without Tax</option></select><p class="link-button">+ Add Wholesale Price</p></div>
        <div class="item-panel"><h3>Purchase Price</h3><input class="form-input" placeholder="Purchase Price"></div>
      </div>
      <div class="bottom-actions"><button class="secondary-button">Save & New</button><button class="primary-button square">Save</button></div>
    </section>
  `;
}

function simplePage(title, message) {
  return `<section class="feature-page"><header class="feature-titlebar"><h1>${escapeHtml(title)}</h1></header><div class="feature-empty-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div></section>`;
}

function viewTitle(view) {
  return {
    parties: "Parties",
    items: "Items",
    sales: "Sales",
    purchases: "Purchases",
    reports: "Reports",
    cash: "Cash & Bank",
    settings: "Utilities",
  }[view] || "All Transactions";
}

function actionTitle(view) {
  return {
    parties: "+ Add Party",
    items: "+ Add Item",
    purchases: "+ Add Purchase",
  }[view] || "+ Add Sale";
}

function actionType(view) {
  return {
    parties: "party",
    items: "item",
    purchases: "purchase",
  }[view] || "sale";
}

function renderCurrentList() {
  if (currentView === "home") return;
  const query = globalSearchQuery();
  let rows = [];
  let head = [];

  if (currentView === "parties") {
    head = ["Party", "Notes", "Created"];
    rows = state.parties.map((party) => [party.name, party.notes || "-", formatDate(party.createdAt)]);
  } else if (currentView === "items") {
    head = ["Item", "Unit", "Current Stock", "Purchase Price", "Sale Price", "Created"];
    rows = state.items.map((item) => [
      item.name,
      item.unit || "-",
      Number(item.currentStock || 0),
      formatCurrency(item.purchasePrice || 0),
      formatCurrency(item.salePrice || 0),
      formatDate(item.createdAt),
    ]);
  } else if (currentView === "reports") {
    head = ["Report", "Value"];
    rows = [
      ["Sale Report", formatCurrency(totalFor("sale"))],
      ["Purchase Report", formatCurrency(totalFor("purchase"))],
      ["Receivable", elements.receivableTotal.textContent],
      ["Payable", elements.payableTotal.textContent],
      ["Parties", state.parties.length],
      ["Items", state.items.length],
    ];
  } else {
    const type = currentView === "purchases" ? "purchase" : currentView === "sales" ? "sale" : "";
    head = ["Date", "Type", "Party", "Item", "Status", "Amount", "Notes"];
    rows = state.transactions
      .filter((entry) => !type || entry.type === type)
      .map((entry) => [
        formatDate(entry.date),
        entry.type,
        entry.party,
        entry.item,
        entry.status,
        formatCurrency(entry.amount),
        entry.notes || "-",
      ]);
  }

  if (query) {
    rows = rows.filter((row) => row.join(" ").toLowerCase().includes(query));
  }

  elements.tableHead.innerHTML = `<tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr>`;
  elements.tableBody.innerHTML = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`)
    .join("");
  elements.emptyTable.classList.toggle("hidden", rows.length > 0);
}

function globalSearchQuery() {
  return String(elements.searchInput?.value || "").trim().toLowerCase();
}

function scheduleDashboardChartDraw() {
  if (dashboardChartFrame) cancelAnimationFrame(dashboardChartFrame);
  dashboardChartFrame = requestAnimationFrame(() => {
    dashboardChartFrame = 0;
    drawChart();
    setTimeout(drawChart, 80);
  });
}

function drawChart() {
  const canvas = elements.salesChart;
  if (!canvas || elements.homeView?.classList.contains("hidden")) return;

  const ctx = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(360, Math.floor(bounds.width || canvas.clientWidth || 920));
  const height = Math.max(220, Math.floor(bounds.height || canvas.clientHeight || 260));
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = { top: 24, right: 24, bottom: 42, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const period = document.getElementById("periodSelect")?.value || "This Month";
  const series = dashboardSalesSeries(period);
  const values = series.values;
  const maxValue = Math.max(...values, 0);
  const max = niceChartMax(maxValue);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "12px Segoe UI";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotHeight / 4) * i;
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = "#7a86a5";
    ctx.fillText(compactNumber(max - (max / 4) * i), 10, y + 4);
  }

  const xForIndex = (index) => {
    if (values.length <= 1) return pad.left + plotWidth / 2;
    return pad.left + (plotWidth / (values.length - 1)) * index;
  };
  const yForValue = (value) => pad.top + plotHeight - (Number(value || 0) / max) * plotHeight;

  ctx.strokeStyle = "#0c7ee8";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = xForIndex(index);
    const y = yForValue(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (values.length > 1) {
    const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    gradient.addColorStop(0, "rgba(12, 126, 232, 0.18)");
    gradient.addColorStop(1, "rgba(12, 126, 232, 0.02)");
    ctx.fillStyle = gradient;
    ctx.lineTo(xForIndex(values.length - 1), height - pad.bottom);
    ctx.lineTo(xForIndex(0), height - pad.bottom);
    ctx.closePath();
    ctx.fill();
  }

  values.forEach((value, index) => {
    if (!value && maxValue > 0) return;
    const x = xForIndex(index);
    const y = yForValue(value);
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0c7ee8";
    ctx.lineWidth = 2;
    ctx.arc(x, y, value ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  const labelStep = Math.max(1, Math.ceil(series.labels.length / 8));
  ctx.fillStyle = "#7a86a5";
  series.labels.forEach((label, index) => {
    if (index % labelStep !== 0 && index !== series.labels.length - 1) return;
    const x = xForIndex(index);
    ctx.fillText(label, Math.max(4, Math.min(width - 64, x - 18)), height - 12);
  });

  ctx.fillStyle = "#415174";
  ctx.font = "600 13px Segoe UI";
  ctx.fillText(series.title, pad.left, 16);

  if (maxValue <= 0) {
    ctx.fillStyle = "#7a86a5";
    ctx.font = "600 14px Segoe UI";
    ctx.fillText("No sales recorded for this period", pad.left + Math.max(0, plotWidth / 2 - 95), pad.top + plotHeight / 2);
  }
}

function dashboardSalesSeries(period) {
  const now = new Date();
  const sales = invoiceRowsForType("sale")
    .filter((entry) => invoiceStatusKey(entry) !== "cancelled")
    .map((entry) => ({ entry, date: dashboardEntryDate(entry), amount: invoiceTotalValue(entry) }))
    .filter((row) => row.date && Number.isFinite(row.amount));

  if (period === "Today") {
    const labels = ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"];
    const values = Array(labels.length).fill(0);
    sales.forEach((row) => {
      if (!sameDate(row.date, now)) return;
      const index = Math.min(labels.length - 1, Math.floor(row.date.getHours() / 3));
      values[index] += row.amount;
    });
    return { title: "Sales Today", labels, values };
  }

  if (period === "This Year") {
    const labels = Array.from({ length: 12 }, (_, index) => new Date(now.getFullYear(), index, 1).toLocaleString("en-IN", { month: "short" }));
    const values = Array(12).fill(0);
    sales.forEach((row) => {
      if (row.date.getFullYear() !== now.getFullYear()) return;
      values[row.date.getMonth()] += row.amount;
    });
    return { title: `Sales in ${now.getFullYear()}`, labels, values };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
  const values = Array(daysInMonth).fill(0);
  sales.forEach((row) => {
    if (row.date.getFullYear() !== year || row.date.getMonth() !== month) return;
    values[row.date.getDate() - 1] += row.amount;
  });
  return { title: `Sales in ${now.toLocaleString("en-IN", { month: "long", year: "numeric" })}`, labels, values };
}

function dashboardEntryDate(entry) {
  return parseEditorDateAsDate(entry.date || entry.invoiceDate || entry.createdAt);
}

function sameDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function niceChartMax(value) {
  if (!value || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  const nice = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * power;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(Number(value || 0));
}

function totalFor(type) {
  return activeInvoiceRowsForType(type).reduce((sum, entry) => sum + invoiceTotalValue(entry), 0);
}

function totalReceivable() {
  return invoiceRowsForType("sale")
    .filter((entry) => invoiceStatusKey(entry) !== "cancelled")
    .reduce((total, entry) => total + invoiceBalanceValue(entry), 0);
}

function totalPayable() {
  return invoiceRowsForType("purchase")
    .filter((entry) => invoiceStatusKey(entry) !== "cancelled")
    .reduce((total, entry) => total + invoiceBalanceValue(entry), 0);
}

function sumAmount(total, entry) {
  return total + Number(entry.amount ?? entry.total ?? 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function icon(name, className = "") {
  const safeName = String(name || "").replace(/[^a-z0-9-]/gi, "");
  const safeClass = String(className || "").replace(/[^a-z0-9-_ ]/gi, "");
  return `<svg class="gi-icon${safeClass ? ` ${safeClass}` : ""}" aria-hidden="true"><use href="#gi-${safeName}"></use></svg>`;
}

// ── Payment-In Module ─────────────────────────────────────────────────────────

function paymentInTemplate() {
  const payments = (state.payments || []).filter((p) => p.type === "payment_in");
  const receivable = totalReceivable();
  const thisMonthPayments = payments.filter((p) => {
    const d = new Date(p.paymentDate || p.createdAt || "");
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const thisMonthTotal = thisMonthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return `
    <section class="invoice-workspace sale-workspace">
      <header class="app-page-header invoice-page-header">
        <div>
          <p class="muted-label">Sales</p>
          <h1>Payment-In</h1>
          <small>${payments.length} payment${payments.length === 1 ? "" : "s"} recorded</small>
        </div>
        <div class="invoice-header-actions">
          <button class="sale-button" data-action="create-payment-in" type="button">+ Record Payment</button>
        </div>
      </header>
      <section class="kpi-grid invoice-kpis">
        ${kpiCard("This Month", formatCurrency(thisMonthTotal), `${thisMonthPayments.length} payments received`, "success")}
        ${kpiCard("Total Received", formatCurrency(payments.reduce((s, p) => s + Number(p.amount || 0), 0)), "All time", "neutral")}
        ${kpiCard("Receivable", formatCurrency(receivable), "Pending customer balances", receivable > 0 ? "danger" : "success")}
        ${kpiCard("Payments", String(payments.length), "All recorded", "info")}
      </section>
      <section class="data-table-card invoice-data-card">
        ${payments.length ? `
          <table class="data-table">
            <thead><tr><th>Date</th><th>Customer</th><th>Invoice Ref</th><th>Method</th><th>Amount</th><th>Notes</th></tr></thead>
            <tbody>
              ${payments.map((p) => `
                <tr>
                  <td>${formatDate(p.paymentDate || p.createdAt)}</td>
                  <td><strong>${escapeHtml(p.party || "-")}</strong></td>
                  <td>${escapeHtml(p.invoiceNo || p.referenceNo || "-")}</td>
                  <td>${escapeHtml(p.method || "Cash")}</td>
                  <td class="amount-cell strong">${formatCurrency(p.amount || 0)}</td>
                  <td>${escapeHtml(p.notes || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `
          <div class="feature-empty-card">
            <strong>No payments recorded yet</strong>
            <p>Record incoming payments from customers against sale invoices.</p>
            <button class="sale-button" data-action="create-payment-in" type="button">+ Record Payment</button>
          </div>
        `}
      </section>
    </section>
  `;
}

function openPaymentInModal() {
  const invoices = activeInvoiceRowsForType("sale").filter((inv) => invoiceBalanceValue(inv) > 0);
  const existingModal = document.getElementById("paymentInModal");
  if (existingModal) existingModal.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "paymentInModal";
  modal.innerHTML = `
    <section class="entry-modal" role="dialog" aria-modal="true" aria-label="Record Payment-In">
      <header>
        <h2>Record Payment-In</h2>
        <button class="close-button" type="button" data-close-payment-modal>&times;</button>
      </header>
      <form id="paymentInForm" class="entry-form" novalidate>
        <div class="entry-form-body">
          <label>Customer
            <input class="form-input" name="party" list="paymentPartyList" placeholder="Customer name" autocomplete="off">
            <datalist id="paymentPartyList">
              ${(state.parties || []).map((p) => `<option value="${escapeHtml(p.name)}">`).join("")}
            </datalist>
          </label>
          <label>Invoice Reference
            <select class="form-input" name="invoiceRef">
              <option value="">— Select invoice (optional) —</option>
              ${invoices.map((inv) => `<option value="${escapeHtml(inv.invoiceNo || inv.id)}">${escapeHtml(inv.invoiceNo || inv.id)} — ${escapeHtml(inv.party)} — ${formatCurrency(invoiceBalanceValue(inv))}</option>`).join("")}
            </select>
          </label>
          <label>Amount *
            <input class="form-input" name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required>
          </label>
          <label>Payment Date
            <input class="form-input" name="paymentDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
          </label>
          <label>Payment Method
            <select class="form-input" name="method">
              <option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Card</option>
            </select>
          </label>
          <label>Notes
            <input class="form-input" name="notes" placeholder="Reference number, cheque no, etc.">
          </label>
        </div>
        <footer>
          <span id="paymentInStatus"></span>
          <div>
            <button class="secondary-button" type="button" data-close-payment-modal>Cancel</button>
            <button class="sale-button" type="submit">Save Payment</button>
          </div>
        </footer>
      </form>
    </section>
  `;
  document.body.append(modal);
  modal.querySelectorAll("[data-close-payment-modal]").forEach((btn) => {
    btn.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector("#paymentInForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const amount = Number(form.get("amount") || 0);
    let party = String(form.get("party") || "").trim();
    if (!amount || amount <= 0) {
      showToast("Please enter a valid amount.");
      return;
    }
    const payment = {
      type: "payment_in",
      party,
      invoiceNo: String(form.get("invoiceRef") || ""),
      referenceNo: String(form.get("invoiceRef") || ""),
      amount,
      paymentDate: String(form.get("paymentDate") || new Date().toISOString().slice(0, 10)),
      method: String(form.get("method") || "Cash"),
      notes: String(form.get("notes") || "").trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      if (window.giDB?.recordPaymentIn) {
        const invoiceRef = form.get("invoiceRef");
        let invoiceId = null;
        if (invoiceRef) {
          const invoice = findInvoiceRecord(invoiceRef) || activeInvoiceRowsForType("sale").find((inv) => inv.invoiceNo === invoiceRef || inv.id === invoiceRef);
          if (invoice) {
            invoiceId = invoice.id || invoice.invoiceId;
            if (!party) party = invoice.party;
          }
        }
        if (!invoiceId && !party) {
          showToast("Please enter a customer name or select an invoice.");
          return;
        }
        state = normalizeState(await window.giDB.recordPaymentIn({
          invoiceId,
          party,
          amount,
          method: payment.method,
          notes: payment.notes,
          paymentDate: payment.paymentDate,
        }));
      } else if (window.giDB?.recordInvoicePayment) {
        const invoiceRef = form.get("invoiceRef");
        if (invoiceRef) {
          const invoice = findInvoiceRecord(invoiceRef) || activeInvoiceRowsForType("sale").find((inv) => inv.invoiceNo === invoiceRef);
          if (invoice) {
            state = normalizeState(await window.giDB.recordInvoicePayment({ invoiceId: invoice.id || invoice.invoiceId, amount, method: payment.method, notes: payment.notes, paymentDate: payment.paymentDate }));
          }
        }
      } else {
        state.payments = [payment, ...(state.payments || [])];
        saveState();
      }
      modal.remove();
      showToast("Payment recorded.");
      renderDashboard();
      renderFeatureView("paymentIn");
    } catch (err) {
      const status = modal.querySelector("#paymentInStatus");
      if (status) status.textContent = err.message || "Unable to record payment.";
    }
  });
}

// ── CSV Import Module ─────────────────────────────────────────────────────────

let csvImportRows = [];
let csvImportType = "items";

function csvImportTemplate(importType = "items") {
  csvImportType = importType;
  const isItems = importType === "items";
  const title = isItems ? "Import Items" : "Import Parties";
  const templateHeaders = isItems
    ? ["Name", "SKU", "Category", "Unit", "HSN Code", "Sale Price", "Purchase Price", "Tax Rate", "Opening Stock"]
    : ["Name", "Phone", "Email", "GSTIN", "State", "Billing Address", "Opening Balance"];

  return `
    <section class="feature-page" data-import-type="${importType}">
      <header class="app-page-header">
        <div>
          <p class="muted-label">Utilities</p>
          <h1>${title}</h1>
          <small>Upload a CSV file to bulk import</small>
        </div>
        <div class="invoice-header-actions">
          <button class="secondary-button" data-action="csv-import-export-template" type="button">Download Template</button>
        </div>
      </header>
      <section class="data-table-card" style="padding:2rem;margin:1rem 0;">
        <h3>Step 1 — Choose CSV File</h3>
        <p style="margin:.5rem 0 1rem;color:var(--text-muted)">CSV must have headers: <code>${templateHeaders.join(", ")}</code></p>
        <label class="secondary-button" for="csvFileInput" style="display:inline-block;cursor:pointer;">Choose File</label>
        <input type="file" id="csvFileInput" accept=".csv,text/csv" style="display:none">
        <span id="csvFileName" style="margin-left:1rem;color:var(--text-muted)">No file chosen</span>
      </section>
      <section id="csvPreviewSection" class="data-table-card" style="padding:2rem;margin:1rem 0;display:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3>Step 2 — Preview &amp; Import</h3>
          <button class="sale-button" data-action="csv-import-run" type="button">Import All Rows</button>
        </div>
        <div id="csvPreviewTable"></div>
      </section>
    </section>
  `;
}

function handleCsvFileSelected(input) {
  const file = input.files[0];
  const nameSpan = elements.featureView.querySelector("#csvFileName");
  const previewSection = elements.featureView.querySelector("#csvPreviewSection");
  if (nameSpan) nameSpan.textContent = file ? file.name : "No file chosen";
  if (!file) { if (previewSection) previewSection.style.display = "none"; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    csvImportRows = parseCsv(text);
    renderCsvPreview();
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((header, i) => { row[header] = values[i] || ""; });
    return row;
  }).filter((row) => Object.values(row).some(Boolean));
}

function renderCsvPreview() {
  const previewSection = elements.featureView.querySelector("#csvPreviewSection");
  const previewTable = elements.featureView.querySelector("#csvPreviewTable");
  if (!previewSection || !previewTable) return;
  if (!csvImportRows.length) {
    previewTable.innerHTML = "<p>No rows found in CSV.</p>";
    previewSection.style.display = "";
    return;
  }
  const headers = Object.keys(csvImportRows[0]);
  previewTable.innerHTML = `
    <table class="data-table">
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${csvImportRows.slice(0, 20).map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h] || "")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
    ${csvImportRows.length > 20 ? `<p style="margin-top:.5rem;color:var(--text-muted)">Showing 20 of ${csvImportRows.length} rows</p>` : ""}
    <p style="margin-top:1rem;"><strong>${csvImportRows.length} row${csvImportRows.length === 1 ? "" : "s"}</strong> ready to import.</p>
  `;
  previewSection.style.display = "";
}

async function runCsvImport() {
  if (!csvImportRows.length) { showToast("No rows to import."); return; }
  const isItems = csvImportType === "items";
  let success = 0;
  let errors = 0;
  let warnings = [];
  for (const row of csvImportRows) {
    const name = row["Name"] || row["name"] || "";
    if (!name) { errors++; continue; }
    try {
      if (isItems) {
        const rawCategory = (row["Category"] || row["category"] || "").trim();
        const rawUnit = (row["Unit"] || row["unit"] || "Pcs").trim();

        let categoryName = rawCategory;
        let unitName = rawUnit;

        if (categoryName && window.giDB) {
          const existingCat = (state.itemCategories || []).find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
          if (!existingCat) {
            try {
              state = normalizeState(await window.giDB.createItemCategory({ name: categoryName }));
              warnings.push(`Created category "${categoryName}".`);
            } catch (_) { /* category may already exist from parallel import */ }
          }
        }
        if (unitName && window.giDB) {
          const existingUnit = (state.units || []).find((u) => u.name.toLowerCase() === unitName.toLowerCase());
          if (!existingUnit) {
            try {
              state = normalizeState(await window.giDB.createUnit({ name: unitName }));
              warnings.push(`Created unit "${unitName}".`);
            } catch (_) { /* unit may already exist from parallel import */ }
          }
        }

        const itemDetails = {
          name,
          sku: row["SKU"] || row["sku"] || "",
          category: categoryName,
          unit: unitName,
          hsnSac: row["HSN Code"] || row["HSN/SAC"] || "",
          salePrice: Number(row["Sale Price"] || row["salePrice"] || 0),
          purchasePrice: Number(row["Purchase Price"] || row["purchasePrice"] || 0),
          taxRate: Number(row["Tax Rate"] || row["taxRate"] || 0),
          openingStock: Number(row["Opening Stock"] || row["openingStock"] || 0),
          currentStock: Number(row["Opening Stock"] || row["openingStock"] || 0),
          itemType: "product",
          notes: "",
        };
        if (window.giDB?.createItem) {
          state = normalizeState(await window.giDB.createItem(itemDetails));
        } else {
          if (!state.items.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
            state.items.unshift({ ...itemDetails, id: Date.now() + Math.random(), createdAt: new Date().toISOString() });
          }
        }
      } else {
        const partyDetails = {
          name,
          phone: row["Phone"] || row["phone"] || "",
          email: row["Email"] || row["email"] || "",
          gstin: row["GSTIN"] || row["gstin"] || "",
          state: row["State"] || row["state"] || "",
          billingAddress: row["Billing Address"] || row["billingAddress"] || "",
          openingBalance: Number(row["Opening Balance"] || row["openingBalance"] || 0),
          type: "party",
          taxType: row["GSTIN"] ? "gst_registered" : "unregistered",
          notes: "",
        };
        if (window.giDB?.createParty) {
          state = normalizeState(await window.giDB.createParty(partyDetails));
        } else {
          if (!state.parties.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
            state.parties.unshift({ ...partyDetails, id: Date.now() + Math.random(), createdAt: new Date().toISOString() });
          }
        }
      }
      success++;
    } catch (err) {
      errors++;
    }
  }
  if (!window.giDB) saveState();
  csvImportRows = [];
  const warnText = warnings.length ? ` (${warnings.slice(0, 3).join("; ")}${warnings.length > 3 ? "..." : ""})` : "";
  showToast(`Import complete: ${success} added${errors ? `, ${errors} skipped` : ""}${warnText}.`);
  renderFeatureView(csvImportType === "items" ? "importItems" : "importParties");
}

function exportCsvTemplate(importType = "items") {
  const headers = importType === "items"
    ? ["Name", "SKU", "Category", "Unit", "HSN Code", "Sale Price", "Purchase Price", "Tax Rate", "Opening Stock"]
    : ["Name", "Phone", "Email", "GSTIN", "State", "Billing Address", "Opening Balance"];
  const sampleRow = importType === "items"
    ? ["Sample Item", "SKU001", "Electronics", "Pcs", "8471", "1000", "800", "18", "100"]
    : ["Sample Customer", "9876543210", "customer@example.com", "22AAAAA0000A1Z5", "Karnataka", "123 Main Street", "5000"];
  const csv = [headers.join(","), sampleRow.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${importType}_import_template.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Template downloaded.");
}

// ── Sale Order ────────────────────────────────────────────────────────────────

function saleOrderTemplate() {
  const saleOrders = (state.invoices || []).filter((inv) => inv.type === "saleOrder" || inv.type === "sale_order");
  return `
    <section class="invoice-workspace sale-workspace">
      <header class="app-page-header invoice-page-header">
        <div>
          <p class="muted-label">Sales</p>
          <h1>Sale Orders</h1>
          <small>${saleOrders.length} order${saleOrders.length === 1 ? "" : "s"}</small>
        </div>
        <div class="invoice-header-actions">
          <button class="sale-button" type="button" onclick="openTransactionEditor('sale')">+ New Sale Invoice</button>
        </div>
      </header>
      <section class="kpi-grid invoice-kpis">
        ${kpiCard("Orders", String(saleOrders.length), "Recorded sale orders", "neutral")}
        ${kpiCard("Total", formatCurrency(saleOrders.reduce((s, o) => s + invoiceTotalValue(o), 0)), "Order value", "success")}
        ${kpiCard("Pending", String(saleOrders.filter((o) => o.status === "pending" || o.status === "draft").length), "Awaiting processing", "info")}
        ${kpiCard("Receivable", formatCurrency(totalReceivable()), "Customer balance", "danger")}
      </section>
      <section class="data-table-card invoice-data-card">
        ${saleOrders.length ? invoiceRowsTable(saleOrders, { isSale: true, partyLabel: "Customer", numberLabel: "Order No", paidLabel: "Received" }) : `
          <div class="feature-empty-card">
            <strong>No sale orders yet</strong>
            <p>Sale orders will appear here once recorded. Use the Sale Invoice editor to get started.</p>
            <button class="sale-button" type="button" onclick="openTransactionEditor('sale')">+ Create Sale Invoice</button>
          </div>
        `}
      </section>
    </section>
  `;
}

// ── Delivery Challan ──────────────────────────────────────────────────────────

function deliveryChallanTemplate() {
  const challans = (state.invoices || []).filter((inv) => inv.type === "deliveryChallan" || inv.type === "delivery_challan");
  return `
    <section class="invoice-workspace sale-workspace">
      <header class="app-page-header invoice-page-header">
        <div>
          <p class="muted-label">Sales</p>
          <h1>Delivery Challans</h1>
          <small>${challans.length} challan${challans.length === 1 ? "" : "s"}</small>
        </div>
        <div class="invoice-header-actions">
          <button class="sale-button" type="button" onclick="openTransactionEditor('sale')">+ New Sale Invoice</button>
        </div>
      </header>
      <section class="kpi-grid invoice-kpis">
        ${kpiCard("Challans", String(challans.length), "Recorded challans", "neutral")}
        ${kpiCard("Total Value", formatCurrency(challans.reduce((s, c) => s + invoiceTotalValue(c), 0)), "Challan amount", "success")}
        ${kpiCard("Pending", String(challans.filter((c) => c.status === "pending").length), "Not invoiced", "info")}
        ${kpiCard("This Month", String(challans.filter((c) => { const d = new Date(c.date || ""); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }).length), "Current month challans", "neutral")}
      </section>
      <section class="data-table-card invoice-data-card">
        ${challans.length ? invoiceRowsTable(challans, { isSale: true, partyLabel: "Customer", numberLabel: "Challan No", paidLabel: "Received" }) : `
          <div class="feature-empty-card">
            <strong>No delivery challans yet</strong>
            <p>Challans document goods dispatched before invoicing. Create a sale invoice and mark it as a delivery challan.</p>
            <button class="sale-button" type="button" onclick="openTransactionEditor('sale')">+ Create Sale Invoice</button>
          </div>
        `}
      </section>
    </section>
  `;
}

function openKeyboardShortcutsDialog() {
  const existing = document.querySelector(".shortcuts-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop shortcuts-backdrop";
  backdrop.innerHTML = `
    <section class="shortcuts-dialog" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
      <header>
        <strong>Keyboard Shortcuts</strong>
        <button class="close-button" type="button" data-close-shortcuts>&times;</button>
      </header>
      <div class="shortcuts-body">
        <div class="shortcuts-group">
          <h4>General</h4>
          <div class="shortcut-row"><span>Open Anything / Search</span><kbd>Ctrl</kbd><kbd>/</kbd></div>
          <div class="shortcut-row"><span>Dashboard / Home</span><kbd>Ctrl</kbd><kbd>H</kbd></div>
          <div class="shortcut-row"><span>Refresh</span><kbd>Ctrl</kbd><kbd>R</kbd></div>
          <div class="shortcut-row"><span>Close / Cancel</span><kbd>Esc</kbd></div>
        </div>
        <div class="shortcuts-group">
          <h4>Sales &amp; Invoices</h4>
          <div class="shortcut-row"><span>New Sale Invoice</span><kbd>Ctrl</kbd><kbd>N</kbd></div>
          <div class="shortcut-row"><span>Save Sale</span><kbd>Ctrl</kbd><kbd>S</kbd></div>
          <div class="shortcut-row"><span>Save &amp; Print</span><kbd>Ctrl</kbd><kbd>P</kbd></div>
          <div class="shortcut-row"><span>Save &amp; Submit</span><kbd>Ctrl</kbd><kbd>Enter</kbd></div>
          <div class="shortcut-row"><span>Add New Row</span><kbd>Alt</kbd><kbd>R</kbd></div>
          <div class="shortcut-row"><span>Move to Next Field</span><kbd>Enter</kbd></div>
        </div>
      </div>
      <footer>
        <button class="primary-button square" type="button" data-close-shortcuts>Done</button>
      </footer>
    </section>
  `;
  document.body.append(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelectorAll("[data-close-shortcuts]").forEach((btn) => btn.addEventListener("click", close));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", handler);
      close();
    }
  });
}
