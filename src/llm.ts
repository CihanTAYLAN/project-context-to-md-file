import { Config } from "./config";
import OpenAI from "openai";
import axios from "axios";
import chalk from "chalk";
import { Groq } from "groq-sdk";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

/**
 * Base LLM provider interface
 */
export interface LLMProvider {
	initialize(): Promise<boolean>;
	generateContent(context: string, prompt?: string): Promise<string>;
}

/**
 * Factory for creating LLM providers
 */
export function createLLMProvider(config: Config): LLMProvider {
	switch (config.provider) {
		case "ollama":
			return new OllamaProvider(config);
		case "openai":
			return new OpenAIProvider(config);
		case "groq":
			return new GroqProvider(config);
		case "bedrock":
			return new BedrockProvider(config);
		default:
			throw new Error(`Unknown provider: ${config.provider}`);
	}
}

/**
 * Ollama LLM provider implementation
 */
class OllamaProvider implements LLMProvider {
	private config: Config;
	private baseUrl: string;

	constructor(config: Config) {
		this.config = config;
		this.baseUrl = config.baseUrl || "http://localhost:11434";
	}

	async initialize(): Promise<boolean> {
		try {
			// Check if Ollama is running and the model is available
			const response = await axios.get(`${this.baseUrl}/api/tags`);

			if (response.status === 200) {
				const models = response.data.models || [];
				const modelExists = models.some((model: any) => model.name === this.config.model);

				if (!modelExists) {
					console.warn(chalk.yellow(`Model '${this.config.model}' not found in Ollama. Available models:`));
					models.forEach((model: any) => {
						console.log(chalk.blue(`- ${model.name}`));
					});
					return false;
				}

				console.log(chalk.green(`Successfully connected to Ollama with model: ${this.config.model}`));
				return true;
			}
			return false;
		} catch (error) {
			console.error(chalk.red("Failed to connect to Ollama:"), error);
			console.log(chalk.yellow("Make sure Ollama is running on " + this.baseUrl));
			return false;
		}
	}

	async generateContent(context: string, prompt?: string): Promise<string> {
		try {
			const systemPrompt = this.config.systemPrompt;
			const userPrompt = prompt || "Analyze this project and generate comprehensive documentation.";

			// Use Ollama API directly since the library has compatibility issues
			const response = await axios.post(`${this.baseUrl}/api/chat`, {
				model: this.config.model,
				messages: [
					{
						role: "system",
						content: systemPrompt,
					},
					{
						role: "user",
						content: `${userPrompt}\n\nProject context:\n${context}`,
					},
				],
				options: {
					temperature: this.config.temperature,
				},
			});

			return response.data.message.content;
		} catch (error) {
			console.error(chalk.red("Error generating content with Ollama:"), error);
			return "Error generating content. Please check your Ollama configuration and try again.";
		}
	}
}

/**
 * OpenAI provider implementation
 */
class OpenAIProvider implements LLMProvider {
	private config: Config;
	private client: OpenAI | null = null;

	constructor(config: Config) {
		this.config = config;
	}

	async initialize(): Promise<boolean> {
		if (!this.config.apiKey) {
			console.error(chalk.red("OpenAI API key is required. Please set OPENAI_API_KEY in .context.env"));
			return false;
		}

		try {
			this.client = new OpenAI({
				apiKey: this.config.apiKey,
			});

			// Test the connection with a simple request
			await this.client.models.list();

			console.log(chalk.green(`Successfully connected to OpenAI with model: ${this.config.model}`));
			return true;
		} catch (error) {
			console.error(chalk.red("Failed to connect to OpenAI:"), error);
			return false;
		}
	}

	async generateContent(context: string, prompt?: string): Promise<string> {
		if (!this.client) {
			return "OpenAI client not initialized. Please check your configuration.";
		}

		try {
			const systemPrompt = this.config.systemPrompt;
			const userPrompt = prompt || "Analyze this project and generate comprehensive documentation.";

			const response = await this.client.chat.completions.create({
				model: this.config.model,
				messages: [
					{
						role: "system",
						content: systemPrompt,
					},
					{
						role: "user",
						content: `${userPrompt}\n\nProject context:\n${context}`,
					},
				],
				temperature: this.config.temperature,
				max_tokens: this.config.maxTokens,
			});

			return response.choices[0]?.message?.content || "No content generated";
		} catch (error) {
			console.error(chalk.red("Error generating content with OpenAI:"), error);
			return "Error generating content. Please check your OpenAI configuration and try again.";
		}
	}
}

/**
 * Groq provider implementation
 */
class GroqProvider implements LLMProvider {
	private config: Config;
	private client: Groq | null = null;

