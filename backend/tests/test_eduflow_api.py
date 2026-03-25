"""
EduFlow Backend API Tests
Tests for authentication, worksheet generation streaming, and core functionality
"""

import pytest
import requests
import os
import json
import time

# Get the base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://upload-materials.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@eduflow.ch"
TEST_PASSWORD = "demo123"


class TestHealthCheck:
    """Health check tests"""
    
    def test_api_root_endpoint(self):
        """Test that the API root endpoint returns a valid response"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"API Root response: {data}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "token" in data, "Token missing from login response"
        assert "user" in data, "User missing from login response"
        assert data["user"]["email"] == TEST_EMAIL
        assert len(data["token"]) > 0
        
        print(f"Login successful for user: {data['user']['email']}")
        return data
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@example.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Invalid credentials correctly rejected with 401")
    
    def test_protected_endpoint_without_token(self):
        """Test that protected endpoints return 401 without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("Protected endpoint correctly requires authentication")
    
    def test_protected_endpoint_with_valid_token(self):
        """Test protected endpoint with valid token"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Use token to access protected endpoint
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        print(f"Protected endpoint accessible with token: {data['email']}")


class TestWorksheetGeneration:
    """Worksheet generation tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_worksheet_generation_streaming(self):
        """Test worksheet generation streaming endpoint - should complete within 60 seconds"""
        start_time = time.time()
        
        payload = {
            "topic": "Einfache Addition",
            "grade": "3",
            "subject": "Mathematik",
            "difficulty": "easy",
            "questionCount": 5,
            "mode": "worksheet"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/generate-worksheet-stream",
            json=payload,
            headers=self.headers,
            stream=True,
            timeout=90
        )
        
        assert response.status_code == 200, f"Stream failed: {response.text}"
        
        # Process the SSE stream
        events_received = []
        worksheet_data = None
        error_message = None
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith('data: '):
                    try:
                        event_data = json.loads(decoded_line[6:])
                        events_received.append(event_data.get('type'))
                        
                        if event_data.get('type') == 'status':
                            print(f"Status: {event_data.get('message')} (Progress: {event_data.get('progress')}%)")
                        elif event_data.get('type') == 'question':
                            print(f"Question {event_data.get('number')} received")
                        elif event_data.get('type') == 'complete':
                            worksheet_data = event_data.get('worksheet')
                            print(f"Generation complete! Worksheet ID: {worksheet_data.get('id')}")
                        elif event_data.get('type') == 'error':
                            error_message = event_data.get('message')
                            print(f"Error received: {error_message}")
                    except json.JSONDecodeError:
                        print(f"Failed to parse: {decoded_line}")
        
        elapsed_time = time.time() - start_time
        print(f"Total generation time: {elapsed_time:.2f} seconds")
        
        # Assertions
        assert error_message is None, f"Generation failed with error: {error_message}"
        assert 'complete' in events_received, "No complete event received"
        assert worksheet_data is not None, "No worksheet data received"
        assert elapsed_time < 60, f"Generation took too long: {elapsed_time:.2f}s (expected < 60s)"
        
        # Validate worksheet structure
        assert 'id' in worksheet_data
        assert 'title' in worksheet_data
        assert 'content' in worksheet_data
        assert 'questions' in worksheet_data['content']
        
        print(f"Worksheet '{worksheet_data['title']}' generated successfully in {elapsed_time:.2f}s")
        return worksheet_data
    
    def test_worksheet_generation_exam_mode(self):
        """Test worksheet generation in exam mode"""
        payload = {
            "topic": "Multiplikation Prüfung",
            "grade": "4",
            "subject": "Mathematik",
            "difficulty": "medium",
            "questionCount": 5,
            "mode": "exam"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/generate-worksheet-stream",
            json=payload,
            headers=self.headers,
            stream=True,
            timeout=90
        )
        
        assert response.status_code == 200
        
        worksheet_data = None
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith('data: '):
                    try:
                        event_data = json.loads(decoded_line[6:])
                        if event_data.get('type') == 'complete':
                            worksheet_data = event_data.get('worksheet')
                        elif event_data.get('type') == 'error':
                            pytest.fail(f"Generation failed: {event_data.get('message')}")
                    except json.JSONDecodeError:
                        pass
        
        assert worksheet_data is not None, "No worksheet generated"
        assert worksheet_data.get('mode') == 'exam', "Mode should be exam"
        print(f"Exam worksheet generated: {worksheet_data.get('title')}")


class TestWorksheetCRUD:
    """Worksheet CRUD operations tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_get_worksheets(self):
        """Test fetching user worksheets"""
        response = requests.get(
            f"{BASE_URL}/api/worksheets",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} worksheets")
        
        # If worksheets exist, verify structure
        if len(data) > 0:
            worksheet = data[0]
            assert 'id' in worksheet
            assert 'title' in worksheet
            assert 'content' in worksheet
            print(f"First worksheet: {worksheet.get('title')}")
    
    def test_delete_worksheet(self):
        """Test deleting a worksheet (create one first via streaming)"""
        # First create a worksheet via streaming
        create_payload = {
            "topic": "TEST_Delete_Worksheet",
            "grade": "3",
            "subject": "Deutsch",
            "difficulty": "easy",
            "questionCount": 3,
            "mode": "worksheet"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/generate-worksheet-stream",
            json=create_payload,
            headers=self.headers,
            stream=True,
            timeout=90
        )
        
        worksheet_id = None
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith('data: '):
                    try:
                        event_data = json.loads(decoded_line[6:])
                        if event_data.get('type') == 'complete':
                            worksheet_id = event_data.get('worksheet', {}).get('id')
                    except json.JSONDecodeError:
                        pass
        
        if worksheet_id:
            # Now delete it
            delete_response = requests.delete(
                f"{BASE_URL}/api/worksheets/{worksheet_id}",
                headers=self.headers
            )
            assert delete_response.status_code == 200
            print(f"Worksheet {worksheet_id} deleted successfully")
            
            # Verify deletion
            get_response = requests.get(f"{BASE_URL}/api/worksheets", headers=self.headers)
            worksheets = get_response.json()
            worksheet_ids = [w.get('id') for w in worksheets]
            assert worksheet_id not in worksheet_ids, "Worksheet should be deleted"


class TestChatAssistant:
    """AI Chat Assistant tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_chat_assistant_basic(self):
        """Test basic chat assistant response"""
        payload = {
            "message": "Wie kann ich eine Frage vereinfachen?",
            "worksheet_id": None,
            "context": None
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat/assistant",
            json=payload,
            headers=self.headers,
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        assert 'response' in data
        assert 'success' in data
        print(f"Chat response: {data.get('response')[:100]}...")


class TestExportEndpoints:
    """Export functionality tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_export_pdf_invalid_worksheet(self):
        """Test PDF export with invalid worksheet ID"""
        response = requests.get(
            f"{BASE_URL}/api/export/invalid-id/pdf?version=student",
            headers=self.headers
        )
        
        assert response.status_code == 404
        print("Export correctly returns 404 for invalid worksheet ID")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
