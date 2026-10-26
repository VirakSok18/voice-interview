// Built-in intelligent interview knowledge base and response generator
// Supports dynamic custom roles, conversational role discovery, and technical evaluation

export const PRESET_ROLES = [
  {
    id: 'undecided',
    name: 'Choose via Voice Conversation',
    description: 'Start a natural chat and tell the AI what job position you want to practice',
    category: 'Conversational'
  },
  {
    id: 'fullstack',
    name: 'Full-Stack Developer',
    description: 'React, Node.js, Spring Boot, APIs, and System Design',
    category: 'Engineering'
  },
  {
    id: 'springboot',
    name: 'Java & Spring Boot Engineer',
    description: 'Spring Boot, Microservices, JPA, Hibernate, Concurrency, and REST',
    category: 'Backend'
  },
  {
    id: 'frontend',
    name: 'Frontend Architect',
    description: 'React, TypeScript, WebGL, Performance Optimization, and Fluid UI',
    category: 'Frontend'
  },
  {
    id: 'mobile',
    name: 'Mobile App Developer',
    description: 'Flutter, React Native, iOS Swift, Android, Offline Storage, and Performance',
    category: 'Mobile'
  },
  {
    id: 'system_design',
    name: 'Distributed Systems & Cloud',
    description: 'Scalability, Caching, Message Queues, Fault Tolerance, and DB Sharding',
    category: 'Architecture'
  },
  {
    id: 'data_ai',
    name: 'AI & Data Engineer',
    description: 'LLMs, RAG Pipelines, Python, PyTorch, Vector Databases, and MLOps',
    category: 'AI & Data'
  },
  {
    id: 'product_manager',
    name: 'Product Manager',
    description: 'Product Strategy, Prioritization, User Metrics, Roadmaps, and Execution',
    category: 'Product'
  }
];

export const CONVERSATIONAL_GREETING =
  "Hello! Welcome to your voice interview session. What job position or role would you like to interview for today?";

export const SAFETY_REFUSAL_MESSAGE =
  "I am strictly a professional job interview and career learning assistant. I cannot discuss harmful, illegal, violent, sexual, or off-topic subjects. Let's get back to practicing for your job interview.";

// Strict multi-category safety & scope filter: blocks violence, self-harm, sexual/NSFW, illegal acts,
// weapons, drugs, cybercrime, hate speech, profanity/abuse, and jailbreak/off-purpose misuse.
const UNSAFE_PATTERNS = [
  // Violence, killing, harm, weapons, terrorism
  /\b(kill|killing|murder|assassinate|slaughter|stab|shoot|shooting|gun|rifle|pistol|bomb|explosive|grenade|terrorist|terrorism|massacre|torture|strangle|poison|behead|assault|kidnap|hostage|hitman|weapon)\b/i,
  // Self-harm & suicide
  /\b(suicide|suicidal|kill\s*myself|hurt\s*myself|self[\s-]*harm|cut\s*myself|overdose|end\s*my\s*life)\b/i,
  // Sexual, explicit, NSFW, non-consensual, exploitation
  /\b(sex|sexual|porn|pornography|nsfw|nude|naked|erotic|fetish|orgasm|masturbat|prostitut|escort|stripper|onlyfans|rape|molest|incest|pedophil|underage|child\s*abuse|hentai|hookup|blowjob|handjob|boobs|penis|vagina|dildo|horny|kinky)\b/i,
  // Illegal acts, crime, fraud, theft, drugs, trafficking
  /\b(cocaine|heroin|meth|methamphetamine|fentanyl|lsd|ecstasy|mdma|weed\s*dealer|drug\s*dealing|cartel|smuggl|human\s*trafficking|money\s*launder|counterfeit|steal|robbery|burglary|shoplift|extort|blackmail|bribe|ponzi|tax\s*evasion|fake\s*id|forger|piracy|dark\s*web|silk\s*road)\b/i,
  // Cybercrime, malicious hacking, malware, doxxing
  /\b(ransomware|keylogger|trojan|rootkit|botnet|ddos\s*attack|phishing\s*kit|credit\s*card\s*dump|cvv\s*fullz|sim\s*swap|doxx|doxing|swatting|steal\s*password|crack\s*password|zero[\s-]*day\s*exploit)\b/i,
  // Hate speech, slurs, extremism, discrimination
  /\b(nazi|hitler|white\s*supremac|kkk|ethnic\s*cleansing|genocide|hate\s*crime|racial\s*slur|nigger|faggot|retard|kike|chink)\b/i,
  // Severe profanity / verbal abuse directed at the assistant
  /\b(fuck\s*you|fuck\s*off|motherfucker|bitch|cunt|whore|slut|dickhead|asshole)\b/i,
  // Prompt injection / Jailbreak attempts to bypass interview scope
  /\b(ignore\s*(all\s*)?(previous|prior)\s*instructions|disregard\s*(your\s*)?(rules|system\s*prompt)|dan\s*mode|jailbreak|pretend\s*you\s*have\s*no\s*restrictions|bypass\s*safety|act\s*as\s*an\s*unfiltered)\b/i
];

