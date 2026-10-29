// Run from any directory: node scripts/check-categories.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const questions = JSON.parse(read('data/questions.json'));
const categories = JSON.parse(read('data/categories.json'));
assert.equal(questions.length, 683);
assert.equal(categories.length, 51);
assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
const byId = new Map(categories.map(c => [c.id, c]));
assert.equal(byId.size, categories.length);
for (const q of questions) {
  assert.ok(byId.has(q.category), `${q.id}: unknown category ${q.category}`);
  assert.equal(q.categoryName, byId.get(q.category).name, `${q.id}: stale label`);
}
for (const c of categories) {
  assert.equal(c.count, questions.filter(q => q.category === c.id).length, `${c.id}: wrong count`);
}
const standalone = read('index.standalone.html');
const marker = 'window.__HAM_EMBEDDED__ = ';
const start = standalone.indexOf(marker);
assert.ok(start >= 0, 'Missing embedded data');
const context = { window: {} };
// Evaluate only the embedded assignment, ending before application code.
const assignment = standalone.slice(start).split('\n')[0];
vm.runInNewContext(assignment, context);
const embedded = JSON.parse(JSON.stringify(context.window.__HAM_EMBEDDED__));
assert.deepEqual(embedded.questions, questions, 'Standalone questions differ');
assert.deepEqual(embedded.categories, categories, 'Standalone categories differ');
const majorNames = html => html.match(/const majorNames = (\{[^\n]+\});/)[1];
assert.equal(majorNames(standalone), majorNames(read('index.html')));
for (const file of ['index.html', 'index.standalone.html']) {
  for (const match of read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (!match[0].startsWith('<script type="application/ld+json"')) new vm.Script(match[1], { filename: file });
  }
}
new vm.Script(read('sw.js'), { filename: 'sw.js' });
console.log('PASS: 683 questions, 51 categories, counts, labels, standalone parity, group titles and JavaScript syntax');
