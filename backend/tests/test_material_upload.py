"""
EduFlow Material Upload API Tests
Tests for material upload, analysis, listing, deletion, and transformation endpoints
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


class TestMaterialUpload:
    """Material upload endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_upload_txt_file(self):
        """Test uploading a TXT file - POST /api/materials/upload"""
        # Create a simple test file
        test_content = """Schweizer Kantone
        
Die Schweiz besteht aus 26 Kantonen. Die grössten Kantone sind:
1. Graubünden - der flächenmässig grösste Kanton
2. Bern - der zweitgrösste Kanton
3. Wallis - bekannt für die Alpen

Jeder Kanton hat seine eigene Regierung und Verfassung.
Die Hauptstadt der Schweiz ist Bern.
"""
        
        files = {
            'file': ('test_kantone.txt', test_content.encode('utf-8'), 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            headers=self.headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert data.get("success") == True, "Upload should return success=True"
        assert "material_id" in data, "Response should contain material_id"
        assert data.get("filename") == "test_kantone.txt", "Filename should match"
        assert data.get("file_type") == "txt", "File type should be txt"
        assert data.get("char_count", 0) > 0, "Should have char_count > 0"
        assert data.get("word_count", 0) > 0, "Should have word_count > 0"
        assert "preview" in data, "Should have preview text"
        
        print(f"Upload successful: material_id={data['material_id']}, chars={data.get('char_count')}, words={data.get('word_count')}")
        
        # Store for cleanup
        self.uploaded_material_id = data["material_id"]
        return data
    
    def test_upload_without_auth(self):
        """Test that upload requires authentication"""
        test_content = "Test content"
        files = {
            'file': ('test.txt', test_content.encode('utf-8'), 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            files=files
        )
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("Upload correctly requires authentication")
    
    def test_upload_unsupported_file_type(self):
        """Test uploading an unsupported file type"""
        test_content = "Test content"
        files = {
            'file': ('test.xyz', test_content.encode('utf-8'), 'application/octet-stream')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            headers=self.headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400 for unsupported file type, got {response.status_code}"
        print("Unsupported file type correctly rejected")


class TestMaterialAnalysis:
    """Material analysis endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_analyze_material(self):
        """Test analyzing uploaded material - POST /api/materials/{material_id}/analyze"""
        # First upload a file
        test_content = """Mathematik Übungen - 4. Klasse
        
Thema: Multiplikation und Division

Aufgabe 1: Berechne
a) 7 × 8 = ___
b) 9 × 6 = ___
c) 56 ÷ 7 = ___

Aufgabe 2: Textaufgabe
Peter hat 5 Packungen mit je 8 Äpfeln. Wie viele Äpfel hat er insgesamt?

Lernziel: Die Schüler können das kleine Einmaleins anwenden.
"""
        
        files = {
            'file': ('mathe_uebung.txt', test_content.encode('utf-8'), 'text/plain')
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            headers=self.headers,
            files=files
        )
        
        assert upload_response.status_code == 200
        material_id = upload_response.json()["material_id"]
        
        # Now analyze it
        analyze_response = requests.post(
            f"{BASE_URL}/api/materials/{material_id}/analyze",
            headers=self.headers
        )
        
        assert analyze_response.status_code == 200, f"Analysis failed: {analyze_response.text}"
        data = analyze_response.json()
        
        # Validate response structure
        assert data.get("success") == True, "Analysis should return success=True"
        assert "analysis" in data, "Response should contain analysis"
        
        analysis = data["analysis"]
        assert "detected_subject" in analysis, "Analysis should have detected_subject"
        assert "detected_topic" in analysis, "Analysis should have detected_topic"
        assert "detected_grade" in analysis, "Analysis should have detected_grade"
        assert "keywords" in analysis, "Analysis should have keywords"
        
        print(f"Analysis successful: subject={analysis.get('detected_subject')}, topic={analysis.get('detected_topic')}, grade={analysis.get('detected_grade')}")
        print(f"Keywords: {analysis.get('keywords', [])}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/materials/{material_id}", headers=self.headers)
        
        return data
    
    def test_analyze_nonexistent_material(self):
        """Test analyzing a non-existent material"""
        response = requests.post(
            f"{BASE_URL}/api/materials/nonexistent-id-12345/analyze",
            headers=self.headers
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent material, got {response.status_code}"
        print("Non-existent material correctly returns 404")


class TestMaterialList:
    """Material listing endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_list_materials(self):
        """Test listing all materials - GET /api/materials"""
        response = requests.get(
            f"{BASE_URL}/api/materials",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"List failed: {response.text}"
        data = response.json()
        
        # Validate response is a list
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Found {len(data)} materials")
        
        # If materials exist, validate structure
        if len(data) > 0:
            material = data[0]
            assert "id" in material, "Material should have id"
            assert "filename" in material, "Material should have filename"
            assert "file_type" in material, "Material should have file_type"
            assert "created_at" in material, "Material should have created_at"
            print(f"First material: {material.get('filename')} ({material.get('file_type')})")
        
        return data
    
    def test_list_materials_without_auth(self):
        """Test that listing materials requires authentication"""
        response = requests.get(f"{BASE_URL}/api/materials")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("List materials correctly requires authentication")


class TestMaterialDelete:
    """Material deletion endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_delete_material(self):
        """Test deleting a material - DELETE /api/materials/{material_id}"""
        # First upload a file to delete
        test_content = "TEST_DELETE_MATERIAL content for deletion test"
        files = {
            'file': ('TEST_delete_me.txt', test_content.encode('utf-8'), 'text/plain')
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            headers=self.headers,
            files=files
        )
        
        assert upload_response.status_code == 200
        material_id = upload_response.json()["material_id"]
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/materials/{material_id}",
            headers=self.headers
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        data = delete_response.json()
        assert data.get("success") == True, "Delete should return success=True"
        
        print(f"Material {material_id} deleted successfully")
        
        # Verify it's gone
        list_response = requests.get(f"{BASE_URL}/api/materials", headers=self.headers)
        materials = list_response.json()
        material_ids = [m.get("id") for m in materials]
        assert material_id not in material_ids, "Deleted material should not appear in list"
        
        print("Verified material no longer in list")
    
    def test_delete_nonexistent_material(self):
        """Test deleting a non-existent material"""
        response = requests.delete(
            f"{BASE_URL}/api/materials/nonexistent-id-12345",
            headers=self.headers
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent material, got {response.status_code}"
        print("Non-existent material delete correctly returns 404")


class TestMaterialTransform:
    """Material transformation endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_transform_material_to_worksheet(self):
        """Test transforming material into a worksheet - POST /api/materials/transform"""
        # First upload and analyze a file
        test_content = """Die Schweizer Alpen

Die Alpen sind das grösste Gebirge Europas. In der Schweiz befinden sich viele bekannte Berge:

1. Matterhorn (4'478 m) - Der bekannteste Berg der Schweiz
2. Jungfrau (4'158 m) - Teil des UNESCO Welterbes
3. Eiger (3'967 m) - Bekannt für seine Nordwand

Die Alpen sind wichtig für:
- Tourismus und Wintersport
- Wasserversorgung (Gletscher)
- Biodiversität

Viele Tiere leben in den Alpen: Steinböcke, Murmeltiere, Adler und Gämsen.
"""
        
        files = {
            'file': ('TEST_alpen_text.txt', test_content.encode('utf-8'), 'text/plain')
        }
        
        # Upload
        upload_response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            headers={"Authorization": f"Bearer {self.token}"},
            files=files
        )
        
        assert upload_response.status_code == 200
        material_id = upload_response.json()["material_id"]
        
        # Analyze
        analyze_response = requests.post(
            f"{BASE_URL}/api/materials/{material_id}/analyze",
            headers=self.headers
        )
        assert analyze_response.status_code == 200
        
        # Transform to worksheet
        transform_payload = {
            "material_id": material_id,
            "action": "worksheet",
            "grade": "4",
            "subject": "NMG",
            "difficulty": "medium",
            "questionCount": 5,
            "mode": "worksheet",
            "customInstructions": ""
        }
        
        start_time = time.time()
        transform_response = requests.post(
            f"{BASE_URL}/api/materials/transform",
            headers=self.headers,
            json=transform_payload,
            timeout=90
        )
        elapsed_time = time.time() - start_time
        
        assert transform_response.status_code == 200, f"Transform failed: {transform_response.text}"
        data = transform_response.json()
        
        # Validate response structure
        assert data.get("success") == True, "Transform should return success=True"
        assert "worksheet" in data, "Response should contain worksheet"
        
        worksheet = data["worksheet"]
        assert "id" in worksheet, "Worksheet should have id"
        assert "title" in worksheet, "Worksheet should have title"
        assert "content" in worksheet, "Worksheet should have content"
        assert "questions" in worksheet["content"], "Worksheet content should have questions"
        
        questions = worksheet["content"]["questions"]
        assert len(questions) > 0, "Worksheet should have at least one question"
        
        print(f"Transform successful in {elapsed_time:.2f}s")
        print(f"Worksheet: {worksheet.get('title')}")
        print(f"Questions: {len(questions)}")
        
        # Validate question structure
        for q in questions:
            assert "id" in q, "Question should have id"
            assert "question" in q, "Question should have question text"
            assert "answer" in q, "Question should have answer"
        
        # Cleanup - delete the material and worksheet
        requests.delete(f"{BASE_URL}/api/materials/{material_id}", headers=self.headers)
        requests.delete(f"{BASE_URL}/api/worksheets/{worksheet['id']}", headers=self.headers)
        
        return data
    
    def test_transform_nonexistent_material(self):
        """Test transforming a non-existent material"""
        transform_payload = {
            "material_id": "nonexistent-id-12345",
            "action": "worksheet",
            "grade": "4",
            "subject": "Deutsch",
            "difficulty": "medium",
            "questionCount": 5,
            "mode": "worksheet"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/materials/transform",
            headers=self.headers,
            json=transform_payload
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent material, got {response.status_code}"
        print("Non-existent material transform correctly returns 404")


class TestMaterialGet:
    """Material get single endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Setup authentication for each test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_get_single_material(self):
        """Test getting a single material - GET /api/materials/{material_id}"""
        # First upload a file
        test_content = "TEST_GET_SINGLE content for get test"
        files = {
            'file': ('TEST_get_single.txt', test_content.encode('utf-8'), 'text/plain')
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/materials/upload",
            headers=self.headers,
            files=files
        )
        
        assert upload_response.status_code == 200
        material_id = upload_response.json()["material_id"]
        
        # Get the material
        get_response = requests.get(
            f"{BASE_URL}/api/materials/{material_id}",
            headers=self.headers
        )
        
        assert get_response.status_code == 200, f"Get failed: {get_response.text}"
        data = get_response.json()
        
        # Validate response structure
        assert data.get("id") == material_id, "Material id should match"
        assert "filename" in data, "Material should have filename"
        assert "full_text" in data, "Material should have full_text"
        
        print(f"Got material: {data.get('filename')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/materials/{material_id}", headers=self.headers)
    
    def test_get_nonexistent_material(self):
        """Test getting a non-existent material"""
        response = requests.get(
            f"{BASE_URL}/api/materials/nonexistent-id-12345",
            headers=self.headers
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent material, got {response.status_code}"
        print("Non-existent material get correctly returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
