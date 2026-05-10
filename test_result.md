#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

user_problem_statement: |
  Continue development of PT Rahaza ERP from GitHub repo `garmentrahaza31`.
  
  Plan focus: Fix 6 P0 issues per `/app/plan.md`:
    1. Customer Inline Creation in Wizard + Order modal
    2. Fix dropdown overlap/clipping in Production Wizard
    3. Hide Generate WO button when wo_count > 0
    4. Move borongan rate setup from Order to Production Wizard (Step 3)
    5. Fix leading zero in number inputs (qty, rate)
    6. Backend validation: Order can't transition to `completed` before PACKING output
  
  Plus bonus: ensure BOM module material dropdown is consistent.
  
  Stack: FastAPI + React 19 + MongoDB. Login: admin@garment.com / Admin@123

backend:
  - task: "Order Completion Gate (Issue 6) — block 'completed' transition without PACKING"
    implemented: true
    working: true
    file: "/app/backend/routes/rahaza_orders.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Already implemented at lines 316-346. Verified via /app/scripts/test_core_poc.py — all 5 user stories PASS: blocks when no WO, blocks when no PACKING event, allows after PACKING qty>0. Verified via /app/scripts/test_e2e_phase2.py."

  - task: "Wizard Start-Production accepts process_rates per item (Issue 4)"
    implemented: true
    working: true
    file: "/app/backend/routes/rahaza_wizard.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Modified `wizard_start` to extract per-item process_rates from request body (matched by model_id+size_id key) and persist them to rahaza_work_orders.process_rates. Verified via /app/scripts/test_wizard_rates.py — 4 process_rates correctly persisted on created WO."

  - task: "Customer Inline Create endpoint accepts wizard payload (Issue 1)"
    implemented: true
    working: true
    file: "/app/backend/routes/rahaza_master.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Existing /api/rahaza/customers POST endpoint accepts inline customer payload. Verified via E2E test."

  - task: "Order list returns wo_count for hide-button logic (Issue 3)"
    implemented: true
    working: true
    file: "/app/backend/routes/rahaza_orders.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Existing /api/rahaza/orders endpoint returns wo_count per order via _enrich_orders. Verified via E2E test — newly-created order via wizard has wo_count >= 1."

frontend:
  - task: "Production Wizard 4-step flow with Rate Borongan (Issue 4)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/erp/ProductionWizardModule.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Stepper expanded 3→4 steps: Data Order → Preview WO → **Rate Borongan (NEW)** → Konfirmasi. New Step3RateSetup component renders matrix per item (model × size) × process. Pre-fills from payroll profile defaults. 'Salin baris 1 ke semua' button. 'Set borongan sekarang' toggle (default ON). Submit sends process_rates per item to /wizard/start-production. Verified via Playwright screenshot — all 4 steps render correctly, rate matrix shows RAJUT/LINKING/SEWING_S1-S3/STEAM/QC/PACKING columns with auto-filled rates from payroll profiles."

  - task: "MaterialCombobox uses Radix Popover (FIXED — was custom Portal that had click-intercepted bug)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/erp/ProductionWizardModule.jsx"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "[Initial attempt] Rewrote MaterialCombobox to render menu via createPortal(document.body) with fixed positioning + z-index 9999."
      - working: false
        agent: "user"
        comment: "Bug: 'tidak bisa klik dari dropdown pilih bahan master data ketika di production wizard' — dropdown opens visually but clicks on options were intercepted by Radix Dialog's modal pointer-events handling."
      - working: true
        agent: "main"
        comment: "[Fixed] Replaced custom createPortal+fixed-positioning with **Radix Popover** (`@/components/ui/popover`). Radix Popover's Portal is dialog-aware and properly handles modal pointer events. Verified end-to-end via Playwright: dropdown opens, click on option correctly selects material (e.g. 'Benang Akrilik Premium 2/28' with code YRN-ACR-001), dialog stays open, submitting the wizard creates Order + WO + BOM successfully (toast: '✅ Produksi dimulai! Order ORD-2026-0016 · 1 WO dibuat · 1 BOM terbentuk'). Audited other modules for similar pattern: SearchableSelect (only used in ManualInvoiceModule with no Dialog), LineBoardModule absolute dropdown (no Dialog), all other absolute-positioned elements are Gantt bars/badges. No similar bugs elsewhere."

  - task: "Customer Inline Creation in Wizard + Order Modal (Issue 1)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/erp/ProductionWizardModule.jsx, RahazaOrdersModule.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Both files have InlineCustomerCreateForm component with __create_new__ option in dropdown. Selecting 'Tambah Customer Baru...' opens inline form with all customer master fields. On save, customer is created and auto-selected."

  - task: "Hide Generate WO button when wo_count > 0 (Issue 3)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/erp/RahazaOrdersModule.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Both row actions (line 494) and detail modal (line 659) check `o.wo_count === 0` / `detailOrder.wo_count === 0` before rendering generate button. Detail modal shows informational message when wo_count > 0."

  - task: "Number input leading zero normalization (Issue 5)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/erp/LusinPcsInput.jsx, ProductionWizardModule.jsx, RahazaOrdersModule.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "LusinPcsInput already had onBlur normalization. Improved wizard qty onBlur to always normalize. Wizard rate cells (Step3) have onBlur normalization. Order modal qty input + rate cells in rateModal added onBlur normalization. Helper normalizeNumberInput(val, {type:'int'/'float'}). Verified rate cells: typed '0500' → became '500' after blur."

  - task: "BOM Module material dropdown (Bonus from audit)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/erp/RahazaBOMModule.jsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Already implemented (audit fix C4 from previous session). BOM editor uses material_id dropdown from rahaza_materials master, with 'Tambah Material Baru' inline form. yarnMaterials/accessoryMaterials filtered from master. Form persists material_id alongside snapshot fields."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 2
  run_ui: true

