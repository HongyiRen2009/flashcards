  const wordSets = loadWordSets();
  const reviewState = loadReviewState();
  const LEARNING_STEPS_MIN = [1, 10];
  const DAY_MS = 24 * 60 * 60 * 1000;
  let currentSetIndex = 0;
  let currentWord = null;
  let selectedWords = new Set();

  function saveWordSets() {
    localStorage.setItem("flashcardSets", JSON.stringify(wordSets));
  }

  function saveReviewState() {
    localStorage.setItem("flashcardReviewState", JSON.stringify(reviewState));
  }

  function loadReviewState() {
    const saved = JSON.parse(localStorage.getItem("flashcardReviewState"));
    return saved && typeof saved === "object" ? saved : {};
  }

  function loadWordSets() {
    const saved = JSON.parse(localStorage.getItem("flashcardSets"));
    if (!saved || !Array.isArray(saved)) {
      return [{ name: "All", words: [] }];
    }

    const filtered = saved.filter((set) => set.name !== "Missed words");
    if (filtered.length === 0 || filtered[0].name !== "All") {
      filtered.unshift({ name: "All", words: [] });
    }

    filtered[0].words = []; // Reset "All" set
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].name === "All") continue;
      filtered[0].words.push(...filtered[i].words);
    }
    return filtered;
  }

  function copyCurrentWordSetToClipboard() {
    const words = wordSets[currentSetIndex].words.join("\n");
    if (words.length === 0) {
      alert("No words to copy in this set.");
      return;
    }
    navigator.clipboard
      .writeText(words)
      .then(() => alert("Words copied to clipboard!"))
      .catch(() => alert("Failed to copy words."));
  }

  function normalizeWord(value) {
    return value.trim().toLowerCase();
  }

  function getCardState(word) {
    if (!reviewState[word]) {
      reviewState[word] = {
        phase: "new",
        step: 0,
        ease: 2.5,
        interval: 0,
        due: 0,
        lapses: 0,
      };
    }
    return reviewState[word];
  }

  function getDueWords() {
    const now = Date.now();
    return wordSets[currentSetIndex].words.filter((word) => {
      const state = getCardState(word);
      return state.due <= now;
    });
  }

  function getNextDueDelayMs() {
    const words = wordSets[currentSetIndex].words;
    if (words.length === 0) return null;

    let nextDue = Infinity;
    words.forEach((word) => {
      const due = getCardState(word).due;
      if (due < nextDue) nextDue = due;
    });

    const delay = nextDue - Date.now();
    return delay > 0 ? delay : 0;
  }

  function formatDelay(ms) {
    const totalMinutes = Math.ceil(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.ceil(totalMinutes / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.ceil(hours / 24);
    return `${days}d`;
  }

  function hideAnswerAndReviewControls() {
    document.getElementById("pinyinHint").textContent = "";
    document.getElementById("reviewControls").style.display = "none";
  }

  function getPinyinForWord(word) {
    
    try {
      if (window.pinyinPro && typeof window.pinyinPro.pinyin === "function") {
        return window.pinyinPro.pinyin(word, {
          toneType: "symbol",
          type: "array",
          nonZh: "consecutive",
        });
      }
    } catch (err) {
      // Fall through to pattern-based extraction.
    }

    const match = word.match(/\(([^)]+)\)|\[([^\]]+)\]/);
    return match ? match[1] || match[2] : "";
  }

  function showAnswerWithPinyin() {
    if (!currentWord) return;
    const pinyin = getPinyinForWord(currentWord);
    document.getElementById("pinyinHint").textContent = pinyin
      ? `Pinyin: ${Array.isArray(pinyin) ? pinyin.join(" ") : pinyin}`
      : "Pinyin not available for this card.";
    document.getElementById("reviewControls").style.display = "flex";
  }

  function graduateCard(state, daysInterval) {
    state.phase = "review";
    state.step = 0;
    state.interval = Math.max(1, daysInterval);
    state.due = Date.now() + state.interval * DAY_MS;
  }

  function scheduleCard(word, rating) {
    const state = getCardState(word);
    const now = Date.now();

    if (state.phase !== "review") {
      if (rating === "again") {
        state.phase = "learning";
        state.step = 0;
        state.due = now + LEARNING_STEPS_MIN[0] * 60000;
      } else if (rating === "hard") {
        state.phase = "learning";
        state.step = Math.min(state.step, LEARNING_STEPS_MIN.length - 1);
        state.due = now + LEARNING_STEPS_MIN[state.step] * 60000;
      } else if (rating === "good") {
        if (state.step < LEARNING_STEPS_MIN.length - 1) {
          state.phase = "learning";
          state.step += 1;
          state.due = now + LEARNING_STEPS_MIN[state.step] * 60000;
        } else {
          graduateCard(state, 1);
        }
      } else if (rating === "easy") {
        state.ease = Math.max(1.3, state.ease + 0.15);
        graduateCard(state, 4);
      }
    } else {
      if (rating === "again") {
        state.lapses += 1;
        state.ease = Math.max(1.3, state.ease - 0.2);
        state.phase = "learning";
        state.step = 0;
        state.due = now + 10 * 60000;
      } else if (rating === "hard") {
        state.ease = Math.max(1.3, state.ease - 0.15);
        state.interval = Math.max(1, Math.round(state.interval * 1.2));
        state.due = now + state.interval * DAY_MS;
      } else if (rating === "good") {
        state.interval = Math.max(1, Math.round(state.interval * state.ease));
        state.due = now + state.interval * DAY_MS;
      } else if (rating === "easy") {
        state.ease = Math.max(1.3, state.ease + 0.15);
        state.interval = Math.max(
          1,
          Math.round(state.interval * state.ease * 1.3)
        );
        state.due = now + state.interval * DAY_MS;
      }
    }

    saveReviewState();
  }

  function cleanupReviewState() {
    const allWords = new Set(wordSets[0].words);
    Object.keys(reviewState).forEach((word) => {
      if (!allWords.has(word)) {
        delete reviewState[word];
      }
    });
    saveReviewState();
  }

  function rateCurrentCard(rating) {
    if (!currentWord) return;
    scheduleCard(currentWord, rating);
    document.getElementById("Input").value = "";
    hideAnswerAndReviewControls();
    updateDisplay();
  }

  function initializeWordSet(setIndex) {
    currentSetIndex = setIndex;
    selectedWords.clear();
    hideAnswerAndReviewControls();
    updateDisplay();
    updateWordSetButtons();
    updateWordList();
  }

  function updateDisplay() {
    hideAnswerAndReviewControls();
    if (wordSets[currentSetIndex].words.length === 0) {
      document.getElementById("wordDisplay").innerHTML = "No words";
      currentWord = null;
      return;
    }

    const dueWords = getDueWords();
    if (dueWords.length === 0) {
      currentWord = null;
      const delay = getNextDueDelayMs();
      document.getElementById("wordDisplay").innerHTML =
        delay === null
          ? "No words"
          : `No cards due (next in ${formatDelay(delay)})`;
      return;
    }

    currentWord = dueWords[Math.floor(Math.random() * dueWords.length)];
    document.getElementById("wordDisplay").innerHTML = currentWord;
  }

  function showNewSetPrompt() {
    const setName = prompt("Enter name for new word set:");
    if (setName) {
      wordSets.push({ name: setName, words: [] });
      saveWordSets();
      updateWordSetButtons();
      initializeWordSet(wordSets.length - 1);
    }
  }

  function submitNewWord() {
    const wordInput = document.getElementById("wordInput");
    const word = wordInput.value.trim();

    if (currentSetIndex === 0) {
      alert('Add words inside a custom set. "All" is generated automatically.');
      return;
    }

    if (word && !wordSets[currentSetIndex].words.includes(word)) {
      wordSets[currentSetIndex].words.push(word);
      wordSets[0].words.push(word); // Add to "All" set
      getCardState(word);
      saveWordSets();
      saveReviewState();
      updateDisplay();
      wordInput.value = "";

      updateWordList();
    }
  }

  function updateWordSetButtons() {
    const buttonContainer = document.getElementById("wordSetButtons");
    buttonContainer.innerHTML = "";
    wordSets.forEach((set, index) => {
      const container = document.createElement("div");
      container.className = "word-set-container";

      const button = document.createElement("button");
      button.textContent = set.name;
      button.onclick = () => initializeWordSet(index);
      button.className = "button";
      if (index === currentSetIndex) {
        button.classList.add("active");
      }

      container.appendChild(button);

      // Don't add edit/delete buttons for "All" set
      if (index !== 0) {
        const editButton = document.createElement("button");
        editButton.textContent = "✎";
        editButton.className = "button edit-button";
        editButton.onclick = (e) => {
          e.stopPropagation();
          renameWordSet(index);
        };

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "×";
        deleteButton.className = "button delete-button";
        deleteButton.onclick = (e) => {
          e.stopPropagation();
          deleteWordSet(index);
        };

        container.appendChild(editButton);
        container.appendChild(deleteButton);
      }

      buttonContainer.appendChild(container);
    });
  }

  function renameWordSet(index) {
    const newName = prompt(
      "Enter new name for word set:",
      wordSets[index].name
    );
    if (newName && newName.trim()) {
      wordSets[index].name = newName.trim();
      saveWordSets();
      updateWordSetButtons();
    }
  }

  function deleteWordSet(index) {
    if (confirm(`Are you sure you want to delete "${wordSets[index].name}"?`)) {
      if (index === currentSetIndex) {
        currentSetIndex = 0;
      } else if (index < currentSetIndex) {
        currentSetIndex--;
      }
      wordSets.splice(index, 1);
      wordSets[0].words = [];
      for (let i = 1; i < wordSets.length; i++) {
        wordSets[0].words.push(...wordSets[i].words);
      }
      saveWordSets();
      cleanupReviewState();
      initializeWordSet(currentSetIndex);
    }
  }

  function toggleWordList() {
    const container = document.getElementById("wordListContainer");
    document.getElementById("ManageWordsNumberOfWords").innerHTML =
      "Number of Words: " + wordSets[currentSetIndex].words.length;
    const isHidden =
      container.style.display === "none" || !container.style.display;
    container.style.display = isHidden ? "block" : "none";
    if (isHidden) {
      updateWordList();
    }
  }

  function updateWordList() {
    document.getElementById("ManageWordsNumberOfWords").innerHTML =
      "Number of Words: " + wordSets[currentSetIndex].words.length;
    const wordList = document.getElementById("wordList");
    wordList.innerHTML = "";
    wordSets[currentSetIndex].words.forEach((word) => {
      const div = document.createElement("div");
      div.className = `word-list-item ${
        selectedWords.has(word) ? "selected" : ""
      }`;
      div.textContent = word;
      div.onclick = () => toggleWordSelection(word);
      wordList.appendChild(div);
    });
  }

  function toggleWordSelection(word) {
    if (selectedWords.has(word)) {
      selectedWords.delete(word);
    } else {
      selectedWords.add(word);
    }
    updateWordList();
  }

  function deleteSelectedWords() {
    if (selectedWords.size === 0) return;

    if (confirm(`Delete ${selectedWords.size} selected words?`)) {
      wordSets[currentSetIndex].words = wordSets[currentSetIndex].words.filter(
        (word) => !selectedWords.has(word)
      );
      if (currentSetIndex === 0) {
        // Update all other sets if we're in "All" set
        for (let i = 1; i < wordSets.length; i++) {
          wordSets[i].words = wordSets[i].words.filter(
            (word) => !selectedWords.has(word)
          );
        }
      } else {
        // Remove from "All" set as well
        wordSets[0].words = wordSets[0].words.filter(
          (word) => !selectedWords.has(word)
        );
      }
      selectedWords.clear();
      saveWordSets();
      cleanupReviewState();
      updateWordList();
      updateDisplay();
    }
  }

  function dontKnowWord() {
    if (!currentWord) return;
    showAnswerWithPinyin();
    document.getElementById("Input").value = "";
  }

  // Initialize the first word set
  initializeWordSet(0);

  document.onkeydown = function (event) {
    if (
      currentWord &&
      event.key == "Enter" &&
      normalizeWord(document.getElementById("Input").value) ===
        normalizeWord(document.getElementById("wordDisplay").innerHTML)
    ) {
      rateCurrentCard("good");
    } else if (event.key == "r") {
      updateDisplay();
    }
  };

  // Add this to handle Enter key in the word input box
  document
    .getElementById("wordInput")
    .addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        submitNewWord();
      }
    });
