const ALL = "全部";

const state = {
  questions: [],
  modules: [],
  filtered: [],
  activeIndex: 0,
  selectedTag: ALL,
  search: "",
  showAnswer: false,
  analysisVisible: false,
  outlineOpen: false,
  questionTreeOpen: true,
  recognizing: false,
  recognition: null,
  speechFinalText: "",
  mastered: new Set(JSON.parse(localStorage.getItem("counselor-mastered") || "[]")),
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  questionTree: document.querySelector("#questionTree"),
  moduleCount: document.querySelector("#moduleCount"),
  tagFilters: document.querySelector("#tagFilters"),
  filteredCount: document.querySelector("#filteredCount"),
  questionIndex: document.querySelector("#questionIndex"),
  questionStatus: document.querySelector("#questionStatus"),
  questionTitle: document.querySelector("#questionTitle"),
  activeTags: document.querySelector("#activeTags"),
  answerInput: document.querySelector("#answerInput"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  randomButton: document.querySelector("#randomButton"),
  toggleAnswerButton: document.querySelector("#toggleAnswerButton"),
  submitAnswerButton: document.querySelector("#submitAnswerButton"),
  masterButton: document.querySelector("#masterButton"),
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
  missingAnswerDiff: document.querySelector("#missingAnswerDiff"),
  referenceAnswer: document.querySelector("#referenceAnswer"),
  memoryOutline: document.querySelector("#memoryOutline"),
  policyBasis: document.querySelector("#policyBasis"),
  totalCount: document.querySelector("#totalCount"),
  masteredCount: document.querySelector("#masteredCount"),
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
    renderTagFilters();
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
  els.resetProgressButton.addEventListener("click", resetProgress);
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

  document.querySelector(".module-item")?.addEventListener("click", () => {
    state.questionTreeOpen = !state.questionTreeOpen;
    renderQuestionTree();
  });
}

function renderTagFilters() {
  const tags = [ALL, ...new Set(state.questions.flatMap((question) => question.tags || []))];
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
  state.filtered = state.questions.filter((question) => {
    const tagMatch = state.selectedTag === ALL || (question.tags || []).includes(state.selectedTag);
    const haystack = [
      question.question,
      question.reference_answer,
      ...(question.memory_outline || []),
      ...(question.policy_basis || []),
    ]
      .join(" ")
      .toLowerCase();
    return tagMatch && (!searchText || haystack.includes(searchText));
  });

  if (state.activeIndex >= state.filtered.length) {
    state.activeIndex = Math.max(0, state.filtered.length - 1);
  }

  state.showAnswer = false;
  clearAnalysis();
  renderQuestionTree();
  renderActiveQuestion();
  renderProgress();
}

function renderQuestionTree() {
  els.moduleCount.textContent = state.questions.length;
  els.filteredCount.textContent = `${state.filtered.length} 道题`;
  document.querySelector(".module-item")?.classList.toggle("collapsed", !state.questionTreeOpen);

  if (!state.questionTreeOpen) {
    els.questionTree.innerHTML = "";
    els.questionTree.hidden = true;
    return;
  }

  els.questionTree.hidden = false;

  if (!state.filtered.length) {
    els.questionTree.innerHTML = `<div class="empty-state">没有匹配题目</div>`;
    return;
  }

  els.questionTree.innerHTML = state.filtered
    .map((question, index) => {
      const active = index === state.activeIndex ? "active" : "";
      const mark = state.mastered.has(question.id) ? " · 已掌握" : "";
      return `<button class="${active}" type="button" data-index="${index}">${question.id}${mark}<br>${escapeHtml(question.question)}</button>`;
    })
    .join("");

  els.questionTree.querySelectorAll("button[data-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeIndex = Number(button.dataset.index);
      state.showAnswer = false;
      els.answerInput.value = "";
      renderQuestionTree();
      renderActiveQuestion();
    });
  });
}