export function checkContentSafety(text) {
  if (!text || typeof text !== 'string') {
    return { safe: true };
  }
  const normalized = text.trim();
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        safe: false,
        reply: SAFETY_REFUSAL_MESSAGE
      };
    }
  }
  return { safe: true };
}

export const ROLE_INTERVIEW_TREES = {
  fullstack: {
    title: 'Full-Stack Developer',
    questions: [
      {
        topic: "Architecture & State Synchronization",
        prompt: "In your full-stack applications, how do you handle state synchronization between the client and server, especially when multiple users update data concurrently?",
        keywords: ["websocket", "optimistic", "pessimistic", "polling", "event", "conflict", "redux", "query", "cache", "version", "realtime"]
      },
      {
        topic: "Performance & Database Bottlenecks",
        prompt: "When an API endpoint starts experiencing high latency under heavy load, walk me through your systematic debugging process from frontend network inspection down to database queries.",
        keywords: ["index", "profiler", "devtools", "n+1", "cache", "query", "latency", "connection pool", "indexes", "explain", "slow"]
      },
      {
        topic: "Security & Authentication",
        prompt: "How do you securely handle user sessions and authorization across frontend apps and backend services? What are the trade-offs between JWTs and server-side sessions?",
        keywords: ["jwt", "cookie", "httponly", "csrf", "refresh token", "stateless", "revocation", "oauth", "redis", "token"]
      },
      {
        topic: "Deployment & CI/CD Resilience",
        prompt: "How do you design your deployment pipeline to ship database schema migrations safely with zero downtime?",
        keywords: ["migration", "backward", "compatible", "blue-green", "canary", "rollback", "flyway", "prisma", "column", "feature flag"]
      }
    ]
  },
  springboot: {
    title: 'Java & Spring Boot Engineer',
    questions: [
      {
        topic: "Dependency Injection & Transactional Proxies",
        prompt: "Can you explain how Spring manages Bean lifecycles, and what happens behind the scenes when you use the Transactional annotation? What are the pitfalls with self-invocation?",
        keywords: ["proxy", "cglib", "lifecycle", "postconstruct", "aop", "transaction", "rollback", "propagation", "bean", "singleton"]
      },
      {
        topic: "Database & Hibernate Performance",
        prompt: "The N plus one query problem is a classic issue in JPA and Hibernate. How do you detect it, and what specific solutions do you implement in Spring Data repositories?",
        keywords: ["entitygraph", "join fetch", "batch size", "projection", "n+1", "lazy", "eager", "hibernate", "query", "dto"]
      },
      {
        topic: "Concurrency & Microservice Resilience",
        prompt: "In a Spring Boot microservice, how do you handle asynchronous workloads and prevent cascading failures when a downstream service slows down?",
        keywords: ["completablefuture", "executor", "circuit breaker", "resilience4j", "thread pool", "timeout", "retry", "fallback", "virtual threads"]
      },
      {
        topic: "Memory & JVM Tuning",
        prompt: "If a Spring Boot production container experiences high memory pressure or frequent garbage collection pauses, how do you diagnose and resolve it?",
        keywords: ["heap", "dump", "gc", "g1gc", "zgc", "visualvm", "jprofiler", "leak", "threads", "metrics", "actuator"]
      }
    ]
  },
  frontend: {
    title: 'Frontend Architect',
    questions: [
      {
        topic: "Rendering & Browser Pipeline",
        prompt: "Could you break down the browser rendering pipeline from DOM construction to composite layers, and explain what triggers layout reflow versus repaint?",
        keywords: ["dom", "cssom", "render tree", "layout", "reflow", "repaint", "composite", "gpu", "transform", "opacity", "will-change"]
      },
      {
        topic: "State & React Reconciliation",
        prompt: "How does React Fiber reconciliation work, and how do you prevent unnecessary re-renders in complex component trees without prematurely memoizing everything?",
        keywords: ["fiber", "reconciliation", "vdom", "diffing", "usememo", "usecallback", "memo", "transitions", "batching", "context", "state"]
      },
      {
        topic: "Asset Delivery & Core Web Vitals",
        prompt: "If your Core Web Vitals show a poor Largest Contentful Paint and Interaction to Next Paint, what actionable steps do you take to measure and fix them?",
        keywords: ["lcp", "inp", "cls", "code splitting", "lazy", "hydration", "bundle", "critical css", "web workers", "preload"]
      },
      {
        topic: "Design Systems & Accessibility",
        prompt: "When building a reusable component library across multiple teams, how do you enforce accessibility standards, keyboard navigation, and consistent tokens?",
        keywords: ["aria", "wcag", "focus", "keyboard", "screen reader", "tokens", "semantic", "contrast", "radix", "storybook"]
      }
    ]
  },
  mobile: {
    title: 'Mobile App Developer',
    questions: [
      {
        topic: "State Management & Architecture",
        prompt: "How do you structure complex state management in mobile applications to maintain clean separation between UI rendering and business logic?",
        keywords: ["bloc", "provider", "riverpod", "redux", "mvvm", "clean architecture", "immutable", "stream", "repository", "state"]
      },
      {
        topic: "Offline Sync & Local Storage",
        prompt: "When designing an offline-first mobile app with local caching, how do you handle data persistence and conflict resolution when connectivity returns?",
        keywords: ["sqlite", "drift", "hive", "realm", "conflict", "timestamp", "queue", "workmanager", "sync", "background", "cache"]
      },
      {
        topic: "Frame Rate & Memory Profiling",
        prompt: "How do you diagnose and eliminate dropped frames or UI jank on lower-end mobile devices, especially in long media-heavy lists?",
        keywords: ["profiler", "fps", "memory leak", "isolate", "worker", "gpu", "rebuild", "devtools", "instruments", "jank", "lazy"]
      },
      {
        topic: "App Lifecycle & Battery Efficiency",
        prompt: "How do you manage background tasks, push notifications, and network sockets on mobile without draining the user's battery?",
        keywords: ["lifecycle", "background", "fcm", "apns", "socket", "heartbeat", "batch", "wakelock", "suspend", "os"]
      }
    ]
  },
  system_design: {
    title: 'Distributed Systems & Cloud Architect',
    questions: [
      {
        topic: "Scalability & Distributed Caching",
        prompt: "Walk me through how you would architect a globally distributed caching layer. How do you handle cache invalidation, cache stampede, and hot keys?",
        keywords: ["redis", "cdn", "memcached", "write-through", "cache-aside", "ttl", "mutex", "consistent hashing", "bloom filter", "lock"]
      },
      {
        topic: "Data Partitioning & Replication",
        prompt: "When a single relational database cannot keep up with write volume, what strategies do you consider for sharding, and how do you handle cross-shard transactions?",
        keywords: ["sharding", "partition", "two-phase commit", "saga", "consistent hash", "read replica", "eventual consistency", "cap", "key"]
      },
      {
        topic: "Asynchronous Messaging & Reliability",
        prompt: "How do you design an event-driven pipeline using Kafka or RabbitMQ that guarantees at-least-once delivery while ensuring consumer idempotency?",
        keywords: ["kafka", "rabbitmq", "idempotent", "offset", "dead letter", "outbox pattern", "ack", "partition", "consumer group", "deduplication"]
      },
      {
        topic: "Observability & Incident Response",
        prompt: "In a microservices mesh with dozens of services, how do you implement distributed tracing and alerting to pinpoint latency spikes in real time?",
        keywords: ["opentelemetry", "jaeger", "prometheus", "grafana", "trace", "span", "correlation", "slo", "sla", "logs"]
      }
    ]
  },
  data_ai: {
    title: 'AI & Data Engineer',
    questions: [
      {
        topic: "RAG Architecture & Vector Search",
        prompt: "When building a production Retrieval-Augmented Generation pipeline, how do you optimize chunking strategies, embeddings, and hybrid search to minimize hallucinations?",
        keywords: ["chunk", "embedding", "vector", "rerank", "bm25", "hybrid", "context", "hallucination", "cosine", "metadata"]
      },
      {
        topic: "LLM Latency & Production Inference",
        prompt: "How do you reduce time-to-first-token and inference costs when serving large language models to thousands of concurrent users?",
        keywords: ["streaming", "quantization", "kv cache", "batching", "vllm", "caching", "distillation", "smaller model", "token", "gpu"]
      },
      {
        topic: "Evaluation & Guardrails",
        prompt: "How do you systematically evaluate LLM output quality and enforce safety guardrails before deploying prompt or model updates?",
        keywords: ["eval", "benchmark", "llm-as-a-judge", "guardrail", "pii", "injection", "regression", "golden dataset", "metrics"]
      }
    ]
  },
  product_manager: {
    title: 'Product Manager',
    questions: [
      {
        topic: "Prioritization & Roadmapping",
        prompt: "When you have competing demands from sales, engineering debt, and executive leadership, what framework do you use to prioritize your product roadmap?",
        keywords: ["rice", "impact", "effort", "user", "metric", "north star", "stakeholder", "data", "trade-off", "value"]
      },
      {
        topic: "Metrics & Funnel Drop-off",
        prompt: "Imagine you launch a major onboarding feature and notice a twenty percent drop in day-seven retention. Walk me through how you investigate and address it.",
        keywords: ["cohort", "funnel", "analytics", "segment", "interview", "a/b test", "hypothesis", "session", "friction", "activation"]
      },
      {
        topic: "Cross-Functional Execution",
        prompt: "Tell me about how you work with engineers and designers when a critical technical constraint forces you to cut scope right before launch.",
        keywords: ["mvp", "scope", "trade-off", "align", "communicate", "user problem", "iteration", "phased", "launch"]
      }
    ]
  }
};

