#!/usr/bin/env node

import { program } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as chokidar from "chokidar";
import chalk from "chalk";
import { loadConfig } from "./config";
import { createLLMProvider, LLMProvider } from "./llm";
import { collectProjectContext, getProjectInfo } from "./context";

// Program version and description
program
	.version("1.0.0")
	.description("A service that converts project context to markdown file using LLMs")
	.option("-o, --output <path>", "output markdown file path (overrides config)")
	.option("-i, --interval <ms>", "update interval in milliseconds (overrides config)")
	.option("-p, --provider <provider>", "LLM provider (ollama, openai, groq, or bedrock)")
	.option("-m, --model <model>", "LLM model name")
	.parse(process.argv);

// Load configuration
let config = loadConfig();
const options = program.opts();

// Override config with command line options if provided
if (options.output) {
	config.outputFile = options.output;
}

if (options.interval) {
	const interval = parseInt(options.interval, 10);
	if (!isNaN(interval) && interval > 0) {
		config.interval = interval;
	}
}

if (options.provider) {
	if (["ollama", "openai", "groq", "bedrock"].includes(options.provider)) {
		config.provider = options.provider as "ollama" | "openai" | "groq" | "bedrock";
	} else {
		console.warn(chalk.yellow(`Invalid provider: ${options.provider}. Valid options: ollama, openai, groq, bedrock. Using config value: ${config.provider}`));
	}
}

if (options.model) {
	config.model = options.model;
}

// File paths and settings
const outputPath = path.resolve(config.outputFile);
const updateInterval = config.interval;

// Create LLM provider
let llmProvider: LLMProvider;
let initialContextGenerated = false;

/**
 * Generates the markdown content from project context using LLM
 */
async function generateMarkdown(initialGeneration = false): Promise<string> {
	try {
		const timestamp = new Date().toISOString();
		const cwd = process.cwd();
		const projectInfo = getProjectInfo(cwd);

		// If this is the initial generation, we collect the full context
		if (initialGeneration) {
			console.log(chalk.blue("Collecting initial project context..."));
			const fullContext = collectProjectContext(cwd, outputPath);

			console.log(chalk.blue("Generating comprehensive project documentation..."));
			const initialPrompt = "Analyze this project and generate comprehensive documentation.";
			const initialContent = await llmProvider.generateContent(fullContext, initialPrompt);

			initialContextGenerated = true;
			return initialContent;
		}
		// For subsequent generations, we enhance what we already have
		else if (fs.existsSync(outputPath)) {
			const existingContent = fs.readFileSync(outputPath, "utf8");
			const updatePrompt = `This is an existing project documentation. Please improve it, 
			correct any errors, and ensure it's up to date with the current project state.
			Incorporate information about any new files or changes.`;

			// Only collect metadata for incremental updates to avoid sending too much text to the LLM
			const metadataContext = `
			Project Name: ${projectInfo.name}
			Project Version: ${projectInfo.version}
			Project Description: ${projectInfo.description}
			
			Current Timestamp: ${timestamp}
			`;

			console.log(chalk.blue("Enhancing existing documentation..."));
			return await llmProvider.generateContent(metadataContext, updatePrompt);
		}
		// Fallback to standard generation
		else {
			console.log(chalk.blue("Collecting project context (fallback)..."));
			const context = collectProjectContext(cwd, outputPath);
			return await llmProvider.generateContent(context);
		}
	} catch (error) {
		console.error(chalk.red("Error generating markdown:"), error);
		return `# Error Generating Project Documentation

An error occurred while generating the project documentation.

Timestamp: ${new Date().toISOString()}

Please check your configuration and try again.`;
	}
}

/**
 * Writes the markdown content to the output file
 */
async function writeMarkdownFile(): Promise<void> {
	try {
		const markdown = await generateMarkdown(!initialContextGenerated);

		// Create directory if it doesn't exist
		const dir = path.dirname(outputPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Write to the file
		fs.writeFileSync(outputPath, markdown);
		console.log(chalk.green(`Updated markdown file at ${outputPath}`));
	} catch (error) {
		console.error(chalk.red("Error writing markdown file:"), error);
	}
}

/**
 * Main function that starts the service
 */
async function main(): Promise<void> {
	console.log(chalk.blue("Starting project-context-to-md-file service"));
	console.log(chalk.blue(`Output file: ${outputPath}`));
	console.log(chalk.blue(`Update interval: ${updateInterval}ms`));
	console.log(chalk.blue(`LLM Provider: ${config.provider}`));
	console.log(chalk.blue(`LLM Model: ${config.model}`));

	// Initialize LLM provider
	try {
		llmProvider = createLLMProvider(config);
		const initialized = await llmProvider.initialize();

		if (!initialized) {
			console.error(chalk.red(`Failed to initialize ${config.provider} provider. Please check your configuration.`));
			process.exit(1);
		}
	} catch (error) {
		console.error(chalk.red("Error initializing LLM provider:"), error);
		process.exit(1);
	}

	// Generate the initial markdown file
	await writeMarkdownFile();

	// Set up a watcher to detect file changes
	const watcher = chokidar.watch(".", {
		ignored: [
			"**/node_modules/**",
			"**/dist/**",
			path.basename(outputPath), // Ignore our own output file
			"**/.git/**",
			".context.env",
		],
		persistent: true,
	});

	// Update the markdown file when files change
	let debounceTimer: NodeJS.Timeout | null = null;
	let isProcessing = false;

	watcher.on("all", (event: string, filePath: string) => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		// Skip if the file is our output file or .context.env
		if (filePath === outputPath || filePath.includes(path.basename(outputPath)) || filePath.includes(".context.env")) {
			return;
		}

		// Debounce updates to avoid excessive file writes
		debounceTimer = setTimeout(async () => {
			if (isProcessing) return;

			isProcessing = true;
			console.log(chalk.blue(`Project files changed (${event}: ${filePath}), updating markdown...`));
			await writeMarkdownFile();
			isProcessing = false;
		}, 1000); // 1-second debounce
	});

	// Also update at fixed intervals
	setInterval(writeMarkdownFile, updateInterval);

	console.log(chalk.green("Watching for file changes..."));
}

// Start the service
main().catch((error) => {
	console.error(chalk.red("Error:"), error);
	process.exit(1);
});
