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
 * Manager for collecting and building context for the LLM
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
		return await this.vectorStore.initialize();
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
	 * Get project statistics formatted as a string
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
	 * Build the context for a specific documentation section
	 */
	async buildSectionContext(sectionKey: string): Promise<string> {
		try {
			// Get all files from the vector store
			const allFiles = await this.vectorStore.getAllFiles();

			// Get initial context budget
			const tokenBudget = Math.floor(this.totalTokenBudget * 0.9); // Keep 10% reserve
			let usedTokens = 0;

			// Get project stats
			const stats = await this.getProjectStats();
			usedTokens += this.estimateTokens(stats);

			// Add section-specific header
			const header = this.buildSectionHeader(sectionKey);
			usedTokens += this.estimateTokens(header);

			// Add section-specific footer
			const footer = this.buildSectionFooter(sectionKey);
			usedTokens += this.estimateTokens(footer);

			// Prioritize files based on section type
			const prioritizedFiles = this.prioritizeFilesForSection(allFiles, sectionKey);

			// Calculate remaining token budget
			const remainingBudget = tokenBudget - usedTokens;

			// Build context with prioritized files
			let fileContents = "";
			let fileCount = 0;
			const maxFiles = this.getMaxFilesForSection(sectionKey);

			for (const file of prioritizedFiles) {
				if (fileCount >= maxFiles) break;

				const fileContent = `
FILE: ${file.path}
---
${file.content}
---

`;

				const fileTokens = this.estimateTokens(fileContent);

				if (usedTokens + fileTokens <= tokenBudget) {
					fileContents += fileContent;
					usedTokens += fileTokens;
					fileCount++;
				} else {
					break;
				}
			}

			// Assemble final context
			const context = `${header}

${stats}

${fileContents}

${footer}`;

			console.log(chalk.blue(`Built context for section '${sectionKey}' (${usedTokens} estimated tokens, ${fileCount} files included)`));

			return context;
		} catch (error) {
			console.error(chalk.red(`Error building section context for '${sectionKey}':`), error);
			return `Error building context: ${error}`;
		}
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
					if (a.path.includes("/src/index")) return -1;
					if (b.path.includes("/src/index")) return 1;
					return 0;
				});

			case "technology":
				return sortedFiles.sort((a, b) => {
					// Prioritize package files and main entry points
					if (a.path.endsWith("package.json")) return -1;
					if (b.path.endsWith("package.json")) return 1;
					if (a.path.endsWith("tsconfig.json")) return -1;
					if (b.path.endsWith("tsconfig.json")) return 1;
					if (a.path.includes("/src/")) return -1;
					if (b.path.includes("/src/")) return 1;
					return 0;
				});

			case "architecture":
				return sortedFiles.sort((a, b) => {
					// Prioritize main source files for architecture
					const isAMainFile = a.path.includes("/src/") && !a.path.includes("test");
					const isBMainFile = b.path.includes("/src/") && !b.path.includes("test");
					if (isAMainFile && !isBMainFile) return -1;
					if (!isAMainFile && isBMainFile) return 1;
					if (a.path.includes("index")) return -1;
					if (b.path.includes("index")) return 1;
					return 0;
				});

			case "dataModel":
				return sortedFiles.sort((a, b) => {
					// Prioritize data model related files
					if (a.path.includes("model") || a.path.includes("schema") || a.path.includes("entity")) return -1;
					if (b.path.includes("model") || b.path.includes("schema") || b.path.includes("entity")) return 1;
					if (a.path.includes("db") || a.path.includes("data")) return -1;
					if (b.path.includes("db") || b.path.includes("data")) return 1;
					if (a.path.includes("vectorstore")) return -1;
					if (b.path.includes("vectorstore")) return 1;
					return 0;
				});

			case "api":
				return sortedFiles.sort((a, b) => {
					// Prioritize API-related files
					if (a.path.includes("api") || a.path.includes("route")) return -1;
					if (b.path.includes("api") || b.path.includes("route")) return 1;
					if (a.path.includes("controller") || a.path.includes("handler")) return -1;
					if (b.path.includes("controller") || b.path.includes("handler")) return 1;
					if (a.path.includes("fetch") || a.path.includes("request")) return -1;
					if (b.path.includes("fetch") || b.path.includes("request")) return 1;
					return 0;
				});

			case "security":
				return sortedFiles.sort((a, b) => {
					// Prioritize security-related files
					if (a.path.includes("auth") || a.path.includes("security")) return -1;
					if (b.path.includes("auth") || b.path.includes("security")) return 1;
					if (a.path.includes("encrypt") || a.path.includes("crypt")) return -1;
					if (b.path.includes("encrypt") || b.path.includes("crypt")) return 1;
					if (a.path.includes("validate") || a.path.includes("sanitize")) return -1;
					if (b.path.includes("validate") || b.path.includes("sanitize")) return 1;
					return 0;
				});

			case "codeStandards":
				return sortedFiles.sort((a, b) => {
					// Prioritize structure and core files
					if (a.path.includes(".eslintrc") || a.path.includes("prettier")) return -1;
					if (b.path.includes(".eslintrc") || b.path.includes("prettier")) return 1;
					if (a.path.includes("tsconfig")) return -1;
					if (b.path.includes("tsconfig")) return 1;
					if (a.path.endsWith(".ts") || a.path.endsWith(".js")) return -1;
					if (b.path.endsWith(".ts") || b.path.endsWith(".js")) return 1;
					return 0;
				});

			case "deployment":
				return sortedFiles.sort((a, b) => {
					// Prioritize deployment-related files
					if (a.path.includes("Dockerfile") || a.path.includes("docker-compose")) return -1;
					if (b.path.includes("Dockerfile") || b.path.includes("docker-compose")) return 1;
					if (a.path.includes(".github/workflows") || a.path.includes("gitlab-ci")) return -1;
					if (b.path.includes(".github/workflows") || b.path.includes("gitlab-ci")) return 1;
					if (a.path.includes("deploy") || a.path.includes("build")) return -1;
					if (b.path.includes("deploy") || b.path.includes("build")) return 1;
					return 0;
				});

			case "userGuide":
				return sortedFiles.sort((a, b) => {
					// Prioritize documentation and example files
					if (a.path.endsWith("README.md")) return -1;
					if (b.path.endsWith("README.md")) return 1;
					if (a.path.includes("doc") || a.path.includes("example")) return -1;
					if (b.path.includes("doc") || b.path.includes("example")) return 1;
					if (a.path.includes("bin") || a.path.includes("cli")) return -1;
					if (b.path.includes("bin") || b.path.includes("cli")) return 1;
					if (a.path.includes("src/index")) return -1;
					if (b.path.includes("src/index")) return 1;
					return 0;
				});

			case "roadmap":
				return sortedFiles.sort((a, b) => {
					// Prioritize strategic and planning files
					if (a.path.endsWith("README.md")) return -1;
					if (b.path.endsWith("README.md")) return 1;
					if (a.path.includes("TODO") || a.path.includes("ROADMAP")) return -1;
					if (b.path.includes("TODO") || b.path.includes("ROADMAP")) return 1;
					if (a.path.includes("CHANGELOG") || a.path.includes("CONTRIBUTING")) return -1;
					if (b.path.includes("CHANGELOG") || b.path.includes("CONTRIBUTING")) return 1;
					return 0;
				});

			default:
				// Default sorting: prioritize smaller files to include more
				return sortedFiles.sort((a, b) => {
					const sizeA = a.content ? a.content.length : 0;
					const sizeB = b.content ? b.content.length : 0;
					return sizeA - sizeB;
				});
		}
	}

	/**
	 * Get maximum number of files to include for each section
	 */
	private getMaxFilesForSection(sectionKey: string): number {
		// Different file limits based on section
		switch (sectionKey) {
			case "overview":
				return 30; // Overview needs fewer files
			case "technology":
				return 40; // Technology stack requires various files
			case "architecture":
				return 50; // Architecture needs detailed files
			case "dataModel":
				return 30; // Data model uses fewer, more specific files
			case "api":
				return 50; // API design needs endpoint examples
			case "security":
				return 25; // Security aspects from key files
			case "codeStandards":
				return 40; // Code standards from multiple examples
			case "deployment":
				return 30; // Deployment from config and setup files
			case "userGuide":
				return 40; // User guide needs examples and code
			case "roadmap":
				return 20; // Roadmap can use fewer files
			default:
				return 30; // Default reasonable number
		}
	}

	/**
	 * Build section-specific header with instructions
	 */
	private buildSectionHeader(sectionKey: string): string {
		// Base header structure
		let header = `# ${sectionKey.toUpperCase()} SECTION DOCUMENTATION\n\n`;

		// Section specific instructions
		switch (sectionKey) {
			case "overview":
				header += `This section should provide a comprehensive overview of the project, including:
- Core purpose and vision: Why was it developed, what needs does it address?
- Main features and capabilities: Detailed and categorized
- Problems solved and value proposition for users
- Target audience and use cases
- General overview of architectural approach (visual or diagram)
- Summary of core technology stack
- Project development principles and approaches
- Typical usage flows with important code examples

When creating the documentation, emphasize the project's advantages and features objectively while maintaining technical accuracy.
Create a complete overview based on code and comment analysis.
`;
				break;

			case "technology":
				header += `This section should detail all technologies used in the project with these categories:
- Programming languages and versions
- Frontend technologies (frameworks, libraries, UI tools)
- Backend technologies (servers, frameworks, libraries)
- Data storage solutions (databases, ORM/ODM, data access layers)
- API technologies (REST, GraphQL, WebSocket, etc.)
- Authentication and security libraries
- Testing tools and frameworks
- Build and packaging tools
- Deployment and DevOps tools
- Project management tools and dependencies

For each technology:
- Explain its purpose in the project
- Version information
- Where and how it's used
- Important configuration details
- Reasons for selection over alternatives (if any)

Create an organized technology map using Markdown tables, lists, and code examples.
`;
				break;

			case "architecture":
				header += `This section should define the system architecture in detail with these headings:
- General architectural approach (monolithic, microservices, layered, etc.)
- System components and their responsibilities
- Component interaction and data flow (as ASCII diagram)
- Communication between subsystems and modules
- Layered architecture details (if any)
- Database schema and data flow diagram
- Implementation of architectural patterns and principles (SOLID, DRY, etc.)
- Interfaces, abstractions, and dependency management
- Scalability strategies and approaches
- Fault tolerance and resilience measures
- Performance optimization approaches
- Extensibility and flexibility features

Show how the architectural approach is implemented with appropriate code examples and diagrams.
Explain responsibilities of each component and how they interact with other components.
`;
				break;

			case "dataModel":
				header += `This section should document the project's data model with these details:
- Data model overview and enterprise data model approach
- Database technologies used and versions
- Main data entities and their attributes (in table format)
- Relationships between data entities (one-to-one, one-to-many, etc.)
- Schema diagram (ASCII or textual representation)
- Key and indexing strategies
- Data validation and integrity rules
- Data access layer and ORM usage
- Data migration and version management strategies
- Caching mechanisms and strategies
- Data security and access control approaches
- Example data access and transaction codes

Create tables showing field names, data types, descriptions, constraints, and relationships for each data entity.
Show data access patterns and typical query examples.
`;
				break;

			case "api":
				header += `This section should define the project's API design with these headings:
- API overview and purpose
- Command Line Interface (CLI) commands and parameters
  - Detailed description and usage examples for each command
  - Parameter details (type, default value, required/optional)
- Internal APIs (classes, functions, modules)
  - Description and parameters for each function/method
  - Return values and examples
- Error handling mechanisms
  - Error types and codes
  - Error responses and messages
- API usage examples
  - Step-by-step examples for basic scenarios
  - Advanced usage scenarios

DO NOT OUTPUT IN JSON FORMAT OR RAW CONFIG FILE OUTPUT.
Instead, document all APIs in Markdown format using organized headings and subheadings.
Use descriptive tables with example usage for CLI commands and internal APIs.
`;
				break;

			case "security":
				header += `This section should document the project's security features with these headings:
- Authentication and Authorization
  - API keys and credentials management
  - Session/token management (if any)
- Input validation and sanitization
  - User input validation
  - XSS, command injection prevention
- Sensitive data handling
  - API keys, credentials protection
  - Secure environment variables usage
- File system security
  - File access control
  - Secure file operations
- Security logging
  - Error and security event logging
  - Log information protection
- Security best practices
  - Security checks in code
  - Potential security vulnerabilities and measures

DO NOT OUTPUT IN JSON FORMAT OR RAW CONFIG FILE OUTPUT.
Instead, document security features and measures with clear and organized headings.
Show how each security measure is implemented with code examples and explanations.
`;
				break;

			case "codeStandards":
				header += `This section should document the code standards applied in the project with these headings:
- Coding style rules and formatting
- File and directory organization structure
- Naming conventions (variables, functions, classes, etc.)
- Code documentation and comment writing standards
- Architectural principles and design patterns:
  - SOLID principles implementation
  - DRY (Don't Repeat Yourself) principle approaches
  - KISS (Keep It Simple, Stupid) principle approaches
  - Dependency Injection usage
  - Other design patterns (Factory, Singleton, Observer, etc.)
- Error handling and logging standards
- Asynchronous code writing approaches
- Testing standards and methodologies:
  - Unit testing approaches
  - Integration testing strategies
  - E2E testing approaches
  - Test coverage goals
- Code review process and criteria
- Performance optimization techniques

Show how these standards are applied with concrete code examples and explanations.
Highlight best practices and areas requiring attention.
`;
				break;

			case "deployment":
				header += `This section should document the project's deployment and operations infrastructure with these headings:
- Development and deployment environments
  - System requirements
  - Supported platforms
- Installation and configuration
  - Step-by-step installation instructions
  - Required dependencies
- Packaging and publishing process
  - npm/yarn packaging steps
  - Package configuration
- Build and configuration
  - Build scripts and commands
  - Configuration files
- Version management
  - Versioning strategy
  - Update procedures
- Environment variables and configuration
  - Required environmental variables
  - Configuration options
- Monitoring and debugging
  - Logs and error tracking
  - Performance monitoring

DO NOT OUTPUT IN JSON FORMAT OR RAW CONFIG FILE OUTPUT.
Instead, document the deployment process with clear steps, code examples, and command line examples.
Focus especially on build, prepare, and other command scripts in package.json.
`;
				break;

			case "userGuide":
				header += `This section should create a comprehensive guide for project usage with these headings:
- Installation and running:
  - Prerequisites and system requirements
  - Step-by-step installation instructions for different operating systems
  - Dependencies installation
  - First run and configuration
- Basic usage:
  - Getting started steps and first use
  - Basic commands and options
  - Interface navigation (if any)
- Advanced usage:
  - Customization options
  - Advanced commands and parameters
  - Performance optimization
- Configuration:
  - Configuration files and formats
  - Environment variables
  - Options and their effects
- Common problems and solutions:
  - Known issues and workarounds
  - Troubleshooting steps
  - Help resources
- Examples and scenarios:
  - Real-world usage examples
  - Best practices
  - Workflow examples

Use command line examples, screenshots, code snippets, and step-by-step instructions to help users effectively use the project.
Help users avoid potential pitfalls with notes and tips.
`;
				break;

			case "roadmap":
				header += `This section should document the project's future vision and development plan with these headings:
- Short-term goals (3-6 months):
  - Priority features and improvements
  - Known bugs and solution plans
  - Small-scale improvements
- Medium-term goals (6-12 months):
  - Main feature developments
  - Architectural changes
  - Performance improvements
- Long-term vision (1+ year):
  - Strategic goals
  - Large-scale changes
  - New technology integrations
- Planned technical improvements:
  - Code refactoring and technical debt items
  - Architectural improvements
  - Increasing test coverage
  - Performance and scalability improvements
- Planned features and improvements (priority and scope for each)
- Research and development areas
- Community contribution opportunities
- Feedback and feature request process

Explain the thought process behind the roadmap by adding logical reasons and implementation plans for each item.
Create realistic expectations by indicating priority levels and estimated timeframes.
`;
				break;

			default:
				header += `Provide comprehensive documentation for this section based on the code context.
Organize information logically with clear headings and examples where appropriate.
`;
		}

		return header;
	}

	/**
	 * Build section-specific footer with formatting instructions
	 */
	private buildSectionFooter(sectionKey: string): string {
		return `
## FORMATTING INSTRUCTIONS

1. Apply Markdown formatting rules meticulously
2. Organize heading levels hierarchically and logically (\`#\`,\`##\`,\`###\`)
3. Use code blocks with appropriate syntax highlighting for code examples
4. Use tables for data presentation (especially in API and data model sections)
5. Use lists and sublists in an organized and consistent manner
6. Add ASCII diagrams or visual representations for visual explanations
7. Be consistent with terminology and technical terms
8. Use concise expressions while including necessary technical details
9. Start with an introductory paragraph appropriate to the section's purpose
10. Organize the section's main content comprehensively with subheadings
11. Add notes and tips to highlight important points
12. Indicate important warnings or limitations if any
13. Conclude with a brief summary or evaluation at the end of the section

Remember that this document will be used as a standalone Markdown file as part of a larger document set. Format it consistently and professionally.
`;
	}

	/**
	 * Rough estimate of token count
	 */
	private estimateTokens(text: string): number {
		// GPT models use ~4 chars per token on average
		return Math.ceil(text.length / 4);
	}
}
