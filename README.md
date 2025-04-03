# project-context-to-md-file

A service that watches your project and generates a markdown file with project context.

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
```

## Options

- `-o, --output <path>` - Output markdown file path (default: `project-context.md`)
- `-i, --interval <ms>` - Update interval in milliseconds (default: `5000`)
- `-v, --version` - Show version number
- `-h, --help` - Show help

## How it works

This tool:

1. Analyzes your project structure
2. Watches for file changes
3. Generates a markdown file with project context
4. Updates the markdown file at a specified interval

## License

MIT
