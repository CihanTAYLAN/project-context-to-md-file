# project-context-to-md-file

A service that watches your project and generates a comprehensive markdown file with project context using LLMs (Large Language Models).

## Features

- Analyzes your project files and structure
- Generates detailed documentation with LLMs
- Watches for file changes and automatically updates
- Configurable via `.env.context` file
- Supports multiple LLM providers:
  - Ollama (local models)
  - OpenAI (GPT models)
  - Groq (fast inference)
  - AWS Bedrock (enterprise models)

## Installation

```bash
# Install globally
npm install -g project-context-to-md-file

# Or using npx without installation
npx project-context-to-md-file
```

## Usage

```bash
# Basic usage (generates project-context.md in current directory)
project-context-to-md-file

# Specify output file
project-context-to-md-file --output docs/context.md

# Set custom update interval (in milliseconds)
project-context-to-md-file --interval 10000

# Use a specific LLM provider
project-context-to-md-file --provider openai

# Use a specific model
project-context-to-md-file --model gpt-4
```

## Configuration

The tool uses `.env.context` file for configuration. If not present, a sample will be created on first run.

### Configuration Options

```
# LLM Provider Configuration
# Choose between 'ollama', 'openai', 'groq', or 'bedrock'
PROVIDER=ollama

# Model Configuration
# For Ollama: llama3, codellama, phi3, etc.
# For OpenAI: gpt-4, gpt-4-turbo, gpt-3.5-turbo, etc.
# For Groq: llama3-8b-8192, mixtral-8x7b-32768, etc.
# For Bedrock: amazon.titan-text-express-v1, anthropic.claude-3-sonnet-20240229, etc.
MODEL=deepseek-coder

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
SYSTEM_PROMPT=You are an AI assistant that analyzes code repositories...
```

## How it works

This tool:

1. Analyzes your project structure and collects code files as context
2. Sends this context to the configured LLM with a specialized prompt
3. Generates a comprehensive markdown document describing your project
4. Watches for file changes
5. Updates the markdown file at a specified interval or when changes are detected

## Prerequisites

- Node.js 14.0.0 or higher
- If using Ollama: Ollama installed and running locally
- If using OpenAI/Groq/Bedrock: Valid API keys

## License

MIT
