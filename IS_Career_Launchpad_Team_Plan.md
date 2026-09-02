# IS Career Launchpad — Team Plan

## 🎯 Core Idea

Build the site around one simple journey:

**Explore → Choose → Prepare → Practice**

The goal is to help an incoming BYU IS student:
1. Discover IS career paths.
2. Figure out which paths fit their interests.
3. Understand what they need to become competitive.
4. Practice realistic interviews.

The case requires **both** a career discovery module and an interview prep module, with at least four career paths covered. The rubric gives each module **30%** of the grade.

---

# 1. Career Discovery Module

## 🌐 Main Concept: Interactive Career Skill Tree

Instead of a normal list of careers, make the homepage an interactive **career map / skill tree**.

Example:

```text
                    IS CAREER LAUNCHPAD
                             │
              ┌──────────────┼──────────────┐
              │              │              │
           BUILDING         DATA          PEOPLE
              │              │              │
        Software Dev    Data Analyst    Project Manager
        Cloud           Data Science    Business Analyst
        Cybersecurity   ...             Product Manager
```

Users click nodes to progressively reveal more information.

### Career → Skills → Preparation → Interview

For example:

```text
Data
 │
 ├── Data Analyst
 │     ├── SQL
 │     ├── Excel
 │     ├── Tableau
 │     └── Statistics
 │
 └── Data Scientist
       ├── Python
       ├── SQL
       ├── Statistics
       └── Machine Learning
```

## 📋 Career Information

Every career should use the same structure:

### Data Analyst

**What you'll actually do**
- Analyze datasets
- Build dashboards
- Present findings
- Work with business stakeholders

**Typical tools**
`SQL` `Excel` `Python` `Tableau`

**What an intern should know**
- Basic SQL
- Excel
- Data visualization
- Basic statistics

**What makes you competitive**
- Portfolio project
- Relevant coursework
- Communication
- Internship experience

**Salary / Growth**
- Entry level
- Mid-level
- Senior

**→ Practice this career's interview**

This directly addresses the case requirements:
- Day-to-day responsibilities
- Technical skills/tools
- Entry-level expectations
- Salary/growth
- What makes a strong candidate

---

# 2. "Find My Path" Quiz

## 🧭 Purpose

Don't make an AI chatbot the centerpiece. A simple interactive questionnaire is faster to build and more reliable.

### Example Questions

**What sounds most interesting?**

- 💻 Building things
- 📊 Finding patterns in data
- 🔐 Protecting systems
- 🤝 Solving business problems
- 🎨 Designing experiences
- ☁️ Working with infrastructure

**How much coding do you want to do?**

`A LOT ───── SOME ───── VERY LITTLE`

**What kind of work sounds best?**

`Independent ───────── Collaborative`

**What sounds most satisfying?**

- Solving puzzles
- Helping people
- Creating things
- Analyzing information
- Leading projects

## 🎯 Results

Example:

> **Your top matches**
>
> **1. Business Analyst — 87%**
>
> **2. Systems Analyst — 81%**
>
> **3. Product Manager — 74%**
>
> **Why we think these fit you:**  
> You prefer collaborative problem-solving and moderate technical work.

Each result should link directly to that career's page/panel.

---

# 3. Interview Prep Module

## 🎤 Main Concept: Mock Interview Simulator

Make it feel like a real interview rather than a list of questions.

### Step 1 — Select Career

- Software Developer
- Data Analyst
- Cybersecurity Analyst
- Business / Systems Analyst

### Step 2 — Select Difficulty

- 🟢 Internship
- 🟡 Entry Level
- 🔴 Challenge

### Step 3 — Interview

```text
Question 1 of 5

You're given a dataset with thousands of customer
transactions. How would you determine whether there
are unusual or suspicious transactions?

[ Type your answer... ]

[Submit Answer]
```

### Step 4 — Feedback

Example:

**⭐ Overall: 7/10**

**What you did well**
- Identified the importance of looking for patterns.
- Mentioned comparing transactions with historical behavior.

**What you're missing**
- Didn't explain how you would identify anomalies.
- Could mention SQL, statistical thresholds, or visualization.

**A stronger answer could include**
> Explain the approach an effective candidate would take.

**Interviewer follow-up**

> "What tools would you use to do that?"

[Try Again]

---

# 4. Question Bank

Don't rely entirely on AI-generated questions.

Create a curated question bank for each career.

## 💻 Software Developer

### Behavioral
- Tell me about a difficult bug you had to solve.
- Tell me about a time you had to learn a new technology quickly.

### Technical
- Explain the difference between a stack and a queue.
- What is an API?
- How would you debug an application that suddenly became slow?

---

## 📊 Data Analyst

### Behavioral
- Tell me about a time you used data to make a decision.

### Technical
- Explain the difference between `INNER JOIN` and `LEFT JOIN`.
- How would you handle missing data?
- What makes a dashboard effective?

---

## 🔐 Cybersecurity Analyst

### Behavioral
- Tell me about a time you solved a problem with incomplete information.

### Technical
- What's the difference between authentication and authorization?
- What would you investigate if you noticed unusual network traffic?
- Explain the purpose of a firewall.

