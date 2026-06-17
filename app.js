const ALL = "全部";
const THEME_TAGS = [
  "党建思政",
  "教育政策",
  "教育学原理",
  "综合知识",
  "心理健康",
  "党史国情",
  "时政热点",
  "文化科技常识",
  "法治法规",
  "学生管理",
  "马克思主义理论",
  "团学工作",
  "辅导员队伍",
  "安全教育",
  "就业创业",
  "网络思政",
  "资助育人",
];

const state = {
  questions: [],
  modules: [],
  filtered: [],
  activeModule: "简答题",
  activeIndex: 0,
  selectedTag: ALL,
  search: "",
  progressFilter: "all",
  showAnswer: false,
  analysisVisible: false,
  outlineOpen: false,
  openModules: new Set(["简答题"]),
  activeMockPaper: "",
  mockAnswers: JSON.parse(localStorage.getItem("counselor-mock-answers") || "{}"),
  submittedMockPapers: new Set(JSON.parse(localStorage.getItem("counselor-mock-submitted") || "[]")),
  openDailyCategories: new Set(["单选题", "多选题", "判断题", "填空题", "主观题"]),
  recognizing: false,
  recognition: null,
  speechFinalText: "",
  mastered: new Set(JSON.parse(localStorage.getItem("counselor-mastered") || "[]")),
  wrong: new Set(JSON.parse(localStorage.getItem("counselor-wrong") || "[]")),
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  moduleNav: document.querySelector("#moduleNav"),
  breadcrumb: document.querySelector("#breadcrumb"),
  practiceTitle: document.querySelector("#practiceTitle"),
  tagFilters: document.querySelector("#tagFilters"),
  filteredCount: document.querySelector("#filteredCount"),
  questionIndex: document.querySelector("#questionIndex"),
  questionStatus: document.querySelector("#questionStatus"),
  questionTitle: document.querySelector("#questionTitle"),
  multiChoiceBadge: document.querySelector("#multiChoiceBadge"),
  activeTags: document.querySelector("#activeTags"),
  answerInput: document.querySelector("#answerInput"),
  shortAnswerBox: document.querySelector("#shortAnswerBox"),
  objectiveAnswerBox: document.querySelector("#objectiveAnswerBox"),
  objectiveInputs: document.querySelector("#objectiveInputs"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  randomButton: document.querySelector("#randomButton"),
  toggleAnswerButton: document.querySelector("#toggleAnswerButton"),
  submitAnswerButton: document.querySelector("#submitAnswerButton"),
  masterButton: document.querySelector("#masterButton"),
  wrongButton: document.querySelector("#wrongButton"),
  resetProgressButton: document.querySelector("#resetProgressButton"),
  clearAnswerButton: document.querySelector("#clearAnswerButton"),
  voiceButton: document.querySelector("#voiceButton"),
  outlineButton: document.querySelector("#outlineButton"),
  closeOutlineButton: document.querySelector("#closeOutlineButton"),
  outlineDrawer: document.querySelector("#outlineDrawer"),
  answerPanel: document.querySelector("#answerPanel"),
  analysisPanel: document.querySelector("#analysisPanel"),
  matchScore: document.querySelector("#matchScore"),
  userAnswerDiff: document.querySelector("#userAnswerDiff"),
  analysisReferenceAnswer: document.querySelector("#analysisReferenceAnswer"),
  referenceAnswer: document.querySelector("#referenceAnswer"),
  memoryOutline: document.querySelector("#memoryOutline"),
  policyBasisSection: document.querySelector("#policyBasisSection"),
  policyBasis: document.querySelector("#policyBasis"),
  totalCount: document.querySelector("#totalCount"),
  masteredCount: document.querySelector("#masteredCount"),
  masteredFilterButton: document.querySelector("#masteredFilterButton"),
  unmasteredCount: document.querySelector("#unmasteredCount"),
  unmasteredFilterButton: document.querySelector("#unmasteredFilterButton"),
  wrongCount: document.querySelector("#wrongCount"),
  wrongFilterButton: document.querySelector("#wrongFilterButton"),
  progressPercent: document.querySelector("#progressPercent"),
};

init();

async function init() {
  try {
    const embeddedQuestions = window.__QUESTION_BANK__;
    const embeddedModules = window.__MODULES__;
    const [questions, modules] = embeddedQuestions && embeddedModules
      ? [embeddedQuestions, embeddedModules]
      : await Promise.all([
          fetch("./data/question-bank.json").then((response) => response.json()),
          fetch("./data/modules.json").then((response) => response.json()),
        ]);

    state.questions = questions;
    state.modules = modules;
    state.filtered = questions;
    setupSpeechRecognition();
    bindEvents();
    applyFilters();
  } catch (error) {
    els.questionTitle.textContent = "题库加载失败";
    els.referenceAnswer.textContent = "请检查 question-data.js 或 data/question-bank.json 是否存在。";
    els.answerPanel.hidden = false;
    console.error(error);
  }
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    state.activeIndex = 0;
    applyFilters();
  });

  els.prevButton.addEventListener("click", () => moveQuestion(-1));
  els.nextButton.addEventListener("click", () => moveQuestion(1));
  els.randomButton.addEventListener("click", pickRandomQuestion);
  els.toggleAnswerButton.addEventListener("click", toggleAnswer);
  els.submitAnswerButton.addEventListener("click", submitAnswer);
  els.masterButton.addEventListener("click", toggleMastered);
  els.wrongButton.addEventListener("click", toggleWrong);
  els.resetProgressButton.addEventListener("click", resetProgress);
  els.masteredFilterButton.addEventListener("click", toggleMasteredFilter);
  els.unmasteredFilterButton.addEventListener("click", toggleUnmasteredFilter);
  els.wrongFilterButton.addEventListener("click", toggleWrongFilter);
  els.clearAnswerButton.addEventListener("click", () => {
    stopVoiceInput();
    els.answerInput.value = "";
    state.speechFinalText = "";
    clearAnalysis();
    delete els.answerInput.dataset.base;
    els.answerInput.focus();
  });
  els.outlineButton.addEventListener("click", () => setOutlineOpen(true));
  els.closeOutlineButton.addEventListener("click", () => setOutlineOpen(false));
  els.voiceButton.addEventListener("click", toggleVoiceInput);

}

