"""
PT Rahaza ERP - Production Wizard & Order Fixes Testing
Tests the 5 reported fixes:
1. Order number format ORD-YYYY-XXXX
2. Generate WO for orders with existing WO (informative message)
3. Wizard preview endpoint (BOM status check)
4. Model creation endpoint
"""
import requests
import sys
from datetime import datetime

class WizardFixesTester:
    def __init__(self, base_url="https://rahaza-preview-3.preview.emergentagent.com"):
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
                response = requests.get(url, headers=headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=15)

            success = response.status_code == expected_status
            
            if success:
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
            check_response=lambda r: 'token' in r
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   ✓ Token received")
            return True
        return False

    def test_order_number_format(self):
        """Test that order numbers use ORD-YYYY-XXXX format"""
        success, response = self.run_test(
            "Order Number Format (ORD-YYYY-XXXX)",
            "GET",
            "/api/rahaza/orders?limit=5",
            200,
            check_response=lambda r: all(
                order.get('order_number', '').startswith('ORD-2026-') 
                for order in r[:5]
            )
        )
        if success and response:
            print(f"   ✓ Sample order numbers: {[o.get('order_number') for o in response[:3]]}")
        return success

    def test_wizard_preview(self):
        """Test wizard preview endpoint with BOM status check"""
        # Get models and sizes first
        _, models = self.run_test("Get Models", "GET", "/api/rahaza/models?limit=5", 200)
        _, sizes = self.run_test("Get Sizes", "GET", "/api/rahaza/sizes?limit=5", 200)
        
        if not models or not sizes:
            print("   ⚠ Cannot test wizard preview - no models/sizes")
            return False
        
        model_id = models[0]['id']
        size_id = sizes[0]['id']
        
        success, response = self.run_test(
            "Wizard Preview (BOM Status Check)",
            "POST",
            "/api/rahaza/wizard/preview-production",
            200,
            data={
                "items": [
                    {"model_id": model_id, "size_id": size_id, "qty": 10}
                ]
            },
            check_response=lambda r: (
                'wo_count' in r and 
                'items' in r and 
                len(r['items']) > 0 and
                'has_bom' in r['items'][0]
            )
        )
        if success:
            print(f"   ✓ Preview shows {response['wo_count']} WO(s)")
            print(f"   ✓ BOM status field present: has_bom={response['items'][0].get('has_bom')}")
        return success

    def test_model_creation(self):
        """Test inline model creation endpoint"""
        test_code = f"TEST-{datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Model Creation (Inline Form)",
            "POST",
            "/api/rahaza/models",
            200,
            data={
                "code": test_code,
                "name": "Test Model for Wizard",
                "category": "Sweater",
                "description": "Created via test"
            },
            check_response=lambda r: 'id' in r and r.get('code') == test_code
        )
        if success:
            print(f"   ✓ Model created: {response.get('code')} - {response.get('name')}")
        return success

    def test_generate_wo_with_existing(self):
        """Test generate WO for order that already has WOs (should show informative message)"""
        # Get an order that has WOs
        _, orders = self.run_test("Get Orders with WOs", "GET", "/api/rahaza/orders?limit=20", 200)
        
        order_with_wo = None
        for order in orders:
            if order.get('wo_count', 0) > 0:
                order_with_wo = order
                break
        
        if not order_with_wo:
            print("   ⚠ No orders with existing WOs found - skipping test")
            return True  # Not a failure, just no data to test
        
        print(f"   Testing with order {order_with_wo['order_number']} (has {order_with_wo['wo_count']} WO)")
        
        # Try to generate WO again
        success, response = self.run_test(
            "Generate WO (Existing WO Check)",
            "POST",
            f"/api/rahaza/orders/{order_with_wo['id']}/generate-work-orders",
            200,
            data={"item_rates": []},
            check_response=lambda r: (
                'total_created' in r and 
                'skipped' in r and
                r.get('total_created') == 0 and
                len(r.get('skipped', [])) > 0
            )
        )
        if success:
            print(f"   ✓ Correctly returned 0 created, {len(response.get('skipped', []))} skipped")
            print(f"   ✓ Informative response for existing WOs")
        return success

    def test_orders_wo_count_column(self):
        """Test that orders list includes wo_count field"""
        success, response = self.run_test(
            "Orders List WO Count Column",
            "GET",
            "/api/rahaza/orders?limit=10",
            200,
            check_response=lambda r: all('wo_count' in order for order in r)
        )
        if success:
            wo_counts = [f"{o['order_number']}: {o.get('wo_count', 0)} WO" for o in response[:3]]
            print(f"   ✓ Sample WO counts: {wo_counts}")
        return success

def main():
    print("=" * 70)
    print("PT RAHAZA ERP - PRODUCTION WIZARD & ORDER FIXES TESTING")
    print("=" * 70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    tester = WizardFixesTester()
    
    test_email = "admin@garment.com"
    test_password = "Admin@123"

    print("🔐 Testing Authentication...")
    if not tester.test_login(test_email, test_password):
        print("\n❌ Login failed, stopping tests")
        return 1

    print("\n" + "=" * 70)
    print("🧪 Testing Wizard & Order Fixes...")
    print("=" * 70)

    # Test all fixes
    tester.test_order_number_format()
    tester.test_orders_wo_count_column()
    tester.test_wizard_preview()
    tester.test_model_creation()
    tester.test_generate_wo_with_existing()

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