// Detect role from natural spoken conversation
export function detectRoleFromSpeech(spokenText) {
  const text = spokenText.toLowerCase().trim();

  // Check if user is just saying hello without specifying a role yet
  const isPureGreeting = /^(hello|hi|hey|yo|good\s*(morning|afternoon|evening)|how\s*are\s*you|what's\s*up|can\s*you\s*hear\s*me|testing|test)\W*$/i.test(text);
  if (isPureGreeting) {
    return { matched: false, isGreetingOnly: true };
  }

  if (text.includes('spring') || text.includes('java') || text.includes('backend') || text.includes('back-end') || text.includes('microservice')) {
    return { matched: true, roleId: 'springboot', customTitle: 'Java & Spring Boot Engineer' };
  }
  if (text.includes('front') || text.includes('react') || text.includes('ui') || text.includes('ux') || text.includes('css') || text.includes('web') || text.includes('javascript') || text.includes('typescript')) {
    return { matched: true, roleId: 'frontend', customTitle: 'Frontend Engineer' };
  }
  if (text.includes('mobile') || text.includes('flutter') || text.includes('ios') || text.includes('android') || text.includes('react native') || text.includes('swift') || text.includes('kotlin')) {
    return { matched: true, roleId: 'mobile', customTitle: 'Mobile App Developer' };
  }
  if (text.includes('system') || text.includes('cloud') || text.includes('aws') || text.includes('devops') || text.includes('distributed') || text.includes('architect') || text.includes('infrastructure')) {
    return { matched: true, roleId: 'system_design', customTitle: 'Cloud & Systems Architect' };
  }
  if (text.includes('ai') || text.includes('machine learning') || text.includes('ml') || text.includes('data') || text.includes('python') || text.includes('llm') || text.includes('deep learning')) {
    return { matched: true, roleId: 'data_ai', customTitle: 'AI & Data Engineer' };
  }
  if (text.includes('product') || text.includes('pm') || text.includes('manager') || text.includes('management') || text.includes('marketing') || text.includes('business')) {
    return { matched: true, roleId: 'product_manager', customTitle: 'Product Manager' };
  }
  if (text.includes('full') || text.includes('software') || text.includes('developer') || text.includes('engineer') || text.includes('coding') || text.includes('programmer')) {
    return { matched: true, roleId: 'fullstack', customTitle: 'Full-Stack Software Engineer' };
  }

  // Clean up conversational filler to extract custom job title
  const cleaned = spokenText
    .replace(/^(hello|hi|hey|um|uh|well|so|i\s*want\s*to|i'd\s*like\s*to|i\s*would\s*like\s*to|let's\s*do|can\s*we\s*do|interview\s*me\s*for|interview\s*for|practice\s*for|prepare\s*for|a|an|the)\s+/gi, '')
    .replace(/(position|role|job|interview|today|please)\W*$/gi, '')
    .trim();

  if (cleaned.length >= 2) {
    const formattedTitle = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return { matched: true, roleId: 'custom', customTitle: formattedTitle };
  }

  return { matched: false, isGreetingOnly: false };
}

// Build dynamic fallback questions for any custom job position if offline/no LLM
export function buildCustomRoleTree(customTitle) {
  return {
    title: customTitle,
    questions: [
      {
        topic: "Background & Core Expertise",
        prompt: `Tell me about your hands-on experience related to the ${customTitle} role and a key project you are proud of.`,
        keywords: ["project", "team", "built", "designed", "led", "implemented", "experience", "result", "impact", "system"]
      },
      {
        topic: "Problem Solving & Challenges",
        prompt: `What is the most difficult technical or operational challenge you have faced in a ${customTitle} capacity, and how did you walk through solving it?`,
        keywords: ["problem", "solution", "debug", "analyzed", "fixed", "improved", "process", "challenge", "team", "root cause"]
      },
      {
        topic: "Prioritization & Quality Under Pressure",
        prompt: `When working under tight deadlines as a ${customTitle}, how do you balance speed of execution with long-term quality and reliability?`,
        keywords: ["priority", "quality", "testing", "trade-off", "deadline", "communicate", "stakeholder", "risk", "deliver"]
      },
      {
        topic: "Future Impact & Questions",
        prompt: `Looking ahead, what excites you most about stepping into this ${customTitle} position, and how do you measure success in your first ninety days?`,
        keywords: ["learn", "deliver", "goal", "metric", "team", "contribute", "growth", "value", "impact"]
      }
    ]
  };
}

// Generates thoughtful, natural interviewer follow-ups based on the user's spoken answer
export function evaluateAnswer(userAnswer, questionData) {
  const normalized = userAnswer.toLowerCase();

  // Detect if the user doesn't know the answer or asks for help
  const isDontKnow = /\b(i\s*don't\s*know|i\s*do\s*not\s*know|not\s*sure|no\s*idea|i'm\s*unsure|can\s*you\s*explain|what\s*is\s*that|help\s*me|skip|pass|i\s*forgot|blanking)\b/i.test(normalized);
  if (isDontKnow) {
    const keyConcepts = (questionData.keywords || []).slice(0, 3).join(', ');
    return {
      assessment: 'coaching',
      comment: `No problem at all! For ${questionData.topic}, interviewers are looking for how you think about concepts like ${keyConcepts}. A strong way to answer this is to briefly explain the core concept, mention a tool or pattern like ${questionData.keywords?.[0] || 'caching'}, and share one practical trade-off.`,
      followUp: "Want to give that question a quick try using those points, or should we move to the next question?",
      matchedCount: 0
    };
  }

  const matchedKeywords = (questionData.keywords || []).filter(kw => normalized.includes(kw));
  const wordCount = normalized.trim().split(/\s+/).length;

  let assessment = 'good';
  let comment = '';
  let followUp = '';

  if (wordCount < 10) {
    assessment = 'brief';
    comment = "Got it, thank you for that quick answer.";
    followUp = "Could you share a bit more detail or a real-world example of how you applied that?";
  } else if (matchedKeywords.length >= 2) {
    assessment = 'strong';
    comment = `Great points on ${matchedKeywords.slice(0, 2).join(' and ')}. That shows solid practical experience.`;
    followUp = "What was the biggest trade-off or lesson you learned from that approach?";
  } else if (matchedKeywords.length >= 1) {
    assessment = 'solid';
    comment = `I like how you mentioned ${matchedKeywords[0]}.`;
    followUp = "How do you validate that everything works reliably in a real production scenario?";
  } else {
    assessment = 'general';
    comment = "Thank you for walking me through your perspective.";
    followUp = "How would you adapt that approach if the scale or complexity doubled?";
  }

  return {
    assessment,
    comment,
    followUp,
    matchedCount: matchedKeywords.length
  };
}
