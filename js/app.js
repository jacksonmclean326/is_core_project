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

  function startInterview() {
    const questions = questionBank[select.value] || questionBank["software-developer"];
    interviewQuestions = [...questions].slice(0, 5);
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

  // Voice Input, Camera & Video Recording, Timestamp Playback Feature
  let mediaStream = null,
    mediaRecorder = null,
    recordedChunks = [],
    recordingTimerInterval = null,
    recordingStartTime = 0,
    recordedVideoBlob = null,
    recordedVideoUrl = null,
    speechRecognition = null,
    isListening = false,
    isRecordingVideo = false,
    recordedTimestamps = [];

  function finalizeRecordedPlayback() {
    if (!recordedVideoBlob || !videoPlayer) return;

    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
    }

    recordedVideoUrl = URL.createObjectURL(recordedVideoBlob);
    videoPlayer.src = recordedVideoUrl;
    videoPlayer.load();
    if (playbackContainer) playbackContainer.hidden = false;
  }

  const textModeBtn = byId("mode-text-btn"),
    voiceModeBtn = byId("mode-voice-btn"),
    voiceVideoPanel = byId("voice-video-panel"),
    toggleMicBtn = byId("toggle-mic-btn"),
    toggleCamBtn = byId("toggle-cam-btn"),
    recordVideoBtn = byId("record-video-btn"),
    micBadge = byId("mic-status-badge"),
    camBadge = byId("cam-status-badge"),
    timerDisplay = byId("recording-timer"),
    webcamPreview = byId("webcam-preview"),
    camContainer = byId("camera-preview-container"),
    speechIndicator = byId("speech-live-indicator"),
    playbackContainer = byId("video-playback-container"),
    videoPlayer = byId("response-video-player"),
    timestampList = byId("timestamp-list");

  // Mode Switching
  if (textModeBtn && voiceModeBtn) {
    textModeBtn.addEventListener("click", () => {
      textModeBtn.classList.add("active");
      voiceModeBtn.classList.remove("active");
      if (voiceVideoPanel) voiceVideoPanel.hidden = true;
    });

    voiceModeBtn.addEventListener("click", () => {
      voiceModeBtn.classList.add("active");
      textModeBtn.classList.remove("active");
      if (voiceVideoPanel) voiceVideoPanel.hidden = false;
    });
  }

  // Web Speech API initialization
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  function initSpeechRecognition() {
    if (!SpeechRecognition) {
      console.warn("Speech recognition is not supported in this browser.");
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isListening = true;
      if (micBadge) {
        micBadge.textContent = "Mic On (Listening)";
        micBadge.className = "status-badge active";
      }
      if (toggleMicBtn) toggleMicBtn.textContent = "Stop Voice Input";
      if (speechIndicator) speechIndicator.hidden = false;
    };

    recognition.onend = () => {
      isListening = false;
      if (micBadge) {
        micBadge.textContent = "Mic Off";
        micBadge.className = "status-badge idle";
      }
      if (toggleMicBtn) toggleMicBtn.textContent = "Start Voice Input";
      if (speechIndicator) speechIndicator.hidden = true;
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        const input = byId("answer-input");
        if (input) {
          const currentVal = input.value;
          input.value = currentVal ? `${currentVal} ${finalTranscript}` : finalTranscript;
        }

        // Add automatic timestamp marker if currently recording video
        if (isRecordingVideo) {
          const elapsedSecs = Math.floor((Date.now() - recordingStartTime) / 1000);
          const mins = String(Math.floor(elapsedSecs / 60)).padStart(2, "0");
          const secs = String(elapsedSecs % 60).padStart(2, "0");
          const timeStr = `${mins}:${secs}`;
          recordedTimestamps.push({
            time: elapsedSecs,
            timeDisplay: timeStr,
            note: `Spoke: "${finalTranscript.trim().slice(0, 45)}${finalTranscript.trim().length > 45 ? "..." : ""}"`,
          });
        }
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
      stopSpeechRecognition();
    };

    recognition.onend = () => {
      isListening = false;
      if (micBadge) {
        micBadge.textContent = "Mic Off";
        micBadge.className = "status-badge idle";
      }
      if (toggleMicBtn) toggleMicBtn.textContent = "🎙️ Start Voice Input";
      if (speechIndicator) speechIndicator.hidden = true;
    };

    return recognition;
  }

  function startSpeechRecognition() {
    if (!speechRecognition) speechRecognition = initSpeechRecognition();
    if (speechRecognition && !isListening) {
      try {
        speechRecognition.start();
      } catch (err) {
        console.warn("Failed to start speech recognition", err);
      }
    }
  }

  function stopSpeechRecognition() {
    if (speechRecognition && isListening) {
      try {
        speechRecognition.stop();
      } catch (err) {
        console.warn("Failed to stop speech recognition", err);
      }
    }
  }

  if (toggleMicBtn) {
    toggleMicBtn.addEventListener("click", () => {
      if (isListening) {
        stopSpeechRecognition();
      } else {
        startSpeechRecognition();
      }
    });
  }

  // Camera & Video MediaRecorder logic
  async function toggleCamera() {
    if (mediaStream) {
      // Turn off camera
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
      if (webcamPreview) webcamPreview.srcObject = null;
      if (camContainer) camContainer.hidden = true;
      if (camBadge) {
        camBadge.textContent = "Camera Off";
        camBadge.className = "status-badge idle";
      }
      if (toggleCamBtn) toggleCamBtn.textContent = "Turn On Camera";
      if (recordVideoBtn) recordVideoBtn.disabled = true;
    } else {
      // Request camera and mic stream
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true,
        });
        if (webcamPreview) {
          webcamPreview.srcObject = mediaStream;
          webcamPreview.play().catch(() => {});
        }
        if (camContainer) camContainer.hidden = false;
        if (camBadge) {
          camBadge.textContent = "Camera On";
          camBadge.className = "status-badge active";
        }
        if (toggleCamBtn) toggleCamBtn.textContent = "Turn Off Camera";
        if (recordVideoBtn) recordVideoBtn.disabled = false;
      } catch (err) {
        console.warn("Camera access failed or unavailable:", err);
        // Fallback canvas video stream with audio oscillator for environments without hardware camera
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");
        let hue = 0;

        const drawLoop = setInterval(() => {
          if (!mediaStream) { clearInterval(drawLoop); return; }
          ctx.fillStyle = `hsl(${hue % 360}, 50%, 20%)`;
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = "#c8f05a";
          ctx.font = "bold 22px 'Space Grotesk', sans-serif";
          ctx.fillText("MOCK INTERVIEW VIDEO RECORDING", 120, 160);
          ctx.fillStyle = "#ffffff";
          ctx.font = "16px 'DM Mono', monospace";
          ctx.fillText(`LIVE FEED ACTIVE • ${new Date().toLocaleTimeString()}`, 160, 210);
          hue += 3;
        }, 50);

        const canvasStream = canvas.captureStream(30);

        // Add silent audio track if audioContext is available
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const dst = audioCtx.createMediaStreamDestination();
          osc.connect(dst);
          osc.start();
          dst.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        } catch (e) {
          console.warn("Audio Context fallback error:", e);
        }

        mediaStream = canvasStream;
        if (webcamPreview) {
          webcamPreview.srcObject = mediaStream;
          webcamPreview.play().catch(() => {});
        }
        if (camContainer) camContainer.hidden = false;
        if (camBadge) {
          camBadge.textContent = "Camera Ready";
          camBadge.className = "status-badge active";
        }
        if (toggleCamBtn) toggleCamBtn.textContent = "Turn Off Camera";
        if (recordVideoBtn) recordVideoBtn.disabled = false;
      }
    }
  }

  if (toggleCamBtn) {
    toggleCamBtn.addEventListener("click", toggleCamera);
  }

  function startVideoRecording() {
    recordedChunks = [];
    recordedTimestamps = [];
    recordingStartTime = Date.now();
    isRecordingVideo = true;

    if (timerDisplay) {
      timerDisplay.hidden = false;
      timerDisplay.textContent = "00:00";
    }

    recordingTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      if (timerDisplay) timerDisplay.textContent = `${mins}:${secs}`;
    }, 1000);

    // Initial timestamp entry
    recordedTimestamps.push({
      time: 0,
      timeDisplay: "00:00",
      note: "Started response delivery",
    });

    if (mediaStream && typeof MediaRecorder !== "undefined") {
      try {
        const candidateTypes = [
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8",
          "video/webm",
          "video/mp4",
        ];

        let selectedMimeType = candidateTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";

        mediaRecorder = selectedMimeType
          ? new MediaRecorder(mediaStream, { mimeType: selectedMimeType })
          : new MediaRecorder(mediaStream);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const finalType = selectedMimeType || "video/webm";
          recordedVideoBlob = new Blob(recordedChunks, { type: finalType });

          if (recordedVideoBlob.size > 0) {
            finalizeRecordedPlayback();
          }
        };

        mediaRecorder.start(250); // chunk timeslice every 250ms
      } catch (e) {
        console.warn("MediaRecorder failed:", e);
      }
    }

    if (camBadge) {
      camBadge.textContent = "Recording...";
      camBadge.className = "status-badge recording";
    }
    if (recordVideoBtn) {
      recordVideoBtn.textContent = "Stop Video Recording";
      recordVideoBtn.className = "button button-accent media-btn";
    }

    // Auto-start speech recognition if not already on
    startSpeechRecognition();
  }

  function stopVideoRecording() {
    isRecordingVideo = false;
    clearInterval(recordingTimerInterval);

    // End timestamp entry
    const totalElapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = String(Math.floor(totalElapsed / 60)).padStart(2, "0");
    const secs = String(totalElapsed % 60).padStart(2, "0");
    recordedTimestamps.push({
      time: totalElapsed,
      timeDisplay: `${mins}:${secs}`,
      note: "Finished response delivery",
    });

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

    if (!recordedVideoBlob && recordedChunks.length > 0) {
      recordedVideoBlob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "video/webm" });
      finalizeRecordedPlayback();
    }

    if (camBadge) {
      camBadge.textContent = mediaStream ? "Camera On" : "Camera Off";
      camBadge.className = mediaStream ? "status-badge active" : "status-badge idle";
    }
    if (recordVideoBtn) {
      recordVideoBtn.textContent = "Start Video Recording";
      recordVideoBtn.className = "button button-dark media-btn";
    }
  }

  if (recordVideoBtn) {
    recordVideoBtn.addEventListener("click", () => {
      if (isRecordingVideo) {
        stopVideoRecording();
      } else {
        startVideoRecording();
      }
    });
  }

  function resetMediaState() {
    if (isListening) stopSpeechRecognition();
    if (isRecordingVideo) stopVideoRecording();
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      recordedVideoUrl = null;
    }
    recordedVideoBlob = null;
    recordedTimestamps = [];
    if (playbackContainer) playbackContainer.hidden = true;
    if (videoPlayer) videoPlayer.src = "";
  }

  if (byId("start-interview"))
    byId("start-interview").addEventListener("click", startInterview);

  if (byId("try-again"))
    byId("try-again").addEventListener("click", () => {
      resetMediaState();
      byId("interview-setup").hidden = false;
      byId("interview-workspace").hidden = true;
    });

  if (byId("next-question")) {
    byId("next-question").addEventListener("click", () => {
      resetMediaState();
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
      if (isRecordingVideo) stopVideoRecording();
      if (isListening) stopSpeechRecognition();

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

      // Render Video Playback & Timestamp Analysis only when a recording exists
      if (playbackContainer && timestampList) {
        if (!recordedVideoBlob) {
          playbackContainer.hidden = true;
          timestampList.innerHTML = "";
        } else {
          const items = [...recordedTimestamps];

          // Ensure key feedback markers are present as timestamp milestones
          if (items.length === 0) {
            items.push({ time: 0, timeDisplay: "00:00", note: "Opening thoughts & introduction" });
            items.push({ time: 10, timeDisplay: "00:10", note: "Core explanation & technical detail" });
            items.push({ time: 25, timeDisplay: "00:25", note: "Conclusion & outcome" });
          }

          // Add coaching callouts at relevant timestamps
          if (hits > 0) {
            items.push({
              time: 12,
              timeDisplay: "00:12",
              note: `💡 Good inclusion of key concept: "${q.lookFor.find((t) => answer.includes(t.toLowerCase())) || "keyword"}"`,
            });
          }
          if (missingKeywords.length > 0) {
            items.push({
              time: 20,
              timeDisplay: "00:20",
              note: `🎯 Opportunity to add technical depth: mention "${missingKeywords[0]}"`,
            });
          }

          // Sort items chronologically
          items.sort((a, b) => a.time - b.time);

          timestampList.innerHTML = items
            .map(
              (item) => `
            <li class="timestamp-item" data-time="${item.time}">
              <span class="timestamp-badge">${item.timeDisplay}</span>
              <span class="timestamp-note">${item.note}</span>
            </li>
          `,
            )
            .join("");

          // Attach click listener to jump video player to timestamp
          timestampList.querySelectorAll(".timestamp-item").forEach((el) => {
            el.addEventListener("click", () => {
              const time = parseFloat(el.dataset.time);
              if (videoPlayer) {
                videoPlayer.currentTime = time;
                videoPlayer.play().catch(() => {});
              }
            });
          });

          playbackContainer.hidden = false;
        }
      }

      byId("feedback-panel").hidden = false;

      // Scroll smoothly to feedback
      setTimeout(() => {
        byId("feedback-panel").scroll_into_view_if_needed
          ? byId("feedback-panel").scroll_into_view_if_needed()
          : window.scrollTo({ top: byId("feedback-panel").offsetTop - 80, behavior: "smooth" });
      }, 50);
    });
})();