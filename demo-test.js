#!/usr/bin/env node
/**
 * Simple demo script to test the migrated TypeScript backend
 */

const baseUrl = 'http://localhost:5501';

async function testEndpoint(method, path, data = null, headers = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: data ? JSON.stringify(data) : null
    });
    
    const result = await response.json();
    console.log(`${method} ${path}: ${response.status}`, result);
    return { response, result };
  } catch (error) {
    console.error(`${method} ${path}: ERROR`, error.message);
    return null;
  }
}

async function runDemo() {
  console.log('🚀 Testing TypeScript Backend Migration\n');
  
  // Test demo login
  console.log('1. Testing demo login...');
  const loginResult = await testEndpoint('POST', '/auth/demo-login');
  
  if (loginResult?.result?.token) {
    const token = loginResult.result.token;
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    
    console.log('\n2. Testing auth check with token...');
    await testEndpoint('POST', '/auth/check', { token }, authHeaders);
    
    console.log('\n3. Testing data endpoint (should work with demo token)...');
    await testEndpoint('GET', '/api/data?names=IOI', null, authHeaders);
    
    console.log('\n4. Testing note endpoint...');
    await testEndpoint('GET', '/api/note?problem_name=test&source=IOI&year=2023', null, authHeaders);
    
    console.log('\n5. Testing virtual contests...');
    await testEndpoint('GET', '/api/virtual-contests', null, authHeaders);
    
    console.log('\n6. Testing settings sync...');
    await testEndpoint('POST', '/api/settings/sync', { local_storage: '{"demo": true}' }, authHeaders);
  }
  
  console.log('\n7. Testing scraping endpoints (may fail if scraping server not running)...');
  const authHeaders = { 'Authorization': `Bearer demo-session-fixed-token-123456789` };
  await testEndpoint('POST', '/api/verify-ojuz', { username: 'test' }, authHeaders);
  
  console.log('\n8. Testing OAuth endpoints (should return 501 not implemented)...');
  await testEndpoint('GET', '/auth/github/start');
  
  console.log('\n✅ Demo complete! Check the results above.');
}

runDemo().catch(console.error);