#!/usr/bin/env python3
"""
TeacherTime SaaS Backend API Testing Script
Tests all authentication, worksheet generation, and management endpoints
"""

import requests
import json
import time
from datetime import datetime
import os

class TeacherTimeAPITester:
    def __init__(self):
        # Get base URL from environment
        self.base_url = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://upload-materials.preview.emergentagent.com')
        if not self.base_url.endswith('/api'):
            self.base_url = f"{self.base_url}/api"
        
        # Don't reuse session for better reliability
        self.auth_token = None
        self.user_data = None
        self.test_worksheet_id = None
        self.test_results = {
            'passed': [],
            'failed': [],
            'skipped': []
        }
        
        print(f"🚀 Testing TeacherTime API at: {self.base_url}")
        print("=" * 60)

    def log_result(self, test_name, passed, details=""):
        """Log test results"""
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        
        if passed:
            self.test_results['passed'].append(test_name)
        else:
            self.test_results['failed'].append(test_name)
        print()

    def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        
        if headers:
            default_headers.update(headers)
        
        if self.auth_token:
            default_headers['Authorization'] = f"Bearer {self.auth_token}"
        
        try:
            response = None
            if method.upper() == 'GET':
                response = requests.get(url, headers=default_headers, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=default_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.RequestException as e:
            print(f"Request failed for {method} {url}: {e}")
            return None

    def test_root_endpoint(self):
        """Test root API endpoint"""
        print("🔍 Testing Root Endpoint...")
        response = self.make_request('GET', '/')
        
        if response and response.status_code == 200:
            data = response.json()
            if 'message' in data:
                self.log_result("Root endpoint", True, f"Message: {data['message']}")
                return True
        
        self.log_result("Root endpoint", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_user_registration(self):
        """Test user registration endpoint"""
        print("🔍 Testing User Registration...")
        
        # Test with valid data
        test_user = {
            "email": f"test_user_{int(time.time())}@example.com",
            "password": "securepassword123",
            "name": "Max Mustermann"
        }
        
        response = self.make_request('POST', '/auth/register', test_user)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'user' in data and 'token' in data:
                # Store for later tests
                self.auth_token = data['token']
                self.user_data = data['user']
                self.test_email = test_user['email']
                self.test_password = test_user['password']
                
                self.log_result("User registration", True, 
                              f"User created: {data['user']['name']}, Token received")
                return True
        
        self.log_result("User registration", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_duplicate_registration(self):
        """Test duplicate user registration (should fail)"""
        print("🔍 Testing Duplicate Registration (should fail)...")
        
        if not hasattr(self, 'test_email'):
            self.log_result("Duplicate registration test", False, "No test email from previous registration")
            return False
        
        duplicate_user = {
            "email": self.test_email,
            "password": "differentpassword",
            "name": "Another User"
        }
        
        response = self.make_request('POST', '/auth/register', duplicate_user)
        
        if response and response.status_code == 400:
            try:
                data = response.json()
                if 'error' in data and 'already exists' in data['error']:
                    self.log_result("Duplicate registration rejection", True, f"Correctly rejected: {data['error']}")
                    return True
            except:
                pass
        
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response:
            try:
                error_data = response.json()
                error_msg += f", Response: {error_data}"
            except:
                error_msg += f", Text: {response.text[:100]}"
        
        self.log_result("Duplicate registration rejection", False, error_msg)
        return False

    def test_user_login(self):
        """Test user login endpoint"""
        print("🔍 Testing User Login...")
        
        if not hasattr(self, 'test_email'):
            self.log_result("User login", False, "No test credentials available")
            return False
        
        login_data = {
            "email": self.test_email,
            "password": self.test_password
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'user' in data and 'token' in data:
                # Update token
                self.auth_token = data['token']
                self.log_result("User login", True, f"Logged in as: {data['user']['name']}")
                return True
        
        self.log_result("User login", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        print("🔍 Testing Invalid Login (should fail)...")
        
        invalid_data = {
            "email": "invalid@example.com",
            "password": "wrongpassword"
        }
        
        response = self.make_request('POST', '/auth/login', invalid_data)
        
        if response and response.status_code == 401:
            try:
                data = response.json()
                if 'error' in data and 'Invalid credentials' in data['error']:
                    self.log_result("Invalid login rejection", True, f"Correctly rejected: {data['error']}")
                    return True
            except:
                pass
        
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response:
            try:
                error_data = response.json()
                error_msg += f", Response: {error_data}"
            except:
                error_msg += f", Text: {response.text[:100]}"
        
        self.log_result("Invalid login rejection", False, error_msg)
        return False

    def test_get_current_user(self):
        """Test getting current user with valid token"""
        print("🔍 Testing Get Current User...")
        
        if not self.auth_token:
            self.log_result("Get current user", False, "No auth token available")
            return False
        
        response = self.make_request('GET', '/auth/me')
        
        if response and response.status_code == 200:
            data = response.json()
            if 'email' in data and 'name' in data:
                self.user_data = data  # Update user data
                self.log_result("Get current user", True, 
                              f"User: {data['name']}, Tier: {data['subscription_tier']}, Used: {data['worksheets_used_this_month']}/5")
                return True
        
        self.log_result("Get current user", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_unauthorized_request(self):
        """Test request without token (should fail)"""
        print("🔍 Testing Unauthorized Request (should fail)...")
        
        # Temporarily remove token
        temp_token = self.auth_token
        self.auth_token = None
        
        response = self.make_request('GET', '/auth/me')
        
        # Restore token
        self.auth_token = temp_token
        
        if response and response.status_code == 401:
            try:
                data = response.json()
                if 'error' in data and 'Unauthorized' == data['error']:
                    self.log_result("Unauthorized request rejection", True, f"Correctly rejected: {data['error']}")
                    return True
            except:
                pass
        
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response:
            try:
                error_data = response.json()
                error_msg += f", Response: {error_data}"
            except:
                error_msg += f", Text: {response.text[:100]}"
        
        self.log_result("Unauthorized request rejection", False, error_msg)
        return False

    def test_worksheet_generation(self):
        """Test worksheet generation - CRITICAL FEATURE"""
        print("🔍 Testing Worksheet Generation (CRITICAL)...")
        
        if not self.auth_token:
            self.log_result("Worksheet generation", False, "No auth token available")
            return False
        
        # Swiss education example payload
        worksheet_data = {
            "topic": "Photosynthese",
            "grade": "4",
            "subject": "NMG",  # Natur, Mensch, Gesellschaft
            "difficulty": "medium",
            "questionCount": 5
        }
        
        print(f"   Generating worksheet: {worksheet_data['topic']} (Grade {worksheet_data['grade']})")
        
        response = self.make_request('POST', '/generate-worksheet', worksheet_data)
        
        if response and response.status_code == 200:
            data = response.json()
            required_fields = ['id', 'title', 'content', 'topic', 'grade', 'subject', 'difficulty']
            
            if all(field in data for field in required_fields):
                # Check content structure
                content = data['content']
                if ('title' in content and 'questions' in content and 
                    'teacher_notes' in content and isinstance(content['questions'], list)):
                    
                    self.test_worksheet_id = data['id']  # Store for later tests
                    
                    self.log_result("Worksheet generation", True, 
                                  f"Generated: {data['title'][:50]}... ({len(content['questions'])} questions)")
                    return True
        
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response and response.status_code != 200:
            try:
                error_data = response.json()
                if 'error' in error_data:
                    error_msg += f", Error: {error_data['error']}"
            except:
                error_msg += f", Response: {response.text[:100]}"
        
        self.log_result("Worksheet generation", False, error_msg)
        return False

    def test_worksheet_generation_limits(self):
        """Test worksheet generation limits for free tier"""
        print("🔍 Testing Free Tier Limits...")
        
        if not self.auth_token or not self.user_data:
            self.log_result("Free tier limits test", False, "No auth token or user data available")
            return False
        
        # Check if we're close to limit
        current_usage = self.user_data.get('worksheets_used_this_month', 0)
        print(f"   Current usage: {current_usage}/5 worksheets")
        
        if current_usage >= 5:
            # Test that we get rejected
            worksheet_data = {
                "topic": "Mathematik Addition",
                "grade": "2",
                "subject": "Mathematik",
                "difficulty": "easy",
                "questionCount": 3
            }
            
            response = self.make_request('POST', '/generate-worksheet', worksheet_data)
            
            if response and response.status_code == 403:
                data = response.json()
                if 'error' in data and 'limit' in data['error'].lower():
                    self.log_result("Free tier limit enforcement", True, "Correctly enforced monthly limit")
                    return True
            
            self.log_result("Free tier limit enforcement", False, "Should have enforced monthly limit")
            return False
        else:
            # Generate more worksheets to test limit
            worksheets_to_generate = min(5 - current_usage, 3)  # Generate up to 3 more
            
            worksheet_data = {
                "topic": "Deutsche Grammatik",
                "grade": "3",
                "subject": "Deutsch",
                "difficulty": "easy",
                "questionCount": 3
            }
            
            success_count = 0
            for i in range(worksheets_to_generate):
                response = self.make_request('POST', '/generate-worksheet', worksheet_data)
                if response and response.status_code == 200:
                    success_count += 1
                time.sleep(1)  # Small delay between requests
            
            self.log_result("Multiple worksheet generation", success_count > 0, 
                          f"Generated {success_count}/{worksheets_to_generate} additional worksheets")
            return success_count > 0

    def test_get_worksheets(self):
        """Test getting user's worksheets"""
        print("🔍 Testing Get User Worksheets...")
        
        if not self.auth_token:
            self.log_result("Get worksheets", False, "No auth token available")
            return False
        
        response = self.make_request('GET', '/worksheets')
        
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                worksheet_count = len(data)
                self.log_result("Get worksheets", True, f"Retrieved {worksheet_count} worksheets")
                
                # Store first worksheet ID if we don't have one
                if worksheet_count > 0 and not self.test_worksheet_id:
                    self.test_worksheet_id = data[0]['id']
                
                return True
        
        self.log_result("Get worksheets", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_get_single_worksheet(self):
        """Test getting a specific worksheet"""
        print("🔍 Testing Get Single Worksheet...")
        
        if not self.auth_token or not self.test_worksheet_id:
            self.log_result("Get single worksheet", False, "No auth token or worksheet ID available")
            return False
        
        response = self.make_request('GET', f'/worksheets/{self.test_worksheet_id}')
        
        if response and response.status_code == 200:
            data = response.json()
            if 'id' in data and data['id'] == self.test_worksheet_id:
                self.log_result("Get single worksheet", True, f"Retrieved worksheet: {data.get('title', 'Unknown')}")
                return True
        
        self.log_result("Get single worksheet", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_regenerate_worksheet(self):
        """Test worksheet regeneration with different difficulty"""
        print("🔍 Testing Worksheet Regeneration...")
        
        if not self.auth_token or not self.test_worksheet_id:
            self.log_result("Worksheet regeneration", False, "No auth token or worksheet ID available")
            return False
        
        regenerate_data = {
            "worksheetId": self.test_worksheet_id,
            "newDifficulty": "hard"
        }
        
        response = self.make_request('POST', '/regenerate-worksheet', regenerate_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'id' in data and 'difficulty' in data and data['difficulty'] == 'hard':
                self.log_result("Worksheet regeneration", True, 
                              f"Regenerated with {data['difficulty']} difficulty")
                return True
        
        self.log_result("Worksheet regeneration", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_premium_subscription(self):
        """Test premium subscription upgrade (mock)"""
        print("🔍 Testing Premium Subscription (Mock)...")
        
        if not self.auth_token:
            self.log_result("Premium subscription", False, "No auth token available")
            return False
        
        response = self.make_request('POST', '/subscribe/premium')
        
        if response and response.status_code == 200:
            data = response.json()
            if 'success' in data and data['success']:
                self.log_result("Premium subscription", True, 
                              f"Message: {data.get('message', 'Upgrade successful')}")
                return True
        
        self.log_result("Premium subscription", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_delete_worksheet(self):
        """Test worksheet deletion"""
        print("🔍 Testing Worksheet Deletion...")
        
        if not self.auth_token or not self.test_worksheet_id:
            self.log_result("Worksheet deletion", False, "No auth token or worksheet ID available")
            return False
        
        response = self.make_request('DELETE', f'/worksheets/{self.test_worksheet_id}')
        
        if response and response.status_code == 200:
            data = response.json()
            if 'success' in data and data['success']:
                self.log_result("Worksheet deletion", True, "Successfully deleted worksheet")
                return True
        
        self.log_result("Worksheet deletion", False, 
                       f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_missing_fields(self):
        """Test API endpoints with missing required fields"""
        print("🔍 Testing Missing Required Fields...")
        
        # Test registration without required fields
        response = self.make_request('POST', '/auth/register', {"email": "test@example.com"})
        if response and response.status_code == 400:
            register_test = True
        else:
            register_test = False
        
        # Test worksheet generation without required fields
        temp_token = self.auth_token
        if temp_token:
            response = self.make_request('POST', '/generate-worksheet', {"topic": "Math"})
            if response and response.status_code == 400:
                worksheet_test = True
            else:
                worksheet_test = False
        else:
            worksheet_test = False
        
        overall_success = register_test and worksheet_test
        self.log_result("Missing fields validation", overall_success, 
                       f"Register: {'✓' if register_test else '✗'}, Worksheet: {'✓' if worksheet_test else '✗'}")
        return overall_success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🧪 Starting TeacherTime API Test Suite - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"🌐 Base URL: {self.base_url}")
        print("=" * 60)
        
        # Run tests in logical order
        test_functions = [
            self.test_root_endpoint,
            self.test_user_registration,
            self.test_duplicate_registration,
            self.test_user_login,
            self.test_invalid_login,
            self.test_get_current_user,
            self.test_unauthorized_request,
            self.test_worksheet_generation,  # CRITICAL
            self.test_worksheet_generation_limits,
            self.test_get_worksheets,
            self.test_get_single_worksheet,
            self.test_regenerate_worksheet,
            self.test_premium_subscription,
            self.test_delete_worksheet,
            self.test_missing_fields
        ]
        
        # Execute all tests
        for test_func in test_functions:
            try:
                test_func()
                time.sleep(0.5)  # Small delay between tests
            except Exception as e:
                print(f"❌ FAIL {test_func.__name__} - Exception: {str(e)}")
                self.test_results['failed'].append(test_func.__name__)
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results['passed']) + len(self.test_results['failed']) + len(self.test_results['skipped'])
        passed_count = len(self.test_results['passed'])
        failed_count = len(self.test_results['failed'])
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_count}")
        print(f"❌ Failed: {failed_count}")
        print(f"⏭️ Skipped: {len(self.test_results['skipped'])}")
        print()
        
        if self.test_results['failed']:
            print("❌ FAILED TESTS:")
            for test in self.test_results['failed']:
                print(f"  - {test}")
            print()
        
        print(f"Success Rate: {(passed_count/total_tests*100):.1f}%" if total_tests > 0 else "No tests run")
        
        # Critical feature check
        worksheet_test_passed = any("Worksheet generation" in test for test in self.test_results['passed'])
        if worksheet_test_passed:
            print("🎯 CRITICAL: Worksheet generation is WORKING ✅")
        else:
            print("🚨 CRITICAL: Worksheet generation is FAILING ❌")
        
        print("=" * 60)

if __name__ == "__main__":
    try:
        tester = TeacherTimeAPITester()
        tester.run_all_tests()
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
    except Exception as e:
        print(f"\n💥 Test suite failed with exception: {str(e)}")