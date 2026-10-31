// Rebuild the offline page from the same HTML and data used by the web app.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const data = {
  questions: JSON.parse(read('data/questions.json')),
  categories: JSON.parse(read('data/categories.json'))
};
const marker = '// --- State ---';
if (!html.includes(marker)) throw new Error('Missing application state marker');
const payload = `// 内嵌题库数据（离线单文件版）\nwindow.__HAM_EMBEDDED__ = ${JSON.stringify(data)};\n\n`;
fs.writeFileSync(path.join(root, 'index.standalone.html'), html.replace(marker, payload + marker));
console.log(`Built offline page: ${data.questions.length} questions / ${data.categories.length} categories`);
