import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
// Dynamic import to avoid typescript issues
const lancedb = require("@lancedb/lancedb");

// Interface for a code chunk that will be stored in the vector DB
interface CodeChunk {
	id: string; // Unique ID for the chunk
	path: string; // File path
	content: string; // Actual code content
	vector: number[]; // Vector embedding
	size: number; // Size in bytes
	modifiedAt: number; // Timestamp of last modification
	extension: string; // File extension
	lineCount: number; // Number of lines
}

/**
 * Simple hashing function to generate vector placeholders
 * Note: In a production environment, use a proper embedding model
 */
function generateSimpleEmbedding(text: string, dimensions = 128): number[] {
	const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
	const embedding = new Array(dimensions).fill(0);

	for (let i = 0; i < normalized.length; i++) {
		const charCode = normalized.charCodeAt(i);
		embedding[i % dimensions] += charCode / 1000;
	}

	// Normalize vector to unit length
	const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
	return embedding.map((val) => val / (magnitude || 1));
}

/**
 * Count lines in a string
 */
function countLines(text: string): number {
	return text.split(/\r\n|\r|\n/).length;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
	if (vecA.length !== vecB.length) {
		throw new Error("Vectors must be of same length");
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	normA = Math.sqrt(normA);
	normB = Math.sqrt(normB);

	if (normA === 0 || normB === 0) {
		return 0;
	}

	return dotProduct / (normA * normB);
}

/**
 * Vector store for maintaining embeddings of code files
 */
export class VectorStore {
	private dbPath: string;
	private db: any;
	private table: any;
	private initialized: boolean = false;

	constructor(workspacePath: string) {
		this.dbPath = path.join(workspacePath, ".context-db");
		fs.mkdirSync(this.dbPath, { recursive: true });
	}

	/**
	 * Initialize the vector store
	 */
	async initialize(): Promise<boolean> {
		try {
			console.log(chalk.blue(`Initializing vector store at ${this.dbPath}...`));
			this.db = await lancedb.connect(this.dbPath);

			// Create or open the table
			try {
				this.table = await this.db.openTable("code_chunks");
				console.log(chalk.green("Vector store loaded successfully"));
			} catch (error) {
				// Table doesn't exist, create it
				this.table = await this.db.createTable("code_chunks", [
					{
						id: "dummy",
						path: "dummy",
						content: "dummy",
						vector: generateSimpleEmbedding("dummy"),
						size: 0,
						modifiedAt: Date.now(),
						extension: "",
						lineCount: 0,
					},
				]);
				console.log(chalk.green("Vector store created successfully"));
			}

			this.initialized = true;
			return true;
		} catch (error) {
			console.error(chalk.red("Failed to initialize vector store:"), error);
			return false;
		}
	}

	/**
	 * Add or update a file in the vector store
	 */
	async upsertFile(filePath: string, content: string): Promise<void> {
		if (!this.initialized) {
			throw new Error("Vector store not initialized");
		}

		try {
			const stats = fs.statSync(filePath);
			const extension = path.extname(filePath).toLowerCase();

			// Create embedding for the file
			const embedding = generateSimpleEmbedding(content);

			// Create chunk
			const chunk: CodeChunk = {
				id: filePath,
				path: filePath,
				content,
				vector: embedding,
				size: stats.size,
				modifiedAt: stats.mtimeMs,
				extension,
				lineCount: countLines(content),
			};

			// Upsert into the vector store
			await this.table.add([chunk], { mode: "overwrite" });
		} catch (error) {
			console.error(chalk.yellow(`Error upserting file ${filePath}:`), error);
		}
	}

	/**
	 * Delete a file from the vector store
	 */
	async deleteFile(filePath: string): Promise<void> {
		if (!this.initialized) {
			throw new Error("Vector store not initialized");
		}

		try {
			await this.table.delete(`id = '${filePath}'`);
		} catch (error) {
			console.error(chalk.yellow(`Error deleting file ${filePath}:`), error);
		}
	}

	/**
	 * Get all files from the vector store
	 */
	async getAllFiles(): Promise<{ path: string; content: string }[]> {
		if (!this.initialized) {
			throw new Error("Vector store not initialized");
		}

		try {
			// LanceDB API sorunu nedeniyle direk dosyaları kullanıyoruz
			// Proje dosyalarını file system'dan okuyoruz, sadece geçerli olanları döndürüyoruz
			// Bu bir geçici çözümdür, ideal değildir
			const files: { path: string; content: string }[] = [];

			// Proje kök dizinini al
			const projectRoot = process.cwd();

			// İzlenecek dosya uzantıları
			const validExtensions = [".ts", ".js", ".json", ".md", ".txt", ".gitignore", ".env.example"];

			// İzlenmeyecek dizinler
			const excludedDirs = ["node_modules", ".git", "dist", "build", ".context-db"];

			// Dosyaları rekürsif olarak tara
			function scanDir(dirPath: string) {
				if (excludedDirs.some((excluded) => dirPath.includes(excluded))) {
					return;
				}

				const items = fs.readdirSync(dirPath);

				for (const item of items) {
					const itemPath = path.join(dirPath, item);
					const stats = fs.statSync(itemPath);

					if (stats.isDirectory()) {
						scanDir(itemPath);
					} else if (stats.isFile()) {
						const ext = path.extname(itemPath);
						if (validExtensions.includes(ext) || validExtensions.some((valid) => itemPath.endsWith(valid))) {
							try {
								const content = fs.readFileSync(itemPath, "utf8");
								files.push({
									path: itemPath,
									content,
								});
							} catch (error) {
								console.error(`Error reading file ${itemPath}:`, error);
							}
						}
					}
				}
			}

			scanDir(projectRoot);

			return files;
		} catch (error) {
			console.error(chalk.red("Error retrieving all files:"), error);
			return [];
		}
	}

	/**
	 * Check if a file exists in the vector store
	 */
	async fileExists(filePath: string): Promise<boolean> {
		if (!this.initialized) {
			throw new Error("Vector store not initialized");
		}

		try {
			// LanceDB yerine file system kontrolü
			return fs.existsSync(filePath);
		} catch (error) {
			console.error(chalk.yellow(`Error checking if file exists ${filePath}:`), error);
			return false;
		}
	}

	/**
	 * Get file stats from the vector store
	 */
	async getStats(): Promise<{
		totalFiles: number;
		totalSize: number;
		totalLines: number;
		fileTypes: Record<string, number>;
	}> {
		if (!this.initialized) {
			throw new Error("Vector store not initialized");
		}

		try {
			// Tüm dosyaları al
			const files = await this.getAllFiles();

			// İstatistikleri hesapla
			const stats = {
				totalFiles: files.length,
				totalSize: 0,
				totalLines: 0,
				fileTypes: {} as Record<string, number>,
			};

			for (const file of files) {
				const filePath = file.path;
				const fileStats = fs.statSync(filePath);

				stats.totalSize += fileStats.size;
				stats.totalLines += countLines(file.content);

				// Dosya tipini say
				const ext = path.extname(filePath) || "unknown";
				stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
			}

			return stats;
		} catch (error) {
			console.error(chalk.red("Error getting stats:"), error);
			return {
				totalFiles: 0,
				totalSize: 0,
				totalLines: 0,
				fileTypes: {},
			};
		}
	}

	/**
	 * Get the most relevant files for a given context
	 */
	async getSimilarFiles(query: string, limit = 20): Promise<{ path: string; content: string }[]> {
		if (!this.initialized) {
			throw new Error("Vector store not initialized");
		}

		try {
			const queryEmbedding = generateSimpleEmbedding(query);

			// Tüm dosyaları al
			const allFiles = await this.getAllFiles();

			// Her dosya için benzerlik hesapla
			const filesWithSimilarity = allFiles.map((file) => {
				const fileEmbedding = generateSimpleEmbedding(file.content);
				const similarity = cosineSimilarity(queryEmbedding, fileEmbedding);
				return { ...file, similarity };
			});

			// Benzerliğe göre sırala ve limitli döndür
			const sortedFiles = filesWithSimilarity.sort((a, b) => b.similarity - a.similarity).slice(0, limit);

			return sortedFiles.map((file) => ({
				path: file.path,
				content: file.content,
			}));
		} catch (error) {
			console.error(chalk.red("Error searching for similar files:"), error);
			return [];
		}
	}
}

/**
 * Context manager for building effective context for LLMs
 */
export class ContextManager {
	private vectorStore: VectorStore;
	private outputPath: string;
	private totalTokenBudget: number;

	constructor(workspacePath: string, outputPath: string, totalTokenBudget = 30000) {
		this.vectorStore = new VectorStore(workspacePath);
		this.outputPath = outputPath;
		this.totalTokenBudget = totalTokenBudget;
	}

	/**
	 * Initialize the context manager
	 */
	async initialize(): Promise<boolean> {
		return this.vectorStore.initialize();
	}

	/**
	 * Update a file in the vector store
	 */
	async updateFile(filePath: string, content: string): Promise<void> {
		await this.vectorStore.upsertFile(filePath, content);
	}

	/**
	 * Delete a file from the vector store
	 */
	async deleteFile(filePath: string): Promise<void> {
		await this.vectorStore.deleteFile(filePath);
	}

	/**
	 * Get file statistics
	 */
	async getProjectStats(): Promise<string> {
		const stats = await this.vectorStore.getStats();

		return `
Project Statistics:
- Total Files: ${stats.totalFiles}
- Total Size: ${Math.round(stats.totalSize / 1024)} KB
- Total Lines: ${stats.totalLines}
- File Types: ${Object.entries(stats.fileTypes)
			.map(([ext, count]) => `${ext}: ${count}`)
			.join(", ")}
`;
	}

	/**
	 * Build section-specific context
	 */
	async buildSectionContext(sectionKey: string): Promise<string> {
		console.log(chalk.blue(`Building context for section: ${sectionKey}...`));

		// Get all files from vector store
		const files = await this.vectorStore.getAllFiles();

		// Calculate tokens for each file
		const filesWithTokens = files.map((file) => ({
			...file,
			tokens: this.estimateTokens(file.content),
		}));

		// Sort files to prioritize important ones based on section
		const sortedFiles = this.prioritizeFilesForSection(filesWithTokens, sectionKey);

		// Build section-specific header
		let context = this.buildSectionHeader(sectionKey);
		let totalTokens = this.estimateTokens(context);
		const includedFiles: string[] = [];

		// Add relevant files for this section
		for (const file of sortedFiles) {
			// Check if adding this file would exceed our token budget
			const contentTokens = file.tokens;
			const headerTokens = this.estimateTokens(`\n### FILE: ${file.path}\n\`\`\`\n`);
			const footerTokens = this.estimateTokens(`\n\`\`\`\n`);

			if (totalTokens + contentTokens + headerTokens + footerTokens > this.totalTokenBudget) {
				// Skip if it would exceed the budget
				continue;
			}

			// Add the file to our context
			context += `\n### FILE: ${file.path}\n\`\`\`\n`;
			context += file.content;
			context += `\n\`\`\`\n`;

			// Update token count and track included files
			totalTokens += contentTokens + headerTokens + footerTokens;
			includedFiles.push(file.path);

			// Break if we've included enough files for this section
			if (includedFiles.length >= this.getMaxFilesForSection(sectionKey)) {
				break;
			}
		}

		// Add statistics about the project
		context += `\n## PROJECT STATISTICS\n`;
		context += await this.getProjectStats();

		// Add section-specific footer
		context += this.buildSectionFooter(sectionKey);

		console.log(chalk.green(`Built context for section ${sectionKey} with ${includedFiles.length} files, approximately ${totalTokens} tokens`));

		return context;
	}

	/**
	 * Prioritize files based on section type
	 */
	private prioritizeFilesForSection(files: any[], sectionKey: string): any[] {
		// Create a copy of files to sort
		const sortedFiles = [...files];

		// Different sorting logic based on section
		switch (sectionKey) {
			case "overview":
				return sortedFiles.sort((a, b) => {
					// Prioritize README and package.json for overview
					if (a.path.endsWith("README.md")) return -1;
					if (b.path.endsWith("README.md")) return 1;
					if (a.path.endsWith("package.json")) return -1;
					if (b.path.endsWith("package.json")) return 1;
					return a.tokens - b.tokens;
				});

			case "architecture":
				return sortedFiles.sort((a, b) => {
					// Prioritize main source files for architecture
					const isAMainFile = a.path.includes("/src/") && !a.path.includes("test");
					const isBMainFile = b.path.includes("/src/") && !b.path.includes("test");
					if (isAMainFile && !isBMainFile) return -1;
					if (!isAMainFile && isBMainFile) return 1;
					return a.tokens - b.tokens;
				});

			case "setup":
				return sortedFiles.sort((a, b) => {
					// Prioritize config and setup files
					if (a.path.endsWith("package.json")) return -1;
					if (b.path.endsWith("package.json")) return 1;
					if (a.path.endsWith(".env.example")) return -1;
					if (b.path.endsWith(".env.example")) return 1;
					if (a.path.includes("config")) return -1;
					if (b.path.includes("config")) return 1;
					return a.tokens - b.tokens;
				});

			case "apis":
				return sortedFiles.sort((a, b) => {
					// Prioritize API-related files
					if (a.path.includes("api") || a.path.includes("route")) return -1;
					if (b.path.includes("api") || b.path.includes("route")) return 1;
					return a.tokens - b.tokens;
				});

			case "components":
				return sortedFiles.sort((a, b) => {
					// Prioritize component files
					if (a.path.includes("component") || a.path.includes("ui")) return -1;
					if (b.path.includes("component") || b.path.includes("ui")) return 1;
					return a.tokens - b.tokens;
				});

			case "configuration":
				return sortedFiles.sort((a, b) => {
					// Prioritize configuration files
					if (a.path.includes("config") || a.path.endsWith(".env.example")) return -1;
					if (b.path.includes("config") || b.path.endsWith(".env.example")) return 1;
					return a.tokens - b.tokens;
				});

			case "development":
				return sortedFiles.sort((a, b) => {
					// Prioritize development-related files
					if (a.path.endsWith(".gitignore")) return -1;
					if (b.path.endsWith(".gitignore")) return 1;
					if (a.path.includes("test") || a.path.includes("dev")) return -1;
					if (b.path.includes("test") || b.path.includes("dev")) return 1;
					return a.tokens - b.tokens;
				});

			case "troubleshooting":
				return sortedFiles.sort((a, b) => {
					// Prioritize error handling and logging files
					if (a.path.includes("error") || a.path.includes("log")) return -1;
					if (b.path.includes("error") || b.path.includes("log")) return 1;
					return a.tokens - b.tokens;
				});

			default:
				// Default sorting: prioritize smaller files to include more
				return sortedFiles.sort((a, b) => a.tokens - b.tokens);
		}
	}

	/**
	 * Get maximum number of files to include for each section
	 */
	private getMaxFilesForSection(sectionKey: string): number {
		// Different file limits based on section
		switch (sectionKey) {
			case "overview":
				return 5; // Overview needs fewer files
			case "architecture":
				return 10; // Architecture needs more detail
			case "setup":
				return 6;
			case "apis":
				return 8;
			case "components":
				return 10;
			case "configuration":
				return 5;
			case "development":
				return 6;
			case "troubleshooting":
				return 5;
			default:
				return 8;
		}
	}

	/**
	 * Build section-specific header
	 */
	private buildSectionHeader(sectionKey: string): string {
		// Base header for all sections
		let header = `# PROJECT DOCUMENTATION - ${sectionKey.toUpperCase()} SECTION\n\n`;
		header += `You are an expert programmer and technical documentation specialist. Your task is to create detailed documentation for the ${sectionKey} section of this project.\n\n`;

		// Important output formatting instructions to prevent model responses like "Sure!"
		header += `## IMPORTANT OUTPUT INSTRUCTIONS\n`;
		header += `- DO NOT include phrases like "Sure!", "Here is", "Below is" at the beginning\n`;
		header += `- DO NOT include markdown fences (\`\`\`markdown) at the beginning or end\n`;
		header += `- DO NOT apologize or add explanations about the documentation\n`;
		header += `- Output should start directly with the document content (like a title)\n`;
		header += `- Use proper Markdown formatting without additional wrappers\n\n`;

		// Section-specific instructions
		switch (sectionKey) {
			case "overview":
				header += `## TASK\n`;
				header += `Create a comprehensive overview of this project that explains its purpose, main features, and overall architecture.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- Start with a clear project title and introduction\n`;
				header += `- Explain the project's purpose and goals\n`;
				header += `- Describe the key features and capabilities\n`;
				header += `- Give a high-level overview of the architecture\n`;
				header += `- Include a technologies/stack overview\n`;
				break;

			case "architecture":
				header += `## TASK\n`;
				header += `Create detailed documentation of the project's architecture, including major components, data flow, and design patterns.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- Start with an architectural overview diagram (described in text)\n`;
				header += `- Detail each major component and its responsibility\n`;
				header += `- Explain how data flows through the system\n`;
				header += `- Describe key design patterns and architectural decisions\n`;
				header += `- Explain any scaling or performance considerations\n`;
				break;

			case "setup":
				header += `## TASK\n`;
				header += `Create a detailed setup and installation guide for this project.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- List all prerequisites and dependencies\n`;
				header += `- Provide step-by-step installation instructions\n`;
				header += `- Include configuration instructions\n`;
				header += `- Explain how to run the project locally\n`;
				header += `- Include troubleshooting tips for common setup issues\n`;
				break;

			case "apis":
				header += `## TASK\n`;
				header += `Document all APIs in this project, their endpoints, parameters, and responses.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- Organize APIs by logical groups\n`;
				header += `- For each API endpoint, document:\n`;
				header += `  - HTTP method and URL\n`;
				header += `  - Request parameters and body format\n`;
				header += `  - Response format with examples\n`;
				header += `  - Error codes and handling\n`;
				header += `- Include authentication requirements if applicable\n`;
				break;

			case "components":
				header += `## TASK\n`;
				header += `Document the main components of this project, their purpose, and how they interact.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- List major components with a brief description\n`;
				header += `- For each component, document:\n`;
				header += `  - Purpose and responsibility\n`;
				header += `  - Key methods/functions\n`;
				header += `  - Interactions with other components\n`;
				header += `  - Usage examples where appropriate\n`;
				break;

			case "configuration":
				header += `## TASK\n`;
				header += `Document all configuration options and settings for this project.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- List all configuration files and their purpose\n`;
				header += `- Document all environment variables\n`;
				header += `- Explain configuration options and their default values\n`;
				header += `- Provide examples for different environments (dev, prod, etc.)\n`;
				header += `- Include best practices for sensitive configuration\n`;
				break;

			case "development":
				header += `## TASK\n`;
				header += `Create a development guide for this project, including contribution guidelines, code standards, and workflow.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- Outline the development workflow\n`;
				header += `- Document coding standards and conventions\n`;
				header += `- Explain the testing approach\n`;
				header += `- Detail the CI/CD process if applicable\n`;
				header += `- Include guidelines for contributing\n`;
				break;

			case "troubleshooting":
				header += `## TASK\n`;
				header += `Create a troubleshooting guide for common issues in this project.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- List common issues by category\n`;
				header += `- For each issue, document:\n`;
				header += `  - Symptoms and error messages\n`;
				header += `  - Potential causes\n`;
				header += `  - Step-by-step solutions\n`;
				header += `- Include debugging techniques\n`;
				header += `- Add performance optimization tips if relevant\n`;
				break;

			default:
				header += `## TASK\n`;
				header += `Create comprehensive documentation for this section of the project.\n\n`;
				header += `## OUTPUT FORMAT\n`;
				header += `- Use clear, organized headings and subheadings\n`;
				header += `- Include relevant code examples when helpful\n`;
				header += `- Be concise but thorough in explanations\n`;
				header += `- Write for developers who need to understand or maintain this code\n`;
		}

		header += `\n## PROJECT INFORMATION\nProject Directory: ${process.cwd()}\n\n`;
		return header;
	}

	/**
	 * Build section-specific footer
	 */
	private buildSectionFooter(sectionKey: string): string {
		return (
			`\n## FINAL NOTES\n` +
			`1. Focus on clarity, accuracy, and completeness for the ${sectionKey} section\n` +
			`2. Use proper markdown formatting throughout\n` +
			`3. Ensure information is relevant and helpful to developers\n` +
			`4. Format your response as a complete markdown document for the ${sectionKey} section\n` +
			`5. Remember to NEVER include phrases like "Sure!", "Here is", etc. at the beginning\n` +
			`6. Output ONLY the content to be saved as a Markdown file\n`
		);
	}

	/**
	 * Rough estimate of token count
	 */
	private estimateTokens(text: string): number {
		// GPT models use ~4 chars per token on average
		return Math.ceil(text.length / 4);
	}

	/**
	 * Build context for initial generation
	 */
	async buildInitialContext(): Promise<string> {
		console.log(chalk.blue(`Building initial context with token budget of ${this.totalTokenBudget}...`));

		// Get all files from vector store
		const files = await this.vectorStore.getAllFiles();

		// Calculate tokens for each file
		const filesWithTokens = files.map((file) => ({
			...file,
			tokens: this.estimateTokens(file.content),
		}));

		// Sort files to prioritize important ones
		const sortedFiles = filesWithTokens.sort((a, b) => {
			const aPath = a.path;
			const bPath = b.path;

			// Prioritize key configuration files
			const configFiles = ["package.json", "tsconfig.json", "README.md", ".gitignore"];
			const aIsConfig = configFiles.some((name) => aPath.endsWith(name));
			const bIsConfig = configFiles.some((name) => bPath.endsWith(name));

			if (aIsConfig && !bIsConfig) return -1;
			if (!aIsConfig && bIsConfig) return 1;

			// Prioritize code files over others
			const codeExtensions = [".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".java"];
			const aIsCode = codeExtensions.some((ext) => aPath.endsWith(ext));
			const bIsCode = codeExtensions.some((ext) => bPath.endsWith(ext));

			if (aIsCode && !bIsCode) return -1;
			if (!aIsCode && bIsCode) return 1;

			// Prioritize smaller files to include more files
			return a.tokens - b.tokens;
		});

		// Build context with token budget
		let context = `# PROJECT DOCUMENTATION SYSTEM PROMPT\n\n`;
		context += `You are an expert programmer and technical documentation specialist. Your task is to create comprehensive documentation for this project.\n\n`;
		context += `## TASK\n`;
		context += `Create detailed, well-structured documentation that covers the project's purpose, architecture, components, and usage instructions.\n\n`;
		context += `## OUTPUT FORMAT\n`;
		context += `- Start with a clear project title and brief introduction\n`;
		context += `- Include a table of contents\n`;
		context += `- Organize information into logical sections with proper headings\n`;
		context += `- Use markdown formatting for readability\n`;
		context += `- Include code examples where appropriate\n`;
		context += `- End with setup/usage instructions\n\n`;
		context += `## PROJECT INFORMATION\nProject Directory: ${process.cwd()}\n\n`;

		let totalTokens = this.estimateTokens(context);
		const includedFiles: string[] = [];

		// First add key files that should always be included if possible
		const keyFiles = ["README.md", "package.json", "tsconfig.json"];
		for (const keyFileName of keyFiles) {
			const keyFile = sortedFiles.find((file) => file.path.endsWith(keyFileName));
			if (keyFile) {
				const contentTokens = keyFile.tokens;
				const headerTokens = this.estimateTokens(`\n### FILE: ${keyFile.path}\n\`\`\`\n`);
				const footerTokens = this.estimateTokens(`\n\`\`\`\n`);

				if (totalTokens + contentTokens + headerTokens + footerTokens <= this.totalTokenBudget) {
					context += `\n### FILE: ${keyFile.path}\n\`\`\`\n`;
					context += keyFile.content;
					context += `\n\`\`\`\n`;

					totalTokens += contentTokens + headerTokens + footerTokens;
					includedFiles.push(keyFile.path);

					// Remove from sorted files to avoid duplication
					sortedFiles.splice(sortedFiles.indexOf(keyFile), 1);
				}
			}
		}

		// Add source code files
		for (const file of sortedFiles) {
			// Skip if already included as a key file
			if (includedFiles.includes(file.path)) continue;

			// Check if adding this file would exceed our token budget
			const contentTokens = file.tokens;
			const headerTokens = this.estimateTokens(`\n### FILE: ${file.path}\n\`\`\`\n`);
			const footerTokens = this.estimateTokens(`\n\`\`\`\n`);

			if (totalTokens + contentTokens + headerTokens + footerTokens > this.totalTokenBudget) {
				// Skip if it would exceed the budget
				continue;
			}

			// Add the file to our context
			context += `\n### FILE: ${file.path}\n\`\`\`\n`;
			context += file.content;
			context += `\n\`\`\`\n`;

			// Update token count and track included files
			totalTokens += contentTokens + headerTokens + footerTokens;
			includedFiles.push(file.path);
		}

		// Add statistics about the project
		context += `\n## PROJECT STATISTICS\n`;
		context += await this.getProjectStats();

		// Add information about skipped files
		const skippedFiles = files.length - includedFiles.length;
		if (skippedFiles > 0) {
			context += `\n### Excluded Files\n${skippedFiles} files were not included due to token limitations.\n`;
		}

		// Add final instructions
		context += `\n## FINAL NOTES\n`;
		context += `1. Focus on clarity, organization, and technical accuracy\n`;
		context += `2. Target audience: developers who need to understand or contribute to the project\n`;
		context += `3. Structure documentation to be both comprehensive and easy to navigate\n`;

		console.log(chalk.green(`Built context with ${includedFiles.length} files, approximately ${totalTokens} tokens`));

		return context;
	}

	/**
	 * Build context for incremental updates
	 */
	async buildIncrementalContext(existingContent: string): Promise<string> {
		console.log(chalk.blue("Building incremental context for update..."));

		// Get project stats
		const stats = await this.getProjectStats();

		// Get the most relevant files for the current context (to provide better updates)
		const relevantFiles = await this.vectorStore.getSimilarFiles(existingContent, 5);

		// Build incremental context
		let context = `# PROJECT DOCUMENTATION UPDATE SYSTEM PROMPT\n\n`;
		context += `You are an expert programmer and technical documentation specialist. Your task is to update the existing documentation for this project.\n\n`;

		context += `## TASK\n`;
		context += `Review the existing documentation and update it with any new information. Maintain the original structure and format while enhancing or correcting content as needed.\n\n`;

		context += `## OUTPUT FORMAT\n`;
		context += `- Preserve the original document structure, including headings and organization\n`;
		context += `- Update technical details, code examples, and explanations to reflect current state\n`;
		context += `- Maintain consistent markdown formatting and style throughout\n`;
		context += `- Ensure the document remains comprehensive and accurate\n\n`;

		context += `## EXISTING DOCUMENTATION (EXCERPT)\n\n`;
		context += existingContent.substring(0, 1500) + "...\n\n";

		context += `## PROJECT STATISTICS\n`;
		context += stats + "\n\n";

		// Add relevant files for context
		context += `## RELEVANT FILES FOR CONTEXT\n`;
		for (const file of relevantFiles) {
			const relativePath = path.relative(process.cwd(), file.path);
			context += `\n### FILE: ${relativePath}\n\`\`\`\n`;

			// Truncate very large files
			const maxChars = 3000;
			if (file.content.length > maxChars) {
				context += file.content.substring(0, maxChars) + "...\n";
			} else {
				context += file.content;
			}

			context += `\n\`\`\`\n`;
		}

		// Add final instructions
		context += `\n## UPDATE GUIDELINES\n`;
		context += `1. Keep what works in the existing documentation\n`;
		context += `2. Update information that is outdated or incorrect\n`;
		context += `3. Add any missing details about new features or changes\n`;
		context += `4. Ensure the document flows logically and maintains technical accuracy\n`;
		context += `5. Output the complete updated documentation\n`;

		return context;
	}
}
