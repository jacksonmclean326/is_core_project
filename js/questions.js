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
    {
      type: "behavioral",
      prompt: "Tell me about a time you had to learn a new programming language or framework quickly.",
      strongAnswer:
        "Discuss why you needed to learn it, your learning strategy (docs, sample projects), how you applied it, and key takeaways.",
      lookFor: ["learn", "documentation", "apply", "build", "framework"],
      followUp: "What was the hardest concept to grasp in that framework?",
    },
    {
      type: "technical",
      prompt: "Explain the difference between SQL and NoSQL databases.",
      strongAnswer:
        "SQL databases are relational, structured, and use schemas with ACID compliance. NoSQL databases are non-relational, flexible, and scale horizontally.",
      lookFor: ["relational", "schema", "flexible", "scale", "document"],
      followUp: "When would you choose NoSQL over a relational database?",
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
    {
      type: "behavioral",
      prompt: "How do you ensure data accuracy before presenting findings to stakeholders?",
      strongAnswer:
        "Describe validation steps such as cross-checking sources, testing edge cases, checking for outliers, and performing sanity checks.",
      lookFor: ["validate", "outliers", "cross-check", "verify", "source"],
      followUp: "What would you do if a stakeholder questioned your numbers?",
    },
    {
      type: "technical",
      prompt: "What makes a data visualization or dashboard effective?",
      strongAnswer:
        "Clear hierarchy, minimal noise, targeted metrics, intuitive color schemes, and answering key business questions at a glance.",
      lookFor: ["metric", "clarity", "audience", "visual", "insights"],
      followUp: "How do you decide which chart type to use?",
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
    {
      type: "behavioral",
      prompt: "Tell me about a time you identified a security vulnerability or risk.",
      strongAnswer:
        "Explain how you discovered it, assessed severity, communicated risk to the team, and helped remediate it.",
      lookFor: ["risk", "discover", "assess", "remediate", "severity"],
      followUp: "How did you ensure the vulnerability was patched properly?",
    },
    {
      type: "technical",
      prompt: "What is phishing, and how do organizations defend against it?",
      strongAnswer:
        "Phishing tricks users into revealing credentials. Defense includes security awareness training, email filtering, MFA, and endpoint protection.",
      lookFor: ["social engineering", "credentials", "mfa", "filter", "training"],
      followUp: "Why is multi-factor authentication so effective against phishing?",
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
    {
      type: "behavioral",
      prompt: "Tell me about a time you mapped out a business process.",
      strongAnswer:
        "Describe the process scope, how you interviewed stakeholders, created process flow diagrams, identified bottlenecks, and recommended improvements.",
      lookFor: ["diagram", "process", "bottleneck", "stakeholder", "flow"],
      followUp: "How did you measure the impact of your process improvement?",
    },
    {
      type: "technical",
      prompt: "What is User Acceptance Testing (UAT), and what is your role in it?",
      strongAnswer:
        "UAT verifies a system meets business needs before deployment. The analyst writes test cases, guides business users, tracks defects, and ensures sign-off.",
      lookFor: ["testing", "test cases", "defects", "business", "sign-off"],
      followUp: "How do you handle critical defects found during UAT right before launch?",
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
    {
      type: "behavioral",
      prompt: "Tell me about a time you managed a disagreement among team members.",
      strongAnswer:
        "Describe listening to both perspectives, focusing on project goals, facilitating a compromise, and maintaining team morale.",
      lookFor: ["conflict", "listen", "compromise", "goal", "morale"],
      followUp: "How did you follow up with team members afterward?",
    },
    {
      type: "technical",
      prompt: "What is the difference between Agile and Waterfall project management?",
      strongAnswer:
        "Waterfall is sequential and plan-driven; Agile is iterative, adaptable, and delivers incremental value through continuous feedback.",
      lookFor: ["iterative", "sequential", "sprint", "feedback", "adapt"],
      followUp: "When would Waterfall still be preferred over Agile?",
    },
    {
      type: "technical",
      prompt: "How do you create and manage a risk register?",
      strongAnswer:
        "Identify potential risks, evaluate probability and impact, assign ownership, define mitigation strategies, and review regularly.",
      lookFor: ["probability", "impact", "mitigation", "ownership", "review"],
      followUp: "How do you communicate high-level risks to executives?",
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
    {
      type: "behavioral",
      prompt: "Tell me about a time user research changed your product direction.",
      strongAnswer:
        "Explain initial assumptions, findings from user testing or interviews, how you pivoted, and the positive outcome.",
      lookFor: ["assumption", "testing", "interview", "pivot", "outcome"],
      followUp: "How did you convince engineering or business leads to change course?",
    },
    {
      type: "technical",
      prompt: "What is an MVP (Minimum Viable Product), and how do you define its scope?",
      strongAnswer:
        "An MVP is the simplest version of a product that delivers core user value and collects feedback to validate key assumptions.",
      lookFor: ["simplest", "core", "value", "feedback", "validate"],
      followUp: "How do you avoid scope creep when defining an MVP?",
    },
    {
      type: "technical",
      prompt: "How do you measure product success after launching a new feature?",
      strongAnswer:
        "Define success metrics upfront (e.g. adoption, retention, task completion rate, NPS), track telemetry data, and collect user feedback.",
      lookFor: ["metrics", "adoption", "retention", "telemetry", "feedback"],
      followUp: "What do you do if metrics drop after launch?",
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
    {
      type: "behavioral",
      prompt: "Tell me about a time a client or business unit resisted system change.",
      strongAnswer:
        "Discuss understanding their concerns, demonstrating benefits, offering hands-on training, and facilitating smooth change management.",
      lookFor: ["resistance", "concerns", "training", "benefits", "change"],
      followUp: "How did you track user adoption post-launch?",
    },
    {
      type: "technical",
      prompt: "What are core modules in an Enterprise Resource Planning (ERP) system?",
      strongAnswer:
        "ERP integrates core functions: Finance/Accounting, Supply Chain, Human Resources, Procurement, and Customer Relationship Management.",
      lookFor: ["finance", "supply chain", "hr", "procurement", "integrate"],
      followUp: "Why is data migration often the biggest risk in ERP projects?",
    },
    {
      type: "technical",
      prompt: "How do you handle data migration from legacy systems to an ERP?",
      strongAnswer:
        "Extract data, clean/deduplicate, map to target schema, perform test trial loads, validate accuracy with business leads, and execute cutover.",
      lookFor: ["extract", "clean", "map", "validate", "cutover"],
      followUp: "What is your rollback plan if data migration fails during cutover?",
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
    {
      type: "behavioral",
      prompt: "Tell me about an outage or production incident you helped resolve.",
      strongAnswer:
        "Explain immediate response, incident triage, communication updates, resolving root cause, and conducting a post-mortem.",
      lookFor: ["incident", "triage", "communication", "root cause", "post-mortem"],
      followUp: "How did you ensure the issue wouldn't happen again?",
    },
    {
      type: "technical",
      prompt: "What is Infrastructure as Code (IaC), and why is it important?",
      strongAnswer:
        "IaC manages cloud resources using configuration files (e.g. Terraform) enabling version control, repeatability, automated deployments, and drift detection.",
      lookFor: ["terraform", "version control", "automated", "repeatable", "configuration"],
      followUp: "How do you manage secrets when using IaC?",
    },
    {
      type: "technical",
      prompt: "Explain the concept of Least Privilege in cloud security.",
      strongAnswer:
        "Grant identities and services only the exact permissions needed to perform their tasks, minimizing attack surface and blast radius.",
      lookFor: ["permission", "access", "iam", "role", "security"],
      followUp: "How do you audit inactive permissions in cloud accounts?",
    },
  ],
};