#!/usr/bin/env node
// 模拟考试逻辑测试：把 public/index.html 的内联脚本放进 vm 沙箱（桩 DOM/localStorage），
// 真实加载 683 题题库，验证组卷/判分/不可回翻/倒计时自动交卷/错题本可选加入。
// 用法：node tests/mock-exam.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/categories.json'), 'utf8'));

const scriptBody = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// ---- DOM 桩 ----
function makeEl(id) {
  const el = {
    id, children: [], _cls: new Set(), style: {}, dataset: {}, _text: '', _html: '',
    hidden: false, disabled: false, value: '',
    dataset: {}, style: { setProperty() {} },
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      toggle: (c, f) => (f ? el._cls.add(c) : el._cls.delete(c)),
      contains: c => el._cls.has(c)
    },
    get textContent() { return el._text; }, set textContent(v) { el._text = String(v); },
    get className() { return [...el._cls].join(' '); },
    set className(v) { el._cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => el._cls.add(c)); },
    get innerHTML() { return el._html; }, set innerHTML(v) { el._html = String(v); if (v === '') el.children = []; },
    appendChild(c) { el.children.push(c); return c; },
    querySelector(sel) { if (sel === '.mock-wrong-main' && el._html.includes('mock-wrong-main')) return el._main || (el._main = makeEl('main')); return el.children.find(c => c._match && c._match(sel)) || null; },
    querySelectorAll(sel) { return el.children.filter(c => c._match && c._match(sel)); },
    closest() { return el._closest || el; },
    addEventListener() {}, setAttribute() {}, focus() {}
  };
  return el;
}
const elMap = {};
const timers = { setTimeout: [], setInterval: [] };
let store = {};
const alerts = [];
let confirmAnswer = true;

const sandbox = {
  console,
  window: { addEventListener() {} },
  document: {
    getElementById(id) { return elMap[id] || (elMap[id] = makeEl(id)); },
    createElement(tag) { const e = makeEl(tag + Math.random()); e.tag = tag; e._match = s => (s === '.btn' ? e.classList.contains('btn') : s === '.option' ? e.classList.contains('option') : false); return e; },
    body: makeEl('body'),
    querySelectorAll() { return []; },
    addEventListener() {},
    documentElement: makeEl('html')
  },
  navigator: { userAgent: 'test' },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  fetch: () => Promise.reject(new Error('offline')),
  alert: msg => alerts.push(String(msg)),
  confirm: () => confirmAnswer,
  setTimeout: (fn, ms) => { timers.setTimeout.push({ fn, ms }); return timers.setTimeout.length; },
  clearTimeout: () => {},
  setInterval: (fn, ms) => { timers.setInterval.push({ fn, ms }); return timers.setInterval.length; },
  clearInterval: () => {},
  requestAnimationFrame: fn => fn(),
  Math, Date, JSON, Promise, Set, Array, Object, String, Number, RegExp, parseInt, parseFloat, isNaN
};
sandbox.window.__HAM_EMBEDDED__ = { questions, categories };
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
vm.runInContext(scriptBody, ctx, { filename: 'index.html<script>' });
// 桥接 let 声明的内部状态
vm.runInContext(`__T = { getMock: () => mock, getQuestions: () => questions, getState: () => state, MOCK };`, ctx);
const T = sandbox.__T;

