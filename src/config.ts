import path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import chalk from "chalk";

// Load environment variables
dotenv.config({ path: ".env.context" });
// Fallback to example config if no .env file exists
if (!fs.existsSync(".env.context")) {
	dotenv.config({ path: ".env.context.example" });
}

// Default configuration values
const CONFIG = {
	// Output path for documentation
	outputPath: process.env.OUTPUT_PATH || "project-doc",

	// Update frequency in milliseconds
	updateInterval: parseInt(process.env.UPDATE_INTERVAL || "5000", 10),

	// LLM provider
	llmProvider: process.env.PROVIDER || "ollama",

	// LLM model
	llmModel: process.env.LLM_MODEL || "qwen2.5:0.5b",

	// OpenAI Configuration
	openaiApiKey: process.env.OPENAI_API_KEY || "",
	openaiApiUrl: process.env.OPENAI_API_URL || "https://api.openai.com/v1",

	// Ollama Configuration
	ollamaApiUrl: process.env.OLLAMA_API_URL || "http://localhost:11434",

	// Groq Configuration
	groqApiKey: process.env.GROQ_API_KEY || "",
	groqApiUrl: process.env.GROQ_API_URL || "https://api.groq.com/v1",

	// Bedrock Configuration
	awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
	awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	awsRegion: process.env.AWS_REGION || "us-east-1",
	bedrockApiUrl: process.env.BEDROCK_API_URL || "",

	// OpenWebUI Configuration
	openwebuiApiKey: process.env.OPENWEBUI_API_KEY || "",
	openwebuiApiUrl: process.env.OPENWEBUI_API_URL || "http://localhost:5000/api",

	// Maximum tokens to use for context
	maxTokens: parseInt(process.env.MAX_TOKENS || "30000", 10),

	// LLM generation temperature
	temperature: parseFloat(process.env.TEMPERATURE || "0.7"),

	// Documentation file structure
	docStructure: {
		overview: {
			filename: "00-Overview.md",
			title: "Project Overview",
			description: "Overview of the project, its purpose, and primary features. Project goals and objectives, Use cases and problems it solves, High-level architecture and key components",
		},
		toolsTechnologies: {
			filename: "01-Tools-Technologies.md",
			title: "Tools & Technologies",
			description:
				"Programming languages and frameworks, Database technologies (MySQL, PostgreSQL, MongoDB, etc.), API & integrations (REST, gRPC, WebSockets, etc.), DevOps & deployment tools (Docker, Kubernetes, AWS, CI/CD, etc.)",
		},
		systemArchitecture: {
			filename: "02-System-Architecture.md",
			title: "System Architecture",
			description: "High-level architecture diagram, Backend & frontend structure, Monolithic vs. microservices approach and reasoning, Scalability and performance optimizations",
		},
		dataModel: {
			filename: "03-Data-Model.md",
			title: "Data Model & Structure",
			description: "Database schema, Key tables and relationships, Caching & indexing strategies",
		},
		apiIntegrations: {
			filename: "04-API-Design-Integrations.md",
			title: "API Design & Integrations",
			description:
				"API design principles, RESTful API endpoints, API documentation, Integration strategies.REST/gRPC/WebSocket endpoints with descriptions, Authentication & authorization (JWT, OAuth, API Key, etc.), Third-party service integrations",
		},
		security: {
			filename: "05-Security.md",
			title: "Security",
			description:
				"Security features, Authentication & authorization, Data protection, API security, Third-party service security.Data security and encryption methods, Authentication & authorization strategies, Measures against security vulnerabilities",
		},
		codeStandards: {
			filename: "06-Code-Standards-Best-Practices.md",
			title: "Code Standards & Best Practices",
			description:
				"Code standards, Best practices, Error handling, Logging, Testing, Documentation, Code readability, Maintainability, Performance optimizations.Coding conventions (SOLID, DRY, KISS, etc.), Logging & error handling strategies, Testing strategies (Unit, Integration, E2E)",
		},
		deployment: {
			filename: "07-Deployment-DevOps-Process.md",
			title: "Deployment & DevOps Process",
			description:
				"Deployment process, CI/CD pipeline, Monitoring & logging, Performance optimization, Scaling strategies, Backup & recovery. CI/CD pipelines and automation, Server configurations and hosting options, Backup and monitoring strategies",
		},
		userGuide: {
			filename: "08-User-Guide.md",
			title: "User Guide",
			description:
				"User-friendly documentation, Guides for different user roles (developers, administrators, end-users), Tutorials, FAQs, Troubleshooting tips.Installation & setup instructions, User roles and permissions, Example usage scenarios",
		},
		futureDevelopment: {
			filename: "09-Future-Development-Roadmap.md",
			title: "Future Development & Roadmap",
			description: "Future development plans, Roadmap, Feature requests, Contribution guidelines, Release notes.Planned features and enhancements, Scalability and performance goals, Long-term vision",
		},
	},
};

