import chalk from "chalk";
import CONFIG from "./config";

/**
 * Interface for document section
 */
export interface DocSection {
	key: string;
	filename: string;
	title: string;
	description: string;
	content: string;
}

/**
 * Abstract LLM provider class
 */
abstract class LLMProvider {
	protected temperature: number;

	constructor(temperature = 0.7) {
		this.temperature = temperature;
	}

	abstract generateContent(context: string, sectionKey?: string): Promise<string>;

	/**
	 * Clean model output from thinking tags and other artifacts
	 */
	protected cleanModelOutput(text: string): string {
		// Remove <think>...</think> tags and their content
		let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");

		// Remove other potential tags that some models might generate
		cleaned = cleaned.replace(/<\/?[^>]+(>|$)/g, "");

		// Remove markdown code block markers for markdown
		cleaned = cleaned.replace(/^```markdown\s*\n/m, "");
		cleaned = cleaned.replace(/\n```\s*$/m, "");

		// Remove common prefixes like "Sure!", "Here is", etc.
		const commonPrefixes = [
			/^Sure!(?:\s+|$)/i,
			/^Sure thing!(?:\s+|$)/i,
			/^Here is(?:\s+|$)/i,
			/^Here's(?:\s+|$)/i,
			/^Below is(?:\s+|$)/i,
			/^Here you go(?:\s+|$)/i,
			/^I've created(?:\s+|$)/i,
			/^I have created(?:\s+|$)/i,
			/^I'll create(?:\s+|$)/i,
			/^I will create(?:\s+|$)/i,
			/^Let me provide(?:\s+|$)/i,
			/^This is(?:\s+|$)/i,
			/^Based on(?:\s+|$)/i,
		];

		for (const prefix of commonPrefixes) {
			cleaned = cleaned.replace(prefix, "");
		}

		// Fix any double spaces or excessive newlines
		cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
		cleaned = cleaned.replace(/  +/g, " ");

		return cleaned.trim();
	}
}

/**
 * Ollama LLM provider
 */
class OllamaProvider extends LLMProvider {
	private model: string;
	private baseUrl: string;

	constructor(model: string, baseUrl: string, temperature: number) {
		super(temperature);
		this.model = model;
		this.baseUrl = baseUrl;
	}

	async generateContent(context: string, sectionKey?: string): Promise<string> {
		try {
			console.log(chalk.blue(`Generating content for ${sectionKey || "document"} with Ollama using model ${this.model}...`));

			const response = await fetch(`${this.baseUrl}/api/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.model,
					messages: [
						{
							role: "system",
							content: context,
						},
					],
					stream: false,
					temperature: this.temperature,
				}),
			});

			if (!response.ok) {
				throw new Error(`Error from Ollama API: ${response.statusText}`);
			}

			const data = await response.json();
			console.log(chalk.green(`Successfully generated content with Ollama chat API for ${sectionKey || "document"}`));

			// Clean the model output before returning
			return this.cleanModelOutput(data.message.content);
		} catch (error) {
			console.error(chalk.red("Error generating content with Ollama:"), error);
			return `Error generating content: ${error}`;
		}
	}
}

/**
 * OpenAI LLM provider
 */
class OpenAIProvider extends LLMProvider {
	private model: string;
	private apiKey: string;

	constructor(model: string, apiKey: string, temperature: number) {
		super(temperature);
		this.model = model;
		this.apiKey = apiKey;
	}

	async generateContent(context: string, sectionKey?: string): Promise<string> {
		try {
			console.log(chalk.blue(`Generating content for ${sectionKey || "document"} with OpenAI using model ${this.model}...`));

			const response = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages: [
						{
							role: "system",
							content: context,
						},
					],
					temperature: this.temperature,
				}),
			});

			if (!response.ok) {
				throw new Error(`Error from OpenAI API: ${response.statusText}`);
			}

			const data = await response.json();
			console.log(chalk.green(`Successfully generated content with OpenAI API for ${sectionKey || "document"}`));

			// Clean the model output before returning
			return this.cleanModelOutput(data.choices[0].message.content);
		} catch (error) {
			console.error(chalk.red("Error generating content with OpenAI:"), error);
			return `Error generating content: ${error}`;
		}
	}
}

/**
 * Factory function to create the appropriate LLM provider
 */
export function createLLMProvider(): LLMProvider {
	const provider = CONFIG.llmProvider.toLowerCase();
	const temperature = CONFIG.temperature;

	if (provider === "ollama") {
		return new OllamaProvider(CONFIG.llmModel, CONFIG.ollamaApiUrl, temperature);
	} else if (provider === "openai") {
		if (!CONFIG.openaiApiKey) {
			console.error(chalk.red("OpenAI API key is required but not provided."));
			process.exit(1);
		}
		return new OpenAIProvider(CONFIG.llmModel, CONFIG.openaiApiKey, temperature);
	} else {
		console.error(chalk.red(`Unsupported LLM provider: ${provider}`));
		process.exit(1);
	}
}
