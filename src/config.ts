import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import chalk from "chalk";

// Default configuration
export interface Config {
	provider: "ollama" | "openai" | "groq" | "bedrock";
	model: string;
	baseUrl?: string;
	apiKey?: string;
	region?: string; // AWS region for Bedrock
	systemPrompt: string;
	temperature: number;
	maxTokens: number;
	interval: number;
	outputFile: string;
}

// Default configuration values
export const DEFAULT_CONFIG: Config = {
	provider: "ollama",
	model: "llama3",
	baseUrl: "http://localhost:11434",
	systemPrompt: `You are an AI assistant that analyzes code repositories and generates helpful documentation.
Given the context of a project (files, structure, etc.), you will create a comprehensive Markdown document 
that includes:
1. An overview of the project
2. The project structure
3. Key components and how they interact
4. Important files and their purpose
5. Dependencies
6. Setup and installation instructions (if applicable)
7. Usage examples (if applicable)
8. Development patterns and architectural decisions
9. Recommendations for improvements or best practices

Be concise but informative. Format your output in a structured, well-organized Markdown document.`,
	temperature: 0.7,
	maxTokens: 4000,
	interval: 5000,
	outputFile: "project-context.md",
};

// Sample .context.env file content
export const SAMPLE_ENV_CONTENT = `# LLM Provider Configuration
# Choose between 'ollama', 'openai', 'groq', or 'bedrock'
PROVIDER=ollama

# Model Configuration
# For Ollama: llama3, codellama, phi3, etc.
# For OpenAI: gpt-4, gpt-4-turbo, gpt-3.5-turbo, etc.
# For Groq: llama3-8b-8192, mixtral-8x7b-32768, etc.
# For Bedrock: amazon.titan-text-express-v1, anthropic.claude-3-sonnet-20240229, etc.
MODEL=llama3

# Provider-specific configurations
# Ollama Configuration (if PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434

# OpenAI Configuration (if PROVIDER=openai)
# OPENAI_API_KEY=your_openai_api_key_here

# Groq Configuration (if PROVIDER=groq)
# GROQ_API_KEY=your_groq_api_key_here

# AWS Bedrock Configuration (if PROVIDER=bedrock)
# AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
# AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
# AWS_REGION=us-east-1

# LLM Parameters
TEMPERATURE=0.7
MAX_TOKENS=4000

# Application settings
UPDATE_INTERVAL=5000
OUTPUT_FILE=project-context.md

# System prompt for context generation
SYSTEM_PROMPT=You are an AI assistant that analyzes code repositories and generates helpful documentation. Given the context of a project (files, structure, etc.), create a comprehensive Markdown document that includes: an overview, structure, key components, important files, dependencies, setup instructions, usage examples, and architectural decisions. Be concise but informative.
`;

/**
 * Loads configuration from .context.env file
 * Creates a sample if the file doesn't exist
 */
export function loadConfig(): Config {
	const envPath = path.resolve(".context.env");
	let config = { ...DEFAULT_CONFIG };

	// Check if .context.env exists
	if (!fs.existsSync(envPath)) {
		console.log(chalk.yellow("No .context.env file found. Creating a sample..."));
		fs.writeFileSync(envPath, SAMPLE_ENV_CONTENT);
		console.log(chalk.green(".context.env sample created. Please edit it with your configuration."));
		console.log(chalk.blue("You can edit it with:"));
		console.log(chalk.blue("  code .context.env  # If using VS Code"));
		console.log(chalk.blue("  nano .context.env  # If using terminal"));
		console.log(chalk.yellow("The application will continue with default settings..."));
	} else {
		// Load env variables
		dotenv.config({ path: envPath });

		// Update config with env values
		if (process.env.PROVIDER) {
			if (["ollama", "openai", "groq", "bedrock"].includes(process.env.PROVIDER)) {
				config.provider = process.env.PROVIDER as "ollama" | "openai" | "groq" | "bedrock";
			} else {
				console.warn(chalk.yellow(`Invalid provider: ${process.env.PROVIDER}. Using default: ${config.provider}`));
			}
		}

		if (process.env.MODEL) {
			config.model = process.env.MODEL;
		}

		if (process.env.OLLAMA_BASE_URL && config.provider === "ollama") {
			config.baseUrl = process.env.OLLAMA_BASE_URL;
		}

		if (process.env.OPENAI_API_KEY && config.provider === "openai") {
			config.apiKey = process.env.OPENAI_API_KEY;
		}

		if (process.env.GROQ_API_KEY && config.provider === "groq") {
			config.apiKey = process.env.GROQ_API_KEY;
		}

		if (process.env.AWS_REGION && config.provider === "bedrock") {
			config.region = process.env.AWS_REGION;
		}

		if (process.env.SYSTEM_PROMPT) {
			config.systemPrompt = process.env.SYSTEM_PROMPT;
		}

		if (process.env.TEMPERATURE) {
			const temp = parseFloat(process.env.TEMPERATURE);
			if (!isNaN(temp) && temp >= 0 && temp <= 1) {
				config.temperature = temp;
			}
		}

		if (process.env.MAX_TOKENS) {
			const tokens = parseInt(process.env.MAX_TOKENS, 10);
			if (!isNaN(tokens) && tokens > 0) {
				config.maxTokens = tokens;
			}
		}

		if (process.env.UPDATE_INTERVAL) {
			const interval = parseInt(process.env.UPDATE_INTERVAL, 10);
			if (!isNaN(interval) && interval > 0) {
				config.interval = interval;
			}
		}

		if (process.env.OUTPUT_FILE) {
			config.outputFile = process.env.OUTPUT_FILE;
		}
	}

	return config;
}
