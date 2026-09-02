const careers = [
  {
    id: "software-developer",
    name: "Software Developer",
    category: "Building",
    accent: "BUILD",
    description:
      "Turn messy problems into products people can use. You will translate ideas into reliable, maintainable software.",
    dayToDay: [
      "Build and test features",
      "Debug applications and improve performance",
      "Collaborate with designers and analysts",
    ],
    tools: ["JavaScript", "Python", "Git", "APIs"],
    expectations: [
      "One programming language",
      "Data structures basics",
      "Git and debugging",
      "A small deployed project",
    ],
    competitive: [
      "A clear portfolio",
      "Curiosity and learning speed",
      "Readable code",
      "Team communication",
    ],
    salary: "Entry $72k / Mid $102k / Senior $137k",
    skills: ["problem solving", "coding", "creating", "independent"],
    matches: { build: 5, data: 1, protect: 1, solve: 2, design: 2, cloud: 3 },
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    category: "Data",
    accent: "DATA",
    description:
      "Find the signal in the noise, then make it useful. Analysts connect evidence to decisions across a business.",
    dayToDay: [
      "Clean and explore datasets",
      "Build dashboards and recurring reports",
      "Present insights to stakeholders",
    ],
    tools: ["SQL", "Excel", "Tableau", "Python"],
    expectations: [
      "SQL joins and aggregations",
      "Basic statistics",
      "Data visualization",
      "Clear written analysis",
    ],
    competitive: [
      "A portfolio case study",
      "Business curiosity",
      "Strong presentation",
      "Comfort with ambiguity",
    ],
    salary: "Entry $60k / Mid $82k / Senior $108k",
    skills: ["patterns", "analyzing", "collaborative", "helping"],
    matches: { build: 1, data: 5, protect: 1, solve: 3, design: 1, cloud: 1 },
  },
  {
    id: "cybersecurity-analyst",
    name: "Cybersecurity Analyst",
    category: "Protecting",
    accent: "SECURITY",
    description:
      "Keep systems trustworthy. You investigate signals, reduce risk, and help teams respond when the unexpected happens.",
    dayToDay: [
      "Monitor alerts and investigate incidents",
      "Review access, logs, and vulnerabilities",
      "Document findings and recommend controls",
    ],
    tools: ["Wireshark", "SIEM", "Linux", "Python"],
    expectations: [
      "Networking fundamentals",
      "Authentication concepts",
      "Log analysis",
      "Security mindset",
    ],
    competitive: [
      "Hands-on labs",
      "Security certifications",
      "Calm investigation",
      "Precise documentation",
    ],
    salary: "Entry $68k / Mid $96k / Senior $130k",
    skills: ["puzzles", "protecting", "independent", "patterns"],
    matches: { build: 1, data: 2, protect: 5, solve: 2, design: 0, cloud: 2 },
  },
  {
    id: "business-systems-analyst",
    name: "Business / Systems Analyst",
    category: "Solving",
    accent: "SYSTEMS",
    description:
      "Make work make more sense. Analysts bridge people, process, and technology to turn needs into workable systems.",
    dayToDay: [
      "Interview stakeholders and map processes",
      "Write requirements and acceptance criteria",
      "Coordinate testing and implementation",
    ],
    tools: ["SQL", "Jira", "BPMN", "Excel"],
    expectations: [
      "Requirements gathering",
      "Process modeling",
      "Clear documentation",
      "Facilitation basics",
    ],
    competitive: [
      "Empathy for users",
      "A process portfolio",
      "Structured thinking",
      "Confident communication",
    ],
    salary: "Entry $64k / Mid $88k / Senior $115k",
    skills: ["people", "solving", "collaborative", "leading"],
    matches: { build: 2, data: 2, protect: 1, solve: 5, design: 2, cloud: 1 },
  },
];
const quizQuestions = [
  {
    prompt: "What kind of problem makes you lose track of time?",
    options: [
      ["Building something from scratch", "build"],
      ["Finding a pattern nobody noticed", "data"],
      ["Tracking down what went wrong", "protect"],
      ["Making a messy process work", "solve"],
    ],
  },
  {
    prompt: "Your ideal workday has more...",
    options: [
      ["Code, prototypes, and creating", "build"],
      ["Charts, evidence, and analysis", "data"],
      ["Logs, puzzles, and investigation", "protect"],
      ["Conversations, maps, and decisions", "solve"],
    ],
  },
  {
    prompt: "How much coding sounds right?",
    options: [
      ["A lot", "build"],
      ["Some, alongside analysis", "data"],
      ["Some, alongside systems work", "protect"],
      ["Very little, if the problem is interesting", "solve"],
    ],
  },
  {
    prompt: "What do teammates count on you for?",
    options: [
      ["Making ideas real", "build"],
      ["Making information clear", "data"],
      ["Noticing the risk", "protect"],
      ["Getting people aligned", "solve"],
    ],
  },
  {
    prompt: "Which outcome feels most satisfying?",
    options: [
      ["A tool people actually use", "build"],
      ["A decision backed by evidence", "data"],
      ["A threat stopped early", "protect"],
      ["A better way of working", "solve"],
    ],
  },
];
