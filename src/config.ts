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

	// LLM provider (ollama or openai)
	llmProvider: process.env.LLM_PROVIDER || "ollama",

	// LLM model
	llmModel: process.env.LLM_MODEL || "llama2",

	// OpenAI API key if using OpenAI
	openaiApiKey: process.env.OPENAI_API_KEY || "",

	// Ollama API URL if using Ollama
	ollamaApiUrl: process.env.OLLAMA_API_URL || "http://localhost:11434",

	// Maximum tokens to use for context
	maxTokens: parseInt(process.env.MAX_TOKENS || "30000", 10),

	// LLM generation temperature
	temperature: parseFloat(process.env.TEMPERATURE || "0.7"),

	// Documentation file structure
	docStructure: {
		overview: {
			filename: "00-Overview.md",
			title: "Project Overview",
			description: "Overview of the project, its purpose, and primary features.",
		},
		architecture: {
			filename: "01-Architecture.md",
			title: "Architecture",
			description: "System architecture, major components, and their relationships.",
		},
		setup: {
			filename: "02-Setup.md",
			title: "Setup & Installation",
			description: "Instructions for setting up and running the project.",
		},
		apis: {
			filename: "03-APIs.md",
			title: "API Documentation",
			description: "API endpoints, data models, and usage examples.",
		},
		components: {
			filename: "04-Components.md",
			title: "Components",
			description: "Detailed description of the main components and modules.",
		},
		configuration: {
			filename: "05-Configuration.md",
			title: "Configuration",
			description: "Configuration options and environment variables.",
		},
		development: {
			filename: "06-Development.md",
			title: "Development Guide",
			description: "Guide for developers who want to contribute to the project.",
		},
		troubleshooting: {
			filename: "07-Troubleshooting.md",
			title: "Troubleshooting",
			description: "Common issues and their solutions.",
		},
	},
};

// Ensure output path is absolute
if (!path.isAbsolute(CONFIG.outputPath)) {
	CONFIG.outputPath = path.join(process.cwd(), CONFIG.outputPath);
}

// Sample .env.context file content
export const SAMPLE_ENV_CONTENT = `# LLM Provider Configuration
# Choose between 'ollama' or 'openai'
LLM_PROVIDER=ollama

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
# For OpenAI: gpt-4, gpt-4-turbo, gpt-3.5-turbo, etc.
LLM_MODEL=qwen2.5:0.5b

# Provider-specific configurations
# Ollama Configuration (if LLM_PROVIDER=ollama)
OLLAMA_API_URL=http://localhost:11434

# OpenAI Configuration (if LLM_PROVIDER=openai)
# OPENAI_API_KEY=your_openai_api_key_here

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
