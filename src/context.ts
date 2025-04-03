import * as fs from "fs";
import * as path from "path";

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
	const ignorePatterns = ["node_modules", ".git", "dist", "build", "coverage", ".DS_Store", ".env", ".vscode", ".idea"];

	// Skip the output file itself
	if (path.resolve(filePath) === path.resolve(outputPath)) {
		return true;
	}

	const basename = path.basename(filePath);

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
 * Reads a file's content
 */
function readFileContent(filePath: string, maxSize = 1024 * 100): string {
	try {
		const stats = fs.statSync(filePath);

		// Skip large files
		if (stats.size > maxSize) {
			return `[File too large: ${getFileSize(filePath)}]`;
		}

		// Skip binary files
		const extension = path.extname(filePath).toLowerCase();
		const binaryExtensions = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico", ".pdf", ".zip", ".exe", ".dll"];
		if (binaryExtensions.includes(extension)) {
			return `[Binary file: ${extension}]`;
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
function collectFilesContent(dir: string, outputPath: string, depth = 0, maxDepth = 5): { path: string; content: string }[] {
	if (depth > maxDepth) return [];

	const files = fs.readdirSync(dir);
	let results: { path: string; content: string }[] = [];

	for (const file of files) {
		const filePath = path.join(dir, file);

		if (shouldIgnore(filePath, outputPath)) continue;

		const stats = fs.statSync(filePath);

		if (stats.isDirectory()) {
			// Recursively process directories
			const subResults = collectFilesContent(filePath, outputPath, depth + 1, maxDepth);
			results = [...results, ...subResults];
		} else {
			// Read individual file content
			const content = readFileContent(filePath);
			results.push({ path: filePath, content });
		}
	}

	return results;
}

/**
 * Collects project context as a single string
 */
export function collectProjectContext(rootDir: string, outputPath: string): string {
	try {
		const files = collectFilesContent(rootDir, outputPath);

		// Format into a single context string
		let context = `Project Directory: ${rootDir}\n\n`;

		// Add all files
		for (const file of files) {
			const relativePath = path.relative(rootDir, file.path);
			context += `\n--- FILE: ${relativePath} ---\n\n`;
			context += file.content;
			context += "\n\n";
		}

		return context;
	} catch (error) {
		console.error("Error collecting project context:", error);
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
		console.error("Error reading package.json:", error);
	}

	return defaultInfo;
}