function renderActiveQuestion() {
  const question = activeQuestion();
  if (!question) {
    els.questionIndex.textContent = "第 0 题";
    els.questionStatus.textContent = "无题目";
    els.questionTitle.textContent = "没有可显示的题目";
    els.activeTags.innerHTML = "";
    els.answerPanel.hidden = true;
    els.analysisPanel.hidden = true;
    renderList(els.memoryOutline, []);
    return;
  }

  els.questionIndex.textContent = `第 ${state.activeIndex + 1} / ${state.filtered.length} 题`;
  els.questionStatus.textContent = state.mastered.has(question.id) ? "已掌握" : "未掌握";
  els.questionTitle.textContent = question.question;
  els.activeTags.innerHTML = (question.tags || [])
    .map((tag) => `<span class="active-tag">${escapeHtml(tag)}</span>`)
    .join("");

  els.answerPanel.hidden = !state.showAnswer;
  els.toggleAnswerButton.textContent = state.showAnswer ? "隐藏答案" : "查看答案";
  els.masterButton.textContent = state.mastered.has(question.id) ? "取消掌握" : "标记掌握";
  els.referenceAnswer.textContent = question.reference_answer || "暂无参考答案";
  renderList(els.memoryOutline, question.memory_outline || []);
  renderList(els.policyBasis, question.policy_basis || []);
}

function renderProgress() {
  const total = state.questions.length;
  const mastered = state.mastered.size;
  const percent = total ? Math.round((mastered / total) * 100) : 0;
  els.totalCount.textContent = total;
  els.masteredCount.textContent = mastered;
  els.progressPercent.textContent = `${percent}%`;
}

function renderList(container, items) {
  container.innerHTML = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>暂无</li>`;
}

function activeQuestion() {
  return state.filtered[state.activeIndex];
}

function moveQuestion(step) {
  if (!state.filtered.length) return;
  state.activeIndex = (state.activeIndex + step + state.filtered.length) % state.filtered.length;
  state.showAnswer = false;
  clearAnalysis();
  els.answerInput.value = "";
  renderQuestionTree();
  renderActiveQuestion();
}

function pickRandomQuestion() {
  if (!state.filtered.length) return;
  state.activeIndex = Math.floor(Math.random() * state.filtered.length);
  state.showAnswer = false;
  clearAnalysis();
  els.answerInput.value = "";
  renderQuestionTree();
  renderActiveQuestion();
}

function toggleAnswer() {
  state.showAnswer = !state.showAnswer;
  renderActiveQuestion();
}

function submitAnswer() {
  const question = activeQuestion();
  if (!question) return;

  const result = compareAnswers(els.answerInput.value, question.reference_answer || "");
  els.matchScore.textContent = `匹配度 ${result.score}%`;
  els.userAnswerDiff.innerHTML = result.userHtml || "<span class=\"muted-text\">尚未输入答案</span>";
  els.missingAnswerDiff.innerHTML = result.missingHtml || "<span class=\"muted-text\">未发现明显缺漏</span>";
  state.analysisVisible = true;
  els.analysisPanel.hidden = false;
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
  if (els.missingAnswerDiff) {
    els.missingAnswerDiff.innerHTML = "";
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
  renderQuestionTree();
  renderActiveQuestion();
  renderProgress();
}

function resetProgress() {
  state.mastered.clear();
  persistProgress();
  renderQuestionTree();
  renderActiveQuestion();
  renderProgress();
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
  const matchedUser = new Set(pairs.map((pair) => pair[0]));
  const matchedReference = new Set(pairs.map((pair) => pair[1]));
  const score = referenceUnits.length
    ? Math.round((pairs.length / referenceUnits.length) * 100)
    : 0;

  return {
    score,
    userHtml: renderDiffHtml(userAnswer, userUnits, matchedUser, "extra"),
    missingHtml: renderDiffHtml(referenceAnswer, referenceUnits, matchedReference, "missing", true),
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
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
