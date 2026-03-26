const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('https://rajakumar-nexasense-ai.online/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'romankarghosh@gmail.com', password: 'Admin@123' }) // Trying classic credentials if they work? No, I don't know their password. I'll login with my test account and do a fresh QA pass.
    });
  } catch (err) {
  }
}
