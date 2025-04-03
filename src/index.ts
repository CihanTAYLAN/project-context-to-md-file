#!/usr/bin/env node

import { program } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as chokidar from "chokidar";

// Program version and description
program
	.version("1.0.0")
	.description("A service that converts project context to markdown file")
	.option("-o, --output <path>", "output markdown file path", "project-context.md")
	.option("-i, --interval <ms>", "update interval in milliseconds", "5000")
	.parse(process.argv);

const options = program.opts();

// File paths and settings
const outputPath = path.resolve(options.output);
const updateInterval = parseInt(options.interval, 10);

/**
 * Generates project file structure as a tree
 */
async function generateFileTree(dir: string, depth = 0, maxDepth = 3): Promise<string> {
	if (depth > maxDepth) return "";

	const files = fs.readdirSync(dir);
	let tree = "";

	for (const file of files) {
		// Skip hidden files and directories
		if (file.startsWith(".")) continue;

		// Skip node_modules, dist and our output file
		if (["node_modules", "dist"].includes(file) || path.resolve(dir, file) === outputPath) continue;

		const filePath = path.join(dir, file);
		const stats = fs.statSync(filePath);
		const indent = "  ".repeat(depth);

		if (stats.isDirectory()) {
			tree += `${indent}- 📁 ${file}/\n`;
			const subtree = await generateFileTree(filePath, depth + 1, maxDepth);
			tree += subtree;
		} else {
			tree += `${indent}- 📄 ${file}\n`;
		}
	}

	return tree;
}

/**
 * Gets project dependencies from package.json
 */
function getProjectDependencies(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
	try {
		const packageJsonPath = path.resolve("package.json");
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
			return {
				dependencies: packageJson.dependencies || {},
				devDependencies: packageJson.devDependencies || {},
			};
		}
	} catch (error) {
		console.error("Error reading package.json:", error);
	}

	return { dependencies: {}, devDependencies: {} };
}

/**
 * Finds important files in the project
 */
function findImportantFiles(): string[] {
	const importantFiles = ["package.json", "tsconfig.json", "README.md", ".gitignore", ".npmignore", "LICENSE"];

	return importantFiles.filter((file) => fs.existsSync(path.resolve(file)));
}

/**
 * Generates the markdown content from project context
 */
async function generateMarkdown(): Promise<string> {
	const timestamp = new Date().toISOString();
	const cwd = process.cwd();
	const projectName = path.basename(cwd);

	// Get project structure
	const fileTree = await generateFileTree(".");

	// Get dependencies
	const { dependencies, devDependencies } = getProjectDependencies();

	// Get important files
	const importantFiles = findImportantFiles();

	return `# Project Context for ${projectName}

Generated at: ${timestamp}

## Project Structure

\`\`\`
${fileTree || "No files found."}
\`\`\`

## Important Files

${importantFiles.map((file) => `- ${file}`).join("\n") || "No important files found."}

## Dependencies

### Production Dependencies
${
	Object.entries(dependencies)
		.map(([dep, version]) => `- ${dep}: ${version}`)
		.join("\n") || "No production dependencies found."
}

### Development Dependencies
${
	Object.entries(devDependencies)
		.map(([dep, version]) => `- ${dep}: ${version}`)
		.join("\n") || "No development dependencies found."
}
`;
}

/**
 * Writes the markdown content to the output file
 */
async function writeMarkdownFile(): Promise<void> {
	try {
		const markdown = await generateMarkdown();

		// Create directory if it doesn't exist
		const dir = path.dirname(outputPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Write to the file
		fs.writeFileSync(outputPath, markdown);
		console.log(`Updated markdown file at ${outputPath}`);
	} catch (error) {
		console.error("Error generating markdown file:", error);
	}
}

/**
 * Main function that starts the service
 */
async function main(): Promise<void> {
	console.log(`Starting project-context-to-md-file service`);
	console.log(`Output file: ${outputPath}`);
	console.log(`Update interval: ${updateInterval}ms`);

	// Generate the initial markdown file
	await writeMarkdownFile();

	// Set up a watcher to detect file changes
	const watcher = chokidar.watch(".", {
		ignored: [
			"**/node_modules/**",
			"**/dist/**",
			path.basename(outputPath), // Ignore our own output file
			"**/.git/**",
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

		// Skip if the file is our output file
		if (filePath === outputPath || filePath.includes(path.basename(outputPath))) {
			return;
		}

		// Debounce updates to avoid excessive file writes
		debounceTimer = setTimeout(async () => {
			if (isProcessing) return;

			isProcessing = true;
			console.log(`Project files changed (${event}: ${filePath}), updating markdown...`);
			await writeMarkdownFile();
			isProcessing = false;
		}, 1000); // 1-second debounce
	});

	// Also update at fixed intervals
	setInterval(writeMarkdownFile, updateInterval);

	console.log("Watching for file changes...");
}

// Start the service
main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
