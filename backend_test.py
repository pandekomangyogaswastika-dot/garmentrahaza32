"""
PT Rahaza ERP - Backend API Testing
Tests all critical endpoints for the migrated repo
"""
import requests
import sys
from datetime import datetime

class RahazaAPITester:
    def __init__(self, base_url="https://rahaza-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, check_response=None):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                # Additional response checks
                if check_response:
                    try:
                        resp_data = response.json()
                        check_result = check_response(resp_data)
                        if not check_result:
                            success = False
                            print(f"❌ Failed - Response validation failed")
                            self.failed_tests.append({"test": name, "reason": "Response validation failed"})
                        else:
                            self.tests_passed += 1
                            print(f"✅ Passed - Status: {response.status_code}")
                    except Exception as e:
                        success = False
                        print(f"❌ Failed - Response check error: {str(e)}")
                        self.failed_tests.append({"test": name, "reason": f"Response check error: {str(e)}"})
                else:
                    self.tests_passed += 1
                    print(f"✅ Passed - Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({"test": name, "status": response.status_code, "expected": expected_status})

            return success, response.json() if success and response.text else {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            self.failed_tests.append({"test": name, "reason": "Timeout"})
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({"test": name, "reason": str(e)})
            return False, {}

    def test_login(self, email, password):
        """Test login and get token"""
        success, response = self.run_test(
            "Login",
            "POST",
            "/api/auth/login",
            200,
            data={"email": email, "password": password},
            check_response=lambda r: 'token' in r  # IMPORTANT: Check for 'token' field
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   ✓ Token received: {self.token[:20]}...")
            return True
        return False

    def test_work_orders_list(self):
        """Test work orders list - should have 49+ WOs"""
        success, response = self.run_test(
            "Work Orders List",
            "GET",
            "/api/rahaza/work-orders?limit=100",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) >= 49
        )
        if success:
            print(f"   ✓ Found {len(response)} work orders")
        return success

    def test_wo_traceability(self):
        """Test WO Traceability endpoint"""
        success, response = self.run_test(
            "WO Traceability",
            "GET",
            "/api/rahaza/work-orders/traceability?limit=100",
            200,
            check_response=lambda r: 'items' in r and isinstance(r['items'], list)
        )
        if success:
            print(f"   ✓ Found {len(response.get('items', []))} WOs in traceability")
        return success

    def test_lineboard_po_list(self):
        """Test LineBoard PO list - should have 15 orders"""
        success, response = self.run_test(
            "LineBoard PO List",
            "GET",
            "/api/rahaza/lineboard/po-list",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) >= 15
        )
        if success:
            print(f"   ✓ Found {len(response)} orders")
        return success

    def test_lineboard_board(self, order_id):
        """Test LineBoard board data for an order"""
        success, response = self.run_test(
            f"LineBoard Board Data",
            "GET",
            f"/api/rahaza/lineboard/board/{order_id}",
            200,
            check_response=lambda r: 'processes' in r and 'board' in r
        )
        if success:
            print(f"   ✓ Board data loaded with {len(response.get('processes', []))} processes")
        return success

    def test_deliveries_list(self):
        """Test deliveries list"""
        success, response = self.run_test(
            "Deliveries List",
            "GET",
            "/api/rahaza/deliveries?limit=100",
            200,
            check_response=lambda r: 'items' in r and isinstance(r['items'], list)
        )
        if success:
            print(f"   ✓ Found {len(response.get('items', []))} deliveries")
        return success

    def test_payroll_runs_list(self):
        """Test payroll runs list"""
        success, response = self.run_test(
            "Payroll Runs List",
            "GET",
            "/api/rahaza/payroll-runs",
            200,
            check_response=lambda r: isinstance(r, list)
        )
        if success:
            print(f"   ✓ Found {len(response)} payroll runs")
        return success

    def test_materials_list(self):
        """Test materials list (Gudang portal)"""
        success, response = self.run_test(
            "Materials List",
            "GET",
            "/api/rahaza/materials?limit=100",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) >= 8
        )
        if success:
            print(f"   ✓ Found {len(response)} materials")
        return success

    def test_employees_list(self):
        """Test employees list - should have 18 employees"""
        success, response = self.run_test(
            "Employees List",
            "GET",
            "/api/rahaza/employees?limit=100",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) >= 18
        )
        if success:
            print(f"   ✓ Found {len(response)} employees")
        return success

    def test_orders_list(self):
        """Test orders list - should have 15 orders"""
        success, response = self.run_test(
            "Orders List",
            "GET",
            "/api/rahaza/orders?limit=100",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) >= 15
        )
        if success:
            print(f"   ✓ Found {len(response)} orders")
        return success

def main():
    print("=" * 70)
    print("PT RAHAZA ERP - BACKEND API TESTING")
    print("=" * 70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Setup
    tester = RahazaAPITester()
    
    # Test credentials from review request
    test_email = "admin@garment.com"
    test_password = "Admin@123"

    print("🔐 Testing Authentication...")
    if not tester.test_login(test_email, test_password):
        print("\n❌ Login failed, stopping tests")
        print("\n" + "=" * 70)
        print(f"FAILED: Cannot proceed without authentication")
        print("=" * 70)
        return 1

    print("\n" + "=" * 70)
    print("📦 Testing Core Endpoints...")
    print("=" * 70)

    # Test all endpoints
    tester.test_employees_list()
    tester.test_orders_list()
    tester.test_work_orders_list()
    tester.test_wo_traceability()
    tester.test_materials_list()
    
    # Get first order for LineBoard test
    success, po_list = tester.run_test(
        "Get First Order ID",
        "GET",
        "/api/rahaza/lineboard/po-list",
        200
    )
    if success and len(po_list) > 0:
        first_order_id = po_list[0].get('order_id')
        if first_order_id:
            tester.test_lineboard_board(first_order_id)
    
    tester.test_deliveries_list()
    tester.test_payroll_runs_list()

    # Print results
    print("\n" + "=" * 70)
    print("📊 TEST RESULTS")
    print("=" * 70)
    print(f"Tests Run:    {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {len(tester.failed_tests)}")
    print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for i, fail in enumerate(tester.failed_tests, 1):
            print(f"  {i}. {fail.get('test', 'Unknown')}")
            if 'status' in fail:
                print(f"     Expected: {fail['expected']}, Got: {fail['status']}")
            if 'reason' in fail:
                print(f"     Reason: {fail['reason']}")
    
    print("\n" + "=" * 70)
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    return 0 if len(tester.failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
