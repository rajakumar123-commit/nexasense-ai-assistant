const fg = require('fast-glob');
const path = require('path');

fg(['./src/**/*.{js,jsx,ts,tsx}']).then(entries => {
  console.log('Found:', entries.length);
  console.log('First 5:', entries.slice(0, 5));
}).catch(console.error);
