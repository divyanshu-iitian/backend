// Test Production Backend API

const API_BASE_URL = 'https://ndma-auth-backend-yxcd.onrender.com';

async function testProductionBackend() {
  try {
    console.log('🧪 Testing Production Backend...\n');

    // Step 1: Login to get token
    console.log('Step 1: Logging in...');
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'divyanshu@ndma.gov.in',
        password: 'trainer123'
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login Response:', JSON.stringify(loginData, null, 2));

    if (!loginData.success) {
      console.log('❌ Login failed!');
      return;
    }

    const token = loginData.token;
    console.log('✅ Login successful! Token:', token.substring(0, 20) + '...\n');

    // Step 2: Create a report
    console.log('Step 2: Creating a report...');
    const reportData = {
      userName: 'Divyanshu Mishra',
      userEmail: 'divyanshu@ndma.gov.in',
      trainingType: 'API Test Fire Safety Training',
      location: {
        name: 'API Test Center, Mumbai',
        latitude: 19.0760,
        longitude: 72.8777
      },
      date: '2025-10-17',
      participants: 75,
      duration: '4 hours',
      description: 'Testing report creation via API',
      effectiveness: 'Excellent',
      photos: ['https://example.com/photo1.jpg'],
      documents: []
    };

    const createResponse = await fetch(`${API_BASE_URL}/api/reports/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(reportData)
    });

    console.log('Create Response Status:', createResponse.status, createResponse.statusText);
    const createData = await createResponse.json();
    console.log('Create Response:', JSON.stringify(createData, null, 2));

    if (!createData.success) {
      console.log('❌ Report creation failed!');
      return;
    }

    console.log('✅ Report created! ID:', createData.report._id, '\n');

    // Step 3: Fetch user reports
    console.log('Step 3: Fetching user reports...');
    const fetchResponse = await fetch(`${API_BASE_URL}/api/reports/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Fetch Response Status:', fetchResponse.status, fetchResponse.statusText);
    const fetchData = await fetchResponse.json();
    console.log('Fetch Response:', JSON.stringify(fetchData, null, 2));

    if (fetchData.success) {
      console.log(`\n✅ Successfully fetched ${fetchData.reports.length} reports!`);
      fetchData.reports.forEach((report, index) => {
        console.log(`\n${index + 1}. ${report.trainingType}`);
        console.log(`   Location: ${report.location.name}`);
        console.log(`   Participants: ${report.participants}`);
        console.log(`   Date: ${report.date}`);
      });
    }

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testProductionBackend();