---

## 📈 Business / Systems Analyst

### Behavioral
- Tell me about a time you had to explain something technical to a nontechnical person.
- Tell me about a time you had conflicting stakeholder requirements.

### Technical
- What's the difference between functional and non-functional requirements?
- How would you gather requirements for a new system?
- How would you model a business process?

---

# 5. Connect the Two Modules

This is one of the most important design ideas.

Don't make Career Discovery and Interview Prep feel like separate pages.

The career path should naturally lead into preparation.

```text
                  DATA ANALYST
                       │
             ┌─────────┼─────────┐
             │         │         │
           Skills    Build     Learn
             │         │         │
            SQL     Portfolio   Courses
             │
             └─────────┬─────────┘
                       │
                       ▼
               PRACTICE INTERVIEW
```

At the bottom of every career profile:

> **Interested in this career?**
>
> See what skills you need →  
> Practice an interview →

This creates the complete student journey:

**Explore → Choose → Prepare → Practice**

---

# 6. Team of Four — Suggested Delegation

Avoid simply assigning one webpage to each person.

Instead, give everyone a **primary responsibility** while having everyone contribute to the overall product.

## 👤 Person 1 — Career Discovery / Research Lead

Responsible for:
- Career tree structure
- Career research
- Career information
- Sources/citations
- Career matching quiz

---

## 👤 Person 2 — Interview Prep Lead

Responsible for:
- Question bank
- Behavioral questions
- Technical questions
- Answer examples
- Feedback framework

---

## 👤 Person 3 — Frontend / UX Lead

Responsible for:
- Overall visual design
- Navigation
- Career tree visualization
- Career cards/panels
- Responsive layout

---

## 👤 Person 4 — Application / Integration Lead

Responsible for:
- Connecting the modules
- Quiz logic
- Interview logic
- Progress/state tracking
- Making everything work together

### Important

Everyone should contribute some code/content outside their primary area.

The case evaluates individual contribution, teamwork, organization, quality standards, and relevant skills.

---

# 7. Suggested Git Structure

Keep the project simple.

```text
/
├── index.html
├── careers.html
├── interview.html
│
├── css/
│   └── style.css
│
├── js/
│   ├── careers.js
│   ├── quiz.js
│   ├── interview.js
│   └── data.js
│
├── data/
│   ├── careers.json
│   └── questions.json
│
└── assets/
    └── ...
```

## 💡 Use Data Files

Instead of hardcoding every career into HTML:

```javascript
{
    name: "Data Analyst",
    category: "Data",
    description: "...",
    skills: ["SQL", "Excel", "Tableau"],
    dayToDay: [...],
    interviewQuestions: [...]
}
```

Then JavaScript can generate the UI dynamically.

This makes it much easier to add a fifth or sixth career later.

---

# 8. MVP — What We Actually Need

Because the deadline is close, prioritize functionality over fancy extras.

## 🔴 MUST HAVE

### Career Discovery
- [ ] Interactive career tree
- [ ] At least 4 career paths
- [ ] Detailed career information
- [ ] Career matching questionnaire
- [ ] Sources for research/statistics

### Interview Prep
- [ ] At least 4 careers
- [ ] Behavioral questions
- [ ] Technical questions
- [ ] User submits an answer
- [ ] Feedback is provided
- [ ] Strong-answer example
- [ ] Interview questions are role-specific

### Overall
- [ ] Both modules work
- [ ] Easy navigation between modules
- [ ] Clean UI
- [ ] Test with someone outside the team

---

# 9. 🟡 Nice-to-Have Features

Only add these after the MVP works:

- AI-generated interview feedback
- Progress tracking
- Animations
- AI chatbot
- Login/accounts
- Database
- Advanced visualizations
- Personalized learning plan

**Do not sacrifice the core modules to add these.**

A polished:

> **Interactive career tree → personalized recommendation → realistic mock interview**

is better than a half-finished AI chatbot with incomplete career information.

---

# 10. Design Philosophy

Ask this question about every feature:

> **"If a BYU IS junior used this for 30 minutes the night before an interview, would they be meaningfully better prepared?"**

If **yes** → build it.

If **no** → probably cut it.

The ultimate user journey should feel like:

```text
┌──────────────┐
│  WHO AM I?   │
│ Find My Path │
└──────┬───────┘
       ▼
┌──────────────┐
│ WHAT EXISTS? │
│ Career Tree  │
└──────┬───────┘
       ▼
┌──────────────┐
│ WHAT DO I    │
│ NEED?        │
│ Skills +     │
│ Preparation  │
└──────┬───────┘
       ▼
┌──────────────┐
│ CAN I GET    │
│ THE JOB?     │
│ Mock         │
│ Interview    │
└──────┬───────┘
       ▼
┌──────────────┐
│ READY TO     │
│ APPLY        │
└──────────────┘
```

## 🏆 One-Sentence Pitch

> **IS Career Launchpad turns career exploration into a guided journey: discover the IS path that fits you, understand what it takes to get there, and practice the interview before you face the real thing.**
