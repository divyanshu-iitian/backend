// Quick check script for production backend
const API_BASE_URL = 'https://ndma-auth-backend-yxcd.onrender.com';

console.log('🔍 Checking production backend health...\n');

fetch(`${API_BASE_URL}/`)
  .then(res => res.json())
  .then(data => {
    console.log('✅ Backend Status:', JSON.stringify(data, null, 2));
    console.log('\n📂 Database:', data.mongodb === 'connected' ? 'Connected ✅' : 'Disconnected ❌');
  })
  .catch(err => console.error('❌ Error:', err.message));