function renderTagFilters() {
  const moduleQuestions = questionsForActiveModule();
  const rawTags = [...new Set(moduleQuestions.flatMap((question) => question.tags || []))];
  const orderedTags = ["模拟题", "每日一练"].includes(state.activeModule)
    ? [
        ...THEME_TAGS.filter((tag) => rawTags.includes(tag)),
        ...rawTags.filter((tag) => !THEME_TAGS.includes(tag)).sort((a, b) => a.localeCompare(b, "zh-CN")),
      ]
    : rawTags;
  const tags = [ALL, ...orderedTags];
  els.tagFilters.innerHTML = tags
    .map((tag) => {
      const active = tag === state.selectedTag ? "active" : "";
      return `<button class="tag-chip ${active}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
    })
    .join("");

  els.tagFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTag = button.dataset.tag;
      state.activeIndex = 0;
      renderTagFilters();
      applyFilters();
    });
  });
}

function applyFilters() {
  const searchText = state.search.toLowerCase();
  const moduleQuestions = questionsForActiveModule();
  const matchingQuestions = moduleQuestions.filter((question) => {
    const tagMatch = state.selectedTag === ALL || (question.tags || []).includes(state.selectedTag);
    const progressMatch =
      state.progressFilter === "all" ||
      (state.progressFilter === "mastered" && state.mastered.has(question.id)) ||
      (state.progressFilter === "unmastered" && !state.mastered.has(question.id)) ||
      (state.progressFilter === "wrong" && state.wrong.has(question.id));
    const haystack = [
      question.question,
      question.reference_answer,
      ...(question.memory_outline || []),
      ...(question.policy_basis || []),
      ...Object.values(question.options || {}),
      ...(question.blanks || []),
    ]
      .join(" ")
      .toLowerCase();
    return progressMatch && tagMatch && (!searchText || haystack.includes(searchText));
  });

  if (state.activeModule === "模拟题") {
    const papers = mockPaperGroups(matchingQuestions);
    if (!papers.some((paper) => paper.source === state.activeMockPaper)) {
      state.activeMockPaper = papers[0]?.source || "";
    }
    state.filtered = state.activeMockPaper
      ? matchingQuestions.filter((question) => mockQuestionSource(question) === state.activeMockPaper)
      : matchingQuestions;
  } else {
    state.filtered = matchingQuestions;
  }

  if (state.activeIndex >= state.filtered.length) {
    state.activeIndex = Math.max(0, state.filtered.length - 1);
  }

  state.showAnswer = false;
  if (state.activeModule !== "模拟题") {
    state.activeMockPaper = "";
  }
  clearAnalysis();
  renderTagFilters();
  renderModuleNav();
  renderActiveQuestion();
  renderProgress();
}

function renderModuleNav() {
  els.filteredCount.textContent = `${state.filtered.length} 道题`;
  const icon = { 简答题: "答", 选择题: "选", 填空题: "填", 模拟题: "模", 每日一练: "练" };
  els.moduleNav.innerHTML = state.modules
    .map((module) => {
      const questions = module.name === state.activeModule
        ? navigationQuestionsForModule(module.name)
        : questionsForModule(module.name);
      const open = state.openModules.has(module.name);
      const active = module.name === state.activeModule ? "active" : "";
      const tree = !open
        ? ""
        : renderQuestionTree(module.name, questions);
      return `<section class="module-section">
        <button class="module-item ${active} ${open ? "" : "collapsed"}" type="button" data-module-toggle="${escapeHtml(module.name)}">
          <span class="module-icon">${icon[module.name] || "题"}</span>
          <span>${escapeHtml(module.name)}</span>
          <small>${questionsForModule(module.name).length}</small>
          <span class="module-caret" aria-hidden="true">⌄</span>
        </button>
        ${tree}
      </section>`;
    })
    .join("");

  els.moduleNav.querySelectorAll("button[data-module-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const module = button.dataset.moduleToggle;
      if (state.activeModule !== module) {
        state.activeModule = module;
        state.activeIndex = 0;
        state.selectedTag = ALL;
        state.openModules.add(module);
        resetQuestionInput();
        applyFilters();
        return;
      }
      if (state.openModules.has(module)) state.openModules.delete(module);
      else state.openModules.add(module);
      renderModuleNav();
    });
  });

  els.moduleNav.querySelectorAll("button[data-mock-paper]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.activeModule = button.dataset.module;
      state.activeMockPaper = button.dataset.mockPaper;
      state.activeIndex = 0;
      state.showAnswer = false;
      resetQuestionInput();
      applyFilters();
    });
  });

  els.moduleNav.querySelectorAll("button[data-daily-category-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const category = button.dataset.dailyCategoryToggle;
      if (state.openDailyCategories.has(category)) state.openDailyCategories.delete(category);
      else state.openDailyCategories.add(category);
      renderModuleNav();
    });
  });

  els.moduleNav.querySelectorAll("button[data-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeModule = button.dataset.module;
      state.activeIndex = Number(button.dataset.index);
      state.showAnswer = false;
      resetQuestionInput();
      renderModuleNav();
      renderActiveQuestion();
    });
  });
}

function renderQuestionTree(moduleName, questions) {
  if (!questions.length) {
    return `<div class="question-tree" data-tree="${escapeHtml(moduleName)}"><div class="empty-state">没有匹配题目</div></div>`;
  }

  if (moduleName === "每日一练") {
    return renderDailyPracticeTree(moduleName, questions);
  }

  if (moduleName !== "模拟题") {
    return `<div class="question-tree" data-tree="${escapeHtml(moduleName)}">${
      questions.map((question, index) => renderQuestionTreeButton(moduleName, question, index)).join("")
    }</div>`;
  }

  const groups = mockPaperGroups(questions)
    .map((paper) => {
      const selected = paper.source === state.activeMockPaper ? "active" : "";
      const submitted = state.submittedMockPapers.has(paper.source);
      const score = submitted ? calculateMockPaperScore(paper.questions) : null;
      return `<button class="mock-paper-button ${selected}" type="button" data-module="${escapeHtml(moduleName)}" data-mock-paper="${escapeHtml(paper.source)}">
        <span>${escapeHtml(mockPaperTitle(paper.source))}</span>
        <small>${paper.questions.length} 道${score ? ` · ${score.scoreText}` : ""}</small>
      </button>`;
    })
    .join("");

  return `<div class="question-tree mock-tree" data-tree="${escapeHtml(moduleName)}">${groups}</div>`;
}

function navigationQuestionsForModule(moduleName) {
  if (moduleName !== "模拟题") return state.filtered;
  const searchText = state.search.toLowerCase();
  return questionsForModule(moduleName).filter((question) => {
    const tagMatch = state.selectedTag === ALL || (question.tags || []).includes(state.selectedTag);
    const progressMatch =
      state.progressFilter === "all" ||
      (state.progressFilter === "mastered" && state.mastered.has(question.id)) ||
      (state.progressFilter === "unmastered" && !state.mastered.has(question.id)) ||
      (state.progressFilter === "wrong" && state.wrong.has(question.id));
    const haystack = [
      question.question,
      question.reference_answer,
      ...(question.memory_outline || []),
      ...(question.policy_basis || []),
      question.source_file || "",
      ...Object.values(question.options || {}),
      ...(question.blanks || []),
    ]
      .join(" ")
      .toLowerCase();
    return progressMatch && tagMatch && (!searchText || haystack.includes(searchText));
  });
}

function renderDailyPracticeTree(moduleName, questions) {
  const categories = ["单选题", "多选题", "判断题", "填空题", "主观题"];
  const groups = categories
    .map((category) => {
      const items = questions
        .map((question, index) => ({ question, index }))
        .filter((item) => item.question.type === category);
      if (!items.length) return "";
      const open = state.openDailyCategories.has(category);
      return `<div class="daily-category">
        <button class="mock-category-title ${open ? "" : "collapsed"}" type="button" data-daily-category-toggle="${escapeHtml(category)}">
          <span>${escapeHtml(category)}</span>
          <small>${items.length}</small>
          <span class="mock-category-caret" aria-hidden="true">⌄</span>
        </button>
        <div class="mock-category-questions" ${open ? "" : "hidden"}>
          ${items.map((item) => renderQuestionTreeButton(moduleName, item.question, item.index)).join("")}
        </div>
      </div>`;
    })
    .join("");

  return `<div class="question-tree daily-tree" data-tree="${escapeHtml(moduleName)}">${groups}</div>`;
}

function mockQuestionSource(question) {
  return question.source_file || (question.policy_basis || [])[0] || "未分套模拟题";
}

function mockPaperGroups(questions) {
  const groups = new Map();
  questions.forEach((question) => {
    const source = mockQuestionSource(question);
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(question);
  });
  return [...groups.entries()]
    .map(([source, paperQuestions]) => ({ source, questions: paperQuestions }))
    .sort((a, b) => mockPaperNumber(a.source) - mockPaperNumber(b.source) || a.source.localeCompare(b.source, "zh-CN"));
}

function mockPaperNumber(source) {
  const match = String(source || "").match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function mockPaperTitle(source) {
  const name = String(source || "未分套模拟题").replace(/\.pdf$/i, "");
  const number = mockPaperNumber(name);
  if (Number.isFinite(number) && number !== Number.MAX_SAFE_INTEGER) {
    return `第 ${number} 套 · ${name.replace(/^\d+[.．、]?\s*/, "")}`;
  }
  return name;
}

function renderQuestionTreeButton(moduleName, question, index) {
  const selected = moduleName === state.activeModule && index === state.activeIndex ? "active" : "";
  const mark = state.mastered.has(question.id) ? " · 已掌握" : "";
  const detailType = question.category === "分析论述题" ? `[${(question.tags || [])[1] || "分析论述"}] ` : question.daily_type ? `[${question.daily_type}] ` : "";
  return `<button class="${selected}" type="button" data-module="${escapeHtml(moduleName)}" data-index="${index}">${question.id}${mark}<br>${escapeHtml(detailType + question.question)}</button>`;
}

function questionsForModule(module) {
  return state.questions.filter((question) => question.module === module);
}

function questionsForActiveModule() {
  return questionsForModule(state.activeModule);
}

function renderActiveQuestion() {
  const question = activeQuestion();
  if (!question) {
    els.questionIndex.textContent = "第 0 题";
    els.questionStatus.textContent = "无题目";
    els.questionTitle.textContent = "没有可显示的题目";
    els.multiChoiceBadge.hidden = true;
    els.activeTags.innerHTML = "";
    els.answerPanel.hidden = true;
    els.analysisPanel.hidden = true;
    els.shortAnswerBox.hidden = true;
    els.objectiveAnswerBox.hidden = true;
    els.policyBasisSection.hidden = true;
    renderList(els.memoryOutline, []);
    return;
  }

  if (state.activeModule === "模拟题") {
    renderMockPaper();
    return;
  }

  els.prevButton.hidden = false;
  els.nextButton.hidden = false;
  els.randomButton.hidden = false;
  els.toggleAnswerButton.hidden = false;
  els.masterButton.hidden = false;
  els.wrongButton.hidden = false;
  els.submitAnswerButton.textContent = "提交";
  els.questionIndex.textContent = `第 ${state.activeIndex + 1} / ${state.filtered.length} 题`;
  els.questionStatus.textContent = statusText(question);
  els.questionTitle.textContent = question.question;
  const badgeText = question.type === "多选题" ? "多选" : question.type === "判断题" ? "判断" : question.type === "主观题" ? "主观" : "";
  els.multiChoiceBadge.textContent = badgeText;
  els.multiChoiceBadge.hidden = !badgeText;
  els.activeTags.innerHTML = (question.tags || [])
    .map((tag) => `<span class="active-tag">${escapeHtml(tag)}</span>`)
    .join("");

  els.answerPanel.hidden = !state.showAnswer;
  const shortAnswer = isSubjectiveQuestion(question);
  els.shortAnswerBox.hidden = !shortAnswer;
  els.objectiveAnswerBox.hidden = shortAnswer;
  els.outlineButton.hidden = !shortAnswer;
  els.toggleAnswerButton.textContent = state.showAnswer ? "隐藏答案" : "查看答案";
  els.masterButton.textContent = state.mastered.has(question.id) ? "取消掌握" : "标记掌握";
  els.wrongButton.textContent = state.wrong.has(question.id) ? "移出错题" : "标记错题";
  els.submitAnswerButton.hidden = question.type === "单选题" || question.type === "判断题";
  els.referenceAnswer.textContent = question.reference_answer || "暂无参考答案";
  renderList(els.memoryOutline, question.memory_outline || []);
  const policies = question.policy_basis || [];
  els.policyBasisSection.hidden = !policies.length;
  renderList(els.policyBasis, policies);
  els.breadcrumb.textContent = `Overview / ${state.activeModule}`;
  els.practiceTitle.textContent = `${state.activeModule}训练`;
  if (!shortAnswer && els.objectiveInputs.dataset.questionId !== question.id) {
    renderObjectiveInputs(question);
  }
}

function renderMockPaper() {
  const questions = state.filtered;
  const paperSource = state.activeMockPaper || mockQuestionSource(questions[0]);
  const submitted = state.submittedMockPapers.has(paperSource);
  const score = calculateMockPaperScore(questions);

  els.prevButton.hidden = true;
  els.nextButton.hidden = true;
  els.randomButton.hidden = true;
  els.toggleAnswerButton.hidden = true;
  els.masterButton.hidden = true;
  els.wrongButton.hidden = true;
  els.submitAnswerButton.hidden = !questions.length;
  els.submitAnswerButton.textContent = submitted ? "重新答题" : "提交试卷";
  els.questionIndex.textContent = `${questions.length} 道题`;
  els.questionStatus.textContent = submitted ? `已交卷 · ${score.scoreText}` : "答题中";
  els.questionTitle.textContent = mockPaperTitle(paperSource);
  els.multiChoiceBadge.textContent = "套卷";
  els.multiChoiceBadge.hidden = false;
  els.activeTags.innerHTML = `<span class="active-tag">${escapeHtml(paperSource)}</span>`;
  els.shortAnswerBox.hidden = true;
  els.objectiveAnswerBox.hidden = false;
  els.outlineButton.hidden = true;
  els.answerPanel.hidden = true;
  els.analysisPanel.hidden = true;
  els.policyBasisSection.hidden = true;
  els.breadcrumb.textContent = "Overview / 模拟题";
  els.practiceTitle.textContent = "模拟题套卷";
  renderList(els.memoryOutline, []);

  els.objectiveInputs.dataset.questionId = `mock-paper:${paperSource}`;
  els.objectiveInputs.innerHTML = `<div class="mock-paper">
    <div class="mock-paper-summary">
      <div>
        <strong>${submitted ? score.scoreText : "整套作答"}</strong>
        <span>${submitted ? score.detailText : "提交试卷后统一显示答案解析和最终分数。"}</span>
      </div>
      <small>客观题自动计分，主观题提交后展示参考答案。</small>
    </div>
    ${questions.map((question, index) => renderMockQuestion(question, index, submitted)).join("")}
  </div>`;
  bindMockPaperInputs();
}

function renderMockQuestion(question, index, submitted) {
  const answer = getMockAnswer(question);
  const result = submitted ? scoreMockQuestion(question) : null;
  const resultClass = result?.gradable ? (result.score >= 1 ? "correct-text" : "incorrect-text") : "muted-text";
  const answerHtml = renderMockAnswerInput(question, answer, submitted);
  const analysisHtml = submitted
    ? `<div class="mock-analysis">
        <div class="mock-analysis-head">
          <div class="${resultClass}">${escapeHtml(mockResultText(question, result))}</div>
          <button class="danger-button mock-wrong-button" type="button" data-mock-wrong="${escapeHtml(question.id)}">
            ${state.wrong.has(question.id) ? "移出错题" : "标记错题"}
          </button>
        </div>
        <div><strong>参考答案：</strong>${escapeHtml(question.reference_answer || "暂无参考答案")}</div>
      </div>`
    : "";
  return `<article class="mock-question-card">
    <div class="mock-question-head">
      <span>第 ${index + 1} 题</span>
      <small>${escapeHtml(question.type || question.category || "题目")}</small>
    </div>
    <h3>${escapeHtml(question.question)}</h3>
    ${answerHtml}
    ${analysisHtml}
  </article>`;
}

function renderMockAnswerInput(question, answer, submitted) {
  if (question.options) {
    const inputType = question.type === "多选题" ? "checkbox" : "radio";
    const selected = new Set(Array.isArray(answer) ? answer : answer ? [answer] : []);
    const correct = new Set(question.correct_answers || []);
    return `<div class="choice-list">
      ${Object.entries(question.options || {}).map(([key, value]) => {
        const checked = selected.has(key) ? "checked" : "";
        const disabled = submitted ? "disabled" : "";
        const stateClass = submitted
          ? correct.has(key)
            ? "correct"
            : selected.has(key)
              ? "incorrect"
              : ""
          : "";
        return `<label class="choice-option ${stateClass}" data-option="${escapeHtml(key)}">
          <input type="${inputType}" name="mock-${escapeHtml(question.id)}" value="${escapeHtml(key)}" data-mock-choice="${escapeHtml(question.id)}" ${checked} ${disabled} />
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(value)}</span>
        </label>`;
      }).join("")}
    </div>`;
  }

  if (question.blanks) {
    return `<div class="fill-list">
      <label class="fill-item">
        <span>填写答案</span>
        <input type="text" data-mock-fill="${escapeHtml(question.id)}" value="${escapeHtml(answer || "")}" ${submitted ? "disabled" : ""} autocomplete="off" placeholder="多个答案请按顺序用、或，隔开" />
      </label>
    </div>`;
  }

  return `<textarea class="mock-text-answer" data-mock-text="${escapeHtml(question.id)}" ${submitted ? "disabled" : ""} placeholder="在这里作答">${escapeHtml(answer || "")}</textarea>`;
}

function bindMockPaperInputs() {
  els.objectiveInputs.querySelectorAll("[data-mock-choice]").forEach((input) => {
    input.addEventListener("change", () => {
      const question = questionById(input.dataset.mockChoice);
      if (!question) return;
      if (input.type === "checkbox") {
        setMockAnswer(question, [...els.objectiveInputs.querySelectorAll(`input[data-mock-choice="${cssEscape(question.id)}"]:checked`)].map((item) => item.value));
      } else {
        setMockAnswer(question, input.value);
      }
    });
  });
  els.objectiveInputs.querySelectorAll("[data-mock-fill], [data-mock-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const question = questionById(input.dataset.mockFill || input.dataset.mockText);
      if (question) setMockAnswer(question, input.value);
    });
  });
  els.objectiveInputs.querySelectorAll("[data-mock-wrong]").forEach((button) => {
    button.addEventListener("click", () => toggleMockWrong(button.dataset.mockWrong));
  });
}

function toggleMockWrong(questionId) {
  if (!questionId) return;
  if (state.wrong.has(questionId)) {
    state.wrong.delete(questionId);
  } else {
    state.wrong.add(questionId);
  }
  persistProgress();
  renderModuleNav();
  renderActiveQuestion();
  renderProgress();
}

function submitMockPaper() {
  const paper = state.activeMockPaper;
  if (!paper) return;
  if (state.submittedMockPapers.has(paper)) {
    state.submittedMockPapers.delete(paper);
  } else {
    state.submittedMockPapers.add(paper);
  }
  persistMockState();
  renderModuleNav();
  renderActiveQuestion();
}

function mockAnswerKey(question) {
  return `${mockQuestionSource(question)}::${question.id}`;
}

function getMockAnswer(question) {
  return state.mockAnswers[mockAnswerKey(question)];
}

function setMockAnswer(question, value) {
  state.mockAnswers[mockAnswerKey(question)] = value;
  persistMockState();
}

function persistMockState() {
  localStorage.setItem("counselor-mock-answers", JSON.stringify(state.mockAnswers));
  localStorage.setItem("counselor-mock-submitted", JSON.stringify([...state.submittedMockPapers]));
}

function questionById(id) {
  return state.questions.find((question) => question.id === id);
}

function calculateMockPaperScore(questions) {
  const results = questions.map(scoreMockQuestion).filter((result) => result.gradable);
  const total = results.length;
  const points = results.reduce((sum, result) => sum + result.score, 0);
  const percent = total ? Math.round((points / total) * 100) : 0;
  const scoreText = total ? `${percent} 分` : "暂无自动分数";
  const detailText = total
    ? `自动判分 ${formatScoreNumber(points)} / ${total} 题，另有 ${questions.length - total} 道主观题需自评。`
    : "本套题均为主观题，请根据参考答案自评。";
  return { total, points, percent, scoreText, detailText };
}

function scoreMockQuestion(question) {
  const answer = getMockAnswer(question);
  if (question.options) {
    const selected = Array.isArray(answer) ? answer : answer ? [answer] : [];
    const correct = question.correct_answers || [];
    const correctSet = new Set(correct);
    const exact = selected.length === correct.length && selected.every((item) => correctSet.has(item));
    return { gradable: true, score: exact ? 1 : 0, selected, correct };
  }
  if (question.blanks) {
    const expected = question.blanks || [];
    const actual = splitFillAnswer(answer || "");
    if (!expected.length) return { gradable: false, score: 0 };
    const correctCount = expected.filter((item, index) => normalizeObjectiveAnswer(actual[index]) === normalizeObjectiveAnswer(item)).length;
    return { gradable: true, score: correctCount / expected.length, selected: actual, correct: expected };
  }
  return { gradable: false, score: 0 };
}

function mockResultText(question, result) {
  if (!result?.gradable) return "主观题：请对照参考答案自评。";
  if (question.options) {
    const selected = result.selected.length ? result.selected.join("、") : "未作答";
    return `你的答案：${selected}；正确答案：${result.correct.join("、") || "暂无"}`;
  }
  return `填空得分：${formatScoreNumber(result.score)} / 1`;
}

function formatScoreNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function renderProgress() {
  const questions = questionsForActiveModule();
  const total = questions.length;
  const mastered = questions.filter((question) => state.mastered.has(question.id)).length;
  const unmastered = total - mastered;
  const wrong = questions.filter((question) => state.wrong.has(question.id)).length;
  const percent = total ? Math.round((mastered / total) * 100) : 0;
  els.totalCount.textContent = total;
  els.masteredCount.textContent = mastered;
  els.unmasteredCount.textContent = unmastered;
  els.wrongCount.textContent = wrong;
  els.progressPercent.textContent = `${percent}%`;
  els.masteredFilterButton.classList.toggle("active", state.progressFilter === "mastered");
  els.unmasteredFilterButton.classList.toggle("active", state.progressFilter === "unmastered");
  els.wrongFilterButton.classList.toggle("active", state.progressFilter === "wrong");
  els.masteredFilterButton.setAttribute("aria-pressed", String(state.progressFilter === "mastered"));
  els.unmasteredFilterButton.setAttribute("aria-pressed", String(state.progressFilter === "unmastered"));
  els.wrongFilterButton.setAttribute("aria-pressed", String(state.progressFilter === "wrong"));
  els.masteredFilterButton.title = state.progressFilter === "mastered" ? "显示全部题目" : "只显示已掌握题目";
  els.unmasteredFilterButton.title = state.progressFilter === "unmastered" ? "显示全部题目" : "只显示未掌握题目";
  els.wrongFilterButton.title = state.progressFilter === "wrong" ? "显示全部题目" : "只显示错题本题目";
}

function renderList(container, items) {
  container.innerHTML = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>暂无</li>`;
}

function activeQuestion() {
  return state.filtered[state.activeIndex];
}

function statusText(question) {
  const statuses = [];
  if (state.mastered.has(question.id)) statuses.push("已掌握");
  if (state.wrong.has(question.id)) statuses.push("错题");
  return statuses.length ? statuses.join(" / ") : "未掌握";
}

function moveQuestion(step) {
  if (!state.filtered.length) return;
  state.activeIndex = (state.activeIndex + step + state.filtered.length) % state.filtered.length;
  state.showAnswer = false;
  clearAnalysis();
  resetQuestionInput();
  renderModuleNav();
  renderActiveQuestion();
}

function pickRandomQuestion() {
  if (!state.filtered.length) return;
  state.activeIndex = Math.floor(Math.random() * state.filtered.length);
  state.showAnswer = false;
  clearAnalysis();
  resetQuestionInput();
  renderModuleNav();
  renderActiveQuestion();
}

function toggleAnswer() {
  state.showAnswer = !state.showAnswer;
  renderActiveQuestion();
}

function submitAnswer() {
  if (state.activeModule === "模拟题") {
    submitMockPaper();
    return;
  }

  const question = activeQuestion();
  if (!question) return;

  if (!isSubjectiveQuestion(question)) {
    submitObjectiveAnswer(question);
    return;
  }
  const result = compareAnswers(els.answerInput.value, question.reference_answer || "");
  els.matchScore.textContent = `匹配度 ${result.score}%`;
  els.userAnswerDiff.innerHTML = result.userHtml || "<span class=\"muted-text\">尚未输入答案</span>";
  els.analysisReferenceAnswer.textContent = question.reference_answer || "暂无参考答案";
  state.analysisVisible = true;
  els.analysisPanel.hidden = false;
}

function renderObjectiveInputs(question) {
  els.objectiveInputs.dataset.questionId = question.id;
  if (question.options) {
    const inputType = question.type === "多选题" ? "checkbox" : "radio";
    els.objectiveInputs.innerHTML = `<div class="choice-list">
      ${Object.entries(question.options || {}).map(([key, value]) => `
        <label class="choice-option" data-option="${escapeHtml(key)}">
          <input type="${inputType}" name="choiceAnswer" value="${escapeHtml(key)}" />
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(value)}</span>
        </label>
      `).join("")}
    </div>`;
    if (question.type === "单选题" || question.type === "判断题") {
      els.objectiveInputs.querySelectorAll("input[type=\"radio\"]").forEach((input) => {
        input.addEventListener("change", () => submitObjectiveAnswer(question));
      });
    }
    return;
  }

  const blankCount = (question.blanks || []).length;
  els.objectiveInputs.innerHTML = `<div class="fill-list">
    <label class="fill-item">
      <span>填写答案</span>
      <input type="text" data-fill-answer autocomplete="off" placeholder="${blankCount > 1 ? "多个答案请按顺序用、或，隔开" : "请输入答案"}" />
    </label>
  </div>`;
}

function isSubjectiveQuestion(question) {
  return question.type === "简答题" || question.type === "主观题";
}

function submitObjectiveAnswer(question) {
  let score = 0;
  let resultHtml = "";

  if (question.options) {
    const selected = [...els.objectiveInputs.querySelectorAll("input:checked")].map((input) => input.value);
    const correct = question.correct_answers || [];
    const selectedSet = new Set(selected);
    const correctSet = new Set(correct);
    const exact = selected.length === correct.length && selected.every((answer) => correctSet.has(answer));
    score = exact ? 100 : 0;

    els.objectiveInputs.querySelectorAll(".choice-option").forEach((option) => {
      const key = option.dataset.option;
      option.classList.toggle("correct", correctSet.has(key));
      option.classList.toggle("incorrect", selectedSet.has(key) && !correctSet.has(key));
    });
    resultHtml = selected.length
      ? `你选择了：${selected.map(escapeHtml).join("、")}`
      : `<span class="muted-text">尚未选择答案</span>`;
  } else {
    const answers = question.blanks || [];
    const input = els.objectiveInputs.querySelector("input[data-fill-answer]");
    const userAnswers = splitFillAnswer(input?.value || "");
    let correctCount = 0;
    const rows = answers.map((expected, index) => {
      const actual = userAnswers[index] || "";
      const correct = normalizeObjectiveAnswer(actual) === normalizeObjectiveAnswer(expected);
      if (correct) correctCount += 1;
      return `<div class="fill-result ${correct ? "correct-text" : "incorrect-text"}">第 ${index + 1} 空：${escapeHtml(actual || "未作答")}</div>`;
    });
    const exact = correctCount === answers.length && userAnswers.length === answers.length;
    input?.classList.toggle("correct", exact);
    input?.classList.toggle("incorrect", !exact);
    score = answers.length ? Math.round((correctCount / answers.length) * 100) : 0;
    resultHtml = rows.join("");
  }

  els.matchScore.textContent = `正确率 ${score}%`;
  els.userAnswerDiff.innerHTML = resultHtml;
  els.analysisReferenceAnswer.textContent = question.reference_answer || "暂无参考答案";
  state.analysisVisible = true;
  els.analysisPanel.hidden = false;
}

function normalizeObjectiveAnswer(value) {
  return String(value || "").replace(/[\s，。；、,.;:：]/g, "").toLowerCase();
}

function splitFillAnswer(value) {
  return String(value || "")
    .split(/[、，,；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resetQuestionInput() {
  stopVoiceInput();
  els.answerInput.value = "";
  state.speechFinalText = "";
  delete els.answerInput.dataset.base;
  els.objectiveInputs.innerHTML = "";
  delete els.objectiveInputs.dataset.questionId;
  clearAnalysis();
}

function clearAnalysis() {
  state.analysisVisible = false;
  if (els.analysisPanel) {
    els.analysisPanel.hidden = true;
  }
  if (els.matchScore) {
    els.matchScore.textContent = "匹配度 0%";
  }
  if (els.userAnswerDiff) {
    els.userAnswerDiff.innerHTML = "";
  }
  if (els.analysisReferenceAnswer) {
    els.analysisReferenceAnswer.textContent = "";
  }
}

function toggleMastered() {
  const question = activeQuestion();
  if (!question) return;
  if (state.mastered.has(question.id)) {
    state.mastered.delete(question.id);
  } else {
    state.mastered.add(question.id);
  }
  persistProgress();
  if (state.progressFilter === "mastered") {
    applyFilters();
    return;
  }
  if (state.progressFilter === "unmastered") {
    applyFilters();
    return;
  }
  renderModuleNav();
  renderActiveQuestion();
  renderProgress();
}

function toggleWrong() {
  const question = activeQuestion();
  if (!question) return;
  if (state.wrong.has(question.id)) {
    state.wrong.delete(question.id);
  } else {
    state.wrong.add(question.id);
  }
  persistProgress();
  if (state.progressFilter === "wrong") {
    applyFilters();
    return;
  }
  renderModuleNav();
  renderActiveQuestion();
  renderProgress();
}

function resetProgress() {
  state.mastered.clear();
  state.wrong.clear();
  state.progressFilter = "all";
  persistProgress();
  applyFilters();
}

function toggleMasteredFilter() {
  state.progressFilter = state.progressFilter === "mastered" ? "all" : "mastered";
  state.activeIndex = 0;
  applyFilters();
}

function toggleUnmasteredFilter() {
  state.progressFilter = state.progressFilter === "unmastered" ? "all" : "unmastered";
  state.activeIndex = 0;
  applyFilters();
}

function toggleWrongFilter() {
  state.progressFilter = state.progressFilter === "wrong" ? "all" : "wrong";
  state.activeIndex = 0;
  applyFilters();
}

function setOutlineOpen(open) {
  state.outlineOpen = open;
  els.outlineDrawer.classList.toggle("open", open);
  els.outlineDrawer.setAttribute("aria-hidden", String(!open));
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.voiceButton.disabled = true;
    els.voiceButton.title = "当前浏览器不支持语音识别";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "cmn-Hans-CN";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    let interimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        state.speechFinalText += addPauseComma(text);
      } else {
        interimText += text;
      }
    }
    els.answerInput.value = `${els.answerInput.dataset.base || ""}${state.speechFinalText}${interimText}`;
  };

  recognition.onend = () => {
    state.recognizing = false;
    els.voiceButton.classList.remove("recording");
    delete els.answerInput.dataset.base;
    state.speechFinalText = "";
  };

  state.recognition = recognition;
}

function toggleVoiceInput() {
  if (!state.recognition) return;
  if (state.recognizing) {
    stopVoiceInput();
    return;
  }
  state.recognizing = true;
  state.speechFinalText = "";
  els.answerInput.dataset.base = els.answerInput.value;
  els.voiceButton.classList.add("recording");
  state.recognition.start();
}

function stopVoiceInput() {
  if (!state.recognition || !state.recognizing) return;
  state.recognition.stop();
}

function addPauseComma(text) {
  const normalized = text.trim();
  if (!normalized) return "";
  return /[，。！？；、,.!?;]$/.test(normalized) ? normalized : `${normalized}，`;
}

function compareAnswers(userAnswer, referenceAnswer) {
  const userUnits = tokenizeForCompare(userAnswer);
  const referenceUnits = tokenizeForCompare(referenceAnswer);
  const pairs = lcsPairs(userUnits.map((unit) => unit.char), referenceUnits.map((unit) => unit.char));
  const matchedReference = new Set(pairs.map((pair) => pair[1]));
  const score = referenceUnits.length
    ? Math.round((pairs.length / referenceUnits.length) * 100)
    : 0;

  return {
    score,
    userHtml: renderDiffHtml(referenceAnswer, referenceUnits, matchedReference, "extra"),
  };
}

function tokenizeForCompare(text) {
  const units = [];
  Array.from(text || "").forEach((char, rawIndex) => {
    if (isComparableChar(char)) {
      units.push({ char, rawIndex });
    }
  });
  return units;
}

function isComparableChar(char) {
  return /[\p{Script=Han}A-Za-z0-9]/u.test(char);
}

function lcsPairs(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function renderDiffHtml(rawText, units, matchedSet, className, onlyUnmatched = false) {
  if (!rawText) return "";
  const unitByRawIndex = new Map(units.map((unit, index) => [unit.rawIndex, index]));
  const chars = Array.from(rawText);

  return chars
    .map((char, rawIndex) => {
      const unitIndex = unitByRawIndex.get(rawIndex);
      const comparable = unitIndex !== undefined;

      if (!comparable) {
        return onlyUnmatched ? "" : escapeHtml(char);
      }

      const matched = matchedSet.has(unitIndex);
      if (onlyUnmatched && matched) return "";
      if (!matched) {
        return `<mark class="${className}">${escapeHtml(char)}</mark>`;
      }
      return onlyUnmatched ? "" : escapeHtml(char);
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n");
}

function persistProgress() {
  localStorage.setItem("counselor-mastered", JSON.stringify([...state.mastered]));
  localStorage.setItem("counselor-wrong", JSON.stringify([...state.wrong]));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
