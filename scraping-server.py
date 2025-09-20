#!/usr/bin/env python3
"""
Simple Python scraping server for OJ.uz and QOJ functionality.
This server provides scraping endpoints that the TypeScript server can call.
"""

import os
import sys
import json
import hashlib
from flask import Flask, request, jsonify
from flask_cors import CORS

# Add backend to path to import existing scraping modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

try:
    from database.db import get_db
    from scrape.ojuz import verify_ojuz as verify_ojuz_impl, update_ojuz_scores as update_ojuz_impl
    from scrape.qoj import verify_qoj as verify_qoj_impl, update_qoj_scores as update_qoj_impl
except ImportError as e:
    print(f"Warning: Could not import scraping modules: {e}")
    # Create stub implementations
    def verify_ojuz_impl():
        return jsonify({"error": "OJ.uz verification not available"}), 500
    def update_ojuz_impl():
        return jsonify({"error": "OJ.uz update not available"}), 500
    def verify_qoj_impl():
        return jsonify({"error": "QOJ verification not available"}), 500
    def update_qoj_impl():
        return jsonify({"error": "QOJ update not available"}), 500

app = Flask(__name__)
CORS(app, origins=['http://localhost:5501'])

def validate_request():
    """Basic request validation - could be enhanced with proper auth"""
    data = request.get_json(silent=True)
    if not data:
        return None, jsonify({"error": "No JSON data provided"}), 400
    
    # Check if user_id is provided (passed from TS server)
    if 'user_id' not in data:
        return None, jsonify({"error": "user_id required"}), 400
    
    return data, None, None

@app.route('/verify-ojuz', methods=['POST'])
def verify_ojuz():
    data, error_response, status_code = validate_request()
    if error_response:
        return error_response, status_code
    
    try:
        # Mock the Flask request object that the original function expects
        class MockRequest:
            def __init__(self, user_id):
                self.user_id = user_id
            
            def get_json(self):
                return request.get_json()
        
        # Temporarily replace the global request object
        import scrape.ojuz
        original_request = getattr(scrape.ojuz, 'request', None)
        scrape.ojuz.request = MockRequest(data['user_id'])
        
        try:
            result = verify_ojuz_impl()
            return result
        finally:
            if original_request:
                scrape.ojuz.request = original_request
                
    except Exception as e:
        return jsonify({"error": f"OJ.uz verification failed: {str(e)}"}), 500

@app.route('/update-ojuz', methods=['POST'])
def update_ojuz():
    data, error_response, status_code = validate_request()
    if error_response:
        return error_response, status_code
    
    try:
        # Similar mock setup as verify_ojuz
        class MockRequest:
            def __init__(self, user_id):
                self.user_id = user_id
            
            def get_json(self):
                return request.get_json()
        
        import scrape.ojuz
        original_request = getattr(scrape.ojuz, 'request', None)
        scrape.ojuz.request = MockRequest(data['user_id'])
        
        try:
            result = update_ojuz_impl()
            return result
        finally:
            if original_request:
                scrape.ojuz.request = original_request
                
    except Exception as e:
        return jsonify({"error": f"OJ.uz update failed: {str(e)}"}), 500

@app.route('/verify-qoj', methods=['POST'])
def verify_qoj():
    data, error_response, status_code = validate_request()
    if error_response:
        return error_response, status_code
    
    try:
        class MockRequest:
            def __init__(self, user_id):
                self.user_id = user_id
            
            def get_json(self):
                return request.get_json()
        
        import scrape.qoj
        original_request = getattr(scrape.qoj, 'request', None)
        scrape.qoj.request = MockRequest(data['user_id'])
        
        try:
            result = verify_qoj_impl()
            return result
        finally:
            if original_request:
                scrape.qoj.request = original_request
                
    except Exception as e:
        return jsonify({"error": f"QOJ verification failed: {str(e)}"}), 500

@app.route('/update-qoj', methods=['POST'])
def update_qoj():
    data, error_response, status_code = validate_request()
    if error_response:
        return error_response, status_code
    
    try:
        class MockRequest:
            def __init__(self, user_id):
                self.user_id = user_id
            
            def get_json(self):
                return request.get_json()
        
        import scrape.qoj
        original_request = getattr(scrape.qoj, 'request', None)  
        scrape.qoj.request = MockRequest(data['user_id'])
        
        try:
            result = update_qoj_impl()
            return result
        finally:
            if original_request:
                scrape.qoj.request = original_request
                
    except Exception as e:
        return jsonify({"error": f"QOJ update failed: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "Scraping server is running"})

if __name__ == '__main__':
    port = int(os.environ.get('SCRAPING_PORT', 5502))
    print(f"Starting scraping server on port {port}")
    app.run(debug=True, host='0.0.0.0', port=port)