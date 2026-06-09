const ALL = "全部";

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
  const tags = [ALL, ...new Set(moduleQuestions.flatMap((question) => question.tags || []))];
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
  state.filtered = questionsForActiveModule().filter((question) => {
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

  if (state.activeIndex >= state.filtered.length) {
    state.activeIndex = Math.max(0, state.filtered.length - 1);
  }

  state.showAnswer = false;
  clearAnalysis();
  renderTagFilters();
  renderModuleNav();
  renderActiveQuestion();
  renderProgress();
}

function renderModuleNav() {
  els.filteredCount.textContent = `${state.filtered.length} 道题`;
  const icon = { 简答题: "答", 选择题: "选", 填空题: "填" };
  els.moduleNav.innerHTML = state.modules
    .map((module) => {
      const questions = module.name === state.activeModule ? state.filtered : questionsForModule(module.name);
      const open = state.openModules.has(module.name);
      const active = module.name === state.activeModule ? "active" : "";
      const tree = !open
        ? ""
        : `<div class="question-tree" data-tree="${escapeHtml(module.name)}">${
            questions.length
              ? questions.map((question, index) => {
                  const selected = module.name === state.activeModule && index === state.activeIndex ? "active" : "";
                  const mark = state.mastered.has(question.id) ? " · 已掌握" : "";
                  return `<button class="${selected}" type="button" data-module="${escapeHtml(module.name)}" data-index="${index}">${question.id}${mark}<br>${escapeHtml(question.question)}</button>`;
                }).join("")
              : `<div class="empty-state">没有匹配题目</div>`
          }</div>`;
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
    renderList(els.memoryOutline, []);
    return;
  }

  els.questionIndex.textContent = `第 ${state.activeIndex + 1} / ${state.filtered.length} 题`;
  els.questionStatus.textContent = statusText(question);
  els.questionTitle.textContent = question.question;
  els.multiChoiceBadge.hidden = question.type !== "多选题";
  els.activeTags.innerHTML = (question.tags || [])
    .map((tag) => `<span class="active-tag">${escapeHtml(tag)}</span>`)
    .join("");

  els.answerPanel.hidden = !state.showAnswer;
  const shortAnswer = question.type === "简答题";
  els.shortAnswerBox.hidden = !shortAnswer;
  els.objectiveAnswerBox.hidden = shortAnswer;
  els.outlineButton.hidden = !shortAnswer;
  els.toggleAnswerButton.textContent = state.showAnswer ? "隐藏答案" : "查看答案";
  els.masterButton.textContent = state.mastered.has(question.id) ? "取消掌握" : "标记掌握";
  els.wrongButton.textContent = state.wrong.has(question.id) ? "移出错题" : "标记错题";
  els.submitAnswerButton.hidden = question.type === "单选题";
  els.referenceAnswer.textContent = question.reference_answer || "暂无参考答案";
  renderList(els.memoryOutline, question.memory_outline || []);
  renderList(els.policyBasis, question.policy_basis || []);
  els.breadcrumb.textContent = `Overview / ${state.activeModule}`;
  els.practiceTitle.textContent = `${state.activeModule}训练`;
  if (!shortAnswer && els.objectiveInputs.dataset.questionId !== question.id) {
    renderObjectiveInputs(question);
  }
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
  const question = activeQuestion();
  if (!question) return;

  if (question.type !== "简答题") {
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
  if (question.module === "选择题") {
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
    if (question.type === "单选题") {
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

function submitObjectiveAnswer(question) {
  let score = 0;
  let resultHtml = "";

  if (question.module === "选择题") {
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
