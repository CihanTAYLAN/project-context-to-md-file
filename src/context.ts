import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

/**
 * Gets the size of a file in a human-readable format
 */
function getFileSize(filePath: string): string {
	const stats = fs.statSync(filePath);
	const bytes = stats.size;

	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Determines if a file or directory should be ignored
 */
function shouldIgnore(filePath: string, outputPath: string): boolean {
	// Skip node_modules, .git, and other common directories/files to ignore
	const ignorePatterns = ["node_modules", ".git", "dist", "build", "coverage", ".DS_Store", ".env", ".vscode", ".idea", "package-lock.json", "yarn.lock", ".next", "out", ".cache"];

	// Skip the output file itself
	if (path.resolve(filePath) === path.resolve(outputPath)) {
		return true;
	}

	const basename = path.basename(filePath);

	// Skip binary and large files
	const skipExtensions = [
		".jpg",
		".jpeg",
		".png",
		".gif",
		".bmp",
		".ico",
		".webp",
		".mp4",
		".webm",
		".mov",
		".avi",
		".mkv",
		".mp3",
		".wav",
		".ogg",
		".flac",
		".zip",
		".tar",
		".gz",
		".rar",
		".7z",
		".pdf",
		".doc",
		".docx",
		".xls",
		".xlsx",
		".ppt",
		".pptx",
		".bin",
		".exe",
		".dll",
		".so",
		".dylib",
		".ttf",
		".otf",
		".woff",
		".woff2",
		".data",
		".model",
		".pb",
	];

	const extension = path.extname(filePath).toLowerCase();
	if (skipExtensions.includes(extension)) {
		return true;
	}

	// Ignore hidden files
	if (basename.startsWith(".")) {
		// But keep .gitignore, .npmignore, etc.
		if (!["gitignore", "npmignore", "env.example"].some((name) => basename.endsWith(name))) {
			return true;
		}
	}

	// Check against ignore patterns
	return ignorePatterns.some((pattern) => filePath.includes(pattern));
}

/**
 * Rough estimate of token count
 * (Very approximate, just for limiting context size)
 */
function estimateTokens(text: string): number {
	// GPT models use ~4 chars per token on average
	return Math.ceil(text.length / 4);
}

/**
 * Reads a file's content
 */
function readFileContent(filePath: string, maxSize = 1024 * 100): string {
	try {
		const stats = fs.statSync(filePath);

		// Skip large files
		if (stats.size > maxSize) {
			return `[File too large: ${getFileSize(filePath)}]`;
		}

		// Read text files
		return fs.readFileSync(filePath, "utf8");
	} catch (error) {
		return `[Error reading file: ${error}]`;
	}
}

/**
 * Recursively collects file content from directory
 */
function collectFilesContent(dir: string, outputPath: string, depth = 0, maxDepth = 5, maxTokens = 30000, currentTokens = 0): { files: { path: string; content: string }[]; tokenCount: number } {
	if (depth > maxDepth || currentTokens >= maxTokens) {
		return { files: [], tokenCount: currentTokens };
	}

	const files = fs.readdirSync(dir);
	let results: { path: string; content: string }[] = [];

	// Sort files - important file types first
	const sortedFiles = files.sort((a, b) => {
		const aExt = path.extname(a).toLowerCase();
		const bExt = path.extname(b).toLowerCase();

		// Prioritize code files
		const codeExtensions = [".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".java", ".c", ".cpp", ".cs", ".php"];
		const aIsCode = codeExtensions.includes(aExt);
		const bIsCode = codeExtensions.includes(bExt);

		if (aIsCode && !bIsCode) return -1;
		if (!aIsCode && bIsCode) return 1;

		// Then configuration files
		const configFiles = ["package.json", "tsconfig.json", ".gitignore", "README.md", "Dockerfile"];
		const aIsConfig = configFiles.includes(a);
		const bIsConfig = configFiles.includes(b);

		if (aIsConfig && !bIsConfig) return -1;
		if (!aIsConfig && bIsConfig) return 1;

		return a.localeCompare(b);
	});

	for (const file of sortedFiles) {
		if (currentTokens >= maxTokens) {
			console.log(chalk.yellow(`Max token limit reached (${maxTokens}). Stopping file collection.`));
			break;
		}

		const filePath = path.join(dir, file);

		if (shouldIgnore(filePath, outputPath)) continue;

		const stats = fs.statSync(filePath);

		if (stats.isDirectory()) {
			// Recursively process directories
			const { files: subFiles, tokenCount: newTokens } = collectFilesContent(filePath, outputPath, depth + 1, maxDepth, maxTokens, currentTokens);

			results = [...results, ...subFiles];
			currentTokens = newTokens;
		} else {
			// Read individual file content
			const content = readFileContent(filePath);
			const tokens = estimateTokens(content);

			// Check if adding this file would exceed token limit
			if (currentTokens + tokens > maxTokens) {
				console.log(chalk.yellow(`Skipping ${filePath} (${tokens} tokens) - would exceed token limit`));
				continue;
			}

			results.push({ path: filePath, content });
			currentTokens += tokens;
		}
	}

	return { files: results, tokenCount: currentTokens };
}

/**
 * Collects project context as a single string
 */
export function collectProjectContext(rootDir: string, outputPath: string, maxTokens = 30000): string {
	try {
		console.log(chalk.blue(`Collecting project context from ${rootDir} (max ${maxTokens} tokens)...`));
		const { files, tokenCount } = collectFilesContent(rootDir, outputPath, 0, 5, maxTokens);

		// Format into a single context string
		let context = `Project Directory: ${rootDir}\n\n`;

		// Add all files
		for (const file of files) {
			const relativePath = path.relative(rootDir, file.path);
			context += `\n--- FILE: ${relativePath} ---\n\n`;
			context += file.content;
			context += "\n\n";
		}

		console.log(chalk.green(`Collected ${files.length} files, approximately ${tokenCount} tokens`));

		return context;
	} catch (error) {
		console.error(chalk.red("Error collecting project context:"), error);
		return `Error collecting project context: ${error}`;
	}
}

/**
 * Gets the project package.json information
 */
export function getProjectInfo(rootDir: string): {
	name: string;
	version: string;
	description: string;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
} {
	const defaultInfo = {
		name: path.basename(rootDir),
		version: "unknown",
		description: "",
		dependencies: {},
		devDependencies: {},
	};

	try {
		const packageJsonPath = path.join(rootDir, "package.json");

		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

			return {
				name: packageJson.name || defaultInfo.name,
				version: packageJson.version || defaultInfo.version,
				description: packageJson.description || defaultInfo.description,
				dependencies: packageJson.dependencies || {},
				devDependencies: packageJson.devDependencies || {},
			};
		}
	} catch (error) {
		console.error(chalk.red("Error reading package.json:"), error);
	}

	return defaultInfo;
}
