"""
PT Rahaza ERP - Backend API Testing for New Features (Iteration 3)
Tests:
1. Material master data API (for dropdown in wizard)
2. Material quick-add API (inline creation)
3. Model image upload (local MongoDB storage)
4. Model image retrieval
"""
import requests
import sys
import io
from datetime import datetime

class RahazaNewFeaturesTester:
    def __init__(self, base_url="https://rahaza-preview-3.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.created_material_id = None
        self.test_model_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, check_response=None):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        headers = {}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        # Only add Content-Type for JSON requests
        if data and not files:
            headers['Content-Type'] = 'application/json'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, headers=headers, timeout=10)
                else:
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
                        if response.headers.get('content-type', '').startswith('image/'):
                            # For image responses, just check that we got bytes
                            check_result = len(response.content) > 0
                        else:
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

            return success, response

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            self.failed_tests.append({"test": name, "reason": "Timeout"})
            return False, None
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({"test": name, "reason": str(e)})
            return False, None

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
        if success and response:
            resp_data = response.json()
            if 'token' in resp_data:
                self.token = resp_data['token']
                print(f"   ✓ Token received: {self.token[:20]}...")
                return True
        return False

    def test_materials_list(self):
        """Test GET /api/rahaza/materials - should return list with type field"""
        success, response = self.run_test(
            "Materials List",
            "GET",
            "/api/rahaza/materials?limit=500",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) > 0
        )
        if success and response:
            materials = response.json()
            print(f"   ✓ Found {len(materials)} materials")
            # Check if materials have type field (yarn/accessory)
            yarn_count = sum(1 for m in materials if m.get('type') == 'yarn')
            acc_count = sum(1 for m in materials if m.get('type') == 'accessory')
            print(f"   ✓ Yarn materials: {yarn_count}, Accessory materials: {acc_count}")
            return True
        return False

    def test_material_quick_add(self):
        """Test POST /api/rahaza/materials/quick-add - inline material creation"""
        test_material = {
            "name": f"Test Material {datetime.now().strftime('%H%M%S')}",
            "code": f"TEST-{datetime.now().strftime('%H%M%S')}",
            "type": "yarn",
            "unit": "kg"
        }
        success, response = self.run_test(
            "Material Quick Add (Yarn)",
            "POST",
            "/api/rahaza/materials/quick-add",
            200,
            data=test_material,
            check_response=lambda r: 'id' in r and r.get('type') == 'yarn'
        )
        if success and response:
            mat_data = response.json()
            self.created_material_id = mat_data.get('id')
            print(f"   ✓ Created material ID: {self.created_material_id}")
            print(f"   ✓ Material name: {mat_data.get('name')}")
            print(f"   ✓ Material type: {mat_data.get('type')}")
            return True
        return False

    def test_material_quick_add_accessory(self):
        """Test POST /api/rahaza/materials/quick-add - accessory type"""
        test_material = {
            "name": f"Test Accessory {datetime.now().strftime('%H%M%S')}",
            "code": f"ACC-{datetime.now().strftime('%H%M%S')}",
            "type": "accessory",
            "unit": "pcs"
        }
        success, response = self.run_test(
            "Material Quick Add (Accessory)",
            "POST",
            "/api/rahaza/materials/quick-add",
            200,
            data=test_material,
            check_response=lambda r: 'id' in r and r.get('type') == 'accessory'
        )
        if success and response:
            mat_data = response.json()
            print(f"   ✓ Created accessory ID: {mat_data.get('id')}")
            print(f"   ✓ Accessory type: {mat_data.get('type')}")
            return True
        return False

    def test_get_models(self):
        """Get a test model for image upload"""
        success, response = self.run_test(
            "Get Models List",
            "GET",
            "/api/rahaza/models?limit=10",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) > 0
        )
        if success and response:
            models = response.json()
            self.test_model_id = models[0].get('id')
            print(f"   ✓ Using model ID: {self.test_model_id}")
            print(f"   ✓ Model code: {models[0].get('code')}")
            return True
        return False

    def test_model_image_upload(self):
        """Test POST /api/rahaza/models/{mid}/image-local - upload image to MongoDB"""
        if not self.test_model_id:
            print("   ⚠ Skipping - no test model ID")
            return False
        
        # Create a minimal valid JPEG image (1x1 pixel red square)
        # JPEG header + minimal image data
        jpeg_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x03, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
            0x37, 0xFF, 0xD9
        ])
        
        files = {'file': ('test_model.jpg', io.BytesIO(jpeg_data), 'image/jpeg')}
        
        success, response = self.run_test(
            "Model Image Upload (Local MongoDB)",
            "POST",
            f"/api/rahaza/models/{self.test_model_id}/image-local",
            200,
            files=files,
            check_response=lambda r: r.get('ok') is True and 'image_url' in r
        )
        if success and response:
            resp_data = response.json()
            print(f"   ✓ Image uploaded successfully")
            print(f"   ✓ Image URL: {resp_data.get('image_url')}")
            print(f"   ✓ Size: {resp_data.get('size_kb')} KB")
            return True
        return False

    def test_model_image_retrieve(self):
        """Test GET /api/rahaza/models/{mid}/image - retrieve uploaded image"""
        if not self.test_model_id:
            print("   ⚠ Skipping - no test model ID")
            return False
        
        success, response = self.run_test(
            "Model Image Retrieve",
            "GET",
            f"/api/rahaza/models/{self.test_model_id}/image",
            200,
            check_response=lambda r: True  # Just check we got bytes
        )
        if success and response:
            print(f"   ✓ Image retrieved successfully")
            print(f"   ✓ Content-Type: {response.headers.get('content-type')}")
            print(f"   ✓ Size: {len(response.content)} bytes")
            return True
        return False

def main():
    print("=" * 70)
    print("PT RAHAZA ERP - NEW FEATURES BACKEND API TESTS (Iteration 3)")
    print("=" * 70)
    
    tester = RahazaNewFeaturesTester()
    
    # Login
    print("\n" + "=" * 70)
    print("AUTHENTICATION")
    print("=" * 70)
    if not tester.test_login("admin@garment.com", "Admin@123"):
        print("\n❌ Login failed, stopping tests")
        return 1
    
    # Materials API Tests
    print("\n" + "=" * 70)
    print("MATERIALS API TESTS")
    print("=" * 70)
    tester.test_materials_list()
    tester.test_material_quick_add()
    tester.test_material_quick_add_accessory()
    
    # Model Image Tests
    print("\n" + "=" * 70)
    print("MODEL IMAGE API TESTS")
    print("=" * 70)
    tester.test_get_models()
    tester.test_model_image_upload()
    tester.test_model_image_retrieve()
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"📊 Tests Run: {tester.tests_run}")
    print(f"✅ Tests Passed: {tester.tests_passed}")
    print(f"❌ Tests Failed: {len(tester.failed_tests)}")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for fail in tester.failed_tests:
            print(f"   - {fail.get('test', 'Unknown')}: {fail.get('reason', fail.get('status', 'Unknown'))}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\n📈 Success Rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
