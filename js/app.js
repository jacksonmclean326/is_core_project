(() => {
  const byId = (id) => document.getElementById(id);
  let selectedCareer = careers[0],
    quizIndex = 0,
    quizScores = {},
    interviewQuestions = [],
    interviewIndex = 0;
  const tree = byId("career-tree");
  const showCareer = (id) => {
    selectedCareer = careers.find((c) => c.id === id) || careers[0];
    document
      .querySelectorAll(".tree-role")
      .forEach((b) => b.classList.toggle("active", b.dataset.id === id));
    byId("career-detail").innerHTML =
      `<div class="detail-top"><div><p class="eyebrow">${selectedCareer.accent} / ${selectedCareer.category}</p><h3>${selectedCareer.name}</h3></div></div><p class="detail-copy">${selectedCareer.description}</p><div class="tag-list">${selectedCareer.tools.map((tool) => `<span class="tag">${tool}</span>`).join("")}</div><div class="detail-columns"><div><h4>What you will do</h4><ul>${selectedCareer.dayToDay.map((x) => `<li>${x}</li>`).join("")}</ul></div><div><h4>Intern should know</h4><ul>${selectedCareer.expectations.map((x) => `<li>${x}</li>`).join("")}</ul></div></div><div class="detail-foot"><span class="detail-copy">${selectedCareer.salary}</span><a class="button button-accent" href="interview.html?career=${selectedCareer.id}">Practice interview <span>-></span></a></div>`;
  };
  if (tree)
    careers.forEach((career) => {
      if (!tree.querySelector(`[data-category="${career.category}"]`)) {
        const heading = document.createElement("div");
        heading.className = "tree-category";
        heading.dataset.category = career.category;
        heading.textContent = career.category;
        tree.append(heading);
      }
      const button = document.createElement("button");
      button.className = "tree-role";
      button.dataset.id = career.id;
      button.textContent = career.name;
      button.addEventListener("click", () => showCareer(career.id));
      tree.append(button);
    });
  if (tree) showCareer(selectedCareer.id);
  const select = byId("interview-career");
  if (select) {
    careers.forEach((c) => {
      const option = document.createElement("option");
      option.value = c.id;
      option.textContent = c.name;
      select.append(option);
    });
    // Support pre-selecting career from URL param
    const urlParams = new URLSearchParams(window.location.search);
    const careerParam = urlParams.get("career");
    if (careerParam && careers.some((c) => c.id === careerParam)) {
      select.value = careerParam;
    }
  }
  function renderQuiz() {
    const q = quizQuestions[quizIndex];
    byId("quiz-progress").textContent =
      `Question ${quizIndex + 1} / ${quizQuestions.length}`;
    byId("quiz-question").textContent = q.prompt;
    byId("quiz-options").innerHTML = q.options
      .map(
        (o) =>
          `<label class="quiz-option"><input type="radio" name="quiz-answer" value="${o[1]}" required>${o[0]}</label>`,
      )
      .join("");
  }
  if (byId("quiz-form")) renderQuiz();
  if (byId("quiz-form"))
    byId("quiz-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const value = new FormData(e.target).get("quiz-answer");
      quizScores[value] = (quizScores[value] || 0) + 1;
      quizIndex++;
      if (quizIndex < quizQuestions.length) renderQuiz();
      else {
        const ranked = careers
          .map((c) => ({
            career: c,
            score: Object.entries(c.matches).reduce(
              (n, [key, weight]) => n + (quizScores[key] || 0) * weight,
              0,
            ),
          }))
          .sort((a, b) => b.score - a.score);
        byId("quiz-form").hidden = true;
        const results = byId("quiz-results");
        results.hidden = false;
        results.innerHTML = `<p class="eyebrow">Your top matches</p><h3>Follow the signal.</h3>${ranked
          .slice(0, 3)
          .map(
            (r, i) =>
              `<div class="match"><a href="#explore" data-match="${r.career.id}">${i + 1}. ${r.career.name}</a><span class="match-score">${Math.min(96, 68 + r.score * 3)}%</span></div>`,
          )
          .join(
            "",
          )}<p class="detail-copy">Your answers point toward work that values ${ranked[0].career.skills.slice(0, 2).join(" and ")}.</p>`;
        results
          .querySelectorAll("[data-match]")
          .forEach((a) =>
            a.addEventListener("click", () => showCareer(a.dataset.match)),
          );
      }
    });

  function getInterviewQuestions(roleId, difficulty) {
    const roleQuestions = questionBank[roleId] || questionBank["software-developer"];
    const difficultyOrder = {
      internship: () =>
        [...roleQuestions.filter((q) => q.type === "behavioral"), ...roleQuestions.filter((q) => q.type === "technical")].slice(0, 3),
      entry: () => [...roleQuestions].slice(0, 5),
      challenge: () =>
        [...roleQuestions.filter((q) => q.type === "technical"), ...roleQuestions.filter((q) => q.type === "behavioral")].slice(0, 5),
    };

    return (difficultyOrder[difficulty] || difficultyOrder.entry)();
  }

  function startInterview() {
    const roleId = select.value || "software-developer";
    const difficulty = byId("interview-difficulty")?.value || "entry";
    interviewQuestions = getInterviewQuestions(roleId, difficulty);
    interviewIndex = 0;
    byId("interview-setup").hidden = true;
    byId("interview-workspace").hidden = false;
    renderQuestion();
  }

  function renderQuestion() {
    const q = interviewQuestions[interviewIndex];
    byId("interview-progress").textContent =
      `Question ${interviewIndex + 1} / ${interviewQuestions.length}`;
    byId("interview-question").textContent = q.prompt;
    byId("answer-input").value = "";
    byId("feedback-panel").hidden = true;

    const nextBtn = byId("next-question");
    if (nextBtn) {
      if (interviewIndex === interviewQuestions.length - 1) {
        nextBtn.innerHTML = `Finish interview <span>-></span>`;
      } else {
        nextBtn.innerHTML = `Next question <span>-></span>`;
      }
    }
  }

  if (byId("start-interview"))
    byId("start-interview").addEventListener("click", startInterview);

  if (byId("try-again"))
    byId("try-again").addEventListener("click", () => {
      byId("interview-setup").hidden = false;
      byId("interview-workspace").hidden = true;
    });

  if (byId("next-question")) {
    byId("next-question").addEventListener("click", () => {
      if (interviewIndex < interviewQuestions.length - 1) {
        interviewIndex++;
        renderQuestion();
        window.scrollTo({ top: byId("interview-workspace").offsetTop - 100, behavior: "smooth" });
      } else {
        // Finished interview
        byId("interview-setup").hidden = false;
        byId("interview-workspace").hidden = true;
        alert("Great job completing your mock interview! Choose another role to practice again.");
      }
    });
  }

  if (byId("answer-form"))
    byId("answer-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = interviewQuestions[interviewIndex],
        rawText = byId("answer-input").value,
        answer = rawText.toLowerCase().trim(),
        words = answer ? answer.split(/\s+/).length : 0,
        hits = q.lookFor.filter((term) => answer.includes(term.toLowerCase())).length,
        totalKeywords = q.lookFor.length;

      // Dynamic score from 1 to 10 based on length & keyword hits
      let score = 2; // base score for attempting
      if (words >= 10) score += 1;
      if (words >= 25) score += 2;
      if (words >= 50) score += 1;

      // Add points for matching target concepts/keywords
      if (totalKeywords > 0) {
        const hitRatio = hits / totalKeywords;
        score += Math.round(hitRatio * 4);
      }

      // Clamp between 1 and 10
      score = Math.min(10, Math.max(1, score));

      byId("feedback-score").textContent = score;
      byId("feedback-good").textContent = hits > 0
        ? `Great job! You explicitly mentioned key concept(s): ${q.lookFor.filter((term) => answer.includes(term.toLowerCase())).join(", ")}.`
        : words >= 20
        ? "You provided a structured response with good detail."
        : "You made an initial attempt at answering the prompt.";

      const missingKeywords = q.lookFor.filter((term) => !answer.includes(term.toLowerCase()));
      byId("feedback-missing").textContent = missingKeywords.length > 0
        ? `Consider incorporating terms like ${missingKeywords.slice(0, 2).join(" and ")} to demonstrate technical depth.`
        : "Your answer covered all key target concepts! To improve further, elaborate with a metrics-driven outcome.";

      byId("feedback-strong").textContent = q.strongAnswer;
      byId("feedback-followup").textContent = q.followUp;
      byId("feedback-panel").hidden = false;

      // Scroll smoothly to feedback
      setTimeout(() => {
        byId("feedback-panel").scroll_into_view_if_needed
          ? byId("feedback-panel").scroll_into_view_if_needed()
          : window.scrollTo({ top: byId("feedback-panel").offsetTop - 80, behavior: "smooth" });
      }, 50);
    });
})();