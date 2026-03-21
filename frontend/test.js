import fs from 'fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const css = fs.readFileSync('src/index.css', 'utf8');

postcss([
  tailwindcss('./tailwind.config.js')
])
.process(css, { from: 'src/index.css', to: 'dist/out.css' })
.then(result => {
  console.log("Success! Output length:", result.css.length);
  fs.writeFileSync('dist/out_test.css', result.css);
})
.catch(err => {
  console.error("Error:", err);
});