test_plan:
  current_focus:
    - "Production Wizard 4-step flow with Rate Borongan (Issue 4)"
    - "MaterialCombobox uses React Portal to avoid Dialog clipping (Issue 2)"
    - "Customer Inline Creation in Wizard + Order Modal (Issue 1)"
    - "Hide Generate WO button when wo_count > 0 (Issue 3)"
    - "Number input leading zero normalization (Issue 5)"
    - "Order Completion Gate (Issue 6) — block 'completed' transition without PACKING"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 2 of plan.md complete. All 6 P0 issues implemented + verified via 3 automated test scripts:
      - /app/scripts/test_core_poc.py (Phase 1 POC for Issue 6): 5/5 PASS
      - /app/scripts/test_wizard_rates.py (Issue 4 backend): PASS
      - /app/scripts/test_e2e_phase2.py (Issues 1, 3, 4, 6 E2E): 6/6 PASS

      Login: admin@garment.com / Admin@123 (returns `token` field, not access_token).
      Database has been reset & seeded fresh (18 employees, 15 orders, 49 WOs, 924 WIP events).
      Preview URL: https://rahaza-dev.preview.emergentagent.com

      Please test the following in the browser:
      
      1. **Login & navigation** — admin@garment.com / Admin@123 → select Portal Produksi
      
      2. **Production Wizard (Operasional Harian → Production Wizard)** — verify NEW 4-step flow:
         - Step 1: Data Order — fill customer (test "✚ Tambah Customer Baru..." inline create), select model+size+qty, test typing '010' → blur → should normalize to '10'
         - Step 2: Preview WO — verify WO summary appears
         - Step 3: **Rate Borongan (NEW)** — verify matrix shows model×size rows × process columns (RAJUT, LINKING, SEWING_S1-S3, STEAM, QC, PACKING). Verify rates pre-filled from payroll profile defaults. Test 'Set borongan sekarang' toggle. Test 'Salin baris 1 ke semua' button. Test typing '0500' in rate cell → blur → should normalize to '500'.
         - Step 4: Konfirmasi — verify shows "Rate borongan akan disimpan untuk N item" message. Test confirm checkbox + submit → success toast → order/WO created with process_rates persisted.
      
      3. **Order Modal (Operasional Harian → Order Produksi)** — Test "Order Baru" button:
         - Test "✚ Tambah Customer Baru..." inline create
         - Test typing '07' for qty → blur → should normalize to '7'
         - Save & verify order created
         - For an existing order with wo_count > 0: verify Generate WO button is HIDDEN in row actions and detail modal shows "WO sudah tersedia" message
      
      4. **Order Completion Gate** — From Order list, find order in 'in_production' status:
         - If no PACKING events for its WOs: try to transition to 'completed' → should get error message
         - This is verified via API E2E (test_e2e_phase2.py).
      
      5. **MaterialCombobox in Wizard Step 2** — When clicking on material picker for an item without BOM, verify the dropdown menu appears OUTSIDE the Dialog boundary (not clipped) and is clickable.

      Skip tests for: drag-and-drop, voice, camera features.
      Test on these specific user stories from plan.md:
      - Issue 1: 5 user stories (customer inline create — wizard + order modal)
      - Issue 2: 5 user stories (dropdown UX — no clipping, scroll, click-outside, z-index)
      - Issue 3: 5 user stories (hide generate button, list + detail consistency)
      - Issue 4: 5 user stories (rate setup in wizard, prefilled, copy, persisted)
      - Issue 5: 5 user stories (leading zero — 01 → 1, blur, no value loss, consistent)
      - Issue 6: 5 user stories (block before PACKING, allow after, clear errors, UI+API parity)