// Ensure output path is absolute
if (!path.isAbsolute(CONFIG.outputPath)) {
	CONFIG.outputPath = path.join(process.cwd(), CONFIG.outputPath);
}

// Sample .env.context file content
export const SAMPLE_ENV_CONTENT = `# LLM Provider Configuration
# Choose between 'ollama', 'openai', 'groq', 'bedrock', or 'openwebui'
PROVIDER=ollama

# Model Configuration
# For Ollama models, recommended options:
# - deepseek-coder:1.3b  (Lightest and fastest, code-focused)
# - phi:2b               (Microsoft's light model, good code understanding)
# - codellama:7b         (Meta's code-focused model, good balance)
# - deepseek-r1:7b       (Good code understanding, medium size)
# - qwen2.5:0.5b         (Very small but effective model)
# - mistral:7b           (General purpose but good at code understanding)
# - mixtral-8x7b:instruct (Larger but high quality)
# - llama3.1:8b          (Meta's latest model, good performance)
#
# For OpenAI: gpt-4, gpt-4-turbo, gpt-3.5-turbo
# For Groq: llama3-8b-8192, mixtral-8x7b-32768
# For Bedrock: amazon.titan-text-express-v1, anthropic.claude-3-sonnet-20240229
# For OpenWebUI: Same as Ollama models
LLM_MODEL=codellama:7b

# Provider-specific configurations

# Ollama Configuration (if PROVIDER=ollama)
OLLAMA_API_URL=http://localhost:11434

# OpenAI Configuration (if PROVIDER=openai)
# OPENAI_API_KEY=sk-xxx
# OPENAI_API_URL=https://api.openai.com/v1

# Groq Configuration (if PROVIDER=groq)
# GROQ_API_KEY=gsk_xxx
# GROQ_API_URL=https://api.groq.com/v1

# AWS Bedrock Configuration (if PROVIDER=bedrock)
# AWS_ACCESS_KEY_ID=AKIA...
# AWS_SECRET_ACCESS_KEY=xxx
# AWS_REGION=us-east-1
# BEDROCK_API_URL=https://bedrock-runtime.{region}.amazonaws.com/v1

# OpenWebUI Configuration (if PROVIDER=openwebui)
# OPENWEBUI_API_URL=http://localhost:5000
# OPENWEBUI_API_KEY=sk-xxx

# LLM Parameters
TEMPERATURE=0.7
MAX_TOKENS=30000

# Application settings
UPDATE_INTERVAL=5000
OUTPUT_PATH=project-doc

# Model Selection Notes:
# - Small models (1-4B): Run fast on minimal systems, sufficient for simple projects
# - Medium models (7-8B): Good balance, sufficient for most projects
# - Large models (>8B): Best output quality but slower, for complex projects
# 
# Best performing models for code documentation (from smallest to largest):
# 1. qwen2.5:0.5b - Very lightweight option, good for minimal systems
# 2. deepseek-coder:1.3b - Lightweight option, code-focused
# 3. phi:2b - Microsoft's small model, good memory usage
# 4. codellama:7b - Specially trained for code, good for detailed analysis
# 5. deepseek-r1:7b - Strong general code understanding
# 6. llama3.1:8b - Meta's latest model, high quality
# 7. mixtral-8x7b - Most comprehensive analysis but slowest option
`;

/**
 * Creates a sample .env.context file if it doesn't exist
 */
export function ensureEnvFile(): void {
	const envPath = path.resolve(".env.context");

	// Check if .env.context exists
	if (!fs.existsSync(envPath)) {
		console.log(chalk.yellow("No .env.context file found. Creating a sample..."));
		fs.writeFileSync(envPath, SAMPLE_ENV_CONTENT);
		console.log(chalk.green(".env.context sample created. Please edit it with your configuration."));
		console.log(chalk.blue("You can edit it with:"));
		console.log(chalk.blue("  code .env.context  # If using VS Code"));
		console.log(chalk.blue("  nano .env.context  # If using terminal"));
		console.log(chalk.yellow("The application will continue with default settings..."));
	}
}

export default CONFIG;
