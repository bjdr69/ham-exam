// Run using playwright-cli run-code --filename tests/mock-exam-browser.js
async (page) => {
  let checks = 0;
  const check = (value, label) => {
    if (!value) throw new Error(label);
    checks++;
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:8765/index.standalone.html');
  await page.waitForFunction(() => questions.length === 683);
  // The APK has no alert bridge: details must work even if alert is unavailable.
  await page.evaluate(() => { window.alert = () => { throw new Error('Native alert is unavailable'); }; });
  await page.getByRole('button', { name: '📝 模拟考试', exact: true }).click();
  check(await page.evaluate(() => mock.questions.length === 40 && mock.questions.filter(q => q.selectCount > 1).length === 8), '40 questions: 32 single, 8 multi');
  // Place the longest question first so truncation and scrolling are exercised.
  const expected = await page.evaluate(() => {
    const longest = questions.reduce((a, b) => a.question.length > b.question.length ? a : b);
    const multi = questions.find(q => q.selectCount > 1);
    mock.questions = [longest, multi, ...mock.questions.filter(q => q.id !== longest.id && q.id !== multi.id)].slice(0, 40);
    mock.answers = mock.questions.map(() => '');
    mock.timedOut = true;
    finishMockExam();
    return JSON.parse(JSON.stringify({ longest, multi, wrongCount: mock.outcome.wrongList.length }));
  });
  await page.getByRole('button', { name: '查看错题明细', exact: true }).click();
  check(await page.locator('#mockWrongList .result-item').count() === expected.wrongCount, 'All wrong questions are listed');
  const opener = page.getByRole('button', { name: '查看第1题详情', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '题目详情' });
  await dialog.waitFor({ state: 'visible' });
  check(await dialog.locator('.question-detail-text').textContent() === expected.longest.question, 'Full untruncated question');
  for (const letter of ['A', 'B', 'C', 'D']) {
    check((await dialog.locator('.detail-option').nth('ABCD'.indexOf(letter)).textContent()).includes(expected.longest.options[letter]), `Full option ${letter}`);
  }
  check(await dialog.locator('.detail-option.correct').count() === expected.longest.answer.length, 'Correct choices are marked');
  check((await dialog.locator('.question-detail-answer').textContent()).includes(expected.longest.answer.split('').join('、')), 'Explicit correct answer');
  check((await dialog.locator('.question-detail-selection').textContent()).includes('未作答'), 'Unanswered question label');
  check((await dialog.locator('.question-detail-explanation').textContent()).includes(expected.longest.explanation), 'Complete explanation');
  check(await dialog.evaluate(el => {
    const rect = el.querySelector('.question-detail').getBoundingClientRect();
    const body = el.querySelector('.question-detail-body');
    return rect.top >= 0 && rect.bottom <= innerHeight && getComputedStyle(body).overflowY === 'auto' && body.scrollWidth <= body.clientWidth + 1;
  }), 'Long details fit phone viewport without horizontal clipping');
  await dialog.locator('.question-detail-body').evaluate(el => el.scrollTop = el.scrollHeight);
  await page.screenshot({ path: 'output/playwright/mock-detail-mobile.png' });
  await page.keyboard.press('Escape');
  check(await dialog.isHidden() && await opener.evaluate(el => document.activeElement === el), 'Escape closes and returns focus');

  // Adding to the wrong book must not accidentally open details.
  await page.locator('#mockWrongList .result-item').first().getByRole('button', { name: '加入', exact: true }).click();
  check(await dialog.isHidden(), 'Add button does not open details');
  check(await page.evaluate(id => !!state.wrong[id], expected.longest.id), 'Question saved in wrong book');
  await page.getByRole('button', { name: '查看第2题详情', exact: true }).click();
  check(await dialog.locator('.detail-option.correct').count() === expected.multi.answer.length, 'Multiple correct options are all marked');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  check(await dialog.isHidden(), 'Close button works');
  await page.locator('#mockWrongList .result-item').first().getByRole('button', { name: '✓ 已加入', exact: true }).click();
  check(await page.evaluate(id => !state.wrong[id], expected.longest.id), 'Remove still works');

  await page.getByRole('button', { name: '返回首页', exact: true }).last().click();
  await page.getByRole('button', { name: /错题本/ }).click();
  await page.evaluate(id => { state.wrong[id] = { category: questions.find(q => q.id === id).category, time: Date.now() }; saveState(); showWrongBook(); }, expected.longest.id);
  await page.locator('#wrongBookList .wrong-item').first().click();
  check(await dialog.isVisible(), 'Wrong book shares the full detail view');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();

  // Safe rendering even if a future question contains HTML-looking content.
  await page.evaluate(() => showQuestionDetail({ id: 'test', categoryName: 'test', selectCount: 1,
    question: '<img src=x onerror=alert(1)>', options: { A: '<b>A</b>', B: 'B', C: 'C', D: 'D' },
    answer: 'A', explanation: '<script>bad</script>' }, false, 'B'));
  check(await dialog.locator('img,script').count() === 0, 'Question content stays text');
  check((await dialog.locator('.question-detail-selection').textContent()).includes('B'), 'Chosen wrong answer is shown');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();

  // Small screen and dark theme: no clipping or horizontal overflow.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { localStorage.removeItem('ham_theme'); document.documentElement.removeAttribute('data-theme'); showQuestionDetail(questions.reduce((a, b) => a.question.length > b.question.length ? a : b), false); });
  check(await dialog.evaluate(el => { const r = el.querySelector('.question-detail').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), '320px dark viewport contains dialog');
  check(await dialog.locator('.question-detail-body').evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollHeight > el.clientHeight && el.scrollTop > 0 && el.scrollWidth <= el.clientWidth + 1; }), 'Long question and explanation scroll on a small screen');
  await page.screenshot({ path: 'output/playwright/mock-detail-dark-320.png' });
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();

  // Web build must have the same behavior as the offline build.
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(() => questions.length === 683);
  await page.evaluate(() => { window.alert = () => { throw new Error('No native alerts'); }; startMockExam(); mock.endTime = Date.now() - 1; tickMockTimer(); });
  await page.getByRole('button', { name: '查看错题明细', exact: true }).click();
  await page.getByRole('button', { name: '查看第1题详情', exact: true }).click();
  check(await dialog.isVisible(), 'Web build opens details after timeout');
  check(await dialog.locator('.detail-option').count() === 4, 'Web build shows all options');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  return { passed: checks, builds: ['offline', 'web'], widths: [390, 320] };
}