	constructor(config: Config) {
		this.config = config;
	}

	async initialize(): Promise<boolean> {
		if (!this.config.apiKey) {
			console.error(chalk.red("Groq API key is required. Please set GROQ_API_KEY in .context.env"));
			return false;
		}

		try {
			this.client = new Groq({
				apiKey: this.config.apiKey,
			});

			// Test the connection with a simple request
			await this.client.chat.completions.create({
				messages: [{ role: "user", content: "Hello" }],
				model: this.config.model,
				max_tokens: 1,
			});

			console.log(chalk.green(`Successfully connected to Groq with model: ${this.config.model}`));
			return true;
		} catch (error) {
			console.error(chalk.red("Failed to connect to Groq:"), error);
			return false;
		}
	}

	async generateContent(context: string, prompt?: string): Promise<string> {
		if (!this.client) {
			return "Groq client not initialized. Please check your configuration.";
		}

		try {
			const systemPrompt = this.config.systemPrompt;
			const userPrompt = prompt || "Analyze this project and generate comprehensive documentation.";

			const response = await this.client.chat.completions.create({
				model: this.config.model,
				messages: [
					{
						role: "system",
						content: systemPrompt,
					},
					{
						role: "user",
						content: `${userPrompt}\n\nProject context:\n${context}`,
					},
				],
				temperature: this.config.temperature,
				max_tokens: this.config.maxTokens,
			});

			return response.choices[0]?.message?.content || "No content generated";
		} catch (error) {
			console.error(chalk.red("Error generating content with Groq:"), error);
			return "Error generating content. Please check your Groq configuration and try again.";
		}
	}
}

/**
 * Amazon Bedrock provider implementation
 */
class BedrockProvider implements LLMProvider {
	private config: Config;
	private client: BedrockRuntimeClient | null = null;

	constructor(config: Config) {
		this.config = config;
	}

	async initialize(): Promise<boolean> {
		if (!this.config.region) {
			console.error(chalk.red("AWS Region is required. Please set AWS_REGION in .context.env"));
			return false;
		}

		try {
			this.client = new BedrockRuntimeClient({
				region: this.config.region,
			});

			console.log(chalk.green(`Successfully initialized AWS Bedrock client with model: ${this.config.model} in region: ${this.config.region}`));
			return true;
		} catch (error) {
			console.error(chalk.red("Failed to initialize AWS Bedrock client:"), error);
			return false;
		}
	}

	async generateContent(context: string, prompt?: string): Promise<string> {
		if (!this.client) {
			return "AWS Bedrock client not initialized. Please check your configuration.";
		}

		try {
			const systemPrompt = this.config.systemPrompt;
			const userPrompt = prompt || "Analyze this project and generate comprehensive documentation.";

			// Prepare request based on the model type
			let payload: any;

			if (this.config.model.includes("anthropic.claude")) {
				// Claude models
				payload = {
					anthropic_version: "bedrock-2023-05-31",
					max_tokens: this.config.maxTokens,
					temperature: this.config.temperature,
					system: systemPrompt,
					messages: [
						{
							role: "user",
							content: `${userPrompt}\n\nProject context:\n${context}`,
						},
					],
				};
			} else if (this.config.model.includes("amazon.titan")) {
				// Amazon Titan models
				payload = {
					inputText: `${systemPrompt}\n\n${userPrompt}\n\nProject context:\n${context}`,
					textGenerationConfig: {
						maxTokenCount: this.config.maxTokens,
						temperature: this.config.temperature,
						topP: 0.9,
					},
				};
			} else {
				// Generic approach for other models
				payload = {
					prompt: `${systemPrompt}\n\n${userPrompt}\n\nProject context:\n${context}`,
					max_tokens: this.config.maxTokens,
					temperature: this.config.temperature,
				};
			}

			const command = new InvokeModelCommand({
				modelId: this.config.model,
				body: JSON.stringify(payload),
			});

			const response = await this.client.send(command);
			const responseBody = JSON.parse(new TextDecoder().decode(response.body));

			// Extract content based on model
			let content = "";
			if (this.config.model.includes("anthropic.claude")) {
				content = responseBody.content[0]?.text || "";
			} else if (this.config.model.includes("amazon.titan")) {
				content = responseBody.results[0]?.outputText || "";
			} else {
				content = responseBody.completion || responseBody.generated_text || "";
			}

			return content || "No content generated";
		} catch (error) {
			console.error(chalk.red("Error generating content with AWS Bedrock:"), error);
			return "Error generating content. Please check your AWS Bedrock configuration and try again.";
		}
	}
}