// init() 是异步 promise，等微任务队列排空
(async () => {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));

  let pass = 0, fail = 0;
  const ok = (cond, name, extra) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
  };

  ok(T.getQuestions().length === 683, `题库加载 ${T.getQuestions().length} 题`);

  const singles = questions.filter(q => q.selectCount === 1).length;
  const multis = questions.filter(q => q.selectCount > 1).length;
  console.log('\n[0] 练习模式回归：recordAnswer/进度写入链路完好');
  vm.runInContext('startSequential()', ctx);
  const pe = vm.runInContext('({ n: exam.questions.length, id: exam.questions[0].id })', ctx);
  ok(pe.n === 25, `顺序练习抽题 ${pe.n} 题`);
  vm.runInContext('renderQuestion()', ctx);
  const qA = T.getQuestions().find(q => q.id === pe.id);
  const pc = elMap['optionsContainer'];
  const pOpts = pc.children.filter(c => c.classList.contains('option'));
  if (qA.selectCount === 1) {
    pOpts.find(e => e.dataset.letter === qA.answer).onclick();  // 单选 → submitSingle → recordAnswer
  } else {
    qA.answer.split('').forEach(L => pOpts.find(e => e.dataset.letter === L).onclick()); // 多选 toggle → doSubmitMulti
    elMap['examActions'].children.find(c => /确认提交/.test(c.textContent)).onclick();
  }
  const st0 = T.getState();
  ok(Object.keys(st0.answered).length === 1 && st0.score >= 1, '练习答对 → answered/score 正常落库');
  vm.runInContext("exam = { questions: [], index: 0, score: 0, results: [], mode: '', category: '', selected: new Set() };", ctx);

  console.log(`\n[1] 组卷：随机 200 次抽样（单选池 ${singles}，多选池 ${multis}）`);
  let allGood = true, minSCat = 99, minMCat = 99;
  const seen = new Set();
  for (let t = 0; t < 200; t++) {
    vm.runInContext('startMockExam()', ctx);
    const m = T.getMock();
    const qs = m.questions;
    const s = qs.filter(q => q.selectCount === 1), mu = qs.filter(q => q.selectCount > 1);
    const ids = new Set(qs.map(q => q.id));
    if (!(qs.length === 40 && s.length === 32 && mu.length === 8 && ids.size === 40)) { allGood = false; console.log(`    异常卷: ${qs.length}/${s.length}/${mu.length}/${ids.size}`); break; }
    const sc = new Set(s.map(q => q.category)).size, mc = new Set(mu.map(q => q.category)).size;
    if (sc < 32 || mc < 8) { allGood = false; console.log(`    分类铺开不足: 单选${sc} 多选${mc}`); break; }
    minSCat = Math.min(minSCat, sc); minMCat = Math.min(minMCat, mc);
    qs.forEach(q => seen.add(q.id));
    vm.runInContext('mock.active = false; stopMockTimer();', ctx);
  }
  ok(allGood, '每次 40 题 = 32 单选 + 8 多选，无重复，32+8 个不同分类全覆盖');
  console.log(`    200 次抽样覆盖题目总数: ${seen.size} / 683（覆盖度 ${(seen.size / 683 * 100).toFixed(0)}%）`);

  console.log('\n[2] 判分：多选精确集合匹配 + 漏选/错选判 0');
  vm.runInContext('startMockExam()', ctx);
  const m = T.getMock();
  // 全部答对：单选点正确项，多选勾正确集合确认
  m.questions.forEach((q, i) => {
    m.index = i;
    if (q.selectCount === 1) m.answers[i] = q.answer;
    else m.answers[i] = [...q.answer].sort().join('');
  });
  m.index = m.questions.length - 1;
  vm.runInContext('finishMockExam()', ctx);
  let o = T.getMock().outcome;
  ok(o.okCount === 40 && o.wrongList.length === 0, '全对 → 40/40 无错题');
  ok(T.getState().wrong && Object.keys(T.getState().wrong).length === 0, '考试全程未写入错题本');
  const savedNoTouch = store['ham_exam_state'];
  ok(JSON.parse(savedNoTouch || '{}').wrong === undefined || Object.keys(JSON.parse(savedNoTouch).wrong).length === 0, 'localStorage 错题本未被考试污染');

  console.log('\n[3] 多选少选一项 = 0 分');
  vm.runInContext('startMockExam();', ctx);
  const m2 = T.getMock();
  m2.questions.forEach((q, i) => {
    if (q.selectCount === 1) m2.answers[i] = q.answer;
    else m2.answers[i] = [...q.answer].slice(0, q.answer.length - 1).sort().join(''); // 漏选
  });
  m2.index = m2.questions.length - 1;
  vm.runInContext('finishMockExam()', ctx);
  o = T.getMock().outcome;
  ok(o.okCount === 32 && o.wrongList.length === 8, `多选漏选全判错: 对${o.okCount} 错${o.wrongList.length}`);
  const firstWrong = o.wrongList[0];
  ok(/^第\d+题 · MC/.test('') === false && typeof firstWrong.no === 'number' && /^MC\d/.test(firstWrong.q.id), '错题含考号 + 题号 id');

  console.log('\n[4] 合格线 30：29 不合格 / 30 合格');
  const g29 = 29 >= T.MOCK.PASS, g30 = 30 >= T.MOCK.PASS;
  ok(!g29 && g30, 'PASS=30 边界正确');

  console.log('\n[5] 不可回翻 + 单选即锁定');
  vm.runInContext('startMockExam()', ctx);
  const m3 = T.getMock();
  // 渲染第 1 题并模拟点击一个正确选项
  m3.index = m3.questions.findIndex(q => q.selectCount === 1);
  const q0 = m3.questions[m3.index];
  const rightLetter = q0.selectCount === 1 ? q0.answer : null;
  vm.runInContext('renderMockQuestion()', ctx);
  const container = elMap['optionsContainer'];
  const optEls = container.children.filter(c => c.classList.contains('option'));
  ok(optEls.length === 4, '选项渲染 4 个');
  const target = optEls.find(e => e.dataset.letter === (rightLetter || 'A'));
  target.onclick();
  ok(container.dataset.submitted === '1', '单选点击后整题锁定（dataset.submitted）');
  ok(optEls.every(e => !e.onclick), '锁定后所有选项 onclick 已摘除');
  const idxBefore = m3.index, ansStored = m3.answers[m3.index];
  // 执行排队的 setTimeout → mockAdvance
  const pending = timers.setTimeout.splice(0);
  pending.forEach(t => t.fn());
  ok(m3.index === idxBefore + 1, `自动推进到下一题（${idxBefore}→${m3.index}）`);
  ok(ansStored !== null, '答案已记录');
  // 无「上一题」按钮：examActions 里除多选确认按钮外无导航按钮
  const actions = elMap['examActions'];
  ok(!actions.children.some(b => /上|back|回/i.test(b.textContent)), '页面无回翻/上一题入口');
  vm.runInContext('mock.active = false; stopMockTimer();', ctx);

  console.log('\n[6] 多选确认流程：未确认不得推进，确认后锁定');
  vm.runInContext('startMockExam()', ctx);
  const m4 = T.getMock();
  const mi = m4.questions.findIndex(q => q.selectCount > 1);
  m4.index = mi;
  vm.runInContext('renderMockQuestion()', ctx);
  const c4 = elMap['optionsContainer'];
  const opts4 = c4.children.filter(c => c.classList.contains('option'));
  const btn = elMap['examActions'].children.find(c => /确认/.test(c.textContent));
  ok(btn && btn.disabled === true, '未勾选时「确认本题」禁用');
  opts4[0].onclick();
  opts4[1].onclick();
  opts4[1].onclick(); // 取消第二个
  ok(btn.disabled === false, '有勾选项后按钮可用');
  vm.runInContext(`mock.answers[${mi}]`, ctx);
  const ansBefore = m4.answers[mi];
  ok(ansBefore === null, '未点确认前答案不落盘');
  btn.onclick();
  ok(c4.dataset.submitted === '1' && m4.answers[mi] === opts4[0].dataset.letter, '确认后锁定并记录集合');
  vm.runInContext('mock.active = false; stopMockTimer();', ctx);

  console.log('\n[7] 倒计时：超时自动交卷，未答按错题计');
  vm.runInContext('startMockExam()', ctx);
  const m5 = T.getMock();
  m5.answers[0] = m5.questions[0].answer; // 只答 1 题
  m5.endTime = Date.now() - 1000;          // 强制超时
  vm.runInContext('tickMockTimer()', ctx);
  ok(T.getMock().active === false, 'tick 到点 → 自动交卷');
  o = T.getMock().outcome;
  ok(o.timedOut === true, '成绩单标注超时');
  ok(o.okCount <= 1 && o.wrongList.length === 39, `未答 39 题计错题: 错${o.wrongList.length}`);
  ok(elMap['mockResultModal']._cls.has('active'), '弹出成绩弹窗');
  const modalText = elMap['mockModalSummary']._html;
  ok(/答对/.test(modalText) && /不合格/.test(modalText), `弹窗文案含答对数+合格判定: ${modalText.replace(/<[^>]+>/g, '')}`);
  ok(elMap['mockTimer'].style.display === 'none', '交卷后倒计时隐藏');

  console.log('\n[8] 错题本：默认不入本，可一键/逐题加入，可撤销');
  const wrongIds = o.wrongList.map(r => r.q.id);
  ok(Object.keys(T.getState().wrong).length === 0, '交卷后错题本仍为空（用户可选）');
  // 一键加入
  const actsBtn = elMap['mockWrongActions'].children.find(c => /全部错题/.test(c.textContent));
  ok(!!actsBtn, '成绩单有「全部错题加入」按钮');
  actsBtn.onclick();
  ok(Object.keys(T.getState().wrong).length === 39, `一键加入 39 题 → ${Object.keys(T.getState().wrong).length}`);
  const allBtn2 = elMap['mockWrongActions'].children.find(c => /已加入|全部/.test(c.textContent));
  ok(/✓ 错题已全部加入/.test(allBtn2.textContent), '按钮变「已全部加入」');
  // 逐题撤销：第一道错题按钮再点一次
  const item0 = elMap['mockWrongList'].children.find(c => c.classList.contains('result-item'));
  const perBtn = item0.children.find(c => /加入/.test(c.textContent));
  perBtn.onclick({ stopPropagation() {} });
  ok(Object.keys(T.getState().wrong).length === 38 && !T.getState().wrong[wrongIds[0]], '单题可撤销出错题本');
  // 已入本题练习答对后可移除（既有链路不受影响）——检查写入形状与 recordAnswer 一致
  const anyVal = T.getState().wrong[wrongIds[1]];
  ok(anyVal && anyVal.category && anyVal.time, '错题本条目形状 {category,time} 与练习一致');
  vm.runInContext('mock.active = false; stopMockTimer();', ctx);

  console.log('\n[9] 页面内完整题目详情，不依赖 alert');
  const detailQ = questions.reduce((a, b) => a.question.length > b.question.length ? a : b);
  const alertCount = alerts.length;
  sandbox.__detailQ = detailQ;
  vm.runInContext("showQuestionDetail(__detailQ, false, '')", ctx);
  const detailChildren = elMap['questionDetailBody'].children;
  ok(elMap['questionDetailModal'].classList.contains('active'), '详情弹窗打开');
  ok(detailChildren.some(el => el.className === 'question-detail-text' && el.textContent === detailQ.question), '长题干完整展示');
  ok(detailChildren.filter(el => el.classList.contains('detail-option')).length === 4, '完整显示四个选项');
  ok(detailChildren.some(el => el.className === 'question-detail-answer' && el.textContent.includes(detailQ.answer)), '显示正确答案');
  ok(detailChildren.some(el => el.className === 'question-detail-selection' && el.textContent.includes('未作答')), '未作答标记');
  ok(detailChildren.some(el => el.className === 'question-detail-explanation' && el.textContent.includes(detailQ.explanation)), '完整答案解析');
  ok(alerts.length === alertCount, '未调用系统 alert');
  vm.runInContext('closeQuestionDetail()', ctx);
  ok(!elMap['questionDetailModal'].classList.contains('active'), '详情可关闭');

  console.log(`\n═══ 结果: PASS ${pass} / FAIL ${fail} ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(2); });
