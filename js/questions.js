const questionBank = {
  "software-developer": [
    {
      type: "behavioral",
      prompt: "Tell me about a difficult bug you had to solve.",
      strongAnswer:
        "Set the context, explain how you isolated the cause, name the tools you used, and close with what changed afterward.",
      lookFor: ["debug", "test", "logs", "reproduce", "root cause"],
      followUp: "How did you know your fix would not introduce a regression?",
    },
    {
      type: "technical",
      prompt: "What is an API, and when have you used one?",
      strongAnswer:
        "An API is a defined way for software systems to communicate. Explain the request, response, authentication, and a concrete project example.",
      lookFor: ["interface", "request", "response", "data", "system"],
      followUp: "How would you handle an API that starts returning errors?",
    },
    {
      type: "technical",
      prompt: "How would you debug an application that suddenly became slow?",
      strongAnswer:
        "Start by reproducing and measuring, then inspect logs and recent changes, isolate the bottleneck, test a fix, and monitor the result.",
      lookFor: ["measure", "logs", "recent", "database", "monitor"],
      followUp: "What metric would you check first?",
    },
  ],
  "data-analyst": [
    {
      type: "behavioral",
      prompt: "Tell me about a time you used data to make a decision.",
      strongAnswer:
        "Explain the question, the data you trusted, how you analyzed it, and the decision or result that followed.",
      lookFor: ["question", "data", "analyze", "result", "decision"],
      followUp: "How did you communicate uncertainty?",
    },
    {
      type: "technical",
      prompt: "Explain the difference between INNER JOIN and LEFT JOIN.",
      strongAnswer:
        "An INNER JOIN keeps rows matched in both tables. A LEFT JOIN keeps every row from the left table and adds matches when available.",
      lookFor: ["match", "both", "left", "null", "table"],
      followUp: "When could a LEFT JOIN create duplicate-looking rows?",
    },
    {
      type: "technical",
      prompt: "How would you handle missing data?",
      strongAnswer:
        "First understand why it is missing, quantify the impact, then choose to remove, impute, flag, or leave it based on the business context.",
      lookFor: ["why", "impact", "remove", "impute", "context"],
      followUp: "How would you explain your choice to a stakeholder?",
    },
  ],
  "cybersecurity-analyst": [
    {
      type: "behavioral",
      prompt:
        "Tell me about a time you solved a problem with incomplete information.",
      strongAnswer:
        "Describe the signal you had, the assumptions you tested, who you involved, and how you reduced uncertainty before acting.",
      lookFor: [
        "signal",
        "assumption",
        "investigate",
        "evidence",
        "communicate",
      ],
      followUp: "What would have changed your decision?",
    },
    {
      type: "technical",
      prompt:
        "What is the difference between authentication and authorization?",
      strongAnswer:
        "Authentication verifies who someone is; authorization determines what that verified identity is allowed to access or do.",
      lookFor: ["identity", "verify", "access", "permission", "allowed"],
      followUp: "Where should authorization be enforced?",
    },
    {
      type: "technical",
      prompt: "What would you investigate after unusual network traffic?",
      strongAnswer:
        "Establish a baseline, identify source and destination, check timing and related logs, scope affected systems, and contain only with evidence.",
      lookFor: ["baseline", "source", "destination", "logs", "contain"],
      followUp: "How would you avoid disrupting a legitimate service?",
    },
  ],
  "business-systems-analyst": [
    {
      type: "behavioral",
      prompt:
        "Tell me about a time you explained something technical to a nontechnical person.",
      strongAnswer:
        "Start with their goal, use plain language or a visual, check understanding, and connect the technical choice to an outcome they care about.",
      lookFor: ["goal", "plain", "visual", "understanding", "outcome"],
      followUp: "How did you confirm the explanation landed?",
    },
    {
      type: "behavioral",
      prompt:
        "Tell me about a time you had conflicting stakeholder requirements.",
      strongAnswer:
        "Make the conflict visible, clarify the underlying needs, compare tradeoffs against shared goals, and document the agreed decision.",
      lookFor: ["needs", "tradeoff", "priority", "goal", "document"],
      followUp: "What did you do when someone still disagreed?",
    },
    {
      type: "technical",
      prompt:
        "What is the difference between functional and non-functional requirements?",
      strongAnswer:
        "Functional requirements describe what a system must do. Non-functional requirements describe qualities or constraints such as security, speed, or reliability.",
      lookFor: ["what", "quality", "constraint", "security", "performance"],
      followUp:
        "Give an example of turning a quality into a testable requirement.",
    },
  ],
  "it-project-manager": [
    {
      type: "behavioral",
      prompt: "Tell me about a project you helped move forward.",
      strongAnswer:
        "Explain the goal, your plan, how you handled a risk or blocker, and the result.",
      lookFor: ["goal", "plan", "risk", "communicate", "result"],
      followUp: "How did you know the project was on track?",
    },
    {
      type: "technical",
      prompt: "How would you handle a project that is falling behind?",
      strongAnswer:
        "Make the delay visible, identify the dependency or scope issue, align stakeholders on tradeoffs, and reset the plan.",
      lookFor: ["delay", "scope", "dependency", "stakeholder", "plan"],
      followUp: "What would you communicate first?",
    },
  ],
  "ux-product-manager": [
    {
      type: "behavioral",
      prompt: "Tell me about a time you designed or improved an experience.",
      strongAnswer:
        "Describe the user need, the evidence you gathered, the decision you made, and how you tested the result.",
      lookFor: ["user", "research", "design", "test", "result"],
      followUp: "What did you change after getting feedback?",
    },
    {
      type: "technical",
      prompt: "How would you prioritize competing product ideas?",
      strongAnswer:
        "Compare user value, business impact, effort, risk, and evidence, then make the tradeoff visible to the team.",
      lookFor: ["value", "impact", "effort", "risk", "evidence"],
      followUp: "How would you respond when a stakeholder disagrees?",
    },
  ],
  "erp-systems-consultant": [
    {
      type: "behavioral",
      prompt: "Tell me about a time you learned a new system quickly.",
      strongAnswer:
        "Explain the business need, how you explored the system, who you asked for context, and how you applied what you learned.",
      lookFor: ["system", "learn", "business", "context", "apply"],
      followUp: "How did you help someone else understand it?",
    },
    {
      type: "technical",
      prompt: "How would you gather requirements for an ERP implementation?",
      strongAnswer:
        "Interview users, map the current process, identify pain points and constraints, document requirements, and validate priorities.",
      lookFor: [
        "users",
        "process",
        "requirements",
        "constraints",
        "priorities",
      ],
      followUp: "How would you handle conflicting department needs?",
    },
  ],
  "cloud-infrastructure-engineer": [
    {
      type: "behavioral",
      prompt: "Tell me about a time you troubleshot a complex technical issue.",
      strongAnswer:
        "Describe the symptoms, your hypotheses, the measurements or logs you used, the fix, and what you monitored afterward.",
      lookFor: ["symptoms", "logs", "measure", "fix", "monitor"],
      followUp: "What did you automate or document afterward?",
    },
    {
      type: "technical",
      prompt: "What makes a cloud system reliable?",
      strongAnswer:
        "Use redundancy, monitoring, automation, least privilege, backups, tested recovery, and clear operational ownership.",
      lookFor: [
        "redundancy",
        "monitoring",
        "automation",
        "backups",
        "recovery",
      ],
      followUp: "How would you test disaster recovery?",
    },
  ],
};
