const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const html = baseline ? execFileSync('git', ['show', '35b8c02:index.html'], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const questions = JSON.parse(fs.readFileSync(path.join(root, 'data/questions.json'), 'utf8'));
let seed = 4263;
const math = Object.create(Math);
math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const context = vm.createContext({ Math: math });
vm.runInContext(html.slice(html.indexOf('function shuffleArr('), html.indexOf('function startMockExam(')), context);
const report = { mode: baseline ? 'before' : 'after', papers: 5000, types: [] };
for (const multi of [false, true]) {
  const pool = questions.filter(q => (q.selectCount > 1) === multi);
  const count = multi ? 8 : 32;
  const categories = [...new Set(pool.map(q => q.category))];
  const categoryHits = Object.fromEntries(categories.map(c => [c, 0]));
  const seen = new Set();
  let previous = new Set(), overlap = 0;
  for (let i = 0; i < report.papers; i++) {
    const picked = context.pickSpread(pool, count);
    const ids = new Set(picked.map(q => q.id));
    assert.equal(picked.length, count);
    assert.equal(ids.size, count, 'Repeated question within a paper');
    assert.equal(new Set(picked.map(q => q.category)).size, count, 'Categories must spread out');
    for (const q of picked) {
      seen.add(q.id);
      categoryHits[q.category]++;
      if (previous.has(q.id)) overlap++;
    }
    previous = ids;
  }
  const expectedHits = report.papers * count / categories.length;
  const hits = Object.values(categoryHits);
  if (!baseline) {
    assert.equal(seen.size, pool.length, 'Every question should be reachable');
    assert.ok(hits.every(n => Math.abs(n - expectedHits) < expectedHits * 0.2), 'Category selection is biased');
  }
  report.types.push({ type: multi ? 'multi' : 'single', pool: pool.length, categories: categories.length,
    coveredQuestions: seen.size, neverSelectedCategories: categories.filter(c => !categoryHits[c]),
    categoryHitsMin: Math.min(...hits), categoryHitsMax: Math.max(...hits),
    meanConsecutivePaperOverlap: +(overlap / (report.papers - 1)).toFixed(3) });
}
// Exhaustion: a second round may draw again from a category, never the same question.
const tiny = questions.slice(0, 6).map((q, i) => ({ ...q, id: `tiny-${i}`, category: String(i % 2) }));
const exhausted = context.pickSpread(tiny, 20);
assert.equal(exhausted.length, 6);
assert.equal(new Set(exhausted.map(q => q.id)).size, 6);
assert.equal(context.pickSpread([], 4).length, 0);
console.log(JSON.stringify(report, null, 2));
