const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('https://rajakumar-nexasense-ai.online/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'screenshot_user_final_9@nexasense.ai', password: 'Password123!' })
    });
    const data = await res.json();
    const token = data.token;
    if (!token) { console.log('Login failed', data); return; }

    const res2 = await fetch('https://rajakumar-nexasense-ai.online/api/conversations/document/cb9af0a8-c6d7-4408-bf7a-eb3dddb1d107', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const text2 = await res2.text();
    console.log("RESPONSE:", text2);
  } catch (err) {
    console.error(err);
  }
}
test();
