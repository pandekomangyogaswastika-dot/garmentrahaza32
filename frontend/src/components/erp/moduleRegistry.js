import { lazy, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// PT Rahaza ERP — Module Registry (Navigation Refinement Phase 1+2)
//
// Changes vs previous version:
//   - Added: prod-models-bom (combined Models + BOM + Sizes)
//   - Added: mgmt-integrations (API Keys management)
//   - Redirects: prod-models, prod-bom, prod-sizes → prod-models-bom
//   - Redirects: prod-oee, prod-line-balance, prod-rework-analytics, prod-aps-gantt → production-dashboard
//   - Redirects: wh-material-reservation → prod-material-reservation
//   - Redirects: mgmt-products → prod-models-bom
// ─────────────────────────────────────────────────────────────────────────────

// Helper: simple redirect component that switches to target module
function makeRedirect(targetId, tabKey) {
  return function RedirectModule({ onNavigate }) {
    useEffect(() => {
      if (tabKey) {
        // Store tab hint in sessionStorage for the target to pick up
        if (targetId === 'production-dashboard') {
          sessionStorage.setItem('prod_dashboard_tab', tabKey);
        } else if (targetId === 'prod-models-bom') {
          sessionStorage.setItem('models_bom_tab', tabKey);
        }
      }
      if (onNavigate) onNavigate(targetId);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(var(--primary))] mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Mengarahkan...</p>
        </div>
      </div>
    );
  };
}

// Dashboards
const ManagementDashboard = lazy(() => import('./ManagementDashboard'));
const WarehouseDashboard  = lazy(() => import('./WarehouseDashboard'));
const FinanceDashboard    = lazy(() => import('./FinanceDashboard'));
const ProductionDashboardPlaceholder = lazy(() => import('./ProductionDashboardPlaceholder'));
// Sprint 1.2: Replace placeholder with real HR Dashboard
const HRDashboard = lazy(() => import('./HRDashboard'));

// Management — master data + administrasi
const ProductsModule        = lazy(() => import('./ProductsModule'));
const BuyersModule          = lazy(() => import('./BuyersModule'));
const ReportsModule         = lazy(() => import('./ReportsModule'));
const UserManagementModule  = lazy(() => import('./UserManagementModule'));
const RoleManagementModule  = lazy(() => import('./RoleManagementModule'));
const RoleMatrixModule      = lazy(() => import('./RoleMatrixModule'));
const ActivityLogModule     = lazy(() => import('./ActivityLogModule'));
const CompanySettingsModule = lazy(() => import('./CompanySettingsModule'));
const PDFConfigModule       = lazy(() => import('./PDFConfigModule'));
// Legacy HelpGuideModule replaced by RahazaUserGuideModule (Sprint 26)

// Warehouse
const ReceivingModule = lazy(() => import('./ReceivingModule'));
const PutAwayModule   = lazy(() => import('./PutAwayModule'));
const OpnameModule    = lazy(() => import('./OpnameModule'));
const LocationsModule = lazy(() => import('./LocationsModule'));
const AccessoryModule = lazy(() => import('./AccessoryModule'));

// Finance
const InvoiceModule            = lazy(() => import('./InvoiceModule'));
const PaymentModule            = lazy(() => import('./PaymentModule'));
const FinancialRecapModule     = lazy(() => import('./FinancialRecapModule'));
const AccountsPayableModule    = lazy(() => import('./AccountsPayableModule'));
const AccountsReceivableModule = lazy(() => import('./AccountsReceivableModule'));
const ManualInvoiceModule      = lazy(() => import('./ManualInvoiceModule'));
const ApprovalModule           = lazy(() => import('./ApprovalModule'));

// Produksi · Master Data Rajut (PT Rahaza)
const RahazaLocationsModule = lazy(() => import('./RahazaLocationsModule'));
const RahazaProcessesModule = lazy(() => import('./RahazaProcessesModule'));
const RahazaShiftsModule    = lazy(() => import('./RahazaShiftsModule'));
const RahazaMachinesModule  = lazy(() => import('./RahazaMachinesModule'));
const RahazaLinesModule     = lazy(() => import('./RahazaLinesModule'));
const RahazaEmployeesModule = lazy(() => import('./RahazaEmployeesModule'));
const RahazaModelsModule    = lazy(() => import('./RahazaModelsModule'));
const RahazaSizesModule     = lazy(() => import('./RahazaSizesModule'));
const RahazaLineAssignmentsModule = lazy(() => import('./RahazaLineAssignmentsModule'));
const LineBoardModule              = lazy(() => import('./LineBoardModule'));
const DailyProductionReportModule  = lazy(() => import('./DailyProductionReportModule'));
const ProductionDashboardModule    = lazy(() => import('./ProductionDashboardModule'));
const RahazaCustomersModule        = lazy(() => import('./RahazaCustomersModule'));
const RahazaOrdersModule           = lazy(() => import('./RahazaOrdersModule'));
const RahazaBOMModule              = lazy(() => import('./RahazaBOMModule'));
const RahazaWorkOrdersModule       = lazy(() => import('./RahazaWorkOrdersModule'));
const RahazaBundlesModule          = lazy(() => import('./RahazaBundlesModule')); // DEPRECATED
const RahazaWOTraceabilityModule   = lazy(() => import('./RahazaWOTraceabilityModule'));
const RahazaDeliveriesModule       = lazy(() => import('./RahazaDeliveriesModule'));
const BundleReworkBoard            = lazy(() => import('./BundleReworkBoard'));
const RahazaAlertSettingsModule    = lazy(() => import('./RahazaAlertSettingsModule'));
const ProcessExecutionModule       = lazy(() => import('./ProcessExecutionModule'));
const RahazaMaterialsModule        = lazy(() => import('./RahazaMaterialsModule'));
const RahazaStockModule            = lazy(() => import('./RahazaStockModule'));
const RahazaMaterialIssueModule    = lazy(() => import('./RahazaMaterialIssueModule'));
const RahazaAttendanceModule       = lazy(() => import('./RahazaAttendanceModule'));
const RahazaPayrollProfilesModule  = lazy(() => import('./RahazaPayrollProfilesModule'));
const RahazaPayrollRunModule       = lazy(() => import('./RahazaPayrollRunModule'));
const RahazaCostCentersModule      = lazy(() => import('./RahazaCostCentersModule'));
const RahazaARInvoicesModule       = lazy(() => import('./RahazaARInvoicesModule'));
const RahazaCashAccountsModule     = lazy(() => import('./RahazaCashAccountsModule'));
const RahazaExpensesModule         = lazy(() => import('./RahazaExpensesModule'));
const RahazaHPPModule              = lazy(() => import('./RahazaHPPModule'));
const ManagementOverviewModule     = lazy(() => import('./ManagementOverviewModule'));
const RahazaShipmentsModule        = lazy(() => import('./RahazaShipmentsModule'));
const AndonBoardModule             = lazy(() => import('./AndonBoardModule'));
const RahazaSOPModule              = lazy(() => import('./RahazaSOPModule'));
const APSGanttModule               = lazy(() => import('./APSGanttModule'));
const OeeDashboardModule           = lazy(() => import('./OeeDashboardModule'));
const ReworkAnalyticsModule        = lazy(() => import('./ReworkAnalyticsModule'));

// Finance · Accounting Core (Phase F1)
const RahazaCOAModule             = lazy(() => import('./RahazaCOAModule'));
const RahazaJournalEntryModule    = lazy(() => import('./RahazaJournalEntryModule'));
const RahazaTrialBalanceModule    = lazy(() => import('./RahazaTrialBalanceModule'));
const RahazaPeriodsModule         = lazy(() => import('./RahazaPeriodsModule'));
const RahazaGeneralLedgerModule   = lazy(() => import('./RahazaGeneralLedgerModule'));

// Finance · Accounting Core (Phase F2)
const RahazaPostingProfilesModule = lazy(() => import('./RahazaPostingProfilesModule'));
const RahazaPnLModule             = lazy(() => import('./RahazaPnLModule'));
const RahazaHRReportsModule       = lazy(() => import('./RahazaHRReportsModule'));
const RahazaBalanceSheetModule    = lazy(() => import('./RahazaBalanceSheetModule'));
const RahazaJournalListModule     = lazy(() => import('./RahazaJournalListModule'));
const RahazaAPAgingModule         = lazy(() => import('./RahazaAPAgingModule'));

// Finance · Accounting Core (Phase F3)
const RahazaCashFlowModule        = lazy(() => import('./RahazaCashFlowModule'));

// Phase 21 — Decision Support & Quality Metrics
const RahazaDefectCodesModule     = lazy(() => import('./RahazaDefectCodesModule'));
const RahazaParetoModule          = lazy(() => import('./RahazaParetoModule'));
const RahazaFPYModule             = lazy(() => import('./RahazaFPYModule'));
const RahazaDowntimeModule        = lazy(() => import('./RahazaDowntimeModule'));
const RahazaBacklogModule         = lazy(() => import('./RahazaBacklogModule'));

// Phase 20C — AI Layer
const RahazaAIModule              = lazy(() => import('./RahazaAIModule'));

// Staff Self-Service Portal
const SelfServicePortal           = lazy(() => import('./SelfServicePortal'));

// Sprint 2.1 — Purchase Orders
const PurchaseOrderModule = lazy(() => import('./PurchaseOrderModule'));
// Sprint 2.3 — Leave Management
const RahazaLeaveModule = lazy(() => import('./RahazaLeaveModule'));
// Sprint 3.1 — HR Reports
const RahazaBulkMIModule        = lazy(() => import('./RahazaBulkMIModule'));
const RahazaLineBalancingModule = lazy(() => import('./RahazaLineBalancingModule'));

// Phase 22B — Shift Handover, Material Reservation, Production Calendar
const RahazaShiftHandoverModule      = lazy(() => import('./RahazaShiftHandoverModule'));
const RahazaMaterialReservationModule = lazy(() => import('./RahazaMaterialReservationModule'));
const RahazaProductionCalendarModule  = lazy(() => import('./RahazaProductionCalendarModule'));
// Phase 23 — OEE Dashboard
const RahazaOEEModule = lazy(() => import('./RahazaOEEModule'));
// User Guide
const RahazaUserGuideModule = lazy(() => import('./RahazaUserGuideModule'));
// Sprint 27 — AQL Sampling Calculator
const RahazaAQLCalculatorModule = lazy(() => import('./RahazaAQLCalculatorModule'));

// Navigation Refinement — New Combined Modules
const RahazaModelsAndBOMModule  = lazy(() => import('./RahazaModelsAndBOMModule'));
const IntegrationSettingsModule = lazy(() => import('./IntegrationSettingsModule'));

// FG Inventory (Produk Jadi)
const RahazaFGInventoryModule   = lazy(() => import('./RahazaFGInventoryModule'));

// Production Automation (Phase 4)
const ProductionWizardModule = lazy(() => import('./ProductionWizardModule'));

// Style Master 2.0 (Phase 28)
const StyleMasterModule = lazy(() => import('./StyleMasterModule'));

// Module map — id → component. IDs MUST be unique.
export const MODULE_REGISTRY = {
  // Portal dashboards
  'management-dashboard': ManagementDashboard,
  'production-dashboard': ProductionDashboardModule,
  'warehouse-dashboard':  WarehouseDashboard,
  'finance-dashboard':    FinanceDashboard,
  // Sprint 1.2: Real HR Dashboard
  'hr-dashboard':         HRDashboard,
  // Sprint 1.3: Master Karyawan exposed in HR portal
  'hr-employees':         RahazaEmployeesModule,

  // Management · Master Data & Admin
  'mgmt-customers':    BuyersModule,
  'mgmt-reports':      ReportsModule,
  'mgmt-users':        UserManagementModule,
  'mgmt-roles':        RoleManagementModule,
  'mgmt-role-matrix':  RoleMatrixModule,
  'mgmt-activity':     ActivityLogModule,
  'mgmt-company':      CompanySettingsModule,
  'mgmt-pdf':          PDFConfigModule,
  'mgmt-help':         RahazaUserGuideModule,

  // Warehouse
  'wh-receiving':  ReceivingModule,
  'wh-putaway':    PutAwayModule,
  'wh-opname':     OpnameModule,
  'wh-bin':        LocationsModule,
  'wh-accessory':  AccessoryModule,
  // Sprint 2.1: Purchase Orders
  'wh-purchase-orders': PurchaseOrderModule,

  // Finance
  'fin-ar':            AccountsReceivableModule,
  'fin-ap':            AccountsPayableModule,
  'fin-invoices':      InvoiceModule,
  'fin-manual-invoice':ManualInvoiceModule,
  'fin-approval':      ApprovalModule,
  'fin-payments':      PaymentModule,
  'fin-recap':         FinancialRecapModule,

  // Produksi · Master Data (Fase 3)
  'prod-locations': RahazaLocationsModule,
  'prod-processes': RahazaProcessesModule,
  'prod-shifts':    RahazaShiftsModule,
  'prod-machines':  RahazaMachinesModule,
  'prod-lines':     RahazaLinesModule,
  'prod-employees': RahazaEmployeesModule,

  // Produksi · Eksekusi (Fase 4)
  'prod-assignments':  RahazaLineAssignmentsModule,
  'prod-bulk-mi':      RahazaBulkMIModule,
  'prod-line-board':   LineBoardModule,
  'prod-daily-report': DailyProductionReportModule,

  // Produksi · Order (Fase 5a)
  'prod-orders':       RahazaOrdersModule,

  // Produksi · BOM + WO (Fase 5b & 5c)
  'prod-work-orders':  RahazaWorkOrdersModule,

  // Produksi · WO Traceability (Replaces Bundle Tracking - WO/PO Based)
  'prod-bundles':      RahazaWOTraceabilityModule,
  // Legacy bundle traceability (deprecated)
  'prod-bundles-legacy': RahazaBundlesModule,
  
  // Pengiriman (Delivery/Shipment) - FG Dispatch
  'prod-deliveries':   RahazaDeliveriesModule,

  // Produksi · Eksekusi Proses — Navigation Refinement (7 proses + rework)
  'prod-exec-rajut':     ProcessExecutionModule,
  'prod-exec-linking':   ProcessExecutionModule,
  // Sewing 3 sub-proses (new)
  'prod-exec-sewing-s1': ProcessExecutionModule,
  'prod-exec-sewing-s2': ProcessExecutionModule,
  'prod-exec-sewing-s3': ProcessExecutionModule,
  // Legacy sewing → redirect to s1
  'prod-exec-sewing':    makeRedirect('prod-exec-sewing-s1'),
  'prod-exec-qc':        ProcessExecutionModule,
  'prod-exec-steam':     ProcessExecutionModule,
  'prod-exec-rework':    ProcessExecutionModule,
  'prod-exec-packing':   ProcessExecutionModule,
  // Legacy
  'prod-exec-washer':    makeRedirect('prod-exec-rework'),
  'prod-exec-sontek':    makeRedirect('prod-exec-rework'),

  // Warehouse · Inventory Rahaza (Fase 7)
  'wh-materials':      RahazaMaterialsModule,
  'wh-stock':          RahazaStockModule,
  'wh-material-issue': RahazaMaterialIssueModule,
  // FG Inventory
  'wh-fg':             RahazaFGInventoryModule,

  // HR · Attendance (Fase 8a)
  'hr-attendance':     RahazaAttendanceModule,

  // HR · Payroll (Fase 8b + 8c)
  'hr-payroll-profiles': RahazaPayrollProfilesModule,
  'hr-payroll-run':      RahazaPayrollRunModule,

  // Sprint 2.3: Leave Management
  'hr-leave':            RahazaLeaveModule,
  
  // Sprint 3.1: HR Reports
  'hr-reports':          RahazaHRReportsModule,

  // Finance · Enhanced (Fase 8.5)
  'fin-cost-centers':  RahazaCostCentersModule,
  'fin-ar-invoices':   RahazaARInvoicesModule,
  'fin-cash':          RahazaCashAccountsModule,
  'fin-expenses':      RahazaExpensesModule,

  // Finance · HPP (Fase 9)
  'fin-hpp':           RahazaHPPModule,

  // Management · Overview (Fase 10)
  'mgmt-overview':     ManagementOverviewModule,

  // Produksi · Sales Closure (Fase 14)
  'prod-shipments':    RahazaShipmentsModule,

  // Management · Master Data (Fase 5a — ganti BuyersModule dengan Rahaza Customers)
  'mgmt-rahaza-customers': RahazaCustomersModule,

  // Produksi · Andon Panel (Phase 18B)
  'prod-andon-board': AndonBoardModule,

  // Produksi · SOP Inline (Phase 18D)
  'prod-sop': RahazaSOPModule,

  // Finance · Accounting Core (Phase F1)
  'fin-coa':               RahazaCOAModule,
  'fin-journal-entry':     RahazaJournalEntryModule,
  'fin-trial-balance':     RahazaTrialBalanceModule,
  'fin-general-ledger':    RahazaGeneralLedgerModule,
  'fin-periods':           RahazaPeriodsModule,

  // Finance · Accounting Core (Phase F2)
  'fin-posting-profiles':  RahazaPostingProfilesModule,
  'fin-pnl':               RahazaPnLModule,
  'fin-balance-sheet':     RahazaBalanceSheetModule,
  'fin-journal-list':      RahazaJournalListModule,
  'fin-ap-aging':          RahazaAPAgingModule,

  // Finance · Accounting Core (Phase F3)
  'fin-cash-flow':         RahazaCashFlowModule,

  // Phase 21 — Decision Support & Quality Metrics
  'prod-defect-codes':     RahazaDefectCodesModule,
  'prod-pareto':           RahazaParetoModule,
  'prod-fpy':              RahazaFPYModule,
  'prod-downtime':         RahazaDowntimeModule,
  'prod-backlog':          RahazaBacklogModule,

  // Phase 20C — AI Insights
  'prod-ai-insights':      RahazaAIModule,
  'hr-ai-insights':        RahazaAIModule,

  // Staff Self-Service Portal
  'self-dashboard':        SelfServicePortal,

  // Phase 22B — Shift Handover, Material Reservation, Production Calendar
  'prod-shift-handover':       RahazaShiftHandoverModule,
  'prod-material-reservation': RahazaMaterialReservationModule,
  'prod-production-calendar':  RahazaProductionCalendarModule,
  // Sprint 27 — AQL Sampling Calculator
  'prod-aql-calculator':       RahazaAQLCalculatorModule,

  // ─── Navigation Refinement Phase 1 — New Combined Modules ───────────────
  // Task 1.3: Model + BOM + Sizes combined
  'prod-models-bom':       RahazaModelsAndBOMModule,
  // Task 2 (Sistem): API Key management
  'mgmt-integrations':     IntegrationSettingsModule,

  // ─── Production Automation (Phase 4) ──────────────────────────────────────
  // Production Wizard (P0) - gabung Order → WO → Release → Bundles
  'prod-wizard':           ProductionWizardModule,

  // ─── Style Master 2.0 (Phase 28) ──────────────────────────────────────────
  'prod-styles':           StyleMasterModule,

  // ─── Redirect stubs — backwards compatibility ──────────────────────────
  // Task 1.1: mgmt-products → prod-models-bom
  'mgmt-products':           makeRedirect('prod-models-bom', 'models'),
  // Task 1.1: wh-material-reservation → prod-material-reservation
  'wh-material-reservation': makeRedirect('prod-material-reservation'),
  // Task 1.2: old individual dashboard modules → production-dashboard (with tab hint)
  'prod-oee':                makeRedirect('production-dashboard', 'performance'),
  'prod-line-balance':       makeRedirect('production-dashboard', 'performance'),
  'prod-rework-analytics':   makeRedirect('production-dashboard', 'quality'),
  'prod-aps-gantt':          makeRedirect('production-dashboard', 'schedule'),
  // Task 1.3: old individual model/bom/sizes → prod-models-bom (with tab hint)
  'prod-models':             makeRedirect('prod-models-bom', 'models'),
  'prod-bom':                makeRedirect('prod-models-bom', 'bom'),
  'prod-sizes':              makeRedirect('prod-models-bom', 'sizes'),
};

export const DEFAULT_MODULE = ManagementDashboard;
